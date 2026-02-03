import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCamera,
  faVideo,
  faDownload,
  faPlay,
  faTimes,
  faSpinner,
} from '@fortawesome/free-solid-svg-icons';
import type { MediaSubmission, Scenario, Team } from '../../types';

interface MediaModalProps {
  submission: MediaSubmission;
  scenario?: Scenario;
  team?: Team;
  gameCode?: string;
  showDownload?: boolean;
  onClose: () => void;
}

/**
 * Shared modal component for viewing photos and videos.
 * Used in both JudgingView and TeamGalleryView.
 */
export function MediaModal({
  submission,
  scenario,
  team,
  gameCode,
  showDownload = false,
  onClose,
}: MediaModalProps) {
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async () => {
    if (!submission.blobUrl) return;

    setIsDownloading(true);
    try {
      const ext = submission.mediaType === 'video' ? 'webm' : 'jpg';
      const scenarioName = scenario?.title.replace(/[^a-zA-Z0-9]/g, '_') || 'media';
      const filename = `${scenarioName}.${ext}`;

      // Use API proxy endpoint to trigger proper download with Content-Disposition
      // This bypasses CORS and works on both desktop and mobile
      if (gameCode) {
        const proxyUrl = `/api/games/${gameCode}/download?url=${encodeURIComponent(submission.blobUrl)}&filename=${encodeURIComponent(filename)}`;
        
        // Create a hidden link and click it to trigger download
        const a = document.createElement('a');
        a.href = proxyUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else {
        // Fallback: open in new tab
        window.open(submission.blobUrl, '_blank');
      }
    } catch (error) {
      console.error('Download failed:', error);
      window.open(submission.blobUrl, '_blank');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-3">
            {team && (
              <>
                <div
                  className="w-4 h-4 rounded-full"
                  style={{ backgroundColor: team.color }}
                />
                <span className="font-semibold">{team.name}</span>
                {scenario && <span className="text-gray-500">•</span>}
              </>
            )}
            {scenario && (
              <>
                <FontAwesomeIcon
                  icon={scenario.mediaType === 'video' ? faVideo : faCamera}
                  className={scenario.mediaType === 'video' ? 'text-red-500' : 'text-blue-500'}
                />
                <span className="text-gray-600">{scenario.title}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {showDownload && (
              <button
                onClick={handleDownload}
                disabled={isDownloading}
                className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white font-medium py-2 px-4 rounded-lg transition-colors"
              >
                <FontAwesomeIcon
                  icon={isDownloading ? faSpinner : faDownload}
                  className={isDownloading ? 'animate-spin' : ''}
                />
                {isDownloading ? 'Downloading...' : 'Download'}
              </button>
            )}
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 p-2"
            >
              <FontAwesomeIcon icon={faTimes} className="text-xl" />
            </button>
          </div>
        </div>

        {/* Media */}
        <div className="bg-black aspect-video flex items-center justify-center">
          {submission.mediaType === 'video' ? (
            <video
              src={submission.blobUrl}
              controls
              autoPlay
              className="w-full h-full object-contain"
            />
          ) : (
            <img
              src={submission.blobUrl}
              alt={scenario?.title || team?.name || 'Media'}
              className="w-full h-full object-contain"
            />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * A thumbnail component for displaying media in a grid.
 */
interface MediaThumbnailProps {
  submission?: MediaSubmission;
  placeholder?: 'video' | 'photo';
  onClick?: () => void;
  className?: string;
}

export function MediaThumbnail({
  submission,
  placeholder,
  onClick,
  className = '',
}: MediaThumbnailProps) {
  const hasMedia = !!submission?.blobUrl;
  const mediaType = submission?.mediaType || placeholder;

  return (
    <button
      onClick={onClick}
      disabled={!hasMedia}
      className={`w-full aspect-video bg-gray-200 relative group ${className}`}
    >
      {hasMedia ? (
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
              alt="Submission"
              className="w-full h-full object-cover"
            />
          )}
        </>
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <FontAwesomeIcon
            icon={mediaType === 'video' ? faVideo : faCamera}
            className="text-gray-300 text-3xl"
          />
        </div>
      )}
    </button>
  );
}
