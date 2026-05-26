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
    console.log("[create-square-customer] auth:", { userId: user?.id, userError });
    if (userError || !user) return json({ error: "Unauthorized" }, 401);

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("user_profiles")
      .select("name, email, square_customer_id")
      .eq("user_id", user.id)
      .single();

    console.log("[create-square-customer] profile fetch:", { profile, profileError });
    if (profileError || !profile) return json({ error: "User profile not found" }, 404);

    const squareAccessToken = Deno.env.get("SQUARE_ACCESS_TOKEN");
    const squareEnv = Deno.env.get("SQUARE_ENVIRONMENT");
    console.log("[create-square-customer] Square config:", { hasToken: !!squareAccessToken, env: squareEnv });
    if (!squareAccessToken) return json({ error: "Payment service not configured" }, 500);

    const squareBase = squareEnv === "production"
      ? "https://connect.squareup.com"
      : "https://connect.squareupsandbox.com";

    if (profile.square_customer_id) {
      console.log("[create-square-customer] verifying existing customer:", profile.square_customer_id);
      const verifyResp = await fetch(`${squareBase}/v2/customers/${profile.square_customer_id}`, {
        headers: {
          "Square-Version": "2024-08-15",
          Authorization: `Bearer ${squareAccessToken}`,
        },
      });
      if (verifyResp.ok) {
        console.log("[create-square-customer] customer verified, returning existing ID");
        return json({ success: true, customerId: profile.square_customer_id });
      }
      console.log("[create-square-customer] stored customer not found in Square (status:", verifyResp.status, "), will re-create");
    }

    const customerPayload = {
      idempotency_key: crypto.randomUUID(),
      given_name: profile.name?.split(" ")[0] ?? "",
      family_name: profile.name?.split(" ").slice(1).join(" ") ?? "",
      email_address: profile.email,
      reference_id: user.id,
    };
    console.log("[create-square-customer] calling Square API:", { url: `${squareBase}/v2/customers`, payload: customerPayload });

    const sqResp = await fetch(`${squareBase}/v2/customers`, {
      method: "POST",
      headers: {
        "Square-Version": "2024-08-15",
        Authorization: `Bearer ${squareAccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(customerPayload),
    });

    const sqData = await sqResp.json();
    console.log("[create-square-customer] Square response:", { status: sqResp.status, ok: sqResp.ok, data: sqData });
    if (!sqResp.ok || !sqData?.customer) {
      console.error("[create-square-customer] Square customer creation failed:", sqData);
      return json({ error: sqData?.errors?.[0]?.detail || "Failed to create customer" }, 400);
    }

    const squareCustomerId = sqData.customer.id as string;
    console.log("[create-square-customer] created customer:", squareCustomerId);

    const { error: updateError } = await supabaseAdmin
      .from("user_profiles")
      .update({ square_customer_id: squareCustomerId })
      .eq("user_id", user.id);

    console.log("[create-square-customer] profile update:", { updateError });
    if (updateError) {
      console.error("[create-square-customer] Failed to persist square_customer_id:", updateError);
      return json({ error: "Failed to save customer ID" }, 500);
    }

    return json({ success: true, customerId: squareCustomerId });
  } catch (err) {
    console.error("create-square-customer error:", err);
    return json({ error: err instanceof Error ? err.message : "Unexpected error" }, 500);
  }
});
