/**
 * Push notification registration and handling.
 *
 * - Requests permission and retrieves the Expo push token
 * - Registers the token with the backend
 * - Sets up notification handlers for foreground and tap events
 */

import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import Constants from 'expo-constants'
import { apiClient } from './api'

// Configure how notifications appear when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
})

/**
 * Request notification permissions and get the push token.
 * Returns the token string or null if permissions denied or unavailable.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  // Push notifications don't work on simulators
  if (!Device.isDevice) {
    console.warn('[notifications] Push notifications require a physical device')
    return null
  }

  // Check existing permissions
  const { status: existingStatus } = await Notifications.getPermissionsAsync()
  let finalStatus = existingStatus

  // Request permission if not already granted
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync()
    finalStatus = status
  }

  if (finalStatus !== 'granted') {
    console.warn('[notifications] Permission not granted')
    return null
  }

  // Android requires a notification channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#0170B9',
    })
  }

  // Get push token
  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined
  const tokenData = await Notifications.getExpoPushTokenAsync({
    projectId,
  })

  return tokenData.data
}

/**
 * Register the push token with the backend so the server can send push notifications.
 */
export async function registerTokenWithBackend(pushToken: string): Promise<void> {
  try {
    await apiClient.post('/notifications/register', {
      token: pushToken,
      platform: Platform.OS,
    })
    console.log('[notifications] Token registered with backend')
  } catch (err) {
    console.error('[notifications] Failed to register token:', err)
  }
}

/**
 * Set up listeners for incoming notifications and notification taps.
 * Returns a cleanup function to remove the listeners.
 */
export function setupNotificationListeners(
  onNotificationReceived?: (notification: Notifications.Notification) => void,
  onNotificationTapped?: (response: Notifications.NotificationResponse) => void,
): () => void {
  // Fired when a notification is received while app is foregrounded
  const receivedSubscription = Notifications.addNotificationReceivedListener(
    (notification) => {
      console.log('[notifications] Received:', notification.request.identifier)
      onNotificationReceived?.(notification)
    },
  )

  // Fired when user taps on a notification
  const responseSubscription = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      console.log('[notifications] Tapped:', response.notification.request.identifier)
      onNotificationTapped?.(response)
    },
  )

  return () => {
    receivedSubscription.remove()
    responseSubscription.remove()
  }
}
