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

    const { recipientId, recipientEmail, recipientName, points, message } = await req.json();

    if (!points || points <= 0) {
      return new Response(
        JSON.stringify({ error: 'Invalid points amount' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check sender has enough points
    const { data: senderProfile, error: senderError } = await supabaseClient
      .from('user_profiles')
      .select('points, name')
      .eq('id', user.id)
      .single();

    if (senderError || !senderProfile) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch sender profile' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (senderProfile.points < points) {
      return new Response(
        JSON.stringify({ error: 'Insufficient points' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Deduct points from sender
    const { error: deductError } = await supabaseClient
      .from('user_profiles')
      .update({ points: senderProfile.points - points })
      .eq('id', user.id);

    if (deductError) {
      console.error('Points deduction error:', deductError);
      return new Response(
        JSON.stringify({ error: 'Failed to deduct points' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create gift card
    const { data: giftCard, error: giftCardError } = await supabaseClient
      .from('gift_cards')
      .insert({
        sender_id: user.id,
        recipient_id: recipientId,
        recipient_email: recipientEmail,
        recipient_name: recipientName,
        points,
        message,
        status: recipientId ? 'sent' : 'pending',
      })
      .select()
      .single();

    if (giftCardError) {
      console.error('Gift card creation error:', giftCardError);
      // Rollback points
      await supabaseClient
        .from('user_profiles')
        .update({ points: senderProfile.points })
        .eq('id', user.id);
      return new Response(
        JSON.stringify({ error: 'Failed to create gift card' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If recipient exists, add points and create notification
    if (recipientId) {
      const { data: recipientProfile } = await supabaseClient
        .from('user_profiles')
        .select('points')
        .eq('id', recipientId)
        .single();

      if (recipientProfile) {
        await supabaseClient
          .from('user_profiles')
          .update({ points: recipientProfile.points + points })
          .eq('id', recipientId);

        await supabaseClient
          .from('notifications')
          .insert({
            user_id: recipientId,
            title: 'Gift Card Received',
            message: `${senderProfile.name} sent you ${points} points! ${message ? message : ''}`,
            type: 'giftcard',
          });
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        giftCard 
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