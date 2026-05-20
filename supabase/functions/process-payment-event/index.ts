import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * 🔄 PAYMENT EVENT PROCESSOR
 * 
 * Triggered by: Database trigger on payment_events table (status = 'pending')
 * OR: Cron job for retry logic
 * 
 * Responsibilities:
 * 1. Create order from payment
 * 2. Send customer email
 * 3. Send admin notifications
 * 4. Trigger delivery (Uber Direct)
 * 
 * Each step is fault-isolated with proper error handling.
 */

interface PaymentEvent {
  id: string;
  payment_id: string;
  user_id: string;
  event_type: string;
  payload: any;
  status: string;
  retry_count: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { event_id } = await req.json();

    if (!event_id) {
      throw new Error('Missing event_id');
    }

    // --- 1️⃣ FETCH EVENT ---
    const { data: event, error: fetchError } = await supabase
      .from('payment_events')
      .select('*')
      .eq('id', event_id)
      .single();

    if (fetchError || !event) {
      throw new Error('Event not found');
    }

    console.log(`[Event Processor] Processing event ${event_id} (attempt ${event.retry_count + 1})`);

    // Mark as processing
    await supabase
      .from('payment_events')
      .update({ 
        status: 'processing',
        processing_started_at: new Date().toISOString(),
      })
      .eq('id', event_id);

    const results = {
      order_created: false,
      customer_email_sent: false,
      admin_notifications_sent: false,
      delivery_created: false,
      errors: [] as string[],
    };

    // --- 2️⃣ CREATE ORDER ---
    try {
      const { data: orderData, error: orderError } = await supabase
        .rpc('create_order_from_payment', { 
          stripe_payment_intent_id: event.payment_id 
        });

      if (orderError) throw orderError;
      if (!orderData) throw new Error('No order data returned');

      results.order_created = true;
      console.log(`[Event Processor] ✓ Order created: ${orderData.id}`);

      // --- 3️⃣ SEND CUSTOMER EMAIL (non-blocking) ---
      await sendCustomerEmail(supabase, orderData)
        .then(() => {
          results.customer_email_sent = true;
          console.log(`[Event Processor] ✓ Customer email sent`);
        })
        .catch((err) => {
          results.errors.push(`Customer email failed: ${err.message}`);
          console.error(`[Event Processor] ⚠️ Customer email failed:`, err);
        });

      // --- 4️⃣ SEND ADMIN NOTIFICATIONS (non-blocking) ---
      await sendAdminNotifications(supabase, orderData)
        .then(() => {
          results.admin_notifications_sent = true;
          console.log(`[Event Processor] ✓ Admin notifications sent`);
        })
        .catch((err) => {
          results.errors.push(`Admin notifications failed: ${err.message}`);
          console.error(`[Event Processor] ⚠️ Admin notifications failed:`, err);
        });

      // --- 5️⃣ CREATE DELIVERY (non-blocking) ---
      if (orderData.order_type === 'delivery' && orderData.delivery_address) {
        await createUberDelivery(supabase, orderData)
          .then(() => {
            results.delivery_created = true;
            console.log(`[Event Processor] ✓ Uber delivery created`);
          })
          .catch((err) => {
            results.errors.push(`Uber delivery failed: ${err.message}`);
            console.error(`[Event Processor] ⚠️ Uber delivery failed:`, err);
          });
      }

      // --- 6️⃣ MARK EVENT AS COMPLETED ---
      await supabase
        .from('payment_events')
        .update({ 
          status: 'completed',
          completed_at: new Date().toISOString(),
          processing_result: results,
        })
        .eq('id', event_id);

      const duration = Date.now() - startTime;
      console.log(`[Event Processor] ✅ Event processed in ${duration}ms`);

      return new Response(
        JSON.stringify({ 
          success: true,
          event_id,
          results,
          duration_ms: duration,
        }), 
        { headers: corsHeaders }
      );

    } catch (orderError: any) {
      // Critical failure - retry later
      console.error(`[Event Processor] ❌ Order creation failed:`, orderError);

      const retry_count = event.retry_count + 1;
      const max_retries = 5;

      if (retry_count >= max_retries) {
        // Give up after max retries
        await supabase
          .from('payment_events')
          .update({ 
            status: 'failed',
            failed_at: new Date().toISOString(),
            error: orderError.message,
            retry_count,
          })
          .eq('id', event_id);

        console.error(`[Event Processor] ❌ Max retries reached for event ${event_id}`);
      } else {
        // Retry later
        await supabase
          .from('payment_events')
          .update({ 
            status: 'pending',
            retry_count,
            error: orderError.message,
            next_retry_at: new Date(Date.now() + Math.pow(2, retry_count) * 60000).toISOString(), // Exponential backoff
          })
          .eq('id', event_id);

        console.log(`[Event Processor] 🔄 Scheduled retry ${retry_count}/${max_retries} for event ${event_id}`);
      }

      throw orderError;
    }

  } catch (err: any) {
    const duration = Date.now() - startTime;
    console.error(`[Event Processor] ❌ Error after ${duration}ms:`, err.message);
    
    return new Response(
      JSON.stringify({ 
        error: err.message,
        duration_ms: duration,
      }), 
      { status: 500, headers: corsHeaders }
    );
  }
});

/**
 * 📧 Send customer confirmation email
 */
async function sendCustomerEmail(supabase: any, order: any): Promise<void> {
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  
  if (!resendApiKey) {
    throw new Error('RESEND_API_KEY not configured');
  }

  if (!order.customer_email) {
    throw new Error('No customer email provided');
  }

  const orderNumber = order.id.substring(0, 8).toUpperCase();
  const orderDate = new Date().toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });

  const itemsHtml = order.items.map((item: any) => `
    <tr>
      <td style="padding: 12px 0; border-bottom: 1px solid #f0f0f0;">
        <div style="font-weight: 500; color: #1a1a1a; margin-bottom: 4px;">${item.name}</div>
        <div style="font-size: 14px; color: #666;">Qty: ${item.quantity}</div>
      </td>
      <td style="padding: 12px 0; border-bottom: 1px solid #f0f0f0; text-align: right; font-weight: 500; color: #1a1a1a;">
        $${(item.price * item.quantity).toFixed(2)}
      </td>
    </tr>
  `).join('');

  const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Order Confirmation</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f8f9fa;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f9fa; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.07);">
          <tr>
            <td style="background: linear-gradient(135deg, #4AD7C2 0%, #D4AF37 100%); padding: 40px 40px 35px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">Order Confirmed</h1>
              <p style="margin: 8px 0 0; color: rgba(255, 255, 255, 0.95); font-size: 16px;">Thank you for your order!</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 40px;">
              <div style="margin-top: -20px; background-color: #1a1a1a; color: #D4AF37; padding: 12px 24px; border-radius: 8px; text-align: center; display: inline-block; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);">
                <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 1px; opacity: 0.8; margin-bottom: 4px;">Order Number</div>
                <div style="font-size: 20px; font-weight: 700; letter-spacing: 1px;">#${orderNumber}</div>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px 40px 24px;">
              <p style="margin: 0; font-size: 16px; color: #1a1a1a;">Dear ${order.customer_name || 'Valued Customer'},</p>
              <p style="margin: 16px 0 0; font-size: 15px; color: #4a5568; line-height: 1.6;">
                We've received your order and our kitchen is preparing your meal. 
                ${order.order_type === 'delivery' ? 'Your order will be delivered to your address.' : 'You can pick up your order at our location.'}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 40px 32px;">
              <h2 style="margin: 0 0 16px; font-size: 18px; color: #1a1a1a; font-weight: 600;">Order Items</h2>
              <table width="100%" cellpadding="0" cellspacing="0" style="border-top: 2px solid #e2e8f0;">
                ${itemsHtml}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 40px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f9fa; border-radius: 8px; padding: 20px;">
                <tr>
                  <td style="padding: 8px 0; font-size: 15px; color: #4a5568;">Subtotal</td>
                  <td style="padding: 8px 0; text-align: right; font-size: 15px; color: #1a1a1a; font-weight: 500;">$${order.subtotal.toFixed(2)}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-size: 15px; color: #4a5568;">Tax</td>
                  <td style="padding: 8px 0; text-align: right; font-size: 15px; color: #1a1a1a; font-weight: 500;">$${order.tax.toFixed(2)}</td>
                </tr>
                <tr>
                  <td style="padding: 16px 0 0; font-size: 18px; color: #1a1a1a; font-weight: 700; border-top: 2px solid #d4af37;">Total</td>
                  <td style="padding: 16px 0 0; text-align: right; font-size: 20px; color: #4AD7C2; font-weight: 700; border-top: 2px solid #d4af37;">$${order.total.toFixed(2)}</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color: #1a1a1a; padding: 32px 40px; text-align: center;">
              <h3 style="margin: 0 0 16px; color: #D4AF37; font-size: 22px; font-weight: 700;">Jagabans L.A.</h3>
              <p style="margin: 0 0 12px; font-size: 14px; color: rgba(255, 255, 255, 0.7);">Questions? We're here to help.</p>
              <p style="margin: 0; font-size: 14px; color: rgba(255, 255, 255, 0.9);">
                <a href="mailto:orders@jagabansla.com" style="color: #4AD7C2; text-decoration: none;">orders@jagabansla.com</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 
      Authorization: `Bearer ${resendApiKey}`, 
      'Content-Type': 'application/json' 
    },
    body: JSON.stringify({
      from: 'Jagabans L.A. <info@jagabansla.com>',
      to: [order.customer_email],
      subject: `Order Confirmed #${orderNumber} - Jagabans L.A.`,
      html: emailHtml,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Email API error: ${response.status} - ${error}`);
  }
}

/**
 * 🔔 Send admin notifications (email + SMS)
 */
async function sendAdminNotifications(supabase: any, order: any): Promise<void> {
  const FUNCTIONS_URL = Deno.env.get('FUNCTIONS_URL');
  
  if (!FUNCTIONS_URL) {
    throw new Error('FUNCTIONS_URL not configured');
  }

  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const headers = { 
    'Content-Type': 'application/json', 
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` 
  };

  const orderPayload = {
    orderId: order.id,
    user_id: order.user_id,
    customerName: order.customer_name,
    customerEmail: order.customer_email,
    customerPhone: order.customer_phone,
    items: order.items,
    subtotal: order.subtotal,
    tax: order.tax,
    total: order.total,
    deliveryAddress: order.delivery_address,
    pickupNotes: order.pickup_notes,
    orderType: order.order_type,
    timestamp: new Date().toISOString(),
  };

  const results = await Promise.allSettled([
    fetch(`${FUNCTIONS_URL}/send-order-confirmation-email`, { 
      method: 'POST', 
      headers, 
      body: JSON.stringify(orderPayload) 
    }),
    fetch(`${FUNCTIONS_URL}/send-order-confirmation-sms`, { 
      method: 'POST', 
      headers, 
      body: JSON.stringify(orderPayload) 
    }),
  ]);

  const failures = results.filter(r => r.status === 'rejected');
  if (failures.length > 0) {
    throw new Error(`${failures.length} admin notification(s) failed`);
  }
}

/**
 * 🚗 Create Uber Direct delivery
 */
async function createUberDelivery(supabase: any, order: any): Promise<void> {
  const uberClientId = Deno.env.get('UBER_CLIENT_ID');
  const uberClientSecret = Deno.env.get('UBER_CLIENT_SECRET');

  if (!uberClientId || !uberClientSecret) {
    throw new Error('Uber credentials not configured');
  }

  // Get OAuth token
  const tokenResponse = await fetch('https://sandbox-login.uber.com/oauth/v2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: uberClientId,
      client_secret: uberClientSecret,
      grant_type: 'client_credentials',
      scope: 'delivery',
    }),
  });

  if (!tokenResponse.ok) {
    throw new Error(`Uber OAuth failed: ${await tokenResponse.text()}`);
  }

  const { access_token } = await tokenResponse.json();

  // Restaurant details
  const pickupAddress = Deno.env.get('RESTAURANT_ADDRESS') || 
    'Your Restaurant Address, City, State ZIP, Country';
  const pickupName = Deno.env.get('RESTAURANT_NAME') || 'Jagabans L.A.';
  const pickupPhone = Deno.env.get('RESTAURANT_PHONE') || '+1234567890';

  // Create delivery
  const deliveryPayload = {
    external_id: order.id,
    pickup_name: pickupName,
    pickup_phone_number: pickupPhone,
    pickup_address: pickupAddress,
    pickup_notes: order.pickup_notes || 'Food order ready for pickup',
    dropoff_name: order.customer_name,
    dropoff_phone_number: order.customer_phone,
    dropoff_address: order.delivery_address,
    dropoff_notes: order.pickup_notes || '',
    manifest_items: order.items.map((item: any) => ({
      name: item.name,
      quantity: item.quantity,
    })),
    pickup_ready_dt: new Date().toISOString(),
  };

  const deliveryResponse = await fetch('https://sandbox-api.uber.com/v1/deliveries', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(deliveryPayload),
  });

  if (!deliveryResponse.ok) {
    throw new Error(`Uber API failed: ${await deliveryResponse.text()}`);
  }

  const delivery = await deliveryResponse.json();

  // Update order with delivery info
  await supabase
    .from('orders')
    .update({
      uber_delivery_id: delivery.id,
      uber_delivery_status: delivery.status,
      uber_tracking_url: delivery.tracking_url ?? null,
      delivery_triggered_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', order.id);
}
