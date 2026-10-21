"""把 PRIVACY.md 渲染为可直接托管的 privacy.html"""
import os
import re
import html

BASE = r"E:\feiqi\passmark"
SRC = os.path.join(BASE, "PRIVACY.md")
OUT_DIR = os.path.join(BASE, "docs")
OUT = os.path.join(OUT_DIR, "privacy.html")

os.makedirs(OUT_DIR, exist_ok=True)
md = open(SRC, encoding="utf-8").read()


def inline(text):
    """处理行内标记：**粗体**、`代码`、链接、裸 URL"""
    text = html.escape(text)
    text = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"`(.+?)`", r"<code>\1</code>", text)
    text = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<a href="\2">\1</a>', text)
    text = re.sub(
        r"(?<![\"'>=])(https?://[^\s<]+)",
        r'<a href="\1">\1</a>',
        text,
    )
    return text


def convert(md_text):
    lines = md_text.split("\n")
    out = []
    i = 0
    in_table = False
    in_list = False

    def close_list():
        nonlocal in_list
        if in_list:
            out.append("</ul>")
            in_list = False

    def close_table():
        nonlocal in_table
        if in_table:
            out.append("</tbody></table>")
            in_table = False

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        # 表格
        if stripped.startswith("|") and stripped.endswith("|"):
            cells = [c.strip() for c in stripped.strip("|").split("|")]
            # 分隔行
            if all(re.fullmatch(r":?-{2,}:?", c) for c in cells):
                i += 1
                continue
            if not in_table:
                close_list()
                out.append('<table><thead><tr>')
                out.append("".join(f"<th>{inline(c)}</th>" for c in cells))
                out.append("</tr></thead><tbody>")
                in_table = True
            else:
                out.append(
                    "<tr>" + "".join(f"<td>{inline(c)}</td>" for c in cells) + "</tr>"
                )
            i += 1
            continue
        else:
            close_table()

        # 标题
        m = re.match(r"^(#{1,6})\s+(.*)$", stripped)
        if m:
            close_list()
            level = len(m.group(1))
            out.append(f"<h{level}>{inline(m.group(2))}</h{level}>")
            i += 1
            continue

        # 分隔线
        if re.fullmatch(r"-{3,}", stripped):
            close_list()
            out.append("<hr />")
            i += 1
            continue

        # 列表
        m = re.match(r"^[-*]\s+(.*)$", stripped)
        if m:
            if not in_list:
                out.append("<ul>")
                in_list = True
            out.append(f"<li>{inline(m.group(1))}</li>")
            i += 1
            continue

        # 空行
        if not stripped:
            close_list()
            i += 1
            continue

        # 段落
        close_list()
        out.append(f"<p>{inline(stripped)}</p>")
        i += 1

    close_list()
    close_table()
    return "\n".join(out)


body = convert(md)

page = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>PassMark 隐私政策 · Privacy Policy</title>
<style>
  :root {{
    --indigo: #4f46e5;
    --slate-900: #0f172a;
    --slate-700: #334155;
    --slate-600: #475569;
    --slate-200: #e2e8f0;
    --slate-50: #f8fafc;
  }}
  * {{ box-sizing: border-box; }}
  body {{
    margin: 0;
    padding: 0;
    background: var(--slate-50);
    color: var(--slate-700);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei",
      "PingFang SC", "Hiragino Sans GB", sans-serif;
    line-height: 1.75;
    font-size: 16px;
  }}
  .wrap {{
    max-width: 820px;
    margin: 0 auto;
    padding: 56px 24px 96px;
  }}
  header {{
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 40px;
    padding-bottom: 28px;
    border-bottom: 1px solid var(--slate-200);
  }}
  header img {{ width: 48px; height: 48px; border-radius: 12px; }}
  header .name {{ font-size: 20px; font-weight: 700; color: var(--slate-900); }}
  header .sub {{ font-size: 13px; color: #94a3b8; }}
  h1 {{ font-size: 30px; color: var(--slate-900); margin: 0 0 8px; letter-spacing: -0.02em; }}
  h2 {{
    font-size: 21px;
    color: var(--slate-900);
    margin: 44px 0 14px;
    padding-top: 8px;
    letter-spacing: -0.01em;
  }}
  h3 {{ font-size: 17px; color: var(--slate-900); margin: 28px 0 10px; }}
  p {{ margin: 0 0 14px; }}
  ul {{ margin: 0 0 16px; padding-left: 22px; }}
  li {{ margin-bottom: 7px; }}
  a {{ color: var(--indigo); text-decoration: none; }}
  a:hover {{ text-decoration: underline; }}
  code {{
    background: #eef2ff;
    color: #4338ca;
    padding: 1px 6px;
    border-radius: 4px;
    font-size: 0.9em;
    font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
  }}
  table {{
    width: 100%;
    border-collapse: collapse;
    margin: 18px 0 24px;
    font-size: 14px;
    background: #fff;
    border: 1px solid var(--slate-200);
    border-radius: 10px;
    overflow: hidden;
  }}
  th {{
    background: #f1f5f9;
    text-align: left;
    padding: 11px 14px;
    font-weight: 600;
    color: var(--slate-900);
    border-bottom: 1px solid var(--slate-200);
  }}
  td {{
    padding: 11px 14px;
    border-bottom: 1px solid #f1f5f9;
    vertical-align: top;
  }}
  tr:last-child td {{ border-bottom: none; }}
  hr {{
    border: none;
    border-top: 1px solid var(--slate-200);
    margin: 48px 0;
  }}
  .lang-switch {{
    display: inline-flex;
    gap: 8px;
    margin-bottom: 32px;
  }}
  .lang-switch a {{
    padding: 6px 14px;
    border-radius: 999px;
    background: #eef2ff;
    font-size: 13px;
    font-weight: 600;
  }}
  footer {{
    margin-top: 64px;
    padding-top: 24px;
    border-top: 1px solid var(--slate-200);
    font-size: 13px;
    color: #94a3b8;
  }}
  @media (max-width: 640px) {{
    .wrap {{ padding: 32px 18px 64px; }}
    h1 {{ font-size: 24px; }}
    h2 {{ font-size: 19px; }}
    table {{ font-size: 13px; }}
  }}
</style>
</head>
<body>
  <div class="wrap">
    <header>
      <img src="https://raw.githubusercontent.com/IceCoder1994/passmark/main/public/icon-128.png" alt="PassMark" />
      <div>
        <div class="name">PassMark 秘签</div>
        <div class="sub">WebDAV 端到端加密同步扩展</div>
      </div>
    </header>
{body}
    <footer>
      PassMark · <a href="https://github.com/IceCoder1994/passmark">GitHub 仓库</a> ·
      <a href="https://github.com/IceCoder1994/passmark/issues">问题反馈</a>
    </footer>
  </div>
</body>
</html>
"""

open(OUT, "w", encoding="utf-8").write(page)
print("saved", OUT)
