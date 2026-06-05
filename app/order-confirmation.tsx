
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { useApp } from '@/contexts/AppContext';
import { IconSymbol } from '@/components/IconSymbol';
import * as Haptics from 'expo-haptics';
import { supabase } from '@/app/integrations/supabase/client';
import { LinearGradient } from 'expo-linear-gradient';

interface OrderItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

interface OrderDetails {
  id: string;
  subtotal: number;
  discount: number;
  tax: number;
  delivery_fee: number;
  total: number;
  points_earned: number;
  status: string;
  payment_status: string;
  delivery_address: string | null;
  pickup_notes: string | null;
  created_at: string;
  order_items: OrderItem[];
}

export default function OrderConfirmationScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ orderId?: string | string[] }>();
  const orderId = useMemo(
    () => (Array.isArray(params.orderId) ? params.orderId[0] : params.orderId),
    [params.orderId]
  );
  const { currentColors, setTabBarVisible } = useApp();

  const [order, setOrder] = useState<OrderDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTabBarVisible(false);
    return () => setTabBarVisible(true);
  }, [setTabBarVisible]);

  const fetchOrderDetails = useCallback(async () => {
    if (!orderId) {
      setError('No order ID provided');
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('orders')
        .select(`
          id,
          subtotal,
          discount,
          tax,
          delivery_fee,
          total,
          points_earned,
          status,
          payment_status,
          delivery_address,
          pickup_notes,
          created_at,
          order_items (
            id,
            name,
            price,
            quantity
          )
        `)
        .eq('id', orderId)
        .single();

      if (fetchError) {
        console.error('Error fetching order:', fetchError);
        throw new Error('Failed to load order details');
      }

      if (!data) {
        throw new Error('Order not found');
      }

      setOrder(data as OrderDetails);
    } catch (err) {
      console.error('Error in fetchOrderDetails:', err);
      setError(err instanceof Error ? err.message : 'Failed to load order');
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    fetchOrderDetails();
  }, [fetchOrderDetails]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'succeeded':
        return '#10B981';
      case 'processing':
        return currentColors.highlight;
      case 'pending':
        return currentColors.secondary;
      case 'failed':
        return '#EF4444';
      default:
        return currentColors.textSecondary;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'succeeded':
        return 'checkmark.circle.fill';
      case 'processing':
        return 'hourglass';
      case 'pending':
        return 'clock.fill';
      case 'failed':
        return 'xmark.circle.fill';
      default:
        return 'info.circle.fill';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'succeeded':
        return 'Payment Successful';
      case 'processing':
        return 'Processing Payment';
      case 'pending':
        return 'Payment Pending';
      case 'failed':
        return 'Payment Failed';
      default:
        return 'Unknown Status';
    }
  };

  const getOrderStatusText = (status: string) => {
    switch (status) {
      case 'pending':
        return 'Order Received';
      case 'preparing':
        return 'Preparing Your Order';
      case 'ready':
        return 'Order Ready';
      case 'completed':
        return 'Order Completed';
      case 'cancelled':
        return 'Order Cancelled';
      default:
        return status;
    }
  };

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
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    loadingText: {
      marginTop: 16,
      fontSize: 16,
      fontFamily: 'Inter_400Regular',
      color: currentColors.textSecondary,
    },
    errorContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    errorIcon: {
      marginBottom: 16,
    },
    errorTitle: {
      fontSize: 24,
      fontFamily: 'PlayfairDisplay_700Bold',
      color: currentColors.text,
      marginBottom: 8,
      letterSpacing: 0.5,
    },
    errorText: {
      fontSize: 16,
      fontFamily: 'Inter_400Regular',
      color: currentColors.textSecondary,
      textAlign: 'center',
      marginBottom: 24,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      padding: 20,
      paddingBottom: 40,
    },
    successHeader: {
      alignItems: 'center',
      marginBottom: 32,
      paddingTop: 20,
    },
    successIconContainer: {
      width: 100,
      height: 100,
      borderRadius: 0,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 20,
      boxShadow: '0px 8px 24px rgba(212, 175, 55, 0.4)',
      elevation: 8,
      borderWidth: 2,
      borderColor: currentColors.border,
    },
    successTitle: {
      fontSize: 32,
      fontFamily: 'PlayfairDisplay_700Bold',
      color: currentColors.text,
      marginBottom: 8,
      textAlign: 'center',
      letterSpacing: 0.5,
      textShadowColor: 'rgba(0, 0, 0, 0.3)',
      textShadowOffset: { width: 0, height: 2 },
      textShadowRadius: 4,
    },
    successSubtitle: {
      fontSize: 16,
      fontFamily: 'Inter_400Regular',
      color: currentColors.textSecondary,
      textAlign: 'center',
      lineHeight: 24,
    },
    statusCard: {
      borderRadius: 0,
      padding: 20,
      marginBottom: 20,
      boxShadow: '0px 8px 24px rgba(212, 175, 55, 0.3)',
      elevation: 8,
      borderWidth: 2,
      borderColor: currentColors.border,
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    statusInfo: {
      flex: 1,
    },
    statusLabel: {
      fontSize: 14,
      fontFamily: 'Inter_400Regular',
      color: currentColors.textSecondary,
      marginBottom: 4,
    },
    statusValue: {
      fontSize: 18,
      fontFamily: 'Inter_700Bold',
      color: currentColors.text,
    },
    pointsCard: {
      borderRadius: 0,
      padding: 20,
      marginBottom: 20,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
      boxShadow: '0px 8px 24px rgba(229, 193, 88, 0.4)',
      elevation: 8,
      borderWidth: 2,
      borderColor: currentColors.border,
    },
    pointsIconContainer: {
      width: 60,
      height: 60,
      borderRadius: 0,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 2,
      borderColor: currentColors.border,
    },
    pointsInfo: {
      flex: 1,
    },
    pointsTitle: {
      fontSize: 16,
      fontFamily: 'Inter_600SemiBold',
      color: currentColors.text,
      marginBottom: 4,
    },
    pointsValue: {
      fontSize: 24,
      fontFamily: 'Inter_700Bold',
      color: currentColors.secondary,
    },
    sectionTitle: {
      fontSize: 20,
      fontFamily: 'PlayfairDisplay_700Bold',
      color: currentColors.text,
      marginBottom: 16,
      letterSpacing: 0.5,
    },
    orderSummaryCard: {
      borderRadius: 0,
      padding: 20,
      marginBottom: 20,
      boxShadow: '0px 8px 24px rgba(212, 175, 55, 0.3)',
      elevation: 8,
      borderWidth: 2,
      borderColor: currentColors.border,
    },
    orderItem: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
      paddingBottom: 12,
      borderBottomWidth: 2,
      borderBottomColor: currentColors.border,
    },
    orderItemLast: {
      borderBottomWidth: 0,
      marginBottom: 0,
      paddingBottom: 0,
    },
    itemQuantity: {
      fontSize: 16,
      fontFamily: 'Inter_600SemiBold',
      color: currentColors.textSecondary,
      width: 40,
    },
    itemName: {
      flex: 1,
      fontSize: 16,
      fontFamily: 'Inter_400Regular',
      color: currentColors.text,
    },
    itemPrice: {
      fontSize: 16,
      fontFamily: 'Inter_600SemiBold',
      color: currentColors.text,
    },
    summaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 6,
    },
    summaryLabel: {
      fontSize: 14,
      fontFamily: 'Inter_400Regular',
      color: currentColors.textSecondary,
    },
    summaryValue: {
      fontSize: 14,
      fontFamily: 'Inter_400Regular',
      color: currentColors.textSecondary,
    },
    totalRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 8,
      paddingTop: 12,
      borderTopWidth: 2,
      borderTopColor: currentColors.border,
    },
    totalLabel: {
      fontSize: 18,
      fontFamily: 'PlayfairDisplay_700Bold',
      color: currentColors.text,
    },
    totalValue: {
      fontSize: 24,
      fontFamily: 'Inter_700Bold',
      color: currentColors.secondary,
    },
    deliveryCard: {
      borderRadius: 0,
      padding: 20,
      marginBottom: 20,
      boxShadow: '0px 8px 24px rgba(212, 175, 55, 0.3)',
      elevation: 8,
      borderWidth: 2,
      borderColor: currentColors.border,
    },
    deliveryTitle: {
      fontSize: 16,
      fontFamily: 'Inter_600SemiBold',
      color: currentColors.text,
      marginBottom: 8,
    },
    deliveryText: {
      fontSize: 14,
      fontFamily: 'Inter_400Regular',
      color: currentColors.textSecondary,
      lineHeight: 20,
    },
    orderIdCard: {
      borderRadius: 0,
      padding: 16,
      marginBottom: 20,
      backgroundColor: currentColors.background,
      borderWidth: 2,
      borderColor: currentColors.border,
      boxShadow: '0px 4px 12px rgba(212, 175, 55, 0.25)',
      elevation: 4,
    },
    orderIdLabel: {
      fontSize: 12,
      fontFamily: 'Inter_400Regular',
      color: currentColors.textSecondary,
      marginBottom: 4,
      textAlign: 'center',
    },
    orderIdValue: {
      fontSize: 16,
      color: currentColors.text,
      textAlign: 'center',
      fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    },
    buttonContainer: {
      gap: 12,
      marginTop: 20,  
    },
    primaryButton: {
      borderRadius: 0,
      boxShadow: '0px 8px 24px rgba(212, 175, 55, 0.5)',
      elevation: 10,
    },
    primaryButtonInner: {
      paddingVertical: 16,
      alignItems: 'center',
    },
    primaryButtonText: {
      fontSize: 18,
      fontFamily: 'Inter_700Bold',
      color: currentColors.background,
    },
    secondaryButton: {
      borderRadius: 0,
      paddingVertical: 16,
      alignItems: 'center',
      borderWidth: 2,
      borderColor: currentColors.border,
      boxShadow: '0px 4px 12px rgba(212, 175, 55, 0.25)',
      elevation: 4,
    },
    secondaryButtonInner: {
      paddingVertical: 16,
      alignItems: 'center',
    },
    secondaryButtonText: {
      fontSize: 18,
      fontFamily: 'Inter_700Bold',
      color: currentColors.secondary,
    },
  });

  if (loading) {
    return (
      <LinearGradient
        colors={[currentColors.gradientStart || currentColors.background, currentColors.gradientMid || currentColors.background, currentColors.gradientEnd || currentColors.background]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.gradientContainer}
      >
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={currentColors.secondary} />
            <Text style={styles.loadingText}>Loading order details...</Text>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  if (error || !order) {
    return (
      <LinearGradient
        colors={[currentColors.gradientStart || currentColors.background, currentColors.gradientMid || currentColors.background, currentColors.gradientEnd || currentColors.background]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.gradientContainer}
      >
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
          <View style={styles.errorContainer}>
            <IconSymbol
              name="exclamationmark.triangle.fill"
              size={64}
              color={currentColors.secondary}
              style={styles.errorIcon}
            />
            <Text style={styles.errorTitle}>Unable to Load Order</Text>
            <Text style={styles.errorText}>
              {error || 'We couldn&apos;t find your order details. Please try again.'}
            </Text>
            <LinearGradient
              colors={[currentColors.secondary, currentColors.highlight]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.primaryButton}
            >
              <Pressable
                style={styles.primaryButtonInner}
                onPress={() => {
                  if (Platform.OS !== 'web') {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }
                  router.replace('/(tabs)/(home)');
                }}
              >
                <Text style={styles.primaryButtonText}>Go to Home</Text>
              </Pressable>
            </LinearGradient>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  const isDelivery = !!order.delivery_address;
  const paymentSuccessful = order.payment_status === 'succeeded';

  return (
    <LinearGradient
      colors={[currentColors.gradientStart || currentColors.background, currentColors.gradientMid || currentColors.background, currentColors.gradientEnd || currentColors.background]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={styles.gradientContainer}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Success Header */}
          <View style={styles.successHeader}>
            <LinearGradient
              colors={[currentColors.secondary, currentColors.highlight]}
              style={styles.successIconContainer}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <IconSymbol
                name={getStatusIcon(order.payment_status)}
                size={50}
                color={currentColors.background}
              />
            </LinearGradient>
            <Text style={styles.successTitle}>
              {paymentSuccessful ? 'Order Confirmed!' : getStatusText(order.payment_status)}
            </Text>
            <Text style={styles.successSubtitle}>
              {paymentSuccessful
                ? `Your ${isDelivery ? 'delivery' : 'pickup'} order has been confirmed and is being prepared.`
                : 'We&apos;re processing your order. You&apos;ll receive a notification once it&apos;s confirmed.'}
            </Text>
          </View>

          {/* Order ID */}
          <View style={styles.orderIdCard}>
            <Text style={styles.orderIdLabel}>Order ID</Text>
            <Text style={styles.orderIdValue}>{order.id.substring(0, 8).toUpperCase()}</Text>
          </View>

          {/* Payment Status */}
          <LinearGradient
            colors={[currentColors.cardGradientStart || currentColors.card, currentColors.cardGradientEnd || currentColors.card]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.statusCard}
          >
            <View style={styles.statusRow}>
              <IconSymbol
                name={getStatusIcon(order.payment_status)}
                size={32}
                color={getStatusColor(order.payment_status)}
              />
              <View style={styles.statusInfo}>
                <Text style={styles.statusLabel}>Payment Status</Text>
                <Text style={[styles.statusValue, { color: getStatusColor(order.payment_status) }]}>
                  {getStatusText(order.payment_status)}
                </Text>
              </View>
            </View>
          </LinearGradient>

          {/* Order Status */}
          <LinearGradient
            colors={[currentColors.cardGradientStart || currentColors.card, currentColors.cardGradientEnd || currentColors.card]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.statusCard}
          >
            <View style={styles.statusRow}>
              <IconSymbol
                name="bag.fill"
                size={32}
                color={currentColors.primary}
              />
              <View style={styles.statusInfo}>
                <Text style={styles.statusLabel}>Order Status</Text>
                <Text style={styles.statusValue}>
                  {getOrderStatusText(order.status)}
                </Text>
              </View>
            </View>
          </LinearGradient>

          {/* Points Earned */}
          {paymentSuccessful && order.points_earned > 0 && (
            <LinearGradient
              colors={[currentColors.cardGradientStart || currentColors.card, currentColors.cardGradientEnd || currentColors.card]}
              style={styles.pointsCard}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <LinearGradient
                colors={[currentColors.secondary, currentColors.highlight]}
                style={styles.pointsIconContainer}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <IconSymbol name="star.fill" size={32} color={currentColors.background} />
              </LinearGradient>
              <View style={styles.pointsInfo}>
                <Text style={styles.pointsTitle}>Points Earned</Text>
                <Text style={styles.pointsValue}>+{order.points_earned} points</Text>
              </View>
            </LinearGradient>
          )}

          {/* Order Summary */}
          <Text style={styles.sectionTitle}>Order Summary</Text>
          <LinearGradient
            colors={[currentColors.cardGradientStart || currentColors.card, currentColors.cardGradientEnd || currentColors.card]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.orderSummaryCard}
          >
            {order.order_items.map((item, index) => (
              <View
                key={item.id}
                style={[
                  styles.orderItem,
                  index === order.order_items.length - 1 && styles.orderItemLast,
                ]}
              >
                <Text style={styles.itemQuantity}>{item.quantity}x</Text>
                <Text style={styles.itemName}>{item.name}</Text>
                <Text style={styles.itemPrice}>
                  ${(item.price * item.quantity).toFixed(2)}
                </Text>
              </View>
            ))}
            <View style={{ marginTop: 12, borderTopWidth: 2, borderTopColor: currentColors.border, paddingTop: 12 }}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Subtotal</Text>
                <Text style={styles.summaryValue}>${order.subtotal.toFixed(2)}</Text>
              </View>
              {order.discount > 0 && (
                <View style={styles.summaryRow}>
                  <Text style={[styles.summaryLabel, { color: '#10B981' }]}>Discount</Text>
                  <Text style={[styles.summaryValue, { color: '#10B981' }]}>−${order.discount.toFixed(2)}</Text>
                </View>
              )}
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Tax</Text>
                <Text style={styles.summaryValue}>${order.tax.toFixed(2)}</Text>
              </View>
              {order.delivery_fee > 0 && (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Delivery Fee</Text>
                  <Text style={styles.summaryValue}>${order.delivery_fee.toFixed(2)}</Text>
                </View>
              )}
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>${order.total.toFixed(2)}</Text>
            </View>
          </LinearGradient>

          {/* Delivery/Pickup Information */}
          {isDelivery ? (
            <LinearGradient
              colors={[currentColors.cardGradientStart || currentColors.card, currentColors.cardGradientEnd || currentColors.card]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.deliveryCard}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <IconSymbol name="location.fill" size={20} color={currentColors.secondary} />
                <Text style={styles.deliveryTitle}>Delivery Address</Text>
              </View>
              <Text style={styles.deliveryText}>{order.delivery_address}</Text>
            </LinearGradient>
          ) : order.pickup_notes ? (
            <LinearGradient
              colors={[currentColors.cardGradientStart || currentColors.card, currentColors.cardGradientEnd || currentColors.card]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.deliveryCard}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <IconSymbol name="bag.fill" size={20} color={currentColors.secondary} />
                <Text style={styles.deliveryTitle}>Pickup Notes</Text>
              </View>
              <Text style={styles.deliveryText}>{order.pickup_notes}</Text>
            </LinearGradient>
          ) : null}

          {/* Action Buttons */}
          <View style={styles.buttonContainer}>
            <LinearGradient
              colors={[currentColors.secondary, currentColors.highlight]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.primaryButton}
            >
              <Pressable
                style={styles.primaryButtonInner}
                onPress={() => {
                  if (Platform.OS !== 'web') {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }
                  router.replace('/order-history');
                }}
              >
                <Text style={styles.primaryButtonText}>View Order History</Text>
              </Pressable>
            </LinearGradient>

            <LinearGradient
              colors={[currentColors.cardGradientStart || currentColors.card, currentColors.cardGradientEnd || currentColors.card]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.secondaryButton}
            >
              <Pressable
                style={styles.secondaryButtonInner}
                onPress={() => {
                  if (Platform.OS !== 'web') {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }
                  router.replace('/(tabs)/(home)');
                }}
              >
                <Text style={styles.secondaryButtonText}>Back to Home</Text>
              </Pressable>
            </LinearGradient>
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}
