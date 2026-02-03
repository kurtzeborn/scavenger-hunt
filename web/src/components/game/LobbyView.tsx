import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUsers, faSpinner, faGamepad, faClock, faFlask, faUserPlus, faTimes } from '@fortawesome/free-solid-svg-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchTeams, seedTestTeams, addCrewMember } from '../../api';
import { usePlayerSession } from '../../contexts/PlayerSessionContext';
import type { Game, Team } from '../../types';
import { getTeamSize } from '../../types';

// Check if we're in development mode
const isDev = import.meta.env.DEV;

interface LobbyViewProps {
  game: Game;
  isGameKeeper: boolean;
  onStartGame?: () => void;
  startingGame?: boolean;
}

export function LobbyView({ game, isGameKeeper, onStartGame, startingGame }: LobbyViewProps) {
  const { session } = usePlayerSession();
  const queryClient = useQueryClient();

  // Fetch teams with polling
  const { data: teams = [], isLoading: teamsLoading } = useQuery({
    queryKey: ['teams', game.id],
    queryFn: () => fetchTeams(game.id),
    refetchInterval: 3000, // Refresh every 3 seconds
  });

  // Seed test teams mutation
  const seedMutation = useMutation({
    mutationFn: () => seedTestTeams(game.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams', game.id] });
    },
  });

  // Find the current player's team
  const myTeam = teams.find((t) => t.id === session?.teamId);

  // Count total members across all teams
  const totalMembers = teams.reduce((sum, team) => sum + getTeamSize(team), 0);

  // Check if game can start
  // In dev mode with game keeper, allow starting with 1+ team
  // In production, require 2+ teams
  const teamsWithPlayers = teams.filter((t) => t.players.length > 0);
  const canStart = isDev && isGameKeeper 
    ? teamsWithPlayers.length >= 1 
    : teamsWithPlayers.length >= 2;

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-gradient-to-r from-blue-600 to-purple-700 text-white shadow-lg">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-100 text-sm mb-1">Game Code</p>
              <h1 className="text-3xl font-mono font-bold tracking-wider">{game.id}</h1>
            </div>
            <div className="text-right">
              <p className="text-blue-100 text-sm mb-1">Status</p>
              <div className="flex items-center gap-2">
                <span className="animate-pulse w-3 h-3 bg-yellow-400 rounded-full"></span>
                <span className="font-semibold">Waiting for players...</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Player Info Card */}
        {myTeam && session && (
          <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
            <div className="flex items-center gap-4">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-xl"
                style={{ backgroundColor: myTeam.color }}
              >
                {session.displayName.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-gray-500 text-sm">You're on</p>
                <h2 className="text-xl font-bold text-gray-800">{myTeam.name}</h2>
                <p className="text-gray-500 text-sm">as {session.displayName}</p>
              </div>
            </div>
          </div>
        )}

        {/* Game Info */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <FontAwesomeIcon icon={faGamepad} className="text-blue-500" />
            Game Settings
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-center">
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-2xl font-bold text-gray-800">{game.config.scenarioCount}</p>
              <p className="text-gray-500 text-sm">Scenarios</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-2xl font-bold text-gray-800">{game.config.timeLimit}</p>
              <p className="text-gray-500 text-sm">Minutes</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-2xl font-bold text-gray-800">{game.config.timeLimitPerScenario}</p>
              <p className="text-gray-500 text-sm">Min/Scenario</p>
            </div>
          </div>
        </div>

        {/* Teams List */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
              <FontAwesomeIcon icon={faUsers} className="text-blue-500" />
              Teams ({teams.length})
            </h3>
            <span className="text-gray-500 text-sm">
              {totalMembers} member{totalMembers !== 1 ? 's' : ''} joined
            </span>
          </div>

          {teamsLoading ? (
            <div className="text-center py-8 text-gray-500">
              <FontAwesomeIcon icon={faSpinner} className="animate-spin mr-2" />
              Loading teams...
            </div>
          ) : teams.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>No teams yet. Share the game code to invite players!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {teams.map((team) => (
                <TeamCard
                  key={team.id}
                  team={team}
                  isMyTeam={team.id === session?.teamId}
                  gameId={game.id}
                  playerId={session?.playerId}
                  onCrewAdded={() => queryClient.invalidateQueries({ queryKey: ['teams', game.id] })}
                />
              ))}
            </div>
          )}
        </div>

        {/* Game Keeper Controls */}
        {isGameKeeper && (
          <div className="mt-8 bg-white rounded-xl shadow-lg p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Game Keeper Controls</h3>
            
            {/* Dev Mode Controls */}
            {isDev && (
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <FontAwesomeIcon icon={faFlask} className="text-purple-600" />
                  <span className="font-semibold text-purple-800">Dev Mode</span>
                </div>
                <p className="text-purple-700 text-sm mb-3">
                  Testing tools - only visible in development.
                </p>
                <button
                  onClick={() => seedMutation.mutate()}
                  disabled={seedMutation.isPending}
                  className="bg-purple-500 hover:bg-purple-600 disabled:bg-purple-300 text-white font-medium py-2 px-4 rounded-lg transition-colors text-sm"
                >
                  {seedMutation.isPending ? 'Adding...' : '+ Add 2 Test Teams'}
                </button>
                {isDev && teamsWithPlayers.length === 1 && (
                  <p className="text-purple-600 text-xs mt-2">
                    ✓ Dev mode: Can start with 1 team
                  </p>
                )}
              </div>
            )}
            
            {!canStart && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
                <p className="text-amber-800">
                  <strong>⚠️ Cannot start yet:</strong> Need at least {isDev ? '1 team' : '2 teams'} with players to start the game.
                </p>
              </div>
            )}

            <button
              onClick={onStartGame}
              disabled={!canStart || startingGame}
              className="w-full bg-green-500 hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold py-4 px-6 rounded-lg transition-colors flex items-center justify-center gap-2 text-lg"
            >
              {startingGame ? (
                <>
                  <FontAwesomeIcon icon={faSpinner} className="animate-spin" />
                  Starting Game...
                </>
              ) : (
                <>
                  <FontAwesomeIcon icon={faGamepad} />
                  Start Game
                </>
              )}
            </button>
          </div>
        )}

        {/* Waiting Message for Players */}
        {!isGameKeeper && (
          <div className="mt-8 text-center">
            <div className="inline-flex items-center gap-3 bg-white rounded-full px-6 py-3 shadow-lg">
              <FontAwesomeIcon icon={faClock} className="text-blue-500 animate-pulse" />
              <span className="text-gray-600">Waiting for the game keeper to start...</span>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

interface TeamCardProps {
  team: Team;
  isMyTeam: boolean;
  gameId: string;
  playerId?: string;
  onCrewAdded: () => void;
}

function TeamCard({ team, isMyTeam, gameId, playerId, onCrewAdded }: TeamCardProps) {
  const [showAddCrew, setShowAddCrew] = useState(false);
  const [crewName, setCrewName] = useState('');
  const [error, setError] = useState('');

  const addCrewMutation = useMutation({
    mutationFn: () => addCrewMember(gameId, team.id, {
      displayName: crewName.trim(),
      addedBy: playerId!,
    }),
    onSuccess: () => {
      setShowAddCrew(false);
      setCrewName('');
      setError('');
      onCrewAdded();
    },
    onError: (err: Error) => {
      setError(err.message || 'Failed to add crew member');
    },
  });

  const teamSize = getTeamSize(team);
  const canAddCrew = isMyTeam && teamSize < 6;

  const handleAddCrew = () => {
    if (!crewName.trim()) {
      setError('Name is required');
      return;
    }
    if (crewName.length > 20) {
      setError('Name must be 20 characters or less');
      return;
    }
    addCrewMutation.mutate();
  };

  return (
    <div
      className={`rounded-lg border-2 p-4 transition-all ${
        isMyTeam
          ? 'border-blue-400 bg-blue-50'
          : 'border-gray-200 bg-gray-50'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <div
            className="w-5 h-5 rounded-full"
            style={{ backgroundColor: team.color }}
          />
          <span className="font-semibold text-gray-800">
            {team.name}
            {isMyTeam && <span className="ml-2 text-blue-500 text-sm">(Your Team)</span>}
          </span>
        </div>
        <span className="text-gray-500 text-sm">
          {teamSize}/6 members
        </span>
      </div>
      
      {/* Players */}
      {team.players.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {team.players.map((player) => (
            <span
              key={player.id}
              className="bg-white px-3 py-1 rounded-full text-sm text-gray-700 border flex items-center gap-1"
            >
              📱 {player.displayName}
            </span>
          ))}
        </div>
      )}

      {/* Crew Members */}
      {team.crewMembers && team.crewMembers.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {team.crewMembers.map((crew) => (
            <span
              key={crew.id}
              className="bg-gray-100 px-3 py-1 rounded-full text-sm text-gray-600 border border-dashed flex items-center gap-1"
            >
              👤 {crew.displayName}
            </span>
          ))}
        </div>
      )}

      {/* Add Crew Button */}
      {canAddCrew && !showAddCrew && (
        <button
          onClick={() => setShowAddCrew(true)}
          className="mt-3 text-blue-600 hover:text-blue-700 text-sm flex items-center gap-1"
        >
          <FontAwesomeIcon icon={faUserPlus} />
          Add teammate without phone
        </button>
      )}

      {/* Add Crew Form */}
      {showAddCrew && (
        <div className="mt-3 bg-white rounded-lg p-3 border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Add Crew Member</span>
            <button
              onClick={() => { setShowAddCrew(false); setError(''); setCrewName(''); }}
              className="text-gray-400 hover:text-gray-600"
            >
              <FontAwesomeIcon icon={faTimes} />
            </button>
          </div>
          <p className="text-xs text-gray-500 mb-2">
            For teammates participating without their own phone
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={crewName}
              onChange={(e) => { setCrewName(e.target.value); setError(''); }}
              placeholder="Name"
              maxLength={20}
              className="flex-1 border rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
              autoFocus
            />
            <button
              onClick={handleAddCrew}
              disabled={addCrewMutation.isPending}
              className="bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white px-4 py-2 rounded text-sm font-medium"
            >
              {addCrewMutation.isPending ? (
                <FontAwesomeIcon icon={faSpinner} className="animate-spin" />
              ) : (
                'Add'
              )}
            </button>
          </div>
          {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
        </div>
      )}
    </div>
  );
}
