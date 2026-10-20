import { defineConfig } from 'wxt';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  vite: () => ({
    plugins: [vue()],
  }),
  manifest: {
    name: 'PassMark - 书签与密码安全同步',
    description: '基于 WebDAV 的自托管端到端加密书签与密码同步插件',
    version: '0.1.0',
    permissions: [
      'bookmarks',
      'storage',
      'unlimitedStorage',
      'activeTab',
      'scripting',
      'alarms',
    ],
    host_permissions: ['<all_urls>'],
    icons: {
      16: 'icon-16.png',
      32: 'icon-32.png',
      48: 'icon-48.png',
      128: 'icon-128.png',
    },
    action: {
      default_title: 'PassMark (秘签)',
      default_icon: {
        16: 'icon-16.png',
        32: 'icon-32.png',
        48: 'icon-48.png',
        128: 'icon-128.png',
      },
    },
    options_ui: {
      page: 'options.html',
      open_in_tab: true,
    },
  },
});
