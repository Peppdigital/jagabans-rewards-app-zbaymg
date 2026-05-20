// supabase/functions/mint_guest_order_token/index.ts
import { createClient } from "npm:@supabase/supabase-js@2.46.1";

const ALLOWED_ORIGINS = new Set<string>([
  'http://localhost:3000',
  'https://jagabansla.com',
  'https://www.jagabansla.com',
]);

function buildCorsHeaders(origin?: string) {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : '*';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

function json(payload: unknown, status = 200, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

console.info('get_guest_order function started');

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin') ?? undefined;
  const corsHeaders = buildCorsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405, corsHeaders);
  }

  try {
    const { order_id } = await req.json();

    if (!order_id || typeof order_id !== 'string') {
      return json({ error: 'order_id is required and must be a string' }, 400, corsHeaders);
    }

    // Create admin client to bypass RLS
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Fetch the order
    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .select("*")
      .eq("id", order_id)
      .single();

    if (orderError || !order) {
      console.error('Order fetch error:', orderError);
      return json({ error: "Order not found" }, 404, corsHeaders);
    }

    // Fetch order items
    const { data: items, error: itemsError } = await supabaseAdmin
      .from("order_items")
      .select("*")
      .eq("order_id", order_id);

    if (itemsError) {
      console.error('Order items fetch error:', itemsError);
      return json({ error: "Failed to fetch order items" }, 500, corsHeaders);
    }

    // Fetch payment info
    const { data: payment } = await supabaseAdmin
      .from("square_payments")
      .select("status, receipt_url, metadata")
      .eq("order_id", order_id)
      .single();

    // Extract customer info from payment metadata
    const customerData = payment?.metadata as any;
    const customer = customerData?.customer || {};

    // Parse delivery address
    const addressParts = order.delivery_address?.split(", ") || [];
    const [address = "", city = "", state = "", zip = ""] = addressParts;

    // Format response to match frontend expectations
    const orderDetails = {
      id: order.id,
      customer_name: customer.name || "Guest",
      customer_email: customer.email || "",
      customer_phone: customer.phone || "",
      customer_address: address,
      customer_city: city,
      customer_state: state,
      customer_zip: zip,
      total_amount: order.total,
      payment_status: payment?.status || "pending",
      order_status: order.status,
      items: items?.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        price: item.price,
      })) || [],
      created_at: order.created_at,
      order_number: order.order_number,
      receipt_url: payment?.receipt_url || null,
    };

    return json({ order: orderDetails }, 200, corsHeaders);
  } catch (err) {
    console.error('get_guest_order error:', err);
    return json(
      { error: 'Internal server error', message: err instanceof Error ? err.message : 'Unknown error' },
      500,
      corsHeaders
    );
  }
});