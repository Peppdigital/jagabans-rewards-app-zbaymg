# Payment Event Processor Trigger Setup

## Overview
This migration sets up a database trigger that automatically invokes the payment processor edge function whenever a payment event is created.

**Key Features:**
- ✅ Automatic HTTP invocation of edge function
- ✅ Configurable via `app_config` table (no need to redeploy)
- ✅ Retry logic with exponential backoff (1m, 2m, 4m, 8m, 16m...)
- ✅ Failure tracking in `webhook_failures` table
- ✅ Manual retry function for failed events

## Setup Steps

### Step 1: Apply Migration
```bash
supabase migration up
# OR via Dashboard: SQL Editor → run add_payment_event_processor_trigger.sql
```

This creates:
- `app_config` table (for configuration)
- `webhook_failures` table (for error tracking)
- `invoke_payment_processor()` trigger function
- `retry_failed_payment_events()` helper function
- Trigger on `payment_events` table

### Step 2: Configure Function URL and Secret Key

Via **Supabase Dashboard SQL Editor**, run:

```sql
-- Update with your actual values
UPDATE public.app_config
SET value = 'https://your-project.supabase.co'
WHERE key = 'functions_url';

UPDATE public.app_config
SET value = 'your-service-role-key-here'
WHERE key = 'supabase_service_role_key';

-- Verify
SELECT key, value FROM public.app_config;
```

**Where to find these values:**
1. **functions_url**: Your Supabase project URL
   - Dashboard → Settings → API → Project URL
   - Example: `https://abcdef123456.supabase.co`

2. **supabase_service_role_key**: Your service role key
   - Dashboard → Settings → API → Service Role Secret
   - ⚠️ Keep this private!

### Step 3: Deploy the Payment Processor Function

```bash
supabase functions deploy process-pending-payments
```

## How It Works

### Flow:
```
1. Payment succeeds (stripe_payments record inserted)
   ↓
2. Stripe webhook creates payment_events record with status='pending'
   ↓
3. Database trigger fires automatically
   ↓
4. Trigger calls edge function via HTTP POST
   ↓
5. Edge function:
   - Creates order
   - Sends notifications
   - Updates payment_events status
```

### Request Format (from trigger to edge function):
```json
{
  "event_id": "uuid",
  "payment_id": "pi_xxx",
  "event_type": "payment.succeeded",
  "metadata": {
    "user_id": "uuid",
    "order_type": "delivery",
    "items": [...],
    ...
  }
}
```

## Error Handling

### Automatic Retry
If the HTTP call fails, the trigger:
1. Logs error to `webhook_failures` table
2. Increments `retry_count` on payment_events
3. Schedules next retry: `now() + (1 min * 2^retry_count)`
   - Retry 1: 1 minute
   - Retry 2: 2 minutes
   - Retry 3: 4 minutes
   - Retry 4: 8 minutes
   - Retry 5: 16 minutes

### Check Failed Events
```sql
SELECT id, payment_id, retry_count, error, next_retry_at
FROM public.payment_events
WHERE status = 'failed'
ORDER BY next_retry_at DESC
LIMIT 10;
```

### Check Failure Log
```sql
SELECT stripe_event_id, event_type, error_message, created_at
FROM public.webhook_failures
WHERE created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC
LIMIT 20;
```

## Manual Operations

### Retry Failed Events
```sql
-- Retry all failed events (max 5 attempts total)
SELECT * FROM public.retry_failed_payment_events(
  max_retries := 5,
  limit_count := 10
);
```

### Clear Old Failures
```sql
-- Clean up old failure logs (older than 7 days)
DELETE FROM public.webhook_failures
WHERE created_at < NOW() - INTERVAL '7 days';
```

### Check Trigger Status
```sql
-- Verify trigger exists and is active
SELECT tgname, tgenabled
FROM pg_trigger
WHERE tgrelid = 'public.payment_events'::regclass;

-- Should show: trigger_invoke_payment_processor | enabled
```

## Testing

### Test 1: Verify Configuration
```sql
SELECT key, value FROM public.app_config;
```
✓ Both `functions_url` and `supabase_service_role_key` should have values

### Test 2: Create a Test Payment Event
```sql
INSERT INTO public.payment_events (payment_id, user_id, event_type, status, payload)
VALUES (
  'pi_test_' || gen_random_uuid()::text,
  '00000000-0000-0000-0000-000000000001',
  'payment.succeeded',
  'pending',
  jsonb_build_object(
    'user_id', '00000000-0000-0000-0000-000000000001',
    'order_type', 'pickup'
  )
)
RETURNING id, payment_id, status;
```

### Test 3: Check if Processor Was Invoked
Wait 5 seconds, then check:

```sql
-- Should show processing_started_at is set
SELECT id, payment_id, status, processing_started_at, error
FROM public.payment_events
WHERE payment_id LIKE 'pi_test_%'
ORDER BY created_at DESC
LIMIT 1;
```

If `error` is set, check:
```sql
-- View the error
SELECT stripe_event_id, error_message, payload
FROM public.webhook_failures
WHERE stripe_event_id LIKE 'pi_test_%'
ORDER BY created_at DESC
LIMIT 1;
```

## Troubleshooting

### No `processing_started_at` set?
1. Check function_url is correct (no trailing slash)
2. Verify service_role_key is valid
3. Check edge function is deployed: `supabase functions list`
4. Check logs: `supabase functions logs process-pending-payments --tail`

### Errors in webhook_failures?
1. Check function URL format: should be `https://xxxxx.supabase.co`
2. Check `process-pending-payments` function exists and is accessible
3. Verify `payment_events` table has correct schema
4. Check Supabase logs for function errors

### Too many retries?
1. Increase `next_retry_at` interval in trigger function
2. Reduce automatically by clearing old failures
3. Check edge function logs for actual issue

### pg_net not available?
Make sure `pg_net` extension is enabled:
```sql
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA public;
```

## Monitoring Query

```sql
SELECT 
  'total' as metric,
  COUNT(*) as value
FROM payment_events
UNION ALL
SELECT 
  'pending',
  COUNT(*) 
FROM payment_events WHERE status = 'pending'
UNION ALL
SELECT 
  'processing',
  COUNT(*) 
FROM payment_events WHERE status = 'processing'
UNION ALL
SELECT 
  'processed',
  COUNT(*) 
FROM payment_events WHERE status = 'processed'
UNION ALL
SELECT 
  'failed',
  COUNT(*) 
FROM payment_events WHERE status = 'failed'
UNION ALL
SELECT 
  'recent_errors_24h',
  COUNT(*) 
FROM webhook_failures WHERE created_at > NOW() - INTERVAL '24 hours';
```
