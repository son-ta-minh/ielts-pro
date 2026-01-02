import React, { useState, useEffect } from 'react';
import { UserPlus, User as UserIcon, LogIn, Sparkles, ChevronRight, Loader2, Plus } from 'lucide-react';
import { User } from '../types';
import { getAllUsers, saveUser } from '../services/db';

interface Props {
  onLogin: (user: User) => void;
}

const AuthView: React.FC<Props> = ({ onLogin }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    const allUsers = await getAllUsers();
    setUsers(allUsers);
    setLoading(false);
  };

  const handleCreateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    
    const newUser: User = {
      id: 'u-' + Date.now(),
      name: newName.trim(),
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${newName}`,
      lastLogin: Date.now()
    };

    await saveUser(newUser);
    onLogin(newUser);
  };

  if (loading) return (
    <div className="h-screen flex items-center justify-center">
      <Loader2 className="animate-spin text-neutral-300" size={32} />
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
          <p className="text-neutral-500 font-medium">Select your profile to start learning</p>
        </div>

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
                className="w-full px-5 py-4 bg-neutral-50 border border-neutral-200 rounded-2xl text-lg font-bold focus:ring-2 focus:ring-neutral-900 focus:outline-none"
              />
            </div>
            <div className="flex space-x-3">
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