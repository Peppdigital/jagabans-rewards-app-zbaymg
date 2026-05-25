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

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("user_profiles")
      .select("name, email, square_customer_id")
      .eq("user_id", user.id)
      .single();

    if (profileError || !profile) return json({ error: "User profile not found" }, 404);

    if (profile.square_customer_id) {
      return json({ success: true, customerId: profile.square_customer_id });
    }

    const squareAccessToken = Deno.env.get("SQUARE_ACCESS_TOKEN");
    if (!squareAccessToken) return json({ error: "Payment service not configured" }, 500);

    const squareEnv = Deno.env.get("SQUARE_ENVIRONMENT") || "sandbox";
    const squareBase = squareEnv === "production"
      ? "https://connect.squareup.com"
      : "https://connect.squareupsandbox.com";

    const sqResp = await fetch(`${squareBase}/v2/customers`, {
      method: "POST",
      headers: {
        "Square-Version": "2024-08-15",
        Authorization: `Bearer ${squareAccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        idempotency_key: crypto.randomUUID(),
        given_name: profile.name?.split(" ")[0] ?? "",
        family_name: profile.name?.split(" ").slice(1).join(" ") ?? "",
        email_address: profile.email,
        reference_id: user.id,
      }),
    });

    const sqData = await sqResp.json();
    if (!sqResp.ok || !sqData?.customer) {
      console.error("Square customer creation failed:", sqData);
      return json({ error: sqData?.errors?.[0]?.detail || "Failed to create customer" }, 400);
    }

    const squareCustomerId = sqData.customer.id as string;

    const { error: updateError } = await supabaseAdmin
      .from("user_profiles")
      .update({ square_customer_id: squareCustomerId })
      .eq("user_id", user.id);

    if (updateError) {
      console.error("Failed to persist square_customer_id:", updateError);
      return json({ error: "Failed to save customer ID" }, 500);
    }

    return json({ success: true, customerId: squareCustomerId });
  } catch (err) {
    console.error("create-square-customer error:", err);
    return json({ error: err instanceof Error ? err.message : "Unexpected error" }, 500);
  }
});
