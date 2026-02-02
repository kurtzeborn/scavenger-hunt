import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getAuthUser, isGameKeeper, requireGameKeeper, AuthError } from '../auth.js';

// GET /api/me - Get current user's auth status
app.http('getMe', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'me',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const user = getAuthUser(request);
      
      if (!user) {
        return {
          status: 200,
          jsonBody: {
            isAuthenticated: false,
            isGameKeeper: false,
          },
        };
      }

      const keeperStatus = await isGameKeeper(user.userDetails);

      return {
        status: 200,
        jsonBody: {
          isAuthenticated: true,
          user,
          isGameKeeper: keeperStatus,
        },
      };
    } catch (error) {
      context.error('Failed to get auth status:', error);
      return {
        status: 500,
        jsonBody: { error: 'Failed to get auth status' },
      };
    }
  },
});
