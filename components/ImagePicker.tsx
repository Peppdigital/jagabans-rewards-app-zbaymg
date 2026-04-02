import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  ActivityIndicator,
  Platform,
} from 'react-native';
import * as ImagePickerExpo from 'expo-image-picker';
import { IconSymbol } from '@/components/IconSymbol';
import { colors } from '@/styles/commonStyles';
import { imageService } from '@/services/supabaseService';
import * as Haptics from 'expo-haptics';
import { File } from 'expo-file-system';

interface ImagePickerProps {
  currentImageUrl?: string;
  onImageSelected: (imageUrl: string) => void;
  bucket: string;
  folder: string;
  label?: string;
  disabled?: boolean;
}

export default function ImagePicker({
  currentImageUrl,
  onImageSelected,
  bucket,
  folder,
  label = 'Image',
  disabled = false,
}: ImagePickerProps) {
  const [uploading, setUploading] = useState(false);
  const [localImageUri, setLocalImageUri] = useState<string | undefined>(currentImageUrl);

  const pickImage = async () => {
    if (disabled) return;

    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    try {
      // Request permissions
      const { status } = await ImagePickerExpo.requestMediaLibraryPermissionsAsync();
      
      if (status !== 'granted') {
        alert('Sorry, we need camera roll permissions to upload images.');
        return;
      }

      // Launch image picker
      const result = await ImagePickerExpo.launchImageLibraryAsync({
        mediaTypes: 'images' as any,
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        setLocalImageUri(asset.uri);
        await uploadImage(asset.uri);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      alert('Failed to pick image. Please try again.');
    }
  };

  const uploadImage = async (uri: string) => {
  try {
    setUploading(true);

    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 15);
    const fileExtension = uri.split('.').pop() || 'jpg';
    const fileName = `${folder}/${timestamp}-${randomString}.${fileExtension}`;

    // Use the new File API
    const file = new File(uri);
    
    // Read the file as bytes (returns Uint8Array)
    const bytes = await file.bytes();
    
    // Convert Uint8Array to ArrayBuffer
    const arrayBuffer = bytes.buffer;

    const { data, error } = await imageService.uploadImage(
      bucket,
      fileName,
      arrayBuffer, // Pass ArrayBuffer directly
      { contentType: `image/${fileExtension}`, upsert: true }
    );

    if (error) throw error;

    const publicUrl = imageService.getPublicUrl(bucket, fileName);
    onImageSelected(publicUrl!);

    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

  } catch (error) {
    console.error('Error uploading image:', error);
    alert('Failed to upload image. Please try again.');
    setLocalImageUri(currentImageUrl);
  } finally {
    setUploading(false);
  }
};

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      
      <Pressable
        style={[styles.imageContainer, disabled && styles.disabled]}
        onPress={pickImage}
        disabled={disabled || uploading}
      >
        {localImageUri ? (
          <Image source={{ uri: localImageUri }} style={styles.image} />
        ) : (
          <View style={styles.placeholder}>
            <IconSymbol name="image" size={48} color={colors.textSecondary} />
            <Text style={styles.placeholderText}>Tap to select image</Text>
          </View>
        )}
        
        {uploading && (
          <View style={styles.uploadingOverlay}>
            <ActivityIndicator size="large" color="#FFFFFF" />
            <Text style={styles.uploadingText}>Uploading...</Text>
          </View>
        )}

        {!uploading && localImageUri && (
          <View style={styles.changeOverlay}>
            <IconSymbol name="edit" size={24} color="#FFFFFF" />
            <Text style={styles.changeText}>Change Image</Text>
          </View>
        )}
      </Pressable>

      {localImageUri && !uploading && (
        <Text style={styles.hint}>Tap image to change</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  imageContainer: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  disabled: {
    opacity: 0.5,
  },
  image: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  placeholderText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  uploadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  uploadingText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  changeOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    opacity: 0,
  },
  changeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  hint: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
    textAlign: 'center',
  },
});