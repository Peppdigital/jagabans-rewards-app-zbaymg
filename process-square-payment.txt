import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ── Uber Direct helpers (mirrors stripe-webhook) ──────────────────────────────

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
  if (parseUberAddress(raw)) return raw;
  const fallback: UberAddress = {
    street_address: [raw.trim(), ''],
    city: '', state: '', zip_code: '', country: 'US',
  };
  return JSON.stringify(fallback);
}

function resolvePickupAddress(): string {
  const structured = Deno.env.get('RESTAURANT_ADDRESS_UBER');
  if (structured && parseUberAddress(structured)) return structured;
  const plain = Deno.env.get('RESTAURANT_ADDRESS');
  if (plain) {
    const fallback: UberAddress = {
      street_address: [plain.trim(), ''],
      city: '', state: '', zip_code: '', country: 'US',
    };
    return JSON.stringify(fallback);
  }
  throw new Error('Neither RESTAURANT_ADDRESS_UBER nor RESTAURANT_ADDRESS is configured');
}

async function getUberAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const res = await fetch('https://auth.uber.com/oauth/v2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
      scope: 'eats.deliveries direct.organizations',
    }),
  });
  if (!res.ok) throw new Error(`Uber token error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.access_token as string;
}

async function createUberDelivery(accessToken: string, payload: Record<string, unknown>): Promise<UberDelivery> {
  const customerId = Deno.env.get('UBER_CUSTOMER_ID');
  const res = await fetch(`https://api.uber.com/v1/customers/${customerId}/deliveries`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Uber createDelivery failed (${res.status}): ${await res.text()}`);
  return res.json() as Promise<UberDelivery>;
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const SQUARE_ACCESS_TOKEN = Deno.env.get('SQUARE_ACCESS_TOKEN') ?? '';
    const SQUARE_LOCATION_ID = Deno.env.get('SQUARE_LOCATION_ID') ?? '';
    const SQUARE_ENV = Deno.env.get('SQUARE_ENV') || 'production';

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SQUARE_ACCESS_TOKEN || !SQUARE_LOCATION_ID) {
      console.error('Missing env vars:', { SUPABASE_URL: !!SUPABASE_URL, SQUARE_ACCESS_TOKEN: !!SQUARE_ACCESS_TOKEN, SQUARE_LOCATION_ID: !!SQUARE_LOCATION_ID });
      return new Response(JSON.stringify({ error: 'Server misconfigured' }), { status: 500, headers: corsHeaders });
    }

    // ── Auth ──────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }
    const token = authHeader.slice(7);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: { user }, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    // ── Parse body ────────────────────────────────────────────────────────────
    const body = await req.json();
    const { sourceId, amount, currency, customer, orderPayload } = body;

    if (!sourceId || !amount || !orderPayload) {
      return new Response(JSON.stringify({ error: 'Missing required fields: sourceId, amount, orderPayload' }), { status: 400, headers: corsHeaders });
    }

    const {
      order_type,
      delivery_address,
      delivery_address_uber,
      pickup_notes,
      items,
      subtotal,
      tax,
      total,
      points_earned = 0,
      points_used = 0,
      customer_name,
      customer_email,
      customer_phone,
      uber_quote_id,
    } = orderPayload;

    // ── 1. Charge via Square Payments API ─────────────────────────────────────
    const squareBaseUrl = SQUARE_ENV === 'sandbox'
      ? 'https://connect.squareupsandbox.com'
      : 'https://connect.squareup.com';

    const squareRes = await fetch(`${squareBaseUrl}/v2/payments`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SQUARE_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        'Square-Version': '2024-01-18',
      },
      body: JSON.stringify({
        source_id: sourceId,
        idempotency_key: crypto.randomUUID(),
        amount_money: {
          amount: Number(amount),
          currency: (currency || 'USD').toUpperCase(),
        },
        location_id: SQUARE_LOCATION_ID,
        buyer_email_address: customer?.email || customer_email || undefined,
      }),
    });

    if (!squareRes.ok) {
      const errBody = await squareRes.json().catch(() => ({}));
      const errMsg = (errBody as any).errors?.[0]?.detail || `Square payment failed (${squareRes.status})`;
      console.error('[Square] Payment error:', errMsg);
      throw new Error(errMsg);
    }

    const squareData = await squareRes.json();
    const paymentId: string = (squareData as any).payment.id;
    console.log('Square payment created:', paymentId);

    // ── 2. Create order ───────────────────────────────────────────────────────
    const { data: orderRow, error: orderErr } = await supabase
      .from('orders')
      .insert({
        user_id: user.id,
        status: 'preparing',
        payment_status: 'succeeded',
        payment_id: paymentId,
        subtotal: Number(subtotal ?? 0),
        tax: Number(tax ?? 0),
        total: Number(total ?? 0),
        delivery_address: order_type === 'delivery' ? (delivery_address || null) : null,
        pickup_notes: pickup_notes || null,
        points_earned: Number(points_earned ?? 0),
        cancellation_deadline: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      })
      .select('id')
      .single();

    if (orderErr || !orderRow) {
      throw new Error(`Failed to create order: ${orderErr?.message}`);
    }
    const orderId: string = orderRow.id;
    console.log('Order created:', orderId);

    // ── 3. Insert order items ─────────────────────────────────────────────────
    if (Array.isArray(items) && items.length > 0) {
      const itemRows = items.map((item: any) => ({
        order_id: orderId,
        menu_item_id: item.id ? Number(item.id) : null,
        name: item.name,
        price: Number(item.price ?? 0),
        quantity: Number(item.quantity ?? 1),
      }));
      const { error: itemsErr } = await supabase.from('order_items').insert(itemRows);
      if (itemsErr) console.error('order_items insert error:', itemsErr.message);
    }

    // ── 4. Handle points ──────────────────────────────────────────────────────
    if (Number(points_used) > 0 || Number(points_earned) > 0) {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('points')
        .eq('user_id', user.id)
        .single<{ points: number }>();

      const current = Number(profile?.points ?? 0);
      const updated = Math.max(0, current - Number(points_used)) + Number(points_earned);

      await supabase
        .from('user_profiles')
        .update({ points: updated })
        .eq('user_id', user.id);

      console.log(`Points: ${current} → ${updated} (used ${points_used}, earned ${points_earned})`);
    }

    // ── 5. Record order event ─────────────────────────────────────────────────
    await supabase.from('order_events').insert({
      order_id: orderId,
      type: 'order_created',
      payload: {
        user_id: user.id,
        order_type,
        total: Number(total ?? 0),
        square_payment_id: paymentId,
      },
    }).then(({ error }) => {
      if (error) console.warn('order_events insert error (non-fatal):', error.message);
    });

    // ── 6. Background: notifications ──────────────────────────────────────────
    const FUNCTIONS_URL = Deno.env.get('FUNCTIONS_URL') || `${SUPABASE_URL}/functions/v1`;
    const notificationHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'x-provider': 'square-payment',
      'x-provider-event-id': paymentId,
    };

    const orderNotificationPayload = {
      orderId,
      user_id: user.id,
      customerName: customer_name || '',
      customerEmail: customer_email || '',
      customerPhone: customer_phone || '',
      items: items ?? [],
      subtotal: Number(subtotal ?? 0),
      tax: Number(tax ?? 0),
      total: Number(total ?? 0),
      deliveryAddress: order_type === 'delivery' ? delivery_address : null,
      pickupNotes: pickup_notes || null,
      orderType: order_type,
      timestamp: new Date().toISOString(),
    };

    EdgeRuntime.waitUntil(
      fetch(`${FUNCTIONS_URL}/send-order-confirmation-email`, {
        method: 'POST',
        headers: notificationHeaders,
        body: JSON.stringify(orderNotificationPayload),
      })
        .then((r) => console.log('Admin email status:', r.status))
        .catch((e) => console.error('Admin email error:', e))
    );

    EdgeRuntime.waitUntil(
      fetch(`${FUNCTIONS_URL}/send-order-confirmation-sms`, {
        method: 'POST',
        headers: notificationHeaders,
        body: JSON.stringify(orderNotificationPayload),
      })
        .then((r) => console.log('Admin SMS status:', r.status))
        .catch((e) => console.error('Admin SMS error:', e))
    );

    // ── 7. Background: customer confirmation email ────────────────────────────
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (resendApiKey && customer_email) {
      const orderNumber = String(orderId).substring(0, 8).toUpperCase();
      const orderDate = new Date().toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      });

      const itemsHtml = (items ?? [])
        .map((item: any) => `
          <tr>
            <td style="padding:12px 0;border-bottom:1px solid #f0f0f0;">
              <div style="font-weight:500;color:#1a1a1a;">${item.name}</div>
              <div style="font-size:14px;color:#666;">Qty: ${item.quantity}</div>
            </td>
            <td style="padding:12px 0;border-bottom:1px solid #f0f0f0;text-align:right;font-weight:500;">
              $${(Number(item.price || 0) * Number(item.quantity || 0)).toFixed(2)}
            </td>
          </tr>`)
        .join('');

      const emailHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Order Confirmation</title></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f8f9fa;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;background:#f8f9fa;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.07);">
  <tr><td style="background:linear-gradient(135deg,#4AD7C2 0%,#D4AF37 100%);padding:40px;text-align:center;">
    <h1 style="margin:0;color:#fff;font-size:28px;">Order Confirmed</h1>
    <p style="margin:8px 0 0;color:rgba(255,255,255,0.95);">Thank you for your order!</p>
  </td></tr>
  <tr><td style="padding:32px 40px 24px;">
    <p style="margin:0;font-size:16px;color:#1a1a1a;">Dear ${customer_name || 'Valued Customer'},</p>
    <p style="margin:16px 0 0;font-size:15px;color:#4a5568;line-height:1.6;">
      We've received your order and our kitchen is preparing your meal.
      ${order_type === 'delivery'
        ? 'Your order will be delivered to your specified address.'
        : 'Your order will be ready for pickup in about 20 minutes.'}
    </p>
  </td></tr>
  <tr><td style="padding:0 40px 24px;">
    <div style="background:#f8f9fa;border-radius:8px;padding:20px;border-left:4px solid #4AD7C2;">
      <div style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#666;font-weight:600;">Order #${orderNumber} &nbsp;·&nbsp; ${orderDate}</div>
      ${order_type === 'delivery' && delivery_address
        ? `<div style="margin-top:12px;font-size:15px;color:#1a1a1a;">📍 ${delivery_address}</div>`
        : ''}
    </div>
  </td></tr>
  <tr><td style="padding:0 40px 24px;">
    <h2 style="margin:0 0 16px;font-size:18px;color:#1a1a1a;">Order Items</h2>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-top:2px solid #e2e8f0;">${itemsHtml}</table>
  </td></tr>
  <tr><td style="padding:0 40px 32px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fa;border-radius:8px;padding:20px;">
      <tr><td style="padding:8px 0;color:#4a5568;">Subtotal</td><td style="text-align:right;font-weight:500;">$${Number(subtotal ?? 0).toFixed(2)}</td></tr>
      <tr><td style="padding:8px 0;color:#4a5568;">Tax</td><td style="text-align:right;font-weight:500;">$${Number(tax ?? 0).toFixed(2)}</td></tr>
      <tr><td style="padding:16px 0 0;font-size:18px;font-weight:700;border-top:2px solid #d4af37;">Total</td>
          <td style="padding:16px 0 0;text-align:right;font-size:20px;color:#4AD7C2;font-weight:700;border-top:2px solid #d4af37;">$${Number(total ?? 0).toFixed(2)}</td></tr>
    </table>
  </td></tr>
  <tr><td style="background:#1a1a1a;padding:32px 40px;text-align:center;">
    <h3 style="margin:0 0 12px;color:#D4AF37;font-size:22px;">Jagabans L.A.</h3>
    <p style="margin:0;font-size:14px;color:rgba(255,255,255,0.7);">Questions? <a href="mailto:orders@jagabansla.com" style="color:#4AD7C2;">orders@jagabansla.com</a></p>
  </td></tr>
</table></td></tr></table>
</body></html>`;

      EdgeRuntime.waitUntil(
        fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'Jagabans L.A. <info@jagabansla.com>',
            to: [customer_email],
            subject: `Order Confirmed #${orderNumber} - Jagabans L.A.`,
            html: emailHtml,
          }),
        })
          .then((r) => console.log('Customer email status:', r.status))
          .catch((e) => console.error('Customer email error:', e))
      );
    }

    // ── 8. Background: Uber Direct delivery ───────────────────────────────────
    if (order_type === 'delivery' && delivery_address) {
      const uberClientId     = Deno.env.get('UBER_CLIENT_ID');
      const uberClientSecret = Deno.env.get('UBER_CLIENT_SECRET');

      if (uberClientId && uberClientSecret) {
        EdgeRuntime.waitUntil((async () => {
          try {
            const accessToken = await getUberAccessToken(uberClientId, uberClientSecret);

            const manifestItems = Array.isArray(items) && items.length > 0
              ? items.map((item: any) => ({ name: item.name, quantity: Number(item.quantity ?? 1) }))
              : [{ name: `Order ${orderId.substring(0, 8).toUpperCase()}`, quantity: 1 }];

            const rawDropoff    = delivery_address_uber || delivery_address;
            const dropoffAddress = resolveDropoffAddress(rawDropoff);
            const pickupAddress  = resolvePickupAddress();

            const quoteIdField = uber_quote_id ? { quote_id: uber_quote_id } : {};

            const deliveryPayload = {
              ...quoteIdField,
              external_id:          orderId,
              pickup_name:          Deno.env.get('RESTAURANT_NAME') || 'Jagabans L.A.',
              pickup_phone_number:  Deno.env.get('RESTAURANT_PHONE') || '+18182106659',
              pickup_address:       pickupAddress,
              pickup_notes:         'Food order ready for pickup',
              dropoff_name:         customer_name || 'Customer',
              dropoff_phone_number: customer_phone || '+10000000000',
              dropoff_address:      dropoffAddress,
              dropoff_notes:        pickup_notes || '',
              manifest_items:       manifestItems,
              pickup_ready_dt:      new Date(Date.now() + 5 * 60 * 1000).toISOString(),
            };

            const delivery = await createUberDelivery(accessToken, deliveryPayload);
            console.log('Uber Direct delivery created:', delivery.id, '| status:', delivery.status);

            await supabase
              .from('orders')
              .update({
                uber_delivery_id:      delivery.id,
                uber_delivery_status:  delivery.status,
                uber_tracking_url:     delivery.tracking_url ?? null,
                uber_delivery_eta:     delivery.dropoff_eta ?? null,
                delivery_provider:     'uber',
                delivery_triggered_at: new Date().toISOString(),
                cancellation_deadline: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
                updated_at:            new Date().toISOString(),
              })
              .eq('id', orderId);

            console.log('Order updated with Uber delivery info');
          } catch (uberErr) {
            console.error('Uber Direct error (non-fatal):', uberErr instanceof Error ? uberErr.message : uberErr);
          }
        })());
      } else {
        console.warn('UBER credentials not set — delivery dispatch skipped for order:', orderId);
      }
    }

    console.log(`Square payment processed in ${Date.now() - startTime}ms | order: ${orderId}`);

    return new Response(
      JSON.stringify({ success: true, orderId, paymentId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err: any) {
    console.error('process-square-payment error:', err?.message ?? err);
    return new Response(
      JSON.stringify({ error: err?.message ?? 'Payment processing failed' }),
      { status: 500, headers: corsHeaders }
    );
  }
});
