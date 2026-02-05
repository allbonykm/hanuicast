import React from 'react';
import { Paper } from '../types';

interface PaperCardProps {
  paper: Paper;
  isActive: boolean;
  isPlaying: boolean;
  isSaved: boolean;
  onPlay: (paper: Paper) => void;
  onToggleSave: (paper: Paper) => void;
}

export const PaperCard: React.FC<PaperCardProps> = ({ 
  paper, 
  isActive, 
  isPlaying, 
  isSaved,
  onPlay, 
  onToggleSave 
}) => {
  return (
    <div 
      className={`
        relative overflow-hidden rounded-xl border transition-all duration-300
        ${isActive 
          ? 'bg-blue-50 border-blue-200 shadow-md scale-[1.01]' 
          : 'bg-white border-slate-100 shadow-sm hover:shadow-md hover:border-blue-100'
        }
      `}
    >
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">
                  {paper.journal}
                </span>
                <span className="text-xs text-slate-400">{paper.date}</span>
              </div>
              
              {/* Save Button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSave(paper);
                }}
                className={`
                  p-2 -mr-2 -mt-2 rounded-full transition-colors
                  ${isSaved ? 'text-pink-500 bg-pink-50' : 'text-slate-300 hover:text-pink-400 hover:bg-slate-50'}
                `}
                aria-label={isSaved ? "Remove from saved" : "Save paper"}
              >
                <svg className="w-5 h-5" fill={isSaved ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
              </button>
            </div>
            
            <h3 className={`font-bold text-lg mb-2 leading-tight ${isActive ? 'text-blue-900' : 'text-slate-800'}`}>
              {paper.title}
            </h3>
            
            <p className="text-sm text-slate-600 mb-4 leading-relaxed line-clamp-3">
              {paper.summary}
            </p>

            <div className="flex flex-wrap gap-2 mb-4">
              {paper.keywords.map((keyword, idx) => (
                <span key={idx} className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded-md">
                  #{keyword}
                </span>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => onPlay(paper)}
                className={`
                  flex items-center justify-center w-10 h-10 rounded-full transition-colors
                  ${isActive 
                    ? 'bg-blue-600 text-white shadow-blue-200' 
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }
                `}
                aria-label={isActive && isPlaying ? "Pause" : "Play"}
              >
                {isActive && isPlaying ? (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
                  </svg>
                ) : (
                  <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                )}
              </button>
              
              <a 
                href={paper.originalUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-xs font-medium text-slate-500 hover:text-blue-600 transition-colors flex items-center gap-1"
              >
                원문 보기
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};