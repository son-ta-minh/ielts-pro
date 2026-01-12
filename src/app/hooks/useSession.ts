
import { useState, useCallback, useEffect } from 'react';
import { VocabularyItem, SessionType, ReviewMode, AppView } from '../types';

interface UseSessionProps {
    setView: (view: AppView) => void;
    setIsSidebarOpen: (isOpen: boolean) => void;
}

export const useSession = ({ setView, setIsSidebarOpen }: UseSessionProps) => {
    const [sessionWords, setSessionWords] = useState<VocabularyItem[] | null>(null);
    const [sessionFocus, setSessionFocus] = useState<ReviewMode | null>(null);
    const [sessionType, setSessionType] = useState<SessionType>(null);

    useEffect(() => {
        try {
            const savedSession = sessionStorage.getItem('vocab_pro_active_session');
            if (savedSession) {
                const { words, type } = JSON.parse(savedSession);
                if (Array.isArray(words) && words.length > 0) {
                    setSessionWords(words);
                    setSessionType(type);
                }
            }
        } catch (e) {
            console.error("Failed to restore session", e);
            sessionStorage.removeItem('vocab_pro_active_session');
        }
    }, []);

    const startSession = useCallback((words: VocabularyItem[], type: SessionType, focus: ReviewMode | null = null) => {
        if (words.length > 0) {
            const uniqueWords = Array.from(new Map(words.map(w => [w.id, w])).values());
            const shuffled = [...uniqueWords].sort(() => Math.random() - 0.5);
            
            setSessionWords(shuffled);
            setSessionType(type);
            setSessionFocus(focus);
            
            sessionStorage.setItem('vocab_pro_active_session', JSON.stringify({ words: shuffled, type }));
            sessionStorage.removeItem('vocab_pro_session_progress');
            sessionStorage.removeItem('vocab_pro_session_outcomes');
            
            setView('REVIEW');
            setIsSidebarOpen(false);
        }
    }, [setView, setIsSidebarOpen]);

    const clearSessionState = useCallback(() => {
        sessionStorage.removeItem('vocab_pro_active_session');
        sessionStorage.removeItem('vocab_pro_session_progress');
        sessionStorage.removeItem('vocab_pro_session_outcomes');
        setSessionWords(null);
        setSessionType(null);
        setSessionFocus(null);
    }, []);

    return {
        sessionWords,
        setSessionWords,
        sessionType,
        sessionFocus,
        startSession,
        clearSessionState,
    };
};
