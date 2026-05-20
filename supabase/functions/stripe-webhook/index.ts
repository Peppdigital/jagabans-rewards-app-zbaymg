import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import Stripe from "npm:stripe";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2025-12-15.clover",
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ─────────────────────────────────────────────────────────────────────────────
// Uber Direct helpers
// ─────────────────────────────────────────────────────────────────────────────

interface UberAddress {
  street_address: [string, string];
  city: string;
  state: string;
  zip_code: string;
  country: string;
}

interface UberDelivery {
  id: string;
  status: string;
  tracking_url?: string;
  dropoff_eta?: string;
}

function parseUberAddress(value: string): UberAddress | null {
  try {
    const parsed = JSON.parse(value);
    if (
      parsed &&
      Array.isArray(parsed.street_address) &&
      parsed.street_address.length === 2 &&
      typeof parsed.city === 'string' &&
      typeof parsed.state === 'string' &&
      typeof parsed.zip_code === 'string' &&
      typeof parsed.country === 'string'
    ) {
      return parsed as UberAddress;
    }
    return null;
  } catch {
    return null;
  }
}

function resolveDropoffAddress(raw: string): string {
  if (parseUberAddress(raw)) {
    console.log('[dropoff] Using pre-validated structured UberAddress');
    return raw;
  }
  console.warn('[dropoff] Plain text address — wrapping in UberAddress shell');
  const fallback: UberAddress = {
    street_address: [raw.trim(), ''],
    city: '', state: '', zip_code: '', country: 'US',
  };
  return JSON.stringify(fallback);
}

function resolvePickupAddress(): string {
  const structured = Deno.env.get('RESTAURANT_ADDRESS_UBER');
  if (structured) {
    if (parseUberAddress(structured)) {
      console.log('[delivery] Using RESTAURANT_ADDRESS_UBER (structured)');
      return structured;
    }
    console.warn('[delivery] RESTAURANT_ADDRESS_UBER failed to parse — falling back');
  }
  const plain = Deno.env.get('RESTAURANT_ADDRESS');
  if (plain) {
    console.warn('[delivery] Using RESTAURANT_ADDRESS (plain text fallback)');
    const fallback: UberAddress = {
      street_address: [plain.trim(), ''],
      city: '', state: '', zip_code: '', country: 'US',
    };
    return JSON.stringify(fallback);
  }
  throw new Error('Neither RESTAURANT_ADDRESS_UBER nor RESTAURANT_ADDRESS is configured');
}

async function getUberAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const tokenResponse = await fetch('https://auth.uber.com/oauth/v2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
      scope: 'eats.deliveries direct.organizations',
    }),
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    throw new Error(`Failed to get Uber access token: ${tokenResponse.status} ${errorText}`);
  }

  const tokenData = await tokenResponse.json();
  return tokenData.access_token as string;
}

async function createUberDelivery(
  accessToken: string,
  payload: Record<string, unknown>
): Promise<UberDelivery> {
  const UBER_CUSTOMER_ID = Deno.env.get('UBER_CUSTOMER_ID');
  const res = await fetch(`https://api.uber.com/v1/customers/${UBER_CUSTOMER_ID}/deliveries`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`Uber createDelivery failed (${res.status}): ${await res.text()}`);
  }

  return res.json() as Promise<UberDelivery>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Email helpers
// ─────────────────────────────────────────────────────────────────────────────

interface EmailOrderData {
  customerName: string;
  customerEmail: string;
  orderId: string;
  orderNumber: string;
  orderType: 'delivery' | 'pickup';
  items: Array<{ name: string; quantity: number; price: number }>;
  subtotalDollars: number;
  discountDollars: number;
  taxDollars: number;
  deliveryFeeDollars: number;
  totalDollars: number;
  deliveryAddress?: string | null;
  pickupNotes?: string | null;
}

function buildCustomerEmailHtml(d: EmailOrderData): string {
  const itemRows = d.items
    .map(
      (i) => `<tr>
        <td style="padding:12px 0;border-bottom:1px solid #f0f0f0;">
          <div style="font-weight:500;color:#1a1a1a;">${i.name}</div>
          <div style="font-size:14px;color:#666;">Qty: ${i.quantity}</div>
        </td>
        <td style="padding:12px 0;border-bottom:1px solid #f0f0f0;text-align:right;font-weight:500;">
          $${(Number(i.price || 0) * Number(i.quantity || 0)).toFixed(2)}
        </td>
      </tr>`
    )
    .join('');

  const discountRow = d.discountDollars > 0
    ? `<tr>
        <td style="padding:8px 0;color:#10b981;">Discount</td>
        <td style="text-align:right;font-weight:500;color:#10b981;">−$${d.discountDollars.toFixed(2)}</td>
      </tr>`
    : '';

  const deliveryFeeRow = d.orderType === 'delivery' && d.deliveryFeeDollars > 0
    ? `<tr>
        <td style="padding:8px 0;color:#4a5568;">Delivery Fee</td>
        <td style="text-align:right;font-weight:500;">$${d.deliveryFeeDollars.toFixed(2)}</td>
      </tr>`
    : '';

  const orderNumber = d.orderNumber || d.orderId.substring(0, 8).toUpperCase();
  const orderDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Order Confirmation</title></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f8f9fa;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;background:#f8f9fa;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.07);">
  <tr><td style="background:linear-gradient(135deg,#4AD7C2 0%,#D4AF37 100%);padding:40px;text-align:center;">
    <h1 style="margin:0;color:#fff;font-size:28px;">Order Confirmed ✓</h1>
    <p style="margin:8px 0 0;color:rgba(255,255,255,0.95);">Thank you for your order!</p>
  </td></tr>
  <tr><td style="padding:32px 40px 24px;">
    <p style="margin:0;font-size:16px;color:#1a1a1a;">Dear <strong>${d.customerName || 'Valued Customer'}</strong>,</p>
    <p style="margin:16px 0 0;font-size:15px;color:#4a5568;line-height:1.6;">
      We've received your order and our kitchen is already on it.
      ${d.orderType === 'delivery'
        ? 'Your order will be delivered to your specified address.'
        : 'Your order will be ready for pickup in about 20 minutes.'}
    </p>
  </td></tr>
  <tr><td style="padding:0 40px 24px;">
    <div style="background:#f8f9fa;border-radius:8px;padding:20px;border-left:4px solid #4AD7C2;">
      <div style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#666;font-weight:600;">
        Order #${orderNumber} &nbsp;·&nbsp; ${orderDate}
      </div>
      <div style="margin-top:8px;font-size:14px;color:#4a5568;">
        ${d.orderType === 'pickup' ? '🏪 Pickup' : '🚗 Delivery'}
      </div>
      ${d.orderType === 'delivery' && d.deliveryAddress
        ? `<div style="margin-top:12px;font-size:15px;color:#1a1a1a;">📍 ${d.deliveryAddress}</div>`
        : ''}
      ${d.orderType === 'pickup' && d.pickupNotes
        ? `<div style="margin-top:12px;font-size:15px;color:#1a1a1a;">⏰ ${d.pickupNotes}</div>`
        : ''}
    </div>
  </td></tr>
  <tr><td style="padding:0 40px 24px;">
    <h2 style="margin:0 0 16px;font-size:18px;color:#1a1a1a;">Order Items</h2>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-top:2px solid #e2e8f0;">${itemRows}</table>
  </td></tr>
  <tr><td style="padding:0 40px 32px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fa;border-radius:8px;padding:20px;">
      <tr>
        <td style="padding:8px 0;color:#4a5568;">Subtotal</td>
        <td style="text-align:right;font-weight:500;">$${d.subtotalDollars.toFixed(2)}</td>
      </tr>
      ${discountRow}
      <tr>
        <td style="padding:8px 0;color:#4a5568;">Tax (9.75%)</td>
        <td style="text-align:right;font-weight:500;">$${d.taxDollars.toFixed(2)}</td>
      </tr>
      ${deliveryFeeRow}
      <tr>
        <td style="padding:16px 0 0;font-size:18px;font-weight:700;border-top:2px solid #d4af37;">Total</td>
        <td style="padding:16px 0 0;text-align:right;font-size:20px;color:#4AD7C2;font-weight:700;border-top:2px solid #d4af37;">$${d.totalDollars.toFixed(2)}</td>
      </tr>
    </table>
  </td></tr>
  <tr><td style="background:#1a1a1a;padding:32px 40px;text-align:center;">
    <h3 style="margin:0 0 12px;color:#D4AF37;font-size:22px;">Jagabans L.A.</h3>
    <p style="margin:0;font-size:14px;color:rgba(255,255,255,0.7);">
      Questions? <a href="mailto:orders@jagabansla.com" style="color:#4AD7C2;">orders@jagabansla.com</a>
      &nbsp;·&nbsp; (818) 210-6659
    </p>
    <p style="margin:8px 0 0;font-size:13px;color:rgba(255,255,255,0.5);">1423 W Pico Blvd, Los Angeles, CA 90015</p>
  </td></tr>
</table></td></tr></table>
</body></html>`;
}

function buildCustomerEmailText(d: EmailOrderData): string {
  const orderNumber = d.orderNumber || d.orderId.substring(0, 8).toUpperCase();
  const discountLine = d.discountDollars > 0 ? `Discount:     −$${d.discountDollars.toFixed(2)}\n` : '';
  const deliveryLine = d.orderType === 'delivery' && d.deliveryFeeDollars > 0
    ? `Delivery Fee: $${d.deliveryFeeDollars.toFixed(2)}\n`
    : '';

  return `ORDER CONFIRMATION #${orderNumber}

Dear ${d.customerName || 'Valued Customer'},

Type: ${d.orderType.toUpperCase()}
${d.orderType === 'delivery' && d.deliveryAddress ? `Delivery: ${d.deliveryAddress}\n` : ''}${d.orderType === 'pickup' && d.pickupNotes ? `Pickup: ${d.pickupNotes}\n` : ''}
ITEMS:
${d.items.map((i) => `${i.name} ×${i.quantity} ...... $${(i.price * i.quantity).toFixed(2)}`).join('\n')}

Subtotal:     $${d.subtotalDollars.toFixed(2)}
${discountLine}Tax (9.75%):  $${d.taxDollars.toFixed(2)}
${deliveryLine}TOTAL:        $${d.totalDollars.toFixed(2)}

Questions? orders@jagabansla.com | (818) 210-6659
1423 W Pico Blvd, Los Angeles, CA 90015`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Webhook handler
// ─────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: corsHeaders,
    });
  }

  const startTime = Date.now();

  try {
    // ── Env validation ────────────────────────────────────────────────────────

    const SUPABASE_URL              = Deno.env.get('SUPABASE_URL') ?? '';
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error('Missing Supabase credentials');
      return new Response(JSON.stringify({ error: 'Server misconfigured' }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ── Stripe webhook signature verification ────────────────────────────────
    //
    // TODO: Re-enable before going to production.
    // IMPORTANT: constructEvent requires the raw body as text — must call
    // req.text() here and remove the req.json() call below.
    //
    // const sig           = req.headers.get('stripe-signature');
    // const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
    // if (!sig || !webhookSecret) {
    //   return new Response(JSON.stringify({ error: 'Missing signature' }), {
    //     status: 400, headers: corsHeaders,
    //   });
    // }
    // let webhookPayload: Stripe.Event;
    // try {
    //   const rawBody = await req.text();
    //   webhookPayload = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    // } catch (err) {
    //   console.error('❌ Webhook signature verification failed:', err);
    //   return new Response(JSON.stringify({ error: 'Invalid signature' }), {
    //     status: 400, headers: corsHeaders,
    //   });
    // }

    const webhookPayload = await req.json() as Stripe.Event;

    console.log('Stripe webhook type:', webhookPayload.type);

    // ── Only handle payment_intent.succeeded ──────────────────────────────────

    if (webhookPayload.type !== 'payment_intent.succeeded') {
      return new Response(JSON.stringify({ received: true }), { headers: corsHeaders });
    }

    const paymentIntent   = webhookPayload.data.object as Stripe.PaymentIntent;
    const paymentId       = paymentIntent.id;
    const stripeCustomerId: string | undefined =
      typeof paymentIntent.customer === 'string' ? paymentIntent.customer : undefined;

    console.log('Processing payment:', paymentId);

    // ── MARKETPLACE BYPASS ────────────────────────────────────────────────────
    // Orders.co and other marketplace payments have no user_id or
    // pending_order_id in our system. Record them for revenue tracking and exit.

    const provider = paymentIntent.metadata?.provider;

    if (provider === 'marketplace') {
      console.log('[marketplace] Detected marketplace payment — recording and exiting');

      let userFields: Record<string, unknown> = {};
      try {
        userFields = JSON.parse(paymentIntent.metadata?.userFields ?? '{}');
      } catch {
        console.warn('[marketplace] Could not parse userFields');
      }

      const charges = (userFields?.charges ?? {}) as Record<string, unknown>;
      const tooCents = (n: unknown) => Math.round(Number(n ?? 0) * 100);
      const tipInfo  = (charges?.tipInfo ?? {}) as Record<string, unknown>;

      const customerName = (paymentIntent.description ?? '').split(' - ')[0].trim() || null;

      const { error: mktErr } = await supabase
        .from('marketplace_orders')
        .upsert(
          {
            provider:           'orders_co',
            provider_order_id:  paymentIntent.metadata?.orderId ?? null,
            provider_cart_id:   paymentIntent.metadata?.cartId ?? null,
            stripe_payment_id:  paymentId,
            stripe_customer_id: stripeCustomerId ?? null,
            customer_name:      customerName,
            customer_alias:     paymentIntent.metadata?.alias ?? null,
            amount:             paymentIntent.amount,
            currency:           paymentIntent.currency,
            tip_kitchen:        tooCents(charges.subTotal ? tipInfo?.kitchen ?? 0 : 0),
            tip_driver:         tooCents(tipInfo?.driver ?? 0),
            delivery_fee:       tooCents(charges.deliveryFee ?? 0),
            subtotal:           tooCents(charges.subTotal ?? 0),
            application_fee:    Number(paymentIntent.application_fee_amount ?? 0),
            raw_metadata:       paymentIntent.metadata ?? {},
          },
          { onConflict: 'stripe_payment_id' }
        );

      if (mktErr) {
        console.error('[marketplace] Insert error:', mktErr.message);
        return new Response(JSON.stringify({ error: 'Failed to record marketplace order' }), {
          status: 500, headers: corsHeaders,
        });
      }

      console.log(
        `[marketplace] Recorded Orders.co order ${paymentIntent.metadata?.orderId} | ` +
        `$${(paymentIntent.amount / 100).toFixed(2)}`
      );

      return new Response(
        JSON.stringify({ received: true, source: 'marketplace', provider: 'orders_co' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Resolve user_id ───────────────────────────────────────────────────────

    let userId: string | undefined = paymentIntent.metadata?.user_id;

    if (!userId && stripeCustomerId) {
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('user_id')
        .eq('stripe_customer_id', stripeCustomerId)
        .single();

      if (profileError) {
        console.error('Customer lookup error:', profileError);
      } else if (profile) {
        userId = profile.user_id;
        console.log('Resolved user_id from Stripe customer:', userId);
      }
    }

    if (!userId) {
      throw new Error(
        'Cannot determine user_id. Metadata must include user_id or customer must be linked to a user_profile.'
      );
    }

    // ── Load pending order + verified financial snapshot ──────────────────────
    //
    // FIX: select the verified_* columns written by create-payment-intent.
    // These are server-verified amounts — use them everywhere downstream
    // (order insert, email, points) instead of the raw payload values.

    const pendingOrderId = paymentIntent.metadata?.pending_order_id;
    if (!pendingOrderId) throw new Error('Missing pending_order_id in metadata');

    const { data: pendingOrderRow, error: pendingErr } = await supabase
      .from('pending_orders')
      .select(`
        payload,
        verified_subtotal_cents,
        verified_discount_cents,
        verified_tax_cents,
        verified_delivery_fee_cents,
        verified_total_cents
      `)
      .eq('id', pendingOrderId)
      .eq('user_id', userId)
      .single();

    if (pendingErr || !pendingOrderRow) {
      throw new Error(`Pending order not found: ${pendingErr?.message ?? 'no record'}`);
    }

    // Verified financials (cents) — written by create-payment-intent
    const verifiedSubtotalCents     = Number(pendingOrderRow.verified_subtotal_cents     ?? 0);
    const verifiedDiscountCents     = Number(pendingOrderRow.verified_discount_cents     ?? 0);
    const verifiedTaxCents          = Number(pendingOrderRow.verified_tax_cents          ?? 0);
    const verifiedDeliveryFeeCents  = Number(pendingOrderRow.verified_delivery_fee_cents ?? 0);
    const verifiedTotalCents        = Number(pendingOrderRow.verified_total_cents        ?? paymentIntent.amount);

    // Dollar equivalents for email / DB writes
    const subtotalDollars     = +(verifiedSubtotalCents     / 100).toFixed(2);
    const discountDollars     = +(verifiedDiscountCents     / 100).toFixed(2);
    const taxDollars          = +(verifiedTaxCents          / 100).toFixed(2);
    const deliveryFeeDollars  = +(verifiedDeliveryFeeCents  / 100).toFixed(2);
    const totalDollars        = +(verifiedTotalCents        / 100).toFixed(2);

    // Final sanity check: Stripe charged amount must equal our verified total
    if (Math.abs(paymentIntent.amount - verifiedTotalCents) > 1) {
      throw new Error(
        `Charge amount mismatch: Stripe charged ${paymentIntent.amount}¢ but verified total is ${verifiedTotalCents}¢`
      );
    }

    const {
      items,
      delivery_address,
      delivery_address_uber,
      order_type,
      uber_quote_id,
      customer_name,
      customer_email,
      customer_phone,
      pickup_notes,
    } = pendingOrderRow.payload;

    console.log('Pending order loaded | type:', order_type, '| items:', items?.length ?? 0);

    // ── PRE-CHECK: Delivery prerequisites ────────────────────────────────────

    if (order_type === 'delivery') {
      if (!delivery_address?.trim()) {
        throw new Error('Delivery order is missing a delivery address');
      }

      const uberClientId     = Deno.env.get('UBER_CLIENT_ID');
      const uberClientSecret = Deno.env.get('UBER_CLIENT_SECRET');
      const uberCustomerId   = Deno.env.get('UBER_CUSTOMER_ID');

      if (!uberClientId || !uberClientSecret || !uberCustomerId) {
        console.warn(
          '⚠️  Uber credentials missing — order will be created but delivery NOT auto-dispatched.'
        );
      } else {
        const rawDropoff = delivery_address_uber || delivery_address;
        if (!rawDropoff?.trim()) throw new Error('Delivery order has no resolvable dropoff address');
        console.log(
          '[pre-check] dropoff structured:', !!parseUberAddress(rawDropoff),
          '| uber_quote_id present:', !!uber_quote_id
        );
      }
    }

    // ── 1. Store Stripe payment record ────────────────────────────────────────

    const { error: paymentInsertError } = await supabase
      .from('stripe_payments')
      .upsert(
        {
          payment_id:     paymentId,
          user_id:        userId,
          amount:         paymentIntent.amount,
          currency:       paymentIntent.currency,
          status:         'succeeded',
          payment_method: paymentIntent.payment_method,
          metadata: { user_id: userId, pending_order_id: pendingOrderId },
        },
        { onConflict: 'payment_id' }
      );

    if (paymentInsertError) {
      throw new Error(`Failed to store payment record: ${paymentInsertError.message}`);
    }
    console.log('Payment record stored:', paymentId);

    // ── 2. Create order via RPC ───────────────────────────────────────────────
    //
    // NOTE: The RPC `create_order_from_payment` must read verified_* columns
    // from pending_orders when computing the order's financial fields.
    // It should NOT derive totals from the raw payload.

    console.log('Creating order via RPC…');
    const { data: rpcRaw, error: rpcError } = await supabase.rpc('create_order_from_payment', {
      stripe_payment_intent_id: paymentId,
    });

    if (rpcError) throw new Error(`Failed to create order: ${rpcError.message}`);

    const orderData = Array.isArray(rpcRaw) ? rpcRaw[0] : rpcRaw;
    if (!orderData || typeof orderData !== 'object') {
      throw new Error('RPC returned unexpected shape');
    }

    const order = {
      id:               orderData.id              as string,
      user_id:          orderData.user_id         as string,
      customer_name:    (orderData.customer_name  as string) || customer_name  || '',
      customer_email:   (orderData.customer_email as string) || customer_email || '',
      customer_phone:   (orderData.customer_phone as string) || customer_phone || '',
      items:            (orderData.items          ?? [])     as Array<{ name: string; quantity: number; price: number }>,
      order_type:       order_type                           as 'pickup' | 'delivery',
      delivery_address: delivery_address                     as string | null,
      pickup_notes:     pickup_notes                         as string | null,
      order_number:     (orderData.order_number   as string | number | undefined) ?? '',
    };

    console.log('Order created:', order.id, '| type:', order.order_type);

    // ── 3. Background: admin notifications ───────────────────────────────────
    //
    // NOTE: Loyalty points are awarded inside create_order_from_payment (step 8),
    // atomically within the same transaction as order creation. Do NOT call
    // increment_user_points here — it would double-award every order.
    // Points are computed from verified_* cents in the RPC, not the raw payload.

    const FUNCTIONS_URL = Deno.env.get('FUNCTIONS_URL') || `${SUPABASE_URL}/functions/v1`;
    const notificationHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'x-provider': 'stripe-webhook',
      'x-provider-event-id': paymentId,
    };

    const orderPayload = {
      orderId:         order.id,
      user_id:         order.user_id,
      customerName:    order.customer_name,
      customerEmail:   order.customer_email,
      customerPhone:   order.customer_phone,
      items:           order.items,
      subtotal:        subtotalDollars,
      discount:        discountDollars,
      tax:             taxDollars,
      deliveryFee:     deliveryFeeDollars,
      total:           totalDollars,
      deliveryAddress: order.delivery_address,
      pickupNotes:     order.pickup_notes,
      orderType:       order.order_type,
      timestamp:       new Date().toISOString(),
    };

    EdgeRuntime.waitUntil(
      fetch(`${FUNCTIONS_URL}/send-order-confirmation-email`, {
        method: 'POST',
        headers: notificationHeaders,
        body: JSON.stringify(orderPayload),
      })
        .then((r) => console.log('Admin email status:', r.status))
        .catch((e) => console.error('Admin email error:', e))
    );

    EdgeRuntime.waitUntil(
      fetch(`${FUNCTIONS_URL}/send-order-confirmation-sms`, {
        method: 'POST',
        headers: notificationHeaders,
        body: JSON.stringify(orderPayload),
      })
        .then((r) => console.log('Admin SMS status:', r.status))
        .catch((e) => console.error('Admin SMS error:', e))
    );

    // ── 5. Customer confirmation email ────────────────────────────────────────

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (resendApiKey && order.customer_email) {
      const emailData: EmailOrderData = {
        customerName:      order.customer_name,
        customerEmail:     order.customer_email,
        orderId:           order.id,
        orderNumber:       String(order.order_number),
        orderType:         order.order_type,
        items:             order.items,
        subtotalDollars,
        discountDollars,
        taxDollars,
        deliveryFeeDollars,
        totalDollars,
        deliveryAddress: order.delivery_address,
        pickupNotes:     order.pickup_notes,
      };

      EdgeRuntime.waitUntil(
        fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from:    'Jagabans L.A. <info@jagabansla.com>',
            to:      [order.customer_email],
            subject: `Order Confirmed #${String(order.order_number) || order.id.substring(0, 8).toUpperCase()} — Jagabans L.A.`,
            html:    buildCustomerEmailHtml(emailData),
            text:    buildCustomerEmailText(emailData),
          }),
        })
          .then((r) => console.log('Customer email status:', r.status))
          .catch((e) => console.error('Customer email error:', e))
      );
    }

    // ── 6. Uber Direct delivery ───────────────────────────────────────────────

    if (order.order_type === 'delivery' && order.delivery_address) {
      const uberClientId     = Deno.env.get('UBER_CLIENT_ID');
      const uberClientSecret = Deno.env.get('UBER_CLIENT_SECRET');

      if (uberClientId && uberClientSecret) {
        console.log('Triggering Uber Direct delivery for order:', order.id);

        try {
          const accessToken = await getUberAccessToken(uberClientId, uberClientSecret);

          const manifestItems = order.items.length > 0
            ? order.items.map((item) => ({
                name: item.name,
                quantity: Number(item.quantity ?? 1),
              }))
            : [{ name: `Order ${order.id.substring(0, 8).toUpperCase()}`, quantity: 1 }];

          const pickupAddress  = resolvePickupAddress();
          const rawDropoff     = delivery_address_uber || order.delivery_address;
          const dropoffAddress = resolveDropoffAddress(rawDropoff);

          console.log('[delivery] pickup structured:', !!parseUberAddress(pickupAddress));
          console.log('[delivery] dropoff structured:', !!parseUberAddress(dropoffAddress));

          const quoteIdField = uber_quote_id ? { quote_id: uber_quote_id } : {};

          const deliveryPayload = {
            ...quoteIdField,
            external_id:          order.id,
            pickup_name:          Deno.env.get('RESTAURANT_NAME') || 'Jagabans L.A.',
            pickup_phone_number:  Deno.env.get('RESTAURANT_PHONE') || '+18182106659',
            pickup_address:       pickupAddress,
            pickup_notes:         'Food order ready for pickup',
            dropoff_name:         order.customer_name || 'Customer',
            dropoff_phone_number: order.customer_phone || '+10000000000',
            dropoff_address:      dropoffAddress,
            dropoff_notes:        order.pickup_notes || '',
            manifest_items:       manifestItems,
            pickup_ready_dt:      new Date(Date.now() + 5 * 60 * 1000).toISOString(),
          };

          console.log('Uber Direct payload summary:', {
            quote_id:        quoteIdField.quote_id ?? '(none — dynamic pricing)',
            external_id:     deliveryPayload.external_id,
            pickup_address:  deliveryPayload.pickup_address,
            dropoff_address: deliveryPayload.dropoff_address,
            item_count:      manifestItems.length,
          });

          const delivery = await createUberDelivery(accessToken, deliveryPayload);
          console.log('Uber Direct delivery created:', delivery.id, '| status:', delivery.status);

          const { error: uberUpdateError } = await supabase
            .from('orders')
            .update({
              status:                'ready',
              uber_delivery_id:      delivery.id,
              uber_delivery_status:  delivery.status,
              uber_tracking_url:     delivery.tracking_url ?? null,
              uber_delivery_eta:     delivery.dropoff_eta ?? null,
              delivery_provider:     'uber',
              delivery_triggered_at: new Date().toISOString(),
              cancellation_deadline: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
              updated_at:            new Date().toISOString(),
            })
            .eq('id', order.id);

          if (uberUpdateError) {
            console.error('Failed to persist Uber delivery info:', uberUpdateError.message);
          } else {
            console.log('Order updated with Uber delivery info');
          }
        } catch (uberErr) {
          console.error(
            'Uber Direct error (non-fatal):',
            uberErr instanceof Error ? uberErr.message : uberErr
          );
        }
      } else {
        console.warn('UBER credentials not set — delivery dispatch skipped for order:', order.id);
      }
    }

    // ── Done ──────────────────────────────────────────────────────────────────

    console.log(`Webhook processed in ${Date.now() - startTime}ms for payment ${paymentId}`);

    return new Response(JSON.stringify({ success: true, orderId: order.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Webhook processing failed';
    console.error('Webhook error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: corsHeaders,
    });
  }
});