import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpRequest } from '@azure/functions';
import { getAuthUser, isGameKeeper } from '../auth.js';
import { gamekeepersTable } from '../storage.js';

// Mock the storage module
vi.mock('../storage.js', () => ({
  gamekeepersTable: {
    getEntity: vi.fn(),
  },
}));

// Type-safe access to the mocked function
const mockGetEntity = vi.mocked(gamekeepersTable.getEntity);

describe('Auth Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAuthUser', () => {
    it('returns null when no client principal header is present', () => {
      const mockRequest = {
        headers: {
          get: vi.fn().mockReturnValue(null),
        },
      } as unknown as HttpRequest;

      const result = getAuthUser(mockRequest);

      expect(result).toBeNull();
    });

    it('parses valid client principal header correctly', () => {
      const clientPrincipal = {
        userId: 'user-123',
        userDetails: 'test@example.com',
        identityProvider: 'aad',
        userRoles: ['authenticated', 'anonymous'],
      };
      const encoded = Buffer.from(JSON.stringify(clientPrincipal)).toString('base64');

      const mockRequest = {
        headers: {
          get: vi.fn().mockReturnValue(encoded),
        },
      } as unknown as HttpRequest;

      const result = getAuthUser(mockRequest);

      expect(result).toEqual({
        userId: 'user-123',
        userDetails: 'test@example.com',
        identityProvider: 'aad',
        userRoles: ['authenticated', 'anonymous'],
      });
    });

    it('handles missing userRoles gracefully', () => {
      const clientPrincipal = {
        userId: 'user-456',
        userDetails: 'other@example.com',
        identityProvider: 'github',
      };
      const encoded = Buffer.from(JSON.stringify(clientPrincipal)).toString('base64');

      const mockRequest = {
        headers: {
          get: vi.fn().mockReturnValue(encoded),
        },
      } as unknown as HttpRequest;

      const result = getAuthUser(mockRequest);

      expect(result).toEqual({
        userId: 'user-456',
        userDetails: 'other@example.com',
        identityProvider: 'github',
        userRoles: [],
      });
    });

    it('returns null for invalid base64 encoding', () => {
      const mockRequest = {
        headers: {
          get: vi.fn().mockReturnValue('not-valid-base64!!!'),
        },
      } as unknown as HttpRequest;

      // The function should catch the error and return null
      const result = getAuthUser(mockRequest);

      expect(result).toBeNull();
    });

    it('returns null for invalid JSON in decoded header', () => {
      const invalidJson = Buffer.from('{ not valid json }').toString('base64');

      const mockRequest = {
        headers: {
          get: vi.fn().mockReturnValue(invalidJson),
        },
      } as unknown as HttpRequest;

      const result = getAuthUser(mockRequest);

      expect(result).toBeNull();
    });
  });

  describe('isGameKeeper', () => {
    it('returns false for empty email', async () => {
      const result = await isGameKeeper('');
      
      expect(result).toBe(false);
      expect(mockGetEntity).not.toHaveBeenCalled();
    });

    it('returns true when email exists in game keepers table', async () => {
      mockGetEntity.mockResolvedValue({
        partitionKey: 'gamekeeper',
        rowKey: 'test@example.com',
        etag: 'mock-etag',
      });

      const result = await isGameKeeper('test@example.com');

      expect(result).toBe(true);
      expect(mockGetEntity).toHaveBeenCalledWith('gamekeeper', 'test@example.com');
    });

    it('returns false when email not found (404)', async () => {
      const notFoundError = new Error('Not found');
      (notFoundError as any).statusCode = 404;
      mockGetEntity.mockRejectedValue(notFoundError);

      const result = await isGameKeeper('unknown@example.com');

      expect(result).toBe(false);
    });

    it('throws error for non-404 errors', async () => {
      const serverError = new Error('Server error');
      (serverError as any).statusCode = 500;
      mockGetEntity.mockRejectedValue(serverError);

      await expect(isGameKeeper('test@example.com')).rejects.toThrow('Server error');
    });

    it('normalizes email to lowercase', async () => {
      mockGetEntity.mockResolvedValue({
        partitionKey: 'gamekeeper',
        rowKey: 'test@example.com',
        etag: 'mock-etag',
      });

      await isGameKeeper('TEST@EXAMPLE.COM');

      expect(mockGetEntity).toHaveBeenCalledWith('gamekeeper', 'test@example.com');
    });
  });
});
