import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/**
 * 🔄 PAYMENT EVENT PROCESSOR
 * 
 * Processes pending payment events:
 * 1. Create order from payment
 * 2. Send admin notifications (email + SMS)
 * 3. Mark event as complete
 * 
 * Can be triggered by:
 * - Database trigger
 * - Cron job every 30 seconds
 * - Manual API call
 */

interface PaymentEvent {
  id: string;
  payment_id: string;
  user_id: string;
  status: string;
  payload: any;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();
  let processedCount = 0;
  const errors: string[] = [];

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    console.log('[Payment Processor] Starting...');

    // Get pending payment events
    const { data: pendingEvents, error: fetchError } = await supabase
      .from('payment_events')
      .select('*')
      .eq('status', 'pending')
      .limit(10)
      .order('created_at', { ascending: true });

    if (fetchError) {
      throw new Error(`Failed to fetch pending events: ${fetchError.message}`);
    }

    if (!pendingEvents || pendingEvents.length === 0) {
      console.log('[Payment Processor] No pending events');
      return new Response(
        JSON.stringify({ 
          processed: 0,
          message: 'No pending events',
          duration_ms: Date.now() - startTime,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[Payment Processor] Found ${pendingEvents.length} pending event(s)`);

    // Process each payment event
    for (const event of pendingEvents as PaymentEvent[]) {
      try {
        console.log(`[Payment Processor] Processing event ${event.id} (payment ${event.payment_id})`);

        // ============================================================================
        // Step 1: Create order
        // ============================================================================
        const { data: orderData, error: orderError } = await supabase
          .rpc('create_order_from_payment', {
            stripe_payment_intent_id: event.payment_id,
          });

        if (orderError) {
          throw new Error(`Order creation failed: ${orderError.message}`);
        }

        if (!orderData) {
          throw new Error('Order creation returned no data');
        }

        console.log(`[Payment Processor] ✓ Order created: ${orderData.id}`);

        // ============================================================================
        // Step 2: Send notifications (non-blocking, fire and forget)
        // ============================================================================
        const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const headers = {
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          'x-provider': 'payment-processor',
        };

        const notificationPayload = {
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
        };

        // Send email (don't await)
        fetch(`${SUPABASE_URL}/functions/v1/send-order-confirmation-email`, {
          method: 'POST',
          headers,
          body: JSON.stringify(notificationPayload),
        })
          .then(res => {
            if (!res.ok) {
              console.warn(`[Payment Processor] Email send returned ${res.status}`);
            } else {
              console.log(`[Payment Processor] ✓ Email sent for order ${orderData.id}`);
            }
          })
          .catch(err => console.error(`[Payment Processor] Email send error:`, err));

        // Send SMS (don't await)
        fetch(`${SUPABASE_URL}/functions/v1/send-order-confirmation-sms`, {
          method: 'POST',
          headers,
          body: JSON.stringify(notificationPayload),
        })
          .then(res => {
            if (!res.ok) {
              console.warn(`[Payment Processor] SMS send returned ${res.status}`);
            } else {
              console.log(`[Payment Processor] ✓ SMS sent for order ${orderData.id}`);
            }
          })
          .catch(err => console.error(`[Payment Processor] SMS send error:`, err));

        // ============================================================================
        // Step 3: Mark event as processed
        // ============================================================================
        const { error: updateError } = await supabase
          .from('payment_events')
          .update({
            status: 'processed',
            processed_at: new Date().toISOString(),
            result: { order_id: orderData.id },
          })
          .eq('id', event.id);

        if (updateError) {
          console.error(`[Payment Processor] Failed to mark event as processed:`, updateError);
        } else {
          console.log(`[Payment Processor] ✓ Event ${event.id} marked as processed`);
          processedCount++;
        }

      } catch (err: any) {
        console.error(`[Payment Processor] ❌ Error processing event ${event.id}:`, err.message);
        errors.push(`Event ${event.id}: ${err.message}`);

        // Mark as failed for manual review
        await supabase
          .from('payment_events')
          .update({
            status: 'failed',
            error: err.message,
            processed_at: new Date().toISOString(),
          })
          .eq('id', event.id)
          .catch(err => console.error('Failed to mark event as failed:', err));
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[Payment Processor] ✅ Completed: ${processedCount} processed, ${errors.length} errors`);

    return new Response(
      JSON.stringify({
        processed: processedCount,
        total: pendingEvents.length,
        errors: errors.length > 0 ? errors : undefined,
        duration_ms: duration,
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: errors.length === pendingEvents.length ? 500 : 200,
      }
    );

  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error('[Payment Processor] ❌ Fatal error:', error.message);

    return new Response(
      JSON.stringify({
        error: error.message,
        processed: processedCount,
        duration_ms: duration,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
