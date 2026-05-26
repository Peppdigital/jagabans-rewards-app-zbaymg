import { createClient } from "npm:@supabase/supabase-js@2.46.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.toLowerCase().startsWith("bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    console.log("[save-square-card] auth:", { userId: user?.id, userError });
    if (userError || !user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json();
    const { nonce, squareCustomerId } = body as { nonce: string; squareCustomerId: string };
    console.log("[save-square-card] body:", { hasNonce: !!nonce, nonceLength: nonce?.length, squareCustomerId });

    if (!nonce || typeof nonce !== "string") return json({ error: "Invalid nonce" }, 400);
    if (!squareCustomerId || typeof squareCustomerId !== "string") {
      return json({ error: "squareCustomerId required" }, 400);
    }

    const squareAccessToken = Deno.env.get("SQUARE_ACCESS_TOKEN");
    const squareEnv = Deno.env.get("SQUARE_ENVIRONMENT");
    console.log("[save-square-card] Square config:", { hasToken: !!squareAccessToken, env: squareEnv });
    if (!squareAccessToken) return json({ error: "Payment service not configured" }, 500);

    const squareBase = squareEnv === "production"
      ? "https://connect.squareup.com"
      : "https://connect.squareupsandbox.com";

    console.log("[save-square-card] calling Square /v2/cards");
    const sqResp = await fetch(`${squareBase}/v2/cards`, {
      method: "POST",
      headers: {
        "Square-Version": "2024-08-15",
        Authorization: `Bearer ${squareAccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        idempotency_key: crypto.randomUUID(),
        source_id: nonce,
        card: { customer_id: squareCustomerId },
      }),
    });

    const sqData = await sqResp.json();
    console.log("[save-square-card] Square /v2/cards response:", { status: sqResp.status, ok: sqResp.ok, card: sqData?.card?.id, errors: sqData?.errors });
    if (!sqResp.ok || !sqData?.card) {
      console.error("[save-square-card] Square card save failed:", sqData);

      const errorCode = sqData?.errors?.[0]?.code;
      if (errorCode === "CUSTOMER_NOT_FOUND") {
        // Stale square_customer_id in DB — clear it so next attempt re-creates the customer
        await supabaseAdmin
          .from("user_profiles")
          .update({ square_customer_id: null })
          .eq("user_id", user.id);
        console.log("[save-square-card] cleared stale square_customer_id from user_profiles");
        return json({ error: "Customer record expired. Please try again." }, 400);
      }

      return json({ error: sqData?.errors?.[0]?.detail || "Failed to save card" }, 400);
    }

    const card = sqData.card;
    console.log("[save-square-card] card details:", { id: card.id, brand: card.card_brand, last4: card.last_4, expMonth: card.exp_month, expYear: card.exp_year });

    const { count } = await supabaseAdmin
      .from("payment_methods")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);

    const isDefault = (count ?? 0) === 0;
    const expMonth = (card.exp_month as number) ?? 0;
    const expYear = (card.exp_year as number) ?? 0;

    const insertPayload = {
      user_id: user.id,
      stripe_customer_id: squareCustomerId,
      stripe_payment_method_id: card.id as string,
      brand: (card.card_brand as string) ?? "UNKNOWN",
      last4: (card.last_4 as string) ?? "0000",
      exp_month: expMonth,
      exp_year: expYear,
      expiry_date: `${String(expMonth).padStart(2, "0")}/${expYear}`,
      cardholder_name: (card.cardholder_name as string) ?? "",
      type: "credit",
      is_default: isDefault,
    };
    console.log("[save-square-card] inserting to payment_methods:", insertPayload);

    const { data: savedCard, error: insertError } = await supabaseAdmin
      .from("payment_methods")
      .insert(insertPayload)
      .select()
      .single();

    console.log("[save-square-card] insert result:", { savedCardId: savedCard?.id, insertError });
    if (insertError) {
      console.error("[save-square-card] Failed to persist payment_methods record:", insertError);
      return json({ error: "Card saved in Square but failed to store locally" }, 500);
    }

    console.log("[save-square-card] success, returning card");
    return json({ success: true, card: savedCard });
  } catch (err) {
    console.error("save-square-card error:", err);
    return json({ error: err instanceof Error ? err.message : "Unexpected error" }, 500);
  }
});
