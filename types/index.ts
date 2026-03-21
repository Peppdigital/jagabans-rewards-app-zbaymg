
export interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  image: string;
  popular?: boolean;
  serial?: string;
  available?: boolean;
}

export interface CartItem extends MenuItem {
  quantity: number;
}

export interface Order {
  id: string;
  orderNumber: number; // Human-readable order number (e.g., 1001, 1002)
  items: CartItem[];
  total: number;
  pointsEarned: number;
  date: string;
  status: 'pending' | 'preparing' | 'ready' | 'completed';
  deliveryAddress?: string;
  pickupNotes?: string;
  paymentId?: string;
  
  // Uber Direct fields
  uberDeliveryId?: string;
  uberDeliveryStatus?: string;
  uberTrackingUrl?: string;
  uberCourierName?: string;
  uberCourierPhone?: string;
  uberCourierLocation?: {
    lat: number;
    lng: number;
  };
  uberDeliveryEta?: string;
  uberProofOfDelivery?: {
    signatureImageUrl?: string;
    photoUrl?: string;
    notes?: string;
  };
  
  // DoorDash fields
  doordashDeliveryId?: string;
  doordashDeliveryStatus?: string;
  doordashTrackingUrl?: string;
  doordashDasherName?: string;
  doordashDasherPhone?: string;
  doordashDasherLocation?: {
    lat: number;
    lng: number;
  };
  doordashDeliveryEta?: string;
  doordashProofOfDelivery?: {
    signatureImageUrl?: string;
    photoUrl?: string;
    notes?: string;
  };
  
  // Common delivery fields
  deliveryProvider?: 'uber_direct' | 'doordash';
  deliveryTriggeredAt?: string;
}

export interface MerchItem {
  id: string;
  name: string;
  description: string;
  pointsCost: number;
  image: string;
  inStock: boolean;
}

export interface MerchRedemption {
  id: string;
  merchId: string;
  merchName: string;
  pointsCost: number;
  deliveryAddress: string;
  pickupNotes?: string;
  date: string;
  status: 'pending' | 'processing' | 'shipped' | 'delivered';
}

export interface GiftCard {
  id: string;
  amount?: number;
  points?: number;
  recipientEmail?: string;
  recipientName?: string;
  recipientId?: string;
  message?: string;
  purchaseDate?: string;
  senderId?: string;
  type?: 'money' | 'points';
}

export interface PaymentMethod {
  id: string;
  type: 'credit' | 'debit';
  cardNumber: string;
  cardholderName: string;
  expiryDate: string;
  isDefault: boolean;
}

export interface SquarePayment {
  id: string;
  userId: string;
  orderId?: string;
  squarePaymentId: string;
  squareOrderId?: string;
  amount: number;
  currency: string;
  status: 'pending' | 'completed' | 'failed' | 'refunded' | 'cancelled';
  paymentMethod?: string;
  receiptUrl?: string;
  errorMessage?: string;
  metadata?: any;
  createdAt: string;
  updatedAt: string;
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: 'special' | 'event' | 'order' | 'general' | 'giftcard';
  date: string;
  read: boolean;
  actionUrl?: string;
}

export interface Event {
  id: string;
  title: string;
  description: string;
  date: string;
  location: string;
  capacity: number;
  availableSpots: number;
  attendees: string[];
  image: string;
  isPrivate: boolean;
  isInviteOnly?: boolean;
  shareableLink?: string;
}

export interface Reservation {
  id: string;
  name: string;
  email: string;
  phone: string;
  date: string;
  time: string;
  guests: number;
  specialRequests?: string;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no-show';
  tableNumber?: string;
  createdAt: string;
}

export interface AdminNotificationEmail {
  id: string;
  email: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

export type ThemeMode = 'light' | 'dark' | 'auto';
export type ColorScheme = 'default' | 'warm' | 'cool' | 'vibrant' | 'minimal';
export type UserRole = 'user' | 'admin' | 'super_admin';

export interface ThemeSettings {
  mode: ThemeMode;
  colorScheme: ColorScheme;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  points: number;
  orders: Order[];
  giftCards: GiftCard[];
  paymentMethods: PaymentMethod[];
  profileImage?: string;
  notifications: AppNotification[];
  rsvpEvents: string[];
  themeSettings?: ThemeSettings;
  merchRedemptions?: MerchRedemption[];
  userRole: UserRole;
}
