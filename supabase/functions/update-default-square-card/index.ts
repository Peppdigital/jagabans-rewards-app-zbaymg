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

    // Verify ownership
    const { data: card, error: fetchError } = await supabaseAdmin
      .from("payment_methods")
      .select("id")
      .eq("stripe_payment_method_id", squareCardId)
      .eq("user_id", user.id)
      .single();

    if (fetchError || !card) return json({ error: "Card not found" }, 404);

    await supabaseAdmin
      .from("payment_methods")
      .update({ is_default: false })
      .eq("user_id", user.id);

    const { error: setError } = await supabaseAdmin
      .from("payment_methods")
      .update({ is_default: true })
      .eq("stripe_payment_method_id", squareCardId)
      .eq("user_id", user.id);

    if (setError) return json({ error: "Failed to update default card" }, 500);

    return json({ success: true });
  } catch (err) {
    console.error("update-default-square-card error:", err);
    return json({ error: err instanceof Error ? err.message : "Unexpected error" }, 500);
  }
});
