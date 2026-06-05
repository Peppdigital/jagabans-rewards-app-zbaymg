import { createClient } from "npm:@supabase/supabase-js@2.46.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface PaymentRequest {
  sourceId: string;
  amount: number;         // cents — grand total (post-discount, post-tax, post-delivery)
  subtotal: number;       // cents — item subtotal only (pre-discount)
  taxAmount: number;      // cents — tax on discounted subtotal
  currency?: string;
  customer: {
    name: string;
    email: string;
    phone?: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    deliveryType?: "delivery" | "pickup";
    pickupDate?: string;
    pickupTime?: string;
    deliveryInstructions?: string;
  };
  items: Array<{
    id: string;
    name: string;
    quantity: number;
    price: number; // dollars
  }>;
  orderType?: "delivery" | "pickup";
  deliveryAddress?: string;
  pickupNotes?: string;
  deliveryQuoteId?: string | null;
  deliveryFee?: number;      // dollars
  deliveryFeeCents?: number; // cents
  discountAmount?: number;   // cents — server verifies against app_settings
  customerId?: string;       // Square customer ID — required when sourceId is a stored card
}

interface OrderEmailData {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  orderNumber: string;
  orderId: string;
  orderType: "delivery" | "pickup";
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  deliveryFee: number;
  total: number;
  items: Array<{ name: string; quantity: number; price: number }>;
  pickupNotes?: string;
  deliveryAddress?: string;
  deliveryInstructions?: string;
  pointsEarned?: number;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function looksLikeAnonKey(header: string | null) {
  if (!header) return false;
  const m = header.match(/^Bearer\s+(.+)$/i);
  if (!m) return false;
  const token = m[1];
  const envAnon = Deno.env.get("SUPABASE_ANON_KEY");
  if (envAnon && token === envAnon) return true;
  if (/anon/i.test(token)) return true;
  return false;
}

function deriveCustomerName(body: PaymentRequest, payment: unknown): string | null {
  const normalize = (s: unknown) =>
    typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, 200) : "";
  const hasDigits = (s: string) => /\d/.test(s);

  const fromBody = normalize(body?.customer?.name);
  if (fromBody && !hasDigits(fromBody)) return fromBody;

  const p = payment as Record<string, unknown> | null;
  const candidates = [
    p?.buyer_name ?? p?.buyerName,
    (() => {
      const ba = (p?.billing_address ?? p?.billingAddress) as Record<string, unknown> | undefined;
      return [ba?.first_name ?? ba?.firstName, ba?.last_name ?? ba?.lastName]
        .filter(Boolean)
        .join(" ")
        .trim();
    })(),
    ((p?.card_details ?? p?.cardDetails) as Record<string, unknown> | undefined)
      ?.card
      ? (((p?.card_details ?? p?.cardDetails) as Record<string, unknown>)
          .card as Record<string, unknown>)?.cardholder_name
      : undefined,
  ];
  for (const c of candidates) {
    const n = normalize(c);
    if (n && !hasDigits(n)) return n;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// Email helper
// ─────────────────────────────────────────────────────────────


async function sendEmail(to: string, subject: string, html: string, text: string) {
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const restaurantEmail = Deno.env.get("RESTAURANT_EMAIL") || "noreply@jagabans.com";

  if (!resendApiKey) {
    console.log("📧 [DEV] Email skipped (no RESEND_API_KEY):", { to, subject });
    return { success: true, id: "dev-" + Date.now() };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({ from: restaurantEmail, to, subject, html, text }),
    });
    if (!res.ok) {
      const err = await res.json();
      console.error("❌ Resend error:", err);
      return { success: false, error: err };
    }
    const data = await res.json();
    console.log("✅ Email sent:", data.id);
    return { success: true, id: data.id };
  } catch (err) {
    console.error("❌ Email send threw:", err);
    return { success: false, error: err };
  }
}

// ─────────────────────────────────────────────────────────────
// Uber Direct dispatch — delegates to trigger-uber-delivery
// ─────────────────────────────────────────────────────────────

interface UberDispatchResult {
  deliveryId: string;
  trackingUrl: string | null;
  status: string;
}

async function dispatchUberDelivery(
  orderId: string,
  orderItems: PaymentRequest["items"],
  customer: PaymentRequest["customer"],
  quoteId?: string | null
): Promise<UberDispatchResult> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";

  const deliveryAddressString = [
    customer.address,
    customer.city,
    customer.state,
    customer.zip,
  ]
    .filter(Boolean)
    .join(", ");

  const uberAddress = {
    street_address: [customer.address ?? "", ""],
    city:     customer.city    ?? "",
    state:    customer.state   ?? "",
    zip_code: customer.zip     ?? "",
    country:  "US",
  };

  const body: Record<string, unknown> = {
    order_id:              orderId,
    customer_name:         customer.name,
    customer_phone:        customer.phone ?? "",
    delivery_address:      deliveryAddressString,
    delivery_address_uber: JSON.stringify(uberAddress),
    pickup_notes:          customer.deliveryInstructions ?? "",
    items: orderItems.map((i) => ({ name: i.name, quantity: i.quantity })),
  };
  if (quoteId) body.uber_quote_id = quoteId;

  const res = await fetch(`${supabaseUrl}/functions/v1/trigger-uber-delivery`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""}`,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? "Uber Direct dispatch failed");

  return {
    deliveryId:  data.delivery_id,
    trackingUrl: data.tracking_url ?? null,
    status:      data.status ?? "unknown",
  };
}

// ─────────────────────────────────────────────────────────────
// Email templates
// ─────────────────────────────────────────────────────────────

function buildCustomerEmailHtml(d: OrderEmailData): string {
  const itemRows = d.items
    .map(
      (i) =>
        `<tr>
          <td style="padding:8px;text-align:left;">${i.name}</td>
          <td style="padding:8px;text-align:center;">×${i.quantity}</td>
          <td style="padding:8px;text-align:right;">$${i.price.toFixed(2)}</td>
        </tr>`
    )
    .join("");

  const discountRow =
    d.discountAmount > 0
      ? `<div class="total-row" style="color:#10b981"><span>Discount</span><span>−$${d.discountAmount.toFixed(2)}</span></div>`
      : "";

  const deliveryRow =
    d.orderType === "delivery" && d.deliveryFee > 0
      ? `<div class="total-row"><span>Delivery Fee</span><span>$${d.deliveryFee.toFixed(2)}</span></div>`
      : "";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <style>
    body{background:#f8f9fa;font-family:Arial,sans-serif;margin:0;padding:0}
    .container{max-width:600px;margin:40px auto;background:#fff;border-radius:8px;box-shadow:0 4px 6px rgba(0,0,0,.1);overflow:hidden}
    .header{background:linear-gradient(135deg,#1a1a1a,#2d2d2d);color:#fff;padding:40px;text-align:center;border-bottom:3px solid #f59e0b}
    .logo{font-size:28px;font-weight:300;letter-spacing:4px;margin-bottom:8px}
    .content{padding:30px}
    .success{background:#f0fdf4;border-left:4px solid #22c55e;padding:20px;margin:20px 0;border-radius:4px}
    .success-title{color:#16a34a;font-weight:600;margin-bottom:4px}
    .card{background:#f8fafc;border:1px solid #e2e8f0;padding:20px;margin:20px 0;border-radius:6px}
    .card-title{font-size:12px;font-weight:600;text-transform:uppercase;color:#64748b;margin-bottom:15px;letter-spacing:1px}
    .badge{display:inline-block;background:#dbeafe;color:#0369a1;padding:4px 12px;border-radius:20px;font-size:12px;margin-bottom:12px}
    .detail-row{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #e2e8f0}
    .detail-row:last-child{border-bottom:none}
    .label{color:#64748b;font-weight:500}
    .value{color:#1e293b;font-weight:600}
    .items-table{width:100%;margin:15px 0;border-collapse:collapse}
    .items-table th{background:#f1f5f9;padding:10px;text-align:left;font-size:12px;font-weight:600;border-bottom:2px solid #e2e8f0}
    .items-table td{padding:10px;border-bottom:1px solid #e2e8f0}
    .total-row{display:flex;justify-content:space-between;padding:6px 0;color:#475569}
    .grand-total{display:flex;justify-content:space-between;padding:12px 0;font-size:18px;font-weight:700;color:#f59e0b;border-top:1px solid #e2e8f0;margin-top:8px}
    .points{background:#fffbeb;border-left:4px solid #eab308;padding:15px;margin:15px 0;border-radius:4px;font-size:14px;color:#78350f}
    .btn{display:inline-block;background:#f59e0b;color:#fff;padding:12px 32px;text-decoration:none;border-radius:4px;font-weight:600}
    .footer{background:#1a1a1a;color:#9ca3af;padding:30px;text-align:center;font-size:12px}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">JAGABANS</div>
      <div style="font-size:13px;letter-spacing:2px">L.A. RESTAURANT</div>
    </div>
    <div class="content">
      <p style="color:#4a5568;margin-bottom:20px">Thank you for your order, <strong>${d.customerName}</strong>!</p>
      <div class="success">
        <div class="success-title">✓ Order Confirmed</div>
        <p style="margin:8px 0 0;font-size:13px;color:#16a34a">Order #${d.orderNumber}</p>
      </div>
      <div class="card">
        <div class="card-title">Order Details</div>
        <span class="badge">${d.orderType === "pickup" ? "🏪 Pickup" : "🚗 Delivery"}</span>
        <div class="detail-row"><span class="label">Order ID</span><span class="value">${d.orderId.substring(0, 8).toUpperCase()}</span></div>
        ${d.orderType === "pickup" && d.pickupNotes ? `<div class="detail-row"><span class="label">Pickup Time</span><span class="value">${d.pickupNotes}</span></div>` : ""}
        ${d.orderType === "delivery" && d.deliveryAddress ? `<div class="detail-row"><span class="label">Delivery To</span><span class="value" style="text-align:right">${d.deliveryAddress}</span></div>` : ""}
      </div>
      <div class="card">
        <div class="card-title">Items</div>
        <table class="items-table">
          <thead><tr><th>Item</th><th style="text-align:center">Qty</th><th style="text-align:right">Price</th></tr></thead>
          <tbody>${itemRows}</tbody>
        </table>
        <div style="border-top:2px solid #e2e8f0;margin-top:15px;padding-top:15px">
          <div class="total-row"><span>Subtotal</span><span>$${d.subtotal.toFixed(2)}</span></div>
          ${discountRow}
          <div class="total-row"><span>Tax</span><span>$${d.taxAmount.toFixed(2)}</span></div>
          ${deliveryRow}
          <div class="grand-total"><span>Total</span><span>$${d.total.toFixed(2)}</span></div>
        </div>
      </div>
      ${d.pointsEarned ? `<div class="points">👏 You earned <strong>${d.pointsEarned} loyalty points</strong> on this order!</div>` : ""}
      <div style="background:#faf5ff;border:1px solid #e9d5ff;padding:20px;text-align:center;margin:20px 0;border-radius:6px">
        <p style="font-size:14px;color:#7e22ce;margin-bottom:10px"><strong>Track Your Order</strong></p>
        <a href="https://jagabansla.com/order-confirmation?orderId=${d.orderId}" class="btn">View Status →</a>
      </div>
    </div>
    <div class="footer">
      <p>Jagabans L.A. Restaurant | 1423 W Pico Blvd, Los Angeles, CA 90015</p>
      <p style="margin-top:10px">📞 (818) 210-6659 | 📧 info@jagabansla.com</p>
    </div>
  </div>
</body>
</html>`;
}

function buildCustomerEmailText(d: OrderEmailData): string {
  const discountLine = d.discountAmount > 0 ? `Discount:  −$${d.discountAmount.toFixed(2)}\n` : "";
  const deliveryLine =
    d.orderType === "delivery" && d.deliveryFee > 0
      ? `Delivery:  $${d.deliveryFee.toFixed(2)}\n`
      : "";

  return `ORDER CONFIRMATION #${d.orderNumber}

Thank you, ${d.customerName}!

Order ID: ${d.orderId.substring(0, 8).toUpperCase()}
Type: ${d.orderType.toUpperCase()}
${d.orderType === "pickup" && d.pickupNotes ? `Pickup Time: ${d.pickupNotes}\n` : ""}${d.orderType === "delivery" && d.deliveryAddress ? `Delivery Address: ${d.deliveryAddress}\n` : ""}
ITEMS:
${d.items.map((i) => `${i.name} ×${i.quantity} ......... $${i.price.toFixed(2)}`).join("\n")}

Subtotal:  $${d.subtotal.toFixed(2)}
${discountLine}Tax:       $${d.taxAmount.toFixed(2)}
${deliveryLine}TOTAL:     $${d.total.toFixed(2)}
${d.pointsEarned ? `\nYou earned ${d.pointsEarned} loyalty points!\n` : ""}
Track: https://jagabansla.com/order-confirmation?orderId=${d.orderId}

(818) 210-6659 | info@jagabansla.com`;
}

function buildAdminEmailHtml(d: OrderEmailData): string {
  const itemRows = d.items
    .map(
      (i) =>
        `<tr>
          <td style="padding:8px">${i.name}</td>
          <td style="padding:8px;text-align:center">×${i.quantity}</td>
          <td style="padding:8px;text-align:right">$${i.price.toFixed(2)}</td>
        </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body{font-family:Arial,sans-serif;background:#f4f4f4}
    .container{max-width:600px;margin:20px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 4px rgba(0,0,0,.1)}
    .header{background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;padding:30px;text-align:center}
    .alert{background:#fffbeb;border-left:4px solid #f59e0b;padding:20px;margin:20px}
    .detail-row{padding:10px 0;border-bottom:1px solid #e5e7eb;display:flex;justify-content:space-between}
    .label{font-weight:700;color:#d97706}
    .items-table{width:calc(100% - 40px);margin:0 20px 20px;border-collapse:collapse}
    .items-table th{background:#f3f4f6;padding:8px;text-align:left;font-weight:700;border-bottom:2px solid #d97706}
    .items-table td{padding:8px;border-bottom:1px solid #e5e7eb}
    .totals{padding:0 20px 20px}
    .total-row{display:flex;justify-content:space-between;padding:4px 0;color:#6b7280;font-size:14px}
    .grand{font-weight:700;font-size:16px;color:#d97706;border-top:2px solid #d97706;margin-top:8px;padding-top:8px}
    .btn{display:inline-block;background:#f59e0b;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;margin:20px;font-weight:700}
    .footer{background:#f9fafb;padding:20px;text-align:center;color:#6b7280;font-size:12px;border-top:1px solid #e5e7eb}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin:0">🔔 New Order Alert</h1>
      <p style="margin:8px 0 0">#${d.orderNumber}</p>
    </div>
    <div class="alert">
      <div class="detail-row"><span class="label">Customer</span><span>${d.customerName}</span></div>
      <div class="detail-row"><span class="label">Email</span><span>${d.customerEmail}</span></div>
      <div class="detail-row"><span class="label">Phone</span><span>${d.customerPhone}</span></div>
      <div class="detail-row"><span class="label">Type</span><span><strong>${d.orderType === "pickup" ? "🏪 PICKUP" : "🚗 DELIVERY"}</strong></span></div>
      ${d.orderType === "pickup" && d.pickupNotes ? `<div class="detail-row"><span class="label">Pickup</span><span>${d.pickupNotes}</span></div>` : ""}
      ${d.orderType === "delivery" && d.deliveryAddress ? `<div class="detail-row"><span class="label">Delivery</span><span>${d.deliveryAddress}</span></div>` : ""}
      ${d.deliveryInstructions ? `<div class="detail-row" style="flex-direction:column"><span class="label">Instructions</span><span style="margin-top:6px">${d.deliveryInstructions}</span></div>` : ""}
    </div>
    <table class="items-table">
      <thead><tr><th>Item</th><th style="text-align:center">Qty</th><th style="text-align:right">Price</th></tr></thead>
      <tbody>${itemRows}</tbody>
    </table>
    <div class="totals">
      <div class="total-row"><span>Subtotal</span><span>$${d.subtotal.toFixed(2)}</span></div>
      ${d.discountAmount > 0 ? `<div class="total-row" style="color:#10b981"><span>Discount</span><span>−$${d.discountAmount.toFixed(2)}</span></div>` : ""}
      <div class="total-row"><span>Tax</span><span>$${d.taxAmount.toFixed(2)}</span></div>
      ${d.orderType === "delivery" && d.deliveryFee > 0 ? `<div class="total-row"><span>Delivery Fee</span><span>$${d.deliveryFee.toFixed(2)}</span></div>` : ""}
      <div class="total-row grand"><span>Total</span><span>$${d.total.toFixed(2)}</span></div>
    </div>
    <a href="https://jagabansla.com/admin/dashboard#orders" class="btn">Manage Order →</a>
    <div class="footer">Jagabans L.A. Admin System — Automated Notification</div>
  </div>
</body>
</html>`;
}

function buildAdminEmailText(d: OrderEmailData): string {
  return `🔔 NEW ORDER #${d.orderNumber}

Customer: ${d.customerName}
Email:    ${d.customerEmail}
Phone:    ${d.customerPhone}
Type:     ${d.orderType.toUpperCase()}
${d.orderType === "pickup" && d.pickupNotes ? `Pickup:   ${d.pickupNotes}\n` : ""}${d.orderType === "delivery" && d.deliveryAddress ? `Delivery: ${d.deliveryAddress}\n` : ""}${d.deliveryInstructions ? `Notes:    ${d.deliveryInstructions}\n` : ""}
ITEMS:
${d.items.map((i) => `${i.name} ×${i.quantity} ...... $${i.price.toFixed(2)}`).join("\n")}

Subtotal: $${d.subtotal.toFixed(2)}
${d.discountAmount > 0 ? `Discount: −$${d.discountAmount.toFixed(2)}\n` : ""}Tax:      $${d.taxAmount.toFixed(2)}
${d.orderType === "delivery" && d.deliveryFee > 0 ? `Delivery: $${d.deliveryFee.toFixed(2)}\n` : ""}TOTAL:    $${d.total.toFixed(2)}

Manage: https://jagabansla.com/admin/dashboard#orders`;
}

// ─────────────────────────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────────────────────────

console.info("process-square-payment started");

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // ── Auth setup ────────────────────────────────────────────────────────

    const authHeader = req.headers.get("Authorization");
    const hasBearer = !!authHeader && authHeader.toLowerCase().startsWith("bearer ");
    const skipUserLookup = looksLikeAnonKey(authHeader);

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      hasBearer && !skipUserLookup
        ? { global: { headers: { Authorization: authHeader! } } }
        : undefined
    );

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    let userId: string | null = null;
    if (hasBearer && !skipUserLookup) {
      const { data, error } = await supabaseUser.auth.getUser();
      if (data?.user && !error) userId = data.user.id;
    }

    // ── Parse body ────────────────────────────────────────────────────────

    const body: PaymentRequest = await req.json();
    const {
      sourceId,
      amount,
      subtotal,
      taxAmount,
      currency = "USD",
      customer,
      items,
      deliveryQuoteId,
      deliveryFeeCents: clientDeliveryFeeCents,
      discountAmount:   clientDiscountCents,
      customerId,
    } = body;

    const orderType: "delivery" | "pickup" =
      body.orderType ?? customer?.deliveryType ?? "delivery";

    const deliveryAddress =
      body.deliveryAddress ??
      (orderType === "delivery" && customer?.address
        ? [customer.address, customer.city, customer.state, customer.zip]
            .filter(Boolean)
            .join(", ")
        : undefined);

    const pickupNotes =
      body.pickupNotes ??
      (orderType === "pickup" && (customer?.pickupDate || customer?.pickupTime)
        ? `${customer.pickupDate ?? ""} ${customer.pickupTime ?? ""}`.trim() || undefined
        : undefined);

    // ── Basic field validation ────────────────────────────────────────────

    if (!sourceId || typeof sourceId !== "string")
      return json({ error: "Invalid sourceId" }, 400);
    if (!Number.isInteger(amount) || amount <= 0)
      return json({ error: "Invalid amount (must be positive integer cents)" }, 400);
    if (!Number.isInteger(subtotal) || subtotal <= 0)
      return json({ error: "Invalid subtotal (must be positive integer cents)" }, 400);
    if (!Number.isInteger(taxAmount) || taxAmount < 0)
      return json({ error: "Invalid taxAmount (must be non-negative integer cents)" }, 400);
    if (!Array.isArray(items) || items.length === 0)
      return json({ error: "No items" }, 400);
    if (orderType === "delivery" && !deliveryAddress)
      return json({ error: "Delivery address required for delivery orders" }, 400);
    if (orderType === "pickup" && (!customer?.pickupDate || !customer?.pickupTime))
      return json({ error: "Pickup date and time required for pickup orders" }, 400);

    // ── Fetch app_settings for server-side discount verification ──────────
    //
    // The discount must be recomputed server-side from the canonical settings
    // row. The client figure is only used to detect stale-UI mismatches.

    const { data: configRows, error: configErr } = await supabaseAdmin
      .from("app_config")
      .select("key, value")
      .in("key", ["discount_enabled", "discount_percentage", "points_enabled"]);

    if (configErr) {
      console.error("app_config fetch failed:", configErr.message);
      return json({ error: "Could not load discount settings" }, 500);
    }

    const configMap = Object.fromEntries(
      (configRows ?? []).map((r) => [r.key, r.value])
    );

    const serverDiscountEnabled    = configMap["discount_enabled"] === true
                                  || configMap["discount_enabled"] === "true";
    const serverDiscountPercentage = Number(configMap["discount_percentage"]) || 10;
    const serverPointsEnabled      = configMap["points_enabled"] === true
                                  || configMap["points_enabled"] === "true";

    const effectiveDiscountCents = serverDiscountEnabled
      ? Math.round((subtotal * serverDiscountPercentage) / 100)
      : 0;

    // Reject if client discount doesn't match server (±1¢ rounding tolerance)
    const incomingDiscountCents = clientDiscountCents ?? 0;
    if (Math.abs(incomingDiscountCents - effectiveDiscountCents) > 1) {
      console.error(
        `Discount mismatch: client=${incomingDiscountCents}¢ server=${effectiveDiscountCents}¢ ` +
        `(enabled=${serverDiscountEnabled} pct=${serverDiscountPercentage})`
      );
      return json({ error: "Discount mismatch. Please refresh and try again." }, 400);
    }

    // ── Pickup delivery fee guard ─────────────────────────────────────────
    //
    // Pickup orders must never carry a delivery fee regardless of what the
    // client sent — catches the in-flight quote race condition and future
    // client regressions.

    const effectiveDeliveryFeeCents =
      orderType === "pickup" ? 0 : Math.max(0, clientDeliveryFeeCents ?? 0);

    // ── Server-side amount recomputation ──────────────────────────────────
    //
    // Never charge the client-supplied `amount` directly. Recompute from
    // verified components and reject if the discrepancy exceeds 1¢.

    const discountedSubtotalCents = subtotal - effectiveDiscountCents;
    const expectedAmount = Math.max(
      0,
      discountedSubtotalCents + taxAmount + effectiveDeliveryFeeCents
    );

    if (Math.abs(amount - expectedAmount) > 1) {
      console.error(
        `Amount mismatch: client=${amount}¢ server=${expectedAmount}¢ ` +
        `(subtotal=${subtotal} discount=${effectiveDiscountCents} tax=${taxAmount} ` +
        `deliveryFee=${effectiveDeliveryFeeCents} orderType=${orderType})`
      );
      return json(
        {
          error: "Amount mismatch",
          message:
            `Client sent ${amount}¢ but server computed ${expectedAmount}¢. ` +
            `Please refresh and try again.`,
        },
        400
      );
    }

    // All downstream operations use the server-computed charge amount.
    const chargeAmount = expectedAmount;

    const totalDollars       = +(chargeAmount / 100).toFixed(2);
    const subtotalDollars    = +(subtotal / 100).toFixed(2);
    const taxDollars         = +(taxAmount / 100).toFixed(2);
    const discountDollars    = +(effectiveDiscountCents / 100).toFixed(2);
    const deliveryFeeDollars = +(effectiveDeliveryFeeCents / 100).toFixed(2);

    // ── Charge Square ─────────────────────────────────────────────────────

    const squareAccessToken = Deno.env.get("SQUARE_ACCESS_TOKEN");
    if (!squareAccessToken)
      return json({ error: "Payment service not configured" }, 500);

    const squareEnv  = Deno.env.get("SQUARE_ENVIRONMENT") || "sandbox";
    const squareBase =
      squareEnv === "production"
        ? "https://connect.squareup.com"
        : "https://connect.squareupsandbox.com";

    const idempotencyKey = crypto.randomUUID();
    const sqResp = await fetch(`${squareBase}/v2/payments`, {
      method: "POST",
      headers: {
        "Square-Version": "2024-08-15",
        Authorization: `Bearer ${squareAccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source_id:       sourceId,
        idempotency_key: idempotencyKey,
        amount_money:    { amount: chargeAmount, currency },
        location_id:     Deno.env.get("SQUARE_LOCATION_ID"),
        ...(customerId ? { customer_id: customerId } : {}),
        note: customer?.name
          ? `${orderType === "pickup" ? "Pickup" : "Delivery"} order — ${customer.name}`
          : undefined,
      }),
    });

    const sqData = await sqResp.json();
    if (!sqResp.ok || !sqData?.payment)
      return json(
        { error: sqData?.errors?.[0]?.detail || "Payment failed", details: sqData?.errors },
        400
      );

    const payment = sqData.payment;

    // ── Status maps ───────────────────────────────────────────────────────

    const sqStatusMap: Record<string, "pending" | "succeeded" | "failed" | "refunded" | "canceled"> = {
      COMPLETED: "succeeded",
      APPROVED:  "pending",
      CANCELED:  "canceled",
      FAILED:    "failed",
      REFUNDED:  "refunded",
    };

    const ordersPaymentStatusMap: Record<string, "pending" | "processing" | "succeeded" | "failed" | "canceled"> = {
      COMPLETED: "succeeded",
      APPROVED:  "processing",
      CANCELED:  "canceled",
      FAILED:    "failed",
      REFUNDED:  "succeeded",
    };

    const sqPaymentStatus     = sqStatusMap[payment.status as string]            ?? "pending";
    const ordersPaymentStatus = ordersPaymentStatusMap[payment.status as string] ?? "pending";

    // ── Persist square_payments ───────────────────────────────────────────

    const { data: paymentRow, error: payErr } = await supabaseAdmin
      .from("square_payments")
      .insert({
        user_id:           userId,
        order_id:          null as string | null,
        square_payment_id: payment.id as string,
        square_order_id:   payment.order_id ?? null,
        amount:            totalDollars,
        currency,
        status:            sqPaymentStatus,
        payment_method:    payment.card_details?.card?.card_brand ?? null,
        receipt_url:       payment.receipt_url ?? null,
        error_message:     null as string | null,
        metadata: {
          customer,
          items,
          orderType,
          discountAmount: discountDollars,
          deliveryFee:    deliveryFeeDollars,
        } as unknown,
      })
      .select("id, status, receipt_url")
      .single();

    if (payErr) {
      console.error("square_payments insert failed:", payErr);
      return json({ error: "Failed to save payment", details: payErr }, 400);
    }

    // ── Persist order ─────────────────────────────────────────────────────

    // Points are earned on the post-discount food subtotal only —
    // tax and delivery fee are excluded from the reward base.
    const pointsEarned = (userId && serverPointsEnabled) ? Math.floor(discountedSubtotalCents / 100) : 0;
    const customerName = deriveCustomerName(body, payment);

    const { data: orderRow, error: orderErr } = await supabaseAdmin
      .from("orders")
      .insert({
        user_id:           userId,
        total:             totalDollars,
        subtotal:          subtotalDollars,
        tax:               taxDollars,
        discount:   discountDollars,
        points_earned:     pointsEarned,
        status:            "pending",
        order_type:        orderType,
        delivery_address:  orderType === "delivery" ? deliveryAddress : null,
        pickup_notes:      orderType === "pickup"   ? pickupNotes     : null,
        payment_id:        sourceId,
        customer_name:     customerName ?? null,
        payment_status:    ordersPaymentStatus,
        delivery_provider: orderType === "delivery" ? "uber" : null,
        delivery_fee:      deliveryFeeDollars,
      })
      .select("id, order_number")
      .single();

    if (orderErr) {
      await supabaseAdmin
        .from("square_payments")
        .update({ error_message: "Order insert failed" })
        .eq("id", paymentRow.id);
      console.error("orders insert failed:", orderErr);
      return json({ error: "Failed to save order", details: orderErr }, 400);
    }

    await supabaseAdmin
      .from("square_payments")
      .update({ order_id: orderRow.id })
      .eq("id", paymentRow.id);

    // ── Persist order_items ───────────────────────────────────────────────

    const { error: itemsErr } = await supabaseAdmin.from("order_items").insert(
      items.map((i) => ({
        order_id:     orderRow.id,
        menu_item_id: isNaN(Number(i.id)) ? null : Number(i.id),
        name:         i.name,
        quantity:     i.quantity,
        price:        +(+i.price).toFixed(2),
      }))
    );
    if (itemsErr) {
      await supabaseAdmin
        .from("square_payments")
        .update({ error_message: "Order items insert failed" })
        .eq("id", paymentRow.id);
      console.error("order_items insert failed:", itemsErr);
    }

    // ── Loyalty points + notification ─────────────────────────────────────

    if (userId && pointsEarned > 0) {
      const { error: ptsErr } = await supabaseAdmin.rpc("increment_user_points", {
        user_id_param: userId,
        points_to_add: pointsEarned,
      });
      if (ptsErr) console.error("increment_user_points failed:", ptsErr);

      await supabaseAdmin.from("notifications").insert({
        user_id: userId,
        title:   "Order Placed Successfully",
        message: `Your ${orderType} order #${orderRow.order_number} has been placed. You earned ${pointsEarned} points!`,
        type:    "order",
        read:    false,
      });
    }

    // ── Uber Direct dispatch ──────────────────────────────────────────────

    let trackingUrl: string | null           = null;
    let deliveryId:  string | null           = null;
    let deliveryDispatchError: string | null = null;

    if (orderType === "delivery" && deliveryAddress) {
      try {
        const uberResult = await dispatchUberDelivery(
          orderRow.id,
          items,
          customer,
          deliveryQuoteId
        );
        trackingUrl = uberResult.trackingUrl;
        deliveryId  = uberResult.deliveryId;

        await supabaseAdmin
          .from("orders")
          .update({
            uber_delivery_id:      deliveryId,
            uber_tracking_url:     trackingUrl,
            uber_delivery_status:  uberResult.status,
            delivery_triggered_at: new Date().toISOString(),
          })
          .eq("id", orderRow.id);

        console.log(`✅ Uber delivery dispatched: ${deliveryId}`);
      } catch (uberErr) {
        const msg = uberErr instanceof Error ? uberErr.message : "Dispatch failed";
        deliveryDispatchError = msg;
        console.error("❌ Uber dispatch failed:", msg);

        await supabaseAdmin
          .from("orders")
          .update({ uber_delivery_status: "dispatch_failed" })
          .eq("id", orderRow.id);
      }
    }

    // ── Emails ────────────────────────────────────────────────────────────

    const emailData: OrderEmailData = {
      customerName:         customer.name,
      customerEmail:        customer.email,
      customerPhone:        customer.phone ?? "Not provided",
      orderNumber:          orderRow.order_number.toString(),
      orderId:              orderRow.id,
      orderType,
      subtotal:             subtotalDollars,
      discountAmount:       discountDollars,
      taxAmount:            taxDollars,
      deliveryFee:          deliveryFeeDollars,
      total:                totalDollars,
      items,
      pickupNotes:          orderType === "pickup"   ? pickupNotes     : undefined,
      deliveryAddress:      orderType === "delivery" ? deliveryAddress : undefined,
      deliveryInstructions: customer.deliveryInstructions,
      pointsEarned,
    };

    await sendEmail(
      customer.email,
      `Order Confirmation #${orderRow.order_number} — Jagabans L.A.`,
      buildCustomerEmailHtml(emailData),
      buildCustomerEmailText(emailData)
    ).catch((e) => console.error("Customer email failed:", e));

    const adminEmail = Deno.env.get("RESTAURANT_EMAIL") ?? "";
    if (adminEmail && adminEmail !== customer.email) {
      await sendEmail(
        adminEmail,
        `🔔 New Order #${orderRow.order_number} — ${customer.name}`,
        buildAdminEmailHtml(emailData),
        buildAdminEmailText(emailData)
      ).catch((e) => console.error("Admin email failed:", e));
    }

    // ── Response ──────────────────────────────────────────────────────────

    return json({
      success:               true,
      orderId:               orderRow.id,
      orderNumber:           orderRow.order_number,
      paymentId:             payment.id,
      orderStatus:           payment.status,
      pointsEarned,
      mode:                  userId ? "user" : "guest",
      skipped_user_lookup:   skipUserLookup,
      trackingUrl,
      deliveryId,
      deliveryDispatchError,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Unhandled error:", message);
    return json({ error: "Internal server error", message }, 500);
  }
});