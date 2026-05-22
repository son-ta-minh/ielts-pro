
import React, { useEffect, useState } from 'react';
import { User as UserIcon, Globe, Save, Users, Edit3, Plus, Trash2 } from 'lucide-react';
import { AvatarSelectionModal } from '../common/AvatarSelectionModal';
import { User } from '../../app/types';

const LANGUAGES = [
    'Vietnamese', 'Spanish', 'Chinese (Simplified)', 'Chinese (Traditional)', 
    'Japanese', 'Korean', 'French', 'German', 'Italian', 'Portuguese', 
    'Russian', 'Arabic', 'Hindi', 'Thai', 'Indonesian', 'Turkish'
];

// RPG Roles/Titles (Duplicated for simple display logic if needed, but Modal has source of truth)
const RPG_ROLES: { level: number; title: string; }[] = [
  { level: 1, title: 'Vocab Novice' },
  { level: 5, title: 'Word Apprentice' },
  { level: 10, title: 'Lexical Explorer' },
  { level: 20, title: 'Master Grammarian' },
  { level: 30, title: 'IELTS Wordsmith' },
  { level: 50, title: 'IELTS Luminary' },
];

interface ProfileSettingsProps {
    profileData: {
        name: string;
        avatar: string; // Ensure avatar is passed
        role: string;
        currentLevel: string;
        target: string;
        nativeLanguage: string;
        lessonLanguage?: string;
        lessonAudience?: 'Kid' | 'Adult';
        lessonExampleContexts?: string[];
    };
    onProfileChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
    onExampleContextsChange: (contexts: string[]) => void;
    onAvatarChange: (url: string) => void;
    onSaveProfile: () => void;
    // We need the full user object to pass to the modal for level checks
    // If not available easily, we can mock parts of it or request prop update. 
    // Assuming we can pass a partial User or just the level/peakLevel.
    // For now, let's assume we can construct a minimal user object for the modal from profileData + dummy level.
    // Ideally, pass the `user` object from SettingsView. Let's stick to props we have.
}

const normalizeExampleContext = (value: string) => value.trim().replace(/\s+/g, ' ');

export const ProfileSettings: React.FC<ProfileSettingsProps> = ({ profileData, onProfileChange, onExampleContextsChange, onAvatarChange, onSaveProfile }) => {
    const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
    const [newExampleContext, setNewExampleContext] = useState('');
    const isAutoAssignedRole = RPG_ROLES.some(r => r.title === profileData.role);
    const exampleContexts = (profileData.lessonExampleContexts || []).map(normalizeExampleContext).filter(Boolean);

    useEffect(() => {
        onExampleContextsChange(exampleContexts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Mock user object for the modal since it expects a User type.
    const dummyUserForModal: User = {
        id: 'settings-user',
        name: profileData.name,
        avatar: profileData.avatar,
        lastLogin: 0,
        experience: 0,
        level: 100, // Unlock most for manual selection? Or strictly use current?
        peakLevel: 100, // Unlock most
        adventure: {} as any
    };

    const handleAddExampleContext = () => {
        const nextContext = normalizeExampleContext(newExampleContext);
        if (!nextContext) return;

        const exists = exampleContexts.some((item) => item.toLowerCase() === nextContext.toLowerCase());
        if (exists) return;

        onExampleContextsChange([...exampleContexts, nextContext]);
        setNewExampleContext('');
    };

    const handleDeleteExampleContext = (target: string) => {
        onExampleContextsChange(exampleContexts.filter((item) => item !== target));
    };

    return (
        <section className="bg-white p-8 rounded-[2.5rem] border border-neutral-200 shadow-sm flex flex-col space-y-8">
            <div className="space-y-6">
                <div className="flex items-center space-x-4">
                    <div className="p-3 bg-neutral-100 text-neutral-600 rounded-2xl"><UserIcon size={24} /></div>
                    <div>
                        <h3 className="text-xl font-black text-neutral-900">Your Profile</h3>
                        <p className="text-xs text-neutral-400">Identity and learning context.</p>
                    </div>
                </div>

                {/* Avatar Display & Name Input */}
                <div className="flex flex-col md:flex-row items-center gap-6 p-4 bg-neutral-50 rounded-3xl border border-neutral-100">
                    <div className="relative group shrink-0">
                        <img 
                            src={profileData.avatar} 
                            alt="Current Avatar" 
                            className="w-24 h-24 rounded-2xl bg-white shadow-sm border-2 border-white object-contain"
                        />
                        <button 
                            onClick={() => setIsAvatarModalOpen(true)}
                            className="absolute inset-0 bg-black/40 rounded-2xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white font-bold text-xs"
                        >
                            Change
                        </button>
                        <button 
                            onClick={() => setIsAvatarModalOpen(true)}
                            className="absolute -bottom-2 -right-2 p-2 bg-neutral-900 text-white rounded-full shadow-md hover:scale-110 transition-transform"
                            title="Edit Avatar"
                        >
                            <Edit3 size={14} />
                        </button>
                    </div>
                    
                    <div className="flex-1 w-full md:w-auto">
                        <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1 mb-2">Display Name</label>
                        <input 
                            name="name" 
                            value={profileData.name} 
                            onChange={onProfileChange} 
                            className="w-full px-4 py-3 bg-white border border-neutral-200 rounded-xl font-bold text-lg focus:ring-2 focus:ring-neutral-900 outline-none" 
                            placeholder="Enter your name"
                        />
                        <button onClick={() => setIsAvatarModalOpen(true)} className="mt-2 text-xs font-bold text-indigo-600 hover:underline md:hidden">
                            Select Identity
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                    <div>
                        <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1 mb-2">Role / Title</label>
                        <input 
                            name="role" 
                            value={profileData.role} 
                            onChange={onProfileChange} 
                            placeholder="e.g., Student" 
                            className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl font-medium focus:ring-1 focus:ring-neutral-300 outline-none" 
                            readOnly={isAutoAssignedRole}
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1 mb-2">Current Level</label>
                        <input 
                            name="currentLevel" 
                            value={profileData.currentLevel} 
                            onChange={onProfileChange} 
                            placeholder="e.g., Intermediate, Advanced" 
                            className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl font-medium focus:ring-1 focus:ring-neutral-300 outline-none" 
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1 mb-2">Target</label>
                        <input 
                            name="target" 
                            value={profileData.target} 
                            onChange={onProfileChange} 
                            placeholder="e.g., Fluent communication" 
                            className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl font-medium focus:ring-1 focus:ring-neutral-300 outline-none" 
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1 mb-2 flex items-center gap-2"><Globe size={12} /> Native Language</label>
                        <select 
                            name="nativeLanguage" 
                            value={profileData.nativeLanguage} 
                            onChange={onProfileChange} 
                            className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl font-medium appearance-none focus:ring-1 focus:ring-neutral-300 outline-none"
                        >
                            {LANGUAGES.map(lang => <option key={lang} value={lang}>{lang}</option>)}
                        </select>
                    </div>
                </div>
            </div>

            <div className="space-y-6">
                 <div className="flex items-center space-x-4">
                    <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl"><Globe size={24} /></div>
                    <div>
                        <h3 className="text-xl font-black text-neutral-900">Lesson Preferences</h3>
                        <p className="text-xs text-neutral-400">Settings for AI generated units in Lesson page</p>
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-neutral-100">
                    <div>
                        <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1 mb-2 flex items-center gap-2"><Globe size={12} /> Content Language</label>
                        <select name="lessonLanguage" value={profileData.lessonLanguage} onChange={onProfileChange} className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl font-medium appearance-none">
                            <option value="English">English</option>
                            <option value="Vietnamese">Vietnamese</option>
                        </select>
                    </div>
                     <div>
                        <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1 mb-2 flex items-center gap-2"><Users size={12} /> Target Audience</label>
                        <select name="lessonAudience" value={profileData.lessonAudience} onChange={onProfileChange} className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl font-medium appearance-none">
                            <option value="Kid">Kid</option>
                            <option value="Adult">Adult</option>
                        </select>
                    </div>
                    <div className="md:col-span-2 space-y-4 p-5 bg-amber-50/60 rounded-[1.75rem] border border-amber-100">
                        <div>
                            <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1 mb-2">Example Context</label>
                            <p className="text-xs text-neutral-500 px-1">Used when AI generates vocabulary examples in review sessions.</p>
                        </div>

                        <div className="flex flex-col md:flex-row gap-3">
                            <input
                                value={newExampleContext}
                                onChange={(e) => setNewExampleContext(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        handleAddExampleContext();
                                    }
                                }}
                                placeholder="e.g. Workplace, School, Software Project"
                                className="flex-1 px-4 py-3 bg-white border border-amber-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-neutral-900 outline-none"
                            />
                            <button
                                type="button"
                                onClick={handleAddExampleContext}
                                disabled={!normalizeExampleContext(newExampleContext)}
                                className="px-4 py-3 bg-amber-500 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 hover:bg-amber-600 disabled:opacity-50"
                            >
                                <Plus size={14} />
                                <span>Add Context</span>
                            </button>
                        </div>

                        {exampleContexts.length === 0 ? (
                            <div className="p-6 text-center text-xs text-neutral-400 bg-white rounded-2xl border border-amber-100">
                                No preferred contexts yet. AI will fall back to general daily-life examples.
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {exampleContexts.map((item) => (
                                    <div key={item} className="flex items-center justify-between gap-3 px-4 py-3 bg-white rounded-2xl border border-amber-100">
                                        <span className="font-bold text-sm text-neutral-800">{item}</span>
                                        <button
                                            type="button"
                                            onClick={() => handleDeleteExampleContext(item)}
                                            className="p-2 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                                            title={`Delete ${item}`}
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <button onClick={onSaveProfile} className="w-full py-4 bg-neutral-900 text-white rounded-2xl font-black text-xs hover:bg-neutral-800 transition-all flex items-center justify-center space-x-2"><Save size={16} /> <span>SAVE PROFILE</span></button>

            <AvatarSelectionModal 
                isOpen={isAvatarModalOpen} 
                onClose={() => setIsAvatarModalOpen(false)} 
                onSelectAvatar={onAvatarChange} 
                currentUser={dummyUserForModal} 
            />
        </section>
    );
};
