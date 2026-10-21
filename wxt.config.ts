import { defineConfig } from 'wxt';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  vite: () => ({
    plugins: [vue()],
  }),
  manifest: {
    name: 'PassMark - 收藏夹与密码安全同步',
    description: '基于 WebDAV 的自托管端到端加密收藏夹与密码同步扩展',
    version: '1.0.0',
    homepage_url: 'https://github.com/IceCoder1994/passmark',
    permissions: [
      // 读取并双向同步浏览器收藏夹
      'bookmarks',
      // 保存配置、加密后的保险箱密文与同步状态
      'storage',
      // 收藏夹树与密码库密文可能超过 storage.local 默认配额
      'unlimitedStorage',
      // 按用户设定的间隔触发后台自动同步
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
    },
  },
});
