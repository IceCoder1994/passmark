import {
  generateSalt,
  deriveKey,
  encryptText,
  decryptText,
  encryptObject,
  decryptObject,
  AUTH_CHECK_PAYLOAD,
} from '../utils/crypto';
import {
  mergeTrees,
  countBookmarks,
  generateUUID,
} from '../utils/bookmarks';
import {
  generatePassword,
  matchVaultItemsForUrl,
  mergeVaultItems,
} from '../utils/vault';
import { WebDavClient } from '../utils/webdav';
import type { SyncBookmarkNode, VaultItem } from '../types';

let failed = 0;

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${msg}`);
    failed++;
  } else {
    console.log(`✅ PASS: ${msg}`);
  }
}

async function runTests() {
  console.log('--- Running PassMark Core Engine Verification ---\n');

  // 1. Test Crypto: Salt & PBKDF2 derivation
  console.log('[1] Testing WebCrypto PBKDF2 & AES-256-GCM:');
  const salt = generateSalt();
  assert(typeof salt === 'string' && salt.length > 10, 'generateSalt generates valid base64 salt');

  const masterPass = 'MyStrongMasterPassword#2026!';
  const key = await deriveKey(masterPass, salt);
  assert(key !== null && key.type === 'secret', 'deriveKey creates valid AES-GCM CryptoKey');

  // Test encryption/decryption roundtrip
  const testPayload = { secretMsg: 'PassMark Zero Knowledge Test', num: 42, arr: [1, 2, 3] };
  const ciphertext = await encryptObject(testPayload, key);
  assert(ciphertext.includes('"iv"') && ciphertext.includes('"data"'), 'encryptObject outputs versioned JSON envelope');

  const decrypted = await decryptObject<typeof testPayload>(ciphertext, key);
  assert(decrypted.secretMsg === testPayload.secretMsg && decrypted.num === 42, 'decryptObject perfectly recovers original object');

  // Test wrong password decryption fails
  const wrongKey = await deriveKey('WrongPassword123', salt);
  let wrongKeyFailed = false;
  try {
    await decryptObject(ciphertext, wrongKey);
  } catch {
    wrongKeyFailed = true;
  }
  assert(wrongKeyFailed, 'decryptObject with wrong password throws error as expected');

  // 2. Test Bookmark Merge Engine
  console.log('\n[2] Testing Bookmark Tree Two-Way Merge:');
  const localTree: SyncBookmarkNode[] = [
    {
      id: 'bar_1',
      title: '书签栏',
      children: [
        { id: 'b1', title: 'GitHub', url: 'https://github.com' },
        { id: 'b2', title: 'Google', url: 'https://google.com' },
      ],
    },
    {
      id: 'other_1',
      title: '其他书签',
      children: [{ id: 'b3', title: 'Vue', url: 'https://vuejs.org' }],
    },
  ];

  const remoteTree: SyncBookmarkNode[] = [
    {
      id: 'bar_1',
      title: '书签栏',
      children: [
        { id: 'b1', title: 'GitHub', url: 'https://github.com' }, // duplicate, should not duplicate
        { id: 'b4', title: 'V2EX', url: 'https://v2ex.com' }, // new from remote
      ],
    },
    {
      id: 'other_1',
      title: '其他书签',
      children: [{ id: 'b5', title: 'Nextcloud', url: 'https://nextcloud.com' }],
    },
  ];

  const merged = mergeTrees(localTree, remoteTree);
  const totalCount = countBookmarks(merged);
  assert(totalCount === 5, `mergeTrees dedupes by URL and merges both branches (expected 5 bookmarks, got ${totalCount})`);

  const barUrls = merged[0].children?.map((c) => c.url) || [];
  assert(barUrls.includes('https://github.com') && barUrls.includes('https://google.com') && barUrls.includes('https://v2ex.com'), '书签栏 contains GitHub, Google, V2EX');

  // 3. Test Vault Item Merge & Conflict Resolution
  console.log('\n[3] Testing Vault Merge & Conflict Resolution:');
  const itemLocal: VaultItem = {
    id: 'vault_1',
    title: 'GitHub',
    username: 'alice',
    password: 'old_password',
    urls: ['github.com'],
    createdAt: 1000,
    updatedAt: 1000,
  };

  const itemRemoteUpdated: VaultItem = {
    id: 'vault_1',
    title: 'GitHub',
    username: 'alice',
    password: 'new_password',
    urls: ['github.com'],
    createdAt: 1000,
    updatedAt: 2000, // newer!
  };

  const itemRemoteUnique: VaultItem = {
    id: 'vault_2',
    title: 'Google',
    username: 'alice@gmail.com',
    password: 'google_pwd',
    urls: ['google.com'],
    createdAt: 1500,
    updatedAt: 1500,
  };

  const mergedVault = mergeVaultItems([itemLocal], [itemRemoteUpdated, itemRemoteUnique]);
  assert(mergedVault.length === 2, 'Merged vault has 2 distinct items');
  const item1 = mergedVault.find((i) => i.id === 'vault_1');
  assert(item1?.password === 'new_password', 'Newer updatedAt timestamp takes precedence');

  // 4. Test URL Domain Matcher
  console.log('\n[4] Testing Domain Matching for Autofill:');
  const matchedExact = matchVaultItemsForUrl(mergedVault, 'https://github.com/login');
  assert(matchedExact.length === 1 && matchedExact[0].title === 'GitHub', 'Exact domain matches https://github.com/login');

  const matchedSubdomain = matchVaultItemsForUrl(mergedVault, 'https://gist.github.com/new');
  assert(matchedSubdomain.length === 1 && matchedSubdomain[0].title === 'GitHub', 'Subdomain gist.github.com matches github.com');

  const matchedNoMatch = matchVaultItemsForUrl(mergedVault, 'https://bing.com');
  assert(matchedNoMatch.length === 0, 'Unrelated domain returns no matches');

  // 5. Test Password Generator
  console.log('\n[5] Testing Strong Password Generator:');
  const pwd1 = generatePassword({ length: 20, uppercase: true, lowercase: true, numbers: true, symbols: true });
  assert(pwd1.length === 20, 'Password has correct requested length of 20');
  assert(/[A-Z]/.test(pwd1) && /[a-z]/.test(pwd1) && /[0-9]/.test(pwd1), 'Password includes upper, lower, numbers');

  // 6. Test WebDAV URL Normalization
  console.log('\n[6] Testing WebDAV Client URL formatting:');
  const dav = new WebDavClient({
    url: 'https://dav.jianguoyun.com/dav',
    username: 'test',
    password: 'pwd',
    syncDir: 'custom-passmark',
    autoSyncInterval: 15,
  });
  // Verify private normalize
  assert((dav as any).config.url === 'https://dav.jianguoyun.com/dav/', 'URL has trailing slash');
  assert((dav as any).config.syncDir === '/custom-passmark/', 'SyncDir has leading and trailing slashes');
  assert((dav as any).getFullUrl('bookmarks.enc') === 'https://dav.jianguoyun.com/dav/custom-passmark/bookmarks.enc', 'Full URL is correctly composed without duplicate slashes');

  console.log(`\n========================================`);
  if (failed === 0) {
    console.log('🎉 ALL TESTS PASSED! PassMark core is rock solid.');
  } else {
    console.error(`💥 ${failed} tests failed.`);
    process.exit(1);
  }
}

runTests().catch((e) => {
  console.error('Test execution error:', e);
  process.exit(1);
});
