'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, SkipForward, SkipBack, Heart, Search, BookOpen, Clock, Music, X, ChevronUp, Check, HelpCircle, User, LogOut, Sparkles, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';
import AuthModal from './components/AuthModal';
import ScriptModal from './components/script-player/ScriptModal';

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


type SearchMode = 'clinical' | 'evidence' | 'latest' | 'general' | 'saved';

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
    const [savedPapers, setSavedPapers] = useState<Paper[]>([]);
    const [audioProgress, setAudioProgress] = useState({ currentTime: 0, duration: 0 });
    const [fullTextOnly, setFullTextOnly] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState(''); // Default to All
    const [appliedQuery, setAppliedQuery] = useState('');
    const [showHelp, setShowHelp] = useState(false);
    const [activeTab, setActiveTab] = useState<'papers' | 'trials'>('papers');
    const [isScriptModalOpen, setIsScriptModalOpen] = useState(false);

    const CATEGORIES = [
        { id: '', label: '전체' },
        { id: 'obgyn', label: '통합부인과' },
        { id: 'kmd', label: '통합의학' },
        { id: 'neuro', label: '신경/행동심리' },
        { id: 'nutrition', label: '영양/대사' },
        { id: 'exercise', label: '임상운동' },
        { id: 'pharm', label: '약리/한약재' },
    ];

    // Auth State
    const [user, setUser] = useState<any>(null);
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

    const audioRef = useRef<HTMLAudioElement | null>(null);
    const inlinePlayerRef = useRef<HTMLDivElement | null>(null);

    // Prevent hydration mismatch
    useEffect(() => {
        setIsMounted(true);
        // Check active session
        supabase.auth.getSession().then(({ data: { session } }) => {
            setUser(session?.user ?? null);
            if (session?.user) {
                loadUserData(session.user.id);
            } else {
                setLoading(false);
                setIsInitialLoading(false);
            }
        });

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user ?? null);
            if (session?.user) {
                loadUserData(session.user.id);
            } else {
                // Reset data on logout
                setInterestKeywords([]);
                setSavedPapers([]);
                setPapers([]);
                fetchDailyCuration([]); // Clear curation
            }
        });

        return () => subscription.unsubscribe();
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

    // Load user data from new table `user_preferences`
    const loadUserData = async (userId: string) => {
        setIsInitialLoading(true);
        try {
            const { data, error } = await supabase
                .from('user_preferences')
                .select('*')
                .eq('user_id', userId)
                .single();

            if (error && error.code !== 'PGRST116') { // PGRST116 is "Row not found"
                console.error('Error loading user data:', error);
            }

            let ks = ['Acupuncture', '한의학'];
            if (data?.interest_keywords) {
                ks = data.interest_keywords;
            } else if (!data) {
                // Create initial row if not exists
                const { error: insertError } = await supabase
                    .from('user_preferences')
                    .insert([{ user_id: userId, interest_keywords: ks, saved_papers: [] }]);

                if (insertError) console.error('Error creating user profile:', insertError);
            }

            setInterestKeywords(ks);

            if (data?.saved_papers) {
                setSavedPapers(data.saved_papers as Paper[]);
            }

            await fetchDailyCuration(ks);
        } catch (err) {
            console.error('Initial Load Error:', err);
        } finally {
            setIsInitialLoading(false);
            setLoading(false);
        }
    };

    // Re-fetch when activeTab changes
    useEffect(() => {
        if (!isMounted) return;
        if (searchQuery) {
            fetchPapers(searchQuery);
        } else {
            fetchDailyCuration(interestKeywords);
        }
    }, [activeTab]);

    const fetchDailyCuration = async (keywords: string[]) => {
        setIsInitialLoading(true);
        try {
            if (keywords.length === 0) {
                setPapers([]);
                return;
            }
            // Fetch papers for each keyword and merge
            const allPapers: Paper[] = [];
            for (const k of keywords) {
                const res = await fetch(`/api/papers?q=${encodeURIComponent(k)}&mode=${searchMode}&sourceType=${activeTab}`);
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
        if (mode === 'saved') {
            setPapers(savedPapers);
            return;
        }

        setLoading(true);
        setExpandedPaperId(null);
        setAppliedQuery(q);

        try {
            const url = `/api/papers?q=${encodeURIComponent(q)}&mode=${mode}&limit=20&sourceType=${activeTab}`;
            const res = await fetch(url);
            const data = await res.json();
            setPapers(data.papers);
            // Always show the interpreted/translated query if available, to confirm what was searched
            if (data.meta?.translatedQuery) {
                setAppliedQuery(data.meta.translatedQuery);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const updateKeywordsInDb = async (newKs: string[]) => {
        if (!user) return;
        try {
            const { error } = await supabase
                .from('user_preferences')
                .update({ interest_keywords: newKs, updated_at: new Date() })
                .eq('user_id', user.id);

            if (error) throw error;
        } catch (err) {
            console.error('Failed to update keywords in Supabase:', err);
        }
    };

    const updateSavedPapersInDb = async (newSaved: Paper[]) => {
        if (!user) return;
        try {
            const { error } = await supabase
                .from('user_preferences')
                .update({ saved_papers: newSaved, updated_at: new Date() })
                .eq('user_id', user.id);

            if (error) throw error;
        } catch (err) {
            console.error('Failed to update saved papers in Supabase:', err);
        }
    };

    const toggleSavePaper = (paper: Paper) => {
        if (!user) {
            setIsAuthModalOpen(true);
            return;
        }
        const isSaved = savedPapers.some(p => p.id === paper.id);
        let newSaved;
        if (isSaved) {
            newSaved = savedPapers.filter(p => p.id !== paper.id);
        } else {
            newSaved = [paper, ...savedPapers];
        }
        setSavedPapers(newSaved);
        updateSavedPapersInDb(newSaved);
    };

    const addKeyword = async (k: string) => {
        if (!user) {
            setIsAuthModalOpen(true);
            return;
        }
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
            // If currently in 'saved' mode, switch to 'general' for the search
            const modeToUse = searchMode === 'saved' ? 'general' : searchMode;
            if (modeToUse !== searchMode) setSearchMode(modeToUse);
            fetchPapers(searchQuery, modeToUse);
        }
    };

    const toggleHelp = () => setShowHelp(!showHelp);

    const handleModeChange = (mode: SearchMode | 'saved') => {
        // @ts-ignore
        setSearchMode(mode);
        if (mode === 'saved') {
            setPapers(savedPapers);
        } else if (searchQuery.trim()) {
            fetchPapers(searchQuery.trim(), mode as SearchMode);
        } else if (interestKeywords.length > 0) {
            // Re-fetch curation with new mode
            fetchDailyCuration(interestKeywords);
        }
    };

    const [statusMessage, setStatusMessage] = useState('');

    const startPodcast = async (paper: Paper, deep = false) => {
        if (currentPaper?.id === paper.id && !deep) {
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

        // If audio already exists and it's NOT a deep requested analysis
        if (paper.audioUrl && !deep) {
            // No manual setIsPlaying(true) here
            return;
        }

        // Generate Podcast script and audio
        setIsGenerating(true);
        setStatusMessage(deep ? 'OpenAI 정밀 분석 중...' : 'AI가 논문 요약 중...'); // Initial status

        try {
            console.log('Starting generation for:', paper.title, deep ? '(Deep)' : '');

            // 1. Summarize
            console.log('Calling /api/summarize...');
            const sumRes = await fetch('/api/summarize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: paper.title, abstract: paper.abstract, deep })
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
            // No manual setIsPlaying(true) here. 
            // The <audio> element has autoPlay, and its onPlay listener will call setIsPlaying(true).
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
            <AuthModal
                isOpen={isAuthModalOpen}
                onClose={() => setIsAuthModalOpen(false)}
                onLoginSuccess={() => setIsAuthModalOpen(false)}
            />

            {/* Header */}
            <header className="bg-white/80 backdrop-blur-md p-6 sticky top-0 z-10 border-b border-slate-100">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h1 className="text-3xl font-black text-slate-900 tracking-tight">Morning Article</h1>
                        <p className="text-sm font-semibold text-blue-600 uppercase tracking-widest mt-1">Medical insight assistant</p>
                    </div>
                    <div className="flex gap-2">
                        {/* User/Auth Button */}
                        <button
                            onClick={() => {
                                if (user) {
                                    if (confirm('로그아웃 하시겠습니까?')) {
                                        supabase.auth.signOut();
                                    }
                                } else {
                                    setIsAuthModalOpen(true);
                                }
                            }}
                            className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg transition-all ${user ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : 'bg-slate-900 text-white hover:bg-slate-800'
                                }`}
                        >
                            {user ? <LogOut size={24} /> : <User size={24} />}
                        </button>
                    </div>
                </div>

                {/* Tab Switcher */}
                <div className="flex bg-slate-100 p-1 rounded-2xl mb-4">
                    <button
                        onClick={() => setActiveTab('papers')}
                        className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${activeTab === 'papers' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                            }`}
                    >
                        학술 논문
                    </button>
                    <button
                        onClick={() => setActiveTab('trials')}
                        className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${activeTab === 'trials' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                            }`}
                    >
                        임상 시험 (Global)
                    </button>
                </div>

                <form onSubmit={handleSearch} className="mb-2">
                    <div className="relative group">
                        <input
                            type="text"
                            placeholder="원장님, 관심 있는 키워드를 입력하세요..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-slate-100 border-2 border-transparent focus:border-blue-500 focus:bg-white rounded-2xl py-4 pl-12 pr-4 outline-none transition-all text-slate-800 placeholder-slate-400 font-medium shadow-sm"
                        />
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={20} />
                    </div>
                </form>

                {/* Advanced Search Options */}
                <div className="flex flex-wrap items-center gap-2 mb-4">
                    {CATEGORIES.map(cat => (
                        <button
                            key={cat.id}
                            onClick={() => setSelectedCategory(cat.id)}
                            className={`px-3 py-1.5 rounded-xl text-sm font-bold whitespace-nowrap border-2 transition-all ${selectedCategory === cat.id ? 'bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-200' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}
                        >
                            {cat.label}
                        </button>
                    ))}
                    <div className="w-px h-6 bg-slate-200 mx-1 flex-shrink-0"></div>
                    <button
                        onClick={() => setFullTextOnly(!fullTextOnly)}
                        className={`px-3 py-1.5 rounded-xl text-sm font-bold whitespace-nowrap border-2 transition-all flex items-center gap-1 ${fullTextOnly ? 'bg-emerald-600 border-emerald-600 text-white shadow-md shadow-emerald-200' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}
                    >
                        {fullTextOnly && <Check size={14} strokeWidth={3} />}
                        원문만
                    </button>
                </div>

                {/* Applied MeSH Terms Display */}
                <AnimatePresence>
                    {appliedQuery && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="mb-4 bg-blue-50/50 rounded-xl border border-blue-100 p-3"
                        >
                            <p className="text-[10px] uppercase font-bold text-blue-400 mb-1">Applied Medical Context</p>
                            <p className="text-xs text-blue-900 font-medium break-words leading-relaxed">
                                {appliedQuery}
                            </p>
                        </motion.div>
                    )}
                </AnimatePresence>

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

                {/* Mode Selector Header */}
                <div className="mt-6 flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">검색 필터</span>
                    <button onClick={toggleHelp} className="text-slate-400 hover:text-blue-500 transition-colors flex items-center gap-1 text-xs font-medium">
                        <HelpCircle size={14} />
                        설명 보기
                    </button>
                </div>

                {/* Mode Buttons */}
                <div className="flex flex-wrap gap-2">
                    {[
                        { id: 'general', label: '전격', icon: '🔍' },
                        { id: 'clinical', label: '임상', icon: '🏥' },
                        { id: 'evidence', label: '근거', icon: '📊' },
                        { id: 'latest', label: '최신', icon: '🆕' },
                        { id: 'saved', label: '보관함', icon: '♥' }
                    ].map((mode) => (
                        <button
                            key={mode.id}
                            // @ts-ignore
                            onClick={() => handleModeChange(mode.id)}
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

                {/* Help Section */}
                <AnimatePresence>
                    {showHelp && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden"
                        >
                            <div className="mt-4 bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs text-slate-600 space-y-2">
                                <p><span className="font-bold text-slate-800">🔍 전격(General):</span> 관련성 높은 모든 논문을 검색합니다.</p>
                                <p><span className="font-bold text-slate-800">🏥 임상(Clinical):</span> 임상시험(RCT) 등 환자 대상 연구를 우선합니다.</p>
                                <p><span className="font-bold text-slate-800">📊 근거(Evidence):</span> 메타분석, 체계적 고찰 등 높은 근거 수준의 논문을 찾습니다.</p>
                                <p><span className="font-bold text-slate-800">🆕 최신(Latest):</span> 가장 최근에 발표된 논문 순서로 정렬합니다.</p>
                                <p><span className="font-bold text-slate-800">♥ 보관함:</span> 하트를 눌러 저장한 논문만 모아봅니다.</p>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </header>

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto p-6 space-y-8 no-scrollbar">
                {/* Featured Section */}
                <section>
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                            {searchMode === 'saved' ? <Heart size={22} className="text-red-500 fill-red-500" /> : <BookOpen size={22} className="text-blue-600" />}
                            {searchMode === 'saved' ? '보관된 논문' : '원장님 맞춤 최신 브리핑'}
                        </h2>
                        {searchMode !== 'saved' && (
                            <span className="text-[10px] font-black text-blue-500 bg-blue-50 px-3 py-1 rounded-full uppercase tracking-tighter animate-pulse">Daily Update</span>
                        )}
                    </div>

                    <div className="space-y-4">
                        {loading ? (
                            [1, 2].map(i => (
                                <div key={i} className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 animate-pulse h-48"></div>
                            ))
                        ) : papers.length > 0 ? (
                            papers.map((paper: Paper) => {
                                const isSaved = savedPapers.some(p => p.id === paper.id);
                                return (
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
                                                    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black text-white ${paper.id.startsWith('kci_') ? 'bg-emerald-500' : paper.id.startsWith('kampodb_') ? 'bg-amber-700' : paper.id.startsWith('jstage_') ? 'bg-violet-700' : paper.id.startsWith('semanticscholar_') ? 'bg-indigo-600' : paper.id.startsWith('koreantk_') ? 'bg-stone-600' : 'bg-blue-600'}`}>
                                                        {paper.id.startsWith('kci_') ? 'KCI' : paper.id.startsWith('kampodb_') ? 'KampoDB' : paper.id.startsWith('jstage_') ? 'J-STAGE' : paper.id.startsWith('semanticscholar_') ? 'AI-HUB' : paper.id.startsWith('koreantk_') ? 'Traditional' : 'PubMed'}
                                                    </span>
                                                    {paper.type && (
                                                        <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider ${paper.type === 'Formula' ? 'bg-amber-100 text-amber-900' : paper.type === 'Patent' ? 'bg-orange-100 text-orange-900 border border-orange-200' : 'bg-slate-900 text-white'}`}>
                                                            {paper.type}
                                                        </span>
                                                    )}
                                                    {paper.journal && paper.journal !== 'J-STAGE' && paper.journal !== 'Semantic Scholar' && paper.journal !== 'Traditional Knowledge Portal' && (
                                                        <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-bold uppercase tracking-tight">
                                                            {paper.journal}
                                                        </span>
                                                    )}
                                                </div>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        toggleSavePaper(paper);
                                                    }}
                                                    className="p-1 hover:bg-slate-50 rounded-full transition-colors"
                                                >
                                                    <Heart
                                                        size={18}
                                                        className={`transition-colors ${isSaved ? 'text-red-500 fill-red-500' : 'text-slate-200 hover:text-red-400'}`}
                                                    />
                                                </button>
                                            </div>

                                            <h3 className={`text-slate-900 leading-tight transition-all ${paper.id.startsWith('kci_') || paper.id.startsWith('kampodb_') || paper.id.startsWith('jstage_') || paper.id.startsWith('semanticscholar_') || paper.id.startsWith('koreantk_') ? 'font-semibold' : 'font-bold'} ${expandedPaperId === paper.id ? 'text-2xl' : 'text-lg line-clamp-2'}`}>
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
                                                        <p className={`text-sm text-slate-700 leading-relaxed mb-6 font-medium ${paper.id.startsWith('kampodb_') ? 'whitespace-pre-wrap' : ''}`}>
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

                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setIsScriptModalOpen(true);
                                                                        }}
                                                                        className="text-slate-400 hover:text-white transition-colors"
                                                                        title="대본 보기"
                                                                    >
                                                                        <FileText size={24} />
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
                                                            <div className="flex flex-col gap-3">
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        startPodcast(paper, true); // true for deep analysis
                                                                    }}
                                                                    disabled={currentPaper?.id === paper.id && isGenerating}
                                                                    className="w-full h-14 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl flex items-center justify-center gap-3 font-bold text-lg shadow-lg shadow-indigo-100 transition-all active:scale-95 disabled:opacity-70"
                                                                >
                                                                    {currentPaper?.id === paper.id && isGenerating && statusMessage?.includes('정밀') ? (
                                                                        <>
                                                                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                                            정밀 분석 중...
                                                                        </>
                                                                    ) : (
                                                                        <>
                                                                            <Sparkles size={20} fill="currentColor" />
                                                                            AI 정밀 분석 (OpenAI)
                                                                        </>
                                                                    )}
                                                                </button>

                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        startPodcast(paper);
                                                                    }}
                                                                    disabled={currentPaper?.id === paper.id && isGenerating}
                                                                    className="w-full h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl flex items-center justify-center gap-3 font-bold text-lg shadow-lg shadow-blue-100 transition-all active:scale-95 disabled:opacity-70"
                                                                >
                                                                    {currentPaper?.id === paper.id && isGenerating && !statusMessage?.includes('정밀') ? (
                                                                        <>
                                                                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                                            {statusMessage || '분석 중...'}
                                                                        </>
                                                                    ) : (
                                                                        <>
                                                                            <Play size={20} fill="currentColor" />
                                                                            오디오 리포트 생성 (Gemini)
                                                                        </>
                                                                    )}
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </motion.div>
                                )
                            })
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

            <ScriptModal
                isOpen={isScriptModalOpen}
                onClose={() => setIsScriptModalOpen(false)}
                script={currentPaper ? {
                    id: currentPaper.id,
                    title: currentPaper.title,
                    content: currentPaper.summaryScript || '대본이 없습니다.'
                } : null}
            />
        </div>
    );
}
