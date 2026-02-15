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
            .map((x: any): WordFamilyMember | null => {
                if (typeof x === 'string') {
                    return { word: x };
                }
                if (x && (x.w || x.word)) {
                    return { 
                        word: x.w || x.word, 
                        isIgnored: x.g ?? x.isIgnored
                    };
                }
                return null;
            })
            .filter((item): item is WordFamilyMember => item !== null && !!item.word);
    };

    // Helper to map paraphrases
    const mapPara = (list: any[]) => list?.map((x: any) => ({ 
        word: x.w || x.word, 
        tone: x.t || x.tone, 
        context: x.c || x.context,
        isIgnored: x.g ?? x.isIgnored ?? false
    })) || [];

    // Helper to map prepositions
    const mapPrep = (list: any[]) => {
        if (!Array.isArray(list)) return [];
        return list.map((x: any) => {
            if (typeof x === 'string') return { prep: x.trim(), usage: '' };
            return { 
                prep: (x.p || x.prep || '').trim(), 
                usage: (x.c || x.usage || '').trim(),
                isIgnored: x.g ?? x.isIgnored ?? false
            };
        }).filter(x => x.prep.length > 0);
    };

    const mapColloc = (list: any): CollocationDetail[] | undefined => {
        if (!Array.isArray(list)) return undefined;
        const mappedItems: (CollocationDetail | null)[] = list.map((item: any) => {
            if (typeof item === 'string') {
                return { text: item, isIgnored: false };
            }
            const text = item.text || item.x;
            if (text) {
                const desc = item.d || item.ds;
                return { 
                    text: text, 
                    d: desc, 
                    isIgnored: item.g ?? item.isIgnored ?? false 
                };
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

    const rawIdioms = shortData.idm || shortData.idioms;
    let idiomsList: CollocationDetail[] | undefined;
    if (Array.isArray(rawIdioms)) {
        idiomsList = mapColloc(rawIdioms);
    }

    const headword = shortData.hw || shortData.headword;
    const pronSim = shortData.pron_sim || shortData.pronSim || shortData.ps;
    const ipaUs = shortData.ipa_us || shortData.ipaUs || shortData.ipa || shortData.i;
    
    // Handle optimized "type" string mapping to booleans
    const type = shortData.type;
    const typeFlags = {
        isIdiom: type === 'idiom',
        isPhrasalVerb: type === 'phrasal_verb',
        isCollocation: type === 'collocation',
        isStandardPhrase: type === 'phrase',
        isIrregular: type === 'irregular_verb'
    };

    return {
        original: shortData.og || shortData.original || headword, // Default to headword if og omitted
        headword: headword,
        ipaUs: ipaUs,
        // If ipa_uk omitted and pronSim is 'same', clone from ipaUs
        ipaUk: shortData.ipa_uk || shortData.ipaUk || (pronSim === 'same' ? ipaUs : undefined),
        pronSim: pronSim,
        ipaMistakes: shortData.ipa_m || shortData.ipaMistakes || shortData.im,
        
        meaningVi: shortData.m || shortData.meaningVi,
        register: shortData.reg || shortData.register,
        example: shortData.ex || shortData.example,
        collocations: collocationsString,
        collocationsArray: collocationsArray,
        idioms: idiomsList ? idiomsList.map(i => i.text).join('\n') : undefined,
        idiomsList: idiomsList,
        
        prepositionString: typeof shortData.prep === 'string' ? shortData.prep : undefined,
        prepositionsArray: normalizedPrepsArray,

        // Use new type classification if available, else fallback to individual is_ flags
        isIdiom: type ? typeFlags.isIdiom : (shortData.is_id ?? shortData.isIdiom),
        isPhrasalVerb: type ? typeFlags.isPhrasalVerb : (shortData.is_pv ?? shortData.isPhrasalVerb),
        isCollocation: type ? typeFlags.isCollocation : (shortData.is_col ?? shortData.isCollocation),
        isStandardPhrase: type ? typeFlags.isStandardPhrase : (shortData.is_phr ?? shortData.isStandardPhrase),
        isIrregular: type ? typeFlags.isIrregular : (shortData.is_irr ?? shortData.isIrregular),
        
        isPassive: shortData.is_pas ?? shortData.isPassive,
        
        paraphrases: mapPara(shortData.para || shortData.paraphrases),
        wordFamily: shortData.fam ? {
            nouns: mapFam(shortData.fam.n || shortData.fam.ns || []),
            verbs: mapFam(shortData.fam.v || []),
            adjs: mapFam(shortData.fam.j || []),
            advs: mapFam(shortData.fam.adv || shortData.fam.d || [])
        } : (shortData.wordFamily || undefined)
    };
};

/**
 * Merges AI-generated details into an existing VocabularyItem.
 */
export const mergeAiResultIntoWord = (baseItem: VocabularyItem, rawAiResult: any): VocabularyItem => {
    const aiResult = normalizeAiResponse(rawAiResult);
    if (!aiResult) return baseItem;

    const updatedItem: VocabularyItem = { ...baseItem };
    
    // Merge IPA fields
    updatedItem.ipaUs = aiResult.ipaUs ?? baseItem.ipaUs;
    updatedItem.ipaUk = aiResult.ipaUk ?? baseItem.ipaUk;
    updatedItem.pronSim = aiResult.pronSim ?? baseItem.pronSim;
    updatedItem.ipaMistakes = aiResult.ipaMistakes ?? baseItem.ipaMistakes;
    
    updatedItem.meaningVi = aiResult.meaningVi ?? baseItem.meaningVi;
    updatedItem.register = aiResult.register ?? baseItem.register;
    
    // Collocations
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
                if (newColloc.isIgnored) mergedCollocs[existingIndex].isIgnored = true;
            } else {
                mergedCollocs.push({ text: newColloc.text, d: newColloc.d, isIgnored: newColloc.isIgnored || false });
            }
        });
    }

    updatedItem.collocationsArray = mergedCollocs;
    updatedItem.collocations = mergedCollocs.map(c => c.text).join('\n');

    // Idioms
    const existingIdioms: CollocationDetail[] = baseItem.idiomsList || 
        (baseItem.idioms ? baseItem.idioms.split('\n').map(t => ({ text: t.trim(), isIgnored: false })).filter(c => c.text) : []);
    
    let mergedIdioms: CollocationDetail[] = [...existingIdioms];
    if (aiResult.idiomsList) {
         aiResult.idiomsList.forEach((newIdiom: CollocationDetail) => {
            const existingIndex = mergedIdioms.findIndex(ec => ec.text.toLowerCase() === newIdiom.text.toLowerCase());
            if (existingIndex !== -1) {
                if (newIdiom.d && !mergedIdioms[existingIndex].d) {
                    mergedIdioms[existingIndex].d = newIdiom.d;
                }
                 if (newIdiom.isIgnored) mergedIdioms[existingIndex].isIgnored = true;
            } else {
                mergedIdioms.push({ text: newIdiom.text, d: newIdiom.d, isIgnored: newIdiom.isIgnored || false });
            }
        });
    }

    updatedItem.idiomsList = mergedIdioms;
    updatedItem.idioms = mergedIdioms.map(c => c.text).join('\n');

    // Prepositions
    let finalPrepositions = baseItem.prepositions || [];
    if (aiResult.prepositionsArray && Array.isArray(aiResult.prepositionsArray) && aiResult.prepositionsArray.length > 0) {
        const newPreps = aiResult.prepositionsArray as PrepositionPattern[];
        const merged = [...finalPrepositions];
        newPreps.forEach(np => {
            if (np.prep) {
                const exists = merged.some(ep => ep.prep.toLowerCase() === np.prep.toLowerCase() && ep.usage.toLowerCase() === np.usage.toLowerCase());
                if (!exists) merged.push({ ...np, isIgnored: np.isIgnored || false });
            }
        });
        finalPrepositions = merged;
    } 
    updatedItem.prepositions = finalPrepositions.length > 0 ? finalPrepositions : undefined;

    // Word Family
    if (aiResult.wordFamily) {
        updatedItem.wordFamily = aiResult.wordFamily;
    }

    // Paraphrases
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
    
    if (aiResult.example) {
        let finalExample = baseItem.example || '';
        if (!finalExample.toLowerCase().includes(aiResult.example.toLowerCase())) {
            finalExample = finalExample.trim() ? `${finalExample}\n${aiResult.example}` : aiResult.example;
        }
        updatedItem.example = finalExample;
    }

    updatedItem.isIdiom = aiResult.isIdiom !== undefined ? !!aiResult.isIdiom : baseItem.isIdiom;
    updatedItem.isPhrasalVerb = aiResult.isPhrasalVerb !== undefined ? !!aiResult.isPhrasalVerb : baseItem.isPhrasalVerb;
    updatedItem.isCollocation = aiResult.isCollocation !== undefined ? !!aiResult.isCollocation : baseItem.isCollocation;
    updatedItem.isStandardPhrase = aiResult.isStandardPhrase !== undefined ? !!aiResult.isStandardPhrase : baseItem.isStandardPhrase;
    updatedItem.isIrregular = aiResult.isIrregular !== undefined ? !!aiResult.isIrregular : baseItem.isIrregular;
    updatedItem.isPassive = aiResult.isPassive !== undefined ? !!aiResult.isPassive : baseItem.isPassive;
    
    updatedItem.quality = WordQuality.REFINED;
    
    updatedItem.complexity = calculateComplexity(updatedItem);
    updatedItem.masteryScore = calculateMasteryScore(updatedItem);
    updatedItem.gameEligibility = calculateGameEligibility(updatedItem);
    updatedItem.updatedAt = Date.now();
    
    return updatedItem;
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
