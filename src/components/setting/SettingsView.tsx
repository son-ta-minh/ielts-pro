import React, { useRef, useState, useEffect } from 'react';
import { RotateCw, ShieldAlert, Wrench } from 'lucide-react';
import { User as UserType, VocabularyItem } from '../../app/types';
import * as dataStore from '../../app/dataStore';
import { resetProgress } from '../../utils/srs';
import { getAvailableVoices, speak, getBestVoice } from '../../utils/audio';
import { processJsonImport, generateJsonExport } from '../../utils/dataHandler';
import ConfirmationModal from '../common/ConfirmationModal';
import { getConfig, saveConfig, SystemConfig, DEFAULT_SRS_CONFIG, DEFAULT_DAILY_GOAL_CONFIG } from '../../app/settingsManager';
import { SettingsViewUI, SettingView } from './SettingsView_UI';
import { InterfaceSettings } from './InterfaceSettings'; // Import the new component
import { GoalSettings } from './GoalSettings';
import { useToast } from '../../contexts/ToastContext';
import { calculateGameEligibility } from '../../utils/gameEligibility';

interface Props {
  user: UserType;
  onUpdateUser: (user: UserType) => Promise<void>;
  onRefresh: () => Promise<void>;
  onNuke: () => void;
  apiUsage: { count: number; date: string };
}

export const SettingsView: React.FC<Props> = ({ user, onUpdateUser, onRefresh, onNuke, apiUsage }) => {
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const mobileNavRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();
  
  const [currentView, setCurrentView] = useState<SettingView>('PROFILE');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  
  const [includeProgress, setIncludeProgress] = useState(true);
  const [includeEssays, setIncludeEssays] = useState(true);
  
  const [importStatus, setImportStatus] = useState<{ type: 'success' | 'error' | 'info', message: string, detail?: string } | null>(null);
  
  const [isNukeModalOpen, setIsNukeModalOpen] = useState(false);
  const [isClearProgressModalOpen, setIsClearProgressModalOpen] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);

  const [isNormalizeModalOpen, setIsNormalizeModalOpen] = useState(false);
  const [isNormalizing, setIsNormalizing] = useState(false);

  const [apiKeyInput, setApiKeyInput] = useState('');
  const [config, setConfig] = useState<SystemConfig>(getConfig());
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [isVoiceLoading, setIsVoiceLoading] = useState(true);
  const [isApplyingAccent, setIsApplyingAccent] = useState(false);

  const [profileData, setProfileData] = useState({
    name: user.name,
    role: user.role || '',
    currentLevel: user.currentLevel || '',
    target: user.target || '',
    nativeLanguage: user.nativeLanguage || 'Vietnamese'
  });
  
  useEffect(() => {
    setProfileData({ name: user.name, role: user.role || '', currentLevel: user.currentLevel || '', target: user.target || '', nativeLanguage: user.nativeLanguage || 'Vietnamese' });
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
      if (!getConfig().audio.preferredSystemVoice && voices.length > 0) {
        const best = getBestVoice();
        if (best) { handleConfigChange('audio', 'preferredSystemVoice', best.name); }
      }
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
    setConfig(prev => ({ ...prev, [section]: { ...prev[section], [key]: value, }, }));
  };

  const handleProfileChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setProfileData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSaveProfile = async () => {
    const updatedUser: UserType = { ...user, name: profileData.name.trim() || user.name, role: profileData.role.trim(), currentLevel: profileData.currentLevel.trim(), target: profileData.target.trim(), nativeLanguage: profileData.nativeLanguage, avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${profileData.name.trim() || user.name}` };
    await onUpdateUser(updatedUser);
    setNotification('Profile updated successfully!');
  };

  const handleSaveApiKeys = () => { localStorage.setItem('gemini_api_keys', apiKeyInput.trim()); setNotification('API Keys have been saved locally.'); };
  const handleResetUsage = () => { localStorage.removeItem('vocab_pro_api_usage'); window.dispatchEvent(new CustomEvent('apiUsageUpdated')); setNotification('API usage counter has been reset.'); };
  const handleAudioModeChange = (mode: 'system' | 'ai') => { handleConfigChange('audio', 'mode', mode); speak("Hello! This is a voice test.", config.audio.preferredSystemVoice); };
  const handleVoiceChange = (e: React.ChangeEvent<HTMLSelectElement>) => { handleConfigChange('audio', 'preferredSystemVoice', e.target.value); speak("Hello! I am your vocabulary coach.", e.target.value); };
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
  
  const handleJSONImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportStatus(null);
    const result = await processJsonImport(file, user.id, includeProgress);
    setImportStatus(result);
    if (result.type === 'success') {
      showToast('Restore successful! The app will now reload.', 'success', 2000);
      if (result.updatedUser) {
        await dataStore.saveUser(result.updatedUser);
      }
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    }
    if (jsonInputRef.current) jsonInputRef.current.value = '';
  };

  const handleJSONExport = async () => {
    await generateJsonExport(user.id, includeProgress, includeEssays, user);
  };
  
  const handleClearProgress = async () => {
    setIsClearing(true);
    try {
        const allWords = await dataStore.getAllWords();
        const resetWords = allWords.map(word => resetProgress(word));
        await dataStore.bulkSaveWords(resetWords);
        // DataStore event will trigger refresh
        setNotification("All learning progress has been reset.");
    } catch (err) { setImportStatus({ type: 'error', message: 'Failed to clear progress', detail: (err as Error).message }); } 
    finally { setIsClearing(false); setIsClearProgressModalOpen(false); }
  };

  const handleRefreshGameIndex = async () => {
    try {
        const allWords = await dataStore.getAllWords();
        const updatedWords = allWords.map(word => ({
            ...word,
            gameEligibility: calculateGameEligibility(word),
            updatedAt: Date.now()
        }));
        await dataStore.bulkSaveWords(updatedWords);
        showToast(`Refreshed index for ${updatedWords.length} words.`, "success");
    } catch (err) {
        showToast("Failed to refresh game index.", "error");
    }
  };

  const handleNormalizeData = async () => {
    setIsNormalizing(true);
    setIsNormalizeModalOpen(false);
    
    try {
        const allWords = dataStore.getAllWords();
        
        const wordsToUpdate = allWords.filter(word => {
            const isMultiWord = word.isIdiom || word.isPhrasalVerb || word.isCollocation || word.isStandardPhrase;
            const hasDataToClean = !!word.wordFamily || (word.collocationsArray && word.collocationsArray.length > 0);
            return isMultiWord && hasDataToClean;
        });

        if (wordsToUpdate.length === 0) {
            showToast("All multi-word items are already normalized.", "info");
            return;
        }

        const updatedWords = wordsToUpdate.map(word => ({
            ...word,
            wordFamily: undefined,
            collocations: undefined,
            collocationsArray: undefined,
            updatedAt: Date.now()
        }));

        await dataStore.bulkSaveWords(updatedWords);
        showToast(`Normalized ${updatedWords.length} multi-word items.`, "success");

    } catch (err) {
        showToast("Failed to normalize data.", "error");
        console.error("Normalization Error:", err);
    } finally {
        setIsNormalizing(false);
    }
  };

  const handleApplyAccent = async () => {
    setIsApplyingAccent(true);
    try {
      const newAccent = config.audio.preferredAccent;
      const allWords = dataStore.getAllWords();
      const wordsToUpdate: VocabularyItem[] = [];

      for (const word of allWords) {
          const ipaToApply = newAccent === 'US' ? word.ipaUs : word.ipaUk;
          if (ipaToApply && ipaToApply !== word.ipa) {
              const updatedWord = { ...word, ipa: ipaToApply, updatedAt: Date.now() };
              wordsToUpdate.push(updatedWord);
          }
      }

      if (wordsToUpdate.length > 0) {
        await dataStore.bulkSaveWords(wordsToUpdate);
      }
      
      const newConfig = { ...config, audio: { ...config.audio, appliedAccent: newAccent } };
      saveConfig(newConfig);
      
      showToast(`Applied ${newAccent} accent to ${wordsToUpdate.length} words.`, 'success');
    } catch (err) {
      showToast('Failed to apply accent.', 'error');
    } finally {
      setIsApplyingAccent(false);
    }
  };

  return (
    <>
      <SettingsViewUI
        currentView={currentView}
        isDropdownOpen={isDropdownOpen}
        notification={notification}
        importStatus={importStatus}
        profileData={profileData}
        config={config}
        isVoiceLoading={isVoiceLoading}
        availableVoices={availableVoices}
        apiKeyInput={apiKeyInput}
        apiUsage={apiUsage}
        jsonInputRef={jsonInputRef}
        includeProgress={includeProgress}
        includeEssays={includeEssays}
        mobileNavRef={mobileNavRef}
        setCurrentView={setCurrentView}
        setIsDropdownOpen={setIsDropdownOpen}
        onProfileChange={handleProfileChange}
        onSaveProfile={handleSaveProfile}
        onConfigChange={handleConfigChange}
        onAiConfigChange={handleAiConfigChange}
        onAudioModeChange={handleAudioModeChange}
        onVoiceChange={handleVoiceChange}
        onApiKeyInputChange={(e) => setApiKeyInput(e.target.value)}
        onSaveApiKeys={handleSaveApiKeys}
        onResetUsage={handleResetUsage}
        onSaveSettings={handleSaveSettings}
        setIncludeProgress={setIncludeProgress}
        setIncludeEssays={setIncludeEssays}
        onJSONImport={handleJSONImport}
        onJSONExport={handleJSONExport}
        onSrsConfigChange={handleSrsConfigChange}
        onResetSrsConfig={handleResetSrsConfig}
        onOpenClearProgressModal={() => setIsClearProgressModalOpen(true)}
        onOpenNukeModal={() => setIsNukeModalOpen(true)}
        onRefreshGameIndex={handleRefreshGameIndex}
        isNormalizing={isNormalizing}
        onOpenNormalizeModal={() => setIsNormalizeModalOpen(true)}
        isApplyingAccent={isApplyingAccent}
        onApplyAccent={handleApplyAccent}
      >
        {currentView === 'INTERFACE' && <InterfaceSettings />}
        {currentView === 'GOALS' && <GoalSettings goalConfig={config.dailyGoals} onGoalConfigChange={handleGoalConfigChange} />}
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
        confirmButtonClass="bg-orange-500 text-white hover:bg-orange-600 shadow-orange-200" 
      />
       <ConfirmationModal
          isOpen={isNormalizeModalOpen}
          title="Normalize Data?"
          message="This will remove word family and collocation data from multi-word items (phrases, idioms, etc.) to align with new standards. This action is not reversible."
          confirmText="Yes, Normalize"
          isProcessing={isNormalizing}
          onConfirm={handleNormalizeData}
          onClose={() => setIsNormalizeModalOpen(false)}
          icon={<Wrench size={40} className="text-orange-500"/>} 
          confirmButtonClass="bg-orange-500 text-white hover:bg-orange-600 shadow-orange-200"
      />
    </>
  );
};