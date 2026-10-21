/**
 * 商店截图生成器
 * 思路：Edge 137+ 已移除 --load-extension，无法用命令行加载未打包扩展。
 * 因此这里启动一个本地静态服务器托管 .output/edge-mv3，
 * 并通过 CDP 的 Page.addScriptToEvaluateOnNewDocument 注入 chrome.* API 模拟层，
 * 让真实的 popup / options 页面以完整数据渲染，再截取 1280x800 画面。
 */
const { execFileSync } = await import("node:child_process");
const http = await import("node:http");
const fs = await import("node:fs/promises");
const path = await import("node:path");
const { AUTOFILL_HTML } = await import("./autofill-demo.mjs");

const ROOT = "E:/feiqi/passmark/.output/edge-mv3";
const OUT = "E:/feiqi/passmark/store/raw";const PROFILE = "C:/Users/admin/AppData/Local/Temp/opencode/pm-shot-profile";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const HTTP_PORT = 8711;
const CDP_PORT = 9334;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
};

// ---------- 演示数据 ----------
const DEMO_VAULT = [
  {
    id: "v1",
    title: "GitHub",
    username: "icecoder@example.com",
    password: "G7#kLm9$pQr2@Xw4",
    urls: ["github.com"],
    notes: "工作账号",
    createdAt: 1730000000000,
    updatedAt: 1760000000000,
  },
  {
    id: "v2",
    title: "Nextcloud",
    username: "admin",
    password: "Nc!2026$SelfHost",
    urls: ["cloud.example.com"],
    notes: "自建网盘",
    createdAt: 1730000000000,
    updatedAt: 1760100000000,
  },
  {
    id: "v3",
    title: "坚果云",
    username: "icecoder@example.com",
    password: "jy!Yun8#Pan9",
    urls: ["jianguoyun.com"],
    notes: "WebDAV 同步盘",
    createdAt: 1730000000000,
    updatedAt: 1760200000000,
  },
  {
    id: "v4",
    title: "群晖 NAS",
    username: "passmark",
    password: "Syn0logy@Home26",
    urls: ["nas.example.com"],
    notes: "",
    createdAt: 1730000000000,
    updatedAt: 1760300000000,
  },
];

const MOCK = `
(() => {
  const vault = ${JSON.stringify(DEMO_VAULT)};
  const store = {
    passmark_webdav_config: {
      url: 'https://dav.jianguoyun.com/dav/',
      username: 'icecoder@example.com',
      password: 'app-token-********',
      syncDir: '/passmark/',
      autoSyncInterval: 15,
    },
    passmark_security_config: {
      salt: 'c2FsdHNhbHRzYWx0c2FsdA==',
      lockTimeoutMinutes: 15,
      isConfigured: true,
      rememberDevice: false,
    },
    passmark_sync_options: { syncBookmarks: true, syncVault: true, autoSync: true },
    passmark_last_sync: {
      isSyncing: false,
      lastSyncTime: Date.now() - 1000 * 60 * 3,
      lastError: null,
      bookmarkCount: 348,
      vaultCount: 27,
    },
    passmark_auth_verifier: 'mock-verifier',
  };

  const responses = {
    CHECK_UNLOCKED: { unlocked: true },
    GET_VAULT_ITEMS: { items: vault, unlocked: true },
    GET_MATCHING_CREDENTIALS: {
      items: [vault[0], { ...vault[2], id: 'v1b', username: 'icecoder@gmail.com' }],
    },
    VERIFY_MASTER_PASSWORD: { valid: true },
    TRIGGER_SYNC: { success: true, message: '同步成功！已同步 348 个收藏夹，27 条密码记录。' },
    REFRESH_ALARM: { success: true },
    CHECK_SHOULD_PROMPT_SAVE: { shouldPrompt: false },
  };

  const chromeMock = {
    runtime: {
      lastError: undefined,
      id: 'passmarkmockextensionidpassmark',
      sendMessage(msg, cb) {
        const payload = responses[msg && msg.type] || { success: true };
        if (typeof cb === 'function') setTimeout(() => cb(payload), 30);
        return Promise.resolve(payload);
      },
      openOptionsPage() {},
      getURL(p) { return 'chrome-extension://mock/' + p; },
      onMessage: { addListener() {} },
    },
    storage: {
      local: {
        get(keys) {
          if (typeof keys === 'string') return Promise.resolve({ [keys]: store[keys] });
          if (Array.isArray(keys)) {
            const out = {};
            keys.forEach((k) => { if (k in store) out[k] = store[k]; });
            return Promise.resolve(out);
          }
          return Promise.resolve({ ...store });
        },
        set(obj) { Object.assign(store, obj); return Promise.resolve(); },
        remove(k) { delete store[k]; return Promise.resolve(); },
      },
      session: {
        get() { return Promise.resolve({}); },
        set() { return Promise.resolve(); },
        remove() { return Promise.resolve(); },
      },
      onChanged: { addListener() {} },
    },
    tabs: {
      query(_q, cb) {
        const tabs = [{ id: 1, url: 'https://github.com/login', title: 'Sign in to GitHub' }];
        if (typeof cb === 'function') setTimeout(() => cb(tabs), 20);
        return Promise.resolve(tabs);
      },
      create() {},
      sendMessage() {},
    },
    bookmarks: {
      getTree() {
        return Promise.resolve([{
          id: '0', title: '',
          children: [
            { id: '1', title: '收藏夹栏', children: [
              { id: '10', title: 'GitHub', url: 'https://github.com' },
              { id: '11', title: 'Vue', url: 'https://vuejs.org' },
            ]},
            { id: '2', title: '其他收藏夹', children: [
              { id: '20', title: 'WXT', url: 'https://wxt.dev' },
            ]},
          ],
        }]);
      },
      getChildren() { return Promise.resolve([]); },
      create() { return Promise.resolve({ id: 'x' }); },
      update() { return Promise.resolve({}); },
      onCreated: { addListener() {} },
      onRemoved: { addListener() {} },
      onChanged: { addListener() {} },
      onMoved: { addListener() {} },
    },
    alarms: { create() {}, clear() {}, onAlarm: { addListener() {} } },
    i18n: { getMessage: (k) => k },
  };

  try {
    Object.defineProperty(window, 'chrome', { value: chromeMock, writable: true, configurable: true });
  } catch (e) {
    window.chrome = chromeMock;
  }

  // 模拟 WebDAV 服务端响应，避免截图出现连接错误
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    const method = (init && init.method) || 'GET';
    if (!/^https?:\\/\\//.test(url) || url.startsWith('http://127.0.0.1')) {
      return realFetch(input, init);
    }
    const headers = new Headers({ 'Content-Type': 'application/json' });
    if (method === 'PROPFIND') {
      return new Response('<?xml version="1.0"?><D:multistatus xmlns:D="DAV:"></D:multistatus>', {
        status: 207, headers: new Headers({ 'Content-Type': 'application/xml' }),
      });
    }
    if (method === 'PUT') return new Response('', { status: 201 });
    // 截图场景模拟“目标目录为空”，避免出现云端恢复引导面板
    if (url.endsWith('meta.json')) {
      return new Response('', { status: 404 });
    }
    return new Response('', { status: 404 });
  };
})();
`;

// ---------- 静态服务器 ----------
const server = http.createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent(req.url.split("?")[0]);
    // 演示页：真实登录表单，用于自动填充浮层截图
    if (urlPath === "/autofill-demo.html") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(AUTOFILL_HTML);
      return;
    }
    const rel = urlPath === "/" ? "/popup.html" : urlPath;
    const file = path.join(ROOT, rel);
    const data = await fs.readFile(file);
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
});
await new Promise((r) => server.listen(HTTP_PORT, "127.0.0.1", r));

// ---------- 启动 Edge ----------
await fs.rm(PROFILE, { recursive: true, force: true });
const args = [
  `--remote-debugging-port=${CDP_PORT}`,
  `--user-data-dir=${PROFILE}`,
  "--no-first-run",
  "--no-default-browser-check",
  "--hide-scrollbars",
  "--force-device-scale-factor=1",
  "about:blank",
];
execFileSync(
  "powershell",
  ["-NoProfile", "-Command", `Start-Process -FilePath '${EDGE}' -ArgumentList @(${args.map((a) => `'${a}'`).join(",")})`],
  { stdio: "ignore" }
);

let wsUrl = null;
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 500));
  try {
    const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
    const page = list.find((t) => t.type === "page");
    if (page) { wsUrl = page.webSocketDebuggerUrl; break; }
  } catch {}
}
if (!wsUrl) throw new Error("CDP 未就绪");

// ---------- CDP 客户端 ----------
function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let id = 0;
    const pending = new Map();
    ws.addEventListener("open", () =>
      resolve({
        send(method, params = {}) {
          return new Promise((res, rej) => {
            const msgId = ++id;
            pending.set(msgId, { res, rej });
            ws.send(JSON.stringify({ id: msgId, method, params }));
          });
        },
        close() { ws.close(); },
      })
    );
    ws.addEventListener("error", reject);
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) rej(new Error(JSON.stringify(msg.error)));
        else res(msg.result);
      }
    });
  });
}

const cdp = await connect(wsUrl);
await cdp.send("Page.enable");
await cdp.send("Runtime.enable");
await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: MOCK });

async function shot(name, url, width, height, dsf = 1, action) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width, height, deviceScaleFactor: dsf, mobile: false,
  });
  await cdp.send("Page.navigate", { url: `http://127.0.0.1:${HTTP_PORT}${url}` });
  await new Promise((r) => setTimeout(r, 2600));
  if (action) {
    await action();
    await new Promise((r) => setTimeout(r, 900));
  }
  const { data } = await cdp.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  const out = path.join(OUT, `${name}.png`);
  await fs.mkdir(OUT, { recursive: true });
  await fs.writeFile(out, Buffer.from(data, "base64"));
  console.log("saved", out);
}

/** 通过文本点击页面元素（选择文本最短的匹配节点，避免点到外层容器） */
async function clickText(text) {
  const expr = `
    (() => {
      const want = ${JSON.stringify(text)};
      const nodes = [...document.querySelectorAll('button, a, div, span, label')];
      const matches = nodes.filter(n => n.textContent.replace(/\\s+/g, ' ').trim().includes(want));
      if (!matches.length) return 'not found';
      matches.sort((a, b) => a.textContent.length - b.textContent.length);
      const el = matches[0];
      const target = el.closest('button') || el.closest('a') || el;
      target.click();
      return 'clicked';
    })()
  `;
  for (let i = 0; i < 20; i++) {
    const { result } = await cdp.send("Runtime.evaluate", { expression: expr, returnByValue: true });
    if (result.value === "clicked") return;
    await new Promise((r) => setTimeout(r, 300));
  }
  const { result: dbg } = await cdp.send("Runtime.evaluate", {
    expression: "document.body.innerText.slice(0, 400)",
    returnByValue: true,
  });
  throw new Error(`点击失败: ${text} | 页面内容: ${dbg.value}`);
}

await shot("popup-sync", "/popup.html", 380, 560, 2);
await shot("popup-vault", "/popup.html", 380, 560, 2, () => clickText("密码保险箱 (4)"));
await shot("options", "/options.html", 1280, 800, 1);

// 自动填充浮层：注入真实 content script 后展开账号下拉
const CONTENT_JS = await fs.readFile(path.join(ROOT, "content-scripts/content.js"), "utf8");

// 收集页面控制台错误，便于定位注入失败
const pageErrors = [];
cdp.onEvent = (msg) => {
  if (msg.method === "Runtime.exceptionThrown") {
    pageErrors.push(msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text);
  }
};

await cdp.send("Emulation.setDeviceMetricsOverride", {
  width: 1280, height: 800, deviceScaleFactor: 1, mobile: false,
});
await cdp.send("Page.navigate", { url: `http://127.0.0.1:${HTTP_PORT}/autofill-demo.html` });
await new Promise((r) => setTimeout(r, 1200));

const injected = await cdp.send("Runtime.evaluate", {
  expression: CONTENT_JS,
  awaitPromise: true,
  returnByValue: true,
});
if (injected.exceptionDetails) {
  console.log("注入异常:", JSON.stringify(injected.exceptionDetails).slice(0, 600));
}
await new Promise((r) => setTimeout(r, 1500));

const badgeInfo = await cdp.send("Runtime.evaluate", {
  expression: `JSON.stringify({
    chromeRuntime: typeof (window.chrome && window.chrome.runtime),
    badges: document.querySelectorAll('.passmark-input-badge').length,
    menu: !!document.getElementById('passmark-autofill-menu')
  })`,
  returnByValue: true,
});
console.log("注入结果:", badgeInfo.result.value, pageErrors.slice(0, 3));

// 聚焦密码框以触发下拉（用真实鼠标事件，click() 不会触发 focus 监听）
const pwdRect = await cdp.send("Runtime.evaluate", {
  expression: `
    (() => {
      const el = document.querySelector('#password');
      const r = el.getBoundingClientRect();
      return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    })()
  `,
  returnByValue: true,
});
const { x, y } = JSON.parse(pwdRect.result.value);
await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
await new Promise((r) => setTimeout(r, 900));

const menuInfo = await cdp.send("Runtime.evaluate", {
  expression: `!!document.getElementById('passmark-autofill-menu')`,
  returnByValue: true,
});
console.log("下拉是否展开:", menuInfo.result.value);

const autoShot = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
await fs.writeFile(path.join(OUT, "autofill.png"), Buffer.from(autoShot.data, "base64"));
console.log("saved", path.join(OUT, "autofill.png"));

// 密码生成器：打开新增弹窗并展开生成器
await shot("popup-generator", "/popup.html", 380, 560, 2, async () => {
  await clickText("密码保险箱 (4)");
  await new Promise((r) => setTimeout(r, 700));
  await cdp.send("Runtime.evaluate", {
    expression: `document.querySelector('button[title="添加密码条目"]').click()`,
  });
  await new Promise((r) => setTimeout(r, 700));
  await clickText("生成强密码");
});

cdp.close();
server.close();
console.log("done");
