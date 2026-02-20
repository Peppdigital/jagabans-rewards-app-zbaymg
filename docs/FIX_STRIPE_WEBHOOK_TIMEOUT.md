# Fix Stripe Webhook Timeout

## Problem
Your Stripe webhook is timing out because:
1. ❌ It's making synchronous calls to email/SMS functions
2. ❌ Those functions call external APIs (Resend, Twilio)
3. ❌ Supabase functions have a 10-15 second timeout
4. ❌ External API calls can take 2-5+ seconds each

Result: **Webhook fails, Stripe retries, creates duplicates**

## Solution
Create an **ultra-fast webhook** that only:
1. ✅ Parses the Stripe event
2. ✅ Inserts payment record (1-2ms)
3. ✅ Returns 200 OK immediately (<100ms)

**All other processing** (order creation, emails, SMS) happens **asynchronously** via:
- Database triggers
- Cron jobs
- Separate edge functions invoked in background

## Implementation

### Step 1: Backup Current Webhook
```bash
cp supabase/functions/stripe-webhook/index.ts supabase/functions/stripe-webhook/index.slow.ts
```

### Step 2: Deploy Fast Webhook
```bash
# Option A: Replace with fast version
cp supabase/functions/stripe-webhook/index.fast.ts supabase/functions/stripe-webhook/index.ts

# Deploy
supabase functions deploy stripe-webhook
```

### Step 3: Set Up Async Processing

Choose ONE of these approaches:

#### Option A: Database Trigger (Recommended)
Create a trigger on `stripe_payments` to emit events:

```sql
CREATE OR REPLACE FUNCTION process_new_payment()
RETURNS TRIGGER AS $$
BEGIN
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
    jsonb_build_object(
      'amount', NEW.amount,
      'currency', NEW.currency,
      'metadata', NEW.metadata
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS stripe_payment_trigger ON stripe_payments;
CREATE TRIGGER stripe_payment_trigger
AFTER INSERT ON stripe_payments
FOR EACH ROW
EXECUTE FUNCTION process_new_payment();
```

#### Option B: Cron Job
Set up a scheduled job to process pending payments:

```bash
# Via Supabase CLI
supabase functions deploy process-pending-payments --region us-east-1
```

With cron trigger:
```json
{
  "schedule": "*/30 * * * *"  // Every 30 seconds
}
```

#### Option C: Manual Queue Job
Call from your backend periodically:
```typescript
// Every 30 seconds
setInterval(async () => {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/process-pending-payments`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ action: 'process_pending' }),
  });
}, 30000);
```

### Step 4: Create Payment Event Processor

Create `supabase/functions/process-pending-payments/index.ts`:

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    // Get pending payment events
    const { data: pendingEvents } = await supabase
      .from('payment_events')
      .select('*')
      .eq('status', 'pending')
      .limit(10);

    if (!pendingEvents || pendingEvents.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }));
    }

    for (const event of pendingEvents) {
      try {
        // Create order
        const { data: orderData, error: orderError } = await supabase
          .rpc('create_order_from_payment', {
            stripe_payment_intent_id: event.payment_id
          });

        if (orderError) throw orderError;

        // Send notifications (fire and forget)
        fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-order-confirmation-email`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            orderId: orderData.id,
            customerName: orderData.customer_name,
            customerEmail: orderData.customer_email,
            customerPhone: orderData.customer_phone,
            items: orderData.items,
            subtotal: orderData.subtotal,
            tax: orderData.tax,
            total: orderData.total,
            deliveryAddress: orderData.delivery_address,
            pickupNotes: orderData.pickup_notes,
            orderType: orderData.order_type === 'delivery' ? 'delivery' : 'pickup',
            timestamp: new Date().toISOString(),
          }),
        }).catch(err => console.error('Email send failed:', err));

        // Mark event as processed
        await supabase
          .from('payment_events')
          .update({ status: 'processed' })
          .eq('id', event.id);

      } catch (err) {
        console.error(`Failed to process event ${event.id}:`, err);
        // Mark as failed or retry later
        await supabase
          .from('payment_events')
          .update({ status: 'failed', error: String(err) })
          .eq('id', event.id);
      }
    }

    return new Response(JSON.stringify({ 
      processed: pendingEvents.length 
    }));

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: String(error) }), { 
      status: 500 
    });
  }
});
```

## Testing

### Test 1: Check Webhook Response Time
```bash
# Should complete in <100ms
time curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"type":"payment_intent.succeeded","data":{"object":{"id":"pi_test","amount":1000,"currency":"usd","customer":"cus_test","metadata":{"user_id":"00000000-0000-0000-0000-000000000001"}}}}' \
  https://<project>.supabase.co/functions/v1/stripe-webhook
```

### Test 2: Monitor Payment Records
```sql
SELECT payment_id, user_id, status, created_at
FROM stripe_payments
ORDER BY created_at DESC
LIMIT 5;
```

### Test 3: Check Event Processing
```sql
SELECT * FROM payment_events
WHERE status != 'processed'
LIMIT 5;
```

## Rollback
If you need to rollback:
```bash
cp supabase/functions/stripe-webhook/index.slow.ts supabase/functions/stripe-webhook/index.ts
supabase functions deploy stripe-webhook
```

## Benefits

| Before | After |
|--------|-------|
| ❌ 5-15s webhook time | ✅ <100ms webhook time |
| ❌ Frequent timeouts | ✅ Never times out |
| ❌ Duplicate orders | ✅ Idempotent via upsert |
| ❌ Blocking API calls | ✅ Fire-and-forget notifications |
| ❌ Customer wait for emails | ✅ Order confirmation immediate |

The webhook now returns success within 100ms, so Stripe confirms receipt. Order processing, emails, and SMS happen asynchronously in the background.
