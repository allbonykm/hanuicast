import React, { useState, useEffect, useCallback } from 'react';
import { Paper, LoadingState } from './types';
import { fetchPapers, generatePaperAudio } from './services/geminiService';
import { PaperCard } from './components/PaperCard';
import { AudioPlayer } from './components/AudioPlayer';

type Tab = 'discover' | 'saved';

// Filter options
const FILTERS = ["전체", "KCI", "OASIS", "PubMed"];

const App: React.FC = () => {
  const [papers, setPapers] = useState<Paper[]>([]);
  // Initialize saved papers from localStorage
  const [savedPapers, setSavedPapers] = useState<Paper[]>(() => {
    try {
      const saved = localStorage.getItem('hanui_saved_papers');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });
  
  const [loadingState, setLoadingState] = useState<LoadingState>(LoadingState.IDLE);
  const [currentPaper, setCurrentPaper] = useState<Paper | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioLoading, setAudioLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('discover');
  const [activeFilter, setActiveFilter] = useState<string>("전체");
  
  // Cache for generated audio URLs to avoid re-generating
  const [audioCache, setAudioCache] = useState<Record<string, string>>({});

  const loadPapers = async (topic?: string) => {
    setLoadingState(LoadingState.LOADING);
    const data = await fetchPapers(topic);
    setPapers(data);
    setLoadingState(LoadingState.SUCCESS);
  };

  useEffect(() => {
    // Initial load
    loadPapers();
  }, []);

  // Save to localStorage whenever savedPapers changes
  useEffect(() => {
    localStorage.setItem('hanui_saved_papers', JSON.stringify(savedPapers));
  }, [savedPapers]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setActiveTab('discover'); // Switch to discover tab on search
    loadPapers(searchQuery);
  };

  const handleToggleSave = (paper: Paper) => {
    setSavedPapers(prev => {
      const isAlreadySaved = prev.some(p => p.id === paper.id);
      if (isAlreadySaved) {
        return prev.filter(p => p.id !== paper.id);
      } else {
        return [paper, ...prev];
      }
    });
  };

  const handlePlay = useCallback(async (paper: Paper) => {
    // If clicking the same paper
    if (currentPaper?.id === paper.id) {
      setIsPlaying(!isPlaying);
      return;
    }

    // New paper selected
    setIsPlaying(false); // Stop current
    setCurrentPaper(paper);
    
    // Check cache
    if (audioCache[paper.id]) {
      setAudioUrl(audioCache[paper.id]);
      setAudioLoading(false);
      setIsPlaying(true);
      return;
    }

    // Generate new audio
    setAudioLoading(true);
    setAudioUrl(null); // Reset URL while loading

    // Construct text to speak: Title + Summary
    const textToSpeak = `논문 제목: ${paper.title}. 요약: ${paper.summary}`;
    
    const url = await generatePaperAudio(textToSpeak);
    
    if (url) {
      setAudioCache(prev => ({ ...prev, [paper.id]: url }));
      setAudioUrl(url);
      setIsPlaying(true);
    }
    setAudioLoading(false);

  }, [currentPaper, isPlaying, audioCache]);

  const handleAudioEnded = useCallback(() => {
    setIsPlaying(false);
  }, []);

  // Filter papers logic
  const getFilteredPapers = (list: Paper[]) => {
    if (activeFilter === "전체") return list;
    return list.filter(p => p.journal.includes(activeFilter));
  };

  // Determine which list to show
  const baseList = activeTab === 'discover' ? papers : savedPapers;
  const displayPapers = getFilteredPapers(baseList);

  return (
    <div className="min-h-screen pb-32 max-w-md mx-auto bg-slate-50 relative shadow-2xl flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight cursor-pointer" onClick={() => { setSearchQuery(''); loadPapers(); }}>HanuiCast</h1>
            <p className="text-xs text-slate-500 font-medium">{new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
          </div>
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
             <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
          </div>
        </div>

        {/* Search Bar (Only visible in Discover tab) */}
        {activeTab === 'discover' && (
          <div className="px-4 pb-2">
            <form onSubmit={handleSearch} className="relative">
              <input 
                type="text" 
                placeholder="관심 키워드 검색 (예: 당뇨, 추나)" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-100 text-slate-800 placeholder-slate-400 border-none rounded-xl py-3 pl-4 pr-10 focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-sm font-medium"
              />
              <button 
                type="submit"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-slate-400 hover:text-blue-600 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </button>
            </form>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex px-4 pb-0 space-x-6 border-t border-slate-100 mt-2 pt-1">
          <button
            onClick={() => setActiveTab('discover')}
            className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'discover' 
                ? 'border-blue-600 text-blue-600' 
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            탐색 (Discover)
          </button>
          <button
            onClick={() => setActiveTab('saved')}
            className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'saved' 
                ? 'border-blue-600 text-blue-600' 
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            보관함 ({savedPapers.length})
          </button>
        </div>
        
        {/* Filters Scroll View */}
        <div className="px-4 py-3 flex gap-2 overflow-x-auto no-scrollbar border-t border-slate-50 bg-slate-50/50">
          {FILTERS.map((filter) => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={`
                whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium transition-all
                ${activeFilter === filter 
                  ? 'bg-blue-600 text-white shadow-sm' 
                  : 'bg-white text-slate-600 border border-slate-200 hover:border-blue-300'
                }
              `}
            >
              {filter}
            </button>
          ))}
        </div>
      </header>

      {/* Main Content */}
      <main className="p-4 space-y-4 flex-1">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
            {activeTab === 'discover' 
              ? (searchQuery ? `"${searchQuery}" 관련 논문` : "Today's Briefing")
              : "Saved Papers"
            }
            {activeFilter !== "전체" && <span className="text-blue-500 font-normal normal-case text-xs">({activeFilter})</span>}
          </h2>
          {activeTab === 'discover' && loadingState === LoadingState.LOADING && (
             <span className="text-xs text-blue-600 animate-pulse font-medium">AI 검색 중...</span>
          )}
        </div>

        {activeTab === 'discover' && loadingState === LoadingState.LOADING && displayPapers.length === 0 ? (
          // Skeletons
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="animate-pulse bg-white p-5 rounded-xl border border-slate-100 h-48">
              <div className="h-4 bg-slate-200 rounded w-1/4 mb-4"></div>
              <div className="h-6 bg-slate-200 rounded w-3/4 mb-4"></div>
              <div className="h-4 bg-slate-200 rounded w-full mb-2"></div>
              <div className="h-4 bg-slate-200 rounded w-5/6"></div>
            </div>
          ))
        ) : (
          displayPapers.map((paper) => (
            <PaperCard
              key={paper.id}
              paper={paper}
              isActive={currentPaper?.id === paper.id}
              isPlaying={isPlaying && currentPaper?.id === paper.id}
              isSaved={savedPapers.some(p => p.id === paper.id)}
              onPlay={handlePlay}
              onToggleSave={handleToggleSave}
            />
          ))
        )}
        
        {/* Empty States */}
        {activeTab === 'discover' && loadingState === LoadingState.SUCCESS && displayPapers.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
             <p>조건에 맞는 논문이 없습니다.</p>
          </div>
        )}

        {activeTab === 'saved' && savedPapers.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 space-y-4">
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center">
              <svg className="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </div>
            <p className="text-sm">아직 저장된 논문이 없습니다.<br/>마음에 드는 논문의 하트 버튼을 눌러보세요.</p>
          </div>
        )}
        
        <div className="h-8"></div> {/* Spacer */}
      </main>

      {/* Sticky Player */}
      <div className={`transition-transform duration-500 ease-in-out ${currentPaper ? 'translate-y-0' : 'translate-y-full'}`}>
        <AudioPlayer 
          currentPaper={currentPaper}
          audioUrl={audioUrl}
          isPlaying={isPlaying}
          isLoading={audioLoading}
          onTogglePlay={() => setIsPlaying(!isPlaying)}
          onEnded={handleAudioEnded}
        />
      </div>
    </div>
  );
};

export default App;