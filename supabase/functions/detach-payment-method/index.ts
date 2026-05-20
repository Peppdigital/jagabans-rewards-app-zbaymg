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
      throw new Error('STRIPE_SECRET_KEY not configured');
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2025-12-15.clover',
      httpClient: Stripe.createFetchHttpClient(),
    });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseServiceClient = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    
    // Verify user with service client
    const { data: { user }, error: userError } = await supabaseServiceClient.auth.getUser(token);
    
    if (userError || !user) {
      console.error('User verification error:', userError);
      throw new Error('Unauthorized');
    }

    console.log('User verified:', user.id);

    const { paymentMethodId } = await req.json();

    if (!paymentMethodId) {
      throw new Error('Payment method ID is required');
    }

    console.log('Detaching payment method:', paymentMethodId, 'for user:', user.id);

    // Verify payment method belongs to user
    const { data: paymentMethodRecord, error: fetchError } = await supabaseServiceClient
      .from('payment_methods')
      .select('*')
      .eq('stripe_payment_method_id', paymentMethodId)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !paymentMethodRecord) {
      console.error('Payment method fetch error:', fetchError);
      throw new Error('Payment method not found or unauthorized');
    }

    console.log('Payment method found:', paymentMethodRecord.id);

    // Detach from Stripe
    try {
      await stripe.paymentMethods.detach(paymentMethodId);
      console.log('Payment method detached from Stripe:', paymentMethodId);
    } catch (stripeError: any) {
      console.error('Stripe detach error:', stripeError);
      throw new Error(`Failed to detach from Stripe: ${stripeError.message}`);
    }

    // Delete from database using service client
    const { error: deleteError } = await supabaseServiceClient
      .from('payment_methods')
      .delete()
      .eq('stripe_payment_method_id', paymentMethodId)
      .eq('user_id', user.id);

    if (deleteError) {
      console.error('Error deleting payment method from database:', deleteError);
      throw new Error(`Failed to delete payment method from database: ${deleteError.message}`);
    }

    console.log('Payment method deleted from database successfully');

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Payment method removed successfully',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error('Error detaching payment method:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to detach payment method',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});