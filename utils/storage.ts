import type { WebDavConfig, SecurityConfig, VaultItem, SyncState } from '../types';

export const STORAGE_KEYS = {
  WEBDAV_CONFIG: 'passmark_webdav_config',
  SECURITY_CONFIG: 'passmark_security_config',
  AUTH_VERIFIER: 'passmark_auth_verifier',
  ENCRYPTED_VAULT: 'passmark_encrypted_vault',
  LAST_SYNC: 'passmark_last_sync',
  SYNC_OPTIONS: 'passmark_sync_options',
  DEVICE_WORK_KEY: 'passmark_device_work_key',
} as const;

export interface SyncOptions {
  syncBookmarks: boolean;
  syncVault: boolean;
  autoSync: boolean;
}

const DEFAULT_WEBDAV: WebDavConfig = {
  url: '',
  username: '',
  password: '',
  syncDir: '/passmark/',
  autoSyncInterval: 15,
};

const DEFAULT_SECURITY: SecurityConfig = {
  salt: '',
  lockTimeoutMinutes: 15,
  isConfigured: false,
  rememberDevice: false,
};

const DEFAULT_SYNC_OPTIONS: SyncOptions = {
  syncBookmarks: true,
  syncVault: true,
  autoSync: true,
};

const DEFAULT_SYNC_STATE: SyncState = {
  isSyncing: false,
  lastSyncTime: null,
  lastError: null,
  bookmarkCount: 0,
  vaultCount: 0,
};

/**
 * 读取单个键值，统一做类型收窄，避免 @types/chrome 的宽泛返回类型
 */
async function readKey<T>(key: string): Promise<T | null> {
  const res = (await chrome.storage.local.get(key)) as Record<string, T | undefined>;
  const value = res[key];
  return value === undefined ? null : value;
}

export async function getWebDavConfig(): Promise<WebDavConfig> {
  const stored = await readKey<Partial<WebDavConfig>>(STORAGE_KEYS.WEBDAV_CONFIG);
  return { ...DEFAULT_WEBDAV, ...(stored || {}) };
}

export async function setWebDavConfig(config: WebDavConfig): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.WEBDAV_CONFIG]: config });
}

export async function getSecurityConfig(): Promise<SecurityConfig> {
  const stored = await readKey<Partial<SecurityConfig>>(STORAGE_KEYS.SECURITY_CONFIG);
  return { ...DEFAULT_SECURITY, ...(stored || {}) };
}

export async function setSecurityConfig(config: SecurityConfig): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.SECURITY_CONFIG]: config });
}

export async function getAuthVerifier(): Promise<string | null> {
  return await readKey<string>(STORAGE_KEYS.AUTH_VERIFIER);
}

export async function setAuthVerifier(verifier: string): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.AUTH_VERIFIER]: verifier });
}

export async function getEncryptedVault(): Promise<string | null> {
  return await readKey<string>(STORAGE_KEYS.ENCRYPTED_VAULT);
}

export async function setEncryptedVault(ciphertext: string): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.ENCRYPTED_VAULT]: ciphertext });
}

export async function getSyncOptions(): Promise<SyncOptions> {
  const stored = await readKey<Partial<SyncOptions>>(STORAGE_KEYS.SYNC_OPTIONS);
  return { ...DEFAULT_SYNC_OPTIONS, ...(stored || {}) };
}

export async function setSyncOptions(opts: SyncOptions): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.SYNC_OPTIONS]: opts });
}

export async function getSyncState(): Promise<SyncState> {
  const stored = await readKey<Partial<SyncState>>(STORAGE_KEYS.LAST_SYNC);
  return { ...DEFAULT_SYNC_STATE, ...(stored || {}) };
}

export async function updateSyncState(patch: Partial<SyncState>): Promise<SyncState> {
  const current = await getSyncState();
  const next = { ...current, ...patch };
  await chrome.storage.local.set({ [STORAGE_KEYS.LAST_SYNC]: next });
  return next;
}

export async function getDeviceWorkKey(): Promise<string | null> {
  return await readKey<string>(STORAGE_KEYS.DEVICE_WORK_KEY);
}

export async function setDeviceWorkKey(keyBase64: string | null): Promise<void> {
  if (keyBase64 === null) {
    await chrome.storage.local.remove(STORAGE_KEYS.DEVICE_WORK_KEY);
  } else {
    await chrome.storage.local.set({ [STORAGE_KEYS.DEVICE_WORK_KEY]: keyBase64 });
  }
}
