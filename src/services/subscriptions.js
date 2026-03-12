/**
 * Subscription Service
 *
 * Handles Firestore subscription CRUD operations and plan validation helpers.
 */

import { db } from './firebase';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';

/**
 * Fetch user's current subscription from Firestore
 *
 * @param {string} uid - User ID
 * @returns {Promise<Subscription>} User's subscription object
 */
export async function getUserSubscription(uid) {
  try {
    const userDocRef = doc(db, 'users', uid);
    const userSnap = await getDoc(userDocRef);

    if (!userSnap.exists()) {
      // User doc doesn't exist, return default free subscription
      return {
        plan: 'free',
        credits: 0,
        status: 'active'
      };
    }

    const userData = userSnap.data();
    return userData.subscription || {
      plan: 'free',
      credits: 0,
      status: 'active'
    };
  } catch (error) {
    console.error('Error fetching subscription:', error);
    throw error;
  }
}

/**
 * Subscribe to real-time updates of user's subscription
 *
 * @param {string} uid - User ID
 * @param {Function} callback - Called with updated subscription
 * @returns {Function} Unsubscribe function
 */
export function subscribeToUserSubscription(uid, callback) {
  try {
    const userDocRef = doc(db, 'users', uid);
    return onSnapshot(userDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const userData = docSnap.data();
        callback(userData.subscription || {
          plan: 'free',
          credits: 0,
          status: 'active'
        });
      } else {
        callback({
          plan: 'free',
          credits: 0,
          status: 'active'
        });
      }
    });
  } catch (error) {
    console.error('Error subscribing to subscription:', error);
    throw error;
  }
}

/**
 * Plan configurations (max books, max exports, features)
 *
 * NOTE: These should match the SystemConfig in Firestore,
 * but we provide defaults here for immediate UX.
 */
export const PLAN_LIMITS = {
  free: {
    maxBooks: 3,
    maxExports: 5,
    features: ['Edición básica', 'Exportación PDF', 'Sin watermark']
  },
  pro: {
    maxBooks: 20,
    maxExports: 50,
    features: ['Todo en Free', 'Exportación a Word/ePub', 'Soporte prioritario']
  },
  premium: {
    maxBooks: -1, // unlimited
    maxExports: -1, // unlimited
    features: ['Todo en Pro', 'Colaboración en equipo', 'Integración API']
  }
};

/**
 * Check if user can create a new book based on their plan
 *
 * @param {Subscription} subscription - User's subscription
 * @param {number} currentBookCount - How many books user already has
 * @returns {boolean} True if user can create another book
 */
export function canCreateBook(subscription, currentBookCount) {
  const limits = PLAN_LIMITS[subscription.plan];
  if (!limits) return false;

  // Unlimited books
  if (limits.maxBooks === -1) return true;

  // Check current count vs limit
  return currentBookCount < limits.maxBooks;
}

/**
 * Check if user can create another export based on their plan and remaining credits
 *
 * @param {Subscription} subscription - User's subscription
 * @param {number} currentExportCount - How many exports user has already done this period
 * @returns {boolean} True if user can export
 */
export function canExport(subscription, currentExportCount = 0) {
  const limits = PLAN_LIMITS[subscription.plan];
  if (!limits) return false;

  // Unlimited exports
  if (limits.maxExports === -1) return true;

  // For plans with limited exports, check against limit + available credits
  const totalAvailable = limits.maxExports + (subscription.credits || 0);
  return currentExportCount < totalAvailable;
}

/**
 * Get the number of exports remaining for this period
 *
 * @param {Subscription} subscription - User's subscription
 * @param {number} usedExports - How many exports used this period
 * @returns {number} Remaining exports (or -1 for unlimited)
 */
export function getRemainingExports(subscription, usedExports = 0) {
  const limits = PLAN_LIMITS[subscription.plan];
  if (!limits) return 0;

  if (limits.maxExports === -1) return -1; // unlimited

  const planLimit = limits.maxExports;
  const credits = subscription.credits || 0;
  const totalAvailable = planLimit + credits;

  return Math.max(0, totalAvailable - usedExports);
}

/**
 * Get the next plan in the hierarchy
 *
 * @param {string} currentPlan - Current subscription plan
 * @returns {string} Next plan upgrade option
 */
export function getNextPlan(currentPlan) {
  const planHierarchy = { free: 'pro', pro: 'premium', premium: 'premium' };
  return planHierarchy[currentPlan] || 'pro';
}

/**
 * Format subscription status for display
 *
 * @param {string} status - Subscription status (active, past_due, canceled, trialing)
 * @returns {string} Human-readable status
 */
export function formatSubscriptionStatus(status) {
  const labels = {
    active: 'Activo',
    past_due: 'Pago pendiente',
    canceled: 'Cancelado',
    trialing: 'Período de prueba'
  };
  return labels[status] || 'Desconocido';
}

/**
 * Check if subscription is in a valid/active state
 *
 * @param {Subscription} subscription - User's subscription
 * @returns {boolean} True if subscription is active
 */
export function isSubscriptionActive(subscription) {
  const status = subscription.status || 'active';
  return status === 'active' || status === 'trialing';
}

/**
 * Check if subscription period has ended (for display purposes)
 *
 * @param {Subscription} subscription - User's subscription
 * @returns {boolean} True if current period has ended
 */
export function isPeriodEnded(subscription) {
  if (!subscription.currentPeriodEnd) return false;

  const endDate = subscription.currentPeriodEnd instanceof Date
    ? subscription.currentPeriodEnd
    : new Date(subscription.currentPeriodEnd);

  return new Date() > endDate;
}

/**
 * Get days remaining in current billing period
 *
 * @param {Subscription} subscription - User's subscription
 * @returns {number} Days remaining (0 if period ended)
 */
export function getDaysRemaining(subscription) {
  if (!subscription.currentPeriodEnd) return 0;

  const endDate = subscription.currentPeriodEnd instanceof Date
    ? subscription.currentPeriodEnd
    : new Date(subscription.currentPeriodEnd);

  const now = new Date();
  const diffMs = endDate - now;

  if (diffMs <= 0) return 0;

  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}
