import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get Supabase client with service role key (bypasses RLS)
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Supabase configuration missing');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    console.log('Checking for orders ready for delivery trigger...');

    // Find orders that are scheduled for delivery and the time has passed
    const now = new Date().toISOString();
    const { data: orders, error: fetchError } = await supabase
      .from('orders')
      .select('*')
      .eq('payment_status', 'succeeded')
      .eq('status', 'preparing')
      .not('delivery_address', 'is', null)
      .not('delivery_scheduled_at', 'is', null)
      .is('delivery_triggered_at', null)
      .lte('delivery_scheduled_at', now);

    if (fetchError) {
      console.error('Error fetching orders:', fetchError);
      throw fetchError;
    }

    console.log(`Found ${orders?.length || 0} orders ready for delivery trigger`);

    if (!orders || orders.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No orders ready for delivery trigger', count: 0 }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    // Process each order
    const results = [];
    for (const order of orders) {
      try {
        console.log(`Triggering delivery for order ${order.id}...`);

        // Get user details
        const { data: userData } = await supabase
          .from('user_profiles')
          .select('name, phone, email')
          .eq('id', order.user_id)
          .single();

        // Get restaurant config
        const restaurantAddress = {
          street: '123 Restaurant Street',
          city: 'Los Angeles',
          state: 'CA',
          zipCode: '90001',
          country: 'US',
        };
        const restaurantPhone = '+1234567890';
        const restaurantName = 'Jagabans LA';

        // Parse delivery address (simplified - in production, you'd want proper address parsing)
        const deliveryAddressParts = order.delivery_address.split(',').map((s: string) => s.trim());
        const dropoffAddress = {
          street: deliveryAddressParts[0] || order.delivery_address,
          city: deliveryAddressParts[1] || 'Los Angeles',
          state: deliveryAddressParts[2]?.split(' ')[0] || 'CA',
          zipCode: deliveryAddressParts[2]?.split(' ')[1] || '90001',
          country: 'US',
        };

        // Call trigger-uber-delivery function
        const deliveryResponse = await fetch(`${supabaseUrl}/functions/v1/trigger-uber-delivery`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            orderId: order.id,
            pickupAddress: restaurantAddress,
            dropoffAddress: dropoffAddress,
            pickupPhoneNumber: restaurantPhone,
            dropoffPhoneNumber: userData?.phone || '+1234567890',
            pickupName: restaurantName,
            dropoffName: userData?.name || 'Customer',
            pickupNotes: 'Order ready for pickup',
            dropoffNotes: order.pickup_notes || '',
          }),
        });

        if (!deliveryResponse.ok) {
          const errorText = await deliveryResponse.text();
          console.error(`Failed to trigger delivery for order ${order.id}:`, errorText);
          results.push({ orderId: order.id, success: false, error: errorText });
          continue;
        }

        const deliveryData = await deliveryResponse.json();
        console.log(`✓ Delivery triggered for order ${order.id}:`, deliveryData);

        // Send notification to user about driver assignment
        const { data: courierData } = await supabase
          .from('orders')
          .select('uber_courier_name, uber_delivery_eta')
          .eq('id', order.id)
          .single();

        const etaMessage = courierData?.uber_delivery_eta 
          ? ` Estimated arrival: ${new Date(courierData.uber_delivery_eta).toLocaleTimeString()}`
          : '';

        await supabase
          .from('notifications')
          .insert({
            user_id: order.user_id,
            title: 'Driver Assigned!',
            message: `A driver has been assigned to your order.${etaMessage}`,
            type: 'order',
            read: false,
          });

        results.push({ orderId: order.id, success: true, deliveryId: deliveryData.deliveryId });
      } catch (error: any) {
        console.error(`Error processing order ${order.id}:`, error);
        results.push({ orderId: order.id, success: false, error: error.message });
      }
    }

    return new Response(
      JSON.stringify({
        message: 'Delivery trigger processing complete',
        count: orders.length,
        results,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error('Error in schedule-delivery-trigger:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});