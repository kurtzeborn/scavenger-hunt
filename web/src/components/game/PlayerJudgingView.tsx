import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faClock,
  faHeart,
  faCheck,
} from '@fortawesome/free-solid-svg-icons';
import { faHeart as faHeartOutline } from '@fortawesome/free-regular-svg-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchTeams, castCrowdVote } from '../../api';
import { usePlayerSession } from '../../contexts/PlayerSessionContext';
import type { Game, Team } from '../../types';
import { getCaptainId } from '../../utils/gameUtils';

interface PlayerJudgingViewProps {
  game: Game;
}

export function PlayerJudgingView({ game }: PlayerJudgingViewProps) {
  const queryClient = useQueryClient();
  const { session } = usePlayerSession();
  const [votingError, setVotingError] = useState<string | null>(null);

  // Fetch teams to determine captain status
  const { data: teams = [] } = useQuery({
    queryKey: ['teams', game.id],
    queryFn: () => fetchTeams(game.id),
    refetchInterval: 5000,
  });

  // Cast vote mutation
  const voteMutation = useMutation({
    mutationFn: (votedForTeamId: string) =>
      castCrowdVote(game.id, {
        scenarioId: activeVotingScenario!.scenarioId,
        teamId: session!.teamId,
        playerId: session!.playerId,
        votedForTeamId,
      }),
    onSuccess: (updatedGame) => {
      queryClient.setQueryData(['game', game.id], updatedGame);
      setVotingError(null);
    },
    onError: (error: Error) => {
      setVotingError(error.message);
    },
  });

  // Determine if current player is captain (first player to join the team)
  const playerTeam = teams.find((t: Team) => t.id === session?.teamId);
  const isCaptain = (() => {
    if (!playerTeam || !session) return false;
    return getCaptainId(playerTeam.players) === session.playerId;
  })();

  // Find the scenario with voting currently open
  const activeVotingScenario = game.scenarios.find((s) => s.crowdVotingOpen);

  // Check if our team already voted for this scenario
  const myVote = activeVotingScenario?.crowdVotes?.[session?.teamId || ''];

  // Get eligible teams to vote for (submitted for this scenario, not own team, not disqualified)
  const eligibleTeams = activeVotingScenario
    ? teams.filter((t: Team) => {
        if (t.id === session?.teamId) return false;
        if (!t.completedScenarios?.includes(activeVotingScenario.scenarioId)) return false;
        if (activeVotingScenario.disqualifiedTeams?.includes(t.id)) return false;
        return true;
      })
    : [];

  // If voting is open and user is captain → show voting UI
  if (activeVotingScenario && isCaptain) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-purple-900 via-indigo-900 to-blue-900 flex items-center justify-center p-4">
        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 max-w-md w-full text-white">
          <div className="text-center mb-6">
            <FontAwesomeIcon icon={faHeart} className="text-4xl text-pink-400 mb-3" />
            <h1 className="text-2xl font-bold mb-1">Crowd Favorite Vote</h1>
            <p className="text-white/70 text-sm">
              As team captain, pick your favorite entry!
            </p>
            <p className="text-white/50 text-xs mt-1">
              (You can&apos;t vote for your own team)
            </p>
          </div>

          {votingError && (
            <div className="bg-red-500/20 text-red-200 rounded-lg p-3 mb-4 text-sm">
              {votingError}
            </div>
          )}

          <div className="space-y-3">
            {eligibleTeams.map((team: Team) => {
              const isSelected = myVote === team.id;

              return (
                <button
                  key={team.id}
                  onClick={() => voteMutation.mutate(team.id)}
                  disabled={voteMutation.isPending}
                  className={`w-full flex items-center gap-3 p-4 rounded-xl transition-all ${
                    isSelected
                      ? 'bg-pink-500/30 ring-2 ring-pink-400'
                      : 'bg-white/10 hover:bg-white/20'
                  }`}
                >
                  <div
                    className="w-4 h-4 rounded-full flex-shrink-0"
                    style={{ backgroundColor: team.color }}
                  />
                  <span className="font-medium flex-1 text-left truncate">
                    {team.name}
                  </span>
                  {isSelected ? (
                    <FontAwesomeIcon icon={faHeart} className="text-pink-400 text-lg" />
                  ) : (
                    <FontAwesomeIcon icon={faHeartOutline} className="text-white/40 text-lg" />
                  )}
                </button>
              );
            })}
          </div>

          {myVote && (
            <div className="mt-4 text-center">
              <p className="text-pink-300 text-sm flex items-center justify-center gap-2">
                <FontAwesomeIcon icon={faCheck} />
                Vote recorded! You can change it until voting closes.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // If voting is open but user is NOT captain → show "captain is voting" message
  if (activeVotingScenario && !isCaptain) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-purple-900 via-indigo-900 to-blue-900 flex items-center justify-center p-4">
        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-8 max-w-md text-center text-white">
          <FontAwesomeIcon icon={faHeart} className="text-5xl text-pink-300 mb-4 animate-pulse" />
          <h1 className="text-2xl font-bold mb-2">❤️ Crowd Voting</h1>
          <p className="text-white/70 mb-4">
            Your team captain is voting for their favorite entry!
          </p>
          <p className="text-purple-300 text-sm">
            Results will be revealed at the end
          </p>
        </div>
      </div>
    );
  }

  // Default: no voting active → show standard waiting screen
  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-900 via-indigo-900 to-blue-900 flex items-center justify-center p-4">
      <div className="bg-white/10 backdrop-blur-sm rounded-xl p-8 max-w-md text-center text-white">
        <FontAwesomeIcon icon={faClock} className="text-5xl text-purple-300 mb-4 animate-pulse" />
        <h1 className="text-2xl font-bold mb-2">⚖️ Judging in Progress</h1>
        <p className="text-white/70 mb-6">
          The game keeper is reviewing all submissions. Final scores will be revealed soon!
        </p>
        <p className="text-purple-300 text-sm">
          Stay on this page to see the results
        </p>
      </div>
    </div>
  );
}
