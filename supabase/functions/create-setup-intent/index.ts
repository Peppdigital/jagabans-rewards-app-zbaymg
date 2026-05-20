import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
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
      apiVersion: '2023-10-16',
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

    // Get user profile for name and email
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('name, email')
      .eq('user_id', user.id)
      .single();

    if (profileError || !profile) {
      console.error('User profile not found:', profileError);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'User profile not found',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404,
        }
      );
    }

    // Check if user has any existing payment methods with stripe_customer_id
    const { data: existingPaymentMethods } = await supabase
      .from('payment_methods')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .not('stripe_customer_id', 'is', null)
      .limit(1)
      .single();

    let customerId = existingPaymentMethods?.stripe_customer_id;

    // If customer doesn't exist, create one
    if (!customerId) {
      console.log('Creating new Stripe customer for user:', user.id);
      
      try {
        const customer = await stripe.customers.create({
          email: profile.email,
          name: profile.name,
          metadata: {
            userId: user.id,
          },
        });

        customerId = customer.id;
        console.log('Stripe customer created:', customerId);
      } catch (stripeError: any) {
        console.error('Error creating Stripe customer:', stripeError);
        return new Response(
          JSON.stringify({
            success: false,
            error: `Failed to create customer: ${stripeError.message}`,
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
          }
        );
      }
    } else {
      console.log('Using existing Stripe customer:', customerId);
    }

    // Create setup intent
    let setupIntent;
    try {
      setupIntent = await stripe.setupIntents.create({
        customer: customerId,
        payment_method_types: ['card'],
      });
      console.log('SetupIntent created:', setupIntent.id);
    } catch (stripeError: any) {
      console.error('Error creating setup intent:', stripeError);
      return new Response(
        JSON.stringify({
          success: false,
          error: `Failed to create setup intent: ${stripeError.message}`,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        clientSecret: setupIntent.client_secret,
        customerId: customerId,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error('Unexpected error in create-setup-intent:', error);
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