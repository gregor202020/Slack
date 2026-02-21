/**
 * Mock expo-notifications for unit testing.
 */

export async function getPermissionsAsync() {
  return { status: 'granted' }
}

export async function requestPermissionsAsync() {
  return { status: 'granted' }
}

export async function getExpoPushTokenAsync() {
  return { data: 'mock-expo-push-token' }
}

export async function setNotificationChannelAsync() {
  return null
}
