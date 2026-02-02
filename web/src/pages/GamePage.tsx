import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner, faArrowLeft, faExclamationTriangle } from '@fortawesome/free-solid-svg-icons';
import { fetchGame, startGame } from '../api';
import { useAuth } from '../hooks/useAuth';
import { usePlayerSession } from '../contexts/PlayerSessionContext';
import { JoinGameFlow } from '../components/player/JoinGameFlow';
import { LobbyView } from '../components/game/LobbyView';
import { ScenarioListView } from '../components/game/ScenarioListView';

export function GamePage() {
  const { gameCode } = useParams<{ gameCode: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isGameKeeper, user } = useAuth();
  const { session, isLoading: sessionLoading, isValidForGame, clearSession } = usePlayerSession();

  const gameId = gameCode?.toUpperCase() || '';

  // Fetch game data with polling
  const {
    data: game,
    isLoading: gameLoading,
    error: gameError,
  } = useQuery({
    queryKey: ['game', gameId],
    queryFn: () => fetchGame(gameId),
    enabled: !!gameId,
    refetchInterval: 5000, // Poll every 5 seconds
  });

  // Start game mutation
  const startMutation = useMutation({
    mutationFn: () => startGame(gameId),
    onSuccess: (updatedGame) => {
      queryClient.setQueryData(['game', gameId], updatedGame);
    },
  });

  // Check if current user is the game keeper for this game
  const isOwner = game?.createdBy === user?.userDetails;
  const isGameKeeperForGame = isGameKeeper && isOwner;

  // Determine if the player has a valid session for this game
  const hasValidSession = !sessionLoading && session && isValidForGame(gameId);

  // Loading state
  if (gameLoading || sessionLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <FontAwesomeIcon icon={faSpinner} className="text-4xl text-blue-500 animate-spin mb-4" />
          <p className="text-gray-500">Loading game...</p>
        </div>
      </div>
    );
  }

  // Game not found
  if (gameError || !game) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md text-center">
          <FontAwesomeIcon icon={faExclamationTriangle} className="text-5xl text-amber-500 mb-4" />
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Game Not Found</h1>
          <p className="text-gray-600 mb-6">
            The game code <span className="font-mono font-bold">{gameId}</span> doesn't exist or has expired.
          </p>
          <button
            onClick={() => navigate('/')}
            className="bg-blue-500 hover:bg-blue-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors inline-flex items-center gap-2"
          >
            <FontAwesomeIcon icon={faArrowLeft} />
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  // Handle different game states
  switch (game.status) {
    case 'lobby':
      // If player doesn't have a valid session, show join flow (unless they're the game keeper)
      if (!hasValidSession && !isGameKeeperForGame) {
        return (
          <JoinGameFlow
            gameId={gameId}
            onJoined={() => {
              queryClient.invalidateQueries({ queryKey: ['teams', gameId] });
            }}
          />
        );
      }
      
      // Show lobby view
      return (
        <LobbyView
          game={game}
          isGameKeeper={isGameKeeperForGame}
          onStartGame={() => startMutation.mutate()}
          startingGame={startMutation.isPending}
        />
      );

    case 'active':
    case 'paused':
      // If player doesn't have a valid session and isn't the game keeper, show error
      if (!hasValidSession && !isGameKeeperForGame) {
        return (
          <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-lg p-8 max-w-md text-center">
              <FontAwesomeIcon icon={faExclamationTriangle} className="text-5xl text-amber-500 mb-4" />
              <h1 className="text-2xl font-bold text-gray-800 mb-2">Game In Progress</h1>
              <p className="text-gray-600 mb-6">
                This game has already started. You can't join a game that's in progress.
              </p>
              <button
                onClick={() => navigate('/')}
                className="bg-blue-500 hover:bg-blue-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors inline-flex items-center gap-2"
              >
                <FontAwesomeIcon icon={faArrowLeft} />
                Back to Home
              </button>
            </div>
          </div>
        );
      }

      // Show active game view
      return <ScenarioListView game={game} isGameKeeper={isGameKeeperForGame} />;

    case 'judging':
      // TODO: Implement judging view in Phase 3
      return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-lg p-8 max-w-md text-center">
            <h1 className="text-2xl font-bold text-gray-800 mb-2">⚖️ Judging Phase</h1>
            <p className="text-gray-600 mb-6">
              The game is being judged. Final scores will be announced soon!
            </p>
          </div>
        </div>
      );

    case 'complete':
      // TODO: Implement results view in Phase 3
      return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-lg p-8 max-w-md text-center">
            <h1 className="text-2xl font-bold text-gray-800 mb-2">🏆 Game Complete</h1>
            <p className="text-gray-600 mb-6">
              Thanks for playing! Check with the game keeper for final results.
            </p>
            <button
              onClick={() => {
                clearSession();
                navigate('/');
              }}
              className="bg-blue-500 hover:bg-blue-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors inline-flex items-center gap-2"
            >
              <FontAwesomeIcon icon={faArrowLeft} />
              Back to Home
            </button>
          </div>
        </div>
      );

    default:
      return null;
  }
}
