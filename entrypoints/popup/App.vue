<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import {
  ShieldCheck,
  Lock,
  Unlock,
  RefreshCw,
  Settings,
  FolderSync,
  KeyRound,
  Search,
  Plus,
  Copy,
  Check,
  Eye,
  EyeOff,
  Trash2,
  Edit3,
  ExternalLink,
  Bookmark,
  Sparkles,
  X,
} from 'lucide-vue-next';
import {
  getSecurityConfig,
  getSyncState,
  getWebDavConfig,
} from '../../utils/storage';
import {
  generatePassword,
  matchVaultItemsForUrl,
} from '../../utils/vault';
import { getLocalBookmarkTree, countBookmarks } from '../../utils/bookmarks';
import { getBookmarksUrl, getBrowserName } from '../../utils/browser';
import type { VaultItem, SyncState } from '../../types';

// Tab selection: 'sync' | 'vault'
const activeTab = ref<'sync' | 'vault'>('sync');

// 当前浏览器名称，用于界面文案
const browserName = getBrowserName();

// Auth & Setup states
const isConfigured = ref(false);
const isUnlocked = ref(false);
const masterPasswordInput = ref('');
const unlockError = ref('');
const isUnlocking = ref(false);

// Sync States
const syncState = ref<SyncState>({
  isSyncing: false,
  lastSyncTime: null,
  lastError: null,
  bookmarkCount: 0,
  vaultCount: 0,
});
const isSyncing = ref(false);
const syncMessage = ref<string | null>(null);

// Vault States
const vaultItems = ref<VaultItem[]>([]);
const searchQuery = ref('');
const currentSiteUrl = ref('');
const currentSiteTitle = ref('');
const expandedItemId = ref<string | null>(null);
const visiblePasswords = ref<Record<string, boolean>>({});
const copiedField = ref<string | null>(null);

// Modal states: Add / Edit
const showModal = ref(false);
const isEditing = ref(false);
const formData = ref<{
  id?: string;
  title: string;
  username: string;
  password: string;
  urls: string;
  notes: string;
}>({
  title: '',
  username: '',
  password: '',
  urls: '',
  notes: '',
});

// Generator modal / settings
const showGenerator = ref(false);
const genLength = ref(16);
const genUpper = ref(true);
const genLower = ref(true);
const genNum = ref(true);
const genSym = ref(true);

onMounted(async () => {
  await refreshInitialState();
  detectCurrentTab();
});

async function refreshInitialState() {
  const security = await getSecurityConfig();
  isConfigured.value = security.isConfigured;

  // Check background unlock state and fetch decrypted items directly from background
  chrome.runtime.sendMessage({ type: 'GET_VAULT_ITEMS' }, (res) => {
    if (res && res.unlocked) {
      isUnlocked.value = true;
      vaultItems.value = res.items || [];
    } else {
      isUnlocked.value = false;
    }
  });

  syncState.value = await getSyncState();
  // Get live bookmark count
  try {
    const localTree = await getLocalBookmarkTree();
    syncState.value.bookmarkCount = countBookmarks(localTree);
  } catch (e) {
    // ignore
  }
}

function detectCurrentTab() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0] && tabs[0].url) {
      try {
        const u = new URL(tabs[0].url);
        if (u.protocol.startsWith('http')) {
          currentSiteUrl.value = u.hostname;
          currentSiteTitle.value = tabs[0].title || u.hostname;
        }
      } catch {}
    }
  });
}

async function handleUnlock() {
  if (!masterPasswordInput.value) return;
  isUnlocking.value = true;
  unlockError.value = '';

  chrome.runtime.sendMessage({ type: 'UNLOCK_VAULT', password: masterPasswordInput.value }, async (res) => {
    isUnlocking.value = false;
    if (res && res.success) {
      isUnlocked.value = true;
      masterPasswordInput.value = '';
      loadData();
    } else {
      unlockError.value = res?.message || '密码错误，解锁失败';
    }
  });
}

function handleLock() {
  chrome.runtime.sendMessage({ type: 'LOCK_VAULT' }, () => {
    isUnlocked.value = false;
    vaultItems.value = [];
  });
}

function loadData() {
  chrome.runtime.sendMessage({ type: 'GET_VAULT_ITEMS' }, (res) => {
    if (res && res.items) {
      vaultItems.value = res.items;
      isUnlocked.value = res.unlocked;
    }
  });
  getSyncState().then((state) => {
    syncState.value = state;
  });
}

// Trigger Manual Sync
function handleSyncNow() {
  isSyncing.value = true;
  syncMessage.value = null;

  chrome.runtime.sendMessage({ type: 'TRIGGER_SYNC' }, (res) => {
    isSyncing.value = false;
    if (res && res.success) {
      syncMessage.value = res.message || '同步完成';
      loadData();
    } else {
      syncMessage.value = res?.message || '同步失败';
    }
    setTimeout(() => {
      syncMessage.value = null;
    }, 4000);
  });
}

function openOptionsPage() {
  chrome.runtime.openOptionsPage();
}

function openBookmarksManager() {
  // 按当前浏览器跳转到对应的收藏夹管理页
  chrome.tabs.create({ url: getBookmarksUrl() });
}

// Filtered vault items
const matchedCurrentSiteItems = computed(() => {
  if (!currentSiteUrl.value) return [];
  return matchVaultItemsForUrl(vaultItems.value, currentSiteUrl.value);
});

const filteredVaultItems = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return vaultItems.value;
  return vaultItems.value.filter(
    (item) =>
      item.title.toLowerCase().includes(q) ||
      item.username.toLowerCase().includes(q) ||
      item.urls.some((u) => u.toLowerCase().includes(q))
  );
});

const isIdentityVerified = ref(false);
const showAuthModal = ref(false);
const authPasswordInput = ref('');
const authError = ref('');
const isAuthorizing = ref(false);
const pendingAuthAction = ref<{ type: 'view' | 'copy'; id: string; text?: string } | null>(null);

function handleRequestViewPassword(id: string) {
  if (visiblePasswords.value[id]) {
    visiblePasswords.value[id] = false;
    return;
  }
  if (isIdentityVerified.value) {
    visiblePasswords.value[id] = true;
    return;
  }
  pendingAuthAction.value = { type: 'view', id };
  authPasswordInput.value = '';
  authError.value = '';
  showAuthModal.value = true;
}

function handleRequestCopyPassword(item: VaultItem) {
  if (isIdentityVerified.value) {
    copyText(item.password, `pwd_${item.id}`);
    return;
  }
  pendingAuthAction.value = { type: 'copy', id: item.id, text: item.password };
  authPasswordInput.value = '';
  authError.value = '';
  showAuthModal.value = true;
}

function handleConfirmAuth() {
  if (!authPasswordInput.value) return;
  isAuthorizing.value = true;
  authError.value = '';

  chrome.runtime.sendMessage(
    { type: 'VERIFY_MASTER_PASSWORD', password: authPasswordInput.value },
    (res) => {
      isAuthorizing.value = false;
      if (res && res.valid) {
        isIdentityVerified.value = true;
        showAuthModal.value = false;

        if (pendingAuthAction.value) {
          if (pendingAuthAction.value.type === 'view') {
            visiblePasswords.value[pendingAuthAction.value.id] = true;
          } else if (pendingAuthAction.value.type === 'copy' && pendingAuthAction.value.text) {
            copyText(pendingAuthAction.value.text, `pwd_${pendingAuthAction.value.id}`);
          }
          pendingAuthAction.value = null;
        }
      } else {
        authError.value = '主密码错误，核验失败';
      }
    }
  );
}

function togglePasswordVisibility(id: string) {
  handleRequestViewPassword(id);
}

async function copyText(text: string, fieldId: string) {
  await navigator.clipboard.writeText(text);
  copiedField.value = fieldId;
  setTimeout(() => {
    copiedField.value = null;
  }, 1800);
}

function fillItemToActiveTab(item: VaultItem) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0] && tabs[0].id) {
      chrome.tabs.sendMessage(
        tabs[0].id,
        { type: 'FILL_CREDENTIAL_INTO_PAGE', item },
        (res) => {
          if (chrome.runtime.lastError) {
            alert('请先按 F5 刷新当前网页后再试（插件更新后需刷新已有网页以激活脚本）');
          } else if (res && res.success) {
            window.close(); // Close popup after filling
          } else {
            alert('未能在当前页面找到输入框，或该网站表单已被跨域隔离');
          }
        }
      );
    }
  });
}

// Open Add modal
function openAddModal() {
  isEditing.value = false;
  formData.value = {
    title: currentSiteTitle.value || '新建网站账号',
    username: '',
    password: '',
    urls: currentSiteUrl.value || '',
    notes: '',
  };
  showModal.value = true;
}

// Open Edit modal
function openEditModal(item: VaultItem) {
  isEditing.value = true;
  formData.value = {
    id: item.id,
    title: item.title,
    username: item.username,
    password: item.password,
    urls: item.urls.join(', '),
    notes: item.notes || '',
  };
  showModal.value = true;
}

// Save modal data
async function handleSaveItem() {
  if (!formData.value.title || !formData.value.password) {
    alert('请填写标题和密码');
    return;
  }

  const urls = formData.value.urls
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  chrome.runtime.sendMessage(
    {
      type: 'SAVE_VAULT_ITEM',
      item: {
        id: formData.value.id,
        title: formData.value.title,
        username: formData.value.username,
        password: formData.value.password,
        urls,
        notes: formData.value.notes,
      },
    },
    (res) => {
      if (res && res.success) {
        showModal.value = false;
        loadData();
      } else {
        alert(res?.message || '保存失败');
      }
    }
  );
}

async function handleDeleteItem(id: string) {
  if (confirm('确认删除该账号密码？')) {
    chrome.runtime.sendMessage({ type: 'DELETE_VAULT_ITEM', id }, (res) => {
      if (res && res.success) {
        loadData();
      }
    });
  }
}

// Password Generator
function applyGeneratedPassword() {
  const pwd = generatePassword({
    length: genLength.value,
    uppercase: genUpper.value,
    lowercase: genLower.value,
    numbers: genNum.value,
    symbols: genSym.value,
  });
  formData.value.password = pwd;
  showGenerator.value = false;
}

function formatRelativeTime(timestamp: number | null): string {
  if (!timestamp) return '从未同步';
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSec < 60) return '刚刚';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} 分钟前`;
  const d = new Date(timestamp);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}
</script>

<template>
  <div class="w-[380px] h-[550px] flex flex-col bg-slate-50 text-slate-800 select-none">
    <!-- Top Header -->
    <header class="px-4 py-3 bg-white border-b border-slate-200 flex items-center justify-between shadow-xs">
      <div class="flex items-center space-x-2">
        <div class="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-xs">
          <ShieldCheck class="w-4 h-4" />
        </div>
        <div>
          <h1 class="text-sm font-bold text-slate-900 leading-tight">PassMark</h1>
          <p class="text-[10px] text-slate-400">秘签 · WebDAV 加密同步</p>
        </div>
      </div>

      <div class="flex items-center space-x-1">
        <button
          v-if="isUnlocked"
          @click="handleSyncNow"
          :disabled="isSyncing"
          title="立即同步"
          class="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-md transition"
        >
          <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': isSyncing }" />
        </button>

        <button
          v-if="isUnlocked"
          @click="handleLock"
          title="锁定保险箱"
          class="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-slate-100 rounded-md transition"
        >
          <Lock class="w-4 h-4" />
        </button>

        <button
          @click="openOptionsPage"
          title="设置选项"
          class="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md transition"
        >
          <Settings class="w-4 h-4" />
        </button>
      </div>
    </header>

    <!-- State 1: Not configured yet -->
    <div v-if="!isConfigured" class="flex-1 p-6 flex flex-col items-center justify-center text-center space-y-4">
      <div class="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
        <ShieldCheck class="w-8 h-8" />
      </div>
      <div>
        <h2 class="text-base font-bold text-slate-900">欢迎使用 PassMark</h2>
        <p class="text-xs text-slate-500 mt-1">请先设置主密码并配置 WebDAV 服务器以开启端到端加密同步。</p>
      </div>
      <button
        @click="openOptionsPage"
        class="w-full py-2.5 px-4 text-xs font-semibold rounded-xl text-white bg-indigo-600 hover:bg-indigo-700 transition shadow-sm"
      >
        前往设置页面进行初始化
      </button>
    </div>

    <!-- State 2: Locked screen -->
    <div v-else-if="!isUnlocked" class="flex-1 p-6 flex flex-col items-center justify-center text-center space-y-4">
      <div class="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
        <Lock class="w-6 h-6" />
      </div>
      <div>
        <h2 class="text-base font-bold text-slate-900">保险箱已锁定</h2>
        <p class="text-xs text-slate-500 mt-1">请输入主密码解锁并查看加密凭据</p>
      </div>

      <div class="w-full space-y-2">
        <input
          v-model="masterPasswordInput"
          type="password"
          placeholder="输入主密码"
          @keyup.enter="handleUnlock"
          class="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition shadow-xs text-center"
        />
        <p v-if="unlockError" class="text-xs text-rose-600 font-medium">{{ unlockError }}</p>
      </div>

      <button
        @click="handleUnlock"
        :disabled="isUnlocking"
        class="w-full py-2.5 px-4 text-xs font-semibold rounded-xl text-white bg-indigo-600 hover:bg-indigo-700 transition shadow-sm disabled:opacity-50"
      >
        {{ isUnlocking ? '验证中...' : '解锁保险箱' }}
      </button>
    </div>

    <!-- State 3: Unlocked Main Content -->
    <div v-else class="flex-1 flex flex-col overflow-hidden">
      <!-- Tabs Navigation -->
      <div class="px-3 pt-2 bg-white border-b border-slate-200 flex space-x-1">
        <button
          @click="activeTab = 'sync'"
          :class="[
            'flex-1 py-2 text-xs font-semibold rounded-t-lg flex items-center justify-center gap-1.5 transition border-b-2',
            activeTab === 'sync'
              ? 'text-indigo-600 border-indigo-600 bg-indigo-50/40'
              : 'text-slate-500 border-transparent hover:text-slate-800'
          ]"
        >
          <FolderSync class="w-3.5 h-3.5" />
          <span>收藏夹与同步</span>
        </button>

        <button
          @click="activeTab = 'vault'"
          :class="[
            'flex-1 py-2 text-xs font-semibold rounded-t-lg flex items-center justify-center gap-1.5 transition border-b-2',
            activeTab === 'vault'
              ? 'text-indigo-600 border-indigo-600 bg-indigo-50/40'
              : 'text-slate-500 border-transparent hover:text-slate-800'
          ]"
        >
          <KeyRound class="w-3.5 h-3.5" />
          <span>密码保险箱 ({{ vaultItems.length }})</span>
        </button>
      </div>

      <!-- Sync Feedback Banner -->
      <div v-if="syncMessage" class="px-3 py-1.5 bg-indigo-600 text-white text-[11px] text-center font-medium">
        {{ syncMessage }}
      </div>

      <!-- TAB 1: SYNC -->
      <div v-if="activeTab === 'sync'" class="flex-1 p-4 space-y-3.5 overflow-y-auto">
        <!-- Status Card -->
        <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-xs font-semibold text-slate-700">同步健康度</span>
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              连接正常
            </span>
          </div>

          <div class="grid grid-cols-2 gap-2.5 pt-1">
            <div class="bg-slate-50 p-3 rounded-xl border border-slate-100">
              <div class="flex items-center gap-1.5 text-slate-500 mb-1">
                <Bookmark class="w-3.5 h-3.5 text-indigo-500" />
                <span class="text-[11px]">本地收藏夹</span>
              </div>
              <p class="text-lg font-bold text-slate-900">{{ syncState.bookmarkCount }}</p>
            </div>

            <div class="bg-slate-50 p-3 rounded-xl border border-slate-100">
              <div class="flex items-center gap-1.5 text-slate-500 mb-1">
                <KeyRound class="w-3.5 h-3.5 text-indigo-500" />
                <span class="text-[11px]">加密凭据</span>
              </div>
              <p class="text-lg font-bold text-slate-900">{{ vaultItems.length }}</p>
            </div>
          </div>

          <div class="pt-1 text-[11px] text-slate-400 flex items-center justify-between border-t border-slate-100">
            <span>上次同步时间</span>
            <span class="text-slate-600 font-medium">{{ formatRelativeTime(syncState.lastSyncTime) }}</span>
          </div>

          <div v-if="syncState.lastError" class="p-2.5 bg-rose-50 rounded-xl text-rose-700 text-[11px] border border-rose-200 space-y-1.5">
            <p>{{ syncState.lastError }}</p>
            <button
              v-if="syncState.lastError.includes('不匹配') || syncState.lastError.includes('不同加密盐')"
              @click="openOptionsPage"
              class="w-full py-1 text-center bg-rose-600 text-white rounded-md text-[10px] font-semibold hover:bg-rose-700 transition"
            >
              前往设置一键重置或恢复云端
            </button>
          </div>
        </div>

        <!-- Quick Actions -->
        <div class="space-y-2">
          <button
            @click="handleSyncNow"
            :disabled="isSyncing"
            class="w-full py-2.5 px-4 text-xs font-semibold rounded-xl text-white bg-indigo-600 hover:bg-indigo-700 transition shadow-xs flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin': isSyncing }" />
            {{ isSyncing ? '正在与 WebDAV 同步...' : '立即与 WebDAV 双向同步' }}
          </button>

          <button
            @click="openBookmarksManager"
            class="w-full py-2 px-4 text-xs font-medium rounded-xl text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 transition flex items-center justify-center gap-1.5"
          >
            <ExternalLink class="w-3.5 h-3.5 text-slate-400" />
            打开 {{ browserName }} 收藏夹管理器
          </button>
        </div>
      </div>

      <!-- TAB 2: VAULT -->
      <div v-else-if="activeTab === 'vault'" class="flex-1 flex flex-col overflow-hidden">
        <!-- Search & Add Bar -->
        <div class="p-3 bg-white border-b border-slate-200 flex items-center gap-2">
          <div class="relative flex-1">
            <Search class="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            <input
              v-model="searchQuery"
              type="text"
              placeholder="搜索网站或账号..."
              class="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition"
            />
          </div>
          <button
            @click="openAddModal"
            class="p-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition"
            title="添加密码条目"
          >
            <Plus class="w-4 h-4" />
          </button>
        </div>

        <!-- Matched for current tab banner -->
        <div v-if="matchedCurrentSiteItems.length > 0 && !searchQuery" class="px-3 py-2 bg-indigo-50 border-b border-indigo-100 flex items-center justify-between">
          <span class="text-[11px] font-medium text-indigo-900">
            当前网站匹配 ({{ matchedCurrentSiteItems.length }})
          </span>
          <span class="text-[10px] text-indigo-500">{{ currentSiteUrl }}</span>
        </div>

        <!-- Vault Items List -->
        <div class="flex-1 overflow-y-auto p-3 space-y-2">
          <div
            v-for="item in filteredVaultItems"
            :key="item.id"
            class="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs hover:border-indigo-300 transition"
          >
            <!-- Item Header -->
            <div
              @click="expandedItemId = expandedItemId === item.id ? null : item.id"
              class="p-3 flex items-center justify-between cursor-pointer"
            >
              <div class="min-w-0 flex-1 pr-2">
                <p class="text-xs font-semibold text-slate-900 truncate">{{ item.title }}</p>
                <p class="text-[11px] text-slate-400 truncate">{{ item.username }}</p>
              </div>
              <div class="flex items-center space-x-1" @click.stop>
                <button
                  @click="fillItemToActiveTab(item)"
                  title="一键填充到当前页面"
                  class="p-1 text-indigo-600 hover:bg-indigo-50 rounded transition"
                >
                  <Sparkles class="w-3.5 h-3.5" />
                </button>
                <button
                  @click="copyText(item.username, `user_${item.id}`)"
                  title="复制用户名"
                  class="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition"
                >
                  <Check v-if="copiedField === `user_${item.id}`" class="w-3.5 h-3.5 text-emerald-600" />
                  <Copy v-else class="w-3.5 h-3.5" />
                </button>
                <button
                  @click="handleRequestCopyPassword(item)"
                  title="复制密码"
                  class="p-1 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded transition"
                >
                  <Check v-if="copiedField === `pwd_${item.id}`" class="w-3.5 h-3.5 text-emerald-600" />
                  <KeyRound v-else class="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <!-- Item Expanded Details -->
            <div v-if="expandedItemId === item.id" class="px-3 pb-3 pt-1 border-t border-slate-100 space-y-2 text-xs">
              <!-- Password field with eye toggle -->
              <div class="flex items-center justify-between bg-slate-50 p-2 rounded-lg border border-slate-100">
                <span class="font-mono text-slate-700 select-all">
                  {{ visiblePasswords[item.id] ? item.password : '••••••••••••' }}
                </span>
                <button
                  @click="togglePasswordVisibility(item.id)"
                  class="text-slate-400 hover:text-slate-600"
                >
                  <EyeOff v-if="visiblePasswords[item.id]" class="w-3.5 h-3.5" />
                  <Eye v-else class="w-3.5 h-3.5" />
                </button>
              </div>

              <!-- Notes or URL if present -->
              <div v-if="item.urls && item.urls.length" class="text-[11px] text-slate-500 truncate">
                网址: {{ item.urls.join(', ') }}
              </div>
              <div v-if="item.notes" class="text-[11px] text-slate-500 italic bg-slate-50 p-1.5 rounded">
                {{ item.notes }}
              </div>

              <!-- Action buttons -->
              <div class="flex items-center justify-between pt-1">
                <button
                  @click="fillItemToActiveTab(item)"
                  class="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-[11px] font-medium transition shadow-2xs"
                >
                  <Sparkles class="w-3 h-3" /> 一键填充
                </button>
                <div class="flex items-center space-x-2">
                  <button
                    @click="openEditModal(item)"
                    class="inline-flex items-center gap-1 text-[11px] text-slate-600 hover:text-indigo-600"
                  >
                    <Edit3 class="w-3 h-3" /> 编辑
                  </button>
                  <button
                    @click="handleDeleteItem(item.id)"
                    class="inline-flex items-center gap-1 text-[11px] text-rose-500 hover:text-rose-700"
                  >
                    <Trash2 class="w-3 h-3" /> 删除
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div v-if="filteredVaultItems.length === 0" class="py-6 text-center text-xs text-slate-400 space-y-3">
            <p v-if="searchQuery">未找到与 "{{ searchQuery }}" 匹配的密码记录</p>
            <div v-else-if="vaultItems.length === 0" class="p-3.5 bg-indigo-50 rounded-xl border border-indigo-100 text-left space-y-2">
              <p class="font-semibold text-indigo-900 text-xs flex items-center gap-1.5">
                <span>💡</span> 还没有密码记录？
              </p>
              <p class="text-[11px] text-indigo-700 leading-relaxed">
                可将 Chrome 历史保存的密码导出为 CSV，一键端到端加密导入 PassMark 并同步到 WebDAV。
              </p>
              <button
                @click="openOptionsPage"
                class="w-full py-1.5 px-3 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 transition shadow-2xs"
              >
                前往设置一键导入 (CSV)
              </button>
            </div>
            <p v-else>暂无匹配的密码记录</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal: Add / Edit Item -->
    <div
      v-if="showModal"
      class="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-3"
    >
      <div class="w-full bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden flex flex-col max-h-[500px]">
        <div class="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 class="text-xs font-bold text-slate-900">{{ isEditing ? '编辑密码条目' : '新建密码条目' }}</h3>
          <button @click="showModal = false" class="text-slate-400 hover:text-slate-600">
            <X class="w-4 h-4" />
          </button>
        </div>

        <div class="p-4 space-y-3 overflow-y-auto flex-1">
          <div class="space-y-1">
            <label class="block text-[11px] font-medium text-slate-700">标题 / 网站名称</label>
            <input
              v-model="formData.title"
              type="text"
              placeholder="例如：GitHub"
              class="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div class="space-y-1">
            <label class="block text-[11px] font-medium text-slate-700">账号 / 用户名 / 邮箱</label>
            <input
              v-model="formData.username"
              type="text"
              placeholder="user@example.com"
              class="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div class="space-y-1">
            <div class="flex items-center justify-between">
              <label class="block text-[11px] font-medium text-slate-700">密码</label>
              <button
                type="button"
                @click="showGenerator = !showGenerator"
                class="inline-flex items-center gap-1 text-[10px] text-indigo-600 hover:text-indigo-700 font-medium"
              >
                <Sparkles class="w-3 h-3" /> 生成强密码
              </button>
            </div>
            <input
              v-model="formData.password"
              type="text"
              placeholder="输入或生成密码"
              class="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
            />
          </div>

          <!-- Mini generator drawer -->
          <div v-if="showGenerator" class="p-2.5 bg-indigo-50/50 rounded-xl border border-indigo-100 space-y-2 text-xs">
            <div class="flex items-center justify-between">
              <span class="text-[11px] text-slate-600">长度: {{ genLength }}</span>
              <input type="range" v-model.number="genLength" min="8" max="32" class="w-24 accent-indigo-600" />
            </div>
            <div class="grid grid-cols-2 gap-1 text-[10px] text-slate-600">
              <label class="flex items-center gap-1"><input type="checkbox" v-model="genUpper" /> 大写 (A-Z)</label>
              <label class="flex items-center gap-1"><input type="checkbox" v-model="genLower" /> 小写 (a-z)</label>
              <label class="flex items-center gap-1"><input type="checkbox" v-model="genNum" /> 数字 (0-9)</label>
              <label class="flex items-center gap-1"><input type="checkbox" v-model="genSym" /> 特殊字符</label>
            </div>
            <button
              type="button"
              @click="applyGeneratedPassword"
              class="w-full py-1 bg-indigo-600 text-white rounded text-[11px] font-medium hover:bg-indigo-700 transition"
            >
              填充新密码
            </button>
          </div>

          <div class="space-y-1">
            <label class="block text-[11px] font-medium text-slate-700">关联域名 (用于自动匹配，逗号分隔)</label>
            <input
              v-model="formData.urls"
              type="text"
              placeholder="github.com, api.github.com"
              class="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div class="space-y-1">
            <label class="block text-[11px] font-medium text-slate-700">备注</label>
            <textarea
              v-model="formData.notes"
              rows="2"
              placeholder="可选备忘信息"
              class="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
            ></textarea>
          </div>
        </div>

        <div class="p-3 border-t border-slate-100 flex items-center justify-end space-x-2 bg-slate-50">
          <button
            @click="showModal = false"
            class="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-800 rounded-lg"
          >
            取消
          </button>
          <button
            @click="handleSaveItem"
            class="px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition"
          >
            保存
          </button>
        </div>
      </div>
    </div>

    <!-- Modal: Verify Master Password to reveal or copy plain text -->
    <div
      v-if="showAuthModal"
      class="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-3"
    >
      <div class="w-full bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden p-5 space-y-3.5 max-w-[320px]">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center">
            <Lock class="w-4 h-4" />
          </div>
          <div>
            <h3 class="text-xs font-bold text-slate-900">查看/复制明文密码</h3>
            <p class="text-[10px] text-slate-400">请输入主密码确认身份</p>
          </div>
        </div>

        <div class="space-y-1">
          <input
            v-model="authPasswordInput"
            type="password"
            placeholder="输入主密码"
            autofocus
            @keyup.enter="handleConfirmAuth"
            class="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 text-center"
          />
          <p v-if="authError" class="text-[10px] text-rose-600 font-medium text-center">{{ authError }}</p>
        </div>

        <div class="flex items-center justify-end gap-2 pt-1">
          <button
            @click="showAuthModal = false"
            class="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-800 rounded-lg"
          >
            取消
          </button>
          <button
            @click="handleConfirmAuth"
            :disabled="isAuthorizing"
            class="px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition disabled:opacity-50"
          >
            {{ isAuthorizing ? '核验中...' : '确认核验' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
