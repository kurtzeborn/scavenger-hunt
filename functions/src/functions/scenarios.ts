import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { scenariosTable } from '../storage.js';
import { Scenario, ScenarioEntity } from '../types.js';
import { SEED_SCENARIOS } from '../seed-scenarios.js';

// GET /api/scenarios - List all scenarios
app.http('getScenarios', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'scenarios',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const scenarios: Scenario[] = [];
      
      // List all scenarios from table storage
      const entities = scenariosTable.listEntities<ScenarioEntity>();
      
      for await (const entity of entities) {
        scenarios.push({
          id: entity.rowKey,
          title: entity.title,
          description: entity.description,
          mediaType: entity.mediaType,
          category: entity.partitionKey,
          difficulty: entity.difficulty,
        });
      }

      return {
        status: 200,
        jsonBody: scenarios,
      };
    } catch (error) {
      context.error('Failed to get scenarios:', error);
      return {
        status: 500,
        jsonBody: { error: 'Failed to retrieve scenarios' },
      };
    }
  },
});

// POST /api/scenarios/seed - Seed the scenario library (dev only)
app.http('seedScenarios', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'scenarios/seed',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      // Create table if it doesn't exist
      try {
        await scenariosTable.createTable();
        context.log('Created scenarios table');
      } catch (error: any) {
        // Table already exists (409) is fine
        if (error.statusCode !== 409) {
          throw error;
        }
      }

      let seeded = 0;

      for (const scenario of SEED_SCENARIOS) {
        const entity: ScenarioEntity = {
          partitionKey: scenario.category,
          rowKey: scenario.id,
          title: scenario.title,
          description: scenario.description,
          mediaType: scenario.mediaType,
          difficulty: scenario.difficulty,
        };

        try {
          await scenariosTable.createEntity(entity);
          seeded++;
        } catch (error: any) {
          // Entity already exists (409) is fine
          if (error.statusCode !== 409) {
            throw error;
          }
        }
      }

      return {
        status: 200,
        jsonBody: { 
          message: `Seeded ${seeded} new scenarios`,
          total: SEED_SCENARIOS.length,
        },
      };
    } catch (error) {
      context.error('Failed to seed scenarios:', error);
      return {
        status: 500,
        jsonBody: { error: 'Failed to seed scenarios' },
      };
    }
  },
});
