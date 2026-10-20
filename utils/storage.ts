import type { WebDavConfig, SecurityConfig, VaultItem, SyncState } from '../types';

export const STORAGE_KEYS = {
  WEBDAV_CONFIG: 'passmark_webdav_config',
  SECURITY_CONFIG: 'passmark_security_config',
  AUTH_VERIFIER: 'passmark_auth_verifier',
  ENCRYPTED_VAULT: 'passmark_encrypted_vault',
  LAST_SYNC: 'passmark_last_sync',
  SYNC_OPTIONS: 'passmark_sync_options',
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
};

const DEFAULT_SYNC_OPTIONS: SyncOptions = {
  syncBookmarks: true,
  syncVault: true,
  autoSync: true,
};

export async function getWebDavConfig(): Promise<WebDavConfig> {
  const res = await chrome.storage.local.get(STORAGE_KEYS.WEBDAV_CONFIG);
  return { ...DEFAULT_WEBDAV, ...(res[STORAGE_KEYS.WEBDAV_CONFIG] || {}) };
}

export async function setWebDavConfig(config: WebDavConfig): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.WEBDAV_CONFIG]: config });
}

export async function getSecurityConfig(): Promise<SecurityConfig> {
  const res = await chrome.storage.local.get(STORAGE_KEYS.SECURITY_CONFIG);
  return { ...DEFAULT_SECURITY, ...(res[STORAGE_KEYS.SECURITY_CONFIG] || {}) };
}

export async function setSecurityConfig(config: SecurityConfig): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.SECURITY_CONFIG]: config });
}

export async function getAuthVerifier(): Promise<string | null> {
  const res = await chrome.storage.local.get(STORAGE_KEYS.AUTH_VERIFIER);
  return res[STORAGE_KEYS.AUTH_VERIFIER] || null;
}

export async function setAuthVerifier(verifier: string): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.AUTH_VERIFIER]: verifier });
}

export async function getEncryptedVault(): Promise<string | null> {
  const res = await chrome.storage.local.get(STORAGE_KEYS.ENCRYPTED_VAULT);
  return res[STORAGE_KEYS.ENCRYPTED_VAULT] || null;
}

export async function setEncryptedVault(ciphertext: string): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.ENCRYPTED_VAULT]: ciphertext });
}

export async function getSyncOptions(): Promise<SyncOptions> {
  const res = await chrome.storage.local.get(STORAGE_KEYS.SYNC_OPTIONS);
  return { ...DEFAULT_SYNC_OPTIONS, ...(res[STORAGE_KEYS.SYNC_OPTIONS] || {}) };
}

export async function setSyncOptions(opts: SyncOptions): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.SYNC_OPTIONS]: opts });
}

export async function getSyncState(): Promise<SyncState> {
  const res = await chrome.storage.local.get(STORAGE_KEYS.LAST_SYNC);
  return (
    res[STORAGE_KEYS.LAST_SYNC] || {
      isSyncing: false,
      lastSyncTime: null,
      lastError: null,
      bookmarkCount: 0,
      vaultCount: 0,
    }
  );
}

export async function updateSyncState(patch: Partial<SyncState>): Promise<SyncState> {
  const current = await getSyncState();
  const next = { ...current, ...patch };
  await chrome.storage.local.set({ [STORAGE_KEYS.LAST_SYNC]: next });
  return next;
}
