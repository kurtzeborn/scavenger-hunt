// Game status values
export type GameStatus = 'lobby' | 'active' | 'paused' | 'judging' | 'revealing' | 'complete';

// Media types for scenarios
export type MediaType = 'photo' | 'video';

// Scenario difficulty levels
export type Difficulty = 'easy' | 'medium' | 'hard';

// Scenario categories
export type ScenarioCategory = 'location' | 'general' | 'church' | string;

// Upload status
export type UploadStatus = 'uploading' | 'complete' | 'failed';

// Game configuration
export interface GameConfig {
  scenarioCount: number; // 5-20
  timeLimit: number; // Total minutes
  timeLimitPerScenario: number;
}

// Reference to a scenario within a game
export interface ScenarioRef {
  scenarioId: string;
  order: number;
  bonusAwardedTo?: string; // Team ID that got bonus point
  disqualifiedTeams?: string[]; // Team IDs that were disqualified for this scenario
}

// Main game entity
export interface Game {
  id: string; // Also the join code (4 uppercase letters)
  createdBy: string; // Game keeper's email
  createdAt: Date;
  status: GameStatus;
  config: GameConfig;
  scenarios: ScenarioRef[];
  startedAt?: Date;
  endsAt?: Date;
  pausedAt?: Date;
  totalPausedSeconds?: number;
}

// Player within a team
export interface Player {
  id: string; // Session-generated ID
  displayName: string;
  joinedAt: Date;
}

// Crew member (teammate without a phone)
export interface CrewMember {
  id: string; // Generated ID
  displayName: string; // Max 20 chars
  addedBy: string; // Player ID who added them
  addedAt: Date;
}

// Team entity
export interface Team {
  id: string;
  gameId: string;
  name: string; // Max 20 chars
  color: string; // Auto-assigned from palette
  players: Player[];
  crewMembers: CrewMember[]; // Team members without phones
  completedScenarios: string[]; // Scenario IDs
}

// Player session stored in localStorage
export interface PlayerSession {
  gameId: string;
  teamId: string;
  playerId: string;
  displayName: string;
  joinedAt: Date;
}

// Scenario from the library
export interface Scenario {
  id: string;
  title: string;
  description: string;
  mediaType: MediaType;
  category: ScenarioCategory;
  difficulty?: Difficulty;
}

// Media submission for a scenario
export interface MediaSubmission {
  id: string;
  gameId: string;
  teamId: string;
  scenarioId: string;
  uploadedBy: string; // Player ID
  blobUrl: string;
  uploadedAt: Date;
  mediaType: MediaType;
  status: UploadStatus;
  durationSeconds?: number; // Only for videos
  errorMessage?: string;
}

// Game keeper allowlist entry
export interface GameKeeper {
  email: string; // Primary key (lowercase)
  displayName: string;
  addedBy: string; // Email of who invited them
  addedAt: Date;
}

// Auth user info from SWA
export interface AuthUser {
  userId: string;
  userDetails: string; // Email
  identityProvider: string;
  userRoles: string[];
}

// API response for /api/me
export interface MeResponse {
  isAuthenticated: boolean;
  user?: AuthUser;
  isGameKeeper: boolean;
}

// Team colors palette (8 colors, color-blind friendly)
export const TEAM_COLORS = [
  '#3b82f6', // Blue
  '#ef4444', // Red
  '#22c55e', // Green
  '#f59e0b', // Amber
  '#8b5cf6', // Purple
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#f97316', // Orange
] as const;

// Game code character set (excluding O and I for clarity)
export const GAME_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

// Table Storage entity types (with partition/row keys)
export interface GameEntity {
  partitionKey: string; // 'game'
  rowKey: string; // game ID
  createdBy: string;
  createdAt: Date;
  status: GameStatus;
  config: string; // JSON serialized GameConfig
  scenarios: string; // JSON serialized ScenarioRef[]
  startedAt?: Date;
  endsAt?: Date;
  pausedAt?: Date;
  totalPausedSeconds?: number;
}

export interface TeamEntity {
  partitionKey: string; // game ID
  rowKey: string; // team ID
  name: string;
  color: string;
  players: string; // JSON serialized Player[]
  crewMembers: string; // JSON serialized CrewMember[]
  completedScenarios: string; // JSON serialized string[]
}

export interface ScenarioEntity {
  partitionKey: string; // category
  rowKey: string; // scenario ID
  title: string;
  description: string;
  mediaType: MediaType;
  difficulty?: Difficulty;
}

export interface GameKeeperEntity {
  partitionKey: string; // 'gamekeeper'
  rowKey: string; // email (lowercase)
  displayName: string;
  addedBy: string;
  addedAt: Date;
}

export interface MediaSubmissionEntity {
  partitionKey: string; // game ID
  rowKey: string; // `${teamId}_${scenarioId}`
  teamId: string;
  scenarioId: string;
  uploadedBy: string;
  blobUrl: string;
  uploadedAt: Date;
  mediaType: MediaType;
  status: UploadStatus;
  durationSeconds?: number;
  errorMessage?: string;
}
