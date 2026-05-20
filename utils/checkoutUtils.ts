export const COUNTRY_CODES = [
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
export function parseStoredPhone(phone: string): { code: string; number: string } {
  if (!phone) return { code: '+1', number: '' };
  const sorted = COUNTRY_CODES.map(c => c.code).sort((a, b) => b.length - a.length);
  for (const code of sorted) {
    if (phone.startsWith(code)) {
      return { code, number: phone.slice(code.length).replace(/\D/g, '') };
    }
  }
  return { code: '+1', number: phone.replace(/\D/g, '') };
}

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isPhoneValid(phoneNumber: string): boolean {
  return phoneNumber.replace(/\D/g, '').length >= 7;
}

export function isEmailValid(email: string): boolean {
  return EMAIL_REGEX.test(email.trim());
}

export interface CartItem {
  price: number;
  quantity: number;
}

export interface CheckoutPricingInput {
  cart: CartItem[];
  availablePoints: number;
  usePoints: boolean;
  appDiscountEnabled: boolean;
  appDiscountPct: number;
  appPointsEnabled: boolean;
  appPointsRate: number;
  appPointsRewardPercentage: number;
  orderType: 'pickup' | 'delivery';
  deliveryFee: number;
}

export interface CheckoutPricingResult {
  subtotal: number;
  discount: number;
  subtotalAfterDiscount: number;
  tax: number;
  pointsValueInDollars: number;
  maxPointsDiscount: number;
  pointsDiscount: number;
  total: number;
  pointsToEarn: number;
}

export function calculateCheckoutTotals(input: CheckoutPricingInput): CheckoutPricingResult {
  const subtotal = input.cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const discount = input.appDiscountEnabled ? subtotal * input.appDiscountPct : 0;
  const subtotalAfterDiscount = subtotal - discount;
  const tax = subtotalAfterDiscount * 0.0975;
  const pointsValueInDollars = input.availablePoints * input.appPointsRate;
  const maxPointsDiscount = subtotalAfterDiscount * 0.2;
  const pointsDiscount =
    input.usePoints && input.appPointsEnabled
      ? Math.min(pointsValueInDollars, maxPointsDiscount)
      : 0;
  const total = subtotalAfterDiscount + tax + input.deliveryFee - pointsDiscount;
  const pointsToEarn = input.appPointsEnabled
    ? Math.floor((subtotalAfterDiscount * (input.appPointsRewardPercentage / 100)) / input.appPointsRate)
    : 0;

  return {
    subtotal,
    discount,
    subtotalAfterDiscount,
    tax,
    pointsValueInDollars,
    maxPointsDiscount,
    pointsDiscount,
    total,
    pointsToEarn,
  };
}
