import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useApp } from '@/contexts/AppContext';
import { IconSymbol } from '@/components/IconSymbol';
import * as Haptics from 'expo-haptics';
import Toast from '@/components/Toast';
import { supabase } from '@/app/integrations/supabase/client';
import { useStripe, CardField } from '@stripe/stripe-react-native';

interface StoredCard {
  id: string;
  cardBrand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  cardholderName?: string;
  isDefault: boolean;
  stripePaymentMethodId: string;
  stripeCustomerId: string;
}

export default function PaymentMethodsScreen() {
  const router = useRouter();
  const { userProfile, currentColors, loadUserProfile } = useApp();
  const { createPaymentMethod, confirmPayment } = useStripe();
  
  const [storedCards, setStoredCards] = useState<StoredCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [showAddCard, setShowAddCard] = useState(false);
  const [cardComplete, setCardComplete] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error' | 'info'>('success');

  const showToast = (type: 'success' | 'error' | 'info', message: string) => {
    setToastType(type);
    setToastMessage(message);
    setToastVisible(true);
  };

  const loadStoredCards = useCallback(async () => {
    if (!userProfile) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('payment_methods')
        .select('*')
        .eq('user_id', userProfile.id)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (data && data.length > 0) {
        const cards: StoredCard[] = data.map((card: any) => ({
          id: card.id,
          cardBrand: card.brand || card.type,
          last4: card.last4 || card.card_number?.slice(-4),
          expMonth: card.exp_month || parseInt(card.expiry_date?.slice(0, 2)),
          expYear: card.exp_year || parseInt(card.expiry_date?.slice(2, 4)),
          cardholderName: card.cardholder_name,
          isDefault: card.is_default,
          stripePaymentMethodId: card.stripe_payment_method_id,
          stripeCustomerId: card.stripe_customer_id,
        }));
        
        setStoredCards(cards);
      } else {
        setStoredCards([]);
      }
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

  const getOrCreateStripeCustomer = async () => {
    try {
      // Check if user already has a Stripe customer ID
      const { data: existingCard } = await supabase
        .from('payment_methods')
        .select('stripe_customer_id')
        .eq('user_id', userProfile!.id)
        .limit(1)
        .single();

      if (existingCard?.stripe_customer_id) {
        return existingCard.stripe_customer_id;
      }

      // Create new Stripe customer
      const { data, error } = await supabase.functions.invoke('create-stripe-customer', {
        body: {
          userId: userProfile!.id,
          email: userProfile!.email,
          name: userProfile!.name,
        },
      });

      if (error) throw error;
      return data.customerId;
    } catch (error) {
      console.error('Error getting Stripe customer:', error);
      throw error;
    }
  };

  const handleAddCard = async () => {
    if (!cardComplete) {
      showToast('error', 'Please enter complete card details');
      return;
    }

    try {
      setProcessing(true);

      // Create payment method with Stripe
      const { paymentMethod, error: pmError } = await createPaymentMethod({
        paymentMethodType: 'Card',
      });

      if (pmError) {
        throw new Error(pmError.message);
      }

      if (!paymentMethod) {
        throw new Error('Failed to create payment method');
      }

      // Get or create Stripe customer
      const customerId = await getOrCreateStripeCustomer();

      // Save payment method to Stripe customer
      const { data: saveData, error: saveError } = await supabase.functions.invoke(
        'save-payment-method',
        {
          body: {
            paymentMethodId: paymentMethod.id,
            customerId,
            userId: userProfile!.id,
            setAsDefault: storedCards.length === 0, // First card is default
          },
        }
      );

      if (saveError) throw saveError;

      // Save to local database
      const { error: dbError } = await supabase
        .from('payment_methods')
        .insert({
          user_id: userProfile!.id,
          type: 'credit',
          stripe_payment_method_id: paymentMethod.id,
          stripe_customer_id: customerId,
          last4: paymentMethod.Card?.last4,
          brand: paymentMethod.Card?.brand,
          exp_month: paymentMethod.Card?.expMonth,
          exp_year: paymentMethod.Card?.expYear,
          card_number: `****${paymentMethod.Card?.last4}`,
          cardholder_name: userProfile!.name,
          expiry_date: `${paymentMethod.Card?.expMonth?.toString().padStart(2, '0')}${paymentMethod.Card?.expYear?.toString().slice(-2)}`,
          is_default: storedCards.length === 0,
        });

      if (dbError) throw dbError;

      showToast('success', 'Card added successfully');
      setShowAddCard(false);
      await loadStoredCards();
    } catch (error: any) {
      console.error('Error adding card:', error);
      showToast('error', error.message || 'Failed to add card');
    } finally {
      setProcessing(false);
    }
  };

  const handleSetDefault = async (cardId: string) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    try {
      setProcessing(true);

      const card = storedCards.find(c => c.id === cardId);
      if (!card) throw new Error('Card not found');

      // Update Stripe default
      await supabase.functions.invoke('update-default-payment-method', {
        body: {
          customerId: card.stripeCustomerId,
          paymentMethodId: card.stripePaymentMethodId,
        },
      });

      // Update all cards to not be default
      await supabase
        .from('payment_methods')
        .update({ is_default: false })
        .eq('user_id', userProfile!.id);

      // Set the selected card as default
      const { error } = await supabase
        .from('payment_methods')
        .update({ is_default: true })
        .eq('id', cardId);

      if (error) throw error;

      showToast('success', 'Default card updated successfully');
      await loadStoredCards();
    } catch (error) {
      console.error('Error setting default card:', error);
      showToast('error', 'Failed to update default card');
    } finally {
      setProcessing(false);
    }
  };

  const handleRemoveCard = (cardId: string) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    Alert.alert(
      'Remove Payment Method',
      'Are you sure you want to remove this payment method?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              setProcessing(true);

              const card = storedCards.find(c => c.id === cardId);
              if (card) {
                // Detach from Stripe
                await supabase.functions.invoke('detach-payment-method', {
                  body: {
                    paymentMethodId: card.stripePaymentMethodId,
                  },
                });
              }

              // Remove from database
              const { error } = await supabase
                .from('payment_methods')
                .delete()
                .eq('id', cardId);

              if (error) throw error;

              showToast('success', 'Payment method removed successfully');
              await loadStoredCards();
            } catch (error) {
              console.error('Error removing card:', error);
              showToast('error', 'Failed to remove payment method');
            } finally {
              setProcessing(false);
            }
          },
        },
      ]
    );
  };

  const getCardBrandIcon = (brand: string) => {
    const brandLower = brand.toLowerCase();
    if (brandLower.includes('visa')) return 'creditcard.fill';
    if (brandLower.includes('mastercard')) return 'creditcard.fill';
    if (brandLower.includes('amex') || brandLower.includes('american')) return 'creditcard.fill';
    if (brandLower.includes('discover')) return 'creditcard.fill';
    return 'creditcard';
  };

  const styles = StyleSheet.create({
    safeArea: {
      flex: 1,
    },
    container: {
      flex: 1,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 16,
    },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: currentColors.card,
      justifyContent: 'center',
      alignItems: 'center',
      boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.1)',
      elevation: 2,
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: 'bold',
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: 20,
      paddingBottom: 40,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 60,
    },
    loadingText: {
      marginTop: 16,
      fontSize: 16,
    },
    emptyState: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 60,
    },
    emptyStateTitle: {
      fontSize: 20,
      fontWeight: 'bold',
      marginTop: 16,
      marginBottom: 8,
    },
    emptyStateText: {
      fontSize: 16,
      textAlign: 'center',
      paddingHorizontal: 40,
      lineHeight: 24,
    },
    cardsContainer: {
      marginBottom: 20,
    },
    cardItem: {
      borderRadius: 16,
      padding: 20,
      marginBottom: 16,
      boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
      elevation: 3,
    },
    cardInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 16,
    },
    cardDetails: {
      flex: 1,
      marginLeft: 16,
    },
    cardNumber: {
      fontSize: 18,
      fontWeight: '600',
      marginBottom: 4,
    },
    cardHolder: {
      fontSize: 14,
      marginBottom: 2,
    },
    cardExpiry: {
      fontSize: 12,
    },
    cardActions: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    defaultBadge: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 12,
    },
    defaultBadgeText: {
      fontSize: 12,
      fontWeight: '600',
    },
    setDefaultButton: {
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    setDefaultText: {
      fontSize: 14,
      fontWeight: '600',
    },
    removeButton: {
      padding: 8,
    },
    addNewButton: {
      borderRadius: 12,
      padding: 20,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 20,
      boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.1)',
      elevation: 2,
    },
    addNewButtonText: {
      fontSize: 16,
      fontWeight: '600',
      marginLeft: 12,
    },
    infoCard: {
      flexDirection: 'row',
      padding: 16,
      borderRadius: 12,
      marginBottom: 20,
      gap: 12,
    },
    infoText: {
      flex: 1,
      fontSize: 14,
      lineHeight: 20,
    },
    securityNote: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16,
      gap: 8,
    },
    securityNoteText: {
      fontSize: 14,
    },
    cardFieldContainer: {
      marginBottom: 20,
      padding: 20,
      borderRadius: 16,
    },
    cardFieldLabel: {
      fontSize: 16,
      fontWeight: '600',
      marginBottom: 12,
    },
    cardField: {
      width: '100%',
      height: 50,
    },
    addCardButtons: {
      flexDirection: 'row',
      gap: 12,
      marginBottom: 20,
    },
    cancelButton: {
      flex: 1,
      borderRadius: 12,
      padding: 16,
      alignItems: 'center',
      borderWidth: 1,
    },
    saveButton: {
      flex: 1,
      borderRadius: 12,
      padding: 16,
      alignItems: 'center',
    },
    buttonText: {
      fontSize: 16,
      fontWeight: '600',
    },
  });

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: currentColors.background }]} edges={['top']}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable
            onPress={() => {
              if (Platform.OS !== 'web') {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }
              router.back();
            }}
            style={styles.backButton}
          >
            <IconSymbol name="chevron.left" size={24} color={currentColors.primary} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: currentColors.text }]}>Payment Methods</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {!showAddCard && (
            <View style={[styles.infoCard, { backgroundColor: currentColors.highlight + '20' }]}>
              <IconSymbol name="info" size={20} color={currentColors.primary} />
              <Text style={[styles.infoText, { color: currentColors.text }]}>
                Your payment methods are securely stored with Stripe. Card details are encrypted and never stored on our servers.
              </Text>
            </View>
          )}

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={currentColors.primary} />
              <Text style={[styles.loadingText, { color: currentColors.textSecondary }]}>
                Loading saved cards...
              </Text>
            </View>
          ) : showAddCard ? (
            <>
              <View style={[styles.cardFieldContainer, { backgroundColor: currentColors.card }]}>
                <Text style={[styles.cardFieldLabel, { color: currentColors.text }]}>
                  Card Details
                </Text>
                <CardField
                  postalCodeEnabled={true}
                  placeholders={{
                    number: '4242 4242 4242 4242',
                  }}
                  cardStyle={{
                    backgroundColor: currentColors.background,
                    textColor: currentColors.text,
                  }}
                  style={styles.cardField}
                  onCardChange={(cardDetails) => {
                    setCardComplete(cardDetails.complete);
                  }}
                />
              </View>

              <View style={styles.addCardButtons}>
                <Pressable
                  onPress={() => setShowAddCard(false)}
                  style={[styles.cancelButton, { borderColor: currentColors.border }]}
                  disabled={processing}
                >
                  <Text style={[styles.buttonText, { color: currentColors.text }]}>
                    Cancel
                  </Text>
                </Pressable>
                <Pressable
                  onPress={handleAddCard}
                  style={[styles.saveButton, { 
                    backgroundColor: cardComplete ? currentColors.primary : currentColors.border,
                    opacity: processing ? 0.6 : 1,
                  }]}
                  disabled={!cardComplete || processing}
                >
                  {processing ? (
                    <ActivityIndicator color={currentColors.card} />
                  ) : (
                    <Text style={[styles.buttonText, { color: currentColors.card }]}>
                      Save Card
                    </Text>
                  )}
                </Pressable>
              </View>
            </>
          ) : storedCards.length === 0 ? (
            <View style={styles.emptyState}>
              <IconSymbol name="creditcard" size={64} color={currentColors.textSecondary} />
              <Text style={[styles.emptyStateTitle, { color: currentColors.text }]}>
                No Payment Methods
              </Text>
              <Text style={[styles.emptyStateText, { color: currentColors.textSecondary }]}>
                Add a payment method to make checkout faster and easier.
              </Text>
            </View>
          ) : (
            <View style={styles.cardsContainer}>
              {storedCards.map((card) => (
                <View key={card.id} style={[styles.cardItem, { backgroundColor: currentColors.card }]}>
                  <View style={styles.cardInfo}>
                    <IconSymbol name={getCardBrandIcon(card.cardBrand)} size={32} color={currentColors.primary} />
                    <View style={styles.cardDetails}>
                      <Text style={[styles.cardNumber, { color: currentColors.text }]}>
                        {card.cardBrand} •••• {card.last4}
                      </Text>
                      {card.cardholderName && (
                        <Text style={[styles.cardHolder, { color: currentColors.textSecondary }]}>
                          {card.cardholderName}
                        </Text>
                      )}
                      <Text style={[styles.cardExpiry, { color: currentColors.textSecondary }]}>
                        Expires {String(card.expMonth).padStart(2, '0')}/{card.expYear}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.cardActions}>
                    {card.isDefault ? (
                      <View style={[styles.defaultBadge, { backgroundColor: currentColors.primary }]}>
                        <Text style={[styles.defaultBadgeText, { color: currentColors.card }]}>
                          Default
                        </Text>
                      </View>
                    ) : (
                      <Pressable
                        onPress={() => handleSetDefault(card.id)}
                        style={styles.setDefaultButton}
                        disabled={processing}
                      >
                        <Text style={[styles.setDefaultText, { color: currentColors.primary }]}>
                          Set as Default
                        </Text>
                      </Pressable>
                    )}
                    <Pressable
                      onPress={() => handleRemoveCard(card.id)}
                      style={styles.removeButton}
                      disabled={processing}
                    >
                      <IconSymbol name="trash" size={20} color={currentColors.accent} />
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          )}

          {!showAddCard && !loading && (
            <Pressable
              onPress={() => {
                if (Platform.OS !== 'web') {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }
                setShowAddCard(true);
              }}
              style={[styles.addNewButton, { backgroundColor: currentColors.primary }]}
            >
              <IconSymbol name="plus" size={24} color={currentColors.card} />
              <Text style={[styles.addNewButtonText, { color: currentColors.card }]}>
                Add New Card
              </Text>
            </Pressable>
          )}

          <View style={styles.securityNote}>
            <IconSymbol name="lock.fill" size={20} color={currentColors.textSecondary} />
            <Text style={[styles.securityNoteText, { color: currentColors.textSecondary }]}>
              Secured by Stripe • PCI DSS compliant
            </Text>
          </View>
        </ScrollView>
      </View>
      
      <Toast
        visible={toastVisible}
        message={toastMessage}
        type={toastType}
        onHide={() => setToastVisible(false)}
        currentColors={currentColors}
      />
    </SafeAreaView>
  );
}