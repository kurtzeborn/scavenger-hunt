import { useEffect, useState, type ReactNode } from 'react';
import { fetchMe } from '../api';
import type { AuthUser } from '../types';
import { AuthContext } from './AuthContextDef';

// Re-export for convenience
export { AuthContext, type AuthContextType } from './AuthContextDef';

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [isLoading, setIsLoading] = useState(true);
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchAuthStatus();
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
