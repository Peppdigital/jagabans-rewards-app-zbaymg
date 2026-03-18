import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  Pressable,
  ScrollView,
  Animated,
  Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useApp } from "@/contexts/AppContext";
import { IconSymbol } from "@/components/IconSymbol";
import * as Haptics from "expo-haptics";
import { MenuItem } from "@/types";
import { isLosAngelesMonday } from "@/utils/mondayBlock";

export default function ItemDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { addToCart, currentColors, menuItems } = useApp();
  const [quantity, setQuantity] = useState(1);
  const [item, setItem] = useState<MenuItem | null>(null);
  const [lastAddedQuantity, setLastAddedQuantity] = useState(1);

  // Monday ordering block
  const isMonday = isLosAngelesMonday();

  // Notification state
  const [showNotification, setShowNotification] = useState(false);
  // Use useRef to maintain the same Animated.Value instances
  const notificationOpacity = useRef(new Animated.Value(0)).current;
  const notificationTranslateY = useRef(new Animated.Value(-100)).current;

  // Convert name to string for comparison
  const itemId = Array.isArray(id) ? id[0] : id;

  // Find item when menuItems changes or component mounts
  useEffect(() => {
    if (menuItems && menuItems.length > 0 && itemId) {
      console.log("Looking for item id:", itemId);
      console.log(
        "Available item ids:",
        menuItems.map((i) => i.id)
      );

      const foundItem = menuItems.find((i) => String(i.id) === String(itemId));
      console.log("Item found:", !!foundItem);
      setItem(foundItem || null);
    }
  }, [menuItems, itemId]);

  const showNotificationToast = (addedQuantity: number) => {
    setShowNotification(true);

    // Animate in
    Animated.parallel([
      Animated.timing(notificationOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.spring(notificationTranslateY, {
        toValue: 0,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
    ]).start();

    // Animate out after 3 seconds
    setTimeout(() => {
      Animated.parallel([
        Animated.timing(notificationOpacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(notificationTranslateY, {
          toValue: -100,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setShowNotification(false);
        notificationTranslateY.setValue(-100);
      });
    }, 3000);

    // Save the last added quantity to display correctly
    setLastAddedQuantity(addedQuantity);
  };

  // Show loading state while menu items are being fetched
  if (!menuItems || menuItems.length === 0) {
    return (
      <SafeAreaView
        style={[styles.safeArea, { backgroundColor: currentColors.background }]}
      >
        <View style={styles.header}>
          <Pressable
            style={styles.backButton}
            onPress={() => {
              console.log("Back button pressed");
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}
          >
            <IconSymbol
              name="chevron.left"
              size={24}
              color={currentColors.text}
            />
            <Text
              style={[styles.backButtonText, { color: currentColors.text }]}
            >
              Back
            </Text>
          </Pressable>
        </View>
        <View style={styles.errorContainer}>
          <Text
            style={[styles.errorText, { color: currentColors.textSecondary }]}
          >
            Loading menu items...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!item) {
    return (
      <SafeAreaView
        style={[styles.safeArea, { backgroundColor: currentColors.background }]}
      >
        <View style={styles.header}>
          <Pressable
            style={styles.backButton}
            onPress={() => {
              console.log("Back button pressed");
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}
          >
            <IconSymbol
              name="chevron.left"
              size={24}
              color={currentColors.text}
            />
            <Text
              style={[styles.backButtonText, { color: currentColors.text }]}
            >
              Back
            </Text>
          </Pressable>
        </View>
        <View style={styles.errorContainer}>
          <Text
            style={[styles.errorText, { color: currentColors.textSecondary }]}
          >
            Item not found
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const handleQuantityChange = (change: number) => {
    console.log("Quantity change:", change);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newQuantity = quantity + change;
    if (newQuantity >= 1) {
      setQuantity(newQuantity);
    }
  };

  const handleAddToCart = () => {
    if (isMonday) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      // Reuse the toast to show the Monday closure message
      setLastAddedQuantity(0); // signals "closed" state — not used for display here
      setShowNotification(true);
      Animated.parallel([
        Animated.timing(notificationOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.spring(notificationTranslateY, {
          toValue: 0,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }),
      ]).start();
      setTimeout(() => {
        Animated.parallel([
          Animated.timing(notificationOpacity, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(notificationTranslateY, {
            toValue: -100,
            duration: 300,
            useNativeDriver: true,
          }),
        ]).start(() => {
          setShowNotification(false);
          notificationTranslateY.setValue(-100);
        });
      }, 3000);
      return;
    }

    const addedQuantity = quantity;
    console.log("Adding to cart:", item.name, addedQuantity);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    addToCart({ ...item, quantity: addedQuantity });
    showNotificationToast(addedQuantity);
    setQuantity(1);
  };

  const handleBackPress = () => {
    console.log("Back button pressed");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  // Derived: item is orderable only when available AND not Monday
  const canOrder = item.available && !isMonday;

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: currentColors.background }]}
      edges={["bottom"]}
    >
      <View
        style={[
          styles.header,
          {
            backgroundColor: currentColors.background,
            borderBottomColor: currentColors.border,
          },
        ]}
      >
        <Pressable style={styles.backButton} onPress={handleBackPress}>
          <IconSymbol
            name="chevron.left"
            size={24}
            color={currentColors.secondary}
          />
          <Text style={[styles.backButtonText, { color: currentColors.text }]}>
            Back
          </Text>
        </Pressable>
      </View>

      {/* Notification Toast */}
      {showNotification && (
        <Animated.View
          style={[
            styles.notification,
            {
              backgroundColor: isMonday ? '#8B0000' : currentColors.secondary,
              opacity: notificationOpacity,
              transform: [{ translateY: notificationTranslateY }],
            },
          ]}
        >
          <View style={styles.notificationContent}>
            <View
              style={[
                styles.notificationIcon,
                { backgroundColor: isMonday ? '#FFE4E4' : currentColors.background },
              ]}
            >
              <IconSymbol
                name={isMonday
                  ? (Platform.OS === 'ios' ? "moon.fill" : "nightlight")
                  : "checkmark.circle.fill"}
                size={24}
                color={isMonday ? '#8B0000' : currentColors.secondary}
              />
            </View>
            <View style={styles.notificationText}>
              <Text
                style={[
                  styles.notificationTitle,
                  { color: '#FFFFFF' },
                ]}
              >
                {isMonday ? "We're Closed Today" : "Added to Cart!"}
              </Text>
              <Text
                style={[
                  styles.notificationSubtitle,
                  { color: '#FFFFFF' },
                ]}
              >
                {isMonday
                  ? "Online ordering is unavailable on Mondays."
                  : `${lastAddedQuantity} ${item.name}`}
              </Text>
            </View>
          </View>
        </Animated.View>
      )}

      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        <View style={[styles.imageWrapper, { borderColor: currentColors.border }]}>
          <Image
            source={{ uri: item.image }}
            style={styles.image}
          />
          <View style={styles.imageOverlay} />
        </View>

        <View style={styles.content}>
          <View style={styles.headerInfo}>
            <View style={styles.headerLeft}>
              <Text style={[styles.name, { color: currentColors.text }]}>
                {item.name}
              </Text>
              <View style={styles.badgesContainer}>
                {!item.available && (
                  <View style={[styles.badge, styles.unavailableBadge]}>
                    <IconSymbol name="xmark.circle.fill" size={14} color="#FFFFFF" />
                    <Text style={styles.badgeText}>Unavailable</Text>
                  </View>
                )}
                {isMonday && (
                  <View style={[styles.badge, styles.mondayBadge]}>
                    <IconSymbol
                      name={Platform.OS === 'ios' ? "moon.fill" : "nightlight"}
                      size={14}
                      color="#FFFFFF"
                    />
                    <Text style={styles.badgeText}>Closed Mondays</Text>
                  </View>
                )}
                {item.popular && (
                  <View
                    style={[
                      styles.badge,
                      styles.popularBadge,
                      { backgroundColor: currentColors.secondary },
                    ]}
                  >
                    <IconSymbol
                      name="star.fill"
                      size={14}
                      color={currentColors.background}
                    />
                    <Text
                      style={[styles.badgeText, { color: currentColors.background }]}
                    >
                      Popular
                    </Text>
                  </View>
                )}
              </View>
            </View>
            <Text style={[styles.price, { color: currentColors.secondary }]}>
              ${item.price.toFixed(2)}
            </Text>
          </View>

          <View style={styles.categoryContainer}>
            <IconSymbol
              name="label"
              size={16}
              color={currentColors.textSecondary}
            />
            <Text
              style={[styles.category, { color: currentColors.textSecondary }]}
            >
              {item.category}
            </Text>
          </View>

          <Text style={[styles.description, { color: currentColors.textSecondary }]}>
            {item.description}
          </Text>

          {!item.available && (
            <View style={[styles.unavailableNotice, { backgroundColor: "#FF6B6B", borderColor: "#E63946" }]}>
              <IconSymbol name="exclamationmark.circle.fill" size={20} color="#FFFFFF" />
              <Text style={styles.unavailableNoticeText}>
                This item is currently unavailable
              </Text>
            </View>
          )}

          {isMonday && item.available && (
            <View style={styles.mondayNotice}>
              <IconSymbol
                name={Platform.OS === 'ios' ? "moon.fill" : "nightlight"}
                size={20}
                color="#FFFFFF"
              />
              <Text style={styles.mondayNoticeText}>
                We're closed on Mondays. Come back Tuesday!
              </Text>
            </View>
          )}

          {canOrder && (
            <View
              style={[styles.infoCard, { backgroundColor: currentColors.card, borderColor: currentColors.border }]}
            >
              <IconSymbol
                name="star.fill"
                size={20}
                color={currentColors.secondary}
              />
              <Text style={[styles.infoText, { color: currentColors.text }]}>
                Earn {Math.floor(item.price * quantity)} points with this order!
              </Text>
            </View>
          )}

          {canOrder && (
            <View
              style={[
                styles.quantitySection,
                { backgroundColor: currentColors.card, borderColor: currentColors.border },
              ]}
            >
              <Text style={[styles.quantityLabel, { color: currentColors.text }]}>
                Quantity
              </Text>
              <View style={styles.quantityControls}>
                <Pressable
                  style={[
                    styles.quantityButton,
                    { backgroundColor: currentColors.background, borderColor: currentColors.border },
                  ]}
                  onPress={() => handleQuantityChange(-1)}
                >
                  <IconSymbol
                    name="minus"
                    size={20}
                    color={currentColors.secondary}
                  />
                </Pressable>
                <Text
                  style={[styles.quantityValue, { color: currentColors.text }]}
                >
                  {quantity}
                </Text>
                <Pressable
                  style={[
                    styles.quantityButton,
                    { backgroundColor: currentColors.background, borderColor: currentColors.border },
                  ]}
                  onPress={() => handleQuantityChange(1)}
                >
                  <IconSymbol
                    name="plus"
                    size={20}
                    color={currentColors.secondary}
                  />
                </Pressable>
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            backgroundColor: currentColors.card,
            borderTopColor: currentColors.border,
          },
        ]}
      >
        {canOrder ? (
          <>
            <View style={styles.totalContainer}>
              <Text
                style={[styles.totalLabel, { color: currentColors.textSecondary }]}
              >
                Total
              </Text>
              <Text style={[styles.totalValue, { color: currentColors.text }]}>
                ${(item.price * quantity).toFixed(2)}
              </Text>
            </View>
            <Pressable
              style={[styles.addButton, { backgroundColor: currentColors.secondary }]}
              onPress={handleAddToCart}
            >
              <IconSymbol name="cart.fill" size={20} color={currentColors.background} />
              <Text style={[styles.addButtonText, { color: currentColors.background }]}>
                Add to Cart
              </Text>
            </Pressable>
          </>
        ) : isMonday ? (
          <Pressable style={[styles.addButton, styles.addButtonDisabled, { backgroundColor: '#2A1A1A' }]} disabled>
            <IconSymbol
              name={Platform.OS === 'ios' ? "moon.fill" : "nightlight"}
              size={20}
              color="#888888"
            />
            <Text style={[styles.addButtonText, { color: "#888888" }]}>
              Closed — Back Tuesday
            </Text>
          </Pressable>
        ) : (
          <Pressable style={[styles.addButton, styles.addButtonDisabled, { backgroundColor: "#CCCCCC" }]} disabled>
            <IconSymbol name="xmark.circle.fill" size={20} color="#999999" />
            <Text style={[styles.addButtonText, { color: "#999999" }]}>
              Currently Unavailable
            </Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 8,
    marginLeft: -8,
  },
  backButtonText: {
    fontSize: 17,
    fontFamily: 'Inter_600SemiBold',
  },
  container: {
    flex: 1,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    fontFamily: 'Inter_400Regular',
    textAlign: "center",
  },
  // Notification styles
  notification: {
    position: "absolute",
    top: 20,
    left: 20,
    right: 20,
    zIndex: 1000,
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  notificationContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  notificationIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  notificationText: {
    flex: 1,
  },
  notificationTitle: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    marginBottom: 2,
  },
  notificationSubtitle: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    opacity: 0.9,
  },
  imageWrapper: {
    width: "100%",
    height: 320,
    borderBottomWidth: 2,
    position: 'relative',
  },
  image: {
    width: "100%",
    height: "100%",
    resizeMode: 'cover',
  },
  imageOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
  },
  content: {
    padding: 20,
  },
  headerInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  headerLeft: {
    flex: 1,
    marginRight: 16,
  },
  name: {
    fontSize: 28,
    fontFamily: 'PlayfairDisplay_700Bold',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  popularBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 4,
  },
  popularText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
  price: {
    fontSize: 28,
    fontFamily: 'Inter_700Bold',
  },
  categoryContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 16,
  },
  category: {
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
  },
  description: {
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    lineHeight: 24,
    marginBottom: 20,
  },
  infoCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 0,
    gap: 12,
    marginBottom: 24,
    borderWidth: 1,
    boxShadow: "0px 2px 8px rgba(212, 175, 55, 0.15)",
    elevation: 2,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  quantitySection: {
    padding: 20,
    borderRadius: 0,
    borderWidth: 1,
    boxShadow: "0px 2px 8px rgba(212, 175, 55, 0.15)",
    elevation: 2,
  },
  quantityLabel: {
    fontSize: 16,
    fontFamily: 'PlayfairDisplay_700Bold',
    marginBottom: 12,
  },
  quantityControls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 24,
  },
  quantityButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
  },
  quantityValue: {
    fontSize: 24,
    fontFamily: 'Inter_700Bold',
    minWidth: 40,
    textAlign: "center",
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    gap: 12,
  },
  totalContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  totalLabel: {
    fontSize: 18,
    fontFamily: 'Inter_400Regular',
  },
  totalValue: {
    fontSize: 24,
    fontFamily: 'Inter_700Bold',
  },
  addButton: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 16,
    borderRadius: 0,
    gap: 8,
    boxShadow: "0px 4px 12px rgba(212, 175, 55, 0.3)",
    elevation: 4,
  },
  addButtonDisabled: {
    opacity: 0.7,
    boxShadow: 'none',
    elevation: 0,
  },
  addButtonText: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
  },
  badgesContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    marginBottom: 8,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 4,
  },
  unavailableBadge: {
    backgroundColor: "#FF6B6B",
  },
  mondayBadge: {
    backgroundColor: "#6B3A3A",
  },
  badgeText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    color: "#FFFFFF",
  },
  unavailableNotice: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    gap: 12,
    marginBottom: 24,
    borderWidth: 1,
  },
  unavailableNoticeText: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    color: "#FFFFFF",
    flex: 1,
  },
  mondayNotice: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    gap: 12,
    marginBottom: 24,
    borderWidth: 1,
    backgroundColor: '#3A1A1A',
    borderColor: '#8B3A3A',
  },
  mondayNoticeText: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    color: "#FFCCCC",
    flex: 1,
  },
});