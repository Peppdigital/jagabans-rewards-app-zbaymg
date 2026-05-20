import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: events } = await supabase
    .from("order_events")
    .select("*")
    .eq("processed", false)
    .limit(20);

  for (const e of events ?? []) {
    if (e.type === "order_created") {
      await supabase.from("notifications").insert({
        user_id: e.payload.user_id,
        title: "Order Confirmed",
        message: "Your order has been received and is being prepared.",
        type: "order",
      });
    }

    if (e.type === "delivery_scheduled") {
      await supabase.from("notifications").insert({
        user_id: e.payload.user_id,
        title: "Delivery Scheduled",
        message: `Your order will arrive around ${e.payload.eta}`,
        type: "delivery",
      });
    }

    await supabase
      .from("order_events")
      .update({ processed: true })
      .eq("id", e.id);
  }

  return new Response("ok");
});
