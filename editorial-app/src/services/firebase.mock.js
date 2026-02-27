/**
 * Mock Firebase Services for Development Mode
 *
 * Provides stub implementations of Firebase Auth, Firestore, and Cloud Functions
 * to allow UI visualization without real Firebase credentials.
 */

// ==================== MOCK USER ====================
class MockUser {
  constructor(uid, email, displayName) {
    this.uid = uid;
    this.email = email;
    this.displayName = displayName;
    this.emailVerified = true;
    this.isAnonymous = false;
    this.metadata = {
      creationTime: new Date().toISOString(),
      lastSignInTime: new Date().toISOString(),
    };
  }
}

let mockAuthUser = null;
let authStateCallbacks = [];

// ==================== MOCK AUTH ====================
export const auth = {
  currentUser: null,

  onAuthStateChanged(callback) {
    authStateCallbacks.push(callback);
    callback(mockAuthUser);
    return () => {
      authStateCallbacks = authStateCallbacks.filter(cb => cb !== callback);
    };
  },
};

// ==================== MOCK FIRESTORE ====================

// In-memory storage for mock data
const mockDatabase = {
  users: {},
  books: {},
  system: {
    config: {
      stripePriceIdPro: 'price_mock_pro',
      stripePriceIdPremium: 'price_mock_premium',
      stripePriceIdCredits10: 'price_mock_credits10',
      stripePriceIdCredits50: 'price_mock_credits50',
      stripePriceIdCredits100: 'price_mock_credits100',
      stripePublishableKey: 'pk_test_mock',
      stripeWebhookSecret: 'whsec_mock',
    },
  },
};

class MockDocSnapshot {
  constructor(id, data, exists = true) {
    this.id = id;
    this._data = data;
    this._exists = exists;
  }

  exists() {
    return this._exists;
  }

  data() {
    return this._data;
  }

  get(field) {
    return this._data?.[field];
  }
}

class MockQuerySnapshot {
  constructor(docs = []) {
    this.docs = docs;
  }

  get empty() {
    return this.docs.length === 0;
  }

  forEach(callback) {
    this.docs.forEach((doc, index) => {
      callback(doc, index);
    });
  }

  get size() {
    return this.docs.length;
  }
}

export const db = {
  collection(path) {
    return {
      doc: (docId) => ({
        get: async () => {
          const data = mockDatabase[path]?.[docId];
          return new MockDocSnapshot(docId, data, !!data);
        },

        set: async (data, options = {}) => {
          if (!mockDatabase[path]) {
            mockDatabase[path] = {};
          }
          if (options.merge) {
            mockDatabase[path][docId] = {
              ...mockDatabase[path][docId],
              ...data,
            };
          } else {
            mockDatabase[path][docId] = data;
          }
        },

        update: async (data) => {
          if (mockDatabase[path]?.[docId]) {
            mockDatabase[path][docId] = {
              ...mockDatabase[path][docId],
              ...data,
            };
          }
        },

        delete: async () => {
          if (mockDatabase[path]) {
            delete mockDatabase[path][docId];
          }
        },

        collection: (subPath) => ({
          doc: (subDocId) => ({
            get: async () => {
              const key = `${path}/${docId}/${subPath}`;
              const data = mockDatabase[key]?.[subDocId];
              return new MockDocSnapshot(subDocId, data, !!data);
            },

            set: async (data, options = {}) => {
              const key = `${path}/${docId}/${subPath}`;
              if (!mockDatabase[key]) {
                mockDatabase[key] = {};
              }
              mockDatabase[key][subDocId] = data;
            },

            update: async (data) => {
              const key = `${path}/${docId}/${subPath}`;
              if (mockDatabase[key]?.[subDocId]) {
                mockDatabase[key][subDocId] = {
                  ...mockDatabase[key][subDocId],
                  ...data,
                };
              }
            },

            delete: async () => {
              const key = `${path}/${docId}/${subPath}`;
              if (mockDatabase[key]) {
                delete mockDatabase[key][subDocId];
              }
            },
          }),

          get: async () => {
            const key = `${path}/${docId}/${subPath}`;
            const docs = Object.entries(mockDatabase[key] || {}).map(
              ([id, data]) => new MockDocSnapshot(id, data)
            );
            return new MockQuerySnapshot(docs);
          },
        }),
      }),

      get: async () => {
        const docs = Object.entries(mockDatabase[path] || {}).map(
          ([id, data]) => new MockDocSnapshot(id, data)
        );
        return new MockQuerySnapshot(docs);
      },

      where: () => ({
        get: async () => {
          const docs = Object.entries(mockDatabase[path] || {}).map(
            ([id, data]) => new MockDocSnapshot(id, data)
          );
          return new MockQuerySnapshot(docs);
        },
      }),
    };
  },
};

// ==================== MOCK FUNCTIONS ====================

export const functions = {
  httpsCallable: (functionName) => {
    return async (data) => {
      console.log(`Mock function called: ${functionName}`, data);

      switch (functionName) {
        case 'createCheckoutSession':
          return {
            data: {
              url: 'https://checkout.stripe.com/pay/mock_' + Date.now(),
            },
          };

        case 'createCustomerPortalSession':
          return {
            data: {
              url: 'https://billing.stripe.com/mock_' + Date.now(),
            },
          };

        default:
          return { data: {} };
      }
    };
  },
};

// ==================== MOCK AUTH FUNCTIONS ====================

export const mockAuthFunctions = {
  signInWithEmail: async (email, password) => {
    console.log('Mock: Sign in with email', email);
    mockAuthUser = new MockUser(
      'mock_user_' + Date.now(),
      email,
      email.split('@')[0]
    );
    auth.currentUser = mockAuthUser;
    authStateCallbacks.forEach(cb => cb(mockAuthUser));
    return mockAuthUser;
  },

  signUpWithEmail: async (email, password) => {
    console.log('Mock: Sign up with email', email);
    mockAuthUser = new MockUser(
      'mock_user_' + Date.now(),
      email,
      email.split('@')[0]
    );
    auth.currentUser = mockAuthUser;

    if (!mockDatabase.users) {
      mockDatabase.users = {};
    }
    mockDatabase.users[mockAuthUser.uid] = {
      uid: mockAuthUser.uid,
      email: mockAuthUser.email,
      displayName: mockAuthUser.displayName,
      createdAt: new Date(),
      subscription: {
        plan: 'free',
        status: 'active',
        credits: 0,
      },
      stats: {
        booksCount: 0,
        exportsCount: 0,
      },
    };

    authStateCallbacks.forEach(cb => cb(mockAuthUser));
    return mockAuthUser;
  },

  signInWithGoogle: async () => {
    console.log('Mock: Sign in with Google');
    mockAuthUser = new MockUser(
      'mock_google_user_' + Date.now(),
      'developer@mock.local',
      'Developer'
    );
    auth.currentUser = mockAuthUser;
    authStateCallbacks.forEach(cb => cb(mockAuthUser));
    return mockAuthUser;
  },

  logOut: async () => {
    console.log('Mock: Log out');
    mockAuthUser = null;
    auth.currentUser = null;
    authStateCallbacks.forEach(cb => cb(null));
  },

  onAuthChange: (callback) => {
    return auth.onAuthStateChanged(callback);
  },
};

// ==================== MOCK INITIALIZATION ====================

export function initializeMockDevelopmentMode() {
  const devUser = new MockUser(
    'dev_user_123',
    import.meta.env.VITE_ADMIN_EMAIL || 'admin@editorial.local',
    'Developer User'
  );

  mockAuthUser = devUser;
  auth.currentUser = devUser;

  if (!mockDatabase.users) {
    mockDatabase.users = {};
  }
  mockDatabase.users[devUser.uid] = {
    uid: devUser.uid,
    email: devUser.email,
    displayName: devUser.displayName,
    createdAt: new Date(),
    subscription: {
      plan: 'premium',
      status: 'active',
      credits: 100,
      stripeCustomerId: 'cus_mock_123',
      stripeSubscriptionId: 'sub_mock_123',
    },
    stats: {
      booksCount: 0,
      exportsCount: 0,
    },
  };

  mockDatabase.books = {
    'book_mock_1': {
      uid: devUser.uid,
      id: 'book_mock_1',
      title: 'Sample Book',
      author: 'Developer',
      bookType: 'novel',
      createdAt: new Date(),
      updatedAt: new Date(),
      pageFormat: 'letter',
      margins: { top: 1, bottom: 1, left: 1, right: 1 },
      config: {
        lineSpacing: '1.5',
        paragraphSpacing: '0',
        fontSize: '12',
        fontFamily: 'Georgia',
        h1: { color: '#000000', fontSize: '28' },
        h2: { color: '#333333', fontSize: '22' },
        h3: { color: '#666666', fontSize: '16' },
        normal: { color: '#000000', fontSize: '12' },
        quote: { color: '#444444', fontSize: '11', style: 'italic' },
        list: { color: '#000000', fontSize: '12' },
        subheaders: {},
      },
      chapterCount: 1,
      wordCount: 0,
    },
  };

  console.log('✅ Mock Firebase initialized for development mode');
  console.log('   User:', devUser.email);
  console.log('   Plan: Premium (with mock data)');
}

export default {
  auth,
  db,
  functions,
  mockAuthFunctions,
  initializeMockDevelopmentMode,
};
