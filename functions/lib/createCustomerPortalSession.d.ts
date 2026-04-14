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
export declare const createCustomerPortalSession: functions.HttpsFunction & functions.Runnable<any>;
