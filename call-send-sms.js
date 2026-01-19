// Minimal script to call the send-order-confirmation-sms Edge Function
// Requires Node 18+ (global fetch). If using older Node, install node-fetch.

// Target phone number (per your request)
const TARGET_PHONE = '+2348034692049';

// Read env vars
const SUPABASE_URL = "https://vpunvfkmlmqbfiggqrkn.supabase.co";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwdW52ZmttbG1xYmZpZ2dxcmtuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjQ5MjQxMSwiZXhwIjoyMDc4MDY4NDExfQ.08szcw3Y1O_BYBVXv7uUUkX-wDxQMrveP6AXlxYmGjo";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.');
  process.exit(1);
}

// Construct function URL
const fnUrl = `${SUPABASE_URL.replace(/\/+$/, '')}/functions/v1/test-send-confirmation-sms`;

async function main() {
  try {
    const resp = await fetch(fnUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Use service role key to authenticate server-to-server
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ to: TARGET_PHONE })
    });

    const contentType = resp.headers.get('content-type') || '';
    const bodyText = await resp.text();

    console.log('Status:', resp.status, resp.statusText);
    if (contentType.includes('application/json')) {
      try {
        console.log('Response JSON:', JSON.parse(bodyText));
      } catch (e) {
        console.log('Response text (non-json):', bodyText);
      }
    } else {
      console.log('Response text:', bodyText);
    }

    if (!resp.ok) process.exit(2);
  } catch (err) {
    console.error('Request failed:', err);
    process.exit(3);
  }
}

main();