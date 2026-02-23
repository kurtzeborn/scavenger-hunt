import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { gamekeepersTable, gamesTable } from '../storage.js';
import { requireGameKeeper, AuthError } from '../auth.js';
import { GameKeeperEntity, GameEntity } from '../types.js';

// GET /api/gamekeepers - List all game keepers with game counts
app.http('listGameKeepers', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'gamekeepers',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      await requireGameKeeper(request);
      
      // Build a map of game counts per keeper email
      const activeCountMap = new Map<string, number>();
      const completedCountMap = new Map<string, number>();
      const allGames = gamesTable.listEntities<GameEntity>({
        queryOptions: { filter: `PartitionKey eq 'game'` },
      });
      for await (const game of allGames) {
        if (!game.createdBy) continue;
        const email = game.createdBy.toLowerCase();
        if (game.status === 'complete') {
          completedCountMap.set(email, (completedCountMap.get(email) || 0) + 1);
        } else {
          activeCountMap.set(email, (activeCountMap.get(email) || 0) + 1);
        }
      }

      const keepers: Array<{
        email: string;
        displayName: string;
        addedBy: string;
        addedAt: Date;
        activeGames: number;
        completedGames: number;
      }> = [];
      const entities = gamekeepersTable.listEntities<GameKeeperEntity>();

      for await (const entity of entities) {
        const email = entity.rowKey.toLowerCase();
        keepers.push({
          email: entity.rowKey,
          displayName: entity.displayName,
          addedBy: entity.addedBy,
          addedAt: entity.addedAt,
          activeGames: activeCountMap.get(email) || 0,
          completedGames: completedCountMap.get(email) || 0,
        });
      }

      keepers.sort((a, b) => a.displayName.localeCompare(b.displayName));

      return {
        status: 200,
        jsonBody: keepers,
      };
    } catch (error) {
      if (error instanceof AuthError) {
        return {
          status: error.statusCode,
          jsonBody: { error: error.message },
        };
      }
      context.error('Failed to list game keepers:', error);
      return {
        status: 500,
        jsonBody: { error: 'Failed to list game keepers' },
      };
    }
  },
});

// POST /api/gamekeepers - Invite a new game keeper
app.http('inviteGameKeeper', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'gamekeepers',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const user = await requireGameKeeper(request);
      
      const body = await request.json() as { email: string; displayName?: string };
      
      if (!body.email) {
        return {
          status: 400,
          jsonBody: { error: 'email is required' },
        };
      }

      const email = body.email.toLowerCase().trim();
      
      // Validate email format
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return {
          status: 400,
          jsonBody: { error: 'Invalid email format' },
        };
      }

      const entity: GameKeeperEntity = {
        partitionKey: 'gamekeeper',
        rowKey: email,
        displayName: body.displayName || email.split('@')[0],
        addedBy: user.userDetails,
        addedAt: new Date(),
      };

      try {
        await gamekeepersTable.createEntity(entity);
      } catch (error: any) {
        if (error.statusCode === 409) {
          return {
            status: 409,
            jsonBody: { error: 'This email is already a game keeper' },
          };
        }
        throw error;
      }

      return {
        status: 201,
        jsonBody: {
          email: entity.rowKey,
          displayName: entity.displayName,
          addedAt: entity.addedAt,
        },
      };
    } catch (error) {
      if (error instanceof AuthError) {
        return {
          status: error.statusCode,
          jsonBody: { error: error.message },
        };
      }
      context.error('Failed to invite game keeper:', error);
      return {
        status: 500,
        jsonBody: { error: 'Failed to invite game keeper' },
      };
    }
  },
});

// DELETE /api/gamekeepers/:email - Remove a game keeper
app.http('removeGameKeeper', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'gamekeepers/{email}',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const user = await requireGameKeeper(request);
      const email = request.params.email?.toLowerCase();
      
      if (!email) {
        return {
          status: 400,
          jsonBody: { error: 'Email is required' },
        };
      }

      // Prevent removing yourself
      if (email === user.userDetails.toLowerCase()) {
        return {
          status: 400,
          jsonBody: { error: 'You cannot remove yourself' },
        };
      }

      try {
        await gamekeepersTable.deleteEntity('gamekeeper', email);
      } catch (error: any) {
        if (error.statusCode === 404) {
          return {
            status: 404,
            jsonBody: { error: 'Game keeper not found' },
          };
        }
        throw error;
      }

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
      context.error('Failed to remove game keeper:', error);
      return {
        status: 500,
        jsonBody: { error: 'Failed to remove game keeper' },
      };
    }
  },
});

// POST /api/gamekeepers/seed - Seed initial game keeper (dev only)
app.http('seedGameKeeper', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'gamekeepers/seed',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      // Create table if it doesn't exist
      try {
        await gamekeepersTable.createTable();
        context.log('Created gamekeepers table');
      } catch (error: any) {
        // Table already exists (409) is fine
        if (error.statusCode !== 409) {
          throw error;
        }
      }

      // Seed the initial game keeper
      const initialEmail = 'scott@kurtzeborn.org';
      
      const entity: GameKeeperEntity = {
        partitionKey: 'gamekeeper',
        rowKey: initialEmail,
        displayName: 'Scott Kurtzeborn',
        addedBy: 'system',
        addedAt: new Date(),
      };

      try {
        await gamekeepersTable.createEntity(entity);
        return {
          status: 201,
          jsonBody: { message: `Seeded initial game keeper: ${initialEmail}` },
        };
      } catch (error: any) {
        if (error.statusCode === 409) {
          return {
            status: 200,
            jsonBody: { message: 'Initial game keeper already exists' },
          };
        }
        throw error;
      }
    } catch (error) {
      context.error('Failed to seed game keeper:', error);
      return {
        status: 500,
        jsonBody: { error: 'Failed to seed game keeper' },
      };
    }
  },
});
