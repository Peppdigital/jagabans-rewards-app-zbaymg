// Setup type definitions for built-in Supabase Runtime APIs
// supabase/functions/create-stripe-customer/index.ts
import Stripe from 'npm:stripe';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2025-12-15.clover',
});

Deno.serve(async (req) => {
  const { userId, email, name } = await req.json();
  
  // Create or retrieve Stripe customer
  const customer = await stripe.customers.create({
    email,
    name,
    metadata: { supabase_user_id: userId }
  });
  
  return new Response(JSON.stringify({ customerId: customer.id }), {
    headers: { 'Content-Type': 'application/json' },
  });
});