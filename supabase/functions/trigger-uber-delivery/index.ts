import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ─────────────────────────────────────────────────────────────────────────────
// Types
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

interface CreateUberDeliveryRequest {
  order_id: string;
  customer_name: string;
  customer_phone: string;
  delivery_address: string;
  delivery_address_uber?: string;
  pickup_notes?: string;
  items: Array<{ name: string; quantity: number }>;
  uber_quote_id?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Address helpers
// ─────────────────────────────────────────────────────────────────────────────

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

  console.warn('[dropoff] Plain text address received — wrapping in UberAddress shell');
  const fallback: UberAddress = {
    street_address: [raw.trim(), ''],
    city: '',
    state: '',
    zip_code: '',
    country: 'US',
  };
  return JSON.stringify(fallback);
}

function resolvePickupAddress(): string {
  const structured = Deno.env.get('RESTAURANT_ADDRESS_UBER');
  if (structured) {
    if (parseUberAddress(structured)) {
      console.log('[pickup] Using RESTAURANT_ADDRESS_UBER (structured)');
      return structured;
    }
    console.warn('[pickup] RESTAURANT_ADDRESS_UBER is set but failed to parse — falling back');
  }

  const plain = Deno.env.get('RESTAURANT_ADDRESS');
  if (plain) {
    console.warn('[pickup] Using RESTAURANT_ADDRESS (plain text fallback)');
    const fallback: UberAddress = {
      street_address: [plain.trim(), ''],
      city: '',
      state: '',
      zip_code: '',
      country: 'US',
    };
    return JSON.stringify(fallback);
  }

  throw new Error('Neither RESTAURANT_ADDRESS_UBER nor RESTAURANT_ADDRESS is configured');
}

// ─────────────────────────────────────────────────────────────────────────────
// Uber Direct API
// ─────────────────────────────────────────────────────────────────────────────

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

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to get Uber access token: ${res.status} ${errorText}`);
  }

  const data = await res.json();
  return data.access_token as string;
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
// Handler
// ─────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: corsHeaders,
    });
  }

  try {
    // ── Env validation ──────────────────────────────────────────────────────
    const SUPABASE_URL             = Deno.env.get('SUPABASE_URL') ?? '';
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const uberClientId             = Deno.env.get('UBER_CLIENT_ID');
    const uberClientSecret         = Deno.env.get('UBER_CLIENT_SECRET');
    const uberCustomerId           = Deno.env.get('UBER_CUSTOMER_ID');

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ error: 'Server misconfigured: missing Supabase credentials' }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    if (!uberClientId || !uberClientSecret || !uberCustomerId) {
      return new Response(
        JSON.stringify({ error: 'Server misconfigured: missing Uber credentials' }),
        { status: 500, headers: corsHeaders }
      );
    }

    // ── Parse request body ──────────────────────────────────────────────────
    const body: CreateUberDeliveryRequest = await req.json();
    const {
      order_id,
      customer_name,
      customer_phone,
      delivery_address,
      delivery_address_uber,
      pickup_notes,
      items,
      uber_quote_id,
    } = body;

    if (!order_id)         throw new Error('Missing required field: order_id');
    if (!delivery_address) throw new Error('Missing required field: delivery_address');
    if (!customer_phone)   throw new Error('Missing required field: customer_phone');

    console.log(`[create-uber-delivery] order_id=${order_id} | quote_id=${uber_quote_id ?? '(none)'}`);

    // ── Resolve addresses ───────────────────────────────────────────────────
    const pickupAddress  = resolvePickupAddress();
    const rawDropoff     = delivery_address_uber || delivery_address;
    const dropoffAddress = resolveDropoffAddress(rawDropoff);

    console.log('[delivery] pickup structured:', !!parseUberAddress(pickupAddress));
    console.log('[delivery] dropoff structured:', !!parseUberAddress(dropoffAddress));

    // ── Build manifest ──────────────────────────────────────────────────────
    const manifestItems =
      items?.length > 0
        ? items.map((item) => ({ name: item.name, quantity: Number(item.quantity ?? 1) }))
        : [{ name: `Order ${order_id.substring(0, 8).toUpperCase()}`, quantity: 1 }];

    // ── Create delivery ─────────────────────────────────────────────────────
    const accessToken = await getUberAccessToken(uberClientId, uberClientSecret);

    const quoteIdField = uber_quote_id ? { quote_id: uber_quote_id } : {};

    const deliveryPayload = {
      ...quoteIdField,
      external_id:          order_id,
      pickup_name:          Deno.env.get('RESTAURANT_NAME') || 'Jagabans L.A.',
      pickup_phone_number:  Deno.env.get('RESTAURANT_PHONE') || '+18182106659',
      pickup_address:       pickupAddress,
      pickup_notes:         'Food order ready for pickup',
      dropoff_name:         customer_name || 'Customer',
      dropoff_phone_number: customer_phone,
      dropoff_address:      dropoffAddress,
      dropoff_notes:        pickup_notes || '',
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

    // ── Persist to orders table ─────────────────────────────────────────────
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { error: updateError } = await supabase
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
      .eq('id', order_id);

    if (updateError) {
      console.error('Failed to persist Uber delivery info:', updateError.message);
      // Non-fatal — delivery was created, just log it
    } else {
      console.log('Order updated with Uber delivery info');
    }

    return new Response(
      JSON.stringify({
        success: true,
        delivery_id:   delivery.id,
        status:        delivery.status,
        tracking_url:  delivery.tracking_url ?? null,
        dropoff_eta:   delivery.dropoff_eta ?? null,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('[create-uber-delivery] error:', err?.message ?? err);
    return new Response(
      JSON.stringify({ error: err?.message ?? 'Failed to create Uber delivery' }),
      { status: 500, headers: corsHeaders }
    );
  }
});