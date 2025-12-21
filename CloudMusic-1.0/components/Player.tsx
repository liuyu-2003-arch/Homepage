import React, { useEffect, useRef, useState } from 'react';
import { Song } from '../types';
import { Play, Pause, SkipBack, SkipForward, Volume2, Maximize2 } from 'lucide-react';
import LyricsView from './LyricsView';

interface PlayerProps {
  currentSong: Song | null;
  onNext?: () => void;
  onPrev?: () => void;
  isLiked?: boolean;
  onLikeToggle?: () => void;
  isLyricsOpen: boolean;
  onSetLyricsOpen: (open: boolean) => void;
}

const Player: React.FC<PlayerProps> = ({ 
  currentSong, onNext, onPrev, isLiked, onLikeToggle,
  isLyricsOpen, onSetLyricsOpen
}) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(0.5);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    if (currentSong && audioRef.current) {
      if (currentSong.audioUrl) {
          audioRef.current.src = currentSong.audioUrl;
          audioRef.current.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
      } else {
        setIsPlaying(true);
        setDuration(180); // Mock duration for demo
      }
    }
  }, [currentSong]);

  const togglePlay = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!audioRef.current || !currentSong?.audioUrl) {
        setIsPlaying(!isPlaying);
        return;
    }
    isPlaying ? audioRef.current.pause() : audioRef.current.play();
    setIsPlaying(!isPlaying);
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
      setProgress((audioRef.current.currentTime / audioRef.current.duration) * 100);
      setDuration(audioRef.current.duration);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = (val / 100) * duration;
    } else {
      setProgress(val);
    }
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  if (!currentSong) return null;

  return (
    <>
      <div className={`h-[88px] bg-white/95 backdrop-blur-2xl border-t border-gray-200 fixed bottom-0 left-0 right-0 z-50 flex items-center px-4 md:px-6 shadow-lg transition-transform duration-500 ${isLyricsOpen ? 'translate-y-full' : 'translate-y-0'}`}>
        <audio ref={audioRef} onTimeUpdate={handleTimeUpdate} onEnded={() => setIsPlaying(false)} />
        
        {/* Track Info & Cover */}
        <div 
          onClick={() => onSetLyricsOpen(true)}
          className="flex items-center flex-1 md:w-1/4 min-w-0 group cursor-pointer active:scale-95 transition-transform duration-200"
        >
          <div className="h-12 w-12 rounded-lg overflow-hidden shadow-sm bg-gray-200 mr-3 flex-shrink-0 relative">
             <img src={currentSong.coverUrl} alt="Cover" className="h-full w-full object-cover" />
             <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                <Maximize2 size={16} className="text-white" />
             </div>
          </div>
          <div className="flex flex-col overflow-hidden min-w-0">
            <h4 className="text-sm font-semibold text-gray-900 truncate">{currentSong.title}</h4>
            <p className="text-xs text-gray-500 truncate">{currentSong.artist}</p>
          </div>
        </div>

        {/* Controls & Progress */}
        <div className="flex flex-col items-center justify-center flex-1 max-w-xl px-4">
          <div className="flex items-center space-x-6 mb-1">
            <button onClick={(e) => { e.stopPropagation(); onPrev?.(); }} className="text-gray-800 active:scale-90 transition-transform"><SkipBack size={22} fill="currentColor" /></button>
            <button onClick={togglePlay} className="h-10 w-10 bg-gray-200 rounded-full flex items-center justify-center active:scale-90 transition-transform">
              {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
            </button>
            <button onClick={(e) => { e.stopPropagation(); onNext?.(); }} className="text-gray-800 active:scale-90 transition-transform"><SkipForward size={22} fill="currentColor" /></button>
          </div>
          
          {/* Timeline Section */}
          <div className="w-full flex items-center space-x-3">
            <span className="text-[10px] font-medium text-gray-400 w-8 text-right tabular-nums">{formatTime(currentTime)}</span>
            <div className="flex-1 relative h-6 flex items-center group">
              {/* Visual Progress Bar */}
              <div className="w-full h-1 bg-gray-200 rounded-full overflow-hidden relative">
                <div 
                  className="h-full bg-apple-accent transition-all duration-100" 
                  style={{ width: `${progress}%` }} 
                />
              </div>
              {/* Interactive Range Input */}
              <input 
                type="range" 
                min="0" 
                max="100" 
                step="0.1"
                value={progress} 
                onChange={handleSeek}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              />
              {/* Knob on Hover */}
              <div 
                className="absolute w-3 h-3 bg-white border border-gray-300 rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                style={{ left: `calc(${progress}% - 6px)` }}
              />
            </div>
            <span className="text-[10px] font-medium text-gray-400 w-8 tabular-nums">{formatTime(duration)}</span>
          </div>
        </div>

        {/* Lyrics Toggle Button */}
        <div className="flex items-center justify-end md:w-1/4">
          <button 
            onClick={(e) => { e.stopPropagation(); onSetLyricsOpen(true); }}
            className="text-[10px] border border-gray-300 px-3 py-1.5 rounded-full font-bold hover:bg-gray-50 active:scale-95 transition-all text-gray-600 tracking-tight"
          >
            LYRICS
          </button>
        </div>
      </div>

      {isLyricsOpen && (
        <LyricsView 
          song={currentSong}
          currentTime={currentTime}
          duration={duration || 180}
          isPlaying={isPlaying}
          onPlayPause={() => togglePlay()}
          onNext={() => onNext?.()}
          onPrev={() => onPrev?.()}
          volume={volume}
          onVolumeChange={setVolume}
          onClose={() => onSetLyricsOpen(false)}
          onSeek={(t) => {
             if(audioRef.current) audioRef.current.currentTime = t;
             else setCurrentTime(t);
          }}
          isLiked={isLiked}
          onLikeToggle={onLikeToggle}
        />
      )}
    </>
  );
};

export default Player;