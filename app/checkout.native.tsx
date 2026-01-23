
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '@/contexts/AppContext';
import { IconSymbol } from '@/components/IconSymbol';
import * as Haptics from 'expo-haptics';
import Toast from '@/components/Toast';
import { SUPABASE_URL, supabase } from '@/app/integrations/supabase/client';
import { StripeProvider, useStripe } from '@stripe/stripe-react-native';
import Dialog from '@/components/Dialog';
import { LinearGradient } from 'expo-linear-gradient';
import * as Linking from 'expo-linking';

// ============================================================================
// TYPES
// ============================================================================

interface AddressValidationResult {
  success: boolean;
  isValid: boolean;
  formattedAddress?: string;
  addressComponents?: {
    streetNumber?: string;
    street?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
  confidence?: 'high' | 'medium' | 'low';
  suggestions?: string[];
  error?: string;
}

type OrderType = 'delivery' | 'pickup';

interface Order {
  id: string; // uuid
  user_id: string | null;

  total: number; // numeric(10,2) → number in TS
  points_earned: number;

  status:
    | 'pending'
    | 'preparing'
    | 'ready'
    | 'completed'
    | 'cancelled';

  payment_status:
    | 'pending'
    | 'processing'
    | 'succeeded'
    | 'failed'
    | 'canceled'
    | null;

  payment_id: string | null;

  order_number: number;

  full_name: string | null;

  delivery_address: string | null;
  pickup_notes: string | null;

  delivery_provider: string | null;
  delivery_triggered_at: string | null;
  cancellation_deadline: string | null;

  // Uber
  uber_delivery_id: string | null;
  uber_delivery_status: string | null;
  uber_tracking_url: string | null;
  uber_courier_name: string | null;
  uber_courier_phone: string | null;
  uber_courier_location: Record<string, unknown> | null;
  uber_delivery_eta: string | null;
  uber_proof_of_delivery: Record<string, unknown> | null;

  // DoorDash
  doordash_delivery_id: string | null;
  doordash_delivery_status: string | null;
  doordash_tracking_url: string | null;
  doordash_dasher_name: string | null;
  doordash_dasher_phone: string | null;
  doordash_dasher_location: Record<string, unknown> | null;
  doordash_delivery_eta: string | null;
  doordash_proof_of_delivery: Record<string, unknown> | null;

  read: boolean | null;
  read_at: string | null;

  created_at: string;
  updated_at: string;
}

interface StripePayment {
  id: string;
  user_id: string;
  order_id: string;
  payment_id: string;
  amount: number;
  currency: string;
  status: string;
  payment_method?: string;
  receipt_url?: string;
  error_message?: string;
  metadata?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
}

interface StoredCard {
  id: string;
  stripePaymentMethodId: string;
  cardBrand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  isDefault: boolean;
}

// ============================================================================
// STRIPE PUBLISHABLE KEY
// ============================================================================
const STRIPE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || 'pk_live_51SaVNBEpxgw216dfngaO9r3erOFV7XFC4zvvwMd97HuPpWpvCy26sCwWITZHhmtAv6iZLT35RGITrIxBoTF1v9AI007NGoktyP';

// ============================================================================
// POINTS SYSTEM CONSTANTS
// ============================================================================
// CORRECT LOGIC: 100 points = $1
// This means: 1 point = $0.01
const POINTS_TO_DOLLAR_RATE = 0.01; // 1 point = $0.01, so 100 points = $1
const DISCOUNT_PERCENTAGE = 0.15; // 15% discount
const POINTS_REWARD_PERCENTAGE = 0.05; // 5% of order as points

// ============================================================================
// CHECKOUT CONTENT COMPONENT
// ============================================================================

function CheckoutContent() {
  const router = useRouter();
  const { 
    cart, 
    userProfile, 
    currentColors, 
    setTabBarVisible,
    clearCart,
    loadUserProfile
  } = useApp();

  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  // ============================================================================
  // STATE
  // ============================================================================

  const [orderType, setOrderType] = useState<OrderType>('pickup');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [pickupNotes, setPickupNotes] = useState('');
  const [usePoints, setUsePoints] = useState(false);
  const [processing, setProcessing] = useState(false);
  
  // Address validation state
  const [addressValidation, setAddressValidation] = useState<AddressValidationResult | null>(null);
  const [isValidatingAddress, setIsValidatingAddress] = useState(false);
  const [addressTouched, setAddressTouched] = useState(false);
  const [validatedAddress, setValidatedAddress] = useState<string>('');
  
  // Toast state
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error' | 'info'>('success');

  //Dialog state
  const [dialogVisible, setDialogVisible] = useState(false);
  const [dialogType, setDialogType] = useState<'remove' | 'empty'>('remove');

  // Order state for realtime updates
  const [currentOrderId, setCurrentOrderId] = useState<string | null>(null);

  // Payment Sheet state
  const [paymentSheetReady, setPaymentSheetReady] = useState(false);

  // ============================================================================
  // COMPUTED VALUES (CORRECTED POINTS SYSTEM)
  // ============================================================================

  const availablePoints = userProfile?.points || 0;
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  
  // Apply 15% discount before tax
  const discount = subtotal * DISCOUNT_PERCENTAGE;
  const subtotalAfterDiscount = subtotal - discount;
  
  // Calculate tax on discounted amount
  const tax = subtotalAfterDiscount * 0.0975;
  
  // Points discount (if using points)
  // CORRECTED: 100 points = $1, so 1 point = $0.01
  // Convert points to dollars: availablePoints * 0.01
  // Cap at 20% of subtotal after discount
  const pointsValueInDollars = availablePoints * POINTS_TO_DOLLAR_RATE;
  const maxPointsDiscount = subtotalAfterDiscount * 0.2;
  const pointsDiscount = usePoints ? Math.min(pointsValueInDollars, maxPointsDiscount) : 0;
  
  // Total after all discounts and tax
  const total = subtotalAfterDiscount + tax - pointsDiscount;
  
  // Points to earn: 15% of order total (after discount, before tax)
  // CORRECTED: Award points based on 100 points = $1
  // For $100 order, user gets 5% = $5 value = 500 points
  const pointsToEarn = Math.floor((subtotalAfterDiscount * POINTS_REWARD_PERCENTAGE) / POINTS_TO_DOLLAR_RATE);

  // ============================================================================
  // HELPER FUNCTIONS
  // ============================================================================

  const showToast = useCallback((type: 'success' | 'error' | 'info', message: string) => {
    setToastType(type);
    setToastMessage(message);
    setToastVisible(true);
  }, []);

  const getAddressValidationColor = useCallback(() => {
    if (!addressValidation) return currentColors.textSecondary;
    if (!addressValidation.isValid) return '#EF4444';
    if (addressValidation.confidence === 'high') return '#10B981';
    if (addressValidation.confidence === 'medium') return '#F59E0B';
    return '#EF4444';
  }, [addressValidation, currentColors.textSecondary]);

  const getAddressValidationIcon = useCallback((): string => {
    if (isValidatingAddress) return 'hourglass-empty';
    if (!addressValidation) return 'location-on';
    if (!addressValidation.isValid) return 'cancel';
    if (addressValidation.confidence === 'high') return 'check-circle';
    if (addressValidation.confidence === 'medium') return 'warning';
    return 'cancel';
  }, [isValidatingAddress, addressValidation]);

  const getAddressValidationMessage = useCallback(() => {
    if (isValidatingAddress) return 'Validating address...';
    if (!addressValidation) return '';
    if (!addressValidation.isValid) return 'Address could not be verified. Please check for errors.';
    if (addressValidation.confidence === 'high') return 'Address verified ✓';
    if (addressValidation.confidence === 'medium') return 'Address partially verified. Please review.';
    return 'Address verification failed.';
  }, [isValidatingAddress, addressValidation]);

  // ============================================================================
  // ADDRESS VALIDATION
  // ============================================================================

  const validateAddress = useCallback(async (address: string) => {
    if (!address || address.trim().length < 5) {
      setAddressValidation(null);
      return;
    }

    setIsValidatingAddress(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(`${SUPABASE_URL}/functions/v1/verify-address`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ address }),
      });

      const result: AddressValidationResult = await response.json();
      console.log('Address validation result:', result);
      
      setAddressValidation(result);
      
      if (result.isValid && result.formattedAddress && result.confidence === 'high') {
        setValidatedAddress(result.formattedAddress);
      }
    } catch (error) {
      console.error('Address validation error:', error);
      setAddressValidation({
        success: false,
        isValid: false,
        error: 'Failed to validate address',
      });
    } finally {
      setIsValidatingAddress(false);
    }
  }, []);

  const useFormattedAddress = useCallback(() => {
    if (addressValidation?.formattedAddress) {
      setDeliveryAddress(addressValidation.formattedAddress);
      setValidatedAddress(addressValidation.formattedAddress);
      // Mark this as the final validated address - no need to revalidate
      setAddressTouched(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [addressValidation]);

  // ============================================================================
  // STRIPE PAYMENT SHEET INITIALIZATION
  // ============================================================================

  const initializePaymentSheet = useCallback(async () => {
    try {
      if (!userProfile) throw new Error('User profile not found');

      console.log('Initializing Stripe Payment Sheet...');

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      // Get the current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not found');

      console.log('Current user ID:', user.id);

      // Get or create Stripe customer - FIXED: Use auth.users id, not profile id
      const { data: customerData, error: customerError } = await supabase
        .from('user_profiles')
        .select('stripe_customer_id')
        .eq('user_id', user.id)
        .single();

      if (customerError) {
        console.error('Error fetching customer data:', customerError);
      }

      let customerId = customerData?.stripe_customer_id;
      console.log('Existing Stripe customer ID:', customerId);

      // If no customer ID exists, create one
      if (!customerId) {
        console.log('Creating Stripe customer...');
        const createCustomerResponse = await fetch(`${SUPABASE_URL}/functions/v1/create-stripe-customer`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            email: userProfile?.email || user.email,
            name: userProfile?.name,
          }),
        });

        if (!createCustomerResponse.ok) {
          const errorText = await createCustomerResponse.text();
          console.error('Failed to create Stripe customer:', errorText);
          throw new Error('Failed to create Stripe customer');
        }

        const { customerId: newCustomerId } = await createCustomerResponse.json();
        customerId = newCustomerId;
        console.log('Stripe customer created:', customerId);
      }

      // Create payment intent with setup for future usage
      console.log('Creating payment intent with customer:', customerId);
      console.log('Amount:', Math.round(total * 100), 'cents');
      
      const response = await fetch(`${SUPABASE_URL}/functions/v1/create-payment-intent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          amount: Math.round(total * 100), // Convert to cents
          currency: 'usd',
          customerId,
          setupFutureUsage: 'off_session', // Allow saving payment method
          metadata: {
            orderType,
            itemCount: cart.length,
            userId: user.id,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error creating payment intent:', errorText);
        throw new Error('Failed to create payment intent');
      }

      const { clientSecret, ephemeralKey, paymentIntentId, customerId: returnedCustomerId } = await response.json();
      console.log('Payment intent created:', paymentIntentId);
      console.log('Ephemeral key received:', ephemeralKey ? 'Yes' : 'No');
      console.log('Customer ID from response:', returnedCustomerId);

      // Store payment intent ID for later order creation
      return { clientSecret, ephemeralKey, paymentIntentId, customerId: returnedCustomerId };
    } catch (error) {
      console.error('Error in initializePaymentSheet:', error);
      throw error;
    }
  }, [total, orderType, cart, userProfile]);

  // ============================================================================
  // ORDER CREATION (AFTER SUCCESSFUL PAYMENT)
  // ============================================================================

  const createOrderAfterPayment = useCallback(async (paymentIntentId: string) => {
    if (!userProfile) throw new Error('User profile not found');

    console.log('Creating order after successful payment...');
    console.log('Payment Intent ID:', paymentIntentId);
    console.log('Points to earn:', pointsToEarn);

    // Create order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        user_id: userProfile.id,
        total: total,
        points_earned: pointsToEarn,
        status: 'confirmed',
        payment_status: 'succeeded',
        payment_id: paymentIntentId,
        delivery_address: orderType === 'delivery' ? (validatedAddress || deliveryAddress) : null,
        pickup_notes: orderType === 'pickup' ? pickupNotes : null,
      })
      .select()
      .single<Order>();

    if (orderError || !order) {
      console.error('Error creating order:', orderError);
      throw new Error('Failed to create order');
    }

    console.log('Order created:', order.id);

    // Create order items
    const orderItems = cart.map(item => ({
      order_id: order.id,
      menu_item_id: item.id,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
    }));

    const { error: itemsError } = await supabase
      .from('order_items')
      .insert(orderItems);

    if (itemsError) {
      console.error('Error creating order items:', itemsError);
      throw new Error('Failed to create order items');
    }

    // Deduct points if used
    if (usePoints && pointsDiscount > 0) {
      // CORRECTED: Convert dollars back to points (divide by 0.01)
      const pointsToDeduct = Math.floor(pointsDiscount / POINTS_TO_DOLLAR_RATE);
      const { error: pointsError } = await supabase
        .from('user_profiles')
        .update({ points: availablePoints - pointsToDeduct })
        .eq('id', userProfile.id);

      if (pointsError) {
        console.error('Error deducting points:', pointsError);
      } else {
        console.log(`✓ Deducted ${pointsToDeduct} points (worth $${pointsDiscount.toFixed(2)})`);
      }
    }

    // Award points for this order
    const newPointsTotal = availablePoints - (usePoints ? Math.floor(pointsDiscount / POINTS_TO_DOLLAR_RATE) : 0) + pointsToEarn;
    const { error: awardPointsError } = await supabase
      .from('user_profiles')
      .update({ points: newPointsTotal })
      .eq('id', userProfile.id);

    if (awardPointsError) {
      console.error('Error awarding points:', awardPointsError);
    } else {
      console.log(`✓ Awarded ${pointsToEarn} points`);
    }

    return order.id;
  }, [userProfile, total, pointsToEarn, orderType, validatedAddress, deliveryAddress, pickupNotes, cart, usePoints, pointsDiscount, availablePoints]);

  // ============================================================================
  // ORDER PLACEMENT
  // ============================================================================

  const handlePlaceOrder = useCallback(async () => {
    console.log('=== Starting Checkout Flow ===');

    // Validate address if delivery
    if (orderType === 'delivery') {
      if (!deliveryAddress.trim()) {
        showToast('error', 'Please enter a delivery address.');
        return;
      }

      if (addressTouched && addressValidation) {
        if (!addressValidation.isValid) {
          Alert.alert(
            'Address Verification',
            'The address you entered could not be verified. Please check and correct your address before continuing.',
            [{ text: 'OK' }]
          );
          return;
        }

        if (addressValidation.confidence === 'low') {
          Alert.alert(
            'Address Verification',
            'The address you entered has low confidence. We recommend reviewing it for accuracy.',
            [
              { text: 'Review Address', style: 'cancel' },
              { 
                text: 'Continue Anyway', 
                onPress: async () => {
                  await proceedWithPayment();
                },
                style: 'destructive'
              }
            ]
          );
          return;
        }
      }
    }

    await proceedWithPayment();
  }, [orderType, deliveryAddress, addressTouched, addressValidation, showToast]);

const proceedWithPayment = useCallback(async () => {
  setProcessing(true);

  try {
    // Step 1: Initialize Payment Sheet and get payment intent
    const paymentData = await initializePaymentSheet();
    
    if (!paymentData) {
      throw new Error('Failed to initialize payment');
    }

    const { clientSecret, ephemeralKey, paymentIntentId, customerId } = paymentData;

    // Step 2: Configure Payment Sheet
    const returnURL = Linking.createURL('checkout');
    console.log('Return URL:', returnURL);

    const initConfig: any = {
      merchantDisplayName: 'Jagabans LA',
      paymentIntentClientSecret: clientSecret,
      allowsDelayedPaymentMethods: false,
      returnURL: returnURL,
      defaultBillingDetails: {
        name: userProfile?.name,
        email: userProfile?.email,
      },
      googlePay: {
        merchantCountryCode: 'US',
        testEnv: false,
        currencyCode: 'usd',
      },
    };

    // Add customer and ephemeral key if both are present
    if (customerId && ephemeralKey) {
      console.log('✓ Adding customer and ephemeral key to Payment Sheet config');
      initConfig.customerId = customerId;
      initConfig.customerEphemeralKeySecret = ephemeralKey;
    }

    const { error: initError } = await initPaymentSheet(initConfig);

    if (initError) {
      console.error('Error initializing payment sheet:', initError);
      throw new Error(initError.message);
    }

    console.log('✓ Payment Sheet initialized successfully');

    // Step 3: Present Payment Sheet
    console.log('Presenting Payment Sheet...');
    const { error: presentError } = await presentPaymentSheet();

    if (presentError) {
      if (presentError.code === 'Canceled') {
        console.log('Payment cancelled by user');
        showToast('info', 'Payment cancelled');
        setProcessing(false);
        return;
      }
      console.error('Payment sheet error:', presentError);
      throw new Error(presentError.message);
    }

    console.log('✓ Payment completed successfully');
    showToast('success', 'Payment successful! Creating your order...');

    // Step 4: Wait for webhook to create order (poll for order)
    const orderId = await waitForOrderCreation(paymentIntentId);
    
    if (!orderId) {
      throw new Error('Order creation timed out. Please contact support with payment ID: ' + paymentIntentId);
    }

    console.log('✓ Order confirmed:', orderId);

    // Step 5: Clear cart and reload profile
    clearCart();
    await loadUserProfile();

    // Step 6: Navigate to confirmation
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    
    setTimeout(() => {
      setProcessing(false);
      router.push({
        pathname: '/order-confirmation',
        params: { orderId },
      });
    }, 100);

  } catch (error) {
    console.error('Order placement error:', error);
    const errorMessage = error instanceof Error 
      ? error.message 
      : 'Failed to place order. Please try again.';
    showToast('error', errorMessage);
    setProcessing(false);
  }
}, [initializePaymentSheet, initPaymentSheet, presentPaymentSheet, clearCart, loadUserProfile, router, showToast, userProfile]);

const waitForOrderCreation = useCallback(async (paymentIntentId: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      channel.unsubscribe();
      reject(new Error('Order creation timed out'));
    }, 30000); // 30 second timeout

    // Subscribe to orders table for this payment
    const channel = supabase
      .channel('order-creation')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'orders',
          filter: `payment_id=eq.${paymentIntentId}`,
        },
        (payload) => {
          console.log('✓ Order created via webhook:', payload.new.id);
          clearTimeout(timeout);
          channel.unsubscribe();
          resolve(payload.new.id);
        }
      )
      .subscribe();

    // Also check if order already exists (in case webhook was faster)
    supabase
      .from('orders')
      .select('id')
      .eq('payment_id', paymentIntentId)
      .maybeSingle<Order>()
      .then(({ data: order }) => {
        if (order) {
          console.log('✓ Order already exists:', order.id);
          clearTimeout(timeout);
          channel.unsubscribe();
          resolve(order.id);
        }
      });
  });
}, []);

  // ============================================================================
  // EFFECTS
  // ============================================================================

  useEffect(() => {
    setTabBarVisible(false);
    return () => setTabBarVisible(true);
  }, [setTabBarVisible]);

  useEffect(() => {
    if (orderType !== 'delivery' || !addressTouched || !deliveryAddress.trim()) {
      return;
    }
    const timeoutId = setTimeout(() => validateAddress(deliveryAddress), 1000);
    return () => clearTimeout(timeoutId);
  }, [deliveryAddress, addressTouched, orderType, validateAddress]);

  // ============================================================================
  // STYLES
  // ============================================================================

  const styles = StyleSheet.create({
    gradientContainer: {
      flex: 1,
    },
    safeArea: {
      flex: 1,
    },
    container: {
      flex: 1,
    },
    content: {
      padding: 20,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderBottomWidth: 2,
      borderBottomColor: currentColors.border,
    },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: 0,
      justifyContent: 'center',
      alignItems: 'center',
      boxShadow: '0px 4px 12px rgba(212, 175, 55, 0.3)',
      elevation: 4,
    },
    infoBanner: {
      flexDirection: 'row',
      padding: 16,
      borderRadius: 0,
      marginBottom: 20,
      gap: 12,
      borderWidth: 2,
      borderColor: currentColors.border,
      boxShadow: '0px 4px 12px rgba(74, 215, 194, 0.2)',
      elevation: 4,
    },
    infoText: {
      flex: 1,
      fontSize: 14,
      fontFamily: 'Inter_400Regular',
      lineHeight: 20,
      color: currentColors.text,
    },
    section: {
      marginBottom: 24,
    },
    sectionTitle: {
      fontSize: 18,
      fontFamily: 'PlayfairDisplay_700Bold',
      marginBottom: 12,
      color: currentColors.text,
      letterSpacing: 0.5,
    },
    orderTypeSelector: {
      flexDirection: 'row',
      gap: 12,
      marginBottom: 16,
    },
    orderTypeButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16,
      borderRadius: 0,
      borderWidth: 2,
      gap: 8,
      boxShadow: '0px 4px 12px rgba(212, 175, 55, 0.25)',
      elevation: 4,
    },
    orderTypeText: {
      fontSize: 16,
      fontFamily: 'Inter_600SemiBold',
    },
    inputContainer: {
      position: 'relative',
    },
    input: {
      borderRadius: 0,
      padding: 16,
      fontSize: 16,
      fontFamily: 'Inter_400Regular',
      minHeight: 80,
      boxShadow: '0px 4px 12px rgba(212, 175, 55, 0.25)',
      elevation: 4,
      paddingRight: 48,
      backgroundColor: currentColors.card,
      color: currentColors.text,
      borderWidth: 2,
      borderColor: currentColors.border,
    },
    inputWithValidation: {
      borderWidth: 2,
    },
    validationIconContainer: {
      position: 'absolute',
      right: 16,
      top: 16,
    },
    validationMessage: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 8,
      gap: 8,
      paddingHorizontal: 4,
    },
    validationMessageText: {
      fontSize: 13,
      fontFamily: 'Inter_400Regular',
      flex: 1,
    },
    formattedAddressSuggestion: {
      marginTop: 12,
      padding: 12,
      borderRadius: 0,
      borderWidth: 2,
      backgroundColor: currentColors.card,
      borderColor: currentColors.border,
      boxShadow: '0px 4px 12px rgba(74, 215, 194, 0.25)',
      elevation: 4,
    },
    suggestionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 8,
    },
    suggestionTitle: {
      fontSize: 14,
      fontFamily: 'Inter_600SemiBold',
      color: currentColors.text,
    },
    suggestionAddress: {
      fontSize: 14,
      fontFamily: 'Inter_400Regular',
      marginBottom: 8,
      lineHeight: 20,
      color: currentColors.textSecondary,
    },
    useSuggestionButton: {
      borderRadius: 0,
      boxShadow: '0px 4px 12px rgba(74, 215, 194, 0.3)',
      elevation: 4,
    },
    useSuggestionButtonInner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 8,
      gap: 6,
    },
    useSuggestionButtonText: {
      fontSize: 13,
      fontFamily: 'Inter_600SemiBold',
      color: currentColors.background,
    },
    pointsToggle: {
      borderRadius: 0,
      padding: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      boxShadow: '0px 4px 12px rgba(212, 175, 55, 0.25)',
      elevation: 4,
      borderWidth: 2,
      borderColor: currentColors.border,
    },
    pointsToggleLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      flex: 1,
    },
    pointsToggleInfo: {
      flex: 1,
    },
    pointsToggleTitle: {
      fontSize: 16,
      fontFamily: 'Inter_600SemiBold',
      color: currentColors.text,
    },
    pointsToggleSubtitle: {
      fontSize: 14,
      fontFamily: 'Inter_400Regular',
      marginTop: 2,
      color: currentColors.textSecondary,
    },
    checkbox: {
      width: 24,
      height: 24,
      borderRadius: 0,
      borderWidth: 2,
      justifyContent: 'center',
      alignItems: 'center',
      borderColor: currentColors.border,
    },
    summaryCard: {
      borderRadius: 0,
      padding: 20,
      boxShadow: '0px 8px 24px rgba(212, 175, 55, 0.3)',
      elevation: 8,
      borderWidth: 2,
      borderColor: currentColors.border,
    },
    summaryTitle: {
      fontSize: 18,
      fontFamily: 'PlayfairDisplay_700Bold',
      marginBottom: 16,
      color: currentColors.text,
      letterSpacing: 0.5,
    },
    summaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    summaryLabel: {
      fontSize: 16,
      fontFamily: 'Inter_400Regular',
      color: currentColors.textSecondary,
    },
    summaryValue: {
      fontSize: 16,
      fontFamily: 'Inter_600SemiBold',
      color: currentColors.text,
    },
    summaryRowTotal: {
      borderTopWidth: 2,
      paddingTop: 12,
      marginTop: 4,
      borderTopColor: currentColors.border,
    },
    summaryLabelTotal: {
      fontSize: 18,
      fontFamily: 'PlayfairDisplay_700Bold',
      color: currentColors.text,
    },
    summaryValueTotal: {
      fontSize: 20,
      fontFamily: 'Inter_700Bold',
      color: currentColors.secondary,
    },
    pointsEarnCard: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 12,
      borderRadius: 0,
      marginTop: 16,
      gap: 8,
      backgroundColor: currentColors.background,
      borderWidth: 2,
      borderColor: currentColors.border,
    },
    pointsEarnText: {
      flex: 1,
      fontSize: 14,
      fontFamily: 'Inter_600SemiBold',
      color: currentColors.text,
    },
    footer: {
      padding: 20,
      borderTopWidth: 2,
      borderTopColor: currentColors.border,
      boxShadow: '0px -6px 20px rgba(74, 215, 194, 0.3)',
      elevation: 10,
    },
    placeOrderButton: {
      borderRadius: 0,
      boxShadow: '0px 8px 24px rgba(212, 175, 55, 0.5)',
      elevation: 10,
    },
    placeOrderButtonInner: {
      paddingVertical: 16,
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 12,
    },
    placeOrderButtonText: {
      fontSize: 18,
      fontFamily: 'Inter_700Bold',
      color: currentColors.background,
    },
    paymentMethodsInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      borderRadius: 0,
      borderWidth: 2,
      borderColor: currentColors.border,
      backgroundColor: currentColors.card,
      gap: 12,
      boxShadow: '0px 4px 12px rgba(74, 215, 194, 0.2)',
      elevation: 4,
    },
    paymentMethodsInfoText: {
      flex: 1,
      fontSize: 14,
      fontFamily: 'Inter_400Regular',
      lineHeight: 20,
      color: currentColors.text,
    },
  });

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <LinearGradient
      colors={[currentColors.gradientStart || currentColors.background, currentColors.gradientMid || currentColors.background, currentColors.gradientEnd || currentColors.background]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={styles.gradientContainer}
    >
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <LinearGradient
          colors={[currentColors.headerGradientStart || currentColors.card, currentColors.headerGradientEnd || currentColors.card]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.header}
        >
          <LinearGradient
            colors={[currentColors.cardGradientStart || currentColors.card, currentColors.cardGradientEnd || currentColors.card]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.backButton}
          >
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.back();
              }}
              style={{ padding: 8 }}
            >
              <IconSymbol name="arrow-back" size={24} color={currentColors.secondary} />
            </Pressable>
          </LinearGradient>
        </LinearGradient>

        <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
          <View style={styles.content}>
            <LinearGradient
              colors={[currentColors.cardGradientStart || currentColors.card, currentColors.cardGradientEnd || currentColors.card]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.infoBanner}
            >
              <IconSymbol name="info" size={20} color={currentColors.primary} />
              <Text style={styles.infoText}>
                Secure checkout powered by Stripe. Your payment information is encrypted and protected. Enjoy 15% off your order!
              </Text>
            </LinearGradient>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Order Type</Text>
              <View style={styles.orderTypeSelector}>
                <LinearGradient
                  colors={orderType === 'delivery' 
                    ? [currentColors.secondary, currentColors.highlight]
                    : [currentColors.cardGradientStart || currentColors.card, currentColors.cardGradientEnd || currentColors.card]
                  }
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[
                    styles.orderTypeButton,
                    {
                      borderColor: orderType === 'delivery' ? currentColors.secondary : currentColors.border,
                    }
                  ]}
                >
                  <Pressable
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 4 }}
                    onPress={() => {
                      if (!processing) {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setOrderType('delivery');
                      }
                    }}
                    disabled={processing}
                  >
                    <IconSymbol 
                      name="delivery-dining" 
                      size={20} 
                      color={orderType === 'delivery' ? currentColors.background : currentColors.text} 
                    />
                    <Text style={[
                      styles.orderTypeText, 
                      { color: orderType === 'delivery' ? currentColors.background : currentColors.text }
                    ]}>
                      Delivery
                    </Text>
                  </Pressable>
                </LinearGradient>

                <LinearGradient
                  colors={orderType === 'pickup' 
                    ? [currentColors.secondary, currentColors.highlight]
                    : [currentColors.cardGradientStart || currentColors.card, currentColors.cardGradientEnd || currentColors.card]
                  }
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[
                    styles.orderTypeButton,
                    {
                      borderColor: orderType === 'pickup' ? currentColors.secondary : currentColors.border,
                    }
                  ]}
                >
                  <Pressable
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 4 }}
                    onPress={() => {
                      if (!processing) {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setOrderType('pickup');
                      }
                    }}
                    disabled={processing}
                  >
                    <IconSymbol 
                      name="shopping-bag" 
                      size={20} 
                      color={orderType === 'pickup' ? currentColors.background : currentColors.text} 
                    />
                    <Text style={[
                      styles.orderTypeText, 
                      { color: orderType === 'pickup' ? currentColors.background : currentColors.text }
                    ]}>
                      Pickup
                    </Text>
                  </Pressable>
                </LinearGradient>
              </View>
            </View>

            {orderType === 'delivery' && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Delivery Address *</Text>
                <View style={styles.inputContainer}>
                  <TextInput
                    style={[
                      styles.input,
                      styles.inputWithValidation,
                      { 
                        borderColor: addressTouched && addressValidation 
                          ? getAddressValidationColor()
                          : currentColors.border,
                      }
                    ]}
                    placeholder="Enter your full delivery address (street, city, state, ZIP)"
                    placeholderTextColor={currentColors.textSecondary}
                    value={deliveryAddress}
                    onChangeText={(text) => {
                      setDeliveryAddress(text);
                      setAddressTouched(true);
                    }}
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                    editable={!processing}
                  />
                  {addressTouched && (
                    <View style={styles.validationIconContainer}>
                      {isValidatingAddress ? (
                        <ActivityIndicator size="small" color={currentColors.primary} />
                      ) : (
                        <IconSymbol 
                          name={getAddressValidationIcon()} 
                          size={24} 
                          color={getAddressValidationColor()} 
                        />
                      )}
                    </View>
                  )}
                </View>
                
                {addressTouched && addressValidation && (
                  <View style={styles.validationMessage}>
                    <Text style={[
                      styles.validationMessageText, 
                      { color: getAddressValidationColor() }
                    ]}>
                      {getAddressValidationMessage()}
                    </Text>
                  </View>
                )}

                {addressValidation?.isValid && 
                 addressValidation.formattedAddress && 
                 addressValidation.formattedAddress !== deliveryAddress && (
                  <LinearGradient
                    colors={[currentColors.cardGradientStart || currentColors.card, currentColors.cardGradientEnd || currentColors.card]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.formattedAddressSuggestion}
                  >
                    <View style={styles.suggestionHeader}>
                      <IconSymbol name="lightbulb" size={16} color={currentColors.primary} />
                      <Text style={styles.suggestionTitle}>
                        Suggested Address
                      </Text>
                    </View>
                    <Text style={styles.suggestionAddress}>
                      {addressValidation.formattedAddress}
                    </Text>
                    <LinearGradient
                      colors={[currentColors.primary, currentColors.primary]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.useSuggestionButton}
                    >
                      <Pressable
                        style={styles.useSuggestionButtonInner}
                        onPress={useFormattedAddress}
                      >
                        <IconSymbol name="check" size={14} color={currentColors.background} />
                        <Text style={styles.useSuggestionButtonText}>
                          Use This Address
                        </Text>
                      </Pressable>
                    </LinearGradient>
                  </LinearGradient>
                )}
              </View>
            )}

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                {orderType === 'pickup' ? 'Pickup Notes (Optional)' : 'Delivery Notes (Optional)'}
              </Text>
              <TextInput
                style={styles.input}
                placeholder={orderType === 'pickup' 
                  ? 'Add any special instructions for pickup...' 
                  : 'Add any special instructions for delivery...'}
                placeholderTextColor={currentColors.textSecondary}
                value={pickupNotes}
                onChangeText={setPickupNotes}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                editable={!processing}
              />
            </View>

            {/* Payment Methods Info */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Payment Method</Text>
              
              <LinearGradient
                colors={[currentColors.cardGradientStart || currentColors.card, currentColors.cardGradientEnd || currentColors.card]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.paymentMethodsInfo}
              >
                <IconSymbol name="payment" size={24} color={currentColors.primary} />
                <Text style={styles.paymentMethodsInfoText}>
                  Choose from multiple payment options including saved cards, Apple Pay, Google Pay, and more when you proceed to checkout.
                </Text>
              </LinearGradient>
            </View>

            <LinearGradient
              colors={[currentColors.cardGradientStart || currentColors.card, currentColors.cardGradientEnd || currentColors.card]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.summaryCard}
            >
              <Text style={styles.summaryTitle}>Order Summary</Text>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Subtotal</Text>
                <Text style={styles.summaryValue}>${subtotal.toFixed(2)}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: currentColors.secondary }]}>
                  Discount (15%)
                </Text>
                <Text style={[styles.summaryValue, { color: currentColors.secondary }]}>
                  -${discount.toFixed(2)}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Tax (9.75%)</Text>
                <Text style={styles.summaryValue}>${tax.toFixed(2)}</Text>
              </View>
              {usePoints && pointsDiscount > 0 && (
                <View style={styles.summaryRow}>
                  <Text style={[styles.summaryLabel, { color: currentColors.secondary }]}>
                    Points Discount
                  </Text>
                  <Text style={[styles.summaryValue, { color: currentColors.secondary }]}>
                    -${pointsDiscount.toFixed(2)}
                  </Text>
                </View>
              )}
              <View style={[styles.summaryRow, styles.summaryRowTotal]}>
                <Text style={styles.summaryLabelTotal}>Total</Text>
                <Text style={styles.summaryValueTotal}>${total.toFixed(2)}</Text>
              </View>
              <View style={styles.pointsEarnCard}>
                <IconSymbol name="star" size={20} color={currentColors.highlight} />
                <Text style={styles.pointsEarnText}>
                  You&apos;ll earn {pointsToEarn} points with this order! (${(pointsToEarn * POINTS_TO_DOLLAR_RATE).toFixed(2)} value)
                </Text>
              </View>
            </LinearGradient>
          </View>
        </ScrollView>

        <LinearGradient
          colors={[currentColors.cardGradientStart || currentColors.card, currentColors.cardGradientEnd || currentColors.card]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.footer}
        >
          <LinearGradient
            colors={processing 
              ? [currentColors.textSecondary, currentColors.textSecondary]
              : [currentColors.secondary, currentColors.highlight]
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.placeOrderButton, { opacity: processing ? 0.7 : 1 }]}
          >
            <Pressable 
              style={styles.placeOrderButtonInner}
              onPress={handlePlaceOrder}
              disabled={processing}
            >
              {processing ? (
                <>
                  <ActivityIndicator color={currentColors.background} />
                  <Text style={styles.placeOrderButtonText}>
                    Processing...
                  </Text>
                </>
              ) : (
                <>
                  <IconSymbol name="lock" size={20} color={currentColors.background} />
                  <Text style={styles.placeOrderButtonText}>
                    Pay ${total.toFixed(2)}
                  </Text>
                </>
              )}
            </Pressable>
          </LinearGradient>
        </LinearGradient>
        
        <Toast
          visible={toastVisible}
          message={toastMessage}
          type={toastType}
          onHide={() => setToastVisible(false)}
          currentColors={currentColors}
        />
      </SafeAreaView>
    </LinearGradient>
  );
}

// ============================================================================
// MAIN COMPONENT WITH STRIPE PROVIDER
// ============================================================================

export default function CheckoutScreen() {
  return (
    <StripeProvider publishableKey={STRIPE_PUBLISHABLE_KEY}>
      <CheckoutContent />
    </StripeProvider>
  );
}
