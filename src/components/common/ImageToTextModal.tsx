
import React, { useState, useRef, useEffect } from 'react';
import { X, Upload, FileText, Loader2, Copy, CheckCircle2, Image as ImageIcon, WifiOff, Cloud } from 'lucide-react';
import { extractTextFromImage } from '../../services/geminiService';
import { extractTextOffline } from '../../utils/ocr';
import { copyToClipboard } from '../../utils/text';
import { useToast } from '../../contexts/ToastContext';

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

export const ImageToTextModal: React.FC<Props> = ({ isOpen, onClose }) => {
    const [imageSrc, setImageSrc] = useState<string | null>(null);
    const [extractedText, setExtractedText] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isOfflineResult, setIsOfflineResult] = useState(false);
    const [isCopied, setIsCopied] = useState(false);
    
    // Extraction Mode: 'cloud' (Default, falls back to offline) or 'offline' (Forces offline)
    const [mode, setMode] = useState<'cloud' | 'offline'>('cloud');
    
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { showToast } = useToast();

    // Clean up on close
    useEffect(() => {
        if (!isOpen) {
            setImageSrc(null);
            setExtractedText('');
            setIsLoading(false);
            setIsOfflineResult(false);
            setIsCopied(false);
            setMode('cloud');
        }
    }, [isOpen]);

    // Handle Paste Event
    useEffect(() => {
        if (!isOpen) return;

        const handlePaste = (e: ClipboardEvent) => {
            const items = e.clipboardData?.items;
            if (!items) return;

            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf('image') !== -1) {
                    const blob = items[i].getAsFile();
                    if (blob) processFile(blob);
                    break;
                }
            }
        };

        document.addEventListener('paste', handlePaste);
        return () => document.removeEventListener('paste', handlePaste);
    }, [isOpen]);

    const processFile = (file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            if (typeof e.target?.result === 'string') {
                setImageSrc(e.target.result);
                setExtractedText(''); // Reset text when new image loaded
                setIsOfflineResult(false);
            }
        };
        reader.readAsDataURL(file);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) processFile(file);
    };

    const handleExtract = async () => {
        if (!imageSrc) return;
        
        setIsLoading(true);
        setIsOfflineResult(false);
        
        try {
            if (mode === 'offline') {
                // Force Offline
                setIsOfflineResult(true);
                const offlineText = await extractTextOffline(imageSrc);
                setExtractedText(offlineText);
            } else {
                // Cloud Mode (with Auto-Fallback)
                try {
                    // imageSrc is "data:image/png;base64,..."
                    const base64Data = imageSrc.split(',')[1];
                    const mimeType = imageSrc.split(';')[0].split(':')[1];
                    
                    const text = await extractTextFromImage(base64Data, mimeType);
                    setExtractedText(text);
                } catch (e: any) {
                    console.warn("Online extraction failed, attempting offline fallback...", e);
                    
                    // Fallback to Offline Tesseract
                    setIsOfflineResult(true);
                    const offlineText = await extractTextOffline(imageSrc);
                    setExtractedText(offlineText);
                    showToast("Used offline mode (Cloud unavailable).", "info");
                }
            }
        } catch (error: any) {
            console.error(error);
            showToast("Extraction failed.", "error");
        } finally {
            setIsLoading(false);
        }
    };

    const handleCopy = async () => {
        if (!extractedText) return;
        await copyToClipboard(extractedText);
        setIsCopied(true);
        showToast("Text copied!", "success");
        setTimeout(() => setIsCopied(false), 2000);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl border border-neutral-200 flex flex-col max-h-[90vh]">
                
                {/* Header */}
                <header className="px-8 py-6 border-b border-neutral-100 flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                            <ImageIcon size={20} />
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-neutral-900">Image to Text</h3>
                            <p className="text-sm text-neutral-500">Extract text from images using AI.</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 -mr-2 text-neutral-400 hover:bg-neutral-100 rounded-full transition-colors"><X size={24}/></button>
                </header>

                {/* Main Content */}
                <main className="flex-1 overflow-y-auto p-6 space-y-6">
                    
                    {/* Image Area */}
                    <div className="space-y-2">
                        {!imageSrc ? (
                            <div 
                                onClick={() => fileInputRef.current?.click()}
                                className="border-2 border-dashed border-neutral-200 rounded-3xl p-10 flex flex-col items-center justify-center text-neutral-400 hover:border-indigo-400 hover:text-indigo-500 hover:bg-indigo-50/30 transition-all cursor-pointer min-h-[200px]"
                            >
                                <Upload size={40} className="mb-4" />
                                <p className="font-bold text-sm">Click to upload or paste image (Ctrl+V)</p>
                                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />
                            </div>
                        ) : (
                            <div className="relative rounded-3xl overflow-hidden border border-neutral-200 bg-neutral-100 flex justify-center max-h-[300px]">
                                <img src={imageSrc} alt="Preview" className="max-w-full object-contain" />
                                <button 
                                    onClick={() => { setImageSrc(null); setExtractedText(''); setIsOfflineResult(false); }}
                                    className="absolute top-4 right-4 p-2 bg-black/50 text-white rounded-full hover:bg-black/70 backdrop-blur-sm transition-all"
                                >
                                    <X size={16} />
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Mode Selection */}
                    <div className="flex justify-center gap-3">
                         <button 
                            onClick={() => setMode('cloud')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
                                mode === 'cloud' 
                                ? 'bg-indigo-50 border-indigo-200 text-indigo-700 shadow-sm' 
                                : 'bg-white border-neutral-200 text-neutral-500 hover:bg-neutral-50'
                            }`}
                        >
                            <Cloud size={14} />
                            <span>Cloud (Best)</span>
                        </button>
                        <button 
                            onClick={() => setMode('offline')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
                                mode === 'offline' 
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-700 shadow-sm' 
                                : 'bg-white border-neutral-200 text-neutral-500 hover:bg-neutral-50'
                            }`}
                        >
                            <WifiOff size={14} />
                            <span>Offline</span>
                        </button>
                    </div>

                    {/* Action Bar */}
                    <div className="flex justify-center">
                        <button 
                            onClick={handleExtract} 
                            disabled={!imageSrc || isLoading}
                            className={`px-8 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-lg flex items-center gap-2 ${isLoading ? 'bg-neutral-800 text-neutral-300' : 'bg-neutral-900 text-white hover:bg-neutral-800'} disabled:opacity-50`}
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 size={16} className="animate-spin" />
                                    <span>Processing...</span>
                                </>
                            ) : (
                                <>
                                    <FileText size={16} />
                                    <span>Extract Text</span>
                                </>
                            )}
                        </button>
                    </div>

                    {/* Output Area */}
                    {extractedText && (
                        <div className="space-y-2 animate-in slide-in-from-bottom-4 fade-in duration-500">
                            <div className="flex justify-between items-center px-1">
                                <div className="flex items-center gap-2">
                                    <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">Result</label>
                                    {isOfflineResult && (
                                        <span className="flex items-center gap-1 px-1.5 py-0.5 bg-neutral-100 text-neutral-500 rounded text-[9px] font-bold border border-neutral-200">
                                            <WifiOff size={10} /> Offline Result
                                        </span>
                                    )}
                                </div>
                                <button 
                                    onClick={handleCopy}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${isCopied ? 'bg-green-100 text-green-700' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}`}
                                >
                                    {isCopied ? <CheckCircle2 size={12} /> : <Copy size={12} />}
                                    <span>{isCopied ? 'Copied' : 'Copy'}</span>
                                </button>
                            </div>
                            <textarea 
                                value={extractedText}
                                readOnly
                                className="w-full h-48 p-4 bg-neutral-50 border border-neutral-200 rounded-2xl text-sm font-medium text-neutral-800 resize-none focus:outline-none focus:ring-2 focus:ring-neutral-900"
                            />
                        </div>
                    )}

                </main>
            </div>
        </div>
    );
};
