import React, { useState, useEffect, useReducer } from 'react';
import { StudyItem, WordFamilyMember, LearnedStatus, Unit, PrepositionPattern, User } from '../../app/types';
import { applyLearnedStatus, calculateComplexity, calculateMasteryScore } from '../../utils/srs';
import { getWordDetailsPrompt, getLearningSuggestionsPrompt } from '../../services/promptService';
import { mergeAiResultIntoWord } from '../../utils/vocabUtils';
import { EditStudyItemModalUI } from './EditStudyItemModal_UI';
import { getAllWords } from '../../app/dataStore';
import { useToast } from '../../contexts/ToastContext';
import UniversalAiModal from '../common/UniversalAiModal';
import LearningSuggestionModal from '../common/LearningSuggestionModal';
import { calculateGameEligibility } from '../../utils/gameEligibility';
import { getConfig, getServerUrl, getStudyBuddyAiUrl } from '../../app/settingsManager';
import { normalizeVocabularyKeywords } from '../../utils/vocabularyKeywordUtils';
import { normalizeCambridgePronunciations } from '../../utils/studyBuddyUtils';
import { getStudyBuddyCoachPrompt } from '../../services/prompts/getStudyBuddyCoachPrompt';

type FormState = StudyItem & {
    groupsString: string;
    studiedStatus: LearnedStatus;
    prepositionsList: PrepositionPattern[];
    essayEdit?: string;
    testEdit?: string;
};

type FormAction =
    | { type: 'REINITIALIZE', payload: StudyItem }
    | { type: 'SET_FIELD', payload: { field: keyof FormState, value: any } }
    | { type: 'SET_FLAG', payload: { flag: 'isIdiom' | 'isPhrasalVerb' | 'isCollocation' | 'isStandardPhrase' | 'isIrregular' | 'isPassive' | 'isFocus' | 'isFreeLesson' } }
    | { type: 'SET_LIST_ITEM', payload: { list: 'wordFamily' | 'prepositionsList' | 'collocationsArray' | 'idiomsList' | 'paraphrases', data: any } }
    | { type: 'ADD_LIST_ITEM', payload: { list: 'prepositionsList' | 'collocationsArray' | 'idiomsList' | 'paraphrases', item: any } }
    | { type: 'APPLY_AI_MERGE', payload: any };

function formReducer(state: FormState, action: FormAction): FormState {
    switch (action.type) {
        case 'REINITIALIZE':
            const word = action.payload;
            return {
                ...word,
                keywords: normalizeVocabularyKeywords(word.keywords, word.word),
                register: word.register || 'raw',
                groupsString: word.groups?.join(', ') || '',
                studiedStatus: word.learnedStatus || LearnedStatus.NEW,
                collocationsArray: word.collocationsArray || (word.collocations ? word.collocations.split('\n').map(t => ({text: t.trim(), isIgnored: false})) : []),
                idiomsList: word.idiomsList || (word.idioms ? word.idioms.split('\n').map(t => ({text: t.trim(), isIgnored: false})) : []),
                prepositionsList: word.prepositions || [],
                wordFamily: word.wordFamily || { nouns: [], verbs: [], adjs: [], advs: [] },
                paraphrases: word.paraphrases || [],
                isFocus: !!word.isFocus,
                essayEdit: word.lesson?.essay || '',
                testEdit: word.lesson?.test || '',
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
        case 'ADD_LIST_ITEM':
            const listName = action.payload.list as keyof FormState;
            const current = (state[listName] as any[]) || [];
            return { ...state, [listName]: [...current, action.payload.item] };
        case 'APPLY_AI_MERGE':
            const merged = mergeAiResultIntoWord(state, action.payload);
            return {
                ...state,
                ...merged,
                register: merged.register,
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
  word: StudyItem;
  user: User;
  onSave: (updatedWord: StudyItem) => void;
  onClose: () => void;
  onSwitchToView: (word: StudyItem) => void;
}

const EditStudyItemModal: React.FC<Props> = ({ word, user, onSave, onClose, onSwitchToView }) => {
  const config = getConfig();
  const serverUrl = getServerUrl(config);
  const { showToast } = useToast();
  
  const [formData, dispatch] = useReducer(formReducer, word, (initialWord) => {
    return formReducer({} as FormState, { type: 'REINITIALIZE', payload: initialWord });
  });

  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [learningSuggestions, setLearningSuggestions] = useState<SuggestionsData | null>(null);
  const [isSuggestionModalOpen, setIsSuggestionModalOpen] = useState(false);
  const [isSuggestAiModalOpen, setIsSuggestAiModalOpen] = useState(false);
  const [isSelectImgOpen, setIsSelectImgOpen] = useState(false);
  const [selectedImgs, setSelectedImgs] = useState<string[]>([]);
  const [isMeaningLoading, setIsMeaningLoading] = useState<'vi' | 'en' | null>(null);
  const [isIpaLoading, setIsIpaLoading] = useState<'cambridge' | 'generated' | null>(null);
  const [isStudyBuddyGenerating, setIsStudyBuddyGenerating] = useState<'examples' | 'collocations' | null>(null);
  const availableGroups = Array.from(
    new Set(
      getAllWords()
        .filter((item) => item.userId === user.id)
        .flatMap((item) => item.groups || [])
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));
  const handleSelectImage = () => {
    setSelectedImgs((formData.img || []).filter((i: string) => i && i.trim() !== ""));
    setIsSelectImgOpen(true);
  };

  const handleConfirmSelectImage = () => {
    dispatch({
      type: 'SET_FIELD',
      payload: { field: 'img', value: selectedImgs }
    });
    setIsSelectImgOpen(false);
    showToast('Images updated!', 'success');
  };

  useEffect(() => {
    dispatch({ type: 'REINITIALIZE', payload: word });
    setLearningSuggestions(null);
  }, [word]);

  const cleanSingleLineAiText = (value: string): string => String(value || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^\s*[-*•]+\s*/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
    .replace(/\r?\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const requestStudyBuddyText = async (prompt: string, language: 'vi' | 'en'): Promise<string> => {
    const response = await fetch(getStudyBuddyAiUrl(config), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'system',
            content: language === 'vi'
              ? 'You are an expert IELTS coach, examiner, and native Vietnamese speaker. Reply in Vietnamese only. Return only the final answer text with no bullets, no quotes, no markdown, no labels.'
              : 'You are an expert IELTS coach, examiner, and native English speaker. Reply in English only. Return only the final answer text with no bullets, no quotes, no markdown, no labels.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        searchEnabled: false,
        temperature: 0.2,
        top_p: 0.85,
        repetition_penalty: 1.15,
        stream: false
      })
    });

    if (!response.ok) {
      throw new Error(`StudyBuddy request failed (${response.status})`);
    }

    const payload = await response.json().catch(() => null);
    const rawText = payload?.choices?.[0]?.message?.content;
    const cleaned = cleanSingleLineAiText(rawText || '');
    if (!cleaned) {
      throw new Error('StudyBuddy returned empty content.');
    }
    return cleaned;
  };

  const requestStudyBuddyContent = async (prompt: string): Promise<string> => {
    const response = await fetch(getStudyBuddyAiUrl(config), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'system',
            content: 'You are an expert IELTS coach, examiner, and native English speaker. Reply with only the requested content. No greeting, no intro, no conclusion.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        searchEnabled: false,
        temperature: 0.2,
        top_p: 0.85,
        repetition_penalty: 1.15,
        stream: false
      })
    });

    if (!response.ok) {
      throw new Error(`StudyBuddy request failed (${response.status})`);
    }

    const payload = await response.json().catch(() => null);
    return String(payload?.choices?.[0]?.message?.content || '').trim();
  };

  const parseStudyBuddyExamples = (content: string): string[] =>
    content
      .split(/\r?\n/)
      .map((line) => line.replace(/^\s*[-*•]+\s*/, '').trim())
      .map((line) => line.replace(/\*\*(.*?)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1').trim())
      .filter(Boolean);

  const parseStudyBuddyCollocations = (content: string) =>
    content
      .split(/\r?\n/)
      .map((line) => line.replace(/^\s*[-*•]+\s*/, '').trim())
      .map((line) => line.replace(/\*\*(.*?)\*\*/g, '$1').trim())
      .map((line) => {
        const [text, ...rest] = line.split(':');
        return {
          text: (text || '').trim(),
          d: rest.join(':').trim(),
          isIgnored: false
        };
      })
      .filter((item) => item.text);

  const stripIpaDelimiters = (value?: string | null): string => String(value || '').replace(/^\/+|\/+$/g, '').trim();
  const normalizeComparableText = (value: string): string =>
    String(value || '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  const formatPhraseIpa = (parts: Array<string | null | undefined>): string | undefined => {
    const cleaned = parts
      .map((part) => stripIpaDelimiters(part))
      .filter(Boolean);
    if (cleaned.length === 0) return undefined;
    return `/${cleaned.join(' ')}/`;
  };

  const tokenizeHeadwordForIpa = (value: string): string[] =>
    String(value || '')
      .split(/\s+/)
      .map((token) => token.trim().replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, ''))
      .filter(Boolean);

  const fetchCambridgeTokenIpa = async (token: string): Promise<{ ipaUs?: string; ipaUk?: string } | null> => {
    const response = await fetch(`${serverUrl}/api/lookup/cambridge/simple?word=${encodeURIComponent(token)}`, {
      cache: 'no-store'
    });
    if (!response.ok) return null;

    const payload = await response.json().catch(() => null);
    if (!payload?.exists || !Array.isArray(payload.pronunciations)) return null;

    const pronunciations = normalizeCambridgePronunciations(payload.pronunciations);
    const pronunciation = pronunciations.find((item) => item.ipaUs || item.ipaUk);
    if (!pronunciation) return null;

    const ipaUs = stripIpaDelimiters(pronunciation.ipaUs || '');
    const ipaUk = stripIpaDelimiters(pronunciation.ipaUk || '');

    return {
      ipaUs: ipaUs ? `/${ipaUs}/` : undefined,
      ipaUk: ipaUk ? `/${ipaUk}/` : undefined
    };
  };

  const resolveDisplayMetadata = async (item: StudyItem): Promise<Pick<StudyItem, 'displayMeaning' | 'displayIPA'>> => {
    const displayText = String(item.display || '').trim();
    if (!displayText || normalizeComparableText(displayText) === normalizeComparableText(item.word)) {
      return { displayMeaning: '', displayIPA: '' };
    }

    const matchedCollocation = (item.collocationsArray || []).find((entry) =>
      normalizeComparableText(entry.text || '') === normalizeComparableText(displayText)
    );

    let displayMeaning = String(matchedCollocation?.d || '').trim();
    let displayIPA = '';
    const online = typeof navigator === 'undefined' ? true : navigator.onLine;

    if (online) {
      const tokens = tokenizeHeadwordForIpa(displayText);
      if (tokens.length > 0) {
        try {
          const tokenResults = await Promise.all(tokens.map((token) => fetchCambridgeTokenIpa(token)));
          displayIPA = formatPhraseIpa(tokenResults.map((entry) => entry?.ipaUs))
            || formatPhraseIpa(tokenResults.map((entry) => entry?.ipaUk || entry?.ipaUs))
            || '';
        } catch {}
      }

      if (!displayMeaning) {
        try {
          const translationRes = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(displayText)}&langpair=en|vi`);
          const translationData = await translationRes.json().catch(() => null);
          displayMeaning = String(translationData?.responseData?.translatedText || '').trim();
        } catch {}
      }
    }

    return {
      displayMeaning,
      displayIPA
    };
  };

  const handleFillMeaning = async (mode: 'vi' | 'en') => {
    const headword = String(formData.word || '').trim();
    if (!headword) {
      showToast('Please enter a headword first.', 'info');
      return;
    }

    setIsMeaningLoading(mode);
    try {
      const prompt = mode === 'vi'
        ? `For the English headword "${headword}", give one concise natural Vietnamese meaning for a learner. Keep it minimal, descriptive, and under 12 words if possible. Return only the Vietnamese meaning.`
        : `For the English headword "${headword}", give one concise English definition in minimal descriptive text. Keep it short, natural, and under 12 words if possible. Return only the definition.`;
      const nextMeaning = await requestStudyBuddyText(prompt, mode);
      dispatch({ type: 'SET_FIELD', payload: { field: 'meaningVi', value: nextMeaning } });
      showToast(mode === 'vi' ? 'Vietnamese meaning filled.' : 'English meaning filled.', 'success');
    } catch (error) {
      console.error(error);
      showToast(mode === 'vi' ? 'Failed to get Vietnamese meaning.' : 'Failed to get English meaning.', 'error');
    } finally {
      setIsMeaningLoading(null);
    }
  };

  const handleFillCambridgeIpa = async () => {
    const headword = String(formData.word || '').trim();
    if (!headword) {
      showToast('Please enter a headword first.', 'info');
      return;
    }

    const tokens = tokenizeHeadwordForIpa(headword);
    if (tokens.length === 0) {
      showToast('No valid tokens found for IPA lookup.', 'info');
      return;
    }

    setIsIpaLoading('cambridge');
    try {
      const tokenResults = await Promise.all(tokens.map((token) => fetchCambridgeTokenIpa(token)));
      const usPhrase = formatPhraseIpa(tokenResults.map((item) => item?.ipaUs));
      const ukPhrase = formatPhraseIpa(tokenResults.map((item) => item?.ipaUk || item?.ipaUs));

      if (!usPhrase && !ukPhrase) {
        showToast('Cambridge IPA not found for this headword.', 'info');
        return;
      }

      if (usPhrase) {
        dispatch({ type: 'SET_FIELD', payload: { field: 'ipaUs', value: usPhrase } });
      }
      if (ukPhrase) {
        dispatch({ type: 'SET_FIELD', payload: { field: 'ipaUk', value: ukPhrase } });
      }

      showToast('Cambridge IPA filled.', 'success');
    } catch (error) {
      console.error(error);
      showToast('Failed to fetch Cambridge IPA.', 'error');
    } finally {
      setIsIpaLoading(null);
    }
  };

  const handleFillGeneratedIpa = async () => {
    const headword = String(formData.word || '').trim();
    if (!headword) {
      showToast('Please enter a headword first.', 'info');
      return;
    }

    setIsIpaLoading('generated');
    try {
      const response = await fetch(`${serverUrl}/api/convert/ipa?text=${encodeURIComponent(headword)}`);
      if (!response.ok) {
        throw new Error(`IPA server error ${response.status}`);
      }

      const payload = await response.json().catch(() => null);
      const ipaUs = String(payload?.ipa || '').trim();
      if (!ipaUs) {
        showToast('Generated IPA is empty.', 'info');
        return;
      }

      dispatch({ type: 'SET_FIELD', payload: { field: 'ipaUs', value: ipaUs } });
      showToast('Generated US IPA filled.', 'success');
    } catch (error) {
      console.error(error);
      showToast('Failed to generate IPA.', 'error');
    } finally {
      setIsIpaLoading(null);
    }
  };

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

  const handleFormatExamples = () => {
    const formattedExamples = (formData.example || '')
      .split(/\r?\n/)
      .map((line) =>
        line
          .replace(/^\s*(?:[-*•]+|\d+[.)])\s*/, '')
          .trim()
          .replace(/\[([^\]]+)\]/g, '{$1}')
      )
      .filter(Boolean)
      .join('\n');

    dispatch({
      type: 'SET_FIELD',
      payload: { field: 'example', value: formattedExamples }
    });
    showToast('Examples formatted.', 'success');
  };

  const handleGenerateExamples = async () => {
    const headword = String(formData.word || '').trim();
    if (!headword) {
      showToast('Please enter a headword first.', 'info');
      return;
    }

    setIsStudyBuddyGenerating('examples');
    try {
      const content = await requestStudyBuddyContent(getStudyBuddyCoachPrompt(headword, 'examples'));
      const incomingExamples = parseStudyBuddyExamples(content);
      if (incomingExamples.length === 0) {
        showToast('No examples returned from StudyBuddy.', 'info');
        return;
      }

      const currentExamples = String(formData.example || '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      const existingSet = new Set(currentExamples.map((line) => line.toLowerCase()));
      const mergedExamples = [...currentExamples];

      incomingExamples.forEach((line) => {
        if (!existingSet.has(line.toLowerCase())) {
          mergedExamples.push(line);
          existingSet.add(line.toLowerCase());
        }
      });

      dispatch({
        type: 'SET_FIELD',
        payload: { field: 'example', value: mergedExamples.join('\n') }
      });
      showToast('Examples added from StudyBuddy.', 'success');
    } catch (error) {
      console.error(error);
      showToast('Failed to generate examples.', 'error');
    } finally {
      setIsStudyBuddyGenerating(null);
    }
  };

  const handleGenerateCollocations = async () => {
    const headword = String(formData.word || '').trim();
    if (!headword) {
      showToast('Please enter a headword first.', 'info');
      return;
    }

    setIsStudyBuddyGenerating('collocations');
    try {
      const content = await requestStudyBuddyContent(getStudyBuddyCoachPrompt(headword, 'collocations'));
      const incomingCollocations = parseStudyBuddyCollocations(content);
      if (incomingCollocations.length === 0) {
        showToast('No collocations returned from StudyBuddy.', 'info');
        return;
      }

      const currentCollocations = formData.collocationsArray || [];
      const existingSet = new Set(currentCollocations.map((item) => String(item.text || '').trim().toLowerCase()).filter(Boolean));
      const mergedCollocations = [...currentCollocations];

      incomingCollocations.forEach((item) => {
        const normalized = item.text.toLowerCase();
        if (!existingSet.has(normalized)) {
          mergedCollocations.push(item);
          existingSet.add(normalized);
        }
      });

      dispatch({
        type: 'SET_LIST_ITEM',
        payload: { list: 'collocationsArray', data: mergedCollocations }
      });
      showToast('Collocations added from StudyBuddy.', 'success');
    } catch (error) {
      console.error(error);
      showToast('Failed to generate collocations.', 'error');
    } finally {
      setIsStudyBuddyGenerating(null);
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if(e) e.preventDefault();
    const { groupsString, studiedStatus, collocationsArray, idiomsList, prepositionsList, essayEdit, testEdit, ...rest } = formData;
    
    let finalFamily = rest.wordFamily;
    if (finalFamily) {
        const cleanedFamily: any = {}; let hasData = false;
        (['nouns', 'verbs', 'adjs', 'advs'] as const).forEach(type => { const members = finalFamily[type]?.filter(m => m.word.trim()) || []; if (members.length > 0) { cleanedFamily[type] = members; hasData = true; } });
        finalFamily = hasData ? cleanedFamily : undefined;
    }
    
    let updatedWord: StudyItem = { 
        ...rest, 
        keywords: normalizeVocabularyKeywords(rest.keywords, rest.word),
        wordFamily: finalFamily, 
        prepositions: prepositionsList.filter(p => p.prep.trim()).length > 0 ? prepositionsList.filter(p => p.prep.trim()) : undefined,
        collocationsArray: collocationsArray.filter(c => c.text.trim()),
        collocations: collocationsArray.filter(c => c.text.trim()).map(c => c.text).join('\n'),
        idiomsList: idiomsList.filter(c => c.text.trim()),
        idioms: idiomsList.filter(c => c.text.trim()).map(c => c.text).join('\n'),
        lesson: {
          essay: essayEdit,
          test: testEdit
        },
        groups: groupsString.split(',').map(g => g.trim()).filter(Boolean),
        updatedAt: Date.now() 
    };

    const previousDisplay = String(word.display || '').trim();
    const nextDisplay = String(updatedWord.display || '').trim();
    const didDisplayChange = normalizeComparableText(previousDisplay) !== normalizeComparableText(nextDisplay);
    
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

    const originalStatus = word.learnedStatus || LearnedStatus.NEW;

    if (studiedStatus !== originalStatus) {
        updatedWord = applyLearnedStatus(updatedWord, studiedStatus);
    } else {
        updatedWord.complexity = calculateComplexity(updatedWord);
        updatedWord.masteryScore = calculateMasteryScore(updatedWord);
        updatedWord.gameEligibility = calculateGameEligibility(updatedWord);
    }

    if (!nextDisplay || normalizeComparableText(nextDisplay) === normalizeComparableText(updatedWord.word)) {
      updatedWord.display = nextDisplay || undefined;
      updatedWord.displayMeaning = '';
      updatedWord.displayIPA = '';
    } else if (didDisplayChange) {
      try {
        const resolved = await resolveDisplayMetadata(updatedWord);
        updatedWord = {
          ...updatedWord,
          ...resolved,
          updatedAt: Date.now()
        };
      } catch (error) {
        console.error('Failed to resolve display metadata before save', error);
      }
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
          add: (newItem: object) => dispatch({ type: 'ADD_LIST_ITEM', payload: { list: list as any, item: newItem } })
      };
  };

  const familyHandler = (type: keyof typeof formData.wordFamily) => {
      const currentFamily = formData.wordFamily || { nouns: [], verbs: [], adjs: [], advs: [] };
      const updateFamily = (newFamilyMembers: Partial<typeof currentFamily>) => dispatch({ type: 'SET_LIST_ITEM', payload: { list: 'wordFamily', data: { ...currentFamily, ...newFamilyMembers } } });
      return {
          update: (index: number, field: 'word', value: string) => { const members = [...(currentFamily[type] || [])]; members[index] = { ...members[index], [field]: value }; updateFamily({ [type]: members }); },
          toggleIgnore: (index: number) => { const members = [...(currentFamily[type] || [])]; members[index] = { ...members[index], isIgnored: !members[index].isIgnored }; updateFamily({ [type]: members }); },
          remove: (index: number) => { updateFamily({ [type]: (currentFamily[type] || []).filter((_, i) => i !== index) }); },
          add: () => { const newMember = { word: '', isIgnored: type === 'advs' }; updateFamily({ [type]: [...(currentFamily[type] || []), newMember] }); }
      };
  };

  const prepList = createListHandler('prepositionsList');
  const collocList = createListHandler('collocationsArray');
  const idiomList = createListHandler('idiomsList');
  const paraList = createListHandler('paraphrases');

  const handleCacheImages = async () => {
    console.log('Caching images for URLs:', formData.img);
    if (!formData.img || !formData.img.length) return;

    try {
      const updatedUrls = await Promise.all(
        formData.img.map(async (url: string) => {
          if (!url) return url;

          // Separate caption and actual URL if format is "Caption:actual_url"
          let caption = '';
          let cleanUrl = url;

          const httpIndex = url.indexOf('http');
          if (httpIndex > 0) {
            caption = url.substring(0, httpIndex).trim();
            cleanUrl = url.substring(httpIndex).trim();
          }

          // If not an external URL (no http/https), do NOT cache
          if (!cleanUrl.startsWith('http')) {
            return caption ? `${caption}${cleanUrl}` : cleanUrl;
          }

          // If already local server URL, skip caching
          if (cleanUrl.includes('localhost') || cleanUrl.startsWith(`${serverUrl}`)) {
            return caption ? `${caption}${cleanUrl}` : cleanUrl;
          }

          const res = await fetch(`${serverUrl}/api/images/cache`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: cleanUrl })
          });

          if (!res.ok) {
            let errorMessage = 'Image cache failed';
            try {
              const errData = await res.json();
              if (errData?.error) errorMessage = errData.error;
            } catch {}

            showToast(errorMessage, 'error');
            return caption ? `${caption}${cleanUrl}` : cleanUrl;
          }

          const data = await res.json();
          const finalUrl = data.url || cleanUrl;
          return caption ? `${caption}${finalUrl}` : finalUrl;
        })
      );

      dispatch({
        type: 'SET_FIELD',
        payload: { field: 'img', value: updatedUrls }
      });
      showToast('Images cached successfully!', 'success');
    } catch (err: any) {
      console.error('Cache image error:', err);
      showToast(err?.message || 'Unexpected cache error', 'error');
    }
  };

  const handleGenerateImage = async () => {
    try {
      const query = formData.word || '';
      if (!query) return;

      const res = await fetch(`${serverUrl}/api/images/search?q=${encodeURIComponent(query)}`);

      if (!res.ok) {
        let errorMessage = 'Image generate failed';
        try {
          const errData = await res.json();
          if (errData?.error) errorMessage = errData.error;
        } catch {}
        showToast(errorMessage, 'error');
        return;
      }

      const data = await res.json();
      const images = data?.images || [];

      if (!images.length) {
        showToast('No image found', 'error');
        return;
      }

      const updated = images
        .map((img: any) => img.url)
        .filter((u: string) => u && u.trim() !== "");

      dispatch({
        type: 'SET_FIELD',
        payload: { field: 'img', value: updated }
      });

      showToast('Image generated!', 'success');
    } catch (err: any) {
      console.error('Generate image error:', err);
      showToast(err?.message || 'Unexpected error', 'error');
    }
  };
  
  return (
    <>
      <EditStudyItemModalUI 
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
        handleCacheImages={handleCacheImages}
        onGenImg={handleGenerateImage}
        onSelectImage={handleSelectImage}
      onFormatExamples={handleFormatExamples}
      availableGroups={availableGroups}
      onFillMeaningVi={() => void handleFillMeaning('vi')}
      onFillMeaningEn={() => void handleFillMeaning('en')}
      isMeaningLoading={isMeaningLoading}
      onFillCambridgeIpa={() => void handleFillCambridgeIpa()}
      onFillGeneratedIpa={() => void handleFillGeneratedIpa()}
      isIpaLoading={isIpaLoading}
      onGenerateExamples={() => void handleGenerateExamples()}
      onGenerateCollocations={() => void handleGenerateCollocations()}
      isStudyBuddyGenerating={isStudyBuddyGenerating}
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
      {isSelectImgOpen && (
        <div className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-4 w-[600px] max-h-[80vh] overflow-auto">
            <h3 className="font-bold mb-3">Select Images</h3>
            <div className="grid grid-cols-3 gap-2">
              {(formData.img || []).filter((u: string) => u && u.trim() !== "").map((url: string, idx: number) => {
                const clean = url.trim();
                const isSelected = selectedImgs.includes(clean);
                return (
                  <div
                    key={url + '-' + idx}
                    onClick={() => {
                      const clean = url.trim();
                      setSelectedImgs(prev =>
                        prev.includes(clean)
                          ? prev.filter(i => i !== clean)
                          : [...prev, clean]
                      );
                    }}
                    className={`relative cursor-pointer border-2 rounded-lg overflow-hidden transition-all ${
                      isSelected
                        ? 'border-green-500 shadow-md'
                        : 'border-transparent hover:border-neutral-300'
                    }`}
                  >
                    <img
                      src={url.startsWith('http') ? url : `${serverUrl}${url}`}
                      className="w-full h-32 object-cover pointer-events-none"
                    />

                    {isSelected && (
                      <>
                        <div className="absolute inset-0 bg-green-500/20"></div>
                        <div className="absolute top-1 right-1 z-10 bg-green-500 text-white text-xs font-black w-5 h-5 flex items-center justify-center rounded-full shadow">
                          ✓
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setIsSelectImgOpen(false)}>Cancel</button>
              <button onClick={handleConfirmSelectImage} className="bg-blue-500 text-white px-3 py-1 rounded">
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default EditStudyItemModal;
