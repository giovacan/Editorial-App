/**
 * Firebase Cloud Functions Index
 *
 * Exports all Cloud Functions for deployment.
 */

import * as admin from 'firebase-admin';

// Initialize Firebase Admin
admin.initializeApp();

// Export Cloud Functions
export { createCheckoutSession } from './createCheckoutSession';
export { createCustomerPortalSession } from './createCustomerPortalSession';
export { stripeWebhook } from './stripeWebhook';
