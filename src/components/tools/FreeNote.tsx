import React, { useState, useRef, useEffect, useMemo } from "react";
import { User } from '../../app/types';
import { saveUser, getAllUsers } from '../../app/db';
import { useToast } from '../../contexts/ToastContext';
import { parseMarkdown } from '../../utils/markdownParser';

interface FreeNoteToolProps {
    user: User
}

export const FreeNoteTool: React.FC<FreeNoteToolProps> = ({ user }) => {
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const { showToast } = useToast();

    const [content, setContent] = useState<string>("");
    const [selectedText, setSelectedText] = useState<string>("");
    const [mode, setMode] = useState<'raw' | 'md'>('raw');
    const actionRef = useRef<HTMLDivElement | null>(null);
    const [isActionOpen, setIsActionOpen] = useState(false);

    const previewHtml = useMemo(() => {
        return parseMarkdown(content);
    }, [content]);

    const textareaRef = useRef<HTMLTextAreaElement | null>(null);

    useEffect(() => {
        const text = window.getSelection()?.toString();
        if (text && text.trim().length > 0) {
            setSelectedText(text);
        }
    }, []);

    useEffect(() => {
        (window as any).renderMarkdownBadge = (tag: string) => {
            if (tag === 'Compare') {
                return `<span class="inline-flex items-center px-3 py-1 rounded-md bg-indigo-100 text-indigo-700 text-sm font-medium mr-1">Compare</span>`;
            }
            if (tag === 'Explain') {
                return `<span class="inline-flex items-center px-3 py-1 rounded-md bg-green-100 text-green-700 text-sm font-medium mr-1">Explain</span>`;
            }
            if (tag === 'Mistake') {
                return `<span class="inline-flex items-center px-3 py-1 rounded-md bg-amber-100 text-amber-700 text-sm font-medium mr-1">Mistake</span>`;
            }
            return undefined;
        };

        return () => {
            delete (window as any).renderMarkdownBadge;
        };
    }, []);

    // Removed click-outside useEffect

    // Remove effect that sets content from user prop
    useEffect(() => {
        const loadUser = async () => {
            if (!user?.id) return;
            const freshUser = (await getAllUsers()).find(u => u.id === user.id);
            if (freshUser) {
                setCurrentUser(freshUser);
                setContent(freshUser.note ?? "");
            }
        };

        loadUser();
    }, [user?.id]);

    const contentRef = useRef(content);

    // Keep ref in sync without re-creating effect
    useEffect(() => {
        contentRef.current = content;
    }, [content]);

    useEffect(() => {
        return () => {
            if (!currentUser) return;

            const updatedUser: User = {
                ...currentUser,
                note: contentRef.current,
            };

            void saveUser(updatedUser);
            showToast("Note saved");
        };
    }, [currentUser]);

    const handleTextareaSelect = () => {
        if (!textareaRef.current) return;
    };

    const handleInsertSelected = () => {
        if (!selectedText || !textareaRef.current) return;

        const textarea = textareaRef.current;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;

        const newValue =
            content.substring(0, start) +
            selectedText +
            content.substring(end);

        setContent(newValue);

        // restore cursor position after inserted text
        setTimeout(() => {
            textarea.focus();
            const cursorPosition = start + selectedText.length;
            textarea.setSelectionRange(cursorPosition, cursorPosition);
        }, 0);
    };

    const handleAction = (type: "Compare" | "Explain" | "Mistake") => {
        if (!textareaRef.current) return;

        const textarea = textareaRef.current;
        const cursor = textarea.selectionStart;

        // Find current line end
        const currentLineEnd = content.indexOf("\n", cursor);

        const insertLine = `- [${type}] `;

        let insertPosition: number;
        let prefix: string;
        let suffix: string;

        if (currentLineEnd === -1) {
            // Cursor is on last line
            insertPosition = content.length;
            prefix = content.endsWith("\n") ? content : content + "\n";
            suffix = "";
        } else {
            // Insert AFTER current line
            insertPosition = currentLineEnd + 1;
            prefix = content.substring(0, insertPosition);
            suffix = content.substring(insertPosition);
        }

        const newValue = prefix + insertLine + "\n" + suffix;

        setContent(newValue);

        // Move cursor to end of inserted action line (before its newline)
        setTimeout(() => {
            textarea.focus();
            const newCursor = prefix.length + insertLine.length;
            textarea.setSelectionRange(newCursor, newCursor);
        }, 0);
    };

    return (
        <div className="w-full h-full flex flex-col px-4 pb-4 pt-0 text-sm">
            {/* Actions */}
            <div className="flex items-center gap-3 pb-3 flex-wrap">
                <div
                    ref={actionRef}
                    className="relative"
                >
                    <button
                        type="button"
                        onClick={() => setIsActionOpen(prev => !prev)}
                        className="px-3 py-1 rounded-md bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition"
                    >
                        Actions ▾
                    </button>

                    {isActionOpen && (
                        <div className="absolute left-0 top-full z-20 w-40 bg-white border border-neutral-200 rounded-md shadow-lg py-1">
                            <button
                                type="button"
                                onClick={() => {
                                    handleAction("Compare");
                                    setIsActionOpen(false);
                                }}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 text-indigo-700"
                            >
                                Compare
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    handleAction("Explain");
                                    setIsActionOpen(false);
                                }}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-green-50 text-green-700"
                            >
                                Explain
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    handleAction("Mistake");
                                    setIsActionOpen(false);
                                }}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-amber-50 text-amber-700"
                            >
                                Mistake
                            </button>
                        </div>
                    )}
                </div>

                {selectedText && (
                    <div className="flex items-center gap-2 ml-4">
                        <span className="text-xs font-medium text-neutral-500">Selected text:</span>
                        <button
                            type="button"
                            onClick={handleInsertSelected}
                            className="px-3 py-1 rounded-md bg-blue-100 text-blue-700 hover:bg-blue-200 transition max-w-[180px] truncate"
                            title={selectedText}
                        >
                            {selectedText}
                        </button>
                    </div>
                )}

                <div className="flex items-center gap-2 ml-auto">
                    <button
                        type="button"
                        onClick={() => setMode('raw')}
                        className={`px-3 py-1 rounded-md transition ${mode === 'raw' ? 'bg-neutral-800 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'}`}
                    >
                        Raw
                    </button>
                    <button
                        type="button"
                        onClick={() => setMode('md')}
                        className={`px-3 py-1 rounded-md transition ${mode === 'md' ? 'bg-neutral-800 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'}`}
                    >
                        MD
                    </button>
                </div>
            </div>

            {/* Raw Input */}
            <div className="flex flex-col flex-1">
                {mode === 'raw' ? (
                    <textarea
                        ref={textareaRef}
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        className="w-full flex-1 border border-neutral-300 rounded-md p-2 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                ) : (
                    <div
                        className="w-full flex-1 border border-neutral-300 rounded-md px-4 pb-4 pt-2 overflow-auto prose prose-sm max-w-none prose-p:text-neutral-600 prose-strong:text-neutral-900 prose-a:text-indigo-600 prose-headings:mt-2 prose-headings:mb-2"
                        dangerouslySetInnerHTML={{ __html: previewHtml }}
                    />
                )}
            </div>            
            <div className="pt-2 text-xs text-neutral-400">
                Content is autosaved
            </div>
        </div>
    );
};