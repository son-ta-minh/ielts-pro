import React, { useCallback, useEffect, useState, useRef } from 'react';
import { X, RefreshCw, Lightbulb } from 'lucide-react';
import { StudyItem } from '../../app/types';
import { parseMarkdown } from '../../utils/markdownParser';

interface AI_QuizProps {
    studyBuddyAiUrl: string;
    isOpen: boolean;
    studyItem: StudyItem;
    onClose: () => void;
}

type QuestionType =
  | 'collocation'
  | 'preposition'
  | 'intensifier'
  | 'context'
  | 'idiom';

const focusTypes: QuestionType[] = [
  'collocation',
  'preposition',
  'intensifier',
  'context',
  'idiom'
];

const buildPrompt = (type: QuestionType, item: StudyItem, history: string[]) => {
    const baseData = `
WORD: "${item.word}"
Note: ${item.note ?? "N/A"}
Collocations: ${item.collocations ?? "N/A"}
Prepositions:
${item.prepositions?.length
    ? item.prepositions.map(p => `- ${p.prep}: ${p.usage}`).join('\n')
    : "N/A"}
Idioms: ${item.idioms ?? "N/A"}

PREVIOUS TAGS:
${history.length ? history.map((h, i) => `${i + 1}. ${h}`).join('\n') : 'None'}
`;

    switch (type) {
        case 'collocation':
            return `${baseData}
TASK: Test collocation ONLY
Rule: Identify the correct collocation for the given word.
Question: ...`;

        case 'preposition':
            return `${baseData}
TASK: Test preposition ONLY
Question: ...`;

        case 'intensifier':
            return `${baseData}
TASK: Test intensifier ONLY. For example: if word is 'hot', intensifier could be 'scorching'
Question: ...`;

        case 'context':
            return `${baseData}
TASK: Test context ONLY (formal vs informal)
Rule: Give some situations and ask user to choose which places are appropriate to use the word
Question: ...`;

        case 'idiom':
            return `${baseData}
TASK: Test idiom ONLY (natural usage only)
Rule: If the word is an idiom, test if user knows the meaning among the options. If word itself is not an idiom, test if the user knows the idiom of this word by providing context and ask which idiom should be used.
Question: ...`;
    }
};

const AI_Quiz: React.FC<AI_QuizProps> = ({ isOpen, studyItem, onClose, studyBuddyAiUrl }) => {
    if (!isOpen) return null;

    const [question, setQuestion] = useState<string>('');
    const [answer, setAnswer] = useState<string>('');
    const [evaluation, setEvaluation] = useState<string>('');
    const [evalLoading, setEvalLoading] = useState<boolean>(false);
    const [loading, setLoading] = useState<boolean>(false);
    const [questionTimer, setQuestionTimer] = useState<number>(0);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const [revealedAnswer, setRevealedAnswer] = useState<string>('');
    const [answerLoading, setAnswerLoading] = useState<boolean>(false);
    const [language, setLanguage] = useState<'en' | 'vi'>(() => {
        return (localStorage.getItem('quiz_language') as 'en' | 'vi') || 'en';
    });
    // --- Focus selection state ---
    const [selectedFocus, setSelectedFocus] = useState<QuestionType>('collocation');
    const [showFocusMenu, setShowFocusMenu] = useState<boolean>(false);
    // ---
    // Valid focus types for current study item
    const [validFocusTypes, setValidFocusTypes] = useState<QuestionType[]>(focusTypes);
    // Returns valid focus types for a study item
    const getValidFocusTypes = (item: StudyItem): QuestionType[] => {
        const valid: QuestionType[] = [];

        valid.push('collocation');

        if (item.prepositions && item.prepositions.length > 0) {
            valid.push('preposition');
        }

        if (item.idioms && item.idioms.trim().length > 0) {
            valid.push('idiom');
        }

        valid.push('intensifier');
        valid.push('context');

        return valid;
    };
    useEffect(() => {
        localStorage.setItem('quiz_language', language);
    }, [language]);
    const [questionHistory, setQuestionHistory] = useState<string[]>([]);

    useEffect(() => {
        if (!isOpen) {
            setQuestion('');
            setAnswer('');
            setEvaluation('');
            setRevealedAnswer('');
            setQuestionHistory([]);
            setLoading(false);
            setEvalLoading(false);
            setAnswerLoading(false);
            setQuestionTimer(0);
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
        }
    }, [isOpen]);

    // Ensure we use /chat_gpt endpoint if /chat is present
    const aiUrl = studyBuddyAiUrl.includes('/chat')
        ? studyBuddyAiUrl.replace('/chat', '/chat_gpt')
        : studyBuddyAiUrl;

    const generateQuestion = useCallback(async (focus: QuestionType) => {
        if (!studyItem) return;

        setQuestionTimer(0);

        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }

        timerRef.current = setInterval(() => {
            setQuestionTimer(prev => prev + 1);
        }, 1000);

        // reset session state when generating new question
        setRevealedAnswer('');
        setEvaluation('');
        setAnswer('');

        setLoading(true);

        try {
            const messages = [
                {
                    role: 'system',
                    content: 'You are an IELTS vocabulary coach. Create short, precise vocabulary practice question.'
                },
                {
                    role: 'user',
                    content: buildPrompt(focus, studyItem, questionHistory)
                }
            ];

            const response = await fetch(aiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    messages,
                    searchEnabled: false,
                    temperature: 0.7,
                    top_p: 0.9,
                    repetition_penalty: 1.05,
                    stream: true
                })
            });

            if (!response.ok) {
                throw new Error(`AI quiz request failed (${response.status})`);
            }

            const reader = response.body?.getReader();
            const decoder = new TextDecoder('utf-8');

            if (!reader) {
                return;
            }

            let accumulated = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });

                // split possible SSE / multi-json lines
                const lines = chunk.split('\n').filter(Boolean);

                for (const line of lines) {
                    let cleaned = line.trim();

                    // remove SSE prefix if exists
                    if (cleaned.startsWith('data:')) {
                        cleaned = cleaned.replace('data:', '').trim();
                    }

                    // ignore control messages
                    if (!cleaned || cleaned === '[DONE]') continue;

                    try {
                        const json = JSON.parse(cleaned);
                        const delta = json?.choices?.[0]?.delta?.content;
                        if (delta) {
                            accumulated += delta;

                            // Remove any lines starting with "Answer:" from displayed question
                            const cleaned = accumulated
                                .split('\n')
                                .filter(line => !line.trim().startsWith('Answer:'))
                                .join('\n')
                                .trim();

                            setQuestion(cleaned);
                        }
                    } catch (e) {
                        // fallback: ignore invalid JSON chunks
                        continue;
                    }
                }
            }
            // Save generated question into history (last 20, only type: target, single tag line)
            if (accumulated.trim()) {
                const lines = accumulated.trim().split('\n');
                const firstLineRaw = (lines[0] || '').trim().toLowerCase();
                const firstLine = firstLineRaw.split('\n')[0].trim();

                if (firstLine) {
                    setQuestionHistory(prev => {
                        const updated = [...prev, firstLine].slice(-20);
                        return updated;
                    });
                }
            }
        } finally {
            setLoading(false);
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
        }
    }, [studyItem, studyBuddyAiUrl, language, questionHistory, selectedFocus]);
    // Handle outside click to close focus menu
    useEffect(() => {
        if (!showFocusMenu) return;

        const handler = () => setShowFocusMenu(false);
        window.addEventListener('click', handler);

        return () => window.removeEventListener('click', handler);
    }, [showFocusMenu]);

    const evaluateAnswer = useCallback(async () => {
        if (!studyItem || !question || !answer.trim()) return;

        setEvalLoading(true);
        setEvaluation('');

        try {
            const messages = [
                {
                    role: 'system',
                    content: language === 'vi'
                        ? 'Bạn là giáo viên tiếng Anh nghiêm khắc. Chỉ kiểm tra độ chính xác của câu trả lời từ vựng. Sau khi chấm, giải thích ngắn gọn bằng tiếng Việt.'
                        : 'You are a strict English teacher. Your job is ONLY to check correctness of the user answer for a vocabulary question. Do NOT behave like an IELTS Speaking examiner. Focus only on correctness and usage accuracy.'
                },
                {
                    role: 'user',
                    content: `Task: Check if the user's answer correctly explains or uses the target word.

Word: ${studyItem.word}
Question: ${question}

User answer: ${answer}

Return STRICT format:
- Correct: Yes / No / Partially
- Why: short explanation
- Answer: corrected version of the answer (only if needed)

Do NOT:
- give IELTS score
- give speaking feedback
- give long essay-style evaluation
- include headings like IELTS, band score, examiner notes`
                }
            ];

            const response = await fetch(aiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    messages,
                    searchEnabled: false,
                    temperature: 0.5,
                    top_p: 0.9,
                    repetition_penalty: 1.05,
                    stream: false
                })
            });

            if (!response.ok) {
                throw new Error(`AI evaluation failed (${response.status})`);
            }

            const payload = await response.json().catch(() => null);
            const text = String(payload?.choices?.[0]?.message?.content || '').trim();

            setEvaluation(text);
        } finally {
            setEvalLoading(false);
        }
    }, [studyBuddyAiUrl, studyItem, question, answer, language]);

    const generateAnswer = useCallback(async () => {
        if (!studyItem || !question) return;

        setAnswerLoading(true);
        setRevealedAnswer('');

        try {
            const messages = [
                {
                    role: 'system',
                    content: language === 'vi'
                        ? 'Bạn là giáo viên tiếng Anh. Hãy trả lời ngắn gọn, dễ hiểu bằng tiếng Việt cho câu hỏi từ vựng.'
                        : 'You are an IELTS vocabulary teacher. Provide a short, correct model answer to the question. Keep it concise and natural.'
                },
                {
                    role: 'user',
                    content: `Question: ${question}\nWord: ${studyItem.word}\nMeaning: ${studyItem.meaning}\n\nProvide a short correct answer only (2-4 sentences max).`
                }
            ];

            const response = await fetch(aiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    messages,
                    searchEnabled: false,
                    temperature: 0.5,
                    top_p: 0.9,
                    repetition_penalty: 1.05,
                    stream: true
                })
            });

            if (!response.ok) {
                throw new Error(`AI answer failed (${response.status})`);
            }

            const reader = response.body?.getReader();
            const decoder = new TextDecoder('utf-8');

            if (!reader) {
                return;
            }

            let accumulated = '';

            while (true) {
                const { done, value } = await reader.read();

                if (done) break;

                const chunk = decoder.decode(value, { stream: true });

                const lines = chunk.split('\n').filter(Boolean);

                for (const line of lines) {
                    let cleaned = line.trim();

                    // remove SSE prefix
                    if (cleaned.startsWith('data:')) {
                        cleaned = cleaned.replace('data:', '').trim();
                    }

                    // ignore end marker
                    if (!cleaned || cleaned === '[DONE]') continue;

                    try {
                        const json = JSON.parse(cleaned);

                        const delta = json?.choices?.[0]?.delta?.content;

                        if (delta) {
                            accumulated += delta;

                            // realtime render
                            setRevealedAnswer(accumulated);
                        }
                    } catch {
                        continue;
                    }
                }
            }
        } finally {
            setAnswerLoading(false);
        }
    }, [studyBuddyAiUrl, studyItem, question, language]);

    useEffect(() => {
        if (!isOpen || !studyItem) return;

        const valid = getValidFocusTypes(studyItem);
        setValidFocusTypes(valid);

        const defaultFocus = valid.includes('collocation') ? 'collocation' : valid[0];

        setSelectedFocus(defaultFocus);
        generateQuestion(defaultFocus);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, studyItem]);

    return (
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100vw',
                height: '100vh',
                backgroundColor: 'rgba(0,0,0,0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 9999,
            }}
            onClick={onClose}
        >
            <div
                style={{
                    width: '600px',
                    height: '80vh',
                    backgroundColor: '#fff',
                    borderRadius: '12px',
                    padding: '20px',
                    boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <p style={{ margin: 0 }}><b>Word:</b> {studyItem.word}</p>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {/* Focus selector dropdown (refresh icon) */}
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                position: 'relative'
                            }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* LEFT: Refresh */}
                            <button
                                onClick={() => {
                                    setQuestion('');
                                    const safeFocus = validFocusTypes.includes(selectedFocus)
                                        ? selectedFocus
                                        : (validFocusTypes[0] || 'collocation');
                                    generateQuestion(safeFocus);
                                }}
                                disabled={loading}
                                style={{
                                    width: '32px',
                                    height: '32px',
                                    borderRadius: '8px 0 0 8px',
                                    border: 'none',
                                    backgroundColor: '#10b981',
                                    color: '#fff',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    opacity: loading ? 0.5 : 1
                                }}
                            >
                                <RefreshCw size={16} />
                            </button>

                            {/* RIGHT: Dropdown */}
                            <button
                                onClick={() => setShowFocusMenu(prev => !prev)}
                                style={{
                                    width: '28px',
                                    height: '32px',
                                    borderRadius: '0 8px 8px 0',
                                    border: 'none',
                                    backgroundColor: '#10b981',
                                    color: '#fff',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '11px',
                                    borderLeft: '1px solid rgba(255,255,255,0.2)'
                                }}
                            >
                                ▼
                            </button>

                            {/* Dropdown */}
                            {showFocusMenu && (
                                <div
                                    style={{
                                        position: 'absolute',
                                        top: '40px',
                                        right: 0,
                                        backgroundColor: '#fff',
                                        border: '1px solid #e5e7eb',
                                        borderRadius: '10px',
                                        padding: '6px',
                                        width: '160px',
                                        boxShadow: '0 10px 20px rgba(0,0,0,0.1)',
                                        zIndex: 1000
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    {validFocusTypes.map((type) => (
                                        <div
                                            key={type}
                                            onClick={() => {
                                                setShowFocusMenu(false);
                                                setQuestion('');
                                                generateQuestion(type);
                                            }}
                                            style={{
                                                padding: '8px',
                                                cursor: 'pointer',
                                                borderRadius: '6px',
                                                backgroundColor: selectedFocus === type ? '#f3f4f6' : 'transparent',
                                                fontSize: '13px',
                                                textTransform: 'capitalize'
                                            }}
                                        >
                                            {type}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* AI Answer (lightbulb icon) */}
                        <button
                            onClick={generateAnswer}
                            disabled={answerLoading}
                            style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '8px',
                                border: 'none',
                                backgroundColor: '#facc15',
                                color: '#111827',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                opacity: answerLoading ? 0.5 : 1
                            }}
                            aria-label="Show AI answer"
                        >
                            <Lightbulb size={16} style={{ display: 'block' }} />
                        </button>

                        {/* Language toggle button */}
                        <button
                            onClick={() => setLanguage(prev => prev === 'en' ? 'vi' : 'en')}
                            style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '8px',
                                border: '1px solid #ddd',
                                backgroundColor: language === 'en' ? '#e5e7eb' : '#dbeafe',
                                color: '#111827',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '11px',
                                fontWeight: 700
                            }}
                            aria-label="Toggle language"
                        >
                            {language.toUpperCase()}
                        </button>

                        {/* Close button */}
                        <button
                            onClick={onClose}
                            style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '8px',
                                border: 'none',
                                backgroundColor: '#ef4444',
                                color: '#ffffff',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}
                            aria-label="Close modal"
                        >
                            X
                        </button>
                    </div>
                </div>
                <div style={{ marginTop: '20px' }}>
                    {studyItem ? (
                        <div>


                            {loading ? (
                                <p>
                                    Generating AI question... ({questionTimer}s)
                                </p>
                            ) : (
                                <div>
                                    <p
                                        className="text-neutral-900 leading-relaxed"
                                        dangerouslySetInnerHTML={{ __html: parseMarkdown(question || '-') }}
                                    />

                                    <div style={{ marginTop: '15px' }}>
                                        <textarea
                                            value={answer}
                                            onChange={(e) => setAnswer(e.target.value)}
                                            placeholder="Type your answer here..."
                                            style={{
                                                width: '100%',
                                                height: '100px',
                                                padding: '10px',
                                                border: '1px solid #ddd',
                                                borderRadius: '10px',
                                                outline: 'none',
                                                fontSize: '14px',
                                                resize: 'none',
                                                boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.05)'
                                            }}
                                        />
                                        <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'flex-end' }}>
                                            <button
                                                onClick={evaluateAnswer}
                                                disabled={evalLoading || !answer.trim()}
                                                style={{
                                                    padding: '8px 14px',
                                                    borderRadius: '8px',
                                                    border: 'none',
                                                    backgroundColor: '#2563eb',
                                                    color: 'white',
                                                    fontWeight: 600,
                                                    cursor: 'pointer',
                                                    opacity: evalLoading || !answer.trim() ? 0.5 : 1
                                                }}
                                            >
                                                {evalLoading ? 'Evaluating...' : 'Evaluate'}
                                            </button>
                                        </div>

                                        {(revealedAnswer || evaluation) && (
                                            <div style={{
                                                marginTop: '15px',
                                                padding: '12px',
                                                borderRadius: '10px',
                                                backgroundColor: '#f7f7f8',
                                                border: '1px solid #e5e7eb',
                                                maxHeight: '220px',
                                                overflowY: 'auto',
                                                whiteSpace: 'pre-wrap'
                                            }}>
                                                {revealedAnswer && (
                                                    <div style={{ marginBottom: '10px' }}>
                                                        <b>Model Answer:</b>
                                                        <div style={{ marginTop: '5px' }}>
                                                            {revealedAnswer}
                                                        </div>
                                                    </div>
                                                )}

                                                {evaluation && (
                                                    <div>
                                                        <b>Evaluation:</b>
                                                        <div style={{ marginTop: '5px' }}>
                                                            {evaluation}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <p>No item selected</p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AI_Quiz;
