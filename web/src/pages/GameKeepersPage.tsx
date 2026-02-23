import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft, faUsers, faGamepad, faCheck } from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { fetchGameKeepers } from '../api';

export function GameKeepersPage() {
  const navigate = useNavigate();
  const { isLoading: authLoading, isAuthenticated, isGameKeeper } = useAuth();

  const { data: keepers, isLoading: keepersLoading } = useQuery({
    queryKey: ['gamekeepers'],
    queryFn: fetchGameKeepers,
    enabled: isGameKeeper,
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
      <header className="bg-white shadow">
        <div className="max-w-4xl mx-auto px-4 py-3 sm:py-4 flex items-center gap-3">
          <button
            onClick={() => navigate('/dashboard')}
            className="text-gray-500 hover:text-gray-700"
          >
            <FontAwesomeIcon icon={faArrowLeft} />
          </button>
          <h1 className="text-base sm:text-xl font-bold text-gray-800">
            <FontAwesomeIcon icon={faUsers} className="mr-2 text-blue-500" />
            Game Keepers{keepers ? ` (${keepers.length})` : ''}
          </h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {keepersLoading ? (
          <p className="text-gray-500">Loading game keepers...</p>
        ) : keepers && keepers.length > 0 ? (
          <div className="grid gap-3">
            {keepers.map((keeper) => (
              <div
                key={keeper.email}
                className="bg-white rounded-lg shadow p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
              >
                <div>
                  <p className="font-semibold text-gray-800">{keeper.displayName}</p>
                  <p className="text-sm text-gray-500">{keeper.email}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Added {new Date(keeper.addedAt).toLocaleDateString()}{keeper.addedBy !== 'system' ? ` by ${keeper.addedBy}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  {keeper.activeGames > 0 && (
                    <span className="flex items-center gap-1.5 text-blue-600">
                      <FontAwesomeIcon icon={faGamepad} />
                      {keeper.activeGames} active
                    </span>
                  )}
                  {keeper.completedGames > 0 && (
                    <span className="flex items-center gap-1.5 text-gray-500">
                      <FontAwesomeIcon icon={faCheck} />
                      {keeper.completedGames} completed
                    </span>
                  )}
                  {keeper.activeGames === 0 && keeper.completedGames === 0 && (
                    <span className="text-gray-400">No games</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
            <p>No game keepers found.</p>
          </div>
        )}
      </main>
    </div>
  );
}
