const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const appId = url.searchParams.get("appId") ?? "";
  const locationId = url.searchParams.get("locationId") ?? "";
  const env = url.searchParams.get("env") ?? "sandbox";

  const scriptSrc = env === "production"
    ? "https://web.squarecdn.com/v1/square.js"
    : "https://sandbox.web.squarecdn.com/v1/square.js";

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
  <script src="${scriptSrc}"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #1a1208; font-family: -apple-system, sans-serif; padding: 24px 20px; color: #fff; }
    #loading { text-align: center; color: #B8A888; font-size: 14px; padding: 40px 0; }
    #card-container { margin-bottom: 16px; min-height: 90px; }
    #error-message { color: #FF3B30; font-size: 14px; margin-bottom: 16px; min-height: 18px; text-align: center; }
    #save-btn {
      display: none; width: 100%; padding: 16px;
      background: linear-gradient(135deg, #4AD7C2, #D4AF37);
      color: #1a1208; border: none; font-size: 16px; font-weight: 700; cursor: pointer;
    }
    #save-btn:disabled { opacity: 0.6; }
  </style>
</head>
<body>
  <div id="loading">Loading secure card form...</div>
  <div id="card-container"></div>
  <div id="error-message"></div>
  <button id="save-btn" disabled>Save Card</button>

  <script>
    var APP_ID = ${JSON.stringify(appId)};
    var LOCATION_ID = ${JSON.stringify(locationId)};

    function post(data) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify(data));
      }
    }

    async function init() {
      if (!window.Square) throw new Error('Square SDK not loaded');
      var payments = Square.payments(APP_ID, LOCATION_ID);
      var card = await payments.card({
        style: {
          '.input-wrapper': { backgroundColor: '#2A2218', borderColor: '#D4AF37', borderRadius: '0px' },
          '.input-wrapper.is-focus': { borderColor: '#4AD7C2' },
          'input': { color: '#FFFFFF' },
          'input::placeholder': { color: '#B8A888' },
          '.message-text': { color: '#B8A888' },
          '.message-icon': { color: '#B8A888' },
        }
      });
      await card.attach('#card-container');

      document.getElementById('loading').style.display = 'none';
      var btn = document.getElementById('save-btn');
      btn.style.display = 'block';
      btn.disabled = false;

      btn.addEventListener('click', async function() {
        var errEl = document.getElementById('error-message');
        errEl.textContent = '';
        btn.disabled = true;
        btn.textContent = 'Processing...';
        try {
          var result = await card.tokenize();
          if (result.status === 'OK') {
            post({ type: 'nonce', nonce: result.token });
          } else {
            errEl.textContent = (result.errors || []).map(function(e) { return e.message; }).join(', ') || 'Tokenization failed';
            btn.disabled = false;
            btn.textContent = 'Save Card';
          }
        } catch (err) {
          errEl.textContent = err.message || 'An error occurred';
          btn.disabled = false;
          btn.textContent = 'Save Card';
        }
      });
    }

    init().catch(function(err) {
      document.getElementById('loading').textContent = 'Error: ' + (err && err.message ? err.message : String(err));
      post({ type: 'error', message: err && err.message ? err.message : String(err) });
    });
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
  });
});
