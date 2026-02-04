import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGamepad, faRightToBracket } from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../hooks/useAuth';

export function LandingPage() {
  const [gameCode, setGameCode] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { isLoading, isAuthenticated, isGameKeeper, user, signIn, signOut } = useAuth();

  const handleJoinGame = (e: React.FormEvent) => {
    e.preventDefault();
    const code = gameCode.toUpperCase().trim();
    if (code.length !== 4) {
      setError('Game code must be 4 letters');
      return;
    }
    if (!/^[A-Z]+$/.test(code)) {
      setError('Game code must contain only letters');
      return;
    }
    navigate(`/game/${code}`);
  };

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
    setGameCode(value);
    setError('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-purple-700 flex flex-col items-center justify-center p-4">
      <div className="text-center mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-4xl md:text-5xl font-bold text-white mb-2">
          <FontAwesomeIcon icon={faGamepad} className="mr-2 sm:mr-3" />
          Video Scavenger Hunt
        </h1>
        <p className="text-blue-100 text-sm sm:text-lg">Capture moments. Compete with friends.</p>
      </div>

      <div className="bg-white rounded-2xl shadow-xl p-4 sm:p-8 w-full max-w-md">
        <form onSubmit={handleJoinGame} className="mb-6">
          <label htmlFor="gameCode" className="block text-gray-700 font-medium mb-2">
            Enter Game Code
          </label>
          <input
            id="gameCode"
            type="text"
            value={gameCode}
            onChange={handleCodeChange}
            placeholder="ABCD"
            className="w-full text-center text-2xl sm:text-3xl font-mono tracking-wider sm:tracking-widest border-2 border-gray-300 rounded-lg p-3 sm:p-4 focus:border-blue-500 focus:outline-none uppercase"
            maxLength={4}
            autoComplete="off"
            autoFocus
          />
          {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
          <button
            type="submit"
            disabled={gameCode.length !== 4}
            className="w-full mt-4 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <FontAwesomeIcon icon={faRightToBracket} />
            Join Game
          </button>
        </form>

        <div className="border-t border-gray-200 pt-6">
          {isAuthenticated ? (
            isGameKeeper ? (
              <div className="text-center">
                <p className="text-gray-600 mb-3">Signed in as {user?.userDetails}</p>
                <button
                  onClick={() => navigate('/dashboard')}
                  className="w-full bg-green-500 hover:bg-green-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
                >
                  Go to Dashboard
                </button>
                <button
                  onClick={signOut}
                  className="w-full mt-2 text-gray-500 hover:text-gray-700 text-sm"
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <p className="text-amber-800 font-medium mb-2">⚠️ Not Authorized</p>
                <p className="text-amber-700 text-sm mb-3">
                  You're signed in as <strong>{user?.userDetails}</strong> but you're not
                  registered as a game keeper.
                </p>
                <p className="text-amber-700 text-sm mb-3">
                  Ask an existing game keeper to invite you.
                </p>
                <button
                  onClick={signOut}
                  className="text-amber-600 hover:text-amber-800 text-sm font-medium"
                >
                  Sign Out
                </button>
              </div>
            )
          ) : (
            <button
              onClick={signIn}
              disabled={isLoading}
              className="w-full bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-700 font-medium py-3 px-6 rounded-lg transition-colors"
            >
              {isLoading ? 'Checking login status...' : 'Sign in to Create a Game'}
            </button>
          )}
        </div>
      </div>

      <p className="text-blue-100 text-sm mt-8">
        vsh.k61.dev
      </p>
    </div>
  );
}
