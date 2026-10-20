import { WebDavClient } from './webdav';
import {
  getWebDavConfig,
  getSyncOptions,
  getSecurityConfig,
  getAuthVerifier,
  updateSyncState,
  getSyncState,
  getEncryptedVault,
  setEncryptedVault,
} from './storage';
import {
  getLocalBookmarkTree,
  applyRemoteBookmarkTree,
  mergeTrees,
  countBookmarks,
} from './bookmarks';
import {
  ensureActiveCryptoKey,
  getActiveCryptoKey,
  loadVaultFromLocalEncrypted,
  saveVaultItemsLocal,
  mergeVaultItems,
} from './vault';
import {
  encryptObject,
  decryptObject,
} from './crypto';
import type { RemoteMeta, SyncBookmarkNode, VaultItem } from '../types';

let syncInProgress = false;

export async function performSync(overrideKey?: CryptoKey): Promise<{ success: boolean; message: string }> {
  if (syncInProgress) {
    return { success: false, message: '同步正在进行中，请稍候...' };
  }

  const webdavConfig = await getWebDavConfig();
  if (!webdavConfig.url || !webdavConfig.username || !webdavConfig.password) {
    return { success: false, message: '尚未配置 WebDAV 账号，请在设置中配置' };
  }

  const security = await getSecurityConfig();
  if (!security.isConfigured) {
    return { success: false, message: '尚未设置主密码，无法进行端到端加密同步' };
  }

  const key = overrideKey || (await ensureActiveCryptoKey());
  if (!key) {
    return { success: false, message: '保险箱处于锁定状态，请输入主密码解锁后再同步' };
  }

  const syncOptions = await getSyncOptions();
  syncInProgress = true;
  await updateSyncState({ isSyncing: true, lastError: null });

  try {
    const webdav = new WebDavClient(webdavConfig);

    // 1. Ensure remote folder & check meta
    await webdav.ensureDirectory();
    let remoteMeta = await webdav.getMeta();
    const now = Date.now();
    const localVerifier = await getAuthVerifier();

    if (!remoteMeta) {
      remoteMeta = {
        version: 1,
        salt: security.salt,
        verifier: localVerifier || undefined,
        bookmarksLastModified: now,
        vaultLastModified: now,
      };
    } else {
      // Check salt match: prevent accidental overwrite if local salt differs from cloud
      if (remoteMeta.salt && security.salt && remoteMeta.salt !== security.salt) {
        throw new Error('检测到云端存在不同加密盐的保险箱，请在设置中输入原主密码以同步恢复云端数据');
      }
      if (!remoteMeta.verifier && localVerifier) {
        remoteMeta.verifier = localVerifier;
      }
    }

    let finalBookmarkCount = 0;
    let finalVaultCount = 0;

    // 2. Sync Bookmarks if enabled
    if (syncOptions.syncBookmarks) {
      const localBookmarks = await getLocalBookmarkTree();
      let mergedBookmarks = localBookmarks;

      const remoteEncryptedBookmarks = await webdav.getFile('bookmarks.enc');
      if (remoteEncryptedBookmarks) {
        try {
          const remoteBookmarks = await decryptObject<SyncBookmarkNode[]>(remoteEncryptedBookmarks, key);
          // Two-way merge
          mergedBookmarks = mergeTrees(localBookmarks, remoteBookmarks);
          // Apply differences to local Chrome
          await applyRemoteBookmarkTree(mergedBookmarks);
        } catch (decryptErr) {
          console.error('Failed to decrypt remote bookmarks:', decryptErr);
          throw new Error('解密云端书签失败：主密码与云端加密密钥不匹配');
        }
      }

      finalBookmarkCount = countBookmarks(mergedBookmarks);
      // Re-encrypt and push to WebDAV
      const newEncryptedBookmarks = await encryptObject(mergedBookmarks, key);
      await webdav.putFile('bookmarks.enc', newEncryptedBookmarks, 'text/plain');
      remoteMeta.bookmarksLastModified = Date.now();
    }

    // 3. Sync Password Vault if enabled
    if (syncOptions.syncVault) {
      const localVaultItems = await loadVaultFromLocalEncrypted();
      let mergedVault = localVaultItems;

      const remoteEncryptedVault = await webdav.getFile('vault.enc');
      if (remoteEncryptedVault) {
        try {
          const remoteVaultItems = await decryptObject<VaultItem[]>(remoteEncryptedVault, key);
          mergedVault = mergeVaultItems(localVaultItems, remoteVaultItems);
          await saveVaultItemsLocal(mergedVault);
        } catch (decryptErr) {
          console.error('Failed to decrypt remote vault:', decryptErr);
          throw new Error('解密云端密码库失败：主密码与云端加密密钥不匹配，请检查主密码是否正确');
        }
      }

      finalVaultCount = mergedVault.length;
      // Re-encrypt and push to WebDAV
      const newEncryptedVault = await encryptObject(mergedVault, key);
      await webdav.putFile('vault.enc', newEncryptedVault, 'text/plain');
      remoteMeta.vaultLastModified = Date.now();
    }

    // 4. Save updated meta.json
    await webdav.putMeta(remoteMeta);

    // 5. Update local state
    await updateSyncState({
      isSyncing: false,
      lastSyncTime: Date.now(),
      lastError: null,
      bookmarkCount: finalBookmarkCount,
      vaultCount: finalVaultCount,
    });

    return {
      success: true,
      message: `同步成功！已同步 ${finalBookmarkCount} 个书签，${finalVaultCount} 条密码记录。`,
    };
  } catch (err: any) {
    const errorMsg = err.message || String(err);
    await updateSyncState({ isSyncing: false, lastError: errorMsg });
    return { success: false, message: `同步失败: ${errorMsg}` };
  } finally {
    syncInProgress = false;
  }
}
