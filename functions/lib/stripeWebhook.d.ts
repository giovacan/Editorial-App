/**
 * Cloud Function: Stripe Webhook Handler
 *
 * Receives and processes Stripe webhook events:
 * - checkout.session.completed: Update subscription/credits
 * - customer.subscription.updated: Update status/period
 * - customer.subscription.deleted: Downgrade to free
 * - invoice.payment_failed: Mark as past_due
 *
 * Deploy as HTTP function with webhook endpoint exposed.
 */
import * as functions from 'firebase-functions';
export declare const stripeWebhook: functions.HttpsFunction;
