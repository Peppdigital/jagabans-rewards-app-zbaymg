import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.46.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

console.log('Admin Cancel RSVP function started');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();

    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    // Check if user is admin or super_admin
    const { data: adminProfile, error: adminError } = await supabaseClient
      .from('user_profiles')
      .select('user_role')
      .eq('id', user.id)
      .single();

    if (adminError || !adminProfile || !['admin', 'super_admin'].includes(adminProfile.user_role)) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Admin access required' }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { userId, eventId } = await req.json();
    if (!userId || !eventId) {
      throw new Error('User ID and Event ID are required');
    }

    console.log('Admin cancelling RSVP for user:', userId, 'event:', eventId);

    // Check if RSVP exists
    const { data: existingRsvp, error: checkError } = await supabaseClient
      .from('event_rsvps')
      .select('id')
      .eq('event_id', eventId)
      .eq('user_id', userId)
      .maybeSingle();

    console.log('Existing RSVP check:', { existingRsvp, checkError });

    if (checkError) throw new Error('Failed to check existing RSVP');
    if (!existingRsvp) {
      return new Response(
        JSON.stringify({ error: 'No RSVP found for this user and event' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Get event details
    const { data: event, error: eventError } = await supabaseClient
      .from('events')
      .select('id, title, available_spots, capacity')
      .eq('id', eventId)
      .single();

    console.log('Event details:', { event, eventError });

    if (eventError || !event) {
      throw new Error('Event not found');
    }

    // Get user details for notification
    const { data: userProfile, error: userProfileError } = await supabaseClient
      .from('user_profiles')
      .select('name, email')
      .eq('id', userId)
      .single();

    if (userProfileError) {
      console.error('Failed to get user profile:', userProfileError);
    }

    // Delete the RSVP
    console.log('Deleting RSVP...');
    const { error: deleteError } = await supabaseClient
      .from('event_rsvps')
      .delete()
      .eq('id', existingRsvp.id);

    console.log('RSVP delete result:', { deleteError });

    if (deleteError) {
      throw new Error('Failed to cancel RSVP');
    }

    // Increment available spots
    console.log('Incrementing available spots...');
    const newSpots = Math.min(event.available_spots + 1, event.capacity);
    const { data: updatedEvent, error: updateError } = await supabaseClient
      .from('events')
      .update({ available_spots: newSpots })
      .eq('id', eventId)
      .select('available_spots')
      .single();

    console.log('Update result:', { updatedEvent, updateError });

    if (updateError) {
      // Rollback: re-insert the RSVP
      await supabaseClient
        .from('event_rsvps')
        .insert({
          event_id: eventId,
          user_id: userId,
        });
      
      throw new Error('Failed to update available spots');
    }

    // Create notification for the user
    console.log('Creating notification...');
    const { error: notificationError } = await supabaseClient
      .from('notifications')
      .insert({
        user_id: userId,
        title: 'RSVP Cancelled',
        message: `Your reservation for "${event.title}" has been cancelled by an administrator.`,
        type: 'event',
        action_url: '/events',
      });

    if (notificationError) {
      console.error('Failed to create notification:', notificationError);
      // Don't fail the whole operation if notification fails
    }

    console.log('RSVP cancelled successfully');

    return new Response(
      JSON.stringify({
        success: true,
        availableSpots: updatedEvent.available_spots,
        userName: userProfile?.name || 'User',
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Function error:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Internal server error',
        details: error.toString(),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});