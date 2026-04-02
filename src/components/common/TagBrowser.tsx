import React, { useState, useMemo, useEffect } from 'react';
import { ChevronRight, Tag, Search, FolderTree, Pencil, Trash2, Check, X } from 'lucide-react';
import ConfirmationModal from './ConfirmationModal';

export interface TagTreeNode {
    name: string;
    path: string;
    children: TagTreeNode[];
    unitCount: number;
}

interface TagNodeProps {
    node: TagTreeNode;
    selectedTag: string | null;
    onSelectTag: (path: string) => void;
    level: number;
    isSearchActive: boolean;
    editingPath: string | null;
    renameValue: string;
    setRenameValue: (value: string) => void;
    onStartRename?: (node: TagTreeNode) => void;
    onSubmitRename?: (node: TagTreeNode) => void;
    onCancelRename: () => void;
    onDeleteGroup?: (node: TagTreeNode) => void;
    isMutating: boolean;
}

const TagNode: React.FC<TagNodeProps> = ({
    node,
    selectedTag,
    onSelectTag,
    level,
    isSearchActive,
    editingPath,
    renameValue,
    setRenameValue,
    onStartRename,
    onSubmitRename,
    onCancelRename,
    onDeleteGroup,
    isMutating
}) => {
    const [isExpanded, setIsExpanded] = useState<boolean>(true);
    const isSelected = selectedTag === node.path;
    const hasChildren = node.children.length > 0;
    const isEditing = editingPath === node.path;
    const isProtectedNode = node.path === 'Uncategorized';

    useEffect(() => {
        if (isSearchActive) setIsExpanded(true);
    }, [isSearchActive]);

    return (
        <div style={{ paddingLeft: `${level * 16}px` }}>
            <div 
                className={`group flex items-center justify-between gap-2 p-2 rounded-lg cursor-pointer transition-colors ${isSelected ? 'bg-indigo-100' : 'hover:bg-neutral-100'}`}
                onClick={() => onSelectTag(node.path)}
            >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                    {hasChildren ? (
                        <button 
                            onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}
                            className="p-1 -ml-1 text-neutral-400 hover:text-neutral-800"
                            type="button"
                        >
                            <ChevronRight size={14} className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                        </button>
                    ) : (
                        <div className="w-6 h-6 shrink-0"></div>
                    )}
                    {isEditing ? (
                        <input
                            type="text"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    onSubmitRename?.(node);
                                } else if (e.key === 'Escape') {
                                    e.preventDefault();
                                    onCancelRename();
                                }
                            }}
                            className="min-w-0 flex-1 px-2 py-1 text-sm font-bold text-neutral-900 bg-white border border-indigo-200 rounded-lg outline-none ring-2 ring-indigo-100"
                            autoFocus
                        />
                    ) : (
                        <span className={`font-bold text-sm truncate ${isSelected ? 'text-indigo-800' : 'text-neutral-800'}`}>{node.name}</span>
                    )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    {!isProtectedNode && (
                        <>
                            {isEditing ? (
                                <>
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onSubmitRename?.(node);
                                        }}
                                        disabled={isMutating}
                                        className="p-1.5 rounded-md text-emerald-600 hover:bg-emerald-50 disabled:opacity-50"
                                        title="Save group name"
                                    >
                                        <Check size={14} />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onCancelRename();
                                        }}
                                        disabled={isMutating}
                                        className="p-1.5 rounded-md text-neutral-500 hover:bg-neutral-100 disabled:opacity-50"
                                        title="Cancel rename"
                                    >
                                        <X size={14} />
                                    </button>
                                </>
                            ) : (
                                <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onStartRename?.(node);
                                        }}
                                        disabled={isMutating}
                                        className="p-1.5 rounded-md text-neutral-400 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-50"
                                        title="Rename group"
                                    >
                                        <Pencil size={13} />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onDeleteGroup?.(node);
                                        }}
                                        disabled={isMutating}
                                        className="p-1.5 rounded-md text-neutral-400 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                                        title="Delete group"
                                    >
                                        <Trash2 size={13} />
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                    <span className={`text-xs font-black px-2 py-0.5 rounded-md shrink-0 ${isSelected ? 'bg-indigo-200 text-indigo-800' : 'bg-neutral-100 text-neutral-500'}`}>
                        {node.unitCount}
                    </span>
                </div>
            </div>
            {isExpanded && hasChildren && (
                <div className="mt-1">
                    {node.children.map(child => (
                        <TagNode
                            key={child.path}
                            node={child}
                            selectedTag={selectedTag}
                            onSelectTag={onSelectTag}
                            level={level + 1}
                            isSearchActive={isSearchActive}
                            editingPath={editingPath}
                            renameValue={renameValue}
                            setRenameValue={setRenameValue}
                            onStartRename={onStartRename}
                            onSubmitRename={onSubmitRename}
                            onCancelRename={onCancelRename}
                            onDeleteGroup={onDeleteGroup}
                            isMutating={isMutating}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

export interface TagBrowserProps {
    items?: { path?: string; tags?: string[] }[];
    tagTree?: TagTreeNode[];
    selectedTag: string | null;
    onSelectTag: (path: string | null) => void;
    title?: string;
    icon?: React.ReactNode;
    forcedView?: 'groups' | 'tags';
    onRenameGroup?: (path: string, nextName: string) => Promise<void> | void;
    onDeleteGroup?: (path: string) => Promise<void> | void;
}

export const TagBrowser: React.FC<TagBrowserProps> = ({
    items,
    tagTree: propTagTree,
    selectedTag,
    onSelectTag,
    title = "Browse",
    icon = <Tag size={16} />,
    forcedView,
    onRenameGroup,
    onDeleteGroup
}) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [view, setView] = useState<'groups' | 'tags'>('groups');
    const [editingPath, setEditingPath] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState('');
    const [nodeToDelete, setNodeToDelete] = useState<TagTreeNode | null>(null);
    const [isMutating, setIsMutating] = useState(false);

    useEffect(() => {
        if (forcedView) {
            setView(forcedView);
        }
    }, [forcedView]);

    const groupTree = useMemo(() => {
        if (propTagTree) return propTagTree;
        if (!items) return [];

        interface TempNode { name: string; path: string; children: Map<string, TempNode>; }
        const root: TempNode = { name: 'root', path: '', children: new Map() };

        items.forEach(item => {
            const path = item.path ?? (item.tags || []).find(t => t.startsWith('/'));
            if (path && path !== '/') {
                const parts = path.startsWith('/') ? path.substring(1).split('/') : path.split('/');
                let currentNode = root;
                let currentPath = '';
                parts.forEach(part => {
                    currentPath = `${currentPath}/${part}`;
                    if (!currentNode.children.has(part)) currentNode.children.set(part, { name: part, path: currentPath, children: new Map() });
                    currentNode = currentNode.children.get(part)!;
                });
            }
        });

        const finalizeTree = (node: TempNode): TagTreeNode => {
            const children = Array.from(node.children.values()).map(finalizeTree).sort((a,b) => a.name.localeCompare(b.name));
            const count = items.filter(i => {
                const itemPath = i.path ?? (i.tags || []).find(t => t.startsWith('/')) ?? '/';
                return itemPath.startsWith(node.path);
            }).length;
            return { name: node.name, path: node.path, children, unitCount: count };
        };
        
        const finalTree = finalizeTree(root).children;
        const uncategorizedCount = items.filter(i => {
            const itemPath = i.path ?? (i.tags || []).find(t => t.startsWith('/'));
            const hasPath = itemPath && itemPath !== '/';
            return !hasPath;
        }).length;

        if (uncategorizedCount > 0) {
            finalTree.unshift({ name: 'Uncategorized', path: 'Uncategorized', children: [], unitCount: uncategorizedCount });
        }
        
        return finalTree;
    }, [items, propTagTree]);

    const allSingleTags = useMemo(() => {
        if (!items) return [];
        const tagCounts = new Map<string, number>();
        items.forEach(item => {
            const singleTags = item.path !== undefined
                ? item.tags || []
                : (item.tags || []).filter(t => !t.startsWith('/'));
            
            singleTags.forEach(tag => {
                tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
            });
        });
        return Array.from(tagCounts.entries())
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [items]);
    
    // Filtered data based on search
    const filteredGroupTree = useMemo(() => {
        if (!searchQuery) return groupTree;
        const lowerQuery = searchQuery.toLowerCase();
        const filterNodes = (nodes: TagTreeNode[]): TagTreeNode[] => {
            return nodes.map(node => {
                const matchingChildren = filterNodes(node.children);
                if (node.name.toLowerCase().includes(lowerQuery) || matchingChildren.length > 0) {
                    return { ...node, children: matchingChildren };
                }
                return null;
            }).filter((n): n is TagTreeNode => n !== null);
        };
        return filterNodes(groupTree);
    }, [groupTree, searchQuery]);

    const filteredSingleTags = useMemo(() => {
        if (!searchQuery) return allSingleTags;
        const lowerQuery = searchQuery.toLowerCase();
        return allSingleTags.filter(tag => tag.name.toLowerCase().includes(lowerQuery));
    }, [allSingleTags, searchQuery]);

    const isSearchActive = searchQuery.length > 0;
    const canShowTagsView = !!items;

    const handleStartRename = (node: TagTreeNode) => {
        setEditingPath(node.path);
        setRenameValue(node.name);
    };

    const handleCancelRename = () => {
        setEditingPath(null);
        setRenameValue('');
    };

    const handleSubmitRename = async (node: TagTreeNode) => {
        const nextName = renameValue.trim();
        if (!onRenameGroup) return;
        if (!nextName || nextName === node.name) {
            handleCancelRename();
            return;
        }
        if (nextName.includes('/')) {
            window.alert('Group name cannot contain "/".');
            return;
        }

        setIsMutating(true);
        try {
            await onRenameGroup(node.path, nextName);
            handleCancelRename();
        } finally {
            setIsMutating(false);
        }
    };

    const handleConfirmDelete = async () => {
        if (!nodeToDelete || !onDeleteGroup) return;
        setIsMutating(true);
        try {
            await onDeleteGroup(nodeToDelete.path);
            setNodeToDelete(null);
            handleCancelRename();
        } finally {
            setIsMutating(false);
        }
    };

    return (
        <>
        <div className="bg-white p-4 rounded-2xl border border-neutral-200 shadow-sm animate-in fade-in slide-in-from-top-2 space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <h4 className="text-sm font-bold flex items-center gap-2 shrink-0">{icon} {title}</h4>
                {!forcedView && canShowTagsView && (
                    <div className="flex bg-neutral-100 p-1 rounded-xl w-full sm:w-auto">
                        <button onClick={() => setView('groups')} className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${view === 'groups' ? 'bg-white shadow-sm text-neutral-900' : 'text-neutral-500 hover:text-neutral-700'}`}><FolderTree size={12}/>Groups</button>
                        <button onClick={() => setView('tags')} className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${view === 'tags' ? 'bg-white shadow-sm text-neutral-900' : 'text-neutral-500 hover:text-neutral-700'}`}><Tag size={12}/>Tags</button>
                    </div>
                )}
                {selectedTag && <button onClick={() => onSelectTag(null)} className="text-xs font-bold text-indigo-600 hover:underline shrink-0">Clear Filter</button>}
            </div>
            <div className="relative w-full"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" /><input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search..." className="w-full pl-8 pr-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-xs font-bold focus:outline-none focus:ring-2 focus:ring-neutral-900" /></div>
            <div className="space-y-1 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                {view === 'groups' ? (
                    filteredGroupTree.length > 0 
                        ? filteredGroupTree.map(node => (
                            <TagNode
                                key={node.path}
                                node={node}
                                selectedTag={selectedTag}
                                onSelectTag={(p) => onSelectTag(p)}
                                level={0}
                                isSearchActive={isSearchActive}
                                editingPath={editingPath}
                                renameValue={renameValue}
                                setRenameValue={setRenameValue}
                                onStartRename={onRenameGroup ? handleStartRename : undefined}
                                onSubmitRename={onRenameGroup ? handleSubmitRename : undefined}
                                onCancelRename={handleCancelRename}
                                onDeleteGroup={onDeleteGroup ? setNodeToDelete : undefined}
                                isMutating={isMutating}
                            />
                        ))
                        : <p className="text-center text-xs text-neutral-400 p-4">No groups found.</p>
                ) : (
                    filteredSingleTags.length > 0
                        ? filteredSingleTags.map(tag => (
                            <div key={tag.name} onClick={() => onSelectTag(tag.name)} className={`flex items-center justify-between p-2 rounded-lg cursor-pointer ${selectedTag === tag.name ? 'bg-indigo-100' : 'hover:bg-neutral-100'}`}>
                                <span className={`font-bold text-sm ${selectedTag === tag.name ? 'text-indigo-800' : 'text-neutral-800'}`}>{tag.name}</span>
                                <span className={`text-xs font-black px-2 py-0.5 rounded-md ${selectedTag === tag.name ? 'bg-indigo-200 text-indigo-800' : 'bg-neutral-100 text-neutral-500'}`}>{tag.count}</span>
                            </div>
                        ))
                        : <p className="text-center text-xs text-neutral-400 p-4">No tags found.</p>
                )}
            </div>
        </div>
        <ConfirmationModal
            isOpen={!!nodeToDelete}
            title="Delete Group?"
            message={`Delete "${nodeToDelete?.name}" from the group tree? Vocabulary in child groups will be moved up one level.`}
            confirmText="DELETE GROUP"
            isProcessing={isMutating}
            onConfirm={handleConfirmDelete}
            onClose={() => setNodeToDelete(null)}
            confirmButtonClass="bg-red-600 text-white hover:bg-red-700 shadow-red-200"
            icon={<Trash2 size={40} className="text-red-500" />}
        />
        </>
    );
};
