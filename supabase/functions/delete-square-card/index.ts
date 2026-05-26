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

    const { squareCardId } = await req.json() as { squareCardId: string };
    if (!squareCardId) return json({ error: "squareCardId required" }, 400);

    const { data: card, error: fetchError } = await supabaseAdmin
      .from("payment_methods")
      .select("id, stripe_payment_method_id, is_default")
      .eq("stripe_payment_method_id", squareCardId)
      .eq("user_id", user.id)
      .single();

    if (fetchError || !card) return json({ error: "Card not found" }, 404);

    const squareAccessToken = Deno.env.get("SQUARE_ACCESS_TOKEN");
    if (!squareAccessToken) return json({ error: "Payment service not configured" }, 500);

    const squareBase = Deno.env.get("SQUARE_ENVIRONMENT") === "production"
      ? "https://connect.squareup.com"
      : "https://connect.squareupsandbox.com";

    // Square disables cards rather than hard-deleting them
    const sqResp = await fetch(`${squareBase}/v2/cards/${squareCardId}/disable`, {
      method: "POST",
      headers: {
        "Square-Version": "2024-08-15",
        Authorization: `Bearer ${squareAccessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!sqResp.ok) {
      const sqData = await sqResp.json();
      console.error("Square card disable failed:", sqData);
      // Still remove from local DB even if Square call fails
    }

    await supabaseAdmin
      .from("payment_methods")
      .delete()
      .eq("stripe_payment_method_id", squareCardId)
      .eq("user_id", user.id);

    // If deleted card was default, promote the next most recent card
    if (card.is_default) {
      const { data: remaining } = await supabaseAdmin
        .from("payment_methods")
        .select("id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1);

      if (remaining && remaining.length > 0) {
        await supabaseAdmin
          .from("payment_methods")
          .update({ is_default: true })
          .eq("id", remaining[0].id);
      }
    }

    return json({ success: true });
  } catch (err) {
    console.error("delete-square-card error:", err);
    return json({ error: err instanceof Error ? err.message : "Unexpected error" }, 500);
  }
});
