import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCamera,
  faVideo,
  faStar,
  faChevronLeft,
  faChevronRight,
  faHome,
  faPlay,
  faFlag,
  faBan,
} from '@fortawesome/free-solid-svg-icons';
import { faStar as faStarOutline } from '@fortawesome/free-regular-svg-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchTeams,
  fetchScenarios,
  fetchScenarioVideos,
  awardBonus,
  completeGame,
  disqualifySubmission,
} from '../../api';
import type { Game, MediaSubmission } from '../../types';
import { Toast } from '../shared/Toast';
import { ConfirmModal } from '../shared/ConfirmModal';
import { MediaModal } from '../shared/MediaModal';
import { getOrderedGameScenarios } from '../../utils/gameUtils';

interface JudgingViewProps {
  game: Game;
  isGameKeeper: boolean;
}

export function JudgingView({ game, isGameKeeper }: JudgingViewProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [currentScenarioIndex, setCurrentScenarioIndex] = useState(0);
  const [selectedSubmission, setSelectedSubmission] = useState<MediaSubmission | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);
  const [disqualifyTarget, setDisqualifyTarget] = useState<{ teamId: string; teamName: string } | null>(null);

  // Fetch teams
  const { data: teams = [] } = useQuery({
    queryKey: ['teams', game.id],
    queryFn: () => fetchTeams(game.id),
  });

  // Fetch all scenarios
  const { data: allScenarios = [] } = useQuery({
    queryKey: ['scenarios'],
    queryFn: fetchScenarios,
  });

  // Get scenarios for this game in order
  const gameScenarios = getOrderedGameScenarios(game, allScenarios);

  const currentScenario = gameScenarios[currentScenarioIndex];
  const currentScenarioRef = game.scenarios.find(
    (s) => s.scenarioId === currentScenario?.id
  );

  // Fetch videos for current scenario
  const { data: submissions = [] } = useQuery({
    queryKey: ['videos', game.id, currentScenario?.id],
    queryFn: () => fetchScenarioVideos(game.id, currentScenario!.id),
    enabled: !!currentScenario,
  });

  // Award bonus mutation
  const bonusMutation = useMutation({
    mutationFn: (teamId: string) =>
      awardBonus(game.id, { scenarioId: currentScenario!.id, teamId }),
    onSuccess: (updatedGame) => {
      queryClient.setQueryData(['game', game.id], updatedGame);
    },
  });

  // Complete game mutation
  const completeMutation = useMutation({
    mutationFn: () => completeGame(game.id),
    onSuccess: (updatedGame) => {
      queryClient.setQueryData(['game', game.id], updatedGame);
    },
  });

  // Disqualify mutation
  const disqualifyMutation = useMutation({
    mutationFn: ({ teamId, disqualify }: { teamId: string; disqualify: boolean }) =>
      disqualifySubmission(game.id, { scenarioId: currentScenario!.id, teamId, disqualify }),
    onSuccess: (updatedGame) => {
      queryClient.setQueryData(['game', game.id], updatedGame);
    },
  });

  // Helper to check if a team is disqualified for current scenario
  const isTeamDisqualified = (teamId: string) => {
    return currentScenarioRef?.disqualifiedTeams?.includes(teamId) ?? false;
  };

  // Handle disqualification - show confirm for disqualify, instant for un-disqualify
  const handleDisqualifyClick = (teamId: string, teamName: string) => {
    if (isTeamDisqualified(teamId)) {
      // Un-disqualify immediately, no confirmation needed
      disqualifyMutation.mutate({ teamId, disqualify: false });
    } else {
      // Show confirmation for disqualification
      setDisqualifyTarget({ teamId, teamName });
    }
  };

  const isFirstScenario = currentScenarioIndex === 0;
  const isLastScenario = currentScenarioIndex === gameScenarios.length - 1;
  
  // Check if current scenario has a favorite selected
  const hasFavoriteSelected = currentScenarioRef?.bonusAwardedTo !== undefined;

  const goToPrevious = () => {
    if (!isFirstScenario) {
      setCurrentScenarioIndex(currentScenarioIndex - 1);
    }
  };

  const goToNext = () => {
    if (!isLastScenario) {
      // Check if favorite is selected before advancing
      if (!hasFavoriteSelected && submissions.length > 0) {
        setShowToast(true);
        return;
      }
      setCurrentScenarioIndex(currentScenarioIndex + 1);
    }
  };

  const handleFinishJudging = () => {
    // Check if favorite is selected for current scenario
    if (!hasFavoriteSelected && submissions.length > 0) {
      setShowToast(true);
      return;
    }
    setShowFinishConfirm(true);
  };

  if (!currentScenario) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <p className="text-gray-500">Loading scenarios...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Toast for "Please pick a favorite" */}
      {showToast && (
        <Toast
          message="Please pick a favorite before continuing"
          variant="error"
          duration={2500}
          onClose={() => setShowToast(false)}
        />
      )}

      {/* Finish Judging Confirmation Modal */}
      <ConfirmModal
        isOpen={showFinishConfirm}
        title="Finish Judging?"
        message="Are you sure you want to finish judging and reveal the final results to everyone?"
        confirmText="Reveal Results"
        cancelText="Keep Judging"
        variant="info"
        onConfirm={() => {
          setShowFinishConfirm(false);
          completeMutation.mutate();
        }}
        onCancel={() => setShowFinishConfirm(false)}
      />

      {/* Disqualify Confirmation Modal */}
      <ConfirmModal
        isOpen={disqualifyTarget !== null}
        title="Disqualify Submission?"
        message={`Are you sure you want to disqualify ${disqualifyTarget?.teamName}'s submission? This will remove their completion point for this scenario.`}
        confirmText="Disqualify"
        cancelText="Cancel"
        variant="danger"
        onConfirm={() => {
          if (disqualifyTarget) {
            disqualifyMutation.mutate({ teamId: disqualifyTarget.teamId, disqualify: true });
          }
          setDisqualifyTarget(null);
        }}
        onCancel={() => setDisqualifyTarget(null)}
      />

      {/* Video Modal */}
      {selectedSubmission && currentScenario && (
        <MediaModal
          submission={selectedSubmission}
          team={teams.find((t) => t.id === selectedSubmission.teamId)}
          scenario={currentScenario}
          gameCode={game.id}
          onClose={() => setSelectedSubmission(null)}
        />
      )}

      {/* Header */}
      <header className="bg-gradient-to-r from-purple-600 to-indigo-700 text-white shadow-lg sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            {/* Left: Home button */}
            <button
              onClick={() => navigate('/dashboard')}
              className="text-white/80 hover:text-white transition-colors p-2"
              title="Back to Dashboard"
            >
              <FontAwesomeIcon icon={faHome} className="text-xl" />
            </button>

            {/* Center: Scenario progress */}
            <div className="text-center">
              <p className="text-purple-200 text-sm">Judging</p>
              <p className="font-bold text-xl">
                Scenario {currentScenarioIndex + 1} of {gameScenarios.length}
              </p>
            </div>

            {/* Right: Placeholder for alignment */}
            <div className="w-12" />
          </div>
        </div>
      </header>

      {/* Scenario Info */}
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center font-bold">
              {currentScenarioIndex + 1}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <FontAwesomeIcon
                  icon={currentScenario.mediaType === 'video' ? faVideo : faCamera}
                  className={currentScenario.mediaType === 'video' ? 'text-red-500' : 'text-blue-500'}
                />
                <h2 className="text-xl font-bold text-gray-800">{currentScenario.title}</h2>
              </div>
              <p className="text-gray-600">{currentScenario.description}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Team Submissions Grid */}
      <main className="max-w-4xl mx-auto px-4 py-6">
        {submissions.length === 0 ? (
          <div className="bg-white rounded-xl shadow p-8 text-center">
            <p className="text-gray-500 text-lg">No submissions for this scenario</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {submissions.map((submission) => {
              const team = teams.find((t) => t.id === submission.teamId);
              const hasBonus = currentScenarioRef?.bonusAwardedTo === submission.teamId;
              const isDisqualified = isTeamDisqualified(submission.teamId);

              return (
                <div
                  key={submission.id}
                  className={`bg-white rounded-xl shadow overflow-hidden transition-all ${
                    isDisqualified
                      ? 'ring-2 ring-red-400 opacity-60'
                      : hasBonus
                      ? 'ring-2 ring-yellow-400'
                      : ''
                  }`}
                >
                  {/* Thumbnail */}
                  <button
                    onClick={() => setSelectedSubmission(submission)}
                    className="w-full aspect-video bg-gray-200 relative group"
                  >
                    {submission.mediaType === 'video' ? (
                      <>
                        <video
                          src={submission.blobUrl}
                          className="w-full h-full object-cover"
                          muted
                        />
                        <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <FontAwesomeIcon icon={faPlay} className="text-white text-3xl" />
                        </div>
                      </>
                    ) : (
                      <img
                        src={submission.blobUrl}
                        alt={`${team?.name}'s submission`}
                        className="w-full h-full object-cover"
                      />
                    )}
                    {/* Disqualified overlay */}
                    {isDisqualified && (
                      <div className="absolute inset-0 bg-red-500/20 flex items-center justify-center">
                        <FontAwesomeIcon icon={faBan} className="text-red-600 text-4xl" />
                      </div>
                    )}
                  </button>

                  {/* Team Info & Actions */}
                  <div className="p-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: team?.color }}
                        />
                        <span className={`font-medium text-sm truncate ${isDisqualified ? 'line-through text-gray-400' : ''}`}>
                          {team?.name}
                        </span>
                      </div>

                      {isGameKeeper && (
                        <div className="flex items-center gap-1">
                          {/* Favorite star - disabled if disqualified */}
                          <button
                            onClick={() => !isDisqualified && bonusMutation.mutate(submission.teamId)}
                            disabled={bonusMutation.isPending || isDisqualified}
                            className={`p-1.5 rounded-full transition-colors ${
                              isDisqualified
                                ? 'text-gray-300 cursor-not-allowed'
                                : hasBonus
                                ? 'text-yellow-500 bg-yellow-100'
                                : 'text-gray-400 hover:text-yellow-500 hover:bg-yellow-50'
                            }`}
                            title={isDisqualified ? 'Cannot favorite disqualified entry' : hasBonus ? 'Bonus awarded' : 'Award bonus point'}
                          >
                            <FontAwesomeIcon
                              icon={hasBonus && !isDisqualified ? faStar : faStarOutline}
                              className="text-lg"
                            />
                          </button>

                          {/* Disqualify button */}
                          <button
                            onClick={() => handleDisqualifyClick(submission.teamId, team?.name || 'Unknown')}
                            disabled={disqualifyMutation.isPending}
                            className={`p-1.5 rounded-full transition-colors ${
                              isDisqualified
                                ? 'text-red-500 bg-red-100'
                                : 'text-gray-400 hover:text-red-500 hover:bg-red-50'
                            }`}
                            title={isDisqualified ? 'Click to restore' : 'Disqualify submission'}
                          >
                            <FontAwesomeIcon icon={faBan} className="text-lg" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="flex items-center justify-between mt-8">
          <button
            onClick={goToPrevious}
            disabled={isFirstScenario}
            className={`flex items-center gap-2 py-3 px-6 rounded-lg font-medium transition-colors ${
              isFirstScenario
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-white text-gray-700 hover:bg-gray-50 shadow'
            }`}
          >
            <FontAwesomeIcon icon={faChevronLeft} />
            Previous
          </button>

          {/* Scenario dots */}
          <div className="flex items-center gap-1">
            {gameScenarios.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentScenarioIndex(index)}
                className={`w-2.5 h-2.5 rounded-full transition-colors ${
                  index === currentScenarioIndex
                    ? 'bg-purple-600'
                    : 'bg-gray-300 hover:bg-gray-400'
                }`}
              />
            ))}
          </div>

          {isLastScenario ? (
            <button
              onClick={handleFinishJudging}
              disabled={completeMutation.isPending}
              className="flex items-center gap-2 py-3 px-6 rounded-lg font-medium transition-colors bg-green-500 hover:bg-green-600 disabled:bg-green-400 text-white shadow"
            >
              <FontAwesomeIcon icon={faFlag} />
              {completeMutation.isPending ? 'Finishing...' : 'Finish'}
            </button>
          ) : (
            <button
              onClick={goToNext}
              className="flex items-center gap-2 py-3 px-6 rounded-lg font-medium transition-colors bg-purple-600 text-white hover:bg-purple-700 shadow"
            >
              Next
              <FontAwesomeIcon icon={faChevronRight} />
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
