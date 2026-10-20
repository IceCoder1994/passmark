<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import {
  Cloud,
  Lock,
  Unlock,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Save,
  FolderSync,
  ShieldCheck,
  Sliders,
  ExternalLink,
  UploadCloud,
  FileSpreadsheet,
  KeyRound,
  Download,
  ArrowRight,
} from 'lucide-vue-next';
import {
  getWebDavConfig,
  setWebDavConfig,
  getSecurityConfig,
  getSyncOptions,
  setSyncOptions,
  getSyncState,
} from '../../utils/storage';
import { WebDavClient } from '../../utils/webdav';
import { setupMasterPassword, unlockVault, isVaultUnlocked } from '../../utils/vault';
import { performSync } from '../../utils/sync';
import { parseChromePasswordsCSV, type ParsedCredential } from '../../utils/csv';
import type { WebDavConfig, SecurityConfig } from '../../types';
import type { SyncOptions } from '../../utils/storage';

// State
const webdav = ref<WebDavConfig>({
  url: '',
  username: '',
  password: '',
  syncDir: '/passmark/',
  autoSyncInterval: 15,
});

const security = ref<SecurityConfig>({
  salt: '',
  lockTimeoutMinutes: 15,
  isConfigured: false,
});

const syncOptions = ref<SyncOptions>({
  syncBookmarks: true,
  syncVault: true,
  autoSync: true,
});

// Passwords & verification
const masterPassword = ref('');
const confirmMasterPassword = ref('');
const showPassword = ref(false);
const showWebDavPassword = ref(false);

// Status
const isTestingConnection = ref(false);
const connectionTestResult = ref<{ success: boolean; message: string } | null>(null);
const isSaving = ref(false);
const saveMessage = ref<{ type: 'success' | 'error'; text: string } | null>(null);
const isSyncing = ref(false);
const syncResult = ref<{ success: boolean; message: string } | null>(null);

// CSV Import States
const isUnlocked = ref(false);
const unlockModalPassword = ref('');
const isUnlockingInOptions = ref(false);
const unlockErrorInOptions = ref('');
const showUnlockForImport = ref(false);

const csvFile = ref<File | null>(null);
const parsedCredentials = ref<ParsedCredential[]>([]);
const isImporting = ref(false);
const importResult = ref<{ success: boolean; message: string; added?: number; updated?: number } | null>(null);
const isDragging = ref(false);

onMounted(async () => {
  webdav.value = await getWebDavConfig();
  security.value = await getSecurityConfig();
  syncOptions.value = await getSyncOptions();
  checkUnlockState();
});

function checkUnlockState() {
  chrome.runtime.sendMessage({ type: 'CHECK_UNLOCKED' }, (res) => {
    if (res && res.unlocked) {
      isUnlocked.value = true;
    } else {
      isUnlocked.value = false;
    }
  });
}

function openChromePasswordSettings() {
  chrome.tabs.create({ url: 'chrome://password-manager/settings' });
}

function handleFileDrop(e: DragEvent) {
  isDragging.value = false;
  if (e.dataTransfer && e.dataTransfer.files.length > 0) {
    processFile(e.dataTransfer.files[0]);
  }
}

function handleFileInput(e: Event) {
  const target = e.target as HTMLInputElement;
  if (target.files && target.files.length > 0) {
    processFile(target.files[0]);
  }
}

function processFile(file: File) {
  if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
    alert('请选择 Chrome 导出的 .csv 格式密码文件');
    return;
  }
  csvFile.value = file;
  const reader = new FileReader();
  reader.onload = () => {
    const text = reader.result as string;
    const items = parseChromePasswordsCSV(text);
    parsedCredentials.value = items;
    if (items.length === 0) {
      alert('未能在该 CSV 文件中识别出有效密码记录，请检查是否为 Chrome 导出的密码文件');
    }
  };
  reader.readAsText(file);
}

function clearCsv() {
  csvFile.value = null;
  parsedCredentials.value = [];
  importResult.value = null;
}

function handleUnlockForImport() {
  if (!unlockModalPassword.value) return;
  isUnlockingInOptions.value = true;
  unlockErrorInOptions.value = '';

  chrome.runtime.sendMessage({ type: 'UNLOCK_VAULT', password: unlockModalPassword.value }, (res) => {
    isUnlockingInOptions.value = false;
    if (res && res.success) {
      isUnlocked.value = true;
      showUnlockForImport.value = false;
      unlockModalPassword.value = '';
      executeImport();
    } else {
      unlockErrorInOptions.value = res?.message || '密码错误';
    }
  });
}

function handleStartImport() {
  if (parsedCredentials.value.length === 0) return;

  if (!security.value.isConfigured) {
    alert('请先在上方设置主密码并点击保存');
    return;
  }

  if (!isUnlocked.value) {
    showUnlockForImport.value = true;
    return;
  }

  executeImport();
}

function executeImport() {
  isImporting.value = true;
  importResult.value = null;

  chrome.runtime.sendMessage(
    {
      type: 'IMPORT_CSV_CREDENTIALS',
      items: parsedCredentials.value,
    },
    (res) => {
      isImporting.value = false;
      if (res && res.success) {
        importResult.value = {
          success: true,
          message: `导入成功！已加密存入 ${res.added} 条新密码，更新 ${res.updated} 条，当前密码库共 ${res.total} 条记录，并已自动触发云端同步。`,
          added: res.added,
          updated: res.updated,
        };
        parsedCredentials.value = [];
        csvFile.value = null;
      } else {
        importResult.value = {
          success: false,
          message: res?.message || '导入失败',
        };
      }
    }
  );
}

// Test WebDAV connection
async function handleTestConnection() {
  if (!webdav.value.url || !webdav.value.username || !webdav.value.password) {
    connectionTestResult.value = {
      success: false,
      message: '请先填写完整的 WebDAV 地址、用户名和密码',
    };
    return;
  }

  isTestingConnection.value = true;
  connectionTestResult.value = null;

  try {
    const client = new WebDavClient(webdav.value);
    const res = await client.testConnection();
    connectionTestResult.value = res;
  } catch (err: any) {
    connectionTestResult.value = {
      success: false,
      message: err.message || '连接失败',
    };
  } finally {
    isTestingConnection.value = false;
  }
}

// Save all configurations
async function handleSaveSettings() {
  isSaving.value = true;
  saveMessage.value = null;

  try {
    // 1. Handle Master Password setup if provided and not yet configured
    if (!security.value.isConfigured && masterPassword.value) {
      if (masterPassword.value.length < 6) {
        throw new Error('主密码长度不能少于 6 位');
      }
      if (masterPassword.value !== confirmMasterPassword.value) {
        throw new Error('两次输入的主密码不一致');
      }
      await setupMasterPassword(masterPassword.value);
      security.value = await getSecurityConfig();
    }

    // 2. Save WebDAV and sync preferences
    await setWebDavConfig(webdav.value);
    await setSyncOptions(syncOptions.value);

    // 3. Notify background to update alarms
    chrome.runtime.sendMessage({ type: 'REFRESH_ALARM' });

    saveMessage.value = {
      type: 'success',
      text: '配置已成功保存！',
    };
  } catch (err: any) {
    saveMessage.value = {
      type: 'error',
      text: err.message || '保存失败',
    };
  } finally {
    isSaving.value = false;
    setTimeout(() => {
      saveMessage.value = null;
    }, 4000);
  }
}

// Trigger manual sync
async function handleTriggerSync() {
  isSyncing.value = true;
  syncResult.value = null;

  try {
    const res = await performSync();
    syncResult.value = res;
  } catch (err: any) {
    syncResult.value = {
      success: false,
      message: err.message || '同步出错',
    };
  } finally {
    isSyncing.value = false;
  }
}
</script>

<template>
  <div class="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
    <div class="max-w-4xl mx-auto space-y-6">
      <!-- Header -->
      <div class="flex items-center justify-between pb-6 border-b border-slate-200">
        <div class="flex items-center space-x-3">
          <div class="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-100">
            <ShieldCheck class="w-6 h-6" />
          </div>
          <div>
            <h1 class="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              PassMark <span class="text-sm font-normal text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200">秘签</span>
            </h1>
            <p class="text-xs text-slate-500 mt-0.5">安全去中心化 · WebDAV 端到端加密书签与密码同步</p>
          </div>
        </div>
        <div class="flex items-center gap-3">
          <button
            @click="handleTriggerSync"
            :disabled="isSyncing"
            class="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 transition shadow-sm disabled:opacity-50"
          >
            <RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin': isSyncing }" />
            {{ isSyncing ? '正在同步...' : '立即同步' }}
          </button>
          <button
            @click="handleSaveSettings"
            :disabled="isSaving"
            class="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 transition shadow-sm disabled:opacity-50"
          >
            <Save class="w-3.5 h-3.5" />
            {{ isSaving ? '保存中...' : '保存全部配置' }}
          </button>
        </div>
      </div>

      <!-- Toast Feedback -->
      <div
        v-if="saveMessage"
        :class="[
          'p-4 rounded-xl flex items-center gap-3 text-sm transition',
          saveMessage.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
        ]"
      >
        <CheckCircle2 v-if="saveMessage.type === 'success'" class="w-5 h-5 flex-shrink-0 text-emerald-600" />
        <AlertCircle v-else class="w-5 h-5 flex-shrink-0 text-rose-600" />
        <span>{{ saveMessage.text }}</span>
      </div>

      <!-- Sync Result Banner -->
      <div
        v-if="syncResult"
        :class="[
          'p-4 rounded-xl flex items-center justify-between text-sm transition',
          syncResult.success ? 'bg-indigo-50 text-indigo-900 border border-indigo-200' : 'bg-amber-50 text-amber-900 border border-amber-200'
        ]"
      >
        <div class="flex items-center gap-2">
          <CheckCircle2 v-if="syncResult.success" class="w-4 h-4 text-indigo-600" />
          <AlertCircle v-else class="w-4 h-4 text-amber-600" />
          <span>{{ syncResult.message }}</span>
        </div>
        <button @click="syncResult = null" class="text-xs text-slate-400 hover:text-slate-600">关闭</button>
      </div>

      <!-- Card 1: WebDAV Server Configuration -->
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div class="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <div class="flex items-center space-x-2.5">
            <Cloud class="w-5 h-5 text-indigo-600" />
            <h2 class="text-base font-semibold text-slate-900">WebDAV 云存储配置</h2>
          </div>
          <span class="text-xs text-slate-400">支持坚果云、Nextcloud、群晖 Synology、Alist 等</span>
        </div>

        <div class="p-6 space-y-4">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <!-- URL -->
            <div class="md:col-span-2 space-y-1.5">
              <label class="block text-xs font-medium text-slate-700">WebDAV 服务器地址 (URL)</label>
              <input
                v-model="webdav.url"
                type="text"
                placeholder="https://dav.jianguoyun.com/dav/ 或 https://your-nextcloud.com/remote.php/dav/files/user/"
                class="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition"
              />
              <p class="text-[11px] text-slate-400">注意：若使用坚果云等服务，请在服务商后台生成专门的“应用密码/授权凭据”。</p>
            </div>

            <!-- Username -->
            <div class="space-y-1.5">
              <label class="block text-xs font-medium text-slate-700">账号 / 用户名</label>
              <input
                v-model="webdav.username"
                type="text"
                placeholder="your-account@domain.com"
                class="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition"
              />
            </div>

            <!-- Password -->
            <div class="space-y-1.5">
              <label class="block text-xs font-medium text-slate-700">密码 / 应用专属授权码</label>
              <div class="relative">
                <input
                  v-model="webdav.password"
                  :type="showWebDavPassword ? 'text' : 'password'"
                  placeholder="••••••••••••"
                  class="w-full pl-3.5 pr-10 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition"
                />
                <button
                  type="button"
                  @click="showWebDavPassword = !showWebDavPassword"
                  class="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                >
                  <EyeOff v-if="showWebDavPassword" class="w-4 h-4" />
                  <Eye v-else class="w-4 h-4" />
                </button>
              </div>
            </div>

            <!-- Sync Dir -->
            <div class="space-y-1.5">
              <label class="block text-xs font-medium text-slate-700">远程同步子目录</label>
              <input
                v-model="webdav.syncDir"
                type="text"
                placeholder="/passmark/"
                class="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition"
              />
            </div>

            <!-- Auto Sync Interval -->
            <div class="space-y-1.5">
              <label class="block text-xs font-medium text-slate-700">后台自动同步频率</label>
              <select
                v-model.number="webdav.autoSyncInterval"
                class="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition"
              >
                <option :value="5">每 5 分钟 (频繁)</option>
                <option :value="15">每 15 分钟 (推荐)</option>
                <option :value="30">每 30 分钟</option>
                <option :value="60">每 1 小时</option>
                <option :value="0">从不 (仅手动或变动时同步)</option>
              </select>
            </div>
          </div>

          <!-- Connection test action & feedback -->
          <div class="pt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100">
            <button
              type="button"
              @click="handleTestConnection"
              :disabled="isTestingConnection"
              class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition disabled:opacity-50"
            >
              <RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin': isTestingConnection }" />
              {{ isTestingConnection ? '正在测试...' : '测试服务器连通性' }}
            </button>

            <div v-if="connectionTestResult" class="text-xs flex items-center gap-1.5">
              <CheckCircle2 v-if="connectionTestResult.success" class="w-4 h-4 text-emerald-600" />
              <AlertCircle v-else class="w-4 h-4 text-rose-600" />
              <span :class="connectionTestResult.success ? 'text-emerald-700' : 'text-rose-700 font-medium'">
                {{ connectionTestResult.message }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Card 2: Zero-Knowledge Security & Master Password -->
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div class="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <div class="flex items-center space-x-2.5">
            <Lock class="w-5 h-5 text-indigo-600" />
            <h2 class="text-base font-semibold text-slate-900">安全与主密码 (零知识加密)</h2>
          </div>
          <span
            :class="[
              'text-xs font-medium px-2 py-0.5 rounded-full',
              security.isConfigured ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
            ]"
          >
            {{ security.isConfigured ? '主密码已启用' : '尚未初始化主密码' }}
          </span>
        </div>

        <div class="p-6 space-y-4">
          <p class="text-xs text-slate-500 leading-relaxed">
            PassMark 采用 <b>PBKDF2 (100,000次计算) + AES-256-GCM</b> 端到端加密。
            所有书签和密码均在本地用主密码生成的加密密钥完成加密，密文才会被上传至 WebDAV，即使云盘提供商或黑客也绝对无法读取明文。
          </p>

          <div v-if="!security.isConfigured" class="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div class="space-y-1.5">
              <label class="block text-xs font-medium text-slate-700">设置主密码 (请牢记，不可找回)</label>
              <div class="relative">
                <input
                  v-model="masterPassword"
                  :type="showPassword ? 'text' : 'password'"
                  placeholder="至少 6 位以上强密码"
                  class="w-full pl-3.5 pr-10 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition"
                />
                <button
                  type="button"
                  @click="showPassword = !showPassword"
                  class="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                >
                  <EyeOff v-if="showPassword" class="w-4 h-4" />
                  <Eye v-else class="w-4 h-4" />
                </button>
              </div>
            </div>

            <div class="space-y-1.5">
              <label class="block text-xs font-medium text-slate-700">再次确认主密码</label>
              <input
                v-model="confirmMasterPassword"
                type="password"
                placeholder="重复输入上述密码"
                class="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition"
              />
            </div>
          </div>

          <div v-else class="bg-slate-50 p-4 rounded-xl flex items-center justify-between border border-slate-200">
            <div class="flex items-center gap-3">
              <div class="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600">
                <CheckCircle2 class="w-5 h-5" />
              </div>
              <div>
                <p class="text-xs font-semibold text-slate-800">主密码与独立加密库处于激活状态</p>
                <p class="text-[11px] text-slate-400">日常使用可在弹出窗口快捷输入密码解锁保险箱。</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Card 3: Sync Strategy -->
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div class="px-6 py-5 border-b border-slate-100 flex items-center space-x-2.5">
          <FolderSync class="w-5 h-5 text-indigo-600" />
          <h2 class="text-base font-semibold text-slate-900">同步同步项选择</h2>
        </div>

        <div class="p-6 divide-y divide-slate-100">
          <div class="py-3 flex items-center justify-between">
            <div>
              <p class="text-xs font-medium text-slate-900">Chrome 原生书签同步</p>
              <p class="text-[11px] text-slate-400">读取与监听书签变动，与 WebDAV 进行安全双向合并。</p>
            </div>
            <label class="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" v-model="syncOptions.syncBookmarks" class="sr-only peer" />
              <div class="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
            </label>
          </div>

          <div class="py-3 flex items-center justify-between">
            <div>
              <p class="text-xs font-medium text-slate-900">密码保险箱同步 (Vault)</p>
              <p class="text-[11px] text-slate-400">将已存网页密码加密并推送到云端 WebDAV vault.enc。</p>
            </div>
            <label class="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" v-model="syncOptions.syncVault" class="sr-only peer" />
              <div class="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
            </label>
          </div>

          <div class="py-3 flex items-center justify-between">
            <div>
              <p class="text-xs font-medium text-slate-900">自动同步 (变动防抖 & 定时)</p>
              <p class="text-[11px] text-slate-400">书签修改时延迟 5 秒自动推送到云端，并在后台定期检查。</p>
            </div>
            <label class="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" v-model="syncOptions.autoSync" class="sr-only peer" />
              <div class="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
            </label>
          </div>
        </div>
      </div>

      <!-- Card 4: Import Chrome Passwords CSV -->
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div class="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <div class="flex items-center space-x-2.5">
            <FileSpreadsheet class="w-5 h-5 text-indigo-600" />
            <h2 class="text-base font-semibold text-slate-900">数据导入与迁移 (Chrome 历史密码)</h2>
          </div>
          <span class="text-xs text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-200 font-medium">支持 CSV 批量导入</span>
        </div>

        <div class="p-6 space-y-5">
          <!-- Step by Step instructions -->
          <div class="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
            <h3 class="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
              <span>💡</span> 如何从 Chrome 导出已有密码？
            </h3>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-slate-600">
              <div class="p-2.5 bg-white rounded-lg border border-slate-100 space-y-1">
                <span class="font-bold text-indigo-600 text-[11px]">步骤 1</span>
                <p>打开 Chrome 密码管理设置：</p>
                <button
                  type="button"
                  @click="openChromePasswordSettings"
                  class="mt-1 inline-flex items-center gap-1 text-[11px] text-indigo-600 hover:text-indigo-800 font-medium"
                >
                  <ExternalLink class="w-3 h-3" /> 前往密码设置
                </button>
              </div>

              <div class="p-2.5 bg-white rounded-lg border border-slate-100 space-y-1">
                <span class="font-bold text-indigo-600 text-[11px]">步骤 2</span>
                <p>在页面底部找到<b>“导出密码”</b>，点击<b>“下载文件”</b>，输入电脑锁屏密码后保存为 <code>.csv</code> 文件。</p>
              </div>

              <div class="p-2.5 bg-white rounded-lg border border-slate-100 space-y-1">
                <span class="font-bold text-indigo-600 text-[11px]">步骤 3</span>
                <p>将导出的 <code>.csv</code> 文件上传到下方，系统将自动加密并推送到 WebDAV。</p>
              </div>
            </div>
          </div>

          <!-- File Dropzone -->
          <div
            @dragover.prevent="isDragging = true"
            @dragleave.prevent="isDragging = false"
            @drop.prevent="handleFileDrop"
            :class="[
              'border-2 border-dashed rounded-2xl p-6 text-center transition flex flex-col items-center justify-center cursor-pointer',
              isDragging ? 'border-indigo-500 bg-indigo-50/50' : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
            ]"
            @click="($refs.fileInput as HTMLInputElement)?.click()"
          >
            <input
              ref="fileInput"
              type="file"
              accept=".csv,text/csv"
              class="hidden"
              @change="handleFileInput"
            />
            <div class="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center mb-2">
              <UploadCloud class="w-6 h-6" />
            </div>
            <p class="text-xs font-semibold text-slate-800">
              {{ csvFile ? csvFile.name : '点击或将 Chrome 密码 CSV 文件拖拽到此处' }}
            </p>
            <p class="text-[11px] text-slate-400 mt-1">支持 Chrome、Edge、Firefox 导出的密码 CSV 格式</p>
          </div>

          <!-- Parsed summary preview -->
          <div v-if="parsedCredentials.length > 0" class="p-4 bg-emerald-50 rounded-xl border border-emerald-200 space-y-3">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <CheckCircle2 class="w-4 h-4 text-emerald-600" />
                <span class="text-xs font-semibold text-emerald-900">
                  成功解析出 {{ parsedCredentials.length }} 条密码记录！
                </span>
              </div>
              <button
                type="button"
                @click="clearCsv"
                class="text-xs text-slate-400 hover:text-slate-600"
              >
                重新选择
              </button>
            </div>

            <!-- Preview sample items -->
            <div class="space-y-1.5 max-h-36 overflow-y-auto">
              <div
                v-for="(item, idx) in parsedCredentials.slice(0, 5)"
                :key="idx"
                class="bg-white/80 px-3 py-1.5 rounded-lg border border-emerald-100 text-[11px] flex items-center justify-between"
              >
                <span class="font-medium text-slate-800 truncate mr-2">{{ item.title }} ({{ item.username }})</span>
                <span class="font-mono text-slate-400">••••••••</span>
              </div>
              <div v-if="parsedCredentials.length > 5" class="text-[10px] text-emerald-700 italic text-center">
                ... 还有 {{ parsedCredentials.length - 5 }} 条记录
              </div>
            </div>

            <div class="pt-2 flex justify-end">
              <button
                type="button"
                @click="handleStartImport"
                :disabled="isImporting"
                class="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 transition shadow-sm disabled:opacity-50"
              >
                <KeyRound class="w-3.5 h-3.5" />
                {{ isImporting ? '加密导入中...' : `确认导入这 ${parsedCredentials.length} 条密码并加密同步` }}
              </button>
            </div>
          </div>

          <!-- Import Result Toast -->
          <div
            v-if="importResult"
            :class="[
              'p-4 rounded-xl flex items-center gap-3 text-xs transition',
              importResult.success ? 'bg-indigo-50 text-indigo-900 border border-indigo-200' : 'bg-rose-50 text-rose-900 border border-rose-200'
            ]"
          >
            <CheckCircle2 v-if="importResult.success" class="w-4 h-4 text-indigo-600 flex-shrink-0" />
            <AlertCircle v-else class="w-4 h-4 text-rose-600 flex-shrink-0" />
            <span>{{ importResult.message }}</span>
          </div>
        </div>
      </div>

      <!-- Unlock Modal for Import if locked -->
      <div
        v-if="showUnlockForImport"
        class="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4"
      >
        <div class="bg-white rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-xl border border-slate-200">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-200">
              <Lock class="w-5 h-5" />
            </div>
            <div>
              <h3 class="text-sm font-bold text-slate-900">请输入主密码</h3>
              <p class="text-xs text-slate-500">导入前需要解锁本地加密密钥以加密存储</p>
            </div>
          </div>

          <div class="space-y-1">
            <input
              v-model="unlockModalPassword"
              type="password"
              placeholder="输入你的主密码"
              @keyup.enter="handleUnlockForImport"
              class="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
            />
            <p v-if="unlockErrorInOptions" class="text-xs text-rose-600 font-medium">{{ unlockErrorInOptions }}</p>
          </div>

          <div class="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              @click="showUnlockForImport = false"
              class="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-800"
            >
              取消
            </button>
            <button
              type="button"
              @click="handleUnlockForImport"
              :disabled="isUnlockingInOptions"
              class="px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition disabled:opacity-50"
            >
              {{ isUnlockingInOptions ? '解锁中...' : '解锁并继续导入' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Footer Info -->
      <div class="text-center text-xs text-slate-400 pt-4 pb-8">
        PassMark v0.1.0 · 零知识自托管扩展 · 完全属于你的个人隐私保险箱
      </div>
    </div>
  </div>
</template>
