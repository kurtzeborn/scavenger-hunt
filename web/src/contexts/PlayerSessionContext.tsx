import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { PlayerSession, Team, Player } from '../types';

interface PlayerSessionContextType {
  session: PlayerSession | null;
  isLoading: boolean;
  setSession: (session: PlayerSession | null) => void;
  joinTeam: (gameId: string, team: Team, player: Player) => void;
  clearSession: () => void;
  isValidForGame: (gameId: string) => boolean;
}

const PlayerSessionContext = createContext<PlayerSessionContextType | null>(null);

const STORAGE_KEY = 'vsh_player_session';

// Helper to load session from localStorage
function loadStoredSession(): PlayerSession | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as PlayerSession;
      // Convert date string back to Date
      parsed.joinedAt = new Date(parsed.joinedAt);
      return parsed;
    }
  } catch (error) {
    console.error('Failed to load player session:', error);
    localStorage.removeItem(STORAGE_KEY);
  }
  return null;
}

export function PlayerSessionProvider({ children }: { children: ReactNode }) {
  // Use lazy initialization to avoid useEffect + setState pattern
  const [session, setSessionState] = useState<PlayerSession | null>(() => loadStoredSession());
  const [isLoading] = useState(false); // No longer loading since we initialize synchronously

  const setSession = useCallback((newSession: PlayerSession | null) => {
    setSessionState(newSession);
    if (newSession) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newSession));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const joinTeam = useCallback((gameId: string, team: Team, player: Player) => {
    const newSession: PlayerSession = {
      gameId,
      teamId: team.id,
      playerId: player.id,
      displayName: player.displayName,
      joinedAt: player.joinedAt,
    };
    setSession(newSession);
  }, [setSession]);

  const clearSession = useCallback(() => {
    setSession(null);
  }, [setSession]);

  const isValidForGame = useCallback((gameId: string) => {
    return session?.gameId?.toUpperCase() === gameId?.toUpperCase();
  }, [session]);

  return (
    <PlayerSessionContext.Provider
      value={{
        session,
        isLoading,
        setSession,
        joinTeam,
        clearSession,
        isValidForGame,
      }}
    >
      {children}
    </PlayerSessionContext.Provider>
  );
}

// Hook to access the player session context
// eslint-disable-next-line react-refresh/only-export-components
export function usePlayerSession() {
  const context = useContext(PlayerSessionContext);
  if (!context) {
    throw new Error('usePlayerSession must be used within a PlayerSessionProvider');
  }
  return context;
}
