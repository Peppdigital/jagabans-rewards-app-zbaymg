
import React, { createContext, useContext, useState, ReactNode, useEffect, useRef, useCallback } from 'react';
import { MenuItem, CartItem, Order, UserProfile, GiftCard, PaymentMethod, AppNotification, ThemeSettings, ThemeMode, ColorScheme, MerchRedemption, UserRole } from '@/types';
import { useColorScheme } from 'react-native';
import { useAuth } from './AuthContext';
import { supabase } from '@/app/integrations/supabase/client';
import type { Database } from '@/app/integrations/supabase/types';
import {
  userService,
  menuService,
  orderService,
  merchService,
  giftCardService,
  notificationService,
  themeService,
  paymentMethodService,
  appConfigService,
  type AppConfig,
  DEFAULT_STORE_HOURS,
} from '@/services/supabaseService';
import { getOrderingStatus, getOrderingStatusFromConfig, type OrderingStatus } from '@/utils/mondayBlock';
import { RealtimeChannel } from '@supabase/supabase-js';
import { playOrderReadySound, configureNotificationSound } from '@/utils/notificationSound';

interface ToastConfig {
  visible: boolean;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface AppContextType {
  cart: CartItem[];
  addToCart: (item: CartItem) => void;
  removeFromCart: (itemId: string) => void;
  updateCartQuantity: (itemId: string, quantity: number) => void;
  clearCart: () => void;
  userProfile: UserProfile | null;
  loadUserProfile: () => Promise<void>;
  placeOrder: (deliveryAddress?: string, pickupNotes?: string) => Promise<void>;
  purchaseGiftCard: (giftCard: GiftCard) => void;
  sendPointsGiftCard: (recipientId: string, recipientName: string, points: number, message?: string) => Promise<void>;
  redeemMerch: (merchId: string, merchName: string, pointsCost: number, deliveryAddress: string, pickupNotes?: string) => Promise<void>;
  addPaymentMethod: (paymentMethod: PaymentMethod) => Promise<void>;
  removePaymentMethod: (paymentMethodId: string) => Promise<void>;
  setDefaultPaymentMethod: (paymentMethodId: string) => Promise<void>;
  updateProfileImage: (imageUri: string) => void;
  markNotificationAsRead: (notificationId: string) => Promise<void>;
  addNotification: (notification: AppNotification) => void;
  themeSettings: ThemeSettings;
  updateThemeMode: (mode: ThemeMode) => Promise<void>;
  updateColorScheme: (scheme: ColorScheme) => Promise<void>;
  currentColors: any;
  isTabBarVisible: boolean;
  setTabBarVisible: (visible: boolean) => void;
  receivePointsGiftCard: (senderId: string, senderName: string, points: number, message?: string) => void;
  toast: ToastConfig;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  hideToast: () => void;
  menuItems: MenuItem[];
  setMenuItems: (items: MenuItem[]) => void;
  loadMenuItems: () => Promise<void>;
  getUnreadNotificationCount: () => number;
  orderingStatus: OrderingStatus;
  appConfig: AppConfig;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const systemColorScheme = useColorScheme();
  const { user, isAuthenticated } = useAuth();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isTabBarVisible, setIsTabBarVisible] = useState(true);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const orderChannelRef = useRef<RealtimeChannel | null>(null);
  const [toast, setToast] = useState<ToastConfig>({
    visible: false,
    message: '',
    type: 'success',
  });
  const [themeSettings, setThemeSettings] = useState<ThemeSettings>({
    mode: 'light',
    colorScheme: 'default',
  });
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [appConfig, setAppConfig] = useState<AppConfig>({
    hours_restriction_enabled: true,
    store_manually_closed: false,
    store_hours: DEFAULT_STORE_HOURS,
    discount_enabled: true,
    discount_percentage: 10,
    points_enabled: true,
    points_value_rate: 0.01,
    points_reward_percentage: 5,
  });

  const loadMenuItems = useCallback(async () => {
    try {
      console.log('Loading menu items from Supabase (AppContext)');
      const { data, error } = await menuService.getMenuItems();
      
      if (error) {
        console.error('Error loading menu items:', error);
        return;
      }

      if (data) {
        const items: MenuItem[] = data.map((item: any) => ({
          id: String(item.id),
          name: item.name,
          description: item.description,
          price: parseFloat(item.price),
          category: item.category,
          image: item.image,
          popular: item.popular,
          available: item.available !== false,
          serial: item.serial,
        }));
        setMenuItems(items);
        console.log('Loaded', items.length, 'menu items in context');
      }
    } catch (error) {
      console.error('Exception loading menu items:', error);
    }
  }, []);

  const loadUserProfile = useCallback(async () => {
    if (!user) return;

    try {
      console.log('Loading user profile for:', user.id);
      const { data: profile, error } = await userService.getUserProfile(user.id);
      
      if (error) {
        console.error('Error loading user profile:', error);
        return;
      }

      if (!profile) {
        console.log('No profile found, creating default profile');
        // Create default profile if it doesn't exist
        await (supabase
          .from('user_profiles')
          .insert({
            id: user.id,
            user_id: user.id,
            name: user.user_metadata?.name || 'User',
            email: user.email || '',
            phone: user.user_metadata?.phone || '',
            points: 0,
            user_role: 'user',
          } as any) as unknown) as { data: Database['public']['Tables']['user_profiles']['Row'][] | null; error: any };
        return loadUserProfile();
      }

      // Load orders
      const { data: orders } = await orderService.getOrderHistory(user.id);
      
      // Load gift cards
      const { data: receivedGiftCards } = await giftCardService.getReceivedGiftCards(user.id);
      const { data: sentGiftCards } = await giftCardService.getSentGiftCards(user.id);
      
      // Load payment methods
      const { data: paymentMethods } = await paymentMethodService.getPaymentMethods(user.id);
      
      // Load notifications
      const { data: notifications } = await notificationService.getNotifications(user.id);
      
      // Load theme settings
      const { data: theme, error: themeError } = await themeService.getThemeSettings(user.id);
      
      // If no theme settings exist, create default ones
      if (!theme && !themeError) {
        console.log('No theme settings found, creating default');
        await themeService.updateThemeSettings(user.id, {
          mode: 'auto',
          colorScheme: 'default',
        });
      }
      
      // Load merch redemptions
      const { data: merchRedemptions } = await merchService.getMerchRedemptions(user.id);

      const fullProfile: UserProfile = {
        id: profile.id,
        name: profile.name,
        email: profile.email,
        phone: profile.phone || '',
        address: profile.address || '', 
        points: profile.points || 0,
        profileImage: profile.profile_image ?? undefined,
        userRole: profile.user_role as UserRole,
        orders: orders?.map((o: any) => ({
          id: o.id,
          orderNumber: o.order_number || 0,
          items: o.order_items?.map((oi: any) => ({
            id: oi.menu_item_id || oi.id,
            name: oi.name,
            price: parseFloat(oi.price),
            quantity: oi.quantity,
            description: '',
            category: '',
            image: '',
          })) || [],
          total: parseFloat(o.total),
          pointsEarned: o.points_earned,
          date: o.created_at,
          status: o.status,
          deliveryAddress: o.delivery_address,
          pickupNotes: o.pickup_notes,
        })) || [],
        giftCards: [...(receivedGiftCards || []), ...(sentGiftCards || [])].map((gc: any) => ({
          id: gc.id,
          points: gc.points,
          recipientId: gc.recipient_id,
          recipientName: gc.recipient_name,
          recipientEmail: gc.recipient_email,
          message: gc.message,
          purchaseDate: gc.created_at,
          senderId: gc.sender_id,
          type: 'points',
        })),
        paymentMethods: paymentMethods?.map((pm: any) => ({
          id: pm.id,
          type: pm.type,
          cardNumber: pm.card_number,
          cardholderName: pm.cardholder_name,
          expiryDate: pm.expiry_date,
          isDefault: pm.is_default,
        })) || [],
        notifications: notifications?.map((n: any) => ({
          id: n.id,
          title: n.title,
          message: n.message,
          type: n.type,
          date: n.created_at,
          read: n.read,
          actionUrl: n.action_url,
        })) || [],
        rsvpEvents: [],
        themeSettings: theme ? {
          mode: (theme as any).mode as ThemeMode,
          colorScheme: (((theme as any).color_scheme ?? (theme as any).colorScheme) as ColorScheme),
        } : { mode: 'auto', colorScheme: 'default' },
        merchRedemptions: merchRedemptions?.map((mr: any) => ({
          id: mr.id,
          merchId: mr.merch_item_id,
          merchName: mr.merch_name,
          pointsCost: mr.points_cost,
          deliveryAddress: mr.delivery_address,
          pickupNotes: mr.pickup_notes,
          date: mr.created_at,
          status: mr.status,
        })) || [],
      };

      setUserProfile(fullProfile);
      if (fullProfile.themeSettings) {
        setThemeSettings(fullProfile.themeSettings);
      }
      console.log('User profile loaded successfully');
    } catch (error) {
      console.error('Error loading user profile:', error);
    }
  }, [user]);
  
  // Keep a stable ref so subscription callbacks always call the latest version
  // without needing loadUserProfile in the subscription's dependency array.
  const loadUserProfileRef = useRef(loadUserProfile);
  useEffect(() => { loadUserProfileRef.current = loadUserProfile; });

  // Initialize notification sound settings on app startup
  useEffect(() => {
    configureNotificationSound();
  }, []);

  // Guard prevents the double-invocation that React Strict Mode causes in dev.
  // The ref persists across the simulated mount/unmount cycle, so only the
  // second (real) mount fires the actual load.
  const menuLoadedRef = useRef(false);
  useEffect(() => {
    if (menuLoadedRef.current) return;
    menuLoadedRef.current = true;
    loadMenuItems();
  }, [loadMenuItems]);

  // Load app config and subscribe to realtime changes
  useEffect(() => {
    // Initial fetch
    appConfigService.getAppConfig().then(({ data }) => {
      if (data) setAppConfig(data);
    });

    // Realtime subscription — re-fetch the full config on any change to app_config rows
    const channel = supabase
      .channel('app_config_changes')
      .on(
        'postgres_changes' as any,
        { event: '*', schema: 'public', table: 'app_config' },
        () => {
          appConfigService.getAppConfig().then(({ data }) => {
            if (data) setAppConfig(data);
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Auto-reopen store when maintenance_target_date is reached
  useEffect(() => {
    if (!appConfig.store_manually_closed || !appConfig.maintenance_target_date) return;

    const targetDate = new Date(appConfig.maintenance_target_date);
    if (isNaN(targetDate.getTime())) return;

    const msUntilOpen = targetDate.getTime() - Date.now();

    const reopen = () => {
      appConfigService.updateAppConfig({ store_manually_closed: false });
    };

    if (msUntilOpen <= 0) {
      reopen();
      return;
    }

    const timer = setTimeout(reopen, msUntilOpen);
    return () => clearTimeout(timer);
  }, [appConfig.store_manually_closed, appConfig.maintenance_target_date]);

  // Compute ordering status from app config + time-based logic
  const orderingStatus: OrderingStatus = (() => {
    if (appConfig.store_manually_closed) {
      return { isOpen: false, message: "We're currently closed. Check back soon." };
    }
    if (!appConfig.hours_restriction_enabled) {
      return { isOpen: true, message: '' };
    }
    return getOrderingStatusFromConfig(appConfig.store_hours);
  })();
  
  // Load user profile when authenticated
  useEffect(() => {
    if (isAuthenticated && user) {
      loadUserProfile();
    } else {
      setUserProfile(null);
    }
  }, [isAuthenticated, user, loadUserProfile]);

  // Setup real-time order updates
  useEffect(() => {
    if (!isAuthenticated || !user) {
      // Clean up existing subscription
      if (orderChannelRef.current) {
        supabase.removeChannel(orderChannelRef.current);
        orderChannelRef.current = null;
      }
      return;
    }

    // Check if already subscribed
    if ((orderChannelRef.current?.state as any) === 'subscribed') {
      console.log('Already subscribed to order updates');
      return;
    }

    const setupRealtimeSubscription = async () => {
      console.log('Setting up real-time order subscription for user:', user.id);
      
      const channel = supabase.channel(`order:${user.id}`, {
        config: { private: true }
      });
      
      orderChannelRef.current = channel;

      // Set auth before subscribing
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await supabase.realtime.setAuth(session.access_token);
      }

      channel
        .on('broadcast', { event: 'INSERT' }, (payload) => {
          console.log('New order created:', payload);
          showToast('New order placed!', 'success');
          loadUserProfileRef.current();
        })
        .on('broadcast', { event: 'UPDATE' }, (payload) => {
          console.log('Order updated:', payload);
          const order = payload.new as any;
          showToast(`Order status updated to: ${order.status}`, 'info');

          if (order.status === 'ready') {
            console.log('Order is ready! Playing notification sound');
            playOrderReadySound();
          }

          loadUserProfileRef.current();
        })
        .on('broadcast', { event: 'DELETE' }, (payload) => {
          console.log('Order deleted:', payload);
          loadUserProfileRef.current();
        })
        .subscribe((status, err) => {
          console.log('Order subscription status:', status);
          if (err) {
            console.error('Order subscription error:', err);
          }
        });
    };

    setupRealtimeSubscription();

    return () => {
      if (orderChannelRef.current) {
        console.log('Cleaning up order subscription');
        supabase.removeChannel(orderChannelRef.current);
        orderChannelRef.current = null;
      }
    };
  }, [isAuthenticated, user]);

  // Get current colors based on theme settings
  const getCurrentColors = () => {
    const colorSchemes = {
      default: {
        light: {
          background: '#E0F2F1',
          text: '#004D40',
          textSecondary: '#00695C',
          primary: '#00897B',
          secondary: '#26A69A',
          accent: '#4DB6AC',
          card: '#FFFFFF',
          highlight: '#80CBC4',
          border: '#B2DFDB',
        },
        dark: {
          background: '#0A1F1C',
          text: '#E0F2F1',
          textSecondary: '#80CBC4',
          primary: '#26A69A',
          secondary: '#4DB6AC',
          accent: '#80CBC4',
          card: '#1A2F2C',
          highlight: '#4DB6AC',
          border: '#1A2F2C',
        },
      },
      warm: {
        light: {
          background: '#FFF8E1',
          text: '#3E2723',
          textSecondary: '#6D4C41',
          primary: '#00897B',
          secondary: '#26A69A',
          accent: '#4DB6AC',
          card: '#FFFFFF',
          highlight: '#80CBC4',
          border: '#FFE082',
        },
        dark: {
          background: '#1C1410',
          text: '#FAFAFA',
          textSecondary: '#BCAAA4',
          primary: '#26A69A',
          secondary: '#4DB6AC',
          accent: '#80CBC4',
          card: '#2C2018',
          highlight: '#80CBC4',
          border: '#2C2018',
        },
      },
      cool: {
        light: {
          background: '#E3F2FD',
          text: '#0D47A1',
          textSecondary: '#1565C0',
          primary: '#00897B',
          secondary: '#26A69A',
          accent: '#4DB6AC',
          card: '#FFFFFF',
          highlight: '#80CBC4',
          border: '#90CAF9',
        },
        dark: {
          background: '#0A1929',
          text: '#E3F2FD',
          textSecondary: '#90CAF9',
          primary: '#26A69A',
          secondary: '#4DB6AC',
          accent: '#80CBC4',
          card: '#132F4C',
          highlight: '#80CBC4',
          border: '#132F4C',
        },
      },
      vibrant: {
        light: {
          background: '#F3E5F5',
          text: '#4A148C',
          textSecondary: '#6A1B9A',
          primary: '#00897B',
          secondary: '#26A69A',
          accent: '#4DB6AC',
          card: '#FFFFFF',
          highlight: '#80CBC4',
          border: '#CE93D8',
        },
        dark: {
          background: '#1A0A1F',
          text: '#F3E5F5',
          textSecondary: '#CE93D8',
          primary: '#26A69A',
          secondary: '#4DB6AC',
          accent: '#80CBC4',
          card: '#2A1A2F',
          highlight: '#80CBC4',
          border: '#2A1A2F',
        },
      },
      minimal: {
        light: {
          background: '#FAFAFA',
          text: '#212121',
          textSecondary: '#757575',
          primary: '#00897B',
          secondary: '#26A69A',
          accent: '#4DB6AC',
          card: '#FFFFFF',
          highlight: '#80CBC4',
          border: '#E0E0E0',
        },
        dark: {
          background: '#121212',
          text: '#FAFAFA',
          textSecondary: '#B0B0B0',
          primary: '#26A69A',
          secondary: '#4DB6AC',
          accent: '#80CBC4',
          card: '#1E1E1E',
          highlight: '#80CBC4',
          border: '#1E1E1E',
        },
      },
    };

    const effectiveMode = themeSettings.mode === 'auto' ? (systemColorScheme || 'light') : themeSettings.mode;
    return colorSchemes[themeSettings.colorScheme][effectiveMode];
  };

  const currentColors = getCurrentColors();

  const setTabBarVisible = (visible: boolean) => {
    console.log('Setting tab bar visibility:', visible);
    setIsTabBarVisible(visible);
  };

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    console.log('Showing toast:', message, type);
    setToast({
      visible: true,
      message,
      type,
    });
  };

  const hideToast = () => {
    console.log('Hiding toast');
    setToast((prev) => ({
      ...prev,
      visible: false,
    }));
  };

  const addToCart = (item: CartItem) => {
    console.log('Adding to cart:', item.name);
    setCart((prevCart) => {
      const existingItem = prevCart.find((cartItem) => cartItem.id === item.id);
      if (existingItem) {
        showToast(`Updated ${item.name} quantity in cart`, 'success');
        return prevCart.map((cartItem) =>
          cartItem.id === item.id
            ? { ...cartItem, quantity: cartItem.quantity + item.quantity }
            : cartItem
        );
      }
      showToast(`${item.name} added to cart!`, 'success');
      return [...prevCart, item];
    });
  };

  const removeFromCart = (itemId: string) => {
    console.log('Removing from cart:', itemId);
    setCart((prevCart) => prevCart.filter((item) => item.id !== itemId));
  };

  const updateCartQuantity = (itemId: string, quantity: number) => {
    console.log('Updating cart quantity:', itemId, quantity);
    if (quantity <= 0) {
      removeFromCart(itemId);
      return;
    }
    setCart((prevCart) =>
      prevCart.map((item) =>
        item.id === itemId ? { ...item, quantity } : item
      )
    );
  };

  const clearCart = () => {
    console.log('Clearing cart');
    setCart([]);
  };

  const placeOrder = async (deliveryAddress?: string, pickupNotes?: string) => {
    if (!user || !userProfile) {
      showToast('Please sign in to place an order', 'error');
      return;
    }

    try {
      console.log('Placing order');
      const { data, error } = await orderService.placeOrder(
        user.id,
        cart,
        deliveryAddress,
        pickupNotes
      );

      if (error) {
        showToast('Failed to place order', 'error');
        return;
      }

      // Points are updated by the edge function, just reload profile
      showToast('Order placed successfully!', 'success');
      clearCart();
      await loadUserProfile();
    } catch (error) {
      console.error('Error placing order:', error);
      showToast('Failed to place order', 'error');
    }
  };

  const purchaseGiftCard = (giftCard: GiftCard) => {
    console.log('Purchasing gift card:', giftCard);
    // This is for money-based gift cards (not implemented in backend yet)
    showToast('Gift card feature coming soon!', 'info');
  };

  const sendPointsGiftCard = async (recipientId: string, recipientName: string, points: number, message?: string) => {
    if (!user || !userProfile) {
      showToast('Please sign in to send gift cards', 'error');
      return;
    }

    if (userProfile.points < points) {
      showToast('Insufficient points', 'error');
      return;
    }

    try {
      console.log('Sending points gift card:', recipientId, points);
      const { error } = await giftCardService.sendGiftCard(
        user.id,
        recipientId,
        recipientName,
        points,
        message
      );

      if (error) {
        showToast('Failed to send gift card', 'error');
        return;
      }

      showToast(`Sent ${points} points to ${recipientName}!`, 'success');
      await loadUserProfile();
    } catch (error) {
      console.error('Error sending gift card:', error);
      showToast('Failed to send gift card', 'error');
    }
  };

  const receivePointsGiftCard = (senderId: string, senderName: string, points: number, message?: string) => {
    console.log('Receiving points gift card:', senderId, points);
    showToast(`Received ${points} points from ${senderName}!`, 'success');
    loadUserProfile();
  };

  const redeemMerch = async (merchId: string, merchName: string, pointsCost: number, deliveryAddress: string, pickupNotes?: string) => {
    if (!user || !userProfile) {
      showToast('Please sign in to redeem merch', 'error');
      return;
    }

    if (userProfile.points < pointsCost) {
      showToast('Insufficient points', 'error');
      return;
    }

    try {
      console.log('Redeeming merch:', merchId, pointsCost);
      const { error } = await merchService.redeemMerch(
        user.id,
        merchId,
        merchName,
        pointsCost,
        deliveryAddress,
        pickupNotes
      );

      if (error) {
        showToast('Failed to redeem merch', 'error');
        return;
      }

      showToast(`Redeemed ${merchName} for ${pointsCost} points!`, 'success');
      await loadUserProfile();
    } catch (error) {
      console.error('Error redeeming merch:', error);
      showToast('Failed to redeem merch', 'error');
    }
  };

  const addPaymentMethod = async (paymentMethod: PaymentMethod) => {
    if (!user) {
      showToast('Please sign in to add payment methods', 'error');
      return;
    }

    try {
      console.log('Adding payment method');
      const { error } = await paymentMethodService.addPaymentMethod(user.id, paymentMethod);

      if (error) {
        showToast('Failed to add payment method', 'error');
        return;
      }

      showToast('Payment method added successfully!', 'success');
      await loadUserProfile();
    } catch (error) {
      console.error('Error adding payment method:', error);
      showToast('Failed to add payment method', 'error');
    }
  };

  const removePaymentMethod = async (paymentMethodId: string) => {
    try {
      console.log('Removing payment method:', paymentMethodId);
      const { error } = await paymentMethodService.removePaymentMethod(paymentMethodId);

      if (error) {
        showToast('Failed to remove payment method', 'error');
        return;
      }

      showToast('Payment method removed successfully!', 'success');
      await loadUserProfile();
    } catch (error) {
      console.error('Error removing payment method:', error);
      showToast('Failed to remove payment method', 'error');
    }
  };

  const setDefaultPaymentMethod = async (paymentMethodId: string) => {
    if (!user) return;

    try {
      console.log('Setting default payment method:', paymentMethodId);
      const { error } = await paymentMethodService.setDefaultPaymentMethod(user.id, paymentMethodId);

      if (error) {
        showToast('Failed to set default payment method', 'error');
        return;
      }

      showToast('Default payment method updated!', 'success');
      await loadUserProfile();
    } catch (error) {
      console.error('Error setting default payment method:', error);
      showToast('Failed to set default payment method', 'error');
    }
  };

  const updateProfileImage = (imageUri: string) => {
    console.log('Updating profile image');
    if (userProfile) {
      setUserProfile({
        ...userProfile,
        profileImage: imageUri,
      });
    }
  };

  const markNotificationAsRead = async (notificationId: string) => {
    try {
      console.log('Marking notification as read:', notificationId);
      const { error } = await notificationService.markAsRead(notificationId);

      if (error) {
        console.error('Error marking notification as read:', error);
        return;
      }

      await loadUserProfile();
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const addNotification = (notification: AppNotification) => {
    console.log('Adding notification:', notification.title);
    if (userProfile) {
      setUserProfile({
        ...userProfile,
        notifications: [notification, ...userProfile.notifications],
      });
    }
  };

  const updateThemeMode = async (mode: ThemeMode) => {
    console.log('Updating theme mode:', mode);
    
    // Update local state first for immediate UI response
    setThemeSettings((prev) => ({ ...prev, mode }));
    
    // Save to Supabase if user is authenticated
    if (!user?.id) return; // Early return if no user
    
    try {
      const { error } = await themeService.updateThemeSettings(user.id, {
        mode,
        colorScheme: themeSettings.colorScheme, // Use current colorScheme
      });

      if (error) {
        console.error('Error updating theme mode:', error);
        showToast('Failed to save theme settings', 'error');
      }
    } catch (error) {
      console.error('Error updating theme mode:', error);
      showToast('Failed to save theme settings', 'error');
    }
  };

  const updateColorScheme = async (scheme: ColorScheme) => {
    console.log('Updating color scheme:', scheme);
    
    // Update local state first for immediate UI response
    setThemeSettings((prev) => ({ ...prev, colorScheme: scheme }));
    
    // Save to Supabase if user is authenticated
    if (!user?.id) return; // Early return if no user
    
    try {
      const { error } = await themeService.updateThemeSettings(user.id, {
        mode: themeSettings.mode, // Use current mode
        colorScheme: scheme,
      });

      if (error) {
        console.error('Error updating color scheme:', error);
        showToast('Failed to save theme settings', 'error');
      }
    } catch (error) {
      console.error('Error updating color scheme:', error);
      showToast('Failed to save theme settings', 'error');
    }
  };

  const getUnreadNotificationCount = () => {
    if (!userProfile || !userProfile.notifications) {
      return 0;
    }
    return userProfile.notifications.filter(n => !n.read).length;
  };

  return (
    <AppContext.Provider
      value={{
        cart,
        addToCart,
        removeFromCart,
        updateCartQuantity,
        clearCart,
        userProfile,
        loadUserProfile,
        placeOrder,
        purchaseGiftCard,
        sendPointsGiftCard,
        receivePointsGiftCard,
        redeemMerch,
        addPaymentMethod,
        removePaymentMethod,
        setDefaultPaymentMethod,
        updateProfileImage,
        markNotificationAsRead,
        addNotification,
        themeSettings,
        updateThemeMode,
        updateColorScheme,
        currentColors,
        isTabBarVisible,
        setTabBarVisible,
        toast,
        showToast,
        hideToast,
        menuItems,
        setMenuItems,
        loadMenuItems,
        getUnreadNotificationCount,
        orderingStatus,
        appConfig,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
};

export type { CartItem } from '@/types';
