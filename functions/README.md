# Firebase Cloud Functions - Fase 3 Stripe Integration

## Overview

This directory contains Firebase Cloud Functions for handling Stripe integration:
- Checkout session creation (subscriptions & one-time purchases)
- Customer portal access
- Webhook event processing

## Setup

### Prerequisites
- Firebase CLI installed: `npm install -g firebase-tools`
- Firebase Blaze plan (required for Cloud Functions)
- Stripe account with API keys

### Installation

```bash
# Initialize functions (if not already done)
firebase init functions

# Install dependencies
cd functions
npm install stripe

# Update package.json with additional dependencies
npm install --save-dev @types/node
```

### Environment Variables

Create a `.env.local` file in the functions directory with:

```
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
DOMAIN=http://localhost:5173  # Change to your domain in production
```

Or use Firebase config:

```bash
firebase functions:config:set stripe.secret_key=sk_test_xxx
firebase functions:config:set stripe.webhook_secret=whsec_xxx
```

## Cloud Functions

### 1. `createCheckoutSession`

**Type:** Callable HTTP Function

**Purpose:** Create Stripe checkout session for subscriptions or one-time credit purchases

**Request:**
```typescript
{
  plan?: 'pro' | 'premium',        // For subscriptions
  packageId?: 'credits_10' | 'credits_50' | 'credits_100',  // For credits
  uid: string                       // User ID
}
```

**Response:**
```typescript
{
  url: string  // Stripe checkout URL
}
```

**Usage:**
```javascript
const createCheckoutSession = httpsCallable(functions, 'createCheckoutSession');
const result = await createCheckoutSession({ plan: 'pro', uid: user.uid });
window.location.href = result.data.url;
```

### 2. `createCustomerPortalSession`

**Type:** Callable HTTP Function

**Purpose:** Create Stripe Billing Portal session for subscription management

**Request:**
```typescript
{
  uid: string  // User ID
}
```

**Response:**
```typescript
{
  url: string  // Stripe portal URL
}
```

**Usage:**
```javascript
const createPortalSession = httpsCallable(functions, 'createCustomerPortalSession');
const result = await createPortalSession({ uid: user.uid });
window.location.href = result.data.url;
```

### 3. `stripeWebhook`

**Type:** HTTP Request Function

**Purpose:** Receive and process Stripe webhook events

**Webhook URL:** `https://YOUR_REGION-YOUR_PROJECT.cloudfunctions.net/stripeWebhook`

**Events Handled:**
- `checkout.session.completed` - Creates subscription or adds credits
- `customer.subscription.updated` - Updates status and billing period
- `customer.subscription.deleted` - Downgrades to free plan
- `invoice.payment_failed` - Marks as past_due

**Configuration:**
1. Go to Stripe Dashboard → Developers → Webhooks
2. Add endpoint with URL from deployed function
3. Select events to listen to
4. Copy signing secret to `STRIPE_WEBHOOK_SECRET`

## Deployment

```bash
# Deploy all functions
firebase deploy --only functions

# Deploy specific function
firebase deploy --only functions:createCheckoutSession

# View logs
firebase functions:log
```

## Testing

### Local Testing

```bash
# Start emulator
firebase emulators:start

# In another terminal, call function
firebase functions:shell
> createCheckoutSession({ plan: 'pro', uid: 'test-user-id' })
```

### Stripe Test Cards

Use in Stripe Checkout:
- Successful: `4242 4242 4242 4242`
- Declined: `4000 0000 0000 0002`
- Expired: `4000 0000 0000 0069`

## Error Handling

All functions include error handling with descriptive messages:

```
unauthenticated - User must be logged in
permission-denied - Cannot access another user's data
not-found - Resource not found
invalid-argument - Invalid parameter
internal - Server error
```

## Database Updates

### Subscription Creation

When `checkout.session.completed`:
```javascript
/users/{uid}
  subscription: {
    plan: 'pro' | 'premium',
    stripeCustomerId: 'cus_xxx',
    stripeSubscriptionId: 'sub_xxx',
    status: 'active' | 'past_due' | 'canceled' | 'trialing',
    currentPeriodEnd: Timestamp,
    credits: 0
  }
```

### Credit Purchase

Increments `subscription.credits`:
```javascript
subscription.credits += 10 | 50 | 100
```

### Subscription Updates

Updates status and period:
```javascript
subscription.status = 'active' | 'past_due' | 'canceled'
subscription.currentPeriodEnd = new Date(...)
```

## Monitoring

Monitor function execution:
```bash
firebase functions:log

# Filter by function
firebase functions:log --function=createCheckoutSession
```

View metrics in Firebase Console:
- Executions
- Errors
- Performance
- Cost

## Security

- All functions verify user authentication
- Cross-user access prevented
- Webhook signature verification required
- Metadata validation on all Stripe events
- Error messages don't leak sensitive info

## Troubleshooting

### "STRIPE_SECRET_KEY not configured"
Ensure environment variables are set via Firebase config or .env.local

### "Webhook signature verification failed"
Check webhook secret matches Stripe Dashboard signing secret

### "User not found in Firestore"
Ensure user document exists at `/users/{uid}`

### "No Stripe customer ID"
Customer is created on first checkout, ensure webhook processed correctly

## Next Steps

After deployment:

1. ✅ Deploy Cloud Functions to production
2. ✅ Configure webhook endpoint in Stripe Dashboard
3. ✅ Test full payment flow with test cards
4. ✅ Monitor webhook logs in Firebase Console
5. ✅ Switch to live keys for production
6. ✅ Implement credit deduction on export (frontend)

## References

- [Stripe Node.js SDK](https://stripe.com/docs/libraries/node)
- [Firebase Cloud Functions](https://firebase.google.com/docs/functions)
- [Stripe Webhooks](https://stripe.com/docs/webhooks)
- [Firestore Documentation](https://firebase.google.com/docs/firestore)
