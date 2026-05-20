import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: orders } = await supabase
    .from("orders")
    .select("id,user_id")
    .eq("order_type", "delivery")
    .is("delivery_scheduled_at", null)
    .limit(10);

  for (const order of orders ?? []) {
    const eta = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    await supabase
      .from("orders")
      .update({ delivery_scheduled_at: eta })
      .eq("id", order.id);

    await supabase.from("order_events").insert({
      order_id: order.id,
      type: "delivery_scheduled",
      payload: { eta },
    });
  }

  return new Response("ok");
});
