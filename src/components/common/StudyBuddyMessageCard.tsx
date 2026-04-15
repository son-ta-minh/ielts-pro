import React from 'react';
import { MessageSquare, X } from 'lucide-react';

interface CambridgePronunciation {
    partOfSpeech?: string | null;
    ipaUs?: string | null;
    ipaUk?: string | null;
    audioUs?: string | null;
    audioUk?: string | null;
}

interface MessageCardData {
    text?: string;
    texts?: string[];
    actionLabel?: string;
    actionUrl?: string;
    cambridge?: {
        word?: string;
        pronunciations?: CambridgePronunciation[];
    };
    icon?: React.ReactNode;
}

interface StudyBuddyMessageCardProps {
    message: MessageCardData;
    messageIndex: number;
    onPrev: () => void;
    onNext: () => void;
    onClose: () => void;
    playCambridgeAudio: (url?: string) => void;
}

const formatBoldText = (text: string) => {
    const boldRegex = new RegExp('\\*\\*(.*?)\\*\\*', 'g');
    return text
        .replace(boldRegex, '<strong>$1</strong>')
        .replace(/\n/g, '<br/>');
};

export const StudyBuddyMessageCard: React.FC<StudyBuddyMessageCardProps> = ({
    message,
    messageIndex,
    onPrev,
    onNext,
    onClose,
    playCambridgeAudio,
}) => (
    <div className="select-none bg-white p-5 rounded-[2.5rem] shadow-2xl border border-neutral-200 w-[26rem] relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-neutral-300 hover:text-neutral-900"><X size={14}/></button>
        <div className="flex items-start gap-3">
            <div className="shrink-0 mt-1">{message.icon || <MessageSquare size={18} />}</div>
            <div className="text-xs font-medium text-neutral-700 leading-relaxed space-y-2">
                {message.cambridge ? (
                    <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                            {(message.cambridge.pronunciations || []).map((p, idx) => (
                                <div key={idx} className="rounded-lg border border-neutral-200 bg-neutral-50 p-2 space-y-1.5">
                                    {(p as any).headword && (
                                        <p className="text-[11px] font-extrabold text-indigo-700 break-words">
                                            {(p as any).headword}
                                        </p>
                                    )}
                                    <p className="text-[10px] font-black uppercase tracking-wide text-neutral-500">
                                        {p.partOfSpeech || 'N/A'}
                                    </p>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => playCambridgeAudio(p.audioUs || undefined)}
                                            disabled={!p.audioUs}
                                            className={`px-2 py-0.5 text-[9px] font-black uppercase rounded-md border transition-colors ${
                                                p.audioUs
                                                    ? 'bg-indigo-50 text-indigo-700 border-indigo-100 hover:bg-indigo-100'
                                                    : 'bg-neutral-50 text-neutral-300 border-neutral-100 cursor-not-allowed'
                                            }`}
                                        >
                                            US
                                        </button>
                                        <p className="text-[11px] text-neutral-700 leading-relaxed flex-1 break-words">
                                            {p.ipaUs ? `/${p.ipaUs}/` : 'N/A'}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => playCambridgeAudio(p.audioUk || undefined)}
                                            disabled={!p.audioUk}
                                            className={`px-2 py-0.5 text-[9px] font-black uppercase rounded-md border transition-colors ${
                                                p.audioUk
                                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-100'
                                                    : 'bg-neutral-50 text-neutral-300 border-neutral-100 cursor-not-allowed'
                                            }`}
                                        >
                                            UK
                                        </button>
                                        <p className="text-[11px] text-neutral-700 leading-relaxed flex-1 break-words">
                                            {p.ipaUk ? `/${p.ipaUk}/` : 'N/A'}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    (() => {
                        const rawText = (message.texts && message.texts.length > 0)
                            ? message.texts[messageIndex] || ''
                            : (message.text || '');
                        const isIPA = rawText.startsWith('IPA:');
                        const ipaContent = isIPA ? rawText.replace(/^Pronunciation:\s*/, '') : rawText;
                        return (
                            <>
                                {isIPA && (
                                    <div style={{ fontWeight: 600, marginBottom: 4 }}>
                                        Pronunciation:
                                    </div>
                                )}
                                <div
                                    style={{ lineHeight: '1.6' }}
                                    dangerouslySetInnerHTML={{
                                        __html: formatBoldText(
                                            ipaContent.replace(/\s+\//g, '<br/>/')
                                        )
                                    }}
                                />
                                {message.texts && message.texts.length > 1 && (
                                    <div className="flex items-center gap-2 pt-2">
                                        <button
                                            onClick={onPrev}
                                            disabled={messageIndex === 0}
                                            className="px-2 py-1 text-[10px] font-bold rounded bg-neutral-100 hover:bg-neutral-200 disabled:opacity-40"
                                        >
                                            Back
                                        </button>
                                        <span className="text-[10px] text-neutral-500">
                                            {messageIndex + 1} / {message.texts.length}
                                        </span>
                                        <button
                                            onClick={onNext}
                                            disabled={messageIndex === message.texts.length - 1}
                                            className="px-2 py-1 text-[10px] font-bold rounded bg-neutral-100 hover:bg-neutral-200 disabled:opacity-40"
                                        >
                                            Next
                                        </button>
                                    </div>
                                )}
                            </>
                        );
                    })()
                )}
                {message.actionUrl && (
                    <button
                        type="button"
                        onClick={() => window.open(message.actionUrl, '_blank')}
                        className="px-3 py-1.5 text-[10px] font-black uppercase tracking-wide rounded-lg bg-blue-50 text-blue-700 border border-blue-100 hover:bg-blue-100 transition-colors"
                    >
                        {message.actionLabel || 'Open'}
                    </button>
                )}
            </div>
        </div>
    </div>
);
