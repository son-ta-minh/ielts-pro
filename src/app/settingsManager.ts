
import { getStoredJSON } from "../utils/storage";

export interface AiConfig {
  enableGeminiApi: boolean;
  modelForComplexTasks: string;
  modelForBasicTasks: string;
  modelForTts: string;
}

export interface SrsConfig {
  initialEasy: number;
  initialHard: number;
  easyEasy: number;
  hardEasy: number;
  hardHard: number;
  easyHardPenalty: number;
  forgotInterval: number;
}

export interface AudioConfig {
  mode: 'system' | 'ai' | 'server';
  serverPort: number;
  preferredSystemVoice: string;
  appliedAccent: 'US' | 'UK';
}

export interface CoachConfig {
  name: string;
  avatar: string;
  persona: 'friendly_elementary' | 'professional_professor';
  enVoice: string;
  enAccent: string; 
  viVoice: string;
  viAccent: string; 
}

export interface AudioCoachConfig {
  activeCoach: 'male' | 'female';
  serverPort: number;
  coaches: {
    male: CoachConfig;
    female: CoachConfig;
  };
}

export interface DailyGoalConfig {
  max_learn_per_day: number;
  max_review_per_day: number;
}

export interface InterfaceConfig {
  studyBuddyLanguage: 'vi' | 'en'; 
  buddyVoiceEnabled: boolean; 
  studyBuddyAvatar: string;
  junkTags: string[];
  rightClickCommandEnabled: boolean; // Mới: Cho phép chuột phải hiện command box
}

export interface TestConfig {
  preferredTypes: string[];
}

export interface LessonConfig {
  topic1Options: string[];
  topic2Options: Record<string, string[]>;
}

export interface SystemConfig {
  ai: AiConfig;
  srs: SrsConfig;
  audio: AudioConfig;
  audioCoach: AudioCoachConfig;
  dailyGoals: DailyGoalConfig;
  interface: InterfaceConfig;
  test: TestConfig;
  lesson: LessonConfig;
}

export const DEFAULT_SRS_CONFIG: SrsConfig = {
  initialEasy: 4,
  initialHard: 1,
  easyEasy: 2.5,
  hardEasy: 2.0,
  hardHard: 1.3,
  easyHardPenalty: 0.5,
  forgotInterval: 1,
};

export const DEFAULT_AUDIO_CONFIG: AudioConfig = {
  mode: 'system',
  serverPort: 3000,
  preferredSystemVoice: '',
  appliedAccent: 'US',
};

export const DEFAULT_DAILY_GOAL_CONFIG: DailyGoalConfig = {
  max_learn_per_day: 10,
  max_review_per_day: 10,
};

export const DEFAULT_TEST_CONFIG: TestConfig = {
  preferredTypes: []
};

export const DEFAULT_LESSON_CONFIG: LessonConfig = {
  topic1Options: ['Grammar', 'Vocabulary', 'Pronunciation'],
  topic2Options: {
      'Grammar': ['Tenses', 'Conditionals', 'Passive Voice', 'Reported Speech'],
      'Vocabulary': ['Topic: Work', 'Topic: Environment', 'Collocations', 'Idioms'],
      'Pronunciation': ['Vowel Sounds', 'Consonant Sounds', 'Intonation']
  }
};

export const DEFAULT_CONFIG: SystemConfig = {
  ai: {
    enableGeminiApi: true,
    modelForComplexTasks: 'gemini-3-pro-preview',
    modelForBasicTasks: 'gemini-3-flash-preview',
    modelForTts: 'gemini-2.5-flash-preview-tts',
  },
  srs: DEFAULT_SRS_CONFIG,
  audio: DEFAULT_AUDIO_CONFIG,
  audioCoach: {
    activeCoach: 'female',
    serverPort: 3000,
    coaches: {
      male: {
        name: 'Victor',
        avatar: 'man_teacher',
        persona: 'professional_professor',
        enVoice: '',
        enAccent: 'en_US',
        viVoice: '',
        viAccent: 'vi_VN'
      },
      female: {
        name: 'Sofia',
        avatar: 'woman_teacher',
        persona: 'friendly_elementary',
        enVoice: '',
        enAccent: 'en_US',
        viVoice: '',
        viAccent: 'vi_VN'
      }
    }
  },
  dailyGoals: DEFAULT_DAILY_GOAL_CONFIG,
  interface: {
    studyBuddyLanguage: 'vi',
    buddyVoiceEnabled: true,
    studyBuddyAvatar: 'woman_teacher',
    junkTags: ['ielts', 'general', 'common'],
    rightClickCommandEnabled: true,
  },
  test: DEFAULT_TEST_CONFIG,
  lesson: DEFAULT_LESSON_CONFIG
};

const CONFIG_KEY = 'vocab_pro_system_config';

function isObject(item: any): boolean {
  return (item && typeof item === 'object' && !Array.isArray(item));
}

function mergeConfigs(target: any, source: any): any {
  const output = { ...target };
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach(key => {
      if (isObject(source[key])) {
        if (!(key in target)) {
          Object.assign(output, { [key]: source[key] });
        } else {
          output[key] = mergeConfigs(target[key], source[key]);
        }
      } else {
        output[key] = source[key];
      }
    });
  }
  return output;
}

export function getConfig(): SystemConfig {
  const storedStr = localStorage.getItem(CONFIG_KEY);
  const storedJson = storedStr ? JSON.parse(storedStr) : null;
  
  if (!storedJson) {
      return DEFAULT_CONFIG;
  }

  return mergeConfigs(DEFAULT_CONFIG, storedJson) as SystemConfig;
}

export function saveConfig(config: SystemConfig): void {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    window.dispatchEvent(new Event('config-updated'));
  } catch (e) {
    console.error("Failed to save system config.", e);
  }
}
