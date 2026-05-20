import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-uber-signature',
};

/**
 * Verify Uber webhook signature using HMAC SHA256
 * Uber sends a hex-encoded signature, not base64
 */
async function verifyUberSignature(
  rawBody: string,
  signature: string,
  clientSecret: string
): Promise<boolean> {
  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(clientSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );

  // FIX: Uber sends hex, not base64
  const signatureBytes = new Uint8Array(
    signature.match(/.{2}/g)!.map((byte) => parseInt(byte, 16))
  );

  return crypto.subtle.verify(
    'HMAC',
    key,
    signatureBytes,
    encoder.encode(rawBody)
  );
}

/**
 * Fetch OAuth token from Uber
 * Supports sandbox and production via UBER_ENV env var
 */
async function getUberAccessToken(
  clientId: string,
  clientSecret: string
): Promise<string> {
  const isProduction = Deno.env.get('UBER_ENV') === 'production';
  const baseUrl = isProduction
    ? 'https://auth.uber.com'
    : 'https://sandbox-login.uber.com';

  const res = await fetch(`${baseUrl}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
      // FIX: align scope with stripe-webhook function
      scope: 'eats.deliveries direct.organizations',
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Uber OAuth failed: ${err}`);
  }

  const data = await res.json();
  return data.access_token;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const uberClientId     = Deno.env.get('UBER_CLIENT_ID');
    const uberClientSecret = Deno.env.get('UBER_CLIENT_SECRET');

    if (!uberClientId || !uberClientSecret) {
      throw new Error('Uber credentials not configured');
    }

    // ── Verify webhook signature ──────────────────────────────────────────────
    const signature = req.headers.get('X-Uber-Signature');
    if (!signature) {
      return new Response('Missing Uber signature', { status: 401 });
    }

    const rawBody = await req.text();

    const isValid = await verifyUberSignature(rawBody, signature, uberClientSecret);
    if (!isValid) {
      return new Response('Invalid Uber signature', { status: 401 });
    }

    const event = JSON.parse(rawBody);
    console.log('Uber webhook event type:', event?.meta?.status ?? event?.kind ?? '<unknown>');

    const deliveryId = event?.meta?.resource_id;
    if (!deliveryId) {
      throw new Error('Missing delivery ID in webhook payload');
    }

    // ── Get Uber token ────────────────────────────────────────────────────────
    const accessToken = await getUberAccessToken(uberClientId, uberClientSecret);

    // ── Fetch delivery details ────────────────────────────────────────────────
    const isProduction = Deno.env.get('UBER_ENV') === 'production';
    const apiBaseUrl   = isProduction
      ? 'https://api.uber.com'
      : 'https://sandbox-api.uber.com';

    const deliveryRes = await fetch(
      `${apiBaseUrl}/v1/deliveries/${deliveryId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!deliveryRes.ok) {
      const err = await deliveryRes.text();
      throw new Error(`Failed to fetch delivery: ${err}`);
    }

    const delivery = await deliveryRes.json();
    console.log('Uber delivery status:', delivery.status);

    // ── Supabase client ───────────────────────────────────────────────────────
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // ── Normalize Uber status → order status ─────────────────────────────────
    // FIX: added pickup_ready → ready to align with stripe-webhook dispatch status
    const statusMap: Record<string, string> = {
      created:             'preparing',
      pickup_ready:        'ready',
      courier_assigned:    'driver_assigned',
      en_route_to_pickup:  'on_the_way',
      at_pickup:           'picked_up',
      en_route_to_dropoff: 'on_the_way',
      delivered:           'completed',
      canceled:            'canceled',
    };

    const normalizedStatus = statusMap[delivery.status] ?? delivery.status;

    // ── Build update payload ──────────────────────────────────────────────────
    const updatePayload: Record<string, unknown> = {
      uber_delivery_status: delivery.status,
      status:               normalizedStatus,
      uber_tracking_url:    delivery.tracking_url ?? null,
      uber_delivery_eta:    delivery.dropoff_eta ?? null,
      updated_at:           new Date().toISOString(),
    };

    if (delivery.courier) {
      updatePayload.uber_courier_name     = delivery.courier.name ?? null;
      updatePayload.uber_courier_phone    = delivery.courier.phone_number ?? null;
      updatePayload.uber_courier_location = delivery.courier.location ?? null;
    }

    if (delivery.proof_of_delivery) {
      updatePayload.uber_proof_of_delivery = delivery.proof_of_delivery;
    }

    // ── Update order ──────────────────────────────────────────────────────────
    const { data: order, error } = await supabase
      .from('orders')
      .update(updatePayload)
      .eq('uber_delivery_id', deliveryId)
      .select('id, user_id, order_number')
      .single();

    if (error || !order) {
      throw new Error(`Order not found for delivery ${deliveryId}: ${error?.message ?? 'no record'}`);
    }

    console.log('Order updated:', order.id, '→', normalizedStatus);

    // ── User notification ─────────────────────────────────────────────────────
    const messages: Record<string, string> = {
      driver_assigned: 'A driver has been assigned to your order.',
      picked_up:       'Your order has been picked up.',
      on_the_way:      'Your order is on the way!',
      completed:       'Your order has been delivered. Enjoy!',
      canceled:        'Your delivery was canceled. Please contact support.',
    };

    const message = messages[normalizedStatus];
    if (message) {
      // FIX: guard against null order_number
      const orderLabel = order.order_number
        ? `#${order.order_number}`
        : `#${String(order.id).substring(0, 8).toUpperCase()}`;

      const { error: notifError } = await supabase
        .from('notifications')
        .insert({
          user_id:    order.user_id,
          title:      `Order ${orderLabel}`,
          message,
          type:       'order',
          action_url: '/order-history',
        });

      if (notifError) {
        console.error('Failed to insert notification:', notifError.message);
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('Uber webhook error:', err?.message ?? err);
    return new Response(JSON.stringify({ error: err?.message ?? 'Webhook processing failed' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});