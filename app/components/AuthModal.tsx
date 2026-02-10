'use client';

import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { X, Mail, Lock, User, LogIn, UserPlus, AlertCircle, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface AuthModalProps {
    isOpen: boolean;
    onClose: () => void;
    onLoginSuccess: () => void;
}

export default function AuthModal({ isOpen, onClose, onLoginSuccess }: AuthModalProps) {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ text: string, type: 'error' | 'success' } | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setMessage(null);

        try {
            if (isLogin) {
                const { error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });
                if (error) throw error;
                setMessage({ text: '로그인 성공!', type: 'success' });
                setTimeout(() => {
                    onLoginSuccess();
                    onClose();
                }, 1000);
            } else {
                const { error } = await supabase.auth.signUp({
                    email,
                    password,
                });
                if (error) throw error;
                setMessage({ text: '회원가입 성공! 로그인되었습니다.', type: 'success' });
                setTimeout(() => {
                    onLoginSuccess();
                    onClose();
                }, 1000);
            }
        } catch (error: any) {
            setMessage({ text: error.message || '오류가 발생했습니다.', type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                    >
                        {/* Modal */}
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden relative"
                        >
                            <button
                                onClick={onClose}
                                className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors p-1"
                            >
                                <X size={24} />
                            </button>

                            <div className="p-8">
                                <div className="text-center mb-8">
                                    <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4 text-blue-600">
                                        <User size={32} />
                                    </div>
                                    <h2 className="text-2xl font-black text-slate-800">
                                        {isLogin ? '원장님 로그인' : '새 계정 만들기'}
                                    </h2>
                                    <p className="text-slate-500 text-sm mt-1 font-medium">
                                        {isLogin ? '개인화된 논문 큐레이션을 확인하세요.' : '나만의 논문 보관함을 만들어보세요.'}
                                    </p>
                                </div>

                                <form onSubmit={handleSubmit} className="space-y-4">
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-slate-500 ml-1 uppercase">Email</label>
                                        <div className="relative">
                                            <input
                                                type="email"
                                                value={email}
                                                onChange={(e) => setEmail(e.target.value)}
                                                className="w-full bg-slate-50 border-2 border-slate-100 focus:border-blue-500 focus:bg-white rounded-xl py-3 pl-10 pr-4 outline-none transition-all font-medium text-slate-800"
                                                placeholder="user@example.com"
                                                required
                                            />
                                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                        </div>
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-slate-500 ml-1 uppercase">Password</label>
                                        <div className="relative">
                                            <input
                                                type="password"
                                                value={password}
                                                onChange={(e) => setPassword(e.target.value)}
                                                className="w-full bg-slate-50 border-2 border-slate-100 focus:border-blue-500 focus:bg-white rounded-xl py-3 pl-10 pr-4 outline-none transition-all font-medium text-slate-800"
                                                placeholder="••••••••"
                                                minLength={6}
                                                required
                                            />
                                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                        </div>
                                    </div>

                                    <AnimatePresence>
                                        {message && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: 'auto', opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                className={`flex items-center gap-2 text-sm font-bold p-3 rounded-xl ${message.type === 'error' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'
                                                    }`}
                                            >
                                                {message.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
                                                {message.text}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>

                                    <button
                                        type="submit"
                                        disabled={loading}
                                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-blue-200 transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-70 disabled:hover:scale-100 flex items-center justify-center gap-2 text-lg mt-2"
                                    >
                                        {loading ? (
                                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        ) : isLogin ? (
                                            <>
                                                <LogIn size={20} /> 로그인
                                            </>
                                        ) : (
                                            <>
                                                <UserPlus size={20} /> 가입하기
                                            </>
                                        )}
                                    </button>
                                </form>

                                <div className="mt-6 text-center">
                                    <button
                                        onClick={() => {
                                            setIsLogin(!isLogin);
                                            setMessage(null);
                                        }}
                                        className="text-sm text-slate-500 hover:text-blue-600 font-bold transition-colors"
                                    >
                                        {isLogin ? '계정이 없으신가요? 회원가입' : '이미 계정이 있으신가요? 로그인'}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
