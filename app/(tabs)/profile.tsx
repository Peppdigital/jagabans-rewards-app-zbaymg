import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  Platform,
  TextInput,
  KeyboardAvoidingView,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { IconSymbol } from "@/components/IconSymbol";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import * as Haptics from "expo-haptics";
import Toast from "@/components/Toast";
import Dialog from "@/components/Dialog";
import { ActivityIndicator } from "react-native";
import { supabase } from "@/app/integrations/supabase/client";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from '@react-native-async-storage/async-storage';

// Constants for AsyncStorage keys
const STORAGE_KEYS = {
  REMEMBER_ME: '@remember_me',
  SAVED_EMAIL: '@saved_email',
  SAVED_PASSWORD: '@saved_password',
};

export default function ProfileScreen() {
  const router = useRouter();
  const { currentColors, userProfile, showToast, loadUserProfile } = useApp();
  const { isAuthenticated, signIn, signUp, signOut } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  
  // Toast state
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastType, setToastType] = useState<"success" | "error" | "info">(
    "success"
  );
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  
  // Dialog state
  const [dialogVisible, setDialogVisible] = useState(false);
  const [dialogConfig, setDialogConfig] = useState({
    title: '',
    message: '',
    buttons: [] as Array<{ text: string; onPress: () => void; style?: 'default' | 'destructive' | 'cancel' }>
  });

  // Check if user is admin or super_admin
  const isAdmin = userProfile?.userRole === 'admin' || userProfile?.userRole === 'super_admin';

  // Load saved credentials on mount
  useEffect(() => {
    loadSavedCredentials();
  }, []);

  const loadSavedCredentials = async () => {
    try {
      const [savedRememberMe, savedEmail, savedPassword] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.REMEMBER_ME),
        AsyncStorage.getItem(STORAGE_KEYS.SAVED_EMAIL),
        AsyncStorage.getItem(STORAGE_KEYS.SAVED_PASSWORD),
      ]);

      if (savedRememberMe === 'true' && savedEmail) {
        setRememberMe(true);
        setEmail(savedEmail);
        if (savedPassword) {
          setPassword(savedPassword);
        }
      }
    } catch (error) {
      console.error('Error loading saved credentials:', error);
    }
  };

  const saveCredentials = async (emailToSave: string, passwordToSave: string, shouldRemember: boolean) => {
    try {
      if (shouldRemember) {
        await AsyncStorage.setItem(STORAGE_KEYS.REMEMBER_ME, 'true');
        await AsyncStorage.setItem(STORAGE_KEYS.SAVED_EMAIL, emailToSave);
        await AsyncStorage.setItem(STORAGE_KEYS.SAVED_PASSWORD, passwordToSave);
      } else {
        await AsyncStorage.removeItem(STORAGE_KEYS.REMEMBER_ME);
        await AsyncStorage.removeItem(STORAGE_KEYS.SAVED_EMAIL);
        await AsyncStorage.removeItem(STORAGE_KEYS.SAVED_PASSWORD);
      }
    } catch (error) {
      console.error('Error saving credentials:', error);
    }
  };

  const clearSavedCredentials = async () => {
    try {
      await AsyncStorage.removeItem(STORAGE_KEYS.REMEMBER_ME);
      await AsyncStorage.removeItem(STORAGE_KEYS.SAVED_EMAIL);
      await AsyncStorage.removeItem(STORAGE_KEYS.SAVED_PASSWORD);
    } catch (error) {
      console.error('Error clearing saved credentials:', error);
    }
  };

  useEffect(() => {
    const fetchProfileImage = async () => {
      if (!userProfile?.profileImage) return;

      setImageLoading(true);

      try {
        const path = userProfile.profileImage; 
        let url = "";

        // If the saved value is already a full URL
        if (path.startsWith("http")) {
          url = path;
        } else {
          // Generate signed URL for private bucket
          const { data, error } = await supabase.storage
            .from("profile")
            .createSignedUrl(path, 60 * 60 * 24 * 7); // 7 days

          if (error) throw error;

          url = data.signedUrl;
        }

        setProfileImageUrl(url);
      } catch (err) {
        console.error("Failed to load profile image:", err);
        showLocalToast("error", "Could not load profile picture");
      } finally {
        setImageLoading(false);
      }
    };

    if (isAuthenticated) {
      fetchProfileImage();
    }
  }, [userProfile?.profileImage, isAuthenticated]);

  const handleRefresh = async () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setRefreshing(true);
    try {
      await loadUserProfile();
      showLocalToast('success', 'Profile refreshed');
    } catch (error) {
      console.error('Error refreshing profile:', error);
      showLocalToast('error', 'Failed to refresh profile');
    } finally {
      setRefreshing(false);
    }
  };
  
  const showLocalToast = (type: "success" | "error" | "info", message: string) => {
    setToastType(type);
    setToastMessage(message);
    setToastVisible(true);
  };

  const showDialog = (title: string, message: string, buttons: Array<{ text: string; onPress: () => void; style?: 'default' | 'destructive' | 'cancel' }>) => {
    setDialogConfig({ title, message, buttons });
    setDialogVisible(true);
  };

  const handleAuth = async () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    if (!email || !password) {
      showLocalToast("error", "Please fill in all required fields");
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      showLocalToast("error", "Please enter a valid email address");
      return;
    }

    // Password length validation
    if (password.length < 6) {
      showLocalToast("error", "Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    try {
      if (isSignUp) {
        if (!name) {
          showLocalToast("error", "Please enter your name");
          setLoading(false);
          return;
        }
        const { error } = await signUp(email, password, name, phone, inviteCode);
        if (error) {
          console.error('Sign up error:', error);
          // Handle specific error messages
          if (error.message?.includes('already registered')) {
            showLocalToast("error", "This email is already registered. Please sign in instead.");
          } else if (error.message?.includes('Invalid email')) {
            showLocalToast("error", "Please enter a valid email address");
          } else if (error.message?.includes('Password')) {
            showLocalToast("error", "Password must be at least 6 characters");
          } else {
            showLocalToast("error", error.message || "Sign up failed. Please try again.");
          }
        } else {
          let successMessage = "Account created! Please check your email to verify your account.";
          if (inviteCode && inviteCode.trim()) {
            successMessage += " Your referral bonus will be applied once your email is verified.";
          }
          showLocalToast("success", successMessage);
          
          // Save credentials if remember me is checked
          await saveCredentials(email, password, rememberMe);
          
          // Clear form after successful signup
          setEmail("");
          setPassword("");
          setName("");
          setPhone("");
          setInviteCode("");
          // Switch to sign in mode
          setIsSignUp(false);
          setShowPassword(false);
        }
      } else {
        const { error } = await signIn(email, password);
        if (error) {
          console.error('Sign in error:', error);
          // Handle specific error messages
          if (error.message?.includes('Invalid login credentials')) {
            showLocalToast("error", "Invalid email or password. Please try again.");
          } else if (error.message?.includes('Email not confirmed')) {
            showLocalToast("error", "Please verify your email before signing in. Check your inbox for the verification link.");
          } else if (error.message?.includes('Email')) {
            showLocalToast("error", "Please enter a valid email address");
          } else {
            showLocalToast("error", error.message || "Sign in failed. Please try again.");
          }
        } else {
          showLocalToast("success", "Welcome back!");
          
          // Save credentials if remember me is checked
          await saveCredentials(email, password, rememberMe);
          
          // Clear password after successful sign in (keep email if remember me is checked)
          setPassword("");
          setShowPassword(false);
        }
      }
    } catch (error: any) {
      console.error("Auth error:", error);
      showLocalToast("error", "An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    showDialog("Sign Out", "Are you sure you want to sign out?", [
      { 
        text: "Cancel", 
        onPress: () => {
          console.log("Sign out cancelled");
        }, 
        style: "cancel" 
      },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          console.log("Signing out...");
          try {
            await signOut();
            // Clear any form data
            setName("");
            setPhone("");
            setInviteCode("");
            setIsSignUp(false);
            setShowPassword(false);
            
            // Don't clear email and password if remember me is enabled
            if (!rememberMe) {
              setEmail("");
              setPassword("");
            }
            
            showLocalToast("success", "Signed out successfully");
          } catch (error) {
            console.error("Sign out error:", error);
            showLocalToast("error", "Failed to sign out. Please try again.");
          }
        },
      },
    ]);
  };

  const handleMenuPress = (route: string) => {
    console.log("Navigating to:", route);
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.push(route as any);
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

  if (!isAuthenticated) {
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
          <KeyboardAvoidingView
            style={styles.keyboardAvoidingView}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
          >
            <ScrollView
              style={styles.container}
              contentContainerStyle={styles.authContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.authHeader}>
                <IconSymbol
                  name="person.circle.fill"
                  size={80}
                  color={currentColors.primary}
                />
                <Text style={[styles.authTitle, { color: currentColors.text }]}>
                  {isSignUp ? "Create Account" : "Welcome Back"}
                </Text>
                <Text
                  style={[
                    styles.authSubtitle,
                    { color: currentColors.textSecondary },
                  ]}
                >
                  {isSignUp
                    ? "Sign up to start earning points"
                    : "Sign in to your account"}
                </Text>
              </View>

              <View style={styles.authForm}>
                {isSignUp && (
                  <LinearGradient
                    colors={[currentColors.cardGradientStart || currentColors.card, currentColors.cardGradientEnd || currentColors.card]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[
                      styles.inputContainer,
                      { borderColor: currentColors.border },
                    ]}
                  >
                    <IconSymbol
                      name="person"
                      size={20}
                      color={currentColors.textSecondary}
                    />
                    <TextInput
                      style={[styles.input, { color: currentColors.text }]}
                      placeholder="Full Name"
                      placeholderTextColor={currentColors.textSecondary}
                      value={name}
                      onChangeText={setName}
                      autoCapitalize="words"
                      editable={!loading}
                    />
                  </LinearGradient>
                )}

                <LinearGradient
                  colors={[currentColors.cardGradientStart || currentColors.card, currentColors.cardGradientEnd || currentColors.card]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[
                    styles.inputContainer,
                    { borderColor: currentColors.border },
                  ]}
                >
                  <IconSymbol
                    name="envelope"
                    size={20}
                    color={currentColors.textSecondary}
                  />
                  <TextInput
                    style={[styles.input, { color: currentColors.text }]}
                    placeholder="Email"
                    placeholderTextColor={currentColors.textSecondary}
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    editable={!loading}
                  />
                </LinearGradient>

                <LinearGradient
                  colors={[currentColors.cardGradientStart || currentColors.card, currentColors.cardGradientEnd || currentColors.card]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[
                    styles.inputContainer,
                    { borderColor: currentColors.border },
                  ]}
                >
                  <IconSymbol
                    name="lock"
                    size={20}
                    color={currentColors.textSecondary}
                  />
                  <TextInput
                    style={[styles.input, { color: currentColors.text }]}
                    placeholder="Password"
                    placeholderTextColor={currentColors.textSecondary}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    editable={!loading}
                  />
                  <Pressable
                    onPress={() => {
                      setShowPassword(!showPassword);
                      if (Platform.OS !== "web") {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }
                    }}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    disabled={loading}
                  >
                    <IconSymbol
                      name={showPassword ? "eye.slash.fill" : "eye.fill"}
                      size={20}
                      color={currentColors.textSecondary}
                    />
                  </Pressable>
                </LinearGradient>

                {/* Remember Me Checkbox - Only show on Sign In */}
                {!isSignUp && (
                  <Pressable
                    style={styles.rememberMeContainer}
                    onPress={toggleRememberMe}
                    disabled={loading}
                  >
                    <View
                      style={[
                        styles.checkbox,
                        { borderColor: currentColors.border },
                        rememberMe && { backgroundColor: currentColors.primary },
                      ]}
                    >
                      {rememberMe && (
                        <IconSymbol
                          name="checkmark"
                          size={16}
                          color={currentColors.card}
                        />
                      )}
                    </View>
                    <Text
                      style={[
                        styles.rememberMeText,
                        { color: currentColors.textSecondary },
                      ]}
                    >
                      Remember me
                    </Text>
                  </Pressable>
                )}

                {isSignUp && (
                  <>
                    <LinearGradient
                      colors={[currentColors.cardGradientStart || currentColors.card, currentColors.cardGradientEnd || currentColors.card]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={[
                        styles.inputContainer,
                        { borderColor: currentColors.border },
                      ]}
                    >
                      <IconSymbol
                        name="phone.fill"
                        size={20}
                        color={currentColors.textSecondary}
                      />
                      <TextInput
                        style={[styles.input, { color: currentColors.text }]}
                        placeholder="Phone (optional)"
                        placeholderTextColor={currentColors.textSecondary}
                        value={phone}
                        onChangeText={setPhone}
                        keyboardType="phone-pad"
                        editable={!loading}
                      />
                    </LinearGradient>

                    <LinearGradient
                      colors={[currentColors.cardGradientStart || currentColors.card, currentColors.cardGradientEnd || currentColors.card]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={[
                        styles.inputContainer,
                        { borderColor: currentColors.border },
                      ]}
                    >
                      <IconSymbol
                        name="gift.fill"
                        size={20}
                        color={currentColors.textSecondary}
                      />
                      <TextInput
                        style={[styles.input, { color: currentColors.text }]}
                        placeholder="Invite Code (optional)"
                        placeholderTextColor={currentColors.textSecondary}
                        value={inviteCode}
                        onChangeText={setInviteCode}
                        autoCapitalize="characters"
                        editable={!loading}
                      />
                    </LinearGradient>
                    <Text style={[styles.inviteCodeHint, { color: currentColors.textSecondary }]}>
                      Have a referral code? Enter it to earn bonus points!
                    </Text>
                  </>
                )}

                <LinearGradient
                  colors={[currentColors.primary, currentColors.secondary]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[
                    styles.authButton,
                    { opacity: loading ? 0.6 : 1 },
                  ]}
                >
                  <Pressable
                    style={styles.authButtonInner}
                    onPress={handleAuth}
                    disabled={loading}
                  >
                    {loading ? (
                      <View style={styles.loadingContainer}>
                        <ActivityIndicator size="small" color={currentColors.card} />
                        <Text style={[styles.authButtonText, { color: currentColors.card, marginLeft: 8 }]}>
                          Please wait...
                        </Text>
                      </View>
                    ) : (
                      <Text style={[styles.authButtonText, { color: currentColors.card }]}>
                        {isSignUp ? "Sign Up" : "Sign In"}
                      </Text>
                    )}
                  </Pressable>
                </LinearGradient>

                <Pressable
                  style={styles.switchButton}
                  onPress={() => {
                    setIsSignUp(!isSignUp);
                    // Clear form when switching (except email and password if remember me is on)
                    if (!rememberMe) {
                      setEmail("");
                      setPassword("");
                    }
                    setName("");
                    setPhone("");
                    setInviteCode("");
                    setShowPassword(false);
                  }}
                  disabled={loading}
                >
                  <Text
                    style={[
                      styles.switchButtonText,
                      { color: currentColors.textSecondary },
                    ]}
                  >
                    {isSignUp
                      ? "Already have an account? "
                      : "Don't have an account? "}
                    <Text
                      style={{ color: currentColors.primary, fontWeight: "600" }}
                    >
                      {isSignUp ? "Sign In" : "Sign Up"}
                    </Text>
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
          <Toast
            visible={toastVisible}
            message={toastMessage}
            type={toastType}
            onHide={() => setToastVisible(false)}
            currentColors={currentColors}
          />
          <Dialog
            visible={dialogVisible}
            title={dialogConfig.title}
            message={dialogConfig.message}
            buttons={dialogConfig.buttons}
            onHide={() => setDialogVisible(false)}
            currentColors={currentColors}
          />
        </SafeAreaView>
      </LinearGradient>
    );
  }

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
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={currentColors.secondary}
              colors={[currentColors.secondary]}
            />
          }
        >
          {/* Profile Header with Gradient */}
          <LinearGradient
            colors={[currentColors.cardGradientStart || currentColors.card, currentColors.cardGradientEnd || currentColors.card]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.profileHeader}
          >
            <View style={styles.profileImageContainer}>
              {imageLoading ? (
                <View
                  style={[
                    styles.profileImagePlaceholder,
                    { backgroundColor: currentColors.primary + "20" },
                  ]}
                >
                  <ActivityIndicator size="large" color={currentColors.primary} />
                </View>
              ) : profileImageUrl ? (
                <Image
                  source={{ uri: profileImageUrl }}
                  style={styles.profileImage}
                  onError={(error) => {
                    console.error("Image load error:", error);
                    setProfileImageUrl(null);
                  }}
                />
              ) : (
                <LinearGradient
                  colors={[currentColors.primary, currentColors.secondary]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.profileImagePlaceholder}
                >
                  <IconSymbol
                    name="person"
                    size={48}
                    color={currentColors.card}
                  />
                </LinearGradient>
              )}
              <LinearGradient
                colors={[currentColors.primary, currentColors.secondary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.editImageButton}
              >
                <Pressable
                  style={styles.editImageButtonInner}
                  onPress={() => handleMenuPress("/edit-profile")}
                >
                  <IconSymbol name="camera" size={16} color={currentColors.card} />
                </Pressable>
              </LinearGradient>
            </View>
            <Text style={[styles.profileName, { color: currentColors.text }]}>
              {userProfile?.name}
            </Text>
            <Text
              style={[
                styles.profileEmail,
                { color: currentColors.textSecondary },
              ]}
            >
              {userProfile?.email}
            </Text>

            <View style={styles.pointsCard}>
              <IconSymbol
                name="star.fill"
                size={32}
                color={currentColors.primary}
              />
              <View style={styles.pointsInfo}>
                <Text style={[styles.pointsValue, { color: currentColors.text }]}>
                  {userProfile?.points || 0}
                </Text>
                <Text
                  style={[
                    styles.pointsLabel,
                    { color: currentColors.textSecondary },
                  ]}
                >
                  Points Available
                </Text>
              </View>
            </View>
          </LinearGradient>

          {/* Menu Options */}
          <View style={styles.menuSection}>

            {/* Admin Dashboard - Only show for admin/super_admin */}
            {isAdmin && (
              <LinearGradient
                colors={[currentColors.cardGradientStart || currentColors.card, currentColors.cardGradientEnd || currentColors.card]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.menuItem}
              >
                <Pressable
                  style={styles.menuItemInner}
                  onPress={() => handleMenuPress("/admin")}
                >
                  <View
                    style={[styles.menuIcon, { backgroundColor: "#FF9800" + "20" }]}
                  >
                    <IconSymbol name="person.badge.shield.checkmark" size={24} color="#FF9800" />
                  </View>
                  <View style={styles.menuContent}>
                    <Text style={[styles.menuTitle, { color: currentColors.text }]}>
                      Admin Dashboard
                    </Text>
                    <Text
                      style={[
                        styles.menuSubtitle,
                        { color: currentColors.textSecondary },
                      ]}
                    >
                      Manage app settings and users
                    </Text>
                  </View>
                  <IconSymbol
                    name="chevron.right"
                    size={24}
                    color={currentColors.textSecondary}
                  />
                </Pressable>
              </LinearGradient>
            )}
            
            <LinearGradient
              colors={[currentColors.cardGradientStart || currentColors.card, currentColors.cardGradientEnd || currentColors.card]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.menuItem}
            >
              <Pressable
                style={styles.menuItemInner}
                onPress={() => handleMenuPress("/order-history")}
              >
                <View
                  style={[
                    styles.menuIcon,
                    { backgroundColor: currentColors.primary + "20" },
                  ]}
                >
                  <IconSymbol
                    name="receipt"
                    size={24}
                    color={currentColors.primary}
                  />
                </View>
                <View style={styles.menuContent}>
                  <Text style={[styles.menuTitle, { color: currentColors.text }]}>
                    Order History
                  </Text>
                  <Text
                    style={[
                      styles.menuSubtitle,
                      { color: currentColors.textSecondary },
                    ]}
                  >
                    {userProfile?.orders?.length || 0} orders
                  </Text>
                </View>
                <IconSymbol
                  name="chevron.right"
                  size={24}
                  color={currentColors.textSecondary}
                />
              </Pressable>
            </LinearGradient>

            {/* Only show Payment Methods on mobile */}
            {Platform.OS !== 'web' && (
              <LinearGradient
                colors={[currentColors.cardGradientStart || currentColors.card, currentColors.cardGradientEnd || currentColors.card]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.menuItem}
              >
                <Pressable
                  style={styles.menuItemInner}
                  onPress={() => handleMenuPress("/payment-methods")}
                >
                  <View
                    style={[styles.menuIcon, { backgroundColor: "#4ECDC4" + "20" }]}
                  >
                    <IconSymbol name="creditcard.fill" size={24} color="#4ECDC4" />
                  </View>
                  <View style={styles.menuContent}>
                    <Text style={[styles.menuTitle, { color: currentColors.text }]}>
                      Payment Methods
                    </Text>
                    <Text
                      style={[
                        styles.menuSubtitle,
                        { color: currentColors.textSecondary },
                      ]}
                    >
                      {userProfile?.paymentMethods?.length || 0} cards
                    </Text>
                  </View>
                  <IconSymbol
                    name="chevron.right"
                    size={24}
                    color={currentColors.textSecondary}
                  />
                </Pressable>
              </LinearGradient>
            )}

            <LinearGradient
              colors={[currentColors.cardGradientStart || currentColors.card, currentColors.cardGradientEnd || currentColors.card]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.menuItem}
            >
              <Pressable
                style={styles.menuItemInner}
                onPress={() => handleMenuPress("/events")}
              >
                <View
                  style={[styles.menuIcon, { backgroundColor: "#95E1D3" + "20" }]}
                >
                  <IconSymbol name="calendar" size={24} color="#95E1D3" />
                </View>
                <View style={styles.menuContent}>
                  <Text style={[styles.menuTitle, { color: currentColors.text }]}>
                    Events
                  </Text>
                  <Text
                    style={[
                      styles.menuSubtitle,
                      { color: currentColors.textSecondary },
                    ]}
                  >
                    View upcoming events
                  </Text>
                </View>
                <IconSymbol
                  name="chevron.right"
                  size={24}
                  color={currentColors.textSecondary}
                />
              </Pressable>
            </LinearGradient>

            {/* Reservations Option */}
            <LinearGradient
              colors={[currentColors.cardGradientStart || currentColors.card, currentColors.cardGradientEnd || currentColors.card]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.menuItem}
            >
              <Pressable
                style={styles.menuItemInner}
                onPress={() => handleMenuPress("/reservations")}
              >
                <View
                  style={[styles.menuIcon, { backgroundColor: "#FF6B6B" + "20" }]}
                >
                  <IconSymbol name="calendar.badge.clock" size={24} color="#FF6B6B" />
                </View>
                <View style={styles.menuContent}>
                  <Text style={[styles.menuTitle, { color: currentColors.text }]}>
                    Reservations
                  </Text>
                  <Text
                    style={[
                      styles.menuSubtitle,
                      { color: currentColors.textSecondary },
                    ]}
                  >
                    Make or view your reservations
                  </Text>
                </View>
                <IconSymbol
                  name="chevron.right"
                  size={24}
                  color={currentColors.textSecondary}
                />
              </Pressable>
            </LinearGradient>

            {/* Invite a Friend Option */}
            <LinearGradient
              colors={[currentColors.cardGradientStart || currentColors.card, currentColors.cardGradientEnd || currentColors.card]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.menuItem}
            >
              <Pressable
                style={styles.menuItemInner}
                onPress={() => handleMenuPress("/invite-friend")}
              >
                <View
                  style={[styles.menuIcon, { backgroundColor: "#2196F3" + "20" }]}
                >
                  <IconSymbol name="person.2.fill" size={24} color="#2196F3" />
                </View>
                <View style={styles.menuContent}>
                  <Text style={[styles.menuTitle, { color: currentColors.text }]}>
                    Invite a Friend
                  </Text>
                  <Text
                    style={[
                      styles.menuSubtitle,
                      { color: currentColors.textSecondary },
                    ]}
                  >
                    Share your referral code and earn rewards
                  </Text>
                </View>
                <IconSymbol
                  name="chevron.right"
                  size={24}
                  color={currentColors.textSecondary}
                />
              </Pressable>
            </LinearGradient>

            {/* Help & Support Option */}
            <LinearGradient
              colors={[currentColors.cardGradientStart || currentColors.card, currentColors.cardGradientEnd || currentColors.card]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.menuItem}
            >
              <Pressable
                style={styles.menuItemInner}
                onPress={() => handleMenuPress("/help")}
              >
                <View
                  style={[styles.menuIcon, { backgroundColor: "#9C27B0" + "20" }]}
                >
                  <IconSymbol name="questionmark.circle.fill" size={24} color="#9C27B0" />
                </View>
                <View style={styles.menuContent}>
                  <Text style={[styles.menuTitle, { color: currentColors.text }]}>
                    Help & Support
                  </Text>
                  <Text
                    style={[
                      styles.menuSubtitle,
                      { color: currentColors.textSecondary },
                    ]}
                  >
                    FAQs and contact information
                  </Text>
                </View>
                <IconSymbol
                  name="chevron.right"
                  size={24}
                  color={currentColors.textSecondary}
                />
              </Pressable>
            </LinearGradient>

            {/* Delete Account Option */}
            <LinearGradient
              colors={[currentColors.cardGradientStart || currentColors.card, currentColors.cardGradientEnd || currentColors.card]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.menuItem}
            >
              <Pressable
                style={styles.menuItemInner}
                onPress={() => handleMenuPress("/delete-account")}
              >
                <View
                  style={[styles.menuIcon, { backgroundColor: "#FF6B6B" + "20" }]}
                >
                  <IconSymbol name="person.crop.circle.badge.xmark" size={24} color="#FF6B6B" />
                </View>
                <View style={styles.menuContent}>
                  <Text style={[styles.menuTitle, { color: "#FF6B6B" }]}>
                    Delete Account
                  </Text>
                  <Text
                    style={[
                      styles.menuSubtitle,
                      { color: currentColors.textSecondary },
                    ]}
                  >
                    Permanently delete your account
                  </Text>
                </View>
                <IconSymbol
                  name="chevron.right"
                  size={24}
                  color={currentColors.textSecondary}
                />
              </Pressable>
            </LinearGradient>

            {/* Logout Option */}
            <LinearGradient
              colors={[currentColors.cardGradientStart || currentColors.card, currentColors.cardGradientEnd || currentColors.card]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.menuItem}
            >
              <Pressable
                style={styles.menuItemInner}
                onPress={handleSignOut}
              >
                <View
                  style={[styles.menuIcon, { backgroundColor: "#FF9800" + "20" }]}
                >
                  <IconSymbol name="rectangle.portrait.and.arrow.forward" size={24} color="#FF9800" />
                </View>
                <View style={styles.menuContent}>
                  <Text style={[styles.menuTitle, { color: currentColors.text }]}>
                    Sign Out
                  </Text>
                  <Text
                    style={[
                      styles.menuSubtitle,
                      { color: currentColors.textSecondary },
                    ]}
                  >
                    Sign out of your account
                  </Text>
                </View>
                <IconSymbol
                  name="chevron.right"
                  size={24}
                  color={currentColors.textSecondary}
                />
              </Pressable>
            </LinearGradient>
          </View>
        </ScrollView>
        <Toast
          visible={toastVisible}
          message={toastMessage}
          type={toastType}
          onHide={() => setToastVisible(false)}
          currentColors={currentColors}
        />
        <Dialog
          visible={dialogVisible}
          title={dialogConfig.title}
          message={dialogConfig.message}
          buttons={dialogConfig.buttons}
          onHide={() => setDialogVisible(false)}
          currentColors={currentColors}
        />
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
  keyboardAvoidingView: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  content: {
    paddingBottom: 120,
  },
  authContent: {
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 120,
  },
  authHeader: {
    alignItems: "center",
    marginBottom: 40,
  },
  authTitle: {
    fontSize: 28,
    fontWeight: "bold",
    marginTop: 16,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  authSubtitle: {
    fontSize: 16,
    marginTop: 8,
    textAlign: "center",
  },
  authForm: {
    width: "100%",
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 0,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
    borderWidth: 1,
    boxShadow: '0px 6px 20px rgba(212, 175, 55, 0.25)',
    elevation: 6,
  },
  input: {
    flex: 1,
    marginLeft: 12,
    fontSize: 16,
  },
  inviteCodeHint: {
    fontSize: 12,
    marginTop: -8,
    marginBottom: 8,
    marginLeft: 4,
    fontStyle: 'italic',
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
  authButton: {
    borderRadius: 0,
    marginTop: 8,
    boxShadow: '0px 8px 24px rgba(74, 215, 194, 0.4)',
    elevation: 8,
  },
  authButtonInner: {
    paddingVertical: 16,
    alignItems: "center",
  },
  authButtonText: {
    fontSize: 18,
    fontWeight: "600",
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchButton: {
    marginTop: 24,
    alignItems: "center",
  },
  switchButtonText: {
    fontSize: 14,
  },
  demoContainer: {
    marginTop: 32,
    padding: 16,
    borderRadius: 12,
    backgroundColor: "rgba(0, 0, 0, 0.05)",
  },
  demoText: {
    fontSize: 12,
    textAlign: "center",
  },
  adminButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
    paddingVertical: 12,
    gap: 8,
    opacity: 0.7,
  },
  adminButtonText: {
    fontSize: 13,
    fontWeight: "500",
  },
  profileHeader: {
    alignItems: "center",
    padding: 24,
    marginBottom: 16,
    boxShadow: '0px 8px 24px rgba(212, 175, 55, 0.3)',
    elevation: 8,
  },
  profileImageContainer: {
    position: "relative",
    marginBottom: 16,
  },
  profileImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    boxShadow: '0px 6px 20px rgba(0, 0, 0, 0.3)',
    elevation: 6,
  },
  profileImagePlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: "center",
    alignItems: "center",
    boxShadow: '0px 6px 20px rgba(0, 0, 0, 0.3)',
    elevation: 6,
  },
  editImageButton: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    boxShadow: '0px 4px 12px rgba(212, 175, 55, 0.4)',
    elevation: 6,
  },
  editImageButtonInner: {
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  profileName: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 4,
  },
  profileEmail: {
    fontSize: 16,
    marginBottom: 24,
  },
  pointsCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  pointsInfo: {
    alignItems: "flex-start",
  },
  pointsValue: {
    fontSize: 32,
    fontWeight: "bold",
  },
  pointsLabel: {
    fontSize: 14,
  },
  menuSection: {
    paddingHorizontal: 16,
    gap: 12,
  },
  menuItem: {
    borderRadius: 0,
    boxShadow: "0px 6px 20px rgba(212, 175, 55, 0.25)",
    elevation: 6,
  },
  menuItemInner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
  },
  menuIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
    boxShadow: '0px 4px 4px rgba(0, 0, 0, 0.15)',
  },
  menuContent: {
    flex: 1,
  },
  menuTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 2,
  },
  menuSubtitle: {
    fontSize: 14,
  },
});