import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/**
 * ⚡ STRIPE WEBHOOK - INGEST ONLY (REFACTORED)
 * 
 * Responsibilities:
 * 1. Validate Stripe event
 * 2. Resolve user_id
 * 3. Persist payment record
 * 4. Emit internal event to payment_events table
 * 
 * Everything else (order creation, emails, delivery) happens ASYNC via database triggers.
 */
Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }), 
      { status: 405, headers: corsHeaders }
    );
  }

  const startTime = Date.now();

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // --- 1️⃣ PARSE & VALIDATE EVENT ---
    const webhookPayload = await req.json();
    const eventType = webhookPayload.type;
    
    console.log(`[Stripe Webhook] Event: ${eventType}`);

    // Only process payment success events
    if (eventType !== 'payment_intent.succeeded') {
      console.log(`[Stripe Webhook] Ignoring event type: ${eventType}`);
      return new Response(
        JSON.stringify({ received: true }), 
        { headers: corsHeaders }
      );
    }

    const paymentIntent = webhookPayload.data.object;
    const paymentId = paymentIntent.id;
    const customerId = paymentIntent.customer;

    // --- 2️⃣ RESOLVE USER_ID ---
    let userId = paymentIntent.metadata?.user_id;

    // Fallback: lookup via Stripe customer_id
    if (!userId && customerId) {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('user_id')
        .eq('stripe_customer_id', customerId)
        .single();
      
      userId = profile?.user_id;
    }

    if (!userId) {
      console.error(`[Stripe Webhook] ❌ No user_id found for payment ${paymentId}`);
      throw new Error('Could not resolve user_id for payment');
    }

    // --- 3️⃣ PERSIST PAYMENT RECORD ---
    const { error: paymentError } = await supabase
      .from('stripe_payments')
      .upsert({
        payment_id: paymentId,
        user_id: userId,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        status: 'succeeded',
        payment_method: paymentIntent.payment_method,
        metadata: {
          ...paymentIntent.metadata,
          user_id: userId,
        },
      }, {
        onConflict: 'payment_id'
      });

    if (paymentError) {
      console.error(`[Stripe Webhook] ❌ Failed to persist payment:`, paymentError);
      throw new Error('Failed to persist payment record');
    }

    // --- 4️⃣ EMIT INTERNAL EVENT ---
    const { error: eventError } = await supabase
      .from('payment_events')
      .insert({
        payment_id: paymentId,
        user_id: userId,
        event_type: 'payment.succeeded',
        payload: {
          amount: paymentIntent.amount,
          currency: paymentIntent.currency,
          customer_id: customerId,
          metadata: paymentIntent.metadata,
        },
        status: 'pending',
      });

    if (eventError) {
      console.error(`[Stripe Webhook] ⚠️ Failed to emit event:`, eventError);
      // Don't fail the webhook - payment is already recorded
    }

    const duration = Date.now() - startTime;
    console.log(`[Stripe Webhook] ✅ Processed in ${duration}ms`);

    return new Response(
      JSON.stringify({ 
        received: true,
        payment_id: paymentId,
        duration_ms: duration,
      }), 
      { headers: corsHeaders }
    );

  } catch (err: any) {
    const duration = Date.now() - startTime;
    console.error(`[Stripe Webhook] ❌ Error after ${duration}ms:`, err.message);
    
    return new Response(
      JSON.stringify({ 
        error: err.message,
        duration_ms: duration,
      }), 
      { status: 500, headers: corsHeaders }
    );
  }
});
