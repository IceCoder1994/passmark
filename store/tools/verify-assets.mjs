// 校验商店素材规格，并渲染隐私政策页截图
const { execFileSync } = await import("node:child_process");
const http = await import("node:http");
const fs = await import("node:fs/promises");
const path = await import("node:path");

const BASE = "E:/feiqi/passmark";
const ASSETS = path.join(BASE, "store/assets");
const DOCS = path.join(BASE, "docs");
const PROFILE = "C:/Users/admin/AppData/Local/Temp/opencode/pm-verify-profile";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const HTTP_PORT = 8713;
const CDP_PORT = 9336;

// ---------- 1. 用 PIL 校验尺寸 ----------
const py = `
import os, json
from PIL import Image
base = r"${ASSETS.replace(/\\/g, "\\\\")}"
expect = {
  "logo-300.png": (300, 300),
  "promo-small-440x280.png": (440, 280),
  "promo-large-1400x560.png": (1400, 560),
  "01-sync.png": (1280, 800),
  "02-vault.png": (1280, 800),
  "03-autofill.png": (1280, 800),
  "04-settings.png": (1280, 800),
}
res = []
for name, want in expect.items():
    p = os.path.join(base, name)
    if not os.path.exists(p):
        res.append({"file": name, "error": "missing"}); continue
    im = Image.open(p)
    size = im.size
    mode = im.mode
    kb = round(os.path.getsize(p) / 1024, 1)
    res.append({"file": name, "size": list(size), "want": list(want),
                "ok": size == want, "mode": mode, "kb": kb})
print(json.dumps(res, ensure_ascii=False))
`;
const { execFileSync: execPy } = await import("node:child_process");
const pyOut = execPy("python", ["-c", py], { encoding: "utf8" });
const rows = JSON.parse(pyOut);
console.log("=== 素材规格校验 ===");
for (const r of rows) {
  if (r.error) {
    console.log(`✗ ${r.file}: ${r.error}`);
  } else {
    console.log(
      `${r.ok ? "✓" : "✗"} ${r.file}  ${r.size[0]}x${r.size[1]} (要求 ${r.want[0]}x${r.want[1]})  ${r.kb}KB  ${r.mode}`
    );
  }
}

// ---------- 2. 启动 Edge 渲染隐私页 ----------
const server = http.createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent(req.url.split("?")[0]);
    const file = path.join(DOCS, urlPath === "/" ? "/privacy.html" : urlPath);
    const data = await fs.readFile(file);
    const ext = path.extname(file);
    const mime = ext === ".png" ? "image/png" : "text/html; charset=utf-8";
    res.writeHead(200, { "Content-Type": mime });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
});
await new Promise((r) => server.listen(HTTP_PORT, "127.0.0.1", r));

await fs.rm(PROFILE, { recursive: true, force: true });
const args = [
  `--remote-debugging-port=${CDP_PORT}`,
  `--user-data-dir=${PROFILE}`,
  "--no-first-run",
  "--no-default-browser-check",
  "--hide-scrollbars",
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
await cdp.send("Emulation.setDeviceMetricsOverride", {
  width: 1000, height: 1400, deviceScaleFactor: 1, mobile: false,
});
await cdp.send("Page.navigate", { url: `http://127.0.0.1:${HTTP_PORT}/privacy.html` });
await new Promise((r) => setTimeout(r, 1800));

const check = await cdp.send("Runtime.evaluate", {
  expression: `JSON.stringify({
    title: document.title,
    tables: document.querySelectorAll('table').length,
    h2: [...document.querySelectorAll('h2')].map(h => h.textContent).slice(0, 6),
    imgOk: (() => { const i = document.querySelector('header img'); return i && i.naturalWidth > 0; })()
  })`,
  returnByValue: true,
});
console.log("\n=== 隐私政策页 ===");
console.log(check.result.value);

const shot = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
await fs.writeFile(path.join(BASE, "store/raw/privacy-page.png"), Buffer.from(shot.data, "base64"));
console.log("saved store/raw/privacy-page.png");

cdp.close();
server.close();
