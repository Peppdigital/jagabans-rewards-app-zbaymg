#!/bin/bash
# Quick deployment script for duplicate notifications fix

set -e

echo "🚀 Deploying Duplicate Notifications Fix..."
echo ""

# Step 1: Database Migration
echo "📦 Step 1: Running database migration..."
echo "   This creates webhook_events, email_notifications, and sms_notifications tables"
echo ""
echo "   ⚠️  BEFORE RUNNING:"
echo "   - Login to Supabase Dashboard"
echo "   - Go to SQL Editor"
echo "   - Copy contents of: supabase/migrations/add_webhook_idempotency_tables.sql"
echo "   - Paste and execute"
echo ""
echo "   OR run via CLI:"
echo "   $ supabase migration up"
echo ""
read -p "Press Enter when database migration is complete..."

# Step 2: Backup old functions
echo ""
echo "🔄 Step 2: Backing up old functions..."
mkdir -p backups
cp supabase/functions/stripe-webhook/index.ts backups/stripe-webhook.index.old.ts
cp supabase/functions/send-order-confirmation-email/index.ts backups/send-order-confirmation-email.index.old.ts
echo "   ✓ Backup saved to backups/ directory"

# Step 3: Deploy new functions
echo ""
echo "📤 Step 3: Deploying new functions..."

echo "   - Updating stripe-webhook..."
cp supabase/functions/stripe-webhook/index.new.ts supabase/functions/stripe-webhook/index.ts

echo "   - Updating send-order-confirmation-email..."
cp supabase/functions/send-order-confirmation-email/index.new.ts supabase/functions/send-order-confirmation-email/index.ts

# Actually deploy
echo "   - Deploying to Supabase..."
supabase functions deploy stripe-webhook
supabase functions deploy send-order-confirmation-email
supabase functions deploy send-order-confirmation-sms

echo "   ✓ Functions deployed"

# Step 4: Verify environment variables
echo ""
echo "🔐 Step 4: Verifying environment variables..."
echo ""
echo "   Required variables in Supabase Secrets:"
echo "   - RESEND_API_KEY (for email sending)"
echo "   - TWILIO_ACCOUNT_SID (for SMS)"
echo "   - TWILIO_AUTH_TOKEN (for SMS)"
echo "   - TWILIO_PHONE_NUMBER (for SMS)"
echo "   - ADMIN_EMAIL_RECIPIENTS (fallback, comma-separated)"
echo "   - ADMIN_PHONE_RECIPIENTS (fallback, comma-separated)"
echo ""
echo "   📝 Set these in Supabase Dashboard → Project Settings → Secrets"
echo ""
read -p "Press Enter when environment variables are set..."

# Step 5: Test
echo ""
echo "✅ Deployment Complete!"
echo ""
echo "Next steps:"
echo "1. Monitor the Stripe webhook logs:"
echo "   $ supabase functions logs stripe-webhook --tail"
echo ""
echo "2. Check if duplicate prevention is working:"
echo "   - Go to Supabase SQL Editor"
echo "   - Run: SELECT * FROM webhook_events ORDER BY received_at DESC LIMIT 5;"
echo ""
echo "3. Verify email notifications:"
echo "   - Run: SELECT * FROM email_notifications ORDER BY sent_at DESC LIMIT 5;"
echo ""
echo "4. If issues occur, rollback using:"
echo "   - cp backups/stripe-webhook.index.old.ts supabase/functions/stripe-webhook/index.ts"
echo "   - cp backups/send-order-confirmation-email.index.old.ts supabase/functions/send-order-confirmation-email/index.ts"
echo "   - supabase functions deploy"
echo ""
echo "📚 Full documentation: docs/DUPLICATE_NOTIFICATIONS_FIX.md"
echo "📋 Summary: DUPLICATE_NOTIFICATIONS_FIX_SUMMARY.md"
echo ""
