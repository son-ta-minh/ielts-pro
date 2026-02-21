
import React, { useState, useEffect, useMemo } from 'react';
import { User, NativeSpeakItem, VocabularyItem, FocusColor, ConversationItem, FreeTalkItem, AppView } from '../../app/types';
import * as db from '../../app/db';
import * as dataStore from '../../app/dataStore';
import { ResourcePage } from '../page/ResourcePage';
import { Mic, Plus, Edit3, Trash2, AudioLines, Sparkles, MessageSquare, Play, Target, FolderPlus, Pen, Move, ArrowLeft, MessageCircle, Tag, Shuffle } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import { TagBrowser } from '../../components/common/TagBrowser';
import ConfirmationModal from '../../components/common/ConfirmationModal';
import UniversalAiModal from '../../components/common/UniversalAiModal';
import { getGenerateConversationPrompt } from '../../services/promptService';
import { ViewMenu } from '../../components/common/ViewMenu';
import { getStoredJSON, setStoredJSON } from '../../utils/storage';
import { UniversalCard } from '../../components/common/UniversalCard';
import { ResourceActions } from '../page/ResourceActions';
import { UniversalBook } from '../../components/common/UniversalBook';
import { UniversalShelf } from '../../components/common/UniversalShelf';
import { SimpleMimicModal } from '../../components/common/SimpleMimicModal';

// Import extracted components
import { AddEditNativeSpeakModal } from '../../components/speaking/AddEditNativeSpeakModal';
import { AddEditConversationModal } from '../../components/speaking/AddEditConversationModal';
import { AddEditFreeTalkModal } from '../../components/speaking/AddEditFreeTalkModal';
import { SpeakingPracticeModal } from '../../components/speaking/SpeakingPracticeModal';
import { ConversationPracticeModal } from '../../components/speaking/ConversationPracticeModal';
import { FreeTalkPracticeModal } from '../../components/speaking/FreeTalkPracticeModal';

const VIEW_SETTINGS_KEY = 'vocab_pro_speaking_card_view';

interface Props {
  user: User;
  onNavigate?: (view: AppView) => void;
}

type SpeakingItem = 
  | { type: 'card'; data: NativeSpeakItem }
  | { type: 'conversation'; data: ConversationItem }
  | { type: 'free_talk'; data: FreeTalkItem };

const ScoreBadge: React.FC<{ score?: number }> = ({ score }) => {
    if (score === undefined) return null;
    return (
        <span className={`text-[10px] font-black px-1.5 py-0.5 rounded border ${score >= 80 ? 'bg-green-50 text-green-700 border-green-200' : score >= 50 ? 'bg-yellow-50 text-yellow-700 border-yellow-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
            {score}%
        </span>
    );
};

export const SpeakingCardPage: React.FC<Props> = ({ user, onNavigate }) => {
  const [items, setItems] = useState<SpeakingItem[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);
  const [viewSettings, setViewSettings] = useState(() => getStoredJSON(VIEW_SETTINGS_KEY, { showTags: true, compact: false, resourceType: 'ALL' }));
  const handleSettingChange = (key: string, value: any) => setViewSettings(prev => ({ ...prev, [key]: value }));
  
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(12);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [isTagBrowserOpen, setIsTagBrowserOpen] = useState(false);
  const [focusFilter, setFocusFilter] = useState<'all' | 'focused'>('all');
  const [colorFilter, setColorFilter] = useState<'all' | 'green' | 'yellow' | 'red'>('all');
  
  // Edit Modals State
  const [isModalOpen, setIsModalOpen] = useState(false); // Native Speak
  const [isConversationModalOpen, setIsConversationModalOpen] = useState(false);
  const [isFreeTalkModalOpen, setIsFreeTalkModalOpen] = useState(false);

  const [editingItem, setEditingItem] = useState<NativeSpeakItem | null>(null);
  const [editingConversation, setEditingConversation] = useState<ConversationItem | null>(null);
  const [editingFreeTalk, setEditingFreeTalk] = useState<FreeTalkItem | null>(null);

  const [itemToDelete, setItemToDelete] = useState<{ id: string, type: 'card' | 'conversation' | 'free_talk' } | null>(null);
  
  // AI Modals
  const [isConversationAiModalOpen, setIsConversationAiModalOpen] = useState(false);
  
  // Practice Modals State
  const [practiceModalItem, setPracticeModalItem] = useState<NativeSpeakItem | null>(null);
  const [practiceConversation, setPracticeConversation] = useState<ConversationItem | null>(null);
  const [practiceFreeTalk, setPracticeFreeTalk] = useState<FreeTalkItem | null>(null);

  const { showToast } = useToast();
  
  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    const [cards, conversations, freeTalks] = await Promise.all([ 
        db.getNativeSpeakItemsByUserId(user.id), 
        db.getConversationItemsByUserId(user.id),
        db.getFreeTalkItemsByUserId(user.id)
    ]);
    const combined: SpeakingItem[] = [ 
        ...cards.map(c => ({ type: 'card' as const, data: c })), 
        ...conversations.map(c => ({ type: 'conversation' as const, data: c })),
        ...freeTalks.map(c => ({ type: 'free_talk' as const, data: c }))
    ];
    setItems(combined.sort((a, b) => b.data.createdAt - a.data.createdAt));
    if (!silent) setLoading(false);
  };

  useEffect(() => { loadData(); }, [user.id]);
  useEffect(() => { setPage(0); }, [selectedTag, pageSize, focusFilter, colorFilter, viewSettings.resourceType, searchQuery]);
  useEffect(() => { setStoredJSON(VIEW_SETTINGS_KEY, viewSettings); }, [viewSettings]);

  const hasActiveFilters = useMemo(() => {
    return viewSettings.resourceType !== 'ALL' || focusFilter !== 'all' || colorFilter !== 'all';
  }, [viewSettings.resourceType, focusFilter, colorFilter]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return items.filter(item => {
      // Search
      if (q) {
          if (item.type === 'card') {
              if (!item.data.standard.toLowerCase().includes(q)) return false;
          } else if (item.type === 'conversation') {
               if (!item.data.title.toLowerCase().includes(q) && !(item.data.description || '').toLowerCase().includes(q)) return false;
          } else {
               if (!item.data.title.toLowerCase().includes(q) && !item.data.content.toLowerCase().includes(q)) return false;
          }
      }

      if (viewSettings.resourceType !== 'ALL' && item.type.toUpperCase() !== viewSettings.resourceType) return false;
      if (focusFilter === 'focused' && !item.data.isFocused) return false;
      if (colorFilter !== 'all' && item.data.focusColor !== colorFilter) return false;
      if (selectedTag) {
          if (selectedTag === 'Uncategorized') { if (item.data.path && item.data.path !== '/') return false; } 
          else { if (!item.data.path?.startsWith(selectedTag) && !item.data.tags?.includes(selectedTag)) return false; }
      }
      return true;
    });
  }, [items, selectedTag, focusFilter, colorFilter, viewSettings.resourceType, searchQuery]);
  
  const pagedItems = useMemo(() => {
      const start = page * pageSize;
      return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, page, pageSize]);

  // --- Handlers ---

  const handleSaveItem = async (data: any) => {
    const now = Date.now();
    if (editingItem && editingItem.id) { 
        await dataStore.saveNativeSpeakItem({ ...editingItem, ...data, updatedAt: now }); 
    } else { 
        await dataStore.saveNativeSpeakItem({ id: `ns-${now}-${Math.random()}`, userId: user.id, createdAt: now, updatedAt: now, ...data }); 
    }
    setIsModalOpen(false); loadData(); showToast("Saved!", "success");
  };

  const handleSaveConversation = async (formData: Partial<ConversationItem>) => {
    const now = Date.now();
    if (editingConversation && editingConversation.id) { 
        await dataStore.saveConversationItem({ ...editingConversation, ...formData, updatedAt: now } as ConversationItem); 
    } else { 
        await dataStore.saveConversationItem({ id: `conv-${now}-${Math.random()}`, userId: user.id, createdAt: now, updatedAt: now, title: formData.title || '', description: formData.description || '', speakers: formData.speakers || [], sentences: formData.sentences || [], tags: formData.tags || [] } as ConversationItem); 
    }
    setIsConversationModalOpen(false); loadData(); showToast("Saved!", "success");
  };

  const handleSaveFreeTalk = async (data: { title: string, content: string, tags: string[] }) => {
    const now = Date.now();
    if (editingFreeTalk && editingFreeTalk.id) {
        await dataStore.saveFreeTalkItem({ ...editingFreeTalk, ...data, updatedAt: now });
    } else {
        await dataStore.saveFreeTalkItem({ id: `ft-${now}-${Math.random()}`, userId: user.id, createdAt: now, updatedAt: now, ...data });
    }
    setIsFreeTalkModalOpen(false); loadData(); showToast("Essay Saved!", "success");
  };

  const handleEditItem = (item: SpeakingItem) => {
    if (item.type === 'card') { setEditingItem(item.data as NativeSpeakItem); setIsModalOpen(true); } 
    else if (item.type === 'conversation') { setEditingConversation(item.data as ConversationItem); setIsConversationModalOpen(true); }
    else if (item.type === 'free_talk') { setEditingFreeTalk(item.data as FreeTalkItem); setIsFreeTalkModalOpen(true); }
  };

  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;
    if (itemToDelete.type === 'card') await dataStore.deleteNativeSpeakItem(itemToDelete.id);
    else if (itemToDelete.type === 'conversation') await dataStore.deleteConversationItem(itemToDelete.id);
    else if (itemToDelete.type === 'free_talk') await dataStore.deleteFreeTalkItem(itemToDelete.id);

    setItemToDelete(null); loadData(); showToast("Deleted!", "success");
  };

  const handleFocusChange = async (item: SpeakingItem, color: FocusColor | null) => {
      const updated = { ...item.data, focusColor: color || undefined, updatedAt: Date.now() };
      if (!color) delete (updated as any).focusColor;
      
      if (item.type === 'card') await dataStore.saveNativeSpeakItem(updated as NativeSpeakItem);
      else if (item.type === 'conversation') await dataStore.saveConversationItem(updated as ConversationItem);
      else if (item.type === 'free_talk') await dataStore.saveFreeTalkItem(updated as FreeTalkItem);
      
      loadData();
  };
  
  const handleToggleFocus = async (item: SpeakingItem) => {
      const updated = { ...item.data, isFocused: !item.data.isFocused, updatedAt: Date.now() };
      
      if (item.type === 'card') await dataStore.saveNativeSpeakItem(updated as NativeSpeakItem);
      else if (item.type === 'conversation') await dataStore.saveConversationItem(updated as ConversationItem);
      else if (item.type === 'free_talk') await dataStore.saveFreeTalkItem(updated as FreeTalkItem);
      
      loadData();
  };

  const handleConversationAiResult = (data: any) => {
      setEditingConversation(prev => ({ ...prev || {}, title: data.title, description: data.description, speakers: data.speakers, sentences: data.sentences, tags: data.tags } as ConversationItem));
      setIsConversationAiModalOpen(false); showToast("Conversation generated!", "success");
  };

  const handleRandomize = () => {
    setItems(prev => [...prev].sort(() => Math.random() - 0.5));
    showToast("Deck shuffled!", "success");
  };

  return (
    <>
    <ResourcePage title="Listen & Speak" subtitle="Master listening comprehension and speaking skills." icon={<img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Microphone.png" className="w-8 h-8 object-contain" alt="Speaking" />} 
    query={searchQuery}
    onQueryChange={setSearchQuery}
    searchPlaceholder="Search phrases, conversations..."
    config={{}} isLoading={loading} isEmpty={filteredItems.length === 0} emptyMessage="No items found." activeFilters={{}} onFilterChange={() => {}} pagination={{ page, totalPages: Math.ceil(filteredItems.length / pageSize), onPageChange: setPage, pageSize, onPageSizeChange: setPageSize, totalItems: filteredItems.length }} aboveGrid={<>{isTagBrowserOpen && <TagBrowser items={items.map(i => i.data)} selectedTag={selectedTag} onSelectTag={setSelectedTag} forcedView="tags" title="Browse Tags" icon={<Tag size={16}/>} />}</>} actions={<ResourceActions viewMenu={<ViewMenu isOpen={isViewMenuOpen} setIsOpen={setIsViewMenuOpen} hasActiveFilters={hasActiveFilters} filterOptions={[{ label: 'All', value: 'ALL', isActive: viewSettings.resourceType === 'ALL', onClick: () => handleSettingChange('resourceType', 'ALL') }, { label: 'Card', value: 'CARD', isActive: viewSettings.resourceType === 'CARD', onClick: () => handleSettingChange('resourceType', 'CARD') }, { label: 'Conv.', value: 'CONVERSATION', isActive: viewSettings.resourceType === 'CONVERSATION', onClick: () => handleSettingChange('resourceType', 'CONVERSATION') }, { label: 'Essay', value: 'FREE_TALK', isActive: viewSettings.resourceType === 'FREE_TALK', onClick: () => handleSettingChange('resourceType', 'FREE_TALK') }]} customSection={<><div className="px-3 py-2 text-[9px] font-black text-neutral-400 uppercase tracking-widest border-b border-neutral-50 flex items-center gap-2"><Target size={10}/> Focus & Status</div><div className="p-1 flex flex-col gap-1 bg-neutral-100 rounded-xl mb-2"><button onClick={() => setFocusFilter(focusFilter === 'all' ? 'focused' : 'all')} className={`w-full py-1.5 text-[9px] font-black rounded-lg transition-all ${focusFilter === 'focused' ? 'bg-white shadow-sm text-red-600' : 'text-neutral-500 hover:text-neutral-700'}`}>{focusFilter === 'focused' ? 'Focused Only' : 'All Items'}</button><div className="flex gap-1"><button onClick={() => setColorFilter(colorFilter === 'green' ? 'all' : 'green')} className={`flex-1 h-6 rounded-lg border-2 transition-all ${colorFilter === 'green' ? 'bg-emerald-500 border-emerald-600' : 'bg-white border-neutral-200 hover:bg-emerald-50'}`} /><button onClick={() => setColorFilter(colorFilter === 'yellow' ? 'all' : 'yellow')} className={`flex-1 h-6 rounded-lg border-2 transition-all ${colorFilter === 'yellow' ? 'bg-amber-400 border-amber-500' : 'bg-white border-neutral-200 hover:bg-amber-50'}`} /><button onClick={() => setColorFilter(colorFilter === 'red' ? 'all' : 'red')} className={`flex-1 h-6 rounded-lg border-2 transition-all ${colorFilter === 'red' ? 'bg-rose-500 border-rose-600' : 'bg-white border-neutral-200 hover:bg-rose-50'}`} /></div></div></>} viewOptions={[{ label: 'Show Tags', checked: viewSettings.showTags, onChange: () => setViewSettings(v => ({...v, showTags: !v.showTags})) }, { label: 'Compact', checked: viewSettings.compact, onChange: () => setViewSettings(v => ({...v, compact: !v.compact})) }]} />} browseTags={{ isOpen: isTagBrowserOpen, onToggle: () => { setIsTagBrowserOpen(!isTagBrowserOpen); } }} addActions={[{ label: 'New Native Expression', icon: Plus, onClick: () => { setEditingItem(null); setIsModalOpen(true); } }, { label: 'New Conversation', icon: MessageSquare, onClick: () => { setEditingConversation(null); setIsConversationModalOpen(true); } }, { label: 'New Essay', icon: Pen, onClick: () => { setEditingFreeTalk(null); setIsFreeTalkModalOpen(true); } }]} extraActions={<><button onClick={handleRandomize} disabled={items.length < 2} className="p-3 bg-white border border-neutral-200 text-neutral-600 rounded-xl hover:bg-neutral-50 active:scale-95 transition-all shadow-sm disabled:opacity-50" title="Randomize"><Shuffle size={16} /></button></>} />}>
      {() => (
        <>
          {(pagedItems as SpeakingItem[]).map((item) => {
              if (item.type === 'card') {
                 return (
                    <UniversalCard
                        key={item.data.id}
                        title={<div className="flex items-center gap-2 font-black text-neutral-900">{(item.data as NativeSpeakItem).standard}</div>}
                        badge={{ label: 'Native Expression', colorClass: 'bg-teal-50 text-teal-700 border-teal-100', icon: AudioLines }}
                        tags={viewSettings.showTags ? item.data.tags : undefined}
                        compact={viewSettings.compact}
                        onClick={() => setPracticeModalItem(item.data as NativeSpeakItem)}
                        focusColor={item.data.focusColor}
                        onFocusChange={(c) => handleFocusChange(item, c)}
                        isFocused={item.data.isFocused}
                        onToggleFocus={handleToggleFocus.bind(null, item)}
                        isCompleted={item.data.focusColor === 'green'}
                        actions={
                            <div className="flex items-center gap-1">
                                <button onClick={(e) => { e.stopPropagation(); handleEditItem(item); }} className="p-1.5 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors"><Edit3 size={14}/></button>
                                <button onClick={(e) => { e.stopPropagation(); setItemToDelete({ id: item.data.id, type: 'card' }); }} className="p-1.5 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"><Trash2 size={14}/></button>
                            </div>
                        }
                    >
                        <div className="flex justify-between items-center mt-2">
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">{(item.data as NativeSpeakItem).answers.length} variations</span>
                                <ScoreBadge score={(item.data as NativeSpeakItem).bestScore} />
                            </div>
                        </div>
                    </UniversalCard>
                 );
              } else if (item.type === 'conversation') {
                  return (
                    <UniversalCard 
                        key={item.data.id} 
                        title={(item.data as ConversationItem).title} 
                        badge={{ label: 'Conversation', colorClass: 'bg-indigo-50 text-indigo-700 border-indigo-100', icon: MessageSquare }} 
                        tags={viewSettings.showTags ? item.data.tags : undefined} 
                        compact={viewSettings.compact} 
                        onClick={() => setPracticeConversation(item.data as ConversationItem)} 
                        focusColor={item.data.focusColor} 
                        onFocusChange={(c) => handleFocusChange(item, c)} 
                        isFocused={item.data.isFocused} 
                        onToggleFocus={handleToggleFocus.bind(null, item)} 
                        actions={<><button onClick={(e) => { e.stopPropagation(); handleEditItem(item); }} className="p-1.5 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors" title="Edit"><Edit3 size={14}/></button><button onClick={(e) => { e.stopPropagation(); setItemToDelete({ id: item.data.id, type: 'conversation' }); }} className="p-1.5 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors" title="Delete"><Trash2 size={14}/></button></>} 
                    >
                        <div className="flex justify-between items-center mt-2">
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">{(item.data as ConversationItem).sentences.length} lines</span>
                                <ScoreBadge score={(item.data as ConversationItem).bestScore} />
                            </div>
                        </div>
                    </UniversalCard>
                  );
              } else {
                  // Calculate metadata for display
                  const sentenceCount = (item.data as FreeTalkItem).content.match(/[^.!?]+[.!?]+["']?|[^.!?]+$/g)?.length || 0;
                  const bestScore = (item.data as FreeTalkItem).bestScore;
                  
                  return (
                    <UniversalCard 
                        key={item.data.id} 
                        title={(item.data as FreeTalkItem).title} 
                        badge={{ label: 'Essay', colorClass: 'bg-cyan-50 text-cyan-700 border-cyan-100', icon: Pen }} 
                        tags={viewSettings.showTags ? item.data.tags : undefined} 
                        compact={viewSettings.compact} 
                        onClick={() => setPracticeFreeTalk(item.data as FreeTalkItem)} 
                        focusColor={item.data.focusColor} 
                        onFocusChange={(c) => handleFocusChange(item, c)} 
                        isFocused={item.data.isFocused} 
                        onToggleFocus={handleToggleFocus.bind(null, item)} 
                        actions={<><button onClick={(e) => { e.stopPropagation(); handleEditItem(item); }} className="p-1.5 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors" title="Edit"><Edit3 size={14}/></button><button onClick={(e) => { e.stopPropagation(); setItemToDelete({ id: item.data.id, type: 'free_talk' }); }} className="p-1.5 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors" title="Delete"><Trash2 size={14}/></button></>} 
                    >
                        <div className="flex justify-between items-center mt-2">
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">{sentenceCount} Sentences</span>
                                <ScoreBadge score={bestScore} />
                            </div>
                        </div>
                    </UniversalCard>
                  );
              }
          })}
        </>
      )}
    </ResourcePage>
    
    <AddEditNativeSpeakModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSave={handleSaveItem} initialData={editingItem} />
    <AddEditConversationModal isOpen={isConversationModalOpen} onClose={() => setIsConversationModalOpen(false)} onSave={handleSaveConversation} initialData={editingConversation} onOpenAiGen={() => setIsConversationAiModalOpen(true)} />
    <AddEditFreeTalkModal isOpen={isFreeTalkModalOpen} onClose={() => setIsFreeTalkModalOpen(false)} onSave={handleSaveFreeTalk} initialData={editingFreeTalk} />

    <ConfirmationModal isOpen={!!itemToDelete} title="Delete Item?" message="This action cannot be undone." confirmText="Delete" isProcessing={false} onConfirm={handleConfirmDelete} onClose={() => setItemToDelete(null)} icon={<Trash2 size={40} className="text-red-500"/>} />
    
    {isConversationAiModalOpen && <UniversalAiModal isOpen={isConversationAiModalOpen} onClose={() => setIsConversationAiModalOpen(false)} type="GENERATE_UNIT" title="AI Conversation Creator" description="Enter a topic to generate a dialogue." initialData={{}} onGeneratePrompt={(i) => getGenerateConversationPrompt(i.request)} onJsonReceived={handleConversationAiResult} actionLabel="Generate" closeOnSuccess={true} />}
    
    <SpeakingPracticeModal isOpen={!!practiceModalItem} onClose={() => { setPracticeModalItem(null); loadData(true); }} item={practiceModalItem} />
    <ConversationPracticeModal isOpen={!!practiceConversation} onClose={() => { setPracticeConversation(null); loadData(true); }} item={practiceConversation} />
    <FreeTalkPracticeModal isOpen={!!practiceFreeTalk} onClose={() => { setPracticeFreeTalk(null); loadData(true); }} item={practiceFreeTalk} />
    </>
  );
};

export default SpeakingCardPage;
