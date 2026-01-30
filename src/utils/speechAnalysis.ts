
/**
 * Granular Local Speech Analysis Utility
 * Performs character-level alignment between target and transcript.
 */

export interface CharDiff {
    char: string;
    status: 'correct' | 'wrong' | 'missing';
}

export interface WordResult {
    word: string;
    status: 'correct' | 'near' | 'wrong' | 'missing';
    chars: CharDiff[];
}

export interface AnalysisResult {
    score: number;
    words: WordResult[];
}

const normalize = (text: string) => text.toLowerCase().replace(/[.,!?;:]/g, '').trim();

/**
 * Simple character alignment helper with safety break
 */
function alignChars(target: string, input: string): CharDiff[] {
    const t = target.toLowerCase();
    const i = input.toLowerCase();
    const result: CharDiff[] = [];
    
    let tIdx = 0;
    let iIdx = 0;
    let safetyCounter = 0;
    const maxIterations = (t.length + i.length) * 2 + 100;

    while ((tIdx < t.length || iIdx < i.length) && safetyCounter < maxIterations) {
        safetyCounter++;
        
        if (tIdx < t.length && iIdx < i.length && t[tIdx] === i[iIdx]) {
            result.push({ char: t[tIdx], status: 'correct' });
            tIdx++;
            iIdx++;
        } else if (tIdx < t.length && (iIdx >= i.length || t[tIdx] !== i[iIdx])) {
            // Check if character appears later in input (very simple lookahead)
            const nextMatch = i.indexOf(t[tIdx], iIdx);
            if (nextMatch !== -1 && nextMatch - iIdx < 3) {
                // Skip extra chars in input
                iIdx = nextMatch;
                result.push({ char: t[tIdx], status: 'correct' });
                tIdx++;
                iIdx++;
            } else {
                result.push({ char: t[tIdx], status: 'wrong' });
                tIdx++;
            }
        } else {
            // Extra characters in input (we ignore these for target highlighting)
            iIdx++;
        }
    }

    return result;
}

export function analyzeSpeechLocally(target: string, transcript: string): AnalysisResult {
    const targetWords = target.split(/\s+/).filter(Boolean);
    const userWordsRaw = normalize(transcript).split(/\s+/).filter(Boolean);
    
    let totalChars = 0;
    let correctChars = 0;

    const wordResults: WordResult[] = targetWords.map(tWord => {
        const cleanT = normalize(tWord);
        totalChars += cleanT.length;

        // Find closest match in user words pool
        let bestMatchIdx = -1;

        userWordsRaw.forEach((uWord, idx) => {
            if (bestMatchIdx !== -1) return;
            if (uWord === cleanT) {
                bestMatchIdx = idx;
            }
        });

        if (bestMatchIdx === -1) {
            // Fallback: simple fuzzy start match
            userWordsRaw.forEach((uWord, idx) => {
                if (bestMatchIdx !== -1) return;
                if (uWord.length >= 2 && (uWord.startsWith(cleanT.substring(0, 2)) || cleanT.startsWith(uWord.substring(0, 2)))) {
                    bestMatchIdx = idx;
                }
            });
        }

        if (bestMatchIdx !== -1) {
            const said = userWordsRaw[bestMatchIdx];
            userWordsRaw.splice(bestMatchIdx, 1); // Consume
            
            const chars = alignChars(tWord, said);
            const wordCorrect = chars.filter(c => c.status === 'correct').length;
            correctChars += wordCorrect;

            const status = wordCorrect === cleanT.length ? 'correct' : 'near';

            return { 
                word: tWord, 
                status, 
                chars 
            };
        }

        // Missing word
        return { 
            word: tWord, 
            status: 'missing', 
            chars: tWord.split('').map(char => ({ char, status: 'missing' })) 
        };
    });

    const score = totalChars > 0 ? Math.round((correctChars / totalChars) * 100) : 0;

    return {
        score,
        words: wordResults
    };
}
