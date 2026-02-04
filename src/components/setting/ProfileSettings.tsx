
import React, { useState } from 'react';
import { User as UserIcon, Globe, Save, Users, Edit3 } from 'lucide-react';
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
    };
    onProfileChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
    onAvatarChange: (url: string) => void;
    onSaveProfile: () => void;
    // We need the full user object to pass to the modal for level checks
    // If not available easily, we can mock parts of it or request prop update. 
    // Assuming we can pass a partial User or just the level/peakLevel.
    // For now, let's assume we can construct a minimal user object for the modal from profileData + dummy level.
    // Ideally, pass the `user` object from SettingsView. Let's stick to props we have.
}

export const ProfileSettings: React.FC<ProfileSettingsProps> = ({ profileData, onProfileChange, onAvatarChange, onSaveProfile }) => {
    const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
    const isAutoAssignedRole = RPG_ROLES.some(r => r.title === profileData.role);

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
