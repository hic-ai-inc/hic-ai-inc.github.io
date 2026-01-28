/**
 * Cognito Auth Provider
 *
 * React context provider for Cognito/Amplify Auth.
 * Replaces Auth0Provider to provide user state throughout the app.
 *
 * Usage:
 * - Wrap app with <CognitoProvider> in layout.js
 * - Use useUser() hook in components to access user state
 *
 * @see docs/20260128_AUTH0_TO_COGNITO_MIGRATION_DECISION.md
 */

"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { Hub } from "aws-amplify/utils";
import {
  configureAmplify,
  getSession,
  isCognitoConfigured,
  redirectToLogin,
  logout as cognitoLogout,
} from "./cognito";

// Auth context
const AuthContext = createContext({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  error: null,
  login: () => {},
  logout: () => {},
  checkAuth: async () => {},
});

/**
 * Cognito Auth Provider Component
 *
 * Initializes Amplify Auth and provides auth state to children.
 */
export function CognitoProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Check authentication status
  const checkAuth = useCallback(async () => {
    if (!isCognitoConfigured) {
      setIsLoading(false);
      return null;
    }

    try {
      const session = await getSession();
      if (session?.user) {
        setUser(session.user);
        setError(null);
        return session.user;
      } else {
        setUser(null);
        return null;
      }
    } catch (err) {
      console.error("[CognitoProvider] Auth check failed:", err);
      setUser(null);
      setError(err.message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initialize on mount
  useEffect(() => {
    // Configure Amplify
    configureAmplify();

    // Check initial auth state
    checkAuth();

    // Listen for auth events
    const unsubscribe = Hub.listen("auth", ({ payload }) => {
      switch (payload.event) {
        case "signedIn":
        case "signInWithRedirect":
          // User signed in (either direct or via OAuth redirect)
          checkAuth();
          break;
        case "signedOut":
          setUser(null);
          setIsLoading(false);
          break;
        case "tokenRefresh":
          checkAuth();
          break;
        case "tokenRefresh_failure":
        case "signInWithRedirect_failure":
          setUser(null);
          setError("Session expired");
          setIsLoading(false);
          break;
      }
    });

    return () => {
      unsubscribe();
    };
  }, [checkAuth]);

  // Login function
  const login = useCallback((returnTo = "/portal") => {
    redirectToLogin(returnTo);
  }, []);

  // Logout function
  const logout = useCallback(async () => {
    // Clear local state immediately so UI updates instantly
    setUser(null);
    setIsLoading(true);
    await cognitoLogout();
    // cognitoLogout clears Amplify session and redirects to home
    setIsLoading(false);
  }, []);

  const value = {
    user,
    isLoading,
    isAuthenticated: !!user,
    error,
    login,
    logout,
    checkAuth,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * useUser Hook
 *
 * Access current user state from any component.
 * Compatible with Auth0's useUser hook API for easy migration.
 *
 * @returns {Object} { user, isLoading, error }
 */
export function useUser() {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error("useUser must be used within a CognitoProvider");
  }

  return {
    user: context.user,
    isLoading: context.isLoading,
    isAuthenticated: context.isAuthenticated,
    error: context.error,
  };
}

/**
 * useAuth Hook
 *
 * Access full auth context including login/logout functions.
 *
 * @returns {Object} Full auth context
 */
export function useAuth() {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error("useAuth must be used within a CognitoProvider");
  }

  return context;
}

/**
 * withAuth HOC
 *
 * Higher-order component for protecting pages.
 * Redirects to login if not authenticated.
 */
export function withAuth(Component) {
  return function AuthenticatedComponent(props) {
    const { user, isLoading, login } = useAuth();

    useEffect(() => {
      if (!isLoading && !user) {
        login(window.location.pathname);
      }
    }, [isLoading, user, login]);

    if (isLoading) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading...</p>
          </div>
        </div>
      );
    }

    if (!user) {
      return null; // Will redirect in useEffect
    }

    return <Component {...props} />;
  };
}
