import { useParams } from 'react-router-dom';

export function GamePage() {
  const { gameCode } = useParams<{ gameCode: string }>();

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-800 mb-4">
          Game: {gameCode}
        </h1>
        <p className="text-gray-600">
          Game page coming in Phase 2...
        </p>
      </div>
    </div>
  );
}
