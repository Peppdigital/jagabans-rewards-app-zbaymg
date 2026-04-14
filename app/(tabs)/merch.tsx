
import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  Pressable,
  Platform,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { IconSymbol } from "@/components/IconSymbol";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import Toast from "@/components/Toast";
import Dialog from "@/components/Dialog";
import * as Haptics from "expo-haptics";
import { merchService } from "@/services/supabaseService";
import { MerchItem } from "@/types";
import { LinearGradient } from "expo-linear-gradient";

export default function MerchScreen() {
  const router = useRouter();
  const { currentColors, userProfile } = useApp();
  const { isAuthenticated } = useAuth();
  const [loginDialogVisible, setLoginDialogVisible] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!isAuthenticated) {
        setLoginDialogVisible(true);
      }
    }, [isAuthenticated])
  );

  const [merchItems, setMerchItems] = useState<MerchItem[]>([]);
  const [loading, setLoading] = useState(true);
  // Toast state
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastType, setToastType] = useState<"success" | "error" | "info">(
    "success"
  );

  const showToast = (type: "success" | "error" | "info", message: string) => {
    setToastType(type);
    setToastMessage(message);
    setToastVisible(true);
  };

  useEffect(() => {
    loadMerchItems();
  }, []);

  const loadMerchItems = async () => {
    try {
      console.log("Loading merch items from Supabase");
      setLoading(true);
      const { data, error } = await merchService.getMerchItems();

      if (error) {
        console.error("Error loading merch items:", error);
        return;
      }

      if (data) {
        const items: MerchItem[] = data.map((item: any) => ({
          id: item.id,
          name: item.name,
          description: item.description,
          pointsCost: item.points_cost,
          image: item.image,
          inStock: item.in_stock,
        }));
        setMerchItems(items);
        console.log("Loaded", items.length, "merch items");
      }
    } catch (error) {
      console.error("Exception loading merch items:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleItemPress = (item: MerchItem) => {
    console.log("Merch item pressed:", item.name);
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    router.push({
      pathname: "/merch-redemption",
      params: {
        id: item.id,
        name: item.name,
        description: item.description,
        pointsCost: item.pointsCost.toString(),
        image: item.image,
        inStock: item.inStock.toString(),
      },
    });
  };

  const handleRedeemPress = (item: MerchItem, event: any) => {
    event.stopPropagation();

    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    const userPoints = userProfile?.points || 0;
    if (userPoints < item.pointsCost) {
      showToast(
        "error",
        `Insufficient points. You need ${
          item.pointsCost - userPoints
        } more points.`
      );
      return;
    }

    // Proceed to redemption screen
    handleItemPress(item);
  };

  return (
    <LinearGradient
      colors={[currentColors.gradientStart || currentColors.background, currentColors.gradientMid || currentColors.background, currentColors.gradientEnd || currentColors.background]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={styles.gradientContainer}
    >
      <SafeAreaView
        style={styles.safeArea}
        edges={["top"]}
      >
        <View style={styles.container}>
          {/* Header with Gradient */}
          <LinearGradient
            colors={[currentColors.headerGradientStart || currentColors.card, currentColors.headerGradientEnd || currentColors.card]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.header, { borderBottomColor: currentColors.border }]}
          >
            <Text style={[styles.title, { color: currentColors.text }]}>
              Merch Store
            </Text>
            <View style={styles.pointsContainer}>
              <IconSymbol
                name="star.fill"
                size={20}
                color={currentColors.secondary}
              />
              <Text style={[styles.pointsText, { color: currentColors.text }]}>
                {userProfile?.points || 0} pts
              </Text>
            </View>
          </LinearGradient>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={currentColors.secondary} />
              <Text
                style={[
                  styles.loadingText,
                  { color: currentColors.textSecondary },
                ]}
              >
                Loading merch...
              </Text>
            </View>
          ) : (
            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={styles.content}
              showsVerticalScrollIndicator={false}
            >
              <Text
                style={[styles.subtitle, { color: currentColors.textSecondary }]}
              >
                Redeem your points for exclusive Jagabans LA merchandise
              </Text>

              {merchItems.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <IconSymbol
                    name="shopping-bag"
                    size={64}
                    color={currentColors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.emptyText,
                      { color: currentColors.textSecondary },
                    ]}
                  >
                    No merch items available
                  </Text>
                </View>
              ) : (
                <View style={styles.grid}>
                  {merchItems.map((item) => (
                    <Pressable
                      key={item.id}
                      style={styles.merchCardWrapper}
                      onPress={() => handleItemPress(item)}
                      disabled={!item.inStock}
                    >
                      <LinearGradient
                        colors={[currentColors.cardGradientStart || currentColors.card, currentColors.cardGradientEnd || currentColors.card]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={[
                          styles.merchCard,
                          { borderColor: currentColors.border },
                        ]}
                      >
                        <View style={[styles.imageContainer, { borderColor: currentColors.border }]}>
                          <Image
                            source={{ uri: item.image }}
                            style={styles.merchImage}
                          />
                        </View>
                        {!item.inStock && (
                          <View style={[styles.outOfStockBadge, { backgroundColor: currentColors.background }]}>
                            <Text style={[styles.outOfStockText, { color: currentColors.text }]}>Out of Stock</Text>
                          </View>
                        )}
                        <View style={styles.merchInfo}>
                          <Text
                            style={[
                              styles.merchName,
                              { color: currentColors.text },
                            ]}
                            numberOfLines={2}
                          >
                            {item.name}
                          </Text>
                          <Text
                            style={[
                              styles.merchDescription,
                              { color: currentColors.textSecondary },
                            ]}
                            numberOfLines={2}
                          >
                            {item.description}
                          </Text>
                          <View style={styles.merchFooter}>
                            <View style={styles.pointsCostContainer}>
                              <IconSymbol
                                name="star.fill"
                                size={16}
                                color={currentColors.secondary}
                              />
                              <Text
                                style={[
                                  styles.pointsCost,
                                  { color: currentColors.text },
                                ]}
                              >
                                {item.pointsCost}
                              </Text>
                            </View>
                            {/* {item.inStock && (
                              <LinearGradient
                                colors={[currentColors.secondary, currentColors.highlight]}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={styles.redeemButton}
                              >
                                <Pressable
                                  style={styles.redeemButtonInner}
                                  onPress={(e) => handleRedeemPress(item, e)}
                                >
                                  <Text
                                    style={[
                                      styles.redeemButtonText,
                                      { color: currentColors.background },
                                    ]}
                                  >
                                    Redeem
                                  </Text>
                                </Pressable>
                              </LinearGradient>
                            )} */}
                          </View>
                        </View>
                      </LinearGradient>
                    </Pressable>
                  ))}
                </View>
              )}
            </ScrollView>
          )}
        </View>
        <Toast
          message={toastMessage}
          visible={toastVisible}
          onHide={() => setToastVisible(false)}
          type={toastType}
          currentColors={currentColors}
        />
      </SafeAreaView>
      <Dialog
        visible={loginDialogVisible}
        title="Sign In Required"
        message="Please sign in to access Merch."
        buttons={[
          { text: 'Cancel', onPress: () => router.back(), style: 'cancel' },
          { text: 'Sign In', onPress: () => router.replace('/(tabs)/profile'), style: 'default' },
        ]}
        onHide={() => setLoginDialogVisible(false)}
        currentColors={currentColors}
      />
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
  header: {
    flexDirection: "column",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 20,
    borderBottomWidth: 2,
    boxShadow: '0px 6px 20px rgba(74, 215, 194, 0.3)',
    elevation: 8,
  },
  title: {
    fontSize: 32,
    fontFamily: 'PlayfairDisplay_700Bold',
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  pointsContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  pointsText: {
    fontSize: 18,
    fontFamily: 'Inter_600SemiBold',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
    gap: 16,
  },
  emptyText: {
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 120,
  },
  subtitle: {
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    marginBottom: 24,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    justifyContent: "space-between",
  },
  merchCardWrapper: {
    width: "100%",
  },
  merchCard: {
    borderRadius: 0,
    overflow: "hidden",
    boxShadow: "0px 8px 24px rgba(212, 175, 55, 0.3)",
    elevation: 8,
    borderWidth: 2,
  },
  imageContainer: {
    width: "100%",
    height: 180,
    borderRadius: 0,
    overflow: 'hidden',
    borderBottomWidth: 2,
    boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.2)',
    elevation: 4,
  },
  merchImage: {
    width: "100%",
    height: "100%",
    resizeMode: 'cover',
  },
  outOfStockBadge: {
    position: "absolute",
    top: 12,
    right: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 0,
    boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.3)',
    elevation: 6,
  },
  outOfStockText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
  merchInfo: {
    padding: 16,
  },
  merchName: {
    fontSize: 18,
    fontFamily: 'PlayfairDisplay_700Bold',
    marginBottom: 6,
  },
  merchDescription: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    marginBottom: 14,
    lineHeight: 18,
  },
  merchFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  pointsCostContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  pointsCost: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
  },
  redeemButton: {
    borderRadius: 0,
    boxShadow: '0px 6px 20px rgba(212, 175, 55, 0.4)',
    elevation: 6,
  },
  redeemButtonInner: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  redeemButtonText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
});
