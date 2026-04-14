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
export declare const createCheckoutSession: functions.HttpsFunction & functions.Runnable<any>;
