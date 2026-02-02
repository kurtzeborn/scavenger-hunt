import { TableClient } from '@azure/data-tables';

const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING || 'UseDevelopmentStorage=true';

// Create table clients
function getTableClient(tableName: string): TableClient {
  return TableClient.fromConnectionString(connectionString, tableName);
}

// Initialize all required tables
export async function initializeTables(): Promise<void> {
  const tableNames = ['games', 'teams', 'scenarios', 'gamekeepers', 'mediasubmissions'];
  
  for (const tableName of tableNames) {
    const client = getTableClient(tableName);
    try {
      await client.createTable();
      console.log(`Created table: ${tableName}`);
    } catch (error: any) {
      // Table already exists (409) is fine
      if (error.statusCode !== 409) {
        throw error;
      }
    }
  }
}

// Export table clients
export const gamesTable = getTableClient('games');
export const teamsTable = getTableClient('teams');
export const scenariosTable = getTableClient('scenarios');
export const gamekeepersTable = getTableClient('gamekeepers');
export const mediaSubmissionsTable = getTableClient('mediasubmissions');

// Blob storage connection
import { BlobServiceClient, ContainerClient } from '@azure/storage-blob';

const blobConnectionString = process.env.AZURE_STORAGE_CONNECTION_STRING || 'UseDevelopmentStorage=true';
const blobServiceClient = BlobServiceClient.fromConnectionString(blobConnectionString);

export function getMediaContainer(): ContainerClient {
  return blobServiceClient.getContainerClient('media');
}

export async function initializeBlobCors(): Promise<void> {
  try {
    // Determine allowed origins based on environment
    // In production, restrict to actual domain; in dev, allow all
    const isLocalDev = (process.env.AZURE_STORAGE_CONNECTION_STRING || 'UseDevelopmentStorage=true') === 'UseDevelopmentStorage=true';
    const allowedOrigins = isLocalDev 
      ? '*' 
      : (process.env.ALLOWED_ORIGINS || 'https://*.azurestaticapps.net');
    
    // Set CORS rules to allow browser uploads
    await blobServiceClient.setProperties({
      cors: [
        {
          allowedOrigins,
          allowedMethods: 'GET,HEAD,PUT,POST,DELETE,OPTIONS',
          allowedHeaders: '*',
          exposedHeaders: '*',
          maxAgeInSeconds: 3600,
        },
      ],
    });
    console.log('Configured blob CORS rules for origins:', allowedOrigins);
  } catch (error: any) {
    console.error('Failed to set blob CORS rules:', error.message);
  }
}

export async function initializeBlob(): Promise<void> {
  // Set CORS rules first
  await initializeBlobCors();
  
  const container = getMediaContainer();
  try {
    await container.create();
    console.log('Created blob container: media');
  } catch (error: any) {
    // Container already exists (409) is fine
    if (error.statusCode !== 409) {
      throw error;
    }
  }
}
