/**
 * Firebase Admin SDK initialization.
 *
 * Initializes Firebase Cloud Messaging for push notifications.
 * Requires FIREBASE_SERVICE_ACCOUNT env var with the JSON service account key.
 */

import admin from 'firebase-admin';
import { logger } from '../lib/logger.js';

let firebaseApp: admin.app.App | null = null;

/**
 * Initialize Firebase Admin SDK.
 *
 * Must be called after buildApp() so the structured logger is available.
 */
export function initFirebase() {
  if (firebaseApp) return firebaseApp;

  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccount) {
    logger.warn('FIREBASE_SERVICE_ACCOUNT not set, push notifications disabled');
    return null;
  }

  try {
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(serviceAccount)),
    });
    logger.info('Firebase Admin initialized');
    return firebaseApp;
  } catch (error) {
    logger.error({ err: error }, 'Failed to initialize Firebase');
    return null;
  }
}

export function getFirebaseApp() {
  return firebaseApp;
}
