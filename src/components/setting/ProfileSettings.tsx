
import React from 'react';
import { User as UserIcon, Globe, Save } from 'lucide-react';
import { User } from '../../app/types';

const LANGUAGES = [
    'Vietnamese', 'Spanish', 'Chinese (Simplified)', 'Chinese (Traditional)', 
    'Japanese', 'Korean', 'French', 'German', 'Italian', 'Portuguese', 
    'Russian', 'Arabic', 'Hindi', 'Thai', 'Indonesian', 'Turkish'
];

// RPG Roles/Titles - Replicated here for UI logic (should ideally be imported from central source)
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
        role: string;
        currentLevel: string;
        target: string;
        nativeLanguage: string;
    };
    onProfileChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
    onSaveProfile: () => void;
}

export const ProfileSettings: React.FC<ProfileSettingsProps> = ({ profileData, onProfileChange, onSaveProfile }) => {
    // Check if the current role is an auto-assigned RPG title
    const isAutoAssignedRole = RPG_ROLES.some(r => r.title === profileData.role);

    return (
        <section className="bg-white p-8 rounded-[2.5rem] border border-neutral-200 shadow-sm flex flex-col space-y-6">
            <div className="flex items-center space-x-4">
                <div className="p-3 bg-neutral-100 text-neutral-600 rounded-2xl"><UserIcon size={24} /></div>
                <div>
                    <h3 className="text-xl font-black text-neutral-900">Your Profile</h3>
                    <p className="text-xs text-neutral-400">This context helps AI tailor content for you.</p>
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-neutral-100">
                <div>
                    <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1 mb-2">Display Name</label>
                    <input name="name" value={profileData.name} onChange={onProfileChange} className="w-full px-4 py-3 bg-white border border-neutral-200 rounded-xl font-bold" />
                </div>
                <div>
                    <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1 mb-2">Role / Title</label> {/* Label updated */}
                    <input 
                        name="role" 
                        value={profileData.role} 
                        onChange={onProfileChange} 
                        placeholder="e.g., Student" 
                        className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl font-medium" 
                        readOnly={isAutoAssignedRole} // Make read-only if auto-assigned
                        title={isAutoAssignedRole ? "This is your auto-assigned RPG title." : "You can customize your role."}
                    />
                    {isAutoAssignedRole && (
                        <p className="text-[10px] text-neutral-400 mt-1 px-1 italic">This is your auto-assigned RPG title.</p>
                    )}
                </div>
                <div>
                    <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1 mb-2">Current Level</label>
                    <input name="currentLevel" value={profileData.currentLevel} onChange={onProfileChange} placeholder="e.g., Intermediate, Advanced" className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl font-medium" />
                </div>
                <div>
                    <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1 mb-2">Target</label>
                    <input name="target" value={profileData.target} onChange={onProfileChange} placeholder="e.g., Fluent communication, Academic writing" className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl font-medium" />
                </div>
                <div className="md:col-span-2">
                    <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1 mb-2 flex items-center gap-2"><Globe size={12} /> Native Language</label>
                    <select name="nativeLanguage" value={profileData.nativeLanguage} onChange={onProfileChange} className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl font-medium appearance-none">
                        {LANGUAGES.map(lang => <option key={lang} value={lang}>{lang}</option>)}
                    </select>
                    <p className="text-[10px] text-neutral-400 mt-2 px-1">Words definitions will be generated in this language.</p>
                </div>
            </div>
            <button onClick={onSaveProfile} className="w-full py-4 bg-neutral-900 text-white rounded-2xl font-black text-xs hover:bg-neutral-800 transition-all flex items-center justify-center space-x-2"><Save size={16} /> <span>SAVE PROFILE</span></button>
        </section>
    );
};
