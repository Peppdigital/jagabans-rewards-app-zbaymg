import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-provider, x-provider-event-id',
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

// Create Supabase client with service role
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// Helper: insert idempotency row; returns true if inserted, false if already exists
async function tryInsertWebhookEvent(provider: string, eventId: string, orderId?: string) {
  try {
    const payload: any = {
      provider,
      event_id: eventId,
      received_at: new Date().toISOString(),
      status: 'processing',
    };
    if (orderId) payload.order_id = orderId;

    const { error, data } = await supabase
      .from('webhook_events')
      .insert(payload);

    if (error) {
      const isConflict = String(error.message).toLowerCase().includes('duplicate') || String(error.code) === '23505';
      if (isConflict) {
        console.info('[Idempotency] Duplicate event detected:', { provider, eventId, orderId });
        return false;
      }
      console.error('[Idempotency] Insert error:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.error('[Idempotency] Unexpected error:', String(err));
    return false;
  }
}

// Helper: mark event as processed
async function markWebhookEventProcessed(provider: string, eventId: string, result: any, status = 'processed') {
  try {
    const { error } = await supabase
      .from('webhook_events')
      .update({
        processed_at: new Date().toISOString(),
        status,
        result,
      })
      .eq('provider', provider)
      .eq('event_id', eventId);

    if (error) {
      console.warn('[Idempotency] Failed to mark processed:', error);
    }
  } catch (err) {
    console.warn('[Idempotency] Failed to mark processed (exception):', String(err));
  }
}

// Helper: send email via Resend
async function sendResendEmail(to: string[] | string, subject: string, html: string) {
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  if (!resendApiKey) throw new Error('RESEND_API_KEY not set');

  const from = Deno.env.get('SMTP_FROM') || 'orders@jagabansla.com';

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      html,
    }),
  });

  const txt = await resp.text();
  let json;
  try { json = JSON.parse(txt); } catch { json = { raw: txt }; }

  if (!resp.ok) {
    const err = new Error(`Resend API error: ${JSON.stringify(json)}`);
    (err as any).status = resp.status;
    throw err;
  }

  return json;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  console.log('[Admin Email] Request received');

  const provider = req.headers.get('x-provider') ?? 'stripe-webhook';
  const providerEventId = req.headers.get('x-provider-event-id') ?? null;

  let orderData: OrderEmailData;
  try {
    orderData = await req.json();
  } catch (err) {
    console.error('[Admin Email] Invalid JSON:', String(err));
    return new Response(
      JSON.stringify({ error: 'Invalid JSON' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const orderId = orderData.orderId;
  const eventId = `email-${providerEventId ?? orderId ?? Date.now()}`;

  console.log('[Admin Email] Event received:', { provider, eventId, orderId });

  // ============================================================================
  // IDEMPOTENCY CHECK
  // ============================================================================
  const inserted = await tryInsertWebhookEvent(provider, eventId, orderId);
  if (!inserted) {
    console.log('[Admin Email] Duplicate or previously processed, returning success');
    return new Response(
      JSON.stringify({ accepted: true, note: 'duplicate-or-insert-failed' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // ============================================================================
  // BACKGROUND PROCESSING
  // ============================================================================
  const background = (async () => {
    try {
      console.log('[Admin Email] Starting background processing');

      // Get admin email recipients
      const { data: emailRecords, error: emailErr } = await supabase
        .from('admin_notification_emails')
        .select('email')
        .eq('is_active', true);

      let adminEmails: string[];
      if (emailErr) {
        console.warn('[Admin Email] Failed to fetch admin emails:', emailErr);
        const envFallback = Deno.env.get('ADMIN_EMAIL_RECIPIENTS') || '';
        adminEmails = envFallback ? envFallback.split(',').map(e => e.trim()) : [];
      } else if (!emailRecords || emailRecords.length === 0) {
        const adminEmailsEnv = Deno.env.get('ADMIN_EMAIL_RECIPIENTS');
        adminEmails = adminEmailsEnv ? adminEmailsEnv.split(',').map(email => email.trim()) : [];
      } else {
        adminEmails = (emailRecords as any[]).map(r => r.email);
      }

      if (adminEmails.length === 0) {
        console.warn('[Admin Email] No recipients configured, skipping');
        await markWebhookEventProcessed(provider, eventId, { note: 'no_recipients' }, 'skipped');
        return;
      }

      console.log('[Admin Email] Sending to', adminEmails.length, 'recipient(s)');

      // Build email HTML
      const itemsHtml = orderData.items.map(item => `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #eee;">${item.name}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">$${item.price.toFixed(2)}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">$${(item.price * item.quantity).toFixed(2)}</td>
        </tr>
      `).join('');

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

      // Send email
      let sendResult: any;
      try {
        sendResult = await sendResendEmail(
          adminEmails,
          `New Order #${orderData.orderId.substring(0, 8)} - ${orderData.orderType === 'delivery' ? 'Delivery' : 'Pickup'}`,
          emailHtml
        );
        console.log('[Admin Email] ✓ Sent successfully');
      } catch (err) {
        console.error('[Admin Email] Send failed:', String(err));
        await markWebhookEventProcessed(provider, eventId, { error: String(err) }, 'errored');
        
        // Log failure
        try {
          await supabase.from('email_notifications').insert({
            order_id: orderData.orderId,
            recipient_emails: adminEmails,
            subject: `New Order #${orderData.orderId.substring(0, 8)}`,
            sent_at: new Date().toISOString(),
            status: 'errored',
            result: { error: String(err) },
          });
        } catch (logErr) {
          console.warn('[Admin Email] Failed to log error:', logErr);
        }
        return;
      }

      // Log success
      try {
        await supabase.from('email_notifications').insert({
          order_id: orderData.orderId,
          recipient_emails: adminEmails,
          subject: `New Order #${orderData.orderId.substring(0, 8)}`,
          sent_at: new Date().toISOString(),
          status: 'sent',
          result: sendResult,
        });
      } catch (err) {
        console.warn('[Admin Email] Failed to log sent email:', err);
      }

      await markWebhookEventProcessed(provider, eventId, { sendResult }, 'processed');

    } catch (err) {
      console.error('[Admin Email] Background error:', String(err));
      await markWebhookEventProcessed(provider, eventId, { error: String(err) }, 'errored');
    }
  })();

  // Use EdgeRuntime.waitUntil if available
  if ((globalThis as any).EdgeRuntime?.waitUntil) {
    try {
      (globalThis as any).EdgeRuntime.waitUntil(background);
    } catch (err) {
      console.warn('[Admin Email] EdgeRuntime.waitUntil failed:', String(err));
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
