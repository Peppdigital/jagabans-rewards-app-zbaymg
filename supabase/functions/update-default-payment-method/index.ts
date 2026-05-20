// supabase/functions/update-default-payment-method/index.ts
import Stripe from 'npm:stripe';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2025-12-15.clover',
});

Deno.serve(async (req) => {
  const { customerId, paymentMethodId } = await req.json();
  
  await stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: paymentMethodId },
  });
  
  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});