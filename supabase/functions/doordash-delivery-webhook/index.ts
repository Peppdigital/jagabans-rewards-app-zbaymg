import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'x-doordash-signature, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const webhook = await req.json();
    console.log('DoorDash webhook:', webhook);

    const { external_delivery_id, delivery_status, dasher_name, tracking_url } = webhook;
    if (!external_delivery_id) throw new Error('Missing external_delivery_id');

    const updateData: any = { doordash_delivery_status: delivery_status, updated_at: new Date().toISOString() };
    if (tracking_url) updateData.doordash_tracking_url = tracking_url;
    if (dasher_name) updateData.doordash_dasher_name = dasher_name;
    if (delivery_status === 'delivered') updateData.status = 'completed';

    const { data: order } = await supabase.from('orders').update(updateData).eq('id', external_delivery_id).select('user_id, order_number').single();

    if (order) {
      let title = '', message = '';
      switch (delivery_status) {
        case 'confirmed': title = `Order #${order.order_number} - Dasher Assigned`; message = 'A dasher is on the way!';
          break;
        case 'picked_up': title = `Order #${order.order_number} - On the Way`; message = 'Your order is on the way!';
          break;
        case 'delivered': title = `Order #${order.order_number} - Delivered`; message = 'Your order has been delivered.';
          break;
        case 'cancelled': title = `Order #${order.order_number} - Delivery Cancelled`; message = 'Delivery cancelled. Contact support.';
          break;
        default: title = `Order #${order.order_number} - Status Update`; message = `Status updated: ${delivery_status}`;
      }

      if (title && message) {
        await supabase.from('notifications').insert({
          user_id: order.user_id,
          title,
          message,
          type: 'order',
          action_url: '/order-history',
        });
      }
    }

    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
  } catch (err: any) {
    console.error('DoorDash webhook error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Failed' }), { status: 500, headers: corsHeaders });
  }
});
