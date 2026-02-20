import * as Notifications from 'expo-notifications';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Play a sound notification when order status changes to ready
 * This will play a sound and haptic feedback on native platforms
 */
export const playOrderReadySound = async () => {
  try {
    // Haptic feedback for all platforms except web
    if (Platform.OS !== 'web') {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    // Send a notification with custom sound on native platforms
    if (Platform.OS !== 'web') {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '🎉 Order Ready!',
          body: 'Your order is ready for pickup or delivery',
          sound: 'default',
          priority: Notifications.AndroidNotificationPriority.MAX,
        },
        trigger: null,
      });
    }
  } catch (error) {
    console.error('Error playing notification sound:', error);
  }
};

/**
 * Configure notification settings on app startup
 * This ensures notifications are properly configured to show sounds
 */
export const configureNotificationSound = async () => {
  try {
    // Set notification handler to always show alert when received while app is open
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });

    // iOS-specific configuration
    if (Platform.OS === 'ios') {
      // Request permission for notifications if not already granted
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted') {
        console.log('Failed to get push token for push notification!');
        return;
      }
    }

    // Android-specific configuration
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
        sound: 'default',
        enableVibrate: true,
      });

      // Create a special channel for order notifications
      await Notifications.setNotificationChannelAsync('orders_ready', {
        name: 'Order Ready Alerts',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 200, 100, 200],
        lightColor: '#FF231F7C',
        sound: 'default',
        enableVibrate: true,
      });
    }
  } catch (error) {
    console.error('Error configuring notification sound:', error);
  }
};
