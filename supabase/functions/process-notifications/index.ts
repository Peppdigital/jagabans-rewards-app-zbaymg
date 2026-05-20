// ============================================================================
// SUPABASE EDGE FUNCTION - Process Notification Queue
// ============================================================================
// Deploy with: supabase functions deploy process-notifications
// File: supabase/functions/process-notifications/index.ts

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const resendApiKey = Deno.env.get("RESEND_API_KEY");
const adminEmail = Deno.env.get("ADMIN_EMAIL") || "peppdigital@gmail.com";

interface NotificationQueueItem {
  id: string;
  event_type: string;
  customer_email: string;
  customer_name: string;
  old_status?: string;
  new_status?: string;
  reservation_date: string;
  reservation_time: string;
  reservation_id: string;
  guests: number;
}

interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

// Email templates

function getConfirmationTemplate(
  customerName: string,
  date: string,
  time: string,
  guests: number,
  reservationId: string,
  specialRequests?: string
): EmailTemplate {
  return {
    subject: "Your Reservation at Jagabans L.A. Restaurant",
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
              font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; 
              line-height: 1.6;
              background-color: #f8f9fa;
              -webkit-font-smoothing: antialiased;
            }
            .email-wrapper { 
              max-width: 600px; 
              margin: 40px auto; 
              background-color: #ffffff;
              border-radius: 2px;
              overflow: hidden;
              box-shadow: 0 4px 6px rgba(0, 0, 0, 0.07);
            }
            .header { 
              background-color: #1a1a1a;
              padding: 48px 40px;
              text-align: center;
              border-bottom: 3px solid #059669;
            }
            .logo { 
              color: #ffffff;
              font-size: 28px;
              font-weight: 300;
              letter-spacing: 4px;
              text-transform: uppercase;
              margin-bottom: 8px;
            }
            .tagline {
              color: #a0a0a0;
              font-size: 13px;
              letter-spacing: 2px;
              text-transform: uppercase;
            }
            .content { 
              padding: 48px 40px;
              color: #2d3748;
            }
            .greeting {
              font-size: 16px;
              color: #4a5568;
              margin-bottom: 24px;
            }
            .message {
              font-size: 15px;
              color: #4a5568;
              line-height: 1.8;
              margin-bottom: 32px;
            }
            .reservation-card {
              background: linear-gradient(135deg, #f8fffe 0%, #f0fdf9 100%);
              border: 1px solid #d1fae5;
              border-radius: 2px;
              padding: 32px;
              margin: 32px 0;
            }
            .card-title {
              font-size: 12px;
              font-weight: 600;
              letter-spacing: 1.5px;
              text-transform: uppercase;
              color: #059669;
              margin-bottom: 24px;
            }
            .detail-grid {
              display: table;
              width: 100%;
              border-collapse: collapse;
            }
            .detail-item {
              display: table-row;
              border-bottom: 1px solid #e0e0e0;
            }
            .detail-item:last-child {
              border-bottom: none;
            }
            .detail-label {
              display: table-cell;
              padding: 16px 0;
              font-size: 13px;
              font-weight: 600;
              color: #718096;
              letter-spacing: 0.5px;
              text-transform: uppercase;
              width: 40%;
            }
            .detail-value {
              display: table-cell;
              padding: 16px 0;
              font-size: 15px;
              color: #2d3748;
              text-align: right;
              font-weight: 500;
            }
            .confirmation-id {
              font-family: 'Courier New', monospace;
              background-color: #f7fafc;
              padding: 4px 8px;
              border-radius: 2px;
              font-size: 13px;
            }
            .special-section {
              background-color: #fffbeb;
              border-left: 3px solid #f59e0b;
              padding: 20px;
              margin: 24px 0;
              border-radius: 2px;
            }
            .special-title {
              font-size: 12px;
              font-weight: 600;
              letter-spacing: 1px;
              text-transform: uppercase;
              color: #92400e;
              margin-bottom: 8px;
            }
            .special-text {
              font-size: 14px;
              color: #78350f;
              line-height: 1.6;
              font-style: italic;
            }
            .info-box {
              background-color: #f8fafc;
              border-left: 3px solid #3b82f6;
              padding: 20px;
              margin: 24px 0;
              border-radius: 2px;
            }
            .info-text {
              font-size: 14px;
              color: #475569;
              line-height: 1.6;
            }
            .signature {
              margin-top: 40px;
              padding-top: 32px;
              border-top: 1px solid #e2e8f0;
            }
            .signature-text {
              font-size: 14px;
              color: #64748b;
              line-height: 1.8;
            }
            .signature-name {
              font-weight: 600;
              color: #1e293b;
            }
            .footer {
              background-color: #1a1a1a;
              padding: 32px 40px;
              text-align: center;
              color: #9ca3af;
            }
            .footer-contact {
              font-size: 13px;
              margin-bottom: 16px;
              letter-spacing: 0.5px;
            }
            .footer-link {
              color: #059669;
              text-decoration: none;
              margin: 0 8px;
            }
            .footer-divider {
              height: 1px;
              background-color: #374151;
              margin: 20px 0;
            }
            .footer-note {
              font-size: 11px;
              color: #6b7280;
              line-height: 1.6;
            }
            
            @media only screen and (max-width: 600px) {
              .email-wrapper { margin: 20px; }
              .header { padding: 32px 24px; }
              .content { padding: 32px 24px; }
              .reservation-card { padding: 24px; }
              .detail-label, .detail-value { 
                display: block; 
                width: 100%; 
                text-align: left;
              }
              .detail-value { 
                padding-top: 4px; 
                padding-bottom: 16px;
                font-size: 16px;
              }
            }
          </style>
        </head>
        <body>
          <div class="email-wrapper">
            <div class="header">
              <div class="logo">Jagabans</div>
              <div class="tagline">Los Angeles</div>
            </div>
            
            <div class="content">
              <div class="greeting">Dear ${customerName},</div>
              
              <div class="message">
                Thank you for choosing Jagabans L.A. Restaurant. We are delighted to confirm your reservation and look forward to providing you with an exceptional dining experience.
              </div>
              
              <div class="reservation-card">
                <div class="card-title">Reservation Details</div>
                <div class="detail-grid">
                  <div class="detail-item">
                    <div class="detail-label">Date</div>
                    <div class="detail-value">${date}</div>
                  </div>
                  <div class="detail-item">
                    <div class="detail-label">Time</div>
                    <div class="detail-value">${time}</div>
                  </div>
                  <div class="detail-item">
                    <div class="detail-label">Party Size</div>
                    <div class="detail-value">${guests} ${guests === 1 ? "Guest" : "Guests"}</div>
                  </div>
                  <div class="detail-item">
                    <div class="detail-label">Confirmation</div>
                    <div class="detail-value"><span class="confirmation-id">${reservationId.substring(0, 8).toUpperCase()}</span></div>
                  </div>
                </div>
              </div>
              
              ${specialRequests ? `
              <div class="special-section">
                <div class="special-title">Your Special Requests</div>
                <div class="special-text">${specialRequests}</div>
              </div>
              ` : ""}
              
              <div class="info-box">
                <div class="info-text">
                  <strong>Please Note:</strong> We recommend arriving 10-15 minutes prior to your reservation time. Should you need to modify or cancel your reservation, please contact us at least 24 hours in advance.
                </div>
              </div>
              
              <div class="signature">
                <div class="signature-text">
                  We look forward to welcoming you.<br><br>
                  <span class="signature-name">The Jagabans Team</span>
                </div>
              </div>
            </div>
            
            <div class="footer">
              <div class="footer-contact">
                <a href="mailto:info@jagabansla.com" class="footer-link">info@jagabansla.com</a>
                <span style="color: #4b5563;">•</span>
                <a href="tel:+18182106659" class="footer-link">(818) 210-6659</a>
              </div>
              <div class="footer-divider"></div>
              <div class="footer-note">
                This is an automated confirmation. Please do not reply to this email.<br>
                For inquiries, please contact us directly via phone or email.
              </div>
            </div>
          </div>
        </body>
      </html>
    `,
    text: `JAGABANS L.A. RESTAURANT
    
Dear ${customerName},

Thank you for choosing Jagabans L.A. Restaurant. We are delighted to confirm your reservation.

RESERVATION DETAILS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Date:           ${date}
Time:           ${time}
Party Size:     ${guests} ${guests === 1 ? "Guest" : "Guests"}
Confirmation:   ${reservationId.substring(0, 8).toUpperCase()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${specialRequests ? `SPECIAL REQUESTS\n${specialRequests}\n\n` : ""}PLEASE NOTE: We recommend arriving 10-15 minutes prior to your reservation time. Should you need to modify or cancel your reservation, please contact us at least 24 hours in advance.

We look forward to welcoming you.

The Jagabans Team

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
info@jagabansla.com  •  (818) 210-6659
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
  };
}

// NEW: Admin notification template for new reservations
function getAdminNewReservationTemplate(
  customerName: string,
  customerEmail: string,
  customerPhone: string,
  date: string,
  time: string,
  guests: number,
  reservationId: string,
  specialRequests?: string
): EmailTemplate {
  return {
    subject: `🔔 New Reservation Alert - ${customerName}`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body { font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); overflow: hidden; }
            .header { background: linear-gradient(135deg, #dc2626 0%, #ef4444 100%); color: white; padding: 30px; text-align: center; }
            .content { padding: 30px; }
            .alert-box { background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 20px; margin: 20px 0; border-radius: 4px; }
            .detail-row { padding: 10px 0; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; }
            .detail-label { font-weight: bold; color: #dc2626; }
            .action-button { display: inline-block; background-color: #059669; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px; }
            .footer { background-color: #f9fafb; padding: 20px; text-align: center; color: #6b7280; font-size: 12px; border-top: 1px solid #e5e7eb; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🔔 New Reservation Alert</h1>
              <p style="margin: 10px 0 0 0;">Action Required</p>
            </div>
            <div class="content">
              <p><strong>A new reservation has been made!</strong></p>
              <div class="alert-box">
                <div class="detail-row">
                  <span class="detail-label">Customer Name:</span>
                  <span>${customerName}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Email:</span>
                  <span>${customerEmail}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Phone:</span>
                  <span>${customerPhone}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Date:</span>
                  <span>${date}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Time:</span>
                  <span>${time}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Party Size:</span>
                  <span>${guests} ${guests === 1 ? "Guest" : "Guests"}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Confirmation #:</span>
                  <span style="font-family: monospace;">${reservationId}</span>
                </div>
                ${specialRequests ? `
                <div class="detail-row" style="border-bottom: none; flex-direction: column; align-items: flex-start;">
                  <span class="detail-label">Special Requests:</span>
                  <span style="margin-top: 8px; font-style: italic;">${specialRequests}</span>
                </div>
                ` : ""}
              </div>
              <p><strong>⚠️ This reservation is currently PENDING and requires your confirmation.</strong></p>
              <a href="${supabaseUrl}/admin/reservations" class="action-button">View in Dashboard →</a>
              <p style="margin-top: 20px; font-size: 12px; color: #6b7280;">
                Please log in to your admin dashboard to confirm or manage this reservation.
              </p>
            </div>
            <div class="footer">
              <p>Jagabans L.A. Restaurant Admin System</p>
              <p style="margin-top: 8px;">📧 This is an automated notification</p>
            </div>
          </div>
        </body>
      </html>
    `,
    text: `🔔 NEW RESERVATION ALERT\n\nCustomer: ${customerName}\nEmail: ${customerEmail}\nPhone: ${customerPhone}\nDate: ${date}\nTime: ${time}\nParty Size: ${guests}\nConfirmation #: ${reservationId}\n${specialRequests ? `\nSpecial Requests: ${specialRequests}` : ""}\n\n⚠️ This reservation is PENDING and requires confirmation.\n\nPlease log in to your admin dashboard to manage this reservation.`,
  };
}

function getStatusChangeTemplate(
  customerName: string,
  date: string,
  time: string,
  guests: number,
  reservationId: string,
  oldStatus: string,
  newStatus: string
): EmailTemplate {
  const statusConfig: Record<string, { 
    title: string; 
    message: string; 
    color: string;
    bgColor: string;
    borderColor: string;
  }> = {
    confirmed: {
      title: "Reservation Confirmed",
      message: "Your reservation has been confirmed. We look forward to welcoming you and providing an exceptional dining experience.",
      color: "#065f46",
      bgColor: "#f0fdf9",
      borderColor: "#059669"
    },
    cancelled: {
      title: "Reservation Cancelled",
      message: "Your reservation has been cancelled as requested. We hope to have the pleasure of serving you in the future. If this cancellation was made in error, please contact us immediately.",
      color: "#991b1b",
      bgColor: "#fef2f2",
      borderColor: "#dc2626"
    },
    pending: {
      title: "Reservation Pending",
      message: "Your reservation is currently pending confirmation. We will review your request and send you a confirmation shortly.",
      color: "#92400e",
      bgColor: "#fffbeb",
      borderColor: "#f59e0b"
    },
    completed: {
      title: "Thank You for Dining With Us",
      message: "Thank you for choosing Jagabans L.A. Restaurant. We hope you had a wonderful experience and look forward to welcoming you again soon.",
      color: "#1e40af",
      bgColor: "#eff6ff",
      borderColor: "#3b82f6"
    }
  };

  const config = statusConfig[newStatus] || statusConfig.pending;

  return {
    subject: `${config.title} - Jagabans L.A. Restaurant`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
              font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; 
              line-height: 1.6;
              background-color: #f8f9fa;
              -webkit-font-smoothing: antialiased;
            }
            .email-wrapper { 
              max-width: 600px; 
              margin: 40px auto; 
              background-color: #ffffff;
              border-radius: 2px;
              overflow: hidden;
              box-shadow: 0 4px 6px rgba(0, 0, 0, 0.07);
            }
            .header { 
              background-color: #1a1a1a;
              padding: 48px 40px;
              text-align: center;
              border-bottom: 3px solid ${config.borderColor};
            }
            .logo { 
              color: #ffffff;
              font-size: 28px;
              font-weight: 300;
              letter-spacing: 4px;
              text-transform: uppercase;
              margin-bottom: 8px;
            }
            .tagline {
              color: #a0a0a0;
              font-size: 13px;
              letter-spacing: 2px;
              text-transform: uppercase;
            }
            .content { 
              padding: 48px 40px;
              color: #2d3748;
            }
            .greeting {
              font-size: 16px;
              color: #4a5568;
              margin-bottom: 24px;
            }
            .status-banner {
              background-color: ${config.bgColor};
              border-left: 4px solid ${config.borderColor};
              padding: 24px;
              margin: 32px 0;
              border-radius: 2px;
            }
            .status-title {
              font-size: 18px;
              font-weight: 600;
              color: ${config.color};
              margin-bottom: 12px;
              letter-spacing: 0.5px;
            }
            .status-change {
              font-size: 13px;
              color: ${config.color};
              font-weight: 500;
              text-transform: uppercase;
              letter-spacing: 1px;
              margin-bottom: 16px;
            }
            .status-message {
              font-size: 14px;
              color: ${config.color};
              line-height: 1.8;
            }
            .reservation-summary {
              background-color: #f8fafc;
              border: 1px solid #e2e8f0;
              border-radius: 2px;
              padding: 28px;
              margin: 32px 0;
            }
            .summary-title {
              font-size: 12px;
              font-weight: 600;
              letter-spacing: 1.5px;
              text-transform: uppercase;
              color: #64748b;
              margin-bottom: 20px;
            }
            .summary-grid {
              display: table;
              width: 100%;
            }
            .summary-item {
              display: table-row;
              padding: 12px 0;
            }
            .summary-label {
              display: table-cell;
              padding: 10px 0;
              font-size: 13px;
              color: #64748b;
              width: 35%;
            }
            .summary-value {
              display: table-cell;
              padding: 10px 0;
              font-size: 14px;
              color: #1e293b;
              font-weight: 500;
            }
            .confirmation-id {
              font-family: 'Courier New', monospace;
              background-color: #ffffff;
              padding: 4px 8px;
              border-radius: 2px;
              font-size: 13px;
            }
            .signature {
              margin-top: 40px;
              padding-top: 32px;
              border-top: 1px solid #e2e8f0;
            }
            .signature-text {
              font-size: 14px;
              color: #64748b;
              line-height: 1.8;
            }
            .signature-name {
              font-weight: 600;
              color: #1e293b;
            }
            .footer {
              background-color: #1a1a1a;
              padding: 32px 40px;
              text-align: center;
              color: #9ca3af;
            }
            .footer-contact {
              font-size: 13px;
              margin-bottom: 16px;
              letter-spacing: 0.5px;
            }
            .footer-link {
              color: #059669;
              text-decoration: none;
              margin: 0 8px;
            }
            .footer-divider {
              height: 1px;
              background-color: #374151;
              margin: 20px 0;
            }
            .footer-note {
              font-size: 11px;
              color: #6b7280;
              line-height: 1.6;
            }
            
            @media only screen and (max-width: 600px) {
              .email-wrapper { margin: 20px; }
              .header { padding: 32px 24px; }
              .content { padding: 32px 24px; }
              .status-banner { padding: 20px; }
              .reservation-summary { padding: 20px; }
            }
          </style>
        </head>
        <body>
          <div class="email-wrapper">
            <div class="header">
              <div class="logo">Jagabans</div>
              <div class="tagline">Los Angeles</div>
            </div>
            
            <div class="content">
              <div class="greeting">Dear ${customerName},</div>
              
              <div class="status-banner">
                <div class="status-title">${config.title}</div>
                <div class="status-change">${oldStatus.toUpperCase()} → ${newStatus.toUpperCase()}</div>
                <div class="status-message">${config.message}</div>
              </div>
              
              <div class="reservation-summary">
                <div class="summary-title">Reservation Summary</div>
                <div class="summary-grid">
                  <div class="summary-item">
                    <div class="summary-label">Date</div>
                    <div class="summary-value">${date}</div>
                  </div>
                  <div class="summary-item">
                    <div class="summary-label">Time</div>
                    <div class="summary-value">${time}</div>
                  </div>
                  <div class="summary-item">
                    <div class="summary-label">Party Size</div>
                    <div class="summary-value">${guests} ${guests === 1 ? "Guest" : "Guests"}</div>
                  </div>
                  <div class="summary-item">
                    <div class="summary-label">Confirmation</div>
                    <div class="summary-value"><span class="confirmation-id">${reservationId.substring(0, 8).toUpperCase()}</span></div>
                  </div>
                </div>
              </div>
              
              <div class="signature">
                <div class="signature-text">
                  ${newStatus === 'cancelled' 
                    ? 'Should you have any questions, please don\'t hesitate to contact us.' 
                    : 'Should you need any assistance, please feel free to reach out.'
                  }<br><br>
                  <span class="signature-name">The Jagabans Team</span>
                </div>
              </div>
            </div>
            
            <div class="footer">
              <div class="footer-contact">
                <a href="mailto:info@jagabansla.com" class="footer-link">info@jagabansla.com</a>
                <span style="color: #4b5563;">•</span>
                <a href="tel:+18182106659" class="footer-link">(818) 210-6659</a>
              </div>
              <div class="footer-divider"></div>
              <div class="footer-note">
                This is an automated notification. Please do not reply to this email.<br>
                For inquiries, please contact us directly via phone or email.
              </div>
            </div>
          </div>
        </body>
      </html>
    `,
    text: `JAGABANS L.A. RESTAURANT

Dear ${customerName},

${config.title.toUpperCase()}
Status: ${oldStatus.toUpperCase()} → ${newStatus.toUpperCase()}

${config.message}

RESERVATION SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Date:           ${date}
Time:           ${time}
Party Size:     ${guests} ${guests === 1 ? "Guest" : "Guests"}
Confirmation:   ${reservationId.substring(0, 8).toUpperCase()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${newStatus === 'cancelled' 
  ? 'Should you have any questions, please don\'t hesitate to contact us.' 
  : 'Should you need any assistance, please feel free to reach out.'
}

The Jagabans Team

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
info@jagabansla.com  •  (818) 210-6659
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
  };
}

// Send email via Resend
async function sendEmail(
  to: string,
  subject: string,
  html: string,
  text: string
): Promise<boolean> {
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: "noreply@jagabansla.com",
        to,
        subject,
        html,
        text,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error("Resend API error:", error);
      return false;
    }

    console.log(`✅ Email sent to ${to}`);
    return true;
  } catch (error) {
    console.error("Failed to send email:", error);
    return false;
  }
}

// Main handler
Deno.serve(async (req) => {
  // Only allow POST requests
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const supabase = createClient(supabaseUrl!, supabaseServiceKey!);

    // Get pending notifications from queue
    const { data: notifications, error: fetchError } = await supabase
      .rpc("process_notification_queue");

    if (fetchError) {
      console.error("Error fetching notifications:", fetchError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch notifications" }),
        { status: 500 }
      );
    }

    if (!notifications || notifications.length === 0) {
      return new Response(
        JSON.stringify({ message: "No pending notifications", processed: 0 }),
        { status: 200 }
      );
    }

    let processed = 0;
    let failed = 0;

    // Process each notification
    for (const notification of notifications as NotificationQueueItem[]) {
      try {
        let customerTemplate: EmailTemplate | null = null;
        let adminTemplate: EmailTemplate | null = null;

        if (notification.event_type === "reservation_created") {
          // Get full reservation details
          const { data: reservation } = await supabase
            .from("reservations")
            .select("*")
            .eq("id", notification.reservation_id)
            .single();

          // Customer confirmation email
          customerTemplate = getConfirmationTemplate(
            notification.customer_name,
            notification.reservation_date,
            notification.reservation_time,
            notification.guests,
            notification.reservation_id,
            reservation?.special_requests
          );

          // Admin notification email
          adminTemplate = getAdminNewReservationTemplate(
            notification.customer_name,
            notification.customer_email,
            reservation?.phone || "N/A",
            notification.reservation_date,
            notification.reservation_time,
            notification.guests,
            notification.reservation_id,
            reservation?.special_requests
          );
        } else if (notification.event_type === "reservation_status_updated") {
          // Customer status change email
          customerTemplate = getStatusChangeTemplate(
            notification.customer_name,
            notification.reservation_date,
            notification.reservation_time,
            notification.guests,
            notification.reservation_id,
            notification.old_status || "pending",
            notification.new_status || "pending"
          );
        } else {
          throw new Error(`Unknown event type: ${notification.event_type}`);
        }

        let customerSuccess = false;
        let adminSuccess = false;

        // Send customer email
        if (customerTemplate) {
          customerSuccess = await sendEmail(
            notification.customer_email,
            customerTemplate.subject,
            customerTemplate.html,
            customerTemplate.text
          );
        }

        // Send admin email (only for new reservations)
        if (adminTemplate) {
          adminSuccess = await sendEmail(
            adminEmail,
            adminTemplate.subject,
            adminTemplate.html,
            adminTemplate.text
          );
          
          if (adminSuccess) {
            console.log(`✅ Admin notification sent for reservation ${notification.reservation_id}`);
          } else {
            console.error(`❌ Failed to send admin notification for ${notification.reservation_id}`);
          }
        }

        // Consider successful if at least customer email was sent
        const overallSuccess = customerSuccess;

        // Mark as processed
        await supabase.rpc("mark_notification_processed", {
          p_queue_id: notification.id,
          p_success: overallSuccess,
          p_error_message: overallSuccess ? null : "Failed to send customer email",
        });

        if (overallSuccess) {
          processed++;
        } else {
          failed++;
        }
      } catch (error) {
        console.error(
          `Failed to process notification ${notification.id}:`,
          error
        );

        // Mark as failed
        await supabase.rpc("mark_notification_processed", {
          p_queue_id: notification.id,
          p_success: false,
          p_error_message: error instanceof Error ? error.message : "Unknown error",
        });

        failed++;
      }
    }

    return new Response(
      JSON.stringify({
        message: "Notifications processed",
        processed,
        failed,
        total: notifications.length,
      }),
      { status: 200 }
    );
  } catch (error) {
    console.error("Function error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500 }
    );
  }
});