import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { User, ComparisonGroup, VocabularyItem } from '../../app/types';
import * as db from '../../app/db';
import * as dataStore from '../../app/dataStore';
import { getComparisonPrompt } from '../../services/promptService';
import { useToast } from '../../contexts/ToastContext';
import { ComparisonUI } from './Comparison_UI';
import UniversalAiModal from '../common/UniversalAiModal';

interface Props {
  user: User;
}

const Comparison: React.FC<Props> = ({ user }) => {
  const [groups, setGroups] = useState<ComparisonGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ComparisonGroup | null>(null);

  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [groupToRefine, setGroupToRefine] = useState<ComparisonGroup | null>(null);

  const [libraryWords, setLibraryWords] = useState<Set<string>>(new Set());
  
  const [noteSavingStatus, setNoteSavingStatus] = useState<Record<string, 'saving' | 'saved' | null>>({});
  const timeoutRefs = useRef<Record<string, number>>({});
  
  const { showToast } = useToast();

  const loadData = useCallback(async () => {
    setLoading(true);
    const [userGroups, allWords] = await Promise.all([
        db.getComparisonGroupsByUserId(user.id),
        dataStore.getAllWords()
    ]);
    setGroups(userGroups.sort((a, b) => b.createdAt - a.createdAt));
    setLibraryWords(new Set(allWords.map(w => w.word.toLowerCase())));
    setLoading(false);
  }, [user.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleNewGroup = () => {
    setEditingGroup(null);
    setIsModalOpen(true);
  };

  const handleEditGroup = (group: ComparisonGroup) => {
    setEditingGroup(group);
    setIsModalOpen(true);
  };

  const handleDeleteGroup = async (group: ComparisonGroup) => {
    await db.deleteComparisonGroup(group.id);
    showToast(`Group "${group.name}" deleted.`, 'success');
    loadData();
  };

  const handleSaveGroup = async (name: string, words: string[]) => {
    try {
      if (editingGroup) {
        const updatedGroup = { ...editingGroup, name, words, updatedAt: Date.now() };
        await db.saveComparisonGroup(updatedGroup);
        showToast('Group updated!', 'success');
      } else {
        const newGroup: ComparisonGroup = {
          id: `cmp-${Date.now()}`,
          userId: user.id,
          name,
          words,
          comparisonData: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        await db.saveComparisonGroup(newGroup);
        showToast('Group created!', 'success');
      }
      setIsModalOpen(false);
      loadData();
    } catch (e: any) {
      showToast(e.message || 'Failed to save group.', 'error');
    }
  };

  const handleOpenAiModal = (group: ComparisonGroup) => {
    setGroupToRefine(group);
    setIsAiModalOpen(true);
  };

  const handleGeneratePrompt = (): string => {
      if (!groupToRefine) return '';
      return getComparisonPrompt(groupToRefine.name, groupToRefine.words);
  };

  const handleAiResult = async (data: any) => {
    if (!groupToRefine || !data.comparisonData || !data.updatedWords) {
        showToast('Invalid data from AI. Please ensure the JSON structure is correct.', 'error');
        return;
    }
    try {
        const updatedGroup = { 
          ...groupToRefine, 
          words: data.updatedWords,
          comparisonData: data.comparisonData,
          updatedAt: Date.now() 
        };
        await db.saveComparisonGroup(updatedGroup);
        showToast(`Refined "${groupToRefine.name}" and suggested new words!`, 'success');
        loadData();
        setIsAiModalOpen(false);
        setGroupToRefine(null);
    } catch (e: any) {
        showToast('Failed to save refined group.', 'error');
    }
  };

  const handleNoteChange = (groupId: string, wordIndex: number, newNote: string) => {
    setGroups(currentGroups => {
      const newGroups = currentGroups.map(group => {
        if (group.id === groupId) {
          const newComparisonData = [...group.comparisonData];
          if (newComparisonData[wordIndex]) {
            newComparisonData[wordIndex] = { ...newComparisonData[wordIndex], userNote: newNote };
          }
          const updatedGroup = { ...group, comparisonData: newComparisonData };

          setNoteSavingStatus(prev => ({ ...prev, [groupId]: 'saving' }));
          if (timeoutRefs.current[groupId]) {
            clearTimeout(timeoutRefs.current[groupId]);
          }

          timeoutRefs.current[groupId] = window.setTimeout(async () => {
            await db.saveComparisonGroup({ ...updatedGroup, updatedAt: Date.now() });
            setNoteSavingStatus(prev => ({ ...prev, [groupId]: 'saved' }));
            setTimeout(() => setNoteSavingStatus(prev => ({ ...prev, [groupId]: null })), 2000);
          }, 1000);

          return updatedGroup;
        }
        return group;
      });
      return newGroups;
    });
  };

  return (
    <>
        <ComparisonUI
            loading={loading}
            groups={groups}
            activeGroupId={activeGroupId}
            setActiveGroupId={setActiveGroupId}
            isModalOpen={isModalOpen}
            editingGroup={editingGroup}
            onNewGroup={handleNewGroup}
            onEditGroup={handleEditGroup}
            onDeleteGroup={handleDeleteGroup}
            onSaveGroup={handleSaveGroup}
            onCloseModal={() => setIsModalOpen(false)}
            onOpenAiModal={handleOpenAiModal}
            libraryWords={libraryWords}
            onNoteChange={handleNoteChange}
            noteSavingStatus={noteSavingStatus}
        />
        {isAiModalOpen && groupToRefine && (
            <UniversalAiModal
                isOpen={isAiModalOpen}
                onClose={() => { setIsAiModalOpen(false); setGroupToRefine(null); }}
                type="REFINE_WORDS" // Re-using for UI styling, prompt is custom
                title={`Refine Comparison: ${groupToRefine.name}`}
                description="Copy the command, get JSON from your AI, then paste the result."
                initialData={{}} // No initial data needed for the input field
                hidePrimaryInput={true}
                onGeneratePrompt={handleGeneratePrompt}
                onJsonReceived={handleAiResult}
            />
        )}
    </>
  );
};

export default Comparison;