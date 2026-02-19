/**
 * Firebase Admin SDK initialization.
 *
 * Initializes Firebase Cloud Messaging for push notifications.
 * Requires FIREBASE_SERVICE_ACCOUNT env var with the JSON service account key.
 */

import admin from 'firebase-admin'

let firebaseApp: admin.app.App | null = null

export function initFirebase() {
  if (firebaseApp) return firebaseApp

  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!serviceAccount) {
    console.warn('FIREBASE_SERVICE_ACCOUNT not set, push notifications disabled')
    return null
  }

  try {
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(serviceAccount)),
    })
    console.log('Firebase Admin initialized')
    return firebaseApp
  } catch (error) {
    console.error('Failed to initialize Firebase:', error)
    return null
  }
}

export function getFirebaseApp() {
  return firebaseApp
}
