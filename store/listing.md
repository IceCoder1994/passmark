# PassMark 商店上架文案（Microsoft Edge Add-ons）

> 本文件是提交 Partner Center 时可直接复制的文案底稿。
> 规格依据：<https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension>

---

## 一、基础信息

| 字段 | 值 |
| --- | --- |
| Extension name | `PassMark - 收藏夹与密码安全同步` |
| Version | `1.0.0` |
| Category | `Productivity` |
| Website | `https://github.com/IceCoder1994/passmark` |
| Support contact | `https://github.com/IceCoder1994/passmark/issues` |
| Mature content | 否 |
| Visibility | Public |
| Markets | 全部市场 |
| Remote code | **No** |

> ⚠️ Extension name 与 Short description 由 manifest 决定，提交后不可在后台修改，需重新上传 zip 才能改。已确认 manifest 中为上述名称。

---

## 二、Short description（manifest description，≤132 字符）

```
基于 WebDAV 的自托管端到端加密收藏夹与密码同步扩展
```

字符数：28（中文按字符计），远低于 132 上限。

---

## 三、详细描述（zh-CN，≥250 字符）

```
PassMark（秘签）是一款把数据主权完全交还给你的浏览器扩展。它不使用任何中心化服务器，而是让你用自己的 WebDAV 网盘（坚果云、Nextcloud、ownCloud、群晖 NAS、Alist 等）在设备之间同步两类个人数据：浏览器收藏夹与登录凭据。

■ 零知识端到端加密
所有数据在离开你的设备之前就已完成加密。PassMark 使用浏览器原生 Web Cryptography API，以 PBKDF2（10 万次迭代、SHA-256）从你的主密码派生密钥，再用 AES-256-GCM 做认证加密。上传到你 WebDAV 的 bookmarks.enc 与 vault.enc 全部是密文，云盘服务商、网络中间人乃至本扩展的开发者都无法读取其中的内容。主密码本身从不离开你的设备，也不会上传或写入磁盘明文。

■ 收藏夹双向同步
扩展会监听浏览器收藏夹的增删改与移动，采用 5 秒防抖后自动推送，并可在后台按 5 至 60 分钟的间隔定时同步。合并策略是保守的双向合并：以网址和文件夹标题为锚点，只新增与更新，不静默删除你在任一设备上的条目，避免多设备切换时丢失数据。

■ 加密密码保险箱
独立的密码库，与浏览器自带的密码管理器互不干扰。打开任意网站的登录页时，输入框旁会出现钥匙角标，点开即可看到与该域名匹配的账号并一键填充。支持多域名与子域名匹配、模糊搜索、一键复制账号与密码，以及可自定义长度与字符集的强密码生成器。

■ 便捷的数据迁移
支持直接导入 Chrome / Edge 导出的 CSV 密码文件。导入过程在本地完成，明文不会经过任何网络请求，导入后立即以密文形式写入本地与云端。

■ 关于设备解锁
默认情况下，解密密钥只保存在浏览器会话中，关闭浏览器即失效，下次使用需要重新输入主密码。如果你希望浏览器重启后仍能自动填充与后台同步，可以在设置页主动开启「在本设备记住解锁状态」——此时密钥会持久保存在本机扩展存储中，请仅在个人设备上使用该选项。

■ 隐私承诺
本扩展不含任何分析 SDK、遥测、广告或第三方追踪代码。全部网络请求只发往你在设置页填写的那个 WebDAV 地址。开发者不收集、不存储、也无法访问你的任何数据。

■ 使用前提
你需要拥有一个支持 WebDAV 协议的存储服务，并准备一个至少 6 位的主密码。主密码遗失后数据无法恢复，这是零知识加密的必然代价，请务必妥善保管。
```

---

## 四、Detailed description（en-US）

```
PassMark is a browser extension that gives you full ownership of your data. Instead of relying on a central server, it syncs two kinds of personal data between your devices through your own WebDAV storage (Jianguoyun, Nextcloud, ownCloud, Synology NAS, Alist, and any other standards-compliant service): browser bookmarks and login credentials.

■ Zero-knowledge end-to-end encryption
Everything is encrypted on your device before it leaves. PassMark uses the native Web Cryptography API to derive a key from your master password with PBKDF2 (100,000 iterations, SHA-256), then encrypts with AES-256-GCM. The files uploaded to your WebDAV — bookmarks.enc and vault.enc — are always ciphertext. Your storage provider, network intermediaries, and the developer cannot read them. Your master password never leaves your device and is never uploaded or written to disk in plaintext.

■ Two-way bookmark sync
The extension watches bookmark creation, edits, moves, and deletions, then pushes changes after a 5-second debounce. Background sync can run every 5 to 60 minutes. The merge strategy is deliberately conservative: it anchors on URLs and folder titles and only adds or updates entries, never silently deleting items that exist on another device.

■ Encrypted password vault
A standalone password vault that does not interfere with your browser's built-in manager. On any login page, a key badge appears next to the input fields; click it to see credentials matching that domain and fill them in with one click. Supports multi-domain and subdomain matching, fuzzy search, one-click copy of usernames and passwords, and a strong password generator with configurable length and character sets.

■ Easy migration
Import CSV password exports from Chrome or Edge directly. Parsing happens locally — plaintext never touches the network — and imported entries are immediately written to local and cloud storage as ciphertext.

■ About device unlock
By default the decryption key lives only in browser session storage and is discarded when the browser closes, so you will need to enter your master password again. If you want autofill and background sync to survive a browser restart, enable "Remember unlock state on this device" in Settings. The key is then persisted in local extension storage; only use this on a personal device.

■ Privacy
No analytics SDK, no telemetry, no ads, no third-party tracking. All network requests go only to the WebDAV address you configure. The developer collects nothing and cannot access your data.

■ Requirements
You need a WebDAV-capable storage service and a master password of at least 6 characters. If you lose the master password the data cannot be recovered — that is the unavoidable cost of zero-knowledge encryption.
```

---

## 五、搜索词（≤7 个，每个 ≤30 字符，合计 ≤21 词）

```
WebDAV
密码同步
书签同步
收藏夹同步
端到端加密
密码管理器
自托管
```

英文（若添加 en-US listing）：

```
WebDAV
password sync
bookmark sync
end-to-end encryption
password manager
self-hosted
zero knowledge
```

---

## 六、Single Purpose Description

```
PassMark 的唯一用途是：让用户通过自己配置的 WebDAV 服务器，在设备之间端到端加密地同步两类个人数据——浏览器收藏夹与登录凭据。两类数据共用同一套加密管线、同一个远端目录与同一套同步调度，属于同一目的下的两种数据类型，而非两个独立功能。
```

英文：

```
PassMark has a single purpose: to let users sync two kinds of personal data — browser bookmarks and login credentials — between their devices through a WebDAV server they configure themselves, with end-to-end encryption. Both data types share one encryption pipeline, one remote directory, and one sync scheduler; they are two data types serving the same purpose, not two separate features.
```

---

## 七、权限理由（逐条填入 Permission justification）

| 权限 | 提交文案（中文） |
| --- | --- |
| `bookmarks` | 核心功能所需。扩展需要读取收藏夹树以生成加密快照，并监听 onCreated / onRemoved / onChanged / onMoved 事件，从而在用户增删改收藏夹后触发同步。除此之外不读取任何浏览数据。 |
| `storage` | 保存用户配置（WebDAV 地址、同步选项）、加密后的保险箱密文、认证校验值与同步状态。这些数据都存放在扩展自己的 storage 中，不与其他扩展共享。 |
| `unlimitedStorage` | 收藏夹树与密码库在加密后仍可能随条目增长而超过 storage.local 默认的 10MB 配额。申请该权限是为了避免同步数据量增长后写入失败，而非存储无关内容。 |
| `alarms` | 按用户在设置页选择的间隔（5 / 15 / 30 / 60 分钟）在后台触发定时同步。Manifest V3 的 service worker 会被浏览器随时休眠，只有 alarms 能可靠地周期性唤醒它。 |
| `host_permissions: <all_urls>` | 两个用途：① 向用户自行填写的任意 WebDAV 地址发起 PROPFIND / GET / PUT 请求——WebDAV 服务器地址由用户决定，无法预先枚举；② 在任意网站的登录表单旁注入自动填充角标——登录页可能出现在任何域名下。扩展不读取、不上传网页正文内容。 |
| `content_scripts`（`<all_urls>` + `all_frames`） | 登录表单经常位于跨域 iframe 中（例如第三方 SSO 登录框）。只注入顶层文档会漏掉大量真实登录场景，因此需要 all_frames。脚本仅识别 input 元素类型与 name/id 属性以判断是否为登录字段，不采集页面内容。 |

---

## 八、Data usage 勾选建议

| 问题 | 选择 |
| --- | --- |
| 是否收集个人身份信息（PII） | 否（开发者不收集） |
| 是否收集健康信息 | 否 |
| 是否收集财务信息 | 否 |
| 是否收集**认证信息**（用户名、密码） | **是** — 说明：凭据由用户主动录入或在用户确认后保存，仅以密文形式存储在用户设备与用户自己的 WebDAV 中，开发者无法访问 |
| 是否收集个人通讯内容 | 否 |
| 是否收集位置信息 | 否 |
| 是否收集网页浏览记录 | 否（收藏夹由用户主动创建，非浏览历史） |
| 是否收集网站内容 | 否 |
| 是否收集用户活动 | 否 |

三项认证声明全部勾选：
- 不会将用户数据出售给第三方
- 不会将用户数据用于与扩展核心功能无关的目的
- 不会将用户数据用于判定信用度或放贷

Privacy policy URL：`https://icecoder1994.github.io/passmark/privacy.html`（见第九节）

---

## 九、隐私政策托管

`PRIVACY.md` 已放在仓库根目录。为了让审核员能直接打开，需要生成一个静态页面：

1. 在仓库 Settings → Pages 中选择 `main` 分支、`/docs` 目录
2. 把 `PRIVACY.md` 转换为 `docs/privacy.html`（含样式，中英双语同页）
3. 上线后 URL 为 `https://icecoder1994.github.io/passmark/privacy.html`

若暂时不想开 Pages，可先用 GitHub 的渲染地址：
`https://github.com/IceCoder1994/passmark/blob/main/PRIVACY.md`
但该地址带有 GitHub 站点外壳，审核通过率低于独立页面，建议用 Pages。

---

## 十、Notes for certification（审核备注）

```
感谢审核。以下是快速验证路径，约 3 分钟即可覆盖核心功能。

【无需任何账号即可测试的部分】

1. 安装扩展后，点击工具栏的 PassMark 图标，会弹出主界面。
2. 首次使用会要求设置主密码。请输入任意 6 位以上字符（例如 Test123456），点击「设置主密码」。该密码只用于本地加密，不会上传。
3. 切换到「密码保险箱」标签，点击右上角「+」新增一条记录：
   - 标题：GitHub
   - 账号：test@example.com
   - 密码：点击「生成强密码」自动填充
   - 关联域名：github.com
   点击「保存」。
4. 打开 https://github.com/login ，可以看到账号与密码输入框右侧出现紫色钥匙角标。点击角标会展开已保存的账号列表，点击条目即可自动填充。
5. 在设置页（右键扩展图标 → 选项）的「数据导入与迁移」卡片，可以拖入任意符合 Chrome 导出格式的 CSV 文件验证导入功能。

【需要 WebDAV 的部分（可跳过）】

收藏夹同步与云端备份需要用户自备 WebDAV 服务器，审核时无需验证。若需验证，可在设置页填入任意标准 WebDAV 地址（如 https://dav.jianguoyun.com/dav/）后点击「测试服务器连通性」，观察请求是否正确发出。

【重要说明】

- 本扩展不包含任何远程代码，所有 JS 均打包在 zip 内。
- 全部网络请求只发往用户在设置页填写的 WebDAV 地址，不向开发者或任何第三方发送数据。
- 「在本设备记住解锁状态」默认关闭。关闭时密钥仅存于 chrome.storage.session，浏览器关闭即清除。
- 收藏夹同步通过 chrome.bookmarks API 实现，合并策略只新增不删除，不会破坏审核员的收藏夹数据。建议审核时使用干净的浏览器配置文件。
```

---

## 十一、提交检查清单

- [x] `manifest.json` 版本 1.0.0
- [x] 权限精简为 bookmarks / storage / unlimitedStorage / alarms
- [x] 无 `scripting`、`activeTab` 等未使用权限
- [x] 无远程代码（全部打包）
- [x] `homepage_url` 已设置
- [x] 图标 16/32/48/128 齐备
- [x] `options_ui.open_in_tab = true`
- [x] LICENSE（MIT）已添加
- [x] PRIVACY.md 已添加
- [x] 4 张 1280×800 截图
- [x] 300×300 Logo
- [x] 440×280 小促销图
- [x] 1400×560 大促销图
- [ ] GitHub Pages 上线隐私政策
- [ ] Partner Center 提交
