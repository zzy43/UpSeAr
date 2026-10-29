/* 落地（进近）最低标准 —— 数据 + 判定 */
(function () {
  'use strict';

  // ===== 标准数据 =====
  // type: 'DA' 决断高度 / 'MDA' 最低下降高度，数值统一为英尺（ft）
  // rvr: 标准 RVR（米）；没有 RVR 标准的程序不写这个字段
  // vis: 统一 VIS 标准；VOR/DME 按机型不同，用 visC / visD
  var AP = {
    ZPPP: {
      name: 'ZPPP（昆明/长水）',
      rwys: [
        { k: '03', list: [
          { proc: 'RNAV-ILS/DMEz', type: 'DA', h: 7100, rvr: 550, vis: 800 },
          { proc: 'RNPz',          type: 'DA', h: 7350, rvr: 1800, vis: 1800 }
        ] },
        { k: '04R', list: [
          { proc: 'RNAV-ILS/DMEz', type: 'DA', h: 7090, rvr: 550, vis: 800 }
        ] },
        { k: '21', list: [
          { proc: 'RNAV-ILS/DMEz', type: 'DA', h: 7090, rvr: 550, vis: 800 }
        ] },
        { k: '22L', list: [
          { proc: 'RNAV-ILS/DMEz', type: 'DA', h: 7090, rvr: 550, vis: 800 }
        ] }
      ]
    },
    ZSWZ: {
      name: 'ZSWZ（温州/龙湾）',
      rwys: [
        { k: '03', list: [
          { proc: 'RNAV-ILS/DMEz', type: 'DA',  h: 220, rvr: 550, vis: 800 },
          { proc: 'VOR/DME',       type: 'MDA', h: 660, visC: 3200, visD: 3400 }
        ] },
        { k: '21', list: [
          { proc: 'RNAV-ILS/DMEz', type: 'DA',  h: 220, rvr: 550, vis: 800 },
          { proc: 'VOR/DME',       type: 'MDA', h: 790, visC: 4000, visD: 4200 }
        ] }
      ]
    }
  };

  // 运规 R5-C0009：公司放行及运行，MDA(H)/DA(H) 增加 100 英尺，RVR/VIS 增加 600 米
  var R5 = { h: 100, vis: 600 };

  var S = { airport: '', rwy: '', proc: '', acCat: 'C', r5: true };

  function el(id) { return document.getElementById(id); }
  function each(sel, fn) { Array.prototype.forEach.call(document.querySelectorAll(sel), fn); }

  // 找跑道对象
  function rwyOf(k) {
    var ap = AP[S.airport];
    if (!ap) return null;
    for (var i = 0; i < ap.rwys.length; i += 1) {
      if (ap.rwys[i].k === k) return ap.rwys[i];
    }
    return null;
  }

  // 当前选择的程序标准，未选全返回 null
  function current() {
    var r = rwyOf(S.rwy);
    if (!r) return null;
    for (var i = 0; i < r.list.length; i += 1) {
      if (r.list[i].proc === S.proc) return r.list[i];
    }
    return null;
  }

  // 该程序在当前机型下的公布 VIS 门限
  function visStd(p) {
    if (!p) return null;
    if (p.visC !== undefined) return S.acCat === 'D' ? p.visD : p.visC;
    return p.vis;
  }

  // 计入运规 R5 后的实际使用标准
  function applied(p) {
    var addH = S.r5 ? R5.h : 0;
    var addV = S.r5 ? R5.vis : 0;
    return {
      h: p.h + addH,
      rvr: p.rvr === undefined ? null : p.rvr + addV,
      vis: visStd(p) + addV
    };
  }

  // ===== 下拉联动 =====

  function fillRwy() {
    var sel = el('rwy');
    sel.innerHTML = '';
    var ap = AP[S.airport];
    if (!ap) {
      sel.appendChild(new Option('---', ''));
      sel.disabled = true;
      return;
    }
    sel.appendChild(new Option('---', ''));
    ap.rwys.forEach(function (r) {
      sel.appendChild(new Option('RWY' + r.k, r.k));
    });
    sel.disabled = false;
  }

  function fillProc() {
    var sel = el('proc');
    sel.innerHTML = '';
    var r = rwyOf(S.rwy);
    var list = r && r.list;
    if (!list) {
      sel.appendChild(new Option('---', ''));
      sel.disabled = true;
      return;
    }
    sel.appendChild(new Option('---', ''));
    list.forEach(function (p) {
      sel.appendChild(new Option(p.proc, p.proc));   // 程序名之外不带高度，避免误读
    });
    sel.disabled = false;
  }

  // ===== 界面刷新 =====

  function syncStd() {
    var p = current();
    var box = el('stdText');
    var box5 = el('stdR5');
    if (!p) {
      box.textContent = '先选机场、跑道和进近程序。';
      box5.hidden = true;
      el('stdNpa').hidden = true;
      renderPicks();
      return;
    }
    var base = [p.type + ' <b>' + p.h + '</b> ft'];
    if (p.rvr !== undefined) base.push('RVR <b>' + p.rvr + '</b> 米');
    base.push('VIS <b>' + visStd(p) + '</b> 米' + (p.visC !== undefined ? '（' + S.acCat + ' 类）' : ''));
    box.innerHTML = AP[S.airport].name + '　RWY' + S.rwy + '　' + p.proc + '：' + base.join('　');

    if (S.r5) {
      var a = applied(p);
      var txt = [p.type + ' <b>' + a.h + '</b> ft'];
      if (a.rvr !== null) txt.push('RVR <b>' + a.rvr + '</b> 米');
      txt.push('VIS <b>' + a.vis + '</b> 米');
      box5.hidden = false;
      box5.innerHTML = '运规 R5-C0009 生效：' + txt.join('　')
        + '（' + p.type + ' +100 ft，RVR/VIS +600 米）';
    } else {
      box5.hidden = true;
    }

    // 非精密进近（只有 MDA）：DDA = MDA + 50 ft
    var npa = el('stdNpa');
    if (p.type === 'MDA') {
      var an = applied(p);
      npa.hidden = false;
      npa.innerHTML = '非精密进近：DDA = MDA ' + an.h + ' + 50 = <b>' + (an.h + 50) + '</b> ft'
        + (S.r5 ? '（MDA 已含运规 R5 +100 ft）' : '');
    } else {
      npa.hidden = true;
    }
    renderPicks();
  }

  function renderPicks() {
    var box = el('picks');
    box.innerHTML = '';
    var chips = [];
    function add(t) { chips.push(t); }
    if (S.airport) add(AP[S.airport].name + (S.rwy ? ' RWY' + S.rwy : '（未选跑道）'));
    if (S.proc) add(S.proc);
    if (S.airport) add(S.acCat + ' 类');
    if (S.r5) add('运规 R5 生效');
    var r = el('rvr').value.trim(), v = el('vis').value.trim();
    if (r !== '') add('RVR ' + r + ' 米');
    if (v !== '') add('VIS ' + v + ' 米');
    chips.forEach(function (t) {
      var s = document.createElement('span');
      s.className = 'chip';
      s.textContent = t;
      box.appendChild(s);
    });
  }

  function line(kind, text, sub) {
    var li = document.createElement('li');
    li.className = kind;
    li.innerHTML = '<span class="ic">' + (kind === 'pass' ? '✓' : kind === 'fail' ? '✗' : '·') + '</span>'
      + '<span class="tx">' + text + (sub ? ' <em>' + sub + '</em>' : '') + '</span>';
    return li;
  }

  function setVerdict(ok, big, sub) {
    el('verdict').className = 'verdict ' + (ok ? 'ok' : 'bad');
    el('verdictBig').textContent = big;
    el('verdictSub').textContent = sub;
  }

  // ===== 判定 =====

  function run() {
    var box = el('checks');
    box.innerHTML = '';

    var p = current();
    if (!p) {
      box.appendChild(line('fail', '还没选全', '请选择机场、跑道和进近程序'));
      setVerdict(false, '无法判定', '先选好机场、跑道和进近程序。');
      return;
    }

    var a = applied(p);                 // 计入运规 R5 后的实际门限
    var rvr = Number(el('rvr').value.trim());
    var vis = Number(el('vis').value.trim());
    var hasRvr = el('rvr').value.trim() !== '' && isFinite(rvr);
    var hasVis = el('vis').value.trim() !== '' && isFinite(vis);

    var fails = [];
    var lines = [];

    lines.push(['info', '适用程序', AP[S.airport].name + '　RWY' + S.rwy + '　' + p.proc
      + '（' + p.type + ' ' + p.h + ' ft）']);
    if (S.r5) {
      lines.push(['info', '运规 R5-C0009',
        '公司放行及运行 ' + p.type + '(H) +100 ft、RVR/VIS +600 米 → 本次门限 '
        + p.type + ' <b>' + a.h + '</b> ft'
        + (a.rvr !== null ? '，RVR <b>' + a.rvr + '</b> 米' : '')
        + '，VIS <b>' + a.vis + '</b> 米']);
    } else {
      lines.push(['info', '未计入运规 R5', '按公布值 ' + p.type + ' ' + p.h + ' ft'
        + (a.rvr !== null ? '，RVR ' + a.rvr + ' 米' : '')
        + '，VIS ' + a.vis + ' 米']);
    }
    // 非精密进近：DDA = MDA + 50 ft
    if (p.type === 'MDA') {
      lines.push(['info', '非精密进近',
        'DDA = MDA ' + a.h + ' + 50 ft = <b>' + (a.h + 50) + ' ft</b>']);
    }

    if (a.rvr !== null) {
      if (hasRvr) {
        if (rvr >= a.rvr) {
          lines.push(['pass', 'RVR ' + rvr + ' 米 ≥ ' + a.rvr + ' 米', '']);
        } else {
          fails.push('RVR ' + rvr + ' 米低于本次门限 ' + a.rvr + ' 米。');
          lines.push(['fail', 'RVR ' + rvr + ' 米 < ' + a.rvr + ' 米', '差 ' + (a.rvr - rvr) + ' 米']);
        }
      } else if (hasVis) {
        lines.push(['info', 'RVR 未填', '按 VIS 代替判定']);
        if (vis >= a.vis) {
          lines.push(['pass', 'VIS ' + vis + ' 米 ≥ ' + a.vis + ' 米', '']);
        } else {
          fails.push('VIS ' + vis + ' 米低于本次门限 ' + a.vis + ' 米。');
          lines.push(['fail', 'VIS ' + vis + ' 米 < ' + a.vis + ' 米', '差 ' + (a.vis - vis) + ' 米']);
        }
      } else {
        fails.push('还没填实际 RVR 或 VIS 数值。');
        lines.push(['fail', '数值输入', '缺少 RVR / VIS']);
      }
    } else {
      // 只有 VIS 标准的程序（VOR/DME）
      if (!hasVis) {
        fails.push('该程序只有 VIS 标准，请填实际 VIS。');
        lines.push(['fail', '数值输入', '缺少 VIS']);
      } else if (vis >= a.vis) {
        lines.push(['pass', 'VIS ' + vis + ' 米 ≥ ' + a.vis + ' 米', '']);
      } else {
        fails.push('VIS ' + vis + ' 米低于本次门限 ' + a.vis + ' 米（' + S.acCat + ' 类）。');
        lines.push(['fail', 'VIS ' + vis + ' 米 < ' + a.vis + ' 米', '差 ' + (a.vis - vis) + ' 米']);
      }
    }

    lines.forEach(function (x) { box.appendChild(line(x[0], x[1], x[2])); });

    if (fails.length) {
      setVerdict(false, '不满足落地标准', fails[0] + (fails.length > 1 ? '（共 ' + fails.length + ' 条不满足）' : ''));
    } else {
      setVerdict(true, '满足落地标准',
        '依据该程序的 ' + p.type + (a.rvr !== null ? ' / RVR' : '') + ' / VIS'
        + (S.r5 ? '（已计入运规 R5-C0009）' : '') + '，本条件可以落地。');
    }
  }

  // ===== 事件绑定 =====

  el('airport').addEventListener('change', function () {
    S.airport = el('airport').value;
    S.rwy = '';
    S.proc = '';
    fillRwy();
    fillProc();
    syncStd();
  });

  el('rwy').addEventListener('change', function () {
    S.rwy = el('rwy').value;
    S.proc = '';
    fillProc();
    syncStd();
  });

  el('proc').addEventListener('change', function () {
    S.proc = el('proc').value;
    syncStd();
  });

  each('#acSeg button', function (b) {
    b.addEventListener('click', function () {
      S.acCat = b.dataset.v;
      each('#acSeg button', function (x) { x.classList.toggle('on', x === b); });
      syncStd();
    });
  });

  // 运规 R5 开关（默认已选）
  el('r5Btn').addEventListener('click', function () {
    S.r5 = !S.r5;
    el('r5Btn').classList.toggle('on', S.r5);
    syncStd();
  });

  ['rvr', 'vis'].forEach(function (id) {
    el(id).addEventListener('input', renderPicks);
  });

  el('btn-run').addEventListener('click', run);

  el('btn-reset').addEventListener('click', function () {
    S.airport = ''; S.rwy = ''; S.proc = ''; S.acCat = 'C'; S.r5 = true;
    el('airport').value = '';
    el('rvr').value = '';
    el('vis').value = '';
    el('r5Btn').classList.add('on');
    fillRwy(); fillProc(); syncStd();
    each('#acSeg button', function (x) { x.classList.toggle('on', x.dataset.v === 'C'); });
    el('checks').innerHTML = '';
    el('picks').innerHTML = '';
    el('verdict').className = 'verdict idle';
    el('verdictBig').textContent = '等待输入';
    el('verdictSub').textContent = '';
  });

  fillRwy();
  fillProc();
  syncStd();
})();
