import React, { useEffect, useRef, useState } from 'react';
import { Paper } from '../types';

interface AudioPlayerProps {
  currentPaper: Paper | null;
  audioUrl: string | null;
  isPlaying: boolean;
  isLoading: boolean;
  onTogglePlay: () => void;
  onEnded: () => void;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({
  currentPaper,
  audioUrl,
  isPlaying,
  isLoading,
  onTogglePlay,
  onEnded
}) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.play().catch(e => console.warn("Playback prevented", e));
      } else {
        audioRef.current.pause();
      }
    }
  }, [isPlaying, audioUrl]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => setProgress(audio.currentTime);
    const updateDuration = () => setDuration(audio.duration);

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('ended', onEnded);
    };
  }, [onEnded]);

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (audioRef.current) {
      const time = Number(e.target.value);
      audioRef.current.currentTime = time;
      setProgress(time);
    }
  };

  const handleSkip = (seconds: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.min(Math.max(audioRef.current.currentTime + seconds, 0), duration);
      setProgress(audioRef.current.currentTime);
    }
  };

  const formatTime = (time: number) => {
    if (isNaN(time)) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  if (!currentPaper) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-slate-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] pb-safe-area">
      {/* Progress Bar - Top of player */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-slate-100">
         <div 
           className="h-full bg-blue-600 transition-all duration-100 ease-linear"
           style={{ width: `${(progress / (duration || 1)) * 100}%` }}
         />
      </div>

      <div className="max-w-md mx-auto px-4 py-3">
        {/* Hidden Audio Element */}
        {audioUrl && (
          <audio ref={audioRef} src={audioUrl} />
        )}

        <div className="flex items-center gap-4">
          {/* Controls */}
          <div className="flex items-center gap-2">
            {/* Rewind 15s */}
            <button
              onClick={() => handleSkip(-15)}
              className="p-2 text-slate-400 hover:text-blue-600 transition-colors"
              aria-label="Rewind 15 seconds"
              disabled={isLoading}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12.066 11.2a1 1 0 100 1.6 1 1 0 000-1.6zm-4.949 1.156a4.004 4.004 0 115.326 3.61M3 15h2.553M10.5 12.5l-2-2" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 8a.5.5 0 01.5.5v2.5" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 11h2" />
              </svg>
            </button>

            {/* Play/Pause Button */}
            <button
              onClick={onTogglePlay}
              disabled={isLoading}
              className={`
                flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center transition-all
                ${isLoading 
                  ? 'bg-slate-100 text-slate-400 cursor-wait' 
                  : 'bg-blue-600 text-white shadow-lg shadow-blue-200 hover:bg-blue-700 hover:scale-105 active:scale-95'
                }
              `}
            >
              {isLoading ? (
                <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : isPlaying ? (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
                </svg>
              ) : (
                <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              )}
            </button>

            {/* Forward 15s */}
            <button
              onClick={() => handleSkip(15)}
              className="p-2 text-slate-400 hover:text-blue-600 transition-colors"
              aria-label="Forward 15 seconds"
              disabled={isLoading}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.934 11.2a1 1 0 110 1.6 1 1 0 010-1.6zm4.949 1.156a4.004 4.004 0 10-5.326 3.61M21 15h-2.553M13.5 12.5l2-2" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 8a.5.5 0 01.5.5v2.5" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11h2" />
              </svg>
            </button>
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-bold text-slate-900 truncate">
              {currentPaper.title}
            </h4>
            <div className="flex items-center justify-between text-xs text-slate-500 mt-0.5">
              <span className="truncate max-w-[150px]">{currentPaper.authors}</span>
              <span className="font-mono tabular-nums">{formatTime(progress)} / {formatTime(duration)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};