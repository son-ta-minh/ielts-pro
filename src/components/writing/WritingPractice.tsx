import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { User, WritingTopic, WritingLog } from '../../app/types';
import * as db from '../../app/db';
import { Loader2 } from 'lucide-react';
import WritingTopicLibrary from './WritingTopicLibrary';
import WritingTopicEditView from './WritingTopicEditView';
import WritingSessionView from './WritingSessionView';
import FullTestSetupModal from '../speaking/FullTestSetupModal'; // Re-using this
import { getFullWritingTestPrompt } from '../../services/promptService';
import { useToast } from '../../contexts/ToastContext';
import UniversalAiModal from '../common/UniversalAiModal';

interface Props {
  user: User;
}

type WritingView = 'library' | 'edit' | 'practice';

const WritingPractice: React.FC<Props> = ({ user }) => {
  const [view, setView] = useState<WritingView>('library');
  const [topics, setTopics] = useState<WritingTopic[]>([]);
  const [history, setHistory] = useState<WritingLog[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeTopic, setActiveTopic] = useState<WritingTopic | null>(null);
  const [isFullTestSetupOpen, setIsFullTestSetupOpen] = useState(false);
  const [isFullTestAiModalOpen, setIsFullTestAiModalOpen] = useState(false);
  const [fullTestTheme, setFullTestTheme] = useState('');

  const { showToast } = useToast();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [userTopics, userHistory] = await Promise.all([
        db.getWritingTopicsByUserId(user.id),
        db.getWritingLogs(user.id)
      ]);
      setTopics(userTopics.sort((a, b) => b.createdAt - a.createdAt));
      setHistory(userHistory);
    } finally {
      setLoading(false);
    }
  }, [user.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const historyByTopic = useMemo(() => {
    const map = new Map<string, WritingLog[]>();
    for (const log of history) {
        const key = log.topicName;
        if (!map.has(key)) {
            map.set(key, []);
        }
        map.get(key)!.push(log);
    }
    return map;
  }, [history]);

  const handleDeleteLog = async (logId: string) => {
    await db.deleteWritingLog(logId);
    showToast("History entry deleted.", "success");
    await loadData();
  };
  
  const handleBeginPractice = (topic: WritingTopic) => {
    setActiveTopic(topic);
    setView('practice');
  };
  
  const handleOpenFullTestAiModal = (theme: string) => {
    setFullTestTheme(theme);
    setIsFullTestSetupOpen(false);
    setIsFullTestAiModalOpen(true);
  };
  
  const handleFullTestAiResult = (testData: any) => {
    try {
        if (!testData || !testData.task1 || !testData.task2) {
            throw new Error("AI failed to generate a valid test structure.");
        }
        
        const fullTestTopic: WritingTopic = {
            id: `full-test-writing-${Date.now()}`,
            userId: user.id,
            name: testData.topic || fullTestTheme,
            description: `Full IELTS Writing Test on "${testData.topic || fullTestTheme}"`,
            task1: testData.task1,
            task2: testData.task2,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
        
        setActiveTopic(fullTestTopic);
        setView('practice');
        setIsFullTestAiModalOpen(false);
    } catch (e: any) {
        showToast(e.message, "error");
        throw e;
    }
  };

  const handleEditTopic = (topic: WritingTopic) => {
    setActiveTopic(topic);
    setView('edit');
  };

  const handleCreateNewTopic = () => {
    const newTopic: WritingTopic = {
      id: `wrt-topic-${Date.now()}`,
      userId: user.id,
      name: 'New Topic',
      description: '',
      task1: '',
      task2: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setActiveTopic(newTopic);
    setView('edit');
  };

  const handleSaveTopic = async () => {
    await loadData();
    setView('library');
    setActiveTopic(null);
  };
  
  const handleCancelEdit = () => {
    setView('library');
    setActiveTopic(null);
  };

  const handleSessionComplete = async () => {
    setView('library');
    setActiveTopic(null);
    await loadData(); // Refresh history
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-20">
        <Loader2 className="animate-spin text-neutral-300" size={32} />
      </div>
    );
  }

  if (view === 'edit' && activeTopic) {
    return (
      <WritingTopicEditView
        user={user}
        topic={activeTopic}
        onSave={handleSaveTopic}
        onCancel={handleCancelEdit}
      />
    );
  }
  
  if (view === 'practice' && activeTopic) {
    return (
      <WritingSessionView 
        user={user}
        topic={activeTopic}
        onComplete={handleSessionComplete}
      />
    );
  }

  return (
    <>
      <WritingTopicLibrary
        user={user}
        topics={topics}
        history={history}
        historyByTopic={historyByTopic}
        onStartPractice={handleBeginPractice}
        onEditTopic={handleEditTopic}
        onCreateTopic={handleCreateNewTopic}
        onDeleteTopic={async (id) => { await db.deleteWritingTopic(id); await loadData(); }}
        onDeleteLog={handleDeleteLog}
        onStartFullTestSetup={() => setIsFullTestSetupOpen(true)}
      />
      <FullTestSetupModal
        isOpen={isFullTestSetupOpen}
        onClose={() => setIsFullTestSetupOpen(false)}
        onStartTest={handleOpenFullTestAiModal}
      />
      <UniversalAiModal
        isOpen={isFullTestAiModalOpen}
        onClose={() => setIsFullTestAiModalOpen(false)}
        type="REFINE_WORDS" // Re-using for UI
        title="Generate Full Writing Test"
        description="Copy the command, get the JSON from your AI, then paste it back to start."
        initialData={{ words: fullTestTheme }} // Pass theme for prompt generation
        hidePrimaryInput={true}
        onGeneratePrompt={(inputs: any) => getFullWritingTestPrompt(inputs.words)}
        onJsonReceived={handleFullTestAiResult}
      />
    </>
  );
};

export default WritingPractice;