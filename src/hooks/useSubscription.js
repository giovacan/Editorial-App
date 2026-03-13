/**
 * useSubscription Hook
 *
 * Provides reactive access to user's subscription and plan information.
 * Auto-syncs with real-time Firestore updates.
 */

import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  subscribeToUserSubscription,
  getUserSubscription,
  PLAN_LIMITS,
  canCreateBook,
  canExport,
  getRemainingExports,
  getNextPlan,
  isSubscriptionActive
} from '../services/subscriptions';

/**
 * Hook to access user's subscription info and plan limits
 *
 * @returns {Object} {
 *   subscription: Subscription,
 *   planConfig: PlanConfig,
 *   loading: boolean,
 *   error: Error | null,
 *   canCreateBook: (count) => boolean,
 *   canExport: (usedCount) => boolean,
 *   getRemainingExports: (usedCount) => number,
 *   getNextPlan: () => string,
 *   isActive: () => boolean
 * }
 */
export function useSubscription() {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user?.uid) {
      setLoading(false);
      return;
    }

    let unsubscribe;
    let isMounted = true;

    (async () => {
      try {
        // Initial fetch
        const sub = await getUserSubscription(user.uid);
        if (isMounted) {
          setSubscription(sub);
          setError(null);
        }

        // Real-time subscription
        unsubscribe = subscribeToUserSubscription(user.uid, (updatedSub) => {
          if (isMounted) {
            setSubscription(updatedSub);
            setError(null);
          }
        });

        if (isMounted) {
          setLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          console.error('Error loading subscription:', err);
          setError(err);
          // Set default subscription on error
          setSubscription({
            plan: 'free',
            credits: 0,
            status: 'active'
          });
          setLoading(false);
        }
      }
    })();

    return () => {
      isMounted = false;
      if (unsubscribe) unsubscribe();
    };
  }, [user?.uid]);

  // Default subscription if not loaded yet
  const currentSubscription = subscription || {
    plan: 'free',
    credits: 0,
    status: 'active'
  };

  const planConfig = PLAN_LIMITS[currentSubscription.plan] || PLAN_LIMITS.free;

  return {
    subscription: currentSubscription,
    planConfig,
    loading,
    error,
    canCreateBook: (count) => canCreateBook(currentSubscription, count),
    canExport: (usedCount) => canExport(currentSubscription, usedCount),
    getRemainingExports: (usedCount) => getRemainingExports(currentSubscription, usedCount),
    getNextPlan: () => getNextPlan(currentSubscription.plan),
    isActive: () => isSubscriptionActive(currentSubscription)
  };
}
