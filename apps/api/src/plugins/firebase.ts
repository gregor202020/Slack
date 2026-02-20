/**
 * Firebase Admin SDK initialization.
 *
 * Initializes Firebase Cloud Messaging for push notifications.
 * Requires FIREBASE_SERVICE_ACCOUNT env var with the JSON service account key.
 */

import admin from 'firebase-admin'

let firebaseApp: admin.app.App | null = null

/**
 * Initialize Firebase Admin SDK.
 *
 * Note: This is called before buildApp() in server.ts, so the
 * structured logger is not yet available. We use console here
 * intentionally — these are one-time startup messages.
 */
export function initFirebase() {
  if (firebaseApp) return firebaseApp

  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!serviceAccount) {
    // eslint-disable-next-line no-console
    console.warn('FIREBASE_SERVICE_ACCOUNT not set, push notifications disabled')
    return null
  }

  try {
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(serviceAccount)),
    })
    // eslint-disable-next-line no-console
    console.log('Firebase Admin initialized')
    return firebaseApp
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to initialize Firebase:', error)
    return null
  }
}

export function getFirebaseApp() {
  return firebaseApp
}
