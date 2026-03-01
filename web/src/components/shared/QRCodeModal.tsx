import { QRCodeSVG } from 'qrcode.react';

interface QRCodeModalProps {
  gameId: string;
  onClose: () => void;
}

/**
 * Shared modal for displaying a QR code to join a game.
 * Used in both LobbyView and ScenarioListView.
 */
export function QRCodeModal({ gameId, onClose }: QRCodeModalProps) {
  const joinUrl = `https://vsh.k61.dev/game/${gameId}`;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl p-6 max-w-sm w-full text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-gray-800 mb-2">Scan to Join</h2>
        <p className="text-gray-600 text-sm mb-4">
          Game Code: <span className="font-mono font-bold">{gameId}</span>
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
          onClick={onClose}
          className="mt-4 px-6 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg text-gray-700 font-medium transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
}
