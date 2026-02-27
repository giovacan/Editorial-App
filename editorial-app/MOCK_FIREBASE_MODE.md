# Mock Firebase Development Mode

## Overview

The Editorial App now supports a **Mock Firebase Mode** for development and UI visualization without Firebase credentials. This allows you to:

- ✅ View all UI routes and components
- ✅ Navigate through the entire application
- ✅ Test form interactions and user flows
- ✅ Develop features without Firebase setup
- ✅ Visualize Firestore data structures

## Auto-Activation

Mock mode **automatically activates** when Firebase credentials are missing:

```javascript
// In .env.local, if these are empty or missing:
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_AUTH_DOMAIN=
# ... other Firebase env vars empty
```

The app will:
1. Detect empty credentials in `src/services/firebase.js`
2. Load mock Firebase services from `src/services/firebase.mock.js`
3. Auto-login a development user with Premium plan
4. Initialize sample data (users, books, configuration)
5. Log initialization status in browser console

## Browser Console Output

On app startup in mock mode, you'll see:

```
🎭 Mock Firebase initialized (development mode)
✅ Mock Firebase initialized for development mode
   User: admin@editorial.local
   Plan: Premium (with mock data)
```

## Mock Development User

**Email:** `admin@editorial.local` (or `VITE_ADMIN_EMAIL` from .env if set)

**Plan:** Premium (all features unlocked)

**Credits:** 100 (for testing export functionality)

**Permissions:** Admin user (can access `/admin` panel)

## Features Available in Mock Mode

### ✅ Working Features
- User authentication flows (login, register, logout)
- Navigation to all routes (`/books`, `/app`, `/admin`, `/pricing`)
- Book creation/editing
- Chapter management
- Page preview and pagination
- Admin panel access
- Subscription status display
- Stripe checkout/portal redirects (mock URLs)

### ⚠️ Limited Features
- **No persistent storage** — Data exists only in memory (lost on page reload)
- **No Cloud Functions** — Stripe functions return mock responses
- **No real Stripe integration** — Redirects to mock URLs
- **No database sync** — Changes don't sync to Firestore

## Implementation Details

### Mock Services

**firebase.mock.js** provides:

1. **MockUser Class**
   - Mimics Firebase User object
   - Has uid, email, displayName, emailVerified, etc.

2. **Mock Auth (mockAuth)**
   - `onAuthStateChanged()` — Simulates auth listener
   - Auto-subscribes to changes
   - Works with React's useAuth hook

3. **Mock Firestore (db)**
   - In-memory JSON-like database
   - Supports `collection()`, `doc()`, `get()`, `set()`, `update()`, `delete()`
   - Supports subcollections (`/books/{bookId}/chapters/{chapterId}`)
   - Basic `where()` and query operations

4. **Mock Functions**
   - `httpsCallable()` returns mock functions
   - Stripe functions return mock checkout/portal URLs

5. **Mock Auth Functions (mockAuthFunctions)**
   - `signInWithEmail(email, password)`
   - `signUpWithEmail(email, password)`
   - `signInWithGoogle()`
   - `logOut()`
   - `onAuthChange()` listener

6. **Initialization**
   - `initializeMockDevelopmentMode()` — Sets up developer user and sample data

### Conditional Loading

**src/services/firebase.js** checks for credentials:

```javascript
const hasFirebaseCredentials =
  import.meta.env.VITE_FIREBASE_API_KEY &&
  import.meta.env.VITE_FIREBASE_PROJECT_ID;

if (hasFirebaseCredentials) {
  // Use real Firebase
  auth = getAuth(app);
  db = getFirestore(app);
  functions = getFunctions(app);
} else {
  // Use mock services
  auth = mockFirebase.auth;
  db = mockFirebase.db;
  functions = mockFirebase.functions;
  mockFirebase.initializeMockDevelopmentMode();
}
```

**src/services/auth.js** routes auth calls:

```javascript
const isMockMode = !import.meta.env.VITE_FIREBASE_API_KEY;

export async function signUpWithEmail(email, password, displayName) {
  if (isMockMode) {
    return await mockFirebase.mockAuthFunctions.signUpWithEmail(email, password);
  }
  // ... real Firebase logic
}
```

## Testing Different User Types

You can test different scenarios by modifying login in AuthContext or auth.js:

### Test Regular Free User
```javascript
// In mockAuthFunctions.signUpWithEmail()
subscription: {
  plan: 'free',
  status: 'active',
  credits: 0,
}
```

### Test Pro User
```javascript
subscription: {
  plan: 'pro',
  status: 'active',
  credits: 0,
  stripeSubscriptionId: 'sub_mock_pro',
}
```

### Test Non-Admin User
Set a different email in `.env.local`:
```
VITE_ADMIN_EMAIL=only-admin@example.com
```

Then login as any other email to test non-admin routes.

## Switching to Real Firebase

When you have Firebase credentials:

1. **Add to .env.local:**
```
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_storage.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

2. **Restart dev server:**
```bash
npm run dev
```

3. **App will automatically switch to real Firebase:**
   - Console will log: `🔥 Firebase initialized (production mode)`
   - All auth/data operations will use real Firebase
   - No code changes needed!

## Limitations & Known Issues

- **In-memory database** — All data lost on reload. Good for testing UI, not workflows.
- **No real-time sync** — Changes aren't persisted or synced
- **Mock Stripe** — Always returns success URLs, doesn't process payments
- **No Cloud Functions** — Admin operations may not work (depend on real Cloud Functions)
- **Auth state** — Persists only during session (lost on page refresh)

## Files Modified

- `src/services/firebase.js` — Conditional real/mock initialization
- `src/services/auth.js` — Routes through mock functions in dev mode
- `src/contexts/AuthContext.jsx` — Handles mock user initialization
- `src/services/firebase.mock.js` — **NEW** — All mock implementations

## Switching Back to Development Mode

If you accidentally fill in credentials but want to test mock mode again:

```bash
# Clear .env.local or set credentials to empty strings
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_PROJECT_ID=
```

The app will auto-detect and switch back to mock mode on next reload.

## Debug Logging

Mock services log to console for debugging:

```javascript
// In mockFunctions
console.log(`Mock function called: ${functionName}`, data);

// In auth functions
console.log('Mock: Sign in with email', email);
console.log('Mock: Sign up with email', email);
console.log('Mock: Sign in with Google');
console.log('Mock: Log out');
```

Open browser Developer Tools (F12) → Console to see these logs.

## Next Steps

When you have Firebase credentials:

1. ✅ Fill in `.env.local` with real credentials
2. ⏳ Deploy Cloud Functions (see `functions/README.md`)
3. ⏳ Set up Stripe webhook
4. ⏳ Configure Firestore rules
5. 🚀 Deploy to production

Until then, the mock mode allows full UI development and testing!
