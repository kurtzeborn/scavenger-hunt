import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faGamepad, faUserPlus, faArrowLeft, faTrash, faTimes, faCheck } from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../hooks/useAuth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchGames, deleteGame, inviteGameKeeper } from '../api';
import { ConfirmModal } from '../components/shared/ConfirmModal';
import type { Game } from '../types';

// Get display status for a game (considers expired timers)
function getDisplayStatus(game: Game): { label: string; color: string } {
  if (game.status === 'active' || game.status === 'paused') {
    const endsAt = game.endsAt ? new Date(game.endsAt) : null;
    const pausedAt = game.pausedAt ? new Date(game.pausedAt) : null;
    
    // If paused, check if it would have expired
    if (game.status === 'paused' && pausedAt && endsAt) {
      const wouldBeExpired = endsAt.getTime() <= pausedAt.getTime();
      if (wouldBeExpired) {
        return { label: 'Expired (Paused)', color: 'text-orange-600 bg-orange-100' };
      }
      return { label: 'Paused', color: 'text-amber-600 bg-amber-100' };
    }
    
    // Check if timer has expired
    if (endsAt && endsAt.getTime() < Date.now()) {
      return { label: 'Time Expired', color: 'text-orange-600 bg-orange-100' };
    }
    
    return { label: 'Active', color: 'text-green-600 bg-green-100' };
  }
  
  switch (game.status) {
    case 'lobby':
      return { label: 'Lobby', color: 'text-blue-600 bg-blue-100' };
    case 'judging':
      return { label: 'Judging', color: 'text-purple-600 bg-purple-100' };
    case 'complete':
      return { label: 'Complete', color: 'text-gray-600 bg-gray-100' };
    default:
      return { label: game.status, color: 'text-gray-600 bg-gray-100' };
  }
}

export function DashboardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isLoading: authLoading, isAuthenticated, isGameKeeper, user, signOut } = useAuth();
  const [gameToDelete, setGameToDelete] = useState<Game | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);

  const { data: games, isLoading: gamesLoading } = useQuery({
    queryKey: ['my-games'],
    queryFn: fetchGames,
    enabled: isGameKeeper,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteGame,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-games'] });
      setGameToDelete(null);
    },
  });

  const inviteMutation = useMutation({
    mutationFn: inviteGameKeeper,
    onSuccess: (data) => {
      setInviteSuccess(`${data.email} is now a game keeper!`);
      setInviteEmail('');
      setTimeout(() => {
        setShowInviteModal(false);
        setInviteSuccess(null);
      }, 2000);
    },
  });

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated || !isGameKeeper) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow p-6 max-w-md text-center">
          <p className="text-gray-700 mb-4">You must be a game keeper to access this page.</p>
          <button
            onClick={() => navigate('/')}
            className="text-blue-500 hover:text-blue-700"
          >
            <FontAwesomeIcon icon={faArrowLeft} className="mr-2" />
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={!!gameToDelete}
        title="Delete Game?"
        message={`Are you sure you want to delete game ${gameToDelete?.id}? This will permanently remove all teams, scores, and uploaded media. This action cannot be undone.`}
        confirmText={deleteMutation.isPending ? 'Deleting...' : 'Delete'}
        cancelText="Cancel"
        variant="danger"
        onConfirm={() => gameToDelete && deleteMutation.mutate(gameToDelete.id)}
        onCancel={() => setGameToDelete(null)}
      />

      {/* Invite Game Keeper Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-800">Invite Game Keeper</h2>
              <button
                onClick={() => {
                  setShowInviteModal(false);
                  setInviteEmail('');
                  setInviteSuccess(null);
                  inviteMutation.reset();
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>

            {inviteSuccess ? (
              <div className="text-center py-4">
                <FontAwesomeIcon icon={faCheck} className="text-green-500 text-4xl mb-3" />
                <p className="text-green-600 font-medium">{inviteSuccess}</p>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (inviteEmail.trim()) {
                    inviteMutation.mutate({ email: inviteEmail.trim() });
                  }
                }}
              >
                <label className="block text-gray-700 font-medium mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="jane@example.com"
                  className="w-full border border-gray-300 rounded-lg p-3 mb-4 focus:border-blue-500 focus:outline-none"
                  autoFocus
                  required
                />

                {inviteMutation.isError && (
                  <p className="text-red-500 text-sm mb-4">
                    {(inviteMutation.error as Error).message || 'Failed to invite'}
                  </p>
                )}

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowInviteModal(false);
                      setInviteEmail('');
                      inviteMutation.reset();
                    }}
                    className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold py-3 px-4 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={inviteMutation.isPending || !inviteEmail.trim()}
                    className="flex-1 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
                  >
                    {inviteMutation.isPending ? 'Adding...' : 'Add Game Keeper'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      <header className="bg-white shadow">
        <div className="max-w-4xl mx-auto px-4 py-3 sm:py-4 flex flex-col sm:flex-row justify-between items-center gap-2 sm:gap-0">
          <h1 className="text-base sm:text-xl font-bold text-gray-800">
            <FontAwesomeIcon icon={faGamepad} className="mr-2 text-blue-500" />
            Dashboard
          </h1>
          <div className="flex items-center gap-2 sm:gap-4">
            <span className="text-xs sm:text-sm text-gray-500 truncate max-w-[120px] sm:max-w-none">{user?.userDetails}</span>
            <button
              onClick={signOut}
              className="text-gray-500 hover:text-gray-700 text-xs sm:text-sm whitespace-nowrap"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 mb-6 sm:mb-8">
          <button
            onClick={() => navigate('/create')}
            className="bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2.5 sm:py-3 px-4 sm:px-6 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm sm:text-base"
          >
            <FontAwesomeIcon icon={faPlus} />
            Create Game
          </button>
          <button
            onClick={() => setShowInviteModal(true)}
            className="bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold py-2.5 sm:py-3 px-4 sm:px-6 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm sm:text-base"
          >
            <FontAwesomeIcon icon={faUserPlus} />
            Invite Game Keeper
          </button>
        </div>

        <section>
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Your Games</h2>
          {gamesLoading ? (
            <p className="text-gray-500">Loading games...</p>
          ) : games && games.length > 0 ? (
            <div className="grid gap-4">
              {games.map((game) => {
                const displayStatus = getDisplayStatus(game);
                const isComplete = game.status === 'complete';
                return (
                  <div
                    key={game.id}
                    className="bg-white rounded-lg shadow p-4 flex justify-between items-center hover:shadow-md transition-shadow"
                  >
                    <div
                      className="flex items-center gap-3 cursor-pointer flex-1"
                      onClick={() => navigate(`/game/${game.id}`)}
                    >
                      <span className="font-mono text-xl font-bold text-blue-600">{game.id}</span>
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${displayStatus.color}`}>
                        {displayStatus.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-gray-400">
                        {new Date(game.createdAt).toLocaleDateString()}
                      </span>
                      {isComplete && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setGameToDelete(game);
                          }}
                          className="text-gray-400 hover:text-red-500 p-2 transition-colors"
                          title="Delete game"
                        >
                          <FontAwesomeIcon icon={faTrash} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
              <p>No games yet. Create your first game!</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
