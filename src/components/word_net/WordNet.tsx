
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Network, Search, Loader2, ArrowLeft, Eye } from 'lucide-react';
import * as dataStore from '../../app/dataStore';
import { VocabularyItem } from '../../app/types';
import { HierarchyNode } from './HierarchyNode';
import ViewWordModal from '../word_lib/ViewWordModal';

interface Props {
    userId: string;
}

export interface TreeNode {
    id: string;
    name: string;
    children: TreeNode[];
    words: VocabularyItem[];
    wordLink?: VocabularyItem;
    isRoot?: boolean;
    isPath?: boolean; // Is this node on the direct path to the selected item?
}

const WordNet: React.FC<Props> = ({ userId }) => {
    const [allWords, setAllWords] = useState<VocabularyItem[]>([]);
    const [allGroups, setAllGroups] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    
    const [selectedItem, setSelectedItem] = useState<{ type: 'word' | 'group', name: string } | null>(null);
    const [hierarchy, setHierarchy] = useState<TreeNode[]>([]);
    const [viewingWord, setViewingWord] = useState<VocabularyItem | null>(null);

    const [groupQuery, setGroupQuery] = useState('');
    const [wordQuery, setWordQuery] = useState('');

    useEffect(() => {
        const words = dataStore.getAllWords().filter(w => w.userId === userId);
        const groups = [...new Set(words.flatMap(w => w.groups || []))].sort();
        setAllWords(words);
        setAllGroups(groups);
        setIsLoading(false);
    }, [userId]);

    const { parentToChildMap, childToParentMap, groupToWordLinkMap, groupToWordsMap } = useMemo(() => {
        const parentToChildMap = new Map<string, Set<string>>();
        const childToParentMap = new Map<string, Set<string>>();
        const groupToWordLinkMap = new Map<string, VocabularyItem>();
        const groupToWordsMap = new Map<string, VocabularyItem[]>();
        const wordsByLowerCase = new Map<string, VocabularyItem>();
        
        allWords.forEach(w => {
            wordsByLowerCase.set(w.word.toLowerCase(), w);
            if (w.groups) {
                w.groups.forEach(group => {
                    if (!groupToWordsMap.has(group)) groupToWordsMap.set(group, []);
                    groupToWordsMap.get(group)!.push(w);
                });
            }
        });

        allGroups.forEach(groupName => {
            const potentialWordLink = wordsByLowerCase.get(groupName.toLowerCase());
            if (potentialWordLink) {
                groupToWordLinkMap.set(groupName, potentialWordLink);
                if (potentialWordLink.groups) {
                    potentialWordLink.groups.forEach(parentGroup => {
                        if (!parentToChildMap.has(parentGroup)) parentToChildMap.set(parentGroup, new Set());
                        parentToChildMap.get(parentGroup)!.add(groupName);

                        if (!childToParentMap.has(groupName)) childToParentMap.set(groupName, new Set());
                        childToParentMap.get(groupName)!.add(parentGroup);
                    });
                }
            }
        });
        return { parentToChildMap, childToParentMap, groupToWordLinkMap, groupToWordsMap };
    }, [allWords, allGroups]);
    
    const buildHierarchy = useCallback((startNodeName: string) => {
        const roots: string[] = [];
        const visited = new Set<string>();
        const queue = [startNodeName];

        while (queue.length > 0) {
            const current = queue.shift()!;
            if (visited.has(current)) continue;
            visited.add(current);

            const parents = childToParentMap.get(current);
            if (!parents || parents.size === 0) {
                roots.push(current);
            } else {
                parents.forEach(p => queue.push(p));
            }
        }
        
        const pathNodes = new Set<string>();
        const buildPath = (node: string) => {
            pathNodes.add(node);
            const parents = childToParentMap.get(node);
            if(parents) parents.forEach(p => buildPath(p));
        };
        buildPath(startNodeName);

        const buildSubTree = (groupName: string, isRoot: boolean): TreeNode => {
            const childGroups = Array.from(parentToChildMap.get(groupName) || []).sort();
            const wordsForGroup = groupToWordsMap.get(groupName) || [];
            const childWords = wordsForGroup
                .filter(w => !groupToWordLinkMap.has(w.word)) // Exclude words that are also groups
                .sort((a, b) => a.word.localeCompare(b.word));

            return {
                id: groupName,
                name: groupName,
                children: childGroups.map((child: string) => buildSubTree(child, false)),
                words: childWords,
                wordLink: groupToWordLinkMap.get(groupName),
                isRoot,
                isPath: pathNodes.has(groupName)
            };
        };


        const finalRoots = [...new Set(roots)].sort();
        setHierarchy(finalRoots.map(root => buildSubTree(root, true)));

    }, [childToParentMap, parentToChildMap, groupToWordLinkMap, groupToWordsMap]);


    useEffect(() => {
        if (!selectedItem) return;

        if (selectedItem.type === 'group') {
            buildHierarchy(selectedItem.name);
        } else { // type === 'word'
            const word = allWords.find(w => w.word === selectedItem.name);
            if (word?.groups && word.groups.length > 0) {
                // For simplicity, we start the hierarchy from its first group
                buildHierarchy(word.groups[0]);
            } else {
                // If the word has no group, show an empty hierarchy
                setHierarchy([]);
            }
        }
    }, [selectedItem, allWords, buildHierarchy]);

    const handleSelect = (type: 'word' | 'group', name: string) => {
        setSelectedItem({ type, name });
    };

    const handleBack = () => {
        setSelectedItem(null);
        setHierarchy([]);
        setGroupQuery('');
        setWordQuery('');
    };

    if (isLoading) {
        return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-neutral-300" size={32} /></div>;
    }
    
    if (!selectedItem) {
        const filteredGroups = allGroups.filter(g => g.toLowerCase().includes(groupQuery.toLowerCase()));
        const filteredWords = allWords.filter(w => w.word.toLowerCase().includes(wordQuery.toLowerCase()));

        return (
            <div className="space-y-8 animate-in fade-in duration-500">
                <header>
                    <h2 className="text-3xl font-black text-neutral-900 tracking-tight flex items-center gap-3"><Network size={28}/> Word Net</h2>
                    <p className="text-neutral-500 mt-2 font-medium">Explore the connections between your vocabulary groups.</p>
                </header>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="bg-white p-6 rounded-[2rem] border border-neutral-200 shadow-sm space-y-4">
                        <h3 className="font-bold">Select a Group</h3>
                        <div className="relative"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"/><input value={groupQuery} onChange={e => setGroupQuery(e.target.value)} placeholder="Search groups..." className="w-full pl-9 pr-4 py-2 bg-neutral-50 border border-neutral-200 rounded-lg"/></div>
                        <div className="max-h-64 overflow-y-auto space-y-1 pr-2 -mr-2">{filteredGroups.map(group => <button key={group} onClick={() => handleSelect('group', group)} className="w-full text-left p-3 rounded-lg hover:bg-neutral-100 font-medium text-sm">{group}</button>)}</div>
                    </div>
                    <div className="bg-white p-6 rounded-[2rem] border border-neutral-200 shadow-sm space-y-4">
                        <h3 className="font-bold">Or Select a Word</h3>
                        <div className="relative"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"/><input value={wordQuery} onChange={e => setWordQuery(e.target.value)} placeholder="Search words..." className="w-full pl-9 pr-4 py-2 bg-neutral-50 border border-neutral-200 rounded-lg"/></div>
                        <div className="max-h-64 overflow-y-auto space-y-1 pr-2 -mr-2">{filteredWords.map(word => <button key={word.id} onClick={() => handleSelect('word', word.word)} className="w-full text-left p-3 rounded-lg hover:bg-neutral-100 font-medium text-sm">{word.word}</button>)}</div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <header>
                <button onClick={handleBack} className="flex items-center gap-2 text-sm font-bold text-neutral-500 hover:text-neutral-900 mb-2"><ArrowLeft size={16}/> Back to Selection</button>
                <h2 className="text-3xl font-black text-neutral-900 tracking-tight flex items-center gap-3"><Network size={28}/> Word Net</h2>
                <p className="text-neutral-500 mt-2 font-medium">Showing hierarchy for: <strong className="text-neutral-900">{selectedItem.name}</strong></p>
            </header>
            <div className="bg-white p-6 rounded-[2rem] border border-neutral-200 shadow-sm overflow-x-auto">
                <div className="inline-flex flex-col gap-6 p-4">
                    {hierarchy.length === 0 && <p className="text-center text-neutral-400 italic p-8 min-w-[300px]">No hierarchy found for this item.</p>}
                    {hierarchy.map(rootNode => (
                        <HierarchyNode 
                            key={rootNode.id} 
                            node={rootNode} 
                            onViewWordClick={setViewingWord} 
                            initiallyExpanded={rootNode.isPath || rootNode.isRoot} 
                        />
                    ))}
                </div>
            </div>
            {viewingWord && (
                <ViewWordModal 
                    word={viewingWord} 
                    onClose={() => setViewingWord(null)} 
                    onNavigateToWord={setViewingWord}
                    onEditRequest={() => {}} 
                    onGainXp={async() => 0} 
                    onUpdate={() => {}} 
                    isViewOnly={true} 
                />
            )}
        </div>
    );
};

export default WordNet;
