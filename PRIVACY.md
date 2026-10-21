# PassMark 隐私政策 / Privacy Policy

最后更新：2026-10-21 · Last updated: October 21, 2026

---

## 中文

### 一句话总结

PassMark 不收集、不上传、不转售任何用户数据。你的收藏夹与密码只在你的浏览器本地完成加密，密文仅上传到**你自己填写的 WebDAV 服务器**，开发者无法访问。

### 1. 我们处理哪些数据

PassMark 仅在你的设备本地处理以下数据，用于实现其唯一功能（通过你自己的 WebDAV 服务器在设备间同步个人数据）：

| 数据类型 | 用途 | 存储位置 |
| --- | --- | --- |
| 浏览器收藏夹（标题、网址、文件夹结构） | 与 WebDAV 双向同步 | 本地浏览器 + 你的 WebDAV |
| 登录凭据（网站、用户名、密码、备注） | 密码保险箱、自动填充 | 本地加密存储 + 你的 WebDAV（密文） |
| WebDAV 连接配置（地址、账号、授权密码） | 连接你指定的服务器 | 仅本地扩展存储 |
| 主密码 | 派生加密密钥 | **仅内存与会话存储，绝不上传、绝不写入磁盘明文** |

### 2. 加密方式

- 使用浏览器原生 Web Cryptography API：PBKDF2（100,000 次迭代，SHA-256）派生密钥，AES-256-GCM 认证加密。
- 上传到 WebDAV 的文件（`bookmarks.enc`、`vault.enc`）**全部为密文**。`meta.json` 仅包含版本号、时间戳与随机盐值，不含任何明文内容。
- 主密码不会离开你的设备。若你遗失主密码，数据无法恢复，开发者也无法协助恢复。

### 3. 网络请求

PassMark 只向**你本人在设置页填写的 WebDAV 地址**发起网络请求。扩展不包含任何分析 SDK、遥测、广告或第三方追踪代码，也不会向开发者或任何第三方服务器发送数据。

### 4. 权限说明

| 权限 | 为什么需要 |
| --- | --- |
| `bookmarks` | 读取并双向同步浏览器收藏夹 |
| `storage` / `unlimitedStorage` | 保存配置、加密后的保险箱密文与同步状态；收藏夹与密码库密文可能超过默认配额 |
| `alarms` | 按你设定的间隔（5–60 分钟）触发后台自动同步 |
| 访问所有网站的权限（`<all_urls>`） | ① 向你自行填写的任意 WebDAV 地址发起请求；② 在任意网站的登录表单旁注入自动填充图标。扩展不会读取或上传网页内容 |

### 5. 「记住本设备」选项

该选项**默认关闭**。关闭时，用于解密的密钥仅保存在浏览器会话存储中，关闭浏览器即失效。

若你主动开启，密钥会被保存在本机扩展存储（`chrome.storage.local`）中，以便浏览器重启后仍能自动填充与后台同步。该密钥始终只存在于本机，不会上传。在共享设备上建议保持关闭。

### 6. 数据删除

- 卸载扩展会清除扩展的全部本地存储。
- 云端密文位于你自己的 WebDAV 服务器，请自行删除 `/passmark/` 目录下的 `meta.json`、`bookmarks.enc`、`vault.enc`。
- 开发者不持有任何可删除的用户数据副本。

### 7. 儿童隐私

本扩展不面向 13 岁以下儿童，也不会有意收集其任何信息。

### 8. 政策变更

若本政策发生实质性变更，将更新本文件顶部的日期，并在扩展的商店页面说明。继续使用即表示接受更新后的政策。

### 9. 联系方式

如有疑问，请通过 GitHub Issues 联系：<https://github.com/IceCoder1994/passmark/issues>

---

## English

### Summary

PassMark does not collect, transmit, or sell any user data. Your bookmarks and passwords are encrypted locally in your browser, and the ciphertext is uploaded only to the **WebDAV server you configure yourself**. The developer has no access to it.

### 1. Data We Process

PassMark processes the following data locally on your device, solely to deliver its single purpose (syncing your personal data between devices through your own WebDAV server):

| Data type | Purpose | Where it is stored |
| --- | --- | --- |
| Browser bookmarks (titles, URLs, folder structure) | Two-way sync with WebDAV | Local browser + your WebDAV |
| Login credentials (site, username, password, notes) | Password vault and autofill | Local encrypted storage + your WebDAV (ciphertext) |
| WebDAV configuration (URL, account, app password) | Connect to the server you specify | Local extension storage only |
| Master password | Derive the encryption key | **Memory and session storage only; never uploaded, never written to disk in plaintext** |

### 2. Encryption

- Uses the native Web Cryptography API: PBKDF2 (100,000 iterations, SHA-256) for key derivation and AES-256-GCM for authenticated encryption.
- Files uploaded to WebDAV (`bookmarks.enc`, `vault.enc`) are **always ciphertext**. `meta.json` contains only a version number, timestamps, and a random salt — no plaintext content.
- Your master password never leaves your device. If you lose it, the data cannot be recovered, and the developer cannot help recover it.

### 3. Network Requests

PassMark sends network requests only to the **WebDAV address you enter in the settings page**. The extension contains no analytics SDK, telemetry, advertising, or third-party tracking code, and sends no data to the developer or any third party.

### 4. Permissions

| Permission | Why it is needed |
| --- | --- |
| `bookmarks` | Read and two-way sync browser bookmarks |
| `storage` / `unlimitedStorage` | Store settings, encrypted vault ciphertext, and sync state; bookmark and vault ciphertext may exceed the default quota |
| `alarms` | Trigger background auto-sync at your chosen interval (5–60 minutes) |
| Access to all sites (`<all_urls>`) | (1) Send requests to any WebDAV address you enter; (2) inject the autofill icon next to login forms on any website. The extension does not read or upload page content |

### 5. "Remember this device" Option

This option is **off by default**. When off, the decryption key is kept only in browser session storage and is discarded when the browser closes.

If you explicitly enable it, the key is stored in local extension storage (`chrome.storage.local`) so that autofill and background sync keep working after a browser restart. The key always remains on your device and is never uploaded. On shared devices, keep this option off.

### 6. Data Deletion

- Uninstalling the extension clears all of its local storage.
- Cloud ciphertext lives on your own WebDAV server. Delete `meta.json`, `bookmarks.enc`, and `vault.enc` under the `/passmark/` directory yourself.
- The developer holds no copy of your data to delete.

### 7. Children's Privacy

This extension is not directed to children under 13 and does not knowingly collect any information from them.

### 8. Policy Changes

If this policy changes materially, the date at the top of this document will be updated and the change noted on the extension's store listing. Continued use constitutes acceptance of the updated policy.

### 9. Contact

For questions, please open an issue at <https://github.com/IceCoder1994/passmark/issues>
