import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, Pause, Play, Volume2, X } from 'lucide-react';
import { StudyItem } from '../../../app/types';
import { speak, getPreferredSpeakLanguage, resolveCoachVoiceForLanguage } from '../../../utils/audio';
import { fetchImageUrlsForQuery, normalizeImageUrl } from '../../../services/imageSearchService';
import { getConfig } from '../../../app/settingsManager';

interface ShortGameProps {
    words: StudyItem[];
    onExit: () => void;
    onBulkUpdate: (words: StudyItem[]) => Promise<void>;
}

const SESSION_SIZE = 40;
const REVEAL_SECONDS = 10;
type ShortSource = 'vocab' | 'kotoba';
type BackgroundMode = 'default' | 'image';

const shuffle = <T,>(items: T[]) => [...items].sort(() => 0.5 - Math.random());

const speakWithPreferredLanguage = (text: string) => {
    const config = getConfig();
    const preferredLang = getPreferredSpeakLanguage();
    const coach = config.audioCoach.coaches[config.audioCoach.activeCoach];
    const preferredVoice = resolveCoachVoiceForLanguage(preferredLang, coach);
    console.log('ShortGame: speaking', { text, preferredLang, preferredVoice });
    speak(text, false, preferredLang, preferredVoice.voiceName, preferredVoice.accentCode);
};

const getImages = (word: StudyItem): string[] => {
    const raw = (word as any).img;
    const cleanImageValue = (value: string) => {
        const trimmedValue = value.trim();
        const httpIndex = trimmedValue.indexOf('http');
        const apiIndex = trimmedValue.indexOf('/api/');
        const urlIndex = httpIndex >= 0 ? httpIndex : apiIndex;
        return urlIndex > 0 ? trimmedValue.slice(urlIndex).trim() : trimmedValue;
    };

    if (Array.isArray(raw)) return raw.filter((url) => typeof url === 'string' && url.trim()).map(cleanImageValue);
    if (typeof raw === 'string' && raw.trim()) return [cleanImageValue(raw)];
    return [];
};

const maskWord = (word: string) => {
    const chars = word.trim().split('');
    if (!chars.length) return '';
    return `${chars[0]}${chars.slice(1).map((char) => (char === ' ' ? ' ' : '_')).join('')}`;
};

const cleanShortText = (text: string) => text.replace(/[\[\]{}]/g, '').replace(/\s+/g, ' ').trim();

const getRandomExampleSentence = (example: string) => {
    const sentences = example
        .split('.')
        .map(cleanShortText)
        .filter(Boolean);
    if (!sentences.length) return '';
    return sentences[Math.floor(Math.random() * sentences.length)];
};

const blankExample = (example: string, word: string) => {
    if (!example.trim()) return '______';
    const escaped = word.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!escaped) return example;
    const pattern = new RegExp(`\\b${escaped}\\b`, 'gi');
    const replaced = example.replace(pattern, '______');
    return replaced === example ? example : replaced;
};

const getCollocations = (word: StudyItem) => (
    word.collocationsArray || []
).filter((item) => !item.isIgnored && item.text?.trim()).slice(0, 3);

const ShortSlide: React.FC<{
    word: StudyItem;
    index: number;
    activeIndex: number;
    onVisible: (index: number) => void;
    backgroundMode: BackgroundMode;
    generatedImages: Record<string, string[]>;
    onEnsureImage: (word: StudyItem) => Promise<void>;
}> = ({ word, index, activeIndex, onVisible, backgroundMode, generatedImages, onEnsureImage }) => {
    const slideRef = useRef<HTMLElement | null>(null);
    const [secondsLeft, setSecondsLeft] = useState(REVEAL_SECONDS);
    const [isPaused, setIsPaused] = useState(false);
    const [isGeneratingImage, setIsGeneratingImage] = useState(false);
    const [failedImageUrls, setFailedImageUrls] = useState<Set<string>>(() => new Set());
    const isActive = activeIndex === index;
    const hasAutoSpokenRef = useRef(false);
    const isRevealed = secondsLeft <= 0;
    const images = (generatedImages[word.id] || getImages(word)).map((url) => normalizeImageUrl(url));
    const visibleImages = images.filter((url) => !failedImageUrls.has(url));
    const bgImage = visibleImages[index % Math.max(visibleImages.length, 1)];
    const collocations = getCollocations(word);
    const exampleSentence = useMemo(() => getRandomExampleSentence(word.example || ''), [word.id, word.example]);

    useEffect(() => {
        const node = slideRef.current;
        if (!node) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting && entry.intersectionRatio >= 0.6) onVisible(index);
            },
            { threshold: [0.6] }
        );

        observer.observe(node);
        return () => observer.disconnect();
    }, [index, onVisible]);
    

    useEffect(() => {
        if (!isActive) return;
        setSecondsLeft(REVEAL_SECONDS);
        setIsPaused(false);
        hasAutoSpokenRef.current = false;
        setFailedImageUrls(new Set());
    }, [isActive, word.id]);

    useEffect(() => {
        if (!isActive || !isRevealed || hasAutoSpokenRef.current) return;

        hasAutoSpokenRef.current = true;
        window.setTimeout(() => {
            speakWithPreferredLanguage(word.word);
        }, 0);
    }, [isActive, isRevealed, word.word]);

    useEffect(() => {
        if (!isActive || isPaused || secondsLeft <= 0) return;
        const intervalId = window.setInterval(() => {
            setSecondsLeft((current) => Math.max(0, current - 1));
        }, 1000);
        return () => window.clearInterval(intervalId);
    }, [isActive, isPaused, secondsLeft]);

    useEffect(() => {
        if (!isActive || backgroundMode !== 'image' || images.length > 0 || isGeneratingImage) return;

        let isCancelled = false;
        setIsGeneratingImage(true);
        onEnsureImage(word).finally(() => {
            if (!isCancelled) setIsGeneratingImage(false);
        });

        return () => {
            isCancelled = true;
        };
    }, [backgroundMode, images.length, isActive, isGeneratingImage, onEnsureImage, word]);

    return (
        <section ref={slideRef} className="relative h-screen w-full snap-start snap-always overflow-hidden bg-neutral-950 text-white">
            {bgImage ? (
                <>
                    <img
                        src={bgImage}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover scale-105 animate-[pulse_8s_ease-in-out_infinite]"
                        onError={() => setFailedImageUrls((current) => new Set(current).add(bgImage))}
                    />
                    <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/30 to-black/75" />
                </>
            ) : (
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(132,204,22,0.34),transparent_32%),linear-gradient(145deg,#101010,#262626_48%,#111827)]" />
            )}
            {isGeneratingImage && backgroundMode === 'image' && !bgImage && (
                <div className="absolute left-5 top-5 z-10 rounded-full bg-black/35 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-white/75 backdrop-blur-md">
                    Loading image
                </div>
            )}

            <div className="relative z-10 flex h-full flex-col justify-center px-6 pb-24 pt-20 sm:px-12 lg:px-20">
                <div className="max-w-4xl">
                    <p className="text-2xl font-black leading-tight tracking-normal text-white sm:text-4xl lg:text-5xl">
                        {word.meaningVi || word.displayMeaning || 'No Vietnamese meaning yet'}
                    </p>

                    <p className="mt-8 font-mono text-4xl font-black tracking-normal text-lime-200 sm:text-6xl lg:text-7xl">
                        {isRevealed ? word.word : maskWord(word.word)}
                    </p>

                    <p className="mt-8 max-w-3xl text-xl font-bold leading-snug text-white/90 sm:text-3xl">
                        {blankExample(exampleSentence, word.word)}
                    </p>

                    <div className="mt-10 flex min-h-28 flex-col justify-start">
                        {!isRevealed ? (
                            <div className="flex items-center gap-4">
                                <p className="font-mono text-8xl font-black leading-none text-white sm:text-9xl">
                                    {secondsLeft}
                                </p>
                                <button
                                    type="button"
                                    onClick={() => setIsPaused((current) => !current)}
                                    className="flex h-14 w-14 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-md transition-colors hover:bg-white/25 sm:h-16 sm:w-16"
                                    aria-label={isPaused ? 'Resume Short timer' : 'Pause Short timer'}
                                >
                                    {isPaused ? <Play size={26} fill="currentColor" /> : <Pause size={26} fill="currentColor" />}
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {collocations.length > 0 && (
                                    <div className="flex max-w-3xl flex-wrap gap-2">
                                        {collocations.map((item, idx) => (
                                            <span key={`${word.id}-colloc-${idx}`} className="rounded-full border border-white/25 bg-white/15 px-4 py-2 text-sm font-bold backdrop-blur-md sm:text-base">
                                                {item.text}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </section>
    );
};

export const ShortGame: React.FC<ShortGameProps> = ({ words, onExit, onBulkUpdate }) => {
    const [source, setSource] = useState<ShortSource>('vocab');
    const [backgroundMode, setBackgroundMode] = useState<BackgroundMode>('default');
    const [activeIndex, setActiveIndex] = useState(0);
    const [queue, setQueue] = useState<StudyItem[]>([]);
    const [generatedImages, setGeneratedImages] = useState<Record<string, string[]>>({});
    const generatingWordIdsRef = useRef<Set<string>>(new Set());
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const sourceWords = useMemo(() => {
        return words.filter((word) => (word.libraryType === 'kotoba' ? 'kotoba' : 'vocab') === source && word.word?.trim());
    }, [words, source]);

    useEffect(() => {
        setActiveIndex(0);
        setQueue(shuffle(sourceWords).slice(0, SESSION_SIZE));
        scrollRef.current?.scrollTo({ top: 0 });
    }, [source, sourceWords]);

    useEffect(() => {
        if (queue.length - activeIndex > 8 || sourceWords.length === 0) return;
        setQueue((current) => [...current, ...shuffle(sourceWords).slice(0, SESSION_SIZE)]);
    }, [activeIndex, queue.length, sourceWords]);

    useEffect(() => {
        document.body.classList.add('short-game-active');
        window.dispatchEvent(new CustomEvent('short-game-active-changed', { detail: { isActive: true } }));

        return () => {
            document.body.classList.remove('short-game-active');
            window.dispatchEvent(new CustomEvent('short-game-active-changed', { detail: { isActive: false } }));
        };
    }, []);

    const ensureImage = useCallback(async (word: StudyItem) => {
        if (getImages(word).length > 0 || generatedImages[word.id]?.length || generatingWordIdsRef.current.has(word.id)) return;
        generatingWordIdsRef.current.add(word.id);

        try {
            const urls = await fetchImageUrlsForQuery(word.word);
            if (!urls.length) return;

            const updatedWord = { ...word, img: urls as any };
            setGeneratedImages((current) => ({ ...current, [word.id]: urls }));
            setQueue((current) => current.map((item) => item.id === word.id ? updatedWord : item));
            await onBulkUpdate([updatedWord]);
        } catch (err) {
            console.error('Short image generate error:', err);
        } finally {
            generatingWordIdsRef.current.delete(word.id);
        }
    }, [generatedImages, onBulkUpdate]);

    const sourceToggle = (
        <div className="fixed right-16 top-4 z-20 flex gap-2">
            <div className="flex rounded-full bg-black/35 p-1 text-xs font-black text-white backdrop-blur-md">
                {(['default', 'image'] as BackgroundMode[]).map((option) => (
                    <button
                        key={option}
                        type="button"
                        onClick={() => setBackgroundMode(option)}
                        className={`rounded-full px-3 py-2 transition-colors ${backgroundMode === option ? 'bg-white text-neutral-950' : 'text-white/70 hover:text-white'}`}
                        aria-pressed={backgroundMode === option}
                    >
                        {option === 'default' ? 'Default' : 'Image'}
                    </button>
                ))}
            </div>
            <div className="flex rounded-full bg-black/35 p-1 text-xs font-black text-white backdrop-blur-md">
            {(['vocab', 'kotoba'] as ShortSource[]).map((option) => (
                <button
                    key={option}
                    type="button"
                    onClick={() => setSource(option)}
                    className={`min-w-11 rounded-full px-3 py-2 transition-colors ${source === option ? 'bg-white text-neutral-950' : 'text-white/70 hover:text-white'}`}
                    aria-pressed={source === option}
                >
                    {option === 'vocab' ? 'EN' : 'JP'}
                </button>
            ))}
            </div>
        </div>
    );

    if (!queue.length) {
        return (
            <div className="fixed inset-0 z-[120] flex items-center justify-center bg-neutral-950 px-6 text-center text-white">
                {sourceToggle}
                <button onClick={onExit} className="absolute right-4 top-4 rounded-full bg-white/10 p-3 text-white hover:bg-white/20" aria-label="Close Short game">
                    <X size={22} />
                </button>
                <div>
                    <h2 className="text-3xl font-black">No {source === 'vocab' ? 'English' : 'Kotoba'} words for Short yet</h2>
                    <p className="mt-3 text-sm font-semibold text-white/60">Switch source or add more words, then come back for the swipe drill.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-[120] bg-neutral-950">
            {sourceToggle}
            <button onClick={onExit} className="fixed right-4 top-4 z-20 rounded-full bg-black/35 p-3 text-white backdrop-blur-md transition-colors hover:bg-black/55" aria-label="Close Short game">
                <X size={22} />
            </button>
            <div className="pointer-events-none fixed bottom-5 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/35 px-4 py-2 text-xs font-black uppercase tracking-widest text-white/75 backdrop-blur-md">
                <ArrowUp size={14} />
                Swipe
            </div>
            <div ref={scrollRef} className="h-screen w-full snap-y snap-mandatory overflow-y-auto overscroll-contain">
                {queue.map((word, index) => (
                    <ShortSlide
                        key={`${word.id}-${index}`}
                        word={word}
                        index={index}
                        activeIndex={activeIndex}
                        onVisible={setActiveIndex}
                        backgroundMode={backgroundMode}
                        generatedImages={generatedImages}
                        onEnsureImage={ensureImage}
                    />
                ))}
            </div>
        </div>
    );
};
