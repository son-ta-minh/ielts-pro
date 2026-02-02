
import React from 'react';
import { ComparisonGroup, FocusColor } from '../../app/types';
import { ResourcePage } from '../page/ResourcePage';
import { Puzzle, Search, Plus, BookOpen, Edit3, Trash2, Target } from 'lucide-react';
import { ViewMenu } from '../../components/common/ViewMenu';
import { TagBrowser, TagTreeNode } from '../../components/common/TagBrowser';
import ConfirmationModal from '../../components/common/ConfirmationModal';
import { UniversalCard } from '../../components/common/UniversalCard';

interface Props {
    loading: boolean;
    filteredGroups: ComparisonGroup[];
    query: string;
    onQueryChange: (q: string) => void;
    activeFilters: Record<string, string>;
    viewSettings: { showDesc: boolean; showTags: boolean; compact: boolean; };
    setViewSettings: React.Dispatch<React.SetStateAction<{ showDesc: boolean; showTags: boolean; compact: boolean; }>>;
    isViewMenuOpen: boolean;
    setIsViewMenuOpen: (v: boolean) => void;
    
    focusFilter: 'all' | 'focused';
    setFocusFilter: (v: 'all' | 'focused') => void;
    colorFilter: 'all' | 'green' | 'yellow' | 'red';
    setColorFilter: (v: 'all' | 'green' | 'yellow' | 'red') => void;
    onFocusChange: (group: ComparisonGroup, color: FocusColor | null) => void;
    onToggleFocus: (group: ComparisonGroup) => void;

    isTagBrowserOpen: boolean;
    setIsTagBrowserOpen: (v: boolean) => void;
    tagTree: TagTreeNode[];
    selectedTag: string | null;
    setSelectedTag: (tag: string | null) => void;
    onNew: () => void;
    onRead: (group: ComparisonGroup) => void;
    onEdit: (group: ComparisonGroup) => void;
    onDeleteRequest: (group: ComparisonGroup) => void;
    groupToDelete: ComparisonGroup | null;
    onDeleteConfirm: () => void;
    onDeleteCancel: () => void;
}

export const ComparisonTemplateUI: React.FC<Props> = ({
    loading, filteredGroups, query, onQueryChange, activeFilters,
    viewSettings, setViewSettings, isViewMenuOpen, setIsViewMenuOpen,
    focusFilter, setFocusFilter, colorFilter, setColorFilter, onFocusChange, onToggleFocus,
    isTagBrowserOpen, setIsTagBrowserOpen, tagTree, selectedTag, setSelectedTag,
    onNew, onRead, onEdit, onDeleteRequest, groupToDelete, onDeleteConfirm, onDeleteCancel
}) => {
    return (
        <>
            <ResourcePage
                title="Comparison Library"
                subtitle="Analyze nuances between similar words."
                icon={<Puzzle size={28} className="text-purple-600" />}
                config={{}}
                query={query}
                onQueryChange={onQueryChange}
                activeFilters={activeFilters}
                onFilterChange={() => {}}
                isLoading={loading}
                isEmpty={filteredGroups.length === 0}
                emptyMessage={query ? "No matches found." : "No comparison groups created yet."}
                actions={
                    <>
                         <ViewMenu 
                            isOpen={isViewMenuOpen}
                            setIsOpen={setIsViewMenuOpen}
                            customSection={
                                <>
                                    <div className="px-3 py-2 text-[9px] font-black text-neutral-400 uppercase tracking-widest border-b border-neutral-50 flex items-center gap-2">
                                        <Target size={10}/> Focus & Status
                                    </div>
                                    <div className="p-1 flex flex-col gap-1 bg-neutral-100 rounded-xl mb-2">
                                        <button onClick={() => setFocusFilter(focusFilter === 'all' ? 'focused' : 'all')} className={`w-full py-1.5 text-[9px] font-black rounded-lg transition-all ${focusFilter === 'focused' ? 'bg-white shadow-sm text-red-600' : 'text-neutral-500 hover:text-neutral-700'}`}>
                                            {focusFilter === 'focused' ? 'Focused Only' : 'All Items'}
                                        </button>
                                        <div className="flex gap-1">
                                            <button onClick={() => setColorFilter(colorFilter === 'green' ? 'all' : 'green')} className={`flex-1 h-6 rounded-lg border-2 transition-all ${colorFilter === 'green' ? 'bg-emerald-500 border-emerald-600' : 'bg-white border-neutral-200 hover:bg-emerald-50'}`} />
                                            <button onClick={() => setColorFilter(colorFilter === 'yellow' ? 'all' : 'yellow')} className={`flex-1 h-6 rounded-lg border-2 transition-all ${colorFilter === 'yellow' ? 'bg-amber-400 border-amber-500' : 'bg-white border-neutral-200 hover:bg-amber-50'}`} />
                                            <button onClick={() => setColorFilter(colorFilter === 'red' ? 'all' : 'red')} className={`flex-1 h-6 rounded-lg border-2 transition-all ${colorFilter === 'red' ? 'bg-rose-500 border-rose-600' : 'bg-white border-neutral-200 hover:bg-rose-50'}`} />
                                        </div>
                                    </div>
                                </>
                            }
                            viewOptions={[
                                { label: 'Show Word List', checked: viewSettings.showDesc, onChange: () => setViewSettings(v => ({...v, showDesc: !v.showDesc})) },
                                { label: 'Show Tags', checked: viewSettings.showTags, onChange: () => setViewSettings(v => ({...v, showTags: !v.showTags})) },
                                { label: 'Compact', checked: viewSettings.compact, onChange: () => setViewSettings(v => ({...v, compact: !v.compact})) },
                            ]}
                        />
                        
                        <button onClick={() => setIsTagBrowserOpen(!isTagBrowserOpen)} className="px-4 py-3 bg-white border border-neutral-200 text-neutral-600 rounded-xl font-black text-xs flex items-center space-x-2 transition-all hover:bg-neutral-50 active:scale-95 uppercase tracking-widest shadow-sm">
                            <Search size={16} /><span>Browse</span>
                        </button>
                        <button onClick={onNew} className="px-6 py-3 bg-neutral-900 text-white rounded-xl font-black text-xs flex items-center space-x-2 transition-all hover:bg-neutral-800 active:scale-95 uppercase tracking-widest shadow-sm">
                            <Plus size={16} /><span>New Group</span>
                        </button>
                    </>
                }
                aboveGrid={isTagBrowserOpen && (
                    <TagBrowser tagTree={tagTree} selectedTag={selectedTag} onSelectTag={setSelectedTag} title="Filter by Tag" />
                )}
            >
                {() => (
                    <>
                        {filteredGroups.map(group => (
                            <UniversalCard
                                key={group.id}
                                title={group.name}
                                tags={group.tags}
                                compact={viewSettings.compact}
                                onClick={() => onRead(group)}
                                focusColor={group.focusColor}
                                onFocusChange={(c) => onFocusChange(group, c)}
                                isFocused={group.isFocused}
                                onToggleFocus={() => onToggleFocus(group)}
                                actions={
                                    <>
                                        <button onClick={(e) => { e.stopPropagation(); onRead(group); }} className="p-1.5 text-neutral-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Read"><BookOpen size={14}/></button>
                                        <button onClick={(e) => { e.stopPropagation(); onEdit(group); }} className="p-1.5 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors" title="Edit"><Edit3 size={14}/></button>
                                        <button onClick={(e) => { e.stopPropagation(); onDeleteRequest(group); }} className="p-1.5 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors" title="Delete"><Trash2 size={14}/></button>
                                    </>
                                }
                            >
                                {viewSettings.showDesc && (
                                    <div className="flex flex-wrap gap-1.5 mt-1">
                                        {group.words.slice(0, 4).map(w => <span key={w} className="px-2 py-0.5 bg-neutral-100 text-neutral-600 rounded text-[10px] font-bold border border-neutral-200">{w}</span>)}
                                        {group.words.length > 4 && <span className="text-[10px] text-neutral-400 font-bold">+{group.words.length - 4}</span>}
                                    </div>
                                )}
                            </UniversalCard>
                        ))}
                    </>
                )}
            </ResourcePage>
            
            <ConfirmationModal
                isOpen={!!groupToDelete}
                title="Delete Group?"
                message={<>Are you sure you want to delete <strong>"{groupToDelete?.name}"</strong>?</>}
                confirmText="Yes, Delete"
                isProcessing={false}
                onConfirm={onDeleteConfirm}
                onClose={onDeleteCancel}
                icon={<Trash2 size={40} className="text-red-500"/>}
            />
        </>
    );
};
