import React, { useState, useRef, useEffect } from "react";
import { User } from '../../app/types';
import { saveUser, getAllUsers } from '../../app/db';
import { useToast } from '../../contexts/ToastContext';

interface FreeNoteToolProps {
    user: User
}

export const FreeNoteTool: React.FC<FreeNoteToolProps> = ({ user }) => {
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const { showToast } = useToast();

    const [content, setContent] = useState<string>("");
    const [selectedText, setSelectedText] = useState<string>("");

    const textareaRef = useRef<HTMLTextAreaElement | null>(null);

    useEffect(() => {
        const text = window.getSelection()?.toString();
        if (text && text.trim().length > 0) {
            setSelectedText(text);
        }
    }, []);

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
        const newLine = content.trim().length === 0
            ? `- [${type}] `
            : `${content}\n- [${type}] `;
        setContent(newLine);
    };

    return (
        <div className="w-full h-full flex flex-col px-4 pb-4 pt-0 text-sm">
            {/* Actions */}
            <div className="flex items-center gap-3 pb-3 flex-wrap">
                <span className="text-xs font-medium text-neutral-500 mr-1">Action</span>
                <button
                    type="button"
                    onClick={() => handleAction("Compare")}
                    className="px-3 py-1 rounded-md bg-indigo-100 text-indigo-700 hover:bg-indigo-200 transition"
                >
                    Compare
                </button>
                <button
                    type="button"
                    onClick={() => handleAction("Explain")}
                    className="px-3 py-1 rounded-md bg-green-100 text-green-700 hover:bg-green-200 transition"
                >
                    Explain
                </button>
                <button
                    type="button"
                    onClick={() => handleAction("Mistake")}
                    className="px-3 py-1 rounded-md bg-amber-100 text-amber-700 hover:bg-amber-200 transition"
                >
                    Mistake
                </button>
                <div className="flex items-center gap-2 ml-4">
                    <span className="text-xs font-medium text-neutral-500">Selected text:</span>
                    <button
                        type="button"
                        onClick={handleInsertSelected}
                        className="px-3 py-1 rounded-md bg-blue-100 text-blue-700 hover:bg-blue-200 transition max-w-[180px] truncate"
                        title={selectedText}
                    >
                        {selectedText || "Selected"}
                    </button>
                </div>
            </div>

            {/* Raw Input */}
            <div className="flex flex-col flex-1">
                <textarea
                    ref={textareaRef}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    className="w-full flex-1 border border-neutral-300 rounded-md p-2 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
            </div>            
            <div className="pt-2 text-xs text-neutral-400">
                Content is autosaved
            </div>
        </div>
    );
};