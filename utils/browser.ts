/**
 * 浏览器环境适配工具
 * PassMark 同时支持 Chrome 与 Edge，两者的内部管理页地址不同，
 * 因此不能硬编码 chrome:// 开头的 URL。
 */

/** 是否运行在 Microsoft Edge 上 */
export function isEdge(): boolean {
  return /Edg\//.test(navigator.userAgent);
}

/** 当前浏览器名称，用于界面文案 */
export function getBrowserName(): string {
  return isEdge() ? 'Edge' : 'Chrome';
}

/** 收藏夹/书签管理器地址 */
export function getBookmarksUrl(): string {
  return isEdge() ? 'edge://favorites/' : 'chrome://bookmarks/';
}

/** 密码管理器设置页地址 */
export function getPasswordsUrl(): string {
  return isEdge() ? 'edge://settings/passwords' : 'chrome://password-manager/settings';
}

/** 内部页面地址（用于在扩展页中生成可点击链接） */
export function isInternalUrlSupported(url: string): boolean {
  return /^(chrome|edge):\/\//.test(url);
}
