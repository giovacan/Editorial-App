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
import * as admin from 'firebase-admin';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16',
});

export const stripeWebhook = functions.https.onRequest(async (req, res) => {
  const sig = req.headers['stripe-signature'] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET not configured');
    return res.status(500).send('Webhook secret not configured');
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return res.status(400).send(`Webhook Error: ${err}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).send(`Webhook handler error: ${error}`);
  }
});

/**
 * Handle checkout.session.completed
 *
 * Updates subscription or credits based on mode.
 */
async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  const uid = session.metadata?.firebaseUid;
  const type = session.metadata?.type;

  if (!uid) {
    console.error('No firebaseUid in session metadata');
    return;
  }

  const userRef = admin.firestore().collection('users').doc(uid);

  if (type === 'subscription') {
    // Subscription purchase
    const plan = session.metadata?.plan;
    const subscription = await stripe.subscriptions.retrieve(session.subscription as string);

    await userRef.update({
      'subscription.plan': plan,
      'subscription.stripeSubscriptionId': subscription.id,
      'subscription.status': 'active',
      'subscription.currentPeriodEnd': new Date(subscription.current_period_end * 1000),
    });

    console.log(`Subscription created for user ${uid}: plan=${plan}, subId=${subscription.id}`);
  } else if (type === 'credits') {
    // Credit purchase
    const packageId = session.metadata?.packageId;
    const creditsMap = {
      credits_10: 10,
      credits_50: 50,
      credits_100: 100,
    };

    const credits = creditsMap[packageId as keyof typeof creditsMap] || 0;

    // Increment credits (add to existing)
    const userSnap = await userRef.get();
    const currentCredits = userSnap.data()?.subscription?.credits || 0;

    await userRef.update({
      'subscription.credits': currentCredits + credits,
    });

    console.log(`Credits added for user ${uid}: +${credits} (total: ${currentCredits + credits})`);
  }
}

/**
 * Handle customer.subscription.updated
 *
 * Updates subscription status and billing period.
 */
async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const uid = subscription.metadata?.firebaseUid;

  if (!uid) {
    console.error('No firebaseUid in subscription metadata');
    return;
  }

  const userRef = admin.firestore().collection('users').doc(uid);

  const updateData: any = {
    'subscription.status': subscription.status,
    'subscription.currentPeriodEnd': new Date(subscription.current_period_end * 1000),
  };

  // If plan changed, update it
  if (subscription.items.data.length > 0) {
    const product = await stripe.products.retrieve(
      subscription.items.data[0].price.product as string
    );

    // Map product metadata to plan name
    const plan = product.metadata?.plan || 'pro';
    updateData['subscription.plan'] = plan;
  }

  await userRef.update(updateData);

  console.log(`Subscription updated for user ${uid}: status=${subscription.status}`);
}

/**
 * Handle customer.subscription.deleted
 *
 * Downgrades user to free plan.
 */
async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const uid = subscription.metadata?.firebaseUid;

  if (!uid) {
    console.error('No firebaseUid in subscription metadata');
    return;
  }

  const userRef = admin.firestore().collection('users').doc(uid);

  await userRef.update({
    'subscription.plan': 'free',
    'subscription.status': 'canceled',
    'subscription.stripeSubscriptionId': null,
  });

  console.log(`Subscription canceled for user ${uid}, downgraded to free`);
}

/**
 * Handle invoice.payment_failed
 *
 * Marks subscription as past due.
 */
async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const uid = invoice.metadata?.firebaseUid;

  if (!uid || !invoice.subscription) {
    console.error('No firebaseUid or subscription in invoice metadata');
    return;
  }

  const userRef = admin.firestore().collection('users').doc(uid);

  await userRef.update({
    'subscription.status': 'past_due',
  });

  console.log(`Payment failed for user ${uid}, subscription marked as past_due`);
}
