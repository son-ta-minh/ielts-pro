
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
        console.log(`[SESSION_DEBUG] Starting session of type '${type}' with ${words.length} words.`);
        if (words.length > 0) {
            const uniqueWords = Array.from(new Map(words.map(w => [w.id, w])).values());
            const shuffled = [...uniqueWords].sort(() => Math.random() - 0.5);
            
            setSessionWords(shuffled);
            setSessionType(type);
            setSessionFocus(focus);
            
            sessionStorage.setItem('vocab_pro_active_session', JSON.stringify({ words: shuffled, type }));
            sessionStorage.removeItem('vocab_pro_session_progress');
            sessionStorage.removeItem('vocab_pro_session_outcomes');
            
            console.log("[SESSION_DEBUG] Navigating to REVIEW view.");
            setView('REVIEW');
            setIsSidebarOpen(false);
        } else {
            console.log(`[SESSION_DEBUG] Attempted to start session of type '${type}' but no words were provided. Navigation cancelled.`);
        }
    }, [setView, setIsSidebarOpen]);

    const clearSessionState = useCallback(() => {
        console.log('[SESSION_DEBUG] Clearing all active session state and sessionStorage.');
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