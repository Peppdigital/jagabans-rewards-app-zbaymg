-- ============================================================================
-- PAYMENT EVENT PROCESSOR TRIGGER
-- Invokes the edge function to process pending payment events
-- ============================================================================

-- Create app_config table if it doesn't exist (for storing function URLs, secrets)
CREATE TABLE IF NOT EXISTS public.app_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value TEXT,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_config_key ON public.app_config(key);

COMMENT ON TABLE public.app_config IS 'Application configuration stored in database for dynamic updates';
COMMENT ON COLUMN public.app_config.key IS 'Config key (e.g., functions_url, supabase_service_role_key)';
COMMENT ON COLUMN public.app_config.value IS 'Config value';

-- Create webhook_failures table if it doesn't exist (for error tracking)
CREATE TABLE IF NOT EXISTS public.webhook_failures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id TEXT,
  event_type TEXT,
  error_message TEXT,
  payload JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_failures_stripe_event_id ON public.webhook_failures(stripe_event_id);
CREATE INDEX IF NOT EXISTS idx_webhook_failures_created_at ON public.webhook_failures(created_at DESC);

COMMENT ON TABLE public.webhook_failures IS 'Log of webhook processing failures for debugging and retry';

-- ============================================================================
-- TRIGGER FUNCTION: Invoke payment processor
-- ============================================================================
CREATE OR REPLACE FUNCTION public.invoke_payment_processor()
RETURNS TRIGGER AS $$
DECLARE
  function_url TEXT;
  service_role_key TEXT;
  call_url TEXT;
  payload jsonb;
  http_result jsonb;
  err_msg TEXT;
BEGIN
  -- Only act on events that are 'pending'
  IF NEW.status IS NULL OR NEW.status <> 'pending' THEN
    RETURN NEW;
  END IF;

  -- Read config from app_config table
  SELECT value INTO function_url 
  FROM public.app_config 
  WHERE key = 'functions_url' 
  LIMIT 1;

  SELECT value INTO service_role_key 
  FROM public.app_config 
  WHERE key = 'supabase_service_role_key' 
  LIMIT 1;

  -- Validate config
  IF function_url IS NULL OR length(trim(function_url)) = 0 THEN
    RAISE WARNING 'invoke_payment_processor: app_config.functions_url not set - skipping event %', NEW.id;
    RETURN NEW;
  END IF;

  IF service_role_key IS NULL OR length(trim(service_role_key)) = 0 THEN
    RAISE WARNING 'invoke_payment_processor: app_config.supabase_service_role_key not set - skipping event %', NEW.id;
    RETURN NEW;
  END IF;

  -- Ensure no trailing slash on function_url, and target path
  call_url := rtrim(function_url, '/') || '/functions/v1/process-pending-payments';

  -- Build payload
  payload := jsonb_build_object(
    'event_id', NEW.id,
    'payment_id', NEW.payment_id,
    'event_type', NEW.event_type,
    'metadata', COALESCE(NEW.payload, jsonb_build_object())
  );

  BEGIN
    -- Perform HTTP POST using pg_net
    http_result := net.http_post(
      url := call_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_role_key
      ),
      body := payload
    );

    -- Mark processing started
    UPDATE public.payment_events
    SET processing_started_at = now(), updated_at = now()
    WHERE id = NEW.id;

    RAISE NOTICE 'invoke_payment_processor: queued event % for processing', NEW.id;

  EXCEPTION WHEN OTHERS THEN
    err_msg := SQLERRM;

    -- Insert failure log for debugging
    BEGIN
      INSERT INTO public.webhook_failures (stripe_event_id, event_type, error_message, payload, created_at)
      VALUES (
        NEW.payment_id,
        NEW.event_type,
        left(err_msg, 1000),
        payload,
        now()
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'invoke_payment_processor: failed logging webhook_failure for event %: %', NEW.id, SQLERRM;
    END;

    -- Increment retry count and schedule next retry (exponential backoff)
    BEGIN
      UPDATE public.payment_events
      SET retry_count = COALESCE(retry_count, 0) + 1,
          error = left(err_msg, 1000),
          failed_at = now(),
          next_retry_at = now() + (INTERVAL '1 minute' * POWER(2, COALESCE(retry_count, 0))),
          updated_at = now()
      WHERE id = NEW.id;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'invoke_payment_processor: failed updating retry metadata for event %: %', NEW.id, SQLERRM;
    END;

    RAISE WARNING 'invoke_payment_processor: http_post failed for event %: %', NEW.id, err_msg;
    -- Continue despite error (don't abort original transaction)
    RETURN NEW;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.invoke_payment_processor() IS 'Trigger function that invokes the payment processor edge function when a payment event is created';

-- ============================================================================
-- TRIGGER: Call function on new payment events
-- ============================================================================
DROP TRIGGER IF EXISTS trigger_invoke_payment_processor ON public.payment_events;

CREATE TRIGGER trigger_invoke_payment_processor
AFTER INSERT ON public.payment_events
FOR EACH ROW
EXECUTE FUNCTION public.invoke_payment_processor();

COMMENT ON TRIGGER trigger_invoke_payment_processor ON public.payment_events IS 'Automatically invoke payment processor when payment event is created';

-- ============================================================================
-- INITIALIZE APP CONFIG (if not already set)
-- ============================================================================
-- Note: Replace the placeholder values with your actual Supabase URL and service role key
INSERT INTO public.app_config (key, value, description)
VALUES 
  (
    'functions_url',
    'https://your-project.supabase.co',
    'Supabase project URL for invoking edge functions'
  ),
  (
    'supabase_service_role_key',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    'Supabase service role key for authenticated function calls'
  )
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- HELPER FUNCTION: Manually retry failed events
-- ============================================================================
CREATE OR REPLACE FUNCTION public.retry_failed_payment_events(
  max_retries INT DEFAULT 5,
  limit_count INT DEFAULT 10
)
RETURNS TABLE (
  event_id UUID,
  retry_count INT,
  error TEXT
) AS $$
BEGIN
  RETURN QUERY
  UPDATE public.payment_events
  SET 
    status = 'pending',
    retry_count = retry_count + 1,
    error = NULL,
    next_retry_at = NULL,
    updated_at = now()
  WHERE 
    status = 'failed'
    AND COALESCE(retry_count, 0) < max_retries
    AND (failed_at IS NULL OR failed_at < now() - INTERVAL '1 hour')
  LIMIT limit_count
  RETURNING id, retry_count, error;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.retry_failed_payment_events(INT, INT) IS 'Manually retry failed payment events (e.g., after fixing a bug or service outage)';

-- ============================================================================
-- GRANTS
-- ============================================================================
GRANT SELECT, INSERT, UPDATE ON public.app_config TO authenticated, service_role;
GRANT SELECT, INSERT ON public.webhook_failures TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.invoke_payment_processor() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.retry_failed_payment_events(INT, INT) TO authenticated, service_role;
