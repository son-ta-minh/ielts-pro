import React, { useState, useMemo } from 'react';
import { User, SpeakingTopic, SpeakingLog } from '../../app/types';
import { Mic, Plus, Trash2, Edit3, Play, Search, MessageSquare, History, ChevronRight, ChevronDown, Swords } from 'lucide-react';
import ConfirmationModal from '../common/ConfirmationModal';
import { BandScoreGauge } from '../common/BandScoreGauge';

interface Props {
  user: User;
  topics: SpeakingTopic[];
  history: SpeakingLog[];
  historyByTopic: Map<string, SpeakingLog[]>;
  onStartPractice: (topic: SpeakingTopic) => void;
  onEditTopic: (topic: SpeakingTopic) => void;
  onCreateTopic: () => void;
  onDeleteTopic: (id: string) => void;
  onDeleteLog: (id: string) => void;
  onStartFullTestSetup: () => void;
}

const SpeakingTopicLibrary: React.FC<Props> = ({ user, topics, history, historyByTopic, onStartPractice, onEditTopic, onCreateTopic, onDeleteTopic, onDeleteLog, onStartFullTestSetup }) => {
  const [query, setQuery] = useState('');
  const [topicToDelete, setTopicToDelete] = useState<SpeakingTopic | null>(null);
  const [logToDelete, setLogToDelete] = useState<SpeakingLog | null>(null);
  const [expandedTopicId, setExpandedTopicId] = useState<string | null>(null);

  const filteredTopics = topics.filter(t => 
    t.name.toLowerCase().includes(query.toLowerCase()) || 
    t.description.toLowerCase().includes(query.toLowerCase())
  );
  
  const standaloneHistoryByTopic = useMemo(() => {
    const topicNames = new Set(topics.map(t => t.name));
    const standaloneHistory = history.filter(log => !topicNames.has(log.topicName));
    
    const map = new Map<string, SpeakingLog[]>();
    standaloneHistory.forEach(log => {
        const key = log.topicName;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(log);
    });
    return map;
  }, [topics, history]);


  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-black text-neutral-900 tracking-tight flex items-center gap-3"><Mic size={28}/> Speaking Studio</h2>
          <p className="text-neutral-500 mt-2 font-medium">Organize topics, practice full sessions, and get holistic feedback.</p>
        </div>
        <div className="flex items-center gap-2">
            <button onClick={onCreateTopic} className="px-6 py-3 bg-white border border-neutral-200 text-neutral-600 rounded-xl font-black text-xs flex items-center space-x-2 transition-all hover:bg-neutral-50 active:scale-95 uppercase tracking-widest shadow-sm">
                <Plus size={16} />
                <span>New Topic</span>
            </button>
            <button onClick={onStartFullTestSetup} className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-black text-xs flex items-center space-x-2 transition-all hover:bg-indigo-500 active:scale-95 uppercase tracking-widest shadow-lg shadow-indigo-600/20">
                <Swords size={16} />
                <span>Full Test Simulator</span>
            </button>
        </div>
      </header>
      
      <div className="relative w-full max-w-sm">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" size={16} />
        <input 
          type="text" 
          value={query} 
          onChange={(e) => setQuery(e.target.value)} 
          placeholder="Filter topics..." 
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900 transition-all shadow-sm"
        />
      </div>

      <div className="space-y-3">
        {filteredTopics.length === 0 && standaloneHistoryByTopic.size === 0 ? (
            <div className="p-20 text-center text-neutral-400 border-2 border-dashed border-neutral-200 rounded-2xl">No topics or history found. Create a topic or start a test!</div>
        ) : (
            filteredTopics.map(topic => {
                const topicHistory = historyByTopic.get(topic.name) || [];
                const isExpanded = expandedTopicId === topic.id;
                return (
                    <React.Fragment key={topic.id}>
                        <div className="group flex items-center justify-between p-4 bg-white rounded-2xl border border-neutral-200 shadow-sm hover:border-neutral-300 hover:shadow-md transition-all">
                            <div className="flex-1 overflow-hidden pr-4">
                                <h3 className="font-bold text-neutral-900 truncate">{topic.name}</h3>
                                <p className="text-sm text-neutral-500 truncate">{topic.description}</p>
                            </div>

                            <div className="flex items-center gap-6 shrink-0">
                                <div className="text-center hidden sm:block">
                                    <p className="font-mono font-bold text-lg text-neutral-800">{topic.questions.length}</p>
                                    <p className="text-[9px] font-bold text-neutral-400 uppercase tracking-wider">Questions</p>
                                </div>
                                
                                <div 
                                    className="text-center cursor-pointer"
                                    onClick={() => topicHistory.length > 0 && setExpandedTopicId(isExpanded ? null : topic.id)}
                                >
                                    <div className="flex items-center justify-center gap-1">
                                      <p className="font-mono font-bold text-lg text-neutral-800">{topicHistory.length}</p>
                                      {topicHistory.length > 0 && (isExpanded ? <ChevronDown size={14} className="text-neutral-500"/> : <ChevronRight size={14} className="text-neutral-500"/>)}
                                    </div>
                                    <p className="text-[9px] font-bold text-neutral-400 uppercase tracking-wider">History</p>
                                </div>
                                
                                <div className="w-px h-8 bg-neutral-200 mx-2 hidden md:block"></div>
                                
                                <div className="flex items-center gap-1">
                                    <button onClick={(e) => { e.stopPropagation(); onEditTopic(topic); }} className="p-2.5 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 rounded-xl transition-all opacity-0 group-hover:opacity-100" title="Edit Topic"><Edit3 size={16} /></button>
                                    <button onClick={(e) => { e.stopPropagation(); setTopicToDelete(topic); }} className="p-2.5 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all opacity-0 group-hover:opacity-100" title="Delete Topic"><Trash2 size={16} /></button>
                                    <button onClick={(e) => { e.stopPropagation(); onStartPractice(topic); }} className="px-4 py-2 bg-neutral-900 text-white rounded-lg font-black text-[10px] flex items-center space-x-2 hover:bg-neutral-800 transition-all active:scale-95 shadow-sm uppercase">
                                        <Play size={12} fill="currentColor"/>
                                        <span>Practice</span>
                                    </button>
                                </div>
                            </div>
                        </div>

                        {isExpanded && topicHistory.length > 0 && (
                            <div className="bg-neutral-50/80 rounded-2xl p-4 -mt-2 animate-in fade-in duration-300">
                                <div className="space-y-2">
                                    {topicHistory.map(log => (
                                        <details key={log.id} className="bg-white p-3 rounded-lg border border-neutral-200/50 group/log">
                                            <summary className="flex justify-between items-center text-xs font-medium cursor-pointer list-none">
                                                <span>{new Date(log.timestamp).toLocaleString()}</span>
                                                <div className="flex items-center gap-4">
                                                    <BandScoreGauge score={log.estimatedBand} size="inline" />
                                                    <button onClick={(e) => { e.stopPropagation(); setLogToDelete(log); }} className="p-1.5 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all opacity-0 group-hover/log:opacity-100" title="Delete this history entry"><Trash2 size={12} /></button>
                                                    <ChevronRight size={14} className="text-neutral-400 group-open/log:rotate-90 transition-transform" />
                                                </div>
                                            </summary>
                                            <div className="mt-3 pt-3 border-t border-neutral-100 text-xs leading-relaxed" dangerouslySetInnerHTML={{ __html: log.feedbackHtml }}/>
                                        </details>
                                    ))}
                                </div>
                            </div>
                        )}
                    </React.Fragment>
                );
            })
        )}
      </div>

      {Array.from(standaloneHistoryByTopic.entries()).length > 0 && (
        <div className="mt-12 space-y-4">
            <h4 className="px-4 text-[10px] font-black text-neutral-400 uppercase tracking-[0.2em]">Full Test History</h4>
            {Array.from(standaloneHistoryByTopic.entries()).map(([topicName, logs]) => {
                const isExpanded = expandedTopicId === topicName;
                return (
                    <React.Fragment key={topicName}>
                        <div className="group flex items-center justify-between p-4 bg-white rounded-2xl border border-neutral-200 shadow-sm hover:border-neutral-300 hover:shadow-md transition-all">
                            <div className="flex items-center gap-3 flex-1 overflow-hidden pr-4">
                                <Swords size={18} className="text-indigo-500 shrink-0"/>
                                <div>
                                    <h3 className="font-bold text-neutral-900 truncate">{topicName}</h3>
                                    <p className="text-sm text-neutral-500 font-medium">Full Test Simulation</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-6 shrink-0">
                                <div 
                                    className="text-center cursor-pointer"
                                    onClick={() => logs.length > 0 && setExpandedTopicId(isExpanded ? null : topicName)}
                                >
                                    <div className="flex items-center justify-center gap-1">
                                        <p className="font-mono font-bold text-lg text-neutral-800">{logs.length}</p>
                                        {logs.length > 0 && (isExpanded ? <ChevronDown size={14} className="text-neutral-500"/> : <ChevronRight size={14} className="text-neutral-500"/>)}
                                    </div>
                                    <p className="text-[9px] font-bold text-neutral-400 uppercase tracking-wider">Attempts</p>
                                </div>
                            </div>
                        </div>
                        {isExpanded && logs.length > 0 && (
                            <div className="bg-neutral-50/80 rounded-2xl p-4 -mt-2 animate-in fade-in duration-300">
                                <div className="space-y-2">
                                    {logs.map(log => (
                                        <details key={log.id} className="bg-white p-3 rounded-lg border border-neutral-200/50 group/log">
                                            <summary className="flex justify-between items-center text-xs font-medium cursor-pointer list-none">
                                                <span>{new Date(log.timestamp).toLocaleString()}</span>
                                                <div className="flex items-center gap-4">
                                                    <BandScoreGauge score={log.estimatedBand} size="inline" />
                                                    <button onClick={(e) => { e.stopPropagation(); setLogToDelete(log); }} className="p-1.5 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all opacity-0 group-hover/log:opacity-100" title="Delete this history entry"><Trash2 size={12} /></button>
                                                    <ChevronRight size={14} className="text-neutral-400 group-open/log:rotate-90 transition-transform" />
                                                </div>
                                            </summary>
                                            <div className="mt-3 pt-3 border-t border-neutral-100 text-xs leading-relaxed" dangerouslySetInnerHTML={{ __html: log.feedbackHtml }}/>
                                        </details>
                                    ))}
                                </div>
                            </div>
                        )}
                    </React.Fragment>
                );
            })}
        </div>
      )}
      
      <ConfirmationModal 
        isOpen={!!topicToDelete}
        title="Delete Topic?"
        message={<>Are you sure you want to delete <strong>"{topicToDelete?.name}"</strong>? This action cannot be undone.</>}
        confirmText="Yes, Delete"
        isProcessing={false}
        onConfirm={() => {
          if (topicToDelete) onDeleteTopic(topicToDelete.id);
          setTopicToDelete(null);
        }}
        onClose={() => setTopicToDelete(null)}
        icon={<Trash2 size={40} className="text-red-500"/>}
      />
      <ConfirmationModal 
        isOpen={!!logToDelete}
        title="Delete History Entry?"
        message={<>Are you sure you want to delete this speaking log from <strong>{logToDelete && new Date(logToDelete.timestamp).toLocaleString()}</strong>? This action cannot be undone.</>}
        confirmText="Yes, Delete"
        isProcessing={false}
        onConfirm={() => {
          if (logToDelete) onDeleteLog(logToDelete.id);
          setLogToDelete(null);
        }}
        onClose={() => setLogToDelete(null)}
        icon={<Trash2 size={40} className="text-red-500"/>}
      />
    </div>
  );
};

export default SpeakingTopicLibrary;