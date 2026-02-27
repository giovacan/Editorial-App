/**
 * Cloud Function: Create Customer Portal Session
 *
 * Creates a Stripe Billing Portal session for subscription management.
 * Allows users to update payment methods, cancel, etc.
 *
 * Usage:
 * const createPortalSession = httpsCallable(functions, 'createCustomerPortalSession');
 * const result = await createPortalSession({ uid: user.uid });
 * window.location.href = result.data.url;
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16',
});

interface PortalRequest {
  uid: string;
}

export const createCustomerPortalSession = functions.https.onCall(
  async (data: PortalRequest, context) => {
    // Verify user is authenticated
    if (!context.auth || !context.auth.uid) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be logged in');
    }

    const { uid } = data;

    // Verify UID matches authenticated user
    if (uid !== context.auth.uid) {
      throw new functions.https.HttpsError('permission-denied', 'Cannot access another user\'s portal');
    }

    try {
      // Get user document
      const userRef = admin.firestore().collection('users').doc(uid);
      const userSnap = await userRef.get();

      if (!userSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'User not found');
      }

      const userData = userSnap.data();
      const stripeCustomerId = userData?.stripeCustomerId;

      if (!stripeCustomerId) {
        throw new functions.https.HttpsError('failed-precondition', 'User has no Stripe customer ID');
      }

      const domain = process.env.DOMAIN || 'http://localhost:5173';

      // Create billing portal session
      const session = await stripe.billingPortal.sessions.create({
        customer: stripeCustomerId,
        return_url: `${domain}/books`,
      });

      if (!session.url) {
        throw new functions.https.HttpsError('internal', 'Failed to create portal session');
      }

      return { url: session.url };
    } catch (error) {
      console.error('Error creating customer portal session:', error);

      if (error instanceof functions.https.HttpsError) {
        throw error;
      }

      throw new functions.https.HttpsError('internal', `Failed to create portal session: ${error}`);
    }
  }
);
