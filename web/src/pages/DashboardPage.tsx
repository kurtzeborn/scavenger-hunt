import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faGamepad, faUserPlus, faArrowLeft } from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { fetchGames } from '../api';

export function DashboardPage() {
  const navigate = useNavigate();
  const { isLoading: authLoading, isAuthenticated, isGameKeeper, user, signOut } = useAuth();

  const { data: games, isLoading: gamesLoading } = useQuery({
    queryKey: ['my-games'],
    queryFn: fetchGames,
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
        <div className="max-w-4xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold text-gray-800">
            <FontAwesomeIcon icon={faGamepad} className="mr-2 text-blue-500" />
            Game Keeper Dashboard
          </h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">{user?.userDetails}</span>
            <button
              onClick={signOut}
              className="text-gray-500 hover:text-gray-700 text-sm"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex gap-4 mb-8">
          <button
            onClick={() => navigate('/create')}
            className="bg-blue-500 hover:bg-blue-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors flex items-center gap-2"
          >
            <FontAwesomeIcon icon={faPlus} />
            Create Game
          </button>
          <button
            onClick={() => {/* TODO: Invite modal */}}
            className="bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold py-3 px-6 rounded-lg transition-colors flex items-center gap-2"
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
              {games.map((game) => (
                <div
                  key={game.id}
                  className="bg-white rounded-lg shadow p-4 flex justify-between items-center cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => navigate(`/game/${game.id}`)}
                >
                  <div>
                    <span className="font-mono text-xl font-bold text-blue-600">{game.id}</span>
                    <span className="ml-3 text-sm text-gray-500 capitalize">{game.status}</span>
                  </div>
                  <span className="text-sm text-gray-400">
                    {new Date(game.createdAt).toLocaleDateString()}
                  </span>
                </div>
              ))}
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
