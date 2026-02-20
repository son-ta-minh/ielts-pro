
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { User, IrregularVerb, VocabularyItem } from '../../../app/types';
import * as db from '../../../app/db';
import * as dataStore from '../../../app/dataStore';
import { useToast } from '../../../contexts/ToastContext';
import { IrregularVerbsUI } from './IrregularVerbs_UI';
import { createNewWord } from '../../../utils/srs';
import UniversalAiModal from '../../common/UniversalAiModal';
import { getIrregularVerbFormsPrompt } from '../../../services/promptService';
import { stringToWordArray } from '../../../utils/text';
import { IrregularVerbsPractice } from './IrregularVerbsPractice';
import { generateIrregularVerbForms } from '../../../services/geminiService';

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
  const [practiceProps, setPracticeProps] = useState<{ verbs: IrregularVerb[], mode: 'headword' | 'random' | 'quick' } | null>(null);
  // FIX: Change practiceScope state to only hold 'all' or an array of verbs.
  const [practiceScope, setPracticeScope] = useState<'all' | IrregularVerb[]>('all');

  // Search and Pagination State
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(15);
  
  const [isAddPanelOpen, setIsAddPanelOpen] = useState(false);
  const [addInput, setAddInput] = useState('');

  const [libraryWords, setLibraryWords] = useState<Map<string, VocabularyItem>>(new Map());

  const { showToast } = useToast();

  // Helper to clean up duplicates from the loaded list
  // Prioritizes verbs that have V2 and V3. If both have, keeps the one with more data or newer.
  const sanitizeVerbs = async (loadedVerbs: IrregularVerb[]) => {
      const uniqueMap = new Map<string, IrregularVerb>();
      const idsToDelete: string[] = [];
      let cleanupNeeded = false;

      for (const v of loadedVerbs) {
          const key = v.v1.toLowerCase().trim();
          if (uniqueMap.has(key)) {
              const existing = uniqueMap.get(key)!;
              
              const existingComplete = !!(existing.v2 && existing.v3);
              const currentComplete = !!(v.v2 && v.v3);
              
              // Logic: Keep the "Complete" one. If both complete/incomplete, keep the newer one (presumably better/edited)


              const keepCurrent = (currentComplete && !existingComplete) || (currentComplete === existingComplete && v.updatedAt > existing.updatedAt);

              if (keepCurrent) {
                  idsToDelete.push(existing.id);
                  uniqueMap.set(key, v);
              } else {
                  idsToDelete.push(v.id);
              }
              cleanupNeeded = true;
          } else {
              uniqueMap.set(key, v);
          }
      }

      if (idsToDelete.length > 0) {
          console.log(`[IrregularVerbs] Cleaning up ${idsToDelete.length} duplicates...`);
          // Perform cleanup in background to update DB
          db.bulkDeleteIrregularVerbs(idsToDelete); 
      }
      
      return Array.from(uniqueMap.values());
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    const [userVerbs, allWords] = await Promise.all([
      db.getIrregularVerbsByUserId(user.id),
      dataStore.getAllWords()
    ]);
    
    // Apply sanitization logic immediately upon load
    const cleanVerbs = await sanitizeVerbs(userVerbs);

    setVerbs(cleanVerbs.sort((a, b) => a.v1.localeCompare(b.v1)));
    
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
  }, [filteredVerbs, page, pageSize]);

  const totalPages = Math.ceil(filteredVerbs.length / pageSize);

  // Reset page when search or page size changes
  useEffect(() => {
    setPage(0);
  }, [searchQuery, pageSize]);

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
        let verbsToSave: IrregularVerb[] = [];
        const now = Date.now();
        
        // Map existing verbs for quick lookup
        const existingMap = new Map<string, IrregularVerb>(verbs.map(v => [v.v1.toLowerCase(), v]));

        if (withAI) {
            // Process ALL entered verbs to potentially fix existing incomplete ones
            // FIX: Cast result to expected type to avoid 'unknown' errors
            const forms = await generateIrregularVerbForms(verbsToProcess) as {v1: string, v2: string, v3: string}[];
            
            for (const form of forms) {
                const key = form.v1.toLowerCase();
                const existing = existingMap.get(key);
                
                if (existing) {
                    // Smart Merge: Only update if existing is incomplete and new is complete
                    const existingIncomplete = !existing.v2 || !existing.v3;
                    const newComplete = form.v2 && form.v3;
                    
                    if (existingIncomplete && newComplete) {
                        const updated: IrregularVerb = { 
                            ...existing, 
                            v2: form.v2, 
                            v3: form.v3, 
                            updatedAt: now 
                        };
                        verbsToSave.push(updated);
                    }
                    // If existing is already complete, do nothing (discard duplicate)
                } else {
                    // Create new
                    verbsToSave.push({
                        id: `iv-${now}-${Math.random()}`,
                        userId: user.id,
                        v1: key,
                        v2: form.v2,
                        v3: form.v3,
                        createdAt: now,
                        updatedAt: now,
                    });
                }
            }
        } else {
            // Manual Add (No AI) - Only add if not exists
            verbsToProcess.forEach(v1 => {
                 const key = v1.toLowerCase().trim();
                 if (!existingMap.has(key)) {
                     verbsToSave.push({
                        id: `iv-${now}-${Math.random()}`,
                        userId: user.id,
                        v1: key,
                        v2: '',
                        v3: '',
                        createdAt: now,
                        updatedAt: now,
                    });
                    // Add to map to prevent duplicates within the same batch
                    existingMap.set(key, verbsToSave[verbsToSave.length -1]); 
                 }
            });
        }
        
        if (verbsToSave.length > 0) {
            await db.bulkSaveIrregularVerbs(verbsToSave);
            showToast(`Processed ${verbsToSave.length} verb(s) (Added or Updated).`, 'success');
            setAddInput('');
            setIsAddPanelOpen(false);
            await loadData();
        } else {
            showToast('No new or better verbs to add.', 'info');
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
        // Fix: Removed assignments of v2 and v3 as they do not exist on VocabularyItem type
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

  const handlePracticeSelected = () => {
    if (selectedIds.size === 0) {
        showToast("Please select verbs to practice.", "info");
        return;
    }
    // FIX: Set practiceScope to the filtered array of verbs.
    setPracticeScope(verbs.filter(v => selectedIds.has(v.id)));
    setIsPracticeSetupOpen(true);
  };

  const handlePracticeAll = () => {
    if (verbs.length === 0) {
        showToast("There are no verbs to practice.", "info");
        return;
    }
    setPracticeScope('all');
    setIsPracticeSetupOpen(true);
  };

  const handleStartPractice = (mode: 'headword' | 'random' | 'quick' | 'quick_forgot' | 'quick_all', filterUnlearned?: boolean) => {
    // FIX: Simplify basePracticeVerbs logic as practiceScope is now always IrregularVerb[] or 'all'.
    const basePracticeVerbs = practiceScope === 'all' 
      ? verbs 
      : practiceScope;
      
    let finalPracticeVerbs: IrregularVerb[] = basePracticeVerbs;
    let finalMode: 'headword' | 'random' | 'quick' = 'headword';

    // Apply Filter if requested (for headword/random modes)
    if (filterUnlearned) {
        finalPracticeVerbs = finalPracticeVerbs.filter(v => v.lastTestResult !== 'pass');
    }

    if (mode === 'quick_forgot') {
        finalPracticeVerbs = basePracticeVerbs.filter(v => v.lastTestResult === 'fail');
        finalMode = 'quick';
    } else if (mode === 'quick_all') {
        finalPracticeVerbs = basePracticeVerbs;
        finalMode = 'quick';
    } else if (mode === 'quick') { // Keep for compatibility if needed
        finalPracticeVerbs = basePracticeVerbs;
        finalMode = 'quick';
    } else {
        // Use filtered verbs for standard modes
        finalMode = mode;
    }
      
    if (finalPracticeVerbs.length === 0) {
        const message = mode === 'quick_forgot' ? "No forgotten verbs in this selection." : filterUnlearned ? "No unlearned verbs in this selection." : "No verbs available for this practice session.";
        showToast(message, "info");
        return;
    }
    setPracticeProps({ verbs: finalPracticeVerbs, mode: finalMode });
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

  const handleQuickSetStatus = async (verb: IrregularVerb, result: 'pass' | 'fail') => {
    const now = Date.now();
    const updatedVerb: IrregularVerb = {
        ...verb,
        lastTestResult: result,
        lastTestTimestamp: now,
        lastTestIncorrectForms: result === 'fail' ? ['v2', 'v3'] : undefined
    };

    try {
        await db.saveIrregularVerb(updatedVerb);
        setVerbs(prevVerbs => prevVerbs.map(v => v.id === verb.id ? updatedVerb : v));
        showToast(`Marked "${verb.v1}" as ${result === 'pass' ? 'Known' : 'Forgot'}.`, 'success');
    } catch {
        showToast('Failed to update status.', 'error');
    }
  };

  const verbsForPracticeSetup = useMemo(() => {
    // FIX: Simplify logic as practiceScope is now always IrregularVerb[] or 'all'.
    if (practiceScope === 'all') return verbs;
    return practiceScope;
  }, [practiceScope, verbs]);

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
        onPageSizeChange={setPageSize}
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
        onPractice={handlePracticeSelected}
        onPracticeAll={handlePracticeAll}
        isPracticeSetupOpen={isPracticeSetupOpen}
        onClosePracticeSetup={() => setIsPracticeSetupOpen(false)}
        onStartPractice={handleStartPractice}
        isAddPanelOpen={isAddPanelOpen}
        addInput={addInput}
        onAddInputChange={setAddInput}
        // FIX: Pass the handleBulkAdd function to the onBulkAdd prop.
        onBulkAdd={handleBulkAdd}
        onQuickSetStatus={handleQuickSetStatus}
        practiceVerbs={verbsForPracticeSetup}
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
