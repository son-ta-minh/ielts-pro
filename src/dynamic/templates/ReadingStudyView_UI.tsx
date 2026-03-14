
import React, { useState, useMemo, useEffect } from 'react';
import { Play, Edit3, ArrowLeft, CheckCircle2, Circle, BrainCircuit, BookOpen, Tag, HelpCircle, X, Check, ThumbsUp, ThumbsDown, Eye, ChevronDown, ChevronRight, LayoutList, BookText, Loader2, ExternalLink, FileText } from 'lucide-react';
import { VocabularyItem, Unit, User } from '../../app/types';
import { FilterType, RefinedFilter, StatusFilter, RegisterFilter } from '../../components/word_lib/WordTable_UI';
import EditWordModal from '../../components/word_lib/EditWordModal';
import ViewWordModal from '../../components/word_lib/ViewWordModal';
import WordTable from '../../components/word_lib/WordTable';
import { EssayReader } from './EssayReader';
import { speak } from '../../utils/audio';
import { getDocument, GlobalWorkerOptions, TextLayer } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { renderAsync } from 'docx-preview';
import { parseMarkdown } from '../../utils/markdownParser';

interface TooltipState { word: VocabularyItem; rect: DOMRect; }
type LinkedFileContent =
  | { state: 'idle' | 'loading' }
  | { state: 'error'; message: string }
  | { state: 'text'; title: string; text: string; fileName: string; extension?: string }
  | { state: 'binary'; title: string; fileUrl: string; fileName: string; extension?: string; mimeType?: string };

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const PdfJsViewer: React.FC<{ fileUrl: string; viewportHeight: number }> = ({ fileUrl, viewportHeight }) => {
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [renderVersion, setRenderVersion] = useState(0);

    useEffect(() => {
        let isCancelled = false;
        const textLayers: TextLayer[] = [];
        let loadingTask: ReturnType<typeof getDocument> | null = null;

        const renderPdf = async () => {
            setIsLoading(true);
            setError(null);

            try {
                loadingTask = getDocument({ url: fileUrl });
                const pdf = await loadingTask.promise;
                if (isCancelled) return;

                const container = document.getElementById(`pdfjs-viewer-${renderVersion}`);
                if (!container) return;
                container.innerHTML = '';

                for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
                    if (isCancelled) return;
                    const page = await pdf.getPage(pageNo);
                    const viewport = page.getViewport({ scale: 1.35 });

                    const pageWrap = document.createElement('div');
                    pageWrap.className = 'relative mx-auto mb-4 bg-white';
                    pageWrap.style.width = `${viewport.width}px`;
                    pageWrap.style.height = `${viewport.height}px`;

                    const canvas = document.createElement('canvas');
                    const context = canvas.getContext('2d')!;
                    const outputScale = window.devicePixelRatio || 1;

                    canvas.width = Math.floor(viewport.width * outputScale);
                    canvas.height = Math.floor(viewport.height * outputScale);
                    canvas.style.width = `${viewport.width}px`;
                    canvas.style.height = `${viewport.height}px`;

                    context.setTransform(outputScale, 0, 0, outputScale, 0, 0);

                    const textLayerDiv = document.createElement('div');
                    textLayerDiv.className = 'pdfjs-text-layer absolute inset-0';

                    pageWrap.appendChild(canvas);
                    pageWrap.appendChild(textLayerDiv);
                    container.appendChild(pageWrap);

                    await page.render({ canvasContext: context, viewport }).promise;
                    const textContent = await page.getTextContent();
                    const textLayer = new TextLayer({
                        textContentSource: textContent,
                        container: textLayerDiv,
                        viewport
                    });
                    textLayers.push(textLayer);
                    await textLayer.render();
                }

                if (!isCancelled) setIsLoading(false);
            } catch (_e) {
                if (!isCancelled) {
                    setError('Failed to render PDF with pdf.js.');
                    setIsLoading(false);
                }
            }
        };

        renderPdf();

        return () => {
            isCancelled = true;
            if (loadingTask) loadingTask.destroy();
            textLayers.forEach(layer => layer.cancel());
        };
    }, [fileUrl, renderVersion]);

    return (
        <div
          className="relative p-3 bg-neutral-50/40 overflow-hidden"
          style={{ height: `${viewportHeight}vh`, maxHeight: `${viewportHeight}vh` }}
        >
            <style>{`
                .pdfjs-text-layer {
                    line-height: 1;
                    user-select: text;
                    cursor: text;
                }
                .pdfjs-text-layer span,
                .pdfjs-text-layer br {
                    color: transparent;
                    position: absolute;
                    white-space: pre;
                    transform-origin: 0% 0%;
                }
                .pdfjs-text-layer ::selection {
                    background: rgba(56, 189, 248, 0.35);
                }
            `}</style>
            {isLoading && (
                <div className="absolute inset-0 z-10 flex items-center justify-center text-neutral-500 bg-white/60 backdrop-blur-[1px]">
                    <Loader2 size={20} className="animate-spin" />
                </div>
            )}
            {error ? (
                <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 text-center p-8">
                    <p className="text-sm font-semibold text-rose-600">{error}</p>
                    <button
                        onClick={() => setRenderVersion(v => v + 1)}
                        className="px-3 py-1.5 rounded-lg border border-neutral-200 bg-white text-xs font-bold text-neutral-700 hover:bg-neutral-50"
                    >
                        Retry
                    </button>
                </div>
            ) : (
                <div
                  id={`pdfjs-viewer-${renderVersion}`}
                  className="h-full w-full overflow-auto pr-2"
                  style={{ overscrollBehavior: 'contain' }}
                />
            )}
        </div>
    );
};

const DocxViewer: React.FC<{ fileUrl: string; title?: string }> = ({ fileUrl }) => {
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            try {
                const res = await fetch(fileUrl);
                const blob = await res.blob();
                if (cancelled) return;

                const container = document.getElementById('docx-viewer-container');
                if (!container) return;
                container.innerHTML = '';

                await renderAsync(blob, container);
            } catch (e) {
                if (!cancelled) setError('Failed to render DOCX file.');
            }
        };

        load();

        return () => {
            cancelled = true;
        };
    }, [fileUrl]);

    if (error) {
        return (
            <div className="min-h-[60vh] flex items-center justify-center text-rose-600 font-semibold text-sm">
                {error}
            </div>
        );
    }

    return (
        <div className="min-h-[60vh] overflow-auto bg-white p-6">
            <div id="docx-viewer-container" className="prose max-w-none" />
        </div>
    );
};

const ComprehensionCheckModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    questions: { question: string; answer: string; }[];
    answers: Record<number, string>;
    onAnswerChange: (index: number, value: string) => void;
    results: Record<number, 'correct' | 'incorrect' | null>;
    onResultChange: (index: number, result: 'correct' | 'incorrect') => void;
}> = ({ isOpen, onClose, questions, answers, onAnswerChange, results, onResultChange }) => {
    const [revealedAnswers, setRevealedAnswers] = useState<Set<number>>(new Set());

    const handleReveal = (index: number) => {
        setRevealedAnswers(prev => new Set(prev).add(index));
    };

    const correctCount = Object.values(results).filter(r => r === 'correct').length;
    const totalQuestions = questions.length;

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl border border-neutral-200 flex flex-col max-h-[90vh]">
                <header className="px-8 py-6 border-b border-neutral-100 flex justify-between items-start shrink-0">
                    <div>
                        <h3 className="text-xl font-black text-neutral-900 flex items-center gap-2"><HelpCircle size={20}/> Comprehension Check</h3>
                        <p className="text-sm text-neutral-500 mt-1">Test your understanding of the passage.</p>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="text-right">
                            <h4 className="text-xs font-black uppercase text-neutral-400">Score</h4>
                            <p className="text-2xl font-black text-neutral-900">{correctCount} <span className="text-lg text-neutral-400">/ {totalQuestions}</span></p>
                        </div>
                        <button type="button" onClick={onClose} className="p-2 -mr-2 text-neutral-400 hover:bg-neutral-100 rounded-full"><X size={20}/></button>
                    </div>
                </header>
                <main className="p-6 overflow-y-auto space-y-4">
                    {questions.map((q, index) => {
                        const isRevealed = revealedAnswers.has(index);
                        const result = results[index];
                        const isGraded = result !== null;
                        
                        return (
                            <div key={index} className={`p-4 rounded-2xl border transition-all ${ isGraded ? (result === 'correct' ? 'bg-green-50/50 border-green-200' : 'bg-red-50/50 border-red-200') : 'bg-neutral-50/50 border-neutral-200'}`}>
                                <p className="text-sm font-bold text-neutral-800 mb-2">Q{index + 1}: {q.question}</p>
                                <textarea 
                                    value={answers[index] || ''}
                                    onChange={e => onAnswerChange(index, e.target.value)}
                                    rows={3}
                                    placeholder="Type your answer here..."
                                    disabled={isGraded}
                                    className="w-full text-sm p-3 bg-white rounded-lg border border-neutral-200 focus:ring-1 focus:ring-neutral-900 outline-none resize-y disabled:opacity-70"
                                />
                                {isRevealed && (
                                    <div className="mt-3 pt-3 border-t border-neutral-200 space-y-3 animate-in fade-in duration-300">
                                        <div className="space-y-1">
                                            <h5 className="text-[10px] font-black uppercase text-neutral-500">Suggested Answer</h5>
                                            <p className="text-xs font-medium p-3 bg-white/50 rounded-lg">{q.answer}</p>
                                        </div>
                                        {!isGraded && (
                                            <div className="flex items-center justify-end gap-2">
                                                <h5 className="text-xs font-bold text-neutral-600 mr-2">Was your answer correct?</h5>
                                                <button onClick={() => onResultChange(index, 'incorrect')} className="flex items-center gap-1.5 px-4 py-2 bg-white text-red-600 rounded-lg font-bold text-xs border border-red-200 hover:bg-red-50"><ThumbsDown size={14}/> Incorrect</button>
                                                <button onClick={() => onResultChange(index, 'correct')} className="flex items-center gap-1.5 px-4 py-2 bg-white text-green-600 rounded-lg font-bold text-xs border border-green-200 hover:bg-green-50"><ThumbsUp size={14}/> Correct</button>
                                            </div>
                                        )}
                                    </div>
                                )}
                                {!isRevealed && !isGraded && (
                                    <div className="flex justify-end mt-2">
                                        <button onClick={() => handleReveal(index)} className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-neutral-600 rounded-lg font-bold text-[10px] uppercase tracking-wider border border-neutral-200 hover:bg-neutral-50"><Eye size={12}/> Show Answer</button>
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </main>
            </div>
        </div>
    );
};

export interface ReadingStudyViewUIProps {
    user: User;
    unit: Unit;
    allWords: VocabularyItem[];
    unitWords: VocabularyItem[];
    wordsById: Map<string, VocabularyItem>;
    pagedUnitWords: VocabularyItem[];
    filteredUnitWords: VocabularyItem[];
    viewingWord: VocabularyItem | null;
    setViewingWord: (word: VocabularyItem | null) => void;
    editingWord: VocabularyItem | null;
    setEditingWord: (word: VocabularyItem | null) => void;
    isPracticeMode: boolean;
    setIsPracticeMode: (isPractice: boolean) => void;
    unitTablePage: number;
    setUnitTablePage: (page: number) => void;
    unitTablePageSize: number;
    setUnitTablePageSize: (size: number) => void;
    unitTableQuery: string;
    setUnitTableQuery: (query: string) => void;
    unitTableFilters: { types: Set<FilterType>, refined: RefinedFilter, status: StatusFilter, register: RegisterFilter };
    setUnitTableFilters: (filters: { types: Set<FilterType>, refined: RefinedFilter, status: StatusFilter, register: RegisterFilter }) => void;
    onBack: () => void;
    onDataChange: () => void;
    onStartSession: (words: VocabularyItem[]) => void;
    onSwitchToEdit: () => void;
    handleRemoveWordFromUnit: (wordId: string) => Promise<void>;
    onBulkDelete: (ids: Set<string>) => Promise<void>;
    onHardDelete: (word: VocabularyItem) => Promise<void>;
    onBulkHardDelete: (ids: Set<string>) => Promise<void>;
    handleSaveWordUpdate: (word: VocabularyItem) => Promise<void>;
    onWordAction: (text: string, action: 'add' | 'remove') => void;
    onUpdateUser: (user: User) => Promise<void>;
    handleExportUnit: () => void;
    isComprehensionModalOpen: boolean;
    onOpenComprehensionModal: () => void;
    onCloseComprehensionModal: () => void;
    comprehensionAnswers: Record<number, string>;
    onComprehensionAnswerChange: (index: number, value: string) => void;
    comprehensionResults: Record<number, 'correct' | 'incorrect' | null>;
    onComprehensionResultChange: (index: number, result: 'correct' | 'incorrect') => void;
    essayFileContent: LinkedFileContent;
    answerFileContent: LinkedFileContent;
    note: string;
    onNoteChange: (value: string) => void;
}

export const ReadingStudyViewUI: React.FC<ReadingStudyViewUIProps> = (props) => {
  const { user, unit, allWords, unitWords, pagedUnitWords, filteredUnitWords, viewingWord, setViewingWord, editingWord, setEditingWord, isPracticeMode, setIsPracticeMode, unitTablePage, setUnitTablePage, unitTablePageSize, setUnitTablePageSize, unitTableQuery, setUnitTableQuery, unitTableFilters, setUnitTableFilters, onBack, onStartSession, onSwitchToEdit, handleRemoveWordFromUnit, onBulkDelete, onHardDelete, onBulkHardDelete, handleSaveWordUpdate, onWordAction, handleExportUnit, isComprehensionModalOpen, onOpenComprehensionModal, onCloseComprehensionModal, comprehensionAnswers, onComprehensionAnswerChange, comprehensionResults, onComprehensionResultChange, essayFileContent, answerFileContent, note, onNoteChange } = props;
  const [noteMode, setNoteMode] = useState<'edit' | 'preview'>('edit');
  const previewHtml = useMemo(() => parseMarkdown(note), [note]);
  const [activeTooltip, setActiveTooltip] = useState<TooltipState | null>(null);
  const isLinkedFileUnit = unit.readingSourceType === 'server_file_pair';
  const [activeTab, setActiveTab] = useState<'ESSAY' | 'ANSWER' | 'VOCAB' | 'NOTE'>('ESSAY');
  const [pdfRenderMode, setPdfRenderMode] = useState<'iframe' | 'pdfjs'>('pdfjs');
  const [pdfViewportHeight, setPdfViewportHeight] = useState(90);
  const [isHeaderExpanded, setIsHeaderExpanded] = useState(false);

  const wordsByText = useMemo(() => new Map(allWords.map(w => [w.word.toLowerCase().trim(), w])), [allWords]);

  // Attach speaker utility for data-only Audio tags
  useEffect(() => {
    (window as any).handleLessonSpeak = (text: string, lang?: 'en' | 'vi') => {
        speak(text, false, lang);
    };
    return () => {
        delete (window as any).handleLessonSpeak;
    };
  }, []);

  const handleHoverWord = (word: VocabularyItem | null, rect: DOMRect | null) => { 
    if (isPracticeMode) return;
    if (!word || !rect) setActiveTooltip(null); 
    else setActiveTooltip({ word, rect }); 
  };
  
  const handleSaveAndCloseEdit = async (word: VocabularyItem) => {
    await handleSaveWordUpdate(word);
    setEditingWord(null);
  };

  const isPdfBinary = (content: LinkedFileContent): boolean =>
    content.state === 'binary' && (content.mimeType?.toLowerCase().includes('pdf') || content.extension?.toLowerCase() === 'pdf');
  const hasPdfLinkedContent = isPdfBinary(essayFileContent) || isPdfBinary(answerFileContent);

  useEffect(() => {
    if (isLinkedFileUnit && activeTab === 'VOCAB') {
      setActiveTab('ESSAY');
    }
  }, [isLinkedFileUnit, activeTab]);

  const renderLinkedFile = (content: LinkedFileContent) => {
    if (content.state === 'loading' || content.state === 'idle') {
      return (
        <div className="min-h-[60vh] flex items-center justify-center text-neutral-400">
          <Loader2 size={22} className="animate-spin" />
        </div>
      );
    }
    if (content.state === 'error') {
      return (
        <div className="min-h-[60vh] flex items-center justify-center p-8">
          <p className="text-sm text-rose-600 font-semibold">{content.message}</p>
        </div>
      );
    }
    if (content.state === 'binary') {
      const ext = content.extension?.toLowerCase();
      const isOfficeDoc = ext === 'doc' || ext === 'docx';

      return (
        <div className="min-h-[60vh] flex flex-col">
          {isPdfBinary(content) ? (
            pdfRenderMode === 'pdfjs'
              ? <PdfJsViewer fileUrl={content.fileUrl} viewportHeight={pdfViewportHeight} />
              : <iframe src={content.fileUrl} className="w-full min-h-[60vh] border-0 rounded-b-[2.5rem]" title={content.title} />
          ) : isOfficeDoc ? (
            <DocxViewer fileUrl={content.fileUrl} title={content.title} />
          ) : (
            <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 p-8 text-center">
              <FileText size={26} className="text-neutral-400" />
              <p className="text-sm text-neutral-600 font-medium">Inline preview is limited for this file type.</p>
              <a href={content.fileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-neutral-900 text-white text-xs font-black uppercase tracking-wider">
                Open File
                <ExternalLink size={14} />
              </a>
            </div>
          )}
        </div>
      );
    }
    return (
      <div className="min-h-[60vh] p-6 md:p-8 overflow-auto">
        <pre className="whitespace-pre-wrap text-sm font-medium leading-relaxed text-neutral-800">{content.text}</pre>
      </div>
    );
  };

  return (
    <>
      <div className="max-w-5xl mx-auto space-y-5 pb-24 relative animate-in fade-in duration-300">
        
        {/* --- HEADER: Back + Global Actions --- */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <button onClick={onBack} className="flex items-center space-x-2 text-sm font-bold text-neutral-400 hover:text-neutral-900 transition-colors"><ArrowLeft size={16} /><span>Back to Library</span></button>
            <div className="flex items-center gap-3">
                {activeTab === 'ESSAY' && !isLinkedFileUnit && (
                    <button onClick={() => setIsPracticeMode(!isPracticeMode)} className={`px-4 py-2 rounded-xl font-black text-[10px] flex items-center space-x-2 active:scale-95 uppercase tracking-widest border transition-all ${isPracticeMode ? 'bg-amber-100 text-amber-700 border-amber-200 shadow-inner' : 'bg-white text-neutral-600 border-neutral-200'}`}>
                        <BrainCircuit size={16} /><span>Context Recall</span>
                    </button>
                )}
                <div className="w-px h-6 bg-neutral-200 mx-1 hidden sm:block"></div>
                <button onClick={onSwitchToEdit} className="p-2 bg-white text-neutral-600 rounded-xl border border-neutral-200 hover:bg-neutral-100 transition-all active:scale-95" title="Edit Unit"><Edit3 size={16} /></button>
                <button onClick={() => onStartSession(unitWords)} disabled={unitWords.length === 0} className="px-6 py-2 bg-neutral-900 text-white rounded-xl font-black text-[10px] flex items-center space-x-2 transition-all active:scale-95 hover:bg-neutral-800 disabled:opacity-50 uppercase tracking-widest shadow-sm"><Play size={16} fill="white" /><span>Practice</span></button>
            </div>
        </header>

        {/* --- COLLAPSIBLE METADATA HEADER --- */}
        <div className="bg-white rounded-[2rem] border border-neutral-200 shadow-sm overflow-hidden transition-all">
            <button 
                onClick={() => setIsHeaderExpanded(!isHeaderExpanded)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-neutral-50 transition-colors text-left group"
            >
                <div className="flex items-center gap-3 overflow-hidden">
                    <div className="p-2 bg-neutral-100 rounded-xl text-neutral-600 group-hover:bg-white group-hover:shadow-sm transition-all"><BookOpen size={20} /></div>
                    <div className="min-w-0">
                         <h3 className="text-lg font-black text-neutral-900 tracking-tight truncate">{unit.name}</h3>
                    </div>
                </div>
                <div className="p-2 text-neutral-300 group-hover:text-neutral-600 transition-colors">
                    {isHeaderExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                </div>
            </button>

            {isHeaderExpanded && (
                <div className="px-6 pb-6 pt-0 animate-in slide-in-from-top-2 space-y-4">
                     <p className="text-sm text-neutral-600 font-medium leading-relaxed whitespace-pre-wrap pl-1">{unit.description || 'No description provided.'}</p>
                     
                     {unit.tags && unit.tags.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-4">
                            <Tag size={12} className="text-neutral-400 ml-1" />
                            {unit.tags.map(tag => (
                                <span key={tag} className="px-2.5 py-1 bg-neutral-50 text-neutral-600 rounded-lg text-[10px] font-bold border border-neutral-100 uppercase tracking-wide">{tag.replace(/\//g, ' / ')}</span>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>

        {/* --- TABS --- */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex p-1 bg-neutral-100 rounded-xl w-full sm:w-fit">
            <button 
                onClick={() => setActiveTab('ESSAY')}
                className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${activeTab === 'ESSAY' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'}`}
            >
                <BookText size={14} /> Essay
            </button>
            <button 
                onClick={() => setActiveTab('ANSWER')}
                className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${activeTab === 'ANSWER' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'} ${!isLinkedFileUnit ? 'hidden' : ''}`}
            >
                <FileText size={14} /> Answer
            </button>
            <button 
                onClick={() => setActiveTab('VOCAB')}
                className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${activeTab === 'VOCAB' ? 'bg-white text-indigo-600 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'}`}
                style={{ display: isLinkedFileUnit ? 'none' : 'flex' }}
            >
                <LayoutList size={14} /> Vocabulary
            </button>
            <button
                onClick={() => setActiveTab('NOTE')}
                className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${activeTab === 'NOTE' ? 'bg-white text-teal-600 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'}`}
            >
                <Tag size={14} /> Note
            </button>
          </div>
          {hasPdfLinkedContent && (
            <>
              <div className="ml-auto flex items-center gap-1 bg-white px-2 py-1 rounded-lg border border-neutral-200 shadow-sm">
                <button
                  onClick={() => setPdfViewportHeight(h => Math.max(40, h - 5))}
                  className="px-2 py-0.5 text-[10px] font-black text-neutral-600 hover:bg-neutral-100 rounded"
                  title="Decrease viewer height"
                >
                  −
                </button>
                <span className="text-[10px] font-bold text-neutral-500 w-10 text-center">
                  {pdfViewportHeight}vh
                </span>
                <button
                  onClick={() => setPdfViewportHeight(h => Math.min(120, h + 5))}
                  className="px-2 py-0.5 text-[10px] font-black text-neutral-600 hover:bg-neutral-100 rounded"
                  title="Increase viewer height"
                >
                  +
                </button>
              </div>
              <button
                onClick={() => setPdfRenderMode(mode => mode === 'iframe' ? 'pdfjs' : 'iframe')}
                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all ${pdfRenderMode === 'pdfjs' ? 'bg-cyan-100 text-cyan-700 border-cyan-200' : 'bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-50'}`}
                title="Switch PDF render mode"
              >
                {pdfRenderMode === 'pdfjs' ? 'App Render' : 'System Render'}
              </button>
            </>
          )}
        </div>

        {/* --- CONTENT AREA --- */}
        <div className="min-h-[500px]">
            {activeTab === 'ESSAY' && (
                <div className="rounded-[2.5rem] border border-neutral-200 shadow-sm bg-white overflow-hidden flex flex-col relative animate-in fade-in slide-in-from-bottom-2 duration-300">
                    {!isLinkedFileUnit && isPracticeMode && (
                        <div className="absolute top-4 right-6 z-20 flex items-center gap-2 bg-amber-100 text-amber-800 px-3 py-1.5 rounded-full border border-amber-200 animate-in fade-in slide-in-from-top-2 shadow-sm">
                            <BrainCircuit size={12} />
                            <span className="text-[10px] font-black uppercase tracking-tighter">Active Recall</span>
                        </div>
                    )}
                    {isLinkedFileUnit ? (
                        renderLinkedFile(essayFileContent)
                    ) : (
                        <EssayReader 
                            className="min-h-[60vh]"
                            text={unit.essay || ''} 
                            vocabString={unit.customVocabString} 
                            wordsByText={wordsByText} 
                            onHoverWord={handleHoverWord} 
                            onWordAction={onWordAction} 
                            isPracticeMode={isPracticeMode} 
                        />
                    )}
                </div>
            )}

            {activeTab === 'ANSWER' && isLinkedFileUnit && (
                <div className="rounded-[2.5rem] border border-neutral-200 shadow-sm bg-white overflow-hidden flex flex-col relative animate-in fade-in slide-in-from-bottom-2 duration-300">
                    {renderLinkedFile(answerFileContent)}
                </div>
            )}

            {activeTab === 'VOCAB' && !isLinkedFileUnit && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <WordTable 
                        user={user}
                        words={pagedUnitWords} 
                        total={filteredUnitWords.length} 
                        loading={false} 
                        page={unitTablePage} 
                        pageSize={unitTablePageSize} 
                        onPageChange={setUnitTablePage} 
                        onPageSizeChange={setUnitTablePageSize} 
                        onSearch={setUnitTableQuery} 
                        onFilterChange={setUnitTableFilters} 
                        onAddWords={async () => {}} 
                        onViewWord={setViewingWord}
                        onEditWord={setEditingWord}
                        onDelete={async (w) => { await handleRemoveWordFromUnit(w.id); }} 
                        onHardDelete={onHardDelete}
                        onBulkDelete={onBulkDelete}
                        onBulkHardDelete={onBulkHardDelete}
                        onPractice={(ids) => onStartSession(allWords.filter(w => ids.has(w.id)))} 
                        settingsKey="ielts_pro_unit_table_settings" 
                        context="unit" 
                    />
                </div>
            )}

            {activeTab === 'NOTE' && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 flex flex-col min-h-[calc(100vh-260px)]">
                    <div className="rounded-[2.5rem] border border-neutral-200 shadow-sm bg-white p-6 space-y-5 flex flex-col flex-1">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="text-xs font-black uppercase tracking-[0.3em] text-neutral-400">Note</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setNoteMode('edit')}
                                    className={`px-3 py-1 rounded-md text-[11px] font-black uppercase tracking-[0.3em] transition ${noteMode === 'edit' ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'}`}
                                >
                                    Raw
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setNoteMode('preview')}
                                    className={`px-3 py-1 rounded-md text-[11px] font-black uppercase tracking-[0.3em] transition ${noteMode === 'preview' ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'}`}
                                >
                                    Preview
                                </button>
                            </div>
                        </div>
                        <div className="flex flex-col flex-1 min-h-0">
                            {noteMode === 'edit' ? (
                                <textarea
                                    value={note}
                                    onChange={(event) => onNoteChange(event.target.value)}
                                    placeholder="Write your Markdown note here..."
                                    className="w-full flex-1 h-full min-h-[300px] border border-neutral-300 rounded-md p-3 resize-none focus:outline-none focus:ring-2 focus:ring-neutral-900"
                                />
                            ) : (
                                <div className="w-full flex-1 min-h-[300px] border border-neutral-300 rounded-md px-4 pb-4 pt-2 overflow-auto bg-neutral-50 prose prose-sm max-w-none prose-p:text-neutral-600 prose-strong:text-neutral-900 prose-a:text-indigo-600 prose-headings:mt-2 prose-headings:mb-2 text-sm text-neutral-800">
                                    {previewHtml ? (
                                        <div className="text-neutral-900" dangerouslySetInnerHTML={{ __html: previewHtml }} />
                                    ) : (
                                        <p className="text-xs text-neutral-500">Markdown preview will appear here while you type.</p>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>

      </div>

      {activeTooltip && (<div className="fixed z-50 pointer-events-none transition-all duration-150 animate-in fade-in zoom-in-95" style={{ top: `${activeTooltip.rect.top - 10}px`, left: `${activeTooltip.rect.left}px`, transform: 'translateY(-100%)' }}><div className="bg-white px-4 py-3 rounded-2xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.2)] border border-cyan-100 flex flex-col items-start text-left space-y-1 min-w-[140px] relative"><div className="text-sky-600 font-sans text-xs font-bold tracking-wide">{activeTooltip.word.ipaUs || '/?/'}</div><div className="text-sm font-black text-slate-800 leading-none">{activeTooltip.word.meaningVi}</div><div className="absolute top-full left-4 -mt-1 w-3 h-3 bg-white border-r border-b border-cyan-100 rotate-45 transform" /></div></div>)}
      {viewingWord && <ViewWordModal word={viewingWord} onClose={() => setViewingWord(null)} onNavigateToWord={setViewingWord} onUpdate={handleSaveWordUpdate} onEditRequest={(word) => { setViewingWord(null); setEditingWord(word); }} onGainXp={async () => 0} isViewOnly={true} />}
      {editingWord && <EditWordModal user={user} word={editingWord} onSave={handleSaveAndCloseEdit} onClose={() => setEditingWord(null)} onSwitchToView={(word) => { setEditingWord(null); setViewingWord(word); }}/>}
      <ComprehensionCheckModal 
        isOpen={isComprehensionModalOpen}
        onClose={onCloseComprehensionModal}
        questions={unit.comprehensionQuestions || []}
        answers={comprehensionAnswers}
        onAnswerChange={onComprehensionAnswerChange}
        results={comprehensionResults}
        onResultChange={onComprehensionResultChange}
      />
    </>
  );
}
