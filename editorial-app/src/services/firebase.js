import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import * as mockFirebase from './firebase.mock';

// Check if Firebase credentials are available
const hasFirebaseCredentials =
  import.meta.env.VITE_FIREBASE_API_KEY &&
  import.meta.env.VITE_FIREBASE_PROJECT_ID;

let auth, db, functions, app;

if (hasFirebaseCredentials) {
  // Production: Use real Firebase
  const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  };

  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  functions = getFunctions(app);

  console.log('🔥 Firebase initialized (production mode)');
} else {
  // Development: Use mock Firebase
  auth = mockFirebase.auth;
  db = mockFirebase.db;
  functions = mockFirebase.functions;
  app = null;

  console.log('🎭 Mock Firebase initialized (development mode)');
  mockFirebase.initializeMockDevelopmentMode();
}

export { auth, db, functions };
export default app;
