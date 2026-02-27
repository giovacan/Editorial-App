/**
 * Export Service
 *
 * Handles checking export permissions and deducting credits.
 */

import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { canExport, getRemainingExports } from './subscriptions';

/**
 * Check if user can export and get remaining quota
 *
 * @param {string} uid - User ID
 * @param {Object} subscription - User's subscription object
 * @returns {Promise<{canExport: boolean, remaining: number, message: string}>}
 */
export async function checkExportPermission(uid, subscription) {
  try {
    if (!canExport(subscription)) {
      const remaining = getRemainingExports(subscription);
      return {
        canExport: false,
        remaining,
        message: `Has alcanzado tu límite de exportaciones. Puedes comprar más créditos en /pricing`
      };
    }

    const remaining = getRemainingExports(subscription);
    return {
      canExport: true,
      remaining,
      message: ''
    };
  } catch (error) {
    console.error('Error checking export permission:', error);
    throw error;
  }
}

/**
 * Deduct one export from user's quota
 *
 * Reduces credits if user has subscription, or decrements monthly quota.
 *
 * @param {string} uid - User ID
 * @returns {Promise<{success: boolean, remainingExports: number}>}
 */
export async function deductExport(uid) {
  try {
    const userRef = doc(db, 'users', uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      throw new Error('User document not found');
    }

    const userData = userSnap.data();
    const subscription = userData.subscription || { plan: 'free', credits: 0 };
    const stats = userData.stats || { exportsCount: 0 };

    // Check if user has credits to deduct
    if (subscription.credits > 0) {
      // Use paid credits first
      await updateDoc(userRef, {
        'subscription.credits': subscription.credits - 1,
        'stats.exportsCount': (stats.exportsCount || 0) + 1,
        'stats.lastExportDate': new Date(),
      });

      return {
        success: true,
        remainingExports: subscription.credits - 1,
        creditsDeducted: true
      };
    }

    // Otherwise, deduct from monthly plan quota
    // Plan quotas reset monthly, so we just track count
    await updateDoc(userRef, {
      'stats.exportsCount': (stats.exportsCount || 0) + 1,
      'stats.lastExportDate': new Date(),
    });

    // Calculate remaining based on plan
    const planLimits = {
      free: 5,
      pro: 50,
      premium: -1 // unlimited
    };

    const planLimit = planLimits[subscription.plan] || 5;
    const remaining = planLimit === -1 ? -1 : Math.max(0, planLimit - ((stats.exportsCount || 0) + 1));

    return {
      success: true,
      remainingExports: remaining,
      creditsDeducted: false
    };
  } catch (error) {
    console.error('Error deducting export:', error);
    throw error;
  }
}

/**
 * Reset monthly export counters
 *
 * Should be called once per month for each user (via Cloud Task)
 * Resets stats.exportsCount to 0 for the new month
 *
 * @param {string} uid - User ID
 * @returns {Promise<void>}
 */
export async function resetMonthlyExports(uid) {
  try {
    const userRef = doc(db, 'users', uid);
    await updateDoc(userRef, {
      'stats.exportsCount': 0,
      'stats.monthResetDate': new Date(),
    });
  } catch (error) {
    console.error('Error resetting monthly exports:', error);
    throw error;
  }
}

/**
 * Get export statistics for a user
 *
 * @param {string} uid - User ID
 * @returns {Promise<{exportsThisMonth: number, totalExports: number, lastExportDate: Date}>}
 */
export async function getExportStats(uid) {
  try {
    const userRef = doc(db, 'users', uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      return {
        exportsThisMonth: 0,
        totalExports: 0,
        lastExportDate: null
      };
    }

    const { stats = {} } = userSnap.data();

    return {
      exportsThisMonth: stats.exportsCount || 0,
      totalExports: stats.totalExportsAllTime || 0,
      lastExportDate: stats.lastExportDate || null
    };
  } catch (error) {
    console.error('Error getting export stats:', error);
    throw error;
  }
}
