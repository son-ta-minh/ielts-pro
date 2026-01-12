
import React, { useState } from 'react';
import { User, AdventureProgress } from '../../../../app/types';
import { AdventureChapter, AdventureSegment, AdventureBadge } from '../../../../data/adventure_content';
import { Map, Trophy, Lock, Star, User as UserIcon, X, Shield, Crown, Key, GitCommit, Edit3, Trash2, Plus, Swords, BookOpen } from 'lucide-react';
import { useToast } from '../../../../contexts/ToastContext';
import ConfirmationModal from '../../../common/ConfirmationModal';

// --- MAIN UI CONTROLLER ---
interface Props {
    user: User;
    progress: AdventureProgress;
    chapters: AdventureChapter[];
    allBadges: Record<string, AdventureBadge>;
    onSegmentClick: (chapterId: string, segment: AdventureSegment) => void;
    xpToNextLevel?: number;
    onExit: () => void;
    isEditing: boolean;
    onToggleEdit: () => void;
    onDeleteChapter: (chapterId: string) => void;
    onAddNewChapter: () => void;
    onDeleteSegment: (chapterId: string, segment: AdventureSegment) => void;
    onAddNewSegment: (chapter: AdventureChapter) => void;
    onEditSegment: (chapterId: string, segment: AdventureSegment) => void;
}

export const AdventureUI: React.FC<Props> = ({ user, progress, chapters, allBadges, onSegmentClick, xpToNextLevel = 1000, onExit, isEditing, onToggleEdit, onDeleteChapter, onAddNewChapter, onDeleteSegment, onAddNewSegment, onEditSegment }) => {
    const [showProfile, setShowProfile] = useState(false);
    const [chapterToDelete, setChapterToDelete] = useState<AdventureChapter | null>(null);
    const { showToast } = useToast();
    const xpProgress = Math.min(100, Math.max(0, (user.experience / xpToNextLevel) * 100));

    return (
        <div className="h-full flex flex-col bg-neutral-50 rounded-[2.5rem] overflow-hidden relative shadow-inner border-4 border-white">
            {/* HUD */}
            <div className="absolute top-0 left-0 right-0 z-20 p-6 bg-gradient-to-b from-black/10 to-transparent pointer-events-none flex justify-between items-start">
                <div className="flex items-center gap-3 pointer-events-auto">
                    <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/30"><Map className="text-white" size={24} /></div>
                    <div className="bg-black/40 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/10">
                        <h2 className="text-white font-black text-sm tracking-widest uppercase">Explore</h2>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <div className="pointer-events-auto flex items-center gap-2 bg-black/40 backdrop-blur-md px-4 py-3 rounded-2xl border border-white/10 text-white font-bold text-xs">
                        <Key size={16} className="text-amber-400"/> {progress.keys} <span className="w-px h-3 bg-white/20"/> <GitCommit size={16} className="text-neutral-400"/> {progress.keyFragments}/3
                    </div>
                    <button onClick={onToggleEdit} className={`pointer-events-auto p-3 rounded-2xl border transition-all text-xs font-black uppercase tracking-wider ${isEditing ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg' : 'bg-black/40 backdrop-blur-md border-white/10 text-white hover:bg-white/10'}`}>
                        {isEditing ? 'Done' : 'Edit'}
                    </button>
                    <button onClick={() => setShowProfile(true)} className="pointer-events-auto flex items-center gap-2 bg-black/40 backdrop-blur-md p-2 rounded-2xl border border-white/10 hover:bg-white/10 transition-all group">
                        <div className="w-10 h-10 rounded-xl bg-neutral-800 border-2 border-white/20 overflow-hidden relative"><img src={user.avatar} className="w-full h-full object-cover" alt="Avatar" /></div>
                    </button>
                    <button onClick={onExit} className="pointer-events-auto bg-black/40 backdrop-blur-md p-3 rounded-2xl border border-white/10 text-white hover:bg-white/10 transition-all group">
                        <X size={20} />
                    </button>
                </div>
            </div>

            {/* Main scrollable content */}
            <div className="flex-1 overflow-y-auto p-8 pt-28 space-y-8">
                {chapters.map(chapter => {
                    const isUnlocked = progress.unlockedChapterIds.includes(chapter.id);
                    if (!isUnlocked) return null; 

                    const isChapterMastered = chapter.segments.every(s => progress.badges.includes(s.boss.dropBadgeId));
                    const badgeId = chapter.segments.length > 0 ? chapter.segments[0].boss.dropBadgeId : null;
                    const badge = badgeId ? allBadges[badgeId] : null;
                    const displayIcon = isChapterMastered && badge ? badge.icon : chapter.icon;

                    const completedStars = chapter.segments.reduce((acc, s) => acc + (progress.segmentStars[s.id] || 0), 0);
                    const totalPossibleStars = chapter.segments.length * 3;
                    const chapterProgress = totalPossibleStars > 0 ? (completedStars / totalPossibleStars) * 100 : 0;
                    
                    return (
                        <div key={chapter.id} className="bg-white p-6 rounded-[2.5rem] border border-neutral-200/80 shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-500 relative group">
                            {isEditing && (
                                <button onClick={() => setChapterToDelete(chapter)} className="absolute -top-3 -right-3 z-10 p-3 bg-red-500 text-white rounded-full shadow-lg hover:bg-red-600 transition-all active:scale-90 opacity-0 group-hover:opacity-100">
                                    <Trash2 size={16}/>
                                </button>
                            )}
                            <div className="flex items-center justify-between gap-4 border-b border-neutral-100 pb-4 mb-6">
                                <div className="flex items-center gap-4">
                                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl ${isChapterMastered && badge ? badge.color : 'bg-neutral-100'}`}>
                                        {displayIcon}
                                    </div>
                                    <div>
                                        <h2 className="font-black text-neutral-900 tracking-tight text-xl">{chapter.title}</h2>
                                        <p className="text-sm text-neutral-500 font-medium">{chapter.description}</p>
                                    </div>
                                </div>
                                {isChapterMastered && badge && !isEditing && (
                                    <div className="hidden sm:flex items-center gap-2 bg-amber-100 text-amber-700 px-3 py-1.5 rounded-full text-xs font-bold border border-amber-200">
                                        <Trophy size={14}/> MASTERED
                                    </div>
                                )}
                            </div>
                            
                            <div className="space-y-1 mb-8">
                                <div className="flex justify-between text-[10px] font-bold text-neutral-400">
                                    <span>Chapter Progress</span>
                                    <span>{completedStars} / {totalPossibleStars} ★</span>
                                </div>
                                <div className="h-2 w-full bg-neutral-100 rounded-full overflow-hidden border border-neutral-200/50">
                                    <div className="h-full bg-amber-400" style={{ width: `${chapterProgress}%` }} />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-6 gap-y-10">
                                {chapter.segments.map((segment) => {
                                    const stars = progress.segmentStars[segment.id] || 0;
                                    const isActivated = progress.completedSegmentIds.includes(segment.id);
                                    const hasBadge = progress.badges.includes(segment.boss.dropBadgeId);

                                    let VisualIcon: React.ElementType = Lock;
                                    let stateText = "Needs Key";
                                    let buttonClass = 'bg-neutral-200 cursor-not-allowed opacity-70';

                                    if (isEditing) { VisualIcon = Edit3; stateText = "Edit Words"; buttonClass = 'bg-indigo-100 text-indigo-600'; } 
                                    else if (hasBadge) { VisualIcon = Crown; stateText = 'DEFEATED'; buttonClass = 'bg-amber-400 text-white'; } 
                                    else if (stars === 3) { VisualIcon = Swords; stateText = 'Challenge Boss'; buttonClass = 'bg-red-500 text-white animate-pulse-slow ring-4 ring-red-500/30'; } 
                                    else if (stars > 0) { VisualIcon = BookOpen; stateText = 'Keep Studying'; buttonClass = 'bg-emerald-500 text-white'; } 
                                    else if (isActivated) { VisualIcon = BookOpen; stateText = 'Study Words'; buttonClass = 'bg-sky-400 text-white'; } 
                                    else if (progress.keys > 0) { VisualIcon = Key; stateText = 'Unlock Region'; buttonClass = 'bg-neutral-800 text-white'; }

                                    return (
                                        <div key={segment.id} className="relative flex flex-col items-center group/segment">
                                            {isEditing && ( <button onClick={() => onDeleteSegment(chapter.id, segment)} className="absolute -top-3 -right-2 w-7 h-7 bg-red-500 text-white rounded-full flex items-center justify-center shadow-md z-10 hover:bg-red-600 transition-colors active:scale-90"><Trash2 size={12}/></button> )}
                                            <div className="flex gap-1 mb-2">
                                                {[1, 2, 3].map(s => ( <Star key={s} size={14} className={`${stars >= s ? 'text-amber-400 fill-amber-400' : 'text-neutral-300'} transition-colors`} /> ))}
                                            </div>
                                            <button onClick={() => onSegmentClick(chapter.id, segment)} disabled={stateText === 'Needs Key' && !isEditing} className={`relative w-20 h-20 md:w-24 md:h-24 rounded-full flex items-center justify-center shadow-lg transition-all duration-300 ${buttonClass}`}>
                                                {segment.image && !isEditing && hasBadge ? (
                                                    <img src={`data:image/svg+xml;base64,${btoa(segment.image)}`} className="w-full h-full object-cover rounded-full p-4 drop-shadow-sm transform group-hover/segment:scale-110 transition-transform" alt={segment.title} />
                                                ) : (
                                                    <VisualIcon size={32} className="drop-shadow-sm transform group-hover/segment:scale-110 transition-transform"/>
                                                )}
                                            </button>
                                            <div className="mt-3 text-center relative h-8 overflow-hidden w-full">
                                                <h3 className="font-black text-neutral-900 text-sm absolute inset-0 flex items-center justify-center transition-all duration-300 group-hover/segment:-translate-y-full">{segment.title}</h3>
                                                <div className="absolute inset-0 flex items-center justify-center translate-y-full group-hover/segment:translate-y-0 transition-all duration-300">
                                                    <div className="text-[9px] font-bold uppercase flex items-center gap-1">{stateText}</div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                                {isEditing && ( <div onClick={() => onAddNewSegment(chapter)} className="relative flex flex-col items-center group/add cursor-pointer"><div className="flex gap-1 mb-2 invisible"><Star size={14} /><Star size={14} /><Star size={14} /></div><div className="relative w-20 h-20 md:w-24 md:h-24 rounded-full flex items-center justify-center transition-all duration-300 bg-neutral-100 border-2 border-dashed border-neutral-300 hover:border-indigo-400 hover:bg-indigo-50 text-indigo-400"><Plus size={32} /></div><div className="mt-3 text-center h-8"><h3 className="font-black text-indigo-600 text-sm">Add New</h3></div></div> )}
                            </div>
                        </div>
                    );
                })}
                {isEditing && ( <div onClick={onAddNewChapter} className="bg-white p-6 rounded-[2.5rem] border-2 border-dashed border-neutral-300 hover:border-indigo-500 hover:bg-indigo-50/50 transition-all cursor-pointer flex flex-col items-center justify-center text-center text-indigo-600 space-y-4 min-h-[200px] animate-in fade-in"><div className="p-4 bg-indigo-100 rounded-full"><Plus size={32}/></div><h3 className="font-black text-lg">Add New Chapter</h3></div> )}
            </div>
            
            {showProfile && ( <div className="absolute inset-0 z-50 bg-black/50 backdrop-blur-sm p-6 flex items-center justify-center animate-in fade-in duration-300"><div className="bg-neutral-900 w-full max-w-2xl rounded-[3rem] border border-white/10 shadow-2xl relative overflow-hidden flex flex-col max-h-full"><div className="p-6 flex justify-between items-start shrink-0"><h2 className="text-2xl font-black text-white flex items-center gap-2"><UserIcon size={24} className="text-indigo-500"/> Profile</h2><button onClick={() => setShowProfile(false)} className="p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"><X size={20} /></button></div><div className="overflow-y-auto px-6 pb-8 space-y-8"><div className="flex flex-col md:flex-row items-center gap-6 p-6 bg-white/5 rounded-[2rem] border border-white/5"><div className="relative"><div className="w-24 h-24 rounded-full p-1 bg-gradient-to-br from-indigo-500 to-purple-600"><img src={user.avatar} className="w-full h-full rounded-full bg-neutral-900 object-cover border-4 border-neutral-900" alt="Avatar" /></div><div className="absolute -bottom-2 -right-2 bg-neutral-900 text-white text-[10px] font-black px-2 py-1 rounded-full border border-indigo-500 flex items-center gap-1"><Crown size={10} className="fill-yellow-400 text-yellow-400" /> LVL {user.level}</div></div><div className="flex-1 w-full space-y-4 text-center md:text-left"><div><h3 className="text-2xl font-black text-white">{user.name}</h3><p className="text-white/50 text-xs font-bold uppercase tracking-widest flex items-center justify-center md:justify-start gap-1"><Shield size={12} /> {user.role || 'Adventurer'}</p></div><div className="space-y-1"><div className="flex justify-between text-[10px] font-bold text-white/70 uppercase tracking-wider"><span>Experience</span><span>{user.experience} / {xpToNextLevel} XP</span></div><div className="h-3 w-full bg-black/50 rounded-full overflow-hidden border border-white/10"><div className="h-full bg-gradient-to-r from-emerald-500 to-teal-400" style={{ width: `${xpProgress}%` }} /></div></div></div></div><div className="grid grid-cols-2 gap-4"><div className="bg-white/5 p-4 rounded-2xl border border-white/10 flex flex-col items-center justify-center text-center"><span className="text-2xl font-black text-amber-400 flex items-center gap-2"><Key/> {progress.keys}</span><span className="text-[9px] font-black text-white/40 uppercase tracking-widest mt-1">Keys</span></div><div className="bg-white/5 p-4 rounded-2xl border border-white/10 flex flex-col items-center justify-center text-center"><span className="text-2xl font-black text-neutral-400 flex items-center gap-2"><GitCommit/> {progress.keyFragments}/3</span><span className="text-[9px] font-black text-white/40 uppercase tracking-widest mt-1">Fragments</span></div></div></div></div></div> )}
            
            <ConfirmationModal
                isOpen={!!chapterToDelete}
                title="Delete Chapter?"
                message={<>Are you sure you want to delete <strong>"{chapterToDelete?.title}"</strong>? This action cannot be undone.</>}
                confirmText="Yes, Delete"
                isProcessing={false}
                onConfirm={() => {
                    if (chapterToDelete) onDeleteChapter(chapterToDelete.id);
                    setChapterToDelete(null);
                }}
                onClose={() => setChapterToDelete(null)}
                icon={<Trash2 size={40} className="text-red-500"/>}
            />
        </div>
    );
};
