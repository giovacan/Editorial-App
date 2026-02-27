/**
 * Cloud Function: Create Checkout Session
 *
 * Creates a Stripe checkout session for subscriptions or one-time credit purchases.
 * Callable from frontend with plan or packageId.
 *
 * Usage:
 * const createCheckoutSession = httpsCallable(functions, 'createCheckoutSession');
 * const result = await createCheckoutSession({ plan: 'pro', uid: user.uid });
 * window.location.href = result.data.url;
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16',
});

interface CheckoutRequest {
  plan?: string; // 'pro' | 'premium'
  packageId?: string; // 'credits_10' | 'credits_50' | 'credits_100'
  uid: string;
}

export const createCheckoutSession = functions.https.onCall(
  async (data: CheckoutRequest, context) => {
    // Verify user is authenticated
    if (!context.auth || !context.auth.uid) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be logged in');
    }

    const { uid, plan, packageId } = data;

    // Verify UID matches authenticated user (unless admin)
    if (uid !== context.auth.uid) {
      throw new functions.https.HttpsError('permission-denied', 'Cannot create session for another user');
    }

    try {
      // Get user document
      const userRef = admin.firestore().collection('users').doc(uid);
      const userSnap = await userRef.get();

      if (!userSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'User not found');
      }

      const userData = userSnap.data() || {};
      let stripeCustomerId = userData.stripeCustomerId;

      // Get system config for price IDs
      const configRef = admin.firestore().collection('system').doc('config');
      const configSnap = await configRef.get();

      if (!configSnap.exists) {
        throw new functions.https.HttpsError('internal', 'System config not found');
      }

      const config = configSnap.data();
      const domain = process.env.DOMAIN || 'http://localhost:5173';

      // Create customer if needed
      if (!stripeCustomerId) {
        const customer = await stripe.customers.create({
          email: userData.email,
          metadata: {
            firebaseUid: uid,
          },
        });
        stripeCustomerId = customer.id;

        // Save customer ID
        await userRef.update({
          stripeCustomerId,
        });
      }

      // Create session based on type
      let session;

      if (plan) {
        // Subscription session (monthly recurring)
        const planConfig = {
          pro: config.stripePriceIdPro,
          premium: config.stripePriceIdPremium,
        };

        const priceId = planConfig[plan as keyof typeof planConfig];

        if (!priceId) {
          throw new functions.https.HttpsError('invalid-argument', `Unknown plan: ${plan}`);
        }

        session = await stripe.checkout.sessions.create({
          customer: stripeCustomerId,
          mode: 'subscription',
          payment_method_types: ['card'],
          line_items: [
            {
              price: priceId,
              quantity: 1,
            },
          ],
          success_url: `${domain}/pricing?success=true`,
          cancel_url: `${domain}/pricing?canceled=true`,
          metadata: {
            firebaseUid: uid,
            type: 'subscription',
            plan,
          },
        });
      } else if (packageId) {
        // One-time credit purchase
        const creditConfig = {
          credits_10: config.stripePriceIdCredits10,
          credits_50: config.stripePriceIdCredits50,
          credits_100: config.stripePriceIdCredits100,
        };

        const priceId = creditConfig[packageId as keyof typeof creditConfig];

        if (!priceId) {
          throw new functions.https.HttpsError('invalid-argument', `Unknown credit package: ${packageId}`);
        }

        session = await stripe.checkout.sessions.create({
          customer: stripeCustomerId,
          mode: 'payment',
          payment_method_types: ['card'],
          line_items: [
            {
              price: priceId,
              quantity: 1,
            },
          ],
          success_url: `${domain}/pricing?success=true`,
          cancel_url: `${domain}/pricing?canceled=true`,
          metadata: {
            firebaseUid: uid,
            type: 'credits',
            packageId,
          },
        });
      } else {
        throw new functions.https.HttpsError('invalid-argument', 'Must provide plan or packageId');
      }

      if (!session.url) {
        throw new functions.https.HttpsError('internal', 'Failed to create checkout session');
      }

      return { url: session.url };
    } catch (error) {
      console.error('Error creating checkout session:', error);

      if (error instanceof functions.https.HttpsError) {
        throw error;
      }

      throw new functions.https.HttpsError('internal', `Failed to create checkout session: ${error}`);
    }
  }
);
