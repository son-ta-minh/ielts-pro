
import { VocabularyItem, WordFamilyMember, PrepositionPattern, ParaphraseOption, CollocationDetail, WordQuality } from '../app/types';
import { calculateGameEligibility } from './gameEligibility';

/**
 * Normalizes the short-key JSON returned by AI into the full-key format expected by the app.
 */
export const normalizeAiResponse = (shortData: any): any => {
    if (!shortData) return null;

    // Helper to map family members
    const mapFam = (list: any[]) => {
        if (!Array.isArray(list)) return [];
        return list
            .map((x: any) => {
                if (typeof x === 'string') {
                    return { word: x, ipa: '' };
                }
                if (x && (x.w || x.word)) {
                    return { word: x.w || x.word, ipa: x.i || x.ipa || '' };
                }
                return null;
            })
            .filter((item): item is WordFamilyMember => item !== null && !!item.word);
    };

    // Helper to map paraphrases
    const mapPara = (list: any[]) => list?.map((x: any) => ({ word: x.w || x.word, tone: x.t || x.tone, context: x.c || x.context })) || [];

    // Helper to map prepositions (Robust mapping)
    const mapPrep = (list: any[]) => {
        if (!Array.isArray(list)) return [];
        return list.map((x: any) => {
            // Handle simple string array case ["on", "at"]
            if (typeof x === 'string') return { prep: x.trim(), usage: '' };
            
            // Handle object case
            return { 
                prep: (x.p || x.prep || '').trim(), 
                usage: (x.c || x.usage || '').trim() 
            };
        }).filter(x => x.prep.length > 0);
    };

    // Handle 'prep' which can now be an array of objects OR a legacy string
    let normalizedPrepsArray = undefined;
    
    // Check 1: Idempotency - if already normalized
    if (Array.isArray(shortData.prepositionsArray)) {
        normalizedPrepsArray = shortData.prepositionsArray;
    }
    // Check 2: Raw 'prep' key
    else if (Array.isArray(shortData.prep)) {
        normalizedPrepsArray = mapPrep(shortData.prep);
    } 
    // Check 3: Raw 'prepositions' key
    else if (Array.isArray(shortData.prepositions)) {
        normalizedPrepsArray = mapPrep(shortData.prepositions);
    }

    return {
        original: shortData.og || shortData.original,
        headword: shortData.hw || shortData.headword,
        ipa: shortData.ipa,
        ipaMistakes: shortData.ipa_m || shortData.ipaMistakes,
        meaningVi: shortData.m || shortData.meaningVi,
        register: shortData.reg || shortData.register,
        example: shortData.ex || shortData.example,
        collocations: shortData.col || shortData.collocations,
        idioms: shortData.idm || shortData.idioms,
        
        // Return both formats to allow merge logic to decide
        prepositionString: typeof shortData.prep === 'string' ? shortData.prep : (typeof shortData.preposition === 'string' ? shortData.preposition : undefined),
        prepositionsArray: normalizedPrepsArray,

        // Flags
        isIdiom: shortData.is_id ?? shortData.isIdiom,
        isPhrasalVerb: shortData.is_pv ?? shortData.isPhrasalVerb,
        isCollocation: shortData.is_col ?? shortData.isCollocation,
        isStandardPhrase: shortData.is_phr ?? shortData.isStandardPhrase,
        isIrregular: shortData.is_irr ?? shortData.isIrregular,
        isPassive: shortData.is_pas ?? shortData.isPassive,
        needsPronunciationFocus: shortData.is_pron ?? shortData.needsPronunciationFocus,
        
        v2: shortData.v2,
        v3: shortData.v3,
        tags: shortData.tags,

        // Complex Structures
        paraphrases: mapPara(shortData.para || shortData.paraphrases),
        wordFamily: shortData.fam ? {
            nouns: mapFam(shortData.fam.n || shortData.fam.nouns),
            verbs: mapFam(shortData.fam.v || shortData.fam.verbs),
            adjs: mapFam(shortData.fam.j || shortData.fam.adjs),
            advs: mapFam(shortData.fam.adv || shortData.fam.advs)
        } : (shortData.wordFamily || undefined)
    };
};

/**
 * Parses a string of preposition patterns (e.g., "in; at") into structured objects.
 * Used in AddWord and as fallback.
 */
export const parsePrepositionPatterns = (prepositionStr: string | null | undefined): PrepositionPattern[] | undefined => {
    if (!prepositionStr || typeof prepositionStr !== 'string' || prepositionStr.trim().toLowerCase() === 'null') {
        return undefined;
    }

    // Common single-word prepositions to help identify the split point
    const commonPrepositions = new Set([
        'of', 'in', 'to', 'for', 'with', 'on', 'at', 'from', 'by', 'about', 'as', 'into', 'like', 'through', 'after', 'over', 'between', 'out', 'against', 'during', 'without', 'before', 'under', 'around', 'among'
    ]);

    const multiWordPrepositions = [
        'out of', 'because of', 'according to', 'in front of', 'next to', 
        'due to', 'instead of', 'in spite of', 'on top of', 'as for', 
        'except for', 'apart from', 'along with', 'in addition to', 'in case of',
        'with regard to', 'as well as', 'in accordance with', 'on behalf of',
        'in relation to', 'in terms of', 'by means of', 'in charge of'
    ];

    const patterns = prepositionStr.split(/[;,]/).map(p => p.trim()).filter(Boolean);
    if (patterns.length === 0) {
        return undefined;
    }

    const results: PrepositionPattern[] = patterns.map(pattern => {
        // Strategy 1: Check for Multi-word Prepositions at Start
        const sortedMultiWord = [...multiWordPrepositions].sort((a, b) => b.length - a.length);
        const foundMultiWord = sortedMultiWord.find(mwp => pattern.toLowerCase().includes(mwp));

        if (foundMultiWord) {
            if (pattern.toLowerCase().startsWith(foundMultiWord)) {
                const prep = foundMultiWord;
                const usage = pattern.substring(prep.length).trim();
                return { prep, usage };
            }
        }

        const words = pattern.split(/\s+/);
        
        // Strategy 2: Simple First Word is Prep (e.g., "with moisture")
        if (commonPrepositions.has(words[0].toLowerCase())) {
             const prep = words[0];
             const usage = pattern.substring(prep.length).trim();
             return { prep, usage };
        }

        // Strategy 3: "Word + Prep + Usage" (e.g. "dense with moisture")
        const prepIndex = words.findIndex(w => commonPrepositions.has(w.toLowerCase()));
        if (prepIndex > 0) {
             const prep = words[prepIndex];
             const usage = words.slice(prepIndex + 1).join(' ');
             return { prep, usage };
        }

        // Default Fallback: First word is prep
        const firstSpaceIndex = pattern.indexOf(' ');
        if (firstSpaceIndex > 0) {
            const prep = pattern.substring(0, firstSpaceIndex);
            const usage = pattern.substring(firstSpaceIndex + 1).trim();
            return { prep, usage };
        }
        
        return { prep: pattern, usage: '' };
    });
    
    return results.length > 0 ? results : undefined;
};

/**
 * Merges AI-generated details into an existing VocabularyItem.
 */
export const mergeAiResultIntoWord = (baseItem: VocabularyItem, rawAiResult: any): VocabularyItem => {
    // Normalize first to handle short keys
    const aiResult = normalizeAiResponse(rawAiResult);
    
    const updatedItem: VocabularyItem = { ...baseItem };
    
    // Basic fields
    updatedItem.ipa = aiResult.ipa ?? baseItem.ipa;
    updatedItem.ipaMistakes = aiResult.ipaMistakes ?? baseItem.ipaMistakes;
    updatedItem.meaningVi = aiResult.meaningVi ?? baseItem.meaningVi;
    updatedItem.register = aiResult.register ?? baseItem.register;
    
    // Helper to merge string arrays (for Collocations and Idioms)
    const mergeStringArray = (currentList: CollocationDetail[] | undefined, incoming: any, legacyString?: string) => {
        const existing = currentList || 
            (legacyString ? legacyString.split('\n').map(t => ({ text: t.trim(), isIgnored: false })).filter(c => c.text) : []);
        
        let merged = [...existing];
        let newTexts: string[] = [];
        
        if (Array.isArray(incoming)) {
            newTexts = incoming.filter((c: any) => typeof c === 'string' && c.trim());
        } else if (typeof incoming === 'string') {
            newTexts = incoming.split(/\n|;/).map((c: string) => c.trim()).filter(Boolean);
        }

        if (newTexts.length > 0) {
            newTexts.forEach((newText: string) => {
                const exists = merged.some(ec => ec.text.toLowerCase() === newText.toLowerCase());
                if (!exists) {
                    merged.push({ text: newText, isIgnored: false });
                }
            });
        }
        return merged;
    };

    // Collocations
    const mergedCollocs = mergeStringArray(baseItem.collocationsArray, aiResult.collocations, baseItem.collocations);
    updatedItem.collocationsArray = mergedCollocs;
    updatedItem.collocations = mergedCollocs.map(c => c.text).join('\n');

    // Idioms
    const mergedIdioms = mergeStringArray(baseItem.idiomsList, aiResult.idioms, baseItem.idioms);
    updatedItem.idiomsList = mergedIdioms;
    updatedItem.idioms = mergedIdioms.map(c => c.text).join('\n');

    // Prepositions (Priority: Structured Array > String Parse)
    // Remove isPhrasalVerb restriction to accept all explicit preposition data
    let finalPrepositions = baseItem.prepositions || [];
    
    // Case A: AI returned a structured array (Preferred)
    if (aiResult.prepositionsArray && Array.isArray(aiResult.prepositionsArray) && aiResult.prepositionsArray.length > 0) {
        const newPreps = aiResult.prepositionsArray as PrepositionPattern[];
        const merged = [...finalPrepositions];
        newPreps.forEach(np => {
            if (np.prep) {
                // Check duplicate
                const exists = merged.some(ep => ep.prep.toLowerCase() === np.prep.toLowerCase() && ep.usage.toLowerCase() === np.usage.toLowerCase());
                if (!exists) {
                    merged.push({ ...np, isIgnored: false });
                }
            }
        });
        finalPrepositions = merged;
    } 
    // Case B: AI returned a string (Legacy / Fallback)
    else if (aiResult.prepositionString && typeof aiResult.prepositionString === 'string') {
        const newPreps = parsePrepositionPatterns(aiResult.prepositionString);
        if (newPreps) {
            const merged = [...finalPrepositions];
            newPreps.forEach(np => {
                const exists = merged.some(ep => ep.prep === np.prep && ep.usage === np.usage);
                if (!exists) {
                    merged.push(np);
                }
            });
            finalPrepositions = merged;
        }
    }
    updatedItem.prepositions = finalPrepositions.length > 0 ? finalPrepositions : undefined;

    // Word Family
    if (aiResult.wordFamily && aiResult.wordFamily.advs) {
        aiResult.wordFamily.advs = aiResult.wordFamily.advs.map((adv: WordFamilyMember) => ({
            ...adv,
            isIgnored: true,
        }));
    }
    updatedItem.wordFamily = aiResult.wordFamily ?? baseItem.wordFamily;

    // Paraphrases Logic - Merge unique + Preserve Ignored
    if (aiResult.paraphrases && Array.isArray(aiResult.paraphrases)) {
        const existingPara = baseItem.paraphrases || [];
        const newPara = aiResult.paraphrases as ParaphraseOption[];
        const combined = [...existingPara];
        
        newPara.forEach(np => {
            // Avoid duplicates based on the 'word' field
            if (!combined.some(cp => cp.word.toLowerCase() === np.word.toLowerCase())) {
                combined.push(np);
            }
        });
        updatedItem.paraphrases = combined;
    }
    
    // Example
    let finalExample = baseItem.example || '';
    if (aiResult.example && !finalExample.toLowerCase().includes(aiResult.example.toLowerCase())) {
        finalExample = finalExample.trim() ? `${finalExample}\n${aiResult.example}` : aiResult.example;
    }
    updatedItem.example = finalExample;

    // Tags
    const newTags = new Set((baseItem.tags || []).map(t => t.toLowerCase()));
    (aiResult.tags || []).forEach((t: string) => newTags.add(t.toLowerCase()));
    updatedItem.tags = Array.from(newTags);

    // Flags
    updatedItem.isIdiom = aiResult.isIdiom !== undefined ? !!aiResult.isIdiom : baseItem.isIdiom;
    updatedItem.isPhrasalVerb = aiResult.isPhrasalVerb !== undefined ? !!aiResult.isPhrasalVerb : baseItem.isPhrasalVerb;
    updatedItem.isCollocation = aiResult.isCollocation !== undefined ? !!aiResult.isCollocation : baseItem.isCollocation;
    updatedItem.isStandardPhrase = aiResult.isStandardPhrase !== undefined ? !!aiResult.isStandardPhrase : baseItem.isStandardPhrase;
    updatedItem.isIrregular = aiResult.isIrregular !== undefined ? !!aiResult.isIrregular : baseItem.isIrregular;
    updatedItem.isPassive = aiResult.isPassive !== undefined ? !!aiResult.isPassive : baseItem.isPassive;
    
    // Quality update: ALWAYS set quality to REFINED after AI processing.
    // This forces user re-verification even if the word was previously VERIFIED or FAILED.
    updatedItem.quality = WordQuality.REFINED;

    updatedItem.v2 = aiResult.v2 ?? baseItem.v2;
    updatedItem.v3 = aiResult.v3 ?? baseItem.v3;
    updatedItem.needsPronunciationFocus = aiResult.needsPronunciationFocus ?? baseItem.needsPronunciationFocus;
    
    // Game Eligibility: Automated check
    updatedItem.gameEligibility = calculateGameEligibility(updatedItem);
    
    updatedItem.updatedAt = Date.now();
    
    return updatedItem;
};