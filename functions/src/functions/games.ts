import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { v4 as uuidv4 } from 'uuid';
import { gamesTable } from '../storage.js';
import { requireGameKeeper, AuthError, getAuthUser, isGameKeeper } from '../auth.js';
import { Game, GameEntity, GameConfig, ScenarioRef, GAME_CODE_CHARS } from '../types.js';

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

      if (body.scenarioIds.length !== body.config.scenarioCount) {
        return {
          status: 400,
          jsonBody: { error: `Expected ${body.config.scenarioCount} scenarios, got ${body.scenarioIds.length}` },
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
      const gameId = request.params.gameId?.toUpperCase();
      
      if (!gameId) {
        return {
          status: 400,
          jsonBody: { error: 'Game ID is required' },
        };
      }

      const entity = await gamesTable.getEntity<GameEntity>('game', gameId);
      
      return {
        status: 200,
        jsonBody: entityToGame(entity),
      };
    } catch (error: any) {
      if (error.statusCode === 404) {
        return {
          status: 404,
          jsonBody: { error: 'Game not found' },
        };
      }
      context.error('Failed to get game:', error);
      return {
        status: 500,
        jsonBody: { error: 'Failed to get game' },
      };
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
      const user = await requireGameKeeper(request);
      const gameId = request.params.gameId?.toUpperCase();
      
      if (!gameId) {
        return {
          status: 400,
          jsonBody: { error: 'Game ID is required' },
        };
      }

      // Get existing game
      let entity: GameEntity;
      try {
        entity = await gamesTable.getEntity<GameEntity>('game', gameId);
      } catch (error: any) {
        if (error.statusCode === 404) {
          return {
            status: 404,
            jsonBody: { error: 'Game not found' },
          };
        }
        throw error;
      }

      // Verify ownership
      if (entity.createdBy !== user.userDetails) {
        return {
          status: 403,
          jsonBody: { error: 'You can only update your own games' },
        };
      }

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

      return {
        status: 200,
        jsonBody: entityToGame(entity),
      };
    } catch (error) {
      if (error instanceof AuthError) {
        return {
          status: error.statusCode,
          jsonBody: { error: error.message },
        };
      }
      context.error('Failed to update game:', error);
      return {
        status: 500,
        jsonBody: { error: 'Failed to update game' },
      };
    }
  },
});

// DELETE /api/games/:id - Delete game (game keeper only)
app.http('deleteGame', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'games/{gameId}',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const user = await requireGameKeeper(request);
      const gameId = request.params.gameId?.toUpperCase();
      
      if (!gameId) {
        return {
          status: 400,
          jsonBody: { error: 'Game ID is required' },
        };
      }

      // Get existing game
      let entity: GameEntity;
      try {
        entity = await gamesTable.getEntity<GameEntity>('game', gameId);
      } catch (error: any) {
        if (error.statusCode === 404) {
          return {
            status: 404,
            jsonBody: { error: 'Game not found' },
          };
        }
        throw error;
      }

      // Verify ownership
      if (entity.createdBy !== user.userDetails) {
        return {
          status: 403,
          jsonBody: { error: 'You can only delete your own games' },
        };
      }

      // Delete the game
      await gamesTable.deleteEntity('game', gameId);

      // TODO: Also delete teams, media submissions, and blobs

      return {
        status: 204,
        body: undefined,
      };
    } catch (error) {
      if (error instanceof AuthError) {
        return {
          status: error.statusCode,
          jsonBody: { error: error.message },
        };
      }
      context.error('Failed to delete game:', error);
      return {
        status: 500,
        jsonBody: { error: 'Failed to delete game' },
      };
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
      const user = await requireGameKeeper(request);
      const gameId = request.params.gameId?.toUpperCase();
      
      if (!gameId) {
        return {
          status: 400,
          jsonBody: { error: 'Game ID is required' },
        };
      }

      let entity: GameEntity;
      try {
        entity = await gamesTable.getEntity<GameEntity>('game', gameId);
      } catch (error: any) {
        if (error.statusCode === 404) {
          return {
            status: 404,
            jsonBody: { error: 'Game not found' },
          };
        }
        throw error;
      }

      if (entity.createdBy !== user.userDetails) {
        return {
          status: 403,
          jsonBody: { error: 'You can only start your own games' },
        };
      }

      if (entity.status !== 'lobby') {
        return {
          status: 400,
          jsonBody: { error: 'Game can only be started from lobby status' },
        };
      }

      const now = new Date();
      const config = JSON.parse(entity.config) as GameConfig;
      
      entity.status = 'active';
      entity.startedAt = now;
      entity.endsAt = new Date(now.getTime() + config.timeLimit * 60 * 1000);
      entity.totalPausedSeconds = 0;

      await gamesTable.updateEntity(entity, 'Merge');

      return {
        status: 200,
        jsonBody: entityToGame(entity),
      };
    } catch (error) {
      if (error instanceof AuthError) {
        return {
          status: error.statusCode,
          jsonBody: { error: error.message },
        };
      }
      context.error('Failed to start game:', error);
      return {
        status: 500,
        jsonBody: { error: 'Failed to start game' },
      };
    }
  },
});
