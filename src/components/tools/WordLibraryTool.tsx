import React, { useState } from "react";
import { User } from '../../app/types';
import * as dataStore from "../../app/dataStore";
import { createNewWord } from '../../utils/srs';
import { useToast } from '../../contexts/ToastContext';

interface ParsedWord {
    word: string;
    meaning: string;
}

interface WordLibraryToolProps {
    user: User
}

export const WordLibraryTool: React.FC<WordLibraryToolProps> = ({ user }) => {
    const { showToast } = useToast();
    const [rawText, setRawText] = useState("");
    const [parsedWords, setParsedWords] = useState<ParsedWord[]>([]);
    const [loading, setLoading] = useState(false);
    const [targetField, setTargetField] = useState<"meaningVi" | "example" | "note">("note");

    const parseText = () => {
        const lines = rawText
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean);

        const result: ParsedWord[] = lines
            .map((line) => {
                const [wordPart, ...meaningParts] = line.split(":");
                if (!wordPart || meaningParts.length === 0) return null;

                return {
                    word: wordPart.trim(),
                    meaning: meaningParts.join(":").trim(),
                };
            })
            .filter((item): item is ParsedWord => item !== null);

        setParsedWords(result);
        console.log("[WordLibraryTool] Parsed words:", result);
    };

    const updateWord = (index: number, field: keyof ParsedWord, value: string) => {
        const updated = [...parsedWords];
        updated[index][field] = value;
        setParsedWords(updated);
    };

    const deleteWord = (index: number) => {
        const updated = parsedWords.filter((_, i) => i !== index);
        setParsedWords(updated);
    };

    const handleBulkUpdate = async () => {
        if (parsedWords.length === 0) return;

        try {
            setLoading(true);

            const itemsToSave: any[] = [];
            const now = Date.now();

            for (const item of parsedWords) {
                const text = item.word.trim();
                if (!text) continue;

                const existing = await dataStore.findWordByText(user.id, text);

                if (existing) {
                    const updatedItem = {
                        ...existing,
                        updatedAt: now,
                    } as any;

                    updatedItem[targetField] = item.meaning.trim();
                    itemsToSave.push(updatedItem);
                } else {
                    const newItem = await createNewWord(
                        text,                    // word
                        "",                      // ipaUs
                        "",                      // meaningVi (set later dynamically)
                        "",                      // example
                        "",                      // note
                        [],                      // groups
                        false,
                        false,
                        false,
                        false,
                        false,
                        "manual"                 // source
                    );

                    newItem.userId = user.id;
                    newItem.updatedAt = now;
                    (newItem as any)[targetField] = item.meaning.trim();

                    itemsToSave.push(newItem);
                }
            }

            await dataStore.bulkSaveWords(itemsToSave);

            showToast("Words updated successfully.", "success");
        } catch (error) {
            console.error(error);
            showToast("Failed to update words.", "error");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="w-full h-full flex flex-col gap-4 p-4 text-sm overflow-auto">
            {/* Raw Input */}
            <div className="flex flex-col gap-2">
                <label className="font-semibold text-neutral-700">
                    Paste raw text (format: word: meaning)
                </label>
                <textarea
                    value={rawText}
                    onChange={(e) => setRawText(e.target.value)}
                    placeholder="campsite: a place where people stay in tents&#10;dog: an animal"
                    className="w-full h-32 border border-neutral-300 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                    onClick={parseText}
                    className="self-start px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition"
                >
                    Parse
                </button>
            </div>

            {/* Editable Table */}
            {parsedWords.length > 0 && (
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                        <label className="text-neutral-700">Update field:</label>
                        <select
                            value={targetField}
                            onChange={(e) => setTargetField(e.target.value as any)}
                            className="border border-neutral-300 rounded px-2 py-1"
                        >
                            <option value="note">Note</option>
                            <option value="meaningVi">Meaning (Vietnamese)</option>
                            <option value="example">Example</option>
                        </select>
                    </div>
                    <table className="w-full border border-neutral-300 text-sm">
                        <thead className="bg-neutral-100">
                            <tr>
                                <th className="border px-2 py-1 text-left">Word</th>
                                <th className="border px-2 py-1 text-left">
                                    {targetField === "meaningVi"
                                        ? "Meaning (Vietnamese)"
                                        : targetField === "example"
                                        ? "Example"
                                        : "Note"}
                                </th>
                                <th className="border px-2 py-1 text-center w-20">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {parsedWords.map((item, index) => (
                                <tr key={index}>
                                    <td className="border px-2 py-1">
                                        <input
                                            value={item.word}
                                            onChange={(e) =>
                                                updateWord(index, "word", e.target.value)
                                            }
                                            className="w-full outline-none"
                                        />
                                    </td>
                                    <td className="border px-2 py-1">
                                        <input
                                            value={item.meaning}
                                            onChange={(e) =>
                                                updateWord(index, "meaning", e.target.value)
                                            }
                                            className="w-full outline-none"
                                        />
                                    </td>
                                    <td className="border px-2 py-1 text-center">
                                        <button
                                            onClick={() => deleteWord(index)}
                                            className="text-red-600 hover:underline"
                                        >
                                            Delete
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    <button
                        onClick={handleBulkUpdate}
                        disabled={loading}
                        className="self-end mt-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition disabled:opacity-50"
                    >
                        {loading ? "Updating..." : "Update"}
                    </button>
                </div>
            )}
        </div>
    );
};