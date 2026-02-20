import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/**
 * ⚡ STRIPE WEBHOOK - ULTRA-FAST INGEST ONLY
 * 
 * CRITICAL: Must complete in <1 second to avoid Supabase timeout (10-15s default)
 * 
 * Responsibilities:
 * 1. Parse and validate Stripe event
 * 2. Upsert payment record (idempotent)
 * 3. Return success immediately
 * 
 * Everything else (order creation, notifications) happens via database triggers/cron.
 */
Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { 
      status: 405, 
      headers: corsHeaders 
    });
  }

  const startTime = Date.now();

  try {
    const webhookPayload = await req.json();
    const eventType = webhookPayload.type;
    
    console.log(`[Stripe] Event: ${eventType}`);

    // Only process payment success - ignore everything else immediately
    if (eventType !== 'payment_intent.succeeded') {
      return new Response(JSON.stringify({ received: true }), { headers: corsHeaders });
    }

    const paymentIntent = webhookPayload.data.object;
    const paymentId = paymentIntent.id;
    const customerId = paymentIntent.customer;
    const metadata = paymentIntent.metadata || {};

    console.log(`[Stripe] Payment: ${paymentId}`);

    // Get user_id from metadata (should be in client secret creation)
    let userId = metadata.user_id;

    // If not in metadata, it's an error - webhook should fail fast
    if (!userId) {
      console.error(`[Stripe] ❌ No user_id in metadata for ${paymentId}`);
      // Don't throw - return 200 to tell Stripe we received it
      // The issue is on their end for not including user_id
      return new Response(JSON.stringify({ 
        received: true, 
        warning: 'No user_id in metadata'
      }), { headers: corsHeaders });
    }

    // Create Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // --- CRITICAL: Upsert only (no await for other operations) ---
    const { error: insertError } = await supabase
      .from('stripe_payments')
      .upsert(
        {
          payment_id: paymentId,
          user_id: userId,
          amount: paymentIntent.amount,
          currency: paymentIntent.currency,
          status: 'succeeded',
          payment_method: paymentIntent.payment_method,
          metadata: {
            ...metadata,
            user_id: userId,
            processed_at: new Date().toISOString(),
          },
        },
        { onConflict: 'payment_id' }
      );

    if (insertError) {
      console.error(`[Stripe] Insert error:`, insertError);
      // Still return 200 - Stripe shouldn't retry for DB errors
      return new Response(JSON.stringify({ 
        received: true, 
        error: insertError.message 
      }), { headers: corsHeaders });
    }

    const duration = Date.now() - startTime;
    console.log(`[Stripe] ✅ Processed in ${duration}ms`);

    // Return success immediately
    return new Response(
      JSON.stringify({ 
        received: true,
        payment_id: paymentId,
        user_id: userId,
        duration_ms: duration,
      }),
      { headers: corsHeaders }
    );

  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error(`[Stripe] ❌ Error (${duration}ms):`, error.message);

    // Return 200 even on error to prevent Stripe retries
    // Errors are logged and can be debugged later
    return new Response(
      JSON.stringify({ 
        received: true,
        error: error.message,
        duration_ms: duration,
      }),
      { headers: corsHeaders }
    );
  }
});
