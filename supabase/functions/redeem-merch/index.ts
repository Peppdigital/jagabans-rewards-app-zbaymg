import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { merchId, merchName, pointsCost, deliveryAddress, pickupNotes } = await req.json();

    if (!merchId || !pointsCost) {
      return new Response(
        JSON.stringify({ error: 'Invalid merch data' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check user has enough points
    const { data: userProfile, error: profileError } = await supabaseClient
      .from('user_profiles')
      .select('points')
      .eq('id', user.id)
      .single();

    if (profileError || !userProfile) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch user profile' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (userProfile.points < pointsCost) {
      return new Response(
        JSON.stringify({ error: 'Insufficient points' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check merch is in stock
    const { data: merchItem, error: merchError } = await supabaseClient
      .from('merch_items')
      .select('in_stock')
      .eq('id', merchId)
      .single();

    if (merchError || !merchItem || !merchItem.in_stock) {
      return new Response(
        JSON.stringify({ error: 'Merch item not available' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Deduct points from user
    const { error: deductError } = await supabaseClient
      .from('user_profiles')
      .update({ points: userProfile.points - pointsCost })
      .eq('id', user.id);

    if (deductError) {
      console.error('Points deduction error:', deductError);
      return new Response(
        JSON.stringify({ error: 'Failed to deduct points' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create merch redemption
    const { data: redemption, error: redemptionError } = await supabaseClient
      .from('merch_redemptions')
      .insert({
        user_id: user.id,
        merch_item_id: merchId,
        merch_name: merchName,
        points_cost: pointsCost,
        delivery_address: deliveryAddress,
        pickup_notes: pickupNotes,
        status: 'pending',
      })
      .select()
      .single();

    if (redemptionError) {
      console.error('Redemption creation error:', redemptionError);
      // Rollback points
      await supabaseClient
        .from('user_profiles')
        .update({ points: userProfile.points })
        .eq('id', user.id);
      return new Response(
        JSON.stringify({ error: 'Failed to create redemption' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create notification
    await supabaseClient
      .from('notifications')
      .insert({
        user_id: user.id,
        title: 'Merch Redeemed',
        message: `You redeemed ${merchName} for ${pointsCost} points!`,
        type: 'general',
      });

    return new Response(
      JSON.stringify({ 
        success: true, 
        redemption 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});