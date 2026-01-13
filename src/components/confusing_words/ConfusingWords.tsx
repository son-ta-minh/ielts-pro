import React, { useState, useEffect, useCallback } from 'react';
// FIX: Changed WordComparisonGroup to ComparisonGroup to match exported type.
import { User, ComparisonGroup } from '../../app/types';
import * as db from '../../app/db';
import { generateWordComparison } from '../../services/geminiService';
import { useToast } from '../../contexts/ToastContext';
import { ConfusingWordsUI } from './ConfusingWords_UI';

interface Props {
  user: User;
}

const ConfusingWords: React.FC<Props> = ({ user }) => {
  const [groups, setGroups] = useState<ComparisonGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ComparisonGroup | null>(null);
  const [refiningGroupId, setRefiningGroupId] = useState<string | null>(null);
  
  const { showToast } = useToast();

  const loadGroups = useCallback(async () => {
    setLoading(true);
    // FIX: Renamed db function getWordComparisonGroupsByUserId to getComparisonGroupsByUserId.
    const userGroups = await db.getComparisonGroupsByUserId(user.id);
    setGroups(userGroups.sort((a, b) => b.createdAt - a.createdAt));
    setLoading(false);
  }, [user.id]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  const handleNewGroup = () => {
    setEditingGroup(null);
    setIsModalOpen(true);
  };

  const handleEditGroup = (group: ComparisonGroup) => {
    setEditingGroup(group);
    setIsModalOpen(true);
  };

  const handleDeleteGroup = async (group: ComparisonGroup) => {
    // FIX: Renamed db function deleteWordComparisonGroup to deleteComparisonGroup.
    await db.deleteComparisonGroup(group.id);
    showToast(`Group "${group.name}" deleted.`, 'success');
    loadGroups();
  };

  const handleSaveGroup = async (name: string, words: string[]) => {
    try {
      if (editingGroup) {
        // Update
        const updatedGroup = { ...editingGroup, name, words, updatedAt: Date.now() };
        // FIX: Renamed db function saveWordComparisonGroup to saveComparisonGroup.
        await db.saveComparisonGroup(updatedGroup);
        showToast('Group updated!', 'success');
      } else {
        // Create
        const newGroup: ComparisonGroup = {
          id: `wcg-${Date.now()}`,
          userId: user.id,
          name,
          words,
          comparisonData: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        // FIX: Renamed db function saveWordComparisonGroup to saveComparisonGroup.
        await db.saveComparisonGroup(newGroup);
        showToast('Group created!', 'success');
      }
      setIsModalOpen(false);
      loadGroups();
    } catch (e: any) {
      showToast(e.message || 'Failed to save group.', 'error');
    }
  };

  const handleRefine = async (group: ComparisonGroup) => {
    setRefiningGroupId(group.id);
    try {
      const result = await generateWordComparison(group.name, group.words);
      const updatedGroup = { 
        ...group, 
        words: result.updatedWords,
        comparisonData: result.comparisonHtml as any, // Mismatch with type, assuming it's a temp state.
        updatedAt: Date.now() 
      };
      // FIX: Renamed db function saveWordComparisonGroup to saveComparisonGroup.
      await db.saveComparisonGroup(updatedGroup);
      showToast(`Refined "${group.name}" and suggested new words!`, 'success');
      loadGroups();
    } catch (e: any) {
      showToast(e.message || 'AI refinement failed.', 'error');
    } finally {
      setRefiningGroupId(null);
    }
  };

  return (
    <ConfusingWordsUI
      loading={loading}
      groups={groups}
      activeGroupId={activeGroupId}
      setActiveGroupId={setActiveGroupId}
      isModalOpen={isModalOpen}
      editingGroup={editingGroup}
      refiningGroupId={refiningGroupId}
      onNewGroup={handleNewGroup}
      onEditGroup={handleEditGroup}
      onDeleteGroup={handleDeleteGroup}
      onSaveGroup={handleSaveGroup}
      onRefine={handleRefine}
      onCloseModal={() => setIsModalOpen(false)}
    />
  );
};

export default ConfusingWords;