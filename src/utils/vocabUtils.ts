import { VocabularyItem, WordFamilyMember, PrepositionPattern, ParaphraseOption, CollocationDetail, WordQuality } from '../app/types';
import { calculateGameEligibility } from './gameEligibility';
import { calculateComplexity, calculateMasteryScore } from './srs';

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
                    return { 
                        word: x.w || x.word, 
                        ipa: x.i || x.ipa || x.i_us || ''
                    };
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
            if (typeof x === 'string') return { prep: x.trim(), usage: '' };
            return { 
                prep: (x.p || x.prep || '').trim(), 
                usage: (x.c || x.usage || '').trim() 
            };
        }).filter(x => x.prep.length > 0);
    };

    const mapColloc = (list: any): CollocationDetail[] | undefined => {
        if (!Array.isArray(list)) return undefined;
        const mappedItems: (CollocationDetail | null)[] = list.map((item: any) => {
            if (typeof item === 'string') {
                return { text: item, isIgnored: false };
            }
            if (item && item.text) {
                return { text: item.text, d: item.d, isIgnored: false };
            }
            return null;
        });
        return mappedItems.filter((item): item is CollocationDetail => item !== null && !!item.text);
    };

    let normalizedPrepsArray = undefined;
    if (Array.isArray(shortData.prepositionsArray)) {
        normalizedPrepsArray = shortData.prepositionsArray;
    }
    else if (Array.isArray(shortData.prep)) {
        normalizedPrepsArray = mapPrep(shortData.prep);
    } 
    else if (Array.isArray(shortData.prepositions)) {
        normalizedPrepsArray = mapPrep(shortData.prepositions);
    }

    const rawCollocs = shortData.col || shortData.collocations;
    let collocationsArray: CollocationDetail[] | undefined;
    let collocationsString: string | undefined;

    if (Array.isArray(rawCollocs)) {
        collocationsArray = mapColloc(rawCollocs);
        if (collocationsArray) {
            collocationsString = collocationsArray.map(c => c.text).join('\n');
        }
    } else if (typeof rawCollocs === 'string') {
        collocationsString = rawCollocs;
    }

    return {
        original: shortData.og || shortData.original,
        headword: shortData.hw || shortData.headword,
        ipa: shortData.ipa || shortData.ipa_us,
        ipaUs: shortData.ipa_us,
        ipaUk: shortData.ipa_uk,
        pronSim: shortData.pron_sim,
        ipaMistakes: shortData.ipa_m || shortData.ipaMistakes,
        meaningVi: shortData.m || shortData.meaningVi,
        register: shortData.reg || shortData.register,
        example: shortData.ex || shortData.example,
        collocations: collocationsString,
        collocationsArray: collocationsArray,
        idioms: shortData.idm || shortData.idioms,
        
        prepositionString: typeof shortData.prep === 'string' ? shortData.prep : (typeof shortData.preposition === 'string' ? shortData.preposition : undefined),
        prepositionsArray: normalizedPrepsArray,

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
 */
export const parsePrepositionPatterns = (prepositionStr: string | null | undefined): PrepositionPattern[] | undefined => {
    if (!prepositionStr || typeof prepositionStr !== 'string' || prepositionStr.trim().toLowerCase() === 'null') {
        return undefined;
    }

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
        
        if (commonPrepositions.has(words[0].toLowerCase())) {
             const prep = words[0];
             const usage = pattern.substring(prep.length).trim();
             return { prep, usage };
        }

        const prepIndex = words.findIndex(w => commonPrepositions.has(w.toLowerCase()));
        if (prepIndex > 0) {
             const prep = words[prepIndex];
             const usage = words.slice(prepIndex + 1).join(' ');
             return { prep, usage };
        }

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
    const aiResult = normalizeAiResponse(rawAiResult);
    if (!aiResult) return baseItem;

    const updatedItem: VocabularyItem = { ...baseItem };
    
    updatedItem.ipa = aiResult.ipa ?? baseItem.ipa;
    updatedItem.ipaUs = aiResult.ipaUs ?? baseItem.ipaUs;
    updatedItem.ipaUk = aiResult.ipaUk ?? baseItem.ipaUk;
    updatedItem.pronSim = aiResult.pronSim ?? baseItem.pronSim;
    updatedItem.ipaMistakes = aiResult.ipaMistakes ?? baseItem.ipaMistakes;
    updatedItem.meaningVi = aiResult.meaningVi ?? baseItem.meaningVi;
    updatedItem.register = aiResult.register ?? baseItem.register;
    
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

    const existingCollocs: CollocationDetail[] = baseItem.collocationsArray || 
        (baseItem.collocations ? baseItem.collocations.split('\n').map(t => ({ text: t.trim(), isIgnored: false })).filter(c => c.text) : []);
    let mergedCollocs: CollocationDetail[] = [...existingCollocs];

    if (aiResult.collocationsArray) {
        aiResult.collocationsArray.forEach((newColloc: CollocationDetail) => {
            const existingIndex = mergedCollocs.findIndex(ec => ec.text.toLowerCase() === newColloc.text.toLowerCase());
            if (existingIndex !== -1) {
                if (newColloc.d && !mergedCollocs[existingIndex].d) {
                    mergedCollocs[existingIndex].d = newColloc.d;
                }
            } else {
                mergedCollocs.push({ text: newColloc.text, d: newColloc.d, isIgnored: false });
            }
        });
    } else if (aiResult.collocations) { // fallback for string-only
        const newTexts = aiResult.collocations.split(/\n|;/).map((c: string) => c.trim()).filter(Boolean);
        newTexts.forEach((newText: string) => {
            if (!mergedCollocs.some(ec => ec.text.toLowerCase() === newText.toLowerCase())) {
                mergedCollocs.push({ text: newText, isIgnored: false });
            }
        });
    }

    updatedItem.collocationsArray = mergedCollocs;
    updatedItem.collocations = mergedCollocs.map(c => c.text).join('\n');

    const mergedIdioms = mergeStringArray(baseItem.idiomsList, aiResult.idioms, baseItem.idioms);
    updatedItem.idiomsList = mergedIdioms;
    updatedItem.idioms = mergedIdioms.map(c => c.text).join('\n');

    let finalPrepositions = baseItem.prepositions || [];
    
    if (aiResult.prepositionsArray && Array.isArray(aiResult.prepositionsArray) && aiResult.prepositionsArray.length > 0) {
        const newPreps = aiResult.prepositionsArray as PrepositionPattern[];
        const merged = [...finalPrepositions];
        newPreps.forEach(np => {
            if (np.prep) {
                const exists = merged.some(ep => ep.prep.toLowerCase() === np.prep.toLowerCase() && ep.usage.toLowerCase() === np.usage.toLowerCase());
                if (!exists) merged.push({ ...np, isIgnored: false });
            }
        });
        finalPrepositions = merged;
    } 
    else if (aiResult.prepositionString && typeof aiResult.prepositionString === 'string') {
        const newPreps = parsePrepositionPatterns(aiResult.prepositionString);
        if (newPreps) {
            const merged = [...finalPrepositions];
            newPreps.forEach(np => {
                const exists = merged.some(ep => ep.prep === np.prep && ep.usage === np.usage);
                if (!exists) merged.push(np);
            });
            finalPrepositions = merged;
        }
    }
    updatedItem.prepositions = finalPrepositions.length > 0 ? finalPrepositions : undefined;

    if (aiResult.wordFamily) {
        if (aiResult.wordFamily.advs) {
            aiResult.wordFamily.advs = aiResult.wordFamily.advs.map((adv: WordFamilyMember) => ({
                ...adv,
                isIgnored: true,
            }));
        }
        updatedItem.wordFamily = aiResult.wordFamily;
    } else {
        updatedItem.wordFamily = baseItem.wordFamily;
    }

    if (aiResult.paraphrases && Array.isArray(aiResult.paraphrases)) {
        const existingPara = baseItem.paraphrases || [];
        const newPara = aiResult.paraphrases as ParaphraseOption[];
        const combined = [...existingPara];
        
        newPara.forEach(np => {
            if (!combined.some(cp => cp.word.toLowerCase() === np.word.toLowerCase())) {
                combined.push(np);
            }
        });
        updatedItem.paraphrases = combined;
    }
    
    let finalExample = baseItem.example || '';
    if (aiResult.example && !finalExample.toLowerCase().includes(aiResult.example.toLowerCase())) {
        finalExample = finalExample.trim() ? `${finalExample}\n${aiResult.example}` : aiResult.example;
    }
    updatedItem.example = finalExample;

    const newTags = new Set((baseItem.tags || []).map(t => t.toLowerCase()));
    (aiResult.tags || []).forEach((t: string) => newTags.add(t.toLowerCase()));
    updatedItem.tags = Array.from(newTags);

    updatedItem.isIdiom = aiResult.isIdiom !== undefined ? !!aiResult.isIdiom : baseItem.isIdiom;
    updatedItem.isPhrasalVerb = aiResult.isPhrasalVerb !== undefined ? !!aiResult.isPhrasalVerb : baseItem.isPhrasalVerb;
    updatedItem.isCollocation = aiResult.isCollocation !== undefined ? !!aiResult.isCollocation : baseItem.isCollocation;
    updatedItem.isStandardPhrase = aiResult.isStandardPhrase !== undefined ? !!aiResult.isStandardPhrase : baseItem.isStandardPhrase;
    updatedItem.isIrregular = aiResult.isIrregular !== undefined ? !!aiResult.isIrregular : baseItem.isIrregular;
    updatedItem.isPassive = aiResult.isPassive !== undefined ? !!aiResult.isPassive : baseItem.isPassive;
    
    updatedItem.quality = WordQuality.REFINED;
    updatedItem.v2 = aiResult.v2 ?? baseItem.v2;
    updatedItem.v3 = aiResult.v3 ?? baseItem.v3;
    updatedItem.needsPronunciationFocus = aiResult.needsPronunciationFocus ?? baseItem.needsPronunciationFocus;
    
    // RECALCULATE CRITICAL METRICS
    updatedItem.complexity = calculateComplexity(updatedItem);
    updatedItem.masteryScore = calculateMasteryScore(updatedItem);
    updatedItem.gameEligibility = calculateGameEligibility(updatedItem);
    updatedItem.updatedAt = Date.now();
    
    return updatedItem;
};