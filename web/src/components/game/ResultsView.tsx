import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faTrophy,
  faStar,
  faHome,
  faPlus,
  faMedal,
  faImages,
  faDownload,
} from '@fortawesome/free-solid-svg-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchTeams, finalizeGame } from '../../api';
import { usePlayerSession } from '../../contexts/PlayerSessionContext';
import type { Game, Team } from '../../types';
import { TeamGalleryView } from './TeamGalleryView';
import { getPositionLabel } from '../../utils/gameUtils';

interface ResultsViewProps {
  game: Game;
  isGameKeeper: boolean;
}

interface TeamScore {
  team: Team;
  submittedCount: number; // Raw count of completed scenarios (for display)
  completedCount: number; // Scored completions (excluding disqualified)
  bonusCount: number;
  disqualifiedCount: number;
  totalScore: number;
  position: number;
}

export function ResultsView({ game, isGameKeeper }: ResultsViewProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { clearSession, session, isValidForGame } = usePlayerSession();
  const [revealedCount, setRevealedCount] = useState(0);
  // Only do reveal animation for gamekeeper during 'revealing' phase
  const [isRevealing, setIsRevealing] = useState(game.status === 'revealing' && isGameKeeper);
  const [galleryTeam, setGalleryTeam] = useState<Team | null>(null);

  // Finalize game mutation (only for gamekeepers after reveal)
  const finalizeMutation = useMutation({
    mutationFn: () => finalizeGame(game.id),
    onSuccess: (updatedGame) => {
      queryClient.setQueryData(['game', game.id], updatedGame);
    },
  });

  // Fetch teams
  const { data: teams = [] } = useQuery({
    queryKey: ['teams', game.id],
    queryFn: () => fetchTeams(game.id),
  });

  // Calculate scores for each team (accounting for disqualifications)
  const teamScores: TeamScore[] = teams.map((team) => {
    // Raw count of submitted scenarios (for display)
    const submittedCount = team.completedScenarios.length;
    
    // Count completed scenarios, excluding disqualified ones (for scoring)
    const completedCount = team.completedScenarios.filter((scenarioId) => {
      const scenarioRef = game.scenarios.find((s) => s.scenarioId === scenarioId);
      return !scenarioRef?.disqualifiedTeams?.includes(team.id);
    }).length;
    
    // Count disqualified entries for this team
    const disqualifiedCount = game.scenarios.filter(
      (s) => s.disqualifiedTeams?.includes(team.id)
    ).length;
    
    // Count bonus points (already can't have bonus if disqualified due to backend logic)
    const bonusCount = game.scenarios.filter(
      (s) => s.bonusAwardedTo === team.id
    ).length;
    
    return {
      team,
      submittedCount,
      completedCount,
      bonusCount,
      disqualifiedCount,
      totalScore: completedCount + bonusCount,
      position: 0, // Will be set after sorting
    };
  });

  // Sort by total score (descending), then by bonus count (tiebreaker)
  teamScores.sort((a, b) => {
    // Primary: total score
    if (b.totalScore !== a.totalScore) {
      return b.totalScore - a.totalScore;
    }
    // Tiebreaker: more bonuses wins
    return b.bonusCount - a.bonusCount;
  });
  
  // Assign positions, handling ties (only if both score AND bonus are equal)
  let currentPosition = 1;
  teamScores.forEach((ts, index) => {
    if (index > 0 && 
        teamScores[index - 1].totalScore === ts.totalScore &&
        teamScores[index - 1].bonusCount === ts.bonusCount) {
      ts.position = teamScores[index - 1].position; // Same position for true ties
    } else {
      ts.position = currentPosition;
    }
    currentPosition++;
  });

  // Calculate which teams are revealed (reveal from worst to best)
  // revealedCount = 1 means the worst team is revealed
  // revealedCount = teams.length means all teams are revealed
  const getIsRevealed = (index: number) => {
    // If game is complete, all teams are revealed
    if (game.status === 'complete') return true;
    // index 0 = best team (last to reveal)
    // index teams.length-1 = worst team (first to reveal)
    const revealOrderIndex = teamScores.length - 1 - index;
    return revealOrderIndex < revealedCount;
  };

  // Dramatic reveal effect (only for gamekeeper during 'revealing' phase)
  useEffect(() => {
    if (!isRevealing || revealedCount >= teams.length) return;

    const timer = setTimeout(() => {
      setRevealedCount((prev) => prev + 1);
    }, 2000); // 2 seconds between each reveal

    return () => clearTimeout(timer);
  }, [revealedCount, teams.length, isRevealing]);

  // Mark revealing as complete when all teams are shown
  useEffect(() => {
    if (revealedCount >= teams.length && teams.length > 0) {
      setIsRevealing(false);
    }
  }, [revealedCount, teams.length]);

  // Get medal icon for top 3
  const getMedalColor = (position: number) => {
    switch (position) {
      case 1:
        return 'text-yellow-500'; // Gold
      case 2:
        return 'text-gray-400'; // Silver
      case 3:
        return 'text-amber-600'; // Bronze
      default:
        return 'text-gray-300';
    }
  };

  // Skip reveal animation
  const skipReveal = () => {
    setRevealedCount(teams.length);
    setIsRevealing(false);
  };

  // Helper to check if a team is in first place
  const isWinner = (score: TeamScore) => score.position === 1;
  const winners = teamScores.filter(isWinner);

  // Find the player's team for the gallery view (only if session is for this game)
  const playerTeam = session?.teamId && isValidForGame(game.id)
    ? teams.find((t) => t.id === session.teamId)
    : undefined;

  // Open gallery for a specific team
  const openGallery = (team: Team) => {
    setGalleryTeam(team);
  };

  // Show gallery view if requested
  if (galleryTeam) {
    return (
      <TeamGalleryView
        game={game}
        team={galleryTeam}
        onBack={() => setGalleryTeam(null)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-900 via-indigo-900 to-blue-900">
      {/* Header */}
      <header className="bg-black/20 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center text-white">
            {/* Left side - fixed width for centering */}
            <div className="w-24 flex-shrink-0">
              {isGameKeeper && (
                <button
                  onClick={() => navigate('/dashboard')}
                  className="text-white/80 hover:text-white transition-colors p-2"
                  title="Back to Dashboard"
                >
                  <FontAwesomeIcon icon={faHome} className="text-xl" />
                </button>
              )}
            </div>
            {/* Center - title */}
            <div className="flex-1 flex items-center justify-center gap-3">
              <FontAwesomeIcon icon={faTrophy} className="text-yellow-400 text-xl" />
              <h1 className="text-xl font-bold">Final Results</h1>
              <FontAwesomeIcon icon={faTrophy} className="text-yellow-400 text-xl" />
            </div>
            {/* Right side - fixed width for centering */}
            <div className="w-24 flex-shrink-0 flex justify-end">
              {isGameKeeper && (
                <button
                  onClick={() => navigate('/create-game')}
                  className="bg-white/10 hover:bg-white/20 text-white font-medium py-1.5 px-3 rounded-lg transition-colors flex items-center gap-1.5 text-sm"
                >
                  <FontAwesomeIcon icon={faPlus} />
                  New
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Skip button during reveal */}
      {isRevealing && (
        <div className="text-center py-4">
          <button
            onClick={skipReveal}
            className="text-white/60 hover:text-white/80 text-sm underline"
          >
            Skip animation
          </button>
        </div>
      )}

      {/* Results List */}
      <main className="max-w-2xl mx-auto px-4 py-6">
        <div className="space-y-2">
          {teamScores.map((score, index) => {
            const isRevealed = getIsRevealed(index);
            const isWinnerTeam = isWinner(score);
            return (
              <div
                key={score.team.id}
                className={`transition-all duration-700 ${
                  isRevealed
                    ? 'opacity-100 translate-y-0'
                    : 'opacity-0 -translate-y-8 pointer-events-none'
                }`}
              >
                <div
                  className={`bg-white/10 backdrop-blur-sm rounded-lg p-2 ${
                    isWinnerTeam && isRevealed
                      ? 'ring-2 ring-yellow-400 bg-yellow-400/10'
                      : ''
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {/* Position */}
                    <div className="w-12 text-center">
                      {score.position <= 3 ? (
                        <>
                          <FontAwesomeIcon
                            icon={faMedal}
                            className={`text-2xl ${getMedalColor(score.position)}`}
                          />
                          <p className="text-white/70 text-xs font-medium">
                            {getPositionLabel(score.position)}
                          </p>
                        </>
                      ) : (
                        <p className="text-xl font-bold text-white/50">
                          {getPositionLabel(score.position)}
                        </p>
                      )}
                    </div>

                    {/* Team Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-4 h-4 rounded-full flex-shrink-0"
                          style={{ backgroundColor: score.team.color }}
                        />
                        <h3 className="text-lg font-bold text-white truncate">
                          {score.team.name}
                        </h3>
                      </div>
                      {/* Player names */}
                      <p className="text-white/50 text-xs truncate">
                        {[
                          ...score.team.players.map((p) => p.displayName),
                          ...(score.team.crewMembers || []).map((c) => c.displayName),
                        ].join(', ')}
                      </p>
                      <div className="flex items-center gap-3 text-white/60 text-xs">
                        <span>{score.submittedCount} completed</span>
                        {score.bonusCount > 0 && (
                          <span className="flex items-center gap-1 text-yellow-400">
                            <FontAwesomeIcon icon={faStar} />
                            {score.bonusCount} bonus
                          </span>
                        )}
                        {score.disqualifiedCount > 0 && (
                          <span className="text-red-400">
                            🚫 {score.disqualifiedCount} disqualified
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Score */}
                    <div className="text-right flex items-center gap-2">
                      <div>
                        <p className="text-3xl font-bold text-white">
                          {score.totalScore}
                        </p>
                        <p className="text-white/60 text-xs">points</p>
                      </div>
                      {/* Download button for gamekeepers */}
                      {isGameKeeper && !isRevealing && (
                        <button
                          onClick={() => openGallery(score.team)}
                          className="bg-white/10 hover:bg-white/20 text-white p-2 rounded-lg transition-colors"
                          title={`Download ${score.team.name}'s media`}
                        >
                          <FontAwesomeIcon icon={faDownload} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Winner Announcement */}
        {!isRevealing && winners.length > 0 && (
          <div className="mt-12 text-center animate-pulse">
            <div className="inline-block bg-gradient-to-r from-yellow-400 to-amber-500 text-black font-bold text-2xl py-4 px-8 rounded-2xl shadow-lg">
              🎉{' '}
              {winners.length === 1
                ? `${winners[0].team.name} Wins!`
                : `It's a Tie! ${winners.map((w) => w.team.name).join(' & ')}`}{' '}
              🎉
            </div>
          </div>
        )}

        {/* Back to Home (for players) */}
        {!isGameKeeper && !isRevealing && (
          <div className="mt-12 flex flex-col items-center gap-4">
            {/* Save Media button - only show if player has a team */}
            {playerTeam ? (
              <button
                onClick={() => openGallery(playerTeam)}
                className="bg-purple-600 hover:bg-purple-700 text-white font-medium py-3 px-8 rounded-lg transition-colors flex items-center gap-2"
              >
                <FontAwesomeIcon icon={faImages} />
                Save Your Media
              </button>
            ) : (
              /* Team selector for returning players without session */
              teams.length > 0 && (
                <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 text-center">
                  <p className="text-white/80 mb-3 text-sm">
                    Want to download your team's media?
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {teams.map((team) => (
                      <button
                        key={team.id}
                        onClick={() => openGallery(team)}
                        className="bg-white/20 hover:bg-white/30 text-white py-2 px-4 rounded-lg transition-colors flex items-center gap-2 text-sm"
                      >
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: team.color }}
                        />
                        {team.name}
                      </button>
                    ))}
                  </div>
                </div>
              )
            )}
            <button
              onClick={() => {
                clearSession();
                navigate('/');
              }}
              className="bg-white/10 hover:bg-white/20 text-white font-medium py-3 px-8 rounded-lg transition-colors"
            >
              Back to Home
            </button>
          </div>
        )}

        {/* Game Keeper Actions */}
        {isGameKeeper && !isRevealing && (
          <div className="mt-12 flex flex-col items-center gap-4">
            {/* Show "Share Results" button when reveal animation is done but still in 'revealing' phase */}
            {game.status === 'revealing' && (
              <button
                onClick={() => finalizeMutation.mutate()}
                disabled={finalizeMutation.isPending}
                className="bg-green-600 hover:bg-green-700 disabled:bg-green-800 text-white font-bold py-4 px-8 rounded-xl transition-colors flex items-center gap-2 text-lg animate-pulse"
              >
                <FontAwesomeIcon icon={faTrophy} />
                {finalizeMutation.isPending ? 'Sharing...' : 'Share Results with Players!'}
              </button>
            )}
            
            {/* Show navigation buttons after game is complete */}
            {game.status === 'complete' && (
              <div className="flex justify-center gap-4">
                <button
                  onClick={() => navigate('/create-game')}
                  className="bg-purple-600 hover:bg-purple-700 text-white font-medium py-3 px-6 rounded-lg transition-colors flex items-center gap-2"
                >
                  <FontAwesomeIcon icon={faPlus} />
                  Create New Game
                </button>
                <button
                  onClick={() => navigate('/dashboard')}
                  className="bg-white/10 hover:bg-white/20 text-white font-medium py-3 px-6 rounded-lg transition-colors flex items-center gap-2"
                >
                  <FontAwesomeIcon icon={faHome} />
                  Dashboard
                </button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
