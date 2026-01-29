import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { User, ComparisonGroup } from '../../app/types';
import * as db from '../../app/db';
import { useToast } from '../../contexts/ToastContext';
import { TagTreeNode } from '../../components/common/TagBrowser';
import { getStoredJSON, setStoredJSON } from '../../utils/storage';
import { ComparisonTemplateUI } from './ComparisonTemplate_UI';
import { ComparisonReadView } from './ComparisonReadView';
import { ComparisonEditView } from './ComparisonEditView';

interface Props {
  user: User;
  onExit?: () => void;
}

const VIEW_SETTINGS_KEY = 'vocab_pro_comparison_view';

export const ComparisonTemplate: React.FC<Props> = ({ user, onExit }) => {
  const [groups, setGroups] = useState<ComparisonGroup[]>([]);
  const [loading, setLoading] = useState(true);
  
  // View State
  const [viewMode, setViewMode] = useState<'LIST' | 'READ' | 'EDIT'>('LIST');
  const [activeGroup, setActiveGroup] = useState<ComparisonGroup | null>(null);
  
  // Filter & View Settings
  const [query, setQuery] = useState('');
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
  const [isTagBrowserOpen, setIsTagBrowserOpen] = useState(false);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);
  const [viewSettings, setViewSettings] = useState(() => getStoredJSON(VIEW_SETTINGS_KEY, {
      showDesc: true,
      showTags: true,
      compact: false
  }));

  useEffect(() => { setStoredJSON(VIEW_SETTINGS_KEY, viewSettings); }, [viewSettings]);

  const [groupToDelete, setGroupToDelete] = useState<ComparisonGroup | null>(null);
  const { showToast } = useToast();

  // Data Loading
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const userGroups = await db.getComparisonGroupsByUserId(user.id);
      setGroups(userGroups.sort((a, b) => b.createdAt - a.createdAt));
    } finally {
      setLoading(false);
    }
  }, [user.id]);

  useEffect(() => { loadData(); }, [loadData]);

  // Derived State: Tags
  const tagTree = useMemo(() => {
    interface TempNode { name: string; path: string; children: Map<string, TempNode>; itemCount: number; }
    const root: TempNode = { name: 'root', path: '', children: new Map(), itemCount: 0 };
    const noTagGroups = groups.filter(g => !g.tags || g.tags.length === 0);

    groups.forEach(g => {
        (g.tags || []).forEach(tagPath => {
            const parts = tagPath.split('/');
            let currentNode = root;
            let currentPath = '';
            parts.forEach(part => {
                currentPath = currentPath ? `${currentPath}/${part}` : part;
                if (!currentNode.children.has(part)) {
                    currentNode.children.set(part, { name: part, path: currentPath, children: new Map(), itemCount: 0 });
                }
                currentNode = currentNode.children.get(part)!;
            });
        });
    });

    const finalizeTree = (node: TempNode): TagTreeNode => {
        const children = Array.from(node.children.values()).map(finalizeTree).sort((a,b) => a.name.localeCompare(b.name));
        const count = groups.filter(g => g.tags?.some(t => t.startsWith(node.path))).length;
        return { name: node.name, path: node.path, children, unitCount: count };
    };
    
    let final = finalizeTree(root).children;
    if (noTagGroups.length > 0) final.unshift({ name: 'Uncategorized', path: 'Uncategorized', children: [], unitCount: noTagGroups.length });
    return final;
  }, [groups]);

  const filteredGroups = useMemo(() => {
      let result = groups;
      if (query) {
          const lower = query.toLowerCase();
          result = result.filter(g => g.name.toLowerCase().includes(lower) || g.words.some(w => w.toLowerCase().includes(lower)));
      }
      if (selectedTag) {
          if (selectedTag === 'Uncategorized') {
            result = result.filter(item => {
                const path = item.path ?? (item.tags || []).find(t => t.startsWith('/'));
                const hasPath = path && path !== '/';
                return !hasPath;
            });
          } else {
            result = result.filter(g => g.path?.startsWith(selectedTag) || g.tags?.includes(selectedTag));
          }
      }
      return result;
  }, [groups, query, selectedTag]);

  // Handlers
  const handleNew = () => {
    const newGroup: ComparisonGroup = {
        id: `cmp-${Date.now()}`,
        userId: user.id,
        name: 'New Comparison',
        words: [],
        tags: [],
        comparisonData: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
    };
    setActiveGroup(newGroup);
    setViewMode('EDIT');
  };

  const handleSave = (updatedGroup: ComparisonGroup) => {
      loadData();
      setActiveGroup(updatedGroup);
      setViewMode('READ');
  };

  const handleDelete = async () => {
      if (!groupToDelete) return;
      await db.deleteComparisonGroup(groupToDelete.id);
      showToast('Group deleted.', 'success');
      setGroupToDelete(null);
      loadData();
  };

  if (viewMode === 'READ' && activeGroup) {
      return <ComparisonReadView group={activeGroup} onBack={() => setViewMode('LIST')} onEdit={() => setViewMode('EDIT')} />;
  }

  if (viewMode === 'EDIT' && activeGroup) {
      return <ComparisonEditView group={activeGroup} onSave={handleSave} onCancel={() => setViewMode(activeGroup.words.length > 0 ? 'READ' : 'LIST')} user={user} />;
  }

  return (
    <ComparisonTemplateUI
        loading={loading}
        filteredGroups={filteredGroups}
        query={query}
        onQueryChange={setQuery}
        activeFilters={activeFilters}
        viewSettings={viewSettings}
        setViewSettings={setViewSettings}
        isViewMenuOpen={isViewMenuOpen}
        setIsViewMenuOpen={setIsViewMenuOpen}
        isTagBrowserOpen={isTagBrowserOpen}
        setIsTagBrowserOpen={setIsTagBrowserOpen}
        tagTree={tagTree}
        selectedTag={selectedTag}
        setSelectedTag={setSelectedTag}
        onNew={handleNew}
        onRead={(g) => { setActiveGroup(g); setViewMode('READ'); }}
        onEdit={(g) => { setActiveGroup(g); setViewMode('EDIT'); }}
        onDeleteRequest={setGroupToDelete}
        groupToDelete={groupToDelete}
        onDeleteConfirm={handleDelete}
        onDeleteCancel={() => setGroupToDelete(null)}
    />
  );
};