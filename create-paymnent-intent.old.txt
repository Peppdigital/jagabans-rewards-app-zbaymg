// import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'npm:stripe';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const TAX_RATE = 0.0975; // 9.75% — must match client

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

/**
 * Financial fields inside pendingOrder that this function must
 * verify server-side before creating a PaymentIntent.
 *
 * All monetary values are in CENTS (integers).
 */
interface PendingOrderFinancials {
  subtotal: number;          // item subtotal pre-discount, cents
  taxAmount: number;         // tax on discounted subtotal, cents
  discountAmount: number;    // cents (0 when no promo active)
  deliveryFeeCents: number;  // cents (0 for pickup)
  orderType: 'delivery' | 'pickup';
}

// ─────────────────────────────────────────────────────────────
// Helper
// ─────────────────────────────────────────────────────────────

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ─────────────────────────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // ── Stripe setup ──────────────────────────────────────────────────────

    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeSecretKey) {
      console.error('❌ STRIPE_SECRET_KEY not configured');
      return json({ success: false, error: 'Payment service not configured' }, 500);
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2025-12-15.clover',
      httpClient: Stripe.createFetchHttpClient(),
    });

    // ── Supabase setup ────────────────────────────────────────────────────

    const supabaseUrl         = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase            = createClient(supabaseUrl, supabaseServiceKey);

    // ── Auth ──────────────────────────────────────────────────────────────

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ success: false, error: 'No authorization header' }, 401);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      console.error('❌ Unauthorized:', userError);
      return json({ success: false, error: 'Unauthorized' }, 401);
    }

    console.log('✓ Authenticated user:', user.id);

    // ── Parse body ────────────────────────────────────────────────────────

    const {
      amount,           // client-declared total, cents — used only for mismatch detection
      currency = 'usd',
      customerId,
      setupFutureUsage,
      pendingOrder,     // full order snapshot from the app
    } = await req.json();

    if (!pendingOrder) {
      return json({ success: false, error: 'Missing required field: pendingOrder' }, 400);
    }

    // ── Extract financial fields from pendingOrder ─────────────────────────
    //
    // The app must embed these inside pendingOrder. We never trust the
    // top-level `amount` as authoritative — we recompute it here.

    const {
      subtotal:         clientSubtotalCents,
      taxAmount:        clientTaxCents,
      discountAmount:   clientDiscountCents = 0,
      deliveryFeeCents: clientDeliveryFeeCents = 0,
      orderType = 'delivery',
    } = pendingOrder as PendingOrderFinancials;

    // Basic type guards
    if (!Number.isInteger(clientSubtotalCents) || clientSubtotalCents <= 0)
      return json({ success: false, error: 'Invalid subtotal in pendingOrder (must be positive integer cents)' }, 400);
    if (!Number.isInteger(clientTaxCents) || clientTaxCents < 0)
      return json({ success: false, error: 'Invalid taxAmount in pendingOrder (must be non-negative integer cents)' }, 400);

    // ── Server-side discount verification ─────────────────────────────────
    //
    // Mirrors the Square function exactly: fetch canonical settings,
    // recompute, reject client mismatches beyond ±1¢ rounding.

    const { data: configRows, error: configErr } = await supabase
      .from('app_config')
      .select('key, value')
      .in('key', ['discount_enabled', 'discount_percentage']);

    if (configErr) {
      console.error('app_config fetch failed:', configErr.message);
      return json({ success: false, error: 'Could not load discount settings' }, 500);
    }

    const configMap = Object.fromEntries(
      (configRows ?? []).map((r: { key: string; value: unknown }) => [r.key, r.value])
    );

    const serverDiscountEnabled    = configMap['discount_enabled'] === true
                                  || configMap['discount_enabled'] === 'true';
    const serverDiscountPercentage = Number(configMap['discount_percentage']) || 10;

    const effectiveDiscountCents = serverDiscountEnabled
      ? Math.round((clientSubtotalCents * serverDiscountPercentage) / 100)
      : 0;

    if (Math.abs(clientDiscountCents - effectiveDiscountCents) > 1) {
      console.error(
        `Discount mismatch: client=${clientDiscountCents}¢ server=${effectiveDiscountCents}¢ ` +
        `(enabled=${serverDiscountEnabled} pct=${serverDiscountPercentage})`
      );
      return json({
        success: false,
        error: 'Discount mismatch. Please refresh and try again.',
      }, 400);
    }

    // ── Pickup delivery fee guard ─────────────────────────────────────────
    //
    // Pickup orders must never carry a delivery fee regardless of what the
    // client sent — catches in-flight quote race conditions.

    const effectiveDeliveryFeeCents =
      orderType === 'pickup' ? 0 : Math.max(0, clientDeliveryFeeCents);

    // ── Server-side tax validation ────────────────────────────────────────
    //
    // Tax is 9.75% of the post-discount subtotal. Allow ±1¢ for rounding.

    const discountedSubtotalCents = clientSubtotalCents - effectiveDiscountCents;
    const expectedTaxCents        = Math.round(discountedSubtotalCents * TAX_RATE);

    if (Math.abs(clientTaxCents - expectedTaxCents) > 1) {
      console.error(
        `Tax mismatch: client=${clientTaxCents}¢ server=${expectedTaxCents}¢ ` +
        `(discountedSubtotal=${discountedSubtotalCents}¢ rate=${TAX_RATE})`
      );
      return json({
        success: false,
        error: 'Tax mismatch. Please refresh and try again.',
      }, 400);
    }

    // ── Server-side total recomputation ───────────────────────────────────
    //
    // Never charge the client-declared `amount`. Recompute from verified
    // components. Reject if the client figure is off by more than 1¢.

    const serverComputedAmount = Math.max(
      0,
      discountedSubtotalCents + clientTaxCents + effectiveDeliveryFeeCents
    );

    if (typeof amount === 'number' && Math.abs(amount - serverComputedAmount) > 1) {
      console.error(
        `Amount mismatch: client=${amount}¢ server=${serverComputedAmount}¢ ` +
        `(subtotal=${clientSubtotalCents} discount=${effectiveDiscountCents} ` +
        `tax=${clientTaxCents} deliveryFee=${effectiveDeliveryFeeCents} orderType=${orderType})`
      );
      return json({
        success: false,
        error: 'Amount mismatch. Please refresh and try again.',
      }, 400);
    }

    if (serverComputedAmount <= 0) {
      return json({ success: false, error: 'Computed charge amount is zero or negative' }, 400);
    }

    console.log(
      `✓ Financials verified — subtotal=${clientSubtotalCents}¢ ` +
      `discount=${effectiveDiscountCents}¢ tax=${clientTaxCents}¢ ` +
      `delivery=${effectiveDeliveryFeeCents}¢ total=${serverComputedAmount}¢`
    );

    // ── Save pending order with server-verified amounts ───────────────────
    //
    // Store the verified amounts alongside the raw payload so the
    // post-payment webhook doesn't need to re-fetch app_config.

    const { data: pendingOrderRecord, error: pendingError } = await supabase
      .from('pending_orders')
      .insert({
        user_id: user.id,
        payload: pendingOrder,
        // Server-verified financial snapshot — webhook should use these,
        // not the raw payload values.
        verified_subtotal_cents:      clientSubtotalCents,
        verified_discount_cents:      effectiveDiscountCents,
        verified_tax_cents:           clientTaxCents,
        verified_delivery_fee_cents:  effectiveDeliveryFeeCents,
        verified_total_cents:         serverComputedAmount,
      })
      .select('id')
      .single();

    if (pendingError || !pendingOrderRecord) {
      throw new Error(`Failed to store pending order: ${pendingError?.message}`);
    }

    console.log('✓ Pending order saved:', pendingOrderRecord.id);

    // ── User profile (for receipt email / description) ────────────────────

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('name, email')
      .eq('user_id', user.id)
      .single();

    // ── Create Stripe PaymentIntent ───────────────────────────────────────
    //
    // IMPORTANT: charge `serverComputedAmount`, never the client's `amount`.

    const paymentIntentConfig: Stripe.PaymentIntentCreateParams = {
      amount:   serverComputedAmount, // ← server-computed, not client-sent
      currency: currency.toLowerCase(),
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: 'never',
      },
      metadata: {
        user_id:          user.id,
        pending_order_id: pendingOrderRecord.id,
      },
      description:   `Order for ${profile?.name || user.email}`,
      receipt_email: profile?.email || user.email || undefined,
    };

    if (customerId) {
      console.log('✓ Adding customer to payment intent:', customerId);
      paymentIntentConfig.customer = customerId;
    } else {
      console.warn('⚠️ No customer ID provided — saved cards unavailable');
    }

    if (setupFutureUsage) {
      console.log('✓ Setting up future usage:', setupFutureUsage);
      paymentIntentConfig.setup_future_usage = setupFutureUsage;
    }

    console.log('Creating Stripe PaymentIntent…');
    const paymentIntent = await stripe.paymentIntents.create(paymentIntentConfig);
    console.log('✓ PaymentIntent created:', paymentIntent.id, 'amount:', paymentIntent.amount);

    // ── Ephemeral key (required for Payment Sheet saved cards) ────────────

    let ephemeralKeySecret: string | null = null;
    if (customerId) {
      try {
        const ephemeralKey = await stripe.ephemeralKeys.create(
          { customer: customerId },
          { apiVersion: '2023-10-16' }
        );
        ephemeralKeySecret = ephemeralKey.secret;
        console.log('✓ Ephemeral key created');
      } catch (ephemeralError) {
        // Non-fatal — payment still works, just no saved cards in the sheet
        console.error('❌ Ephemeral key creation failed:', ephemeralError);
      }
    } else {
      console.warn('⚠️ No customer ID — skipping ephemeral key');
    }

    // ── Response ──────────────────────────────────────────────────────────

    return json({
      success:         true,
      clientSecret:    paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      customerId:      customerId || null,
      ephemeralKey:    ephemeralKeySecret,
      // Echo back verified amounts so the app UI can sanity-check
      verifiedAmounts: {
        subtotalCents:     clientSubtotalCents,
        discountCents:     effectiveDiscountCents,
        taxCents:          clientTaxCents,
        deliveryFeeCents:  effectiveDeliveryFeeCents,
        totalCents:        serverComputedAmount,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Unhandled error:', message);
    return json({ success: false, error: message || 'Failed to create payment intent' }, 400);
  }
});