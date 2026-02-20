import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

// Fallback al projectId del proyecto EAS por si Constants no lo expone (p. ej. en algunos entornos)
const EAS_PROJECT_ID_FALLBACK = 'e45648a5-c13e-4633-a255-4d906ddb758c';

const getExpoProjectId = () =>
  Constants?.expoConfig?.extra?.eas?.projectId ||
  Constants?.easConfig?.projectId ||
  Constants?.manifest?.extra?.eas?.projectId ||
  Constants?.manifest2?.extra?.eas?.projectId ||
  EAS_PROJECT_ID_FALLBACK;

export const registerForPushNotificationsAsync = async () => {
  if (!Device.isDevice) return null;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return null;
  const projectId = getExpoProjectId();
  try {
    const tokenResponse = projectId
      ? await Notifications.getExpoPushTokenAsync({ projectId })
      : await Notifications.getExpoPushTokenAsync();
    return tokenResponse?.data || null;
  } catch (err) {
    if (projectId === EAS_PROJECT_ID_FALLBACK) return null;
    try {
      const tokenResponse = await Notifications.getExpoPushTokenAsync();
      return tokenResponse?.data || null;
    } catch {
      return null;
    }
  }
};
