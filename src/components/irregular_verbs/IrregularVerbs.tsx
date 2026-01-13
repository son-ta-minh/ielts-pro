import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { User, IrregularVerb, VocabularyItem, WordQuality } from '../../app/types';
import * as db from '../../app/db';
import * as dataStore from '../../app/dataStore';
import { useToast } from '../../contexts/ToastContext';
import { IrregularVerbsUI } from './IrregularVerbs_UI';
import { createNewWord } from '../../utils/srs';
import UniversalAiModal from '../common/UniversalAiModal';
import { getIrregularVerbFormsPrompt } from '../../services/promptService';
import { stringToWordArray } from '../../utils/text';
import { IrregularVerbsPractice } from './IrregularVerbsPractice';
import { generateIrregularVerbForms } from '../../services/geminiService';

interface Props {
  user: User;
  onGlobalViewWord: (word: VocabularyItem) => void;
}

const IrregularVerbs: React.FC<Props> = ({ user, onGlobalViewWord }) => {
  const [verbs, setVerbs] = useState<IrregularVerb[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVerb, setEditingVerb] = useState<IrregularVerb | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [isPracticeSetupOpen, setIsPracticeSetupOpen] = useState(false);
  const [practiceProps, setPracticeProps] = useState<{ verbs: IrregularVerb[], mode: 'headword' | 'random' } | null>(null);

  // Search and Pagination State
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const pageSize = 15;
  
  const [isAddPanelOpen, setIsAddPanelOpen] = useState(false);
  const [addInput, setAddInput] = useState('');

  const [libraryWords, setLibraryWords] = useState<Map<string, VocabularyItem>>(new Map());

  const { showToast } = useToast();

  const loadData = useCallback(async () => {
    setLoading(true);
    const [userVerbs, allWords] = await Promise.all([
      db.getIrregularVerbsByUserId(user.id),
      dataStore.getAllWords()
    ]);
    setVerbs(userVerbs.sort((a, b) => a.v1.localeCompare(b.v1)));
    
    const wordMap = new Map<string, VocabularyItem>();
    allWords.forEach(w => wordMap.set(w.word.toLowerCase(), w));
    setLibraryWords(wordMap);
    
    setLoading(false);
  }, [user.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Derived state for filtering and pagination
  const filteredVerbs = useMemo(() => {
    if (!searchQuery.trim()) return verbs;
    const q = searchQuery.toLowerCase().trim();
    return verbs.filter(v => 
      v.v1.toLowerCase().includes(q) || 
      v.v2.toLowerCase().includes(q) || 
      v.v3.toLowerCase().includes(q)
    );
  }, [verbs, searchQuery]);

  const pagedVerbs = useMemo(() => {
    const start = page * pageSize;
    return filteredVerbs.slice(start, start + pageSize);
  }, [filteredVerbs, page]);

  const totalPages = Math.ceil(filteredVerbs.length / pageSize);

  // Reset page when search changes
  useEffect(() => {
    setPage(0);
  }, [searchQuery]);

  const verbsToRefine = useMemo(() => {
    return verbs.filter(v => selectedIds.has(v.id) && (!v.v2 || !v.v3));
  }, [verbs, selectedIds]);

  const handleNew = () => {
    setIsAddPanelOpen(prev => !prev);
  };

  const handleEdit = (verb: IrregularVerb) => {
    setEditingVerb(verb);
    setIsModalOpen(true);
  };

  const handleDelete = async (verb: IrregularVerb) => {
    await db.deleteIrregularVerb(verb.id);
    showToast(`Deleted "${verb.v1}".`, 'success');
    await loadData();
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.delete(verb.id);
      return next;
    });
  };

  const handleSave = async (verbData: { v1: string, v2: string, v3: string }) => {
    const now = Date.now();
    // Enforce lowercase on V1 as requested
    const processedV1 = verbData.v1.trim().toLowerCase();
    try {
      if (editingVerb) {
        const updatedVerb = { ...editingVerb, ...verbData, v1: processedV1, updatedAt: now };
        await db.saveIrregularVerb(updatedVerb);
        showToast('Verb updated!', 'success');
      } else {
        const newVerb: IrregularVerb = {
          id: `iv-${now}`,
          userId: user.id,
          ...verbData,
          v1: processedV1,
          createdAt: now,
          updatedAt: now,
        };
        await db.saveIrregularVerb(newVerb);
        showToast('Verb created!', 'success');
      }
      setIsModalOpen(false);
      await loadData();
    } catch (e: any) {
      showToast(e.message || 'Failed to save verb.', 'error');
    }
  };
  
  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setIsProcessing(true);
    await db.bulkDeleteIrregularVerbs(Array.from(selectedIds));
    showToast(`Deleted ${selectedIds.size} verbs.`, 'success');
    setSelectedIds(new Set());
    await loadData();
    setIsProcessing(false);
  };

  const handleBulkAdd = async (withAI: boolean) => {
    const verbsToProcess = stringToWordArray(addInput);
    if (verbsToProcess.length === 0) return;

    setIsProcessing(true);
    try {
        const existingV1s = new Set(verbs.map(v => v.v1.toLowerCase()));
        const newVerbsToProcess = verbsToProcess.filter(v => !existingV1s.has(v.toLowerCase()));

        if (newVerbsToProcess.length === 0) {
            showToast('All entered verbs already exist.', 'info');
            return;
        }

        let verbsToSave: IrregularVerb[] = [];
        const now = Date.now();

        if (withAI) {
            const forms = await generateIrregularVerbForms(newVerbsToProcess);
            forms.forEach(form => {
                if (!existingV1s.has(form.v1.toLowerCase())) {
                    verbsToSave.push({
                        id: `iv-${now}-${Math.random()}`,
                        userId: user.id,
                        v1: form.v1.toLowerCase(),
                        v2: form.v2,
                        v3: form.v3,
                        createdAt: now,
                        updatedAt: now,
                    });
                    existingV1s.add(form.v1.toLowerCase());
                }
            });
        } else {
            newVerbsToProcess.forEach(v1 => {
                 verbsToSave.push({
                    id: `iv-${now}-${Math.random()}`,
                    userId: user.id,
                    v1: v1.toLowerCase(),
                    v2: '',
                    v3: '',
                    createdAt: now,
                    updatedAt: now,
                });
            });
        }
        
        if (verbsToSave.length > 0) {
            await db.bulkSaveIrregularVerbs(verbsToSave);
            showToast(`Added ${verbsToSave.length} new verb(s).`, 'success');
            setAddInput('');
            setIsAddPanelOpen(false);
            await loadData();
        } else {
            showToast('No new verbs to add.', 'info');
        }
        
        const skippedCount = verbsToProcess.length - newVerbsToProcess.length;
        if (skippedCount > 0) {
            showToast(`Skipped ${skippedCount} existing verb(s).`, 'info');
        }

    } catch (e: any) {
        showToast(e.message || 'Failed to add verbs.', 'error');
    } finally {
        setIsProcessing(false);
    }
  };
  
  const handleAddToLibrary = async () => {
    if (selectedIds.size === 0) return;
    setIsProcessing(true);
    const selectedVerbs = verbs.filter(v => selectedIds.has(v.id));
    const newWords: VocabularyItem[] = [];
    for (const verb of selectedVerbs) {
      if (!libraryWords.has(verb.v1.toLowerCase())) {
        const newItem = createNewWord(verb.v1, '', '', '', '', ['irregular-verb']);
        newItem.userId = user.id;
        newItem.isIrregular = true;
        newItem.v2 = verb.v2;
        newItem.v3 = verb.v3;
        newWords.push(newItem);
      }
    }
    if (newWords.length > 0) {
      await dataStore.bulkSaveWords(newWords);
      showToast(`Added ${newWords.length} new verbs to your library.`, 'success');
      await loadData(); // To refresh libraryWords map
    } else {
      showToast('Selected verbs are already in your library.', 'info');
    }
    setIsProcessing(false);
    setSelectedIds(new Set());
  };
  
  const handleOpenRefineModal = () => {
    if (selectedIds.size === 0) {
        showToast('Please select verbs to refine.', 'info');
        return;
    }
    if (verbsToRefine.length === 0) {
        showToast('All selected verbs are already complete.', 'info');
        return;
    }
    setIsAiModalOpen(true);
  };

  const handleAiRefineResult = async (results: any[]) => {
    setIsAiModalOpen(false);
    setIsProcessing(true);
    try {
        if (!Array.isArray(results)) {
            throw new Error("AI response was not in the expected array format.");
        }
        
        const resultsMap = new Map(results.map(r => [r.v1.toLowerCase(), r]));
        
        const updatedVerbs = verbsToRefine.map(verb => {
            const result = resultsMap.get(verb.v1.toLowerCase());
            if (result) {
                return { ...verb, v2: result.v2, v3: result.v3, updatedAt: Date.now() };
            }
            return null;
        }).filter((v): v is IrregularVerb => v !== null);

        if (updatedVerbs.length > 0) {
            await db.bulkSaveIrregularVerbs(updatedVerbs);
            showToast(`Refined ${updatedVerbs.length} verbs.`, 'success');
            await loadData();
        } else {
            showToast('AI could not refine the selected verbs.', 'info');
        }
    } catch (e: any) {
        showToast(e.message || 'AI refinement failed.', 'error');
    } finally {
        setIsProcessing(false);
        setSelectedIds(new Set());
    }
  };

  const handleStartPractice = (mode: 'headword' | 'random') => {
    const practiceVerbs = verbs.filter(v => selectedIds.has(v.id));
    if (practiceVerbs.length === 0) {
        showToast("Please select verbs to practice.", "info");
        return;
    }
    setPracticeProps({ verbs: practiceVerbs, mode });
    setIsPracticeSetupOpen(false);
  };

  const handlePracticeComplete = async (results: { verbId: string; result: 'pass' | 'fail'; incorrectForms: ('v1' | 'v2' | 'v3')[]; }[]) => {
    const now = Date.now();
    const verbsToUpdate = verbs.map(v => {
        const result = results.find(r => r.verbId === v.id);
        if (result) {
            return {
                ...v,
                lastTestResult: result.result,
                lastTestTimestamp: now,
                lastTestIncorrectForms: result.result === 'fail' ? result.incorrectForms : undefined
            };
        }
        return v;
    });
    
    const relevantUpdates = verbsToUpdate.filter(v => results.some(r => r.verbId === v.id));
    if (relevantUpdates.length > 0) {
        await db.bulkSaveIrregularVerbs(relevantUpdates);
    }
    
    setPracticeProps(null);
    setSelectedIds(new Set());
    loadData();
  };


  return (
    <>
      <IrregularVerbsUI
        loading={loading}
        verbs={pagedVerbs}
        totalCount={filteredVerbs.length}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        page={page}
        pageSize={pageSize}
        totalPages={totalPages}
        onPageChange={setPage}
        isModalOpen={isModalOpen}
        editingVerb={editingVerb}
        selectedIds={selectedIds}
        setSelectedIds={setSelectedIds}
        isProcessing={isProcessing}
        libraryWords={libraryWords}
        onGlobalViewWord={onGlobalViewWord}
        onNew={handleNew}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onSave={handleSave}
        onCloseModal={() => setIsModalOpen(false)}
        onBulkDelete={handleBulkDelete}
        onAddToLibrary={handleAddToLibrary}
        onRefine={handleOpenRefineModal}
        onPractice={() => setIsPracticeSetupOpen(true)}
        isPracticeSetupOpen={isPracticeSetupOpen}
        onClosePracticeSetup={() => setIsPracticeSetupOpen(false)}
        onStartPractice={handleStartPractice}
        isAddPanelOpen={isAddPanelOpen}
        addInput={addInput}
        onAddInputChange={setAddInput}
        onBulkAdd={handleBulkAdd}
      />
      {practiceProps && (
        <IrregularVerbsPractice
          verbs={practiceProps.verbs}
          mode={practiceProps.mode}
          onComplete={handlePracticeComplete}
          onExit={() => setPracticeProps(null)}
        />
      )}
      {isAiModalOpen && (
        <UniversalAiModal
          isOpen={isAiModalOpen}
          onClose={() => setIsAiModalOpen(false)}
          type="REFINE_WORDS"
          title="Refine Irregular Verbs"
          description={`Generating V2 & V3 for ${verbsToRefine.length} selected verb(s).`}
          initialData={{ words: verbsToRefine.map(v => v.v1).join('; ') }}
          hidePrimaryInput={true}
          onGeneratePrompt={(inputs: { words: string }) => getIrregularVerbFormsPrompt(stringToWordArray(inputs.words))}
          onJsonReceived={handleAiRefineResult}
          actionLabel="Update Verbs"
        />
      )}
    </>
  );
};

export default IrregularVerbs;
