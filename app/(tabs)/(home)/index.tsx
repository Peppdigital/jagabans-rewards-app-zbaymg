import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  Pressable,
  Platform,
  Dimensions,
  ActivityIndicator,
  TextInput,
  Modal,
  Animated,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { IconSymbol } from "@/components/IconSymbol";
import { useApp } from "@/contexts/AppContext";
import * as Haptics from "expo-haptics";
import { imageService } from "@/services/supabaseService";
import Toast from "@/components/Toast";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { isLosAngelesMonday } from "@/utils/mondayBlock";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const menuCategories = [
  "All",
  "Appetizers",
  "Specials",
  "Jollof Rice Plates",
  "White Rice Plates",
  "Peppa Pasta Plates",
  "Soups x Dips",
  "Swallows",
  "Extras",
  "Drinks",
];

// Responsive font size calculation
const getResponsiveFontSize = (baseSize: number) => {
  const scale = SCREEN_WIDTH / 375;
  const newSize = baseSize * scale;
  return Math.round(newSize);
};

// Responsive padding calculation
const getResponsivePadding = (basePadding: number) => {
  const scale = SCREEN_WIDTH / 375;
  const newPadding = basePadding * scale;
  return Math.max(Math.round(newPadding), basePadding * 0.8);
};

export default function HomeScreen() {
  const router = useRouter();
  const { currentColors, menuItems, loadMenuItems, addToCart, getUnreadNotificationCount } = useApp();
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [headerImage, setHeaderImage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [categoriesCollapsed, setCategoriesCollapsed] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const categoryScrollY = useRef(0);

  // Monday ordering block
  const isMonday = isLosAngelesMonday();

  // Toast state
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastType, setToastType] = useState<"success" | "error" | "info">(
    "success"
  );

  const unreadCount = getUnreadNotificationCount();

  const showToast = (type: "success" | "error" | "info", message: string) => {
    setToastType(type);
    setToastMessage(message);
    setToastVisible(true);
  };

  useEffect(() => {
    async function fetchHeaderImage() {
      try {
        const imageUrl = imageService.getPublicUrl(
          "assets",
          "logos/jagaban_web_logo_dark.png"
        );
        setHeaderImage(imageUrl);
      } catch (error) {
        console.error("Failed to load header image:", error);
      }
    }

    fetchHeaderImage();
  }, []);

  useEffect(() => {
    // Only load if menuItems is empty
    if (menuItems.length === 0) {
      setLoading(true);
      loadMenuItems().finally(() => setLoading(false));
    }
  }, [menuItems.length, loadMenuItems]);

  const filteredItems = menuItems.filter((item) => {
    // Filter by availability - only hide items explicitly marked as unavailable
    if (item.available === false) return false;

    // Filter by search query
    const matchesSearch = searchQuery.trim() === "" ||
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase());

    // Filter by category
    const matchesCategory = selectedCategory === "All" || item.category === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  // Group items by category (preserving menuCategories order)
  const groupedItems = menuCategories
    .filter(cat => cat !== "All")
    .map(cat => ({ category: cat, items: filteredItems.filter(i => i.category === cat) }))
    .filter(group => group.items.length > 0);

  const handleCategoryPress = (category: string) => {
    console.log("Category selected:", category);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedCategory(category);
    setShowCategoryDropdown(false);
  };

  const handleItemPress = (itemId: string) => {
    console.log("Item pressed:", itemId);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push(`/item-detail?id=${itemId}`);
  };

  const handleAddToCart = (item: any) => {
    if (isMonday) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showToast("error", "We're closed on Mondays. See you Tuesday!");
      return;
    }

    console.log("Adding to cart:", item.name, 1);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    addToCart({ ...item, quantity: 1 });
    showToast("success", `1 ${item.name} Added to cart`);
  };

  const handleClearSearch = () => {
    console.log("Clearing search");
    setSearchQuery("");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleScroll = (event: any) => {
    const currentScrollY = event.nativeEvent.contentOffset.y;

    // Collapse categories when scrolled past them (approximately 80px)
    if (currentScrollY > 80 && !categoriesCollapsed) {
      setCategoriesCollapsed(true);
    } else if (currentScrollY <= 80 && categoriesCollapsed) {
      setCategoriesCollapsed(false);
    }
  };

  const toggleCategoryDropdown = () => {
    console.log("Toggle category dropdown");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowCategoryDropdown(!showCategoryDropdown);
  };

  const handleRefresh = async () => {
    console.log("Refreshing menu items");
    setRefreshing(true);
    try {
      await loadMenuItems();
      showToast("success", "Menu refreshed");
    } catch (error) {
      console.error("Error refreshing menu:", error);
      showToast("error", "Failed to refresh menu");
    } finally {
      setRefreshing(false);
    }
  };

  const renderMenuItem = (item: any) => (
    <Pressable
      key={item.id}
      style={styles.menuItem}
      onPress={() => handleItemPress(item.id)}
    >
      <View style={styles.imageContainer}>
        <Image
          source={{ uri: item.image }}
          style={styles.menuItemImage}
        />
      </View>
      <View style={styles.menuItemInfoWrapper}>
        <View style={styles.textureOverlay} />
        <LinearGradient
          colors={[
            'rgba(25, 20, 15, 0.98)',
            'rgba(35, 28, 18, 0.98)',
            'rgba(45, 35, 20, 0.98)',
            'rgba(60, 45, 25, 0.98)',
            'rgba(75, 55, 30, 0.98)',
            'rgba(90, 65, 35, 0.98)',
            'rgba(110, 80, 40, 0.98)',
            'rgba(130, 95, 45, 0.98)',
            'rgba(150, 110, 50, 0.98)',
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.menuItemInfo}
        >
          <Text style={styles.menuItemName}>{item.name}</Text>
          <Text style={styles.menuItemDescription} numberOfLines={3}>{item.description}</Text>
          <View style={styles.menuItemFooter}>
            <Text style={styles.menuItemPrice}>${item.price.toFixed(2)}</Text>
            <Pressable
              style={[styles.addButton, isMonday && styles.addButtonDisabled]}
              onPress={(e) => { e.stopPropagation(); handleAddToCart(item); }}
            >
              <IconSymbol
                name={Platform.OS === 'ios' ? "plus" : "add"}
                size={20}
                color={isMonday ? '#666666' : '#5FE8D0'}
              />
            </Pressable>
          </View>
        </LinearGradient>
      </View>
    </Pressable>
  );

  return (
    <LinearGradient
      colors={[
        '#6B4423', // Brown
        '#8B5A2B', // Lighter brown
        '#5A4A3A', // Mid brown
        '#3A3A4A', // Dark grayish blue
        '#2A2A3A', // Very dark blue
      ]}
      locations={[0, 0.25, 0.5, 0.75, 1]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      {/* Header with Gradient and 3% Translucency - Background Only */}
      <View style={styles.headerContainer}>
        {/* Translucent Background Layer */}
        <LinearGradient
          colors={[
            'rgba(13, 26, 43, 0.97)',
            'rgba(20, 35, 50, 0.97)',
            'rgba(30, 50, 65, 0.97)',
            'rgba(45, 70, 85, 0.97)',
            'rgba(70, 90, 100, 0.97)',
            'rgba(100, 120, 110, 0.97)',
            'rgba(150, 140, 90, 0.97)',
            'rgba(180, 160, 80, 0.97)',
            'rgba(200, 180, 70, 0.97)',
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.headerBackground}
        />

        {/* Content Layer (Logo and Notification Bell) - Fully Opaque */}
        <SafeAreaView edges={['top']} style={styles.headerSafeArea}>
          <View style={styles.header}>
            <View style={styles.headerContent}>
              {headerImage ? (
                <Image
                  source={{ uri: headerImage }}
                  style={styles.logo}
                  tintColor="#5FE8D0"
                />
              ) : (
                <View style={styles.logoPlaceholder}>
                  <Text style={styles.logoText}>
                    Jagabans
                  </Text>
                  <Text style={styles.logoSubtext}>
                    LOS ANGELES
                  </Text>
                </View>
              )}
            </View>
            <Pressable
              onPress={() => router.push("/notifications")}
              style={styles.notificationButton}
            >
              <IconSymbol
                name={Platform.OS === 'ios' ? "bell.fill" : "notifications"}
                size={28}
                color="#947d33ff"
              />
              {unreadCount > 0 && (
                <View style={styles.notificationBadge}>
                  <Text style={styles.notificationBadgeText}>
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </Text>
                </View>
              )}
            </Pressable>
          </View>
        </SafeAreaView>
      </View>

      {/* Monday Closure Banner */}
      {isMonday && (
        <View style={styles.mondayBanner}>
          <IconSymbol
            name={Platform.OS === 'ios' ? "moon.fill" : "nightlight"}
            size={16}
            color="#5FE8D0"
          />
          <Text style={styles.mondayBannerText}>
            We're closed today (Monday). Online ordering resumes Tuesday.
          </Text>
        </View>
      )}

      {/* Search Bar with Category Dropdown */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBarWrapper}>
          <IconSymbol
            name={Platform.OS === 'ios' ? "magnifyingglass" : "search"}
            size={20}
            color="#B0B8C1"
            style={styles.searchIcon}
          />
          <TextInput
            style={styles.searchInput}
            placeholder="Search menu..."
            placeholderTextColor="#B0B8C1"
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={handleClearSearch} style={styles.clearButton}>
              <IconSymbol
                name={Platform.OS === 'ios' ? "xmark.circle.fill" : "cancel"}
                size={20}
                color="#B0B8C1"
              />
            </Pressable>
          )}

          {/* Category Dropdown Button (visible when collapsed) */}
          {categoriesCollapsed && (
            <Pressable
              onPress={toggleCategoryDropdown}
              style={styles.categoryDropdownButton}
            >
              <IconSymbol
                name={Platform.OS === 'ios' ? "line.3.horizontal.decrease.circle.fill" : "filter-list"}
                size={28}
                color="#F5A623"
              />
            </Pressable>
          )}
        </View>
      </View>

      {/* Category Dropdown Modal */}
      <Modal
        visible={showCategoryDropdown}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowCategoryDropdown(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowCategoryDropdown(false)}
        >
          <View style={styles.dropdownContainer}>
            <View style={styles.dropdownHeader}>
              <Text style={styles.dropdownTitle}>Categories</Text>
              <Pressable onPress={() => setShowCategoryDropdown(false)}>
                <IconSymbol
                  name={Platform.OS === 'ios' ? "xmark.circle.fill" : "cancel"}
                  size={24}
                  color="#B0B8C1"
                />
              </Pressable>
            </View>
            <ScrollView style={styles.dropdownScroll}>
              {menuCategories.map((category) => (
                <Pressable
                  key={category}
                  style={[
                    styles.dropdownItem,
                    selectedCategory === category && styles.dropdownItemSelected
                  ]}
                  onPress={() => handleCategoryPress(category)}
                >
                  <Text
                    style={[
                      styles.dropdownItemText,
                      selectedCategory === category && styles.dropdownItemTextSelected
                    ]}
                  >
                    {category}
                  </Text>
                  {selectedCategory === category && (
                    <IconSymbol
                      name={Platform.OS === 'ios' ? "checkmark.circle.fill" : "check-circle"}
                      size={20}
                      color="#5FE8D0"
                    />
                  )}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#5FE8D0"
            colors={["#5FE8D0", "#F5A623"]}
          />
        }
      >
        {/* Categories - Hidden when collapsed */}
        {!categoriesCollapsed && (
          <View style={styles.categoriesWrapper}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.categoriesContainer}
              contentContainerStyle={styles.categoriesContent}
            >
              {menuCategories.map((category) => (
                <Pressable
                  key={category}
                  style={[
                    styles.categoryButton,
                    {
                      backgroundColor: selectedCategory === category ? '#F5A623' : '#1a303aff',
                      borderColor: selectedCategory === category ? '#F5A623' : '#4AD7C2',
                      paddingHorizontal: getResponsivePadding(16),
                      paddingVertical: getResponsivePadding(10),
                    },
                  ]}
                  onPress={() => handleCategoryPress(category)}
                >
                  <Text
                    style={[
                      styles.categoryText,
                      {
                        color: selectedCategory === category ? '#1A5A3E' : '#FFFFFF',
                        fontSize: getResponsiveFontSize(13),
                      },
                    ]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                  >
                    {category}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {/* Left fade overlay */}
            <LinearGradient
              colors={['rgba(13, 26, 43, 0.9)', 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.categoryFadeLeft}
              pointerEvents="none"
            />

            {/* Right fade overlay */}
            <LinearGradient
              colors={['transparent', 'rgba(13, 26, 43, 0.9)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.categoryFadeRight}
              pointerEvents="none"
            />
          </View>
        )}

        {/* Menu Items */}
        {loading || menuItems.length === 0 ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#5FE8D0" />
            <Text style={styles.loadingText}>
              Loading menu...
            </Text>
          </View>
        ) : (
          <View style={styles.menuContainer}>
            {filteredItems.length === 0 ? (
              <View style={styles.emptyContainer}>
                <IconSymbol
                  name={Platform.OS === 'ios' ? "magnifyingglass" : "search"}
                  size={64}
                  color={currentColors.textSecondary}
                />
                <Text
                  style={[
                    styles.emptyText,
                    { color: currentColors.textSecondary },
                  ]}
                >
                  {searchQuery ? 'No items match your search' : 'No items in this category'}
                </Text>
              </View>
            ) : selectedCategory === "All" ? (
              groupedItems.map(group => (
                <View key={group.category}>
                  <View style={styles.categoryHeader}>
                    <View style={styles.categoryHeaderLine} />
                    <Text style={styles.categoryHeaderText}>{group.category}</Text>
                    <View style={styles.categoryHeaderLine} />
                  </View>
                  {group.items.map(item => renderMenuItem(item))}
                </View>
              ))
            ) : (
              filteredItems.map(item => renderMenuItem(item))
            )}
          </View>
        )}
      </ScrollView>
      <Toast
        visible={toastVisible}
        message={toastMessage}
        type={toastType}
        onHide={() => setToastVisible(false)}
        currentColors={currentColors}
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerContainer: {
    position: 'relative',
    boxShadow: '0px 4px 20px rgba(212, 175, 55, 0.4)',
    elevation: 8,
  },
  headerBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  headerSafeArea: {
    width: '100%',
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 8,
    paddingTop: Platform.OS === 'ios' ? 0 : 0,
  },
  headerContent: {
    flex: 1,
    alignItems: "center",
  },
  logo: {
    width: 200,
    height: 70,
    resizeMode: "contain",
  },
  logoPlaceholder: {
    alignItems: 'center',
  },
  logoText: {
    fontSize: 32,
    fontFamily: 'PlayfairDisplay_900Black',
    letterSpacing: 3,
    fontStyle: 'italic',
    color: '#5FE8D0',
  },
  logoSubtext: {
    fontSize: 10,
    fontFamily: 'LibertinusSans_400Regular',
    letterSpacing: 5,
    marginTop: -2,
    color: '#5FE8D0',
  },
  notificationButton: {
    position: 'relative',
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notificationBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    backgroundColor: '#D4AF37',
  },
  notificationBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    fontFamily: 'LibertinusSans_700Bold',
    color: '#0D1A2B',
  },
  mondayBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#1a303a',
    borderBottomWidth: 1,
    borderBottomColor: '#5FE8D0',
  },
  mondayBannerText: {
    fontSize: 13,
    fontFamily: 'LibertinusSans_700Bold',
    color: '#5FE8D0',
    flexShrink: 1,
  },
  searchContainer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
    backgroundColor: 'transparent',
  },
  searchBarWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a303aff',
    borderRadius: 16,
    borderWidth: 0.2,
    borderColor: '#4AD7C2',
    paddingHorizontal: 16,
    paddingVertical: 12,
    boxShadow: '0px 4px 12px rgba(212, 175, 55, 0.3)',
    elevation: 4,
  },
  searchIcon: {
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'LibertinusSans_400Regular',
    color: '#FFFFFF',
    padding: 0,
  },
  clearButton: {
    padding: 4,
    marginLeft: 8,
  },
  categoryDropdownButton: {
    padding: 4,
    marginLeft: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-start',
    paddingTop: 120,
    paddingHorizontal: 20,
  },
  dropdownContainer: {
    backgroundColor: '#1a303aff',
    borderRadius: 0,
    borderWidth: 0.5,
    borderColor: '#4AD7C2',
    maxHeight: 400,
    boxShadow: '0px 8px 24px rgba(48, 41, 18, 0.5)',
    elevation: 8,
  },
  dropdownHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#4AD7C2',
  },
  dropdownTitle: {
    fontSize: 20,
    fontFamily: 'PlayfairDisplay_700Bold',
    color: '#5FE8D0',
  },
  dropdownScroll: {
    maxHeight: 320,
  },
  dropdownItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(74, 215, 194, 0.2)',
  },
  dropdownItemSelected: {
    backgroundColor: 'rgba(35, 245, 210, 0.15)',
  },
  dropdownItemText: {
    fontSize: 16,
    fontFamily: 'LibertinusSans_700Bold',
    color: '#FFFFFF',
  },
  dropdownItemTextSelected: {
    color: '#5FE8D0',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 120,
  },
  categoriesContainer: {
    maxHeight: 60,
    borderTopColor: '#d4af3765',
    borderTopWidth: 0.2,
    borderBottomColor: '#d4af3773',
    borderBottomWidth: 0.2,
  },
  categoriesContent: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    gap: 6,
  },
  categoryButton: {
    borderRadius: 8,
    marginRight: 6,
    minWidth: 80,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 0.5,
    boxShadow: "0px 4px 12px rgba(44, 36, 10, 0.6)",
    elevation: 6,
  },
  categoryGradient: {
    borderRadius: 0,
    boxShadow: '0px 8px 24px rgba(212, 175, 55, 0.4)',
    elevation: 8,
  },
  categoryText: {
    fontWeight: "600",
    textAlign: "center",
    fontFamily: 'LibertinusSans_700Bold',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
    paddingVertical: 60,
  },
  loadingText: {
    fontSize: 16,
    fontFamily: 'LibertinusSans_400Regular',
    color: '#B0B8C1',
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
    fontFamily: 'LibertinusSans_400Regular',
  },
  menuContainer: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  menuItem: {
    borderRadius: 0,
    marginBottom: 28,
    overflow: "hidden",
    boxShadow: "0px 8px 24px rgba(63, 52, 18, 0.5)",
    elevation: 8,
    backgroundColor: '#1a303aff',
  },
  imageContainer: {
    width: "100%",
    height: 260,
    overflow: 'hidden',
    position: 'relative',
  },
  menuItemImage: {
    width: "100%",
    height: "100%",
    resizeMode: 'cover',
  },
  menuItemInfoWrapper: {
    position: 'relative',
    overflow: 'hidden',
  },
  textureOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
    opacity: 0.15,
    backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(255,255,255,.05) 2px, rgba(255,255,255,.05) 4px)',
  },
  menuItemInfo: {
    padding: 24,
  },
  menuItemName: {
    fontSize: 22,
    fontFamily: 'PlayfairDisplay_700Bold',
    marginBottom: 10,
    letterSpacing: 0.5,
    color: '#D4AF37',
  },
  menuItemDescription: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    marginBottom: 18,
    lineHeight: 24,
    color: '#ffffffcc',
  },
  menuItemFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  menuItemPrice: {
    fontSize: 24,
    fontFamily: 'LibertinusSans_700Bold',
    color: '#D4AF37',
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 0,
    justifyContent: "center",
    alignItems: "center",
    boxShadow: "0px 4px 12px rgba(44, 36, 10, 0.6)",
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#5FE8D0',
  },
  addButtonDisabled: {
    borderColor: '#444444',
    opacity: 0.5,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 16,
    gap: 12,
  },
  categoryHeaderLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#d4af3765',
  },
  categoryHeaderText: {
    fontSize: 13,
    fontFamily: 'LibertinusSans_700Bold',
    color: '#D4AF37',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  categoriesWrapper: {
    position: 'relative',
    marginBottom: 12,
    marginTop: 12,
  },
  categoryFadeLeft: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 40,
    zIndex: 10,
  },
  categoryFadeRight: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 40,
    zIndex: 10,
  },
});