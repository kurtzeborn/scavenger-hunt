import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUsers, faPlus, faArrowRight, faSpinner, faExclamationTriangle } from '@fortawesome/free-solid-svg-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { joinGame, fetchTeams, fetchGame } from '../../api';
import { usePlayerSession } from '../../contexts/PlayerSessionContext';
import type { Team } from '../../types';
import { getTeamSize } from '../../types';

interface JoinGameFlowProps {
  gameId: string;
  onJoined: () => void;
}

type JoinStep = 'name' | 'team';

export function JoinGameFlow({ gameId, onJoined }: JoinGameFlowProps) {
  const [step, setStep] = useState<JoinStep>('name');
  const [displayName, setDisplayName] = useState('');
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [newTeamName, setNewTeamName] = useState('');
  const [isCreatingTeam, setIsCreatingTeam] = useState(false);
  const [error, setError] = useState('');
  const { joinTeam } = usePlayerSession();
  const queryClient = useQueryClient();

  // Fetch game status to determine join eligibility
  const { data: game, isLoading: gameLoading } = useQuery({
    queryKey: ['game', gameId],
    queryFn: () => fetchGame(gameId),
  });

  // Determine if this is a late join (game already started)
  const isLateJoin = game?.status === 'active' || game?.status === 'paused';
  const gameEnded = game?.status === 'judging' || game?.status === 'complete';

  // Fetch existing teams
  const { data: teams = [], isLoading: teamsLoading } = useQuery({
    queryKey: ['teams', gameId],
    queryFn: () => fetchTeams(gameId),
    refetchInterval: 5000, // Refresh every 5 seconds to see new teams
    enabled: !gameEnded, // Don't fetch if game ended
  });

  // For late joins, only show teams with available slots
  const availableTeams = teams.filter(t => getTeamSize(t) < 6);
  const allTeamsFull = isLateJoin && availableTeams.length === 0 && teams.length > 0;

  // Join game mutation
  const joinMutation = useMutation({
    mutationFn: async () => {
      const data = isCreatingTeam
        ? { displayName, teamName: newTeamName }
        : { displayName, teamId: selectedTeamId! };
      return joinGame(gameId, data);
    },
    onSuccess: (response) => {
      joinTeam(gameId, response.team, response.player);
      queryClient.invalidateQueries({ queryKey: ['teams', gameId] });
      onJoined();
    },
    onError: (error: Error) => {
      setError(error.message || 'Failed to join game');
    },
  });

  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) {
      setError('Please enter your name');
      return;
    }
    if (displayName.length > 20) {
      setError('Name must be 20 characters or less');
      return;
    }
    setError('');
    setStep('team');
  };

  const handleJoin = () => {
    if (isCreatingTeam) {
      if (!newTeamName.trim()) {
        setError('Please enter a team name');
        return;
      }
      if (newTeamName.length > 20) {
        setError('Team name must be 20 characters or less');
        return;
      }
    } else if (!selectedTeamId) {
      setError('Please select a team or create a new one');
      return;
    }
    setError('');
    joinMutation.mutate();
  };

  const handleTeamSelect = (team: Team) => {
    if (getTeamSize(team) >= 6) return;
    setSelectedTeamId(team.id);
    setIsCreatingTeam(false);
    setError('');
  };

  const handleCreateTeamToggle = () => {
    setIsCreatingTeam(true);
    setSelectedTeamId(null);
    setError('');
  };

  if (step === 'name') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-600 to-purple-700 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-4 sm:p-8 w-full max-w-md">
          <div className="text-center mb-4 sm:mb-6">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-800 mb-2">Join Game</h1>
            <p className="text-gray-500 text-sm sm:text-base">
              Game Code: <span className="font-mono font-bold text-blue-600">{gameId}</span>
            </p>
          </div>

          <form onSubmit={handleNameSubmit}>
            <label htmlFor="displayName" className="block text-gray-700 font-medium mb-2 text-sm sm:text-base">
              What's your name?
            </label>
            <input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value);
                setError('');
              }}
              placeholder="Enter your name"
              className="w-full text-lg sm:text-xl border-2 border-gray-300 rounded-lg p-3 sm:p-4 focus:border-blue-500 focus:outline-none"
              maxLength={20}
              autoComplete="off"
              autoFocus
            />
            {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
            <button
              type="submit"
              className="w-full mt-4 bg-blue-500 hover:bg-blue-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              Next
              <FontAwesomeIcon icon={faArrowRight} />
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-purple-700 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-4 sm:p-8 w-full max-w-md">
        <div className="text-center mb-4 sm:mb-6">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-800 mb-2">
            Hey {displayName}! 👋
          </h1>
          {isLateJoin ? (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-3">
              <p className="text-amber-800 text-sm">
                🎮 Game in progress! Join an existing team to jump in.
              </p>
            </div>
          ) : (
            <p className="text-gray-500">Pick a team or create a new one</p>
          )}
        </div>

        {gameLoading || teamsLoading ? (
          <div className="text-center py-8 text-gray-500">
            <FontAwesomeIcon icon={faSpinner} className="animate-spin mr-2" />
            Loading...
          </div>
        ) : gameEnded ? (
          <div className="text-center py-8">
            <FontAwesomeIcon icon={faExclamationTriangle} className="text-amber-500 text-4xl mb-4" />
            <p className="text-gray-700 font-medium">This game has ended.</p>
            <p className="text-gray-500 text-sm mt-2">You can no longer join this game.</p>
          </div>
        ) : allTeamsFull ? (
          <div className="text-center py-8">
            <FontAwesomeIcon icon={faExclamationTriangle} className="text-amber-500 text-4xl mb-4" />
            <p className="text-gray-700 font-medium">Sorry, all teams are full!</p>
            <p className="text-gray-500 text-sm mt-2">Ask a team member to add you as crew.</p>
          </div>
        ) : (
          <>
            {/* Existing Teams */}
            {(isLateJoin ? availableTeams : teams).length > 0 && (
              <div className="space-y-2 mb-4">
                {(isLateJoin ? availableTeams : teams).map((team) => {
                  const teamSize = getTeamSize(team);
                  const isFull = teamSize >= 6;
                  return (
                    <button
                      key={team.id}
                      type="button"
                      onClick={() => handleTeamSelect(team)}
                      disabled={isFull}
                      className={`w-full p-4 rounded-lg border-2 transition-all flex items-center justify-between ${
                        selectedTeamId === team.id
                          ? 'border-blue-500 bg-blue-50'
                          : isFull
                          ? 'border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-4 h-4 rounded-full"
                          style={{ backgroundColor: team.color }}
                        />
                        <span className="font-medium text-gray-800">{team.name}</span>
                      </div>
                      <div className="flex items-center gap-1 text-gray-500 text-sm">
                        <FontAwesomeIcon icon={faUsers} />
                        <span>
                          {teamSize}/6
                          {isFull && ' (Full)'}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Create New Team - only in lobby */}
            {!isLateJoin && !isCreatingTeam && (
              <button
                type="button"
                onClick={handleCreateTeamToggle}
                disabled={teams.length >= 20}
                className={`w-full p-4 rounded-lg border-2 border-dashed transition-colors flex items-center justify-center gap-2 ${
                  teams.length >= 20
                    ? 'border-gray-200 text-gray-400 cursor-not-allowed'
                    : 'border-gray-300 hover:border-blue-400 text-gray-600 hover:text-blue-600'
                }`}
              >
                <FontAwesomeIcon icon={faPlus} />
                Create New Team
                {teams.length >= 20 && ' (Max 20 teams)'}
              </button>
            )}

            {/* New Team Name Input */}
            {!isLateJoin && isCreatingTeam && (
              <div className="p-4 rounded-lg border-2 border-blue-500 bg-blue-50">
                <label htmlFor="teamName" className="block text-gray-700 font-medium mb-2">
                  Team Name
                </label>
                <input
                  id="teamName"
                  type="text"
                  value={newTeamName}
                  onChange={(e) => {
                    setNewTeamName(e.target.value);
                    setError('');
                  }}
                  placeholder="Enter team name"
                  className="w-full border-2 border-gray-300 rounded-lg p-3 focus:border-blue-500 focus:outline-none"
                  maxLength={20}
                  autoFocus
                />
              </div>
            )}
          </>
        )}

        {error && <p className="text-red-500 text-sm mt-4 text-center">{error}</p>}

        {!gameEnded && !allTeamsFull && (
          <button
            type="button"
            onClick={handleJoin}
            disabled={joinMutation.isPending || (!selectedTeamId && !isCreatingTeam)}
            className="w-full mt-6 bg-green-500 hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {joinMutation.isPending ? (
              <>
                <FontAwesomeIcon icon={faSpinner} className="animate-spin" />
                Joining...
              </>
            ) : (
              <>
                <FontAwesomeIcon icon={faUsers} />
                Join Team
              </>
            )}
          </button>
        )}

        <button
          type="button"
          onClick={() => setStep('name')}
          className="w-full mt-2 text-gray-500 hover:text-gray-700 text-sm py-2"
        >
          ← Back
        </button>
      </div>
    </div>
  );
}
