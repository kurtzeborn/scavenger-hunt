import { useState, useRef, useCallback, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCamera,
  faVideo,
  faRotate,
  faCheck,
  faSpinner,
  faArrowLeft,
  faStop,
  faUpload,
} from '@fortawesome/free-solid-svg-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { uploadMedia } from '../../api';
import { usePlayerSession } from '../../contexts/PlayerSessionContext';
import type { Game, Scenario } from '../../types';

interface MediaCaptureProps {
  game: Game;
  scenario: Scenario;
  onComplete: () => void;
  onCancel: () => void;
}

type CaptureState = 'preview' | 'recording' | 'recorded' | 'uploading' | 'done';

const MAX_VIDEO_DURATION = 30; // seconds

export function MediaCapture({ game, scenario, onComplete, onCancel }: MediaCaptureProps) {
  const { session } = usePlayerSession();
  const queryClient = useQueryClient();
  
  const [captureState, setCaptureState] = useState<CaptureState>('preview');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [mediaBlob, setMediaBlob] = useState<Blob | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [cameraRestartKey, setCameraRestartKey] = useState(0); // Used to force camera restart

  const videoRef = useRef<HTMLVideoElement>(null);
  const playbackVideoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const isVideo = scenario.mediaType === 'video';

  // When mediaUrl changes and we have a recorded video, ensure playback starts
  useEffect(() => {
    if (captureState === 'recorded' && mediaUrl && isVideo && playbackVideoRef.current) {
      const video = playbackVideoRef.current;
      video.load();
      video.play().catch(err => console.log('Autoplay prevented:', err));
    }
  }, [captureState, mediaUrl, isVideo]);

  // Initialize camera when facing mode changes or restart is requested
  useEffect(() => {
    let currentStream: MediaStream | null = null;

    const initCamera = async () => {
      try {
        setError(null);
        const constraints: MediaStreamConstraints = {
          video: {
            facingMode: facingMode,
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: isVideo,
        };

        const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        currentStream = mediaStream;
        setStream(mediaStream);
        
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      } catch (err) {
        console.error('Camera error:', err);
        setError('Could not access camera. Please grant permission and try again.');
      }
    };

    initCamera();

    return () => {
      // Clean up the stream that was created in this effect
      if (currentStream) {
        currentStream.getTracks().forEach((track) => track.stop());
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [facingMode, isVideo, cameraRestartKey]);

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  }, [stream]);

  const toggleCamera = () => {
    stopCamera();
    setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'));
  };

  // Stop Recording - declared before startRecording so it can be referenced
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Video Recording
  const startRecording = useCallback(() => {
    if (!stream) return;

    chunksRef.current = [];
    setRecordingTime(0);
    setCaptureState('recording');

    const options = { mimeType: 'video/webm;codecs=vp8,opus' };
    let mediaRecorder: MediaRecorder;
    
    try {
      mediaRecorder = new MediaRecorder(stream, options);
    } catch {
      // Fallback for Safari
      mediaRecorder = new MediaRecorder(stream);
    }

    mediaRecorderRef.current = mediaRecorder;

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    mediaRecorder.onerror = (event) => {
      console.error('MediaRecorder error:', event);
      setError('Recording failed. Please try again.');
      setCaptureState('preview');
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      setMediaBlob(blob);
      setMediaUrl(url);
      setCaptureState('recorded');
      // Stop the camera stream after state is set so the recorded video can be shown
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        setStream(null);
      }
    };

    mediaRecorder.start(100); // Collect data every 100ms

    // Start timer
    timerRef.current = window.setInterval(() => {
      setRecordingTime((prev) => {
        if (prev >= MAX_VIDEO_DURATION - 1) {
          stopRecording();
          return MAX_VIDEO_DURATION;
        }
        return prev + 1;
      });
    }, 1000);
  }, [stream, stopRecording]);

  // Photo Capture
  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    canvas.toBlob((blob) => {
      if (blob) {
        setMediaBlob(blob);
        setMediaUrl(URL.createObjectURL(blob));
        setCaptureState('recorded');
      }
    }, 'image/jpeg', 0.9);
  }, []);

  // Reset to preview and restart camera
  const retake = useCallback(() => {
    if (mediaUrl) {
      URL.revokeObjectURL(mediaUrl);
    }
    setMediaBlob(null);
    setMediaUrl(null);
    setRecordingTime(0);
    setCaptureState('preview');
    // Increment restart key to trigger camera useEffect
    setCameraRestartKey(prev => prev + 1);
  }, [mediaUrl]);

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!mediaBlob) {
        throw new Error('No media to upload');
      }
      
      if (!session) {
        throw new Error('No player session - please rejoin the game');
      }
      
      if (!session.teamId || !session.playerId) {
        throw new Error('Invalid session - please rejoin the game');
      }

      setCaptureState('uploading');

      // Upload directly to Function App (which saves to blob storage)
      await uploadMedia(game.id, {
        teamId: session.teamId,
        scenarioId: scenario.id,
        mediaType: scenario.mediaType,
        playerId: session.playerId,
        durationSeconds: isVideo ? recordingTime : undefined,
      }, mediaBlob);

      return true;
    },
    onSuccess: () => {
      setCaptureState('done');
      queryClient.invalidateQueries({ queryKey: ['teams', game.id] });
      // Short delay to show success state
      setTimeout(() => {
        onComplete();
      }, 1000);
    },
    onError: (err: Error) => {
      setError(err.message || 'Failed to upload. Please try again.');
      setCaptureState('recorded');
    },
  });

  // Cleanup media URL on unmount
  useEffect(() => {
    return () => {
      if (mediaUrl) {
        URL.revokeObjectURL(mediaUrl);
      }
    };
  }, [mediaUrl]);

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col overflow-hidden">
      {/* Header - fixed height */}
      <header className="flex-shrink-0 bg-black/80 text-white p-4 flex items-center justify-between">
        <button
          onClick={onCancel}
          className="p-2 hover:bg-white/10 rounded-lg transition-colors"
        >
          <FontAwesomeIcon icon={faArrowLeft} className="text-xl" />
        </button>
        
        <div className="text-center flex-1">
          <p className="text-sm text-gray-400">{scenario.title}</p>
          <p className="text-xs text-gray-500">
            {isVideo ? 'Record a video (max 30s)' : 'Take a photo'}
          </p>
        </div>

        <div className="w-10" /> {/* Spacer for alignment */}
      </header>

      {/* Camera Preview / Recorded Preview - takes remaining space */}
      <div className="flex-1 min-h-0 relative bg-black flex items-center justify-center">
        {captureState === 'preview' || captureState === 'recording' ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            disablePictureInPicture
            controlsList="nodownload nofullscreen noremoteplayback"
            className="max-w-full max-h-full object-contain"
          />
        ) : mediaUrl && (
          isVideo ? (
            <video
              ref={playbackVideoRef}
              key={mediaUrl}
              src={mediaUrl}
              controls
              autoPlay
              loop
              playsInline
              disablePictureInPicture
              controlsList="nodownload nofullscreen noremoteplayback"
              className="max-w-full max-h-full object-contain"
              onLoadedData={(e) => {
                // Set volume to 50%
                (e.target as HTMLVideoElement).volume = 0.5;
              }}
              onError={(e) => console.error('Video playback error:', e)}
            />
          ) : (
            <img
              src={mediaUrl}
              alt="Captured"
              className="max-w-full max-h-full object-contain"
            />
          )
        )}

        {/* Hidden canvas for photo capture */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Recording Timer */}
        {captureState === 'recording' && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-600 px-4 py-2 rounded-full flex items-center gap-2">
            <span className="w-3 h-3 bg-white rounded-full animate-pulse" />
            <span className="font-mono text-white text-lg">
              {recordingTime.toString().padStart(2, '0')}s / {MAX_VIDEO_DURATION}s
            </span>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="absolute bottom-20 left-4 right-4 bg-red-600 text-white p-4 rounded-lg text-center">
            {error}
          </div>
        )}

        {/* Upload Progress */}
        {captureState === 'uploading' && (
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
            <div className="text-center text-white">
              <FontAwesomeIcon icon={faSpinner} className="text-4xl animate-spin mb-4" />
              <p className="text-lg">Uploading...</p>
            </div>
          </div>
        )}

        {/* Success State */}
        {captureState === 'done' && (
          <div className="absolute inset-0 bg-green-600/90 flex items-center justify-center">
            <div className="text-center text-white">
              <FontAwesomeIcon icon={faCheck} className="text-6xl mb-4" />
              <p className="text-2xl font-bold">Uploaded!</p>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="bg-black/80 p-4 safe-area-bottom">
        {(captureState === 'preview' || captureState === 'recording') && (
          <div className="flex items-center justify-center gap-8">
            {/* Flip Camera */}
            <button
              onClick={toggleCamera}
              disabled={captureState === 'recording'}
              className="p-4 bg-white/10 hover:bg-white/20 disabled:opacity-50 rounded-full transition-colors"
            >
              <FontAwesomeIcon icon={faRotate} className="text-white text-xl" />
            </button>

            {/* Capture/Record Button */}
            {isVideo ? (
              captureState === 'recording' ? (
                <button
                  onClick={stopRecording}
                  className="w-20 h-20 bg-red-600 hover:bg-red-700 rounded-full flex items-center justify-center transition-colors"
                >
                  <FontAwesomeIcon icon={faStop} className="text-white text-3xl" />
                </button>
              ) : (
                <button
                  onClick={startRecording}
                  disabled={!stream}
                  className="w-20 h-20 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 rounded-full flex items-center justify-center transition-colors"
                >
                  <FontAwesomeIcon icon={faVideo} className="text-white text-3xl" />
                </button>
              )
            ) : (
              <button
                onClick={capturePhoto}
                disabled={!stream}
                className="w-20 h-20 bg-white hover:bg-gray-200 disabled:bg-gray-600 rounded-full flex items-center justify-center transition-colors"
              >
                <FontAwesomeIcon icon={faCamera} className="text-gray-800 text-3xl" />
              </button>
            )}

            {/* Placeholder for alignment */}
            <div className="w-14" />
          </div>
        )}

        {captureState === 'recorded' && (
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={retake}
              className="flex-1 max-w-xs bg-gray-600 hover:bg-gray-700 text-white font-semibold py-4 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <FontAwesomeIcon icon={faRotate} />
              Retake
            </button>
            <button
              onClick={() => uploadMutation.mutate()}
              disabled={uploadMutation.isPending}
              className="flex-1 max-w-xs bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white font-semibold py-4 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <FontAwesomeIcon icon={faUpload} />
              Use This
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
