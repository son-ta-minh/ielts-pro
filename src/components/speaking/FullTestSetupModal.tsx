import React, { useState } from 'react';
import { X, Mic, Play, Sparkles, Loader2, Dices } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onStartTest: (theme: string) => void;
}

const FullTestSetupModal: React.FC<Props> = ({ isOpen, onClose, onStartTest }) => {
  const [theme, setTheme] = useState('');
  
  if (!isOpen) return null;

  const handleStart = () => {
    if (!theme.trim()) {
        const themes = ['Technology', 'Environment', 'Education', 'Travel', 'Art', 'Health', 'Social Media', 'Work', 'Food', 'Culture'];
        const randomTheme = themes[Math.floor(Math.random() * themes.length)];
        onStartTest(randomTheme);
    } else {
        onStartTest(theme);
    }
  };

  const handleRandom = () => {
    const themes = ['Technology', 'Environment', 'Education', 'Travel', 'Art', 'Health', 'Social Media', 'Work', 'Food', 'Culture'];
    const randomTheme = themes[Math.floor(Math.random() * themes.length)];
    setTheme(randomTheme);
  };
  
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl border border-neutral-200 flex flex-col max-h-[90vh]">
        <header className="px-8 py-6 border-b border-neutral-100 flex justify-between items-start shrink-0">
          <div>
            <h3 className="text-2xl font-black text-neutral-900 leading-tight flex items-center gap-3"><Mic size={24}/> Full Test Setup</h3>
            <p className="text-neutral-500 text-sm font-medium mt-1">Generate a 3-part test with your AI.</p>
          </div>
          <button onClick={onClose} className="p-2 -mr-2 text-neutral-400 hover:bg-neutral-100 rounded-full"><X size={20}/></button>
        </header>
        
        <main className="p-8 overflow-y-auto space-y-4">
            <div className="space-y-1">
                <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">Test Theme (Optional)</label>
                <div className="flex gap-2">
                    <input 
                        type="text" 
                        value={theme}
                        onChange={e => setTheme(e.target.value)}
                        placeholder="Leave blank for random..."
                        className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-neutral-900 outline-none"
                    />
                    <button onClick={handleRandom} className="p-3 bg-neutral-100 text-neutral-500 rounded-xl hover:bg-neutral-200 transition-colors"><Dices size={18}/></button>
                </div>
            </div>
        </main>
        
        <footer className="px-8 py-6 border-t border-neutral-100 flex justify-end shrink-0 bg-neutral-50/50 rounded-b-[2.5rem]">
          <button onClick={handleStart} className="px-8 py-4 bg-indigo-600 text-white rounded-2xl font-black text-xs flex items-center space-x-2 transition-all hover:bg-indigo-500 active:scale-95 disabled:opacity-50 uppercase tracking-widest shadow-lg">
            <Sparkles size={16} />
            <span>Next: Generate with AI</span>
          </button>
        </footer>
      </div>
    </div>
  );
};

export default FullTestSetupModal;