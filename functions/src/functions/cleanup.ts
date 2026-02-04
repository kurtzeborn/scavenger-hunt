import { app, Timer, InvocationContext } from '@azure/functions';
import { gamesTable, teamsTable, mediaSubmissionsTable, getMediaContainer } from '../storage.js';
import { GameEntity } from '../types.js';

// How old a game must be before cleanup (7 days in milliseconds)
const CLEANUP_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Delete a game and all associated data (teams, submissions, blobs)
 */
export async function deleteGameAndData(gameId: string, context?: InvocationContext): Promise<void> {
  const log = context ? context.log.bind(context) : console.log;
  const error = context ? context.error.bind(context) : console.error;

  // 1. Delete all teams for this game
  try {
    const teamsIterator = teamsTable.listEntities({
      queryOptions: { filter: `PartitionKey eq '${gameId}'` }
    });
    
    for await (const team of teamsIterator) {
      await teamsTable.deleteEntity(team.partitionKey as string, team.rowKey as string);
      log(`  Deleted team: ${team.rowKey}`);
    }
  } catch (err: any) {
    error(`  Failed to delete teams for game ${gameId}:`, err.message);
  }

  // 2. Delete all media submissions for this game
  try {
    const submissionsIterator = mediaSubmissionsTable.listEntities({
      queryOptions: { filter: `PartitionKey eq '${gameId}'` }
    });
    
    for await (const submission of submissionsIterator) {
      await mediaSubmissionsTable.deleteEntity(submission.partitionKey as string, submission.rowKey as string);
      log(`  Deleted submission: ${submission.rowKey}`);
    }
  } catch (err: any) {
    error(`  Failed to delete submissions for game ${gameId}:`, err.message);
  }

  // 3. Delete all blobs for this game (folder: media/{gameId}/*)
  try {
    const container = getMediaContainer();
    const blobsIterator = container.listBlobsFlat({ prefix: `${gameId}/` });
    
    for await (const blob of blobsIterator) {
      await container.deleteBlob(blob.name);
      log(`  Deleted blob: ${blob.name}`);
    }
  } catch (err: any) {
    // Container might not exist, that's fine
    if (err.statusCode !== 404) {
      error(`  Failed to delete blobs for game ${gameId}:`, err.message);
    }
  }

  // 4. Delete the game itself
  try {
    await gamesTable.deleteEntity('game', gameId);
    log(`  Deleted game: ${gameId}`);
  } catch (err: any) {
    error(`  Failed to delete game ${gameId}:`, err.message);
  }
}

/**
 * Timer function that runs daily at 2 AM UTC to clean up old games
 * 
 * Deletes:
 * - Games older than 7 days (based on createdAt)
 * - All associated teams
 * - All associated media submissions
 * - All associated blobs (though lifecycle policy handles this too)
 */
app.timer('cleanupExpiredGames', {
  // Run at 2:00 AM UTC every day
  schedule: '0 0 2 * * *',
  handler: async (timer: Timer, context: InvocationContext): Promise<void> => {
    context.log('Starting cleanup of expired games...');
    
    const cutoffDate = new Date(Date.now() - CLEANUP_AGE_MS);
    context.log(`Cutoff date: ${cutoffDate.toISOString()} (games created before this will be deleted)`);

    let gamesDeleted = 0;
    let gamesFailed = 0;

    try {
      // Find all games older than 7 days
      const gamesIterator = gamesTable.listEntities<GameEntity>({
        queryOptions: { filter: `PartitionKey eq 'game'` }
      });

      for await (const game of gamesIterator) {
        const createdAt = new Date(game.createdAt);
        
        if (createdAt < cutoffDate) {
          context.log(`Deleting expired game: ${game.rowKey} (created: ${createdAt.toISOString()})`);
          
          try {
            await deleteGameAndData(game.rowKey, context);
            gamesDeleted++;
          } catch (err: any) {
            context.error(`Failed to fully delete game ${game.rowKey}:`, err.message);
            gamesFailed++;
          }
        }
      }

      context.log(`Cleanup complete: ${gamesDeleted} games deleted, ${gamesFailed} failed`);
    } catch (error: any) {
      context.error('Cleanup failed:', error.message);
      throw error;
    }

    if (timer.isPastDue) {
      context.log('Timer was past due - cleanup ran late');
    }
  },
});
