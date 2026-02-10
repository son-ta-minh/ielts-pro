import React, { useState, useEffect } from 'react';
import { User } from '../../app/types';
import { getAllUsers, saveUser } from '../../app/db';
import { AuthViewUI } from './AuthView_UI';
import { ADVENTURE_CHAPTERS } from '../../data/adventure_content';

interface Props {
  onLogin: (user: User) => void;
}

const AuthView: React.FC<Props> = ({ onLogin }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  
  // Form State
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('');
  const [newLevel, setNewLevel] = useState('');
  const [newTarget, setNewTarget] = useState('');
  const [newLanguage, setNewLanguage] = useState('English'); // DEFAULT: English
  const [newAudience, setNewAudience] = useState<'Kid' | 'Adult'>('Adult'); // DEFAULT: Adult
  const [selectedPersona, setSelectedPersona] = useState<string>('learner');
  
  const [loading, setLoading] = useState(true);
  const [hasApiKey, setHasApiKey] = useState<boolean>(true);

  // Personas data needed for logic mapping
  const personasData = [
    { id: 'learner', role: 'Vocab Learner', level: 'Intermediate English', target: 'Expand active vocabulary' },
    { id: 'professional', role: 'Working Professional', level: 'Intermediate English', target: 'Fluent business communication' },
    { id: 'student', role: 'Primary Student', level: 'Beginner English', target: 'Build school vocabulary' }
  ];

  useEffect(() => {
    checkApiKeyAndLoadUsers();
  }, []);
  
  useEffect(() => {
      if (isCreating) {
          handlePersonaSelect('learner'); // Set default when form opens
      }
  }, [isCreating]);

  const checkApiKeyAndLoadUsers = async () => {
    setLoading(true);
    try {
      if ((window as any).aistudio) {
        const hasKey = await (window as any).aistudio.hasSelectedApiKey();
        setHasApiKey(hasKey);
      }
      
      const allUsers = (await getAllUsers()).filter(u => !u.name.toLowerCase().includes('book'));
      setUsers(allUsers);
    } catch (err) {
      console.error("Auth initialization error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectKey = async () => {
    if ((window as any).aistudio) {
      await (window as any).aistudio.openSelectKey();
      setHasApiKey(true);
    }
  };
  
  const handlePersonaSelect = (personaId: string) => {
    const persona = personasData.find(p => p.id === personaId);
    if (persona) {
        setSelectedPersona(personaId);
        setNewRole(persona.role);
        setNewLevel(persona.level);
        setNewTarget(persona.target);
        setNewAudience(personaId === 'student' ? 'Kid' : 'Adult');
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
      target: newTarget.trim(),
      nativeLanguage: newLanguage,
      experience: 0,
      level: 1,
      peakLevel: 1,
      adventure: {
        currentNodeIndex: 0,
        energyShards: 0,
        energy: 5, // Start with some energy
        keys: 1,
        keyFragments: 0,
        badges: [],
        unlockedChapterIds: ADVENTURE_CHAPTERS.map(c => c.id),
        completedSegmentIds: [],
        segmentStars: {},
      },
      lessonPreferences: {
          language: newLanguage as 'English' | 'Vietnamese',
          targetAudience: newAudience,
          tone: newAudience === 'Kid' ? 'friendly_elementary' : 'professional_professor'
      }
    };

    await saveUser(newUser);
    onLogin(newUser);
  };

  return (
    <AuthViewUI
      users={users}
      isCreating={isCreating}
      setIsCreating={setIsCreating}
      loading={loading}
      hasApiKey={hasApiKey}
      newName={newName}
      setNewName={setNewName}
      newRole={newRole}
      setNewRole={setNewRole}
      newLevel={newLevel}
      setNewLevel={setNewLevel}
      newTarget={newTarget}
      setNewTarget={setNewTarget}
      newLanguage={newLanguage}
      setNewLanguage={setNewLanguage}
      newAudience={newAudience}
      setNewAudience={setNewAudience}
      selectedPersona={selectedPersona}
      handleSelectKey={handleSelectKey}
      handlePersonaSelect={handlePersonaSelect}
      handleCreateProfile={handleCreateProfile}
      onLogin={onLogin}
    />
  );
};

export default AuthView;