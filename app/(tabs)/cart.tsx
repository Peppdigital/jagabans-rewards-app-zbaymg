import { useApp } from '@/contexts/AppContext';
import { useEffect } from 'react';
import type { CartItem } from '@/contexts/AppContext';
import React, { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  Pressable,
  Platform,
} from 'react-native';
import { IconSymbol } from '@/components/IconSymbol';
import Dialog from '@/components/Dialog';
import { LinearGradient } from 'expo-linear-gradient';
import swallowImage from '@/assets/images/swallow.jpeg';

export default function CartScreen() {
  const { cart, updateCartQuantity, removeFromCart, currentColors, menuItems, addToCart } = useApp();
  const router = useRouter();

  const [dialogVisible, setDialogVisible] = useState(false);
  const [dialogType, setDialogType] = useState<'remove' | 'empty'>('remove');
  const [itemToRemove, setItemToRemove] = useState<string | null>(null);

  const soupCount = cart.filter(item =>
    item.category?.toLowerCase().includes('soup')
  ).length;

  const swallowCount = cart.filter(item =>
    item.category?.toLowerCase().includes('swallow')
  ).length;

  const showSwallowBadge = soupCount > 0 && swallowCount < soupCount;

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const tax = subtotal * 0.0975;
  const total = subtotal + tax;

  const handleQuantityChange = (itemId: string, change: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const item = cart.find((i) => i.id === itemId);
    if (item) {
      updateCartQuantity(itemId, item.quantity + change);
    }
  };

  const handleRemoveItem = (itemId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setItemToRemove(itemId);
    setDialogVisible(true);
  };

  const handleConfirmRemove = () => {
    if (itemToRemove) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      removeFromCart(itemToRemove);
      setItemToRemove(null);
    }
  };

  const handleCheckout = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (cart.length === 0) {
      setDialogType('empty');
      setDialogVisible(true);
      return;
    }
    router.push('/checkout');
  };

  return (
    <LinearGradient
      colors={[currentColors.gradientStart || currentColors.background, currentColors.gradientMid || currentColors.background, currentColors.gradientEnd || currentColors.background]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={styles.gradientContainer}
    >
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.container}>
          <LinearGradient
            colors={[currentColors.headerGradientStart || currentColors.card, currentColors.headerGradientEnd || currentColors.card]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.header, { borderBottomColor: currentColors.border }]}
          >
            <Text style={[styles.headerTitle, { color: currentColors.text }]}>Shopping Cart</Text>
            <Text style={[styles.itemCount, { color: currentColors.textSecondary }]}>
              {cart.length} {cart.length === 1 ? 'item' : 'items'}
            </Text>
          </LinearGradient>

          {cart.length === 0 ? (
            <View style={styles.emptyContainer}>
              <IconSymbol name="cart.fill" size={80} color={currentColors.textSecondary} />
              <Text style={[styles.emptyText, { color: currentColors.text }]}>
                Your cart is empty
              </Text>
              <Text style={[styles.emptySubtext, { color: currentColors.textSecondary }]}>
                Add some delicious items to get started!
              </Text>
              <LinearGradient
                colors={[currentColors.secondary, currentColors.highlight]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.browseButton}
              >
                <Pressable
                  style={styles.browseButtonInner}
                  onPress={() => router.push('/')}
                >
                  <Text style={[styles.browseButtonText, { color: currentColors.background }]}>
                    Browse Menu
                  </Text>
                </Pressable>
              </LinearGradient>
            </View>
          ) : (
            <>
              <ScrollView
                style={styles.cartList}
                contentContainerStyle={styles.cartListContent}
                showsVerticalScrollIndicator={false}
              >
                {cart.map((item) => (
                  <React.Fragment key={item.id}>
                    <View style={{ position: 'relative', marginBottom: 24 }}>
                      <LinearGradient
                        colors={[currentColors.cardGradientStart || currentColors.card, currentColors.cardGradientEnd || currentColors.card]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={[styles.cartItem, { borderColor: currentColors.border, marginBottom: 0 }]}
                      >
                        <View style={[styles.imageContainer, { borderColor: currentColors.border }]}>
                          <Image source={{ uri: item.image }} style={styles.itemImage} />
                        </View>
                        <View style={styles.itemDetails}>
                          <Text style={[styles.itemName, { color: currentColors.text }]}>{item.name}</Text>
                          <Text style={[styles.itemPrice, { color: currentColors.secondary }]}>
                            ${item.price.toFixed(2)}
                          </Text>
                          <View style={styles.quantityContainer}>
                            <Pressable
                              style={[styles.quantityButton, { backgroundColor: currentColors.background, borderColor: currentColors.border }]}
                              onPress={() => handleQuantityChange(item.id, -1)}
                            >
                              <IconSymbol name="minus" size={16} color={currentColors.secondary} />
                            </Pressable>
                            <Text style={[styles.quantity, { color: currentColors.text }]}>{item.quantity}</Text>
                            <Pressable
                              style={[styles.quantityButton, { backgroundColor: currentColors.background, borderColor: currentColors.border }]}
                              onPress={() => handleQuantityChange(item.id, 1)}
                            >
                              <IconSymbol name="plus" size={16} color={currentColors.secondary} />
                            </Pressable>
                          </View>
                        </View>
                        <Pressable
                          style={styles.removeButton}
                          onPress={() => handleRemoveItem(item.id)}
                        >
                          <IconSymbol name="trash" size={20} color={currentColors.textSecondary} />
                        </Pressable>
                      </LinearGradient>

                      {item.category?.toLowerCase().includes('soup') && showSwallowBadge && (
                        <Pressable
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                            router.push({ pathname: '/', params: { category: 'Swallows' } });
                          }}
                          style={{
                            position: 'absolute',
                            bottom: -18,
                            right: 12,
                            zIndex: 10,
                          }}
                        >
                          <View
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 8,
                              paddingHorizontal: 10,
                              paddingVertical: 6,
                              borderRadius: 20,
                              borderWidth: 1,
                              borderColor: 'rgba(255,255,255,0.3)',
                              backgroundColor: 'rgba(0,0,0,0.35)',
                              overflow: 'hidden',
                              elevation: 10,
                            }}
                          >
                            <Image
                              source={swallowImage}
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: 14,
                                borderWidth: 1,
                                borderColor: 'rgba(255,255,255,0.4)',
                              }}
                            />
                            <Text style={{
                              fontFamily: 'Cormorant_600SemiBold',
                              fontSize: 13,
                              color: '#FFFFFF',
                              letterSpacing: 0.3,
                            }}>
                              Add a Swallow
                            </Text>
                            <IconSymbol name="arrow.right" size={11} color="rgba(255,255,255,0.8)" />
                          </View>
                        </Pressable>
                      )}
                    </View>
                  </React.Fragment>
                ))}
              </ScrollView>

              <LinearGradient
                colors={[currentColors.cardGradientStart || currentColors.card, currentColors.cardGradientEnd || currentColors.card]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.summary, { borderTopColor: currentColors.border }]}
              >
                <View style={styles.summaryRow}>
                  <Text style={[styles.summaryLabel, { color: currentColors.textSecondary }]}>Subtotal</Text>
                  <Text style={[styles.summaryValue, { color: currentColors.text }]}>${subtotal.toFixed(2)}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={[styles.summaryLabel, { color: currentColors.textSecondary }]}>Tax (9.75%)</Text>
                  <Text style={[styles.summaryValue, { color: currentColors.text }]}>${tax.toFixed(2)}</Text>
                </View>
                <View style={[styles.summaryRow, styles.totalRow, { borderTopColor: currentColors.border }]}>
                  <Text style={[styles.totalLabel, { color: currentColors.text }]}>Total</Text>
                  <Text style={[styles.totalValue, { color: currentColors.secondary }]}>${total.toFixed(2)}</Text>
                </View>
                <LinearGradient
                  colors={[currentColors.secondary, currentColors.highlight]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.checkoutButton}
                >
                  <Pressable
                    style={styles.checkoutButtonInner}
                    onPress={handleCheckout}
                  >
                    <Text style={[styles.checkoutButtonText, { color: currentColors.background }]}>
                      Proceed to Checkout
                    </Text>
                    <IconSymbol name="arrow.right" size={20} color={currentColors.background} />
                  </Pressable>
                </LinearGradient>
              </LinearGradient>
            </>
          )}
        </View>
        <Dialog
          visible={dialogVisible}
          title={dialogType === 'remove' ? 'Remove Item' : 'Empty Cart'}
          message={
            dialogType === 'remove'
              ? 'Are you sure you want to remove this item from your cart?'
              : 'Please add items to your cart before checking out.'
          }
          buttons={
            dialogType === 'remove'
              ? [
                  { text: 'Cancel', onPress: () => setItemToRemove(null), style: 'cancel' },
                  { text: 'Remove', onPress: handleConfirmRemove, style: 'destructive' },
                ]
              : [
                  { text: 'OK', onPress: () => {}, style: 'default' },
                ]
          }
          onHide={() => {
            setDialogVisible(false);
            setItemToRemove(null);
          }}
          currentColors={currentColors}
        />
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradientContainer: { flex: 1 },
  safeArea: { flex: 1 },
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 24,
    borderBottomWidth: 2,
    boxShadow: '0px 6px 20px rgba(74, 215, 194, 0.3)',
    elevation: 8,
  },
  headerTitle: {
    fontSize: 32,
    fontFamily: 'PlayfairDisplay_700Bold',
    marginBottom: 4,
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  itemCount: { fontSize: 14, fontFamily: 'Cormorant_400Regular' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  emptyText: { fontSize: 24, fontFamily: 'PlayfairDisplay_700Bold', marginTop: 20, marginBottom: 8 },
  emptySubtext: { fontSize: 14, fontFamily: 'Cormorant_400Regular', textAlign: 'center', marginBottom: 24 },
  browseButton: { borderRadius: 0, boxShadow: '0px 8px 24px rgba(212, 175, 55, 0.4)', elevation: 8 },
  browseButtonInner: { paddingHorizontal: 32, paddingVertical: 14 },
  browseButtonText: { fontSize: 16, fontFamily: 'Cormorant_600SemiBold' },
  cartList: { flex: 1 },
  cartListContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20 },
  cartItem: {
    flexDirection: 'row',
    borderRadius: 0,
    padding: 12,
    borderWidth: 2,
    boxShadow: '0px 8px 24px rgba(212, 175, 55, 0.3)',
    elevation: 8,
  },
  imageContainer: { borderRadius: 0, overflow: 'hidden', borderWidth: 2, boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.2)', elevation: 4 },
  itemImage: { width: 80, height: 80, borderRadius: 0 },
  itemDetails: { flex: 1, marginLeft: 12, justifyContent: 'space-between' },
  itemName: { fontSize: 16, fontFamily: 'PlayfairDisplay_700Bold', marginBottom: 4 },
  itemPrice: { fontSize: 16, fontFamily: 'Cormorant_700Bold', marginBottom: 8 },
  quantityContainer: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  quantityButton: { width: 28, height: 28, borderRadius: 0, justifyContent: 'center', alignItems: 'center', borderWidth: 2, boxShadow: '0px 4px 12px rgba(212, 175, 55, 0.25)', elevation: 4 },
  quantity: { fontSize: 16, fontFamily: 'Cormorant_600SemiBold', minWidth: 24, textAlign: 'center' },
  removeButton: { padding: 8 },
  summary: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 120, borderTopWidth: 2, boxShadow: '0px -6px 20px rgba(74, 215, 194, 0.3)', elevation: 10 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  summaryLabel: { fontSize: 14, fontFamily: 'Cormorant_400Regular' },
  summaryValue: { fontSize: 14, fontFamily: 'Cormorant_600SemiBold' },
  totalRow: { marginTop: 8, paddingTop: 12, borderTopWidth: 2 },
  totalLabel: { fontSize: 18, fontFamily: 'PlayfairDisplay_700Bold' },
  totalValue: { fontSize: 20, fontFamily: 'Cormorant_700Bold' },
  checkoutButton: { borderRadius: 0, marginTop: 20, boxShadow: '0px 8px 24px rgba(212, 175, 55, 0.5)', elevation: 10 },
  checkoutButtonInner: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 16, gap: 8 },
  checkoutButtonText: { fontSize: 16, fontFamily: 'Cormorant_700Bold' },
});