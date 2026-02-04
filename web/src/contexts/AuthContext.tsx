import { useEffect, useState, type ReactNode } from 'react';
import { fetchMe } from '../api';
import type { AuthUser } from '../types';
import { AuthContext } from './AuthContextDef';

// Re-export for convenience
export { AuthContext, type AuthContextType } from './AuthContextDef';

interface AuthProviderProps {
  children: ReactNode;
}

// Check if user might be authenticated by looking for SWA auth cookie
// This avoids calling /api/me (and triggering cold start) for anonymous users
function maybeAuthenticated(): boolean {
  // SWA sets 'StaticWebAppsAuthCookie' when user is authenticated
  // The cookie is httpOnly so we can't read its value, but we can check presence
  // Note: Cookie may exist but be expired, so this is just a hint
  return document.cookie.includes('StaticWebAppsAuthCookie');
}

export function AuthProvider({ children }: AuthProviderProps) {
  // Start with loading=true only if we might be authenticated
  const [isLoading, setIsLoading] = useState(() => maybeAuthenticated());
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isGameKeeper, setIsGameKeeper] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);

  const fetchAuthStatus = async () => {
    try {
      const data = await fetchMe();
      setIsAuthenticated(data.isAuthenticated);
      setIsGameKeeper(data.isGameKeeper);
      setUser(data.user || null);
    } catch (error) {
      console.error('Failed to fetch auth status:', error);
      setIsAuthenticated(false);
      setIsGameKeeper(false);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Only call /api/me if user might be authenticated (cookie exists)
    // This avoids triggering a cold start for anonymous users
    if (maybeAuthenticated()) {
      fetchAuthStatus();
    }
    // If no cookie, we already have isLoading=false, isAuthenticated=false
  }, []);

  const signIn = () => {
    // Redirect to Azure AD login via SWA
    window.location.href = '/.auth/login/aad?post_login_redirect_uri=/dashboard';
  };

  const signOut = () => {
    window.location.href = '/.auth/logout?post_logout_redirect_uri=/';
  };

  const refresh = async () => {
    setIsLoading(true);
    await fetchAuthStatus();
  };

  return (
    <AuthContext.Provider
      value={{
        isLoading,
        isAuthenticated,
        isGameKeeper,
        user,
        signIn,
        signOut,
        refresh,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
