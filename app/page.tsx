'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, SkipForward, SkipBack, Heart, Search, BookOpen, Clock, Music, X, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';

interface Paper {
    id: string;
    title: string;
    authors: string;
    journal: string;
    date: string;
    abstract: string;
    tags: string[];
    originalUrl: string;
    type?: string;
    audioUrl?: string;
    summaryScript?: string;
}

type SearchMode = 'clinical' | 'evidence' | 'latest' | 'general';

// Helper function to format seconds to MM:SS
const formatTime = (seconds: number): string => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export default function Home() {
    const [papers, setPapers] = useState<Paper[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentPaper, setCurrentPaper] = useState<Paper | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchMode, setSearchMode] = useState<SearchMode>('general');
    const [expandedPaperId, setExpandedPaperId] = useState<string | null>(null);
    const [interestKeywords, setInterestKeywords] = useState<string[]>([]);
    const [isInitialLoading, setIsInitialLoading] = useState(true);
    const [isMounted, setIsMounted] = useState(false);
    const [showMiniPlayer, setShowMiniPlayer] = useState(false);
    const [audioProgress, setAudioProgress] = useState({ currentTime: 0, duration: 0 });

    const audioRef = useRef<HTMLAudioElement | null>(null);
    const inlinePlayerRef = useRef<HTMLDivElement | null>(null);

    // Prevent hydration mismatch
    useEffect(() => {
        setIsMounted(true);
    }, []);

    // Intersection Observer for mini player
    useEffect(() => {
        if (!inlinePlayerRef.current || !currentPaper) {
            setShowMiniPlayer(false);
            return;
        }

        const observer = new IntersectionObserver(
            ([entry]) => {
                setShowMiniPlayer(!entry.isIntersecting && isPlaying);
            },
            { threshold: 0.1 }
        );

        observer.observe(inlinePlayerRef.current);
        return () => observer.disconnect();
    }, [currentPaper, isPlaying]);

    // Initial load: keywords from Supabase
    useEffect(() => {
        const loadInitialData = async () => {
            setIsInitialLoading(true);
            try {
                // Fetch keywords from user_settings table
                const { data, error } = await supabase
                    .from('user_settings')
                    .select('value')
                    .eq('key', 'interestKeywords')
                    .single();

                let ks = ['Acupuncture', '한의학']; // Default

                if (data && data.value) {
                    ks = data.value;
                } else if (error) {
                    console.error('Error fetching keywords from Supabase:', error);
                }

                setInterestKeywords(ks);
                await fetchDailyCuration(ks);
            } catch (err) {
                console.error('Initial Load Error:', err);
            } finally {
                setIsInitialLoading(false);
                setLoading(false);
            }
        };

        loadInitialData();
    }, []);

    const fetchDailyCuration = async (keywords: string[]) => {
        setIsInitialLoading(true);
        try {
            // Fetch papers for each keyword and merge
            const allPapers: Paper[] = [];
            for (const k of keywords) {
                const res = await fetch(`/api/papers?q=${encodeURIComponent(k)}&mode=${searchMode}`);
                const data = await res.json();
                if (data.papers) {
                    // Add only unique papers
                    data.papers.forEach((p: Paper) => {
                        if (!allPapers.find(ap => ap.id === p.id)) {
                            allPapers.push(p);
                        }
                    });
                }
            }
            // Sort by date (desc) to show latest first
            allPapers.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            setPapers(allPapers.slice(0, 20)); // Top 20 latest
        } catch (err) {
            console.error('Curation Error:', err);
        } finally {
            setIsInitialLoading(false);
            setLoading(false);
        }
    };

    const fetchPapers = async (q = '', mode = searchMode) => {
        setLoading(true);
        try {
            const res = await fetch(`/api/papers?q=${encodeURIComponent(q)}&mode=${mode}`);
            const data = await res.json();
            setPapers(data.papers);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const updateKeywordsInDb = async (newKs: string[]) => {
        try {
            const { error } = await supabase
                .from('user_settings')
                .upsert({ key: 'interestKeywords', value: newKs }, { onConflict: 'key' });

            if (error) throw error;
        } catch (err) {
            console.error('Failed to update keywords in Supabase:', err);
        }
    };

    const addKeyword = async (k: string) => {
        if (!k || interestKeywords.includes(k)) return;
        const newKs = [...interestKeywords, k];
        setInterestKeywords(newKs);
        // Save to Supabase (Background)
        updateKeywordsInDb(newKs);
        fetchDailyCuration(newKs);
    };

    const removeKeyword = async (k: string) => {
        const newKs = interestKeywords.filter(item => item !== k);
        setInterestKeywords(newKs);
        // Save to Supabase (Background)
        updateKeywordsInDb(newKs);
        fetchDailyCuration(newKs);
    };

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        if (searchQuery.trim()) {
            addKeyword(searchQuery.trim());
            fetchPapers(searchQuery, searchMode);
        }
    };

    const handleModeChange = (mode: SearchMode) => {
        setSearchMode(mode);
        if (searchQuery.trim()) {
            fetchPapers(searchQuery.trim(), mode);
        } else if (interestKeywords.length > 0) {
            // Re-fetch curation with new mode
            fetchDailyCuration(interestKeywords);
        }
    };

    const [statusMessage, setStatusMessage] = useState('');

    const startPodcast = async (paper: Paper) => {
        if (currentPaper?.id === paper.id) {
            if (isPlaying) {
                audioRef.current?.pause();
                setIsPlaying(false);
            } else if (currentPaper.audioUrl) {
                audioRef.current?.play();
                setIsPlaying(true);
            }
            return;
        }

        setCurrentPaper(paper);
        setIsPlaying(false);

        // If audio already exists, just play it
        if (paper.audioUrl) {
            setIsPlaying(true);
            return;
        }

        // Generate Podcast script and audio
        setIsGenerating(true);
        setStatusMessage('AI가 논문 요약 중...'); // Initial status

        try {
            console.log('Starting generation for:', paper.title);

            // 1. Summarize
            console.log('Calling /api/summarize...');
            const sumRes = await fetch('/api/summarize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: paper.title, abstract: paper.abstract })
            });

            if (!sumRes.ok) {
                const errData = await sumRes.json().catch(() => ({ error: 'Summary API Error' }));
                throw new Error(`요약 생성 실패: ${errData.error || sumRes.statusText}`);
            }
            const { script } = await sumRes.json();
            console.log('Summary received:', script?.substring(0, 50) + '...');

            // 2. TTS & Save
            setStatusMessage('오디오 클립 생성 중...'); // Update status
            console.log('Calling /api/tts...');

            const ttsRes = await fetch('/api/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    paperId: paper.id,
                    title: paper.title,
                    journal: paper.journal,
                    authors: paper.authors,
                    abstract: paper.abstract,
                    tags: paper.tags,
                    originalUrl: paper.originalUrl,
                    script
                })
            });

            if (!ttsRes.ok) {
                const errData = await ttsRes.json().catch(() => ({ error: 'TTS API Error' }));
                throw new Error(`오디오 생성 실패: ${errData.error || ttsRes.statusText}`);
            }
            const { audioUrl } = await ttsRes.json();
            console.log('Audio URL received:', audioUrl);

            // Update paper with audio URL
            const updatedPaper = { ...paper, audioUrl, summaryScript: script };
            setCurrentPaper(updatedPaper);
            setPapers(prev => prev.map(p => p.id === paper.id ? updatedPaper : p));
            setIsPlaying(true);
        } catch (err: any) {
            console.error('Podcast Generation Error:', err);
            alert(`오류 발생: ${err.message}`);
        } finally {
            setIsGenerating(false);
            setStatusMessage('');
        }
    };

    // Prevent hydration mismatch by only rendering after mount
    if (!isMounted) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-slate-500">Loading...</p>
                </div>
            </div>
        );
    }

    return (
        <div
            className="min-h-screen bg-slate-50 flex flex-col max-w-lg mx-auto shadow-2xl overflow-hidden font-sans"
        >
            {/* Header */}
            <header className="bg-white/80 backdrop-blur-md p-6 sticky top-0 z-10 border-b border-slate-100">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h1 className="text-3xl font-black text-slate-900 tracking-tight">Morning Article</h1>
                        <p className="text-sm font-semibold text-blue-600 uppercase tracking-widest mt-1">Medical insight assistant</p>
                    </div>
                    <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg rotate-3">
                        <Music size={24} />
                    </div>
                </div>

                <form onSubmit={handleSearch} className="relative group mb-4">
                    <input
                        type="text"
                        placeholder="원장님, 관심 있는 키워드를 입력하세요..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-slate-100 border-2 border-transparent focus:border-blue-500 focus:bg-white rounded-2xl py-4 pl-12 pr-4 outline-none transition-all text-slate-800 placeholder-slate-400 font-medium shadow-sm"
                    />
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={20} />
                </form>

                <div className="flex flex-wrap gap-2 items-center">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mr-1">나의 관심사:</span>
                    {interestKeywords.map(k => (
                        <motion.span
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            key={k}
                            className="inline-flex items-center gap-1 px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-xs font-bold border border-blue-100 cursor-default group"
                        >
                            {k}
                            <button
                                onClick={() => removeKeyword(k)}
                                className="hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                            >
                                <X size={10} />
                            </button>
                        </motion.span>
                    ))}
                    {interestKeywords.length === 0 && (
                        <span className="text-xs text-slate-300 italic">키워드를 추가하여 맞춤 브리핑을 받으세요.</span>
                    )}
                </div>

                {/* Mode Selector */}
                <div className="mt-6 flex flex-wrap gap-2">
                    {[
                        { id: 'general', label: '전격', icon: '🔍' },
                        { id: 'clinical', label: '임상', icon: '🏥' },
                        { id: 'evidence', label: '근거', icon: '📊' },
                        { id: 'latest', label: '최신', icon: '🆕' }
                    ].map((mode) => (
                        <button
                            key={mode.id}
                            onClick={() => handleModeChange(mode.id as SearchMode)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-bold whitespace-nowrap transition-all border-2 ${searchMode === mode.id
                                ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200'
                                : 'bg-slate-50 border-slate-100 text-slate-600 hover:border-slate-300'
                                }`}
                        >
                            <span>{mode.icon}</span>
                            {mode.label}
                        </button>
                    ))}
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto p-6 space-y-8 no-scrollbar">
                {/* Featured Section */}
                <section>
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                            <BookOpen size={22} className="text-blue-600" />
                            원장님 맞춤 최신 브리핑
                        </h2>
                        <span className="text-[10px] font-black text-blue-500 bg-blue-50 px-3 py-1 rounded-full uppercase tracking-tighter animate-pulse">Daily Update</span>
                    </div>

                    <div className="space-y-4">
                        {loading ? (
                            [1, 2].map(i => (
                                <div key={i} className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 animate-pulse h-48"></div>
                            ))
                        ) : papers.length > 0 ? (
                            papers.map((paper: Paper) => (
                                <motion.div
                                    key={paper.id}
                                    layout
                                    className={`bg-white rounded-3xl overflow-hidden shadow-sm border-2 transition-all ${expandedPaperId === paper.id ? 'border-blue-500 ring-4 ring-blue-50' : 'border-slate-100 hover:border-slate-200'}`}
                                >
                                    {/* Main Card Area - Click Title to Expand */}
                                    <div
                                        className="p-6 cursor-pointer"
                                        onClick={() => setExpandedPaperId(expandedPaperId === paper.id ? null : paper.id)}
                                    >
                                        <div className="flex justify-between items-start mb-3">
                                            <div className="flex gap-2 flex-wrap">
                                                <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black text-white ${paper.id.startsWith('kci_') ? 'bg-emerald-500' : 'bg-blue-600'}`}>
                                                    {paper.id.startsWith('kci_') ? 'KCI' : 'PubMed'}
                                                </span>
                                                {paper.type && (
                                                    <span className="px-2 py-0.5 bg-slate-900 text-white rounded-lg text-[10px] font-black uppercase tracking-wider">
                                                        {paper.type}
                                                    </span>
                                                )}
                                                <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-bold uppercase tracking-tight">
                                                    {paper.journal}
                                                </span>
                                            </div>
                                            <Heart size={18} className="text-slate-200 hover:text-red-400 cursor-pointer transition-colors" />
                                        </div>

                                        <h3 className={`text-slate-900 leading-tight transition-all ${paper.id.startsWith('kci_') ? 'font-semibold' : 'font-bold'} ${expandedPaperId === paper.id ? 'text-2xl' : 'text-lg line-clamp-2'}`}>
                                            {paper.title}
                                        </h3>

                                        {expandedPaperId !== paper.id && (
                                            <div className="text-xs text-slate-400 mt-2 font-medium space-y-0.5">
                                                {paper.authors.split(', ').slice(0, 3).map((author, idx) => (
                                                    <p key={idx}>{author}</p>
                                                ))}
                                                {paper.authors.split(', ').length > 3 && (
                                                    <p className="text-slate-300">외 {paper.authors.split(', ').length - 3}명</p>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {/* Expandable Content */}
                                    <AnimatePresence>
                                        {expandedPaperId === paper.id && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: 'auto', opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                className="border-t border-slate-50 bg-slate-50/30"
                                            >
                                                <div className="p-6">
                                                    <p className="text-sm text-slate-700 leading-relaxed mb-6 font-medium">
                                                        {paper.abstract}
                                                    </p>
                                                    <div className="flex flex-wrap gap-2 mb-6">
                                                        {paper.tags.map((tag: string) => (
                                                            <span key={tag} className="text-[10px] font-bold text-slate-500 bg-white border border-slate-200 px-3 py-1 rounded-full">#{tag}</span>
                                                        ))}
                                                    </div>

                                                    {/* Audio Controls Section */}
                                                    {currentPaper?.id === paper.id && currentPaper.audioUrl ? (
                                                        <div ref={inlinePlayerRef} className="bg-slate-900 rounded-2xl p-5 mt-4">
                                                            <div className="flex items-center justify-center gap-6 mb-4">
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        if (audioRef.current) {
                                                                            audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 10);
                                                                        }
                                                                    }}
                                                                    className="text-slate-400 hover:text-white transition-colors"
                                                                >
                                                                    <SkipBack fill="currentColor" size={24} />
                                                                </button>

                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        if (isPlaying) {
                                                                            audioRef.current?.pause();
                                                                            setIsPlaying(false);
                                                                        } else {
                                                                            audioRef.current?.play();
                                                                            setIsPlaying(true);
                                                                        }
                                                                    }}
                                                                    className="w-14 h-14 bg-blue-600 rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-all hover:bg-blue-500"
                                                                >
                                                                    {isPlaying ? (
                                                                        <Pause fill="currentColor" size={24} className="text-white" />
                                                                    ) : (
                                                                        <Play fill="currentColor" size={24} className="text-white ml-1" />
                                                                    )}
                                                                </button>

                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        if (audioRef.current) {
                                                                            audioRef.current.currentTime = Math.min(audioRef.current.duration || 0, audioRef.current.currentTime + 10);
                                                                        }
                                                                    }}
                                                                    className="text-slate-400 hover:text-white transition-colors"
                                                                >
                                                                    <SkipForward fill="currentColor" size={24} />
                                                                </button>
                                                            </div>

                                                            <div
                                                                className="h-1.5 w-full bg-slate-700 rounded-full overflow-hidden cursor-pointer mb-2"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    if (audioRef.current && audioRef.current.duration) {
                                                                        const rect = e.currentTarget.getBoundingClientRect();
                                                                        const percent = (e.clientX - rect.left) / rect.width;
                                                                        audioRef.current.currentTime = percent * audioRef.current.duration;
                                                                    }
                                                                }}
                                                            >
                                                                <div
                                                                    className="h-full bg-blue-500 transition-all"
                                                                    style={{ width: `${audioProgress.duration > 0 ? (audioProgress.currentTime / audioProgress.duration) * 100 : 0}%` }}
                                                                />
                                                            </div>
                                                            <div className="flex justify-between text-[10px] text-slate-500 font-medium">
                                                                <span>{formatTime(audioProgress.currentTime)}</span>
                                                                <span>{formatTime(audioProgress.duration)}</span>
                                                            </div>

                                                            <a
                                                                href={paper.originalUrl}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                onClick={(e) => e.stopPropagation()}
                                                                className="block text-center text-xs text-blue-400 hover:text-blue-300 font-medium mt-3"
                                                            >
                                                                원문 보기 →
                                                            </a>

                                                            <audio
                                                                ref={audioRef}
                                                                src={currentPaper.audioUrl}
                                                                onPlay={() => setIsPlaying(true)}
                                                                onPause={() => setIsPlaying(false)}
                                                                onEnded={() => setIsPlaying(false)}
                                                                onTimeUpdate={(e) => {
                                                                    const audio = e.currentTarget;
                                                                    setAudioProgress({
                                                                        currentTime: audio.currentTime,
                                                                        duration: audio.duration || 0
                                                                    });
                                                                }}
                                                                onLoadedMetadata={(e) => {
                                                                    const duration = e.currentTarget?.duration;
                                                                    if (duration && !isNaN(duration)) {
                                                                        setAudioProgress(prev => ({
                                                                            ...prev,
                                                                            duration: duration
                                                                        }));
                                                                    }
                                                                }}
                                                                className="hidden"
                                                                autoPlay
                                                            />
                                                        </div>
                                                    ) : (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                startPodcast(paper);
                                                            }}
                                                            disabled={currentPaper?.id === paper.id && isGenerating}
                                                            className="w-full h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl flex items-center justify-center gap-3 font-bold text-lg shadow-lg shadow-blue-100 transition-all active:scale-95 disabled:opacity-70"
                                                        >
                                                            {currentPaper?.id === paper.id && isGenerating ? (
                                                                <>
                                                                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                                    {statusMessage || '분석 중...'}
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <Play size={20} fill="currentColor" />
                                                                    오디오 리포트 생성
                                                                </>
                                                            )}
                                                        </button>
                                                    )}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </motion.div>
                            ))
                        ) : (
                            <div className="text-center py-10 text-slate-400">
                                <p>검색 결과가 없습니다.</p>
                                {searchQuery && <p className="text-sm mt-2">"{searchQuery}"에 대한 결과를 찾지 못했습니다.</p>}
                            </div>
                        )}
                    </div>
                </section>
            </main>

            {/* Floating Mini Player - appears when inline player scrolls out of view */}
            <AnimatePresence>
                {showMiniPlayer && currentPaper && (
                    <motion.div
                        initial={{ y: 100, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 100, opacity: 0 }}
                        className="fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-md text-white px-4 py-3 z-50 border-t border-slate-700 max-w-lg mx-auto"
                    >
                        <div className="flex items-center gap-3">
                            {/* Play/Pause */}
                            <button
                                onClick={() => {
                                    if (isPlaying) {
                                        audioRef.current?.pause();
                                        setIsPlaying(false);
                                    } else {
                                        audioRef.current?.play();
                                        setIsPlaying(true);
                                    }
                                }}
                                className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0"
                            >
                                {isPlaying ? (
                                    <Pause fill="currentColor" size={18} />
                                ) : (
                                    <Play fill="currentColor" size={18} className="ml-0.5" />
                                )}
                            </button>

                            {/* Title & Progress */}
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium line-clamp-1">{currentPaper.title}</p>
                                <div className="flex items-center gap-2 text-[10px] text-slate-400">
                                    <span>{formatTime(audioProgress.currentTime)}</span>
                                    <div className="flex-1 h-1 bg-slate-700 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-blue-500"
                                            style={{ width: `${audioProgress.duration > 0 ? (audioProgress.currentTime / audioProgress.duration) * 100 : 0}%` }}
                                        />
                                    </div>
                                    <span>{formatTime(audioProgress.duration)}</span>
                                </div>
                            </div>

                            {/* Scroll to card button */}
                            <button
                                onClick={() => {
                                    inlinePlayerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                }}
                                className="text-slate-400 hover:text-white transition-colors p-1"
                                title="카드로 이동"
                            >
                                <ChevronUp size={20} />
                            </button>

                            {/* Close */}
                            <button
                                onClick={() => {
                                    audioRef.current?.pause();
                                    setCurrentPaper(null);
                                    setIsPlaying(false);
                                }}
                                className="text-slate-400 hover:text-white transition-colors p-1"
                            >
                                <X size={20} />
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
