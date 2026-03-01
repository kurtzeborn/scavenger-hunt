import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCamera,
  faVideo,
  faCheck,
  faClock,
  faPlay,
  faTrophy,
  faHome,
  faPause,
  faStop,
  faQrcode,
} from '@fortawesome/free-solid-svg-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { fetchTeams, fetchScenarios, pauseGame, resumeGame, endGame } from '../../api';
import { usePlayerSession } from '../../contexts/PlayerSessionContext';
import type { Game, Scenario } from '../../types';
import { MediaCapture } from './MediaCapture';
import { ConfirmModal } from '../shared/ConfirmModal';

interface ScenarioListViewProps {
  game: Game;
  isGameKeeper: boolean;
}

export function ScenarioListView({ game, isGameKeeper }: ScenarioListViewProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { session } = usePlayerSession();
  const [selectedScenario, setSelectedScenario] = useState<Scenario | null>(null);
  const [showTimesUpMessage, setShowTimesUpMessage] = useState(false);
  const [showEndGameConfirm, setShowEndGameConfirm] = useState(false);
  const [showQRCode, setShowQRCode] = useState(false);

  // Generate the join URL for QR code
  const joinUrl = `https://vsh.k61.dev/game/${game.id}`;

  // Mutations for game control
  const pauseMutation = useMutation({
    mutationFn: () => pauseGame(game.id),
    onSuccess: (updatedGame) => {
      queryClient.setQueryData(['game', game.id], updatedGame);
    },
  });

  const resumeMutation = useMutation({
    mutationFn: () => resumeGame(game.id),
    onSuccess: (updatedGame) => {
      queryClient.setQueryData(['game', game.id], updatedGame);
    },
  });

  const endMutation = useMutation({
    mutationFn: () => endGame(game.id),
    onSuccess: (updatedGame) => {
      queryClient.setQueryData(['game', game.id], updatedGame);
    },
  });

  // Fetch teams for completion status
  const { data: teams = [] } = useQuery({
    queryKey: ['teams', game.id],
    queryFn: () => fetchTeams(game.id),
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  // Fetch all scenarios to match with game's scenario refs
  const { data: allScenarios = [] } = useQuery({
    queryKey: ['scenarios'],
    queryFn: fetchScenarios,
  });

  // Get scenarios for this game in order
  const gameScenarios = game.scenarios
    .sort((a, b) => a.order - b.order)
    .map((ref) => allScenarios.find((s) => s.id === ref.scenarioId))
    .filter((s): s is Scenario => s !== undefined);

  // Find current player's team
  const myTeam = teams.find((t) => t.id === session?.teamId);
  const completedScenarios = myTeam?.completedScenarios || [];

  // Timer calculation with live updates
  const isPaused = game.status === 'paused';
  const endsAtTime = game.endsAt ? new Date(game.endsAt).getTime() : null;
  const pausedAtTime = game.pausedAt ? new Date(game.pausedAt).getTime() : null;

  // Calculate time remaining - pure function, no hooks
  const calculateTimeRemaining = useCallback(() => {
    if (!endsAtTime) return 0;
    
    if (isPaused && pausedAtTime) {
      // When paused, show time remaining as of when pause started
      return Math.max(0, endsAtTime - pausedAtTime);
    }
    
    return Math.max(0, endsAtTime - Date.now());
  }, [endsAtTime, isPaused, pausedAtTime]);

  // Initialize state with calculated value using a function initializer
  const [timeRemaining, setTimeRemaining] = useState(() => {
    if (!endsAtTime) return 0;
    if (isPaused && pausedAtTime) {
      return Math.max(0, endsAtTime - pausedAtTime);
    }
    return Math.max(0, endsAtTime - Date.now());
  });

  // Only use effect for the interval, not for initial state
  useEffect(() => {
    // Update immediately when game state changes (pause/resume)
    const newRemaining = calculateTimeRemaining();
    if (newRemaining !== timeRemaining) {
      setTimeRemaining(newRemaining);
    }
    
    // Update every second when not paused
    if (!isPaused) {
      const interval = setInterval(() => {
        const remaining = calculateTimeRemaining();
        setTimeRemaining(remaining);
        
        // Check if time is up
        if (remaining === 0 && !showTimesUpMessage) {
          setShowTimesUpMessage(true);
        }
      }, 1000);
      
      return () => clearInterval(interval);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calculateTimeRemaining, isPaused]);

  const minutesRemaining = Math.floor(timeRemaining / 60000);
  const secondsRemaining = Math.floor((timeRemaining % 60000) / 1000);

  // Timer color based on remaining time
  const getTimerColor = () => {
    if (isPaused) return 'text-gray-400';
    if (minutesRemaining < 1) return 'text-red-400';
    if (minutesRemaining < 10) return 'text-yellow-300';
    return 'text-green-300';
  };



  // Calculate score
  const myScore = completedScenarios.length;
  const totalScenarios = game.scenarios.length;

  // If a scenario is selected, show the capture view
  if (selectedScenario) {
    return (
      <MediaCapture
        game={game}
        scenario={selectedScenario}
        onComplete={() => setSelectedScenario(null)}
        onCancel={() => setSelectedScenario(null)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* End Game Confirmation Modal */}
      <ConfirmModal
        isOpen={showEndGameConfirm}
        title="End Game?"
        message="Are you sure you want to end the game and start judging? Players will no longer be able to submit media."
        confirmText="End Game"
        cancelText="Keep Playing"
        variant="danger"
        onConfirm={() => {
          setShowEndGameConfirm(false);
          endMutation.mutate();
        }}
        onCancel={() => setShowEndGameConfirm(false)}
      />

      {/* Pause Overlay */}
      {isPaused && !isGameKeeper && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl p-8 max-w-md text-center mx-4">
            <FontAwesomeIcon icon={faPause} className="text-5xl text-amber-500 mb-4" />
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Game Paused</h2>
            <p className="text-gray-600">
              The game keeper has paused the game. Hang tight!
            </p>
          </div>
        </div>
      )}

      {/* Time's Up Overlay (for non-game keepers) */}
      {showTimesUpMessage && timeRemaining === 0 && !isGameKeeper && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl p-8 max-w-md text-center mx-4">
            <FontAwesomeIcon icon={faClock} className="text-5xl text-red-500 mb-4" />
            <h2 className="text-2xl font-bold text-gray-800 mb-2">⏰ Time's Up!</h2>
            <p className="text-gray-600">
              The game has ended. Waiting for the game keeper to start judging...
            </p>
          </div>
        </div>
      )}

      {/* QR Code Modal */}
      {showQRCode && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowQRCode(false)}
        >
          <div 
            className="bg-white rounded-2xl p-6 max-w-sm w-full text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold text-gray-800 mb-2">Scan to Join</h2>
            <p className="text-gray-600 text-sm mb-4">
              Game Code: <span className="font-mono font-bold">{game.id}</span>
            </p>
            <div className="bg-white p-4 rounded-lg inline-block">
              <QRCodeSVG 
                value={joinUrl} 
                size={200}
                level="M"
                includeMargin={true}
              />
            </div>
            <p className="text-gray-500 text-xs mt-4 break-all">{joinUrl}</p>
            <button
              onClick={() => setShowQRCode(false)}
              className="mt-4 px-6 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg text-gray-700 font-medium transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Sticky container for header + scoreboard */}
      <div className="sticky top-0 z-10">
      {/* Header with Timer */}
      <header className="bg-gradient-to-r from-blue-600 to-purple-700 text-white shadow-lg">
        <div className="max-w-4xl mx-auto px-2 sm:px-4 py-2 sm:py-4">
          <div className="flex items-center justify-between">
            {/* Left: Player info or Game Keeper home button + game code */}
            {isGameKeeper ? (
              <div className="flex items-center gap-1 sm:gap-3">
                <button
                  onClick={() => navigate('/dashboard')}
                  className="text-white/80 hover:text-white transition-colors p-1 sm:p-2"
                  title="Back to Dashboard"
                >
                  <FontAwesomeIcon icon={faHome} className="text-base sm:text-xl" />
                </button>
                <div className="bg-white/20 px-2 sm:px-3 py-0.5 sm:py-1 rounded-lg">
                  <span className="font-mono font-bold text-sm sm:text-lg tracking-wider">{game.id}</span>
                </div>
                <button
                  onClick={() => setShowQRCode(true)}
                  className="p-1 sm:p-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
                  title="Show QR Code"
                >
                  <FontAwesomeIcon icon={faQrcode} className="text-base sm:text-xl" />
                </button>
              </div>
            ) : (
              <div className="min-w-0">
                <p className="text-blue-100 text-xs sm:text-sm truncate">{myTeam?.name}</p>
                <p className="font-semibold text-sm sm:text-base truncate">{session?.displayName}</p>
              </div>
            )}
            
            {/* Center: Timer */}
            <div className="text-center flex-shrink-0">
              <div className={`flex items-center gap-1 sm:gap-2 text-lg sm:text-2xl font-mono font-bold ${getTimerColor()}`}>
                <FontAwesomeIcon icon={isPaused ? faPause : faClock} className="text-sm sm:text-base" />
                {minutesRemaining.toString().padStart(2, '0')}:
                {secondsRemaining.toString().padStart(2, '0')}
              </div>
              <p className="text-blue-100 text-[10px] sm:text-xs">
                {isPaused ? 'Paused' : 'Time Left'}
              </p>
            </div>

            {/* Right: Score (only for players) or controls (for gamekeeper) */}
            {!isGameKeeper ? (
              <div className="text-right">
                <div className="flex items-center gap-1 sm:gap-2">
                  <FontAwesomeIcon icon={faTrophy} className="text-yellow-300 text-sm sm:text-base" />
                  <span className="text-lg sm:text-2xl font-bold">{myScore}/{totalScenarios}</span>
                </div>
                <p className="text-blue-100 text-[10px] sm:text-xs">Done</p>
              </div>
            ) : (
              <div className="flex items-center gap-1 sm:gap-2">
                {/* Controls */}
                {isPaused ? (
                  <button
                    onClick={() => resumeMutation.mutate()}
                    disabled={resumeMutation.isPending}
                    className="bg-green-500 hover:bg-green-600 disabled:bg-green-400 text-white font-medium py-1 sm:py-1.5 px-2 sm:px-3 rounded-lg transition-colors flex items-center gap-1 sm:gap-1.5 text-xs sm:text-sm"
                  >
                    <FontAwesomeIcon icon={faPlay} />
                    <span className="hidden sm:inline">Resume</span>
                  </button>
                ) : (
                  <button
                    onClick={() => pauseMutation.mutate()}
                    disabled={pauseMutation.isPending}
                    className="bg-amber-500 hover:bg-amber-600 disabled:bg-amber-400 text-white font-medium py-1 sm:py-1.5 px-2 sm:px-3 rounded-lg transition-colors flex items-center gap-1 sm:gap-1.5 text-xs sm:text-sm"
                  >
                    <FontAwesomeIcon icon={faPause} />
                    <span className="hidden sm:inline">Pause</span>
                  </button>
                )}
                <button
                  onClick={() => setShowEndGameConfirm(true)}
                  disabled={endMutation.isPending}
                  className="bg-red-500 hover:bg-red-600 disabled:bg-red-400 text-white font-medium py-1 sm:py-1.5 px-2 sm:px-3 rounded-lg transition-colors flex items-center gap-1 sm:gap-1.5 text-xs sm:text-sm"
                >
                  <FontAwesomeIcon icon={faStop} />
                  <span className="hidden sm:inline">End</span>
                </button>
                {/* Uploads counter */}
                <div className="text-right ml-1">
                  <span className="text-sm sm:text-lg font-bold">
                    {teams.reduce((sum, t) => sum + t.completedScenarios.length, 0)}/
                    {teams.length * totalScenarios}
                  </span>
                  <p className="text-blue-100 text-[10px] sm:text-xs">Uploads</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Scoreboard (collapsed) - horizontal scroll for many teams */}
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-2">
          <div className="flex items-center gap-3 overflow-x-auto flex-nowrap pb-1">
            {teams
              .sort((a, b) => b.completedScenarios.length - a.completedScenarios.length)
              .map((team) => (
                <div
                  key={team.id}
                  className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full whitespace-nowrap text-sm ${
                    team.id === myTeam?.id ? 'bg-blue-100' : 'bg-gray-100'
                  }`}
                >
                  <div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: team.color }}
                  />
                  <span className="font-medium text-sm">{team.name}</span>
                  <span className="text-gray-500 text-sm">{team.completedScenarios.length}</span>
                </div>
              ))}
          </div>
        </div>
      </div>
      </div>{/* end sticky container */}

      {/* Scenarios List */}
      <main className="max-w-4xl mx-auto px-4 py-4">
        <div className="grid gap-2">
          {gameScenarios.map((scenario, index) => {
            const isCompleted = completedScenarios.includes(scenario.id);
            const scenarioRef = game.scenarios.find((s) => s.scenarioId === scenario.id);
            // Count how many teams have completed this scenario
            const teamsCompleted = teams.filter(t => t.completedScenarios.includes(scenario.id)).length;
            
            return (
              <div
                key={scenario.id}
                className={`bg-white rounded-lg shadow overflow-hidden transition-all ${
                  isCompleted ? 'opacity-75' : 'hover:shadow-md'
                }`}
              >
                <div className="px-3 py-2">
                  <div className="flex items-center gap-3">
                    {/* Scenario Number */}
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${
                        isCompleted
                          ? 'bg-green-100 text-green-600'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {isCompleted ? (
                        <FontAwesomeIcon icon={faCheck} />
                      ) : (
                        scenarioRef?.order || index + 1
                      )}
                    </div>

                    {/* Scenario Details - inline layout */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <FontAwesomeIcon
                          icon={scenario.mediaType === 'video' ? faVideo : faCamera}
                          className={`text-xs ${scenario.mediaType === 'video' ? 'text-red-500' : 'text-blue-500'}`}
                        />
                        <h3 className="font-semibold text-gray-800">{scenario.title}</h3>
                        <span className="text-gray-500 text-sm">{scenario.description}</span>
                      </div>
                    </div>

                    {/* Teams completed count (for gamekeeper) or action button (for players) */}
                    {isGameKeeper ? (
                      <div className="flex-shrink-0 text-center min-w-[3rem]">
                        <span className={`text-sm font-medium ${teamsCompleted > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                          {teamsCompleted}/{teams.length}
                        </span>
                      </div>
                    ) : isCompleted ? (
                      <div className="flex-shrink-0 bg-green-100 text-green-700 font-medium py-1.5 px-3 rounded-lg flex items-center gap-1.5 text-sm">
                        <FontAwesomeIcon icon={faCheck} />
                        <span className="hidden sm:inline">Done</span>
                      </div>
                    ) : (
                      <button
                        onClick={() => setSelectedScenario(scenario)}
                        disabled={isPaused}
                        className={`flex-shrink-0 font-medium py-1.5 px-3 rounded-lg transition-colors flex items-center gap-1.5 text-sm ${
                          isPaused
                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                            : 'bg-blue-500 hover:bg-blue-600 text-white'
                        }`}
                      >
                        <FontAwesomeIcon icon={faPlay} />
                        <span className="hidden sm:inline">Capture</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Completion Message (players only) */}
        {!isGameKeeper && myScore === totalScenarios && (
          <div className="mt-8 bg-gradient-to-r from-green-500 to-emerald-600 rounded-xl p-6 text-center text-white">
            <FontAwesomeIcon icon={faTrophy} className="text-5xl mb-4" />
            <h2 className="text-2xl font-bold mb-2">🎉 All Scenarios Complete!</h2>
            <p className="text-green-100">
              Amazing work! Wait for the game to end to see the final results.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
