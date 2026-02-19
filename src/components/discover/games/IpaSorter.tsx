
import React, { useState, useMemo, useRef } from 'react';
import { ArrowLeft, Lock, Zap, Layers, CheckCircle2 } from 'lucide-react';
import { VocabularyItem } from '../../../app/types';

interface Props {
    words: VocabularyItem[];
    onComplete: (score: number) => void;
    onExit: () => void;
    onBulkUpdate: (words: VocabularyItem[]) => Promise<void>;
}

interface IpaItem {
    id: string;
    wordObj: VocabularyItem;
    word: string;
    ipa: string;
    maskedIpa: string;
    targetSymbol: string;
}

interface ContrastDefinition {
    id: string;
    sym1: string;
    sym2: string;
    label: string; // "Short i vs long ee"
    example: string; // "sit vs seat"
    category: 'VOWELS' | 'CONSONANTS' | 'DIPHTHONGS';
}

const CONTRAST_DATA: ContrastDefinition[] = [
    // Vowels
    { id: 'i_ii', sym1: 'ɪ', sym2: 'iː', label: 'Short i vs Long ee', example: 'sit / seat', category: 'VOWELS' },
    { id: 'u_uu', sym1: 'ʊ', sym2: 'uː', label: 'Short u vs Long oo', example: 'full / fool', category: 'VOWELS' },
    { id: 'ae_e', sym1: 'æ', sym2: 'e', label: 'Short a vs Short e', example: 'man / men', category: 'VOWELS' },
    { id: 'ae_v', sym1: 'æ', sym2: 'ʌ', label: 'Short a vs Short u', example: 'cat / cut', category: 'VOWELS' },
    { id: 'o_or', sym1: 'ɒ', sym2: 'ɔː', label: 'Short o vs Long aw', example: 'cot / caught', category: 'VOWELS' },
    { id: 'er_or', sym1: 'ɜː', sym2: 'ɔː', label: 'Stressed er vs aw', example: 'bird / board', category: 'VOWELS' },
    { id: 'aa_ae', sym1: 'ɑː', sym2: 'æ', label: 'Long a vs Short a', example: 'cart / cat', category: 'VOWELS' },
    
    // Consonants
    { id: 'th_t', sym1: 'θ', sym2: 't', label: 'Voiceless TH vs T', example: 'think / tin', category: 'CONSONANTS' },
    { id: 'dh_d', sym1: 'ð', sym2: 'd', label: 'Voiced TH vs D', example: 'this / dis', category: 'CONSONANTS' },
    { id: 's_sh', sym1: 's', sym2: 'ʃ', label: 'S vs SH', example: 'see / she', category: 'CONSONANTS' },
    { id: 'ch_j', sym1: 'tʃ', sym2: 'dʒ', label: 'CH vs J', example: 'cheap / jeep', category: 'CONSONANTS' },
    { id: 'f_v', sym1: 'f', sym2: 'v', label: 'F vs V', example: 'fan / van', category: 'CONSONANTS' },
    { id: 'b_p', sym1: 'b', sym2: 'p', label: 'B vs P', example: 'bat / pat', category: 'CONSONANTS' },
    { id: 'k_g', sym1: 'k', sym2: 'g', label: 'K vs G', example: 'coat / goat', category: 'CONSONANTS' },
    { id: 's_z', sym1: 's', sym2: 'z', label: 'S vs Z', example: 'rice / rise', category: 'CONSONANTS' },
    { id: 't_d_ed', sym1: 't', sym2: 'd', label: 'Past tense -ed', example: 'worked / played', category: 'CONSONANTS' },
    { id: 'ng_n', sym1: 'ŋ', sym2: 'n', label: 'Final NG vs N', example: 'sing / sin', category: 'CONSONANTS' },
    { id: 'r_l', sym1: 'r', sym2: 'l', label: 'R vs L', example: 'right / light', category: 'CONSONANTS' },

    // Diphthongs & Others
    { id: 'ay_ae', sym1: 'eɪ', sym2: 'æ', label: 'Diphthong ay vs Short a', example: 'face / fat', category: 'DIPHTHONGS' },
    { id: 'ai_ii', sym1: 'aɪ', sym2: 'iː', label: 'Diphthong ai vs Long ee', example: 'time / team', category: 'DIPHTHONGS' },
    { id: 'oh_aw', sym1: 'əʊ', sym2: 'ɔː', label: 'Diphthong oh vs aw', example: 'go / saw', category: 'DIPHTHONGS' },
    { id: 'ear_ee', sym1: 'ɪə', sym2: 'iː', label: 'ear vs ee', example: 'here / he', category: 'DIPHTHONGS' },
    { id: 'air_ae', sym1: 'eə', sym2: 'æ', label: 'air vs short a', example: 'hair / hat', category: 'DIPHTHONGS' },
];

export const IpaSorter: React.FC<Props> = ({ words, onComplete, onExit, onBulkUpdate }) => {
    const [gameState, setGameState] = useState<'SETUP' | 'PLAYING'>('SETUP');
    const [playMode, setPlayMode] = useState<'MASTER' | 'ALL'>('MASTER');
    const [selectedContrast, setSelectedContrast] = useState<ContrastDefinition | null>(null);

    const [ipaItems, setIpaItems] = useState<IpaItem[]>([]);
    const [score, setScore] = useState(0);
    const [feedback, setFeedback] = useState<{ symbol: string, correct: boolean } | null>(null);

    const modifiedWordsRef = useRef<Map<string, VocabularyItem>>(new Map());

    // Regex logic to safely detect phonemes
    const hasPhoneme = (ipa: string, phoneme: string): boolean => {
        if (!ipa) return false;
        
        if ((phoneme === 't' || phoneme === 'd') && (ipa.includes('tʃ') || ipa.includes('dʒ'))) {
             // Logic handled by regex lookaheads below
        }

        const escaped = phoneme.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        let regex: RegExp;
        
        if (phoneme === 'd') regex = new RegExp(`${escaped}(?!ʒ)`);
        else if (phoneme === 't') regex = new RegExp(`${escaped}(?!ʃ)`);
        else if (phoneme === 'ʃ') regex = new RegExp(`(?<!t)${escaped}`);
        else if (phoneme === 'ʒ') regex = new RegExp(`(?<!d)${escaped}`);
        else if (phoneme === 'ɪ') regex = new RegExp(`(?<![aeɔ])${escaped}(?!ə)`); 
        else if (phoneme === 'ʊ') regex = new RegExp(`(?<![aə])${escaped}`); 
        else if (phoneme === 'e') regex = new RegExp(`${escaped}(?!ɪ|ə)`); 
        else if (phoneme === 'ə') regex = new RegExp(`(?<![ɪʊe])${escaped}(?!ʊ)`); 
        else regex = new RegExp(escaped);
    
        return regex.test(ipa);
    };

    // Calculate stats
    const statsMap = useMemo(() => {
        const map = new Map<string, { total: number, correct: number, availableForMaster: number }>();
        const validWords = words.filter(w => w.ipaUs && w.ipaUs.length > 2);

        CONTRAST_DATA.forEach(contrast => {
            const relevantWords = validWords.filter(w => 
                hasPhoneme(w.ipaUs!, contrast.sym1) || hasPhoneme(w.ipaUs!, contrast.sym2)
            );
            
            const total = relevantWords.length;
            const correctCount = relevantWords.filter(w => {
                const key = `IPA_SORTER:${contrast.id}`;
                return w.lastTestResults && w.lastTestResults[key] === true;
            }).length;

            const availableForMaster = relevantWords.filter(w => {
                 const key = `IPA_SORTER:${contrast.id}`;
                 // In Master mode: we want words that are NOT correct (undefined or false)
                 return !w.lastTestResults || w.lastTestResults[key] !== true;
            }).length;

            map.set(contrast.id, { total, correct: correctCount, availableForMaster });
        });
        return map;
    }, [words]);

    const startGame = (contrast: ContrastDefinition) => {
        const validWords = words.filter(w => w.ipaUs && w.ipaUs.length > 2);
        
        let candidates = validWords.filter(w => hasPhoneme(w.ipaUs!, contrast.sym1) || hasPhoneme(w.ipaUs!, contrast.sym2));
        
        if (playMode === 'MASTER') {
            candidates = candidates.filter(w => {
                const key = `IPA_SORTER:${contrast.id}`;
                return !w.lastTestResults || w.lastTestResults[key] !== true;
            });
        }

        if (candidates.length < 3) {
            alert(`Not enough words found for this mode (${candidates.length}). Try 'Review All' or add more words.`);
            return;
        }

        const queue: IpaItem[] = [];
        const shuffled = candidates.sort(() => Math.random() - 0.5).slice(0, 15);

        for (const w of shuffled) {
            const has1 = hasPhoneme(w.ipaUs!, contrast.sym1);
            const has2 = hasPhoneme(w.ipaUs!, contrast.sym2);
            
            const targetSymbol = (has1 && has2) ? (Math.random() > 0.5 ? contrast.sym1 : contrast.sym2) : (has1 ? contrast.sym1 : contrast.sym2);

            // Masking Logic
            const escaped = targetSymbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            let regex: RegExp;
            
            if (targetSymbol === 'd') regex = new RegExp(`${escaped}(?!ʒ)`, 'g');
            else if (targetSymbol === 't') regex = new RegExp(`${escaped}(?!ʃ)`, 'g');
            else if (targetSymbol === 'ʃ') regex = new RegExp(`(?<!t)${escaped}`, 'g');
            else if (targetSymbol === 'ʒ') regex = new RegExp(`(?<!d)${escaped}`, 'g');
            else if (targetSymbol === 'ɪ') regex = new RegExp(`(?<![aeɔ])${escaped}(?!ə)`, 'g');
            else if (targetSymbol === 'e') regex = new RegExp(`${escaped}(?!ɪ|ə)`, 'g');
            else regex = new RegExp(escaped, 'g');

            const maskedIpa = w.ipaUs!.replace(regex, '___');

            queue.push({ id: w.id, wordObj: w, word: w.word, ipa: w.ipaUs!, maskedIpa, targetSymbol });
        }

        setIpaItems(queue);
        setSelectedContrast(contrast);
        setScore(0);
        setGameState('PLAYING');
    };

    const handleDrop = (bucketSymbol: string) => {
        const currentItem = ipaItems[0];
        if (!currentItem || feedback || !selectedContrast) return;

        const isCorrect = currentItem.targetSymbol === bucketSymbol;
        setFeedback({ symbol: bucketSymbol, correct: isCorrect });

        const newScore = isCorrect ? score + 10 : Math.max(0, score - 5);
        setScore(newScore);

        // Update History
        const resultKey = `IPA_SORTER:${selectedContrast.id}`;
        const updatedWord = { ...currentItem.wordObj };
        if (!updatedWord.lastTestResults) updatedWord.lastTestResults = {};
        updatedWord.lastTestResults[resultKey] = isCorrect;
        updatedWord.updatedAt = Date.now();
        modifiedWordsRef.current.set(updatedWord.id, updatedWord);

        setTimeout(() => {
            const nextQueue = ipaItems.slice(1);
            setIpaItems(nextQueue);
            setFeedback(null);
            if (nextQueue.length === 0) {
                // Save progress
                onBulkUpdate(Array.from(modifiedWordsRef.current.values()));
                modifiedWordsRef.current.clear();
                onComplete(newScore);
            }
        }, 800);
    };
    
    const handleBack = () => {
        if (modifiedWordsRef.current.size > 0) {
            onBulkUpdate(Array.from(modifiedWordsRef.current.values()));
            modifiedWordsRef.current.clear();
        }
        if (gameState === 'PLAYING') {
             setGameState('SETUP');
        } else {
            onExit();
        }
    };

    // --- RENDER SETUP ---
    if (gameState === 'SETUP') {
        const renderContrastButton = (contrast: ContrastDefinition) => {
            const stats = statsMap.get(contrast.id) || { total: 0, correct: 0, availableForMaster: 0 };
            const isAvailable = stats.total >= 3; 
            const isPlayable = playMode === 'ALL' ? isAvailable : (stats.availableForMaster >= 3);

            // Badge styling logic
            const percent = stats.total > 0 ? (stats.correct / stats.total) * 100 : 0;
            let badgeClass = "text-neutral-500 bg-neutral-100 border-neutral-200";
            
            if (!isAvailable) {
                 badgeClass = "text-neutral-300 bg-neutral-50 border-neutral-100";
            } else if (percent >= 80) {
                 badgeClass = "text-emerald-700 bg-emerald-100 border-emerald-200";
            } else if (percent > 0) {
                 badgeClass = "text-amber-700 bg-amber-100 border-amber-200";
            } else {
                 badgeClass = "text-rose-700 bg-rose-100 border-rose-200";
            }

            return (
                <button 
                    key={contrast.id}
                    onClick={() => isPlayable && startGame(contrast)}
                    disabled={!isPlayable}
                    className={`
                        w-full flex flex-col gap-1 p-3 rounded-xl border transition-all text-left relative overflow-hidden group shrink-0
                        ${isPlayable 
                            ? 'bg-white border-neutral-100 hover:border-indigo-400 hover:bg-indigo-50/30 cursor-pointer shadow-sm' 
                            : 'bg-neutral-50 border-neutral-100 opacity-60 cursor-not-allowed'
                        }
                    `}
                >
                    <div className="flex justify-between items-center w-full">
                        <div className="flex items-center gap-1.5">
                            <span className="text-xs font-black text-neutral-800 font-serif">/{contrast.sym1}/ vs /{contrast.sym2}/</span>
                            {!isAvailable && <Lock size={10} className="text-neutral-400" />}
                        </div>
                        {isAvailable && (
                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full border ${badgeClass}`}>
                                {stats.correct}/{stats.total}
                            </span>
                        )}
                    </div>
                    <p className="text-[10px] text-neutral-400 font-medium truncate">{contrast.example}</p>
                </button>
            );
        };

        const vowels = CONTRAST_DATA.filter(c => c.category === 'VOWELS');
        const diphthongs = CONTRAST_DATA.filter(c => c.category === 'DIPHTHONGS');
        const consonants = CONTRAST_DATA.filter(c => c.category === 'CONSONANTS');
        
        // Split consonants for 4-column layout on desktop
        const splitIndex = Math.ceil(consonants.length / 2);
        const consonantsLeft = consonants.slice(0, splitIndex);
        const consonantsRight = consonants.slice(splitIndex);

        return (
             <div className="flex flex-col h-full relative p-6 bg-white animate-in fade-in">
                <header className="flex flex-col gap-4 mb-4 shrink-0">
                    <div className="flex justify-between items-center">
                        <button onClick={handleBack} className="flex items-center gap-2 text-neutral-400 hover:text-neutral-900 transition-colors font-bold text-sm"><ArrowLeft size={18}/> Back</button>
                        <div className="flex flex-col items-center">
                             <h2 className="text-lg font-black text-neutral-900 tracking-tight">Phonetic Accuracy</h2>
                             <p className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest">Select a pair to practice</p>
                        </div>
                        <div className="w-10"></div>
                    </div>
                    
                    {/* Mode Toggle */}
                    <div className="flex flex-col items-center gap-2 self-center">
                        <div className="flex bg-neutral-100 p-1 rounded-xl shadow-sm">
                            <button 
                                onClick={() => setPlayMode('MASTER')}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${playMode === 'MASTER' ? 'bg-white text-indigo-600 shadow-sm' : 'text-neutral-400 hover:text-neutral-600'}`}
                            >
                                <Zap size={10} fill={playMode === 'MASTER' ? "currentColor" : "none"} /> Master It
                            </button>
                            <button 
                                onClick={() => setPlayMode('ALL')}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${playMode === 'ALL' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-400 hover:text-neutral-600'}`}
                            >
                                <Layers size={10} /> Review All
                            </button>
                        </div>
                        <p className="text-[9px] text-neutral-400 font-bold">{playMode === 'MASTER' ? "Focus on unmastered words" : "Practice with full library"}</p>
                    </div>
                </header>
                
                {/* Main Scrollable Container */}
                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 md:gap-4 pb-10">
                        
                        {/* Vowels Column */}
                        <div className="flex flex-col gap-2">
                            <h3 className="sticky top-0 bg-white z-10 py-2 text-[9px] font-black uppercase text-indigo-400 tracking-widest px-1 border-b border-neutral-100">Vowels</h3>
                            <div className="flex flex-col gap-2">
                                {vowels.map(renderContrastButton)}
                            </div>
                        </div>

                        {/* Consonants Column 1 */}
                        <div className="flex flex-col gap-2">
                            <h3 className="sticky top-0 bg-white z-10 py-2 text-[9px] font-black uppercase text-emerald-400 tracking-widest px-1 border-b border-neutral-100">Consonants</h3>
                            <div className="flex flex-col gap-2">
                                {consonantsLeft.map(renderContrastButton)}
                            </div>
                        </div>

                         {/* Consonants Column 2 */}
                        <div className="flex flex-col gap-2">
                            <h3 className="sticky top-0 bg-white z-10 py-2 text-[9px] font-black uppercase text-emerald-400 tracking-widest px-1 border-b border-neutral-100 md:text-transparent select-none">Consonants</h3>
                            <div className="flex flex-col gap-2">
                                {consonantsRight.map(renderContrastButton)}
                            </div>
                        </div>

                        {/* Diphthongs Column */}
                        <div className="flex flex-col gap-2">
                            <h3 className="sticky top-0 bg-white z-10 py-2 text-[9px] font-black uppercase text-amber-400 tracking-widest px-1 border-b border-neutral-100">Diphthongs</h3>
                            <div className="flex flex-col gap-2">
                                {diphthongs.map(renderContrastButton)}
                            </div>
                        </div>
                    </div>
                </div>
             </div>
        );
    }

    // --- RENDER GAME ---
    const currentItem = ipaItems[0];
    
    return (
        <div className="flex flex-col h-full relative p-6">
            <div className="flex justify-between items-center mb-2 shrink-0">
                <button onClick={handleBack} className="flex items-center gap-2 text-neutral-400 hover:text-neutral-900 transition-colors font-bold text-sm"><ArrowLeft size={18}/> Pairs</button>
                <div className="px-6 py-2 bg-neutral-900 text-white rounded-full font-black text-lg shadow-lg tracking-widest">{score}</div>
                <div className="text-neutral-400 font-bold text-sm uppercase tracking-widest">IPA Sorter</div>
            </div>

            {selectedContrast && (
                <div className="text-center mb-6 animate-in slide-in-from-top-2">
                    <span className="inline-block px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-bold border border-indigo-100">
                        {selectedContrast.label} <span className="opacity-50 mx-1">•</span> <span className="italic font-normal">{selectedContrast.example}</span>
                    </span>
                </div>
            )}

            <div className="flex-1 flex flex-col relative">
                <div className="flex-1 flex items-center justify-center relative">
                    {currentItem ? (
                        <div className="bg-white px-10 py-16 rounded-[2rem] shadow-2xl border border-neutral-200 text-center space-y-4 animate-in zoom-in duration-300 w-full max-w-sm mx-auto z-10 hover:scale-105 transition-transform">
                            <h3 className="text-4xl font-black text-neutral-900">{currentItem.word}</h3>
                            <div className="inline-block bg-neutral-100 px-6 py-3 rounded-xl border border-neutral-200">
                                <p className="text-xl font-mono font-medium text-neutral-500 tracking-wide">
                                    {currentItem.maskedIpa.split('___').map((part, i, arr) => (
                                        <React.Fragment key={i}>
                                            {part}
                                            {i < arr.length - 1 && <span className="text-rose-500 font-bold bg-rose-50 px-1 rounded mx-0.5">?</span>}
                                        </React.Fragment>
                                    ))}
                                </p>
                            </div>
                            <p className="text-neutral-400 font-bold text-xs uppercase tracking-widest pt-2">Which sound fits?</p>
                        </div>
                    ) : (
                        <div className="text-neutral-300 font-black text-xl flex flex-col items-center gap-2">
                             <CheckCircle2 size={40} className="text-green-500" />
                             <span>Session Complete</span>
                        </div>
                    )}
                </div>

                <div className="h-40 grid grid-cols-2 gap-6 mt-4 shrink-0 max-w-lg mx-auto w-full">
                    {[selectedContrast!.sym1, selectedContrast!.sym2].map((symbol, idx) => {
                        const isFeedbackTarget = feedback && feedback.symbol === symbol;
                        const isCorrectFeedback = isFeedbackTarget && feedback.correct;
                        const isIncorrectFeedback = isFeedbackTarget && !feedback.correct;
                        
                        let buttonClasses = "border-2 rounded-[2.5rem] flex flex-col items-center justify-center transition-all group p-4 shadow-sm";
                        let textClasses = "text-neutral-400 group-hover:text-indigo-400";
                    
                        if (isCorrectFeedback) {
                            buttonClasses += " bg-emerald-50 border-solid border-emerald-400 text-emerald-600 ring-4 ring-emerald-100";
                            textClasses = "text-emerald-500";
                        } else if (isIncorrectFeedback) {
                            buttonClasses += " bg-rose-50 border-solid border-rose-400 text-rose-600 ring-4 ring-rose-100";
                            textClasses = "text-rose-500";
                        } else {
                            buttonClasses += " bg-white border-neutral-200 hover:border-indigo-400 hover:shadow-lg hover:-translate-y-1 active:scale-95";
                        }

                        return (
                            <button key={idx} onClick={() => handleDrop(symbol)} disabled={!!feedback || !currentItem} className={buttonClasses}>
                                <span className="text-6xl font-serif font-medium mb-1">/{symbol}/</span>
                                <span className={`text-[10px] font-black uppercase tracking-widest ${textClasses}`}>Tap to Select</span>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
