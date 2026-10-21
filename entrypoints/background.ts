import {
  getIsApplyingRemote,
  countBookmarks,
  getLocalBookmarkTree,
} from '../utils/bookmarks';
import { WebDavClient } from '../utils/webdav';
import { encryptObject } from '../utils/crypto';
import type { RemoteMeta } from '../types';
import {
  isVaultUnlocked,
  unlockVault,
  lockVault,
  setupMasterPassword,
  verifyMasterPassword,
  connectAndRestoreFromCloud,
  loadVaultFromLocalEncrypted,
  saveVaultItem,
  deleteVaultItem,
  batchImportVaultItems,
  matchVaultItemsForUrl,
  getActiveCryptoKey,
} from '../utils/vault';
import { performSync } from '../utils/sync';
import {
  getSyncOptions,
  getWebDavConfig,
  getSecurityConfig,
  getAuthVerifier,
  updateSyncState,
} from '../utils/storage';

export default defineBackground(() => {
  let bookmarkDebounceTimer: any = null;

  // Initialize alarms and background tasks
  setupAutoSyncAlarm();

  // Listen for alarm triggers
  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'PASSMARK_PERIODIC_SYNC') {
      const options = await getSyncOptions();
      if (options.autoSync && (await isVaultUnlocked())) {
        console.log('[PassMark] Executing periodic background sync...');
        await performSync();
      }
    }
  });

  // Listen for local bookmark events to trigger debounced auto-sync
  function onBookmarkChanged() {
    if (getIsApplyingRemote()) {
      return;
    }

    if (bookmarkDebounceTimer) {
      clearTimeout(bookmarkDebounceTimer);
    }

    bookmarkDebounceTimer = setTimeout(async () => {
      const options = await getSyncOptions();
      if (options.autoSync && options.syncBookmarks && (await isVaultUnlocked())) {
        console.log('[PassMark] Bookmarks changed, triggering debounced sync...');
        await performSync();
      }
    }, 5000);
  }

  chrome.bookmarks.onCreated.addListener(onBookmarkChanged);
  chrome.bookmarks.onRemoved.addListener(onBookmarkChanged);
  chrome.bookmarks.onChanged.addListener(onBookmarkChanged);
  chrome.bookmarks.onMoved.addListener(onBookmarkChanged);

  // Setup periodic sync alarm based on config
  async function setupAutoSyncAlarm() {
    const config = await getWebDavConfig();
    const interval = config.autoSyncInterval || 15;
    chrome.alarms.clear('PASSMARK_PERIODIC_SYNC');
    if (interval > 0) {
      chrome.alarms.create('PASSMARK_PERIODIC_SYNC', {
        periodInMinutes: interval,
      });
    }
  }

  // Unified message handler
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    (async () => {
      switch (request.type) {
        case 'CHECK_UNLOCKED': {
          const unlocked = await isVaultUnlocked();
          sendResponse({ unlocked });
          break;
        }

        case 'SETUP_MASTER_PASSWORD': {
          const ok = await setupMasterPassword(request.password);
          sendResponse({ success: ok });
          break;
        }

        case 'CONNECT_CLOUD_VAULT': {
          const res = await connectAndRestoreFromCloud(request.password, request.remoteMeta);
          if (res.success) {
            const syncRes = await performSync();
            sendResponse({ success: true, message: syncRes.message });
          } else {
            sendResponse(res);
          }
          break;
        }

        case 'UNLOCK_VAULT': {
          const res = await unlockVault(request.password);
          sendResponse(res);
          break;
        }

        case 'VERIFY_MASTER_PASSWORD': {
          const valid = await verifyMasterPassword(request.password);
          sendResponse({ valid });
          break;
        }

        case 'LOCK_VAULT': {
          await lockVault();
          sendResponse({ success: true });
          break;
        }

        case 'TRIGGER_SYNC': {
          const res = await performSync();
          sendResponse(res);
          break;
        }

        case 'RESET_CLOUD_VAULT': {
          const key = await ensureActiveCryptoKey();
          if (!key) {
            sendResponse({ success: false, message: '请先解锁保险箱' });
            return;
          }
          try {
            const webdavConfig = await getWebDavConfig();
            const webdav = new WebDavClient(webdavConfig);
            const security = await getSecurityConfig();
            const verifier = await getAuthVerifier();
            const now = Date.now();

            // 1. Re-encrypt local bookmarks
            const localBookmarks = await getLocalBookmarkTree();
            const encBookmarks = await encryptObject(localBookmarks, key);
            await webdav.putFile('bookmarks.enc', encBookmarks, 'text/plain');

            // 2. Re-encrypt local vault
            const localVault = await loadVaultFromLocalEncrypted();
            const encVault = await encryptObject(localVault, key);
            await webdav.putFile('vault.enc', encVault, 'text/plain');

            // 3. Update meta.json with current salt
            const meta: RemoteMeta = {
              version: 1,
              salt: security.salt,
              verifier: verifier || undefined,
              bookmarksLastModified: now,
              vaultLastModified: now,
            };
            await webdav.putMeta(meta);

            await updateSyncState({
              isSyncing: false,
              lastSyncTime: now,
              lastError: null,
              bookmarkCount: countBookmarks(localBookmarks),
              vaultCount: localVault.length,
            });

            sendResponse({
              success: true,
              message: `云端已成功重新初始化！已同步 ${countBookmarks(localBookmarks)} 个书签，${localVault.length} 条密码。`,
            });
          } catch (err: any) {
            sendResponse({ success: false, message: err.message || '重置失败' });
          }
          break;
        }

        case 'GET_MATCHING_CREDENTIALS': {
          const unlocked = await isVaultUnlocked();
          if (!unlocked) {
            console.log('[PassMark BG] Vault locked, returning empty for:', request.url);
            sendResponse({ items: [] });
            return;
          }
          const items = await loadVaultFromLocalEncrypted();
          const matched = matchVaultItemsForUrl(items, request.url || '');
          console.log('[PassMark BG] URL:', request.url, 'Total items:', items.length, 'Matched:', matched.length);
          sendResponse({ items: matched });
          break;
        }

        case 'CHECK_SHOULD_PROMPT_SAVE': {
          const unlocked = await isVaultUnlocked();
          if (!unlocked) {
            sendResponse({ shouldPrompt: false });
            return;
          }
          const items = await loadVaultFromLocalEncrypted();
          const matched = matchVaultItemsForUrl(items, request.url || '');
          const inputUser = (request.username || '').trim().toLowerCase();
          const existing = matched.find(
            (i) => (i.username || '').trim().toLowerCase() === inputUser
          );

          if (existing) {
            if (existing.password === request.password) {
              // Exact match! Already saved with same password
              sendResponse({ shouldPrompt: false, isUpdate: false });
              return;
            } else {
              // Password was updated on the website
              sendResponse({ shouldPrompt: true, isUpdate: true, existingId: existing.id, title: existing.title });
              return;
            }
          }

          // New credential
          sendResponse({ shouldPrompt: true, isUpdate: false });
          break;
        }

        case 'SAVE_NEW_CREDENTIAL': {
          if (!(await isVaultUnlocked())) {
            sendResponse({ success: false, message: '请先在插件中解锁保险箱' });
            return;
          }
          try {
            const saved = await saveVaultItem({
              id: request.id,
              title: request.title || '新网站',
              username: request.username || '',
              password: request.password || '',
              urls: request.url ? [request.url] : [],
              notes: request.notes || '由网页自动捕获保存',
            });
            // Trigger background sync
            const opts = await getSyncOptions();
            if (opts.autoSync) {
              performSync().catch(console.error);
            }
            sendResponse({ success: true, item: saved });
          } catch (e: any) {
            sendResponse({ success: false, message: e.message });
          }
          break;
        }

        case 'IMPORT_CSV_CREDENTIALS': {
          if (!(await isVaultUnlocked())) {
            sendResponse({ success: false, message: '保险箱已锁定，请先输入主密码解锁' });
            return;
          }
          try {
            const res = await batchImportVaultItems(request.items);
            const opts = await getSyncOptions();
            if (opts.autoSync) {
              performSync().catch(console.error);
            }
            sendResponse({ success: true, ...res });
          } catch (err: any) {
            sendResponse({ success: false, message: err.message || '导入失败' });
          }
          break;
        }

        case 'GET_VAULT_ITEMS': {
          const unlocked = await isVaultUnlocked();
          if (!unlocked) {
            sendResponse({ items: [], unlocked: false });
            return;
          }
          const items = await loadVaultFromLocalEncrypted();
          sendResponse({ items, unlocked: true });
          break;
        }

        case 'SAVE_VAULT_ITEM': {
          if (!(await isVaultUnlocked())) {
            sendResponse({ success: false, message: '请先在插件中解锁保险箱' });
            return;
          }
          try {
            const saved = await saveVaultItem(request.item);
            const opts = await getSyncOptions();
            if (opts.autoSync) {
              performSync().catch(console.error);
            }
            sendResponse({ success: true, item: saved });
          } catch (e: any) {
            sendResponse({ success: false, message: e.message });
          }
          break;
        }

        case 'DELETE_VAULT_ITEM': {
          if (!(await isVaultUnlocked())) {
            sendResponse({ success: false, message: '请先在插件中解锁保险箱' });
            return;
          }
          try {
            const ok = await deleteVaultItem(request.id);
            const opts = await getSyncOptions();
            if (opts.autoSync) {
              performSync().catch(console.error);
            }
            sendResponse({ success: ok });
          } catch (e: any) {
            sendResponse({ success: false, message: e.message });
          }
          break;
        }

        case 'REFRESH_ALARM': {
          await setupAutoSyncAlarm();
          sendResponse({ success: true });
          break;
        }

        default:
          sendResponse({ error: 'Unknown action' });
      }
    })();
    return true; // Keep channel open for async response
  });
});
