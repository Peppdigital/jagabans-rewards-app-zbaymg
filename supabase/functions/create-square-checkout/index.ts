import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';
const SQUARE_ACCESS_TOKEN = Deno.env.get('SQUARE_ACCESS_TOKEN');
const SQUARE_LOCATION_ID = Deno.env.get('SQUARE_LOCATION_ID');
const SQUARE_ENVIRONMENT = Deno.env.get('SQUARE_ENVIRONMENT') || 'sandbox';
const SQUARE_API_URL = SQUARE_ENVIRONMENT === 'production' ? 'https://connect.squareup.com/v2' : 'https://connect.squareupsandbox.com/v2';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
serve(async (req)=>{
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    console.log('=== Square Checkout Creation Started ===');
    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    console.log('Auth header present:', !!authHeader);
    if (!authHeader) {
      console.error('Missing authorization header');
      throw new Error('Missing authorization header');
    }
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    console.log('Supabase URL configured:', !!supabaseUrl);
    console.log('Supabase Anon Key configured:', !!supabaseAnonKey);
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Supabase configuration is missing');
    }
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader
        }
      }
    });
    // Get the authenticated user
    console.log('Attempting to get user...');
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError) {
      console.error('User authentication error:', userError);
      throw new Error(`Authentication failed: ${userError.message}`);
    }
    if (!user) {
      console.error('No user found in session');
      throw new Error('Not authenticated');
    }
    console.log('User authenticated:', user.id);
    // Parse request body
    const { items, deliveryAddress, pickupNotes, redirectUrl } = await req.json();
    console.log('Request data:', {
      itemCount: items?.length,
      hasAddress: !!deliveryAddress
    });
    if (!items || items.length === 0) {
      throw new Error('No items provided');
    }
    // Check Square configuration
    console.log('Square Access Token configured:', !!SQUARE_ACCESS_TOKEN);
    console.log('Square Location ID configured:', !!SQUARE_LOCATION_ID);
    console.log('Square Environment:', SQUARE_ENVIRONMENT);
    if (!SQUARE_ACCESS_TOKEN || !SQUARE_LOCATION_ID) {
      throw new Error('Square configuration is missing. Please contact support.');
    }
    // Generate idempotency key
    const idempotencyKey = crypto.randomUUID();
    // Calculate total
    const subtotal = items.reduce((sum, item)=>sum + item.price * item.quantity, 0);
    const tax = subtotal * 0.0875; // 8.75% tax
    const total = subtotal + tax;
    console.log('Order totals:', {
      subtotal,
      tax,
      total
    });
    // Create line items for Square
    const lineItems = items.map((item)=>({
        name: item.name,
        quantity: item.quantity.toString(),
        base_price_money: {
          amount: Math.round(item.price * 100),
          currency: 'USD'
        }
      }));
    // Create Square checkout
    const checkoutPayload = {
      idempotency_key: idempotencyKey,
      order: {
        location_id: SQUARE_LOCATION_ID,
        line_items: lineItems,
        taxes: [
          {
            name: 'Sales Tax',
            percentage: '8.75',
            scope: 'ORDER'
          }
        ]
      },
      checkout_options: {
        redirect_url: redirectUrl || 'https://natively.dev',
        ask_for_shipping_address: false
      }
    };
    // Add delivery info if provided
    if (deliveryAddress) {
      checkoutPayload.order.fulfillments = [
        {
          type: 'DELIVERY',
          state: 'PROPOSED',
          delivery_details: {
            recipient: {
              address: {
                address_line_1: deliveryAddress
              }
            },
            ...pickupNotes && {
              note: pickupNotes
            }
          }
        }
      ];
    }
    console.log('Creating Square checkout with payload:', JSON.stringify(checkoutPayload, null, 2));
    const squareResponse = await fetch(`${SQUARE_API_URL}/online-checkout/payment-links`, {
      method: 'POST',
      headers: {
        'Square-Version': '2025-10-16',
        'Authorization': `Bearer ${SQUARE_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(checkoutPayload)
    });
    const squareData = await squareResponse.json();
    console.log('Square API response status:', squareResponse.status);
    console.log('Square API response:', JSON.stringify(squareData, null, 2));
    if (!squareResponse.ok) {
      console.error('Square API error:', squareData);
      const errorDetail = squareData.errors?.[0]?.detail || 'Checkout creation failed';
      throw new Error(errorDetail);
    }
    const paymentLink = squareData.payment_link;
    console.log('Checkout created successfully:', paymentLink.id);
    return new Response(JSON.stringify({
      success: true,
      checkout: {
        id: paymentLink.id,
        url: paymentLink.url,
        order_id: paymentLink.order_id,
        total: total
      }
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 200
    });
  } catch (error) {
    console.error('=== Error creating checkout ===');
    console.error('Error:', error);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'An error occurred creating the checkout'
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 400
    });
  }
});
