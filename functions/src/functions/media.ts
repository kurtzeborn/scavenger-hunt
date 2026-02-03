import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { gamesTable, teamsTable, mediaSubmissionsTable, getMediaContainer, initializeBlob } from '../storage.js';
import { MediaSubmission, MediaSubmissionEntity, GameEntity, TeamEntity, MediaType } from '../types.js';
import { BlobSASPermissions, generateBlobSASQueryParameters, StorageSharedKeyCredential } from '@azure/storage-blob';

// Initialize blob storage (CORS, container) on first load
let blobInitialized = false;
async function ensureBlobInitialized() {
  if (!blobInitialized) {
    await initializeBlob();
    blobInitialized = true;
  }
}

// Get storage account credentials for SAS generation
function getStorageCredentials() {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING || 'UseDevelopmentStorage=true';
  
  // Parse connection string for local development
  if (connectionString === 'UseDevelopmentStorage=true') {
    // Azurite default credentials
    return {
      accountName: 'devstoreaccount1',
      accountKey: 'Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==',
    };
  }

  // Parse from connection string
  const parts = connectionString.split(';');
  let accountName = '';
  let accountKey = '';
  
  for (const part of parts) {
    if (part.startsWith('AccountName=')) {
      accountName = part.substring(12);
    } else if (part.startsWith('AccountKey=')) {
      accountKey = part.substring(11);
    }
  }

  return { accountName, accountKey };
}

// Get the base URL for blob storage (handles WSL->Windows accessibility)
function getBlobBaseUrl(): string {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING || 'UseDevelopmentStorage=true';
  
  if (connectionString === 'UseDevelopmentStorage=true') {
    // When running in WSL, use the environment variable for WSL IP if set
    // Otherwise fall back to localhost (works for native dev)
    const wslIp = process.env.WSL_HOST_IP || '127.0.0.1';
    return `http://${wslIp}:10000/devstoreaccount1`;
  }
  
  // For production, use the standard Azure blob URL
  const { accountName } = getStorageCredentials();
  return `https://${accountName}.blob.core.windows.net`;
}

// Convert entity to MediaSubmission object
function entityToSubmission(entity: MediaSubmissionEntity): MediaSubmission {
  const [teamId, scenarioId] = entity.rowKey.split('_');
  return {
    id: entity.rowKey,
    gameId: entity.partitionKey,
    teamId,
    scenarioId,
    uploadedBy: entity.uploadedBy,
    blobUrl: entity.blobUrl,
    uploadedAt: entity.uploadedAt,
    mediaType: entity.mediaType,
    status: entity.status,
    durationSeconds: entity.durationSeconds,
    errorMessage: entity.errorMessage,
  };
}

// Generate a read-only SAS URL for a blob (1 hour expiry)
function generateReadSasUrl(blobName: string): string {
  const { accountName, accountKey } = getStorageCredentials();
  const sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);

  const startsOn = new Date();
  const expiresOn = new Date(startsOn.getTime() + 60 * 60 * 1000); // 1 hour

  const sasToken = generateBlobSASQueryParameters({
    containerName: 'media',
    blobName,
    permissions: BlobSASPermissions.parse('r'), // read only
    startsOn,
    expiresOn,
  }, sharedKeyCredential).toString();

  const baseUrl = getBlobBaseUrl();
  return `${baseUrl}/media/${blobName}?${sasToken}`;
}

// Convert entity to MediaSubmission with secure playback URL
function entityToSubmissionWithSas(entity: MediaSubmissionEntity): MediaSubmission {
  const submission = entityToSubmission(entity);
  
  // Extract blob name from URL and generate fresh SAS URL
  const extension = entity.mediaType === 'video' ? 'webm' : 'jpg';
  const blobName = `${entity.partitionKey}/${entity.teamId}/${entity.scenarioId}.${extension}`;
  submission.blobUrl = generateReadSasUrl(blobName);
  
  return submission;
}

// POST /api/games/:id/videos/upload - Upload media directly (proxied through function)
// This replaces the SAS URL approach to avoid CORS issues with blob storage
app.http('uploadMedia', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'games/{gameId}/videos/upload',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    // Ensure blob storage is initialized
    await ensureBlobInitialized();
    
    try {
      const gameId = request.params.gameId?.toUpperCase();

      if (!gameId) {
        return {
          status: 400,
          jsonBody: { error: 'Game ID is required' },
        };
      }

      // Get metadata from query params
      const teamId = request.query.get('teamId');
      const scenarioId = request.query.get('scenarioId');
      const mediaType = request.query.get('mediaType') as MediaType;
      const playerId = request.query.get('playerId');
      const durationSeconds = request.query.get('durationSeconds');

      if (!teamId || !scenarioId || !mediaType || !playerId) {
        return {
          status: 400,
          jsonBody: { error: 'teamId, scenarioId, mediaType, and playerId are required' },
        };
      }

      // Verify game exists and is active
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

      if (gameEntity.status !== 'active') {
        return {
          status: 400,
          jsonBody: { error: 'Can only upload media during active game' },
        };
      }

      // Verify team exists and player is on the team
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

      const players = JSON.parse(teamEntity.players || '[]');
      const playerExists = players.some((p: { id: string }) => p.id === playerId);
      if (!playerExists) {
        return {
          status: 403,
          jsonBody: { error: 'Player is not on this team' },
        };
      }

      // Check if scenario is already completed by this team
      const completedScenarios = JSON.parse(teamEntity.completedScenarios || '[]');
      if (completedScenarios.includes(scenarioId)) {
        return {
          status: 400,
          jsonBody: { error: 'This scenario is already completed' },
        };
      }

      // Get the file data from the request body
      const fileBuffer = Buffer.from(await request.arrayBuffer());
      
      if (fileBuffer.length === 0) {
        return {
          status: 400,
          jsonBody: { error: 'No file data provided' },
        };
      }

      // Check file size (limit to 50MB)
      const maxSize = 50 * 1024 * 1024;
      if (fileBuffer.length > maxSize) {
        return {
          status: 413,
          jsonBody: { error: 'File too large. Maximum size is 50MB.' },
        };
      }

      // Generate blob name
      const extension = mediaType === 'video' ? 'webm' : 'jpg';
      const blobName = `${gameId}/${teamId}/${scenarioId}.${extension}`;

      const container = getMediaContainer();
      
      // Ensure container exists
      try {
        await container.create();
      } catch (error: any) {
        if (error.statusCode !== 409) throw error;
      }

      // Upload to blob storage
      const blockBlobClient = container.getBlockBlobClient(blobName);
      const contentType = mediaType === 'video' ? 'video/webm' : 'image/jpeg';
      
      await blockBlobClient.upload(fileBuffer, fileBuffer.length, {
        blobHTTPHeaders: {
          blobContentType: contentType,
        },
      });

      // Create submission record
      const submissionEntity: MediaSubmissionEntity = {
        partitionKey: gameId,
        rowKey: `${teamId}_${scenarioId}`,
        teamId,
        scenarioId,
        uploadedBy: playerId,
        blobUrl: blobName, // Store just the blob name, generate SAS URLs on read
        uploadedAt: new Date(),
        mediaType,
        status: 'complete' as const,
        durationSeconds: durationSeconds ? parseInt(durationSeconds, 10) : undefined,
      };

      await mediaSubmissionsTable.upsertEntity(submissionEntity, 'Replace');

      // Mark scenario as completed for the team
      completedScenarios.push(scenarioId);
      await teamsTable.updateEntity({
        partitionKey: gameId,
        rowKey: teamId,
        completedScenarios: JSON.stringify(completedScenarios),
      }, 'Merge');

      return {
        status: 200,
        jsonBody: {
          success: true,
          blobName,
          message: 'Media uploaded successfully',
        },
      };
    } catch (error: any) {
      context.error('Failed to upload media:', error);
      return {
        status: 500,
        jsonBody: { 
          error: 'Failed to upload media',
          details: error?.message || String(error),
        },
      };
    }
  },
});

// POST /api/games/:id/videos - Register an uploaded media submission (legacy - kept for compatibility)
app.http('registerMedia', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'games/{gameId}/videos',
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
        teamId: string;
        scenarioId: string;
        mediaType: MediaType;
        playerId: string;
        blobName: string;
        durationSeconds?: number;
      };

      if (!body.teamId || !body.scenarioId || !body.mediaType || !body.playerId || !body.blobName) {
        return {
          status: 400,
          jsonBody: { error: 'teamId, scenarioId, mediaType, playerId, and blobName are required' },
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

      // Verify team exists
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

      // Check if scenario is already completed (first-upload-wins)
      const completedScenarios: string[] = JSON.parse(teamEntity.completedScenarios || '[]');
      if (completedScenarios.includes(body.scenarioId)) {
        return {
          status: 400,
          jsonBody: { error: 'This scenario is already completed' },
        };
      }

      // Ensure media submissions table exists
      try {
        await mediaSubmissionsTable.createTable();
      } catch (error: any) {
        if (error.statusCode !== 409) throw error;
      }

      // Get blob URL
      const container = getMediaContainer();
      const blobClient = container.getBlockBlobClient(body.blobName);
      const blobUrl = blobClient.url;

      // Create media submission record
      const submissionEntity: MediaSubmissionEntity = {
        partitionKey: gameId,
        rowKey: `${body.teamId}_${body.scenarioId}`,
        teamId: body.teamId,
        scenarioId: body.scenarioId,
        uploadedBy: body.playerId,
        blobUrl,
        uploadedAt: new Date(),
        mediaType: body.mediaType,
        status: 'complete',
        durationSeconds: body.durationSeconds,
      };

      await mediaSubmissionsTable.createEntity(submissionEntity);

      // Mark scenario as completed for the team
      completedScenarios.push(body.scenarioId);
      teamEntity.completedScenarios = JSON.stringify(completedScenarios);
      await teamsTable.updateEntity(teamEntity, 'Merge');

      return {
        status: 201,
        jsonBody: entityToSubmission(submissionEntity),
      };
    } catch (error: any) {
      // Handle duplicate submission (409 Conflict)
      if (error.statusCode === 409) {
        return {
          status: 400,
          jsonBody: { error: 'This scenario is already completed' },
        };
      }
      context.error('Failed to register media:', error);
      return {
        status: 500,
        jsonBody: { error: 'Failed to register media' },
      };
    }
  },
});

// GET /api/games/:id/videos - Get all media submissions for a game
app.http('getMediaSubmissions', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'games/{gameId}/videos',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const gameId = request.params.gameId?.toUpperCase();
      const scenarioId = request.query.get('scenarioId');
      const teamId = request.query.get('teamId');

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

      let filter = `PartitionKey eq '${gameId}'`;
      
      // Add optional filters
      if (scenarioId && teamId) {
        filter += ` and RowKey eq '${teamId}_${scenarioId}'`;
      } else if (teamId) {
        filter += ` and teamId eq '${teamId}'`;
      }

      const submissions: MediaSubmission[] = [];
      const entities = mediaSubmissionsTable.listEntities<MediaSubmissionEntity>({
        queryOptions: { filter },
      });

      for await (const entity of entities) {
        // Filter by scenarioId if provided (since Table Storage doesn't support contains)
        if (scenarioId && !entity.rowKey.endsWith(`_${scenarioId}`)) {
          continue;
        }
        submissions.push(entityToSubmissionWithSas(entity));
      }

      return {
        status: 200,
        jsonBody: submissions,
      };
    } catch (error) {
      context.error('Failed to get media submissions:', error);
      return {
        status: 500,
        jsonBody: { error: 'Failed to get media submissions' },
      };
    }
  },
});

// GET /api/games/:id/videos/:scenarioId - Get videos for a specific scenario
app.http('getScenarioVideos', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'games/{gameId}/videos/{scenarioId}',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const gameId = request.params.gameId?.toUpperCase();
      const scenarioId = request.params.scenarioId;

      if (!gameId || !scenarioId) {
        return {
          status: 400,
          jsonBody: { error: 'Game ID and Scenario ID are required' },
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

      const submissions: MediaSubmission[] = [];
      const entities = mediaSubmissionsTable.listEntities<MediaSubmissionEntity>({
        queryOptions: {
          filter: `PartitionKey eq '${gameId}'`,
        },
      });

      for await (const entity of entities) {
        if (entity.scenarioId === scenarioId) {
          submissions.push(entityToSubmissionWithSas(entity));
        }
      }

      return {
        status: 200,
        jsonBody: submissions,
      };
    } catch (error) {
      context.error('Failed to get scenario videos:', error);
      return {
        status: 500,
        jsonBody: { error: 'Failed to get scenario videos' },
      };
    }
  },
});
