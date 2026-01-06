import React, { useState, useEffect } from 'react';
import { UserPlus, User as UserIcon, LogIn, Sparkles, ChevronRight, Loader2, Plus, Key, ExternalLink, AlertCircle, BrainCircuit, Briefcase, GraduationCap } from 'lucide-react';
import { User } from '../app/types';
import { getAllUsers, saveUser } from '../app/db';

interface Props {
  onLogin: (user: User) => void;
}

/* Removed redundant global Window interface declaration for aistudio as it conflicts with existing environment types */

const AuthView: React.FC<Props> = ({ onLogin }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('');
  const [newLevel, setNewLevel] = useState('');
  const [newTarget, setNewTarget] = useState('');
  const [loading, setLoading] = useState(true);
  const [hasApiKey, setHasApiKey] = useState<boolean>(true);
  const [selectedPersona, setSelectedPersona] = useState<string>('ielts');

  const personas = [
    { id: 'ielts', label: 'IELTS Candidate', icon: BrainCircuit, role: 'IELTS Candidate', level: 'Band 6.0', target: 'Band 8.0+' },
    { id: 'professional', label: 'Professional', icon: Briefcase, role: 'Working Professional', level: 'Intermediate English', target: 'Fluent business communication' },
    { id: 'student', label: 'Student', icon: GraduationCap, role: 'Primary Student', level: 'Beginner English', target: 'Build school vocabulary' }
  ];

  useEffect(() => {
    checkApiKeyAndLoadUsers();
  }, []);
  
  useEffect(() => {
      if (isCreating) {
          handlePersonaSelect('ielts'); // Set default when form opens
      }
  }, [isCreating]);


  const checkApiKeyAndLoadUsers = async () => {
    setLoading(true);
    try {
      // Check for API key in this specific environment
      if (window.aistudio) {
        const hasKey = await window.aistudio.hasSelectedApiKey();
        setHasApiKey(hasKey);
      }
      
      const allUsers = await getAllUsers();
      setUsers(allUsers);
    } catch (err) {
      console.error("Auth initialization error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectKey = async () => {
    if (window.aistudio) {
      await window.aistudio.openSelectKey();
      // Assume success as per race condition mitigation rules
      setHasApiKey(true);
    }
  };
  
  const handlePersonaSelect = (personaId: string) => {
    const persona = personas.find(p => p.id === personaId);
    if (persona) {
        setSelectedPersona(personaId);
        setNewRole(persona.role);
        setNewLevel(persona.level);
        setNewTarget(persona.target);
    }
  };

  const handleCreateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    
    const newUser: User = {
      id: 'u-' + Date.now(),
      name: newName.trim(),
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${newName}`,
      lastLogin: Date.now(),
      role: newRole.trim(),
      currentLevel: newLevel.trim(),
      target: newTarget.trim()
    };

    await saveUser(newUser);
    onLogin(newUser);
  };

  if (loading) return (
    <div className="h-screen flex items-center justify-center bg-neutral-50">
      <div className="flex flex-col items-center space-y-4">
        <Loader2 className="animate-spin text-neutral-300" size={40} />
        <p className="text-xs font-black text-neutral-400 uppercase tracking-widest">Initializing Lab...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 p-6">
      <div className="max-w-md w-full space-y-10">
        <div className="text-center space-y-2">
          <div className="inline-flex p-4 bg-white rounded-3xl shadow-sm border border-neutral-100 mb-4">
            <Sparkles className="text-neutral-900" size={32} />
          </div>
          <h1 className="text-4xl font-black text-neutral-900 tracking-tight">IELTS Pro</h1>
          <p className="text-neutral-500 font-medium italic">Master your vocabulary with AI-powered Spaced Repetition</p>
        </div>

        {!hasApiKey && users.length === 0 && (
          <div className="bg-amber-50 border-2 border-amber-100 p-6 rounded-[2rem] space-y-4 animate-in fade-in slide-in-from-top-4">
            <div className="flex items-start space-x-3 text-amber-800">
              <AlertCircle size={24} className="shrink-0 mt-1" />
              <div>
                <h3 className="font-black text-lg">AI Configuration Required</h3>
                <p className="text-sm font-medium mt-1 opacity-80">To enable AI word analysis and suggestions, you must select a Gemini API key.</p>
              </div>
            </div>
            
            <div className="space-y-3">
              <button 
                onClick={handleSelectKey}
                className="w-full py-4 bg-amber-600 text-white font-black rounded-2xl shadow-lg hover:bg-amber-700 transition-all flex items-center justify-center space-x-2 active:scale-95"
              >
                <Key size={18} />
                <span>CONNECT GEMINI API</span>
              </button>
              
              <a 
                href="https://ai.google.dev/gemini-api/docs/billing" 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center justify-center space-x-1.5 text-[10px] font-black text-amber-600 uppercase tracking-widest hover:underline"
              >
                <span>Billing Documentation</span>
                <ExternalLink size={10} />
              </a>
            </div>
          </div>
        )}

        {isCreating ? (
          <form onSubmit={handleCreateProfile} className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-neutral-200 animate-in zoom-in-95 duration-300 space-y-6">
            <h2 className="text-xl font-bold flex items-center"><UserPlus className="mr-2" size={20}/> Create Profile</h2>
            
            <div>
              <label className="block text-xs font-bold text-neutral-400 uppercase tracking-widest mb-2">Display Name</label>
              <input 
                autoFocus
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Enter your name"
                className="w-full px-5 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-md font-bold focus:ring-2 focus:ring-neutral-900 focus:outline-none"
              />
            </div>

            <div className="space-y-3">
              <label className="block text-xs font-bold text-neutral-400 uppercase tracking-widest">About Me (Quick Start)</label>
              <div className="grid grid-cols-3 gap-2">
                {personas.map(p => {
                  const Icon = p.icon;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handlePersonaSelect(p.id)}
                      className={`p-3 border-2 rounded-2xl flex flex-col items-center justify-center space-y-1.5 transition-all text-center ${
                        selectedPersona === p.id 
                        ? 'bg-neutral-900 border-neutral-900 text-white shadow-lg' 
                        : 'bg-white border-neutral-100 text-neutral-400 hover:border-neutral-200 hover:text-neutral-900'
                      }`}
                    >
                      <Icon size={20} />
                      <span className="text-[10px] font-black uppercase tracking-tight">{p.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="space-y-4 pt-4 border-t border-neutral-100">
              <div>
                <label className="block text-xs font-bold text-neutral-400 uppercase tracking-widest mb-2">Occupation / Role</label>
                <input 
                  type="text"
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  placeholder="e.g., Working Professional, Student"
                  className="w-full px-5 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-md font-medium focus:ring-2 focus:ring-neutral-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-400 uppercase tracking-widest mb-2">Current Level</label>
                <input 
                  type="text"
                  value={newLevel}
                  onChange={(e) => setNewLevel(e.target.value)}
                  placeholder="e.g., Intermediate, IELTS Band 6.0"
                  className="w-full px-5 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-md font-medium focus:ring-2 focus:ring-neutral-900 focus:outline-none"
                />
              </div>
              
              <div>
                <label className="block text-xs font-bold text-neutral-400 uppercase tracking-widest mb-2">Target</label>
                <input 
                  type="text"
                  value={newTarget}
                  onChange={(e) => setNewTarget(e.target.value)}
                  placeholder="e.g., Fluent communication, IELTS Band 8.0"
                  className="w-full px-5 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-md font-medium focus:ring-2 focus:ring-neutral-900 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex space-x-3 pt-4">
              <button 
                type="button" 
                onClick={() => setIsCreating(false)}
                className="flex-1 py-4 text-neutral-500 font-bold hover:bg-neutral-50 rounded-2xl transition-colors"
              >
                Back
              </button>
              <button 
                type="submit"
                disabled={!newName.trim()}
                className="flex-[2] py-4 bg-neutral-900 text-white font-bold rounded-2xl shadow-lg hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
              >
                Start Learning
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3">
              {users.map(user => (
                <button 
                  key={user.id}
                  onClick={() => onLogin(user)}
                  className="bg-white p-5 rounded-3xl border border-neutral-200 shadow-sm flex items-center justify-between hover:border-neutral-900 hover:shadow-md transition-all group"
                >
                  <div className="flex items-center space-x-4">
                    <img src={user.avatar} className="w-12 h-12 rounded-2xl bg-neutral-100 p-1" alt={user.name} />
                    <div className="text-left">
                      <div className="font-bold text-neutral-900">{user.name}</div>
                      <div className="text-xs text-neutral-400">Last seen: {new Date(user.lastLogin).toLocaleDateString()}</div>
                    </div>
                  </div>
                  <ChevronRight size={20} className="text-neutral-300 group-hover:text-neutral-900 transition-colors" />
                </button>
              ))}
            </div>

            <button 
              onClick={() => setIsCreating(true)}
              className="w-full p-5 bg-neutral-100 border border-dashed border-neutral-300 text-neutral-500 rounded-3xl font-bold flex items-center justify-center space-x-2 hover:bg-neutral-200 transition-all"
            >
              <Plus size={20} />
              <span>Add New User</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuthView;