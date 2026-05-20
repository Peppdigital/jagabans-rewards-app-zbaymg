import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import CheckoutScreen from '../app/checkout.native';

// ── Mock colours ──────────────────────────────────────────────────────────────
const MOCK_COLORS = {
  primary: '#4AD7C2',
  secondary: '#D4AF37',
  highlight: '#D4AF37',
  background: '#0A0A0A',
  card: '#1A1A1A',
  text: '#F5F5F5',
  textSecondary: '#888888',
  border: '#2A2A2A',
  cardGradientStart: '#1A1A1A',
  cardGradientEnd: '#1A1A1A',
  gradientStart: '#0A0A0A',
  gradientMid: '#0A0A0A',
  gradientEnd: '#0A0A0A',
  headerGradientStart: '#1A1A1A',
  headerGradientEnd: '#1A1A1A',
};

const MOCK_USER_PROFILE = {
  id: 'user-123',
  user_id: 'user-123',
  name: 'Test User',
  email: 'test@example.com',
  phone: '+15551234567',
  address: '',
  points: 500,
  stripe_customer_id: null,
};

const MOCK_CART = [
  { id: 'item-1', name: 'Jollof Rice', price: 15.0, quantity: 2 },
  { id: 'item-2', name: 'Plantain',    price: 5.0,  quantity: 1 },
];

const MOCK_APP_CONFIG = {
  discount_enabled: true,
  discount_percentage: 10,
  points_enabled: true,
  points_value_rate: 0.01,
  points_reward_percentage: 5,
};

// ── Module mocks (factories must only use require(), not top-level imports) ───

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  const { createElement } = require('react');
  return {
    SafeAreaView: ({ children, ...props }: any) => createElement(View, props, children),
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  };
});

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'Light', Medium: 'Medium', Heavy: 'Heavy' },
  NotificationFeedbackType: { Success: 'Success', Error: 'Error', Warning: 'Warning' },
}));

jest.mock('expo-linear-gradient', () => {
  const { View } = require('react-native');
  const { createElement } = require('react');
  return {
    LinearGradient: ({ children, style }: any) => createElement(View, { style }, children),
  };
});

jest.mock('expo-linking', () => ({
  createURL: jest.fn().mockReturnValue('myapp://checkout'),
}));

jest.mock('@stripe/stripe-react-native', () => ({
  StripeProvider: ({ children }: any) => children,
  useStripe: () => ({
    initPaymentSheet: jest.fn().mockResolvedValue({ error: null }),
    presentPaymentSheet: jest.fn().mockResolvedValue({ error: null }),
  }),
}));

jest.mock('@/app/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({
        data: { session: { access_token: 'test-token' } },
        error: null,
      }),
      getUser: jest.fn().mockResolvedValue({
        data: { user: { id: 'user-123', email: 'test@example.com' } },
        error: null,
      }),
    },
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
    }),
  },
  SUPABASE_URL: 'https://test.supabase.co',
}));

jest.mock('@/contexts/AppContext', () => ({
  useApp: jest.fn(),
}));

jest.mock('@/hooks/useAppConfig', () => ({
  useAppConfig: jest.fn(),
}));

jest.mock('@/components/IconSymbol', () => {
  const { Text } = require('react-native');
  const { createElement } = require('react');
  return {
    IconSymbol: ({ name }: any) => createElement(Text, null, name),
  };
});

jest.mock('@/components/Toast', () => {
  const { View } = require('react-native');
  const { createElement } = require('react');
  return {
    __esModule: true,
    default: () => createElement(View, null),
  };
});

jest.mock('@/services/supabaseService', () => ({
  appConfigService: { getAppConfig: jest.fn() },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function setupMocks(overrides: { cart?: typeof MOCK_CART; userProfile?: any; config?: any } = {}) {
  const { useApp } = require('@/contexts/AppContext');
  const { useAppConfig } = require('@/hooks/useAppConfig');

  (useApp as jest.Mock).mockReturnValue({
    cart: overrides.cart ?? MOCK_CART,
    userProfile: overrides.userProfile ?? MOCK_USER_PROFILE,
    currentColors: MOCK_COLORS,
    setTabBarVisible: jest.fn(),
    clearCart: jest.fn(),
    loadUserProfile: jest.fn(),
  });

  (useAppConfig as jest.Mock).mockReturnValue({
    config: overrides.config ?? MOCK_APP_CONFIG,
    loading: false,
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  setupMocks();
});

describe('CheckoutScreen', () => {
  describe('rendering', () => {
    it('renders without crashing', () => {
      render(<CheckoutScreen />);
    });

    it('shows Order Type section with Pickup and Delivery buttons', () => {
      render(<CheckoutScreen />);
      expect(screen.getByText('Order Type')).toBeTruthy();
      expect(screen.getByText('Pickup')).toBeTruthy();
      expect(screen.getByText('Delivery')).toBeTruthy();
    });

    it('shows Order Summary section', () => {
      render(<CheckoutScreen />);
      expect(screen.getByText('Order Summary')).toBeTruthy();
    });

    it('shows the Payment Method section', () => {
      render(<CheckoutScreen />);
      expect(screen.getByText('Payment Method')).toBeTruthy();
    });

    it('shows Pickup Notes field in pickup mode', () => {
      render(<CheckoutScreen />);
      expect(screen.getByText('Pickup Notes (Optional)')).toBeTruthy();
    });
  });

  describe('order summary pricing', () => {
    it('displays the cart subtotal', () => {
      // MOCK_CART: 15*2 + 5*1 = $35.00
      render(<CheckoutScreen />);
      expect(screen.getByText('$35.00')).toBeTruthy();
    });

    it('displays the 10% discount row when discount is enabled', () => {
      render(<CheckoutScreen />);
      expect(screen.getByText('Discount (10%)')).toBeTruthy();
      expect(screen.getByText('-$3.50')).toBeTruthy();
    });

    it('hides the discount row when discount is disabled', () => {
      setupMocks({ config: { ...MOCK_APP_CONFIG, discount_enabled: false } });
      render(<CheckoutScreen />);
      expect(screen.queryByText(/Discount/)).toBeNull();
    });

    it('displays the tax row', () => {
      render(<CheckoutScreen />);
      expect(screen.getByText('Tax (9.75%)')).toBeTruthy();
    });

    it('displays the Total row', () => {
      render(<CheckoutScreen />);
      expect(screen.getByText('Total')).toBeTruthy();
    });
  });

  describe('order type switching', () => {
    it('does not show Delivery Address section by default (pickup mode)', () => {
      render(<CheckoutScreen />);
      expect(screen.queryByText('Delivery Address *')).toBeNull();
    });

    it('shows Delivery Address section after tapping Delivery', () => {
      render(<CheckoutScreen />);
      fireEvent.press(screen.getByText('Delivery'));
      expect(screen.getByText('Delivery Address *')).toBeTruthy();
    });

    it('shows Phone Number field in delivery mode', () => {
      render(<CheckoutScreen />);
      fireEvent.press(screen.getByText('Delivery'));
      expect(screen.getByText('Phone Number *')).toBeTruthy();
    });

    it('shows Delivery Notes field after switching to delivery', () => {
      render(<CheckoutScreen />);
      fireEvent.press(screen.getByText('Delivery'));
      expect(screen.getByText('Delivery Notes (Optional)')).toBeTruthy();
    });

    it('hides Delivery Address section after switching back to Pickup', () => {
      render(<CheckoutScreen />);
      fireEvent.press(screen.getByText('Delivery'));
      fireEvent.press(screen.getByText('Pickup'));
      expect(screen.queryByText('Delivery Address *')).toBeNull();
    });
  });

  describe('place order button', () => {
    it('shows Pay button with total amount in pickup mode', () => {
      render(<CheckoutScreen />);
      expect(screen.getByText(/Pay \$\d+\.\d+/)).toBeTruthy();
    });

    it('shows delivery label in button text after switching to delivery', () => {
      render(<CheckoutScreen />);
      fireEvent.press(screen.getByText('Delivery'));
      expect(screen.getByText(/incl\. delivery/)).toBeTruthy();
    });
  });

  describe('points earning', () => {
    it('shows points-to-earn message when points are enabled', () => {
      render(<CheckoutScreen />);
      expect(screen.getByText(/You'll earn \d+ points/)).toBeTruthy();
    });

    it('hides points-to-earn message when points are disabled', () => {
      setupMocks({ config: { ...MOCK_APP_CONFIG, points_enabled: false } });
      render(<CheckoutScreen />);
      expect(screen.queryByText(/You'll earn \d+ points/)).toBeNull();
    });
  });
});
