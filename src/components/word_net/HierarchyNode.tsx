
import React, { useState } from 'react';
import { Plus, Minus, Eye, GitBranch, BookOpen } from 'lucide-react';
import { TreeNode } from './WordNet';
import { VocabularyItem } from '../../app/types';

interface Props {
    node: TreeNode;
    onViewWordClick: (word: VocabularyItem) => void;
    initiallyExpanded?: boolean;
}

export const HierarchyNode: React.FC<Props> = ({ node, onViewWordClick, initiallyExpanded = false }) => {
    const [isExpanded, setIsExpanded] = useState(initiallyExpanded || false);
    
    const hasChildGroups = node.children && node.children.length > 0;
    const hasChildWords = node.words && node.words.length > 0;
    const hasChildren = hasChildGroups || hasChildWords;

    const handleToggle = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (hasChildren) setIsExpanded(!isExpanded);
    };
    
    const handleViewWord = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (node.wordLink) onViewWordClick(node.wordLink);
    };

    const allChildren = [
        ...(node.words || []).map(w => ({ type: 'word' as const, data: w })),
        ...(node.children || []).map(g => ({ type: 'group' as const, data: g }))
    ];

    return (
        <div className="flex items-start">
            {/* The Group Node Box */}
            <div className={`z-10 flex-shrink-0 flex items-center gap-2 py-2 px-3 rounded-xl border-2 shadow-sm transition-colors ${node.isPath ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-neutral-200'}`}>
                <button 
                    onClick={handleToggle} 
                    disabled={!hasChildren}
                    className="p-1 rounded-md text-neutral-400 disabled:text-neutral-200 enabled:hover:bg-neutral-100 enabled:hover:text-neutral-800 transition-colors"
                >
                    {hasChildren ? (isExpanded ? <Minus size={14} /> : <Plus size={14} />) : (node.isRoot ? <GitBranch size={14} /> : <div className="w-3.5 h-3.5"/>)}
                </button>
                
                <span className={`font-bold text-sm truncate max-w-[200px] ${node.isPath ? 'text-indigo-800' : 'text-neutral-800'}`}>{node.name}</span>
                
                {node.wordLink && (
                    <button onClick={handleViewWord} title={`View details for "${node.wordLink.word}"`} className="p-1.5 rounded-md text-neutral-400 hover:bg-neutral-200 hover:text-neutral-900 transition-colors">
                        <Eye size={14} />
                    </button>
                )}
            </div>

            {/* Children Area */}
            {isExpanded && hasChildren && (
                <div className="flex flex-col pt-2 pl-8">
                    {allChildren.map((child, index) => {
                        const isLastItem = index === allChildren.length - 1;
                        const key = child.type === 'word' ? child.data.id : child.data.id;
                        
                        return (
                            <div key={key} className="relative pb-4">
                                {/* Horizontal connector line */}
                                <div className="absolute top-[1.125rem] -left-8 w-8 h-px bg-neutral-200"></div>
                                {/* Vertical connector line */}
                                <div className="absolute top-0 bottom-0 -left-8 w-px bg-neutral-200"></div>
                                {/* Mask for the last child's vertical line */}
                                {isLastItem && <div className="absolute top-[1.125rem] bottom-0 -left-8 w-px bg-white"></div>}
                                
                                {child.type === 'word' ? (
                                    <div className="flex-shrink-0 flex items-center gap-2 py-2">
                                        <BookOpen size={14} className="text-neutral-400 flex-shrink-0"/>
                                        <button 
                                            onClick={() => onViewWordClick(child.data)}
                                            className="font-medium text-sm text-neutral-600 hover:text-neutral-900 hover:underline text-left truncate max-w-[200px]"
                                            title={child.data.word}
                                        >
                                            {child.data.word}
                                        </button>
                                    </div>
                                ) : (
                                    <HierarchyNode 
                                        node={child.data} 
                                        onViewWordClick={onViewWordClick}
                                        initiallyExpanded={child.data.isPath}
                                    />
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
