import * as dataStore from '../app/dataStore';
import { User } from '../app/types';
import { getFullExportData } from './backupService';
import { processJsonImport, ImportResult } from '../utils/dataHandler';

const GOOGLE_DRIVE_SCOPE = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
].join(' ');
const GOOGLE_IDENTITY_SCRIPT = 'https://accounts.google.com/gsi/client';
const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';
const DRIVE_FOLDER_NAME = 'Vocab';
const AUTH_STORAGE_KEY = 'vocab_pro_google_drive_auth';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';
const GOOGLE_DRIVE_API_OVERVIEW_URL = 'https://console.developers.google.com/apis/api/drive.googleapis.com/overview';

type GoogleDriveAuthState = {
  accessToken: string;
  expiresAt: number;
  authenticatedAt: number;
  email?: string;
};

const getGoogleDriveEnableUrl = (message: string) => {
  const projectMatch = message.match(/project\s+(\d{6,})/i);
  const projectId = projectMatch?.[1];
  return projectId
    ? `${GOOGLE_DRIVE_API_OVERVIEW_URL}?project=${projectId}`
    : GOOGLE_DRIVE_API_OVERVIEW_URL;
};

export const getGoogleDriveErrorDisplay = (error: unknown): { message: string; enableUrl?: string } => {
  const message = error instanceof Error ? error.message : String(error || '');
  const normalized = message.toLowerCase();

  if (normalized.includes('google drive api has not been used in project') || normalized.includes('it is disabled. enable it by visiting')) {
    return {
      message,
      enableUrl: getGoogleDriveEnableUrl(message),
    };
  }

  return { message };
};

const getClientId = () => {
  const env = import.meta.env as any;
  return env.VITE_GOOGLE_CLIENT_ID || env.GOOGLE_CLIENT_ID || '';
};

const loadScript = (src: string) =>
  new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
  });

const readAuthState = (): GoogleDriveAuthState | null => {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GoogleDriveAuthState;
    if (!parsed.accessToken || !parsed.expiresAt) return null;
    if (parsed.expiresAt <= Date.now() + 30_000) return null;
    return parsed;
  } catch {
    return null;
  }
};

const writeAuthState = (state: GoogleDriveAuthState | null) => {
  if (!state) {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  } else {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(state));
  }
  window.dispatchEvent(new CustomEvent('google-drive-auth-changed'));
};

const fetchGoogleAccountEmail = async (accessToken: string): Promise<string | undefined> => {
  try {
    const response = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) return undefined;
    const data = await response.json();
    return typeof data?.email === 'string' ? data.email : undefined;
  } catch {
    return undefined;
  }
};

const requestAccessToken = async (prompt: '' | 'consent' | 'select_account' = ''): Promise<GoogleDriveAuthState> => {
  const clientId = getClientId();
  if (!clientId) {
    throw new Error('Google Drive client ID is missing. Set VITE_GOOGLE_CLIENT_ID.');
  }

  await loadScript(GOOGLE_IDENTITY_SCRIPT);
  const google = (window as any).google;
  if (!google?.accounts?.oauth2?.initTokenClient) {
    throw new Error('Google Identity Services is unavailable.');
  }

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error('Google Drive sign-in timed out.'));
    }, 120000);

    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: GOOGLE_DRIVE_SCOPE,
      callback: async (response: any) => {
        window.clearTimeout(timeout);
        if (response?.access_token) {
          const email = await fetchGoogleAccountEmail(response.access_token);
          const state: GoogleDriveAuthState = {
            accessToken: response.access_token,
            expiresAt: Date.now() + Math.max(0, (response.expires_in || 3600) * 1000),
            authenticatedAt: Date.now(),
            email,
          };
          writeAuthState(state);
          resolve(state);
          return;
        }

        reject(new Error(response?.error_description || response?.error || 'Google Drive sign-in failed.'));
      },
    });

    client.requestAccessToken({ prompt });
  });
};

const ensureAccessToken = async (interactive = true): Promise<GoogleDriveAuthState> => {
  const current = readAuthState();
  if (current) return current;
  if (!interactive) {
    throw new Error('Google Drive is not signed in.');
  }
  return requestAccessToken('consent');
};

const authHeaders = async (interactive = true) => {
  const auth = await ensureAccessToken(interactive);
  return { Authorization: `Bearer ${auth.accessToken}` };
};

const driveFetch = async (path: string, init: RequestInit = {}, interactive = true) => {
  const headers = await authHeaders(interactive);
  const response = await fetch(`${path}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      ...headers,
    },
  });

  if (response.status === 401 || response.status === 403) {
    writeAuthState(null);
    throw new Error('Google Drive authorization expired. Please log in again.');
  }

  return response;
};

const sanitizeFileName = (name: string) => name.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'backup';

const getBackupIdentity = (userId: string, userName: string) => {
  const auth = readAuthState();
  return auth?.email || userName || userId;
};

const ensureFolder = async (interactive = true) => {
  const response = await driveFetch(
    `${DRIVE_API_BASE}/files?q=${encodeURIComponent(`name='${DRIVE_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`)}&fields=files(id,name)`,
    { method: 'GET' },
    interactive
  );

  const data = await response.json();
  if (Array.isArray(data.files) && data.files.length > 0) {
    return data.files[0].id as string;
  }

  const createResponse = await driveFetch(
    `${DRIVE_API_BASE}/files?fields=id`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: DRIVE_FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder',
      }),
    },
    interactive
  );
  const created = await createResponse.json();
  return created.id as string;
};

const findBackupFile = async (fileName: string, folderId: string, interactive = true) => {
  const query = `name='${fileName}' and '${folderId}' in parents and trashed=false`;
  const response = await driveFetch(
    `${DRIVE_API_BASE}/files?q=${encodeURIComponent(query)}&fields=files(id,name,modifiedTime)`,
    { method: 'GET' },
    interactive
  );
  const data = await response.json();
  return Array.isArray(data.files) && data.files.length > 0 ? data.files[0] : null;
};

const uploadMultipart = async (
  url: string,
  metadata: Record<string, unknown>,
  fileBlob: Blob,
  method: 'POST' | 'PATCH',
  interactive = true
) => {
  const boundary = `boundary_${Date.now().toString(36)}`;
  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    'Content-Type: application/json',
    '',
    await fileBlob.text(),
    `--${boundary}--`,
    '',
  ].join('\r\n');

  return driveFetch(
    url,
    {
      method,
      headers: {
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    },
    interactive
  );
};

const saveState = async (payload: unknown, fileName: string, interactive = true) => {
  const folderId = await ensureFolder(interactive);
  const existingFile = await findBackupFile(fileName, folderId, interactive);
  const metadata = {
    name: fileName,
    parents: [folderId],
    mimeType: 'application/json',
  };
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });

  const endpoint = existingFile
    ? `${DRIVE_UPLOAD_BASE}/files/${existingFile.id}?uploadType=multipart&fields=id,modifiedTime`
    : `${DRIVE_UPLOAD_BASE}/files?uploadType=multipart&fields=id,modifiedTime`;

  const response = await uploadMultipart(endpoint, metadata, blob, existingFile ? 'PATCH' : 'POST', interactive);

  if (!response.ok) {
    throw new Error(`Google Drive save failed: ${response.statusText}`);
  }

  const result = await response.json();
  return result as { id: string; modifiedTime?: string };
};

export const getGoogleDriveAuthState = () => readAuthState();

export const isGoogleDriveSignedIn = () => !!readAuthState();

export const signInToGoogleDrive = async () => {
  const auth = await requestAccessToken('consent');
  return auth;
};

export const signOutOfGoogleDrive = async () => {
  writeAuthState(null);
};

export const saveBackupToGoogleDrive = async (userId: string, user: User) => {
  const payload = await getFullExportData(userId, user);
  const fileName = `${sanitizeFileName(getBackupIdentity(userId, user.name || userId))}.json`;
  const result = await saveState(payload, fileName, true);
  localStorage.setItem('vocab_pro_last_backup_timestamp', String(Date.now()));
  const now = Date.now();
  // Keep the same local timestamp markers the server backup uses.
  localStorage.setItem('vocab_pro_local_last_modified', String(now));
  return result;
};

export const restoreBackupFromGoogleDrive = async (userId: string, userName: string): Promise<ImportResult | null> => {
  const folderId = await ensureFolder(true);
  const fileName = `${sanitizeFileName(getBackupIdentity(userId, userName))}.json`;
  const backupFile = await findBackupFile(fileName, folderId, true);
  if (!backupFile?.id) {
    throw new Error(`No Google Drive backup found for ${fileName}.`);
  }

  const response = await driveFetch(`${DRIVE_API_BASE}/files/${backupFile.id}?alt=media`, { method: 'GET' }, true);
  if (!response.ok) {
    throw new Error(`Google Drive restore failed: ${response.statusText}`);
  }

  const blob = await response.blob();
  const file = new File([blob], fileName, { type: 'application/json' });
  const result = await processJsonImport(file, userId, {
    user: true,
    vocabulary: true,
    lesson: true,
    reading: true,
    writing: true,
    speaking: true,
    listening: true,
    mimic: true,
    wordBook: true,
    planning: true,
    questionBank: true,
  });

  if (result.type === 'success' && result.updatedUser) {
    await dataStore.forceReload(result.updatedUser.id);
  }

  return result;
};
