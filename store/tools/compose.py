"""
商店素材合成脚本
1. 将原始截图放入统一的 1280x800 画布，加左侧说明文字与右侧界面预览
2. 生成 300x300 扩展 Logo（由 icon.svg 重绘）
3. 生成 440x280 小促销图与 1400x560 大促销图
"""
from PIL import Image, ImageDraw, ImageFont
import os

BASE = r"E:\feiqi\passmark"
RAW = os.path.join(BASE, "store", "raw")
OUT = os.path.join(BASE, "store", "assets")
os.makedirs(OUT, exist_ok=True)

W, H = 1280, 800

# 品牌色
INDIGO = (79, 70, 229)
INDIGO_DARK = (49, 46, 129)
SLATE_900 = (15, 23, 42)
SLATE_600 = (71, 85, 105)
SLATE_400 = (148, 163, 184)
WHITE = (255, 255, 255)


def load_font(size, bold=False):
    """按优先级查找可用的中文字体"""
    candidates_bold = [
        r"C:\Windows\Fonts\msyhbd.ttc",
        r"C:\Windows\Fonts\msyhbd.ttf",
        r"C:\Windows\Fonts\segoeuib.ttf",
    ]
    candidates_regular = [
        r"C:\Windows\Fonts\msyh.ttc",
        r"C:\Windows\Fonts\msyh.ttf",
        r"C:\Windows\Fonts\segoeui.ttf",
    ]
    for path in (candidates_bold if bold else candidates_regular):
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    return ImageFont.load_default()


def gradient_bg(width, height, top, bottom):
    """生成垂直渐变背景"""
    img = Image.new("RGB", (width, height), top)
    draw = ImageDraw.Draw(img)
    for y in range(height):
        t = y / max(1, height - 1)
        color = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
        draw.line([(0, y), (width, y)], fill=color)
    return img


def rounded_shadow(img, box, radius, shadow_offset=(0, 18), shadow_blur=40, shadow_alpha=60):
    """在图片上绘制柔和阴影"""
    shadow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    sdraw = ImageDraw.Draw(shadow)
    x0, y0, x1, y1 = box
    ox, oy = shadow_offset
    sdraw.rounded_rectangle(
        [x0 + ox, y0 + oy, x1 + ox, y1 + oy],
        radius=radius,
        fill=(15, 23, 42, shadow_alpha),
    )
    # 简单模糊：缩小再放大
    small = shadow.resize((img.width // 8, img.height // 8), Image.LANCZOS)
    blurred = small.resize(img.size, Image.LANCZOS)
    img.alpha_composite(blurred)


def wrap_text(draw, text, font, max_width):
    """按像素宽度对中文文本做逐字换行"""
    lines = []
    current = ""
    for ch in text:
        trial = current + ch
        tb = draw.textbbox((0, 0), trial, font=font)
        if tb[2] - tb[0] > max_width and current:
            lines.append(current)
            current = ch
        else:
            current = trial
    if current:
        lines.append(current)
    return lines


def draw_tag(canvas, draw, text_x, text_y, text="PassMark 秘签"):
    """绘制淡紫色圆角标签（用独立图层实现半透明）"""
    tag_font = load_font(20, bold=True)
    tb = draw.textbbox((0, 0), text, font=tag_font)
    tw, th = tb[2] - tb[0], tb[3] - tb[1]
    tag_box = Image.new("RGBA", (tw + 34, th + 24), (0, 0, 0, 0))
    ImageDraw.Draw(tag_box).rounded_rectangle(
        [0, 0, tw + 33, th + 23], radius=16, fill=(79, 70, 229, 28)
    )
    canvas.alpha_composite(tag_box, (text_x, text_y))
    draw.text((text_x + 17, text_y + 10), text, font=tag_font, fill=INDIGO)


def crop_bottom_blank(img, tolerance=6):
    """裁掉底部与最后一行像素相同的空白区域"""
    w, h = img.size
    px = img.load()
    # 取底部中间区域作为参考色
    ref = px[w // 2, h - 1]
    last = h - 1
    for y in range(h - 1, 0, -1):
        row = px[w // 2, y]
        if (
            abs(row[0] - ref[0]) > tolerance
            or abs(row[1] - ref[1]) > tolerance
            or abs(row[2] - ref[2]) > tolerance
        ):
            last = y
            break
    # 保留一点底部内边距
    return img.crop((0, 0, w, min(h, last + 24)))


def make_screenshot(raw_name, out_name, title, subtitle, points, layout="right"):
    """生成一张 1280x800 的商店截图"""
    canvas = gradient_bg(W, H, (248, 250, 252), (226, 232, 240))
    canvas = canvas.convert("RGBA")

    # 顶部装饰光斑
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gdraw = ImageDraw.Draw(glow)
    gdraw.ellipse([W - 520, -260, W + 180, 380], fill=(99, 102, 241, 38))
    gdraw.ellipse([-220, H - 300, 320, H + 200], fill=(139, 92, 246, 28))
    canvas.alpha_composite(glow)

    draw = ImageDraw.Draw(canvas)

    # 左侧文字区
    text_x = 96
    text_y = 210

    # 小标签
    draw_tag(canvas, draw, text_x, text_y - 58)

    # 主标题（按可用宽度自动换行，避免被右侧预览遮挡）
    # wide 布局的预览宽度 680+20，popup 布局约 420，故预留不同文字宽度
    max_text_w = 520 if layout == "wide" else 560
    title_font = load_font(52, bold=True)
    title_lines = wrap_text(draw, title, title_font, max_text_w)
    ty = text_y
    for line in title_lines:
        draw.text((text_x, ty), line, font=title_font, fill=SLATE_900)
        ty += 64

    # 副标题
    sub_font = load_font(23)
    sub_y = ty + 14
    for line in subtitle.split("\n"):
        draw.text((text_x, sub_y), line, font=sub_font, fill=SLATE_600)
        sub_y += 38

    # 要点列表
    point_font = load_font(21)
    py = sub_y + 34
    for p in points:
        # 圆点
        draw.ellipse([text_x, py + 8, text_x + 10, py + 18], fill=INDIGO)
        draw.text((text_x + 24, py), p, font=point_font, fill=SLATE_600)
        py += 44

    # 右侧界面预览
    raw = Image.open(os.path.join(RAW, raw_name)).convert("RGBA")
    raw = crop_bottom_blank(raw)

    if layout == "popup":
        # 手机/弹窗比例：缩放到高度 620，加白色圆角外框
        target_h = 620
        ratio = target_h / raw.height
        new_w = int(raw.width * ratio)
        raw = raw.resize((new_w, target_h), Image.LANCZOS)

        pad = 14
        box_w = new_w + pad * 2
        box_h = target_h + pad * 2
        box_x = W - box_w - 118
        box_y = (H - box_h) // 2

        rounded_shadow(canvas, (box_x, box_y, box_x + box_w, box_y + box_h), 26)

        card = Image.new("RGBA", (box_w, box_h), (0, 0, 0, 0))
        cdraw = ImageDraw.Draw(card)
        cdraw.rounded_rectangle([0, 0, box_w - 1, box_h - 1], radius=26, fill=WHITE)
        card.alpha_composite(raw, (pad, pad))

        # 圆角遮罩
        mask = Image.new("L", (box_w, box_h), 0)
        mdraw = ImageDraw.Draw(mask)
        mdraw.rounded_rectangle([0, 0, box_w - 1, box_h - 1], radius=26, fill=255)
        canvas.paste(card, (box_x, box_y), mask)

        # 描边
        draw.rounded_rectangle(
            [box_x, box_y, box_x + box_w, box_y + box_h],
            radius=26,
            outline=(203, 213, 225),
            width=2,
        )

    else:
        # 宽屏界面：缩放到宽度 680，放在右侧，避免遮挡左侧文字
        target_w = 680
        ratio = target_w / raw.width
        new_h = int(raw.height * ratio)
        raw = raw.resize((target_w, new_h), Image.LANCZOS)

        pad = 10
        box_w = target_w + pad * 2
        box_h = new_h + pad * 2
        box_x = W - box_w - 56
        box_y = (H - box_h) // 2

        rounded_shadow(canvas, (box_x, box_y, box_x + box_w, box_y + box_h), 18)

        card = Image.new("RGBA", (box_w, box_h), (0, 0, 0, 0))
        cdraw = ImageDraw.Draw(card)
        cdraw.rounded_rectangle([0, 0, box_w - 1, box_h - 1], radius=18, fill=WHITE)
        card.alpha_composite(raw, (pad, pad))

        mask = Image.new("L", (box_w, box_h), 0)
        mdraw = ImageDraw.Draw(mask)
        mdraw.rounded_rectangle([0, 0, box_w - 1, box_h - 1], radius=18, fill=255)
        canvas.paste(card, (box_x, box_y), mask)

        draw.rounded_rectangle(
            [box_x, box_y, box_x + box_w, box_y + box_h],
            radius=18,
            outline=(203, 213, 225),
            width=2,
        )

    final = canvas.convert("RGB")
    final.save(os.path.join(OUT, out_name), "PNG")
    print("saved", out_name)


def make_autofill(out_name, title, subtitle, points):
    """自动填充场景：整幅展示演示页 + 浮层，左侧叠加说明"""
    canvas = gradient_bg(W, H, (248, 250, 252), (226, 232, 240)).convert("RGBA")
    draw = ImageDraw.Draw(canvas)

    raw = Image.open(os.path.join(RAW, "autofill.png")).convert("RGBA")
    # 裁掉左右两侧多余深色，聚焦卡片区域
    raw = raw.crop((300, 100, 1000, 740))
    ratio = 620 / raw.height
    raw = raw.resize((int(raw.width * ratio), 620), Image.LANCZOS)

    pad = 12
    box_w = raw.width + pad * 2
    box_h = raw.height + pad * 2
    box_x = W - box_w - 96
    box_y = (H - box_h) // 2

    rounded_shadow(canvas, (box_x, box_y, box_x + box_w, box_y + box_h), 24)

    card = Image.new("RGBA", (box_w, box_h), (0, 0, 0, 0))
    cdraw = ImageDraw.Draw(card)
    cdraw.rounded_rectangle([0, 0, box_w - 1, box_h - 1], radius=24, fill=(30, 27, 75))
    card.alpha_composite(raw, (pad, pad))

    mask = Image.new("L", (box_w, box_h), 0)
    mdraw = ImageDraw.Draw(mask)
    mdraw.rounded_rectangle([0, 0, box_w - 1, box_h - 1], radius=24, fill=255)
    canvas.paste(card, (box_x, box_y), mask)

    draw.rounded_rectangle(
        [box_x, box_y, box_x + box_w, box_y + box_h],
        radius=24,
        outline=(129, 140, 248),
        width=2,
    )

    text_x, text_y = 96, 220
    draw_tag(canvas, draw, text_x, text_y - 58)

    title_font = load_font(52, bold=True)
    draw.text((text_x, text_y), title, font=title_font, fill=SLATE_900)

    sub_font = load_font(23)
    sub_y = text_y + 78
    for line in subtitle.split("\n"):
        draw.text((text_x, sub_y), line, font=sub_font, fill=SLATE_600)
        sub_y += 38

    point_font = load_font(21)
    py = sub_y + 34
    for p in points:
        draw.ellipse([text_x, py + 8, text_x + 10, py + 18], fill=INDIGO)
        draw.text((text_x + 24, py), p, font=point_font, fill=SLATE_600)
        py += 44

    canvas.convert("RGB").save(os.path.join(OUT, out_name), "PNG")
    print("saved", out_name)


def draw_logo(size):
    """直接使用 Edge 渲染好的 _logo-600.png（与 icon.svg 完全一致）"""
    src = Image.open(os.path.join(OUT, "_logo-600.png")).convert("RGBA")
    return src.resize((size, size), Image.LANCZOS)


def make_promo(width, height, out_name, big=False):
    """促销图"""
    img = gradient_bg(width, height, INDIGO_DARK, (67, 56, 202)).convert("RGBA")
    draw = ImageDraw.Draw(img)

    # 光晕
    glow = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    gdraw = ImageDraw.Draw(glow)
    gdraw.ellipse(
        [width * 0.55, -height * 0.5, width * 1.25, height * 0.85],
        fill=(139, 92, 246, 60),
    )
    img.alpha_composite(glow)

    # 小图：Logo 在上、文字在下（440x280 横向空间不足，改为上下排布）
    if not big:
        logo_size = int(height * 0.34)
        logo = draw_logo(logo_size)
        lx = (width - logo_size) // 2
        ly = int(height * 0.12)
        img.alpha_composite(logo, (lx, ly))

        name_font = load_font(int(height * 0.135), bold=True)
        nb = draw.textbbox((0, 0), "PassMark", font=name_font)
        nw = nb[2] - nb[0]
        ny = ly + logo_size + int(height * 0.05)
        draw.text(((width - nw) // 2, ny), "PassMark", font=name_font, fill=WHITE)

        tag_font = load_font(int(height * 0.062))
        tag = "WebDAV 端到端加密同步"
        tb = draw.textbbox((0, 0), tag, font=tag_font)
        tw = tb[2] - tb[0]
        draw.text(
            ((width - tw) // 2, ny + (nb[3] - nb[1]) + int(height * 0.045)),
            tag,
            font=tag_font,
            fill=(199, 210, 254),
        )

        img.convert("RGB").save(os.path.join(OUT, out_name), "PNG")
        print("saved", out_name)
        return

    # 大图：Logo 左、文字右
    logo_size = int(height * 0.40)
    logo = draw_logo(logo_size)
    lx = int(width * 0.075)
    ly = (height - logo_size) // 2
    img.alpha_composite(logo, (lx, ly))

    text_x = lx + logo_size + int(width * 0.035)

    name_font = load_font(int(height * 0.155), bold=True)
    nb = draw.textbbox((0, 0), "PassMark", font=name_font)
    name_h = nb[3] - nb[1]
    # 整块文字垂直居中
    tag_font = load_font(int(height * 0.062))
    sub_font = load_font(int(height * 0.052))
    total_h = name_h + int(height * 0.045) + int(height * 0.062) + int(height * 0.05) + int(height * 0.052)
    ty = (height - total_h) // 2 - nb[1]

    draw.text((text_x, ty), "PassMark", font=name_font, fill=WHITE)
    ty += name_h + int(height * 0.045)

    draw.text((text_x, ty), "WebDAV 端到端加密同步", font=tag_font, fill=(199, 210, 254))
    ty += int(height * 0.062) + int(height * 0.03)

    draw.text((text_x, ty), "收藏夹 · 密码 · 完全自托管", font=sub_font, fill=(165, 180, 252))

    img.convert("RGB").save(os.path.join(OUT, out_name), "PNG")
    print("saved", out_name)


# ---------- 生成 4 张 1280x800 商店截图 ----------
make_screenshot(
    "popup-sync.png",
    "01-sync.png",
    "收藏夹双向同步",
    "WebDAV 自托管 · 端到端加密\n防覆盖的智能双向合并策略",
    [
        "监听收藏夹变动，5 秒防抖自动推送",
        "支持 5–60 分钟后台定时同步",
        "AES-256-GCM 密文，云端不可读",
    ],
    layout="popup",
)

make_screenshot(
    "popup-vault.png",
    "02-vault.png",
    "加密密码保险箱",
    "独立于浏览器的密码库\n支持多域名匹配与一键复制",
    [
        "自动识别当前网站并匹配账号",
        "内置强密码生成器",
        "支持 CSV 批量导入",
    ],
    layout="popup",
)

make_autofill(
    "03-autofill.png",
    "网页一键填充",
    "登录表单自动识别\n悬浮钥匙角标即点即填",
    [
        "自动区分用户名与密码字段",
        "兼容 React / Vue 等前端框架",
        "支持跨域 iframe 内的登录框",
    ],
)

make_screenshot(
    "options.png",
    "04-settings.png",
    "完整的设置中心",
    "WebDAV、主密码、同步策略\n全部集中在一页管理",
    [
        "连接测试与云端保险箱自动识别",
        "可选「记住本设备」，默认关闭",
        "多设备共享同一份加密数据",
    ],
    layout="wide",
)

# ---------- Logo 与促销图 ----------
draw_logo(300).save(os.path.join(OUT, "logo-300.png"), "PNG")
print("saved logo-300.png")

make_promo(440, 280, "promo-small-440x280.png")
make_promo(1400, 560, "promo-large-1400x560.png", big=True)

print("\n全部完成 ->", OUT)
