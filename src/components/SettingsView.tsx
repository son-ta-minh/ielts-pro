import React, { useRef, useState, useEffect } from 'react';
import { Download, Upload, Trash2, FileSpreadsheet, FileJson, AlertCircle, CheckCircle2, Loader2, Database, Settings2, Info, Check, Volume2, ChevronDown, Bot, MonitorSmartphone, RotateCw, Key, Save, BrainCircuit, FileText, User, AlertTriangle, BarChart3 } from 'lucide-react';
import { VocabularyItem, Unit, User as UserType } from '../app/types';
import { getAllWordsForExport, bulkSaveWords, getUnitsByUserId, bulkSaveUnits } from '../app/db';
import { createNewWord, resetProgress, cleanNoteIPA, DEFAULT_SRS_CONFIG, SrsConfig } from '../utils/srs';
import { generateBatchWordDetails } from '../services/geminiService';
import { getAvailableVoices, speak, getBestVoice } from '../utils/audio';
import NukeConfirmationModal from './NukeConfirmationModal';
import ConfirmationModal from './ConfirmationModal';

interface Props {
  user: UserType;
  onUpdateUser: (user: UserType) => Promise<void>;
  onRefresh: () => Promise<void>;
  onNuke: () => void;
  apiUsage: { count: number; date: string };
}

type SettingView = 'PROFILE' | 'AI_AUDIO' | 'DATA' | 'SRS' | 'DANGER';

export const SettingsView: React.FC<Props> = ({ user, onUpdateUser, onRefresh, onNuke, apiUsage }) => {
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const mobileNavRef = useRef<HTMLDivElement>(null);
  
  const [currentView, setCurrentView] = useState<SettingView>('PROFILE');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  
  const [importingType, setImportingType] = useState<'CSV' | 'JSON' | null>(null);
  const [useAIForImport, setUseAIForImport] = useState(true);
  const [includeProgress, setIncludeProgress] = useState(true);
  const [includeEssays, setIncludeEssays] = useState(true);
  
  const [importProgress, setImportProgress] = useState<{current: number, total: number} | null>(null);
  const [importStatus, setImportStatus] = useState<{ type: 'success' | 'error' | 'info', message: string, detail?: string } | null>(null);
  
  const [isNukeModalOpen, setIsNukeModalOpen] = useState(false);
  const [isClearProgressModalOpen, setIsClearProgressModalOpen] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);

  const [apiKeyInput, setApiKeyInput] = useState('');

  const [audioMode, setAudioMode] = useState<'system' | 'ai'>(
    (localStorage.getItem('ielts_pro_audio_mode') as 'system' | 'ai') || 'system'
  );
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<string>(localStorage.getItem('ielts_pro_preferred_voice') || '');
  const [isVoiceLoading, setIsVoiceLoading] = useState(true);

  const [srsConfig, setSrsConfig] = useState<SrsConfig>(() => {
    try {
      const stored = localStorage.getItem('ielts_pro_srs_config');
      if (stored) return { ...DEFAULT_SRS_CONFIG, ...JSON.parse(stored) };
    } catch (e) {}
    return DEFAULT_SRS_CONFIG;
  });

  const [profileData, setProfileData] = useState({
    name: user.name,
    role: user.role || '',
    currentLevel: user.currentLevel || '',
    target: user.target || '',
  });
  
  useEffect(() => {
    setProfileData({
        name: user.name,
        role: user.role || '',
        currentLevel: user.currentLevel || '',
        target: user.target || '',
    });
  }, [user]);

  useEffect(() => {
    const savedKeys = localStorage.getItem('gemini_api_keys') || '';
    setApiKeyInput(savedKeys);

    if (notification) {
      const timer = setTimeout(() => setNotification(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  useEffect(() => {
    const loadVoices = async () => {
      setIsVoiceLoading(true);
      const voices = await getAvailableVoices();
      setAvailableVoices(voices);
      if (!localStorage.getItem('ielts_pro_preferred_voice') && voices.length > 0) {
        const best = getBestVoice();
        if (best) {
          setSelectedVoice(best.name);
          localStorage.setItem('ielts_pro_preferred_voice', best.name);
        }
      }
      setIsVoiceLoading(false);
    };
    loadVoices();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (mobileNavRef.current && !mobileNavRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleProfileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setProfileData(prev => ({ ...prev, [name]: value }));
  };

  const handleSaveProfile = async () => {
    const updatedUser: UserType = {
      ...user,
      name: profileData.name.trim() || user.name,
      role: profileData.role.trim(),
      currentLevel: profileData.currentLevel.trim(),
      target: profileData.target.trim(),
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${profileData.name.trim() || user.name}`
    };
    await onUpdateUser(updatedUser);
    setNotification('Profile updated successfully!');
  };

  const handleSaveApiKeys = () => {
    localStorage.setItem('gemini_api_keys', apiKeyInput.trim());
    setNotification('API Keys have been saved locally.');
  };
  
  const handleResetUsage = () => {
    localStorage.removeItem('ielts_pro_api_usage');
    // Dispatch event so parent App can update state
    window.dispatchEvent(new CustomEvent('apiUsageUpdated'));
    setNotification('API usage counter has been reset.');
  };

  const handleAudioModeChange = (mode: 'system' | 'ai') => {
    setAudioMode(mode);
    localStorage.setItem('ielts_pro_audio_mode', mode);
    speak("Hello! This is a voice test.", selectedVoice);
  };

  const handleVoiceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelectedVoice(val);
    localStorage.setItem('ielts_pro_preferred_voice', val);
    speak("Hello! I am your IELTS vocabulary coach.", val);
  };

  const handleSrsConfigChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setSrsConfig(prev => ({ ...prev, [name]: parseFloat(value) }));
  };

  const handleSaveSrsConfig = () => {
    localStorage.setItem('ielts_pro_srs_config', JSON.stringify(srsConfig));
    setNotification('SRS settings saved!');
  };

  const handleResetSrsConfig = () => {
    setSrsConfig(DEFAULT_SRS_CONFIG);
    localStorage.removeItem('ielts_pro_srs_config');
    setNotification('SRS settings reset to defaults.');
  };

  const isInvalidIpa = (ipa: any) => {
    const val = (ipa || "").toString().trim().toLowerCase();
    return !val || val === '0' || val === '1' || val === '-1' || val === 'undefined' || val === 'null' || val === 'none';
  };

  const parseCSV = (text: string): string[][] => {
    const rows: string[][] = []; let currentRow: string[] = []; let currentField = ''; let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === '"' && inQuotes && text[i+1] === '"') { currentField += '"'; i++; } 
      else if (char === '"') { inQuotes = !inQuotes; } 
      else if (char === ',' && !inQuotes) { currentRow.push(currentField.trim()); currentField = ''; } 
      else if ((char === '\n' || char === '\r') && !inQuotes) {
        if (char === '\r' && text[i+1] === '\n') i++;
        currentRow.push(currentField.trim());
        if (currentRow.length > 0) rows.push(currentRow);
        currentRow = []; currentField = '';
      } else { currentField += char; }
    }
    if (currentRow.length > 0 || currentField !== '') { currentRow.push(currentField.trim()); rows.push(currentRow); }
    return rows;
  };

  const handleCSVImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setImportingType('CSV'); setImportStatus(null); setImportProgress({ current: 0, total: 100 });
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const text = ev.target?.result as string; const allRows = parseCSV(text); if (allRows.length === 0) throw new Error("File empty");
        const firstRow = allRows[0].map(h => h.toLowerCase().trim()); const findIdx = (keywords: string[]) => firstRow.findIndex(h => keywords.some(k => h.includes(k)));
        let wordIdx = findIdx(['word', 'vocab', 'từ', 'vựng']); let ipaIdx = findIdx(['ipa', 'phát âm', 'phonetic', 'phiên âm']); let meaningIdx = findIdx(['meaning', 'nghĩa', 'definition', 'dịch']); let exampleIdx = findIdx(['example', 'ví dụ', 'câu']); let tagsIdx = findIdx(['tag', 'nhãn', 'loại']); let noteIdx = findIdx(['note', 'ghi chú', 'lưu ý']);
        let hasHeader = wordIdx !== -1;
        if (hasHeader && meaningIdx === -1 && noteIdx !== -1) { meaningIdx = noteIdx; noteIdx = -1; }
        let dataRows = allRows;
        if (hasHeader) { dataRows = allRows.slice(1); } else { wordIdx = 0; ipaIdx = 1; meaningIdx = 2; exampleIdx = 3; tagsIdx = 4; noteIdx = 5; }
        const total = dataRows.length; setImportProgress({ current: 0, total });
        const batches = []; for (let i = 0; i < total; i += 25) batches.push(dataRows.slice(i, i + 25));
        for (const chunk of batches) {
          const wordsToEnrich: string[] = [];
          const preparedItems = chunk.map(row => {
            const word = (row[wordIdx] || '').trim(); if (!word) return null;
            const ipa = ipaIdx !== -1 ? (row[ipaIdx] || "").trim() : ""; const meaningVi = meaningIdx !== -1 ? (row[meaningIdx] || "").trim() : ""; const example = exampleIdx !== -1 ? (row[exampleIdx] || "").trim() : ""; const tags = tagsIdx !== -1 ? (row[tagsIdx] || "").trim() : ""; const note = noteIdx !== -1 ? (row[noteIdx] || "").trim() : "";
            if (useAIForImport && (isInvalidIpa(ipa) || !meaningVi)) wordsToEnrich.push(word);
            return { word, ipa, tags, note, example, meaningVi };
          }).filter(Boolean);
          let aiMap: Record<string, any> = {};
          if (wordsToEnrich.length > 0) {
            try { const results = await generateBatchWordDetails(wordsToEnrich); results.forEach((r: any) => { if (r.word) aiMap[r.word.toLowerCase()] = r; }); } catch (err) {}
          }
          const finalItems = preparedItems.map(item => {
            if (!item) return null;
            const ai = aiMap[item.word.toLowerCase()]; const finalIpa = isInvalidIpa(item.ipa) ? (ai?.ipa || item.ipa) : item.ipa; const finalMeaning = (!item.meaningVi || item.meaningVi.trim() === '') ? (ai?.meaningVi || item.meaningVi) : item.meaningVi; const finalExample = (!item.example || item.example.trim() === '') ? (ai?.example || "Added via CSV") : item.example; const finalNote = cleanNoteIPA(item.note, finalIpa); const tagArray = item.tags ? item.tags.split(/[|;,]/).map(t => t.trim()).filter(Boolean) : [];
            return { ...createNewWord(item.word, finalIpa, finalMeaning, finalExample, finalNote, tagArray, ai?.isIdiom || false, false, ai?.isPhrasalVerb || false, ai?.isCollocation || false), userId: user.id };
          }).filter(Boolean) as VocabularyItem[];
          if (finalItems.length > 0) await bulkSaveWords(finalItems);
          setImportProgress(prev => ({ current: Math.min((prev?.current || 0) + chunk.length, total), total }));
        }
        setImportStatus({ type: 'success', message: `Thành công!`, detail: `Đã xử lý xong ${total} từ vựng.` });
        await onRefresh();
      } catch (err: any) { setImportStatus({ type: 'error', message: "Lỗi nhập CSV", detail: err.message }); } 
      finally { setImportingType(null); setImportProgress(null); }
    };
    reader.readAsText(file); if (csvInputRef.current) csvInputRef.current.value = '';
  };
  
  const handleJSONImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if(!file) return;
    setImportingType('JSON'); setImportStatus(null);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const rawJson = JSON.parse(ev.target?.result as string);
        const incomingItems: Partial<VocabularyItem>[] = Array.isArray(rawJson) ? rawJson : (rawJson.vocabulary || []);
        const incomingUnits: Unit[] | undefined = rawJson.units;
        if (!Array.isArray(incomingItems)) throw new Error("Invalid JSON format: must be an array of vocabulary items or an object with a 'vocabulary' key.");
        const localItems = await getAllWordsForExport(user.id);
        const localItemsByWord = new Map(localItems.map(item => [item.word.toLowerCase().trim(), item]));
        const itemsToSave: VocabularyItem[] = []; let newCount = 0, mergedCount = 0, skippedCount = 0;
        for (const incoming of incomingItems) {
          if (!incoming.word) continue;
          const local = localItemsByWord.get(incoming.word.toLowerCase().trim());
          if (local) {
            if ((incoming.updatedAt || 0) > (local.updatedAt || 0)) {
              const mergedItem = Object.assign({}, local, incoming, { id: local.id, userId: user.id, updatedAt: Date.now() });
              if (!includeProgress) Object.assign(mergedItem, resetProgress(mergedItem));
              itemsToSave.push(mergedItem); mergedCount++;
            } else { skippedCount++; }
          } else {
            const newItem = createNewWord(incoming.word, '', '', '', '', []);
            Object.assign(newItem, incoming, { userId: user.id });
            if (!includeProgress) Object.assign(newItem, resetProgress(newItem));
            itemsToSave.push(newItem); newCount++;
          }
        }
        if (itemsToSave.length > 0) await bulkSaveWords(itemsToSave);
        let subMessage = '';
        if (incomingUnits && Array.isArray(incomingUnits)) { const unitsWithUser = incomingUnits.map(u => ({...u, userId: user.id})); await bulkSaveUnits(unitsWithUser); subMessage += ` Synced ${incomingUnits.length} units.`; }
        setImportStatus({ type: 'success', message: `Import Complete!`, detail: `Words Added: ${newCount}, Updated: ${mergedCount}, Skipped: ${skippedCount}.${subMessage}` });
        await onRefresh();
      } catch(err: any) { setImportStatus({ type: 'error', message: "JSON Import Error", detail: err.message }); } 
      finally { setImportingType(null); }
    };
    reader.readAsText(file); if(jsonInputRef.current) jsonInputRef.current.value = '';
  };

  const handleJSONExport = async () => {
    const [wordsData, unitsData] = await Promise.all([ getAllWordsForExport(user.id), getUnitsByUserId(user.id) ]);
    const finalWordsData = includeProgress ? wordsData : wordsData.map(w => resetProgress(w));
    const finalUnitsData = includeEssays ? unitsData : unitsData.map(({ essay, ...rest }) => rest);
    const exportObject = { version: 3, createdAt: new Date().toISOString(), vocabulary: finalWordsData, units: finalUnitsData };
    const blob = new Blob([JSON.stringify(exportObject, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `ielts-pro-backup-${new Date().toISOString().split('T')[0]}.json`; a.click(); URL.revokeObjectURL(url);
  };
  
  const handleClearProgress = async () => {
    setIsClearing(true);
    try {
        const allWords = await getAllWordsForExport(user.id);
        const resetWords = allWords.map(word => resetProgress(word));
        await bulkSaveWords(resetWords);
        await onRefresh();
        setNotification("All learning progress has been reset.");
    } catch (err) {
        setImportStatus({ type: 'error', message: 'Failed to clear progress', detail: (err as Error).message });
    } finally { setIsClearing(false); setIsClearProgressModalOpen(false); }
  };

  const ToggleSwitch = ({ checked, onChange, label, subLabel }: { checked: boolean; onChange: (c: boolean) => void; label: string; subLabel: string }) => (
     <label onClick={(e) => { e.preventDefault(); onChange(!checked); }} className="flex items-center justify-between px-6 py-4 cursor-pointer group hover:bg-white hover:shadow-sm rounded-xl transition-all">
       <div className="flex flex-col"><span className="text-[10px] font-black text-neutral-400 group-hover:text-neutral-900 uppercase tracking-widest">{label}</span><span className="text-[8px] text-neutral-400 font-bold italic">{subLabel}</span></div>
       <div className={`w-10 h-6 rounded-full transition-all flex items-center p-1 ${checked ? 'bg-neutral-900' : 'bg-neutral-200'}`}><div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${checked ? 'translate-x-4' : 'translate-x-0'}`} /></div>
     </label>
  );
  
  const navItems = [
    { id: 'PROFILE', label: 'Profile', icon: User },
    { id: 'AI_AUDIO', label: 'AI & Audio', icon: BrainCircuit },
    { id: 'DATA', label: 'Data Management', icon: Database },
    { id: 'SRS', label: 'Learning Algorithm', icon: Settings2 },
    { id: 'DANGER', label: 'Danger Zone', icon: AlertTriangle, color: 'text-red-500' }
  ];
  const currentNavItem = navItems.find(item => item.id === currentView);
  
  const usagePercentage = Math.min((apiUsage.count / 500) * 100, 100);
  let usageColor = 'bg-green-500';
  if (usagePercentage > 75) usageColor = 'bg-red-500';
  else if (usagePercentage > 40) usageColor = 'bg-yellow-500';


  const renderCurrentView = () => {
    switch (currentView) {
      case 'PROFILE': return (
        <section className="bg-white p-8 rounded-[2.5rem] border border-neutral-200 shadow-sm flex flex-col space-y-6">
          <div className="flex items-center space-x-4"><div className="p-3 bg-neutral-100 text-neutral-600 rounded-2xl"><User size={24} /></div><div><h3 className="text-xl font-black text-neutral-900">Your Profile</h3><p className="text-xs text-neutral-400">This context helps AI tailor content for you.</p></div></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-neutral-100">
            <div><label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1 mb-2">Display Name</label><input name="name" value={profileData.name} onChange={handleProfileChange} className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl font-bold"/></div>
            <div><label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1 mb-2">Occupation / Role</label><input name="role" value={profileData.role} onChange={handleProfileChange} placeholder="e.g., Student" className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl font-medium"/></div>
            <div><label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1 mb-2">Current Level</label><input name="currentLevel" value={profileData.currentLevel} onChange={handleProfileChange} placeholder="e.g., IELTS Band 6.0" className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl font-medium"/></div>
            <div><label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1 mb-2">Target</label><input name="target" value={profileData.target} onChange={handleProfileChange} placeholder="e.g., IELTS Band 7.5+" className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl font-medium"/></div>
          </div>
          <button onClick={handleSaveProfile} className="w-full py-4 bg-neutral-900 text-white rounded-2xl font-black text-xs hover:bg-neutral-800 transition-all flex items-center justify-center space-x-2"><Save size={16} /> <span>SAVE PROFILE</span></button>
        </section>
      );
      case 'AI_AUDIO': return (
        <div className="space-y-8">
          <section className="bg-white p-8 rounded-[2.5rem] border border-neutral-200 shadow-sm flex flex-col space-y-6">
            <div className="flex items-center space-x-4"><div className="p-3 bg-neutral-100 text-neutral-600 rounded-2xl"><Key size={24} /></div><div><h3 className="text-xl font-black text-neutral-900">Gemini API Configuration</h3><p className="text-xs text-neutral-400">Manage your API keys for AI-powered features.</p></div></div>
            <div className="space-y-4"><textarea rows={3} value={apiKeyInput} onChange={(e) => setApiKeyInput(e.target.value)} placeholder="Enter your API key. Separate multiple keys with commas for auto-rotation." className="w-full p-4 bg-neutral-50 border border-neutral-200 rounded-2xl text-sm font-mono focus:ring-2 focus:ring-neutral-900 focus:outline-none resize-y" /><p className="text-[10px] text-neutral-400 px-1 font-medium italic">Your keys are stored securely in your browser and never leave your device.</p></div>
            <button onClick={handleSaveApiKeys} className="w-full py-4 bg-neutral-900 text-white rounded-2xl font-black text-xs hover:bg-neutral-800 transition-all flex items-center justify-center space-x-2"><Save size={16} /> <span>SAVE KEYS</span></button>
            <div className="space-y-3 pt-4 border-t border-neutral-100">
                <div className="flex justify-between items-center">
                    <div className="flex items-center space-x-2">
                        <BarChart3 size={14} className="text-neutral-400"/>
                        <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Today's API Usage</label>
                    </div>
                    <button onClick={handleResetUsage} className="text-[10px] font-bold text-neutral-400 hover:text-neutral-800 transition-colors uppercase tracking-widest">Reset</button>
                </div>
                <div className="flex items-center space-x-4">
                    <div className="text-2xl font-black text-neutral-900">{apiUsage.count}</div>
                    <div className="flex-1">
                        <div className="h-2 w-full bg-neutral-100 rounded-full overflow-hidden">
                            <div className={`h-full transition-all duration-500 ${usageColor}`} style={{ width: `${usagePercentage}%` }} />
                        </div>
                    </div>
                </div>
                <p className="text-[10px] text-neutral-400 px-1 font-medium italic">This counter tracks requests made by this app and resets daily. It is not an official quota from Google.</p>
            </div>
          </section>
          <section className="bg-white p-8 rounded-[2.5rem] border border-neutral-200 shadow-sm flex flex-col space-y-6">
            <div className="flex items-center space-x-4"><div className="p-3 bg-blue-50 text-blue-600 rounded-2xl"><Volume2 size={24} /></div><div><h3 className="text-xl font-black text-neutral-900">Audio Experience</h3><p className="text-xs text-neutral-400">Personalize how words sound.</p></div></div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 bg-neutral-100 p-1 rounded-2xl"><button onClick={() => handleAudioModeChange('system')} className={`py-3 text-xs font-black rounded-xl flex items-center justify-center space-x-2 transition-all ${audioMode === 'system' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-400'}`}><MonitorSmartphone size={14} /> <span>System (Free)</span></button><button onClick={() => handleAudioModeChange('ai')} className={`py-3 text-xs font-black rounded-xl flex items-center justify-center space-x-2 transition-all ${audioMode === 'ai' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-400'}`}><Bot size={14} /> <span>Gemini AI</span></button></div>
              {audioMode === 'system' ? (<div className="p-4 bg-neutral-50 rounded-2xl border border-neutral-100 space-y-2 animate-in fade-in duration-300"><label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">System Voice</label><div className="relative"><select value={selectedVoice} onChange={handleVoiceChange} disabled={isVoiceLoading} className="w-full appearance-none bg-white border border-neutral-200 rounded-xl px-4 py-3 pr-10 text-sm font-bold focus:outline-none focus:ring-4 focus:ring-neutral-50 transition-all shadow-sm cursor-pointer">{isVoiceLoading ? <option>Loading voices...</option> : (<> <option value="">System Default</option> {availableVoices.map(voice => ( <option key={voice.name} value={voice.name}>{voice.name} ({voice.lang})</option> ))} </> )}</select><ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" /></div><p className="text-[10px] text-neutral-400 px-1 font-medium italic">Chất lượng cao nhất trên Safari (Siri). Chrome có thể không hay bằng.</p></div>) : (<div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 text-center animate-in fade-in duration-300"><p className="text-xs font-bold text-blue-800">Gemini AI Voice cho chất lượng âm thanh cao nhất và đồng nhất trên mọi thiết bị.</p><p className="text-[10px] text-blue-600 mt-1">Sử dụng API quota của bạn.</p></div>)}
            </div>
          </section>
        </div>
      );
      case 'DATA': return (
        <div className="space-y-8">
          <section className="bg-white p-8 rounded-[2.5rem] border border-neutral-200 shadow-sm flex flex-col"><div className="flex items-center space-x-4 mb-6"><div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl"><FileJson size={24} /></div><div><h3 className="text-xl font-black text-neutral-900">Backup & Restore</h3><p className="text-xs text-neutral-400">Sync with JSON files.</p></div></div><div className="p-1 bg-neutral-50 rounded-2xl border border-neutral-100 space-y-1"><ToggleSwitch checked={includeProgress} onChange={setIncludeProgress} label="Include Progress" subLabel="Đồng bộ cả tiến trình học SRS" /><ToggleSwitch checked={includeEssays} onChange={setIncludeEssays} label="Include Essay Content" subLabel="Đồng bộ bài luận trong Units" /></div><div className="grid grid-cols-2 gap-3 mt-auto pt-6"><button onClick={() => jsonInputRef.current?.click()} className="py-4 border-2 border-neutral-900 text-neutral-900 rounded-2xl font-black text-xs hover:bg-neutral-50 transition-all flex items-center justify-center space-x-2"><Upload size={16} /> <span>IMPORT</span><input type="file" ref={jsonInputRef} className="hidden" accept=".json" onChange={handleJSONImport} /></button><button onClick={handleJSONExport} className="py-4 bg-neutral-900 text-white rounded-2xl font-black text-xs hover:bg-neutral-800 transition-all flex items-center justify-center space-x-2"><Download size={16} /> <span>EXPORT</span></button></div></section>
          <section className="bg-white p-8 rounded-[2.5rem] border border-neutral-200 shadow-sm flex flex-col space-y-6"><div className="flex items-center space-x-4"><div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl"><FileSpreadsheet size={24} /></div><div><h3 className="text-xl font-black text-neutral-900">CSV Import</h3><p className="text-xs text-neutral-400">Thêm từ vựng hàng loạt từ file CSV.</p></div></div><div className="p-1 bg-neutral-50 rounded-2xl border border-neutral-100"><label onClick={(e) => { e.preventDefault(); setUseAIForImport(!useAIForImport); }} className="flex items-center justify-between px-6 py-4 cursor-pointer group hover:bg-white hover:shadow-sm rounded-xl transition-all"><div className="flex flex-col"><span className="text-[10px] font-black text-neutral-400 group-hover:text-neutral-900 uppercase tracking-widest">AI Enrichment</span><span className="text-[8px] text-neutral-400 font-bold italic">Bật để tự động điền IPA, nghĩa, ví dụ...</span></div><div className={`w-10 h-6 rounded-full transition-all flex items-center p-1 ${useAIForImport ? 'bg-neutral-900' : 'bg-neutral-200'}`}><div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${useAIForImport ? 'translate-x-4' : 'translate-x-0'}`} /></div></label></div><button onClick={() => csvInputRef.current?.click()} className="w-full py-4 border-2 border-neutral-900 text-neutral-900 rounded-2xl font-black text-xs hover:bg-neutral-50 transition-all flex items-center justify-center space-x-2"><Upload size={16} /> <span>CHOOSE CSV FILE</span></button><input type="file" ref={csvInputRef} className="hidden" accept=".csv" onChange={handleCSVImport} /><div className="p-4 bg-neutral-50 rounded-2xl border border-neutral-100 flex items-start space-x-3 text-xs text-neutral-500"><Info size={28} className="shrink-0 text-neutral-300" /><p> The CSV file should contain at least a 'word' column. Other supported columns are: 'ipa', 'meaning', 'example', 'tags', 'note'. The system will attempt to auto-detect columns. </p></div></section>
        </div>
      );
      case 'SRS': return (
        <section className="bg-white p-8 rounded-[2.5rem] border border-neutral-200 shadow-sm flex flex-col space-y-6"><div className="flex items-center space-x-4"><div className="p-3 bg-purple-50 text-purple-600 rounded-2xl"><BrainCircuit size={24} /></div><div><h3 className="text-xl font-black text-neutral-900">Spaced Repetition Algorithm</h3><p className="text-xs text-neutral-400">Customize the learning intervals and multipliers.</p></div></div><div className="grid grid-cols-2 gap-x-6 gap-y-4 pt-4 border-t border-neutral-100"><div className="col-span-2 text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">Initial Intervals</div><div><label className="block text-sm font-bold text-neutral-600 mb-1">New word (Easy)</label><input type="number" step="1" min="1" name="initialEasy" value={srsConfig.initialEasy} onChange={handleSrsConfigChange} className="w-full px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl font-bold" /><p className="text-[9px] text-neutral-400 mt-1">Next review in X days.</p></div><div><label className="block text-sm font-bold text-neutral-600 mb-1">New word (Hard)</label><input type="number" step="1" min="1" name="initialHard" value={srsConfig.initialHard} onChange={handleSrsConfigChange} className="w-full px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl font-bold" /><p className="text-[9px] text-neutral-400 mt-1">Next review in X days.</p></div><div className="col-span-2 text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1 pt-2">Interval Multipliers</div><div><label className="block text-sm font-bold text-neutral-600 mb-1">'Easy' after 'Easy'</label><input type="number" step="0.1" min="1" name="easyEasy" value={srsConfig.easyEasy} onChange={handleSrsConfigChange} className="w-full px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl font-bold" /><p className="text-[9px] text-neutral-400 mt-1">Grows interval fastest (e.g., 2.5x).</p></div><div><label className="block text-sm font-bold text-neutral-600 mb-1">'Easy' after 'Hard'</label><input type="number" step="0.1" min="1" name="hardEasy" value={srsConfig.hardEasy} onChange={handleSrsConfigChange} className="w-full px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl font-bold" /><p className="text-[9px] text-neutral-400 mt-1">Helps recover from a 'Hard' rating (e.g., 2.0x).</p></div><div><label className="block text-sm font-bold text-neutral-600 mb-1">'Hard' after 'Hard'</label><input type="number" step="0.1" min="1" name="hardHard" value={srsConfig.hardHard} onChange={handleSrsConfigChange} className="w-full px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl font-bold" /><p className="text-[9px] text-neutral-400 mt-1">Slowly increases interval (e.g., 1.3x).</p></div><div><label className="block text-sm font-bold text-neutral-600 mb-1">'Hard' after 'Easy' (Penalty)</label><input type="number" step="0.1" max="1" name="easyHardPenalty" value={srsConfig.easyHardPenalty} onChange={handleSrsConfigChange} className="w-full px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl font-bold" /><p className="text-[9px] text-neutral-400 mt-1">Reduces interval if you forget (e.g., 0.5x).</p></div></div><div className="flex gap-3 pt-4 border-t border-neutral-100"><button onClick={handleResetSrsConfig} type="button" className="flex-1 py-3 bg-neutral-100 text-neutral-500 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-neutral-200 transition-all">Reset Defaults</button><button onClick={handleSaveSrsConfig} type="button" className="flex-1 py-3 bg-neutral-900 text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-neutral-800 transition-all">Save Settings</button></div></section>
      );
      case 'DANGER': return (
        <section className="bg-red-50 p-8 rounded-[2.5rem] border-2 border-red-100 shadow-sm flex flex-col space-y-6"><div className="flex items-center space-x-4"><div className="p-3 bg-red-100 text-red-600 rounded-2xl"><AlertTriangle size={24} /></div><div><h3 className="text-xl font-black text-red-900">Danger Zone</h3><p className="text-xs text-red-500">Actions in this zone are irreversible.</p></div></div><div className="grid grid-cols-1 md:grid-cols-2 gap-4"><button onClick={() => setIsClearProgressModalOpen(true)} className="p-4 bg-white border-2 border-red-100 rounded-2xl text-left hover:border-red-500 transition-colors group"><div className="font-black text-red-600">Clear All Progress</div><div className="text-xs text-neutral-500 mt-1">Reset all SRS data, but keep your words.</div></button><button onClick={() => setIsNukeModalOpen(true)} className="p-4 bg-white border-2 border-red-100 rounded-2xl text-left hover:border-red-500 transition-colors group"><div className="font-black text-red-600">Reset Full Library</div><div className="text-xs text-neutral-500 mt-1">Delete ALL your data and restore the app to its initial state.</div></button></div></section>
      );
      default: return null;
    }
  };


  return (
    <div className="max-w-6xl mx-auto space-y-10 pb-20">
      <header><h2 className="text-3xl font-black text-neutral-900 tracking-tight">Settings</h2><p className="text-neutral-500 mt-2 font-medium">Manage your data and personalize your learning experience.</p></header>
      {notification && (<div className="fixed top-10 left-1/2 -translate-x-1/2 z-[300] bg-neutral-900 text-white px-6 py-3 rounded-2xl shadow-2xl border border-neutral-800 animate-in slide-in-from-top-4 flex items-center space-x-2"><CheckCircle2 size={18} className="text-green-400" /><span className="text-sm font-bold">{notification}</span></div>)}
      
      {/* Global Status Messages */}
      {importStatus && (<div className={`p-6 rounded-[2rem] border-2 animate-in slide-in-from-top-4 ${ importStatus.type === 'success' ? 'bg-green-50 border-green-100 text-green-700' : 'bg-red-50 border-red-100 text-red-700' }`}><div className="flex items-start space-x-4">{importStatus.type === 'success' ? <CheckCircle2 size={24} /> : <AlertCircle size={24} />}<div><div className="font-black text-lg">{importStatus.message}</div>{importStatus.detail && <div className="text-sm opacity-80 mt-1 font-medium">{importStatus.detail}</div>}</div></div></div>)}
      {importProgress && (<div className="p-8 bg-neutral-900 rounded-[2.5rem] text-white space-y-4 shadow-xl"><div className="flex justify-between items-end"><div><div className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400 mb-1">Processing</div><div className="text-2xl font-black">CSV Enrichment</div></div><div className="text-right"><span className="text-2xl font-black">{Math.round((importProgress.current / importProgress.total) * 100)}%</span></div></div><div className="h-2 w-full bg-white/10 rounded-full overflow-hidden"><div className="h-full transition-all duration-500 bg-white" style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }} /></div></div>)}
      
      {/* Mobile & Tablet Dropdown Navigation */}
      <div className="relative lg:hidden mb-6" ref={mobileNavRef}>
        <button
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className="w-full flex items-center justify-between text-left px-4 py-3 bg-white border border-neutral-200 rounded-xl text-sm font-bold text-neutral-900 hover:bg-neutral-50 transition-colors shadow-sm"
        >
          {currentNavItem && (
            <span className="flex items-center space-x-3">
              <currentNavItem.icon size={18} className={currentNavItem.color} />
              <span>{currentNavItem.label}</span>
            </span>
          )}
          <ChevronDown size={18} className={`text-neutral-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
        </button>
        {isDropdownOpen && (
          <div className="absolute top-full mt-2 w-full bg-white rounded-2xl shadow-lg border border-neutral-100 z-20 p-2 animate-in fade-in duration-150">
            {navItems.map(item => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setCurrentView(item.id as SettingView);
                    setIsDropdownOpen(false);
                  }}
                  className={`w-full text-left flex items-center space-x-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                    currentView === item.id 
                    ? 'bg-neutral-900 text-white' 
                    : `${item.color || 'text-neutral-700'} hover:bg-neutral-50`
                  }`}
                >
                  <Icon size={16} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex flex-col lg:flex-row gap-12">
        <aside className="hidden lg:block lg:w-1/4">
          <nav className="space-y-1.5">
            {navItems.map(item => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => setCurrentView(item.id as SettingView)}
                  className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl font-bold text-sm transition-colors ${
                    currentView === item.id 
                    ? 'bg-neutral-100 text-neutral-900' 
                    : `${item.color || 'text-neutral-500'} hover:bg-neutral-50 hover:text-neutral-900`
                  }`}
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                </button>
              )
            })}
          </nav>
        </aside>

        <main className="flex-1 lg:w-3/4">
          <div key={currentView} className="animate-in fade-in duration-300">
            {renderCurrentView()}
          </div>
        </main>
      </div>

      <NukeConfirmationModal isOpen={isNukeModalOpen} onConfirm={onNuke} onClose={() => setIsNukeModalOpen(false)} />
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
    </div>
  );
};
