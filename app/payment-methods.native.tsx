
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useApp } from '@/contexts/AppContext';
import { IconSymbol } from '@/components/IconSymbol';
import * as Haptics from 'expo-haptics';
import Toast from '@/components/Toast';
import Dialog from '@/components/Dialog';
import { supabase, SUPABASE_URL } from '@/app/integrations/supabase/client';
import { LinearGradient } from 'expo-linear-gradient';
import SquareWebCardEntry from '@/components/SquareWebCardEntry';

interface StoredCard {
  id: string;
  squareCardId: string;
  cardBrand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  isDefault: boolean;
}

export default function PaymentMethodsScreen() {
  const router = useRouter();
  const { userProfile, currentColors } = useApp();

  const [storedCards, setStoredCards] = useState<StoredCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [webCardVisible, setWebCardVisible] = useState(false);
  const pendingNonce = useRef<string | null>(null);
  const sessionRef = useRef<any>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error' | 'info'>('success');

  const [dialogVisible, setDialogVisible] = useState(false);
  const [dialogConfig, setDialogConfig] = useState({
    title: '',
    message: '',
    buttons: [] as { text: string; onPress: () => void; style?: 'default' | 'destructive' | 'cancel' }[]
  });

  const showToast = (type: 'success' | 'error' | 'info', message: string) => {
    setToastType(type);
    setToastMessage(message);
    setToastVisible(true);
  };

  const showDialog = (
    title: string,
    message: string,
    buttons: { text: string; onPress: () => void; style?: 'default' | 'destructive' | 'cancel' }[]
  ) => {
    setDialogConfig({ title, message, buttons });
    setDialogVisible(true);
  };


  // Runs after the Square sheet has closed and state has committed.
  // pendingNonce is set synchronously inside the nonce callback before
  // completeCardEntry is called, so by the time this effect fires the
  // sheet is gone and the JS event loop is fully free.
  const [nonceReady, setNonceReady] = useState(false);
  useEffect(() => {
    if (!nonceReady) return;
    setNonceReady(false);

    const nonce = pendingNonce.current;
    const session = sessionRef.current;
    if (!nonce || !session) {
      setProcessing(false);
      return;
    }
    pendingNonce.current = null;

    (async () => {
      try {
        const customerResp = await fetch(`${SUPABASE_URL}/functions/v1/create-square-customer`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        if (!customerResp.ok) {
          const errData = await customerResp.json().catch(() => ({}));
          showToast('error', (errData as any).error || 'Failed to create customer account');
          return;
        }

        const { customerId } = await customerResp.json();

        const saveResp = await fetch(`${SUPABASE_URL}/functions/v1/save-square-card`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ nonce, squareCustomerId: customerId }),
        });

        if (!saveResp.ok) {
          const errData = await saveResp.json().catch(() => ({}));
          showToast('error', (errData as any).error || 'Failed to save card');
          return;
        }

        showToast('success', 'Card added successfully');
        await loadStoredCards();
      } catch (error: any) {
        showToast('error', error.message || 'Failed to add card');
      } finally {
        setProcessing(false);
      }
    })();
  }, [nonceReady]);

  const loadStoredCards = useCallback(async () => {
    if (!userProfile) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('payment_methods')
        .select('*')
        .eq('user_id', userProfile.id)
        .not('stripe_payment_method_id', 'is', null)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;

      const cards: StoredCard[] = (data ?? [])
        .filter((card: any) => !card.stripe_payment_method_id?.startsWith('pm_'))
        .map((card: any) => ({
        id: card.id,
        squareCardId: card.stripe_payment_method_id || '',
        cardBrand: card.brand || 'UNKNOWN',
        last4: card.last4 || '0000',
        expMonth: card.exp_month || 0,
        expYear: card.exp_year || 0,
        isDefault: card.is_default || false,
      }));
      setStoredCards(cards);
    } catch (error) {
      console.error('Error loading stored cards:', error);
      showToast('error', 'Failed to load saved cards');
    } finally {
      setLoading(false);
    }
  }, [userProfile]);

  useEffect(() => {
    if (userProfile) {
      loadStoredCards();
    }
  }, [userProfile, loadStoredCards]);

  const handleAddCard = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      showToast('error', 'Please sign in to continue.');
      return;
    }

    sessionRef.current = session;
    setProcessing(true);

    setWebCardVisible(true);
  };

  const handleSetDefault = async (squareCardId: string) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    try {
      setProcessing(true);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(`${SUPABASE_URL}/functions/v1/update-default-square-card`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ squareCardId }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error((errData as any).error || 'Failed to update default card');
      }

      showToast('success', 'Default card updated successfully');
      await loadStoredCards();
    } catch (error: any) {
      showToast('error', error.message || 'Failed to update default card');
    } finally {
      setProcessing(false);
    }
  };

  const handleRemoveCard = (squareCardId: string) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    showDialog(
      'Remove Payment Method',
      'Are you sure you want to remove this payment method?',
      [
        { text: 'Cancel', onPress: () => {}, style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              setProcessing(true);

              const { data: { session } } = await supabase.auth.getSession();
              if (!session) throw new Error('Not authenticated');

              const response = await fetch(`${SUPABASE_URL}/functions/v1/delete-square-card`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({ squareCardId }),
              });

              if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error((errData as any).error || 'Failed to remove card');
              }

              showToast('success', 'Payment method removed successfully');
              await loadStoredCards();
            } catch (error: any) {
              showToast('error', error.message || 'Failed to remove payment method');
            } finally {
              setProcessing(false);
            }
          },
        },
      ]
    );
  };

  return (
    <LinearGradient
      colors={[currentColors.gradientStart || currentColors.background, currentColors.gradientMid || currentColors.background, currentColors.gradientEnd || currentColors.background]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={styles.gradientContainer}
    >
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.container}>
          <LinearGradient
            colors={[currentColors.headerGradientStart || currentColors.card, currentColors.headerGradientEnd || currentColors.card]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.header, { borderBottomColor: currentColors.border }]}
          >
            <Pressable
              onPress={() => {
                if (Platform.OS !== 'web') {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }
                router.back();
              }}
              style={[styles.backButton, { backgroundColor: currentColors.background, borderColor: currentColors.border }]}
            >
              <IconSymbol name="chevron.left" size={24} color={currentColors.secondary} />
            </Pressable>
            <Text style={[styles.headerTitle, { color: currentColors.text }]}>Payment Methods</Text>
            <View style={{ width: 40 }} />
          </LinearGradient>

          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <LinearGradient
              colors={[currentColors.cardGradientStart || currentColors.card, currentColors.cardGradientEnd || currentColors.card]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.infoCard, { borderColor: currentColors.border }]}
            >
              <IconSymbol name="info.circle.fill" size={20} color={currentColors.secondary} />
              <Text style={[styles.infoText, { color: currentColors.text }]}>
                Securely save your payment methods for faster checkout. Your card information is encrypted and stored by Square.
              </Text>
            </LinearGradient>

            <LinearGradient
              colors={[currentColors.secondary, currentColors.highlight]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.addNewButton}
            >
              <Pressable
                style={styles.addNewButtonInner}
                onPress={handleAddCard}
                disabled={processing}
              >
                {processing ? (
                  <ActivityIndicator color={currentColors.background} />
                ) : (
                  <>
                    <IconSymbol name="add" size={24} color={currentColors.background} />
                    <Text style={[styles.addNewButtonText, { color: currentColors.background }]}>
                      Add New Card
                    </Text>
                  </>
                )}
              </Pressable>
            </LinearGradient>

            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={currentColors.secondary} />
                <Text style={[styles.loadingText, { color: currentColors.textSecondary }]}>
                  Loading saved cards...
                </Text>
              </View>
            ) : storedCards.length === 0 ? (
              <View style={styles.emptyState}>
                <IconSymbol name="creditcard" size={80} color={currentColors.textSecondary} />
                <Text style={[styles.emptyStateTitle, { color: currentColors.text }]}>No Payment Methods</Text>
                <Text style={[styles.emptyStateText, { color: currentColors.textSecondary }]}>
                  Add a payment method to make checkout faster and easier.
                </Text>
              </View>
            ) : (
              <View style={styles.cardsContainer}>
                {storedCards.map((card) => (
                  <LinearGradient
                    key={card.id}
                    colors={[currentColors.cardGradientStart || currentColors.card, currentColors.cardGradientEnd || currentColors.card]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[styles.cardItem, { borderColor: currentColors.border }]}
                  >
                    <View style={styles.cardInfo}>
                      <View style={[styles.iconContainer, { borderColor: currentColors.border }]}>
                        <IconSymbol name="creditcard.fill" size={32} color={currentColors.secondary} />
                      </View>
                      <View style={styles.cardDetails}>
                        <Text style={[styles.cardNumber, { color: currentColors.text }]}>
                          {card.cardBrand.toUpperCase()} •••• {card.last4}
                        </Text>
                        <Text style={[styles.cardExpiry, { color: currentColors.textSecondary }]}>
                          Expires {String(card.expMonth).padStart(2, '0')}/{card.expYear}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.cardActions}>
                      {card.isDefault ? (
                        <LinearGradient
                          colors={[currentColors.secondary, currentColors.highlight]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={styles.defaultBadge}
                        >
                          <Text style={[styles.defaultBadgeText, { color: currentColors.background }]}>Default</Text>
                        </LinearGradient>
                      ) : (
                        <Pressable
                          onPress={() => handleSetDefault(card.squareCardId)}
                          style={styles.setDefaultButton}
                          disabled={processing}
                        >
                          <Text style={[styles.setDefaultText, { color: currentColors.secondary }]}>
                            Set as Default
                          </Text>
                        </Pressable>
                      )}
                      <Pressable
                        onPress={() => handleRemoveCard(card.squareCardId)}
                        style={styles.removeButton}
                        disabled={processing}
                      >
                        <IconSymbol name="trash" size={20} color={currentColors.textSecondary} />
                      </Pressable>
                    </View>
                  </LinearGradient>
                ))}
              </View>
            )}

            <View style={styles.securityNote}>
              <IconSymbol name="lock.fill" size={20} color={currentColors.textSecondary} />
              <Text style={[styles.securityNoteText, { color: currentColors.textSecondary }]}>
                Your payment information is encrypted and secure
              </Text>
            </View>
          </ScrollView>
        </View>

        <SquareWebCardEntry
          visible={webCardVisible}
          applicationId={process.env.EXPO_PUBLIC_SQUARE_APPLICATION_ID ?? ''}
          locationId={process.env.EXPO_PUBLIC_SQUARE_LOCATION_ID ?? ''}
          isSandbox={process.env.EXPO_PUBLIC_SQUARE_ENVIRONMENT !== 'production'}
          baseUrl={SUPABASE_URL}
          currentColors={currentColors}
          onNonce={(nonce) => {
            setWebCardVisible(false);
            setProcessing(false);
            pendingNonce.current = nonce;
            setNonceReady(true);
          }}
          onCancel={() => {
            setWebCardVisible(false);
            setProcessing(false);
          }}
        />
        <Toast
          visible={toastVisible}
          message={toastMessage}
          type={toastType}
          onHide={() => setToastVisible(false)}
          currentColors={currentColors}
        />
        <Dialog
          visible={dialogVisible}
          title={dialogConfig.title}
          message={dialogConfig.message}
          buttons={dialogConfig.buttons}
          onHide={() => setDialogVisible(false)}
          currentColors={currentColors}
        />
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradientContainer: { flex: 1 },
  safeArea: { flex: 1 },
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 24,
    borderBottomWidth: 2,
    boxShadow: '0px 6px 20px rgba(74, 215, 194, 0.3)',
    elevation: 8,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 0,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    boxShadow: '0px 4px 12px rgba(212, 175, 55, 0.25)',
    elevation: 4,
  },
  headerTitle: {
    fontSize: 32,
    fontFamily: 'PlayfairDisplay_700Bold',
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 60 },
  loadingText: { marginTop: 16, fontSize: 16, fontFamily: 'Inter_400Regular' },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyStateTitle: { fontSize: 24, fontFamily: 'PlayfairDisplay_700Bold', marginTop: 20, marginBottom: 8 },
  emptyStateText: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', paddingHorizontal: 40 },
  cardsContainer: { marginBottom: 20 },
  cardItem: { borderRadius: 0, padding: 20, marginBottom: 16, borderWidth: 2, boxShadow: '0px 8px 24px rgba(212, 175, 55, 0.3)', elevation: 8 },
  cardInfo: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  iconContainer: { borderRadius: 0, overflow: 'hidden', borderWidth: 2, padding: 8, boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.2)', elevation: 0 },
  cardDetails: { flex: 1, marginLeft: 16 },
  cardNumber: { fontSize: 16, fontFamily: 'PlayfairDisplay_700Bold', marginBottom: 4 },
  cardExpiry: { fontSize: 14, fontFamily: 'Inter_400Regular' },
  cardActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  defaultBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 0, boxShadow: '0px 4px 12px rgba(212, 175, 55, 0.25)', elevation: 4 },
  defaultBadgeText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  setDefaultButton: { paddingHorizontal: 12, paddingVertical: 6 },
  setDefaultText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  removeButton: { padding: 8 },
  addNewButton: { borderRadius: 0, marginBottom: 20, boxShadow: '0px 8px 24px rgba(212, 175, 55, 0.4)', elevation: 8 },
  addNewButtonInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, paddingHorizontal: 20, gap: 8 },
  addNewButtonText: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  infoCard: { flexDirection: 'row', padding: 16, borderRadius: 0, gap: 12, marginBottom: 20, borderWidth: 2, boxShadow: '0px 8px 24px rgba(212, 175, 55, 0.3)', elevation: 8 },
  infoText: { flex: 1, fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 20 },
  securityNote: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, gap: 8 },
  securityNoteText: { fontSize: 14, fontFamily: 'Inter_400Regular' },
});
