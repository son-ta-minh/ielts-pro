
import React, { useState, useEffect, useReducer } from 'react';
import { VocabularyItem, WordFamilyMember, ReviewGrade, Unit, PrepositionPattern, User } from '../../app/types';
import { updateSRS, resetProgress, calculateComplexity, calculateMasteryScore } from '../../utils/srs';
import { getWordDetailsPrompt, getLearningSuggestionsPrompt } from '../../services/promptService';
import { mergeAiResultIntoWord } from '../../utils/vocabUtils';
import { EditWordModalUI } from './EditWordModal_UI';
import { useToast } from '../../contexts/ToastContext';
import { logSrsUpdate } from '../practice/ReviewSession';
import UniversalAiModal from '../common/UniversalAiModal';
import LearningSuggestionModal from '../common/LearningSuggestionModal';
import { calculateGameEligibility } from '../../utils/gameEligibility';

type FormState = VocabularyItem & {
    tagsString: string;
    groupsString: string;
    v2v3: string;
    studiedStatus: ReviewGrade | 'NEW';
    prepositionsList: PrepositionPattern[];
};

type FormAction =
    | { type: 'REINITIALIZE', payload: VocabularyItem }
    | { type: 'SET_FIELD', payload: { field: keyof FormState, value: any } }
    | { type: 'SET_FLAG', payload: { flag: 'isIdiom' | 'isPhrasalVerb' | 'isCollocation' | 'isStandardPhrase' | 'isIrregular' | 'needsPronunciationFocus' | 'isPassive' } }
    | { type: 'SET_LIST_ITEM', payload: { list: 'wordFamily' | 'prepositionsList' | 'collocationsArray' | 'idiomsList' | 'paraphrases', data: any } }
    | { type: 'APPLY_AI_MERGE', payload: any };

function formReducer(state: FormState, action: FormAction): FormState {
    switch (action.type) {
        case 'REINITIALIZE':
            const word = action.payload;
            return {
                ...word,
                register: word.register || 'raw',
                tagsString: word.tags?.join(', ') || '',
                groupsString: word.groups?.join(', ') || '',
                v2v3: [word.v2, word.v3].filter(Boolean).join(', '),
                studiedStatus: word.lastReview ? (word.lastGrade || 'NEW') : 'NEW',
                collocationsArray: word.collocationsArray || (word.collocations ? word.collocations.split('\n').map(t => ({text: t.trim(), isIgnored: false})) : []),
                idiomsList: word.idiomsList || (word.idioms ? word.idioms.split('\n').map(t => ({text: t.trim(), isIgnored: false})) : []),
                prepositionsList: word.prepositions || [],
                wordFamily: word.wordFamily || { nouns: [], verbs: [], adjs: [], advs: [] },
                paraphrases: word.paraphrases || [],
            };
        case 'SET_FIELD':
            return { ...state, [action.payload.field]: action.payload.value };
        case 'SET_FLAG':
            const { flag } = action.payload;
            const newState = { ...state, [flag]: !state[flag] };
            if (['isIdiom', 'isPhrasalVerb', 'isCollocation', 'isStandardPhrase'].includes(flag)) {
                if (newState[flag]) {
                    if (flag !== 'isIdiom') newState.isIdiom = false;
                    if (flag !== 'isPhrasalVerb') newState.isPhrasalVerb = false;
                    if (flag !== 'isCollocation') newState.isCollocation = false;
                    if (flag !== 'isStandardPhrase') newState.isStandardPhrase = false;
                }
            }
            return newState;
        case 'SET_LIST_ITEM':
             return { ...state, [action.payload.list]: action.payload.data };
        case 'APPLY_AI_MERGE':
            const merged = mergeAiResultIntoWord(state, action.payload);
            return {
                ...state,
                ...merged,
                register: merged.register,
                tagsString: merged.tags?.join(', ') || '',
                v2v3: [merged.v2, merged.v3].filter(Boolean).join(', '),
                prepositionsList: merged.prepositions || [],
            };
        default:
            return state;
    }
}

interface SuggestionsData {
    overall_summary: string;
    wordFamily: any[];
    collocations: any[];
    idioms: any[];
    paraphrases: any[];
}

interface Props {
  word: VocabularyItem;
  user: User;
  onSave: (updatedWord: VocabularyItem) => void;
  onClose: () => void;
  onSwitchToView: (word: VocabularyItem) => void;
}

const EditWordModal: React.FC<Props> = ({ word, user, onSave, onClose, onSwitchToView }) => {
  const { showToast } = useToast();
  
  const [formData, dispatch] = useReducer(formReducer, word, (initialWord) => {
    return formReducer({} as FormState, { type: 'REINITIALIZE', payload: initialWord });
  });

  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [learningSuggestions, setLearningSuggestions] = useState<SuggestionsData | null>(null);
  const [isSuggestionModalOpen, setIsSuggestionModalOpen] = useState(false);
  const [isSuggestAiModalOpen, setIsSuggestAiModalOpen] = useState(false);

  useEffect(() => {
    dispatch({ type: 'REINITIALIZE', payload: word });
    setLearningSuggestions(null);
  }, [word]);

  const handleGenerateRefinePrompt = (inputs: { words: string }) => getWordDetailsPrompt(inputs.words.split(/[,\n]+/).map(w => w.trim()).filter(Boolean), user.nativeLanguage || 'Vietnamese');
  
  const handleAiResult = (data: any) => {
      const details = Array.isArray(data) ? data[0] : data;
      if (details) {
          dispatch({ type: 'APPLY_AI_MERGE', payload: details });
          setIsAiModalOpen(false);
      }
  };

  const handleSuggestLearn = () => {
    if (learningSuggestions) {
      setIsSuggestionModalOpen(true);
    } else {
      setIsSuggestAiModalOpen(true);
    }
  };

  const handleGenerateSuggestPrompt = (inputs: any) => {
    return getLearningSuggestionsPrompt(formData, user);
  };

  const handleSuggestAiResult = (data: any) => {
    if (data && data.overall_summary) {
      setLearningSuggestions(data);
      setIsSuggestAiModalOpen(false);
      setIsSuggestionModalOpen(true);
    } else {
      showToast("Invalid suggestion format from AI.", "error");
    }
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if(e) e.preventDefault();
    const { tagsString, groupsString, v2v3, studiedStatus, collocationsArray, idiomsList, prepositionsList, ...rest } = formData;
    
    let finalFamily = rest.wordFamily;
    if (finalFamily) {
        const cleanedFamily: any = {}; let hasData = false;
        (['nouns', 'verbs', 'adjs', 'advs'] as const).forEach(type => { const members = finalFamily[type]?.filter(m => m.word.trim()) || []; if (members.length > 0) { cleanedFamily[type] = members; hasData = true; } });
        finalFamily = hasData ? cleanedFamily : undefined;
    }
    
    const vParts = v2v3.split(/[,\s]+/).filter(Boolean);
    
    let updatedWord: VocabularyItem = { 
        ...rest, 
        v2: vParts[0] || '', v3: vParts[1] || '', 
        wordFamily: finalFamily, 
        prepositions: prepositionsList.filter(p => p.prep.trim()).length > 0 ? prepositionsList.filter(p => p.prep.trim()) : undefined,
        collocationsArray: collocationsArray.filter(c => c.text.trim()),
        collocations: collocationsArray.filter(c => c.text.trim()).map(c => c.text).join('\n'),
        idiomsList: idiomsList.filter(c => c.text.trim()),
        idioms: idiomsList.filter(c => c.text.trim()).map(c => c.text).join('\n'),
        tags: tagsString.split(',').map(t => t.trim()).filter(Boolean), 
        groups: groupsString.split(',').map(g => g.trim()).filter(Boolean),
        updatedAt: Date.now() 
    };
    
    // --- SANITIZE lastTestResults ---
    const finalResults = { ...(updatedWord.lastTestResults || {}) };
    const validCollocs = new Set((updatedWord.collocationsArray || []).filter(c => !c.isIgnored).map(c => c.text.toLowerCase()));
    const validIdioms = new Set((updatedWord.idiomsList || []).filter(i => !i.isIgnored).map(i => i.text.toLowerCase()));
    const validPreps = new Set((updatedWord.prepositions || []).filter(p => !p.isIgnored).map(p => p.prep.toLowerCase()));
    const validParas = new Set((updatedWord.paraphrases || []).filter(p => !p.isIgnored).map(p => p.word.toLowerCase()));
    const validFamilyMembers = new Set<string>();
    if (updatedWord.wordFamily) {
        (['nouns', 'verbs', 'adjs', 'advs'] as const).forEach(type => {
            (updatedWord.wordFamily![type] || []).forEach(member => {
                if (!member.isIgnored && member.word.trim()) validFamilyMembers.add(member.word.trim().toLowerCase());
            });
        });
    }

    for (const key in finalResults) {
        const parts = key.split(':');
        const type = parts[0];
        const value = parts.slice(1).join(':').toLowerCase();
        let shouldDelete = false;
        switch(type) {
            case 'COLLOCATION_QUIZ': if (!validCollocs.has(value)) shouldDelete = true; break;
            case 'IDIOM_QUIZ': if (!validIdioms.has(value)) shouldDelete = true; break;
            case 'PREPOSITION_QUIZ': if (!validPreps.has(value)) shouldDelete = true; break;
            case 'PARAPHRASE_QUIZ': if (!validParas.has(value)) shouldDelete = true; break;
            case 'WORD_FAMILY': if (!validFamilyMembers.has(value)) shouldDelete = true; break;
        }
        if (shouldDelete) delete finalResults[key];
    }
    updatedWord.lastTestResults = finalResults;
    // --- END SANITIZATION ---

    const originalStatus = word.lastReview ? (word.lastGrade || 'NEW') : 'NEW';

    if (studiedStatus !== originalStatus) {
        if (studiedStatus === 'NEW') {
            updatedWord = resetProgress(updatedWord);
        } else {
            updatedWord = updateSRS(updatedWord, studiedStatus as ReviewGrade);
        }
    } else {
        // Even if status didn't change, recalculate because content might have changed
        updatedWord.complexity = calculateComplexity(updatedWord);
        updatedWord.masteryScore = calculateMasteryScore(updatedWord);
        updatedWord.gameEligibility = calculateGameEligibility(updatedWord);
    }
    
    onSave(updatedWord);
    showToast('Word saved successfully!', 'success');
  };

  const createListHandler = (list: 'wordFamily' | 'prepositionsList' | 'collocationsArray' | 'idiomsList' | 'paraphrases') => {
      const currentList = formData[list] as any[] || [];
      return {
          update: (index: number, changes: object) => dispatch({ type: 'SET_LIST_ITEM', payload: { list, data: [...currentList].map((item, i) => i === index ? { ...item, ...changes } : item) } }),
          toggleIgnore: (index: number) => dispatch({ type: 'SET_LIST_ITEM', payload: { list, data: [...currentList].map((item, i) => i === index ? { ...item, isIgnored: !item.isIgnored } : item) } }),
          remove: (index: number) => dispatch({ type: 'SET_LIST_ITEM', payload: { list, data: currentList.filter((_, i) => i !== index) } }),
          add: (newItem: object) => dispatch({ type: 'SET_LIST_ITEM', payload: { list, data: [...currentList, newItem] } })
      };
  };

  const familyHandler = (type: keyof typeof formData.wordFamily) => {
      const currentFamily = formData.wordFamily || { nouns: [], verbs: [], adjs: [], advs: [] };
      const updateFamily = (newFamilyMembers: Partial<typeof currentFamily>) => dispatch({ type: 'SET_LIST_ITEM', payload: { list: 'wordFamily', data: { ...currentFamily, ...newFamilyMembers } } });
      return {
          update: (index: number, field: 'word' | 'ipa', value: string) => { const members = [...(currentFamily[type] || [])]; members[index] = { ...members[index], [field]: value }; updateFamily({ [type]: members }); },
          toggleIgnore: (index: number) => { const members = [...(currentFamily[type] || [])]; members[index] = { ...members[index], isIgnored: !members[index].isIgnored }; updateFamily({ [type]: members }); },
          remove: (index: number) => { updateFamily({ [type]: (currentFamily[type] || []).filter((_, i) => i !== index) }); },
          add: () => { const newMember = { word: '', ipa: '', isIgnored: type === 'advs' }; updateFamily({ [type]: [...(currentFamily[type] || []), newMember] }); }
      };
  };

  const prepList = createListHandler('prepositionsList');
  const collocList = createListHandler('collocationsArray');
  const idiomList = createListHandler('idiomsList');
  const paraList = createListHandler('paraphrases');
  
  return (
    <>
      <EditWordModalUI 
        onClose={onClose}
        onSwitchToView={() => onSwitchToView(word)}
        formData={formData}
        setFormData={(field, value) => dispatch({ type: 'SET_FIELD', payload: { field, value } })}
        setFlag={(flag) => dispatch({ type: 'SET_FLAG', payload: { flag } })}
        familyHandler={familyHandler}
        prepList={prepList}
        collocList={collocList}
        idiomList={idiomList}
        paraList={paraList}
        handleSubmit={handleSubmit}
        onOpenAiRefine={() => setIsAiModalOpen(true)}
        onSuggestLearn={handleSuggestLearn}
        hasSuggestions={!!learningSuggestions}
      />
      <LearningSuggestionModal
        isOpen={isSuggestionModalOpen}
        onClose={() => setIsSuggestionModalOpen(false)}
        suggestions={learningSuggestions}
      />
      {isAiModalOpen && (
        <UniversalAiModal 
            isOpen={isAiModalOpen} 
            onClose={() => setIsAiModalOpen(false)} 
            type="REFINE_WORDS" 
            title="Manual AI Refinement"
            description={`Refining details for "${formData.word}"`}
            initialData={{ words: formData.word }} 
            user={user}
            onGeneratePrompt={handleGenerateRefinePrompt} 
            onJsonReceived={handleAiResult} 
            actionLabel="Apply to Word"
            hidePrimaryInput={true}
        />
      )}
      {isSuggestAiModalOpen && (
        <UniversalAiModal
            isOpen={isSuggestAiModalOpen}
            onClose={() => setIsSuggestAiModalOpen(false)}
            type="REFINE_WORDS"
            title="Get Learning Suggestions"
            description="AI will suggest what to focus on based on your profile."
            initialData={{ words: word.word }}
            user={user}
            onGeneratePrompt={handleGenerateSuggestPrompt}
            onJsonReceived={handleSuggestAiResult}
            hidePrimaryInput={true}
        />
      )}
    </>
  );
};

export default EditWordModal;
