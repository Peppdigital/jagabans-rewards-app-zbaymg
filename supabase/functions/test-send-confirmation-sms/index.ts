import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-function-secret',
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

Deno.serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders, status: 200 });
  }

  // Only accept POST requests
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  console.log('=== Send Order SMS Notification Request (NO AUTH, defensive) ===');

  try {
    // Get Supabase client (service role key required in env)
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Supabase configuration missing');
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // --- Parse request body (no auth) and substitute dummy values when missing ---
    let orderData: OrderSMSData | any;
    try {
      orderData = await req.json();
    } catch (err) {
      console.warn('Invalid JSON body, using dummy order data', err);
      orderData = null;
    }

    // Provide dummy/default order if request body is missing or malformed
    if (!orderData || typeof orderData !== 'object') {
      orderData = {
        orderId: 'DUMMY-00000000',
        customerName: 'Unknown Customer',
        customerEmail: 'unknown@example.com',
        customerPhone: undefined,
        items: [],
        subtotal: 0,
        tax: 0,
        total: 0,
        deliveryAddress: undefined,
        pickupNotes: undefined,
        orderType: 'pickup',
        timestamp: new Date().toISOString(),
      } as OrderSMSData;
      console.log('Using dummy order data:', orderData.orderId);
    } else {
      // Fill missing fields with defaults
      orderData.orderId =
        typeof orderData.orderId === 'string' && orderData.orderId.length > 0
          ? orderData.orderId
          : 'DUMMY-00000000';
      orderData.customerName =
        typeof orderData.customerName === 'string' && orderData.customerName.length > 0
          ? orderData.customerName
          : 'Unknown Customer';
      orderData.customerEmail =
        typeof orderData.customerEmail === 'string' ? orderData.customerEmail : 'unknown@example.com';
      orderData.customerPhone =
        typeof orderData.customerPhone === 'string' && orderData.customerPhone.length > 0
          ? orderData.customerPhone
          : undefined;
      orderData.items = Array.isArray(orderData.items) ? orderData.items : [];
      orderData.subtotal = typeof orderData.subtotal === 'number' ? orderData.subtotal : 0;
      orderData.tax = typeof orderData.tax === 'number' ? orderData.tax : 0;
      orderData.total =
        typeof orderData.total === 'number' ? orderData.total : orderData.subtotal + orderData.tax;
      orderData.deliveryAddress =
        typeof orderData.deliveryAddress === 'string' && orderData.deliveryAddress.length > 0
          ? orderData.deliveryAddress
          : undefined;
      orderData.pickupNotes =
        typeof orderData.pickupNotes === 'string' && orderData.pickupNotes.length > 0
          ? orderData.pickupNotes
          : undefined;
      orderData.orderType = orderData.orderType === 'delivery' ? 'delivery' : 'pickup';
      orderData.timestamp = typeof orderData.timestamp === 'string' ? orderData.timestamp : new Date().toISOString();
      console.log('Order data received (validated/defaulted):', orderData.orderId);
    }

    // Ensure items is array (may be empty)
    if (!Array.isArray(orderData.items)) orderData.items = [];

    // Build items summary defensively
    const itemsCount = orderData.items.length;
    let itemsSummary: string;
    if (itemsCount === 0) {
      itemsSummary = 'No items';
    } else if (itemsCount <= 3) {
      itemsSummary = orderData.items
        .map((item: any) => {
          const qty = typeof item?.quantity === 'number' ? item.quantity : 1;
          const name = typeof item?.name === 'string' ? item.name : 'item';
          return `${qty}x ${name}`;
        })
        .join(', ');
    } else {
      itemsSummary = `${itemsCount} items`;
    }

    // Shorten order id safely
    const shortOrderId = (orderData.orderId || 'DUMMY-00000000').toString().substring(0, 8);
    const orderTypeLabel = orderData.orderType === 'delivery' ? 'Delivery' : 'Pickup';

    // Compose SMS message, trimming long fields for safety
    const maxFieldLength = 200;
    const safeCustomerName = (orderData.customerName || 'Unknown Customer').toString().slice(0, maxFieldLength);
    const safeAddress = orderData.deliveryAddress ? orderData.deliveryAddress.toString().slice(0, maxFieldLength) : '';
    const safePickupNotes = orderData.pickupNotes ? orderData.pickupNotes.toString().slice(0, maxFieldLength) : '';

    const smsMessage = `🔔 NEW ORDER #${shortOrderId}
${orderTypeLabel}
Customer: ${safeCustomerName}
${orderData.customerPhone ? `Phone: ${orderData.customerPhone}` : ''}
Items: ${itemsSummary}
Total: $${Number(orderData.total || 0).toFixed(2)}
${orderData.orderType === 'delivery' && safeAddress ? `Address: ${safeAddress}` : ''}
${orderData.orderType === 'pickup' && safePickupNotes ? `Notes: ${safePickupNotes}` : ''}
Login to dashboard to confirm order.
- Jagabans LA`;

    // Fetch admin phone numbers from DB; if table is empty or missing, fall back to env list
    const { data: phoneRecords, error: phoneError } = await supabase
      .from('admin_notification_phones')
      .select('phone_number')
      .eq('is_active', true);

    let adminPhones: string[] = [];
    if (phoneError) {
      console.warn('Error querying admin_notification_phones, will try environment fallback:', phoneError);
    }

    if (Array.isArray(phoneRecords) && phoneRecords.length > 0) {
      // Map defensively in case row shape differs
      adminPhones = phoneRecords
        .map((r: any) => (r && typeof r.phone_number === 'string' ? r.phone_number.trim() : null))
        .filter(Boolean) as string[];
    }

    if (adminPhones.length === 0) {
      const adminPhonesEnv = Deno.env.get('ADMIN_PHONE_RECIPIENTS') || '';
      adminPhones = adminPhonesEnv
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      if (adminPhones.length === 0) {
        // Final fallback: use a single dummy number — useful for testing only
        console.warn('No admin phone recipients found; using dummy phone number for testing');
        adminPhones = ['+15555550100']; // dummy E.164 number — replace before production
      }
    }

    console.log('Final adminPhones:', adminPhones);

    // Get Twilio configuration from environment
    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioPhoneNumber = Deno.env.get('TWILIO_PHONE_NUMBER');

    if (!twilioAccountSid || !twilioAuthToken || !twilioPhoneNumber) {
      console.error('Twilio configuration incomplete');
      return new Response(
        JSON.stringify({ error: 'SMS service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Send SMS to each admin phone number using Twilio API
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
            Authorization: `Basic ${authCredentials}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: formData.toString(),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Failed to send SMS to ${phoneNumber}:`, errorText);
          throw new Error(`SMS to ${phoneNumber} failed: ${errorText}`);
        }

        const result = await response.json();
        console.log(`SMS sent successfully to ${phoneNumber}:`, result.sid);
        return { phoneNumber, sid: result.sid, status: 'sent' };
      })
    );

    // Count successful sends
    const successfulSends = smsResults.filter((result) => result.status === 'fulfilled');
    const failedSends = smsResults.filter((result) => result.status === 'rejected');

    if (failedSends.length > 0) {
      console.error(`Failed to send SMS to ${failedSends.length} recipients`);
      failedSends.forEach((result, index) => {
        if (result.status === 'rejected') {
          console.error(`Failed recipient ${index + 1}:`, result.reason);
        }
      });
    }

    // Log the SMS notifications in the database for audit trail
    const notificationRecords = smsResults.map((result, index) => ({
      order_id: orderData.orderId,
      recipient_phone: adminPhones[index],
      message_body: smsMessage,
      sent_at: new Date().toISOString(),
      status: result.status === 'fulfilled' ? 'sent' : 'failed',
      twilio_sid: result.status === 'fulfilled' ? (result as any).value.sid : null,
      error_message: result.status === 'rejected' ? (result as any).reason?.message ?? String((result as any).reason) : null,
    }));

    // Insert logs but don't fail the whole request if the insert errors — just log it
    const { error: insertError } = await supabase.from('sms_notifications').insert(notificationRecords);
    if (insertError) {
      console.warn('Failed to insert sms_notifications records:', insertError);
    }

    // Return success even if some messages failed (partial success)
    if (successfulSends.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Failed to send SMS to all recipients',
          failed: failedSends.length,
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
        message: 'Order SMS notifications processed',
        sent: successfulSends.length,
        failed: failedSends.length,
        total: adminPhones.length,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error('=== Send Order SMS Notification Error ===');
    console.error('Error:', error);
    console.error('Error message:', error?.message ?? String(error));
    return new Response(
      JSON.stringify({
        error: error?.message || 'Failed to send order SMS notifications',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});