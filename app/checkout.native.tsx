import React, { useState, useEffect, useCallback, useRef } from 'react';
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
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '@/contexts/AppContext';
import { IconSymbol } from '@/components/IconSymbol';
import * as Haptics from 'expo-haptics';
import Toast from '@/components/Toast';
import { SUPABASE_URL, supabase } from '@/app/integrations/supabase/client';
import { StripeProvider, useStripe } from '@stripe/stripe-react-native';
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
  full_name: string | null;
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

const STRIPE_PUBLISHABLE_KEY =
  process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
  '';

// Replace with your actual Google Places API key
const GOOGLE_PLACES_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY || '';

const POINTS_TO_DOLLAR_RATE = 0.01;
const DISCOUNT_PERCENTAGE = 0.15;

const COUNTRY_CODES = [
  { code: '+1',   flag: '🇺🇸', label: 'United States (+1)' },
  { code: '+1',   flag: '🇨🇦', label: 'Canada (+1)' },
  { code: '+44',  flag: '🇬🇧', label: 'United Kingdom (+44)' },
  { code: '+234', flag: '🇳🇬', label: 'Nigeria (+234)' },
  { code: '+233', flag: '🇬🇭', label: 'Ghana (+233)' },
  { code: '+27',  flag: '🇿🇦', label: 'South Africa (+27)' },
  { code: '+254', flag: '🇰🇪', label: 'Kenya (+254)' },
  { code: '+251', flag: '🇪🇹', label: 'Ethiopia (+251)' },
  { code: '+225', flag: '🇨🇮', label: "Côte d'Ivoire (+225)" },
  { code: '+212', flag: '🇲🇦', label: 'Morocco (+212)' },
  { code: '+20',  flag: '🇪🇬', label: 'Egypt (+20)' },
  { code: '+61',  flag: '🇦🇺', label: 'Australia (+61)' },
  { code: '+91',  flag: '🇮🇳', label: 'India (+91)' },
  { code: '+49',  flag: '🇩🇪', label: 'Germany (+49)' },
  { code: '+33',  flag: '🇫🇷', label: 'France (+33)' },
  { code: '+34',  flag: '🇪🇸', label: 'Spain (+34)' },
  { code: '+39',  flag: '🇮🇹', label: 'Italy (+39)' },
  { code: '+31',  flag: '🇳🇱', label: 'Netherlands (+31)' },
  { code: '+46',  flag: '🇸🇪', label: 'Sweden (+46)' },
  { code: '+47',  flag: '🇳🇴', label: 'Norway (+47)' },
  { code: '+55',  flag: '🇧🇷', label: 'Brazil (+55)' },
  { code: '+52',  flag: '🇲🇽', label: 'Mexico (+52)' },
  { code: '+81',  flag: '🇯🇵', label: 'Japan (+81)' },
  { code: '+82',  flag: '🇰🇷', label: 'South Korea (+82)' },
  { code: '+86',  flag: '🇨🇳', label: 'China (+86)' },
  { code: '+971', flag: '🇦🇪', label: 'UAE (+971)' },
  { code: '+966', flag: '🇸🇦', label: 'Saudi Arabia (+966)' },
  { code: '+65',  flag: '🇸🇬', label: 'Singapore (+65)' },
];

/** Split a stored E.164-style phone into country code + local digits. */
function parseStoredPhone(phone: string): { code: string; number: string } {
  if (!phone) return { code: '+1', number: '' };
  const sorted = COUNTRY_CODES.map(c => c.code).sort((a, b) => b.length - a.length);
  for (const code of sorted) {
    if (phone.startsWith(code)) {
      return { code, number: phone.slice(code.length).replace(/\D/g, '') };
    }
  }
  return { code: '+1', number: phone.replace(/\D/g, '') };
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const POINTS_REWARD_PERCENTAGE = 0.05;
const QUOTE_REFRESH_BUFFER_MS = 60_000;
const FALLBACK_DELIVERY_FEE = 19.99; // applied when Uber quote is unavailable

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

  const { initPaymentSheet, presentPaymentSheet } = useStripe();

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


  // ── Computed values ───────────────────────────────────────────────────────

  const availablePoints = userProfile?.points || 0;
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const discount = subtotal * DISCOUNT_PERCENTAGE;
  const subtotalAfterDiscount = subtotal - discount;
  const tax = subtotalAfterDiscount * 0.0975;

  const pointsValueInDollars = availablePoints * POINTS_TO_DOLLAR_RATE;
  const maxPointsDiscount = subtotalAfterDiscount * 0.2;
  const pointsDiscount = usePoints ? Math.min(pointsValueInDollars, maxPointsDiscount) : 0;

  // Use quoted fee when available, fallback flat rate otherwise (never 0 for delivery)
  const deliveryFee =
    orderType === 'delivery'
      ? (deliveryQuote ? deliveryQuote.fee : FALLBACK_DELIVERY_FEE)
      : 0;
  const total = subtotalAfterDiscount + tax + deliveryFee - pointsDiscount;

  const pointsToEarn = Math.floor(
    (subtotalAfterDiscount * POINTS_REWARD_PERCENTAGE) / POINTS_TO_DOLLAR_RATE
  );

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

  // ── Payment sheet ─────────────────────────────────────────────────────────

  const initializePaymentSheet = useCallback(async () => {
  if (!userProfile) throw new Error('User profile not found');

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('User not found');

  const { data: customerData } = await supabase
    .from('user_profiles')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .single<{ stripe_customer_id: string | null }>();

  let customerId = customerData?.stripe_customer_id;

  if (!customerId) {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/create-stripe-customer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ email: userProfile?.email || user.email, name: userProfile?.name }),
    });
    if (!res.ok) throw new Error('Failed to create Stripe customer');
    const { customerId: newId } = await res.json();
    customerId = newId;
  }

  if (orderType === 'delivery' && deliveryQuote && isQuoteExpired()) {
    const addr = validatedAddress || deliveryAddress;
    if (addr) await fetchDeliveryQuote(addr, validatedUberAddress || undefined);
  }

  const pointsUsed = usePoints ? Math.floor(pointsDiscount / POINTS_TO_DOLLAR_RATE) : 0;
  const orderItems = cart.map((item) => ({
    id: item.id, name: item.name, price: item.price, quantity: item.quantity,
  }));

  // ── Full order snapshot — goes to pending_orders, NOT Stripe metadata ──
  const pendingOrderPayload = {
    order_type: orderType,
    delivery_address: orderType === 'delivery' ? (validatedAddress || deliveryAddress) : '',
    delivery_address_uber: orderType === 'delivery' ? (validatedUberAddress || '') : '',
    pickup_notes: pickupNotes || '',
    items: orderItems,           // full objects, no JSON.stringify needed
    subtotal: subtotal,
    tax: tax,
    delivery_fee: deliveryFee,
    total: total,
    discount: discount,
    points_earned: pointsToEarn,
    points_used: pointsUsed,
    points_discount: pointsDiscount,
    customer_name: userProfile?.name || '',
    customer_email: (orderType === 'delivery' ? deliveryEmail : userProfile?.email) || user.email || '',
    customer_phone: orderType === 'delivery'
      ? `${phoneCountryCode}${phoneNumber}`
      : (userProfile?.phone || ''),
    uber_quote_id: deliveryQuote?.quoteId || '',
  };

  const response = await fetch(`${SUPABASE_URL}/functions/v1/create-payment-intent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({
      amount: Math.round(total * 100),
      currency: 'usd',
      customerId,
      setupFutureUsage: 'off_session',
      pendingOrder: pendingOrderPayload,  // ← replaces the old metadata blob
    }),
  });

  if (!response.ok) throw new Error('Failed to create payment intent');
  return response.json();
}, [
  total, orderType, cart, userProfile, validatedAddress, deliveryAddress, validatedUberAddress, pickupNotes,
  subtotal, tax, discount, deliveryFee, pointsToEarn, usePoints, pointsDiscount,
  deliveryQuote, isQuoteExpired, fetchDeliveryQuote, deliveryEmail, phoneCountryCode, phoneNumber,
]);

  // ── Order polling ─────────────────────────────────────────────────────────

  const waitForOrderCreation = useCallback(async (paymentIntentId: string): Promise<string> => {
    for (let attempt = 0; attempt < 30; attempt++) {
      const { data: order } = await supabase
        .from('orders')
        .select('id, order_type')
        .eq('payment_id', paymentIntentId)
        .maybeSingle<Order>();

      if (order?.id) return order.id;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw new Error(
      'Order creation timed out. Your payment was successful. Contact support with payment ID: ' +
        paymentIntentId
    );
  }, []);

  // ── Order placement ───────────────────────────────────────────────────────

  const proceedWithPayment = useCallback(async () => {
    setProcessing(true);
    try {
      const paymentData = await initializePaymentSheet();
      if (!paymentData) throw new Error('Failed to initialize payment');

      const { clientSecret, ephemeralKey, paymentIntentId, customerId } = paymentData;
      const returnURL = Linking.createURL('checkout');

      const initConfig: any = {
        merchantDisplayName: 'Jagabans LA',
        paymentIntentClientSecret: clientSecret,
        allowsDelayedPaymentMethods: false,
        returnURL,
        defaultBillingDetails: { name: userProfile?.name, email: userProfile?.email },
        googlePay: { merchantCountryCode: 'US', testEnv: false, currencyCode: 'usd' },
      };

      if (customerId && ephemeralKey) {
        initConfig.customerId = customerId;
        initConfig.customerEphemeralKeySecret = ephemeralKey;
      }

      const { error: initError } = await initPaymentSheet(initConfig);
      if (initError) throw new Error(initError.message);

      const { error: presentError } = await presentPaymentSheet();
      if (presentError) {
        if (presentError.code === 'Canceled') {
          showToast('info', 'Payment cancelled');
          setProcessing(false);
          return;
        }
        throw new Error(presentError.message);
      }

      showToast('success', 'Payment successful! Creating your order...');

      const orderId = await waitForOrderCreation(paymentIntentId);

      clearCart();
      await loadUserProfile();

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => {
        setProcessing(false);
        router.push({ pathname: '/order-confirmation', params: { orderId } });
      }, 100);
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Failed to place order. Please try again.');
      setProcessing(false);
    }
  }, [
    initializePaymentSheet, initPaymentSheet, presentPaymentSheet,
    waitForOrderCreation, clearCart, loadUserProfile, router, showToast, userProfile,
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
                Secure checkout powered by Stripe. Your payment information is encrypted and protected. Enjoy 15% off your order!
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
              <LinearGradient
                colors={[currentColors.cardGradientStart || currentColors.card, currentColors.cardGradientEnd || currentColors.card]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={styles.paymentMethodsInfo}
              >
                <IconSymbol name="payment" size={24} color={currentColors.primary} />
                <Text style={styles.paymentMethodsInfoText}>
                  Choose from saved cards, Apple Pay, Google Pay, and more when you proceed to checkout.
                </Text>
              </LinearGradient>
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
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: currentColors.secondary }]}>Discount (15%)</Text>
                <Text style={[styles.summaryValue, { color: currentColors.secondary }]}>-${discount.toFixed(2)}</Text>
              </View>
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

              <View style={styles.pointsEarnCard}>
                <IconSymbol name="star" size={20} color={currentColors.highlight} />
                <Text style={styles.pointsEarnText}>
                  You'll earn {pointsToEarn} points with this order! (${(pointsToEarn * POINTS_TO_DOLLAR_RATE).toFixed(2)} value)
                </Text>
              </View>
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
      </SafeAreaView>
    </LinearGradient>
  );
}

// ============================================================================
// EXPORT
// ============================================================================

export default function CheckoutScreen() {
  return (
    <StripeProvider publishableKey={STRIPE_PUBLISHABLE_KEY}>
      <CheckoutContent />
    </StripeProvider>
  );
}