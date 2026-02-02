import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
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

export function PlayerSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<PlayerSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load session from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as PlayerSession;
        // Convert date string back to Date
        parsed.joinedAt = new Date(parsed.joinedAt);
        setSessionState(parsed);
      }
    } catch (error) {
      console.error('Failed to load player session:', error);
      localStorage.removeItem(STORAGE_KEY);
    }
    setIsLoading(false);
  }, []);

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

export function usePlayerSession() {
  const context = useContext(PlayerSessionContext);
  if (!context) {
    throw new Error('usePlayerSession must be used within a PlayerSessionProvider');
  }
  return context;
}
