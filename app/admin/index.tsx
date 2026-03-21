import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Switch,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { IconSymbol } from "@/components/IconSymbol";
import { colors } from "@/styles/commonStyles";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/contexts/AuthContext";
import { orderService } from "@/services/supabaseService";
import { supabase } from "@/app/integrations/supabase/client";
import { useApp } from "@/contexts/AppContext";
import Dialog from "@/components/Dialog";
import Toast from "@/components/Toast";
import AsyncStorage from '@react-native-async-storage/async-storage';

// Constants for AsyncStorage keys
const ADMIN_STORAGE_KEYS = {
  REMEMBER_ME: '@admin_remember_me',
  SAVED_USERNAME: '@admin_saved_username',
  SAVED_PASSWORD: '@admin_saved_password',
};

export default function AdminDashboard() {
  const router = useRouter();
  const { signIn, isAuthenticated, signOut } = useAuth();
  const { userProfile } = useApp();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statsLoading, setStatsLoading] = useState(true);
  const [rememberMe, setRememberMe] = useState(false);
  const [stats, setStats] = useState({
    totalOrders: 0,
    activeUsers: 0,
    revenue: 0,
  });
  const [viewAsAdmin, setViewAsAdmin] = useState(false);

  // Dialog state
  const [dialogVisible, setDialogVisible] = useState(false);
  const [dialogConfig, setDialogConfig] = useState({
    title: '',
    message: '',
    buttons: [] as Array<{ text: string; onPress: () => void; style?: 'default' | 'destructive' | 'cancel' }>
  });

  // Toast state
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error' | 'info'>('success');

  const showDialog = (title: string, message: string, buttons: Array<{ text: string; onPress: () => void; style?: 'default' | 'destructive' | 'cancel' }>) => {
    setDialogConfig({ title, message, buttons });
    setDialogVisible(true);
  };

  const showToast = (type: 'success' | 'error' | 'info', message: string) => {
    setToastType(type);
    setToastMessage(message);
    setToastVisible(true);
  };

  // Load saved credentials on mount
  useEffect(() => {
    loadSavedCredentials();
  }, []);

  const loadSavedCredentials = async () => {
    try {
      const [savedRememberMe, savedUsername, savedPassword] = await Promise.all([
        AsyncStorage.getItem(ADMIN_STORAGE_KEYS.REMEMBER_ME),
        AsyncStorage.getItem(ADMIN_STORAGE_KEYS.SAVED_USERNAME),
        AsyncStorage.getItem(ADMIN_STORAGE_KEYS.SAVED_PASSWORD),
      ]);

      if (savedRememberMe === 'true' && savedUsername) {
        setRememberMe(true);
        setUsername(savedUsername);
        if (savedPassword) {
          setPassword(savedPassword);
        }
      }
    } catch (error) {
      console.error('Error loading saved admin credentials:', error);
    }
  };

  const saveCredentials = async (usernameToSave: string, passwordToSave: string, shouldRemember: boolean) => {
    try {
      if (shouldRemember) {
        await AsyncStorage.setItem(ADMIN_STORAGE_KEYS.REMEMBER_ME, 'true');
        await AsyncStorage.setItem(ADMIN_STORAGE_KEYS.SAVED_USERNAME, usernameToSave);
        await AsyncStorage.setItem(ADMIN_STORAGE_KEYS.SAVED_PASSWORD, passwordToSave);
      } else {
        await AsyncStorage.removeItem(ADMIN_STORAGE_KEYS.REMEMBER_ME);
        await AsyncStorage.removeItem(ADMIN_STORAGE_KEYS.SAVED_USERNAME);
        await AsyncStorage.removeItem(ADMIN_STORAGE_KEYS.SAVED_PASSWORD);
      }
    } catch (error) {
      console.error('Error saving admin credentials:', error);
    }
  };

  const clearSavedCredentials = async () => {
    try {
      await AsyncStorage.removeItem(ADMIN_STORAGE_KEYS.REMEMBER_ME);
      await AsyncStorage.removeItem(ADMIN_STORAGE_KEYS.SAVED_USERNAME);
      await AsyncStorage.removeItem(ADMIN_STORAGE_KEYS.SAVED_PASSWORD);
    } catch (error) {
      console.error('Error clearing saved admin credentials:', error);
    }
  };

  const isAdmin = userProfile?.userRole === 'admin' || userProfile?.userRole === 'super_admin';
  const isSuperAdmin = userProfile?.userRole === 'super_admin';
  
  // Effective role based on the toggle
  const effectiveRole = isSuperAdmin && viewAsAdmin ? 'admin' : userProfile?.userRole;
  const isEffectivelyAdmin = effectiveRole === 'admin';
  
  // Show analytics only for super_admin (when not viewing as admin)
  const shouldShowAnalytics = isSuperAdmin && !viewAsAdmin;

  const handleLogin = async () => {
    console.log("Admin login attempt");
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    if (!username || !password) {
      showToast('error', 'Please enter both email and password');
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const email = username.includes("@") ? username : `${username}@jagabansla.com`;
    
    if (!emailRegex.test(email)) {
      showToast('error', 'Please enter a valid email address');
      return;
    }

    // Password length validation
    if (password.length < 6) {
      showToast('error', 'Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    const { error } = await signIn(email, password);
    setLoading(false);

    if (error) {
      console.error('Admin login error:', error);
      // Handle specific error messages
      if (error.message?.includes('Invalid login credentials')) {
        showToast('error', 'Invalid email or password. Please check your credentials and try again.');
      } else if (error.message?.includes('Email not confirmed')) {
        showToast('error', 'Please verify your email before signing in. Check your inbox for the verification link.');
      } else if (error.message?.includes('Email')) {
        showToast('error', 'Please enter a valid email address');
      } else {
        showToast('error', error.message || 'Login failed. Please try again.');
      }
    } else {
      showToast('success', 'Welcome to Admin Dashboard!');
      
      // Save credentials if remember me is checked
      await saveCredentials(username, password, rememberMe);
      
      // Clear password after successful login (keep username if remember me is checked)
      setPassword("");
      setShowPassword(false);
    }
  };

  const handleLogout = async () => {
    console.log("Logging out");
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    try {
      await signOut();
      
      // Don't clear username and password if remember me is enabled
      if (!rememberMe) {
        setUsername("");
        setPassword("");
      }
      
      showToast('success', 'Logged out successfully');
    } catch (error) {
      console.error('Logout error:', error);
      showToast('error', 'Failed to log out. Please try again.');
    }
  };

  const togglePasswordVisibility = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setShowPassword(!showPassword);
  };

  const toggleRememberMe = async () => {
    const newValue = !rememberMe;
    setRememberMe(newValue);
    
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    
    // If unchecking, clear saved credentials immediately
    if (!newValue) {
      await clearSavedCredentials();
    }
  };

  const fetchStats = useCallback(async () => {
    try {
      setStatsLoading(true);
      
      // Fetch orders
      const ordersResponse = await orderService.getAllOrders();
      const orders = ordersResponse.data || [];

      // Fetch users based on effective role
      let usersQuery = (supabase as any).from("user_profiles").select("*");
      
      // If viewing as admin (or is regular admin), only count users with user_role = 'user'
      if (isEffectivelyAdmin) {
        usersQuery = usersQuery.eq('user_role', 'user');
      }
      // If super_admin (and not viewing as admin), count all users (no filter)

      const usersResponse = await usersQuery;
      const users = usersResponse.data || [];

      const totalOrders = orders.length;
      const activeUsers = users.length;
      const revenue = orders.reduce(
        (sum: number, order: any) => sum + (order.total || 0),
        0
      );

      setStats({
        totalOrders,
        activeUsers,
        revenue,
      });
    } catch (error) {
      console.error("Error fetching stats:", error);
      setStats({
        totalOrders: 0,
        activeUsers: 0,
        revenue: 0,
      });
    } finally {
      setStatsLoading(false);
    }
  }, [isEffectivelyAdmin]);

  useEffect(() => {
    if (isAuthenticated && isAdmin && shouldShowAnalytics) {
      fetchStats();
    }
  }, [isAuthenticated, isAdmin, viewAsAdmin, fetchStats, shouldShowAnalytics]);

  const allAdminSections = [
  {
    id: "menu",
    title: "Menu Management",
    description: "Add, edit, and remove menu items",
    icon: "fork.knife" as const, // SF Symbol for iOS
    route: "/admin/menu",
    color: colors.primary,
    superAdminOnly: false,
  },
  {
    id: "orders",
    title: "Order Management",
    description: "View and update order statuses",
    icon: "receipt" as const, // SF Symbol for iOS
    route: "/admin/orders",
    color: "#FF6B35",
    superAdminOnly: false,
  },
  {
    id: "reservations",
    title: "Reservations",
    description: "Manage table bookings",
    icon: "calendar.badge.clock" as const, // SF Symbol for iOS
    route: "/admin/reservations",
    color: "#9B59B6",
    superAdminOnly: false,
  },
  {
    id: "users",
    title: "User Management",
    description: "Manage user accounts and profiles",
    icon: "person.3" as const, // SF Symbol for iOS
    route: "/admin/users",
    color: "#4ECDC4",
    superAdminOnly: false,
  },
  {
    id: "admins",
    title: "Admin Management",
    description: "Manage admin roles and permissions",
    icon: "shield.lefthalf.filled" as const, // SF Symbol for iOS
    route: "/admin/admins",
    color: "#E74C3C",
    superAdminOnly: true,
  },
  {
    id: "events",
    title: "Event Management",
    description: "Create and manage events",
    icon: "calendar" as const, // SF Symbol for iOS
    route: "/admin/events",
    color: "#95E1D3",
    superAdminOnly: false,
  },
  {
    id: "merch",
    title: "Merchandise",
    description: "Manage merch inventory",
    icon: "bag" as const, // SF Symbol for iOS
    route: "/admin/merch",
    color: "#F38181",
    superAdminOnly: false,
  },
  {
    id: "giftcards",
    title: "Gift Cards",
    description: "View and manage gift cards",
    icon: "giftcard" as const, // SF Symbol for iOS
    route: "/admin/giftcards",
    color: "#AA96DA",
    superAdminOnly: false,
  },
  {
    id: "notifications",
    title: "Notifications",
    description: "Send push notifications",
    icon: "bell.fill" as const, // SF Symbol for iOS
    route: "/admin/notifications",
    color: "#FCBAD3",
    superAdminOnly: false,
  },
  {
    id: "analytics",
    title: "Analytics",
    description: "View sales and engagement metrics",
    icon: "chart.bar" as const, // SF Symbol for iOS
    route: "/admin/analytics",
    color: "#A8D8EA",
    superAdminOnly: true,
  },
  {
    id: "delivery",
    title: "Delivery Settings",
    description: "Configure Uber Direct delivery",
    icon: "truck.box" as const, // SF Symbol for iOS
    route: "/admin/delivery-settings",
    color: "#FF9F43",
    superAdminOnly: false,
  },
  {
    id: "notification-emails",
    title: "Notification Emails",
    description: "Manage admin email recipients",
    icon: "envelope.fill" as const, // SF Symbol for iOS
    route: "/admin/notification-emails",
    color: "#6366F1",
    superAdminOnly: true,
  },
];

  // Filter sections based on effective role
  const adminSections = allAdminSections.filter(
    (section) => !section.superAdminOnly || (isSuperAdmin && !viewAsAdmin)
  );

  const handleSectionPress = (route: string) => {
    console.log("Navigating to:", route);
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.push(route as any);
  };

  const handleUserProfilePress = () => {
    console.log("Navigating to user profile");
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.push("/(tabs)/profile" as any);
  };

  const handleToggleViewMode = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setViewAsAdmin(!viewAsAdmin);
  };

  if (!isAuthenticated || !isAdmin) {
    return (
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          style={styles.keyboardAvoidingView}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
        >
          <ScrollView
            contentContainerStyle={styles.loginScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.loginContainer}>
              <View style={styles.loginHeader}>
              <IconSymbol
                name="shield.lefthalf.filled" // SF Symbol for iOS
                size={64}
                color={colors.primary}
              />
              <Text style={styles.loginTitle}>Admin Dashboard</Text>
              <Text style={styles.loginSubtitle}>Jagabans LA</Text>
            </View>

              <View style={styles.loginForm}>
                <View style={styles.inputContainer}>
                  <IconSymbol
                    name="person"
                    size={20}
                    color={colors.textSecondary}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Email or Username"
                    placeholderTextColor={colors.textSecondary}
                    value={username}
                    onChangeText={setUsername}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    editable={!loading}
                  />
                </View>

                <View style={styles.inputContainer}>
                  <IconSymbol name="lock.fill" size={20} color={colors.textSecondary} />
                  <TextInput
                    style={styles.input}
                    placeholder="Password"
                    placeholderTextColor={colors.textSecondary}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    editable={!loading}
                  />
                  <Pressable onPress={togglePasswordVisibility} style={styles.eyeIconButton} disabled={loading}>
                    <IconSymbol 
                      name={showPassword ? "eye.slash" : "eye"} 
                      size={20} 
                      color={colors.textSecondary} 
                    />
                  </Pressable>
                </View>

                {/* Remember Me Checkbox */}
                <Pressable
                  style={styles.rememberMeContainer}
                  onPress={toggleRememberMe}
                  disabled={loading}
                >
                  <View
                    style={[
                      styles.checkbox,
                      { borderColor: colors.border },
                      rememberMe && { backgroundColor: colors.primary },
                    ]}
                  >
                    {rememberMe && (
                      <IconSymbol
                        name="checkmark"
                        size={16}
                        color="#FFFFFF"
                      />
                    )}
                  </View>
                  <Text
                    style={[
                      styles.rememberMeText,
                      { color: colors.textSecondary },
                    ]}
                  >
                    Remember me
                  </Text>
                </Pressable>

                <Pressable
                  style={({ pressed }) => [
                    styles.loginButton,
                    pressed && !loading && styles.loginButtonPressed,
                    loading && styles.loginButtonDisabled,
                  ]}
                  onPress={handleLogin}
                  disabled={loading}
                >
                  {loading ? (
                    <View style={styles.loginButtonContent}>
                      <ActivityIndicator size="small" color="#FFFFFF" />
                      <Text style={styles.loginButtonText}>Signing In...</Text>
                    </View>
                  ) : (
                    <Text style={styles.loginButtonText}>Sign In</Text>
                  )}
                </Pressable>

                <Pressable
                  style={styles.userProfileButton}
                  onPress={handleUserProfilePress}
                  disabled={loading}
                >
                  <IconSymbol
                    name="person.badge.shield.checkmark" // SF Symbol for iOS
                    size={16}
                    color={colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.userProfileButtonText,
                      { color: colors.textSecondary },
                    ]}
                  >
                    Switch to User Profile
                  </Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
        <Toast
          visible={toastVisible}
          message={toastMessage}
          type={toastType}
          onHide={() => setToastVisible(false)}
          currentColors={{ text: colors.text, background: colors.background, primary: colors.primary }}
        />
        <Dialog
          visible={dialogVisible}
          title={dialogConfig.title}
          message={dialogConfig.message}
          buttons={dialogConfig.buttons}
          onHide={() => setDialogVisible(false)}
          currentColors={{ text: colors.text, card: colors.card, primary: colors.primary, textSecondary: colors.textSecondary, background: colors.background }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollViewContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.title}>Admin Dashboard</Text>
            <View style={styles.subtitleRow}>
              <Text style={styles.subtitle}>Jagabans LA Management</Text>
              {isSuperAdmin && !viewAsAdmin && (
                <View style={styles.superAdminBadge}>
                      <IconSymbol 
                        name="shield.checkered" // SF Symbol for iOS
                        size={12} 
                        color="#FFFFFF" 
                      />
                  <Text style={styles.superAdminBadgeText}>Super Admin</Text>
                </View>
              )}
              {(isAdmin && !isSuperAdmin) || (isSuperAdmin && viewAsAdmin) ? (
                <View style={styles.adminBadge}>
                      <IconSymbol 
                        name="shield.lefthalf.filled" // SF Symbol for iOS
                        size={12} 
                        color="#FFFFFF" 
                      />
                  <Text style={styles.adminBadgeText}>Admin</Text>
                </View>
              ) : null}
            </View>
          </View>
          <View style={styles.headerButtons}>
            <Pressable
              style={styles.userProfileIconButton}
              onPress={handleUserProfilePress}
            >
                  <IconSymbol 
                    name="person.circle.fill" // SF Symbol for iOS
                    size={24} 
                    color={colors.primary} 
                  />
            </Pressable>
            <Pressable style={styles.logoutButton} onPress={handleLogout}>
                  <IconSymbol 
                    name="rectangle.portrait.and.arrow.forward" // SF Symbol for iOS
                    size={24} 
                    color={colors.primary} 
                  />
            </Pressable>
          </View>
        </View>

        {isSuperAdmin && (
          <View style={styles.roleSwitcherContainer}>
            <View style={styles.roleSwitcher}>
              <View style={styles.roleSwitcherLeft}>
                  <IconSymbol 
                    name={viewAsAdmin ? "shield.lefthalf.filled" : "shield.checkered"} 
                    size={20} 
                    color={colors.primary} 
                  />
                <Text style={styles.roleSwitcherLabel}>
                  {viewAsAdmin ? "Viewing as Admin" : "Viewing as Super Admin"}
                </Text>
              </View>
              <Switch
                value={viewAsAdmin}
                onValueChange={handleToggleViewMode}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#FFFFFF"
                ios_backgroundColor={colors.border}
              />
            </View>
            <Text style={styles.roleSwitcherHint}>
              {viewAsAdmin 
                ? "Toggle to view super admin features" 
                : "Toggle to preview admin view"}
            </Text>
          </View>
        )}

        {shouldShowAnalytics && (
          <View style={styles.statsContainer}>
            <View style={styles.statCard}>
                <IconSymbol 
                  name="cart.fill" // SF Symbol for iOS
                  size={32} 
                  color={colors.primary} 
                />
              {statsLoading ? (
                <ActivityIndicator
                  color={colors.primary}
                  style={{ marginVertical: 8 }}
                />
              ) : (
                <Text style={styles.statValue}>{stats.totalOrders}</Text>
              )}
              <Text style={styles.statLabel}>Total Orders</Text>
            </View>
            <View style={styles.statCard}>
                <IconSymbol 
                  name="person.3" // SF Symbol for iOS
                  size={32} 
                  color="#4ECDC4" 
                />
              {statsLoading ? (
                <ActivityIndicator
                  color="#4ECDC4"
                  style={{ marginVertical: 8 }}
                />
              ) : (
                <Text style={styles.statValue}>{stats.activeUsers}</Text>
              )}
              <Text style={styles.statLabel}>Total Users</Text>
            </View>
            <View style={styles.statCard}>
              <IconSymbol 
                name="dollarsign.circle" // SF Symbol for iOS
                size={32} 
                color="#95E1D3" 
              />
              {statsLoading ? (
                <ActivityIndicator
                  color="#95E1D3"
                  style={{ marginVertical: 8 }}
                />
              ) : (
                <Text style={styles.statValue}>
                  ${(stats.revenue / 1000).toFixed(1)}K
                </Text>
              )}
              <Text style={styles.statLabel}>Revenue</Text>
            </View>
          </View>
        )}

        <View style={styles.sectionsContainer}>
          {adminSections.map((section) => (
            <Pressable
              key={section.id}
              style={({ pressed }) => [
                styles.sectionCard,
                pressed && styles.sectionCardPressed,
              ]}
              onPress={() => handleSectionPress(section.route)}
            >
              <View
                style={[
                  styles.sectionIcon,
                  { backgroundColor: section.color + "20" },
                ]}
              >
                <IconSymbol
                  name={section.icon}
                  size={32}
                  color={section.color}
                />
              </View>
              <View style={styles.sectionContent}>
                <Text style={styles.sectionTitle}>{section.title}</Text>
                <Text style={styles.sectionDescription}>
                  {section.description}
                </Text>
              </View>
              <IconSymbol
                name="chevron.right"
                size={24}
                color={colors.textSecondary}
              />
            </Pressable>
          ))}
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            ✅ Connected to Supabase for real-time syncing
          </Text>
        </View>
      </ScrollView>
      <Toast
        visible={toastVisible}
        message={toastMessage}
        type={toastType}
        onHide={() => setToastVisible(false)}
        currentColors={{ text: colors.text, background: colors.background, primary: colors.primary }}
      />
      <Dialog
        visible={dialogVisible}
        title={dialogConfig.title}
        message={dialogConfig.message}
        buttons={dialogConfig.buttons}
        onHide={() => setDialogVisible(false)}
        currentColors={{ text: colors.text, card: colors.card, primary: colors.primary, textSecondary: colors.textSecondary, background: colors.background }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollViewContent: {
    paddingBottom: 40,
  },
  loginScrollContent: {
    flexGrow: 1,
  },
  loginContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    minHeight: 600,
  },
  loginHeader: {
    alignItems: "center",
    marginBottom: 48,
  },
  loginTitle: {
    fontSize: 32,
    fontWeight: "bold",
    color: colors.text,
    marginTop: 16,
  },
  loginSubtitle: {
    fontSize: 18,
    color: colors.textSecondary,
    marginTop: 8,
  },
  loginForm: {
    width: "100%",
    maxWidth: 400,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: {
    flex: 1,
    marginLeft: 12,
    fontSize: 16,
    color: colors.text,
  },
  eyeIconButton: {
    padding: 4,
    marginLeft: 8,
  },
  rememberMeContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    marginTop: -8,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
  },
  rememberMeText: {
    fontSize: 14,
  },
  loginButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
  },
  loginButtonPressed: {
    opacity: 0.8,
  },
  loginButtonDisabled: {
    opacity: 0.7,
  },
  loginButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  loginButtonText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "600",
  },
  userProfileButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
    paddingVertical: 12,
    gap: 8,
    opacity: 0.7,
  },
  userProfileButtonText: {
    fontSize: 13,
    fontWeight: "500",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 16,
  },
  headerLeft: {
    flex: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: colors.text,
  },
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  superAdminBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF6B35',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  superAdminBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  adminBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  adminBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  headerButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  userProfileIconButton: {
    padding: 8,
    backgroundColor: colors.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  logoutButton: {
    padding: 8,
    backgroundColor: colors.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  roleSwitcherContainer: {
    marginHorizontal: 24,
    marginBottom: 16,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  roleSwitcher: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  roleSwitcherLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  roleSwitcherLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  roleSwitcherHint: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 8,
  },
  statsContainer: {
    flexDirection: "row",
    paddingHorizontal: 24,
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  statValue: {
    fontSize: 24,
    fontWeight: "bold",
    color: colors.text,
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
    textAlign: 'center',
  },
  sectionsContainer: {
    paddingHorizontal: 24,
    gap: 12,
  },
  sectionCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionCardPressed: {
    opacity: 0.7,
  },
  sectionIcon: {
    width: 56,
    height: 56,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  sectionContent: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.text,
  },
  sectionDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 4,
  },
  footer: {
    padding: 24,
    alignItems: "center",
  },
  footerText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: "center",
  },
});