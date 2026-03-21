import React, { useState, useEffect } from 'react';
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
import { supabase } from './integrations/supabase/client';

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

          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
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
            
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: currentColors.text }]}>Address</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: currentColors.card,
                    color: currentColors.text,
                    borderColor: currentColors.border,
                    minHeight: 80,
                    textAlignVertical: 'top',
                  }
                ]}
                value={address}
                onChangeText={setAddress}
                placeholder="Enter your delivery address"
                placeholderTextColor={currentColors.textSecondary}
                multiline
                numberOfLines={3}
                editable={!saving}
              />
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