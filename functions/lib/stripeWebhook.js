"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.stripeWebhook = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const stripe_1 = __importDefault(require("stripe"));
const stripe = new stripe_1.default(process.env.STRIPE_SECRET_KEY || '', {
    apiVersion: '2023-10-16',
});
exports.stripeWebhook = functions.https.onRequest(async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
    if (!webhookSecret) {
        console.error('STRIPE_WEBHOOK_SECRET not configured');
        res.status(500).send('Webhook secret not configured');
        return;
    }
    let event;
    try {
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    }
    catch (err) {
        console.error('Webhook signature verification failed:', err);
        res.status(400).send(`Webhook Error: ${err}`);
        return;
    }
    try {
        switch (event.type) {
            case 'checkout.session.completed':
                await handleCheckoutSessionCompleted(event.data.object);
                break;
            case 'customer.subscription.updated':
                await handleSubscriptionUpdated(event.data.object);
                break;
            case 'customer.subscription.deleted':
                await handleSubscriptionDeleted(event.data.object);
                break;
            case 'invoice.payment_failed':
                await handlePaymentFailed(event.data.object);
                break;
            default:
                console.log(`Unhandled event type ${event.type}`);
        }
        res.status(200).json({ received: true });
    }
    catch (error) {
        console.error('Error processing webhook:', error);
        res.status(500).send(`Webhook handler error: ${error}`);
    }
});
/**
 * Handle checkout.session.completed
 *
 * Updates subscription or credits based on mode.
 */
async function handleCheckoutSessionCompleted(session) {
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
        const subscription = await stripe.subscriptions.retrieve(session.subscription);
        await userRef.update({
            'subscription.plan': plan,
            'subscription.stripeSubscriptionId': subscription.id,
            'subscription.status': 'active',
            'subscription.currentPeriodEnd': new Date(subscription.current_period_end * 1000),
        });
        console.log(`Subscription created for user ${uid}: plan=${plan}, subId=${subscription.id}`);
    }
    else if (type === 'credits') {
        // Credit purchase
        const packageId = session.metadata?.packageId;
        const creditsMap = {
            credits_10: 10,
            credits_50: 50,
            credits_100: 100,
        };
        const credits = creditsMap[packageId] || 0;
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
async function handleSubscriptionUpdated(subscription) {
    const uid = subscription.metadata?.firebaseUid;
    if (!uid) {
        console.error('No firebaseUid in subscription metadata');
        return;
    }
    const userRef = admin.firestore().collection('users').doc(uid);
    const updateData = {
        'subscription.status': subscription.status,
        'subscription.currentPeriodEnd': new Date(subscription.current_period_end * 1000),
    };
    // If plan changed, update it
    if (subscription.items.data.length > 0) {
        const product = await stripe.products.retrieve(subscription.items.data[0].price.product);
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
async function handleSubscriptionDeleted(subscription) {
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
async function handlePaymentFailed(invoice) {
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
//# sourceMappingURL=stripeWebhook.js.map