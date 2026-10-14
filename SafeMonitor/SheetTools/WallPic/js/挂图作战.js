/* 挂图作战清单 · 大字号查看器 —— 逻辑
   （引擎与「安全隐患协同评估表」查看器同源，字段识别规则按“挂图作战清单”的习惯调整过）

   结构在 ../挂图作战查看器.html，样式在 ../css/挂图作战.css
   依赖 xlsx.full.min.js（SheetJS，由 HTML 里先加载）

   ★ 想换数据源 / 改字段识别规则，看下面两块就够了：
     ① MAIN_SHEET —— 展示哪张工作表
     ② RE_* 正则   —— 哪个列当标题、哪些列做彩色标签、哪些列整行铺开、按哪列做左侧导航
*/
(function () {
  "use strict";

  // ---------- 字段语义识别 ----------
  // 标题列：优先“任务/事项/工作内容”这类；都没有就取最长的那个文本字段
  var RE_NAME  = /工作任务|工作事项|重点任务|任务名称|任务|事项|工作内容|内容|名称|标题|问题|隐患(?!等级|类别|类型|分类|来源|描述)|概述|主题/;
  // 长文本：整行铺开，读起来顺
  var RE_LONG  = /任务|事项|内容|措施|要求|标准|描述|说明|计划|安排|情况|问题|原因|分析|整改|验证|效果|预案|应急|后果|备注/;
  // 彩色标签：短取值的“等级/进度/部门/责任人/时限”等
  var RE_BADGE = /等级|级别|类别|类型|分类|进度|状态|情况|来源|是否|关闭|销号|闭环|部门|单位|责任人|负责人|主管|领导|处室|节点|时限|期限|完成时间|截止|日期/;
  // 左侧导航的分组依据：优先“牵头/责任/主办/承办”，再退到“部门/处室”（排除配合、协助部门）
  var RE_DEPT_MAIN = /牵头部门|主办部门|承办部门|责任部门|评估部门|归属部门|所属部门/;
  var RE_DEPT_ANY  = /部门|处室/;
  var RE_DEPT_NO   = /配合|协助|参与/;
  // 完成状态列：用来做“按完成状态”筛选
  var RE_STAT  = /进度|状态|完成情况|推进情况|完成阶段|销号/;
  // 这些字段不放 card-head 标签（太长或意义不大）
  var RE_NO_BADGE = /责任单位|上级单位|单位名称|序号|编号/;
  // 纯序号列：不在卡片正文里重复显示（序号已经做成了卡片左上角的编号）
  var RE_SKIP_FIELD = /^\s*(序号|序|编号|no\.?|№)\s*$/i;
  // 序号列的表头识别：要求“含”序号/编号即可（表头写「任务序号」这类也认）
  var RE_NO_COL = /序号|编号|^\s*no\.?\s*$/i;

  var el = function (id) { return document.getElementById(id); };
  // 侧栏里「未填写」那一组用的内部值（不能直接用「未填写」当值，否则和“空的”对不上，点了会一条都不显示）
  var NONE = "__none__";
  var navLabel = function (k) { return k === NONE ? "未填写" : k; };
  var esc = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };

  // ---------- 全局状态 ----------
  var MAIN_SHEET = "挂图作战清单";  // 有这张表就只展示它；没有就取第一张正式表
  var Wb = null;            // 当前工作簿
  var sheetName = null;     // 当前工作表
  var showEmpty = false;    // 是否显示空字段
  var allOpen = false;      // 全局展开模式
  var openSet = {};         // 单张卡片展开状态（key = 记录序号）
  var curDept = "";         // 当前选中的牵头部门（空 = 全部）
  var curStat = "";         // 当前选中的完成状态（空 = 全部）
  var fs = 17;              // 当前基础字号

  // ---------- 取值/格式化 ----------
  function isEmpty(v) {
    return v === null || v === undefined || String(v).trim() === "";
  }
  function fmt(v) {
    if (v === null || v === undefined) return "";
    if (v instanceof Date && !isNaN(v)) {
      var p = function (n) { return String(n).padStart(2, "0"); };
      var d = v.getFullYear() + "-" + p(v.getMonth() + 1) + "-" + p(v.getDate());
      if (v.getHours() || v.getMinutes() || v.getSeconds()) {
        d += " " + p(v.getHours()) + ":" + p(v.getMinutes());
      }
      return d;
    }
    if (typeof v === "number" && !isFinite(v)) return "";
    return String(v).trim();
  }

  // 表头行判定：非空单元格多、且大多为短文本
  function looksLikeHeader(row) {
    var ne = row.filter(function (v) { return !isEmpty(v); });
    if (ne.length < 2) return false;
    var textish = ne.filter(function (v) {
      return typeof v === "string" && v.trim().length <= 20 && !/^\d+([.\-/]\d+)*$/.test(v.trim());
    }).length;
    return textish / ne.length >= 0.8;
  }

  // 徽标颜色：按语义 + 取值判断（挂图作战的常见说法都收进来了）
  function badgeClass(header, value) {
    var h = header, v = value;
    if (/等级|级别/.test(h)) return /重大/.test(v) ? "bad" : (/一般/.test(v) ? "doing" : "info");
    if (/进度|状态|完成情况|推进情况|阶段|销号|闭环/.test(h)) {
      if (/已整改|已关闭|已完成|已销号|已闭环|^是$|通过|完成$/.test(v)) return "ok";
      if (/推进中|进行中|整改中|持续|部分|待|开展|实施/.test(v)) return "doing";
      if (/未整改|未关闭|未完成|未开始|未启动|逾期|滞后|^否$/.test(v)) return "bad";
      return "plain";
    }
    if (/是否/.test(h)) {
      if (/^是$/.test(v)) return "info";
      if (/^否$/.test(v)) return "plain";
      return "plain";
    }
    return "plain";
  }

  // ---------- 把一张工作表转成“记录数组” ----------
  function parseSheet(ws) {
    var rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "", blankrows: false });

    // 找表头行（在前 10 行内）
    var headerRow = -1;
    for (var i = 0; i < Math.min(rows.length, 10); i++) {
      if (looksLikeHeader(rows[i])) { headerRow = i; break; }
    }

    var headers = [], dataRows, usedGeneric = false;
    if (headerRow >= 0) {
      headers = rows[headerRow].map(function (v, c) {
        var t = fmt(v).replace(/\s+/g, " ").trim();
        return t || ("第" + (c + 1) + "列");
      });
      dataRows = rows.slice(headerRow + 1);
    } else {
      // 无表头：整表按数据行处理，列名自动生成
      usedGeneric = true;
      var width = rows.reduce(function (m, r) { return Math.max(m, r.length); }, 0);
      for (var c2 = 0; c2 < width; c2++) headers.push("第" + (c2 + 1) + "列");
      dataRows = rows;
    }

    // 丢掉整行全空的记录（表尾的合计行、空行）
    dataRows = dataRows.filter(function (r) {
      return r.some(function (v) { return !isEmpty(v); });
    });

    return buildRecords(headers, dataRows, usedGeneric);
  }

  // ---------- 组装“记录”对象（标题 / 标签 / 字段 / 牵头部门 / 状态） ----------
  function buildRecords(headers, dataRows, usedGeneric) {
    var titleIdx = -1, badgeIdx = [], deptIdx = -1, statIdx = -1, noIdx = -1;
    headers.forEach(function (h, i) {
      if (titleIdx < 0 && RE_NAME.test(h)) titleIdx = i;
      if (RE_BADGE.test(h)) badgeIdx.push(i);
      if (statIdx < 0 && RE_STAT.test(h)) statIdx = i;
      if (noIdx < 0 && RE_NO_COL.test(h)) noIdx = i;              // 序号列（拿它做卡片编号）
      // 牵头部门优先；“配合部门”之类不参与分组
      if (deptIdx < 0 && RE_DEPT_MAIN.test(h)) deptIdx = i;
      if (deptIdx < 0 && RE_DEPT_ANY.test(h) && !RE_DEPT_NO.test(h)) deptIdx = i;
    });
    // 表头里没写“序号”就按惯例取 C 列（第 3 列）——挂图作战清单的序号通常在这
    if (noIdx < 0 && headers.length >= 3) noIdx = 2;

    var noSeen = {};    // 记每个序号出现过几次（重复的从第 2 个起加后缀）

    var recs = dataRows.map(function (row, ri) {
      var fields = headers.map(function (h, i) {
        return { header: h, value: fmt(row[i]), idx: i };
      });

      // 标题：优先“任务/事项”类字段；否则取最长的文本字段
      var title = "";
      if (titleIdx >= 0 && !isEmpty(fields[titleIdx].value)) title = fields[titleIdx].value;
      if (!title) {
        var best = fields.reduce(function (a, f) {
          return f.value.length > a.value.length ? f : a;
        }, { value: "" });
        title = best.value;
      }
      if (title.length > 200) title = title.slice(0, 200) + "…";

      // 彩色标签：短取值的“等级/进度/部门/责任人/时限”等
      var badges = fields.filter(function (f) {
        if (isEmpty(f.value)) return false;
        if (badgeIdx.indexOf(f.idx) < 0) return false;
        if (RE_NO_BADGE.test(f.header)) return false;      // 这类字段只放正文，不做标签
        if (f.value.length > 14) return false;             // 太长的不做标签
        if (f.idx === titleIdx) return false;              // 与标题重复的不做标签
        return true;
      }).slice(0, 8);

      // 正文字段：去掉标题列、已做标签的列、以及纯序号列
      var badgeSet = badges.map(function (b) { return b.idx; });
      var body = fields.filter(function (f) {
        if (f.idx === titleIdx) return false;
        if (badgeSet.indexOf(f.idx) >= 0) return false;
        if (usedGeneric === false && RE_SKIP_FIELD.test(f.header)) return false;   // 序号不重复显示
        return true;
      });

      // 牵头部门（一个格里可能写多个部门，用、，/；或换行拆开）
      var depts = [];
      if (deptIdx >= 0) {
        depts = fields[deptIdx].value.split(/[\s、,，/；;]+/).map(function (s) {
          return s.trim();
        }).filter(function (s) { return s; });
      }

      // 完成状态（用于左侧“按完成状态”筛选）：只取第一行，格子里的多行备注不参与筛选
      var stat = statIdx >= 0 ? fields[statIdx].value.split(/[\n\r]/)[0].trim() : "";
      if (stat.length > 10) stat = "";    // 状态列写了长句子就不当筛选项，避免侧栏太长

      // 卡片编号：优先用表里的序号（唯一的，方便回 xlsx 里找）；没写就退回行号
      var no = noIdx >= 0 ? fields[noIdx].value : "";
      if (no.length > 10) no = "";        // 那一列不是序号（写了长内容）就不要了

      // 分组标题行：整行只填了头一格（如「7月7日督导检查发现问题」），也没有序号
      // → 当一个段小标题显示，不算一项任务（以前会被当成卡片，编号还会跟下一行重复）
      var filled = fields.filter(function (f) { return !isEmpty(f.value); }).length;
      var heading = (filled <= 2 && !no && title !== "" && title !== "（无标题）");

      // 表里序号撞车时（同一序号出现多次）给第 2 个起加后缀：3、3-2、3-3…，保证卡片编号唯一
      if (!heading && no) {
        noSeen[no] = (noSeen[no] || 0) + 1;
        if (noSeen[no] > 1) no = no + "-" + noSeen[no];
      }

      return {
        id: ri, title: title || "（无标题）", badges: badges, body: body,
        raw: fields, depts: depts, stat: stat, no: no, heading: heading
      };
    });

    return { headers: headers, records: recs, usedGeneric: usedGeneric };
  }

  // ---------- 渲染 ----------
  function render() {
    if (!sheetName) return;
    var ws = Wb.Sheets[sheetName];
    var parsed = parseSheet(ws);
    var q = el("q").value.trim().toLowerCase();

    var tasks = parsed.records.filter(function (r) { return !r.heading; });   // 真任务（分组标题行不算）
    renderNav(tasks);
    renderStatNav(tasks);

    // 哪些任务通过筛选（命中记在 ok 里）
    var ok = {};
    var wantStat = curStat === NONE ? "" : curStat;     // 「未填写」→ 状态为空的那批
    tasks.forEach(function (r) {
      // 部门过滤（curDept === NONE 就是“部门没填”的那批）
      if (curDept) {
        if (curDept === NONE ? r.depts.length > 0 : r.depts.indexOf(curDept) < 0) return;
      }
      if (curStat && r.stat !== wantStat) return;                     // 状态过滤
      if (q) {
        var hay = r.raw.map(function (f) { return f.value; }).join(" ").toLowerCase();
        if (hay.indexOf(q) < 0) return;
      }
      ok[r.id] = true;
    });

    // 按表格原顺序输出：遇到分组标题行就插一句小标题（下面没任务就不显示）
    var html = "", shown = 0, group = "";
    parsed.records.forEach(function (r) {
      if (r.heading) { group = r.title; return; }
      if (!ok[r.id]) return;
      if (group) { html += '<div class="group">' + esc(group) + "</div>"; group = ""; }
      shown++;
      html += cardHtml(r, shown);
    });

    el("out").innerHTML = shown
      ? html
      : '<div id="drop"><h2>没有匹配的记录</h2><p>试试换个关键词，或清空搜索 / 筛选条件。</p></div>';

    // 恢复每张卡片的展开/收起状态
    Array.prototype.forEach.call(el("out").querySelectorAll(".card"), function (c) {
      if (allOpen || openSet[c.getAttribute("data-id")]) c.classList.add("open");
    });

    var tips = [];
    if (curDept) tips.push("【" + navLabel(curDept) + "】");
    if (curStat) tips.push("【" + navLabel(curStat) + "】");
    el("status").textContent =
      tips.join("") +
      "共 " + tasks.length + " 项任务" +
      ((q || curDept || curStat) ? "，显示 " + shown + " 项" : "") +
      (parsed.usedGeneric ? "（未识别到表头）" : "");
  }

  // ---------- 一张卡片（n = 列表里第几张，没序号时拿它当编号） ----------
  function cardHtml(r, n) {
    // 标签
    var badges = r.badges.map(function (b) {
      return '<span class="badge ' + badgeClass(b.header, b.value) + '">' +
             "<b>" + esc(b.header) + "</b>" + esc(b.value) + "</span>";
    }).join("");

    // 正文：长文本整行铺开；一个可显示的字段都没有时给一句说明，别让卡片打开是空的
    var body = r.body.map(function (f) {
      var blank = isEmpty(f.value);
      if (blank && !showEmpty) return "";
      var wide = RE_LONG.test(f.header) || f.value.length > 60;
      return '<div class="field' + (wide ? " wide" : "") + '">' +
               '<div class="lbl">' + esc(f.header) + "</div>" +
               '<div class="val' + (blank ? " blank" : "") + '">' +
                 (blank ? "（空）" : esc(f.value)) +
               "</div>" +
             "</div>";
    }).join("");
    if (!body) {
      body = '<div class="field wide"><div class="val blank">' +
             "（这一行在表里只有标题那一列有字，其余列都是空的）" +
             "</div></div>";
    }

    return '<article class="card" data-id="' + r.id + '">' +
             '<div class="card-head">' +
               '<div class="caret">▶</div>' +
               '<div class="idx">' + esc(r.no || n) + "</div>" +
               '<div class="head-main">' +
                 '<h3 class="card-title">' + esc(r.title) + "</h3>" +
                 (badges ? '<div class="badges">' + badges + "</div>" : "") +
               "</div>" +
             "</div>" +
             '<div class="fields">' + body + "</div>" +
           "</article>";
  }

  // ---------- 左侧导航：按牵头部门分组（按数量从多到少） ----------
  function renderNav(records) {
    var map = {};
    records.forEach(function (r) {
      if (!r.depts.length) {
        map[NONE] = (map[NONE] || 0) + 1;   // 部门为空时单独归类
        return;
      }
      r.depts.forEach(function (d) { map[d] = (map[d] || 0) + 1; });
    });

    var names = Object.keys(map).sort(function (a, b) {
      if (a === NONE) return 1;
      if (b === NONE) return -1;
      return map[b] - map[a] || a.localeCompare(b, "zh");
    });

    var html = '<div class="nav-item' + (curDept ? "" : " active") + '" data-dept="">' +
                 '<span class="nname">全部</span><span class="cnt">' + records.length + "</span></div>";
    html += names.map(function (n) {
      return '<div class="nav-item' + (n === curDept ? " active" : "") + '" data-dept="' + esc(n) + '">' +
               '<span class="nname">' + esc(navLabel(n)) + '</span><span class="cnt">' + map[n] + "</span></div>";
    }).join("");

    el("nav").innerHTML = html;
    // 只有一个部门（或没有）时隐藏部门分组区
    var multi = names.length > 1;
    el("nav").hidden = !multi;
    el("navTitle").hidden = !multi;
  }

  // ---------- 左侧导航：按完成状态分组 ----------
  function renderStatNav(records) {
    var map = {};
    records.forEach(function (r) {
      var k = r.stat || NONE;
      map[k] = (map[k] || 0) + 1;
    });

    var names = Object.keys(map).sort(function (a, b) {
      if (a === NONE) return 1;
      if (b === NONE) return -1;
      return map[b] - map[a] || a.localeCompare(b, "zh");
    });

    // 没有状态列（或只有一个取值）就整块不显示
    if (names.length < 2) {
      el("statNav").hidden = true;
      el("statTitle").hidden = true;
      curStat = "";
      return;
    }

    var html = '<div class="nav-item' + (curStat ? "" : " active") + '" data-stat="">' +
                 '<span class="nname">全部</span></div>' +
      names.map(function (n) {
        return '<div class="nav-item' + (n === curStat ? " active" : "") + '" data-stat="' + esc(n) + '">' +
                 '<span class="nname">' + esc(navLabel(n)) + '</span><span class="cnt">' + map[n] + "</span></div>";
      }).join("");

    el("statNav").innerHTML = html;
    el("statNav").hidden = false;
    el("statTitle").hidden = false;
  }

  // ---------- 选择要展示的工作表 ----------
  function pickSheet(names) {
    if (names.indexOf(MAIN_SHEET) >= 0) return MAIN_SHEET;
    // 兜底：取第一张不是“说明/字典/封面”的正式表
    for (var i = 0; i < names.length; i++) {
      if (!/说明|字典|封面|目录|sheet[0-9]?$/i.test(names[i])) return names[i];
    }
    return names[0];
  }

  // ---------- 读文件 ----------
  function loadFile(file) {
    var fr = new FileReader();
    fr.onload = function (e) {
      try {
        // cellDates: 让 Excel 日期直接变成 Date，便于统一格式化
        Wb = XLSX.read(new Uint8Array(e.target.result), { type: "array", cellDates: true });
      } catch (err) {
        alert("读取失败：文件可能不是有效的 xlsx。\n" + err.message);
        return;
      }
      var names = Wb.SheetNames;
      sheetName = pickSheet(names);
      if (!Wb.Sheets[sheetName]) {
        alert("文件里没有可展示的数据表。");
        return;
      }
      el("drop") && (el("drop").style.display = "none");
      render();
    };
    fr.readAsArrayBuffer(file);
  }

  // ---------- 事件绑定 ----------
  // 牵头部门：点击切换筛选
  el("nav").addEventListener("click", function (e) {
    var item = e.target.closest ? e.target.closest(".nav-item") : null;
    if (!item) return;
    curDept = item.getAttribute("data-dept") || "";
    openSet = {}; allOpen = false;          // 切筛选时收起，保持清爽
    el("expand").textContent = "全部展开"; el("expand").classList.remove("on");
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  // 完成状态：点击切换筛选
  el("statNav").addEventListener("click", function (e) {
    var item = e.target.closest ? e.target.closest(".nav-item") : null;
    if (!item) return;
    curStat = item.getAttribute("data-stat") || "";
    openSet = {}; allOpen = false;
    el("expand").textContent = "全部展开"; el("expand").classList.remove("on");
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  el("pick").onclick = function () { el("file").click(); };
  el("file").onchange = function () { if (this.files[0]) loadFile(this.files[0]); };
  el("q").oninput = render;
  el("zoom").onchange = function () { el("out").style.zoom = this.value; };   // 整体缩放
  el("minus").onclick = function () { fs = Math.max(12, fs - 1); document.documentElement.style.setProperty("--fs", fs + "px"); };
  el("plus").onclick = function () { fs = Math.min(34, fs + 1); document.documentElement.style.setProperty("--fs", fs + "px"); };
  el("expand").onclick = function () {
    allOpen = !allOpen;
    openSet = {};
    this.textContent = allOpen ? "全部收起" : "全部展开";
    this.classList.toggle("on", allOpen);
    render();
  };
  // 点击标题栏收起/展开单张卡片（不整页重绘）
  el("out").addEventListener("click", function (e) {
    var head = e.target.closest ? e.target.closest(".card-head") : null;
    if (!head) return;
    var card = head.parentNode;
    var id = card.getAttribute("data-id");
    var open = !card.classList.contains("open");
    card.classList.toggle("open", open);
    if (open) openSet[id] = true; else delete openSet[id];
  });
  el("reset").onclick = function () {
    fs = 17; document.documentElement.style.setProperty("--fs", fs + "px");
    el("out").style.zoom = "";
    el("zoom").value = "100%";
    showEmpty = false; el("empty").classList.remove("on");
    allOpen = false; openSet = {};
    el("expand").textContent = "全部展开"; el("expand").classList.remove("on");
    curDept = ""; curStat = "";
    el("q").value = ""; render();
  };
  el("empty").onclick = function () {
    showEmpty = !showEmpty; this.classList.toggle("on", showEmpty); render();
  };
  el("print").onclick = function () { window.print(); };

  // 拖拽投放（拖到页面任意位置都行）
  ["dragenter", "dragover"].forEach(function (ev) {
    window.addEventListener(ev, function (e) { e.preventDefault(); document.body.classList.add("hover"); });
  });
  ["dragleave", "drop"].forEach(function (ev) {
    window.addEventListener(ev, function (e) { e.preventDefault(); document.body.classList.remove("hover"); });
  });
  window.addEventListener("drop", function (e) {
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) loadFile(f);
  });
})();
