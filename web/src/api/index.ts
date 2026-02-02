// API client functions for the scavenger hunt app

import type { Game, Scenario, GameConfig } from '../types';

const API_BASE = '/api';

// Get mock auth header for local development
function getMockAuthHeader(): Record<string, string> {
  const mockPrincipal = localStorage.getItem('mockAuthPrincipal');
  if (mockPrincipal) {
    // Encode as base64 to match SWA's x-ms-client-principal format
    const encoded = btoa(mockPrincipal);
    return { 'x-ms-client-principal': encoded };
  }
  return {};
}

// Generic fetch wrapper with error handling
async function apiFetch<T>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...getMockAuthHeader(),
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new ApiError(error.error || 'Request failed', response.status);
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

// Custom error class for API errors
export class ApiError extends Error {
  public status: number;
  
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

// ============ Games API ============

export interface CreateGameRequest {
  config: GameConfig;
  scenarioIds: string[];
}

export async function fetchGames(): Promise<Game[]> {
  return apiFetch<Game[]>('/games');
}

export async function fetchGame(gameId: string): Promise<Game> {
  return apiFetch<Game>(`/games/${gameId}`);
}

export async function createGame(data: CreateGameRequest): Promise<Game> {
  return apiFetch<Game>('/games', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateGame(gameId: string, data: Partial<{ config: GameConfig; status: Game['status'] }>): Promise<Game> {
  return apiFetch<Game>(`/games/${gameId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteGame(gameId: string): Promise<void> {
  return apiFetch<void>(`/games/${gameId}`, {
    method: 'DELETE',
  });
}

export async function startGame(gameId: string): Promise<Game> {
  return apiFetch<Game>(`/games/${gameId}/start`, {
    method: 'POST',
  });
}

// ============ Scenarios API ============

export async function fetchScenarios(): Promise<Scenario[]> {
  return apiFetch<Scenario[]>('/scenarios');
}

// ============ Auth API ============

export interface MeResponse {
  isAuthenticated: boolean;
  user?: {
    userId: string;
    userDetails: string;
    identityProvider: string;
    userRoles: string[];
  };
  isGameKeeper: boolean;
}

export async function fetchMe(): Promise<MeResponse> {
  // Special case: /api/me returns 200 even for unauthenticated users
  // Include mock auth header for local development
  const response = await fetch(`${API_BASE}/me`, {
    headers: getMockAuthHeader(),
  });
  if (!response.ok) {
    throw new ApiError('Failed to fetch auth status', response.status);
  }
  return response.json();
}
