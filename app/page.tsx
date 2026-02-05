'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, SkipForward, SkipBack, Heart, Search, BookOpen, Clock, Music, X } from 'lucide-react';
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
    audioUrl?: string;
    summaryScript?: string;
}

export default function Home() {
    const [papers, setPapers] = useState<Paper[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentPaper, setCurrentPaper] = useState<Paper | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [interestKeywords, setInterestKeywords] = useState<string[]>([]);
    const [isInitialLoading, setIsInitialLoading] = useState(true);

    const audioRef = useRef<HTMLAudioElement | null>(null);

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
                const res = await fetch(`/api/papers?q=${encodeURIComponent(k)}`);
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
            setPapers(allPapers.slice(0, 10)); // Top 10 latest
        } catch (err) {
            console.error('Curation Error:', err);
        } finally {
            setIsInitialLoading(false);
            setLoading(false);
        }
    };

    const fetchPapers = async (q = '') => {
        setLoading(true);
        try {
            const res = await fetch(`/api/papers?q=${encodeURIComponent(q)}`);
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
            fetchPapers(searchQuery);
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

    return (
        <div
            className="min-h-screen bg-slate-50 flex flex-col max-w-lg mx-auto shadow-2xl overflow-hidden font-sans"
            suppressHydrationWarning={true}
        >
            {/* Header */}
            <header className="bg-white/80 backdrop-blur-md p-6 sticky top-0 z-10 border-b border-slate-100">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h1 className="text-3xl font-black text-slate-900 tracking-tight">HanuiCast</h1>
                        <p className="text-sm font-semibold text-blue-600 uppercase tracking-widest mt-1">Olbon Insight Assistant</p>
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
                        ) : (
                            papers.map((paper) => (
                                <motion.div
                                    key={paper.id}
                                    whileHover={{ y: -4 }}
                                    className={`bg-white rounded-3xl p-6 shadow-sm border-2 transition-all cursor-pointer ${currentPaper?.id === paper.id ? 'border-blue-500 ring-4 ring-blue-50' : 'border-slate-100 hover:border-slate-200 shadow-slate-200/50'}`}
                                    onClick={() => startPodcast(paper)}
                                >
                                    <div className="flex justify-between items-start mb-4">
                                        <span className="px-3 py-1 bg-blue-50 text-blue-600 rounded-lg text-xs font-bold uppercase tracking-wide">
                                            {paper.journal}
                                        </span>
                                        <Heart size={18} className="text-slate-200 hover:text-red-400 cursor-pointer transition-colors" />
                                    </div>
                                    <h3 className="text-lg font-bold text-slate-800 leading-tight mb-2 line-clamp-2">
                                        {paper.title}
                                    </h3>
                                    <p className="text-sm text-slate-500 font-medium mb-4 line-clamp-2 italic">
                                        {paper.authors}
                                    </p>
                                    <div className="flex gap-2 mb-4 overflow-x-auto no-scrollbar">
                                        {paper.tags.map(tag => (
                                            <span key={tag} className="text-[10px] font-black text-slate-400 border border-slate-100 px-2 py-0.5 rounded-full whitespace-nowrap">#{tag}</span>
                                        ))}
                                    </div>
                                    <div className="flex items-center gap-2 text-blue-600 font-bold text-sm bg-blue-50/50 w-fit px-4 py-2 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-all">
                                        {currentPaper?.id === paper.id && isPlaying ? <Pause size={16} /> : <Play size={16} fill="currentColor" />}
                                        <span>{currentPaper?.id === paper.id && isGenerating ? (statusMessage || '처리 중...') : '요약 오디오 듣기'}</span>
                                    </div>
                                </motion.div>
                            ))
                        )}
                    </div>
                </section>
            </main>

            {/* Audio Player Drawer */}
            <AnimatePresence>
                {currentPaper && (
                    <motion.div
                        initial={{ y: 100 }}
                        animate={{ y: 0 }}
                        exit={{ y: 100 }}
                        className="bg-slate-900 text-white p-8 rounded-t-[40px] shadow-2xl border-t border-slate-800 z-50 sticky bottom-0"
                    >
                        <div className="w-12 h-1.5 bg-slate-700 rounded-full mx-auto mb-8 cursor-pointer hover:bg-slate-600" onClick={() => { }} />

                        <div className="mb-8">
                            <h4 className="text-xl font-black mb-1 line-clamp-1 text-center bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">{currentPaper.title}</h4>
                            <p className="text-sm text-slate-400 font-semibold text-center uppercase tracking-widest">{currentPaper.journal} • 브리핑 세션</p>
                        </div>

                        <div className="flex items-center justify-between mb-10 px-4">
                            <button className="text-slate-400 hover:text-white transition-colors p-2"><SkipBack fill="currentColor" size={32} /></button>

                            <button
                                onClick={() => {
                                    if (isGenerating) return;
                                    if (isPlaying) {
                                        audioRef.current?.pause();
                                        setIsPlaying(false);
                                    } else {
                                        audioRef.current?.play();
                                        setIsPlaying(true);
                                    }
                                }}
                                disabled={isGenerating}
                                className="w-24 h-24 bg-blue-600 rounded-full flex items-center justify-center shadow-[0_0_40px_rgba(37,99,235,0.4)] active:scale-95 transition-all hover:bg-blue-500 disabled:opacity-50 disabled:animate-pulse"
                            >
                                {isGenerating ? (
                                    <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin" />
                                ) : isPlaying ? (
                                    <Pause fill="currentColor" size={40} />
                                ) : (
                                    <Play fill="currentColor" size={40} className="ml-2" />
                                )}
                            </button>

                            <button className="text-slate-400 hover:text-white transition-colors p-2"><SkipForward fill="currentColor" size={32} /></button>
                        </div>

                        <div className="space-y-4 px-2">
                            <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: isPlaying ? '100%' : '0%' }}
                                    transition={{ duration: 300, ease: 'linear' }}
                                    className="h-full bg-blue-500"
                                />
                            </div>
                            <div className="flex justify-between text-[10px] font-bold text-slate-500 tracking-widest uppercase">
                                <span>0:00</span>
                                <span>COMMUTE MODE</span>
                                <span>4:30</span>
                            </div>
                        </div>

                        {currentPaper.audioUrl && (
                            <audio
                                ref={audioRef}
                                src={currentPaper.audioUrl}
                                onPlay={() => setIsPlaying(true)}
                                onPause={() => setIsPlaying(false)}
                                onEnded={() => setIsPlaying(false)}
                                className="hidden"
                                autoPlay
                            />
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
