/* B757/767 标准操作程序 R05 · 第 1 章 —— 交互
   做的事：
     ① 按正文里的 h2/h3/h4 生成左侧目录，滚动时高亮当前小节；
     ② 搜索：高亮命中、↑/↓ 跳命中、显示第几个 / 共几个；
     ③ 点小节标题折叠 / 展开（工具栏有「全部收起 / 全部展开」）；
     ④ 字号 A－ / A＋（存在本机）、亮暗模式、打印、回到顶部；
     ⑤ 工具栏「收起目录 / 显示目录」：把左边目录栏藏起来，手机上只看正文（状态存在本机）。
   正文本身是静态 HTML（由 sop_ch1_to_html.py 生成），这里只做交互。
*/
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var doc = $("doc");
  var toc = $("toc");
  var FS_KEY = "sop:fs";
  var THEME_KEY = "sop:theme";

  /* ============================== 正文注入 ============================== */

  /** 把 data/ 里各章的正文按顺序放进 #doc（页面上没有正文，只有壳子） */
  function injectChapters() {
    var list = window.SOP_CHAPTERS || [];
    if (!doc || !list.length) return;
    doc.innerHTML = list.map(function (c) {
      return '<div class="chapter" data-ch="' + c.no + '">' + (c.html || "") + "</div>";
    }).join("");
  }

  /* ============================== 左侧目录 ============================== */

  var headings = [];          // 参与目录的标题（h1/h2/h3/h4）
  var groupSeq = 0;           // 目录分组的编号
  var offs = [];              // 各标题的绝对纵向位置（缓存；不然滚动时挨个读布局，长文档会很卡）
  var needMeasure = true;     // 需要重新量位置（刚加载 / 折叠变了 / 窗口尺寸变了）

  function measure() {
    offs = headings.map(function (h) {
      return h.el ? h.el.getBoundingClientRect().top + window.pageYOffset : 0;
    });
    needMeasure = false;
  }

  var esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  };

  /** 把标题列表拼成树：章 → 节 → 子节 → 更细的节 */
  function buildTree(items) {
    var root = [], stack = [];
    items.forEach(function (it) {
      var node = { item: it, kids: [] };
      while (stack.length && stack[stack.length - 1].item.level >= it.level) stack.pop();
      if (stack.length) stack[stack.length - 1].kids.push(node);
      else root.push(node);
      stack.push(node);
    });
    return root;
  }

  /** 一条目录（带 ▸ 三角，有子目录的才给三角） */
  function tocNodeHtml(node) {
    var it = node.item;
    var gid = "g" + (groupSeq++);
    var hasKids = node.kids.length > 0;
    var h = '<div class="toc-group">';
    h += '<div class="toc-row lv' + it.level + '">';
    h += hasKids
      ? '<button type="button" class="toc-caret" data-g="' + gid + '" title="展开 / 收起这一段的子目录">▸</button>'
      : '<span class="toc-caret is-empty"></span>';
    h += '<a href="#' + it.id + '" data-i="' + it.i + '">' + esc(it.text) + "</a>";
    h += "</div>";
    if (hasKids) {
      h += '<div class="toc-kids" data-kids="' + gid + '" data-lv="' + it.level + '" hidden>'
         + node.kids.map(tocNodeHtml).join("") + "</div>";
    }
    h += "</div>";
    return h;
  }

  /** 展开 / 收起某一组子目录 */
  function tocSetGroup(gid, open) {
    if (!toc) return;
    var kids = toc.querySelector('[data-kids="' + gid + '"]');
    var btn = toc.querySelector('.toc-caret[data-g="' + gid + '"]');
    if (kids) kids.hidden = !open;
    if (btn) btn.textContent = open ? "▾" : "▸";
  }

  /** 全部展开 / 全部收起（按钮文案跟着变） */
  function tocSetAll(open) {
    if (!toc) return;
    Array.prototype.forEach.call(toc.querySelectorAll("[data-kids]"), function (k) { k.hidden = !open; });
    Array.prototype.forEach.call(toc.querySelectorAll(".toc-caret[data-g]"), function (b) { b.textContent = open ? "▾" : "▸"; });
    var all = $("btn-toc-all");
    if (all) all.textContent = open ? "⤡ 全部收起" : "⤢ 全部展开";
  }

  /** 只展开到第几级（maxLv = 父节点的层级：1 = 只展开章下面那一层） */
  function tocSetDepth(maxLv) {
    if (!toc) return;
    Array.prototype.forEach.call(toc.querySelectorAll("[data-kids]"), function (k) {
      var open = parseInt(k.getAttribute("data-lv"), 10) <= maxLv;
      k.hidden = !open;
      var btn = toc.querySelector('.toc-caret[data-g="' + k.getAttribute("data-kids") + '"]');
      if (btn) btn.textContent = open ? "▾" : "▸";
    });
    var all = $("btn-toc-all");
    if (all) all.textContent = "⤢ 全部展开";
  }

  /** 把这一条的所有上级展开，让它露出来 */
  function tocReveal(a) {
    var node = a.parentNode;
    while (node && node !== toc) {
      if (node.classList && node.classList.contains("toc-kids")) {
        node.hidden = false;
        var btn = toc.querySelector('.toc-caret[data-g="' + node.getAttribute("data-kids") + '"]');
        if (btn) btn.textContent = "▾";
      }
      node = node.parentNode;
    }
  }

  function buildToc() {
    if (!toc || !doc) return;

    headings = Array.prototype.slice.call(
      doc.querySelectorAll("h1.doc-title, h2.sec-title, h3.sub-title, h4.sub-title")
    ).map(function (h, i) {
      if (!h.id) h.id = "sec-" + i;
      var tag = h.tagName === "H2" ? 2 : (h.tagName === "H3" ? 3 : (h.tagName === "H4" ? 4 : 1));
      return { i: i, id: h.id, level: tag, text: h.textContent.trim(), el: h };
    });

    groupSeq = 0;
    toc.innerHTML = buildTree(headings).map(tocNodeHtml).join("") ||
      '<span class="side-foot">（没识别到小节标题）</span>';

    // 默认全部折叠：只露出 7 个章名，点章名右边的 ▸ 逐级展开
    tocSetDepth(0);
  }

  /** 目录点击：三角 = 展开/收起；标题 = 跳过去（并把它所在的子目录展开） */
  function bindToc() {
    if (!toc) return;

    toc.addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest(".toc-caret[data-g]") : null;
      if (btn) {
        e.preventDefault();
        var kids = toc.querySelector('[data-kids="' + btn.getAttribute("data-g") + '"]');
        tocSetGroup(btn.getAttribute("data-g"), kids ? kids.hidden : false);
        return;
      }

      var a = e.target.closest ? e.target.closest("a[data-i]") : null;
      if (!a) return;
      e.preventDefault();
      tocReveal(a);
      // 点「1.3 机组资源管理」这类标题时，顺便把它下面的子目录展开一级
      var caret = a.parentNode ? a.parentNode.querySelector(".toc-caret[data-g]") : null;
      if (caret) tocSetGroup(caret.getAttribute("data-g"), true);
      var h = headings[+a.getAttribute("data-i")];
      if (h && h.el) {
        // 目标小节如果是收起的，先展开，不然跳过去看不见内容
        var sec = h.el.closest ? h.el.closest(".sec") : null;
        if (sec && sec.classList.contains("is-folded")) setFold(sec, false);
        var top = h.el.getBoundingClientRect().top + window.pageYOffset - 88;
        // 直接跳到位：文档很大，平滑滚动要滚很久
        window.scrollTo(0, top < 0 ? 0 : top);
        spyLock = 0;
        spy();
      }
    });
  }

  /** 滚动时高亮当前小节 */
  var spyLock = 0;
  function spy() {
    if (!headings.length) return;
    if (Date.now() < spyLock) return;         // 点目录跳转期间别抢
    if (needMeasure) measure();
    var line = window.pageYOffset + 100;
    var cur = 0;
    for (var i = 0; i < offs.length; i++) {
      if (offs[i] <= line) cur = i;           // 收起的标题位置是 0，所以不提前 break
    }
    var links = toc.querySelectorAll("a");
    for (var k = 0; k < links.length; k++) links[k].classList.toggle("is-on", +links[k].getAttribute("data-i") === cur);
    var on = toc.querySelector("a.is-on");
    if (on && on.scrollIntoView) {
      var box = toc.parentNode.getBoundingClientRect(), r = on.getBoundingClientRect();
      if (r.top < box.top || r.bottom > box.bottom) on.scrollIntoView({ block: "nearest" });
    }
  }

  /* ============================== 折叠 ============================== */

  function setFold(sec, folded) {
    if (!sec) return;
    sec.classList.toggle("is-folded", !!folded);
    needMeasure = true;                       // 折叠会改变后面所有标题的位置
    var t = sec.querySelector(".sec-title");
    if (t) t.title = folded ? "点一下展开这一节" : "点一下收起这一节";
  }

  function bindFold() {
    doc.addEventListener("click", function (e) {
      var t = e.target.closest ? e.target.closest(".sec-title") : null;
      if (!t) return;
      var sec = t.closest(".sec");
      if (sec) setFold(sec, !sec.classList.contains("is-folded"));
    });
  }

  var allFolded = false;
  function foldAll() {
    allFolded = !allFolded;
    Array.prototype.forEach.call(doc.querySelectorAll(".sec"), function (s) { setFold(s, allFolded); });
    var b = $("btn-fold");
    if (b) b.textContent = allFolded ? "▸ 全部展开" : "▾ 全部收起";
  }

  /* ============================== 搜索 ============================== */

  var hits = [], hitIdx = -1, query = "";

  function clearHits() {
    Array.prototype.forEach.call(doc.querySelectorAll("mark"), function (m) {
      var p = m.parentNode;
      p.replaceChild(document.createTextNode(m.textContent), m);
      p.normalize();
    });
    hits = []; hitIdx = -1;
    var info = $("hit-info");
    if (info) info.hidden = true;
  }

  /** 在正文里标黄所有命中；跳过脚本 / 已标记的节点 */
  function markAll(q) {
    var walker = document.createTreeWalker(doc, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        var p = n.parentNode;
        if (!p || p.nodeName === "SCRIPT" || p.nodeName === "STYLE" || p.nodeName === "MARK") return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var nodes = [], n;
    while ((n = walker.nextNode())) nodes.push(n);

    nodes.forEach(function (node) {
      var text = node.nodeValue, low = text.toLowerCase(), i = low.indexOf(q);
      if (i < 0) return;
      var frag = document.createDocumentFragment(), pos = 0;
      while (i >= 0) {
        if (i > pos) frag.appendChild(document.createTextNode(text.slice(pos, i)));
        var mk = document.createElement("mark");
        mk.textContent = text.slice(i, i + q.length);
        frag.appendChild(mk);
        hits.push(mk);
        pos = i + q.length;
        i = low.indexOf(q, pos);
      }
      if (pos < text.length) frag.appendChild(document.createTextNode(text.slice(pos)));
      node.parentNode.replaceChild(frag, node);
    });
  }

  function gotoHit(step) {
    if (!hits.length) return;
    if (hitIdx >= 0 && hits[hitIdx]) hits[hitIdx].classList.remove("is-cur");
    hitIdx = (hitIdx + step + hits.length) % hits.length;
    var m = hits[hitIdx];
    m.classList.add("is-cur");
    // 命中在收起的小节里就先展开
    var sec = m.closest ? m.closest(".sec") : null;
    if (sec && sec.classList.contains("is-folded")) setFold(sec, false);
    m.scrollIntoView({ block: "center" });     // 直接跳，不做动画
    var info = $("hit-info");
    if (info) { info.hidden = false; info.textContent = (hitIdx + 1) + " / " + hits.length; }
  }

  function doSearch() {
    var box = $("q");
    var q = (box.value || "").trim().toLowerCase();
    clearHits();
    if (!q) { query = ""; return; }
    query = q;
    markAll(q);
    var info = $("hit-info");
    if (!hits.length) {
      if (info) { info.hidden = false; info.textContent = "没找到"; }
      return;
    }
    hitIdx = -1;
    gotoHit(1);
  }

  /* ============================== 事件绑定 ============================== */

  function applyFs(v) {
    var fs = Math.min(26, Math.max(13, v));
    document.documentElement.style.setProperty("--fs", fs + "px");
    try { localStorage.setItem(FS_KEY, String(fs)); } catch (e) { /* 忽略 */ }
  }

  function applyTheme(t) {
    var theme = t === "light" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* 忽略 */ }
    var b = $("btn-theme");
    if (b) b.textContent = theme === "light" ? "☾ 暗色" : "☀ 亮色";
  }

  // 从本机读上次的字号 / 模式
  try {
    var savedFs = parseInt(localStorage.getItem(FS_KEY) || "", 10);
    if (!isNaN(savedFs)) applyFs(savedFs);
    applyTheme(localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light");
  } catch (e) { applyTheme("light"); }

  $("btn-plus") && ($("btn-plus").onclick = function () {
    applyFs(parseInt(getComputedStyle(document.documentElement).getPropertyValue("--fs"), 10) + 1 || 18);
  });
  $("btn-minus") && ($("btn-minus").onclick = function () {
    applyFs((parseInt(getComputedStyle(document.documentElement).getPropertyValue("--fs"), 10) || 17) - 1);
  });
  $("btn-theme") && ($("btn-theme").onclick = function () {
    applyTheme(document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light");
  });
  $("btn-fold") && ($("btn-fold").onclick = foldAll);

  /* ============================== 左目录栏收起 / 显示 ============================== */

  var SIDE_KEY = "sop:side";

  function applySide(hidden, save) {
    document.body.classList.toggle("side-hidden", !!hidden);
    var b = $("btn-side");
    if (b) {
      b.textContent = hidden ? "⇥ 显示目录" : "⇤ 收起目录";
      b.title = hidden ? "把左侧目录栏显示出来" : "把左侧目录栏收起来（手机上看正文更舒服）";
    }
    if (save) {
      try { localStorage.setItem(SIDE_KEY, hidden ? "hidden" : "show"); } catch (e) { /* 隐私模式忽略 */ }
    }
  }

  (function bindSide() {
    var b = $("btn-side");
    if (!b) return;
    var saved = null;
    try { saved = localStorage.getItem(SIDE_KEY); } catch (e) { /* 隐私模式忽略 */ }
    // 没记录过：窄屏（手机）默认收起，宽屏默认显示
    applySide(saved ? saved === "hidden" : window.innerWidth <= 900, false);
    b.onclick = function () {
      applySide(!document.body.classList.contains("side-hidden"), true);
    };
  })();

  var qbox = $("q");
  if (qbox) {
    var timer = null;
    qbox.addEventListener("input", function () {
      clearTimeout(timer);
      timer = setTimeout(doSearch, 220);          // 打字停一下再搜，长文档才不卡
    });
    qbox.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); hits.length ? gotoHit(e.shiftKey ? -1 : 1) : doSearch(); }
      if (e.key === "Escape") { qbox.value = ""; doSearch(); }
    });
  }
  $("next-hit") && ($("next-hit").onclick = function () { gotoHit(1); });
  $("prev-hit") && ($("prev-hit").onclick = function () { gotoHit(-1); });

  document.addEventListener("keydown", function (e) {
    // Ctrl/Cmd + F 直接用页内的搜索框
    if ((e.ctrlKey || e.metaKey) && (e.key === "f" || e.key === "F")) {
      e.preventDefault();
      if (qbox) { qbox.focus(); qbox.select(); }
    }
  });

  // 回到顶部
  var top = $("to-top");
  if (top) {
    top.onclick = function () { window.scrollTo(0, 0); };      // 直接回顶，不做动画
    window.addEventListener("scroll", function () {
      top.hidden = window.pageYOffset < 600;
      spy();
    }, { passive: true });
  } else {
    window.addEventListener("scroll", spy, { passive: true });
  }

  // 窗口尺寸变了，标题位置会变，重新量一次
  window.addEventListener("resize", function () { needMeasure = true; }, { passive: true });

  // 目录栏的「全部展开 / 全部收起」
  var tocAll = $("btn-toc-all");
  if (tocAll) tocAll.onclick = function () {
    tocSetAll(tocAll.textContent.indexOf("收起") < 0);     // 现在是「全部展开」→ 去展开
  };

  /* ============================== 启动 ============================== */
  injectChapters();
  buildToc();
  bindToc();
  bindFold();
  spy();
})();
