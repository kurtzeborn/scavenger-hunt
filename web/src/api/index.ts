// API client functions for the scavenger hunt app

import type { Game, Scenario, GameConfig, Team, Player, CrewMember, MediaSubmission } from '../types';

// API base URL - defaults to /api for local dev, overridden by env var in production
const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

// Cache for the client principal from SWA
let cachedClientPrincipal: string | null = null;

// Fetch the client principal from SWA's /.auth/me endpoint
async function fetchClientPrincipal(): Promise<string | null> {
  // Only fetch from SWA in production (when using external API)
  if (!import.meta.env.VITE_API_BASE_URL) {
    return null;
  }

  try {
    const response = await fetch('/.auth/me');
    if (!response.ok) {
      return null;
    }
    const data = await response.json();
    if (data.clientPrincipal) {
      // Re-encode as base64 to match the x-ms-client-principal format
      return btoa(JSON.stringify(data.clientPrincipal));
    }
    return null;
  } catch {
    return null;
  }
}

// Get auth header - uses cached client principal or fetches from SWA
async function getAuthHeader(): Promise<Record<string, string>> {
  // For local dev, check mock auth
  const mockPrincipal = localStorage.getItem('mockAuthPrincipal');
  if (mockPrincipal) {
    return { 'x-ms-client-principal': btoa(mockPrincipal) };
  }

  // For production, fetch from SWA if not cached
  if (cachedClientPrincipal === null) {
    cachedClientPrincipal = await fetchClientPrincipal() || '';
  }
  
  if (cachedClientPrincipal) {
    return { 'x-ms-client-principal': cachedClientPrincipal };
  }
  
  return {};
}

// Clear cached auth (call on logout)
export function clearAuthCache(): void {
  cachedClientPrincipal = null;
}

// Generic fetch wrapper with error handling
async function apiFetch<T>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const authHeaders = await getAuthHeader();
  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    console.error('API Error Response:', error);
    const message = error.details 
      ? `${error.error}: ${error.details}` 
      : (error.error || 'Request failed');
    throw new ApiError(message, response.status);
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

export async function pauseGame(gameId: string): Promise<Game> {
  return apiFetch<Game>(`/games/${gameId}/pause`, {
    method: 'POST',
  });
}

export async function resumeGame(gameId: string): Promise<Game> {
  return apiFetch<Game>(`/games/${gameId}/resume`, {
    method: 'POST',
  });
}

export async function endGame(gameId: string): Promise<Game> {
  return apiFetch<Game>(`/games/${gameId}/end`, {
    method: 'POST',
  });
}

export interface AwardBonusRequest {
  scenarioId: string;
  teamId: string;
}

export async function awardBonus(gameId: string, data: AwardBonusRequest): Promise<Game> {
  return apiFetch<Game>(`/games/${gameId}/bonus`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export interface DisqualifyRequest {
  scenarioId: string;
  teamId: string;
  disqualify: boolean;
}

export async function disqualifySubmission(gameId: string, data: DisqualifyRequest): Promise<Game> {
  return apiFetch<Game>(`/games/${gameId}/disqualify`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function completeGame(gameId: string): Promise<Game> {
  return apiFetch<Game>(`/games/${gameId}/complete`, {
    method: 'POST',
  });
}

export async function finalizeGame(gameId: string): Promise<Game> {
  return apiFetch<Game>(`/games/${gameId}/finalize`, {
    method: 'POST',
  });
}

// ============ Teams API ============

export interface JoinGameRequest {
  displayName: string;
  teamId?: string;
  teamName?: string;
}

export interface JoinGameResponse {
  team: Team;
  player: Player;
}

export async function joinGame(gameId: string, data: JoinGameRequest): Promise<JoinGameResponse> {
  return apiFetch<JoinGameResponse>(`/games/${gameId}/join`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function fetchTeams(gameId: string): Promise<Team[]> {
  return apiFetch<Team[]>(`/games/${gameId}/teams`);
}

export async function leaveTeam(gameId: string, teamId: string, playerId: string): Promise<void> {
  return apiFetch<void>(`/games/${gameId}/teams/${teamId}/players/${playerId}`, {
    method: 'DELETE',
  });
}

export async function seedTestTeams(gameId: string): Promise<{ message: string; teams: Team[] }> {
  return apiFetch<{ message: string; teams: Team[] }>(`/games/${gameId}/teams/seed`, {
    method: 'POST',
  });
}

export interface AddCrewMemberRequest {
  displayName: string;
  addedBy: string; // Player ID
}

export interface AddCrewMemberResponse {
  crewMember: CrewMember;
  team: Team;
}

export async function addCrewMember(
  gameId: string,
  teamId: string,
  data: AddCrewMemberRequest
): Promise<AddCrewMemberResponse> {
  return apiFetch<AddCrewMemberResponse>(`/games/${gameId}/teams/${teamId}/crew`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ============ Media API ============

export interface UploadUrlRequest {
  teamId: string;
  scenarioId: string;
  mediaType: 'photo' | 'video';
  playerId: string;
}

export interface UploadUrlResponse {
  uploadUrl: string;
  blobName: string;
  expiresAt: string;
}

export async function getUploadUrl(gameId: string, data: UploadUrlRequest): Promise<UploadUrlResponse> {
  return apiFetch<UploadUrlResponse>(`/games/${gameId}/videos/upload-url`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export interface RegisterMediaRequest {
  teamId: string;
  scenarioId: string;
  mediaType: 'photo' | 'video';
  playerId: string;
  blobName: string;
  durationSeconds?: number;
}

export async function registerMedia(gameId: string, data: RegisterMediaRequest): Promise<MediaSubmission> {
  return apiFetch<MediaSubmission>(`/games/${gameId}/videos`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function fetchMediaSubmissions(
  gameId: string,
  options?: { scenarioId?: string; teamId?: string }
): Promise<MediaSubmission[]> {
  const params = new URLSearchParams();
  if (options?.scenarioId) params.append('scenarioId', options.scenarioId);
  if (options?.teamId) params.append('teamId', options.teamId);
  const query = params.toString();
  return apiFetch<MediaSubmission[]>(`/games/${gameId}/videos${query ? `?${query}` : ''}`);
}

export async function fetchScenarioVideos(gameId: string, scenarioId: string): Promise<MediaSubmission[]> {
  return apiFetch<MediaSubmission[]>(`/games/${gameId}/videos/${scenarioId}`);
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
  // Include auth header for both local development and production
  const authHeaders = await getAuthHeader();
  const response = await fetch(`${API_BASE}/me`, {
    headers: authHeaders,
  });
  if (!response.ok) {
    throw new ApiError('Failed to fetch auth status', response.status);
  }
  return response.json();
}
