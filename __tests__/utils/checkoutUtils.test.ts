import {
  parseStoredPhone,
  isPhoneValid,
  isEmailValid,
  calculateCheckoutTotals,
  COUNTRY_CODES,
} from '../../utils/checkoutUtils';

// ── parseStoredPhone ─────────────────────────────────────────────────────────

describe('parseStoredPhone', () => {
  it('returns default code +1 and empty number for empty string', () => {
    expect(parseStoredPhone('')).toEqual({ code: '+1', number: '' });
  });

  it('parses a US number with +1 prefix', () => {
    expect(parseStoredPhone('+15551234567')).toEqual({ code: '+1', number: '5551234567' });
  });

  it('parses a Nigerian number with +234 prefix (longer code wins)', () => {
    expect(parseStoredPhone('+2348012345678')).toEqual({ code: '+234', number: '8012345678' });
  });

  it('parses a UK number with +44 prefix', () => {
    expect(parseStoredPhone('+447911123456')).toEqual({ code: '+44', number: '7911123456' });
  });

  it('parses a Ghana number with +233 prefix', () => {
    expect(parseStoredPhone('+233201234567')).toEqual({ code: '+233', number: '201234567' });
  });

  it('falls back to +1 when no matching country code found', () => {
    // A number that starts with no known prefix
    const result = parseStoredPhone('5551234567');
    expect(result.code).toBe('+1');
    expect(result.number).toBe('5551234567');
  });

  it('strips non-digit characters from the local number', () => {
    expect(parseStoredPhone('+1555-123-4567')).toEqual({ code: '+1', number: '5551234567' });
  });

  it('longer country codes take priority over shorter ones (+234 over +2)', () => {
    const result = parseStoredPhone('+2348012345678');
    expect(result.code).toBe('+234'); // not +2 (Egypt starts with +20, not +2)
    expect(result.number).toBe('8012345678');
  });
});

// ── isPhoneValid ─────────────────────────────────────────────────────────────

describe('isPhoneValid', () => {
  it('returns true for a 10-digit number', () => {
    expect(isPhoneValid('5551234567')).toBe(true);
  });

  it('returns true for exactly 7 digits', () => {
    expect(isPhoneValid('1234567')).toBe(true);
  });

  it('returns false for fewer than 7 digits', () => {
    expect(isPhoneValid('123456')).toBe(false);
  });

  it('returns false for an empty string', () => {
    expect(isPhoneValid('')).toBe(false);
  });

  it('ignores non-digit characters when counting', () => {
    expect(isPhoneValid('555-123-4567')).toBe(true); // 10 digits after stripping
    expect(isPhoneValid('123-456')).toBe(false); // 6 digits after stripping
  });
});

// ── isEmailValid ─────────────────────────────────────────────────────────────

describe('isEmailValid', () => {
  it('accepts a standard email address', () => {
    expect(isEmailValid('user@example.com')).toBe(true);
  });

  it('accepts an email with subdomain', () => {
    expect(isEmailValid('user@mail.example.co.uk')).toBe(true);
  });

  it('accepts an email with plus sign', () => {
    expect(isEmailValid('user+tag@example.com')).toBe(true);
  });

  it('rejects an email with no @', () => {
    expect(isEmailValid('userexample.com')).toBe(false);
  });

  it('rejects an email with no domain', () => {
    expect(isEmailValid('user@')).toBe(false);
  });

  it('rejects an email with no TLD', () => {
    expect(isEmailValid('user@example')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(isEmailValid('')).toBe(false);
  });

  it('trims whitespace before validating', () => {
    expect(isEmailValid('  user@example.com  ')).toBe(true);
    expect(isEmailValid('  bad-email  ')).toBe(false);
  });
});

// ── calculateCheckoutTotals ──────────────────────────────────────────────────

const BASE_INPUT = {
  availablePoints: 0,
  usePoints: false,
  appDiscountEnabled: false,
  appDiscountPct: 0.1,
  appPointsEnabled: true,
  appPointsRate: 0.01,
  appPointsRewardPercentage: 5,
  orderType: 'pickup' as const,
  deliveryFee: 0,
};

describe('calculateCheckoutTotals', () => {
  describe('subtotal', () => {
    it('sums price × quantity for each cart item', () => {
      const result = calculateCheckoutTotals({
        ...BASE_INPUT,
        cart: [
          { price: 15, quantity: 2 },
          { price: 5, quantity: 1 },
        ],
      });
      expect(result.subtotal).toBe(35);
    });

    it('returns 0 for an empty cart', () => {
      const result = calculateCheckoutTotals({ ...BASE_INPUT, cart: [] });
      expect(result.subtotal).toBe(0);
    });
  });

  describe('discount', () => {
    it('applies discount when discount is enabled', () => {
      const result = calculateCheckoutTotals({
        ...BASE_INPUT,
        cart: [{ price: 100, quantity: 1 }],
        appDiscountEnabled: true,
        appDiscountPct: 0.1,
      });
      expect(result.discount).toBeCloseTo(10);
      expect(result.subtotalAfterDiscount).toBeCloseTo(90);
    });

    it('applies zero discount when discount is disabled', () => {
      const result = calculateCheckoutTotals({
        ...BASE_INPUT,
        cart: [{ price: 100, quantity: 1 }],
        appDiscountEnabled: false,
        appDiscountPct: 0.1,
      });
      expect(result.discount).toBe(0);
      expect(result.subtotalAfterDiscount).toBe(100);
    });

    it('applies a 15% discount correctly', () => {
      const result = calculateCheckoutTotals({
        ...BASE_INPUT,
        cart: [{ price: 200, quantity: 1 }],
        appDiscountEnabled: true,
        appDiscountPct: 0.15,
      });
      expect(result.discount).toBeCloseTo(30);
      expect(result.subtotalAfterDiscount).toBeCloseTo(170);
    });
  });

  describe('tax', () => {
    it('calculates 9.75% tax on the discounted subtotal', () => {
      const result = calculateCheckoutTotals({
        ...BASE_INPUT,
        cart: [{ price: 100, quantity: 1 }],
        appDiscountEnabled: true,
        appDiscountPct: 0.1, // subtotalAfterDiscount = 90
      });
      expect(result.tax).toBeCloseTo(90 * 0.0975, 5);
    });
  });

  describe('delivery fee', () => {
    it('adds delivery fee for delivery orders', () => {
      const result = calculateCheckoutTotals({
        ...BASE_INPUT,
        cart: [{ price: 20, quantity: 1 }],
        orderType: 'delivery',
        deliveryFee: 7.99,
      });
      expect(result.total).toBeCloseTo(20 + 20 * 0.0975 + 7.99, 2);
    });

    it('adds zero delivery fee for pickup orders', () => {
      const result = calculateCheckoutTotals({
        ...BASE_INPUT,
        cart: [{ price: 20, quantity: 1 }],
        orderType: 'pickup',
        deliveryFee: 0,
      });
      expect(result.total).toBeCloseTo(20 + 20 * 0.0975, 2);
    });
  });

  describe('points discount', () => {
    it('applies points discount when usePoints and appPointsEnabled are true', () => {
      const result = calculateCheckoutTotals({
        ...BASE_INPUT,
        cart: [{ price: 100, quantity: 1 }],
        availablePoints: 500, // $5.00 at $0.01/pt
        usePoints: true,
        appPointsEnabled: true,
        appPointsRate: 0.01,
      });
      expect(result.pointsValueInDollars).toBeCloseTo(5);
      expect(result.pointsDiscount).toBeCloseTo(5);
    });

    it('caps points discount at 20% of subtotalAfterDiscount', () => {
      const result = calculateCheckoutTotals({
        ...BASE_INPUT,
        cart: [{ price: 100, quantity: 1 }],
        availablePoints: 10000, // $100 value, but max is 20% of subtotal = $20
        usePoints: true,
        appPointsEnabled: true,
        appPointsRate: 0.01,
      });
      expect(result.maxPointsDiscount).toBeCloseTo(20);
      expect(result.pointsDiscount).toBeCloseTo(20); // capped
    });

    it('applies zero points discount when usePoints is false', () => {
      const result = calculateCheckoutTotals({
        ...BASE_INPUT,
        cart: [{ price: 100, quantity: 1 }],
        availablePoints: 500,
        usePoints: false,
        appPointsEnabled: true,
      });
      expect(result.pointsDiscount).toBe(0);
    });

    it('applies zero points discount when appPointsEnabled is false', () => {
      const result = calculateCheckoutTotals({
        ...BASE_INPUT,
        cart: [{ price: 100, quantity: 1 }],
        availablePoints: 500,
        usePoints: true,
        appPointsEnabled: false,
      });
      expect(result.pointsDiscount).toBe(0);
    });

    it('applies zero points discount when user has no points', () => {
      const result = calculateCheckoutTotals({
        ...BASE_INPUT,
        cart: [{ price: 100, quantity: 1 }],
        availablePoints: 0,
        usePoints: true,
        appPointsEnabled: true,
      });
      expect(result.pointsDiscount).toBe(0);
    });
  });

  describe('total', () => {
    it('total = subtotalAfterDiscount + tax + deliveryFee - pointsDiscount', () => {
      const result = calculateCheckoutTotals({
        ...BASE_INPUT,
        cart: [{ price: 50, quantity: 2 }], // subtotal = 100
        appDiscountEnabled: true,
        appDiscountPct: 0.1,               // discount = 10, subtotalAfterDiscount = 90
        orderType: 'delivery',
        deliveryFee: 9.99,
        availablePoints: 200,              // $2 value
        usePoints: true,
        appPointsEnabled: true,
        appPointsRate: 0.01,
      });
      const expected = 90 + 90 * 0.0975 + 9.99 - 2;
      expect(result.total).toBeCloseTo(expected, 2);
    });
  });

  describe('pointsToEarn', () => {
    it('calculates points earned at 5% reward rate with $0.01/pt', () => {
      const result = calculateCheckoutTotals({
        ...BASE_INPUT,
        cart: [{ price: 100, quantity: 1 }],
        appPointsEnabled: true,
        appPointsRate: 0.01,
        appPointsRewardPercentage: 5,
      });
      // subtotalAfterDiscount = 100, 5% = $5, / 0.01 = 500 pts
      expect(result.pointsToEarn).toBe(500);
    });

    it('returns 0 points to earn when points are disabled', () => {
      const result = calculateCheckoutTotals({
        ...BASE_INPUT,
        cart: [{ price: 100, quantity: 1 }],
        appPointsEnabled: false,
      });
      expect(result.pointsToEarn).toBe(0);
    });

    it('floors fractional point values', () => {
      const result = calculateCheckoutTotals({
        ...BASE_INPUT,
        cart: [{ price: 10.33, quantity: 1 }],
        appPointsEnabled: true,
        appPointsRate: 0.01,
        appPointsRewardPercentage: 5,
      });
      expect(Number.isInteger(result.pointsToEarn)).toBe(true);
    });
  });
});

// ── COUNTRY_CODES sanity checks ──────────────────────────────────────────────

describe('COUNTRY_CODES', () => {
  it('contains at least one entry', () => {
    expect(COUNTRY_CODES.length).toBeGreaterThan(0);
  });

  it('every entry has code, flag, and label', () => {
    for (const entry of COUNTRY_CODES) {
      expect(entry.code).toMatch(/^\+\d+$/);
      expect(typeof entry.flag).toBe('string');
      expect(typeof entry.label).toBe('string');
    }
  });

  it('includes US (+1)', () => {
    expect(COUNTRY_CODES.some(c => c.code === '+1')).toBe(true);
  });

  it('includes Nigeria (+234)', () => {
    expect(COUNTRY_CODES.some(c => c.code === '+234')).toBe(true);
  });
});
