import { HttpRequest } from '@azure/functions';
import { gamekeepersTable } from './storage.js';
import { AuthUser, GameKeeperEntity } from './types.js';

// Re-export AuthUser for convenience
export type { AuthUser };

// Parse the SWA auth header to get user info
export function getAuthUser(request: HttpRequest): AuthUser | null {
  // In Azure Static Web Apps, the auth info is in a header
  const clientPrincipal = request.headers.get('x-ms-client-principal');
  
  if (!clientPrincipal) {
    return null;
  }

  try {
    const decoded = Buffer.from(clientPrincipal, 'base64').toString('utf8');
    const principal = JSON.parse(decoded);
    
    return {
      userId: principal.userId,
      userDetails: principal.userDetails, // This is the email
      identityProvider: principal.identityProvider,
      userRoles: principal.userRoles || [],
    };
  } catch (error) {
    console.error('Failed to parse client principal:', error);
    return null;
  }
}

// Check if an email is in the game keeper allowlist
export async function isGameKeeper(email: string): Promise<boolean> {
  if (!email) {
    return false;
  }

  try {
    const entity = await gamekeepersTable.getEntity<GameKeeperEntity>('gamekeeper', email.toLowerCase());
    return !!entity;
  } catch (error: any) {
    // 404 means not found, which is fine
    if (error.statusCode === 404) {
      return false;
    }
    throw error;
  }
}

// Require authentication - returns user or throws
export function requireAuth(request: HttpRequest): AuthUser {
  const user = getAuthUser(request);
  if (!user) {
    throw new AuthError('Authentication required', 401);
  }
  return user;
}

// Require game keeper role - returns user or throws
export async function requireGameKeeper(request: HttpRequest): Promise<AuthUser> {
  const user = requireAuth(request);
  
  const isKeeper = await isGameKeeper(user.userDetails);
  if (!isKeeper) {
    throw new AuthError('Game keeper access required', 403);
  }
  
  return user;
}

// Custom error class for auth errors
export class AuthError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message);
    this.name = 'AuthError';
  }
}
