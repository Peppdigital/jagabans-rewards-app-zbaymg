import * as Notifications from 'expo-notifications';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

export const playOrderReadySound = async () => {
  try {
    if (Platform.OS !== 'web') {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    if (Platform.OS !== 'web') {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '🎉 Order Ready!',
          body: 'Your order is ready for pickup or delivery',
          sound: true,                    // ✅ `true` = use device default sound
          priority: Notifications.AndroidNotificationPriority.MAX,
          ...(Platform.OS === 'android' && { channelId: 'orders_ready' }), // ✅ route to correct channel
        },
        trigger: null,
      });
    }
  } catch (error) {
    console.error('Error playing notification sound:', error);
  }
};

export const configureNotificationSound = async () => {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });

    if (Platform.OS === 'ios') {
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

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
        sound: null,               // ✅ valid here — Android channel accepts 'default'
        enableVibrate: true,
      });

      await Notifications.setNotificationChannelAsync('orders_ready', {
        name: 'Order Ready Alerts',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 200, 100, 200],
        lightColor: '#FF231F7C',
        sound: null,               // ✅ valid here too
        enableVibrate: true,
      });
    }
  } catch (error) {
    console.error('Error configuring notification sound:', error);
  }
};