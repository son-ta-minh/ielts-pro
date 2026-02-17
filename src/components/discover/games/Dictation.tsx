
import React, { useState, useEffect, useRef, useMemo } from 'react';
/* Added ArrowRight to imports */
import { ArrowLeft, ArrowRight, Play, RotateCw, CheckCircle2, XCircle, Keyboard, Mic, Settings2, Server, Book, Loader2, RefreshCw, SkipForward, ChevronDown, ListFilter, Brain, Zap } from 'lucide-react';
import { VocabularyItem } from '../../../app/types';
import { speak } from '../../../utils/audio';
import { getConfig, getServerUrl } from '../../../app/settingsManager';
import { useToast } from '../../../contexts/ToastContext';

interface Props {
    words: VocabularyItem[];
    onComplete: (score: number) => void;
    onExit: () => void;
}

type Difficulty = 'EASY' | 'MEDIUM' | 'HARD' | 'MIXED';
type ContentSource = 'LIBRARY' | 'SERVER';

interface DictationItem {
    id: string;
    originalSentence: string;
    tokenized: { text: string; isMasked: boolean; choices?: string[] }[];
    mode: 'EASY' | 'MEDIUM' | 'HARD';
}

const normalize = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '');

export const Dictation: React.FC<Props> = ({ words, onComplete, onExit }) => {
    // Setup State
    const [gameState, setGameState] = useState<'SETUP' | 'PLAYING' | 'SUMMARY'>('SETUP');
    const [sessionSize, setSessionSize] = useState(10);
    const [difficulty, setDifficulty] = useState<Difficulty>('MEDIUM');
    const [contentSource, setContentSource] = useState<ContentSource>('LIBRARY');
    const [isServerLoading, setIsServerLoading] = useState(false);
    
    // Gameplay State
    const [queue, setQueue] = useState<DictationItem[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [score, setScore] = useState(0);
    
    // Current Input State
    const [userInputs, setUserInputs] = useState<Record<number, string>>({}); // index -> value
    const [hardInput, setHardInput] = useState('');
    const [isChecked, setIsChecked] = useState(false);
    const [isCorrect, setIsCorrect] = useState(false);

    // Refs
    const firstInputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
    const { showToast } = useToast();

    // Helper: Fetch random lines from server folder
    const fetchServerData = async (limit: number): Promise<string[]> => {
        const config = getConfig();
        const serverUrl = getServerUrl(config);
        const mapName = 'Dictation';

        try {
            const listRes = await fetch(`${serverUrl}/api/reading/files/${mapName}`);
            if (!listRes.ok) throw new Error("Could not access 'Dictation' folder on server.");
            
            const listData = await listRes.json();
            const textFiles = (listData.items || []).filter((f: any) => f.type === 'file' && !f.name.startsWith('.'));
            
            if (textFiles.length === 0) throw new Error("No files found in 'Dictation' folder.");

            const shuffledFiles = textFiles.sort(() => Math.random() - 0.5);
            const filesToFetch = shuffledFiles.slice(0, 5); 

            let pool: string[] = [];
            await Promise.all(filesToFetch.map(async (file: any) => {
                try {
                    const contentRes = await fetch(`${serverUrl}/api/reading/content/${mapName}/${encodeURIComponent(file.name)}`);
                    if (contentRes.ok) {
                        const data = await contentRes.json();
                        const textContent = data.essay || "";
                        const lines = textContent.split(/\r?\n/).map((l: string) => l.trim()).filter((l: string) => l.length > 0);
                        pool.push(...lines);
                    }
                } catch (e) { console.warn(`Failed to read file ${file.name}`, e); }
            }));

            if (pool.length === 0) throw new Error("No valid text lines found.");
            return pool.sort(() => Math.random() - 0.5).slice(0, limit);
        } catch (e: any) {
            showToast(e.message || "Server Error", "error");
            return [];
        }
    };

    const startGame = async () => {
        let rawData: string[] = [];

        if (contentSource === 'SERVER') {
            setIsServerLoading(true);
            rawData = await fetchServerData(sessionSize);
            setIsServerLoading(false);
            if (rawData.length === 0) return;
        } else {
            const candidates = words.filter(w => w.example && w.example.trim().split(/\s+/).length >= 4);
            if (candidates.length === 0) {
                showToast("No suitable example sentences found in Library.", "error");
                return;
            }
            rawData = [...candidates].sort(() => Math.random() - 0.5).slice(0, sessionSize).map(w => w.example.trim());
        }

        // Global distractor pool for Easy mode
        const allWordsInPool = rawData.join(' ').split(/\s+/).map(w => w.replace(/[^a-zA-Z]/g, '')).filter(w => w.length > 3);
        const libraryDistractors = words.slice(0, 50).map(w => w.word);
        const globalDistractors = [...new Set([...allWordsInPool, ...libraryDistractors])];
        
        const newQueue: DictationItem[] = rawData.map((originalSentence, idx) => {
            const tokens = originalSentence.split(/\s+/);
            let itemMode = difficulty === 'MIXED' ? (Math.random() > 0.6 ? 'HARD' : (Math.random() > 0.5 ? 'MEDIUM' : 'EASY')) : difficulty;
            
            // Masking logic for Easy/Medium
            const maskIndices = new Set<number>();
            if (itemMode !== 'HARD') {
                const numToMask = Math.max(1, Math.floor(tokens.length * 0.35));
                let attempts = 0;
                while (maskIndices.size < numToMask && attempts < 100) {
                    attempts++;
                    const r = Math.floor(Math.random() * tokens.length);
                    if (/[a-zA-Z]/.test(tokens[r]) && tokens[r].length > 1) maskIndices.add(r);
                }
            }

            const tokenized = tokens.map((t, i) => {
                const isMasked = maskIndices.has(i);
                const cleanText = t.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '');
                
                let choices: string[] | undefined;
                if (isMasked && itemMode === 'EASY') {
                    const distractors = globalDistractors
                        .filter(d => normalize(d) !== normalize(cleanText))
                        .sort(() => Math.random() - 0.5)
                        .slice(0, 3);
                    choices = [cleanText, ...distractors].sort(() => Math.random() - 0.5);
                }

                return { text: t, isMasked, choices };
            });

            return { id: `dict-${idx}-${Date.now()}`, originalSentence, tokenized, mode: itemMode as any };
        });

        setQueue(newQueue);
        setGameState('PLAYING');
        setCurrentIndex(0);
        setScore(0);
        setUserInputs({});
        setHardInput('');
        setIsChecked(false);
        setIsCorrect(false);
        setTimeout(() => speak(newQueue[0].originalSentence), 600);
    };

    const currentItem = queue[currentIndex];

    useEffect(() => {
        if (gameState === 'PLAYING' && !isChecked) {
            setTimeout(() => firstInputRef.current?.focus(), 150);
        }
    }, [currentIndex, gameState, isChecked]);

    /* Added handlePlayAudio function */
    const handlePlayAudio = () => {
        if (currentItem) speak(currentItem.originalSentence);
    };

    /* Added handleSkip function */
    const handleSkip = () => {
        handleNext();
    };

    const handleCheck = () => {
        if (isChecked) return;
        let correct = true;

        if (currentItem.mode === 'HARD') {
            correct = normalize(hardInput) === normalize(currentItem.originalSentence);
        } else {
            currentItem.tokenized.forEach((token, idx) => {
                if (token.isMasked) {
                    const cleanAns = token.text.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '');
                    if (normalize(userInputs[idx] || '') !== normalize(cleanAns)) correct = false;
                }
            });
        }

        setIsCorrect(correct);
        setIsChecked(true);
        if (correct) {
            const multiplier = currentItem.mode === 'HARD' ? 25 : (currentItem.mode === 'MEDIUM' ? 15 : 10);
            setScore(s => s + multiplier);
        }
    };

    const handleNext = () => {
        if (currentIndex < queue.length - 1) {
            setCurrentIndex(prev => prev + 1);
            setUserInputs({});
            setHardInput('');
            setIsChecked(false);
            setIsCorrect(false);
            setTimeout(() => speak(queue[currentIndex + 1].originalSentence), 500);
        } else {
            onComplete(score);
        }
    };

    const renderEasyMode = () => (
        <div className="flex flex-wrap gap-x-2 gap-y-4 justify-center items-center leading-relaxed">
            {currentItem.tokenized.map((token, idx) => {
                if (!token.isMasked) return <span key={idx} className="text-lg font-medium text-neutral-600">{token.text}</span>;
                
                const val = userInputs[idx] || '';
                const cleanAns = token.text.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '');
                const isItemCorrect = isChecked && normalize(val) === normalize(cleanAns);

                return (
                    <div key={idx} className="relative inline-flex items-center min-w-[80px]">
                        <select
                            ref={idx === currentItem.tokenized.findIndex(t => t.isMasked) ? (firstInputRef as any) : null}
                            value={val}
                            disabled={isChecked}
                            onChange={(e) => setUserInputs(prev => ({...prev, [idx]: e.target.value}))}
                            className={`appearance-none w-full px-3 py-1.5 rounded-lg border-2 text-sm font-bold transition-all outline-none pr-8 ${isChecked ? (isItemCorrect ? 'bg-green-50 border-green-500 text-green-700' : 'bg-red-50 border-red-500 text-red-700') : 'bg-white border-neutral-200 focus:border-indigo-500'}`}
                        >
                            <option value="">...</option>
                            {token.choices?.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <ChevronDown size={14} className="absolute right-2 text-neutral-400 pointer-events-none" />
                        {isChecked && !isItemCorrect && <div className="absolute -bottom-5 left-0 text-[10px] font-black text-green-600 uppercase">{cleanAns}</div>}
                    </div>
                );
            })}
        </div>
    );

    const renderMediumMode = () => (
        <div className="flex flex-wrap gap-x-2 gap-y-5 justify-center items-center leading-relaxed">
            {currentItem.tokenized.map((token, idx) => {
                if (!token.isMasked) return <span key={idx} className="text-lg font-medium text-neutral-600">{token.text}</span>;
                
                const val = userInputs[idx] || '';
                const cleanAns = token.text.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '');
                const isItemCorrect = isChecked && normalize(val) === normalize(cleanAns);

                return (
                    <div key={idx} className="relative inline-flex flex-col items-center">
                        <input
                            ref={idx === currentItem.tokenized.findIndex(t => t.isMasked) ? (firstInputRef as any) : null}
                            type="text"
                            value={val}
                            disabled={isChecked}
                            onChange={(e) => setUserInputs(prev => ({...prev, [idx]: e.target.value}))}
                            onKeyDown={e => e.key === 'Enter' && handleCheck()}
                            className={`w-24 text-center px-2 py-1.5 rounded-lg border-b-2 font-bold text-sm outline-none transition-all ${isChecked ? (isItemCorrect ? 'bg-green-50 border-green-500 text-green-700' : 'bg-red-50 border-red-500 text-red-700') : 'bg-neutral-50 border-neutral-300 focus:bg-white focus:border-indigo-600'}`}
                            autoComplete="off"
                        />
                        {isChecked && !isItemCorrect && <div className="absolute -bottom-5 text-[10px] font-black text-green-600 uppercase">{cleanAns}</div>}
                    </div>
                );
            })}
        </div>
    );

    const renderHardMode = () => (
        <div className="w-full max-w-2xl space-y-4">
            <textarea
                ref={firstInputRef as any}
                value={hardInput}
                onChange={e => setHardInput(e.target.value)}
                disabled={isChecked}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleCheck())}
                placeholder="Type the full sentence..."
                className={`w-full p-5 rounded-3xl border-2 text-lg font-medium resize-none outline-none transition-all h-32 ${isChecked ? (isCorrect ? 'bg-green-50 border-green-500 text-green-800' : 'bg-red-50 border-red-500 text-red-800') : 'bg-white border-neutral-200 focus:border-indigo-600 focus:ring-4 focus:ring-indigo-100'}`}
            />
            {isChecked && !isCorrect && (
                <div className="p-5 bg-green-50 border border-green-100 rounded-2xl animate-in slide-in-from-top-2">
                    <p className="text-[10px] font-black text-green-600 uppercase tracking-widest mb-1">Correct Answer</p>
                    <p className="text-base font-bold text-green-900 leading-relaxed">{currentItem.originalSentence}</p>
                </div>
            )}
        </div>
    );

    if (gameState === 'SETUP') {
        const DiffButton = ({ id, label, icon: Icon, desc }: any) => (
            <button
                onClick={() => setDifficulty(id)}
                className={`p-4 rounded-2xl border-2 transition-all text-left flex flex-col gap-2 ${difficulty === id ? 'border-cyan-500 bg-cyan-50 shadow-md' : 'border-neutral-100 bg-white hover:border-neutral-300'}`}
            >
                <div className="flex items-center gap-2">
                    <div className={`p-1.5 rounded-lg ${difficulty === id ? 'bg-cyan-500 text-white' : 'bg-neutral-100 text-neutral-400'}`}><Icon size={16}/></div>
                    <span className={`text-xs font-black uppercase tracking-wider ${difficulty === id ? 'text-cyan-700' : 'text-neutral-500'}`}>{label}</span>
                </div>
                <p className="text-[10px] font-bold text-neutral-400 leading-tight">{desc}</p>
            </button>
        );

        return (
            <div className="flex flex-col h-full relative p-6 justify-center items-center text-center space-y-8 animate-in fade-in">
                <div className="space-y-2">
                    <div className="w-16 h-16 bg-cyan-100 text-cyan-600 rounded-full flex items-center justify-center mx-auto mb-4"><Keyboard size={32} /></div>
                    <h2 className="text-3xl font-black text-neutral-900 tracking-tight">Dictation Lab</h2>
                    <p className="text-neutral-500 font-medium max-w-sm">Bridge the gap between hearing and writing.</p>
                </div>

                <div className="w-full max-w-xl grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-white p-6 rounded-[2.5rem] border border-neutral-200 shadow-sm space-y-6">
                        <div className="space-y-3">
                            <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block text-left">Source</span>
                            <div className="grid grid-cols-2 gap-2">
                                <button onClick={() => setContentSource('LIBRARY')} className={`flex flex-col items-center p-3 rounded-xl border-2 transition-all ${contentSource === 'LIBRARY' ? 'bg-indigo-50 border-indigo-500 text-indigo-700' : 'bg-white border-neutral-100 text-neutral-500'}`}><Book size={18} className="mb-1"/><span className="text-[9px] font-black uppercase">Library</span></button>
                                <button onClick={() => setContentSource('SERVER')} className={`flex flex-col items-center p-3 rounded-xl border-2 transition-all ${contentSource === 'SERVER' ? 'bg-indigo-50 border-indigo-500 text-indigo-700' : 'bg-white border-neutral-100 text-neutral-500'}`}><Server size={18} className="mb-1"/><span className="text-[9px] font-black uppercase">Server</span></button>
                            </div>
                        </div>
                        <div className="space-y-3">
                            <div className="flex justify-between items-center"><span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Session Size</span><span className="text-xl font-black text-cyan-600">{sessionSize}</span></div>
                            <input type="range" min="5" max="30" step="5" value={sessionSize} onChange={e => setSessionSize(parseInt(e.target.value))} className="w-full h-1.5 bg-neutral-100 rounded-lg appearance-none cursor-pointer accent-cyan-500" />
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-[2.5rem] border border-neutral-200 shadow-sm space-y-4">
                        <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block text-left px-1">Difficulty</span>
                        <div className="grid grid-cols-1 gap-2">
                            <DiffButton id="EASY" label="Easy" icon={ListFilter} desc="Select from dropdown options." />
                            <DiffButton id="MEDIUM" label="Medium" icon={Zap} desc="Type in missing words." />
                            <DiffButton id="HARD" label="Hard" icon={Brain} desc="Transcribe the full sentence." />
                        </div>
                    </div>
                </div>

                <div className="flex gap-4">
                    <button onClick={onExit} className="px-10 py-4 bg-white border border-neutral-200 text-neutral-500 font-bold rounded-2xl hover:bg-neutral-50 transition-all">Back</button>
                    <button onClick={startGame} disabled={isServerLoading} className="px-12 py-4 bg-cyan-600 text-white font-black text-sm uppercase tracking-widest rounded-2xl hover:bg-cyan-700 transition-all shadow-xl active:scale-95 flex items-center gap-2">
                        {isServerLoading ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} fill="white"/>} Start
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full relative p-6 max-w-4xl mx-auto">
            <header className="flex justify-between items-center mb-8 shrink-0">
                <button onClick={onExit} className="flex items-center gap-2 text-neutral-400 hover:text-neutral-900 transition-colors font-bold text-sm"><ArrowLeft size={18}/> Quit</button>
                <div className="flex flex-col items-center">
                    <span className="text-[10px] font-black uppercase text-neutral-300 tracking-widest">Level {currentIndex + 1} of {queue.length} • {currentItem.mode}</span>
                    <div className="h-1 w-32 bg-neutral-100 rounded-full mt-1.5 overflow-hidden">
                        <div className="h-full bg-cyan-500 transition-all duration-300" style={{ width: `${(currentIndex / queue.length) * 100}%` }} />
                    </div>
                </div>
                <div className="px-6 py-2 bg-neutral-900 text-white rounded-full font-black text-lg shadow-lg tracking-widest">{score}</div>
            </header>

            <div className="flex-1 flex flex-col items-center justify-center space-y-12">
                <button onClick={handlePlayAudio} className="w-28 h-28 bg-cyan-50 text-cyan-600 rounded-full flex items-center justify-center shadow-xl hover:scale-105 transition-all group active:scale-95">
                    <Play size={48} className="ml-1.5 fill-cyan-600 group-hover:scale-110 transition-transform" />
                </button>

                <div className="w-full min-h-[160px] flex items-center justify-center px-4">
                    {currentItem.mode === 'EASY' ? renderEasyMode() : currentItem.mode === 'MEDIUM' ? renderMediumMode() : renderHardMode()}
                </div>

                <div className="w-full max-w-xs flex gap-3">
                    {!isChecked ? (
                        <>
                            <button onClick={handleSkip} className="flex-1 py-4 bg-white border-2 border-neutral-200 text-neutral-400 font-black text-xs uppercase tracking-widest rounded-2xl hover:text-neutral-600 hover:border-neutral-300 transition-all">Skip</button>
                            <button onClick={handleCheck} className="flex-[2] py-4 bg-neutral-900 text-white font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-neutral-800 transition-all shadow-xl shadow-neutral-900/10 active:scale-95">Check Answer</button>
                        </>
                    ) : (
                        <button onClick={handleNext} className={`w-full py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-xl active:scale-95 ${isCorrect ? 'bg-emerald-600 text-white shadow-emerald-200' : 'bg-neutral-900 text-white'}`}>
                            <span>{currentIndex === queue.length - 1 ? 'Finish' : 'Next Item'}</span>
                            <ArrowRight size={16} />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
