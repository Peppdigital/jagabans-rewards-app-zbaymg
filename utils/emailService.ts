import { supabase, SUPABASE_URL } from '@/app/integrations/supabase/client';

export interface OrderEmailData {
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
 * Send order confirmation email to predefined admin recipients
 * This is called after successful payment
 */
export const sendOrderConfirmationEmail = async (orderData: OrderEmailData): Promise<boolean> => {
  try {
    console.log('Sending order confirmation email for order:', orderData.orderId);
    
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      console.error('No active session - cannot send email');
      return false;
    }

    const response = await fetch(`${SUPABASE_URL}/functions/v1/send-order-confirmation-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(orderData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Failed to send order confirmation email:', errorText);
      return false;
    }

    const result = await response.json();
    console.log('Order confirmation email sent successfully:', result);
    return true;
  } catch (error) {
    console.error('Failed to send order confirmation email:', error);
    return false;
  }
};

/**
 * Send order confirmation SMS to predefined admin recipients
 * This is called after successful payment
 */
export const sendOrderConfirmationSMS = async (orderData: OrderEmailData): Promise<boolean> => {
  try {
    console.log('Sending order confirmation SMS for order:', orderData.orderId);
    
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      console.error('No active session - cannot send SMS');
      return false;
    }

    const response = await fetch(`${SUPABASE_URL}/functions/v1/send-admin-confirmation-sms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(orderData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Failed to send order confirmation SMS:', errorText);
      return false;
    }

    const result = await response.json();
    console.log('Order confirmation SMS sent successfully:', result);
    return true;
  } catch (error) {
    console.error('Failed to send order confirmation SMS:', error);
    return false;
  }
};

/**
 * Send both email and SMS notifications for order confirmation
 * This is the recommended method to use after successful payment
 * Returns true only if at least one notification method succeeds
 */
export const sendOrderNotifications = async (orderData: OrderEmailData): Promise<{
  success: boolean;
  emailSent: boolean;
  smsSent: boolean;
}> => {
  console.log('Sending order notifications for order:', orderData.orderId);
  
  // Send both email and SMS in parallel for faster execution
  const [emailSent, smsSent] = await Promise.allSettled([
    sendOrderConfirmationEmail(orderData),
    sendOrderConfirmationSMS(orderData),
  ]);

  const emailSuccess = emailSent.status === 'fulfilled' && emailSent.value;
  const smsSuccess = smsSent.status === 'fulfilled' && smsSent.value;

  // Log any failures
  if (!emailSuccess) {
    console.warn('Email notification failed for order:', orderData.orderId);
  }
  if (!smsSuccess) {
    console.warn('SMS notification failed for order:', orderData.orderId);
  }

  const result = {
    success: emailSuccess || smsSuccess, // Success if at least one works
    emailSent: emailSuccess,
    smsSent: smsSuccess,
  };

  console.log('Order notifications result:', result);
  return result;
};

/**
 * Legacy function name for backward compatibility
 * @deprecated Use sendOrderNotifications instead for both email and SMS
 */
export const sendOrderConfirmation = sendOrderNotifications;