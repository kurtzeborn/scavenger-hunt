import { createContext } from 'react';
import type { AuthUser } from '../types';

export interface AuthContextType {
  isLoading: boolean;
  isAuthenticated: boolean;
  isGameKeeper: boolean;
  user: AuthUser | null;
  signIn: () => void;
  signOut: () => void;
  refresh: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | null>(null);
