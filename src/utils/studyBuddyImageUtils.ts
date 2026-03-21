import {
    StudyBuddyImageAspectRatio,
    StudyBuddyImagePreset,
    StudyBuddyImageSettings
} from '../app/types';

export const STUDY_BUDDY_IMAGE_ASPECT_OPTIONS: Array<{
    label: string;
    value: StudyBuddyImageAspectRatio;
    width: number;
    height: number;
}> = [
    { label: 'Portrait (9:16)', value: 'portrait', width: 512, height: 768 },
    { label: 'Square (1:1)', value: 'square', width: 512, height: 512 },
    { label: 'Landscape (16:9)', value: 'landscape', width: 768, height: 512 }
];

export const STUDY_BUDDY_IMAGE_PRESETS: Record<StudyBuddyImagePreset, { steps: number; cfg: number; label: string }> = {
    fast: { steps: 15, cfg: 6, label: 'Fast' },
    balanced: { steps: 20, cfg: 7, label: 'Balanced' },
    quality: { steps: 25, cfg: 7.5, label: 'High Quality' },
    ultra: { steps: 30, cfg: 8, label: 'Ultra' }
};

export const STUDY_BUDDY_IMAGE_BASE_NEGATIVE =
    'blurry, bad anatomy, extra fingers, low quality, worst quality, distorted face';

export const DEFAULT_STUDY_BUDDY_IMAGE_SETTINGS: StudyBuddyImageSettings = {
    safeMode: true,
    aspectRatioMode: 'auto',
    aspectRatio: 'square',
    presetMode: 'auto',
    preset: 'balanced',
    stepsMode: 'auto',
    steps: 20,
    cfgMode: 'auto',
    cfg: 7,
    seedMode: 'auto',
    seed: null,
    negativeMode: 'auto',
    negative: ''
};

export function clampImageSteps(value: number) {
    return Math.max(15, Math.min(30, Math.round(value)));
}

export function clampImageCfg(value: number) {
    return Math.max(5, Math.min(9, Math.round(value * 2) / 2));
}

export function normalizeStudyBuddyImageSettings(raw?: Partial<StudyBuddyImageSettings> | null): StudyBuddyImageSettings {
    const source = raw || {};
    const aspectRatio = STUDY_BUDDY_IMAGE_ASPECT_OPTIONS.some((item) => item.value === source.aspectRatio)
        ? source.aspectRatio as StudyBuddyImageAspectRatio
        : DEFAULT_STUDY_BUDDY_IMAGE_SETTINGS.aspectRatio;
    const preset = source.preset && source.preset in STUDY_BUDDY_IMAGE_PRESETS
        ? source.preset as StudyBuddyImagePreset
        : DEFAULT_STUDY_BUDDY_IMAGE_SETTINGS.preset;

    return {
        safeMode: source.safeMode !== false,
        aspectRatioMode: source.aspectRatioMode === 'manual' ? 'manual' : 'auto',
        aspectRatio,
        presetMode: source.presetMode === 'manual' ? 'manual' : 'auto',
        preset,
        stepsMode: source.stepsMode === 'manual' ? 'manual' : 'auto',
        steps: clampImageSteps(Number.isFinite(Number(source.steps)) ? Number(source.steps) : DEFAULT_STUDY_BUDDY_IMAGE_SETTINGS.steps),
        cfgMode: source.cfgMode === 'manual' ? 'manual' : 'auto',
        cfg: clampImageCfg(Number.isFinite(Number(source.cfg)) ? Number(source.cfg) : DEFAULT_STUDY_BUDDY_IMAGE_SETTINGS.cfg),
        seedMode: source.seedMode === 'manual' ? 'manual' : 'auto',
        seed: source.seed === null || source.seed === undefined || source.seed === ''
            ? null
            : (Number.isFinite(Number(source.seed)) ? Math.max(1, Math.floor(Number(source.seed))) : null),
        negativeMode: source.negativeMode === 'manual' ? 'manual' : 'auto',
        negative: String(source.negative || '').trim()
    };
}

export function getStudyBuddyImageSettingsSummary(raw?: Partial<StudyBuddyImageSettings> | null) {
    const settings = normalizeStudyBuddyImageSettings(raw);
    const parts: string[] = [];

    parts.push(settings.safeMode ? 'safe on' : 'safe off');
    parts.push(settings.aspectRatioMode === 'manual' ? settings.aspectRatio : 'aspect auto');
    parts.push(settings.presetMode === 'manual' ? `${STUDY_BUDDY_IMAGE_PRESETS[settings.preset].label} preset` : 'preset auto');
    parts.push(settings.stepsMode === 'manual' ? `${settings.steps} steps` : 'steps auto');
    parts.push(settings.cfgMode === 'manual' ? `cfg ${settings.cfg}` : 'cfg auto');
    if (settings.seedMode === 'manual') {
        parts.push(`seed ${settings.seed ?? 'random'}`);
    }
    if (settings.negativeMode === 'manual' && settings.negative) {
        parts.push('negative custom');
    }

    return parts.join(' • ');
}
