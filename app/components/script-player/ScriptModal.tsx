import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Copy, Check, FileText } from 'lucide-react';
import { ScriptData } from '../../../types/script';

interface ScriptModalProps {
    isOpen: boolean;
    onClose: () => void;
    script: ScriptData | null;
}

const ScriptModal: React.FC<ScriptModalProps> = ({ isOpen, onClose, script }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        if (!script?.content) return;
        try {
            await navigator.clipboard.writeText(script.content);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy script:', err);
        }
    };

    if (!script) return null;

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 0.5 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black z-40"
                    />

                    {/* Modal Content */}
                    <motion.div
                        initial={{ y: '100%', opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: '100%', opacity: 0 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                        className="fixed inset-x-0 bottom-0 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-2xl h-[85vh] md:h-[80vh] bg-[#F9FAFB] rounded-t-2xl md:rounded-2xl shadow-2xl z-50 flex flex-col overflow-hidden"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-200">
                            <div className="flex items-center gap-3 overflow-hidden">
                                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                                    <FileText className="w-5 h-5" />
                                </div>
                                <h2 className="text-lg font-bold text-gray-800 truncate">
                                    {script.title || '스크립트'}
                                </h2>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-2 -mr-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors"
                                aria-label="닫기"
                            >
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        {/* Scrollable Content */}
                        <div className="flex-1 overflow-y-auto p-6 bg-white">
                            <div className="prose prose-lg max-w-none text-gray-700 leading-relaxed whitespace-pre-line font-medium">
                                {script.content}
                            </div>
                        </div>

                        {/* Footer with Actions */}
                        <div className="p-4 bg-white border-t border-gray-100 flex justify-end">
                            <motion.button
                                whileTap={{ scale: 0.95 }}
                                onClick={handleCopy}
                                className={`flex items-center gap-2 px-6 py-3 rounded-xl font-semibold transition-all shadow-md ${copied
                                        ? 'bg-green-500 text-white shadow-green-200'
                                        : 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-200'
                                    }`}
                            >
                                {copied ? (
                                    <>
                                        <Check className="w-5 h-5" />
                                        <span>복사 완료!</span>
                                    </>
                                ) : (
                                    <>
                                        <Copy className="w-5 h-5" />
                                        <span>전체 복사</span>
                                    </>
                                )}
                            </motion.button>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};

export default ScriptModal;
