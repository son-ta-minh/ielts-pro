import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { User, SpeakingTopic, SpeakingLog } from '../../app/types';
import * as db from '../../app/db';
import { Loader2 } from 'lucide-react';
import SpeakingTopicLibrary from './SpeakingTopicLibrary';
import SpeakingTopicEditView from './SpeakingTopicEditView';
import SpeakingSessionView from './SpeakingSessionView';
import SpeakingPracticeSetupModal from './SpeakingPracticeSetupModal';
import FullTestSetupModal from './FullTestSetupModal';
import { getFullSpeakingTestPrompt } from '../../services/promptService';
import { useToast } from '../../contexts/ToastContext';
import UniversalAiModal from '../common/UniversalAiModal';

interface Props {
  user: User;
}

type SpeakingView = 'library' | 'edit' | 'practice';

const SpeakingPractice: React.FC<Props> = ({ user }) => {
  const [view, setView] = useState<SpeakingView>('library');
  const [topics, setTopics] = useState<SpeakingTopic[]>([]);
  const [history, setHistory] = useState<SpeakingLog[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeTopic, setActiveTopic] = useState<SpeakingTopic | null>(null);
  const [isEditingNew, setIsEditingNew] = useState(false);
  const [practiceSetupTopic, setPracticeSetupTopic] = useState<SpeakingTopic | null>(null);
  
  const [isFullTestSetupOpen, setIsFullTestSetupOpen] = useState(false);
  const [isFullTestAiModalOpen, setIsFullTestAiModalOpen] = useState(false);
  const [fullTestTheme, setFullTestTheme] = useState('');

  const { showToast } = useToast();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [userTopics, userHistory] = await Promise.all([
        db.getSpeakingTopicsByUserId(user.id),
        db.getSpeakingLogs(user.id)
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
    const map = new Map<string, SpeakingLog[]>();
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
    await db.deleteSpeakingLog(logId);
    showToast("History entry deleted.", "success");
    await loadData();
  };
  
  const handleStartPracticeSetup = (topic: SpeakingTopic) => {
    setPracticeSetupTopic(topic);
  };

  const handleBeginPractice = (questions: string[], topic: SpeakingTopic) => {
    const sessionTopic: SpeakingTopic = { ...topic, questions };
    setActiveTopic(sessionTopic);
    setView('practice');
    setPracticeSetupTopic(null);
  };
  
  const handleOpenFullTestAiModal = (theme: string) => {
    setFullTestTheme(theme);
    setIsFullTestSetupOpen(false);
    setIsFullTestAiModalOpen(true);
  };
  
  const handleFullTestAiResult = (testData: any) => {
    try {
        if (!testData || !testData.part1 || !testData.part2 || !testData.part3) {
            throw new Error("AI failed to generate a valid test structure. Please check the JSON format.");
        }
        
        const fullTestTopic: SpeakingTopic = {
            id: `full-test-${Date.now()}`,
            userId: user.id,
            name: testData.topic || fullTestTheme,
            description: `Full IELTS Test Simulation on "${testData.topic || fullTestTheme}"`,
            questions: testData.part1,
            part2: testData.part2,
            part3: testData.part3,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
        
        setActiveTopic(fullTestTopic);
        setView('practice');
        setIsFullTestAiModalOpen(false);
    } catch (e: any) {
        showToast(e.message, "error");
        throw e; // re-throw for the modal to catch
    }
  };

  const handleEditTopic = (topic: SpeakingTopic) => {
    setActiveTopic(topic);
    setIsEditingNew(false);
    setView('edit');
  };

  const handleCreateNewTopic = () => {
    const newTopic: SpeakingTopic = {
      id: `spk-topic-${Date.now()}`,
      userId: user.id,
      name: 'New Topic',
      description: '',
      questions: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setActiveTopic(newTopic);
    setIsEditingNew(true);
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
      <SpeakingTopicEditView
        user={user}
        topic={activeTopic}
        onSave={handleSaveTopic}
        onCancel={handleCancelEdit}
      />
    );
  }
  
  if (view === 'practice' && activeTopic) {
    return (
      <SpeakingSessionView 
        user={user}
        topic={activeTopic}
        onComplete={handleSessionComplete}
      />
    );
  }

  return (
    <>
      <SpeakingTopicLibrary
        user={user}
        topics={topics}
        history={history}
        historyByTopic={historyByTopic}
        onStartPractice={handleStartPracticeSetup}
        onEditTopic={handleEditTopic}
        onCreateTopic={handleCreateNewTopic}
        onDeleteTopic={async (id) => { await db.deleteSpeakingTopic(id); await loadData(); }}
        onDeleteLog={handleDeleteLog}
        onStartFullTestSetup={() => setIsFullTestSetupOpen(true)}
      />
      <SpeakingPracticeSetupModal 
        topic={practiceSetupTopic}
        onClose={() => setPracticeSetupTopic(null)}
        onStart={(questions) => practiceSetupTopic && handleBeginPractice(questions, practiceSetupTopic)}
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
        title="Generate Full Speaking Test"
        description="Copy the command, get the JSON from your AI, then paste it back to start."
        initialData={{ words: fullTestTheme }} // Pass theme for prompt generation
        hidePrimaryInput={true}
        onGeneratePrompt={(inputs: any) => getFullSpeakingTestPrompt(inputs.words)}
        onJsonReceived={handleFullTestAiResult}
      />
    </>
  );
};

export default SpeakingPractice;