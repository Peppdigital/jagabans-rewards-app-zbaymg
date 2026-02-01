import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/**
 * Get Uber OAuth token (Sandbox)
 */
async function getUberAccessToken(
  clientId: string,
  clientSecret: string
): Promise<string> {
  const res = await fetch(
    'https://sandbox-login.uber.com/oauth/v2/token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'client_credentials',
        scope: 'delivery',
      }),
    }
  );

  if (!res.ok) {
    throw new Error(`Uber OAuth failed: ${await res.text()}`);
  }

  const data = await res.json();
  return data.access_token;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const webhookPayload = await req.json();
    console.log('Stripe webhook received:', webhookPayload.type);

    // Only handle payment success
    if (webhookPayload.type !== 'payment_intent.succeeded') {
      return new Response(JSON.stringify({ received: true }), { headers: corsHeaders });
    }

    const paymentIntent = webhookPayload.data.object;
    const paymentId = paymentIntent.id;
    const customerId = paymentIntent.customer;

    console.log('Processing payment intent:', paymentId);
    console.log('Customer ID:', customerId);
    console.log('Payment metadata:', paymentIntent.metadata);

    // --- 🔧 FIX: Determine user_id from metadata OR customer lookup ---
    let userId = paymentIntent.metadata?.user_id;

    if (!userId && customerId) {
      console.log('⚠️ No user_id in metadata, looking up from Stripe customer...');
      
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('user_id')
        .eq('stripe_customer_id', customerId)
        .single();
      
      if (profileError) {
        console.error('Error looking up user from customer:', profileError);
      } else if (profile) {
        userId = profile.user_id;
        console.log('✓ Found user_id from customer:', userId);
      }
    }

    if (!userId) {
      console.error('❌ Could not determine user_id for payment');
      console.error('Available metadata keys:', Object.keys(paymentIntent.metadata || {}));
      throw new Error(
        'Could not determine user_id for payment. ' +
        'Payment metadata must include user_id, or customer must be linked to a user_profile.'
      );
    }

    console.log('✓ Using user_id:', userId);

    // --- 1️⃣ Store payment record with enhanced metadata ---
    const enhancedMetadata = {
      ...paymentIntent.metadata,
      user_id: userId, // Ensure user_id is always in metadata
    };

    const { error: paymentInsertError } = await supabase
      .from('stripe_payments')
      .upsert({
        payment_id: paymentId,
        user_id: userId,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        status: 'succeeded',
        payment_method: paymentIntent.payment_method,
        metadata: enhancedMetadata, // Store enhanced metadata
      }, {
        onConflict: 'payment_id'
      });

    if (paymentInsertError) {
      console.error('Error storing payment:', paymentInsertError);
      throw new Error('Failed to store payment record');
    }

    console.log('✓ Payment record stored');

    // --- 2️⃣ Create Order using RPC function ---
    console.log('Creating order from payment...');
    
    const { data: orderData, error: rpcError } = await supabase
      .rpc('create_order_from_payment', { 
        stripe_payment_intent_id: paymentId 
      });

    if (rpcError) {
      console.error('RPC Error:', rpcError);
      console.error('RPC Error details:', {
        message: rpcError.message,
        details: rpcError.details,
        hint: rpcError.hint,
        code: rpcError.code,
      });
      throw new Error(`Failed to create order: ${rpcError.message}`);
    }

    if (!orderData) {
      throw new Error('Failed to create order: No data returned from RPC');
    }

    console.log('✓ Order created:', orderData.id);
    console.log('✓ Order type:', orderData.order_type);

    // Extract order details from returned JSON
    const order = {
      id: orderData.id,
      user_id: orderData.user_id,
      customer_name: orderData.customer_name,
      customer_email: orderData.customer_email,
      customer_phone: orderData.customer_phone,
      items: orderData.items,
      subtotal: orderData.subtotal,
      tax: orderData.tax,
      total: orderData.total,
      delivery_address: orderData.delivery_address,
      pickup_notes: orderData.pickup_notes,
      order_type: orderData.order_type,
    };

    const orderPayload = {
      orderId: order.id,
      user_id: orderData.user_id,
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

    // --- 🔧 FIX: Verify FUNCTIONS_URL is set ---
    const FUNCTIONS_URL = Deno.env.get('FUNCTIONS_URL');
    if (!FUNCTIONS_URL) {
      console.error('❌ FUNCTIONS_URL environment variable not set!');
      console.error('⚠️ Skipping admin notifications');
    } else {
      console.log('📍 FUNCTIONS_URL:', FUNCTIONS_URL);
    }

    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const headers = { 
      'Content-Type': 'application/json', 
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` 
    };

    // --- 3️⃣ Admin Notifications (IMPROVED) ---
    // Option A: Make them blocking with better error handling
    if (FUNCTIONS_URL) {
      console.log('📧 Sending admin notifications...');
      
      try {
        const results = await Promise.allSettled([
          fetch(`${FUNCTIONS_URL}/send-order-confirmation-email`, { 
            method: 'POST', 
            headers, 
            body: JSON.stringify(orderPayload) 
          }).then(async res => {
            const text = await res.text();
            if (!res.ok) {
              throw new Error(`Email function returned ${res.status}: ${text}`);
            }
            return { type: 'email', response: text };
          }),
          fetch(`${FUNCTIONS_URL}/send-order-confirmation-sms`, { 
            method: 'POST', 
            headers, 
            body: JSON.stringify(orderPayload) 
          }).then(async res => {
            const text = await res.text();
            if (!res.ok) {
              throw new Error(`SMS function returned ${res.status}: ${text}`);
            }
            return { type: 'sms', response: text };
          }),
        ]);

        results.forEach((result, index) => {
          const notifType = index === 0 ? 'email' : 'sms';
          if (result.status === 'rejected') {
            console.error(`❌ Admin ${notifType} notification failed:`, result.reason);
          } else if (result.status === 'fulfilled') {
            console.log(`✓ Admin ${notifType} notification sent:`, result.value);
          }
        });
      } catch (err) {
        console.error('❌ Error sending admin notifications:', err);
        // Don't throw - continue processing
      }
    }

    // --- 4️⃣ Customer Email (improved error handling) ---
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (resendApiKey && order.customer_email) {
      console.log('📧 Sending customer email to:', order.customer_email);
      
      const orderNumber = order.id.substring(0, 8).toUpperCase();
      const orderDate = new Date().toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
      
      // Format items for email
      const itemsHtml = order.items.map((item: any) => `
        <tr>
          <td style="padding: 12px 0; border-bottom: 1px solid #f0f0f0;">
            <div style="font-weight: 500; color: #1a1a1a; margin-bottom: 4px;">${item.name}</div>
            <div style="font-size: 14px; color: #666;">Qty: ${item.quantity}</div>
          </td>
          <td style="padding: 12px 0; border-bottom: 1px solid #f0f0f0; text-align: right; font-weight: 500; color: #1a1a1a;">
            ${(item.price * item.quantity).toFixed(2)}
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
          
          <!-- Header with Gradient -->
          <tr>
            <td style="background: linear-gradient(135deg, #4AD7C2 0%, #D4AF37 100%); padding: 40px 40px 35px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">
                Order Confirmed
              </h1>
              <p style="margin: 8px 0 0; color: rgba(255, 255, 255, 0.95); font-size: 16px;">
                Thank you for your order!
              </p>
            </td>
          </tr>

          <!-- Order Number Badge -->
          <tr>
            <td style="padding: 0 40px;">
              <div style="margin-top: -20px; background-color: #1a1a1a; color: #D4AF37; padding: 12px 24px; border-radius: 8px; text-align: center; display: inline-block; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);">
                <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 1px; opacity: 0.8; margin-bottom: 4px;">Order Number</div>
                <div style="font-size: 20px; font-weight: 700; letter-spacing: 1px;">#${orderNumber}</div>
              </div>
            </td>
          </tr>

          <!-- Greeting -->
          <tr>
            <td style="padding: 32px 40px 24px;">
              <p style="margin: 0; font-size: 16px; color: #1a1a1a; line-height: 1.6;">
                Dear ${order.customer_name || 'Valued Customer'},
              </p>
              <p style="margin: 16px 0 0; font-size: 15px; color: #4a5568; line-height: 1.6;">
                We've received your order and our kitchen is already preparing your delicious meal. ${order.order_type === 'delivery' ? 'Your order will be delivered to your specified address.' : 'You can pick up your order at our location.'}
              </p>
            </td>
          </tr>

          <!-- Order Details -->
          <tr>
            <td style="padding: 0 40px 24px;">
              <div style="background-color: #f8f9fa; border-radius: 8px; padding: 24px; border-left: 4px solid #4AD7C2;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding-bottom: 12px;">
                      <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #666; font-weight: 600;">Order Type</div>
                      <div style="font-size: 16px; color: #1a1a1a; font-weight: 500; margin-top: 4px; text-transform: capitalize;">${order.order_type}</div>
                    </td>
                    <td style="padding-bottom: 12px; text-align: right;">
                      <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #666; font-weight: 600;">Order Date</div>
                      <div style="font-size: 16px; color: #1a1a1a; font-weight: 500; margin-top: 4px;">${orderDate}</div>
                    </td>
                  </tr>
                  ${order.order_type === 'delivery' && order.delivery_address ? `
                  <tr>
                    <td colspan="2" style="padding-top: 12px; border-top: 1px solid #e2e8f0;">
                      <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #666; font-weight: 600; margin-bottom: 6px;">Delivery Address</div>
                      <div style="font-size: 15px; color: #1a1a1a; line-height: 1.5;">${order.delivery_address}</div>
                    </td>
                  </tr>
                  ` : ''}
                </table>
              </div>
            </td>
          </tr>

          <!-- Order Items -->
          <tr>
            <td style="padding: 0 40px 32px;">
              <h2 style="margin: 0 0 16px; font-size: 18px; color: #1a1a1a; font-weight: 600;">Order Items</h2>
              <table width="100%" cellpadding="0" cellspacing="0" style="border-top: 2px solid #e2e8f0;">
                ${itemsHtml}
              </table>
            </td>
          </tr>

          <!-- Order Summary -->
          <tr>
            <td style="padding: 0 40px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f9fa; border-radius: 8px; padding: 20px;">
                <tr>
                  <td style="padding: 8px 0; font-size: 15px; color: #4a5568;">Subtotal</td>
                  <td style="padding: 8px 0; text-align: right; font-size: 15px; color: #1a1a1a; font-weight: 500;">${order.subtotal.toFixed(2)}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-size: 15px; color: #4a5568;">Tax</td>
                  <td style="padding: 8px 0; text-align: right; font-size: 15px; color: #1a1a1a; font-weight: 500;">${order.tax.toFixed(2)}</td>
                </tr>
                <tr>
                  <td style="padding: 16px 0 0; font-size: 18px; color: #1a1a1a; font-weight: 700; border-top: 2px solid #d4af37;">Total</td>
                  <td style="padding: 16px 0 0; text-align: right; font-size: 20px; color: #4AD7C2; font-weight: 700; border-top: 2px solid #d4af37;">${order.total.toFixed(2)}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Call to Action -->
          <!--tr>
            <td style="padding: 0 40px 32px; text-align: center;">
              <a href="https://jagabansla.com/orders" style="display: inline-block; background: linear-gradient(135deg, #4AD7C2 0%, #2ab3a0 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 15px; box-shadow: 0 4px 12px rgba(74, 215, 194, 0.3);">
                Track Your Order
              </a>
            </td>
          </tr-->

          <!-- Footer -->
          <tr>
            <td style="background-color: #1a1a1a; padding: 32px 40px; text-align: center;">
              <div style="margin-bottom: 16px;">
                <h3 style="margin: 0; color: #D4AF37; font-size: 22px; font-weight: 700; letter-spacing: 0.5px;">Jagabans L.A.</h3>
              </div>
              <p style="margin: 0 0 12px; font-size: 14px; color: rgba(255, 255, 255, 0.7); line-height: 1.6;">
                Questions about your order? We're here to help.
              </p>
              <p style="margin: 0; font-size: 14px; color: rgba(255, 255, 255, 0.9);">
                <a href="mailto:orders@jagabansla.com" style="color: #4AD7C2; text-decoration: none;">orders@jagabansla.com</a>
              </p>
              <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid rgba(255, 255, 255, 0.1);">
                <p style="margin: 0; font-size: 12px; color: rgba(255, 255, 255, 0.5);">
                  © ${new Date().getFullYear()} Jagabans L.A. All rights reserved.
                </p>
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
      `;

      try {
        const emailResponse = await fetch('https://api.resend.com/emails', {
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
        
        const emailText = await emailResponse.text();
        if (emailResponse.ok) {
          console.log('✓ Customer email sent:', emailText);
        } else {
          console.error('❌ Customer email failed:', emailResponse.status, emailText);
        }
      } catch (err) {
        console.error('❌ Customer email error:', err);
      }
    } else {
      if (!resendApiKey) console.log('⚠️ RESEND_API_KEY not set, skipping customer email');
      if (!order.customer_email) console.log('⚠️ No customer email, skipping customer email');
    }

    // --- 5️⃣ Automatic Uber Direct Delivery (NEW) ---
    if (order.order_type === 'delivery' && order.delivery_address) {
      const uberClientId = Deno.env.get('UBER_CLIENT_ID');
      const uberClientSecret = Deno.env.get('UBER_CLIENT_SECRET');
      
      if (uberClientId && uberClientSecret) {
        console.log('🚗 Creating Uber Direct delivery...');
        
        try {
          // Get Uber OAuth token
          const accessToken = await getUberAccessToken(uberClientId, uberClientSecret);
          
          // Parse delivery address (assuming it's stored as a string)
          // You may need to adjust this based on how delivery_address is stored
          const deliveryAddress = order.delivery_address;
          
          // Restaurant pickup address (you should configure this)
          const pickupAddress = Deno.env.get('RESTAURANT_ADDRESS') || 
            'Your Restaurant Address, City, State ZIP, Country';
          const pickupName = Deno.env.get('RESTAURANT_NAME') || 'Jagabans L.A.';
          const pickupPhone = Deno.env.get('RESTAURANT_PHONE') || '+1234567890';
          
          // Prepare Uber Direct payload
          const deliveryPayload = {
            external_id: order.id,
            
            pickup_name: pickupName,
            pickup_phone_number: pickupPhone,
            pickup_address: pickupAddress,
            pickup_notes: order.pickup_notes || 'Food order ready for pickup',
            
            dropoff_name: order.customer_name,
            dropoff_phone_number: order.customer_phone,
            dropoff_address: deliveryAddress,
            dropoff_notes: order.pickup_notes || '',
            
            manifest_items: order.items.map((item: any) => ({
              name: item.name,
              quantity: item.quantity,
            })),
            
            pickup_ready_dt: new Date().toISOString(),
          };
          
          console.log('Uber Direct payload:', JSON.stringify(deliveryPayload, null, 2));
          
          // Create Uber delivery
          const uberResponse = await fetch(
            'https://sandbox-api.uber.com/v1/deliveries',
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(deliveryPayload),
            }
          );
          
          const uberText = await uberResponse.text();
          if (uberResponse.ok) {
            const delivery = JSON.parse(uberText);
            console.log('✓ Uber Direct delivery created:', delivery);
            
            // Update order with Uber delivery info
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
            
            console.log('✓ Order updated with Uber delivery info');
          } else {
            console.error('❌ Uber Direct API failed:', uberResponse.status, uberText);
          }
        } catch (err) {
          console.error('❌ Uber Direct error:', err);
        }
      } else {
        console.log('⚠️ Uber credentials not set, skipping delivery creation');
      }
    }

    // --- 5️⃣ Automatic DoorDash Delivery (DISABLED) ---
    /*
    if (order.order_type === 'delivery' && order.delivery_address) {
      const doordashApiUrl = Deno.env.get('DOORDASH_API_URL');
      const doordashApiKey = Deno.env.get('DOORDASH_API_KEY');
      
      if (doordashApiUrl && doordashApiKey) {
        console.log('🚗 Creating DoorDash delivery...');
        
        try {
          const ddResponse = await fetch(doordashApiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${doordashApiKey}`,
            },
            body: JSON.stringify({
              order_id: order.id,
              customer_name: order.customer_name,
              customer_phone: order.customer_phone,
              delivery_address: order.delivery_address,
              items: order.items,
              notes: order.pickup_notes,
            }),
          });
          
          const ddText = await ddResponse.text();
          if (ddResponse.ok) {
            console.log('✓ DoorDash delivery created:', ddText);
          } else {
            console.error('❌ DoorDash API failed:', ddResponse.status, ddText);
          }
        } catch (err) {
          console.error('❌ DoorDash error:', err);
        }
      } else {
        console.log('⚠️ DoorDash credentials not set, skipping delivery creation');
      }
    }
    */

    return new Response(
      JSON.stringify({ 
        success: true, 
        orderId: order.id 
      }), 
      { headers: corsHeaders }
    );

  } catch (err: any) {
    console.error('❌ Error processing webhook:', err);
    console.error('Error message:', err.message);
    console.error('Error stack:', err.stack);
    return new Response(
      JSON.stringify({ 
        error: err.message || 'Webhook processing failed' 
      }), 
      { status: 500, headers: corsHeaders }
    );
  }
});