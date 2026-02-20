import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-provider, x-provider-event-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface OrderSMSData {
  orderId: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  items: Array<{
    name: string;
    quantity: number;
    price: number;
  }>;
  subtotal: number;
  tax: number;
  total: number;
  deliveryAddress?: string;
  pickupNotes?: string;
  orderType: 'delivery' | 'pickup';
  timestamp: string;
}

/**
 * 📱 ADMIN SMS NOTIFICATION
 * With idempotency checks via webhook_events table
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  console.log('[Admin SMS] Request received');

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const provider = req.headers.get('x-provider') ?? 'stripe-webhook';
  const providerEventId = req.headers.get('x-provider-event-id');

  let orderData: OrderSMSData;
  try {
    orderData = await req.json();
  } catch (err) {
    console.error('[Admin SMS] Invalid JSON:', String(err));
    return new Response(
      JSON.stringify({ error: 'Invalid JSON' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const orderId = orderData.orderId;
  const eventId = `sms-${providerEventId ?? orderId ?? Date.now()}`;

  console.log(`[Admin SMS] Processing order ${orderId}, event ${eventId}`);

  // Idempotency check
  const { data: existingEvent } = await supabase
    .from('webhook_events')
    .select('id, status')
    .eq('provider', 'admin-sms')
    .eq('event_id', eventId)
    .single();

  if (existingEvent) {
    console.log(`[Admin SMS] Already processed, returning success (idempotent)`);
    return new Response(
      JSON.stringify({ accepted: true, note: 'duplicate-or-already-processed' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Insert the event as pending
  const payload = { 
    provider: 'admin-sms', 
    event_id: eventId, 
    order_id: orderId, 
    received_at: new Date().toISOString(), 
    status: 'processing' 
  };

  EdgeRuntime.waitUntil((async () => {
    try {
      const { error } = await supabase.from('webhook_events').insert(payload);
      if (error) console.warn('[Admin SMS] Background insert error:', { orderId, eventId, error });
    } catch (err) {
      console.error('[Admin SMS] Background unexpected error:', { orderId, eventId, err });
    }
  })());

  // Process SMS in background
  const background = (async () => {
    try {
      // Get admin phone recipients
      const { data: phoneRecords } = await supabase
        .from('admin_notification_phones')
        .select('phone_number')
        .eq('is_active', true);

      let adminPhones: string[];
      if (!phoneRecords || phoneRecords.length === 0) {
        const adminPhonesEnv = Deno.env.get('ADMIN_PHONE_RECIPIENTS');
        adminPhones = adminPhonesEnv ? adminPhonesEnv.split(',').map(p => p.trim()) : [];
      } else {
        adminPhones = (phoneRecords as any[]).map(r => r.phone_number);
      }

      if (adminPhones.length === 0) {
        console.warn('[Admin SMS] No recipients configured');
        // ✅ FIXED: Use destructured error instead of .catch()
        const { error } = await supabase
          .from('webhook_events')
          .update({ status: 'skipped', processed_at: new Date().toISOString() })
          .eq('provider', 'admin-sms')
          .eq('event_id', eventId);
        if (error) console.warn('[Admin SMS] Failed to update webhook_events:', error);
        return;
      }

      // Check Twilio credentials
      const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
      const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
      const twilioPhoneNumber = Deno.env.get('TWILIO_PHONE_NUMBER');

      if (!twilioAccountSid || !twilioAuthToken || !twilioPhoneNumber) {
        console.warn('[Admin SMS] Twilio not configured');
        // ✅ FIXED: Use destructured error instead of .catch()
        const { error } = await supabase
          .from('webhook_events')
          .update({ status: 'skipped', processed_at: new Date().toISOString() })
          .eq('provider', 'admin-sms')
          .eq('event_id', eventId);
        if (error) console.warn('[Admin SMS] Failed to update webhook_events:', error);
        return;
      }

      // Build SMS message
      const itemsSummary = orderData.items.length <= 3
        ? orderData.items.map(item => `${item.quantity}x ${item.name}`).join(', ')
        : `${orderData.items.length} items`;

      const shortOrderId = orderData.orderId.substring(0, 8).toUpperCase();
      const orderTypeLabel = orderData.orderType === 'delivery' ? '🚗 Delivery' : '🏪 Pickup';
      
      const smsMessage = `🔔 NEW ORDER #${shortOrderId}

${orderTypeLabel}
Customer: ${orderData.customerName}
${orderData.customerPhone ? `Phone: ${orderData.customerPhone}\n` : ''}Items: ${itemsSummary}
Total: $${orderData.total.toFixed(2)}

${orderData.orderType === 'delivery' && orderData.deliveryAddress 
  ? `Address: ${orderData.deliveryAddress}\n` 
  : ''}${orderData.orderType === 'pickup' && orderData.pickupNotes 
  ? `Notes: ${orderData.pickupNotes}\n` 
  : ''}
⚠️ Login to dashboard to confirm.

- Jagabans L.A.`;

      // Send via Twilio
      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
      const authCredentials = btoa(`${twilioAccountSid}:${twilioAuthToken}`);

      const smsResults = await Promise.allSettled(
        adminPhones.map(async (phoneNumber) => {
          const formData = new URLSearchParams();
          formData.append('From', twilioPhoneNumber);
          formData.append('To', phoneNumber);
          formData.append('Body', smsMessage);

          const response = await fetch(twilioUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Basic ${authCredentials}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: formData.toString(),
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`SMS to ${phoneNumber} failed: ${errorText}`);
          }

          const result = await response.json();
          console.log(`[Admin SMS] ✓ Sent to ${phoneNumber}`);
          return { phoneNumber, sid: result.sid };
        })
      );

      const successfulSends = smsResults.filter(r => r.status === 'fulfilled');
      const failedSends = smsResults.filter(r => r.status === 'rejected');

      console.log(`[Admin SMS] Sent: ${successfulSends.length}, Failed: ${failedSends.length}`);

      // Log to database
      try {
        const notificationRecords = smsResults.map((result, index) => ({
          order_id: orderData.orderId,
          recipient_phone: adminPhones[index],
          message_body: smsMessage,
          sent_at: new Date().toISOString(),
          status: result.status === 'fulfilled' ? 'sent' : 'failed',
          twilio_sid: result.status === 'fulfilled' ? result.value.sid : null,
          error_message: result.status === 'rejected' ? String(result.reason) : null,
        }));
        await supabase.from('sms_notifications').insert(notificationRecords);
      } catch (err) {
        console.warn('[Admin SMS] Failed to log:', err);
      }

      // Mark as processed
      // ✅ FIXED: Use destructured error instead of .catch()
      const { error: updateError } = await supabase
        .from('webhook_events')
        .update({
          status: successfulSends.length > 0 ? 'processed' : 'errored',
          processed_at: new Date().toISOString(),
          result: { sent: successfulSends.length, failed: failedSends.length },
        })
        .eq('provider', 'admin-sms')
        .eq('event_id', eventId);
      
      if (updateError) console.warn('[Admin SMS] Failed to mark processed:', updateError);

    } catch (err) {
      console.error('[Admin SMS] Background error:', String(err));
      // ✅ FIXED: Use destructured error instead of .catch()
      const { error } = await supabase
        .from('webhook_events')
        .update({
          status: 'errored',
          processed_at: new Date().toISOString(),
          result: { error: String(err) },
        })
        .eq('provider', 'admin-sms')
        .eq('event_id', eventId);
      
      if (error) console.warn('[Admin SMS] Failed to mark errored:', error);
    }
  })();

  // Use EdgeRuntime.waitUntil if available
  if ((globalThis as any).EdgeRuntime?.waitUntil) {
    try {
      (globalThis as any).EdgeRuntime.waitUntil(background);
    } catch (err) {
      console.warn('[Admin SMS] EdgeRuntime.waitUntil failed:', String(err));
    }
  }

  return new Response(
    JSON.stringify({
      success: true,
      accepted: true,
      note: 'processing',
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});