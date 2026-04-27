import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SQIPCore, requestCardNonce } from '@square/in-app-payments';
import { useAuthStore } from '@/lib/store/useAuthStore';

interface PaymentScreenProps {
  amount: number; // cents
  currency: string;
  customerInfo: {
    name: string;
    email: string;
    phone: string;
  };
  onSuccess?: (orderId: string, paymentId: string) => void;
  onError?: (error: string) => void;
}

export default function SquarePaymentScreen({
  amount,
  currency,
  customerInfo,
  onSuccess,
  onError,
}: PaymentScreenProps) {
  const session = useAuthStore((s) => s.session);
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initAttemptsRef = useRef(0);
  const maxInitAttempts = 3;

  // ── Initialize Square SDK ──────────────────────────────────────────────────

  useEffect(() => {
    initializeSquare();
  }, []);

  const initializeSquare = async () => {
    try {
      const appId = process.env.EXPO_PUBLIC_SQUARE_APPLICATION_ID;
      if (!appId) {
        setError('Square app ID not configured');
        return;
      }

      // Initialize Square SDK
      await SQIPCore.setSquareApplicationId(appId);
      
      // Optional: Set location ID if using web-based flow
      const locationId = process.env.EXPO_PUBLIC_SQUARE_LOCATION_ID;
      if (locationId) {
        await SQIPCore.initializeAuthorizationCode(locationId);
      }

      setInitialized(true);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to initialize Square';
      console.error('[Square Init]', message, err);

      // Retry up to 3 times
      if (initAttemptsRef.current < maxInitAttempts) {
        initAttemptsRef.current += 1;
        setTimeout(initializeSquare, 500);
      } else {
        setError(message);
        onError?.(message);
      }
    }
  };

  // ── Handle Payment ─────────────────────────────────────────────────────────

  const handlePayment = async () => {
    if (!initialized) {
      setError('Payment system not ready. Please wait...');
      return;
    }

    if (!session?.access_token) {
      setError('Please sign in to continue');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Step 1: Request card nonce from Square (client-side)
      const nonce = await requestCardNonce();
      if (!nonce) {
        throw new Error('No payment method selected');
      }

      // Step 2: Send nonce to your backend
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
      if (!supabaseUrl) {
        throw new Error('Supabase URL not configured');
      }

      const response = await fetch(
        `${supabaseUrl}/functions/v1/process-square-payment`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            sourceId: nonce,
            amount,
            currency,
            customer: customerInfo,
            // Optional: delivery/order metadata
            metadata: {
              source: 'mobile_app',
              platform: 'ios', // or 'android'
            },
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Payment failed (${response.status})`);
      }

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Payment processing failed');
      }

      // Step 3: Success — call callback
      setInitialized(true);
      Alert.alert(
        'Payment Successful',
        `Order #${data.orderId} has been placed!`,
        [
          {
            text: 'OK',
            onPress: () => onSuccess?.(data.orderId, data.paymentId),
          },
        ]
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Payment failed';
      console.error('[Square Payment]', message, err);
      setError(message);
      onError?.(message);

      Alert.alert('Payment Failed', message, [{ text: 'OK' }]);
    } finally {
      setLoading(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Payment Details</Text>
        <Text style={styles.subtitle}>Secure payment powered by Square</Text>
      </View>

      {/* Amount Display */}
      <View style={styles.amountBox}>
        <Text style={styles.amountLabel}>Total Amount</Text>
        <Text style={styles.amountValue}>
          ${(amount / 100).toFixed(2)}
        </Text>
        <Text style={styles.currency}>{currency}</Text>
      </View>

      {/* Status Messages */}
      {!initialized && !error && (
        <View style={styles.statusBox}>
          <ActivityIndicator size="small" color="#C9A84C" />
          <Text style={styles.statusText}>Loading payment form...</Text>
        </View>
      )}

      {error && (
        <View style={[styles.statusBox, styles.errorBox]}>
          <Text style={styles.errorText}>⚠ {error}</Text>
        </View>
      )}

      {/* Customer Info Summary */}
      <View style={styles.infoBox}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Name</Text>
          <Text style={styles.infoValue}>{customerInfo.name}</Text>
        </View>
        <View style={styles.infoDivider} />
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Email</Text>
          <Text style={styles.infoValue} numberOfLines={1}>
            {customerInfo.email}
          </Text>
        </View>
        <View style={styles.infoDivider} />
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Phone</Text>
          <Text style={styles.infoValue}>{customerInfo.phone}</Text>
        </View>
      </View>

      {/* Square Card Entry Form */}
      {/* Note: Square's React Native SDK provides native card entry UI */}
      {/* The card form is handled by the native bridge — no custom input needed */}
      <View style={styles.cardFormContainer}>
        <Text style={styles.cardFormTitle}>Card Information</Text>
        <View style={styles.cardPlaceholder}>
          <Text style={styles.cardPlaceholderText}>
            {initialized ? '💳 Tap to enter card' : 'Loading...'}
          </Text>
        </View>
      </View>

      {/* Security Notice */}
      <View style={styles.securityNotice}>
        <Text style={styles.securityIcon}>🔒</Text>
        <Text style={styles.securityText}>
          Your card details are encrypted and processed securely by Square. We never store your full card number.
        </Text>
      </View>

      {/* Pay Button */}
      <TouchableOpacity
        style={[
          styles.payButton,
          (loading || !initialized || !!error) && styles.payButtonDisabled,
        ]}
        onPress={handlePayment}
        disabled={loading || !initialized || !!error}
        activeOpacity={0.8}
      >
        {loading ? (
          <>
            <ActivityIndicator size="small" color="#111613" style={styles.buttonIcon} />
            <Text style={styles.payButtonText}>Processing...</Text>
          </>
        ) : (
          <>
            <Text style={styles.buttonIcon}>💳</Text>
            <Text style={styles.payButtonText}>Pay ${(amount / 100).toFixed(2)}</Text>
          </>
        )}
      </TouchableOpacity>

      {/* Terms */}
      <Text style={styles.termsText}>
        By tapping "Pay", you agree to our terms and authorize this payment.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111613',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },

  // ── Header ────────────────────────────────────────────────────────────────

  header: {
    marginBottom: 28,
  },

  title: {
    fontSize: 28,
    fontWeight: '600',
    color: '#C9A84C',
    marginBottom: 4,
  },

  subtitle: {
    fontSize: 13,
    color: '#888884',
    letterSpacing: 0.5,
  },

  // ── Amount Box ────────────────────────────────────────────────────────────

  amountBox: {
    backgroundColor: 'rgba(201, 168, 76, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(201, 168, 76, 0.2)',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginBottom: 24,
  },

  amountLabel: {
    fontSize: 12,
    color: '#888884',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },

  amountValue: {
    fontSize: 32,
    fontWeight: '700',
    color: '#C9A84C',
  },

  currency: {
    fontSize: 12,
    color: '#666662',
    marginTop: 4,
  },

  // ── Status Messages ───────────────────────────────────────────────────────

  statusBox: {
    backgroundColor: 'rgba(201, 168, 76, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(201, 168, 76, 0.2)',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  statusText: {
    fontSize: 13,
    color: '#C9A84C',
    flex: 1,
  },

  errorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderColor: 'rgba(239, 68, 68, 0.2)',
  },

  errorText: {
    fontSize: 13,
    color: '#EF4444',
    flex: 1,
  },

  // ── Info Box ──────────────────────────────────────────────────────────────

  infoBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderWidth: 1,
    borderColor: 'rgba(201, 168, 76, 0.1)',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 24,
  },

  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },

  infoLabel: {
    fontSize: 12,
    color: '#888884',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },

  infoValue: {
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '500',
    flex: 1,
    textAlign: 'right',
    marginLeft: 12,
  },

  infoDivider: {
    height: 1,
    backgroundColor: 'rgba(201, 168, 76, 0.1)',
    marginVertical: 8,
  },

  // ── Card Form ─────────────────────────────────────────────────────────────

  cardFormContainer: {
    marginBottom: 20,
  },

  cardFormTitle: {
    fontSize: 13,
    color: '#888884',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10,
  },

  cardPlaceholder: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: 'rgba(201, 168, 76, 0.15)',
    borderRadius: 10,
    paddingVertical: 32,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 120,
  },

  cardPlaceholderText: {
    fontSize: 13,
    color: '#666662',
  },

  // ── Security Notice ───────────────────────────────────────────────────────

  securityNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(16, 185, 129, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.15)',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 24,
    gap: 10,
  },

  securityIcon: {
    fontSize: 16,
    marginTop: 2,
  },

  securityText: {
    fontSize: 11,
    color: '#888884',
    flex: 1,
    lineHeight: 16,
  },

  // ── Pay Button ────────────────────────────────────────────────────────────

  payButton: {
    backgroundColor: '#C9A84C',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    gap: 8,
    elevation: 3,
    shadowColor: '#C9A84C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },

  payButtonDisabled: {
    backgroundColor: '#444442',
    opacity: 0.6,
    shadowOpacity: 0,
  },

  buttonIcon: {
    fontSize: 16,
  },

  payButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111613',
    letterSpacing: 0.4,
  },

  // ── Terms ─────────────────────────────────────────────────────────────────

  termsText: {
    fontSize: 11,
    color: '#666662',
    textAlign: 'center',
    lineHeight: 16,
  },
});
