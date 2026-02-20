# How to Implement Confirmation Messages

## Overview
The payment flow now works in two stages:
1. **Webhook (fast)** - Stripe webhook receives payment, stores it, returns 200 OK immediately
2. **Async Processor (reliable)** - Processes the payment, creates order, sends notifications

## Implementation Steps

### Step 1: Deploy the Processor Edge Function
```bash
supabase functions deploy process-pending-payments
```

### Step 2: Choose How to Trigger It

#### **Option A: Database Trigger (Automatic)**
Run the migration to create an auto-trigger:

```bash
# In Supabase Dashboard SQL Editor, run:
# (contents of supabase/migrations/add_payment_processing_trigger.sql)

-- OR via CLI:
supabase migration up
```

**Pros:**
- Automatic - processes immediately when payment is inserted
- Simplest to set up
- No additional overhead

**Cons:**
- Payments processed sequentially (slower for high volume)

#### **Option B: Cron Job (Periodic)**
Set up a scheduled job in Supabase:

```bash
# Run the cron job setup
# Via Supabase Dashboard → Database → Extensions
# Enable pg_cron extension, then run:

SELECT cron.schedule(
  'process-pending-payments',
  '*/30 * * * * *',  -- Every 30 seconds
  'SELECT net.http_post(
    url := current_setting(''app.supabase_url'') || ''/functions/v1/process-pending-payments'',
    headers := jsonb_build_object(
      ''Authorization'', ''Bearer '' || current_setting(''app.supabase_service_role_key''),
      ''Content-Type'', ''application/json''
    ),
    body := ''{"action":"process"}''::jsonb
  ) as request_id;'
);
```

**Pros:**
- Can process multiple payments in batch
- Good for medium volume

**Cons:**
- 30 second delay between processing attempts
- Requires pg_cron extension

#### **Option C: Manual/Polling from App**
Call from your backend periodically:

```typescript
// In your backend server (Node.js, etc)
setInterval(async () => {
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/process-pending-payments`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
    });
    console.log('Payment processor response:', response.status);
  } catch (error) {
    console.error('Payment processor error:', error);
  }
}, 30000); // Every 30 seconds
```

**Pros:**
- Full control
- Works with any backend

**Cons:**
- Requires your backend to be running
- Most complex to set up

---

## Message Flow

### Successful Order:
```
Stripe Payment
    ↓
Webhook (fast) → Insert stripe_payments → Return 200 OK (< 100ms)
    ↓
[Trigger/Cron/Poll]
    ↓
Payment Processor:
  1. Create order (RPC call)
  2. Send email (non-blocking)
  3. Send SMS (non-blocking)
  4. Mark as processed
    ↓
Customer receives:
  - Order confirmation page (immediate)
  - Email notification (< 5 seconds)
  - SMS notification (< 5 seconds)
```

### Error Handling:
- If order creation fails → payment_events.status = 'failed'
- If email/SMS fails → still processes (logged separately)
- Failed events can be retried manually via SQL:

```sql
-- Retry failed payments
UPDATE payment_events 
SET status = 'pending'
WHERE status = 'failed'
  AND created_at > NOW() - INTERVAL '1 hour';
```

---

## Testing

### Test 1: Check Payment Inserted
```sql
SELECT * FROM stripe_payments 
ORDER BY created_at DESC LIMIT 1;
```

### Test 2: Check Payment Event Created (if using trigger)
```sql
SELECT * FROM payment_events 
WHERE status = 'pending'
LIMIT 5;
```

### Test 3: Manually Trigger Processor
```bash
curl -X POST \
  -H "Authorization: Bearer $(supabase secrets list | grep SUPABASE_SERVICE_ROLE_KEY)" \
  -H "Content-Type: application/json" \
  https://<project>.supabase.co/functions/v1/process-pending-payments
```

### Test 4: Check Order Created
```sql
SELECT * FROM orders 
WHERE payment_id = 'pi_xxxx'
LIMIT 1;
```

### Test 5: Check Notifications Sent
```sql
-- Email notifications
SELECT * FROM email_notifications 
WHERE order_id = '...'
ORDER BY sent_at DESC;

-- SMS notifications
SELECT * FROM sms_notifications 
WHERE order_id = '...'
ORDER BY sent_at DESC;
```

---

## Recommended Setup

For best reliability:
1. Use **Database Trigger** for automatic processing
2. Also run **Cron Job** as backup (every 5 minutes)

```sql
-- Trigger for immediate processing
CREATE TRIGGER payment_process_trigger
AFTER INSERT ON stripe_payments
FOR EACH ROW
WHEN (NEW.status = 'succeeded')
EXECUTE FUNCTION trigger_process_payment();

-- Cron job for retry/catch-up
SELECT cron.schedule(
  'process-pending-payments-backup',
  '*/5 * * * *',  -- Every 5 minutes
  'SELECT net.http_post(...)'
);
```

This way:
- Payments process within milliseconds of insertion (trigger)
- Any missed payments are caught within 5 minutes (cron)
- No single point of failure

---

## Monitoring

### Check Processing Health
```sql
SELECT 
  status,
  COUNT(*) as count,
  MAX(created_at) as last_event,
  MAX(processed_at) as last_processed
FROM payment_events
GROUP BY status
ORDER BY status;
```

### Check for Stuck Payments
```sql
SELECT * FROM payment_events
WHERE status = 'pending'
  AND created_at < NOW() - INTERVAL '5 minutes'
LIMIT 10;

-- If any exist, retry them:
UPDATE payment_events 
SET status = 'pending'
WHERE id IN (...)
  AND retry_count < 3;
```

### Check Notification Success Rate
```sql
SELECT 
  'email' as type,
  COUNT(*) as total,
  COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent,
  ROUND(100.0 * COUNT(CASE WHEN status = 'sent' THEN 1 END) / COUNT(*), 2) as success_rate
FROM email_notifications
WHERE sent_at > NOW() - INTERVAL '24 hours'
UNION ALL
SELECT 
  'sms' as type,
  COUNT(*) as total,
  COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent,
  ROUND(100.0 * COUNT(CASE WHEN status = 'sent' THEN 1 END) / COUNT(*), 2) as success_rate
FROM sms_notifications
WHERE sent_at > NOW() - INTERVAL '24 hours';
```

---

## Troubleshooting

### Notifications not sending?
1. Check `email_notifications` and `sms_notifications` tables for errors
2. Verify `RESEND_API_KEY`, `TWILIO_*` environment variables are set
3. Check function logs: `supabase functions logs process-pending-payments --tail`

### Orders not creating?
1. Check `payment_events` status = 'failed'
2. Check `orders` table for existing orders
3. Verify `payment_id` in stripe_payments matches what RPC expects

### Processing too slow?
- Increase cron frequency: `*/5 * * * * *` for every 5 seconds
- Add more concurrent processing (only if Supabase plan supports it)

### Too many function calls?
- Increase cron interval: `*/60 * * * * *` for every 60 seconds
- Process more events per call by increasing LIMIT in processor
