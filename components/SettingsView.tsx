
import React, { useRef, useState } from 'react';
import { Download, Upload, Trash2, FileSpreadsheet, FileJson, AlertCircle, CheckCircle2, Loader2, Database, Settings2, Copy, Terminal } from 'lucide-react';
import { VocabularyItem } from '../types';
import { getAllWordsForExport, bulkSaveWithMerge, deleteWordFromDB } from '../services/db';
import { createNewWord, resetProgress } from '../utils/srs';
import { generateBatchWordDetails } from '../services/geminiService';

interface Props {
  userId: string;
  onRefresh: () => Promise<void>;
}

const BATCH_SIZE = 25; 
const CONCURRENCY_LIMIT = 5; 

const SettingsView: React.FC<Props> = ({ userId, onRefresh }) => {
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  
  const [importingType, setImportingType] = useState<'CSV' | 'JSON' | null>(null);
  const [useAIForImport, setUseAIForImport] = useState(true);
  const [includeProgressOnExport, setIncludeProgressOnExport] = useState(true);
  const [applyProgressOnImport, setApplyProgressOnImport] = useState(true);
  
  const [importProgress, setImportProgress] = useState<{current: number, total: number} | null>(null);
  const [importStatus, setImportStatus] = useState<{ type: 'success' | 'error' | 'info', message: string, detail?: string } | null>(null);

  const cleanNote = (note: string, ipa: string) => {
    if (!note || !ipa) return note;
    const ipaRaw = ipa.replace(/[/[\]]/g, '').trim();
    if (!ipaRaw) return note;
    const ipaRegex = new RegExp(`[/\\[]${ipaRaw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[/\\]]`, 'g');
    return note.replace(ipaRegex, '').replace(/\s+/g, ' ').trim();
  };

  const parseCSV = (text: string): string[][] => {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentField = '';
    let inQuotes = false;
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
    const file = e.target.files?.[0];
    if (!file) return;
    setImportingType('CSV');
    setImportStatus(null);
    setImportProgress({ current: 0, total: 100 });
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const text = ev.target?.result as string;
        const allRows = parseCSV(text);
        if (allRows.length === 0) throw new Error("File empty");
        const firstRowStr = allRows[0].join(',').toLowerCase();
        const hasHeader = firstRowStr.includes('word') || firstRowStr.includes('learn');
        const dataRows = hasHeader ? allRows.slice(1) : allRows;
        const total = dataRows.length;
        setImportProgress({ current: 0, total });
        
        let totalMerged = 0;
        let processedCount = 0;
        const batches = [];
        for (let i = 0; i < total; i += BATCH_SIZE) batches.push(dataRows.slice(i, i + BATCH_SIZE));
        
        for (let i = 0; i < batches.length; i += CONCURRENCY_LIMIT) {
          const batchGroup = batches.slice(i, i + CONCURRENCY_LIMIT);
          const groupItems = await Promise.all(batchGroup.map(async (chunk) => {
            const wordsToEnrich: string[] = [];
            const preparedItems = chunk.map(row => {
              const word = (row[0] || '').trim();
              if (!word) return null;
              const ipa = (row[1] || "").trim();
              const tags = (row[2] || '').trim();
              const note = (row[3] || '').trim();
              const example = (row[5] || '').trim();
              const meaningVi = (row[6] || "").trim();
              if (useAIForImport && (!ipa || !meaningVi || !example)) wordsToEnrich.push(word);
              return { word, ipa, tags, note, example, meaningVi };
            }).filter(Boolean);

            let aiMap: Record<string, any> = {};
            if (wordsToEnrich.length > 0) {
              try {
                const results = await generateBatchWordDetails(wordsToEnrich);
                results.forEach((r: any) => { if (r.word) aiMap[r.word.toLowerCase()] = r; });
              } catch (err) { console.warn("Batch AI Failed", err); }
            }

            return preparedItems.map(item => {
              if (!item) return null;
              const ai = aiMap[item.word.toLowerCase()];
              let finalIpa = item.ipa || (ai?.ipa || "");
              let finalMeaning = item.meaningVi || (ai?.meaningVi || "");
              let finalExample = item.example || (ai?.example || "");
              const finalNote = cleanNote(item.note, finalIpa);
              const tagArray = item.tags ? item.tags.split(/[|;,]/).map(t => t.trim()).filter(Boolean) : [];
              return { ...createNewWord(item.word, finalIpa, finalMeaning, finalExample || 'Added via CSV', finalNote, tagArray), userId };
            }).filter(Boolean);
          }));

          const flatItems = groupItems.flat().filter(Boolean) as VocabularyItem[];
          if (flatItems.length > 0) {
            const stats = await bulkSaveWithMerge(flatItems);
            totalMerged += stats.merged;
          }
          processedCount += batchGroup.reduce((acc, b) => acc + b.length, 0);
          setImportProgress({ current: Math.min(processedCount, total), total });
        }
        setImportStatus({ type: 'success', message: `Import Ready: ${totalMerged} words processed.` });
        await onRefresh();
      } catch (err: any) {
        setImportStatus({ type: 'error', message: "Import Failed", detail: err.message });
      } finally {
        setImportingType(null);
        setImportProgress(null);
      }
    };
    reader.readAsText(file);
    if (csvInputRef.current) csvInputRef.current.value = '';
  };

  const handleJSONImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if(!file) return;
    setImportingType('JSON');
    setImportStatus(null);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        let words = JSON.parse(ev.target?.result as string);
        if (!Array.isArray(words)) throw new Error("Invalid JSON format");
        
        if (!applyProgressOnImport) {
          words = words.map(w => resetProgress({ ...w, userId }));
        } else {
          words = words.map(w => ({ ...w, userId }));
        }

        const stats = await bulkSaveWithMerge(words);
        setImportStatus({ 
          type: 'success', 
          message: `JSON Restored: ${stats.merged} items merged.`,
          detail: applyProgressOnImport ? "Learning progress preserved." : "Learning progress reset to 0."
        });
        await onRefresh();
      } catch(err: any) {
        setImportStatus({ type: 'error', message: "JSON Error", detail: err.message });
      } finally { setImportingType(null); }
    };
    reader.readAsText(file);
    if(jsonInputRef.current) jsonInputRef.current.value = '';
  };

  const handleJSONExport = async () => {
    const data = await getAllWordsForExport(userId);
    let finalData = data;
    
    if (!includeProgressOnExport) {
      finalData = data.map(w => resetProgress(w));
    }

    const blob = new Blob([JSON.stringify(finalData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ielts-vocab-${includeProgressOnExport ? 'full' : 'words-only'}-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyToClipboard = async () => {
    try {
      setImportStatus(null);
      const data = await getAllWordsForExport(userId);
      const cleanData = data.map(w => ({
        ...w,
        nextReview: Date.now(),
        interval: 0,
        easeFactor: 2.5,
        consecutiveCorrect: 0,
        forgotCount: 0,
        lastReview: undefined
      }));

      const json = JSON.stringify(cleanData, null, 2);
      
      // Fallback check for clipboard API
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(json);
        setImportStatus({ 
          type: 'info', 
          message: "Data copied to clipboard!", 
          detail: "Paste this JSON to the AI chat to save it as the permanent default seed data." 
        });
      } else {
        throw new Error("Clipboard API not available or restricted.");
      }
    } catch (err: any) {
      console.error("Clipboard Copy Failed:", err);
      setImportStatus({ 
        type: 'error', 
        message: "Copy Restricted", 
        detail: "The browser blocked clipboard access. Please use 'EXPORT JSON' instead." 
      });
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-10 pb-20">
      <header>
        <h2 className="text-4xl font-black text-neutral-900 tracking-tight">Settings</h2>
        <p className="text-neutral-500 mt-2 font-medium">Manage your library, backup progress, and import data.</p>
      </header>

      {importStatus && (
        <div className={`p-6 rounded-[2rem] border-2 animate-in slide-in-from-top-4 ${
          importStatus.type === 'success' ? 'bg-green-50 border-green-100 text-green-700' : 
          importStatus.type === 'info' ? 'bg-blue-50 border-blue-100 text-blue-700' : 
          'bg-red-50 border-red-100 text-red-700'
        }`}>
          <div className="flex items-start space-x-4">
            {importStatus.type === 'success' ? <CheckCircle2 size={24} /> : 
             importStatus.type === 'info' ? <Terminal size={24} /> : 
             <AlertCircle size={24} />}
            <div>
              <div className="font-black text-lg">{importStatus.message}</div>
              {importStatus.detail && <div className="text-sm opacity-80 mt-1 font-medium">{importStatus.detail}</div>}
            </div>
          </div>
        </div>
      )}

      {importProgress && (
        <div className="p-8 bg-neutral-900 rounded-[2.5rem] text-white space-y-4 shadow-xl">
          <div className="flex justify-between items-end">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400 mb-1">Processing Batch</div>
              <div className="text-2xl font-black">AI Enrichment Active</div>
            </div>
            <div className="text-right">
              <span className="text-2xl font-black">{Math.round((importProgress.current / importProgress.total) * 100)}%</span>
            </div>
          </div>
          <div className="h-3 w-full bg-white/10 rounded-full overflow-hidden">
            <div 
              className="h-full bg-white transition-all duration-500" 
              style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }} 
            />
          </div>
          <p className="text-xs text-neutral-400 font-medium italic">Gemini is generating IPA and Examples for your new words...</p>
        </div>
      )}

      {/* Developer Sync Section */}
      <section className="bg-neutral-900 p-8 rounded-[2.5rem] border border-neutral-800 shadow-2xl space-y-6">
        <div className="flex items-center space-x-4">
          <div className="p-3 bg-white/10 text-white rounded-2xl">
            <Terminal size={24} />
          </div>
          <div>
            <h3 className="text-xl font-black text-white">Developer Sync</h3>
            <p className="text-xs text-neutral-400 font-medium">Save your data permanently into the app source code.</p>
          </div>
        </div>
        
        <div className="bg-white/5 p-6 rounded-3xl space-y-4">
          <p className="text-sm text-neutral-300 leading-relaxed">
            I can't see your browser's local memory. To make your uploaded data the permanent default for this app:
          </p>
          <ol className="text-xs text-neutral-400 space-y-2 list-decimal list-inside">
            <li>Upload your data via CSV or manual entry.</li>
            <li>Click the button below to copy the JSON representation.</li>
            <li>Paste that JSON into our chat and ask me to "save it as seed data".</li>
          </ol>
          
          <button 
            onClick={handleCopyToClipboard}
            className="w-full mt-2 py-4 bg-white text-neutral-900 rounded-2xl font-black flex items-center justify-center space-x-2 hover:bg-neutral-200 transition-all active:scale-95 shadow-xl"
          >
            <Copy size={18} />
            <span>Copy Current Data for AI</span>
          </button>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* JSON Migration Hub */}
        <section className="bg-white p-8 rounded-[2.5rem] border-2 border-neutral-100 shadow-sm space-y-8 flex flex-col h-full">
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
              <FileJson size={24} />
            </div>
            <div>
              <h3 className="text-xl font-black text-neutral-900">Backup & Migration</h3>
              <p className="text-xs text-neutral-400">Transfer data between devices (JSON).</p>
            </div>
          </div>

          <div className="space-y-4 p-5 bg-neutral-50 rounded-3xl border border-neutral-100">
            <h4 className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-2 flex items-center">
              <Settings2 size={12} className="mr-2" /> Migration Options
            </h4>
            <div className="space-y-3">
              <label className="flex items-center justify-between cursor-pointer group p-2 hover:bg-white rounded-xl transition-all">
                <span className="text-sm font-bold text-neutral-600 group-hover:text-neutral-900">Include Progress on Export</span>
                <input 
                  type="checkbox" 
                  checked={includeProgressOnExport} 
                  onChange={(e) => setIncludeProgressOnExport(e.target.checked)}
                  className="w-5 h-5 rounded-lg border-neutral-300 text-neutral-900 focus:ring-neutral-900 cursor-pointer"
                />
              </label>
              <label className="flex items-center justify-between cursor-pointer group p-2 hover:bg-white rounded-xl transition-all">
                <span className="text-sm font-bold text-neutral-600 group-hover:text-neutral-900">Apply Progress on Import</span>
                <input 
                  type="checkbox" 
                  checked={applyProgressOnImport} 
                  onChange={(e) => setApplyProgressOnImport(e.target.checked)}
                  className="w-5 h-5 rounded-lg border-neutral-300 text-neutral-900 focus:ring-neutral-900 cursor-pointer"
                />
              </label>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mt-auto">
            <button 
              onClick={() => jsonInputRef.current?.click()} 
              disabled={!!importingType}
              className="flex flex-col items-center justify-center p-6 bg-white border-2 border-neutral-900 text-neutral-900 rounded-3xl hover:bg-neutral-50 transition-all font-black text-xs space-y-3 group active:scale-95 disabled:opacity-50"
            >
              <Upload size={24} className="group-hover:-translate-y-1 transition-transform" />
              <span>IMPORT JSON</span>
              <input type="file" ref={jsonInputRef} className="hidden" accept=".json" onChange={handleJSONImport} />
            </button>
            <button 
              onClick={handleJSONExport}
              className="flex flex-col items-center justify-center p-6 bg-neutral-900 text-white rounded-3xl hover:bg-neutral-800 transition-all font-black text-xs space-y-3 group shadow-lg active:scale-95"
            >
              <Download size={24} className="group-hover:translate-y-1 transition-transform" />
              <span>EXPORT JSON</span>
            </button>
          </div>
        </section>

        {/* CSV Bulk Entry Hub */}
        <section className="bg-white p-8 rounded-[2.5rem] border-2 border-neutral-100 shadow-sm space-y-8 flex flex-col h-full">
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-green-50 text-green-600 rounded-2xl">
              <FileSpreadsheet size={24} />
            </div>
            <div>
              <h3 className="text-xl font-black text-neutral-900">Bulk Word Import</h3>
              <p className="text-xs text-neutral-400">Add words from Google Sheets (CSV).</p>
            </div>
          </div>

          <div className="p-5 bg-neutral-50 rounded-3xl border border-neutral-100 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-[10px] font-black text-neutral-400 uppercase tracking-widest flex items-center">
                <Database size={12} className="mr-2" /> CSV Logic
              </h4>
              <label className="flex items-center space-x-2 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={useAIForImport} 
                  onChange={(e) => setUseAIForImport(e.target.checked)}
                  className="w-4 h-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900"
                />
                <span className="text-[10px] font-bold text-neutral-500">Auto-fill via AI</span>
              </label>
            </div>
            <div className="text-[10px] text-neutral-400 leading-relaxed font-medium">
              Expected format: <code className="bg-neutral-200 px-1 rounded text-neutral-700">Word, IPA, Tags, Note, Example, MeaningVi</code>. <br/>
              Progress data will be reset for all CSV items.
            </div>
          </div>

          <button 
            onClick={() => csvInputRef.current?.click()} 
            disabled={!!importingType}
            className="w-full mt-auto py-6 bg-white border-2 border-neutral-100 text-neutral-900 rounded-3xl hover:border-neutral-900 transition-all font-black flex items-center justify-center space-x-3 active:scale-[0.98] disabled:opacity-50"
          >
            {importingType === 'CSV' ? <Loader2 className="animate-spin" /> : <Upload size={20} />}
            <span>UPLOAD CSV FILE</span>
            <input type="file" ref={csvInputRef} className="hidden" accept=".csv" onChange={handleCSVImport} />
          </button>
        </section>
      </div>

      <section className="bg-red-50 p-8 rounded-[2.5rem] border-2 border-red-100 space-y-6">
        <div className="flex items-center space-x-3">
          <Trash2 className="text-red-500" size={20} />
          <h3 className="text-xl font-black text-red-700 uppercase tracking-tighter">Danger Zone</h3>
        </div>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <p className="text-sm text-red-600/70 font-medium max-w-md">
            Wipe all vocabulary data and user profiles from this device. This action is irreversible unless you have a JSON backup.
          </p>
          <button 
            onClick={async () => {
              if(confirm("DELETE EVERYTHING? This will wipe your entire local database permanently.")) {
                const all = await getAllWordsForExport(userId);
                for(const w of all) await deleteWordFromDB(w.id);
                await onRefresh();
              }
            }} 
            className="px-8 py-4 bg-red-600 text-white rounded-2xl font-black text-sm hover:bg-red-700 transition-all shadow-lg active:scale-95 whitespace-nowrap"
          >
            NUKE ALL DATA
          </button>
        </div>
      </section>
    </div>
  );
};

export default SettingsView;
