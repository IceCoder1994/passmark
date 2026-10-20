import {
  getIsApplyingRemote,
  countBookmarks,
  getLocalBookmarkTree,
} from '../utils/bookmarks';
import {
  isVaultUnlocked,
  unlockVault,
  lockVault,
  loadVaultFromLocalEncrypted,
  saveVaultItem,
  matchVaultItemsForUrl,
  getActiveCryptoKey,
} from '../utils/vault';
import { performSync } from '../utils/sync';
import {
  getSyncOptions,
  getWebDavConfig,
  getSecurityConfig,
  updateSyncState,
  getSyncState,
} from '../utils/storage';

export default defineBackground(() => {
  let bookmarkDebounceTimer: any = null;

  // Initialize alarms and background tasks
  setupAutoSyncAlarm();

  // Listen for alarm triggers
  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'PASSMARK_PERIODIC_SYNC') {
      const options = await getSyncOptions();
      if (options.autoSync && isVaultUnlocked()) {
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
      if (options.autoSync && options.syncBookmarks && isVaultUnlocked()) {
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
          const unlocked = isVaultUnlocked();
          sendResponse({ unlocked });
          break;
        }

        case 'UNLOCK_VAULT': {
          const res = await unlockVault(request.password);
          sendResponse(res);
          break;
        }

        case 'LOCK_VAULT': {
          lockVault();
          sendResponse({ success: true });
          break;
        }

        case 'TRIGGER_SYNC': {
          const res = await performSync();
          sendResponse(res);
          break;
        }

        case 'GET_MATCHING_CREDENTIALS': {
          if (!isVaultUnlocked()) {
            sendResponse({ items: [] });
            return;
          }
          const items = await loadVaultFromLocalEncrypted();
          const matched = matchVaultItemsForUrl(items, request.url || '');
          sendResponse({ items: matched });
          break;
        }

        case 'SAVE_NEW_CREDENTIAL': {
          if (!isVaultUnlocked()) {
            sendResponse({ success: false, message: '请先在插件中解锁保险箱' });
            return;
          }
          try {
            const saved = await saveVaultItem({
              title: request.title || '新网站',
              username: request.username || '',
              password: request.password || '',
              urls: request.url ? [request.url] : [],
              notes: '由网页自动捕获保存',
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
