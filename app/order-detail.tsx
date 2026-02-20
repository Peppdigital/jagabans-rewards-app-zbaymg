
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import Toast from '@/components/Toast';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import React, { useState, useEffect, useCallback } from 'react';
import Dialog from '@/components/Dialog';
import * as Haptics from 'expo-haptics';
import { useApp } from '@/contexts/AppContext';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase, SUPABASE_URL } from '@/app/integrations/supabase/client';

interface OrderItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

interface Order {
  id: string;
  order_number: number;
  user_id: string;
  total: number;
  points_earned: number;
  status: string;
  payment_status: string;
  delivery_address: string | null;
  pickup_notes: string | null;
  created_at: string;
  updated_at: string;
  cancellation_deadline: string | null;
  order_items: OrderItem[];
}

export default function OrderDetailScreen() {
  const router = useRouter();
  const { orderId } = useLocalSearchParams();
  const { showToast, currentColors, userProfile } = useApp();
  
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [canModify, setCanModify] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showModifyDialog, setShowModifyDialog] = useState(false);
  const [modifyNotes, setModifyNotes] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [modifying, setModifying] = useState(false);

  const loadOrderDetails = useCallback(async () => {
    try {
      setLoading(true);
      
      // TODO: Backend Integration - Call GET /orders/:orderId endpoint
      // For now, fetch from Supabase directly
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          order_items (*)
        `)
        .eq('id', orderId)
        .single();

      if (error) throw error;
      
      setOrder(data as Order);
    } catch (error) {
      console.error('Error loading order:', error);
      showToast('Failed to load order details', 'error');
    } finally {
      setLoading(false);
    }
  }, [orderId, showToast]);

  useEffect(() => {
    loadOrderDetails();
  }, [loadOrderDetails]);

  useEffect(() => {
    if (!order) return;

    const interval = setInterval(() => {
      // CRITICAL FIX: Use cancellation_deadline instead of created_at
      // The cancellation_deadline is set by the webhook when payment succeeds
      // This ensures the 5-minute window starts from payment confirmation, not order creation
      if (order.cancellation_deadline) {
        const deadline = new Date(order.cancellation_deadline).getTime();
        const now = Date.now();
        const remaining = Math.max(0, deadline - now);
        
        setTimeRemaining(remaining);
        setCanModify(
          remaining > 0 && 
          order.payment_status === 'succeeded' &&
          (order.status === 'pending' || order.status === 'preparing')
        );

        if (remaining === 0) {
          clearInterval(interval);
        }
      } else {
        // If no cancellation_deadline is set, the order hasn't been confirmed yet
        // or it's an old order from before this feature was added
        setTimeRemaining(0);
        setCanModify(false);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [order]);

  const handleCancelOrder = async () => {
    try {
      setCancelling(true);
      
      // TODO: Backend Integration - Call POST /orders/:orderId/cancel endpoint
      // This will handle refund logic via Stripe
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(`${SUPABASE_URL}/functions/v1/cancel-order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ orderId }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to cancel order');
      }

      showToast('Order cancelled successfully. Refund will be processed within 5-7 business days.', 'success');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      
      // Reload order to show updated status
      await loadOrderDetails();
      
      setTimeout(() => {
        router.back();
      }, 2000);
    } catch (error: any) {
      console.error('Error cancelling order:', error);
      showToast(error.message || 'Failed to cancel order', 'error');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setCancelling(false);
      setShowCancelDialog(false);
    }
  };

  const handleModifyOrder = async () => {
    if (!modifyNotes.trim()) {
      showToast('Please enter modification details', 'error');
      return;
    }

    try {
      setModifying(true);
      
      // TODO: Backend Integration - Call POST /orders/:orderId/modify endpoint
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(`${SUPABASE_URL}/functions/v1/modify-order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ 
          orderId,
          notes: modifyNotes,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to modify order');
      }

      showToast('Modification request submitted successfully', 'success');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowModifyDialog(false);
      setModifyNotes('');
      
      // Reload order to show updated status
      await loadOrderDetails();
    } catch (error: any) {
      console.error('Error modifying order:', error);
      showToast(error.message || 'Failed to modify order', 'error');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setModifying(false);
    }
  };

  const formatTime = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return currentColors.highlight;
      case 'preparing':
        return currentColors.secondary;
      case 'ready':
        return currentColors.accent;
      case 'completed':
        return currentColors.primary;
      case 'cancelled':
        return '#EF4444';
      default:
        return currentColors.textSecondary;
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: currentColors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={currentColors.primary} />
          <Text style={[styles.loadingText, { color: currentColors.text }]}>Loading order details...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!order) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: currentColors.background }]}>
        <View style={styles.errorContainer}>
          <IconSymbol name="exclamationmark.triangle" 
          // android_material_icon_name="error" 
          size={64} 
          color={currentColors.textSecondary} />
          <Text style={[styles.errorText, { color: currentColors.text }]}>Order not found</Text>
          <Pressable onPress={() => router.back()} style={styles.backToOrdersButton}>
            <Text style={[styles.backToOrdersText, { color: currentColors.primary }]}>Back to Orders</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <LinearGradient
      colors={[currentColors.gradientStart || currentColors.background, currentColors.gradientMid || currentColors.background, currentColors.gradientEnd || currentColors.background]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={styles.gradientContainer}
    >
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.container}>
          {/* Header */}
          <LinearGradient
            colors={[currentColors.headerGradientStart || currentColors.card, currentColors.headerGradientEnd || currentColors.card]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.header, { borderBottomColor: currentColors.border }]}
          >
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.back();
              }}
              style={[styles.backButton, { backgroundColor: currentColors.background, borderColor: currentColors.border }]}
            >
              <IconSymbol 
              name="arrow.left" 
              // android_material_icon_name="arrow-back" 
              size={24} 
              color={currentColors.secondary} />
            </Pressable>
            <Text style={[styles.headerTitle, { color: currentColors.text }]}>Order Details</Text>
            <View style={{ width: 40 }} />
          </LinearGradient>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {/* Timer Card */}
            {canModify && (
              <LinearGradient
                colors={[currentColors.cardGradientStart || currentColors.card, currentColors.cardGradientEnd || currentColors.card]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.timerCard, { borderColor: currentColors.border }]}
              >
                <IconSymbol 
                name="clock" 
                // android_material_icon_name="schedule" 
                size={24} 
                color={currentColors.highlight} />
                <View style={styles.timerContent}>
                  <Text style={[styles.timerTitle, { color: currentColors.text }]}>
                    Time to cancel/modify
                  </Text>
                  <Text style={[styles.timerValue, { color: currentColors.highlight }]}>
                    {formatTime(timeRemaining)}
                  </Text>
                </View>
              </LinearGradient>
            )}

            {/* Order Info Card */}
            <LinearGradient
              colors={[currentColors.cardGradientStart || currentColors.card, currentColors.cardGradientEnd || currentColors.card]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.orderCard, { borderColor: currentColors.border }]}
            >
              <View style={styles.orderRow}>
                <Text style={[styles.orderLabel, { color: currentColors.textSecondary }]}>Order Number</Text>
                <Text style={[styles.orderValue, { color: currentColors.text }]}>#{String(order.id).substring(0, 8).toUpperCase()} - {order.order_number}</Text>
              </View>
              
              <View style={styles.orderRow}>
                <Text style={[styles.orderLabel, { color: currentColors.textSecondary }]}>Status</Text>
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(order.status) }]}>
                  <Text style={[styles.statusText, { color: currentColors.background }]}>
                    {order.status}
                  </Text>
                </View>
              </View>
              
              <View style={styles.orderRow}>
                <Text style={[styles.orderLabel, { color: currentColors.textSecondary }]}>Payment Status</Text>
                <Text style={[styles.orderValue, { color: currentColors.text, textTransform: 'capitalize' }]}>
                  {order.payment_status}
                </Text>
              </View>

              <View style={styles.orderRow}>
                <Text style={[styles.orderLabel, { color: currentColors.textSecondary }]}>Order Date</Text>
                <Text style={[styles.orderValue, { color: currentColors.text }]}>
                  {new Date(order.created_at).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
              </View>

              {order.delivery_address && (
                <View style={styles.orderRow}>
                  <Text style={[styles.orderLabel, { color: currentColors.textSecondary }]}>Delivery Address</Text>
                  <Text style={[styles.orderValue, { color: currentColors.text }]}>
                    {order.delivery_address}
                  </Text>
                </View>
              )}

              {order.pickup_notes && (
                <View style={styles.orderRow}>
                  <Text style={[styles.orderLabel, { color: currentColors.textSecondary }]}>Notes</Text>
                  <Text style={[styles.orderValue, { color: currentColors.text }]}>
                    {order.pickup_notes}
                  </Text>
                </View>
              )}
            </LinearGradient>

            {/* Order Items */}
            <LinearGradient
              colors={[currentColors.cardGradientStart || currentColors.card, currentColors.cardGradientEnd || currentColors.card]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.orderCard, { borderColor: currentColors.border }]}
            >
              <Text style={[styles.sectionTitle, { color: currentColors.text }]}>Order Items</Text>
              {order.order_items.map((item, index) => (
                <View key={item.id} style={styles.itemRow}>
                  <Text style={[styles.itemQuantity, { color: currentColors.textSecondary }]}>
                    {item.quantity}x
                  </Text>
                  <Text style={[styles.itemName, { color: currentColors.text }]}>
                    {item.name}
                  </Text>
                  <Text style={[styles.itemPrice, { color: currentColors.text }]}>
                    ${(item.price * item.quantity).toFixed(2)}
                  </Text>
                </View>
              ))}
              
              <View style={[styles.divider, { backgroundColor: currentColors.border }]} />
              
              <View style={styles.totalRow}>
                <Text style={[styles.totalLabel, { color: currentColors.text }]}>Total</Text>
                <Text style={[styles.totalValue, { color: currentColors.secondary }]}>
                  ${order.total.toFixed(2)}
                </Text>
              </View>

              <View style={styles.pointsRow}>
                <IconSymbol 
                name="star.fill" 
                // android_material_icon_name="star" 
                size={16} 
                color={currentColors.highlight} />
                <Text style={[styles.pointsText, { color: currentColors.text }]}>
                  +{order.points_earned} points earned
                </Text>
              </View>
            </LinearGradient>

            {/* Action Buttons */}
            {canModify && (
              <View style={styles.actionButtons}>
                <LinearGradient
                  colors={[currentColors.primary, currentColors.secondary]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.button}
                >
                  <Pressable
                    style={styles.buttonInner}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      setShowModifyDialog(true);
                    }}
                    disabled={modifying}
                  >
                    <IconSymbol 
                    name="pencil" 
                    // android_material_icon_name="edit" 
                    size={20} 
                    color={currentColors.background} />
                    <Text style={[styles.buttonText, { color: currentColors.background }]}>
                      Modify Order
                    </Text>
                  </Pressable>
                </LinearGradient>

                <LinearGradient
                  colors={['#EF4444', '#DC2626']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.button}
                >
                  <Pressable
                    style={styles.buttonInner}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      setShowCancelDialog(true);
                    }}
                    disabled={cancelling}
                  >
                    <IconSymbol 
                    name="xmark.circle" 
                    // android_material_icon_name="cancel" 
                    size={20} 
                    color="#FFF" />
                    <Text style={[styles.buttonText, { color: '#FFF' }]}>
                      Cancel Order
                    </Text>
                  </Pressable>
                </LinearGradient>
              </View>
            )}

            {!canModify && order.status !== 'cancelled' && order.payment_status === 'succeeded' && (
              <LinearGradient
                colors={[currentColors.cardGradientStart || currentColors.card, currentColors.cardGradientEnd || currentColors.card]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.infoCard, { borderColor: currentColors.border }]}
              >
                <IconSymbol 
                name="info.circle" 
                // android_material_icon_name="info" 
                size={20} 
                color={currentColors.primary} />
                <Text style={[styles.infoText, { color: currentColors.text }]}>
                  The 5-minute modification window has expired. Please contact support for any changes.
                </Text>
              </LinearGradient>
            )}
          </ScrollView>
        </View>

        {/* Cancel Dialog */}
        <Dialog
          visible={showCancelDialog}
          title="Cancel Order"
          message="Are you sure you want to cancel this order? A full refund will be processed to your original payment method within 5-7 business days."
          buttons={[
            {
              text: 'No, Keep Order',
              onPress: () => setShowCancelDialog(false),
              style: 'cancel',
            },
            {
              text: cancelling ? 'Cancelling...' : 'Yes, Cancel Order',
              onPress: handleCancelOrder,
              style: 'destructive',
            },
          ]}
          onHide={() => setShowCancelDialog(false)}
        />

        {/* Modify Dialog */}
        <Dialog
          visible={showModifyDialog}
          title="Modify Order"
          message="Please describe the changes you'd like to make to your order:"
          buttons={[
            {
              text: 'Cancel',
              onPress: () => {
                setShowModifyDialog(false);
                setModifyNotes('');
              },
              style: 'cancel',
            },
            {
              text: modifying ? 'Submitting...' : 'Submit Request',
              onPress: handleModifyOrder,
              style: 'default',
            },
          ]}
          onHide={() => {
            setShowModifyDialog(false);
            setModifyNotes('');
          }}
        >
          <TextInput
            style={[styles.input, { 
              backgroundColor: currentColors.background,
              color: currentColors.text,
              borderColor: currentColors.border,
            }]}
            placeholder="e.g., Add extra sauce, change delivery address, remove an item..."
            placeholderTextColor={currentColors.textSecondary}
            value={modifyNotes}
            onChangeText={setModifyNotes}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </Dialog>

        <Toast />
      </SafeAreaView>
    </LinearGradient>
  );
}

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
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    padding: 40,
  },
  errorText: {
    fontSize: 20,
    fontFamily: 'PlayfairDisplay_700Bold',
    textAlign: 'center',
  },
  backToOrdersButton: {
    marginTop: 16,
    padding: 12,
  },
  backToOrdersText: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 2,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 0,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
  },
  headerTitle: {
    fontSize: 24,
    fontFamily: 'PlayfairDisplay_700Bold',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  timerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 0,
    marginBottom: 16,
    gap: 12,
    borderWidth: 2,
  },
  timerContent: {
    flex: 1,
  },
  timerTitle: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    marginBottom: 4,
  },
  timerValue: {
    fontSize: 24,
    fontFamily: 'Inter_700Bold',
  },
  orderCard: {
    padding: 20,
    borderRadius: 0,
    marginBottom: 16,
    borderWidth: 2,
  },
  orderRow: {
    marginBottom: 16,
  },
  orderLabel: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    marginBottom: 4,
  },
  orderValue: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    alignSelf: 'flex-start',
  },
  statusText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    textTransform: 'capitalize',
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'PlayfairDisplay_700Bold',
    marginBottom: 16,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  itemQuantity: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    width: 40,
  },
  itemName: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  itemPrice: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  divider: {
    height: 2,
    marginVertical: 16,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  totalLabel: {
    fontSize: 18,
    fontFamily: 'PlayfairDisplay_700Bold',
  },
  totalValue: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
  },
  pointsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pointsText: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  actionButtons: {
    gap: 12,
    marginBottom: 20,
  },
  button: {
    borderRadius: 0,
  },
  buttonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 8,
  },
  buttonText: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
  },
  infoCard: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 0,
    gap: 12,
    borderWidth: 2,
    marginBottom: 20,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    lineHeight: 20,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
    minHeight: 100,
    textAlignVertical: 'top',
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
});
