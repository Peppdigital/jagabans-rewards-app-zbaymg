import React, { useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  TextInput,
  ActivityIndicator,
  FlatList,
  Keyboard,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '@/contexts/AppContext';
import { IconSymbol } from '@/components/IconSymbol';
import * as Haptics from 'expo-haptics';
import Toast from '@/components/Toast';
import { SUPABASE_URL, supabase } from '@/app/integrations/supabase/client';
import { LinearGradient } from 'expo-linear-gradient';
import SquareWebCardEntry from '@/components/SquareWebCardEntry';
import * as Linking from 'expo-linking';
import {appConfigService} from '@/services/supabaseService';
import { useAppConfig } from '@/hooks/useAppConfig';
import {
  COUNTRY_CODES,
  parseStoredPhone,
  EMAIL_REGEX,
} from '@/utils/checkoutUtils';

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
  /** JSON string ready to pass as dropoff_address to Uber Direct API */
  uberAddress?: string;
  confidence?: 'high' | 'medium' | 'low';
  suggestions?: string[];
  error?: string;
}

interface DeliveryQuote {
  quoteId: string;
  fee: number;
  feeCents: number;
  currency: string;
  duration: number;
  pickupDuration: number;
  dropoffEta: string;
  expires: string;
}

interface OutsideRadiusError {
  distanceMiles: number;
  radiusMiles: number;
  message: string;
}

interface SavedCard {
  id: string;
  squareCardId: string;
  squareCustomerId: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  isDefault: boolean;
}

// ── Google Places types ────────────────────────────────────────────────────

interface PlacesPrediction {
  place_id: string;
  description: string;
  structured_formatting: {
    main_text: string;
    secondary_text: string;
  };
}

type OrderType = 'delivery' | 'pickup';

interface Order {
  id: string;
  user_id: string | null;
  total: number;
  points_earned: number;
  status: 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled';
  order_type: 'pickup' | 'delivery';
  payment_status: 'pending' | 'processing' | 'succeeded' | 'failed' | 'canceled' | null;
  payment_id: string | null;
  order_number: number;
  customer_name: string | null;
  delivery_address: string | null;
  pickup_notes: string | null;
  delivery_provider: string | null;
  delivery_triggered_at: string | null;
  cancellation_deadline: string | null;
  uber_delivery_id: string | null;
  uber_delivery_status: string | null;
  uber_tracking_url: string | null;
  uber_courier_name: string | null;
  uber_courier_phone: string | null;
  uber_courier_location: Record<string, unknown> | null;
  uber_delivery_eta: string | null;
  uber_proof_of_delivery: Record<string, unknown> | null;
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

// ============================================================================
// CONSTANTS
// ============================================================================

// Replace with your actual Google Places API key
const GOOGLE_PLACES_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY || '';

// const POINTS_TO_DOLLAR_RATE = 0.01;
// const DISCOUNT_PERCENTAGE = 0.10;
// const POINTS_REWARD_PERCENTAGE = 0.05;
const QUOTE_REFRESH_BUFFER_MS = 60_000;
const FALLBACK_DELIVERY_FEE = 19.99; // applied when Uber quote is unavailable
const ORDER_CONFIRMATION_CACHE_KEY = 'last_order_confirmation';

function mapSquareStatusToOrderStatus(status: string | undefined) {
  switch (status) {
    case 'COMPLETED':
      return 'succeeded';
    case 'APPROVED':
      return 'processing';
    case 'CANCELED':
      return 'canceled';
    case 'FAILED':
      return 'failed';
    default:
      return 'succeeded';
  }
}

async function cacheOrderConfirmation(orderId: string, paymentBody: any, paymentData: any) {
  const cachedOrder = {
    id: orderId,
    subtotal: (paymentBody.subtotal ?? 0) / 100,
    discount: (paymentBody.discountAmount ?? 0) / 100,
    tax: (paymentBody.taxAmount ?? 0) / 100,
    delivery_fee: (paymentBody.deliveryFeeCents ?? 0) / 100,
    total: (paymentBody.amount ?? 0) / 100,
    points_earned: paymentData.pointsEarned ?? 0,
    status: 'pending',
    payment_status: mapSquareStatusToOrderStatus(paymentData.orderStatus),
    delivery_address: paymentBody.orderType === 'delivery' ? paymentBody.deliveryAddress ?? null : null,
    pickup_notes: paymentBody.orderType === 'pickup' ? paymentBody.pickupNotes ?? null : null,
    created_at: new Date().toISOString(),
    order_items: (paymentBody.items ?? []).map((item: any) => ({
      id: String(item.id),
      name: item.name,
      price: item.price,
      quantity: item.quantity,
    })),
  };

  await AsyncStorage.setItem(ORDER_CONFIRMATION_CACHE_KEY, JSON.stringify(cachedOrder));
}

// ============================================================================
// CHECKOUT CONTENT
// ============================================================================

function CheckoutContent() {
  const router = useRouter();
  const {
    cart,
    userProfile,
    currentColors,
    setTabBarVisible,
    clearCart,
    loadUserProfile,
  } = useApp();

  const [webCardVisible, setWebCardVisible] = useState(false);

  // ── Saved cards ───────────────────────────────────────────────────────────
  const [savedCards, setSavedCards] = useState<SavedCard[]>([]);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [loadingCards, setLoadingCards] = useState(false);

  // Refs for new-card checkout flow (same pattern as payment-methods screen)
  const pendingNonce = useRef<string | null>(null);
  const pendingPaymentBody = useRef<any>(null);
  const checkoutSessionRef = useRef<any>(null);
  const [checkoutNonceReady, setCheckoutNonceReady] = useState(false);

  // ── State ─────────────────────────────────────────────────────────────────

  const [orderType, setOrderType] = useState<OrderType>('pickup');
  const [deliveryAddress, setDeliveryAddress] = useState(userProfile?.address || '');
  const parsedPhone = parseStoredPhone(userProfile?.phone || '');
  const [phoneCountryCode, setPhoneCountryCode] = useState(parsedPhone.code);
  const [phoneNumber, setPhoneNumber] = useState(parsedPhone.number);
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [deliveryEmail, setDeliveryEmail] = useState(userProfile?.email || '');
  const [emailTouched, setEmailTouched] = useState(false);
  const [pickupNotes, setPickupNotes] = useState('');
  const [usePoints, setUsePoints] = useState(false);
  const [processing, setProcessing] = useState(false);
  // App pricing config (loaded from Supabase)
  // Replace with:
const { config: appConfig, loading: configLoading } = useAppConfig();

const appDiscountEnabled = appConfig.discount_enabled;
const appDiscountPct     = appConfig.discount_percentage / 100;
const appPointsEnabled   = appConfig.points_enabled;
const appPointsRate      = appConfig.points_value_rate;

  // Address validation
  const [addressValidation, setAddressValidation] = useState<AddressValidationResult | null>(null);
  const [isValidatingAddress, setIsValidatingAddress] = useState(false);
  const [addressTouched, setAddressTouched] = useState(false);
  const [validatedAddress, setValidatedAddress] = useState('');
  // Uber Direct-formatted JSON string (ready for dropoff_address field)
  const [validatedUberAddress, setValidatedUberAddress] = useState('');

  // ── Google Places autocomplete state ──────────────────────────────────────
  const [placeSuggestions, setPlaceSuggestions] = useState<PlacesPrediction[]>([]);
  const [isFetchingSuggestions, setIsFetchingSuggestions] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionSelected, setSuggestionSelected] = useState(false);
  const placesDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addressInputRef = useRef<TextInput>(null);

  // Delivery quote
  const [deliveryQuote, setDeliveryQuote] = useState<DeliveryQuote | null>(null);
  const [isFetchingQuote, setIsFetchingQuote] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [outsideRadiusError, setOutsideRadiusError] = useState<OutsideRadiusError | null>(null);

  // Toast
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error' | 'info'>('success');

  // ── Sync saved address/phone from profile ────────────────────────────────

  useEffect(() => {
    if (userProfile?.address && !deliveryAddress) {
      setDeliveryAddress(userProfile.address);
    }
  }, [userProfile?.address]);

  useEffect(() => {
    if (userProfile?.phone && !phoneNumber) {
      const parsed = parseStoredPhone(userProfile.phone);
      setPhoneCountryCode(parsed.code);
      setPhoneNumber(parsed.number);
    }
  }, [userProfile?.phone, phoneNumber]);

  useEffect(() => {
    if (userProfile?.email && !deliveryEmail) {
      setDeliveryEmail(userProfile.email);
    }
  }, [userProfile?.email, deliveryEmail]);


  // Load live pricing config
// useEffect(() => {
//   appConfigService.getAppConfig().then(({ data }) => {
//     if (data) {
//       setAppDiscountEnabled(data.discount_enabled ?? true);
//       setAppDiscountPct((data.discount_percentage ?? 10) / 100);
//       setAppPointsEnabled(data.points_enabled ?? true);
//       setAppPointsRate(data.points_value_rate ?? 0.01);
//     }
//     setConfigReady(true);
//   });
// }, []);

  // ── Computed values ───────────────────────────────────────────────────────

const availablePoints = userProfile?.points || 0;
const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

// Use live config values
const discount = appDiscountEnabled ? subtotal * appDiscountPct : 0;
const subtotalAfterDiscount = subtotal - discount;
const tax = subtotalAfterDiscount * 0.0975;

const pointsValueInDollars = availablePoints * appPointsRate;
const maxPointsDiscount = subtotalAfterDiscount * 0.2;
const pointsDiscount = (usePoints && appPointsEnabled)
  ? Math.min(pointsValueInDollars, maxPointsDiscount)
  : 0;

const deliveryFee =
  orderType === 'delivery'
    ? (deliveryQuote ? deliveryQuote.fee : FALLBACK_DELIVERY_FEE)
    : 0;
const total = subtotalAfterDiscount + tax + deliveryFee - pointsDiscount;

const pointsToEarn = appPointsEnabled
  ? Math.floor((subtotalAfterDiscount * (appConfig.points_reward_percentage / 100)) / appPointsRate)
  : 0;

  const isPhoneValid = phoneNumber.replace(/\D/g, '').length >= 7;
  const isEmailValid = EMAIL_REGEX.test(deliveryEmail.trim());

  // ── Helpers ───────────────────────────────────────────────────────────────

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

  const isQuoteExpired = useCallback(() => {
    if (!deliveryQuote?.expires) return true;
    return Date.now() >= new Date(deliveryQuote.expires).getTime() - QUOTE_REFRESH_BUFFER_MS;
  }, [deliveryQuote]);

  // ── Google Places autocomplete ────────────────────────────────────────────

  const fetchPlaceSuggestions = useCallback(async (input: string) => {
    if (!input || input.trim().length < 3 || !GOOGLE_PLACES_API_KEY) {
      setPlaceSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    setIsFetchingSuggestions(true);
    try {
      const url = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json');
      url.searchParams.set('input', input);
      url.searchParams.set('key', GOOGLE_PLACES_API_KEY);
      url.searchParams.set('types', 'address');
      url.searchParams.set('components', 'country:us');

      const response = await fetch(url.toString());
      const data = await response.json();

      if (data.status === 'OK' && data.predictions?.length > 0) {
        setPlaceSuggestions(data.predictions.slice(0, 5));
        setShowSuggestions(true);
      } else {
        setPlaceSuggestions([]);
        setShowSuggestions(false);
      }
    } catch (error) {
      console.error('Places autocomplete error:', error);
      setPlaceSuggestions([]);
      setShowSuggestions(false);
    } finally {
      setIsFetchingSuggestions(false);
    }
  }, []);

  /**
   * Called when the user taps a suggestion row.
   * Optionally fetches the full formatted address via Place Details before
   * committing — falls back to the description if the detail call fails.
   */
  const handleSelectSuggestion = useCallback(async (prediction: PlacesPrediction) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowSuggestions(false);
    setPlaceSuggestions([]);
    setSuggestionSelected(true);
    Keyboard.dismiss();

    let chosenAddress = prediction.description;

    if (GOOGLE_PLACES_API_KEY) {
      try {
        const url = new URL('https://maps.googleapis.com/maps/api/place/details/json');
        url.searchParams.set('place_id', prediction.place_id);
        url.searchParams.set('key', GOOGLE_PLACES_API_KEY);
        url.searchParams.set('fields', 'formatted_address');

        const response = await fetch(url.toString());
        const data = await response.json();

        if (data.status === 'OK' && data.result?.formatted_address) {
          chosenAddress = data.result.formatted_address;
        }
      } catch {
        // Use prediction.description as fallback — already set above
      }
    }

    setDeliveryAddress(chosenAddress);
    setValidatedAddress(chosenAddress);
    setAddressTouched(true);

    // Clear stale quote / validation / radius error so they re-run against the new address
    setDeliveryQuote(null);
    setQuoteError(null);
    setAddressValidation(null);
    setOutsideRadiusError(null);

    // Trigger validation right away for the chosen address
    validateAddress(chosenAddress);
  }, []);

  // Debounce Places API calls while the user types
  const handleAddressChange = useCallback((text: string) => {
    setDeliveryAddress(text);
    setAddressTouched(true);
    setSuggestionSelected(false);

    // Reset stale state
    setDeliveryQuote(null);
    setQuoteError(null);
    setOutsideRadiusError(null);

    if (placesDebounceRef.current) clearTimeout(placesDebounceRef.current);

    if (text.trim().length >= 3) {
      placesDebounceRef.current = setTimeout(() => fetchPlaceSuggestions(text), 350);
    } else {
      setPlaceSuggestions([]);
      setShowSuggestions(false);
    }
  }, [fetchPlaceSuggestions]);

  // Clear suggestions on unmount
  useEffect(() => {
    return () => {
      if (placesDebounceRef.current) clearTimeout(placesDebounceRef.current);
    };
  }, []);

  // ── Address validation ────────────────────────────────────────────────────

  const validateAddress = useCallback(async (address: string, apt?: string) => {
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
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ address, apt }),
      });

      const result: AddressValidationResult = await response.json();
      setAddressValidation(result);

      if (result.isValid) {
        if (result.formattedAddress) {
          setValidatedAddress(result.formattedAddress);
        }
        if (result.uberAddress) {
          setValidatedUberAddress(result.uberAddress);
        }
      }
    } catch (error) {
      console.error('Address validation error:', error);
      setAddressValidation({ success: false, isValid: false, error: 'Failed to validate address' });
    } finally {
      setIsValidatingAddress(false);
    }
  }, []);

  const useFormattedAddress = useCallback(() => {
    if (addressValidation?.formattedAddress) {
      setDeliveryAddress(addressValidation.formattedAddress);
      setValidatedAddress(addressValidation.formattedAddress);
      setAddressTouched(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [addressValidation]);

  // ── Delivery quote ────────────────────────────────────────────────────────

  const fetchDeliveryQuote = useCallback(async (address: string, uberAddress?: string) => {
    setIsFetchingQuote(true);
    setQuoteError(null);
    setOutsideRadiusError(null);
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      console.log('[checkout] session token:', session?.access_token?.slice(0, 20), '| error:', sessionError);

      const response = await fetch(`${SUPABASE_URL}/functions/v1/get-delivery-quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ dropoffAddress: uberAddress || address }),
      });

      const result = await response.json();

      if (!result.success) {
        // ── Outside delivery radius — surface a specific, actionable error ──
        if (result.outsideRadius) {
          setOutsideRadiusError({
            distanceMiles: result.distanceMiles,
            radiusMiles:   result.radiusMiles,
            message:       result.error,
          });
          setDeliveryQuote(null);
          setQuoteError(null);
          return;
        }

        setQuoteError(result.error ?? 'Delivery fee unavailable');
        setDeliveryQuote(null);
        return;
      }

      setDeliveryQuote(result as DeliveryQuote);
      setQuoteError(null);
      setOutsideRadiusError(null);
    } catch (err) {
      setQuoteError('Could not fetch delivery fee');
      setDeliveryQuote(null);
    } finally {
      setIsFetchingQuote(false);
    }
  }, []);

  // Fetch quote after address is validated
  useEffect(() => {
    if (
      orderType === 'delivery' &&
      addressValidation?.isValid 
      // && addressValidation.confidence !== 'low'
    ) {
      const addr = validatedAddress || deliveryAddress;
      if (addr) fetchDeliveryQuote(addr, validatedUberAddress || undefined);
    }
  }, [addressValidation?.isValid, orderType]);

  useEffect(() => {
    if (orderType !== 'delivery') {
      setDeliveryQuote(null);
      setQuoteError(null);
      setOutsideRadiusError(null);
    }
  }, [orderType]);

  // Auto-refresh quote ~60s before expiry
  useEffect(() => {
    if (!deliveryQuote?.expires || orderType !== 'delivery') return;
    const msUntilRefresh =
      new Date(deliveryQuote.expires).getTime() - QUOTE_REFRESH_BUFFER_MS - Date.now();
    if (msUntilRefresh <= 0) return;
    const timer = setTimeout(() => {
      const addr = validatedAddress || deliveryAddress;
      if (addr) fetchDeliveryQuote(addr, validatedUberAddress || undefined);
    }, msUntilRefresh);
    return () => clearTimeout(timer);
  }, [deliveryQuote?.expires, orderType]);

  // Auto-validate prefilled address when switching to delivery (no user interaction yet)
  useEffect(() => {
    if (orderType === 'delivery' && deliveryAddress.trim() && !addressValidation && !addressTouched) {
      validateAddress(deliveryAddress);
    }
  }, [orderType, deliveryAddress, addressValidation, addressTouched, validateAddress]);

  // Debounced address validation (for manual typing — skipped when a suggestion was just selected)
  useEffect(() => {
    if (orderType !== 'delivery' || !addressTouched || !deliveryAddress.trim()) return;
    if (suggestionSelected) return;
    const id = setTimeout(() => validateAddress(deliveryAddress), 1000);
    return () => clearTimeout(id);
  }, [deliveryAddress, addressTouched, orderType, validateAddress, suggestionSelected]);

  // Hide tab bar
  useEffect(() => {
    setTabBarVisible(false);
    return () => setTabBarVisible(true);
  }, [setTabBarVisible]);

  // ── Square SDK initialization ─────────────────────────────────────────────


  // ── Load saved payment methods ────────────────────────────────────────────

  useEffect(() => {
    if (!userProfile) return;
    setLoadingCards(true);
    supabase
      .from('payment_methods')
      .select('*')
      .eq('user_id', userProfile.id)
      .not('stripe_payment_method_id', 'is', null)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        const cards: SavedCard[] = (data ?? [])
          .filter((c: any) => !c.stripe_payment_method_id?.startsWith('pm_'))
          .map((c: any) => ({
          id: c.id,
          squareCardId: c.stripe_payment_method_id,
          squareCustomerId: c.stripe_customer_id,
          brand: c.brand || 'CARD',
          last4: c.last4 || '••••',
          expMonth: c.exp_month,
          expYear: c.exp_year,
          isDefault: c.is_default,
        }));
        setSavedCards(cards);
        const defaultCard = cards.find((c) => c.isDefault) ?? cards[0];
        if (defaultCard) setSelectedCardId(defaultCard.squareCardId);
      })
      .finally(() => setLoadingCards(false));
  }, [userProfile]);

  // ── Process payment after Square sheet dismisses (new card path) ──────────

  useEffect(() => {
    if (!checkoutNonceReady) return;
    setCheckoutNonceReady(false);

    const nonce = pendingNonce.current;
    const body = pendingPaymentBody.current;
    const session = checkoutSessionRef.current;

    if (!nonce || !body || !session) { setProcessing(false); return; }
    pendingNonce.current = null;
    pendingPaymentBody.current = null;

    (async () => {
      try {
        const response = await fetch(`${SUPABASE_URL}/functions/v1/process-square-payment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ sourceId: nonce, ...body }),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          showToast('error', (errData as any).error || `Payment failed (${response.status})`);
          setProcessing(false);
          return;
        }

        const data = await response.json();
        if (!data.success) { showToast('error', data.error || 'Payment failed'); setProcessing(false); return; }

        await cacheOrderConfirmation(data.orderId, body, data).catch((cacheError) => {
          console.warn('Failed to cache order confirmation:', cacheError);
        });
        showToast('success', 'Payment successful!');
        clearCart();
        loadUserProfile();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setTimeout(() => { router.replace({ pathname: '/order-confirmation', params: { orderId: data.orderId } }); setProcessing(false); }, 100);
      } catch (err: any) {
        showToast('error', err.message || 'Payment failed');
        setProcessing(false);
      }
    })();
  }, [checkoutNonceReady]);

  // ── Order placement ───────────────────────────────────────────────────────

  const proceedWithPayment = useCallback(async () => {
    if (orderType === 'delivery' && deliveryQuote && isQuoteExpired()) {
      const addr = validatedAddress || deliveryAddress;
      if (addr) await fetchDeliveryQuote(addr, validatedUberAddress || undefined);
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      showToast('error', 'Please sign in to continue.');
      return;
    }

    // Capture order values before the card entry sheet opens
    const customerEmail = (orderType === 'delivery' ? deliveryEmail : userProfile?.email) || '';
    const customerPhone = orderType === 'delivery'
      ? `${phoneCountryCode}${phoneNumber}`
      : (userProfile?.phone || '');
    const deliveryAddrFull = validatedAddress || deliveryAddress;

    let addressCity = '', addressState = '', addressZip = '';
    if (validatedUberAddress) {
      try {
        const ua = JSON.parse(validatedUberAddress);
        addressCity  = ua.city      || '';
        addressState = ua.state     || '';
        addressZip   = ua.zip_code  || '';
      } catch { /* fallback */ }
    }

    const paymentBody = {
      amount:       Math.round(total * 100),
      subtotal:     Math.round(subtotal * 100),
      taxAmount:    Math.round(tax * 100),
      currency:     'USD',
      customer: {
        name:         userProfile?.name || '',
        email:        customerEmail,
        phone:        customerPhone,
        deliveryType: orderType,
        ...(orderType === 'delivery' ? {
          address:              deliveryAddrFull,
          city:                 addressCity,
          state:                addressState,
          zip:                  addressZip,
          deliveryInstructions: pickupNotes || undefined,
        } : {
          pickupDate: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
          pickupTime: 'ASAP',
        }),
      },
      items: cart.map((item) => ({
        id:       String(item.id),
        name:     item.name,
        quantity: item.quantity,
        price:    item.price,
      })),
      orderType,
      deliveryAddress: orderType === 'delivery' ? deliveryAddrFull : undefined,
      pickupNotes:     orderType === 'pickup' ? (pickupNotes || undefined) : undefined,
      deliveryQuoteId: deliveryQuote?.quoteId || null,
      deliveryFee,
      deliveryFeeCents:      Math.round(deliveryFee * 100),
      discountAmount:        Math.round(discount * 100),
      pointsDiscountAmount:  Math.round(pointsDiscount * 100),
    };

    setProcessing(true);

    // ── Saved card path: direct API call, no Square native UI ────────────
    if (selectedCardId) {
      const card = savedCards.find((c) => c.squareCardId === selectedCardId);
      try {
        const response = await fetch(`${SUPABASE_URL}/functions/v1/process-square-payment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({
            sourceId: selectedCardId,
            customerId: card?.squareCustomerId,
            ...paymentBody,
          }),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          showToast('error', (errData as any).error || `Payment failed (${response.status})`);
          setProcessing(false);
          return;
        }

        const data = await response.json();
        if (!data.success) { showToast('error', data.error || 'Payment failed'); setProcessing(false); return; }

        await cacheOrderConfirmation(data.orderId, paymentBody, data).catch((cacheError) => {
          console.warn('Failed to cache order confirmation:', cacheError);
        });
        showToast('success', 'Payment successful!');
        clearCart();
        loadUserProfile();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setTimeout(() => { router.replace({ pathname: '/order-confirmation', params: { orderId: data.orderId } }); setProcessing(false); }, 100);
      } catch (err: any) {
        showToast('error', err.message || 'Payment failed');
        setProcessing(false);
      }
      return;
    }

    // ── New card path: Web Payments SDK sheet ─────────────────────────────
    pendingPaymentBody.current = paymentBody;
    checkoutSessionRef.current = session;
    setWebCardVisible(true);
  }, [
    orderType, cart, userProfile, validatedAddress, deliveryAddress,
    validatedUberAddress, pickupNotes, subtotal, tax, total, discount, pointsDiscount,
    deliveryFee, deliveryQuote, isQuoteExpired, fetchDeliveryQuote,
    deliveryEmail, phoneCountryCode, phoneNumber, showToast, clearCart, loadUserProfile, router,
    selectedCardId, savedCards,
  ]);

  const handlePlaceOrder = useCallback(async () => {
    if (orderType === 'delivery') {
      if (!deliveryAddress.trim()) {
        showToast('error', 'Please enter a delivery address.');
        return;
      }

      // Hard block — address is confirmed outside delivery radius
      if (outsideRadiusError) {
        Alert.alert(
          'Outside Delivery Area',
          `We currently deliver within ${outsideRadiusError.radiusMiles} miles of our restaurant. Your address is ${outsideRadiusError.distanceMiles} miles away.\n\nPlease select a closer address or choose pickup.`,
          [{ text: 'OK' }]
        );
        return;
      }

      if (!isPhoneValid) {
        setPhoneTouched(true);
        showToast('error', 'Please enter a valid phone number (at least 7 digits).');
        return;
      }

      if (!isEmailValid) {
        setEmailTouched(true);
        showToast('error', 'Please enter a valid email address.');
        return;
      }

      if (addressTouched && addressValidation) {
        if (!addressValidation.isValid) {
          Alert.alert(
            'Address Verification',
            'The address could not be verified. Please check and correct it before continuing.',
            [{ text: 'OK' }]
          );
          return;
        }
        if (addressValidation.confidence === 'low') {
          Alert.alert(
            'Address Verification',
            'This address has low confidence. We recommend reviewing it.',
            [
              { text: 'Review Address', style: 'cancel' },
              { text: 'Continue Anyway', style: 'destructive', onPress: proceedWithPayment },
            ]
          );
          return;
        }
      }
    }

    await proceedWithPayment();
  }, [orderType, deliveryAddress, addressTouched, addressValidation, outsideRadiusError, showToast, proceedWithPayment, isPhoneValid, isEmailValid]);

  // ── Styles ────────────────────────────────────────────────────────────────

  const styles = StyleSheet.create({
    gradientContainer: { flex: 1 },
    safeArea: { flex: 1 },
    container: { flex: 1 },
    content: { padding: 20 },
    header: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 20, paddingVertical: 16,
      borderBottomWidth: 2, borderBottomColor: currentColors.border,
    },
    backButton: {
      width: 40, height: 40, borderRadius: 0,
      justifyContent: 'center', alignItems: 'center',
      boxShadow: '0px 4px 12px rgba(212, 175, 55, 0.3)', elevation: 4,
    },
    infoBanner: {
      flexDirection: 'row', padding: 16, borderRadius: 0, marginBottom: 20,
      gap: 12, borderWidth: 2, borderColor: currentColors.border,
      boxShadow: '0px 4px 12px rgba(74, 215, 194, 0.2)', elevation: 4,
    },
    infoText: { flex: 1, fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 20, color: currentColors.text },
    section: { marginBottom: 24 },
    sectionTitle: {
      fontSize: 18, fontFamily: 'PlayfairDisplay_700Bold', marginBottom: 12,
      color: currentColors.text, letterSpacing: 0.5,
    },
    orderTypeSelector: { flexDirection: 'row', gap: 12, marginBottom: 16 },
    orderTypeButton: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      padding: 16, borderRadius: 0, borderWidth: 2, gap: 8,
      boxShadow: '0px 4px 12px rgba(212, 175, 55, 0.25)', elevation: 4,
    },
    orderTypeText: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
    inputContainer: { position: 'relative' },
    input: {
      borderRadius: 0, padding: 16, fontSize: 16, fontFamily: 'Inter_400Regular',
      minHeight: 80, boxShadow: '0px 4px 12px rgba(212, 175, 55, 0.25)', elevation: 4,
      paddingRight: 48, backgroundColor: currentColors.card, color: currentColors.text,
      borderWidth: 2, borderColor: currentColors.border,
    },
    inputWithValidation: { borderWidth: 2 },
    validationIconContainer: { position: 'absolute', right: 16, top: 16 },
    validationMessage: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 8, paddingHorizontal: 4 },
    validationMessageText: { fontSize: 13, fontFamily: 'Inter_400Regular', flex: 1 },
    formattedAddressSuggestion: {
      marginTop: 12, padding: 12, borderRadius: 0, borderWidth: 2,
      backgroundColor: currentColors.card, borderColor: currentColors.border,
      boxShadow: '0px 4px 12px rgba(74, 215, 194, 0.25)', elevation: 4,
    },
    suggestionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    suggestionTitle: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: currentColors.text },
    suggestionAddress: { fontSize: 14, fontFamily: 'Inter_400Regular', marginBottom: 8, lineHeight: 20, color: currentColors.textSecondary },
    useSuggestionButton: { borderRadius: 0, boxShadow: '0px 4px 12px rgba(74, 215, 194, 0.3)', elevation: 4 },
    useSuggestionButtonInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 8, gap: 6 },
    useSuggestionButtonText: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: currentColors.background },
    // ── Google Places suggestion dropdown ───────────────────────────────────
    suggestionsDropdown: {
      marginTop: 4,
      borderWidth: 2,
      borderColor: currentColors.border,
      backgroundColor: currentColors.card,
      borderRadius: 0,
      overflow: 'hidden',
      boxShadow: '0px 8px 24px rgba(0,0,0,0.18)',
      elevation: 12,
      zIndex: 999,
    },
    suggestionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: 10,
      borderBottomWidth: 1,
      borderBottomColor: currentColors.border,
    },
    suggestionRowLast: {
      borderBottomWidth: 0,
    },
    suggestionIconWrapper: {
      width: 28,
      height: 28,
      borderRadius: 0,
      backgroundColor: currentColors.background,
      borderWidth: 1,
      borderColor: currentColors.border,
      justifyContent: 'center',
      alignItems: 'center',
    },
    suggestionTextContainer: { flex: 1 },
    suggestionMainText: {
      fontSize: 14,
      fontFamily: 'Inter_600SemiBold',
      color: currentColors.text,
      lineHeight: 18,
    },
    suggestionSecondaryText: {
      fontSize: 12,
      fontFamily: 'Inter_400Regular',
      color: currentColors.textSecondary,
      marginTop: 2,
    },
    suggestionsLoadingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: 10,
    },
    suggestionsLoadingText: {
      fontSize: 13,
      fontFamily: 'Inter_400Regular',
      color: currentColors.textSecondary,
    },
    poweredByGoogle: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderTopWidth: 1,
      borderTopColor: currentColors.border,
      gap: 4,
    },
    poweredByGoogleText: {
      fontSize: 10,
      fontFamily: 'Inter_400Regular',
      color: currentColors.textSecondary,
    },
    // Phone / email fields
    phoneRow: { flexDirection: 'row', gap: 8, alignItems: 'stretch' },
    countryCodeButton: {
      borderRadius: 0, borderWidth: 2, paddingHorizontal: 12,
      justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 4,
      backgroundColor: currentColors.card, borderColor: currentColors.border,
      boxShadow: '0px 4px 12px rgba(212, 175, 55, 0.25)', elevation: 4,
    },
    countryCodeText: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: currentColors.text },
    countryPickerDropdown: {
      marginTop: 4, borderWidth: 2, borderColor: currentColors.border,
      backgroundColor: currentColors.card, borderRadius: 0, overflow: 'hidden',
      boxShadow: '0px 8px 24px rgba(0,0,0,0.18)', elevation: 12,
    },
    countryPickerRow: {
      paddingHorizontal: 16, paddingVertical: 12,
      borderBottomWidth: 1, borderBottomColor: currentColors.border,
    },
    countryPickerRowLast: { borderBottomWidth: 0 },
    countryPickerRowText: { fontSize: 14, fontFamily: 'Inter_400Regular', color: currentColors.text },
    countryPickerRowTextSelected: { fontFamily: 'Inter_600SemiBold', color: currentColors.secondary },
    fieldValidationMsg: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 6, paddingHorizontal: 2 },
    singleLineInput: { minHeight: undefined, paddingVertical: 14 },
    // Quote card
    quoteCard: {
      marginTop: 12, padding: 14, borderRadius: 0, borderWidth: 2,
      flexDirection: 'row', alignItems: 'center', gap: 12,
    },
    quoteCardText: { flex: 1 },
    quoteCardFee: { fontSize: 15, fontFamily: 'Inter_700Bold', color: currentColors.text },
    quoteCardMeta: { fontSize: 13, fontFamily: 'Inter_400Regular', color: currentColors.textSecondary, marginTop: 2 },
    quoteExpiry: { fontSize: 11, fontFamily: 'Inter_400Regular', color: currentColors.textSecondary, marginTop: 3 },
    // Summary
    summaryCard: {
      borderRadius: 0, padding: 20, boxShadow: '0px 8px 24px rgba(212, 175, 55, 0.3)',
      elevation: 8, borderWidth: 2, borderColor: currentColors.border,
    },
    summaryTitle: { fontSize: 18, fontFamily: 'PlayfairDisplay_700Bold', marginBottom: 16, color: currentColors.text, letterSpacing: 0.5 },
    summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
    summaryLabel: { fontSize: 16, fontFamily: 'Inter_400Regular', color: currentColors.textSecondary },
    summaryValue: { fontSize: 16, fontFamily: 'Inter_600SemiBold', color: currentColors.text },
    summaryRowTotal: { borderTopWidth: 2, paddingTop: 12, marginTop: 4, borderTopColor: currentColors.border },
    summaryLabelTotal: { fontSize: 18, fontFamily: 'PlayfairDisplay_700Bold', color: currentColors.text },
    summaryValueTotal: { fontSize: 20, fontFamily: 'Inter_700Bold', color: currentColors.secondary },
    pointsEarnCard: {
      flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 0,
      marginTop: 16, gap: 8, backgroundColor: currentColors.background,
      borderWidth: 2, borderColor: currentColors.border,
    },
    pointsEarnText: { flex: 1, fontSize: 14, fontFamily: 'Inter_600SemiBold', color: currentColors.text },
    paymentMethodsInfo: {
      flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 0,
      borderWidth: 2, borderColor: currentColors.border, backgroundColor: currentColors.card,
      gap: 12, boxShadow: '0px 4px 12px rgba(74, 215, 194, 0.2)', elevation: 4,
    },
    paymentMethodsInfoText: { flex: 1, fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 20, color: currentColors.text },
    footer: {
      padding: 20, borderTopWidth: 2, borderTopColor: currentColors.border,
      boxShadow: '0px -6px 20px rgba(74, 215, 194, 0.3)', elevation: 10,
    },
    placeOrderButton: { borderRadius: 0, boxShadow: '0px 8px 24px rgba(212, 175, 55, 0.5)', elevation: 10 },
    placeOrderButtonInner: { paddingVertical: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 12 },
    placeOrderButtonText: { fontSize: 18, fontFamily: 'Inter_700Bold', color: currentColors.background },
  });

  // ── Google Places dropdown render ─────────────────────────────────────────

  const renderPlacesSuggestions = () => {
    if (orderType !== 'delivery') return null;
    if (!showSuggestions && !isFetchingSuggestions) return null;

    return (
      <View style={styles.suggestionsDropdown}>
        {isFetchingSuggestions && placeSuggestions.length === 0 ? (
          <View style={styles.suggestionsLoadingRow}>
            <ActivityIndicator size="small" color={currentColors.primary} />
            <Text style={styles.suggestionsLoadingText}>Finding addresses...</Text>
          </View>
        ) : (
          <>
            {placeSuggestions.map((prediction, index) => (
              <Pressable
                key={prediction.place_id}
                style={({ pressed }) => [
                  styles.suggestionRow,
                  index === placeSuggestions.length - 1 && styles.suggestionRowLast,
                  pressed && { backgroundColor: currentColors.background },
                ]}
                onPress={() => handleSelectSuggestion(prediction)}
              >
                <View style={styles.suggestionIconWrapper}>
                  <IconSymbol name="location-on" size={14} color={currentColors.primary} />
                </View>
                <View style={styles.suggestionTextContainer}>
                  <Text style={styles.suggestionMainText} numberOfLines={1}>
                    {prediction.structured_formatting.main_text}
                  </Text>
                  <Text style={styles.suggestionSecondaryText} numberOfLines={1}>
                    {prediction.structured_formatting.secondary_text}
                  </Text>
                </View>
                <IconSymbol name="arrow-forward" size={14} color={currentColors.textSecondary} />
              </Pressable>
            ))}
            <View style={styles.poweredByGoogle}>
              <Text style={styles.poweredByGoogleText}>powered by Google</Text>
            </View>
          </>
        )}
      </View>
    );
  };

  // ── Quote card render ─────────────────────────────────────────────────────

  const renderDeliveryQuoteCard = () => {
    if (orderType !== 'delivery') return null;

    if (isFetchingQuote) {
      return (
        <LinearGradient
          colors={[currentColors.cardGradientStart || currentColors.card, currentColors.cardGradientEnd || currentColors.card]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={[styles.quoteCard, { borderColor: currentColors.border }]}
        >
          <ActivityIndicator size="small" color={currentColors.primary} />
          <Text style={styles.quoteCardMeta}>Getting delivery fee...</Text>
        </LinearGradient>
      );
    }

    // ── Outside radius — prominent error card ──────────────────────────────
    if (outsideRadiusError) {
      return (
        <LinearGradient
          colors={['#FFF5F5', '#FFF0F0']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={[styles.quoteCard, { borderColor: '#EF4444', borderWidth: 2 }]}
        >
          <IconSymbol name="location-off" size={22} color="#EF4444" />
          <View style={styles.quoteCardText}>
            <Text style={[styles.quoteCardFee, { color: '#EF4444' }]}>
              Outside delivery area
            </Text>
            <Text style={[styles.quoteCardMeta, { color: '#EF4444' }]}>
              Your address is {outsideRadiusError.distanceMiles} mi away · limit is {outsideRadiusError.radiusMiles} mi
            </Text>
            <Text style={[styles.quoteExpiry, { color: currentColors.textSecondary, marginTop: 4 }]}>
              Please enter a closer address or switch to pickup.
            </Text>
          </View>
        </LinearGradient>
      );
    }

    if (quoteError || (!isFetchingQuote && !deliveryQuote)) {
      // No Uber quote available — show flat fallback fee
      return (
        <LinearGradient
          colors={[currentColors.cardGradientStart || currentColors.card, currentColors.cardGradientEnd || currentColors.card]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={[styles.quoteCard, { borderColor: currentColors.border }]}
        >
          <IconSymbol name="delivery-dining" size={20} color={currentColors.primary} />
          <View style={styles.quoteCardText}>
            <Text style={styles.quoteCardFee}>Delivery fee: ${FALLBACK_DELIVERY_FEE.toFixed(2)}</Text>
            <Text style={styles.quoteCardMeta}>Standard delivery rate</Text>
          </View>
        </LinearGradient>
      );
    }

    if (deliveryQuote) {
      const expiresIn = Math.max(
        0,
        Math.round((new Date(deliveryQuote.expires).getTime() - Date.now()) / 60_000)
      );
      return (
        <LinearGradient
          colors={[currentColors.cardGradientStart || currentColors.card, currentColors.cardGradientEnd || currentColors.card]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={[styles.quoteCard, { borderColor: currentColors.primary }]}
        >
          <IconSymbol name="delivery-dining" size={20} color={currentColors.primary} />
          <View style={styles.quoteCardText}>
            <Text style={styles.quoteCardFee}>
              Delivery fee: ${deliveryQuote.fee.toFixed(2)}
            </Text>
            <Text style={styles.quoteCardMeta}>
              ~{deliveryQuote.duration} min · courier arrives in ~{deliveryQuote.pickupDuration} min
            </Text>
            <Text style={styles.quoteExpiry}>
              Quote valid for {expiresIn} min · auto-refreshes
            </Text>
          </View>
        </LinearGradient>
      );
    }

    return null;
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <LinearGradient
      colors={[
        currentColors.gradientStart || currentColors.background,
        currentColors.gradientMid || currentColors.background,
        currentColors.gradientEnd || currentColors.background,
      ]}
      start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
      style={styles.gradientContainer}
    >
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>

        {/* Header */}
        <LinearGradient
          colors={[currentColors.headerGradientStart || currentColors.card, currentColors.headerGradientEnd || currentColors.card]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={styles.header}
        >
          <LinearGradient
            colors={[currentColors.cardGradientStart || currentColors.card, currentColors.cardGradientEnd || currentColors.card]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={styles.backButton}
          >
            <Pressable
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.back(); }}
              style={{ padding: 8 }}
            >
              <IconSymbol name="arrow-back" size={24} color={currentColors.secondary} />
            </Pressable>
          </LinearGradient>
        </LinearGradient>

        <ScrollView
          style={styles.container}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.content}>

            {/* Info Banner */}
            <LinearGradient
              colors={[currentColors.cardGradientStart || currentColors.card, currentColors.cardGradientEnd || currentColors.card]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={styles.infoBanner}
            >
              <IconSymbol name="info" size={20} color={currentColors.primary} />
              <Text style={styles.infoText}>
                Secure checkout powered by Square. Your payment information is encrypted and protected. Enjoy {appDiscountPct * 100}% off your order!
              </Text>
            </LinearGradient>

            {/* Order Type */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Order Type</Text>
              <View style={styles.orderTypeSelector}>

                <LinearGradient
                  colors={orderType === 'delivery'
                    ? [currentColors.secondary, currentColors.highlight]
                    : [currentColors.cardGradientStart || currentColors.card, currentColors.cardGradientEnd || currentColors.card]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={[styles.orderTypeButton, { borderColor: orderType === 'delivery' ? currentColors.secondary : currentColors.border }]}
                >
                  <Pressable
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 4 }}
                    onPress={() => { if (!processing) { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setOrderType('delivery'); } }}
                    disabled={processing}
                  >
                    <IconSymbol name="scooter" size={20} color={orderType === 'delivery' ? currentColors.background : currentColors.text} />
                    <Text style={[styles.orderTypeText, { color: orderType === 'delivery' ? currentColors.background : currentColors.text }]}>
                      Delivery
                    </Text>
                  </Pressable>
                </LinearGradient>

                <LinearGradient
                  colors={orderType === 'pickup'
                    ? [currentColors.secondary, currentColors.highlight]
                    : [currentColors.cardGradientStart || currentColors.card, currentColors.cardGradientEnd || currentColors.card]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={[styles.orderTypeButton, { borderColor: orderType === 'pickup' ? currentColors.secondary : currentColors.border }]}
                >
                  <Pressable
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 4 }}
                    onPress={() => { if (!processing) { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setOrderType('pickup'); } }}
                    disabled={processing}
                  >
                    <IconSymbol name="bag.fill" size={20} color={orderType === 'pickup' ? currentColors.background : currentColors.text} />
                    <Text style={[styles.orderTypeText, { color: orderType === 'pickup' ? currentColors.background : currentColors.text }]}>
                      Pickup
                    </Text>
                  </Pressable>
                </LinearGradient>

              </View>
            </View>

            {/* Delivery Address + Autocomplete + Quote + Phone */}
            {orderType === 'delivery' && (
              <>
              <View style={[styles.section, { zIndex: 100 }]}>
                <Text style={styles.sectionTitle}>Delivery Address *</Text>
                <View style={styles.inputContainer}>
                  <TextInput
                    ref={addressInputRef}
                    style={[
                      styles.input,
                      styles.inputWithValidation,
                      { borderColor: addressTouched && addressValidation ? getAddressValidationColor() : currentColors.border },
                    ]}
                    placeholder="Start typing your address..."
                    placeholderTextColor={currentColors.textSecondary}
                    value={deliveryAddress}
                    onChangeText={handleAddressChange}
                    onFocus={() => {
                      if (deliveryAddress.trim().length >= 3 && placeSuggestions.length > 0) {
                        setShowSuggestions(true);
                      }
                    }}
                    onBlur={() => {
                      setTimeout(() => setShowSuggestions(false), 200);
                    }}
                    multiline={false}
                    textAlignVertical="center"
                    editable={!processing}
                    returnKeyType="done"
                    onSubmitEditing={() => {
                      setShowSuggestions(false);
                      validateAddress(deliveryAddress);
                    }}
                  />
                  <View style={styles.validationIconContainer}>
                    {isValidatingAddress || isFetchingSuggestions ? (
                      <ActivityIndicator size="small" color={currentColors.primary} />
                    ) : addressTouched && addressValidation ? (
                      <IconSymbol name={getAddressValidationIcon()} size={24} color={getAddressValidationColor()} />
                    ) : null}
                  </View>
                </View>

                {/* Google Places dropdown */}
                {renderPlacesSuggestions()}

                {/* Validation message */}
                {addressTouched && addressValidation && !showSuggestions && (
                  <View style={styles.validationMessage}>
                    <Text style={[styles.validationMessageText, { color: getAddressValidationColor() }]}>
                      {getAddressValidationMessage()}
                    </Text>
                  </View>
                )}

                {/* Formatted address suggestion (from verify-address edge function) */}
                {!showSuggestions &&
                  addressValidation?.isValid &&
                  addressValidation.formattedAddress &&
                  addressValidation.formattedAddress !== deliveryAddress && (
                    <LinearGradient
                      colors={[currentColors.cardGradientStart || currentColors.card, currentColors.cardGradientEnd || currentColors.card]}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                      style={styles.formattedAddressSuggestion}
                    >
                      <View style={styles.suggestionHeader}>
                        <IconSymbol name="lightbulb" size={16} color={currentColors.primary} />
                        <Text style={styles.suggestionTitle}>Suggested Address</Text>
                      </View>
                      <Text style={styles.suggestionAddress}>{addressValidation.formattedAddress}</Text>
                      <LinearGradient
                        colors={[currentColors.primary, currentColors.primary]}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                        style={styles.useSuggestionButton}
                      >
                        <Pressable style={styles.useSuggestionButtonInner} onPress={useFormattedAddress}>
                          <IconSymbol name="check" size={14} color={currentColors.background} />
                          <Text style={styles.useSuggestionButtonText}>Use This Address</Text>
                        </Pressable>
                      </LinearGradient>
                    </LinearGradient>
                  )}

                {/* Delivery quote — appears below address once fetched */}
                {renderDeliveryQuoteCard()}
              </View>

              {/* Phone number for delivery */}
              <View style={[styles.section, { marginTop: 8, marginBottom: 0 }]}>
                <Text style={styles.sectionTitle}>Phone Number *</Text>
                <View style={styles.phoneRow}>
                  {/* Country code selector */}
                  <Pressable
                    style={styles.countryCodeButton}
                    onPress={() => { if (!processing) setShowCountryPicker(v => !v); }}
                    disabled={processing}
                  >
                    <Text style={styles.countryCodeText}>
                      {COUNTRY_CODES.find(c => c.code === phoneCountryCode)?.flag ?? ''} {phoneCountryCode}
                    </Text>
                    <IconSymbol name="arrow-drop-down" size={18} color={currentColors.text} />
                  </Pressable>

                  {/* Local number */}
                  <TextInput
                    style={[styles.input, styles.singleLineInput, { flex: 1,
                      borderColor: phoneTouched && !isPhoneValid ? '#EF4444' : currentColors.border }]}
                    placeholder="Phone number"
                    placeholderTextColor={currentColors.textSecondary}
                    value={phoneNumber}
                    onChangeText={text => { setPhoneNumber(text.replace(/\D/g, '')); setPhoneTouched(true); }}
                    onBlur={() => setPhoneTouched(true)}
                    keyboardType="phone-pad"
                    textContentType="telephoneNumber"
                    editable={!processing}
                    returnKeyType="done"
                    maxLength={15}
                  />
                </View>

                {/* Country picker dropdown */}
                {showCountryPicker && (
                  <View style={styles.countryPickerDropdown}>
                    {COUNTRY_CODES.map((cc, idx) => (
                      <Pressable
                        key={`${cc.flag}-${cc.code}`}
                        style={[
                          styles.countryPickerRow,
                          idx === COUNTRY_CODES.length - 1 && styles.countryPickerRowLast,
                        ]}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setPhoneCountryCode(cc.code);
                          setShowCountryPicker(false);
                        }}
                      >
                        <Text style={[
                          styles.countryPickerRowText,
                          cc.code === phoneCountryCode && styles.countryPickerRowTextSelected,
                        ]}>
                          {cc.flag}  {cc.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )}

                {phoneTouched && !isPhoneValid && (
                  <Text style={[styles.fieldValidationMsg, { color: '#EF4444' }]}>
                    Please enter a valid phone number (at least 7 digits).
                  </Text>
                )}
              </View>

              {/* Email for delivery */}
              {/* <View style={[styles.section, { marginTop: 8, marginBottom: 0 }]}>
                <Text style={styles.sectionTitle}>Email *</Text>
                <TextInput
                  style={[styles.input, styles.singleLineInput, {
                    borderColor: emailTouched && !isEmailValid ? '#EF4444' : currentColors.border,
                  }]}
                  placeholder="Your email address..."
                  placeholderTextColor={currentColors.textSecondary}
                  value={deliveryEmail}
                  onChangeText={text => { setDeliveryEmail(text); setEmailTouched(true); }}
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!processing}
                  returnKeyType="done"
                />
                {emailTouched && !isEmailValid && (
                  <Text style={[styles.fieldValidationMsg, { color: '#EF4444' }]}>
                    Please enter a valid email address.
                  </Text>
                )}
              </View> */}
              </>
            )}

            {/* Notes */}
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

            {/* Payment Method */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Payment Method</Text>
              {loadingCards ? (
                <ActivityIndicator size="small" color={currentColors.secondary} style={{ marginVertical: 12 }} />
              ) : (
                <>
                  {savedCards.map((card) => (
                    <Pressable
                      key={card.id}
                      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelectedCardId(card.squareCardId); }}
                      disabled={processing}
                    >
                      <LinearGradient
                        colors={selectedCardId === card.squareCardId
                          ? [currentColors.secondary, currentColors.highlight]
                          : [currentColors.cardGradientStart || currentColors.card, currentColors.cardGradientEnd || currentColors.card]}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                        style={[styles.paymentMethodsInfo, { marginBottom: 8, borderColor: selectedCardId === card.squareCardId ? currentColors.secondary : currentColors.border }]}
                      >
                        <IconSymbol name="creditcard.fill" size={22} color={selectedCardId === card.squareCardId ? currentColors.background : currentColors.secondary} />
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.paymentMethodsInfoText, { fontFamily: 'Inter_600SemiBold', color: selectedCardId === card.squareCardId ? currentColors.background : currentColors.text }]}>
                            {card.brand.toUpperCase()} •••• {card.last4}
                          </Text>
                          <Text style={[styles.paymentMethodsInfoText, { fontSize: 12, color: selectedCardId === card.squareCardId ? currentColors.background : currentColors.textSecondary }]}>
                            Expires {String(card.expMonth).padStart(2, '0')}/{card.expYear}
                            {card.isDefault ? ' · Default' : ''}
                          </Text>
                        </View>
                        {selectedCardId === card.squareCardId && (
                          <IconSymbol name="checkmark.circle.fill" size={20} color={currentColors.background} />
                        )}
                      </LinearGradient>
                    </Pressable>
                  ))}

                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      if (selectedCardId === null) {
                        // Already selected — pressing again triggers the order flow directly
                        handlePlaceOrder();
                      } else {
                        // Switch from saved card to new card mode
                        setSelectedCardId(null);
                      }
                    }}
                    disabled={processing}
                  >
                    <LinearGradient
                      colors={selectedCardId === null
                        ? [currentColors.secondary, currentColors.highlight]
                        : [currentColors.cardGradientStart || currentColors.card, currentColors.cardGradientEnd || currentColors.card]}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                      style={[styles.paymentMethodsInfo, { borderColor: selectedCardId === null ? currentColors.secondary : currentColors.border }]}
                    >
                      <IconSymbol name="add" size={22} color={selectedCardId === null ? currentColors.background : currentColors.secondary} />
                      <Text style={[styles.paymentMethodsInfoText, { fontFamily: 'Inter_600SemiBold', color: selectedCardId === null ? currentColors.background : currentColors.text }]}>
                        {savedCards.length > 0 ? 'Add a new card' : 'Enter card details'}
                      </Text>
                      {selectedCardId === null && (
                        <IconSymbol name="checkmark.circle.fill" size={20} color={currentColors.background} />
                      )}
                    </LinearGradient>
                  </Pressable>
                </>
              )}
            </View>

            {/* Order Summary */}
            <LinearGradient
              colors={[currentColors.cardGradientStart || currentColors.card, currentColors.cardGradientEnd || currentColors.card]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={styles.summaryCard}
            >
              <Text style={styles.summaryTitle}>Order Summary</Text>

              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Subtotal</Text>
                <Text style={styles.summaryValue}>${subtotal.toFixed(2)}</Text>
              </View>
{appDiscountEnabled && discount > 0 && (
  <View style={styles.summaryRow}>
    <Text style={[styles.summaryLabel, { color: currentColors.secondary }]}>
      Discount ({Math.round(appDiscountPct * 100)}%)
    </Text>
    <Text style={[styles.summaryValue, { color: currentColors.secondary }]}>
      -${discount.toFixed(2)}
    </Text>
  </View>
)}
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Tax (9.75%)</Text>
                <Text style={styles.summaryValue}>${tax.toFixed(2)}</Text>
              </View>

              {orderType === 'delivery' && (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Delivery fee</Text>
                  {isFetchingQuote ? (
                    <ActivityIndicator size="small" color={currentColors.primary} />
                  ) : (
                    <Text style={styles.summaryValue}>${deliveryFee.toFixed(2)}</Text>
                  )}
                </View>
              )}

              {usePoints && pointsDiscount > 0 && (
                <View style={styles.summaryRow}>
                  <Text style={[styles.summaryLabel, { color: currentColors.secondary }]}>Points Discount</Text>
                  <Text style={[styles.summaryValue, { color: currentColors.secondary }]}>-${pointsDiscount.toFixed(2)}</Text>
                </View>
              )}

              <View style={[styles.summaryRow, styles.summaryRowTotal]}>
                <Text style={styles.summaryLabelTotal}>Total</Text>
                <Text style={styles.summaryValueTotal}>${total.toFixed(2)}</Text>
              </View>

              {appPointsEnabled && pointsToEarn > 0 && (
                <View style={styles.pointsEarnCard}>
                  <IconSymbol name="star" size={20} color={currentColors.highlight} />
                  <Text style={styles.pointsEarnText}>
                    You'll earn {pointsToEarn} points with this order! (${(pointsToEarn * appPointsRate).toFixed(2)} value)
                  </Text>
                </View>
               )}
            </LinearGradient>

          </View>
        </ScrollView>

        {/* Footer */}
        <LinearGradient
          colors={[currentColors.cardGradientStart || currentColors.card, currentColors.cardGradientEnd || currentColors.card]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.footer}
        >
          <LinearGradient
            colors={processing || outsideRadiusError || (orderType === 'delivery' && !deliveryAddress.trim())
              ? [currentColors.textSecondary, currentColors.textSecondary]
              : [currentColors.secondary, currentColors.highlight]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={[styles.placeOrderButton, { opacity: processing || outsideRadiusError || (orderType === 'delivery' && !deliveryAddress.trim()) ? 0.5 : 1 }]}
          >
            <Pressable
              style={styles.placeOrderButtonInner}
              onPress={handlePlaceOrder}
              disabled={processing || isFetchingQuote || !!outsideRadiusError || (orderType === 'delivery' && !deliveryAddress.trim())}
            >
              {processing ? (
                <>
                  <ActivityIndicator color={currentColors.background} />
                  <Text style={styles.placeOrderButtonText}>Processing...</Text>
                </>
              ) : (
                <>
                  <IconSymbol name="lock" size={20} color={currentColors.background} />
                  <Text style={styles.placeOrderButtonText}>
                    Pay ${total.toFixed(2)}
                    {orderType === 'delivery' ? ' · incl. delivery' : ''}
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
        <SquareWebCardEntry
          visible={webCardVisible}
          applicationId={process.env.EXPO_PUBLIC_SQUARE_APPLICATION_ID ?? ''}
          locationId={process.env.EXPO_PUBLIC_SQUARE_LOCATION_ID ?? ''}
          isSandbox={process.env.EXPO_PUBLIC_SQUARE_ENVIRONMENT !== 'production'}
          baseUrl={SUPABASE_URL}
          currentColors={currentColors}
          onNonce={(nonce) => {
            setWebCardVisible(false);
            pendingNonce.current = nonce;
            setCheckoutNonceReady(true);
          }}
          onCancel={() => {
            setWebCardVisible(false);
            setProcessing(false);
            pendingPaymentBody.current = null;
            checkoutSessionRef.current = null;
          }}
        />
      </SafeAreaView>
    </LinearGradient>
  );
}

// ============================================================================
// EXPORT
// ============================================================================

export default function CheckoutScreen() {
  return <CheckoutContent />;
}
