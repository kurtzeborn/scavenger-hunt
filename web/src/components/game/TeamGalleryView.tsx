import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCamera,
  faVideo,
  faArrowLeft,
  faPlay,
  faSpinner,
  faImages,
} from '@fortawesome/free-solid-svg-icons';
import { useQuery } from '@tanstack/react-query';
import { fetchMediaSubmissions, fetchScenarios } from '../../api';
import type { Game, Team, MediaSubmission } from '../../types';
import { MediaModal } from '../shared/MediaModal';
import { getOrderedGameScenarios } from '../../utils/gameUtils';

interface TeamGalleryViewProps {
  game: Game;
  team: Team;
  onBack: () => void;
}

export function TeamGalleryView({ game, team, onBack }: TeamGalleryViewProps) {
  const [selectedSubmission, setSelectedSubmission] = useState<MediaSubmission | null>(null);

  // Fetch all scenarios
  const { data: scenarios = [] } = useQuery({
    queryKey: ['scenarios'],
    queryFn: fetchScenarios,
  });

  // Fetch team's submissions
  const { data: submissions = [], isLoading } = useQuery({
    queryKey: ['media', game.id, team.id],
    queryFn: () => fetchMediaSubmissions(game.id, { teamId: team.id }),
  });

  // Get game scenarios in order
  const gameScenarios = getOrderedGameScenarios(game, scenarios);

  // Map submissions to scenarios
  const scenarioSubmissions = gameScenarios.map((scenario) => {
    const submission = submissions.find((s) => s.scenarioId === scenario.id);
    return { scenario, submission };
  });

  const selectedScenario = selectedSubmission
    ? scenarios.find((s) => s.id === selectedSubmission.scenarioId)
    : undefined;

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Media Modal */}
      {selectedSubmission && (
        <MediaModal
          submission={selectedSubmission}
          scenario={selectedScenario}
          gameCode={game.id}
          showDownload
          onClose={() => setSelectedSubmission(null)}
        />
      )}

      {/* Header */}
      <header className="bg-gradient-to-r from-purple-600 to-indigo-700 text-white shadow-lg sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            {/* Back button */}
            <button
              onClick={onBack}
              className="text-white/80 hover:text-white transition-colors p-2 flex items-center gap-2"
            >
              <FontAwesomeIcon icon={faArrowLeft} />
              <span className="hidden sm:inline">Back</span>
            </button>

            {/* Title */}
            <div className="text-center flex-1">
              <div className="flex items-center justify-center gap-2 mb-1">
                <FontAwesomeIcon icon={faImages} className="text-purple-200" />
                <h1 className="text-xl font-bold">Your Media Gallery</h1>
              </div>
              <div className="flex items-center justify-center gap-2 text-sm text-purple-200">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: team.color }}
                />
                <span>{team.name}</span>
              </div>
            </div>

            {/* Spacer for centering */}
            <div className="w-10" />
          </div>
        </div>
      </header>

      {/* Gallery Grid */}
      <main className="max-w-4xl mx-auto px-4 py-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <FontAwesomeIcon icon={faSpinner} className="animate-spin text-3xl text-purple-600" />
          </div>
        ) : submissions.length === 0 ? (
          <div className="bg-white rounded-xl shadow p-8 text-center">
            <FontAwesomeIcon icon={faImages} className="text-4xl text-gray-300 mb-4" />
            <p className="text-gray-500 text-lg">No media captured yet</p>
            <p className="text-gray-400 text-sm mt-2">
              Complete some scenarios to see your media here!
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {scenarioSubmissions.map(({ scenario, submission }) => (
              <div
                key={scenario.id}
                className={`bg-white rounded-xl shadow overflow-hidden ${
                  submission ? 'cursor-pointer hover:shadow-lg transition-shadow' : 'opacity-50'
                }`}
                onClick={() => submission && setSelectedSubmission(submission)}
              >
                {/* Thumbnail */}
                <div className="aspect-video bg-gray-200 relative group">
                  {submission ? (
                    <>
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
                          alt={scenario.title}
                          className="w-full h-full object-cover"
                        />
                      )}
                    </>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <FontAwesomeIcon
                        icon={scenario.mediaType === 'video' ? faVideo : faCamera}
                        className="text-gray-300 text-3xl"
                      />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <FontAwesomeIcon
                      icon={scenario.mediaType === 'video' ? faVideo : faCamera}
                      className={`text-sm ${scenario.mediaType === 'video' ? 'text-red-500' : 'text-blue-500'}`}
                    />
                    <span className="font-medium text-sm text-gray-800 truncate">
                      {scenario.title}
                    </span>
                  </div>
                  {submission ? (
                    <p className="text-xs text-green-600">✓ Captured</p>
                  ) : (
                    <p className="text-xs text-gray-400">Not captured</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Summary */}
        {submissions.length > 0 && (
          <div className="mt-6 bg-white rounded-xl shadow p-4 text-center">
            <p className="text-gray-600">
              <span className="font-bold text-purple-600">{submissions.length}</span> of{' '}
              <span className="font-bold">{gameScenarios.length}</span> scenarios captured
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
