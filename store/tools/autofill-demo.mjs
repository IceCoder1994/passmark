/**
 * 自动填充浮层演示页
 * 用真实的登录表单结构 + 真实 content script 注入，展示钥匙角标与下拉账号列表。
 */
export const AUTOFILL_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
    background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 55%, #312e81 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 40px 24px;
  }
  .card {
    width: 100%;
    max-width: 420px;
    background: #ffffff;
    border-radius: 18px;
    padding: 36px 32px 30px;
    box-shadow: 0 30px 60px -12px rgba(0, 0, 0, 0.45);
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 26px;
  }
  .brand-mark {
    width: 38px; height: 38px; border-radius: 10px;
    background: linear-gradient(135deg, #4f46e5, #7c3aed);
    display: flex; align-items: center; justify-content: center;
    color: #fff; font-weight: 700; font-size: 18px;
  }
  .brand-name { font-size: 17px; font-weight: 700; color: #0f172a; }
  h1 { font-size: 22px; margin: 0 0 6px; color: #0f172a; letter-spacing: -0.01em; }
  .sub { font-size: 13px; color: #64748b; margin: 0 0 24px; }
  label { display: block; font-size: 12px; font-weight: 600; color: #334155; margin-bottom: 6px; }
  .field { margin-bottom: 16px; }
  input[type="text"], input[type="password"] {
    width: 100%; padding: 11px 13px; font-size: 14px;
    border: 1px solid #cbd5e1; border-radius: 9px; background: #f8fafc;
    color: #0f172a; outline: none;
  }
  input[type="text"]:focus, input[type="password"]:focus {
    border-color: #4f46e5; background: #fff;
    box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.12);
  }
  .row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; font-size: 12px; }
  .row a { color: #4f46e5; text-decoration: none; }
  .row label { margin: 0; font-weight: 400; color: #475569; }
  button[type="submit"] {
    width: 100%; padding: 12px; font-size: 14px; font-weight: 600;
    color: #fff; background: #4f46e5; border: none; border-radius: 9px; cursor: pointer;
  }
  .hint {
    margin-top: 22px; padding: 10px 12px; font-size: 11px; line-height: 1.6;
    color: #64748b; background: #f1f5f9; border-radius: 8px;
  }
  .hint b { color: #4f46e5; }
</style>
</head>
<body>
  <div class="card">
    <div class="brand">
      <div class="brand-mark">P</div>
      <div class="brand-name">PassBoard</div>
    </div>
    <h1>登录你的工作空间</h1>
    <p class="sub">使用团队账号继续访问看板与文档</p>

    <form id="login-form" autocomplete="on">
      <div class="field">
        <label for="username">邮箱地址</label>
        <input id="username" name="username" type="email" autocomplete="username" placeholder="you@company.com" />
      </div>
      <div class="field">
        <label for="password">密码</label>
        <input id="password" name="password" type="password" autocomplete="current-password" placeholder="••••••••••••" />
      </div>
      <div class="row">
        <label><input type="checkbox" /> 记住我</label>
        <a href="#">忘记密码？</a>
      </div>
      <button type="submit">登录</button>
    </form>

    <div class="hint">
      <b>演示页</b>：此页面用于展示 PassMark 在真实登录表单上注入的钥匙角标与一键填充浮层。
    </div>
  </div>
</body>
</html>`;
