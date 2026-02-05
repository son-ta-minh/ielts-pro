
import React, { useRef, useState, useEffect } from 'react';
import { RotateCw, ShieldAlert, Wrench } from 'lucide-react';
import { User as UserType, VocabularyItem, DataScope } from '../../app/types';
import * as dataStore from '../../app/dataStore';
import { resetProgress } from '../../utils/srs';
import { getAvailableVoices, speak } from '../../utils/audio';
import { processJsonImport, generateJsonExport } from '../../utils/dataHandler';
import ConfirmationModal from '../../components/common/ConfirmationModal';
import { getConfig, saveConfig, SystemConfig, DEFAULT_SRS_CONFIG } from '../../app/settingsManager';
import { SettingsViewUI, SettingView } from './SettingsView_UI';
import { InterfaceSettings } from './InterfaceSettings'; 
import { useToast } from '../../contexts/ToastContext';
import { getDatabaseStats, checkLocalStorageHealth } from '../../app/db';

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
  
  const [dataScope, setDataScope] = useState<DataScope>({
      user: true,
      vocabulary: true,
      lesson: true,
      reading: true,
      writing: true,
      speaking: true,
      listening: true,
      mimic: true,
      wordBook: true,
      calendar: true,
      planning: true
  });
  
  const [importStatus, setImportStatus] = useState<{ type: 'success' | 'error' | 'info', message: string, detail?: string } | null>(null);
  
  const [isNukeModalOpen, setIsNukeModalOpen] = useState(false);
  const [isClearProgressModalOpen, setIsClearProgressModalOpen] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);

  const [isNormalizeModalOpen, setIsNormalizeModalOpen] = useState(false);
  const [isNormalizing, setIsNormalizing] = useState(false);
  const [normalizeOptions, setNormalizeOptions] = useState({ removeJunkTags: true, removeMultiWordData: true, cleanHeadwords: true });


  const [apiKeyInput, setApiKeyInput] = useState('');
  const [config, setConfig] = useState<SystemConfig>(getConfig());
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [isVoiceLoading, setIsVoiceLoading] = useState(true);
  const [isApplyingAccent, setIsApplyingAccent] = useState(false);
  
  // Diagnostic State
  const [dbStats, setDbStats] = useState<Record<string, number> | null>(null);
  const [lsHealth, setLsHealth] = useState<{ hasBackup: boolean, backupSize: number, backupTimestamp: string } | null>(null);

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
        
        // Auto-save specific updates immediately if desired, otherwise rely on manual save
        // For server settings, users expect manual save usually, but let's keep consistency.
        // We generally rely on the "Save" button for big changes.
        
        return newConfig;
    });
  };
  
  const handleJunkTagsChange = (newJunkTags: string[]) => {
    handleConfigChange('interface', 'junkTags', newJunkTags);
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
  
  const handleJSONImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportStatus(null);
    const result = await processJsonImport(file, user.id, dataScope);
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
    await generateJsonExport(user.id, user, dataScope);
  };
  
  const handleClearProgress = async () => {
    setIsClearing(true);
    try {
        const allWords = await dataStore.getAllWords();
        const resetWords = allWords.map(word => resetProgress(word));
        await dataStore.bulkSaveWords(resetWords);
        setNotification("All learning progress has been reset.");
    } catch (err) { setImportStatus({ type: 'error', message: 'Failed to clear progress', detail: (err as Error).message }); } 
    finally { setIsClearing(false); setIsClearProgressModalOpen(false); }
  };

  const handleNormalizeData = async () => {
    setIsNormalizing(true);
    setIsNormalizeModalOpen(false);
    let totalUpdated = 0;
    const junkTagsSet = new Set(config.interface.junkTags.map(t => t.toLowerCase()));

    try {
        const allWords = dataStore.getAllWords();
        const wordsToUpdate: VocabularyItem[] = [];

        for (const word of allWords) {
            let changed = false;
            const updatedWord = { ...word };

            // Action 1: Remove Junk Tags
            if (normalizeOptions.removeJunkTags && junkTagsSet.size > 0 && updatedWord.tags) {
                const originalTagCount = updatedWord.tags.length;
                updatedWord.tags = updatedWord.tags.filter(tag => !junkTagsSet.has(tag.toLowerCase()));
                if (updatedWord.tags.length !== originalTagCount) {
                    changed = true;
                }
            }

            // Action 2: Clean Multi-Word Items
            if (normalizeOptions.removeMultiWordData) {
                const isMultiWord = updatedWord.isIdiom || updatedWord.isPhrasalVerb || updatedWord.isCollocation || updatedWord.isStandardPhrase;
                if (isMultiWord) {
                    if (updatedWord.wordFamily) {
                        updatedWord.wordFamily = undefined;
                        changed = true;
                    }
                    if (updatedWord.collocationsArray && updatedWord.collocationsArray.length > 0) {
                        updatedWord.collocations = undefined;
                        updatedWord.collocationsArray = undefined;
                        changed = true;
                    }
                }
            }
            
            // Action 3: Clean Headwords (remove quotes)
            if (normalizeOptions.cleanHeadwords) {
                if (updatedWord.word && updatedWord.word.includes('"')) {
                    updatedWord.word = updatedWord.word.replace(/"/g, '').trim();
                    changed = true;
                }
            }

            if (changed) {
                updatedWord.updatedAt = Date.now();
                wordsToUpdate.push(updatedWord);
            }
        }
        
        totalUpdated = wordsToUpdate.length;
        if (totalUpdated > 0) {
            await dataStore.bulkSaveWords(wordsToUpdate);
        }

        let successMessage = `Normalized ${totalUpdated} item(s).`;
        if (totalUpdated === 0) successMessage = "No items needed normalization based on selected options.";
        showToast(successMessage, "success");

    } catch (err) {
        showToast("Failed to normalize data.", "error");
        console.error("Normalization Error:", err);
    } finally {
        setIsNormalizing(false);
    }
  };
  
  const handleRunDiagnostics = async () => {
      setDbStats(null);
      setLsHealth(null);
      
      const stats = await getDatabaseStats();
      setDbStats(stats);
      
      const ls = checkLocalStorageHealth();
      setLsHealth(ls);
      
      showToast("Diagnostic run complete.", "info");
  };

  const handleToggleAdmin = async () => {
      await onUpdateUser({ ...user, isAdmin: !user.isAdmin });
      setNotification(`Developer Mode ${!user.isAdmin ? 'Enabled' : 'Disabled'}`);
  };
  
  const Checkbox = ({ id, label, checked, onChange }: { id: string, label: string, checked: boolean, onChange: (checked: boolean) => void }) => (
    <label htmlFor={id} className="flex items-center gap-2 p-3 bg-neutral-50 rounded-lg border border-neutral-200 cursor-pointer">
      <input id={id} type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
      <span className="text-sm font-medium">{label}</span>
    </label>
  );

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
        dataScope={dataScope}
        onDataScopeChange={setDataScope}
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
        onJSONImport={handleJSONImport}
        onJSONExport={handleJSONExport}
        onSrsConfigChange={handleSrsConfigChange}
        onResetSrsConfig={handleResetSrsConfig}
        onOpenClearProgressModal={() => setIsClearProgressModalOpen(true)}
        onOpenNukeModal={() => setIsNukeModalOpen(true)}
        isNormalizing={isNormalizing}
        onOpenNormalizeModal={() => setIsNormalizeModalOpen(true)}
        isApplyingAccent={isApplyingAccent}
        onApplyAccent={() => {}}
        isAdmin={!!user.isAdmin}
        onToggleAdmin={handleToggleAdmin}
        junkTags={config.interface.junkTags}
        onJunkTagsChange={handleJunkTagsChange}
        normalizeOptions={normalizeOptions}
        onNormalizeOptionsChange={setNormalizeOptions}
        goalConfig={config.dailyGoals}
        onGoalConfigChange={handleGoalConfigChange}
        // Diagnostic Props
        dbStats={dbStats}
        lsHealth={lsHealth}
        onRunDiagnostics={handleRunDiagnostics}
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
       <ConfirmationModal
          isOpen={isNormalizeModalOpen}
          title="Normalize Data"
          message={
            <div className="space-y-4 text-left">
                <p>Select normalization actions to perform. This process will update your entire library and cannot be undone.</p>
                <Checkbox 
                    id="norm-junk" 
                    label="Remove junk tags from all words" 
                    checked={normalizeOptions.removeJunkTags} 
                    onChange={c => setNormalizeOptions(o => ({...o, removeJunkTags: c}))} 
                />
                <Checkbox 
                    id="norm-multi" 
                    label="Clean multi-word items (phrases, idioms)" 
                    checked={normalizeOptions.removeMultiWordData} 
                    onChange={c => setNormalizeOptions(o => ({...o, removeMultiWordData: c}))} 
                />
                <Checkbox 
                    id="norm-quotes" 
                    label="Clean headwords (remove quotes)" 
                    checked={normalizeOptions.cleanHeadwords} 
                    onChange={c => setNormalizeOptions(o => ({...o, cleanHeadwords: c}))} 
                />
            </div>
          }
          confirmText="Yes, Normalize"
          isProcessing={isNormalizing}
          onConfirm={handleNormalizeData}
          onClose={() => setIsNormalizeModalOpen(false)}
          icon={<Wrench size={40} className="text-orange-500"/>} 
          confirmButtonClass="bg-orange-50 text-white hover:bg-orange-600 shadow-orange-200"
      />
    </>
  );
};
