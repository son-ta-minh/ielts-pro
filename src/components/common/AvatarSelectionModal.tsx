
import React, { useState } from 'react';
import { User } from '../../app/types';
import { User as UserIcon, X, Crown, Lock, Sparkles, GraduationCap, Stethoscope, Palette } from 'lucide-react';

// RPG Roles configuration with base image names
const RPG_ROLES: { level: number; title: string; baseImage: string }[] = [
    { level: 1, title: 'Novice Soul', baseImage: 'Baby Angel' },
    { level: 5, title: 'Forest Kin', baseImage: 'Elf' },
    { level: 10, title: 'Lamp Spirit', baseImage: 'Genie' },
    { level: 20, title: 'Undead Walker', baseImage: 'Zombie' },
    { level: 30, title: 'Night Stalker', baseImage: 'Vampire' },
    { level: 50, title: 'Mystic Fairy', baseImage: 'Fairy' },
    { level: 75, title: 'Arcane Mage', baseImage: 'Mage' },
    { level: 100, title: 'Shadow Ninja', baseImage: 'Ninja' },
    { level: 150, title: 'Heroic Savior', baseImage: 'Superhero' },
    { level: 200, title: 'Master Villain', baseImage: 'Supervillain' },
    { level: 500, title: 'Royal Heir', baseImage: 'Royalty' }, 
    { level: 999, title: 'The Legend', baseImage: 'Astronaut' },
];

// Helper to get gendered image name
const getGenderedImage = (base: string, gender: 'Male' | 'Female'): string => {
    if (base === 'Baby Angel') return 'Baby Angel';
    if (base === 'Ninja') return 'Ninja'; 
    if (base === 'Royalty') return gender === 'Male' ? 'Prince' : 'Princess';
    return `${gender === 'Male' ? 'Man' : 'Woman'} ${base}`;
};

// Defined Avatar Collections
const AVATAR_COLLECTIONS = [
    {
        title: "Education & Tech",
        description: "Teachers, Coders, Scientists",
        icon: GraduationCap,
        type: "fluent",
        items: [
            "Woman Teacher", "Man Teacher", 
            "Woman Student", "Man Student",
            "Woman Technologist", "Man Technologist",
            "Woman Scientist", "Man Scientist",
            "Woman Astronaut", "Man Astronaut"
        ]
    },
    {
        title: "Medical & Service",
        description: "Doctors, Chefs, Heroes",
        icon: Stethoscope,
        type: "fluent",
        items: [
            "Woman Health Worker", "Man Health Worker",
            "Woman Cook", "Man Cook",
            "Woman Firefighter", "Man Firefighter",
            "Woman Police Officer", "Man Police Officer",
            "Woman Judge", "Man Judge"
        ]
    },
    {
        title: "Arts & Office",
        description: "Creatives & Professionals",
        icon: Palette,
        type: "fluent",
        items: [
            "Woman Artist", "Man Artist",
            "Woman Singer", "Man Singer",
            "Woman Office Worker", "Man Office Worker",
            "Woman Detective", "Man Detective",
            "Woman Mechanic", "Man Mechanic"
        ]
    }
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSelectAvatar: (url: string) => void;
  currentUser: User;
}

export const AvatarSelectionModal: React.FC<Props> = ({ isOpen, onClose, onSelectAvatar, currentUser }) => {
  const [gender, setGender] = useState<'Male' | 'Female'>('Male');

  if (!isOpen) return null;

  const getUrl = (type: string, item: string) => {
    if (type === 'fluent') {
        return `https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/People/${encodeURIComponent(item)}.png`;
    }
    return `https://api.dicebear.com/7.x/${type}/svg?seed=${item}`;
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300">
      <div className="bg-white rounded-[2.5rem] w-full max-w-5xl p-0 relative shadow-2xl border border-neutral-200 flex flex-col max-h-[85vh] overflow-hidden">
        
        {/* Header */}
        <div className="p-6 border-b border-neutral-100 flex justify-between items-center bg-white z-10 shrink-0">
            <div>
                <h3 className="text-2xl font-black text-neutral-900 flex items-center gap-2"><UserIcon size={24}/> Select Identity</h3>
                <p className="text-neutral-500 text-sm font-medium">Who do you want to be today?</p>
            </div>
            <div className="flex items-center gap-4">
                 {/* Gender Toggle */}
                 <div className="bg-neutral-100 p-1 rounded-xl flex">
                    <button 
                        onClick={() => setGender('Male')} 
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${gender === 'Male' ? 'bg-white shadow-sm text-neutral-900' : 'text-neutral-500 hover:text-neutral-700'}`}
                    >
                        Male
                    </button>
                    <button 
                        onClick={() => setGender('Female')} 
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${gender === 'Female' ? 'bg-white shadow-sm text-neutral-900' : 'text-neutral-500 hover:text-neutral-700'}`}
                    >
                        Female
                    </button>
                 </div>
                 <button onClick={onClose} className="p-2 text-neutral-400 hover:bg-neutral-100 rounded-full transition-colors"><X size={24} /></button>
            </div>
        </div>
        
        {/* Content */}
        <div className="overflow-y-auto p-6 space-y-8 bg-neutral-50/50">
            
             {/* RPG Title Avatars (Fantasy Heroes) */}
             <div className="bg-gradient-to-br from-neutral-900 to-neutral-800 p-6 rounded-[2rem] shadow-lg text-white">
                <div className="flex items-center gap-2 mb-4 px-2">
                    <div className="p-2 bg-white/10 rounded-xl text-yellow-400"><Crown size={18}/></div>
                    <div>
                        <h4 className="text-sm font-black uppercase tracking-wide">Hall of Fame (Level Unlocks)</h4>
                        <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Dynamic Fantasy Avatars</p>
                    </div>
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-4">
                    {RPG_ROLES.map((role) => {
                        const isUnlocked = (currentUser.peakLevel || 1) >= role.level;
                        const imageName = getGenderedImage(role.baseImage, gender);
                        const url = getUrl('fluent', imageName);
                        const isSelected = currentUser.avatar === url;
                        
                        return (
                            <button 
                                key={role.title} 
                                onClick={() => isUnlocked && onSelectAvatar(url)} 
                                disabled={!isUnlocked} 
                                className={`group relative aspect-square rounded-2xl p-2 transition-all ${isSelected ? 'bg-yellow-500 ring-4 ring-yellow-500/30' : 'bg-white/5 hover:bg-white/10'} ${!isUnlocked ? 'cursor-not-allowed' : 'active:scale-95'}`}
                            >
                                <img src={url} alt={role.title} className="w-full h-full object-contain filter drop-shadow-sm" loading="lazy" />
                                
                                {!isUnlocked && (
                                    <div className="absolute top-1 right-1 z-10 bg-black/60 text-white p-1 rounded-full backdrop-blur-sm">
                                        <Lock size={10} />
                                    </div>
                                )}
                                
                                {!isUnlocked && (
                                    <div className="absolute bottom-1 right-1 z-10">
                                         <span className="text-[8px] font-black bg-black/60 text-white px-1.5 py-0.5 rounded-full backdrop-blur-sm">Lvl {role.level}</span>
                                    </div>
                                )}

                                <div className="absolute -bottom-2 w-full flex justify-center z-20">
                                    <span className={`text-[6px] font-black uppercase px-1.5 py-0.5 rounded-md shadow-sm truncate max-w-[90%] ${isUnlocked ? 'bg-white text-neutral-900' : 'bg-neutral-800 text-neutral-500'}`}>{role.title}</span>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Standard Collections */}
            {AVATAR_COLLECTIONS.map((group) => {
                // Filter items based on selected gender (Woman vs Man prefix)
                const prefix = gender === 'Male' ? 'Man' : 'Woman';
                const filteredItems = group.items.filter(item => item.startsWith(prefix));
                
                if (filteredItems.length === 0) return null;

                return (
                    <div key={group.title} className="bg-white p-5 rounded-[2rem] border border-neutral-100 shadow-sm">
                        <div className="flex items-center gap-2 mb-4 px-2">
                            <div className="p-2 bg-neutral-100 rounded-xl text-neutral-600"><group.icon size={18}/></div>
                            <div>
                                <h4 className="text-sm font-black uppercase text-neutral-900 tracking-wide">{group.title}</h4>
                                <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">{group.description}</p>
                            </div>
                        </div>
                        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-3">
                            {filteredItems.map((item) => {
                                const url = getUrl(group.type, item);
                                const isSelected = currentUser.avatar === url;
                                return (
                                    <button 
                                        key={item} 
                                        onClick={() => onSelectAvatar(url)} 
                                        title={item}
                                        className={`group relative aspect-square rounded-2xl p-2 transition-all active:scale-95 ${isSelected ? 'bg-indigo-600 ring-4 ring-indigo-200 shadow-lg scale-105' : 'bg-neutral-50 hover:bg-white hover:shadow-md border border-transparent hover:border-neutral-200'}`}
                                    >
                                        <img src={url} alt={item} className="w-full h-full object-contain filter drop-shadow-sm transition-transform group-hover:scale-110" loading="lazy" />
                                        {isSelected && <div className="absolute -top-2 -right-2 bg-indigo-600 text-white p-1 rounded-full"><Sparkles size={10} fill="currentColor"/></div>}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                );
            })}

        </div>
      </div>
    </div>
  );
};
