import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
} from 'firebase/firestore';
import { db } from './firebase';

const CONFIG_DOC = 'config';
const SYSTEM_COLLECTION = 'system';

/**
 * Get system configuration from Firestore
 * @returns {Promise<Object|null>}
 */
export async function getSystemConfig() {
  try {
    const docRef = doc(db, SYSTEM_COLLECTION, CONFIG_DOC);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      return docSnap.data();
    }
    return null;
  } catch (error) {
    console.error('Error fetching system config:', error);
    throw error;
  }
}

/**
 * Update system configuration in Firestore (admin only)
 * @param {Object} data - configuration data to update
 * @param {string} userId - UID of the admin updating
 * @returns {Promise<void>}
 */
export async function updateSystemConfig(data, userId) {
  try {
    const docRef = doc(db, SYSTEM_COLLECTION, CONFIG_DOC);
    const updateData = {
      ...data,
      updatedAt: new Date(),
      updatedBy: userId,
    };

    await setDoc(docRef, updateData, { merge: true });
  } catch (error) {
    console.error('Error updating system config:', error);
    throw error;
  }
}

/**
 * Subscribe to system configuration changes (real-time listener)
 * @param {Function} callback - called with config data whenever it changes
 * @returns {Function} - unsubscribe function
 */
export function subscribeToSystemConfig(callback) {
  try {
    const docRef = doc(db, SYSTEM_COLLECTION, CONFIG_DOC);

    return onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        callback(docSnap.data());
      } else {
        callback(null);
      }
    });
  } catch (error) {
    console.error('Error subscribing to system config:', error);
    throw error;
  }
}

/**
 * Initialize system configuration with defaults (if not exists)
 * @returns {Promise<void>}
 */
export async function initializeSystemConfig() {
  try {
    const config = await getSystemConfig();

    if (!config) {
      const defaultConfig = {
        // Stripe
        stripePublishableKey: '',
        stripeWebhookSecret: '',
        stripePriceIdPro: '',
        stripePriceIdPremium: '',

        // Plans
        plans: {
          free: {
            maxBooks: 3,
            maxExports: 5,
            features: ['pdf'],
            price: 0,
          },
          pro: {
            maxBooks: 50,
            maxExports: 100,
            features: ['pdf', 'epub', 'html'],
            price: 9.99,
          },
          premium: {
            maxBooks: -1,
            maxExports: -1,
            features: ['all'],
            price: 19.99,
          },
        },

        // App settings
        maintenanceMode: false,
        registrationEnabled: true,
        appVersion: '1.0.0',

        updatedAt: new Date(),
        updatedBy: 'system',
      };

      await setDoc(doc(db, SYSTEM_COLLECTION, CONFIG_DOC), defaultConfig);
    }
  } catch (error) {
    console.error('Error initializing system config:', error);
    throw error;
  }
}
