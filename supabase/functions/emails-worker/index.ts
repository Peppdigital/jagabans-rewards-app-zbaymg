import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_URL = "https://api.resend.com/emails";

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!resendApiKey) {
    console.error("Missing RESEND_API_KEY");
    return new Response("config error", { status: 500 });
  }

  /* ───────────────── FETCH EVENTS ───────────────── */
  const { data: events } = await supabase
    .from("order_events")
    .select("*")
    .eq("processed", false)
    .in("type", ["order_created"])
    .limit(10);

  for (const event of events ?? []) {
    try {
      /* ───────────────── USER EMAIL ───────────────── */
      const { data: user } = await supabase
        .from("profiles")
        .select("email, full_name")
        .eq("id", event.payload.user_id)
        .single();

      if (!user?.email) throw new Error("User email not found");

      /* ───────────────── SEND EMAIL ───────────────── */
      const res = await fetch(RESEND_API_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Your Company <no-reply@yourdomain.com>",
          to: [user.email],
          subject: "Your order is confirmed",
          html: `
            <div style="font-family: Arial, sans-serif; line-height: 1.6">
              <h2>Order Confirmed 🎉</h2>
              <p>Hi ${user.full_name ?? "there"},</p>
              <p>Your order has been successfully placed and is now being prepared.</p>
              <p><strong>Order ID:</strong> ${event.order_id}</p>
              <p><strong>Total:</strong> ₦${event.payload.total}</p>
              <br />
              <p>We’ll notify you as things progress.</p>
              <p>— The Team</p>
            </div>
          `,
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Resend error: ${err}`);
      }

      /* ───────────────── MARK PROCESSED ───────────────── */
      await supabase
        .from("order_events")
        .update({ processed: true })
        .eq("id", event.id);

    } catch (err: any) {
      console.error("Email worker error:", err);

      // DO NOT mark processed — it will retry on next run
      continue;
    }
  }

  return new Response("ok");
});
