import type { VaultItem, RemoteMeta } from '../types';
import {
  deriveKey,
  encryptObject,
  decryptObject,
  encryptText,
  decryptText,
  generateSalt,
  AUTH_CHECK_PAYLOAD,
} from './crypto';
import {
  getSecurityConfig,
  setSecurityConfig,
  getAuthVerifier,
  setAuthVerifier,
  getEncryptedVault,
  setEncryptedVault,
} from './storage';

// In-memory runtime state (never written to disk in plain text)
let activeCryptoKey: CryptoKey | null = null;
let lastUnlockedTimestamp: number = 0;
let cachedVaultItems: VaultItem[] | null = null;

export function isVaultUnlocked(timeoutMinutes = 15): boolean {
  if (!activeCryptoKey) return false;
  if (timeoutMinutes <= 0) return true;

  const elapsed = (Date.now() - lastUnlockedTimestamp) / 1000 / 60;
  if (elapsed > timeoutMinutes) {
    lockVault();
    return false;
  }
  return true;
}

export function lockVault(): void {
  activeCryptoKey = null;
  lastUnlockedTimestamp = 0;
  cachedVaultItems = null;
}

export function getActiveCryptoKey(): CryptoKey | null {
  return activeCryptoKey;
}

export function setActiveCryptoKey(key: CryptoKey): void {
  activeCryptoKey = key;
  lastUnlockedTimestamp = Date.now();
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
  if (!activeCryptoKey) return [];

  const encrypted = await getEncryptedVault();
  if (!encrypted) {
    cachedVaultItems = [];
    return [];
  }

  try {
    const items = await decryptObject<VaultItem[]>(encrypted, activeCryptoKey);
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
  if (!activeCryptoKey) {
    throw new Error('保险箱已锁定，无法保存数据');
  }

  cachedVaultItems = items;
  const encrypted = await encryptObject(items, activeCryptoKey);
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
 * Find matching vault items for a given URL / hostname
 */
export function matchVaultItemsForUrl(items: VaultItem[], targetUrl: string): VaultItem[] {
  let hostname = '';
  try {
    const parsed = new URL(targetUrl.includes('://') ? targetUrl : `https://${targetUrl}`);
    hostname = parsed.hostname.toLowerCase();
  } catch {
    hostname = targetUrl.toLowerCase();
  }

  return items.filter((item) => {
    return item.urls.some((u) => {
      let uHost = '';
      try {
        const p = new URL(u.includes('://') ? u : `https://${u}`);
        uHost = p.hostname.toLowerCase();
      } catch {
        uHost = u.toLowerCase();
      }
      return hostname === uHost || hostname.endsWith(`.${uHost}`) || uHost.endsWith(`.${hostname}`);
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
