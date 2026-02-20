
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface OrderEmailData {
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

serve(async (req) => {
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

  console.log('=== Send Order Confirmation Email Request ===');

  try {
    // Get Supabase client
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
        persistSession: false
      }
    });

    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify user is authenticated
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error('Authentication error:', authError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const orderData: OrderEmailData = await req.json();
    console.log('Order data received:', orderData.orderId);

    // ============================================================================
    // IDEMPOTENCY CHECK: Prevent duplicate notifications for the same order
    // ============================================================================
    const { data: existingNotification, error: checkError } = await supabase
      .from('email_notifications')
      .select('id')
      .eq('order_id', orderData.orderId)
      .eq('status', 'sent')
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      // PGRST116 = no rows found (which is expected)
      console.error('Error checking for existing notifications:', checkError);
    }

    if (existingNotification) {
      console.log('⚠️ Email already sent for this order. Returning success (idempotent):', orderData.orderId);
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Order confirmation email already sent (idempotent)',
          alreadySent: true
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    // Get active admin email recipients from database
    const { data: emailRecords, error: emailError } = await supabase
      .from('admin_notification_emails')
      .select('email')
      .eq('is_active', true);

    if (emailError) {
      console.error('Error fetching admin notification emails:', emailError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch admin email recipients' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!emailRecords || emailRecords.length === 0) {
      console.warn('No active admin notification emails configured');
      // Fallback to environment variable if database is empty
      const adminEmailsEnv = Deno.env.get('ADMIN_EMAIL_RECIPIENTS');
      if (!adminEmailsEnv) {
        console.error('No admin email recipients configured in database or environment');
        return new Response(
          JSON.stringify({ error: 'Admin email recipients not configured' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const adminEmails = adminEmailsEnv.split(',').map(email => email.trim());
      console.log('Using fallback emails from environment:', adminEmails);
    }

    const adminEmails = emailRecords.map(record => record.email);
    console.log('Sending emails to:', adminEmails);

    // Get SMTP configuration from environment
    const smtpHost = Deno.env.get('SMTP_HOST');
    const smtpPort = Deno.env.get('SMTP_PORT');
    const smtpUser = Deno.env.get('SMTP_USER');
    const smtpPassword = Deno.env.get('SMTP_PASSWORD');
    const smtpFrom = Deno.env.get('SMTP_FROM') || 'orders@jagabansla.com';

    if (!smtpHost || !smtpPort || !smtpUser || !smtpPassword) {
      console.error('SMTP configuration incomplete');
      return new Response(
        JSON.stringify({ error: 'Email service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Format order items for email
    const itemsHtml = orderData.items.map(item => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #eee;">${item.name}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">$${item.price.toFixed(2)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">$${(item.price * item.quantity).toFixed(2)}</td>
      </tr>
    `).join('');

    // Create HTML email content
    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Order - Jagabans LA</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #D4AF37 0%, #4AD7C2 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 28px;">New Order Received</h1>
    <p style="color: white; margin: 10px 0 0 0; font-size: 16px;">Jagabans LA</p>
  </div>
  
  <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px;">
    <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
      <h2 style="color: #D4AF37; margin-top: 0;">Order Details</h2>
      <p><strong>Order ID:</strong> ${orderData.orderId}</p>
      <p><strong>Order Type:</strong> ${orderData.orderType === 'delivery' ? 'Delivery' : 'Pickup'}</p>
      <p><strong>Date:</strong> ${new Date(orderData.timestamp).toLocaleString('en-US', { 
        dateStyle: 'full', 
        timeStyle: 'short' 
      })}</p>
    </div>

    <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
      <h2 style="color: #D4AF37; margin-top: 0;">Customer Information</h2>
      <p><strong>Name:</strong> ${orderData.customerName}</p>
      <p><strong>Email:</strong> ${orderData.customerEmail}</p>
      ${orderData.customerPhone ? `<p><strong>Phone:</strong> ${orderData.customerPhone}</p>` : ''}
      ${orderData.orderType === 'delivery' && orderData.deliveryAddress ? `
        <p><strong>Delivery Address:</strong><br>${orderData.deliveryAddress}</p>
      ` : ''}
      ${orderData.orderType === 'pickup' && orderData.pickupNotes ? `
        <p><strong>Pickup Notes:</strong><br>${orderData.pickupNotes}</p>
      ` : ''}
    </div>

    <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
      <h2 style="color: #D4AF37; margin-top: 0;">Order Items</h2>
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="background: #f5f5f5;">
            <th style="padding: 10px; text-align: left; border-bottom: 2px solid #D4AF37;">Item</th>
            <th style="padding: 10px; text-align: center; border-bottom: 2px solid #D4AF37;">Qty</th>
            <th style="padding: 10px; text-align: right; border-bottom: 2px solid #D4AF37;">Price</th>
            <th style="padding: 10px; text-align: right; border-bottom: 2px solid #D4AF37;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>
    </div>

    <div style="background: white; padding: 20px; border-radius: 8px;">
      <h2 style="color: #D4AF37; margin-top: 0;">Payment Summary</h2>
      <table style="width: 100%;">
        <tr>
          <td style="padding: 5px 0;"><strong>Subtotal:</strong></td>
          <td style="padding: 5px 0; text-align: right;">$${orderData.subtotal.toFixed(2)}</td>
        </tr>
        <tr>
          <td style="padding: 5px 0;"><strong>Tax:</strong></td>
          <td style="padding: 5px 0; text-align: right;">$${orderData.tax.toFixed(2)}</td>
        </tr>
        <tr style="border-top: 2px solid #D4AF37;">
          <td style="padding: 10px 0;"><strong style="font-size: 18px; color: #D4AF37;">Total Paid:</strong></td>
          <td style="padding: 10px 0; text-align: right;"><strong style="font-size: 18px; color: #D4AF37;">$${orderData.total.toFixed(2)}</strong></td>
        </tr>
      </table>
    </div>

    <div style="margin-top: 30px; padding: 20px; background: #fff3cd; border-left: 4px solid #D4AF37; border-radius: 4px;">
      <p style="margin: 0; color: #856404;">
        <strong>⚠️ Action Required:</strong> This order has been paid and is ready to be prepared. 
        Please log in to the admin dashboard to update the order status.
      </p>
    </div>
  </div>

  <div style="text-align: center; padding: 20px; color: #666; font-size: 12px;">
    <p>This is an automated notification from Jagabans LA order system.</p>
    <p>© ${new Date().getFullYear()} Jagabans LA. All rights reserved.</p>
  </div>
</body>
</html>
    `;

    // Create plain text version
    const emailText = `
New Order Received - Jagabans LA

Order Details:
- Order ID: ${orderData.orderId}
- Order Type: ${orderData.orderType === 'delivery' ? 'Delivery' : 'Pickup'}
- Date: ${new Date(orderData.timestamp).toLocaleString()}

Customer Information:
- Name: ${orderData.customerName}
- Email: ${orderData.customerEmail}
${orderData.customerPhone ? `- Phone: ${orderData.customerPhone}` : ''}
${orderData.orderType === 'delivery' && orderData.deliveryAddress ? `- Delivery Address: ${orderData.deliveryAddress}` : ''}
${orderData.orderType === 'pickup' && orderData.pickupNotes ? `- Pickup Notes: ${orderData.pickupNotes}` : ''}

Order Items:
${orderData.items.map(item => `- ${item.name} x${item.quantity} - $${(item.price * item.quantity).toFixed(2)}`).join('\n')}

Payment Summary:
- Subtotal: $${orderData.subtotal.toFixed(2)}
- Tax: $${orderData.tax.toFixed(2)}
- Total Paid: $${orderData.total.toFixed(2)}

This order has been paid and is ready to be prepared.
Please log in to the admin dashboard to update the order status.

---
This is an automated notification from Jagabans LA order system.
© ${new Date().getFullYear()} Jagabans LA. All rights reserved.
    `;

    // Send email using SMTP (using a simple fetch to an SMTP relay service)
    // Note: In production, you would use a service like SendGrid, Mailgun, or AWS SES
    // For now, we'll use Resend API which is simple and reliable
    
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    
    if (resendApiKey) {
      // Use Resend API
      console.log('Sending email via Resend API...');
      
      const resendResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: smtpFrom,
          to: adminEmails,
          subject: `New Order #${orderData.orderId.substring(0, 8)} - ${orderData.orderType === 'delivery' ? 'Delivery' : 'Pickup'}`,
          html: emailHtml,
          text: emailText,
        }),
      });

      if (!resendResponse.ok) {
        const errorText = await resendResponse.text();
        console.error('Resend API error:', errorText);
        throw new Error(`Failed to send email: ${errorText}`);
      }

      const resendResult = await resendResponse.json();
      console.log('Email sent successfully via Resend:', resendResult);
    } else {
      // Fallback: Log email content (for development/testing)
      console.log('RESEND_API_KEY not configured - email would be sent to:', adminEmails);
      console.log('Email subject:', `New Order #${orderData.orderId.substring(0, 8)} - ${orderData.orderType === 'delivery' ? 'Delivery' : 'Pickup'}`);
      console.log('Email content logged (not sent)');
    }

    // Log the email notification in the database for audit trail
    await supabase
      .from('email_notifications')
      .insert({
        order_id: orderData.orderId,
        recipient_emails: adminEmails,
        subject: `New Order #${orderData.orderId.substring(0, 8)} - ${orderData.orderType === 'delivery' ? 'Delivery' : 'Pickup'}`,
        sent_at: new Date().toISOString(),
        status: 'sent',
      });

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Order confirmation email sent successfully',
        recipients: adminEmails.length
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error('=== Send Order Confirmation Email Error ===');
    console.error('Error:', error);
    console.error('Error message:', error.message);
    return new Response(
      JSON.stringify({
        error: error.message || 'Failed to send order confirmation email',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
