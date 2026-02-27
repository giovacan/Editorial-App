import { createContext, useContext, useState, useEffect } from 'react';
import {
  signInWithEmail,
  signUpWithEmail,
  signInWithGoogle,
  logOut,
  onAuthChange,
} from '../services/auth';

const AuthContext = createContext(null);

// Check if in mock mode (no Firebase credentials)
const isMockMode = !import.meta.env.VITE_FIREBASE_API_KEY || !import.meta.env.VITE_FIREBASE_PROJECT_ID;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Listen to auth state changes
    const unsubscribe = onAuthChange((authUser) => {
      setUser(authUser);
      setLoading(false);
    });

    // In mock mode, ensure user is set from mock auth
    if (isMockMode && !user) {
      // Give mock initialization a moment to complete
      const timer = setTimeout(() => {
        if (!user) {
          setLoading(false);
        }
      }, 100);
      return () => clearTimeout(timer);
    }

    return unsubscribe;
  }, [user]);

  // Check if user is admin (email matches VITE_ADMIN_EMAIL)
  const isAdmin = user?.email === import.meta.env.VITE_ADMIN_EMAIL;

  const value = {
    user,
    loading,
    isAdmin,
    signIn: signInWithEmail,
    signUp: signUpWithEmail,
    signInGoogle: signInWithGoogle,
    logOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Hook to use auth context
 * @returns {Object} - auth context value
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
