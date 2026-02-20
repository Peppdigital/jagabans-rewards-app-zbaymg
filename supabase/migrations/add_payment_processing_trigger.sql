-- Trigger to automatically process new payments
CREATE OR REPLACE FUNCTION trigger_process_payment()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert into payment_events queue for processing
  INSERT INTO payment_events (
    payment_id,
    user_id,
    event_type,
    status,
    payload
  ) VALUES (
    NEW.payment_id,
    NEW.user_id,
    'payment.succeeded',
    'pending',
    NEW.metadata
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop old trigger if exists
DROP TRIGGER IF EXISTS payment_process_trigger ON stripe_payments;

-- Create trigger on INSERT
CREATE TRIGGER payment_process_trigger
AFTER INSERT ON stripe_payments
FOR EACH ROW
WHEN (NEW.status = 'succeeded')
EXECUTE FUNCTION trigger_process_payment();

COMMENT ON TRIGGER payment_process_trigger ON stripe_payments IS 'Automatically queues successful payments for order creation and notifications';
