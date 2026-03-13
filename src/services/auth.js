import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase';
import * as mockFirebase from './firebase.mock';

const googleProvider = new GoogleAuthProvider();

// Check if using mock Firebase
const isMockMode = !import.meta.env.VITE_FIREBASE_API_KEY || !import.meta.env.VITE_FIREBASE_PROJECT_ID;

/**
 * Helper to create or update user document in Firestore
 * @param {User} user - Firebase Auth user
 * @param {string} displayName - Optional display name
 */
async function createOrUpdateUserDoc(user, displayName) {
  try {
    const userDocRef = doc(db, 'users', user.uid);
    await setDoc(
      userDocRef,
      {
        email: user.email,
        displayName: displayName || user.displayName || '',
        photoURL: user.photoURL || null,
        subscription: {
          plan: 'free',
          credits: 0,
        },
        stats: {
          booksCount: 0,
          exportsCount: 0,
          lastActive: serverTimestamp(),
        },
        createdAt: serverTimestamp(),
      },
      { merge: true } // Merge in case doc already exists (e.g., from Google signin)
    );
  } catch (error) {
    console.error('Error creating user document:', error);
    // Don't throw — user auth succeeded even if Firestore write fails
  }
}

/**
 * Register a new user with email and password
 * @param {string} email
 * @param {string} password
 * @param {string} displayName
 * @returns {Promise<User>}
 */
export async function signUpWithEmail(email, password, displayName) {
  try {
    if (isMockMode) {
      const user = await mockFirebase.mockAuthFunctions.signUpWithEmail(email, password);
      // In mock mode, user doc is already created
      return user;
    }

    const result = await createUserWithEmailAndPassword(auth, email, password);
    const user = result.user;

    // Update display name
    if (displayName) {
      await updateProfile(user, {
        displayName,
      });
    }

    // Create user document in Firestore
    await createOrUpdateUserDoc(user, displayName);

    return user;
  } catch (error) {
    throw new Error(error.message);
  }
}

/**
 * Sign in with email and password
 * @param {string} email
 * @param {string} password
 * @returns {Promise<User>}
 */
export async function signInWithEmail(email, password) {
  try {
    if (isMockMode) {
      return await mockFirebase.mockAuthFunctions.signInWithEmail(email, password);
    }

    const result = await signInWithEmailAndPassword(auth, email, password);
    return result.user;
  } catch (error) {
    throw new Error(error.message);
  }
}

/**
 * Sign in with Google account
 * @returns {Promise<User>}
 */
export async function signInWithGoogle() {
  try {
    if (isMockMode) {
      return await mockFirebase.mockAuthFunctions.signInWithGoogle();
    }

    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;

    // Create or update user document in Firestore
    await createOrUpdateUserDoc(user);

    return user;
  } catch (error) {
    throw new Error(error.message);
  }
}

/**
 * Sign out the current user
 * @returns {Promise<void>}
 */
export async function logOut() {
  try {
    if (isMockMode) {
      await mockFirebase.mockAuthFunctions.logOut();
      return;
    }

    await signOut(auth);
  } catch (error) {
    throw new Error(error.message);
  }
}

/**
 * Listen to auth state changes
 * @param {Function} callback - called with (user, loading)
 * @returns {Function} - unsubscribe function
 */
export function onAuthChange(callback) {
  return onAuthStateChanged(auth, (user) => {
    callback(user);
  });
}
