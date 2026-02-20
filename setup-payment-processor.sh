#!/bin/bash
# Setup payment processor configuration

# Get your Supabase project details
read -p "Enter your Supabase project URL (e.g., https://xxxxx.supabase.co): " SUPABASE_URL
read -p "Enter your Supabase Service Role Key: " SERVICE_ROLE_KEY

# Update the app_config table
supabase db push

# Set the configuration values
supabase functions deploy

# Then manually update via SQL:
echo ""
echo "Run this SQL in your Supabase Dashboard to set the configuration:"
echo ""
cat << EOF
UPDATE public.app_config
SET value = '$SUPABASE_URL'
WHERE key = 'functions_url';

UPDATE public.app_config
SET value = '$SERVICE_ROLE_KEY'
WHERE key = 'supabase_service_role_key';
EOF
echo ""
