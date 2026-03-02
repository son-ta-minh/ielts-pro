import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, CheckCircle, XCircle } from 'lucide-react';
import { PronunciationChallenge as PronunciationChallengeType, ChallengeResult } from '../TestModalTypes';
import { SpeechRecognitionManager } from '../../../utils/speechRecognition';

interface Props {
    challenge: PronunciationChallengeType;
    onAnswer: (answer: string) => void;
    isFinishing: boolean;
    result: ChallengeResult | null;
    containerRef?: React.RefObject<HTMLDivElement>;
}

export const PronunciationChallenge: React.FC<Props> = ({ challenge, onAnswer, isFinishing, result, containerRef }) => {
    const [isRecording, setIsRecording] = useState(false);
    const [transcript, setTranscript] = useState('');
    const recognitionManager = useRef<SpeechRecognitionManager | null>(null);
    const didAutoSubmit = useRef(false);
    const [localResult, setLocalResult] = useState<ChallengeResult | null>(null);

    useEffect(() => {
        try {
            recognitionManager.current = new SpeechRecognitionManager();
        } catch (e) {
            console.error("Speech Recognition not supported", e);
        }

        return () => {
            recognitionManager.current?.stop();
        };
    }, []);

    useEffect(() => {
        setLocalResult(result);
    }, [result]);

    const startNewRecording = () => {
        if (!recognitionManager.current) return;
        setTranscript(''); 
        setIsRecording(true);
        didAutoSubmit.current = false;
        recognitionManager.current.start(
            (final, interim) => {
                if (didAutoSubmit.current) return;
                const combined = (final + interim).trim();
                setTranscript(combined);

                if (
                    combined.toLowerCase() === challenge.word.word.trim().toLowerCase()
                ) {
                    didAutoSubmit.current = true;
                    setLocalResult(true);
                    recognitionManager.current?.stop();
                    setIsRecording(false);
                    onAnswer(combined);
                }
            },
            (finalTranscript) => {
                setIsRecording(false);
                if (!didAutoSubmit.current) {
                    onAnswer(finalTranscript);
                }
            }
        );
    };

    const stopCurrentRecording = () => {
        recognitionManager.current?.stop();
    };

    const handleToggleRecording = () => {
        if (isRecording) {
            stopCurrentRecording();
        } else {
            startNewRecording();
        }
    };
    
    const isCorrect = localResult === true;
    const hasResult = localResult !== null;
    
    return (
        <div ref={containerRef} className="text-center space-y-8 animate-in fade-in duration-300 flex flex-col items-center">
            <p className="text-sm font-bold text-neutral-500">Press the button and pronounce the word below.</p>
            <h2 className="text-4xl font-black text-neutral-900 tracking-tight">{challenge.word.word}</h2>
            
            <button 
                onClick={handleToggleRecording} 
                disabled={isFinishing}
                className={`w-24 h-24 rounded-full flex items-center justify-center shadow-lg transition-all active:scale-95 disabled:opacity-50
                    ${isRecording ? 'bg-neutral-900 text-white animate-pulse' : 'bg-red-600 text-white hover:scale-105 shadow-red-500/30'}`}
            >
                {isRecording ? <Square size={32} fill="white" /> : <Mic size={32} />}
            </button>
            
            <div className="w-full max-w-sm min-h-[6rem] p-4 bg-neutral-50 border border-neutral-200 rounded-xl text-lg font-medium text-neutral-600 italic">
                {transcript || '...'}
            </div>

            {hasResult && (
                <div className={`flex items-center gap-2 font-bold text-lg animate-in fade-in slide-in-from-bottom-2 ${isCorrect ? 'text-green-600' : 'text-red-600'}`}>
                    {isCorrect ? <CheckCircle size={20} /> : <XCircle size={20} />}
                    <span>
                        {isCorrect
                            ? 'Correct!'
                            : `Not quite. The word was "${challenge.word.word}".`}
                    </span>
                </div>
            )}
        </div>
    );
};
