/**
 * 用 Edge 渲染 public/icon.svg，输出 300x300 与 600x600 的 PNG。
 * 浏览器渲染 SVG 是最精确的方式，避免任何几何近似。
 */
const { execFileSync } = await import("node:child_process");
const http = await import("node:http");
const fs = await import("node:fs/promises");
const path = await import("node:path");

const BASE = "E:/feiqi/passmark";
const SVG_PATH = path.join(BASE, "public/icon.svg");
const ASSETS = path.join(BASE, "store/assets");
const PROFILE = "C:/Users/admin/AppData/Local/Temp/opencode/pm-logo-profile";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const HTTP_PORT = 8712;
const CDP_PORT = 9335;

await fs.mkdir(ASSETS, { recursive: true });

const svg = await fs.readFile(SVG_PATH, "utf8");
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "image/svg+xml; charset=utf-8" });
  res.end(svg);
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

async function renderSvg(size, outName) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: size, height: size, deviceScaleFactor: 1, mobile: false,
  });
  // 用透明背景的 HTML 承载 SVG，确保输出带 alpha
  await cdp.send("Page.navigate", { url: `http://127.0.0.1:${HTTP_PORT}/icon.svg` });
  await new Promise((r) => setTimeout(r, 1500));

  const { data } = await cdp.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
    fromSurface: true,
  });
  const out = path.join(ASSETS, outName);
  await fs.writeFile(out, Buffer.from(data, "base64"));
  console.log("saved", out);
}

// 直接用 SVG 作为文档时，浏览器会加白底；改用 HTML 包裹以保留透明
const html = `<!DOCTYPE html><html><head><style>
  html,body{margin:0;padding:0;background:transparent;}
  img{display:block;width:100vw;height:100vh;}
</style></head><body><img src="/icon.svg"></body></html>`;

const server2 = http.createServer((req, res) => {
  if (req.url.startsWith("/page.html")) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
    return;
  }
  res.writeHead(200, { "Content-Type": "image/svg+xml; charset=utf-8" });
  res.end(svg);
});
server.close();
await new Promise((r) => server2.listen(HTTP_PORT, "127.0.0.1", r));

async function renderHtml(size, outName) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: size, height: size, deviceScaleFactor: 1, mobile: false,
  });
  // 强制透明背景，否则截图为白底
  await cdp.send("Emulation.setDefaultBackgroundColorOverride", {
    color: { r: 0, g: 0, b: 0, a: 0 },
  });
  await cdp.send("Page.navigate", { url: `http://127.0.0.1:${HTTP_PORT}/page.html` });
  await new Promise((r) => setTimeout(r, 1500));
  const { data } = await cdp.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  const out = path.join(ASSETS, outName);
  await fs.writeFile(out, Buffer.from(data, "base64"));
  console.log("saved", out);
}

await renderHtml(300, "logo-300.png");
await renderHtml(600, "_logo-600.png");
cdp.close();
server2.close();
console.log("done");
