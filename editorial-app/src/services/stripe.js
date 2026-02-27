/**
 * Stripe Service
 *
 * Handles Stripe integration for subscription and one-time purchases.
 * Uses Firebase Cloud Functions to create checkout sessions.
 */

import { loadStripe } from '@stripe/stripe-js';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

let stripePromise = null;

/**
 * Initialize Stripe with publishable key from environment
 *
 * Should only be called once. Subsequent calls return cached promise.
 *
 * @returns {Promise<Stripe>} Stripe instance
 */
export async function getStripe() {
  if (!stripePromise) {
    const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;

    if (!publishableKey) {
      console.error('VITE_STRIPE_PUBLISHABLE_KEY not found in environment');
      throw new Error('Stripe configuration missing');
    }

    stripePromise = loadStripe(publishableKey);
  }

  return stripePromise;
}

/**
 * Redirect to Stripe Checkout for subscription
 *
 * @param {string} plan - Plan to subscribe to ('pro' or 'premium')
 * @param {string} uid - User ID
 * @returns {Promise<void>} Redirects to Stripe or throws error
 */
export async function redirectToCheckout(plan, uid) {
  try {
    // Call Cloud Function to create checkout session
    const createCheckoutSession = httpsCallable(functions, 'createCheckoutSession');
    const result = await createCheckoutSession({ plan, uid });

    if (!result.data.url) {
      throw new Error('Failed to create checkout session');
    }

    // Redirect to Stripe Checkout
    window.location.href = result.data.url;
  } catch (error) {
    console.error('Error redirecting to checkout:', error);
    throw error;
  }
}

/**
 * Redirect to Stripe Customer Portal
 *
 * Allows user to manage subscription, update billing, cancel, etc.
 *
 * @param {string} uid - User ID
 * @returns {Promise<void>} Redirects to customer portal or throws error
 */
export async function redirectToCustomerPortal(uid) {
  try {
    // Call Cloud Function to create customer portal session
    const createCustomerPortalSession = httpsCallable(functions, 'createCustomerPortalSession');
    const result = await createCustomerPortalSession({ uid });

    if (!result.data.url) {
      throw new Error('Failed to create customer portal session');
    }

    // Redirect to customer portal
    window.location.href = result.data.url;
  } catch (error) {
    console.error('Error redirecting to customer portal:', error);
    throw error;
  }
}

/**
 * Redirect to Stripe Checkout for one-time credits purchase
 *
 * @param {string} packageId - Credit package ID (e.g., 'credits_10', 'credits_50')
 * @param {string} uid - User ID
 * @returns {Promise<void>} Redirects to Stripe or throws error
 */
export async function redirectToCreditsCheckout(packageId, uid) {
  try {
    // Call Cloud Function to create credits checkout session
    const createCheckoutSession = httpsCallable(functions, 'createCheckoutSession');
    const result = await createCheckoutSession({ packageId, uid });

    if (!result.data.url) {
      throw new Error('Failed to create credits checkout session');
    }

    // Redirect to Stripe Checkout
    window.location.href = result.data.url;
  } catch (error) {
    console.error('Error redirecting to credits checkout:', error);
    throw error;
  }
}

/**
 * Handle successful redirect from Stripe Checkout
 *
 * Called when user returns from Stripe after successful payment.
 * Query param: ?success=true or ?canceled=true
 *
 * @returns {boolean} True if returning from successful payment
 */
export function isCheckoutSuccess() {
  const params = new URLSearchParams(window.location.search);
  return params.get('success') === 'true';
}

/**
 * Handle canceled redirect from Stripe Checkout
 *
 * @returns {boolean} True if user canceled payment
 */
export function isCheckoutCanceled() {
  const params = new URLSearchParams(window.location.search);
  return params.get('canceled') === 'true';
}
