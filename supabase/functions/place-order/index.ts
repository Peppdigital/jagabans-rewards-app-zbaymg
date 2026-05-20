import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }

  try {
    const supabaseClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: {
        headers: {
          Authorization: req.headers.get('Authorization')
        }
      }
    });

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({
        error: 'Unauthorized'
      }), {
        status: 401,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }

    const { items, deliveryAddress, pickupNotes } = await req.json();
    if (!items || items.length === 0) {
      return new Response(JSON.stringify({
        error: 'No items in order'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }

    // Calculate total and points
    const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const pointsEarned = Math.floor(total); // 1 point per dollar

    // Create order
    const { data: order, error: orderError } = await supabaseClient
      .from('orders')
      .insert({
        user_id: user.id,
        total,
        points_earned: pointsEarned,
        status: 'pending',
        delivery_address: deliveryAddress,
        pickup_notes: pickupNotes
      })
      .select()
      .single();

    if (orderError) {
      console.error('Order creation error:', orderError);
      return new Response(JSON.stringify({
        error: 'Failed to create order'
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }

    // Create order items
    const orderItems = items.map((item) => ({
      order_id: order.id,
      menu_item_id: item.id,
      name: item.name,
      price: item.price,
      quantity: item.quantity
    }));

    const { error: itemsError } = await supabaseClient.from('order_items').insert(orderItems);
    if (itemsError) {
      console.error('Order items creation error:', itemsError);
      return new Response(JSON.stringify({
        error: 'Failed to create order items'
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }

    // Get current user points
    const { data: userData, error: userFetchError } = await supabaseClient
      .from('user_profiles')
      .select('points')
      .eq('id', user.id)
      .single();

    if (!userFetchError && userData) {
      // Update user points
      const newPoints = (userData.points || 0) + pointsEarned;
      const { error: pointsError } = await supabaseClient
        .from('user_profiles')
        .update({ points: newPoints })
        .eq('id', user.id);

      if (pointsError) {
        console.error('Points update error:', pointsError);
        // Don't fail the order if points update fails, just log it
      }
    }

    // Create notification
    await supabaseClient.from('notifications').insert({
      user_id: user.id,
      title: 'Order Placed',
      message: `Your order of $${total.toFixed(2)} has been placed successfully. You earned ${pointsEarned} points!`,
      type: 'order'
    });

    return new Response(JSON.stringify({
      success: true,
      order: {
        ...order,
        items: orderItems
      },
      pointsEarned
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({
      error: 'Internal server error'
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});