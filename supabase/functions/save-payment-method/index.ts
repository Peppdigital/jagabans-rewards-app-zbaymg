// import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'npm:stripe';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeSecretKey) {
      console.error('STRIPE_SECRET_KEY not configured');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Payment system configuration error',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        }
      );
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2025-12-15.clover',
      httpClient: Stripe.createFetchHttpClient(),
    });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'No authorization header',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401,
        }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      console.error('User authentication error:', userError);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Unauthorized',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401,
        }
      );
    }

    const { paymentMethodId, setAsDefault } = await req.json();

    if (!paymentMethodId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Payment method ID is required',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      );
    }

    console.log('Retrieving payment method from Stripe:', paymentMethodId);

    // Get payment method details from Stripe
    let paymentMethod;
    try {
      paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
    } catch (stripeError: any) {
      console.error('Stripe error retrieving payment method:', stripeError);
      return new Response(
        JSON.stringify({
          success: false,
          error: `Failed to retrieve payment method: ${stripeError.message}`,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      );
    }

    if (!paymentMethod.customer) {
      console.error('Payment method not attached to customer');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Payment method must be attached to a customer',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      );
    }

    const customerId = paymentMethod.customer as string;
    console.log('Payment method customer:', customerId);

    // If setAsDefault, update customer's default payment method
    if (setAsDefault) {
      try {
        await stripe.customers.update(customerId, {
          invoice_settings: {
            default_payment_method: paymentMethodId,
          },
        });
        console.log('Updated default payment method in Stripe');
      } catch (stripeError: any) {
        console.error('Error updating default payment method in Stripe:', stripeError);
        // Continue anyway - we'll still save it to the database
      }

      // Set all existing payment methods to non-default
      const { error: updateError } = await supabase
        .from('payment_methods')
        .update({ is_default: false })
        .eq('user_id', user.id);

      if (updateError) {
        console.error('Error updating existing payment methods:', updateError);
      }
    }

    // Save payment method to database
    const { error: insertError } = await supabase
      .from('payment_methods')
      .insert({
        user_id: user.id,
        stripe_customer_id: customerId,
        stripe_payment_method_id: paymentMethodId,
        type: paymentMethod.type === 'card' ? 'credit' : 'debit',
        cardholder_name: paymentMethod.billing_details?.name || 'Card Holder',
        expiry_date: `${paymentMethod.card?.exp_month}/${paymentMethod.card?.exp_year}`,
        brand: paymentMethod.card?.brand || '',
        last4: paymentMethod.card?.last4 || '',
        exp_month: paymentMethod.card?.exp_month || 0,
        exp_year: paymentMethod.card?.exp_year || 0,
        is_default: setAsDefault || false,
      });

    if (insertError) {
      console.error('Error saving payment method to database:', insertError);
      return new Response(
        JSON.stringify({
          success: false,
          error: `Failed to save payment method: ${insertError.message}`,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        }
      );
    }

    console.log('Payment method saved successfully:', paymentMethodId);

    return new Response(
      JSON.stringify({
        success: true,
        paymentMethodId,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error('Unexpected error in save-payment-method:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'An unexpected error occurred',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});