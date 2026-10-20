export interface WebDavConfig {
  url: string;
  username: string;
  password: string;
  syncDir: string;
  autoSyncInterval: number; // in minutes, 0 = manual only
}

export interface SecurityConfig {
  salt: string; // base64 string
  lockTimeoutMinutes: number; // auto-lock timeout
  isConfigured: boolean;
}

export interface VaultItem {
  id: string;
  title: string;
  username: string;
  password: string;
  urls: string[]; // domains or full URLs
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface SyncBookmarkNode {
  id: string; // Unified stable ID/UUID
  title: string;
  url?: string;
  dateAdded?: number;
  dateModified?: number;
  children?: SyncBookmarkNode[];
}

export interface RemoteMeta {
  version: number;
  salt: string;
  verifier?: string;
  bookmarksLastModified: number;
  vaultLastModified: number;
  updatedBy?: string;
}

export interface SyncState {
  isSyncing: boolean;
  lastSyncTime: number | null;
  lastError: string | null;
  bookmarkCount: number;
  vaultCount: number;
}
