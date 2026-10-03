# -*- coding: utf-8 -*-
"""
生成 js/work-holidays.js（法定节假日 / 调休数据）

用法：python _gen_holidays.py
数据来源：https://github.com/NateScarlet/holiday-cn
  （它把国务院办公厅每年发的放假通知整理成 json，每年一个文件）
只有发布了的年份才能拉到，拉不到就跳过，不影响已有的年份。
"""
import json
import urllib.request
import os

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = "https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/{}.json"
# 没公布的年份拉下来是空的（papers/days 都是 []），会被下面的 if not days 跳过，
# 所以一次列到 2030 也无害；以后年份再往后就改这一行
YEARS = (2024, 2025, 2026, 2027, 2028, 2029, 2030)

rows = {}      # 日期 -> (是否放假, 节日名)
got_years = []

for y in YEARS:
    try:
        with urllib.request.urlopen(SRC.format(y), timeout=25) as r:
            data = json.load(r)
    except Exception as e:
        print(y, "跳过：", e)
        continue
    days = data.get("days") or []
    if not days:
        continue
    got_years.append(y)
    for it in days:
        rows[it["date"]] = (bool(it["isOffDay"]), it["name"])
    print(y, "OK", len(days), "条")

if not rows:
    raise SystemExit("一条数据都没拉到，检查网络后重试")

head = [
    "/**",
    " * 法定节假日 / 调休数据（中国大陆）",
    " * ==================================================================",
    " * 只给「日历模式」区分「法定放假（淡红 + 节日名）」和「调休上班（写 XX调班）」用，",
    " * 不参与任何计算。",
    " *",
    " * 数据结构：{ 日期: { off: true = 放假 / false = 调休上班, name: 节日名 } }",
    " *   · 表里没有的日期就是普通工作日，日历上不额外标记；",
    " *   · 周末放假是日历自己就能算出来的，这里只写「国家规定的假期」和「补班」。",
    " *",
    " * 想补后面的年份：跑一下同目录的 _gen_holidays.py 重新生成即可",
    " * （数据来自国务院办公厅放假通知，经 holiday-cn 整理）。",
    " * ==================================================================",
    " */",
    "",
    "window.WORK_HOLIDAYS = {",
]

body = []
for date in sorted(rows):
    off, name = rows[date]
    mark = "true " if off else "false"
    body.append('    "%s": { off: %s, name: "%s" },' % (date, mark, name))

text = "\n".join(head + body + ["};", ""])
out = os.path.join(ROOT, "js", "work-holidays.js")
with open(out, "w", encoding="utf-8", newline="\n") as f:
    f.write(text)

print("写入", out)
print("共", len(rows), "天，年份：", got_years)
