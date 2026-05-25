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
    if (userError || !user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json();
    const { nonce, squareCustomerId } = body as { nonce: string; squareCustomerId: string };

    if (!nonce || typeof nonce !== "string") return json({ error: "Invalid nonce" }, 400);
    if (!squareCustomerId || typeof squareCustomerId !== "string") {
      return json({ error: "squareCustomerId required" }, 400);
    }

    const squareAccessToken = Deno.env.get("SQUARE_ACCESS_TOKEN");
    if (!squareAccessToken) return json({ error: "Payment service not configured" }, 500);

    const squareEnv = Deno.env.get("SQUARE_ENVIRONMENT") || "sandbox";
    const squareBase = squareEnv === "production"
      ? "https://connect.squareup.com"
      : "https://connect.squareupsandbox.com";

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
    if (!sqResp.ok || !sqData?.card) {
      console.error("Square card save failed:", sqData);
      return json({ error: sqData?.errors?.[0]?.detail || "Failed to save card" }, 400);
    }

    const card = sqData.card;

    // Count existing cards to determine if this should be default
    const { count } = await supabaseAdmin
      .from("square_cards")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);

    const isDefault = (count ?? 0) === 0;

    const { data: savedCard, error: insertError } = await supabaseAdmin
      .from("square_cards")
      .insert({
        user_id: user.id,
        square_customer_id: squareCustomerId,
        square_card_id: card.id as string,
        card_brand: card.card_brand as string ?? "UNKNOWN",
        last_4: card.last_4 as string ?? "0000",
        exp_month: card.exp_month as number ?? 0,
        exp_year: card.exp_year as number ?? 0,
        cardholder_name: card.cardholder_name as string ?? null,
        is_default: isDefault,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Failed to persist square_cards record:", insertError);
      return json({ error: "Card saved in Square but failed to store locally" }, 500);
    }

    return json({ success: true, card: savedCard });
  } catch (err) {
    console.error("save-square-card error:", err);
    return json({ error: err instanceof Error ? err.message : "Unexpected error" }, 500);
  }
});
