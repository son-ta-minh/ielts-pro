
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
  mode: 'system' | 'ai';
  preferredSystemVoice: string;
  preferredAccent: 'US' | 'UK';
  appliedAccent?: 'US' | 'UK';
}

export interface DailyGoalConfig {
  max_learn_per_day: number;
  max_review_per_day: number;
}

export interface InterfaceConfig {
  studyBuddyLanguage: 'vi' | 'en';
  studyBuddyEnabled: boolean;
  studyBuddyAvatar: 'robot' | 'owl' | 'pet' | 'fox' | 'koala' | 'bunny' | 'lion' | 'panda' | 'unicorn' | 'chicken';
}

export interface TestConfig {
  preferredTypes: string[];
}

export interface SystemConfig {
  ai: AiConfig;
  srs: SrsConfig;
  audio: AudioConfig;
  dailyGoals: DailyGoalConfig;
  interface: InterfaceConfig;
  test: TestConfig;
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

export const DEFAULT_DAILY_GOAL_CONFIG: DailyGoalConfig = {
  max_learn_per_day: 10,
  max_review_per_day: 10,
};

export const DEFAULT_TEST_CONFIG: TestConfig = {
  preferredTypes: []
};

export const DEFAULT_CONFIG: SystemConfig = {
  ai: {
    enableGeminiApi: true,
    modelForComplexTasks: 'gemini-3-pro-preview',
    modelForBasicTasks: 'gemini-3-flash-preview',
    modelForTts: 'gemini-2.5-flash-preview-tts',
  },
  srs: DEFAULT_SRS_CONFIG,
  audio: {
    mode: 'system',
    preferredSystemVoice: '',
    preferredAccent: 'US',
    appliedAccent: undefined,
  },
  dailyGoals: DEFAULT_DAILY_GOAL_CONFIG,
  interface: {
    studyBuddyLanguage: 'vi',
    studyBuddyEnabled: true,
    studyBuddyAvatar: 'fox'
  },
  test: DEFAULT_TEST_CONFIG
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
        Object.assign(output, { [key]: source[key] });
      }
    });
  }
  return output;
}

let currentConfig: SystemConfig | null = null;

export function getConfig(): SystemConfig {
  if (currentConfig) {
    return currentConfig;
  }
  
  const storedConfig = getStoredJSON<Partial<SystemConfig>>(CONFIG_KEY, {});
  currentConfig = mergeConfigs(DEFAULT_CONFIG, storedConfig);
  
  return currentConfig as SystemConfig;
}

export function saveConfig(config: SystemConfig): void {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    currentConfig = config; // Update cached config
    window.dispatchEvent(new Event('config-updated')); // Notify app of changes
  } catch (e) {
    console.error("Failed to save system config.", e);
  }
}
