import { Modal, View, Pressable, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { SafeAreaView } from 'react-native-safe-area-context';

interface Props {
  visible: boolean;
  applicationId: string;
  locationId: string;
  isSandbox: boolean;
  baseUrl: string;
  onNonce: (nonce: string) => void;
  onCancel: () => void;
  currentColors: Record<string, string>;
}

function buildHtml(applicationId: string, locationId: string, isSandbox: boolean, c: Record<string, string>): string {
  const scriptSrc = isSandbox
    ? 'https://sandbox.web.squarecdn.com/v1/square.js'
    : 'https://web.squarecdn.com/v1/square.js';

  const bg         = c.background  || '#1a1208';
  const card       = c.card        || '#2A2218';
  const text       = c.text        || '#FFFFFF';
  const textSec    = c.textSecondary || '#B8A888';
  const secondary  = c.secondary   || '#4AD7C2';
  const highlight  = c.highlight   || '#D4AF37';
  const border     = c.border      || '#D4AF37';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
  <script src="${scriptSrc}"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: ${bg};
      font-family: -apple-system, sans-serif;
      padding: 20px;
      color: ${text};
    }

    /* Info banner — mirrors the infoCard on payment-methods screen */
    #info-banner {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 16px;
      border: 2px solid ${border};
      background: ${card};
      margin-bottom: 20px;
      font-size: 14px;
      color: ${text};
      line-height: 1.4;
    }

    /* Card container wrapper — matches cardItem style */
    #card-wrapper {
      border: 2px solid ${border};
      background: ${card};
      padding: 20px;
      margin-bottom: 16px;
      box-shadow: 0px 8px 24px rgba(212, 175, 55, 0.3);
    }

    #card-container { min-height: 90px; }

    #error-message {
      color: #FF3B30;
      font-size: 14px;
      margin-top: 12px;
      min-height: 18px;
      text-align: center;
    }

    /* Save button — matches addNewButton gradient */
    #save-btn {
      display: none;
      width: 100%;
      padding: 16px;
      background: linear-gradient(90deg, ${secondary}, ${highlight});
      color: ${bg};
      border: none;
      font-size: 16px;
      font-weight: 700;
      cursor: pointer;
      letter-spacing: 0.5px;
      box-shadow: 0px 8px 24px rgba(212, 175, 55, 0.4);
    }
    #save-btn:disabled { opacity: 0.6; }

    /* Security note — matches securityNote */
    #security-note {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 16px;
      font-size: 14px;
      color: ${textSec};
    }

    #loading { text-align: center; color: ${textSec}; font-size: 14px; padding: 40px 0; }
  </style>
</head>
<body>
  <div id="info-banner">
    🔒 Your card information is encrypted and stored securely by Square.
  </div>

  <div id="card-wrapper">
    <div id="loading">Loading secure card form...</div>
    <div id="card-container"></div>
    <div id="error-message"></div>
  </div>

  <button id="save-btn" disabled>Save Card</button>

  <div id="security-note">🔐 Secured by Square</div>

  <script>
    var APP_ID = ${JSON.stringify(applicationId)};
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
          'input': { color: '${text}', backgroundColor: '${card}' },
          'input.is-focus': { color: '${text}' },
          'input.is-error': { color: '#FF3B30' },
          'input::placeholder': { color: '${textSec}' },
          '.message-text': { color: '${textSec}' },
          '.message-icon': { color: '${textSec}' },
        }
      });
      await card.attach('#card-container');

      document.getElementById('loading').style.display = 'none';
      var btn = document.getElementById('save-btn');
      btn.style.display = 'block';
      btn.disabled = false;

      btn.addEventListener('click', async function () {
        var errEl = document.getElementById('error-message');
        errEl.textContent = '';
        btn.disabled = true;
        btn.textContent = 'Processing...';
        try {
          var result = await card.tokenize();
          if (result.status === 'OK') {
            post({ type: 'nonce', nonce: result.token });
          } else {
            errEl.textContent = (result.errors || []).map(function (e) { return e.message; }).join(', ') || 'Tokenization failed';
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

    init().catch(function (err) {
      var msg = err && err.message ? err.message : String(err);
      document.getElementById('loading').textContent = 'Error: ' + msg;
      post({ type: 'error', message: msg });
    });
  </script>
</body>
</html>`;
}

export default function SquareWebCardEntry({ visible, applicationId, locationId, isSandbox, baseUrl, onNonce, onCancel, currentColors }: Props) {
  const html = buildHtml(applicationId, locationId, isSandbox, currentColors);

  const onMessage = (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'nonce' && data.nonce) {
        onNonce(data.nonce);
      } else if (data.type === 'error') {
        console.error('[SquareWebCardEntry] error:', data.message);
      }
    } catch {
      // ignore malformed messages
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onCancel}>
      <SafeAreaView style={[styles.safeArea, { backgroundColor: currentColors.background }]} edges={['top']}>
        <View style={[styles.header, { borderBottomColor: currentColors.border, backgroundColor: currentColors.card }]}>
          <Pressable onPress={onCancel} style={styles.cancelBtn}>
            <Text style={[styles.cancelText, { color: currentColors.secondary }]} numberOfLines={1}>Cancel</Text>
          </Pressable>
          <Text style={[styles.title, { color: currentColors.text }]}>Add Card</Text>
          <View style={styles.cancelBtn} />
        </View>
        <WebView
          source={{ html, baseUrl }}
          style={{ flex: 1, backgroundColor: currentColors.background }}
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          startInLoadingState
          renderLoading={() => (
            <View style={[styles.loadingOverlay, { backgroundColor: currentColors.background }]}>
              <ActivityIndicator color={currentColors.secondary} />
            </View>
          )}
          onMessage={onMessage}
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 2,
  },
  title: { fontSize: 22, fontFamily: 'PlayfairDisplay_700Bold', letterSpacing: 0.5 },
  cancelBtn: { minWidth: 60, flexShrink: 0 },
  cancelText: { fontSize: 16, fontFamily: 'Inter_600SemiBold', flexShrink: 0 },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
});
