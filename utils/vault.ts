import type { VaultItem, RemoteMeta } from '../types';
import {
  deriveKey,
  encryptObject,
  decryptObject,
  encryptText,
  decryptText,
  generateSalt,
  uint8ArrayToBase64,
  base64ToUint8Array,
  AUTH_CHECK_PAYLOAD,
} from './crypto';
import {
  getSecurityConfig,
  setSecurityConfig,
  getAuthVerifier,
  setAuthVerifier,
  getEncryptedVault,
  setEncryptedVault,
  getDeviceWorkKey,
  setDeviceWorkKey,
} from './storage';

// In-memory runtime state & chrome.storage persistence
const SESSION_STORAGE_KEY = 'passmark_session_vault_key';
let activeCryptoKey: CryptoKey | null = null;
let lastUnlockedTimestamp: number = 0;
let cachedVaultItems: VaultItem[] | null = null;

async function persistKeyToSession(key: CryptoKey) {
  try {
    const raw = await crypto.subtle.exportKey('raw', key);
    const b64 = uint8ArrayToBase64(new Uint8Array(raw));

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.session) {
      await chrome.storage.session.set({
        [SESSION_STORAGE_KEY]: {
          key: b64,
          unlockedAt: Date.now(),
        },
      });
    }

    // Persist to local device storage for Mode A seamless autofill & sync
    await setDeviceWorkKey(b64);
  } catch (e) {
    console.warn('[PassMark] Failed to persist key:', e);
  }
}

export async function ensureActiveCryptoKey(): Promise<CryptoKey | null> {
  if (activeCryptoKey) return activeCryptoKey;

  try {
    // 1. Check session storage
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.session) {
      const sessionData = await chrome.storage.session.get(SESSION_STORAGE_KEY);
      const session = sessionData[SESSION_STORAGE_KEY];
      if (session && session.key) {
        const keyBytes = base64ToUint8Array(session.key);
        activeCryptoKey = await crypto.subtle.importKey(
          'raw',
          keyBytes as BufferSource,
          'AES-GCM',
          true,
          ['encrypt', 'decrypt']
        );
        lastUnlockedTimestamp = session.unlockedAt;
        return activeCryptoKey;
      }
    }

    // 2. Check trusted local storage for Mode A (Chrome native style)
    const deviceKeyB64 = await getDeviceWorkKey();
    if (deviceKeyB64) {
      const keyBytes = base64ToUint8Array(deviceKeyB64);
      activeCryptoKey = await crypto.subtle.importKey(
        'raw',
        keyBytes as BufferSource,
        'AES-GCM',
        true,
        ['encrypt', 'decrypt']
      );
      lastUnlockedTimestamp = Date.now();
      return activeCryptoKey;
    }
  } catch (e) {
    console.warn('[PassMark] Error reading working key:', e);
  }
  return null;
}

export async function isVaultUnlocked(): Promise<boolean> {
  const key = await ensureActiveCryptoKey();
  return !!key;
}

export async function lockVault(): Promise<void> {
  activeCryptoKey = null;
  lastUnlockedTimestamp = 0;
  cachedVaultItems = null;
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.session) {
      await chrome.storage.session.remove(SESSION_STORAGE_KEY);
    }
    // Also remove local device key on explicit manual lock
    await setDeviceWorkKey(null);
  } catch {}
}

/**
 * Verify master password (used for viewing/copying sensitive plain text)
 */
export async function verifyMasterPassword(password: string): Promise<boolean> {
  const security = await getSecurityConfig();
  if (!security.isConfigured || !security.salt) {
    return false;
  }
  const verifier = await getAuthVerifier();
  if (!verifier) {
    return false;
  }
  try {
    const key = await deriveKey(password, security.salt);
    const decryptedVerifier = await decryptText(verifier, key);
    return decryptedVerifier === AUTH_CHECK_PAYLOAD;
  } catch {
    return false;
  }
}

export function getActiveCryptoKey(): CryptoKey | null {
  return activeCryptoKey;
}

export function setActiveCryptoKey(key: CryptoKey): void {
  activeCryptoKey = key;
  lastUnlockedTimestamp = Date.now();
  persistKeyToSession(key).catch(console.error);
}

/**
 * Connect to an existing cloud vault using master password and remote salt
 */
export async function connectAndRestoreFromCloud(
  password: string,
  remoteMeta: RemoteMeta
): Promise<{ success: boolean; message?: string }> {
  try {
    const key = await deriveKey(password, remoteMeta.salt);

    // If verifier is present, verify password correctness
    if (remoteMeta.verifier) {
      try {
        const decrypted = await decryptText(remoteMeta.verifier, key);
        if (decrypted !== AUTH_CHECK_PAYLOAD) {
          return { success: false, message: '主密码错误，无法解密该云端保险箱' };
        }
      } catch {
        return { success: false, message: '主密码错误，无法解密该云端保险箱' };
      }
    }

    // Save security config with remote salt
    await setSecurityConfig({
      salt: remoteMeta.salt,
      lockTimeoutMinutes: 15,
      isConfigured: true,
    });

    const verifier = remoteMeta.verifier || (await encryptText(AUTH_CHECK_PAYLOAD, key));
    await setAuthVerifier(verifier);

    // Set key and persist to device work key for Mode A
    setActiveCryptoKey(key);

    return { success: true };
  } catch (err: any) {
    return { success: false, message: err.message || '恢复云端保险箱失败' };
  }
}

/**
 * Initialize Master Password for the first time
 */
export async function setupMasterPassword(password: string): Promise<boolean> {
  const salt = generateSalt();
  const key = await deriveKey(password, salt);

  // Generate verifier
  const verifier = await encryptText(AUTH_CHECK_PAYLOAD, key);

  // Initialize empty encrypted vault
  const initialEncryptedVault = await encryptObject<VaultItem[]>([], key);

  await setSecurityConfig({
    salt,
    lockTimeoutMinutes: 15,
    isConfigured: true,
  });
  await setAuthVerifier(verifier);
  await setEncryptedVault(initialEncryptedVault);

  activeCryptoKey = key;
  lastUnlockedTimestamp = Date.now();
  cachedVaultItems = [];
  await persistKeyToSession(key);

  return true;
}

/**
 * Unlock vault with master password
 */
export async function unlockVault(password: string): Promise<{ success: boolean; message?: string }> {
  const security = await getSecurityConfig();
  if (!security.isConfigured || !security.salt) {
    return { success: false, message: '尚未设置主密码，请先完成初始化配置' };
  }

  const verifier = await getAuthVerifier();
  if (!verifier) {
    return { success: false, message: '认证校验数据丢失，请检查配置' };
  }

  try {
    const key = await deriveKey(password, security.salt);
    const decryptedVerifier = await decryptText(verifier, key);

    if (decryptedVerifier !== AUTH_CHECK_PAYLOAD) {
      return { success: false, message: '主密码错误' };
    }

    activeCryptoKey = key;
    lastUnlockedTimestamp = Date.now();
    await persistKeyToSession(key);

    // Load and cache vault items
    await loadVaultFromLocalEncrypted();

    return { success: true };
  } catch (err) {
    return { success: false, message: '主密码验证失败' };
  }
}

/**
 * Read and decrypt local vault items
 */
export async function loadVaultFromLocalEncrypted(): Promise<VaultItem[]> {
  const key = await ensureActiveCryptoKey();
  if (!key) return [];

  const encrypted = await getEncryptedVault();
  if (!encrypted) {
    cachedVaultItems = [];
    return [];
  }

  try {
    const items = await decryptObject<VaultItem[]>(encrypted, key);
    cachedVaultItems = items;
    return items;
  } catch (e) {
    console.error('Failed to decrypt local vault:', e);
    cachedVaultItems = [];
    return [];
  }
}

/**
 * Save items into local encrypted storage
 */
export async function saveVaultItemsLocal(items: VaultItem[]): Promise<void> {
  const key = await ensureActiveCryptoKey();
  if (!key) {
    throw new Error('保险箱已锁定，无法保存数据');
  }

  cachedVaultItems = items;
  const encrypted = await encryptObject(items, key);
  await setEncryptedVault(encrypted);
}

/**
 * Add or update a vault item
 */
export async function saveVaultItem(item: Omit<VaultItem, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<VaultItem> {
  const items = await loadVaultFromLocalEncrypted();
  const now = Date.now();

  let target: VaultItem;
  if (item.id) {
    const idx = items.findIndex((i) => i.id === item.id);
    if (idx !== -1) {
      target = {
        ...items[idx],
        ...item,
        id: item.id,
        updatedAt: now,
      };
      items[idx] = target;
    } else {
      target = {
        ...item,
        id: item.id,
        createdAt: now,
        updatedAt: now,
      };
      items.push(target);
    }
  } else {
    target = {
      ...item,
      id: crypto.randomUUID ? crypto.randomUUID() : `item_${now}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: now,
      updatedAt: now,
    };
    items.push(target);
  }

  await saveVaultItemsLocal(items);
  return target;
}

/**
 * Batch import vault items (e.g. from Chrome CSV)
 */
export async function batchImportVaultItems(
  newItems: Array<Omit<VaultItem, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<{ added: number; updated: number; total: number }> {
  const existingItems = await loadVaultFromLocalEncrypted();
  const now = Date.now();
  let added = 0;
  let updated = 0;

  for (const incoming of newItems) {
    // Check if an item with identical username and URL already exists
    const matchIndex = existingItems.findIndex((ex) => {
      const sameUser = (ex.username || '').toLowerCase() === (incoming.username || '').toLowerCase();
      const sameUrl = ex.urls.some((u) => incoming.urls.includes(u));
      return sameUser && sameUrl;
    });

    if (matchIndex !== -1) {
      existingItems[matchIndex] = {
        ...existingItems[matchIndex],
        password: incoming.password,
        title: incoming.title || existingItems[matchIndex].title,
        notes: incoming.notes || existingItems[matchIndex].notes,
        updatedAt: now,
      };
      updated++;
    } else {
      const id = crypto.randomUUID
        ? crypto.randomUUID()
        : `item_${now}_${Math.random().toString(36).slice(2, 8)}`;
      existingItems.push({
        ...incoming,
        id,
        createdAt: now,
        updatedAt: now,
      });
      added++;
    }
  }

  await saveVaultItemsLocal(existingItems);
  return { added, updated, total: existingItems.length };
}

/**
 * Delete a vault item by ID
 */
export async function deleteVaultItem(id: string): Promise<boolean> {
  const items = await loadVaultFromLocalEncrypted();
  const filtered = items.filter((i) => i.id !== id);
  if (filtered.length !== items.length) {
    await saveVaultItemsLocal(filtered);
    return true;
  }
  return false;
}

/**
 * Extract root / second-level domain (e.g. 'github.com', 'google.com', 'taobao.com')
 */
export function extractBaseDomain(raw: string): string {
  if (!raw) return '';
  let host = raw.toLowerCase().trim();
  try {
    if (host.includes('://')) {
      host = new URL(host).hostname.toLowerCase();
    }
  } catch {}
  // remove port and path
  host = host.split(':')[0].split('/')[0];

  const parts = host.split('.').filter(Boolean);
  if (parts.length <= 2) return host;

  // Handle common multi-level TLDs
  const commonDoubleExtensions = ['com.cn', 'net.cn', 'org.cn', 'gov.cn', 'co.uk', 'org.uk', 'com.hk', 'edu.cn'];
  const lastTwo = parts.slice(-2).join('.');
  if (commonDoubleExtensions.includes(lastTwo) && parts.length >= 3) {
    return parts.slice(-3).join('.');
  }

  return parts.slice(-2).join('.');
}

/**
 * Find matching vault items for a given URL / hostname
 */
export function matchVaultItemsForUrl(items: VaultItem[], targetUrl: string): VaultItem[] {
  if (!targetUrl) return [];
  const targetBase = extractBaseDomain(targetUrl);
  let targetHost = '';
  try {
    targetHost = new URL(targetUrl.includes('://') ? targetUrl : `https://${targetUrl}`).hostname.toLowerCase();
  } catch {
    targetHost = targetUrl.toLowerCase();
  }

  return items.filter((item) => {
    return item.urls.some((u) => {
      if (!u) return false;
      const uBase = extractBaseDomain(u);
      let uHost = '';
      try {
        uHost = new URL(u.includes('://') ? u : `https://${u}`).hostname.toLowerCase();
      } catch {
        uHost = u.toLowerCase();
      }
      return (
        targetHost === uHost ||
        (targetBase && uBase && targetBase === uBase) ||
        targetHost.endsWith(`.${uHost}`) ||
        uHost.endsWith(`.${targetHost}`)
      );
    });
  });
}

/**
 * Merge local and remote vault items safely
 */
export function mergeVaultItems(localItems: VaultItem[], remoteItems: VaultItem[]): VaultItem[] {
  const map = new Map<string, VaultItem>();

  for (const item of localItems) {
    map.set(item.id, item);
  }

  for (const remote of remoteItems) {
    const local = map.get(remote.id);
    if (!local) {
      map.set(remote.id, remote);
    } else {
      // Keep the one with newer updatedAt
      if ((remote.updatedAt || 0) > (local.updatedAt || 0)) {
        map.set(remote.id, remote);
      }
    }
  }

  return Array.from(map.values());
}

/**
 * Password generator
 */
export interface PasswordGeneratorOptions {
  length: number;
  uppercase: boolean;
  lowercase: boolean;
  numbers: boolean;
  symbols: boolean;
}

export function generatePassword(options: PasswordGeneratorOptions = {
  length: 16,
  uppercase: true,
  lowercase: true,
  numbers: true,
  symbols: true,
}): string {
  const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const LOWER = 'abcdefghijklmnopqrstuvwxyz';
  const NUM = '0123456789';
  const SYM = '!@#$%^&*()_+-=[]{}|;:,.<>?';

  let chars = '';
  const requiredChars: string[] = [];

  if (options.uppercase) {
    chars += UPPER;
    requiredChars.push(UPPER[Math.floor(Math.random() * UPPER.length)]);
  }
  if (options.lowercase) {
    chars += LOWER;
    requiredChars.push(LOWER[Math.floor(Math.random() * LOWER.length)]);
  }
  if (options.numbers) {
    chars += NUM;
    requiredChars.push(NUM[Math.floor(Math.random() * NUM.length)]);
  }
  if (options.symbols) {
    chars += SYM;
    requiredChars.push(SYM[Math.floor(Math.random() * SYM.length)]);
  }

  if (!chars) chars = LOWER + NUM;

  const result: string[] = [...requiredChars];
  const remaining = Math.max(0, options.length - requiredChars.length);

  const randomValues = new Uint32Array(remaining);
  crypto.getRandomValues(randomValues);

  for (let i = 0; i < remaining; i++) {
    result.push(chars[randomValues[i] % chars.length]);
  }

  // Shuffle
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result.join('');
}
