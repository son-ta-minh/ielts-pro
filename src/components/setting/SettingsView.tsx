
import React, { useRef, useState, useEffect } from 'react';
import { RotateCw, ShieldAlert } from 'lucide-react';
import { User as UserType } from '../../app/types';
import * as dataStore from '../../app/dataStore';
import { resetProgress } from '../../utils/srs';
import { getAvailableVoices } from '../../utils/audio';
import ConfirmationModal from '../../components/common/ConfirmationModal';
import { getConfig, saveConfig, SystemConfig, DEFAULT_SRS_CONFIG } from '../../app/settingsManager';
import { SettingsViewUI, SettingView } from './SettingsView_UI';
import { InterfaceSettings } from './InterfaceSettings'; 
import { useToast } from '../../contexts/ToastContext';

interface Props {
  user: UserType;
  onUpdateUser: (user: UserType) => Promise<void>;
  onRefresh: () => Promise<void>;
  onNuke: () => void;
  apiUsage: { count: number; date: string };
}

export const SettingsView: React.FC<Props> = ({ user, onUpdateUser, onRefresh, onNuke, apiUsage }) => {
  const mobileNavRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();
  
  const [currentView, setCurrentView] = useState<SettingView>(() => {
    // Check for direct navigation request from Dashboard
    const jumpTo = sessionStorage.getItem('vocab_pro_settings_tab');
    if (jumpTo) {
        sessionStorage.removeItem('vocab_pro_settings_tab');
        return jumpTo as SettingView;
    }
    return 'PROFILE';
  });

  // Effect to handle navigation requests when the component is already mounted/alive
  useEffect(() => {
    const jumpTo = sessionStorage.getItem('vocab_pro_settings_tab');
    if (jumpTo) {
        sessionStorage.removeItem('vocab_pro_settings_tab');
        setCurrentView(jumpTo as SettingView);
    }
  }, []); // Run on mount

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  
  const [isNukeModalOpen, setIsNukeModalOpen] = useState(false);
  const [isClearProgressModalOpen, setIsClearProgressModalOpen] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);

  const [apiKeyInput, setApiKeyInput] = useState('');
  const [config, setConfig] = useState<SystemConfig>(getConfig());
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [isVoiceLoading, setIsVoiceLoading] = useState(true);
  const [isApplyingAccent, setIsApplyingAccent] = useState(false);
  
  const [profileData, setProfileData] = useState({
    name: user.name,
    avatar: user.avatar,
    role: user.role || '',
    currentLevel: user.currentLevel || '',
    target: user.target || '',
    nativeLanguage: user.nativeLanguage || 'English',
    lessonLanguage: user.lessonPreferences?.language || 'English',
    lessonAudience: user.lessonPreferences?.targetAudience || 'Adult', // DEFAULT: Adult
  });
  
  useEffect(() => {
    setProfileData({ 
        name: user.name, 
        avatar: user.avatar,
        role: user.role || '', 
        currentLevel: user.currentLevel || '', 
        target: user.target || '', 
        nativeLanguage: user.nativeLanguage || 'English',
        lessonLanguage: user.lessonPreferences?.language || 'English',
        lessonAudience: user.lessonPreferences?.targetAudience || 'Adult',
    });
  }, [user]);

  useEffect(() => {
    const savedKeys = localStorage.getItem('gemini_api_keys') || '';
    setApiKeyInput(savedKeys);
    if (notification) { const timer = setTimeout(() => setNotification(null), 4000); return () => clearTimeout(timer); }
  }, [notification]);

  useEffect(() => {
    const loadVoices = async () => {
      setIsVoiceLoading(true);
      const voices = await getAvailableVoices();
      setAvailableVoices(voices);
      setIsVoiceLoading(false);
    };
    loadVoices();

    const handleConfigUpdate = () => {
        setConfig(getConfig());
    };
    window.addEventListener('config-updated', handleConfigUpdate);
    return () => {
        window.removeEventListener('config-updated', handleConfigUpdate);
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => { if (mobileNavRef.current && !mobileNavRef.current.contains(event.target as Node)) { setIsDropdownOpen(false); } };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleConfigChange = (section: keyof SystemConfig, key: any, value: any) => {
    setConfig(prev => {
        const newConfig = { ...prev };
        
        if (key === null && typeof value === 'object') {
            // Full section replacement
            (newConfig as any)[section] = value;
        } else {
            // Partial update
            (newConfig as any)[section] = { ...(prev as any)[section], [key]: value };
        }
        return newConfig;
    });
  };
  
  const handleProfileChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setProfileData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };
  
  const handleAvatarChange = (url: string) => {
    setProfileData(prev => ({ ...prev, avatar: url }));
  };

  const handleSaveProfile = async () => {
    const updatedUser: UserType = { 
        ...user, 
        name: profileData.name.trim() || user.name, 
        role: profileData.role.trim(), 
        currentLevel: profileData.currentLevel.trim(), 
        target: profileData.target.trim(), 
        nativeLanguage: profileData.nativeLanguage, 
        avatar: profileData.avatar, // Save the specific avatar URL
        lessonPreferences: {
            language: profileData.lessonLanguage as 'English' | 'Vietnamese',
            targetAudience: profileData.lessonAudience.trim() as 'Kid' | 'Adult',
            // Persona is now pulled from the active coach in AudioCoachSettings
            tone: config.audioCoach.coaches[config.audioCoach.activeCoach].persona
        }
    };
    await onUpdateUser(updatedUser);
    setNotification('Profile & Preferences updated successfully!');
  };

  const handleSaveApiKeys = () => { localStorage.setItem('gemini_api_keys', apiKeyInput.trim()); setNotification('API Keys have been saved locally.'); };
  const handleResetUsage = () => { localStorage.removeItem('vocab_pro_api_usage'); window.dispatchEvent(new CustomEvent('apiUsageUpdated')); setNotification('API usage counter has been reset.'); };
  
  const handleSrsConfigChange = (e: React.ChangeEvent<HTMLInputElement>) => { handleConfigChange('srs', e.target.name, parseFloat(e.target.value)); };
  
  const handleAiConfigChange = (e: React.ChangeEvent<HTMLInputElement>) => { 
      const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
      handleConfigChange('ai', e.target.name, value); 
  };
  
  const handleGoalConfigChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleConfigChange('dailyGoals', e.target.name, parseInt(e.target.value, 10));
  };
  
  const handleSaveSettings = () => { saveConfig(config); setNotification('Settings saved!'); };
  const handleResetSrsConfig = () => { setConfig(prev => ({...prev, srs: DEFAULT_SRS_CONFIG})); setNotification('SRS settings reset to defaults.'); };
  
  const handleClearProgress = async () => {
    setIsClearing(true);
    try {
        const allWords = await dataStore.getAllWords();
        const resetWords = allWords.map(word => resetProgress(word));
        await dataStore.bulkSaveWords(resetWords);
        setNotification("All learning progress has been reset.");
    } catch (err) { 
        showToast('Failed to clear progress: ' + (err as Error).message, 'error');
    } 
    finally { setIsClearing(false); setIsClearProgressModalOpen(false); }
  };

  const handleToggleAdmin = async () => {
      await onUpdateUser({ ...user, isAdmin: !user.isAdmin });
      setNotification(`Developer Mode ${!user.isAdmin ? 'Enabled' : 'Disabled'}`);
  };
  
  return (
    <>
      <SettingsViewUI
        currentView={currentView}
        isDropdownOpen={isDropdownOpen}
        notification={notification}
        profileData={profileData}
        config={config}
        isVoiceLoading={isVoiceLoading}
        availableVoices={availableVoices}
        apiKeyInput={apiKeyInput}
        apiUsage={apiUsage}
        mobileNavRef={mobileNavRef}
        setCurrentView={setCurrentView}
        setIsDropdownOpen={setIsDropdownOpen}
        onProfileChange={handleProfileChange}
        onAvatarChange={handleAvatarChange}
        onSaveProfile={handleSaveProfile}
        onConfigChange={handleConfigChange}
        onAiConfigChange={handleAiConfigChange}
        onApiKeyInputChange={(e) => setApiKeyInput(e.target.value)}
        onSaveApiKeys={handleSaveApiKeys}
        onResetUsage={handleResetUsage}
        onSaveSettings={handleSaveSettings}
        onSrsConfigChange={handleSrsConfigChange}
        onResetSrsConfig={handleResetSrsConfig}
        onOpenClearProgressModal={() => setIsClearProgressModalOpen(true)}
        onOpenNukeModal={() => setIsNukeModalOpen(true)}
        isApplyingAccent={isApplyingAccent}
        onApplyAccent={() => {}}
        isAdmin={!!user.isAdmin}
        onToggleAdmin={handleToggleAdmin}
        goalConfig={config.dailyGoals}
        onGoalConfigChange={handleGoalConfigChange}
      >
        {currentView === 'INTERFACE' && <InterfaceSettings />}
      </SettingsViewUI>
      <ConfirmationModal 
        isOpen={isNukeModalOpen}
        title="Delete all data?"
        message={<>This will permanently delete <strong className="text-red-600">ALL</strong> vocabulary, progress, and profiles. This action cannot be undone.</>}
        confirmText="YES, DELETE EVERYTHING"
        isProcessing={false}
        onConfirm={() => { onNuke(); setIsNukeModalOpen(false); }}
        onClose={() => setIsNukeModalOpen(false)}
        confirmButtonClass="bg-red-600 text-white hover:bg-red-700 shadow-red-200"
        icon={<ShieldAlert size={40} className="text-red-500" />}
      />
      <ConfirmationModal 
        isOpen={isClearProgressModalOpen} 
        title="Clear All Progress?" 
        message="This will reset the review schedule for ALL words in your library. Your words and their content will NOT be deleted. This action cannot be undone." 
        confirmText="Yes, Clear Progress" 
        isProcessing={isClearing} 
        onConfirm={handleClearProgress} 
        onClose={() => setIsClearProgressModalOpen(false)} 
        icon={<RotateCw size={40} className="text-orange-500"/>} 
        confirmButtonClass="bg-orange-50 text-white hover:bg-orange-600 shadow-orange-200" 
      />
    </>
  );
};
