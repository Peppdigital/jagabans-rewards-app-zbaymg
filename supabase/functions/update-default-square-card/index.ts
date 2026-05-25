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
    const { squareCardId } = body as { squareCardId: string };

    if (!squareCardId || typeof squareCardId !== "string") {
      return json({ error: "squareCardId required" }, 400);
    }

    // Verify the card belongs to this user
    const { data: card, error: fetchError } = await supabaseAdmin
      .from("square_cards")
      .select("id")
      .eq("square_card_id", squareCardId)
      .eq("user_id", user.id)
      .single();

    if (fetchError || !card) return json({ error: "Card not found" }, 404);

    // Clear all defaults for this user, then set the new one
    const { error: clearError } = await supabaseAdmin
      .from("square_cards")
      .update({ is_default: false })
      .eq("user_id", user.id);

    if (clearError) {
      console.error("Failed to clear defaults:", clearError);
      return json({ error: "Failed to update default card" }, 500);
    }

    const { error: setError } = await supabaseAdmin
      .from("square_cards")
      .update({ is_default: true })
      .eq("square_card_id", squareCardId)
      .eq("user_id", user.id);

    if (setError) {
      console.error("Failed to set new default:", setError);
      return json({ error: "Failed to update default card" }, 500);
    }

    return json({ success: true });
  } catch (err) {
    console.error("update-default-square-card error:", err);
    return json({ error: err instanceof Error ? err.message : "Unexpected error" }, 500);
  }
});
