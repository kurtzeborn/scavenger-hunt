import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { v4 as uuidv4 } from 'uuid';
import { gamesTable, teamsTable } from '../storage.js';
import { Team, TeamEntity, Player, CrewMember, GameEntity, TEAM_COLORS } from '../types.js';

// Game statuses that allow joining/adding crew
const JOIN_ALLOWED_STATUSES = ['lobby', 'active', 'paused'] as const;

// Calculate total team size (players + crew)
function getTotalTeamSize(players: Player[], crewMembers: CrewMember[]): number {
  return players.length + crewMembers.length;
}

// Convert entity to Team object
function entityToTeam(entity: TeamEntity): Team {
  return {
    id: entity.rowKey,
    gameId: entity.partitionKey,
    name: entity.name,
    color: entity.color,
    players: JSON.parse(entity.players || '[]'),
    crewMembers: JSON.parse(entity.crewMembers || '[]'),
    completedScenarios: JSON.parse(entity.completedScenarios || '[]'),
  };
}

// Get the next available team color for a game
async function getNextTeamColor(gameId: string): Promise<string> {
  const usedColors: string[] = [];
  const entities = teamsTable.listEntities<TeamEntity>({
    queryOptions: {
      filter: `PartitionKey eq '${gameId}'`,
    },
  });

  for await (const entity of entities) {
    usedColors.push(entity.color);
  }

  // Find the first unused color
  for (const color of TEAM_COLORS) {
    if (!usedColors.includes(color)) {
      return color;
    }
  }

  // If all colors used, start recycling
  return TEAM_COLORS[usedColors.length % TEAM_COLORS.length];
}

// POST /api/games/:id/join - Join a game (create/join team)
app.http('joinGame', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'games/{gameId}/join',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const gameId = request.params.gameId?.toUpperCase();

      if (!gameId) {
        return {
          status: 400,
          jsonBody: { error: 'Game ID is required' },
        };
      }

      const body = await request.json() as {
        displayName: string;
        teamId?: string; // Join existing team
        teamName?: string; // Create new team
      };

      if (!body.displayName || body.displayName.trim().length === 0) {
        return {
          status: 400,
          jsonBody: { error: 'Display name is required' },
        };
      }

      if (body.displayName.length > 20) {
        return {
          status: 400,
          jsonBody: { error: 'Display name must be 20 characters or less' },
        };
      }

      if (!body.teamId && !body.teamName) {
        return {
          status: 400,
          jsonBody: { error: 'Either teamId or teamName is required' },
        };
      }

      // Verify game exists and check status for join eligibility
      let gameEntity: GameEntity;
      try {
        gameEntity = await gamesTable.getEntity<GameEntity>('game', gameId);
      } catch (error: any) {
        if (error.statusCode === 404) {
          return {
            status: 404,
            jsonBody: { error: 'Game not found' },
          };
        }
        throw error;
      }

      // Check game status for join eligibility
      if (!JOIN_ALLOWED_STATUSES.includes(gameEntity.status as typeof JOIN_ALLOWED_STATUSES[number])) {
        return {
          status: 400,
          jsonBody: { error: 'This game has ended and is no longer accepting players' },
        };
      }

      // After lobby, can only join existing teams (no new team creation)
      const isLateJoin = gameEntity.status !== 'lobby';
      if (isLateJoin && body.teamName) {
        return {
          status: 400,
          jsonBody: { error: 'Cannot create new teams after the game has started. Please join an existing team.' },
        };
      }

      // Ensure teams table exists
      try {
        await teamsTable.createTable();
      } catch (error: any) {
        if (error.statusCode !== 409) throw error;
      }

      const playerId = uuidv4();
      const now = new Date();

      const newPlayer: Player = {
        id: playerId,
        displayName: body.displayName.trim(),
        joinedAt: now,
      };

      let team: Team;

      if (body.teamId) {
        // Join existing team
        let teamEntity: TeamEntity;
        try {
          teamEntity = await teamsTable.getEntity<TeamEntity>(gameId, body.teamId);
        } catch (error: any) {
          if (error.statusCode === 404) {
            return {
              status: 404,
              jsonBody: { error: 'Team not found' },
            };
          }
          throw error;
        }

        const players: Player[] = JSON.parse(teamEntity.players || '[]');
        const crewMembers: CrewMember[] = JSON.parse(teamEntity.crewMembers || '[]');

        // Check team size limit (6 members max: players + crew)
        if (getTotalTeamSize(players, crewMembers) >= 6) {
          return {
            status: 400,
            jsonBody: { error: 'Team is full (maximum 6 members)' },
          };
        }

        players.push(newPlayer);
        teamEntity.players = JSON.stringify(players);

        await teamsTable.updateEntity(teamEntity, 'Merge');
        team = entityToTeam(teamEntity);
      } else {
        // Create new team
        if (!body.teamName || body.teamName.trim().length === 0) {
          return {
            status: 400,
            jsonBody: { error: 'Team name is required when creating a new team' },
          };
        }

        if (body.teamName.length > 20) {
          return {
            status: 400,
            jsonBody: { error: 'Team name must be 20 characters or less' },
          };
        }

        // Count existing teams (max 20)
        let teamCount = 0;
        const existingTeams = teamsTable.listEntities<TeamEntity>({
          queryOptions: {
            filter: `PartitionKey eq '${gameId}'`,
          },
        });
        for await (const _entity of existingTeams) {
          teamCount++;
        }

        if (teamCount >= 20) {
          return {
            status: 400,
            jsonBody: { error: 'Maximum 20 teams per game' },
          };
        }

        const teamId = uuidv4();
        const color = await getNextTeamColor(gameId);

        const teamEntity: TeamEntity = {
          partitionKey: gameId,
          rowKey: teamId,
          name: body.teamName.trim(),
          color,
          players: JSON.stringify([newPlayer]),
          crewMembers: JSON.stringify([]),
          completedScenarios: JSON.stringify([]),
        };

        await teamsTable.createEntity(teamEntity);
        team = entityToTeam(teamEntity);
      }

      return {
        status: 200,
        jsonBody: {
          team,
          player: newPlayer,
        },
      };
    } catch (error) {
      context.error('Failed to join game:', error);
      return {
        status: 500,
        jsonBody: { error: 'Failed to join game' },
      };
    }
  },
});

// GET /api/games/:id/teams - Get all teams for a game
app.http('getTeams', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'games/{gameId}/teams',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const gameId = request.params.gameId?.toUpperCase();

      if (!gameId) {
        return {
          status: 400,
          jsonBody: { error: 'Game ID is required' },
        };
      }

      // Verify game exists
      try {
        await gamesTable.getEntity<GameEntity>('game', gameId);
      } catch (error: any) {
        if (error.statusCode === 404) {
          return {
            status: 404,
            jsonBody: { error: 'Game not found' },
          };
        }
        throw error;
      }

      const teams: Team[] = [];
      const entities = teamsTable.listEntities<TeamEntity>({
        queryOptions: {
          filter: `PartitionKey eq '${gameId}'`,
        },
      });

      for await (const entity of entities) {
        teams.push(entityToTeam(entity));
      }

      return {
        status: 200,
        jsonBody: teams,
      };
    } catch (error) {
      context.error('Failed to get teams:', error);
      return {
        status: 500,
        jsonBody: { error: 'Failed to get teams' },
      };
    }
  },
});

// DELETE /api/games/:id/teams/:teamId/players/:playerId - Leave a team (for future use)
app.http('leaveTeam', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'games/{gameId}/teams/{teamId}/players/{playerId}',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const gameId = request.params.gameId?.toUpperCase();
      const teamId = request.params.teamId;
      const playerId = request.params.playerId;

      if (!gameId || !teamId || !playerId) {
        return {
          status: 400,
          jsonBody: { error: 'Game ID, Team ID, and Player ID are required' },
        };
      }

      // Get team
      let teamEntity: TeamEntity;
      try {
        teamEntity = await teamsTable.getEntity<TeamEntity>(gameId, teamId);
      } catch (error: any) {
        if (error.statusCode === 404) {
          return {
            status: 404,
            jsonBody: { error: 'Team not found' },
          };
        }
        throw error;
      }

      const players: Player[] = JSON.parse(teamEntity.players || '[]');
      const playerIndex = players.findIndex(p => p.id === playerId);

      if (playerIndex === -1) {
        return {
          status: 404,
          jsonBody: { error: 'Player not found in team' },
        };
      }

      players.splice(playerIndex, 1);

      if (players.length === 0) {
        // Delete empty team
        await teamsTable.deleteEntity(gameId, teamId);
      } else {
        teamEntity.players = JSON.stringify(players);
        await teamsTable.updateEntity(teamEntity, 'Merge');
      }

      return {
        status: 204,
        body: undefined,
      };
    } catch (error) {
      context.error('Failed to leave team:', error);
      return {
        status: 500,
        jsonBody: { error: 'Failed to leave team' },
      };
    }
  },
});

// POST /api/games/:id/teams/seed - Seed test teams (dev mode only)
app.http('seedTestTeams', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'games/{gameId}/teams/seed',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const gameId = request.params.gameId?.toUpperCase();

      if (!gameId) {
        return {
          status: 400,
          jsonBody: { error: 'Game ID is required' },
        };
      }

      // Verify game exists and is in lobby
      let gameEntity: GameEntity;
      try {
        gameEntity = await gamesTable.getEntity<GameEntity>('game', gameId);
      } catch (error: any) {
        if (error.statusCode === 404) {
          return {
            status: 404,
            jsonBody: { error: 'Game not found' },
          };
        }
        throw error;
      }

      if (gameEntity.status !== 'lobby') {
        return {
          status: 400,
          jsonBody: { error: 'Can only seed teams in lobby status' },
        };
      }

      // Ensure teams table exists
      try {
        await teamsTable.createTable();
      } catch (error: any) {
        if (error.statusCode !== 409) throw error;
      }

      const testTeamNames = ['Alpha Squad', 'Beta Force', 'Gamma Team', 'Delta Crew'];
      const testPlayerNames = ['TestBot1', 'TestBot2', 'TestBot3'];
      const createdTeams: Team[] = [];

      // Create 2 test teams with players
      for (let i = 0; i < 2; i++) {
        const teamId = uuidv4();
        const color = await getNextTeamColor(gameId);
        const now = new Date();

        // Create 2-3 fake players per team
        const players: Player[] = testPlayerNames.slice(0, 2 + (i % 2)).map((name, idx) => ({
          id: uuidv4(),
          displayName: `${name}_${i + 1}`,
          joinedAt: now,
        }));

        const teamEntity: TeamEntity = {
          partitionKey: gameId,
          rowKey: teamId,
          name: testTeamNames[i],
          color,
          players: JSON.stringify(players),
          crewMembers: JSON.stringify([]),
          completedScenarios: JSON.stringify([]),
        };

        await teamsTable.createEntity(teamEntity);
        createdTeams.push(entityToTeam(teamEntity));
      }

      return {
        status: 201,
        jsonBody: {
          message: `Created ${createdTeams.length} test teams`,
          teams: createdTeams,
        },
      };
    } catch (error) {
      context.error('Failed to seed test teams:', error);
      return {
        status: 500,
        jsonBody: { error: 'Failed to seed test teams' },
      };
    }
  },
});

// POST /api/games/:id/teams/:teamId/crew - Add crew member (teammate without phone)
app.http('addCrewMember', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'games/{gameId}/teams/{teamId}/crew',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const gameId = request.params.gameId?.toUpperCase();
      const teamId = request.params.teamId;

      if (!gameId || !teamId) {
        return {
          status: 400,
          jsonBody: { error: 'Game ID and Team ID are required' },
        };
      }

      const body = await request.json() as {
        displayName: string;
        addedBy: string; // Player ID of who is adding
      };

      if (!body.displayName || body.displayName.trim().length === 0) {
        return {
          status: 400,
          jsonBody: { error: 'Display name is required' },
        };
      }

      if (body.displayName.length > 20) {
        return {
          status: 400,
          jsonBody: { error: 'Display name must be 20 characters or less' },
        };
      }

      if (!body.addedBy) {
        return {
          status: 400,
          jsonBody: { error: 'addedBy (player ID) is required' },
        };
      }

      // Verify game exists and is in valid state
      let gameEntity: GameEntity;
      try {
        gameEntity = await gamesTable.getEntity<GameEntity>('game', gameId);
      } catch (error: any) {
        if (error.statusCode === 404) {
          return {
            status: 404,
            jsonBody: { error: 'Game not found' },
          };
        }
        throw error;
      }

      // Can add crew in lobby, active, or paused
      if (!JOIN_ALLOWED_STATUSES.includes(gameEntity.status as typeof JOIN_ALLOWED_STATUSES[number])) {
        return {
          status: 400,
          jsonBody: { error: 'Cannot add crew members after the game has ended' },
        };
      }

      // Get team
      let teamEntity: TeamEntity;
      try {
        teamEntity = await teamsTable.getEntity<TeamEntity>(gameId, teamId);
      } catch (error: any) {
        if (error.statusCode === 404) {
          return {
            status: 404,
            jsonBody: { error: 'Team not found' },
          };
        }
        throw error;
      }

      const players: Player[] = JSON.parse(teamEntity.players || '[]');
      const crewMembers: CrewMember[] = JSON.parse(teamEntity.crewMembers || '[]');

      // Verify caller is a team member
      const isTeamMember = players.some(p => p.id === body.addedBy);
      if (!isTeamMember) {
        return {
          status: 403,
          jsonBody: { error: 'Only team members can add crew members' },
        };
      }

      // Check team size limit (6 members max: players + crew)
      if (getTotalTeamSize(players, crewMembers) >= 6) {
        return {
          status: 400,
          jsonBody: { error: 'Team is full (maximum 6 members)' },
        };
      }

      const now = new Date();
      const newCrewMember: CrewMember = {
        id: uuidv4(),
        displayName: body.displayName.trim(),
        addedBy: body.addedBy,
        addedAt: now,
      };

      crewMembers.push(newCrewMember);
      teamEntity.crewMembers = JSON.stringify(crewMembers);

      await teamsTable.updateEntity(teamEntity, 'Merge');

      return {
        status: 201,
        jsonBody: {
          crewMember: newCrewMember,
          team: entityToTeam(teamEntity),
        },
      };
    } catch (error) {
      context.error('Failed to add crew member:', error);
      return {
        status: 500,
        jsonBody: { error: 'Failed to add crew member' },
      };
    }
  },
});
