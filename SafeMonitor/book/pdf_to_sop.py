# -*- coding: utf-8 -*-
"""
把手册 PDF 的指定章转换成网页用的数据文件（SOP/data/sop-NN-章节名.js）。

为什么改用 PDF：PDF 里带**完整书签**（每节都有「编号+标题+页码」），
标题不用再靠正则猜；版式模式取字还能保留**表格的列间距**和**行首的项目符号**。

做法：
  1) 用书签定出「本章有哪些节、每节的层级和起始页」；
  2) 逐页取字（layout 模式），删掉页眉（B757/767 标准操作程序）、页脚（…2.1-1）和本章目录页；
  3) 标签里的**表格**另外按 PDF 画出来的框线还原（横线=行边界、竖线=列边界，
     中间缺一段线就是合并单元格），格子里被硬换行的句子会拼回去，跨页续表合到一张表；
  4) 正文按书签切成小节；识别项目符号（•）、编号清单（（a）/1)/①/1. ）、
     点线行（标题……值），其余按段落拼回来（句尾没写完就接下一行）；
      PDF 里整行加粗的短标题会用 <h4> 标出来。

调试：设环境变量 SOP_TRACE=1 会把逐行的判定打到 stderr。

用法：python pdf_to_sop.py 1        # 只生成第 1 章
      python pdf_to_sop.py 1 2 5    # 生成第 1、2、5 章
"""
import difflib
import html as htmllib
import io
import json
import logging
import os
import re
import sys

from pypdf import PdfReader
from pypdf.generic import ContentStream

logging.getLogger("pypdf").setLevel(logging.ERROR)   # 少啰嗦：旋转文字的提示不用刷屏

HERE = os.path.dirname(os.path.abspath(__file__))

# 一本手册一行：代号 → PDF 文件名 / 网页目录（相对本脚本）/ 数据文件前缀
MANUALS = {
    "sop": {"pdf": "YTO-01-27-2 B757&B767标准操作程序（R05-02试运行） (1).pdf",
            "dir": "SOP", "name": "B757/767 标准操作程序 R05"},
    "train": {"pdf": "757&767 飞行机组训练手册.pdf",
              "dir": "训练手册", "name": "B757/767 飞行机组训练手册"},
    "afm": {"pdf": "YTO-01-04-2 B757-200ER飞机飞行手册 (R00-03）.pdf",
            "dir": "飞行手册", "name": "B757-200ER 飞机飞行手册 R00-03",
            # 这本的「章」是：第N 节 / 附录N / *补充手册*（封面、第0章、目录那些不算）
            "chapre": r"^(第\s*\d+\s*节-|附录\s*\d+|.*补充手册.*)",
            "navfmt": "%(title)s"},
    # 飞行机组操作手册（FCOM）分两册：V1 = 限制/正常/补充/性能，V2 = 按 ATA 章分系统说明
    "fcom1": {"pdf": "YTO-01-05-02 B757-200 飞行机组操作手册 V1(R02-10）.pdf",
              "dir": "操作手册V1", "name": "B757-200 飞行机组操作手册 V1 R02-10",
              "chapre": r"^(L章|NP章|SP章|PI-|改装厂补充手册)",
              "navfmt": "%(title)s",
              # 页眉页脚不是按内容写的：页顶 3 行 / 页底 4 行里重复出现的（运行页眉、页码、
              # 版权行、「有意留白」）第二次起丢掉；带 .TOC. / ModID 的整页是目录，整页不要
              "zones": (3, 4), "droppage": r"\.TOC\.|ModID|有效清单|有效页清单|APPROVAL MANUAL LIST",
              # 页脚一律丢：每页都有这些字样，位置又时上时下，所以按字样认
              "droplines": (r"D632N001-56YTW", r"^\s*\*?\s*=\s*Revised", r"Boeing Proprietary",
                            r"信息归\s*PRECISION\s*CONVERSIONS\s*LLC\s*所有", r"^\s*页码\s",
                            r"REVISION:\s*\w+\s*Page\s*\d+\s*of\s*\d+",
                            r"^\s*\d{4}\s*[-–]\s*\d{1,2}\s*[-–]\s*\d{1,2}\s*$")},
    "fcom2": {"pdf": "YTO-01-05-02 B757-200 飞行机组操作手册 V2(R02-10）.pdf",
              "dir": "操作手册V2", "name": "B757-200 飞行机组操作手册 V2 R02-10",
              "chapre": r"^\d{1,2}\s*[.、]?\s*\S",
              "navfmt": "%(title)s",
              "zones": (3, 4), "droppage": r"\.TOC\.|ModID|有效清单|有效页清单|APPROVAL MANUAL LIST",
              "droplines": (r"D632N001-56YTW", r"^\s*\*?\s*=\s*Revised", r"Boeing Proprietary")},
    "oa": {"pdf": "Operations Manual（R05-04）.pdf",
           "dir": "运行手册", "name": "B757/767 运行手册 R05-04",
           # 「章」就是正正规规的「第N章」；只要把第0章（概述）和「第17章（有意留空）」排除掉
           "chapre": r"^第\s*(?!0\s*章)[1-9]\d*\s*章(?!\s*[（(]\s*有意留空)",
           "navfmt": "%(title)s",
           # 页顶 4 行是「页码 / 运行手册 日期 / 版本号」三行小表头，页码每页不同，
           # 单靠重复消重拿不下来，所以再加按字样丢；页底 2 行是运行章名
           "zones": (4, 2),
           "droplines": (r"^\s*(运行手册\s*)?(页码|日期|版本号)\s", r"^\s*运行手册\s*$")},
}

# 下面三样由 main() 按手册配置填（不配就是空的，等于原来的行为）
DROP_LINE = ()      # 额外要丢的行（正则）
DROP_PAGE = ()      # 整页丢掉（目录页 / 有效页清单页）（正则）
ZONES = None        # (页顶行数, 页底行数)：这几行里重复出现的页眉页脚，第二次起丢

RE_RUNHEAD = re.compile(r"^\s*B757\s*/\s*767\s*标准操作程序\s*$")
RE_FOOT = re.compile(r"^\s*\d{4}\s*年.*\d+(?:\.\d+)?(?:\.TOC)?-\d+\s*$")
RE_TOC_FOOT = re.compile(r"^\s*\d{4}\s*年.*\.?TOC[.\-–]?\d*\s*$")
RE_CHAPTER_TITLE = re.compile(r"^第\s*(\d+)\s*章")
RE_NUM_TITLE = re.compile(r"^(\d+(?:\.\d+)*)\.?\s*(.+)$")
RE_DOTROW = re.compile(r"^(.*?)\s*[.\u2026]{4,}\s*(\S.*)$")

BULLETS = ("\u2022\u00b7\u25cf\u25cb\u25a0\u25a1\u2023\u2043\u25aa\u25ab\u25c6\u25c7\u27a4"
           "\uf09f\uf06e\uf075\uf076\uf0a7\uf0a8\uf0b7\uf0d8\uf0fc")
RE_BULLET = re.compile("^[%s]\\s*" % BULLETS)
RE_PAREN_LET = re.compile(r"^[（(]\s*([a-zA-Z])\s*[）)]\s*")
RE_PAREN_NUM = re.compile(r"^[（(]\s*(\d+)\s*[）)]\s*")
RE_NUM_PAREN = re.compile(r"^\s*(\d+)\s*[)）]\s*")
RE_NUM_DOT = re.compile(r"^\s*(\d{1,2})[.．](?!\d)\s*(?=[\u4e00-\u9fa5A-Za-z（(“《])")
RE_CIRCLED = re.compile(r"^([①-⑳])\s*")
RE_KEEP_TAIL = re.compile(r"[\u4e00-\u9fa5A-Za-z0-9,，、;；（(《“\[\(\)\]\-–—]$")   # 行尾这些字 = 话没说完

TAG = re.compile(r"<[^>]+>")


def esc(s):
    return (s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def squeeze(s):
    """去掉 PDF 排版撑出来的多余空格：中文之间不留空，连续空格并成一个"""
    s = re.sub(r"[ \t\u3000]{2,}", " ", s).strip()
    s = re.sub(r"(?<=[\u4e00-\u9fa5\s]) (?=[\u4e00-\u9fa5])", "", s)
    s = re.sub(r"(?<=[\u4e00-\u9fa5]) (?=[\u4e00-\u9fa5])", "", s)
    return s.strip()


def norm(s):
    s = s.replace("（", "(").replace("）", ")").replace("【", "[").replace("】", "]")
    return re.sub(r"[\s.\u3000\u2026·．]+", "", s).lower()


def drop_line(s):
    """这一行是不是本手册额外要丢的（页眉页脚之类）"""
    return any(rx.search(s) for rx in DROP_LINE)


def page_lines(raw):
    """把一页的 layout 文本切行；点线行的点线常被排版截到下一行，这里先接回来"""
    out = []
    for ln in raw.split("\n"):
        s = ln.strip()
        bad = (RE_RUNHEAD.match(s) or RE_FOOT.match(s) or RE_TOC_FOOT.match(s)
               or (DROP_LINE and drop_line(s)))
        if out and not bad and (re.fullmatch(r"[.\u2026\s]+", s) or re.search(r"[.\u2026]{3,}\s*$", out[-1])):
            out[-1] = out[-1].rstrip() + " " + s
            continue
        out.append(ln)
    return out


def kv_split(t):
    """「标题 …… 值」拆成 (标题, 值)；点线被排成几截也能拆"""
    rs = list(re.finditer(r"[.\u2026]{3,}", t))
    if not rs:
        return None
    k = t[:rs[0].start()].strip(" .\u2026")
    v = re.sub(r"^[.\u2026\s]+", "", t[rs[0].end():]).strip()
    if not k or not v:
        return None
    return k, v


# ============================ 表格：照 PDF 画出来的框线还原 ============================
# 手册里的表格都是带框线的（re / m+l 画出来），所以直接读框线最靠谱：
#   · 横线给了每一行的边界，竖线给了每一列的边界；
#   · 中间缺一段线，就是合并单元格；
#   · 一个格子里横跨好几行文字，也自然归到一个格（不再被当成好几行）。
ROW_TOL = 4.5          # 纵坐标差这么多点以内算同一行（一行里几段字）
GRID_TOL = 1.8         # 框线的坐标容差
GAP2 = 2.5             # 判断框线是否连着时的容差
WIDE_CH = re.compile(r"[\u1100-\u115f\u2e80-\u303f\u3041-\u9fff\uf900-\ufaff"
                     r"\ufe30-\ufe6f\uff01-\uff60\uffe0-\uffe6]")
NARROW_CH = re.compile(r"[ .,;:!'\"|iljtfr()\[\]/\-]")
NSP = re.compile(r"\s+")
TRACE = bool(os.environ.get("SOP_TRACE"))


def _tr(*a):
    if TRACE:
        sys.stderr.write("TR " + " ".join(str(x) for x in a) + "\n")


def nkey(s):
    """比较用的键：项目符号先归一（layout 取字和坐标取字拿到的符号码不一样）"""
    for b in BULLETS:
        s = s.replace(b, "\u2022")
    return NSP.sub("", s)


def _tw(t, size):
    """估一段字占的宽度（点）：中日韩全角算一个字号，窄标点算三分之一"""
    w = 0.0
    for c in t:
        if WIDE_CH.match(c):
            w += size
        elif NARROW_CH.match(c):
            w += size * 0.34
        else:
            w += size * 0.55
    return w


def _cjk(c):
    return bool(c) and bool(WIDE_CH.match(c))


def page_runs(page):
    """取这页的字：(y, x, 字号, 文字, 是不是粗体)，已滤掉页边标签条 / 水印 / 乱码"""
    runs = []

    def visitor(text, cm, tm, font, size):
        t = text.replace("\r", "").replace("\n", "")
        if not t.strip():
            return
        if abs(tm[1]) > 0.01 or abs(tm[2]) > 0.01:
            return                                  # 斜排的字：页边标签条
        if abs(cm[1]) > 0.01 or abs(cm[2]) > 0.01:
            return                                  # 整块旋转过的：水印
        y, x = float(tm[5]), float(tm[4])
        if y < 0 or x < 0:
            return                                  # 跑到页面外的
        for b in BULLETS:
            t = t.replace(b, "\u2022")
        if any(ord(c) < 32 for c in t):
            return                                  # 控制字符：解不出来的乱码字体
        if any(0xE000 <= ord(c) <= 0xF8FF or 0x80 <= ord(c) <= 0x9F for c in t):
            return                                  # 私用区乱码
        name = ""
        try:
            name = str(font.get("/BaseFont", "")) if hasattr(font, "get") else str(font)
        except Exception:
            name = ""
        bold = "bold" in name.lower() or "black" in name.lower() or "heavy" in name.lower()
        runs.append((y, x, float(size), t, bold))

    try:
        page.extract_text(visitor_text=visitor)
    except Exception:
        return []
    return runs


def _cluster(vals, tol=GRID_TOL):
    """把挨得很近的坐标并成一个（一条线画成了好几小段）"""
    groups = []
    for x in sorted(vals):
        if groups and x - groups[-1][-1] <= tol:
            groups[-1].append(x)
        else:
            groups.append([x])
    return [sum(g) / float(len(g)) for g in groups]


def _draw_lines(page):
    """页面上画出来的横线 / 竖线：h = [(y, x0, x1)]，v = [(x, y0, y1)]"""
    h, v = [], []
    try:
        cs = ContentStream(page.get_contents(), page.pdf)
    except Exception:
        return h, v
    cur = None
    for operands, op in cs.operations:
        op = op.decode() if isinstance(op, bytes) else op
        try:
            nums = [float(o) for o in operands]
        except Exception:
            continue                                # Tf / TJ 这类带名字的操作跳过
        if op == "re" and len(nums) >= 4:
            x, y, w, hh = nums[:4]
            h += [(y, x, x + w), (y + hh, x, x + w)]
            v += [(x, y, y + hh), (x + w, y, y + hh)]
        elif op == "m" and len(nums) >= 2:
            cur = (nums[0], nums[1])
        elif op == "l" and len(nums) >= 2 and cur:
            x0, y0 = cur
            x1, y1 = nums[0], nums[1]
            if abs(y0 - y1) < 0.7:
                h.append(((y0 + y1) / 2.0, min(x0, x1), max(x0, x1)))
            elif abs(x0 - x1) < 0.7:
                v.append(((x0 + x1) / 2.0, min(y0, y1), max(y0, y1)))
            cur = (x1, y1)
    return h, v


def _bands(segs, kind):
    """按「位置」把线段分组并把同一条线上的小段拼成区间"""
    pos = _cluster([s[0] for s in segs])
    out = []
    for p in pos:
        spans = sorted((min(s[1], s[2]), max(s[1], s[2])) for s in segs if abs(s[0] - p) <= GRID_TOL)
        merged = []
        for a, b in spans:
            if merged and a - merged[-1][1] <= GAP2:
                merged[-1][1] = max(merged[-1][1], b)
            else:
                merged.append([a, b])
        out.append((p, [(a, b) for a, b in merged]))
    return out


def _join_line(items):
    """同一行里的几段字拼起来：只有中英/数字交界才补空格"""
    s, prev_end = "", None
    for x, size, t in items:
        if s and prev_end is not None and x - prev_end > 1.2:
            if not (_cjk(s[-1]) and _cjk(t[0])):
                s += " "
        s += t
        prev_end = x + _tw(t, size)
    return s


def tail_open(t):
    """这行是不是「没写完」（下一行还要接着）"""
    return bool(t) and bool(RE_KEEP_TAIL.search(t))


def line_break_link(a, b):
    """把两行接起来：中英交界才补空格"""
    if not a or not b:
        return (a or "") + (b or "")
    return a + (" " if (not _cjk(a[-1]) and not _cjk(b[0])) else "") + b


def is_callout(t):
    """标准喊话那种一条一行的：整行就是一对（或几对）引号，引号外面只剩标点
       例：“FLAPS UP”（“襟翼收上”） / “80”（“80”）"""
    if len(t) > 120 or not re.match(r"^[“\"]", t):
        return False
    outer = re.sub(r"[“\"][^“”\"]*[”\"]", "", t)          # 去掉引号里的内容
    return re.sub(r"[\s（）(),，。、；：:/\-]+", "", outer) == ""


def starts_new(t):
    """这行是个新条目开头（项目符号 /（a）/ 1. / ① / 点线行），不该往上接"""
    return bool(RE_BULLET.match(t) or RE_PAREN_LET.match(t) or RE_PAREN_NUM.match(t)
                or RE_NUM_DOT.match(t) or RE_CIRCLED.match(t) or kv_split(t))


def bold_lines(runs):
    """PDF 里加粗的字：{去空白文字: 原文}
       ① 整行都加粗的（当小标题用）；
       ② 单独一段加粗的（比如巡视图上的「前机身」「B767-300」）。"""
    out, lines = {}, []
    for y, x, size, t, bold in sorted(runs, reverse=True):
        if bold and len(t.strip()) >= 2:
            out.setdefault(nkey(t), t.strip())
        if lines and abs(lines[-1][0] - y) <= ROW_TOL:
            lines[-1][1].append((x, size, t, bold))
        else:
            lines.append((y, [(x, size, t, bold)]))
    for y, items in lines:
        items.sort(key=lambda a: a[0])
        if all(i[3] for i in items):
            txt = _JoinLineGuard(items)
            k = nkey(txt)
            if k:
                out[k] = txt
    return out


def _JoinLineGuard(items):
    return _join_line([(i[0], i[1], i[2]) for i in items])


def junk_of_table(nspk, tb):
    """碎渣行：整行能被拆成几段，而每段都是表格里的字（跨列排版搬出来的尾巴）"""
    t = re.sub(r"^[注：:\s]+|[注：:\s]+$", "", nspk)      # 尾巴上的「注：」之类不算
    n = len(t)
    if n < 4 and not (n >= 2 and t[-1] in "。；；！？"):
        return False                         # 2-3 字的短语不敢丢，但带着句号的多半是表格尾巴
    cells = tb["cells"]
    short = tb["shortcells"]
    ok = [False] * (n + 1)
    ok[0] = True
    for i in range(n):
        if not ok[i]:
            continue
        if t[i] in short:                    # 单字的单元格（如行号「3」、刹车效应「中」）
            ok[i + 1] = True
        for j in range(i + 2, min(n, i + 24) + 1):
            if not ok[j] and any(t[i:j] in c for c in cells):
                ok[j] = True
    return ok[n]


def junk_after_table(nspk, tb):
    """紧跟在一张表后面的排版残渣：整行几乎都是表里的字（允许逐字按顺序对上）。
       这类行是 PDF 跨列排版搬出来的，内容重复，丢掉。"""
    t = re.sub(r"[注：:\s]+$", "", nspk)
    n = len(t)
    if n < 1 or n > 120:
        return False
    flat = tb["flat"]
    j, hit = 0, 0
    for ch in t:
        k = flat.find(ch, j)
        if k >= 0:
            j = k + 1
            hit += 1
    return hit >= min(4, n) and hit >= n - 1


def page_tables(page, runs, pno=0):
    """这页里的表格。返回 [{"rows": [[(单元格 html, 纯文本, 行合并, 列合并)…]…], "frags": {…}}]"""
    h, v = _draw_lines(page)
    if not h or not runs:
        return []

    hs = [b for b in _bands(h, "h") if max(e - a for a, e in b[1]) > 60]   # 够长的横线才是表边
    out = []
    i = 0
    while i < len(hs):
        y0, sp0 = hs[i]
        x0 = min(a for a, _ in sp0)
        x1 = max(e for _, e in sp0)
        j = i + 1
        while j < len(hs):
            sp = hs[j][1]
            if abs(min(a for a, _ in sp) - x0) > GAP2 or abs(max(e for _, e in sp) - x1) > GAP2:
                break
            j += 1
        grp = hs[i:j]
        i = j
        if len(grp) < 3:                                      # 至少两行才叫表格
            continue
        ys = sorted([b[0] for b in grp], reverse=True)        # 从上到下
        top, bot = ys[0], ys[-1]
        # 列边界：落在表内的竖线（要求纵向和表格区域有重叠）
        inner = [s[0] for s in v if x0 + GAP2 < s[0] < x1 - GAP2
                 and min(s[2], top) - max(s[1], bot) > 2]
        xs = [x0] + [c for c in _cluster(inner) if x0 + GAP2 < c < x1 - GAP2] + [x1]
        xs = sorted(set(xs))

        hb, vb = _bands(h, "h"), _bands(v, "v")

        def has_h(y, xa, xb):
            for p, spans in hb:
                if abs(p - y) <= GRID_TOL and any(a <= xa + GAP2 and e >= xb - GAP2 for a, e in spans):
                    return True
            return False

        def has_v(x, ya, yb):
            for p, spans in vb:
                if abs(p - x) <= GRID_TOL and any(a <= min(ya, yb) + GAP2 and e >= max(ya, yb) - GAP2 for a, e in spans):
                    return True
            return False

        # 页眉页脚那种整行不要落进单元格
        bady = []
        _lines = []
        for y, x, size, t, bold in sorted(runs, reverse=True):
            if _lines and abs(_lines[-1][0] - y) <= ROW_TOL:
                _lines[-1][1].append((x, size, t))
            else:
                _lines.append((y, [(x, size, t)]))
        for y, items in _lines:
            txt = "".join(i[2] for i in sorted(items, key=lambda a: a[0])).strip()
            if RE_RUNHEAD.match(txt) or RE_FOOT.match(txt) or RE_TOC_FOOT.match(txt):
                bady.append(y)

        # 每个格子该收哪些字（上下各放宽一点：格子里文字挤到框线外一丁点也收进来）
        cellruns = {}
        for y, x, size, t, bold in runs:
            if not (bot - 6 <= y <= top + 6) or x < x0 - 20 or x > x1 + 20:
                continue
            if any(abs(y - b) <= ROW_TOL for b in bady):
                continue
            ci = 0
            for k in range(len(xs) - 1):
                if xs[k] - GAP2 <= x < xs[k + 1]:
                    ci = k
                    break
            else:
                ci = len(xs) - 2
            ri = 0
            for k in range(len(ys) - 1):
                if ys[k + 1] < y <= ys[k] + ROW_TOL:
                    ri = k
                    break
            else:
                ri = len(ys) - 2 if y < ys[-1] else 0
            cellruns.setdefault((max(0, ri), max(0, ci)), []).append((y, x, size, t, bold))

        def cell_html(ri, ci, rs, cs):
            items = []
            for k in range(ri, ri + rs):
                for m in range(ci, ci + cs):
                    items += cellruns.get((k, m), [])
            if not items:
                return "", ""
            items.sort(key=lambda a: (-a[0], a[1]))
            lines, cur = [], [items[0]]
            for it in items[1:]:
                if abs(it[0] - cur[-1][0]) <= ROW_TOL:
                    cur.append(it)
                else:
                    lines.append(cur)
                    cur = [it]
            lines.append(cur)
            paras, plain = [], []
            for ln in lines:                                 # 先把一行的几段字拼成一条
                ln.sort(key=lambda a: a[1])
                segs = []
                for a in ln:
                    if segs and segs[-1][1] == a[4]:
                        segs[-1][0] += a[3]
                    else:
                        segs.append([a[3], a[4]])
                txt = "".join(s[0] for s in segs)
                if paras and not starts_new(txt) and tail_open("".join(s[0] for s in paras[-1])):
                    prev = paras[-1]                         # 格子里的硬换行：上一行没写完就接回来
                    prev[-1][0] = line_break_link(prev[-1][0], segs[0][0])
                    prev.extend(segs[1:])
                else:
                    paras.append(segs)
            html = []
            for p in paras:
                plain.append("".join(s[0] for s in p))
                html.append("".join("<b>%s</b>" % esc(t) if bo else esc(t) for t, bo in p))
            return "<br>".join(html), "\n".join(plain)

        rows, used = [], set()
        for ri in range(len(ys) - 1):
            row = []
            for ci in range(len(xs) - 1):
                if (ri, ci) in used:
                    continue
                cs = 1
                while ci + cs < len(xs) - 1 and not has_v(xs[ci + cs], ys[ri + 1], ys[ri]):
                    cs += 1
                rs = 1
                while ri + rs < len(ys) - 1 and all(
                        not has_h(ys[ri + rs], xs[ci + k], xs[ci + k + 1]) for k in range(cs)):
                    rs += 1
                for k in range(ri, ri + rs):
                    for m in range(ci, ci + cs):
                        used.add((k, m))
                html, plain = cell_html(ri, ci, rs, cs)
                row.append((html, plain, rs, cs))
            rows.append(row)

        tb = {"rows": rows, "frags": set(), "pool": [], "cells": [], "shortcells": set(),
              "page": pno, "top": top, "bot": bot, "x0": x0, "x1": x1,
              "ph": float(page.mediabox.height)}
        for r in rows:
            whole = nkey("".join(c[1] for c in r))
            if len(whole) >= 2:
                tb["frags"].add(whole)
                tb["pool"].append(whole)
                tb["cells"].append(whole)
            for c in r:
                for ln in c[1].split("\n"):
                    k = nkey(ln)
                    if len(k) >= 2:
                        tb["frags"].add(k)
                    if len(k) >= 8:
                        tb["pool"].append(k)
                k2 = nkey(re.sub(r"^\s*[（(]?[A-Za-z0-9]{0,3}[）)]?\s*", "", c[1]))
                if len(k2) >= 2:
                    tb["cells"].append(k2)
                for ln in c[1].split("\n"):
                    kk = nkey(ln)
                    if kk:
                        tb["cells"].append(kk)
                        if len(kk) <= 3:
                            tb["shortcells"].add(kk)
        tb["flat"] = nkey("".join(c[1] for r in rows for c in r))
        out.append(tb)
    return out


def in_table(nspk, tb):
    """这一行（去空白的文字）是不是表格里的？排版会把跨列的几段拼成一行，所以多试几种"""
    if not nspk:
        return False
    if nspk in tb["frags"]:
        return True
    if len(nspk) < 8:
        return False
    flat = tb["flat"]
    if any(nspk in p for p in tb["pool"]):
        return True
    n = len(nspk)
    lo = 2 if n <= 30 else 4                 # 短行允许更碎的拼法
    for p in range(lo, n - lo + 1):          # “前半段 + 后半段”都是表里的字
        if nspk[:p] in flat and nspk[p:] in flat:
            return True
    return False


# ============================ 书签 ============================
def get_outline(reader):
    """[(depth, title, page)]，depth 从 0 开始"""
    out = []

    def walk(items, depth):
        for it in items:
            if isinstance(it, list):
                walk(it, depth + 1)
            else:
                try:
                    p = reader.get_destination_page_number(it) + 1
                except Exception:
                    continue
                out.append((depth, str(it.title).strip(), p))

    try:
        walk(reader.outline, 0)
    except Exception as e:
        sys.exit("读不出 PDF 书签：%r" % (e,))
    return out


RE_CHAP_NUM = re.compile(r"^第\s*(\d+)\s*[章节]")


def book_chapters(out, man):
    """这本书有哪些「章」。默认认「第N章」；手册配置里给了 chapre 就按它认
       （例如飞机飞行手册是「第N 节」，还有附录 / 补充手册）。
       返回按书签顺序编号（从 1 开始）的列表：[{no,title,page,last,depth}]"""
    rx = re.compile(man["chapre"]) if man.get("chapre") else None
    tops = []
    for d, t, p in out:
        if d > 0:
            continue
        if rx is None:
            if not RE_CHAPTER_TITLE.match(t):
                continue
        elif not rx.search(t):
            continue
        tops.append({"depth": d, "title": t, "page": p})
    for i, c in enumerate(tops):
        c["no"] = i + 1
        c["last"] = tops[i + 1]["page"] - 1 if i + 1 < len(tops) else None
    return tops


def chapter_info(out, chap, man=None, total=None):
    """本章标题 / 章节表 / 起始页 / 结束页"""
    man = man or {}
    tops = book_chapters(out, man)
    if chap < 1 or chap > len(tops):
        return None
    c = tops[chap - 1]
    d0, title0, first = c["depth"], c["title"], c["page"]
    mnum = RE_CHAP_NUM.match(title0)
    cno = mnum.group(1) if mnum else ""
    # 最后一章没有下一条书签兜底：到 PDF 末页为止（书签最后一条往往不是全书末页）
    last = c["last"] if c["last"] is not None else (total or out[-1][2])
    last = max(last, first)
    secs = []
    for d, t, p in out:
        if p < first or p > last or d <= d0:
            continue
        m2 = RE_NUM_TITLE.match(t)
        num = m2.group(1) if m2 else ""
        name = m2.group(2).strip() if m2 else t
        # 有编号的小节，编号要属于本章（1.1 / 4.2 这种）
        if num and cno and not (num == cno or num.startswith("%s." % cno)):
            continue
        # 「TOC 目录」「前言」这类整节不要（连同里面的正文一起丢）
        secs.append({"lv": d - d0 + 1, "num": num, "name": name, "page": p,
                     "skip": bool(re.match(r"^(TOC\s*目录|TOC|目录|前言)$", t.strip(), re.I))})
    # 跳过段的兜底页：下一个「要保留」的小节的起始页
    for k, s in enumerate(secs):
        if not s["skip"]:
            continue
        s["until"] = 10 ** 9
        for nxt in secs[k + 1:]:
            if not nxt["skip"]:
                s["until"] = nxt["page"]
                break
    return {"title": title0, "secs": secs, "first": first, "last": last, "no": cno}


# ============================ 正文 ============================
def build(pages, info, pobjs=None):
    pobjs = pobjs or {}
    out = []
    kept = []
    mc = RE_CHAPTER_TITLE.match(info["title"])
    out.append('<h1 class="doc-title" id="sec-ch%s">%s</h1>'
               % (mc.group(1) if mc else "?", esc(squeeze(info["title"]))))
    kept.append(info["title"])
    stats = {"drop_head": 0, "drop_foot": 0, "drop_toc": 0, "drop_ct": 0, "join": 0,
             "tbl": 0, "ul": 0, "ol": 0, "kv": 0, "nohead": 0, "junk": [], "blank": 0,
             "drop_zone": 0}
    secs = list(info["secs"])
    done = set()
    sec_i = [0]
    cur = {"sec": None, "list": None, "tbl": None, "kv": None, "para": [], "gap": False,
           "tmeta": None, "tail": None, "last": None, "skip": False, "skippg": 0}

    def t_open(t):
        return bool(t) and bool(RE_KEEP_TAIL.search(t[-1]))

    def para_text():
        return "".join(x[0] for x in cur["para"])

    def flush_para():
        if cur["para"]:
            plain, html = "", []
            for t, bo in cur["para"]:
                sep = ""
                if plain and re.search(r"[A-Za-z0-9,;:)]$", plain) and re.match(r"^[A-Za-z0-9(]", t):
                    sep = " "
                plain += sep + t
                html.append("<b>%s</b>" % esc(sep + t) if bo else esc(sep + t))
            out.append("<p>%s</p>" % "".join(html))
            cur["para"] = []
            cur["last"] = "p"
        cur["tail"] = None

    def close_list():
        if cur["list"]:
            kind, items = cur["list"]
            if kind == "ul":
                out.append("<ul>" + "".join("<li>%s</li>" % esc(t) for t in items) + "</ul>")
                cur["last"] = "list"
            else:
                out.append('<ol class="lt">' + "".join(
                    '<li><span class="mk">%s</span>%s</li>' % (esc(m), esc(t)) for m, t in items) + "</ol>")
            cur["last"] = "list"
            # 记下最后一条：换页/收表后如果下一行还没写完，还能接回去
            cur["tail"] = [len(out) - 1, items[-1][1] if kind == "ol" else items[-1]]
            cur["list"] = None

    def close_tbl():
        if cur["tbl"]:
            rows = cur["tbl"]
            h = ['<table class="tbl">', "<tbody>"]
            for r in rows:
                h.append("<tr>")
                for cell in r:
                    attrs = ""
                    if cell[3] > 1:
                        attrs += ' colspan="%d"' % cell[3]
                    if cell[2] > 1:
                        attrs += ' rowspan="%d"' % cell[2]
                    h.append("<td%s>%s</td>" % (attrs, cell[0] or ""))
                h.append("</tr>")
            h.append("</tbody></table>")
            out.append("".join(h))
            stats["tbl"] += 1
            cur["tbl"] = None
            cur["tmeta"] = None
            cur["last"] = "tbl"

    def close_all():
        flush_para()
        close_list()
        close_tbl()

    def emit_head(sec):
        close_all()
        cur["tail"] = None
        num, name, lv = sec["num"], sec["name"], sec["lv"]
        sid = "sec-" + (num.replace(".", "_") if num else re.sub(r"\W+", "", name)[:12] or "x")
        text = (num + " " + name).strip()
        if lv <= 2:
            if cur["sec"] is not None:
                out.append("</div></section>")
            out.append('<section class="sec" id="%s">' % sid)
            out.append('<h2 class="sec-title" id="%s">%s</h2>' % (sid, esc(text)))
            out.append('<div class="sec-body">')
            cur["sec"] = sid
        else:
            lv2 = min(lv, 4)
            out.append('<h%d class="sub-title" id="%s">%s</h%d>' % (lv2, sid, esc(text), lv2))
        cur["gap"] = True

    def push_para(t, was_gap, bold=False):
        _tr("push", repr(t[:18]), "para", len(cur["para"]), "list", bool(cur["list"]),
            "tail", bool(cur["tail"]), "gap", was_gap, "bold", bold)
        if t_open(para_text()) and not was_gap and cur["para"] and not starts_new(t):
            cur["para"].append([t, bold])
            stats["join"] += 1
            return
        if not cur["para"] and cur["list"] and cur["list"][1]:
            it = cur["list"][1][-1]
            t0 = it[1] if isinstance(it, tuple) else it      # ul 存字符串，ol 存 (标号, 正文)
            _tr("   list check", repr(t0[-8:]), t_open(t0))
            # 上一条没写完才接着写；短条目（如「从头做检查单」）就当它已经完了
            if t_open(t0) and len(t0) >= 12:
                if isinstance(it, tuple):
                    cur["list"][1][-1] = (it[0], t0 + t)
                else:
                    cur["list"][1][-1] = t0 + t
                stats["join"] += 1
                return
        if cur["tail"] and not starts_new(t) and tail_open(cur["tail"][1]) and len(cur["tail"][1]) >= 12:
            _tr("   -> tail resume")
            idx = cur["tail"][0]                          # 上一条已经落成 html 了，直接改那一处
            cur["tail"][1] += t
            s = out[idx]
            k = s.rindex("</li>")
            out[idx] = s[:k] + esc(t) + s[k:]
            stats["join"] += 1
            return
        if not cur["para"]:
            _tr("   -> new para")
            flush_para()
            close_list()
            close_tbl()
        elif not t_open(para_text()):
            flush_para()                                   # 上一行句号/分号收尾了，这是新的一段
        cur["para"].append([t, bold])

    ct_norm = norm(info["title"])
    # 章名去掉「第N章」再去掉开头的编号，用来认正文里重出的运行章名（「8．特殊运行的要求」这种）
    ct_alt = re.sub(r"^\d+", "", norm(re.sub(r"^第\s*\d+\s*章", "", info["title"])))
    zone_seen = set()
    for pno, raw in pages:
        if any(RE_TOC_FOOT.match(x) for x in raw.split("\n")):      # 本章目录页
            stats["drop_toc"] += 1
            continue
        if DROP_PAGE and any(rx.search(raw) for rx in DROP_PAGE):    # 本手册配置的目录页 / 有效页清单页
            stats["drop_toc"] += 1
            continue
        runs = page_runs(pobjs[pno]) if pno in pobjs else []
        tabs = page_tables(pobjs[pno], runs, pno) if runs else []
        bolds = bold_lines(runs)
        by_frag = {}
        for ti, tb in enumerate(tabs):
            for fr in tb["frags"]:
                by_frag.setdefault(fr, ti)
        emitted = set()
        plines = page_lines(raw)
        # 页眉页脚带：这一页最上面几行 / 最下面几行（运行页眉、页码、日期、版权行都在这）
        zt, zb = ZONES if ZONES else (0, 0)
        nn = [i for i, x in enumerate(plines) if x.strip()]
        zone_ix = set(nn[:zt]) | set(nn[-zb:]) if (zt or zb) else set()
        # 这一页是不是「检查单」页（很多点线行）：是的话，里面的短行多半是区域 / 机型小标签
        chk_page = sum(1 for x in plines if kv_split(x.strip())) >= 3
        for li, line in enumerate(plines):
            if RE_RUNHEAD.match(line):
                stats["drop_head"] += 1
                continue
            if RE_FOOT.match(line):
                stats["drop_foot"] += 1
                continue
            if DROP_LINE and drop_line(line):
                stats["drop_foot"] += 1
                continue
            line = line.rstrip()
            core = line.strip().replace("\u25a0", "").strip()      # 页末那个■不要
            if not core:
                cur["gap"] = True
                continue
            was_gap = cur["gap"]
            cur["gap"] = False
            _tr("line", pno, repr(core[:44]))

            # 0a) 页眉页脚带里重复出现的行（运行页眉、页码、日期、版权行）：第二次起丢掉
            if li in zone_ix and core in zone_seen:
                stats["drop_zone"] += 1
                continue
            if li in zone_ix:
                zone_seen.add(core)

            # 0) 章大标题：正文里重出的章名一律丢掉（开头已经有一份 h1 了）
            m = RE_CHAPTER_TITLE.match(core)
            if (m or ct_norm == norm(core)
                    or (len(ct_alt) >= 4 and re.sub(r"^\d+", "", norm(core)) == ct_alt)) and len(core) <= 30:
                stats["drop_ct"] += 1
                continue

            # 1) 小节标题：和书签里的「编号+标题」或「标题」对得上就算
            n1, n2 = norm(core), norm(re.sub(r"^\s*\d+(?:\.\d+)*\.?\s*", "", core))
            hit = None
            for k in range(sec_i[0], len(secs)):
                s = secs[k]
                if s["page"] > pno:
                    break
                if s["lv"] <= 0:
                    continue
                keys = {norm((s["num"] + s["name"]).strip()), norm(s["name"])}
                if (n1 in keys or (n2 and n2 in keys)) and len(core) <= 45:
                    hit = s
                    break
            if hit is not None:
                if norm((hit["num"] + hit["name"])) in done:    # 这节标题已经出过了（页眉里重出的），不重复出
                    continue
                kept.append(core)
                done.add(norm((hit["num"] + hit["name"])))
                sec_i[0] = secs.index(hit) + 1
                if re.fullmatch(r"有意(空白|留白|留空)", hit["name"].strip()):    # 空占位小节，连标题一起不要
                    stats["blank"] += 1
                    kept.pop()
                    continue
                if hit.get("skip"):                      # 「TOC 目录」「前言」：整节不要
                    cur["skip"] = True
                    cur["skippg"] = hit.get("until", 10 ** 9)
                    stats["drop_sec"] = stats.get("drop_sec", 0) + 1
                    kept.pop()
                    continue
                cur["skip"] = False
                emit_head(hit)
                continue

            if cur["skip"]:
                if pno > cur["skippg"]:                  # 兜底：过了这个小节的页还不开新标题，就不再丢
                    cur["skip"] = False
                else:
                    stats["drop_sec_line"] = stats.get("drop_sec_line", 0) + 1
                    continue

            # 1.5) 表格：交给按框线还原好的那张表；上一页没写完的就接着写在同一张表里
            nspk = nkey(core)
            ti = by_frag.get(nspk)
            if ti is None:
                for k, tb in enumerate(tabs):
                    if in_table(nspk, tb):
                        ti = k
                        break
            if ti is not None:
                if ti not in emitted:
                    emitted.add(ti)
                    tb = tabs[ti]
                    prev = cur["tmeta"]
                    cont = (cur["tbl"] is not None and prev
                            and tb["page"] == prev["page"] + 1
                            and prev["bot"] < 140 and tb["top"] > tb["ph"] - 140
                            and abs(prev["x0"] - tb["x0"]) < 5
                            and abs(prev["x1"] - tb["x1"]) < 5)
                    if cont:
                        cur["tbl"].extend(tb["rows"])
                    else:
                        close_all()
                        cur["tbl"] = list(tb["rows"])
                    cur["tmeta"] = tb
                    kept.extend("".join(c[1] for c in row) for row in tb["rows"])
                continue

            # 1.6) PDF 里的粗体小标题（比如「进近/着陆注意事项：」）
            hitb = None
            for bk in bolds:
                if bk.endswith(("：", ":")) and nspk.endswith(bk) and len(bk) <= 24:
                    if hitb is None or len(bk) > len(hitb):
                        hitb = bk
            if hitb:
                close_all()
                out.append('<h4 class="sub-title">%s</h4>' % esc(squeeze(bolds[hitb])))
                kept.append(bolds[hitb])
                continue

            # 1.55) 行首的项目符号：先认出来，别让后面的「小标题」「点线行」规则抢走
            mb = RE_BULLET.match(core)
            if mb:
                rest = core[mb.end():].strip()
                if not rest:                       # 只剩一个符号，丢掉
                    stats["drop_ct"] += 1
                    continue
                flush_para()
                close_tbl()
                if not cur["list"] or cur["list"][0] != "ul":
                    close_list()
                    cur["list"] = ["ul", []]
                cur["list"][1].append(rest)
                cur["last"] = "list"
                stats["ul"] += 1
                kept.append(rest)                  # 网页里项目符号是 CSS 画的，不算正文差异
                continue

            # 1.6b)「碎渣。小标题：」这种挤在一行的：把结尾那个短标题拆出来当小标题
            if re.search(r"[：:]$", core) and len(core) <= 80 and "。" in core:
                cut = core.rindex("。") + 1
                head, label = core[:cut].strip(), core[cut:].strip()
                if 2 <= len(label) <= 24 and not re.search(r"[。，；、]", label):
                    if head and not any(junk_of_table(nkey(head), tb) for tb in tabs):
                        push_para(squeeze(head), True)
                        kept.append(head)
                    close_all()
                    out.append('<h4 class="sub-title">%s</h4>' % esc(squeeze(label)))
                    kept.append(label)
                    continue

            # 1.6c) 单独一行的短标题（比如「进近/着陆注意事项：」「推力：」）
            if (3 <= len(core) <= 24 and re.search(r"[：:]$", core)
                    and not re.search(r"[。，；、]", core)
                    and (not cur["para"] or not t_open(para_text()))):
                close_all()
                out.append('<h4 class="sub-title">%s</h4>' % esc(squeeze(core)))
                kept.append(core)
                continue

            # 1.7) 表格排版搬出来的碎渣行（整行都是表里的字拼起来的）就丢掉
            junk = False
            for tb in tabs:
                if junk_of_table(nspk, tb):
                    junk = True
                    break
            if junk:
                _tr("junk", pno, repr(core[:30]))
                stats["drop_ct"] += 1
                if len(stats["junk"]) < 12:
                    stats["junk"].append("p%d %s" % (pno, core[:40]))
                continue

            # 1.75) 刚输出过表格，紧跟的排版残渣也丢掉（不然会把表拆成两张）
            if (cur["tbl"] is not None or cur["last"] == "tbl") and any(
                    junk_after_table(nspk, tb) for tb in tabs):
                _tr("junk-after-tbl", pno, repr(core[:30]))
                stats["drop_ct"] += 1
                if len(stats["junk"]) < 12:
                    stats["junk"].append("p%d %s" % (pno, core[:40]))
                continue

            # 1.8) 「有意空白 / 此页有意留白 / 有意留空」这种占位行，不要
            if len(core) <= 12 and re.search(r"有意(空白|留白|留空)", core):
                stats["blank"] += 1
                continue

            kept.append(core)

            # 2) 点线行：标题……值
            kvp = kv_split(core) if len(core) < 120 else None
            if kvp:
                close_all()
                out.append('<div class="kv"><span class="k">%s</span><span class="v">%s</span></div>'
                           % (esc(squeeze(kvp[0])), esc(squeeze(kvp[1]))))
                kept[-1] = squeeze(kvp[0]) + squeeze(kvp[1])
                stats["kv"] += 1
                cur["last"] = "kv"
                continue

            # 3) 清单
            if is_callout(core):                    # 标准喊话：一行一条
                flush_para(); close_tbl()
                if not cur["list"] or cur["list"][0] != "ul":
                    close_list(); cur["list"] = ["ul", []]
                cur["list"][1].append(core)
                stats["ul"] += 1
                continue
            m = RE_PAREN_LET.match(core)
            if m:
                flush_para(); close_tbl()
                if not cur["list"] or cur["list"][0] != "ol":
                    close_list(); cur["list"] = ["ol", []]
                cur["list"][1].append((core[:m.end()].strip(), core[m.end():].strip()))
                stats["ol"] += 1
                continue
            m = RE_PAREN_NUM.match(core) or RE_NUM_PAREN.match(core)
            if m:
                flush_para(); close_tbl()
                if not cur["list"] or cur["list"][0] != "ol":
                    close_list(); cur["list"] = ["ol", []]
                cur["list"][1].append((core[:m.end()].strip(), core[m.end():].strip()))
                stats["ol"] += 1
                continue
            m = RE_NUM_DOT.match(core)
            if m:
                flush_para(); close_tbl()
                if not cur["list"] or cur["list"][0] != "ol":
                    close_list(); cur["list"] = ["ol", []]
                cur["list"][1].append((core[:m.end()].strip(), core[m.end():].strip()))
                stats["ol"] += 1
                continue
            m = RE_CIRCLED.match(core)
            if m:
                flush_para(); close_tbl()
                if not cur["list"] or cur["list"][0] != "ol":
                    close_list(); cur["list"] = ["ol", []]
                cur["list"][1].append((m.group(1), core[m.end():].strip()))
                stats["ol"] += 1
                continue

            # 4) 正文（PDF 里整行加粗的，网页里也用粗体）
            bo = nspk in bolds
            # 检查单里的短标签（区域名 / 机型，如「前机身」「B767-300」）也加粗
            if (not bo and 2 <= len(core) <= 14 and cur["last"] == "kv" and chk_page
                    and not re.search(r"[。；：，！？…、]", core)):
                bo = True
                stats["grpbold"] = stats.get("grpbold", 0) + 1
            push_para(squeeze(core), was_gap, bo)

        # 这页里还有没被正文行触发的表格，收尾时补在后面
        for ti, tb in enumerate(tabs):
            if ti in emitted:
                continue
            emitted.add(ti)
            close_all()
            cur["tbl"] = [list(row) for row in tb["rows"]]
            kept.extend("".join(c[1] for c in row) for row in tb["rows"])
            close_tbl()

    close_all()
    if cur["sec"] is not None:
        out.append("</div></section>")
    return "\n".join(out), stats, kept


REPORT = []


def say(s=""):
    REPORT.append(s)
    print(s)


def main():
    global DROP_LINE, DROP_PAGE, ZONES
    for stream in (sys.stdout, sys.stderr):      # 控制台是 GBK，特殊符号直接替掉，别让它崩
        try:
            stream.reconfigure(errors="replace")
        except Exception:
            pass
    args = sys.argv[1:]
    code = args[0] if args and not args[0].isdigit() else "sop"
    if code not in MANUALS:
        say("不认识的手册代号：%s（可选：%s）" % (code, " / ".join(sorted(MANUALS))))
        say("用法：python pdf_to_sop.py [%s] 1 2 3" % "|".join(sorted(MANUALS)))
        return
    man = MANUALS[code]
    # 本手册专用的丢行 / 丢页 / 页眉页脚带规则（不配就是空的）
    DROP_LINE = tuple(re.compile(x) for x in (man.get("droplines") or ()))
    DROP_PAGE = (re.compile(man["droppage"]),) if man.get("droppage") else ()
    ZONES = man.get("zones")
    pdf = os.path.join(HERE, man["pdf"])
    data_dir = os.path.join(HERE, man["dir"], "data")
    chaps = [int(a) for a in args if a.isdigit()] or [1]

    say("手册：%s（%s）" % (man["name"], os.path.basename(pdf)))
    reader = PdfReader(pdf)
    outline = get_outline(reader)
    total = len(reader.pages)
    say("PDF 共 %d 页，书签 %d 条" % (total, len(outline)))

    for chap in chaps:
        info = chapter_info(outline, chap, man, total)
        if not info:
            tops = book_chapters(outline, man)
            say("第 %d 章：书签里没找到，跳过（本书共 %d 章：%s）"
                % (chap, len(tops), " / ".join(c["title"][:20] for c in tops[:12])))
            continue
        pages = {}
        pobjs = {}
        for pno in range(info["first"], min(info["last"], total) + 1):
            pg = reader.pages[pno - 1]
            pages[pno] = pg.extract_text(extraction_mode="layout")
            pobjs[pno] = pg
        html, stats, kept = build([(p, pages[p]) for p in sorted(pages)], info, pobjs)

        src = "\n".join(kept)
        plain = htmllib.unescape(re.sub(TAG, "", html))
        a = norm(src)
        b = norm(plain)
        same = a == b
        ctx = ""
        if not same:
            ctx = "差异明细（最多 8 处，源文 → 网页）："
            shown = 0
            for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(None, a, b).get_opcodes():
                if tag == "equal" or shown >= 8:
                    continue
                shown += 1
                ctx += "\n    [%s] 源文「%s」→ 网页「%s」" % (
                    tag, a[i1:min(i2, i1 + 60)] or "（空）", b[j1:min(j2, j1 + 60)] or "（空）")
            if not shown:
                ctx = ""

        sub = re.sub(r"^第\s*\d+\s*[章节][\s\-–—·、:：]*", "", info["title"]).strip()
        if man.get("navfmt"):
            nav = man["navfmt"] % {"no": chap, "sub": sub, "title": info["title"]}
        else:
            nav = "第 %d 章　%s" % (chap, sub)
        safe = re.sub(r"[\\/:*?\"<>|\s]", "", sub) or str(chap)
        fname = "%s-%02d-%s.js" % (code, chap, safe)
        out_file = os.path.join(data_dir, fname)
        data = {"no": chap, "title": info["title"], "nav": nav, "html": html}
        js = ('/* %s · %s —— 正文数据\n'
              '   ⚠ 由 pdf_to_sop.py 自动生成，别手改；要改内容改手册 PDF 再重跑：\n'
              '      python pdf_to_sop.py %s %d */\n'
              'window.SOP_CHAPTERS = window.SOP_CHAPTERS || [];\n'
              'window.SOP_CHAPTERS.push(%s);\n'
              % (man["name"], nav, code, chap, json.dumps(data, ensure_ascii=False, indent=2)))
        if not os.path.isdir(data_dir):
            os.makedirs(data_dir)
        io.open(out_file, "w", encoding="utf-8").write(js)

        say("第 %d 章 %s：页 %d-%d，书签小节 %d 个" % (chap, nav, info["first"], info["last"], len(info["secs"])))
        say("  丢弃 页眉 %d 行 / 页脚 %d 行 / 重复页眉页脚 %d 行 / 目录页 %d 页 / 重出的章名 %d 行 / 有意空白 %d 行 / 不要的小节 %d 个（%d 行）；清单 %d 条、编号清单 %d 条、点线行 %d 条、表格 %d 个；接行 %d 处"
            % (stats["drop_head"], stats["drop_foot"], stats["drop_zone"], stats["drop_toc"], stats["drop_ct"],
               stats["blank"], stats.get("drop_sec", 0), stats.get("drop_sec_line", 0),
               stats["ul"], stats["ol"], stats["kv"], stats["tbl"], stats["join"]))
        say("  完整性核对：源文 %d 字 / 网页 %d 字 → %s"
            % (len(a), len(b), "一致(OK)" if same else "有差异(DIFF)"))
        if ctx:
            say("  " + ctx.replace("\n", "\n  "))
        if stats["junk"]:
            say("  碎渣行样本：" + " | ".join(stats["junk"]))
        say("  输出：%s（%.1f KB）" % (out_file, os.path.getsize(out_file) / 1024.0))

    io.open(os.path.join(HERE, "_report.txt"), "w", encoding="utf-8").write("\n".join(REPORT))


if __name__ == "__main__":
    main()
