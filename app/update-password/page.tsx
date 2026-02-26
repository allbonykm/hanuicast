'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { Lock, AlertCircle, CheckCircle2, KeyRound } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function UpdatePasswordPage() {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ text: string, type: 'error' | 'success' } | null>(null);
    const router = useRouter();

    useEffect(() => {
        // 해시 파라미터에서 엑세스 토큰이 세션으로 저장되었는지 확인
        const checkSession = async () => {
            // 이메일 링크를 통해 접속했을 때 URL 해시에 들어있는 access_token 강제 파싱 및 세션 적용 대기
            const hash = window.location.hash;
            if (hash && hash.includes('access_token')) {
                // Supabase 클라이언트가 해시를 감지하고 세션을 파싱할 약간의 시간을 벌어줍니다.
                setMessage({ text: '인증 정보를 확인 중입니다...', type: 'success' });
            }

            // 세션 상태 조회
            const { data: { session }, error } = await supabase.auth.getSession();

            if (error || !session) {
                // 해시에도 없고, 기존 세션에도 없을 때
                if (!hash.includes('access_token')) {
                    setMessage({ text: '유효하지 않거나 만료된 링크입니다. 메인 화면에서 다시 인증 메일을 요청해 주세요.', type: 'error' });
                }
            } else {
                setMessage(null); // 정상 세션 감지됨
            }
        };

        checkSession();

        // auth state change listener (이메일 링크 리다이렉트 시 토큰이 설정될 때 감지)
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
                setMessage(null); // 에러 또는 대기 메시지 초기화
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    const handleUpdatePassword = async (e: React.FormEvent) => {
        e.preventDefault();

        if (password !== confirmPassword) {
            setMessage({ text: '비밀번호가 일치하지 않습니다.', type: 'error' });
            return;
        }

        setLoading(true);
        setMessage(null);

        try {
            // 세션 재확인 방어 로직
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                throw new Error("인증 세션이 만료되었습니다. 인증 이메일 링크를 새롭게 발급받아 주세요.");
            }

            const { error } = await supabase.auth.updateUser({
                password: password
            });

            if (error) throw error;

            setMessage({ text: '비밀번호가 성공적으로 변경되었습니다! 잠시 후 메인 화면으로 이동합니다.', type: 'success' });

            // 변경 후 보안을 위해 즉시 로그아웃 처리할 수도 있으나, 현재는 로그인 유지 상태로 메인으로 보냄
            setTimeout(() => {
                router.push('/');
            }, 2000);

        } catch (error: any) {
            setMessage({ text: error.message || '비밀번호 변경 중 오류가 발생했습니다.', type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
            <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
            >
                <div className="p-8">
                    <div className="text-center mb-8">
                        <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4 text-blue-600">
                            <KeyRound size={32} />
                        </div>
                        <h2 className="text-2xl font-black text-slate-800">새 비밀번호 설정</h2>
                        <p className="text-slate-500 text-sm mt-1 font-medium">
                            사용할 새로운 비밀번호를 입력해주세요.
                        </p>
                    </div>

                    <form onSubmit={handleUpdatePassword} className="space-y-4">
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-500 ml-1 uppercase">새 비밀번호</label>
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

                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-500 ml-1 uppercase">비밀번호 확인</label>
                            <div className="relative">
                                <input
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
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
                                    className={`flex items-start gap-2 text-sm font-bold p-3 rounded-xl ${message.type === 'error' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'
                                        }`}
                                >
                                    <div className="mt-0.5">
                                        {message.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
                                    </div>
                                    <span className="leading-tight">{message.text}</span>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <button
                            type="submit"
                            disabled={loading || (message?.type === 'error' && message.text.includes('유효하지 않'))}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-blue-200 transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-70 disabled:hover:scale-100 flex items-center justify-center gap-2 text-lg mt-2"
                        >
                            {loading ? (
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <>비밀번호 변경</>
                            )}
                        </button>
                    </form>

                    <div className="mt-6 text-center">
                        <button
                            onClick={() => router.push('/')}
                            className="text-sm text-slate-500 hover:text-slate-700 font-bold transition-colors"
                        >
                            메인으로 돌아가기
                        </button>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
