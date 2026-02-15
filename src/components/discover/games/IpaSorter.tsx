
import React, { useState, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { VocabularyItem } from '../../../app/types';

interface Props {
    words: VocabularyItem[];
    onComplete: (score: number) => void;
    onExit: () => void;
}

interface IpaItem {
    id: string;
    word: string;
    ipa: string;
    maskedIpa: string;
    targetSymbol: string;
}

const MINIMAL_PAIR_CONTRASTS = [
    { sym1: 'i:', ex1: 'Sheep', sym2: 'ɪ', ex2: 'Ship' },
    { sym1: 'u:', ex1: 'Pool', sym2: 'ʊ', ex2: 'Pull' },
    { sym1: 'æ', ex1: 'Bad', sym2: 'e', ex2: 'Bed' },
    { sym1: 'æ', ex1: 'Cat', sym2: 'ʌ', ex2: 'Cut' },
    { sym1: 'ɑ:', ex1: 'Car', sym2: 'æ', ex2: 'Cat' },
    { sym1: 'ɒ', ex1: 'Pot', sym2: 'ɔ:', ex2: 'Port' },
    { sym1: 'eɪ', ex1: 'Late', sym2: 'e', ex2: 'Let' },
    { sym1: 'əʊ', ex1: 'Coat', sym2: 'ɔ:', ex2: 'Caught' },
    { sym1: 's', ex1: 'See', sym2: 'ʃ', ex2: 'She' },
    { sym1: 'ʃ', ex1: 'Shop', sym2: 'tʃ', ex2: 'Chop' },
    { sym1: 'tʃ', ex1: 'Choke', sym2: 'dʒ', ex2: 'Joke' },
    { sym1: 'θ', ex1: 'Think', sym2: 's', ex2: 'Sink' },
    { sym1: 'ð', ex1: 'Then', sym2: 'd', ex2: 'Den' },
    { sym1: 'θ', ex1: 'Three', sym2: 't', ex2: 'Tree' },
    { sym1: 'n', ex1: 'No', sym2: 'l', ex2: 'Low' },
    { sym1: 'n', ex1: 'Thin', sym2: 'ŋ', ex2: 'Thing' },
    { sym1: 'v', ex1: 'Vet', sym2: 'w', ex2: 'Wet' }
];

export const IpaSorter: React.FC<Props> = ({ words, onComplete, onExit }) => {
    const [ipaItems, setIpaItems] = useState<IpaItem[]>([]);
    const [buckets, setBuckets] = useState<{symbol: string, example: string}[]>([]);
    const [score, setScore] = useState(0);
    const [feedback, setFeedback] = useState<{ symbol: string, correct: boolean } | null>(null);

    useEffect(() => {
        const hasPhoneme = (ipa: string, phoneme: string): boolean => {
            if (phoneme === 'tʃ' || phoneme === 'dʒ') return ipa.includes(phoneme);
            
            const escaped = phoneme.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            let regex: RegExp;
            
            if (phoneme === 'd') regex = new RegExp(`${escaped}(?!ʒ)`);
            else if (phoneme === 't') regex = new RegExp(`${escaped}(?!ʃ)`);
            else if (phoneme === 'ʃ') regex = new RegExp(`(?<!t)${escaped}`);
            else if (phoneme === 'ʒ') regex = new RegExp(`(?<!d)${escaped}`);
            // Diphthong parts
            else if (phoneme === 'ɪ') regex = new RegExp(`(?<![aeɔ])${escaped}`);
            else if (phoneme === 'ʊ') regex = new RegExp(`(?<![aə])${escaped}`);
            else if (phoneme === 'e') regex = new RegExp(`${escaped}(?!ɪ)`);
            else return ipa.includes(phoneme);
        
            return regex.test(ipa);
        };

        const validWords = words.filter(w => w.ipaUs && w.ipaUs.length > 2);
        if (validWords.length < 5) {
            alert("Not enough words with IPA found (need at least 5).");
            onExit();
            return;
        }

        const viableContrasts = [];
        for (const contrast of MINIMAL_PAIR_CONTRASTS) {
            const count1 = validWords.filter(w => hasPhoneme(w.ipaUs!, contrast.sym1)).length;
            const count2 = validWords.filter(w => hasPhoneme(w.ipaUs!, contrast.sym2)).length;
            if (count1 >= 2 && count2 >= 2 && count1 + count2 >= 5) {
                viableContrasts.push(contrast);
            }
        }

        if (viableContrasts.length === 0) {
            alert("Could not find enough words matching minimal pairs.");
            onExit();
            return;
        }

        const contrast = viableContrasts[Math.floor(Math.random() * viableContrasts.length)];
        setBuckets([
            { symbol: contrast.sym1, example: contrast.ex1 },
            { symbol: contrast.sym2, example: contrast.ex2 }
        ]);

        const queue: IpaItem[] = [];
        const shuffledWords = [...validWords].sort(() => Math.random() - 0.5);

        for (const w of shuffledWords) {
            const has1 = hasPhoneme(w.ipaUs!, contrast.sym1);
            const has2 = hasPhoneme(w.ipaUs!, contrast.sym2);
            if (has1 || has2) {
                let targetSymbol = '';
                if (has1 && has2) targetSymbol = Math.random() > 0.5 ? contrast.sym1 : contrast.sym2;
                else targetSymbol = has1 ? contrast.sym1 : contrast.sym2;

                const escaped = targetSymbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                let regex: RegExp;
                if (targetSymbol === 'd') regex = new RegExp(`${escaped}(?!ʒ)`, 'g');
                else if (targetSymbol === 't') regex = new RegExp(`${escaped}(?!ʃ)`, 'g');
                else if (targetSymbol === 'ʃ') regex = new RegExp(`(?<!t)${escaped}`, 'g');
                else if (targetSymbol === 'ʒ') regex = new RegExp(`(?<!d)${escaped}`, 'g');
                // Diphthong parts
                else if (targetSymbol === 'ɪ') regex = new RegExp(`(?<![aeɔ])${escaped}`, 'g');
                else if (targetSymbol === 'ʊ') regex = new RegExp(`(?<![aə])${escaped}`, 'g');
                else if (targetSymbol === 'e') regex = new RegExp(`${escaped}(?!ɪ)`, 'g');
                else regex = new RegExp(escaped, 'g');

                let maskedIpa = w.ipaUs!.replace(regex, '___');

                if (maskedIpa === w.ipaUs) {
                    maskedIpa = w.ipaUs!.split(targetSymbol).join('___');
                }

                queue.push({ id: w.id, word: w.word, ipa: w.ipaUs!, maskedIpa, targetSymbol });
            }
            if (queue.length >= 15) break;
        }

        if (queue.length < 5) {
            alert(`Failed to build a long enough IPA queue (found ${queue.length}). Need at least 5 matching words.`);
            onExit();
            return;
        }
        setIpaItems(queue);
    }, []);

    const handleDrop = (bucketSymbol: string) => {
        const currentItem = ipaItems[0];
        if (!currentItem || feedback) return;

        const isCorrect = currentItem.targetSymbol === bucketSymbol;
        setFeedback({ symbol: bucketSymbol, correct: isCorrect });

        const newScore = isCorrect ? score + 10 : Math.max(0, score - 5);
        setScore(newScore);

        setTimeout(() => {
            const nextQueue = ipaItems.slice(1);
            setIpaItems(nextQueue);
            setFeedback(null);
            if (nextQueue.length === 0) {
                onComplete(newScore);
            }
        }, 800);
    };

    const currentItem = ipaItems[0];

    return (
        <div className="flex flex-col h-full relative">
            <div className="flex justify-between items-center mb-6 shrink-0">
                <button onClick={onExit} className="flex items-center gap-2 text-neutral-400 hover:text-neutral-900 transition-colors font-bold text-sm"><ArrowLeft size={18}/> Quit</button>
                <div className="px-6 py-2 bg-neutral-900 text-white rounded-full font-black text-lg shadow-lg tracking-widest">{score}</div>
                <div className="text-neutral-400 font-bold text-sm uppercase tracking-widest">IPA Sorter</div>
            </div>

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
                            <p className="text-neutral-400 font-bold text-xs uppercase tracking-widest pt-2">Fill the gap</p>
                        </div>
                    ) : (
                        <div className="text-neutral-300 font-black text-xl">Loading Words...</div>
                    )}
                </div>

                <div className="h-48 grid grid-cols-2 gap-4 mt-4 shrink-0">
                    {buckets.map((bucket, idx) => {
                        const isFeedbackTarget = feedback && feedback.symbol === bucket.symbol;
                        const isCorrectFeedback = isFeedbackTarget && feedback.correct;
                        const isIncorrectFeedback = isFeedbackTarget && !feedback.correct;
                        
                        let buttonClasses = "border-2 rounded-[2.5rem] flex flex-col items-center justify-center transition-all group p-4";
                        let textClasses = "text-neutral-400 group-hover:text-indigo-400";
                        let exampleWordClasses = "text-neutral-600 group-hover:text-indigo-600";
                    
                        if (isCorrectFeedback) {
                            buttonClasses += " bg-emerald-50 border-solid border-emerald-400 text-emerald-600";
                            textClasses = "text-emerald-500";
                            exampleWordClasses = "text-emerald-600";
                        } else if (isIncorrectFeedback) {
                            buttonClasses += " bg-rose-50 border-solid border-rose-400 text-rose-600";
                            textClasses = "text-rose-500";
                            exampleWordClasses = "text-rose-600";
                        } else {
                            buttonClasses += " bg-neutral-100/50 border-dashed border-neutral-300 hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-600";
                        }

                        return (
                            <button key={idx} onClick={() => handleDrop(bucket.symbol)} disabled={!!feedback} className={buttonClasses}>
                                <span className="text-5xl font-serif font-medium mb-1 group-hover:scale-110 transition-transform">/{bucket.symbol}/</span>
                                <span className={`text-[10px] font-black uppercase tracking-widest ${textClasses}`}>
                                    As in <span className={`font-bold ${exampleWordClasses} underline decoration-indigo-300`}>{bucket.example}</span>
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
