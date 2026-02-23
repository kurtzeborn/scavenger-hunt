import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { v4 as uuidv4 } from 'uuid';
import { gamesTable, teamsTable } from '../storage.js';
import { requireGameKeeper, AuthError, getAuthUser, isGameKeeper, AuthUser } from '../auth.js';
import { Game, GameEntity, GameConfig, ScenarioRef, TeamEntity, Player, GAME_CODE_CHARS, MIN_SCENARIOS, MAX_SCENARIOS } from '../types.js';

// ============ Helper Functions ============

// Get the captain (first player to join) of a team
function getCaptainId(players: Player[]): string | undefined {
  if (players.length === 0) return undefined;
  const sorted = [...players].sort(
    (a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime()
  );
  return sorted[0].id;
}

// Generate a random 4-letter game code
function generateGameCode(): string {
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += GAME_CODE_CHARS.charAt(Math.floor(Math.random() * GAME_CODE_CHARS.length));
  }
  return code;
}

// Check if a game code is already in use
async function isCodeInUse(code: string): Promise<boolean> {
  try {
    await gamesTable.getEntity('game', code);
    return true;
  } catch (error: any) {
    if (error.statusCode === 404) {
      return false;
    }
    throw error;
  }
}

// Generate a unique game code
async function generateUniqueGameCode(): Promise<string> {
  let attempts = 0;
  const maxAttempts = 10;
  
  while (attempts < maxAttempts) {
    const code = generateGameCode();
    if (!(await isCodeInUse(code))) {
      return code;
    }
    attempts++;
  }
  
  throw new Error('Failed to generate unique game code');
}

// Convert entity to Game object
function entityToGame(entity: GameEntity): Game {
  return {
    id: entity.rowKey,
    createdBy: entity.createdBy,
    createdAt: entity.createdAt,
    status: entity.status,
    config: JSON.parse(entity.config),
    scenarios: JSON.parse(entity.scenarios),
    startedAt: entity.startedAt,
    endsAt: entity.endsAt,
    pausedAt: entity.pausedAt,
    totalPausedSeconds: entity.totalPausedSeconds,
  };
}

// Error types for game operations
class GameNotFoundError extends Error {
  constructor(gameId: string) {
    super(`Game not found: ${gameId}`);
    this.name = 'GameNotFoundError';
  }
}

class NotGameOwnerError extends Error {
  constructor() {
    super('You can only modify your own games');
    this.name = 'NotGameOwnerError';
  }
}

class InvalidGameStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidGameStateError';
  }
}

class ScenarioNotFoundError extends Error {
  constructor(scenarioId: string) {
    super(`Scenario not found in this game: ${scenarioId}`);
    this.name = 'ScenarioNotFoundError';
  }
}

class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

// Get game by ID, throws GameNotFoundError if not found
async function getGameEntity(gameId: string): Promise<GameEntity> {
  try {
    return await gamesTable.getEntity<GameEntity>('game', gameId);
  } catch (error: any) {
    if (error.statusCode === 404) {
      throw new GameNotFoundError(gameId);
    }
    throw error;
  }
}

// Get game and verify ownership, throws appropriate errors
async function getOwnedGameEntity(request: HttpRequest, gameId: string): Promise<{ entity: GameEntity; user: AuthUser }> {
  const user = await requireGameKeeper(request);
  const entity = await getGameEntity(gameId);
  
  if (entity.createdBy !== user.userDetails) {
    throw new NotGameOwnerError();
  }
  
  return { entity, user };
}

// Parse gameId from request params
function getGameIdParam(request: HttpRequest): string {
  const gameId = request.params.gameId?.toUpperCase();
  if (!gameId) {
    throw new Error('Game ID is required');
  }
  return gameId;
}

// Standard error response handler
function handleError(error: unknown, context: InvocationContext, operation: string): HttpResponseInit {
  if (error instanceof AuthError) {
    return { status: error.statusCode, jsonBody: { error: error.message } };
  }
  if (error instanceof GameNotFoundError) {
    return { status: 404, jsonBody: { error: 'Game not found' } };
  }
  if (error instanceof ScenarioNotFoundError) {
    return { status: 404, jsonBody: { error: 'Scenario not found in this game' } };
  }
  if (error instanceof NotGameOwnerError) {
    return { status: 403, jsonBody: { error: error.message } };
  }
  if (error instanceof InvalidGameStateError) {
    return { status: 400, jsonBody: { error: error.message } };
  }
  if (error instanceof ValidationError) {
    return { status: 400, jsonBody: { error: error.message } };
  }
  if (error instanceof Error && error.message === 'Game ID is required') {
    return { status: 400, jsonBody: { error: error.message } };
  }
  
  context.error(`Failed to ${operation}:`, error);
  return { status: 500, jsonBody: { error: `Failed to ${operation}` } };
}

// ============ API Endpoints ============

// POST /api/games - Create a new game
app.http('createGame', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'games',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const user = await requireGameKeeper(request);

      // Ensure games table exists
      try {
        await gamesTable.createTable();
      } catch (error: any) {
        if (error.statusCode !== 409) throw error;
      }
      
      const body = await request.json() as {
        config: GameConfig;
        scenarioIds: string[];
      };

      if (!body.config || !body.scenarioIds) {
        return {
          status: 400,
          jsonBody: { error: 'config and scenarioIds are required' },
        };
      }

      if (body.scenarioIds.length < MIN_SCENARIOS || body.scenarioIds.length > MAX_SCENARIOS) {
        return {
          status: 400,
          jsonBody: { error: `Scenario count must be between ${MIN_SCENARIOS} and ${MAX_SCENARIOS}, got ${body.scenarioIds.length}` },
        };
      }

      const gameCode = await generateUniqueGameCode();
      const now = new Date();

      // Create scenario refs with order
      const scenarios: ScenarioRef[] = body.scenarioIds.map((id, index) => ({
        scenarioId: id,
        order: index + 1,
      }));

      const entity: GameEntity = {
        partitionKey: 'game',
        rowKey: gameCode,
        createdBy: user.userDetails,
        createdAt: now,
        status: 'lobby',
        config: JSON.stringify(body.config),
        scenarios: JSON.stringify(scenarios),
      };

      await gamesTable.createEntity(entity);

      return {
        status: 201,
        jsonBody: entityToGame(entity),
      };
    } catch (error) {
      if (error instanceof AuthError) {
        return {
          status: error.statusCode,
          jsonBody: { error: error.message },
        };
      }
      context.error('Failed to create game:', error);
      return {
        status: 500,
        jsonBody: { error: 'Failed to create game' },
      };
    }
  },
});

// GET /api/games - List games for current user
app.http('listGames', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'games',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const user = await requireGameKeeper(request);
      
      const games: Game[] = [];
      const entities = gamesTable.listEntities<GameEntity>({
        queryOptions: {
          filter: `PartitionKey eq 'game' and createdBy eq '${user.userDetails}'`,
        },
      });

      for await (const entity of entities) {
        games.push(entityToGame(entity));
      }

      // Sort by creation date, newest first
      games.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      return {
        status: 200,
        jsonBody: games,
      };
    } catch (error) {
      if (error instanceof AuthError) {
        return {
          status: error.statusCode,
          jsonBody: { error: error.message },
        };
      }
      context.error('Failed to list games:', error);
      return {
        status: 500,
        jsonBody: { error: 'Failed to list games' },
      };
    }
  },
});

// GET /api/games/:id - Get a specific game (public for players)
app.http('getGame', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'games/{gameId}',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const gameId = getGameIdParam(request);
      const entity = await getGameEntity(gameId);
      
      return { status: 200, jsonBody: entityToGame(entity) };
    } catch (error) {
      return handleError(error, context, 'get game');
    }
  },
});

// PATCH /api/games/:id - Update game (game keeper only)
app.http('updateGame', {
  methods: ['PATCH'],
  authLevel: 'anonymous',
  route: 'games/{gameId}',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const gameId = getGameIdParam(request);
      const { entity } = await getOwnedGameEntity(request, gameId);

      const body = await request.json() as Partial<{
        config: GameConfig;
        status: Game['status'];
      }>;

      // Update allowed fields
      if (body.config) {
        entity.config = JSON.stringify(body.config);
      }
      if (body.status) {
        entity.status = body.status;
        
        // Handle status transitions
        if (body.status === 'active' && !entity.startedAt) {
          entity.startedAt = new Date();
          const config = JSON.parse(entity.config) as GameConfig;
          entity.endsAt = new Date(Date.now() + config.timeLimit * 60 * 1000);
        }
      }

      await gamesTable.updateEntity(entity, 'Merge');

      return { status: 200, jsonBody: entityToGame(entity) };
    } catch (error) {
      return handleError(error, context, 'update game');
    }
  },
});

// DELETE /api/games/:id - Delete game and all associated data (game keeper only)
app.http('deleteGame', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'games/{gameId}',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const gameId = getGameIdParam(request);
      const { entity } = await getOwnedGameEntity(request, gameId);

      // Only allow deleting completed games
      if (entity.status !== 'complete') {
        throw new InvalidGameStateError('Can only delete completed games');
      }

      // Delete game and all associated data (teams, submissions, blobs)
      const { deleteGameAndData } = await import('./cleanup.js');
      await deleteGameAndData(gameId, context);

      return { status: 204, body: undefined };
    } catch (error) {
      return handleError(error, context, 'delete game');
    }
  },
});

// POST /api/games/:id/start - Start the game
app.http('startGame', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'games/{gameId}/start',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const gameId = getGameIdParam(request);
      const { entity } = await getOwnedGameEntity(request, gameId);

      if (entity.status !== 'lobby') {
        throw new InvalidGameStateError('Game can only be started from lobby status');
      }

      const now = new Date();
      const config = JSON.parse(entity.config) as GameConfig;
      
      entity.status = 'active';
      entity.startedAt = now;
      entity.endsAt = new Date(now.getTime() + config.timeLimit * 60 * 1000);
      entity.totalPausedSeconds = 0;

      await gamesTable.updateEntity(entity, 'Merge');

      return { status: 200, jsonBody: entityToGame(entity) };
    } catch (error) {
      return handleError(error, context, 'start game');
    }
  },
});

// POST /api/games/:id/pause - Pause the game
app.http('pauseGame', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'games/{gameId}/pause',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const gameId = getGameIdParam(request);
      const { entity } = await getOwnedGameEntity(request, gameId);

      if (entity.status !== 'active') {
        throw new InvalidGameStateError('Game can only be paused when active');
      }

      entity.status = 'paused';
      entity.pausedAt = new Date();

      await gamesTable.updateEntity(entity, 'Merge');

      return { status: 200, jsonBody: entityToGame(entity) };
    } catch (error) {
      return handleError(error, context, 'pause game');
    }
  },
});

// POST /api/games/:id/resume - Resume the game
app.http('resumeGame', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'games/{gameId}/resume',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const gameId = getGameIdParam(request);
      const { entity } = await getOwnedGameEntity(request, gameId);

      if (entity.status !== 'paused') {
        throw new InvalidGameStateError('Game can only be resumed when paused');
      }

      // Calculate how long the game was paused
      const pausedAt = entity.pausedAt ? new Date(entity.pausedAt) : new Date();
      const pauseDurationSeconds = Math.floor((Date.now() - pausedAt.getTime()) / 1000);
      
      // Add pause duration to total and extend endsAt
      entity.totalPausedSeconds = (entity.totalPausedSeconds || 0) + pauseDurationSeconds;
      if (entity.endsAt) {
        entity.endsAt = new Date(new Date(entity.endsAt).getTime() + pauseDurationSeconds * 1000);
      }
      
      entity.status = 'active';
      entity.pausedAt = undefined;

      await gamesTable.updateEntity(entity, 'Merge');

      return { status: 200, jsonBody: entityToGame(entity) };
    } catch (error) {
      return handleError(error, context, 'resume game');
    }
  },
});

// POST /api/games/:id/end - End the game and move to judging
app.http('endGame', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'games/{gameId}/end',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const gameId = getGameIdParam(request);
      const { entity } = await getOwnedGameEntity(request, gameId);

      if (entity.status !== 'active' && entity.status !== 'paused') {
        throw new InvalidGameStateError('Game can only be ended when active or paused');
      }

      entity.status = 'judging';
      entity.pausedAt = undefined;

      await gamesTable.updateEntity(entity, 'Merge');

      return { status: 200, jsonBody: entityToGame(entity) };
    } catch (error) {
      return handleError(error, context, 'end game');
    }
  },
});

// POST /api/games/:id/bonus - Award bonus point for a scenario
app.http('awardBonus', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'games/{gameId}/bonus',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const gameId = getGameIdParam(request);
      const body = await request.json() as { scenarioId: string; teamId: string };
      
      if (!body.scenarioId || !body.teamId) {
        throw new ValidationError('scenarioId and teamId are required');
      }

      const { entity } = await getOwnedGameEntity(request, gameId);

      if (entity.status !== 'judging') {
        throw new InvalidGameStateError('Bonuses can only be awarded during judging phase');
      }

      // Update the scenario ref with the bonus
      const scenarios: ScenarioRef[] = JSON.parse(entity.scenarios);
      const scenarioRef = scenarios.find(s => s.scenarioId === body.scenarioId);
      
      if (!scenarioRef) {
        throw new ScenarioNotFoundError(body.scenarioId);
      }

      scenarioRef.bonusAwardedTo = body.teamId;
      entity.scenarios = JSON.stringify(scenarios);

      await gamesTable.updateEntity(entity, 'Merge');

      return { status: 200, jsonBody: entityToGame(entity) };
    } catch (error) {
      return handleError(error, context, 'award bonus');
    }
  },
});

// POST /api/games/:id/disqualify - Disqualify or un-disqualify a team's submission for a scenario
app.http('disqualifySubmission', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'games/{gameId}/disqualify',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const gameId = getGameIdParam(request);
      const body = await request.json() as { scenarioId: string; teamId: string; disqualify: boolean };
      
      if (!body.scenarioId || !body.teamId || typeof body.disqualify !== 'boolean') {
        throw new ValidationError('scenarioId, teamId, and disqualify (boolean) are required');
      }

      const { entity } = await getOwnedGameEntity(request, gameId);

      if (entity.status !== 'judging') {
        throw new InvalidGameStateError('Disqualifications can only be made during judging phase');
      }

      // Update the scenario ref with disqualification
      const scenarios: ScenarioRef[] = JSON.parse(entity.scenarios);
      const scenarioRef = scenarios.find(s => s.scenarioId === body.scenarioId);
      
      if (!scenarioRef) {
        throw new ScenarioNotFoundError(body.scenarioId);
      }

      // Initialize array if needed
      if (!scenarioRef.disqualifiedTeams) {
        scenarioRef.disqualifiedTeams = [];
      }

      if (body.disqualify) {
        // Add to disqualified list if not already there
        if (!scenarioRef.disqualifiedTeams.includes(body.teamId)) {
          scenarioRef.disqualifiedTeams.push(body.teamId);
        }
        // Remove bonus if this team had it
        if (scenarioRef.bonusAwardedTo === body.teamId) {
          scenarioRef.bonusAwardedTo = undefined;
        }
      } else {
        // Remove from disqualified list
        scenarioRef.disqualifiedTeams = scenarioRef.disqualifiedTeams.filter(id => id !== body.teamId);
      }

      entity.scenarios = JSON.stringify(scenarios);

      await gamesTable.updateEntity(entity, 'Merge');

      return { status: 200, jsonBody: entityToGame(entity) };
    } catch (error) {
      return handleError(error, context, 'disqualify submission');
    }
  },
});

// POST /api/games/:id/complete - Start the reveal animation phase
app.http('completeGame', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'games/{gameId}/complete',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const gameId = getGameIdParam(request);
      const { entity } = await getOwnedGameEntity(request, gameId);

      if (entity.status !== 'judging') {
        throw new InvalidGameStateError('Game can only be completed from judging phase');
      }

      // Set to 'revealing' - players will wait while gamekeeper sees the animation
      entity.status = 'revealing';

      await gamesTable.updateEntity(entity, 'Merge');

      return { status: 200, jsonBody: entityToGame(entity) };
    } catch (error) {
      return handleError(error, context, 'complete game');
    }
  },
});

// POST /api/games/:id/finalize - Finish the reveal and mark game as complete
app.http('finalizeGame', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'games/{gameId}/finalize',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const gameId = getGameIdParam(request);
      const { entity } = await getOwnedGameEntity(request, gameId);

      if (entity.status !== 'revealing') {
        throw new InvalidGameStateError('Game can only be finalized from revealing phase');
      }

      entity.status = 'complete';

      await gamesTable.updateEntity(entity, 'Merge');

      return { status: 200, jsonBody: entityToGame(entity) };
    } catch (error) {
      return handleError(error, context, 'finalize game');
    }
  },
});

// POST /api/games/:id/crowd-voting/open - Open crowd voting for a scenario
app.http('openCrowdVoting', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'games/{gameId}/crowd-voting/open',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const gameId = getGameIdParam(request);
      const body = await request.json() as { scenarioId: string };

      if (!body.scenarioId) {
        throw new ValidationError('scenarioId is required');
      }

      const { entity } = await getOwnedGameEntity(request, gameId);

      if (entity.status !== 'judging') {
        throw new InvalidGameStateError('Crowd voting can only be opened during judging phase');
      }

      const scenarios: ScenarioRef[] = JSON.parse(entity.scenarios);
      const scenarioRef = scenarios.find(s => s.scenarioId === body.scenarioId);

      if (!scenarioRef) {
        throw new ScenarioNotFoundError(body.scenarioId);
      }

      // Close any other scenario that has voting open
      for (const s of scenarios) {
        if (s.scenarioId !== body.scenarioId && s.crowdVotingOpen) {
          s.crowdVotingOpen = false;
        }
      }

      scenarioRef.crowdVotingOpen = true;
      scenarioRef.crowdVotes = {};
      scenarioRef.crowdFavorites = undefined;
      entity.scenarios = JSON.stringify(scenarios);

      await gamesTable.updateEntity(entity, 'Merge');

      return { status: 200, jsonBody: entityToGame(entity) };
    } catch (error) {
      return handleError(error, context, 'open crowd voting');
    }
  },
});

// POST /api/games/:id/crowd-voting/close - Close crowd voting for a scenario and calculate winners
app.http('closeCrowdVoting', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'games/{gameId}/crowd-voting/close',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const gameId = getGameIdParam(request);
      const body = await request.json() as { scenarioId: string };

      if (!body.scenarioId) {
        throw new ValidationError('scenarioId is required');
      }

      const { entity } = await getOwnedGameEntity(request, gameId);

      if (entity.status !== 'judging') {
        throw new InvalidGameStateError('Crowd voting can only be closed during judging phase');
      }

      const scenarios: ScenarioRef[] = JSON.parse(entity.scenarios);
      const scenarioRef = scenarios.find(s => s.scenarioId === body.scenarioId);

      if (!scenarioRef) {
        throw new ScenarioNotFoundError(body.scenarioId);
      }

      scenarioRef.crowdVotingOpen = false;

      // Calculate crowd favorites from votes
      const votes = scenarioRef.crowdVotes || {};
      const voteCounts: Record<string, number> = {};
      for (const votedForTeamId of Object.values(votes)) {
        voteCounts[votedForTeamId] = (voteCounts[votedForTeamId] || 0) + 1;
      }

      // Find max vote count (if any votes were cast)
      const maxVotes = Math.max(0, ...Object.values(voteCounts));
      if (maxVotes > 0) {
        // All teams tied at max get the crowd favorite
        scenarioRef.crowdFavorites = Object.entries(voteCounts)
          .filter(([, count]) => count === maxVotes)
          .map(([teamId]) => teamId);
      } else {
        scenarioRef.crowdFavorites = [];
      }

      entity.scenarios = JSON.stringify(scenarios);

      await gamesTable.updateEntity(entity, 'Merge');

      return { status: 200, jsonBody: entityToGame(entity) };
    } catch (error) {
      return handleError(error, context, 'close crowd voting');
    }
  },
});

// POST /api/games/:id/crowd-voting/vote - Cast a crowd vote (captain only)
app.http('castCrowdVote', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'games/{gameId}/crowd-voting/vote',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const gameId = getGameIdParam(request);
      const body = await request.json() as {
        scenarioId: string;
        teamId: string;
        playerId: string;
        votedForTeamId: string;
      };

      if (!body.scenarioId || !body.teamId || !body.playerId || !body.votedForTeamId) {
        throw new ValidationError('scenarioId, teamId, playerId, and votedForTeamId are required');
      }

      // Can't vote for own team
      if (body.teamId === body.votedForTeamId) {
        throw new ValidationError('Cannot vote for your own team');
      }

      // Get game entity (no auth required - anonymous players vote)
      const entity = await getGameEntity(gameId);

      if (entity.status !== 'judging') {
        throw new InvalidGameStateError('Voting is only available during judging phase');
      }

      const scenarios: ScenarioRef[] = JSON.parse(entity.scenarios);
      const scenarioRef = scenarios.find(s => s.scenarioId === body.scenarioId);

      if (!scenarioRef) {
        throw new ScenarioNotFoundError(body.scenarioId);
      }

      if (!scenarioRef.crowdVotingOpen) {
        throw new InvalidGameStateError('Voting is not open for this scenario');
      }

      // Validate the voted-for team is not disqualified
      if (scenarioRef.disqualifiedTeams?.includes(body.votedForTeamId)) {
        throw new ValidationError('Cannot vote for a disqualified team');
      }

      // Validate captain: get the team and check if playerId is the first player by joinedAt
      let teamEntity: TeamEntity;
      try {
        teamEntity = await teamsTable.getEntity<TeamEntity>(gameId, body.teamId);
      } catch (error: any) {
        if (error.statusCode === 404) {
          throw new ValidationError('Team not found');
        }
        throw error;
      }

      const players: Player[] = JSON.parse(teamEntity.players || '[]');
      if (players.length === 0) {
        throw new ValidationError('Team has no players');
      }

      // Captain is the first player by joinedAt
      const captainId = getCaptainId(players);

      if (captainId !== body.playerId) {
        throw new ValidationError('Only the team captain can vote');
      }

      // Validate the voted-for team exists
      try {
        await teamsTable.getEntity<TeamEntity>(gameId, body.votedForTeamId);
      } catch (error: any) {
        if (error.statusCode === 404) {
          throw new ValidationError('Voted-for team not found');
        }
        throw error;
      }

      // Record vote (overwrite if already voted)
      if (!scenarioRef.crowdVotes) {
        scenarioRef.crowdVotes = {};
      }
      scenarioRef.crowdVotes[body.teamId] = body.votedForTeamId;

      entity.scenarios = JSON.stringify(scenarios);

      await gamesTable.updateEntity(entity, 'Merge');

      return { status: 200, jsonBody: entityToGame(entity) };
    } catch (error) {
      return handleError(error, context, 'cast crowd vote');
    }
  },
});

// GET /api/games/:id/download - Proxy download with Content-Disposition header
// This bypasses CORS issues and triggers proper browser download behavior
app.http('downloadMedia', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'games/{gameId}/download',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const gameId = request.params.gameId?.toUpperCase();
      const blobUrl = request.query.get('url');
      const filename = request.query.get('filename') || 'download';

      if (!gameId) {
        return { status: 400, jsonBody: { error: 'Game ID is required' } };
      }

      if (!blobUrl) {
        return { status: 400, jsonBody: { error: 'Missing url parameter' } };
      }

      // Security: Only allow downloads from our blob storage
      // In production, this would be the Azure blob storage URL
      // In development, this is the Azurite URL
      const allowedHosts = [
        '127.0.0.1:10000',           // Azurite local
        'localhost:10000',            // Azurite local alt
        '.blob.core.windows.net',     // Azure Blob Storage
      ];
      
      try {
        const urlObj = new URL(blobUrl);
        const isAllowed = allowedHosts.some(host => 
          host.startsWith('.') 
            ? urlObj.hostname.endsWith(host) 
            : urlObj.host === host
        );
        
        if (!isAllowed) {
          context.warn(`Blocked download proxy request to unauthorized host: ${urlObj.host}`);
          return { status: 403, jsonBody: { error: 'Download source not allowed' } };
        }

        // Security: Verify the blob path contains this game's ID
        // Blob paths are: /media/{gameId}/{teamId}/{scenarioId}.ext
        const pathParts = urlObj.pathname.split('/');
        // Path format: /devstoreaccount1/media/GAMEID/... (local) or /media/GAMEID/... (prod)
        const gameIdInPath = pathParts.find(part => part === gameId);
        if (!gameIdInPath) {
          context.warn(`Blocked download: game ID ${gameId} not found in blob path ${urlObj.pathname}`);
          return { status: 403, jsonBody: { error: 'Cannot download media from other games' } };
        }
      } catch {
        return { status: 400, jsonBody: { error: 'Invalid URL' } };
      }

      // Fetch the blob from storage
      const response = await fetch(blobUrl);
      if (!response.ok) {
        context.error(`Failed to fetch blob: ${response.status} ${response.statusText}`);
        return { status: 502, jsonBody: { error: 'Failed to fetch media' } };
      }

      const contentType = response.headers.get('content-type') || 'application/octet-stream';
      const buffer = await response.arrayBuffer();

      // Encode filename for Content-Disposition header (RFC 5987)
      const encodedFilename = encodeURIComponent(filename).replace(/['()]/g, escape);

      return {
        status: 200,
        body: new Uint8Array(buffer),
        headers: {
          'Content-Type': contentType,
          'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodedFilename}`,
          'Content-Length': buffer.byteLength.toString(),
          'X-Content-Type-Options': 'nosniff',
        },
      };
    } catch (error) {
      return handleError(error, context, 'download media');
    }
  },
});
