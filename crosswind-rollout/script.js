/* ============================================================
   大侧风落地滑跑 · 反推 / 减速板 / 刹车 与方向控制
   ============================================================ */
(function () {
  "use strict";

  /* ---------- 关键帧 ----------
     p 进度 | x 沿跑道 | dy 侧向偏移 | rot 机头偏角
     v 地速kt | rev 反推% | brk 刹车% | spl 减速板(0未展开/1展开)
  ------------------------------- */
  const KF = [
    { p: 0.00, x: 0.064, dy: 0,  rot: 0,    v: 142, rev: 0,   brk: 0,   spl: 0 },
    { p: 0.03, x: 0.082, dy: 0,  rot: 0,    v: 139, rev: 0,   brk: 5,   spl: 1 },
    { p: 0.08, x: 0.116, dy: 0,  rot: 0,    v: 134, rev: 25,  brk: 12,  spl: 1 },
    { p: 0.14, x: 0.160, dy: 0,  rot: 0,    v: 127, rev: 100, brk: 20,  spl: 1 },
    { p: 0.26, x: 0.258, dy: 0,  rot: 0,    v: 107, rev: 100, brk: 25,  spl: 1 },
    { p: 0.38, x: 0.346, dy: 1,  rot: -0.5, v: 88,  rev: 100, brk: 30,  spl: 1 },
    { p: 0.48, x: 0.414, dy: 3,  rot: -2,   v: 72,  rev: 100, brk: 35,  spl: 1 },
    { p: 0.58, x: 0.468, dy: 8,  rot: -5,   v: 60,  rev: 100, brk: 38,  spl: 1 },
    { p: 0.68, x: 0.512, dy: 15, rot: -9,   v: 51,  rev: 100, brk: 40,  spl: 1 },
    { p: 0.74, x: 0.538, dy: 21, rot: -12,  v: 45,  rev: 100, brk: 40,  spl: 1 },
    { p: 0.79, x: 0.554, dy: 24, rot: -13,  v: 41,  rev: 12,  brk: 0,   spl: 1 },
    { p: 0.85, x: 0.598, dy: 22, rot: -8,   v: 36,  rev: 8,   brk: 0,   spl: 1 },
    { p: 0.90, x: 0.652, dy: 14, rot: -3,   v: 31,  rev: 5,   brk: 0,   spl: 1 },
    { p: 0.94, x: 0.704, dy: 5,  rot: -0.5, v: 27,  rev: 10,  brk: 5,   spl: 1 },
    { p: 0.96, x: 0.744, dy: 1,  rot: 0,    v: 24,  rev: 55,  brk: 25,  spl: 1 },
    { p: 0.99, x: 0.834, dy: 0,  rot: 0,    v: 10,  rev: 85,  brk: 60,  spl: 1 },
    { p: 1.00, x: 0.874, dy: 0,  rot: 0,    v: 0,   rev: 15,  brk: 100, spl: 1 }
  ];

  /* ---------- 阶段 ---------- */
  const PHASES = [
    { from: 0.00, to: 0.14, color: "#16a34a", title: "接地 · 第一步是把减速板拉出来",
      text: "主轮接地。拉出减速板（扰流板）破坏升力，把飞机的重量真正压到轮子上——轮子压得越实，刹车才越管用、方向才越好控制。这一步做不好，后面全白搭。" },
    { from: 0.14, to: 0.46, color: "#16a34a", title: "反推全开 · 减速很猛，方向还稳",
      text: "减速板已展开、反推全开，减速很猛。速度还高，方向舵压得住，一切看起来都正常。" },
    { from: 0.46, to: 0.68, color: "#d97706", title: "进入危险窗口（约 70 → 50 节）",
      text: "速度掉下来了。方向舵越来越没劲，可侧风对机身却越来越横——需要的力气变大，能给的力气变小。" },
    { from: 0.68, to: 0.79, color: "#dc2626", title: "方向失控 · 越偏越多",
      text: "压不住了。机头被风推着往一侧偏，飞机同时朝下风侧滑。这时轮胎的抓地力已经被反推和刹车用满了。" },
    { from: 0.79, to: 0.86, color: "#2563eb", title: "⑤ 收反推 + 松刹车 · 两个一起放",
      text: "关键动作：反推对称收回的同时把刹车松开。纵向力一下少掉一大半，轮胎立刻腾出横向抓地力——这是恢复最快的一步。" },
    { from: 0.86, to: 0.955, color: "#2563eb", title: "方向恢复 · 回到中线",
      text: "用方向舵和前轮把机头带回中线，偏转和侧滑都停住了。减速板保持展开，别动它。" },
    { from: 0.955, to: 0.99, color: "#2563eb", title: "⑦ 方向稳了 · 再加反推、再踩刹车",
      text: "确认方向可控之后，再把反推一点点加上去、同时踩刹车，把剩下的速度减完。顺序不能反：先方向，后减速。" },
    { from: 0.99, to: 1.01, color: "#16a34a", title: "⑧ 在跑道内停住",
      text: "全程没有冲出跑道。关键不是少用反推，而是方向一丢就立刻收反推、松刹车，稳住之后再补回来。" }
  ];

  /* ---------- 关键节点 ---------- */
  const NODES = [
    { p: 0.00, label: "① 接地" },
    { p: 0.14, label: "② 反推全开" },
    { p: 0.48, label: "③ 危险窗口" },
    { p: 0.74, label: "④ 方向失控" },
    { p: 0.79, label: "⑤ 收反推+松刹车" },
    { p: 0.90, label: "⑥ 方向恢复" },
    { p: 0.96, label: "⑦ 再加反推+刹车" },
    { p: 1.00, label: "⑧ 停住" }
  ];

  /* ---------- 几何 ---------- */
  const X0 = 24;
  const XW = 1152;
  const YC = 170;
  const PX_PER_M = 4;

  /* ---------- 受力模型（固定示例气象/道面条件） ---------- */
  const W_N = 637.6e3, MU = 0.25, VW_KT = 35;

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  function forces(vKt, revPct, brkPct, spl) {
    const Vg = Math.max(vKt, 0.5) * 0.514444;
    const Vw = VW_KT * 0.514444;
    const rf = revPct / 100;
    const T = 90000 * rf;
    const low = 1 - Math.min(1, Vg / 50);
    const Vr = Math.hypot(Vg, Vw);

    /* 偏转力矩需求 */
    const Mside = 237.7 * Vw * Vr;
    const Masym = T * 0.15 * 5.5;
    const Mplume = 0.6 * T * (Vw / 15) * low;
    const Mreq = Mside + Masym + Mplume;

    /* 轮上载荷：减速板展开 -> 升力被破坏 -> 重量压到轮子上 */
    const CL = 1.55 + (0.40 - 1.55) * clamp(spl, 0, 1);
    const L = 0.5 * 1.225 * Vg * Vg * 124 * CL;
    const Weff = clamp(W_N - L, 0.30 * W_N, W_N);

    const Nnose = Math.max(0.25 * 0.12 * Weff, 0.12 * Weff - T * 1.5 / 15.6);
    const Nmain = Weff - Nnose;
    const grip = MU * Nmain;                      /* 主轮总抓地力上限 */

    /* 纵向占用：反推 + 刹车（防滞限制，刹车不能超过剩余抓地力） */
    const Fbrk = Math.min((brkPct / 100) * grip * 0.95, Math.max(0, grip - T));
    const Fx = T + Fbrk;
    const sigma = clamp(Fx / grip, 0, 1);
    const lateral = Math.sqrt(Math.max(0, 1 - sigma * sigma));

    /* 可用偏航力矩 */
    const Mrud = 150 * 0.5 * 1.225 * Vg * Vg * (1 - 0.3 * rf * low);
    const eta = Math.min(1, Math.max(0.45, 1 - Math.max(0, vKt - 40) / 160));
    const Fnws = MU * Nnose * eta;
    const Mnws = Fnws * 15.6 * 0.40;
    const Mdiff = Math.max(0, grip - Fx) * 5.7 * 0.5 * 0.5;
    const Mavail = Mrud + Mnws + Mdiff;

    return {
      Fside: Mside / 8.5,
      Fnws: Fnws,
      req: Mreq / 1000,
      avail: Mavail / 1000,
      sigma: sigma,
      lateral: lateral,
      saturated: sigma > 0.985
    };
  }

  /* ---------- 工具 ---------- */
  const $ = function (id) { return document.getElementById(id); };
  const lerp = function (a, b, t) { return a + (b - a) * t; };
  const ease = function (t) { return t * t * (3 - 2 * t); };

  function sample(p) {
    p = clamp(p, 0, 1);
    let i = 0;
    while (i < KF.length - 2 && p > KF[i + 1].p) i++;
    const a = KF[i], b = KF[i + 1];
    const span = b.p - a.p;
    const t = span > 0 ? ease(clamp((p - a.p) / span, 0, 1)) : 0;
    return {
      x: lerp(a.x, b.x, t),
      dy: lerp(a.dy, b.dy, t),
      rot: lerp(a.rot, b.rot, t),
      v: lerp(a.v, b.v, t),
      rev: lerp(a.rev, b.rev, t),
      brk: lerp(a.brk, b.brk, t),
      spl: lerp(a.spl, b.spl, t)
    };
  }

  function phaseOf(p) {
    for (let i = 0; i < PHASES.length; i++) {
      if (p >= PHASES[i].from && p < PHASES[i].to) return { ph: PHASES[i], idx: i };
    }
    return { ph: PHASES[PHASES.length - 1], idx: PHASES.length - 1 };
  }

  function px(s) { return X0 + s.x * XW; }
  function py(s) { return YC + s.dy; }

  /* ---------- 渲染 ---------- */
  const prog = $("prog");

  function render() {
    const p = prog.value / 1000;
    const s = sample(p);
    const f = forces(s.v, s.rev, s.brk, s.spl);
    const cx = px(s), cy = py(s);

    /* 1. 飞机 */
    $("acft").setAttribute("transform",
      "translate(" + cx.toFixed(1) + "," + cy.toFixed(1) + ") rotate(" + s.rot.toFixed(2) + ")");
    $("jet").setAttribute("opacity", (s.rev / 100).toFixed(2));

    /* 2. 受力箭头 */
    const halo = function (x1, y1, x2, y2, col, mk) {
      return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 +
        '" stroke="#0f1720" stroke-width="7" stroke-linecap="round" opacity=".35"/>' +
        '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 +
        '" stroke="' + col + '" stroke-width="4" stroke-linecap="round" marker-end="url(#' + mk + ')"/>';
    };

    let fg = "";
    const Lr = 46 * (s.rev / 100);
    if (Lr > 3) {
      fg += halo(-17, -24, -17 - Lr, -24, "#fb923c", "mOrg");
      fg += halo(-17, 24, -17 - Lr, 24, "#fb923c", "mOrg");
    }
    const Ls = 12 + Math.min(36, f.Fside * 0.9);
    fg += halo(0, 10, 0, 10 + Ls, "#f87171", "mRed");
    const Ln = 10 + Math.min(28, f.Fnws * 1.4);
    fg += halo(22, -6, 22, -6 - Ln, "#4ade80", "mGrn");

    if (f.req > f.avail + 1) {
      const op = clamp(0.35 + (f.req - f.avail) / 60, 0.35, 1);
      fg += '<path d="M-17,30 A36,36 0 0 1 -17,-30" fill="none" stroke="#fca5a5"' +
        ' stroke-width="4" opacity="' + op.toFixed(2) + '" marker-end="url(#mYaw)"/>';
    }
    $("fg").innerHTML = fg;

    /* 3. 箭头文字 */
    let lb = "";
    const txt = function (x, y, str, col) {
      return '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" fill="' + col +
        '" stroke="#39465a" stroke-width="3" paint-order="stroke" stroke-linejoin="round">' + str + '</text>';
    };
    if (s.rev > 5) lb += txt(cx - 104, cy + 46, "反推", "#fdba74");
    lb += txt(cx + 12, cy + 66, "侧风推", "#fca5a5");
    lb += txt(cx + 34, cy - 62, "前轮顶着", "#86efac");
    $("fgLabels").innerHTML = lb;

    /* 4. 轨迹（按阶段变色） */
    const N = 140;
    const segs = [];
    let cur = null, last = null;
    for (let i = 0; i <= N; i++) {
      const q = p * i / N;
      const pt = sample(q);
      const key = px(pt).toFixed(1) + "," + py(pt).toFixed(1);
      const col = phaseOf(q).ph.color;
      if (!cur || cur.color !== col) {
        if (cur) { cur.pts.push(key); segs.push(cur); }
        cur = { color: col, pts: last ? [last, key] : [key] };
      } else {
        cur.pts.push(key);
      }
      last = key;
    }
    if (cur) segs.push(cur);

    let trail = "";
    for (let i = 0; i < segs.length; i++) {
      if (segs[i].pts.length < 2) continue;
      trail += '<polyline points="' + segs[i].pts.join(" ") + '" fill="none" stroke="' +
        segs[i].color + '" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" opacity=".95"/>';
    }
    $("trail").innerHTML = trail;

    const routePt = [];
    for (let i = 0; i <= 60; i++) {
      const pt = sample(i / 60);
      routePt.push(px(pt).toFixed(1) + "," + py(pt).toFixed(1));
    }
    $("route").setAttribute("points", routePt.join(" "));

    /* 5. 关键点编号 */
    let marks = "";
    for (let i = 0; i < NODES.length; i++) {
      const n = sample(NODES[i].p);
      const done = p >= NODES[i].p - 0.001;
      const my = (i % 2 === 0) ? 76 : 268;
      marks += '<line x1="' + px(n).toFixed(1) + '" y1="' + py(n).toFixed(1) +
        '" x2="' + px(n).toFixed(1) + '" y2="' + (my < 170 ? 90 : 250) +
        '" stroke="#ffffff" stroke-width="1" opacity=".3"/>';
      marks += '<circle cx="' + px(n).toFixed(1) + '" cy="' + my + '" r="11" fill="' +
        (done ? "#1b2430" : "#ffffff") + '" stroke="#1b2430" stroke-width="2" opacity="' + (done ? 1 : 0.55) + '"/>';
      marks += '<text x="' + px(n).toFixed(1) + '" y="' + (my + 4) +
        '" text-anchor="middle" font-size="11.5" font-weight="700" fill="' +
        (done ? "#ffffff" : "#1b2430") + '" opacity="' + (done ? 1 : 0.55) + '">' + (i + 1) + '</text>';
    }
    $("marks").innerHTML = marks;

    /* 6. 数据 */
    $("hSpeed").innerHTML = Math.round(s.v) + "<small>kt</small>";
    $("hRev").innerHTML = Math.round(s.rev) + "<small>%</small>";
    $("hHdg").innerHTML = Math.abs(s.rot).toFixed(1) + "<small>°</small>";
    $("hDrift").innerHTML = (Math.max(0, s.dy) / PX_PER_M).toFixed(1) + "<small>m</small>";

    const hd = Math.abs(s.rot);
    $("hHdg").className = "v" + (hd > 6 ? " bad" : (hd > 1.5 ? " warn" : " ok"));
    $("hDrift").className = "v" + (s.dy > 15 ? " bad" : (s.dy > 4 ? " warn" : " ok"));
    $("hRev").className = "v" + (s.rev > 60 ? " warn" : "");

    const brk = Math.round(s.brk);
    $("hBrk").innerHTML = brk + "<small>%</small>";
    $("hBrk").className = "v" + (brk > 20 ? " warn" : " ok");

    const splOn = s.spl > 0.5;
    $("hSpl").innerHTML = splOn ? "已展开" : "未展开";
    $("hSpl").className = "v " + (splOn ? "ok" : "bad");

    /* 7. 仪表 */
    const fxPct = Math.round(f.sigma * 100);
    const fyPct = Math.round(f.lateral * 100);
    $("segFx").style.width = fxPct + "%";
    $("segFy").style.width = fyPct + "%";
    $("segFx").textContent = fxPct > 16 ? fxPct + "%" : "";
    $("segFy").textContent = fyPct > 16 ? fyPct + "%" : "";
    $("txtFx").textContent = fxPct + "%";
    $("txtFy").textContent = fyPct + "%";
    $("txtFyState").textContent = f.saturated ? "已到极限" : (fyPct < 40 ? "很紧" : "够用");

    const rudPct = Math.round(clamp(Math.pow(s.v / 140, 2), 0, 1) * 100);
    $("segRud").style.width = rudPct + "%";
    $("segRud").textContent = rudPct > 16 ? rudPct + "%" : "";
    $("txtRud").textContent = rudPct + "%";
    $("txtRudState").textContent = rudPct > 45 ? "很有劲" : (rudPct > 15 ? "明显变弱" : "几乎没劲");

    const scale = Math.max(f.req, f.avail, 1);
    $("segReq").style.width = (f.req / scale * 100).toFixed(1) + "%";
    $("segAvail").style.width = (f.avail / scale * 100).toFixed(1) + "%";
    $("segReq").textContent = Math.round(f.req) + " kN·m";
    $("segAvail").textContent = Math.round(f.avail) + " kN·m";
    $("txtReq").textContent = Math.round(f.req);
    $("txtAvail").textContent = Math.round(f.avail);

    /* 8. 解说 */
    const ph = phaseOf(p);
    $("capTag").textContent = ph.idx + 1;
    $("capTag").style.background = ph.ph.color;
    $("caption").style.borderLeftColor = ph.ph.color;
    $("capTitle").textContent = ph.ph.title;
    $("capText").textContent = ph.ph.text;

    /* 9. 按钮 */
    const btns = document.querySelectorAll("#nodes button");
    for (let i = 0; i < btns.length; i++) {
      btns[i].className = (Math.abs(p - NODES[i].p) < 0.012) ? "active" : "";
    }
  }

  /* ---------- 节点按钮 ---------- */
  (function buildNodes() {
    const box = $("nodes");
    for (let i = 0; i < NODES.length; i++) {
      const b = document.createElement("button");
      b.textContent = NODES[i].label;
      b.addEventListener("click", function () {
        prog.value = Math.round(NODES[i].p * 1000);
        render();
      });
      box.appendChild(b);
    }
  })();

  prog.addEventListener("input", render);

  document.addEventListener("keydown", function (e) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const step = e.shiftKey ? 20 : 5;
    prog.value = clamp(parseInt(prog.value, 10) + (e.key === "ArrowRight" ? step : -step), 0, 1000);
    render();
  });

  render();
})();
