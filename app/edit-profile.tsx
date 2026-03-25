import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Platform,
  Image,
  ActivityIndicator,
  KeyboardAvoidingView,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { IconSymbol } from '@/components/IconSymbol';
import * as Haptics from 'expo-haptics';
import Toast from '@/components/Toast';
import Dialog from '@/components/Dialog';
import { imageService, userService } from '@/services/supabaseService';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase, SUPABASE_URL } from './integrations/supabase/client';

// ── Constants ────────────────────────────────────────────────────────────────

const GOOGLE_PLACES_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY || '';

// ── Types ────────────────────────────────────────────────────────────────────

interface AddressValidationResult {
  success: boolean;
  isValid: boolean;
  formattedAddress?: string;
  confidence?: 'high' | 'medium' | 'low';
  error?: string;
}

interface PlacesPrediction {
  place_id: string;
  description: string;
  structured_formatting: {
    main_text: string;
    secondary_text: string;
  };
}

export default function EditProfileScreen() {
  const router = useRouter();
  const { userProfile, currentColors, loadUserProfile } = useApp();
  const { user } = useAuth();
  
  const [name, setName] = useState(userProfile?.name || '');
  const [email, setEmail] = useState(userProfile?.email || '');
  const [phone, setPhone] = useState(userProfile?.phone || '');
  const [address, setAddress] = useState(userProfile?.address || '');
  const [profileImagePath, setProfileImagePath] = useState<string | null>(userProfile?.profileImage || null);
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null);
  
  const [uploadingImage, setUploadingImage] = useState(false);
  const [saving, setSaving] = useState(false);

  // Address autocomplete & validation
  const [addressValidation, setAddressValidation] = useState<AddressValidationResult | null>(null);
  const [isValidatingAddress, setIsValidatingAddress] = useState(false);
  const [addressTouched, setAddressTouched] = useState(false);
  const [placeSuggestions, setPlaceSuggestions] = useState<PlacesPrediction[]>([]);
  const [isFetchingSuggestions, setIsFetchingSuggestions] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionSelected, setSuggestionSelected] = useState(false);
  const placesDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addressInputRef = useRef<TextInput>(null);
  
  // Toast state
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error' | 'info'>('success');

  // Dialog state
  const [dialogVisible, setDialogVisible] = useState(false);
  const [dialogConfig, setDialogConfig] = useState({
    title: '',
    message: '',
    buttons: [] as Array<{ text: string; onPress: () => void; style?: 'default' | 'destructive' | 'cancel' }>
  });

  // Load signed URL on mount if profile image exists
  useEffect(() => {
    if (userProfile?.profileImage) {
      handleGetImageUrl(userProfile.profileImage);
    }
  }, []);

  const handleGetImageUrl = async (path: string) => {
    const { data: urlData } = await supabase.storage
      .from("profile")
      .createSignedUrl(path, 60 * 60);

    setProfileImageUrl(urlData?.signedUrl || null);
    
    return urlData?.signedUrl || null;
  };

  const showToast = (type: 'success' | 'error' | 'info', message: string) => {
    setToastType(type);
    setToastMessage(message);
    setToastVisible(true);
  };

  const showDialog = (title: string, message: string, buttons: Array<{ text: string; onPress: () => void; style?: 'default' | 'destructive' | 'cancel' }>) => {
    setDialogConfig({ title, message, buttons });
    setDialogVisible(true);
  };

  // ── Address validation helpers ────────────────────────────────────────────

  const getAddressValidationColor = useCallback(() => {
    if (!addressValidation) return currentColors.textSecondary;
    if (!addressValidation.isValid) return '#EF4444';
    if (addressValidation.confidence === 'high') return '#10B981';
    if (addressValidation.confidence === 'medium') return '#F59E0B';
    return currentColors.textSecondary;
  }, [addressValidation, currentColors.textSecondary]);

  const getAddressValidationIcon = useCallback((): string => {
    if (isValidatingAddress) return 'hourglass-empty';
    if (!addressValidation) return 'location-on';
    if (!addressValidation.isValid) return 'cancel';
    if (addressValidation.confidence === 'high') return 'check-circle';
    if (addressValidation.confidence === 'medium') return 'warning';
    return 'location-on';
  }, [isValidatingAddress, addressValidation]);

  const getAddressValidationMessage = useCallback(() => {
    if (isValidatingAddress) return 'Validating address...';
    if (!addressValidation) return '';
    if (!addressValidation.isValid) return 'Address could not be verified. Please check for errors.';
    if (addressValidation.confidence === 'high') return 'Address verified ✓';
    if (addressValidation.confidence === 'medium') return 'Address partially verified. Please review.';
    return 'Address verification failed.';
  }, [isValidatingAddress, addressValidation]);

  const validateAddress = useCallback(async (addr: string) => {
    if (!addr || addr.trim().length < 5) {
      setAddressValidation(null);
      return;
    }
    setIsValidatingAddress(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      const response = await fetch(`${SUPABASE_URL}/functions/v1/verify-address`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ address: addr }),
      });
      const result: AddressValidationResult = await response.json();
      setAddressValidation(result);
      if (result.isValid && result.formattedAddress) {
        setAddress(result.formattedAddress);
      }
    } catch (error) {
      console.error('Address validation error:', error);
      setAddressValidation({ success: false, isValid: false, error: 'Failed to validate address' });
    } finally {
      setIsValidatingAddress(false);
    }
  }, []);

  const fetchPlaceSuggestions = useCallback(async (input: string) => {
    if (!input || input.trim().length < 3 || !GOOGLE_PLACES_API_KEY) {
      setPlaceSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    setIsFetchingSuggestions(true);
    try {
      const url = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json');
      url.searchParams.set('input', input);
      url.searchParams.set('key', GOOGLE_PLACES_API_KEY);
      url.searchParams.set('types', 'address');
      url.searchParams.set('components', 'country:us');
      const response = await fetch(url.toString());
      const data = await response.json();
      if (data.status === 'OK' && data.predictions?.length > 0) {
        setPlaceSuggestions(data.predictions.slice(0, 5));
        setShowSuggestions(true);
      } else {
        setPlaceSuggestions([]);
        setShowSuggestions(false);
      }
    } catch (error) {
      console.error('Places autocomplete error:', error);
      setPlaceSuggestions([]);
      setShowSuggestions(false);
    } finally {
      setIsFetchingSuggestions(false);
    }
  }, []);

  const handleSelectSuggestion = useCallback(async (prediction: PlacesPrediction) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowSuggestions(false);
    setPlaceSuggestions([]);
    setSuggestionSelected(true);
    Keyboard.dismiss();

    let chosenAddress = prediction.description;
    if (GOOGLE_PLACES_API_KEY) {
      try {
        const url = new URL('https://maps.googleapis.com/maps/api/place/details/json');
        url.searchParams.set('place_id', prediction.place_id);
        url.searchParams.set('key', GOOGLE_PLACES_API_KEY);
        url.searchParams.set('fields', 'formatted_address');
        const response = await fetch(url.toString());
        const data = await response.json();
        if (data.status === 'OK' && data.result?.formatted_address) {
          chosenAddress = data.result.formatted_address;
        }
      } catch {
        // fallback to description
      }
    }

    setAddress(chosenAddress);
    setAddressTouched(true);
    setAddressValidation(null);
    validateAddress(chosenAddress);
  }, [validateAddress]);

  const handleAddressChange = useCallback((text: string) => {
    setAddress(text);
    setAddressTouched(true);
    setSuggestionSelected(false);
    setAddressValidation(null);
    if (placesDebounceRef.current) clearTimeout(placesDebounceRef.current);
    if (text.trim().length >= 3) {
      placesDebounceRef.current = setTimeout(() => fetchPlaceSuggestions(text), 350);
    } else {
      setPlaceSuggestions([]);
      setShowSuggestions(false);
    }
  }, [fetchPlaceSuggestions]);

  // Debounced validation on manual typing
  useEffect(() => {
    if (!addressTouched || !address.trim() || suggestionSelected) return;
    const id = setTimeout(() => validateAddress(address), 1000);
    return () => clearTimeout(id);
  }, [address, addressTouched, suggestionSelected, validateAddress]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => { if (placesDebounceRef.current) clearTimeout(placesDebounceRef.current); };
  }, []);

  const renderPlacesSuggestions = () => {
    if (!showSuggestions && !isFetchingSuggestions) return null;
    return (
      <View style={styles.suggestionsDropdown}>
        {isFetchingSuggestions && placeSuggestions.length === 0 ? (
          <View style={styles.suggestionsLoadingRow}>
            <ActivityIndicator size="small" color={currentColors.secondary} />
            <Text style={[styles.suggestionsLoadingText, { color: currentColors.textSecondary }]}>Finding addresses...</Text>
          </View>
        ) : (
          <>
            {placeSuggestions.map((prediction, index) => (
              <Pressable
                key={prediction.place_id}
                style={({ pressed }) => [
                  styles.suggestionRow,
                  { borderBottomColor: currentColors.border },
                  index === placeSuggestions.length - 1 && styles.suggestionRowLast,
                  pressed && { backgroundColor: currentColors.background },
                ]}
                onPress={() => handleSelectSuggestion(prediction)}
              >
                <View style={[styles.suggestionIconWrapper, { backgroundColor: currentColors.background, borderColor: currentColors.border }]}>
                  <IconSymbol name="location-on" size={14} color={currentColors.secondary} />
                </View>
                <View style={styles.suggestionTextContainer}>
                  <Text style={[styles.suggestionMainText, { color: currentColors.text }]} numberOfLines={1}>
                    {prediction.structured_formatting.main_text}
                  </Text>
                  <Text style={[styles.suggestionSecondaryText, { color: currentColors.textSecondary }]} numberOfLines={1}>
                    {prediction.structured_formatting.secondary_text}
                  </Text>
                </View>
                <IconSymbol name="arrow-forward" size={14} color={currentColors.textSecondary} />
              </Pressable>
            ))}
            <View style={[styles.poweredByGoogle, { borderTopColor: currentColors.border }]}>
              <Text style={[styles.poweredByGoogleText, { color: currentColors.textSecondary }]}>powered by Google</Text>
            </View>
          </>
        )}
      </View>
    );
  };

  const handleSave = async () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    if (!name || !email) {
      showToast('error', 'Please fill in required fields');
      return;
    }

    if (!user?.id) {
      showToast('error', 'User not authenticated');
      return;
    }

    setSaving(true);
    try {
      // Determine which image path to save
      const imagePathToSave = profileImagePath || userProfile?.profileImage;
      
      // Update profile in backend - save the path, not the signed URL
      const { data, error } = await userService.updateUserProfile(user.id, {
        name,
        email,
        phone,
        address,
        profileImage: imagePathToSave || undefined,
      });

      if (error) {
        console.error('Update error:', error);
        showToast('error', 'Failed to update profile');
        return;
      }

      // Reload user profile to get fresh data
      await loadUserProfile();
      
      showToast('success', 'Profile updated successfully!');
      
      setTimeout(() => {
        router.back();
      }, 1500);
    } catch (error: any) {
      console.error('Save error:', error);
      showToast('error', 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleImagePick = async () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    try {
      // Request permissions
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (permissionResult.granted === false) {
        showDialog('Permission Required', 'Permission to access camera roll is required', [
          { text: 'OK', onPress: () => {}, style: 'default' }
        ]);
        return;
      }

      // Launch image picker
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        await uploadImage(result.assets[0]);
      }
    } catch (error: any) {
      console.error('Image picker error:', error);
      showToast('error', 'Failed to pick image');
    }
  };

  const handleTakePhoto = async () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    try {
      // Request camera permissions
      const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
      
      if (permissionResult.granted === false) {
        showDialog('Permission Required', 'Permission to access camera is required', [
          { text: 'OK', onPress: () => {}, style: 'default' }
        ]);
        return;
      }

      // Launch camera
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        await uploadImage(result.assets[0]);
      }
    } catch (error: any) {
      console.error('Camera error:', error);
      showToast('error', 'Failed to take photo');
    }
  };

  const uploadImage = async (asset: ImagePicker.ImagePickerAsset) => {
    if (!user?.id) {
      showToast('error', 'User not authenticated');
      return;
    }
    setUploadingImage(true);
    
    try {
      // Generate unique filename
      const fileExt = asset.uri.split('.').pop()?.toLowerCase() || 'jpg';
      // const fileName = `${user.id}_${Date.now()}.${fileExt}`;
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;
      console.log('Uploading image:', filePath);

    const response = await fetch(asset.uri);
    const arrayBuffer = await response.arrayBuffer();

    console.log('ArrayBuffer size:', arrayBuffer.byteLength);

    const mimeType = asset.mimeType || `image/${fileExt}`;

    const { data, error } = await imageService.uploadImage(
      'profile',
      filePath,
      arrayBuffer,
      {
        contentType: mimeType,
        upsert: true, // safe to keep; RLS still enforces folder ownership
      }
    );

    if (error) {
      console.error('Upload error:', error);
      throw error;
    }

    console.log('Upload successful:', data);

    setProfileImagePath(filePath);
    await handleGetImageUrl(filePath);

    console.log('Image path stored:', filePath);
    showToast('success', 'Image uploaded successfully');
  } catch (error: any) {
    console.error('Upload error:', error);
    showToast('error', `Failed to upload image: ${error.message || 'Unknown error'}`);
  } finally {
    setUploadingImage(false);
  }
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
          {/* Header with Gradient */}
          <LinearGradient
            colors={[currentColors.headerGradientStart || currentColors.card, currentColors.headerGradientEnd || currentColors.card]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.header, { borderBottomColor: currentColors.border }]}
          >
            <Pressable
              onPress={() => {
                if (Platform.OS !== 'web') {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }
                router.back();
              }}
              style={[styles.backButton, { backgroundColor: currentColors.background, borderColor: currentColors.border }]}
            >
              <IconSymbol name="chevron.left" size={24} color={currentColors.secondary} />
            </Pressable>
            <Text style={[styles.headerTitle, { color: currentColors.text }]}>Edit Profile</Text>
            <Pressable 
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color={currentColors.secondary} />
              ) : (
                <Text style={[styles.saveButton, { color: currentColors.secondary }]}>Save</Text>
              )}
            </Pressable>
          </LinearGradient>

          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
          >
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Profile Image Section */}
            <View style={styles.imageSection}>
              <View style={styles.imageContainer}>
                {uploadingImage ? (
                  <View style={[styles.imagePlaceholder, { backgroundColor: currentColors.secondary + '20' }]}>
                    <ActivityIndicator size="large" color={currentColors.secondary} />
                  </View>
                ) : profileImageUrl ? (
                  <Image 
                    source={{ uri: profileImageUrl }} 
                    style={styles.profileImage}
                    onError={() => {
                      console.error('Failed to load image:', profileImageUrl);
                      setProfileImageUrl(null);
                      showToast('error', 'Failed to load image');
                    }}
                  />
                ) : (
                  <LinearGradient
                    colors={[currentColors.secondary, currentColors.highlight]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.imagePlaceholder}
                  >
                    <IconSymbol name="person" size={48} color={currentColors.background} />
                  </LinearGradient>
                )}
              </View>
              
              <View style={styles.imageButtons}>
                <LinearGradient
                  colors={[currentColors.secondary, currentColors.highlight]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[styles.imageButton, uploadingImage && { opacity: 0.6 }]}
                >
                  <Pressable
                    style={styles.imageButtonInner}
                    onPress={handleImagePick}
                    disabled={uploadingImage}
                  >
                    <IconSymbol name="photo.fill" size={20} color={currentColors.background} />
                    <Text style={[styles.imageButtonText, { color: currentColors.background }]}>Gallery</Text>
                  </Pressable>
                </LinearGradient>
                
                <LinearGradient
                  colors={[currentColors.secondary, currentColors.highlight]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[styles.imageButton, uploadingImage && { opacity: 0.6 }]}
                >
                  <Pressable
                    style={styles.imageButtonInner}
                    onPress={handleTakePhoto}
                    disabled={uploadingImage}
                  >
                    <IconSymbol name="camera" size={20} color={currentColors.background} />
                    <Text style={[styles.imageButtonText, { color: currentColors.background }]}>Camera</Text>
                  </Pressable>
                </LinearGradient>
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: currentColors.text }]}>Full Name</Text>
              <TextInput
                style={[
                  styles.input, 
                  { 
                    backgroundColor: currentColors.card, 
                    color: currentColors.text, 
                    borderColor: currentColors.border
                  }
                ]}
                value={name}
                onChangeText={setName}
                placeholder="Enter your name"
                placeholderTextColor={currentColors.textSecondary}
                editable={!saving}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: currentColors.text }]}>Email</Text>
              <TextInput
                style={[
                  styles.input, 
                  { 
                    backgroundColor: currentColors.card, 
                    color: currentColors.text, 
                    borderColor: currentColors.border
                  }
                ]}
                value={email}
                onChangeText={setEmail}
                placeholder="Enter your email"
                placeholderTextColor={currentColors.textSecondary}
                keyboardType="email-address"
                autoCapitalize="none"
                editable={!saving}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: currentColors.text }]}>Phone</Text>
              <TextInput
                style={[
                  styles.input, 
                  { 
                    backgroundColor: currentColors.card, 
                    color: currentColors.text, 
                    borderColor: currentColors.border
                  }
                ]}
                value={phone}
                onChangeText={setPhone}
                placeholder="Enter your phone"
                placeholderTextColor={currentColors.textSecondary}
                keyboardType="phone-pad"
                editable={!saving}
              />
            </View>
            
            <View style={[styles.inputGroup, { zIndex: 100 }]}>
              <Text style={[styles.inputLabel, { color: currentColors.text }]}>Address</Text>
              <View style={styles.addressInputContainer}>
                <TextInput
                  ref={addressInputRef}
                  style={[
                    styles.input,
                    {
                      backgroundColor: currentColors.card,
                      color: currentColors.text,
                      borderColor: addressTouched && addressValidation
                        ? getAddressValidationColor()
                        : currentColors.border,
                      paddingRight: 48,
                    }
                  ]}
                  value={address}
                  onChangeText={handleAddressChange}
                  placeholder="Start typing your address..."
                  placeholderTextColor={currentColors.textSecondary}
                  editable={!saving}
                  multiline={false}
                  returnKeyType="done"
                  onFocus={() => {
                    if (address.trim().length >= 3 && placeSuggestions.length > 0) {
                      setShowSuggestions(true);
                    }
                  }}
                  onBlur={() => {
                    setTimeout(() => setShowSuggestions(false), 200);
                  }}
                  onSubmitEditing={() => {
                    setShowSuggestions(false);
                    validateAddress(address);
                  }}
                />
                <View style={styles.addressValidationIcon}>
                  {isValidatingAddress || isFetchingSuggestions ? (
                    <ActivityIndicator size="small" color={currentColors.secondary} />
                  ) : addressTouched && addressValidation ? (
                    <IconSymbol name={getAddressValidationIcon()} size={22} color={getAddressValidationColor()} />
                  ) : null}
                </View>
              </View>

              {/* Google Places dropdown */}
              {renderPlacesSuggestions()}

              {/* Validation message */}
              {addressTouched && addressValidation && !showSuggestions && (
                <View style={styles.validationMessage}>
                  <Text style={[styles.validationMessageText, { color: getAddressValidationColor() }]}>
                    {getAddressValidationMessage()}
                  </Text>
                </View>
              )}

              {/* Formatted address suggestion */}
              {!showSuggestions &&
                addressValidation?.isValid &&
                addressValidation.formattedAddress &&
                addressValidation.formattedAddress !== address && (
                  <LinearGradient
                    colors={[currentColors.cardGradientStart || currentColors.card, currentColors.cardGradientEnd || currentColors.card]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[styles.formattedAddressSuggestion, { borderColor: currentColors.border }]}
                  >
                    <View style={styles.suggestionHeader}>
                      <IconSymbol name="lightbulb" size={16} color={currentColors.secondary} />
                      <Text style={[styles.suggestionTitle, { color: currentColors.text }]}>Suggested Address</Text>
                    </View>
                    <Text style={[styles.suggestionAddress, { color: currentColors.textSecondary }]}>
                      {addressValidation.formattedAddress}
                    </Text>
                    <LinearGradient
                      colors={[currentColors.secondary, currentColors.highlight]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.useSuggestionButton}
                    >
                      <Pressable
                        style={styles.useSuggestionButtonInner}
                        onPress={() => {
                          if (addressValidation.formattedAddress) {
                            setAddress(addressValidation.formattedAddress);
                            setAddressTouched(false);
                            if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                          }
                        }}
                      >
                        <IconSymbol name="check" size={14} color={currentColors.background} />
                        <Text style={[styles.useSuggestionButtonText, { color: currentColors.background }]}>Use This Address</Text>
                      </Pressable>
                    </LinearGradient>
                  </LinearGradient>
                )}
            </View>
            {/* Info note about saving */}
            <LinearGradient
              colors={[currentColors.cardGradientStart || currentColors.card, currentColors.cardGradientEnd || currentColors.card]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.infoBox, { borderColor: currentColors.border }]}
            >
              <IconSymbol name="info.circle.fill" size={20} color={currentColors.secondary} />
              <Text style={[styles.infoText, { color: currentColors.text }]}>
                Changes will be saved to your profile when you tap Save
              </Text>
            </LinearGradient>
          </ScrollView>
          </KeyboardAvoidingView>
        </View>
        
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
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 24,
    borderBottomWidth: 2,
    boxShadow: '0px 6px 20px rgba(74, 215, 194, 0.3)',
    elevation: 8,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 0,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    boxShadow: '0px 4px 12px rgba(212, 175, 55, 0.25)',
    elevation: 4,
  },
  headerTitle: {
    fontSize: 32,
    fontFamily: 'PlayfairDisplay_700Bold',
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  saveButton: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },
  inputGroup: {
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    marginBottom: 8,
  },
  input: {
    borderRadius: 0,
    padding: 16,
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    borderWidth: 2,
    boxShadow: '0px 4px 12px rgba(212, 175, 55, 0.25)',
    elevation: 4,
  },
  imageSection: {
    alignItems: 'center',
    marginBottom: 32,
    paddingTop: 20,
  },
  imageContainer: {
    marginBottom: 20,
  },
  profileImage: {
    width: 120,
    height: 120,
    borderRadius: 64,
  },
  imagePlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  imageButton: {
    borderRadius: 0,
    boxShadow: '0px 8px 24px rgba(212, 175, 55, 0.4)',
    elevation: 8,
  },
  imageButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 8,
  },
  imageButtonText: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  // Address autocomplete styles
  addressInputContainer: {
    position: 'relative',
  },
  addressValidationIcon: {
    position: 'absolute',
    right: 16,
    top: 16,
  },
  suggestionsDropdown: {
    marginTop: 4,
    borderWidth: 2,
    borderColor: '#ccc',
    backgroundColor: '#fff',
    borderRadius: 0,
    overflow: 'hidden',
    boxShadow: '0px 8px 24px rgba(0,0,0,0.18)',
    elevation: 12,
    zIndex: 999,
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
    borderBottomWidth: 1,
  },
  suggestionRowLast: {
    borderBottomWidth: 0,
  },
  suggestionIconWrapper: {
    width: 28,
    height: 28,
    borderRadius: 0,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  suggestionTextContainer: { flex: 1 },
  suggestionMainText: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    lineHeight: 18,
  },
  suggestionSecondaryText: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
  suggestionsLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  suggestionsLoadingText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
  },
  poweredByGoogle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderTopWidth: 1,
  },
  poweredByGoogleText: {
    fontSize: 10,
    fontFamily: 'Inter_400Regular',
  },
  validationMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingHorizontal: 4,
  },
  validationMessageText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
  },
  formattedAddressSuggestion: {
    marginTop: 12,
    padding: 12,
    borderRadius: 0,
    borderWidth: 2,
    boxShadow: '0px 4px 12px rgba(74, 215, 194, 0.25)',
    elevation: 4,
  },
  suggestionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  suggestionTitle: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  suggestionAddress: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    marginBottom: 8,
    lineHeight: 20,
  },
  useSuggestionButton: {
    borderRadius: 0,
    boxShadow: '0px 4px 12px rgba(74, 215, 194, 0.3)',
    elevation: 4,
  },
  useSuggestionButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
    gap: 6,
  },
  useSuggestionButtonText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 0,
    gap: 12,
    marginTop: 8,
    borderWidth: 2,
    boxShadow: '0px 8px 24px rgba(212, 175, 55, 0.3)',
    elevation: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    lineHeight: 20,
  },
});