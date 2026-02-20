-- Webhook Events Table for Idempotency
CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  order_id UUID,
  received_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  processed_at TIMESTAMP WITH TIME ZONE,
  status TEXT DEFAULT 'pending', -- pending, processing, processed, errored, skipped
  result JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  UNIQUE(provider, event_id)
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_provider_eventid ON webhook_events(provider, event_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_order_id ON webhook_events(order_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_status ON webhook_events(status);

COMMENT ON TABLE webhook_events IS 'Tracks all webhook events for idempotency - prevents duplicate processing of retried webhooks';
COMMENT ON COLUMN webhook_events.provider IS 'Source of event (stripe-webhook, admin-email, admin-sms, etc)';
COMMENT ON COLUMN webhook_events.event_id IS 'Unique event ID from provider or computed';
COMMENT ON COLUMN webhook_events.status IS 'Processing status: pending, processing, processed, errored, skipped';
COMMENT ON COLUMN webhook_events.result IS 'JSON result of processing (error details or success info)';

-- Email Notifications Log
CREATE TABLE IF NOT EXISTS email_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  recipient_emails TEXT[],
  subject TEXT,
  sent_at TIMESTAMP WITH TIME ZONE,
  status TEXT, -- sent, errored, skipped
  result JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_notifications_order_id ON email_notifications(order_id);
CREATE INDEX IF NOT EXISTS idx_email_notifications_status ON email_notifications(status);
CREATE INDEX IF NOT EXISTS idx_email_notifications_sent_at ON email_notifications(sent_at DESC);

COMMENT ON TABLE email_notifications IS 'Audit trail of all admin email notifications sent';
COMMENT ON COLUMN email_notifications.status IS 'sent, errored, or skipped';
COMMENT ON COLUMN email_notifications.result IS 'Resend API response or error details';

-- SMS Notifications Log
CREATE TABLE IF NOT EXISTS sms_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  recipient_phone TEXT,
  message_body TEXT,
  sent_at TIMESTAMP WITH TIME ZONE,
  status TEXT, -- sent, failed
  twilio_sid TEXT,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sms_notifications_order_id ON sms_notifications(order_id);
CREATE INDEX IF NOT EXISTS idx_sms_notifications_status ON sms_notifications(status);
CREATE INDEX IF NOT EXISTS idx_sms_notifications_sent_at ON sms_notifications(sent_at DESC);

COMMENT ON TABLE sms_notifications IS 'Audit trail of all admin SMS notifications sent via Twilio';
COMMENT ON COLUMN sms_notifications.status IS 'sent or failed';
COMMENT ON COLUMN sms_notifications.twilio_sid IS 'Twilio message SID for tracking';
COMMENT ON COLUMN sms_notifications.error_message IS 'Error details if send failed';
