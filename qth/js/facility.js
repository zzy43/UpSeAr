/* 起飞最低标准判定 —— 设施层（表 1 匹配 / 设施按钮 / 提示 / 已选摘要）
   依赖：data.js、core.js*/
window.QTH = window.QTH || {};
(function (Q) {
  'use strict';

  var S = Q.state;

  // 按表 1 从高到低匹配：看不清的就逐级降标准
  function judgeFacilities(pp) {
    var p = pp || S.picked;
    var has = function (k) { return !!p[k]; };

    // LVP 实施中：固定 C 类 200 米 / D 类 250 米，灯光是强制项
    if (S.lvp) {
      return { rvr: S.acCat === 'D' ? 250 : 200, three: false, key: 'lvp',
        note: 'LVP 运行标准：C 类 RVR 200 米、D 类 RVR 250 米。' };
    }

    // 选了具体机场跑道：直接按该跑道公布的标准（优先于表 1 的通用设施组合）
    // 输入的是 VIS 时，用跑道公布的 VIS 最低标准；未公布则按脚注⑥用等值 VIS 代替
    var rw = Q.curRwy();
    if (rw) {
      var isVis = S.rvrKind === 'vis';
      if (has('edge') || has('center')) {
        var lit = isVis ? (rw.vis || rw.edge) : rw.edge;
        return { rvr: lit, three: false, key: 'rwyLight',
          note: rw.label + ' 公布标准：有跑道边灯／中线灯 → '
            + (isVis ? 'VIS ' : 'RVR ') + lit + ' 米。' };
      }
      var dark = isVis ? (rw.vis || rw.nolight) : rw.nolight;
      return { rvr: dark, three: false, dayOnly: true, key: 'rwyNoLight',
        note: rw.label + ' 公布标准：无跑道灯光 → '
          + (isVis ? 'VIS ' : 'RVR ') + dark + ' 米，仅昼间。' };
    }

    if (has('vis')) {
      return { rvr: 500, three: false, dayOnly: true, key: 'vis',
        note: '仅凭足够的目视参考（⑤：能持续确定起飞道面并保持方向控制），仅昼间可用。' };
    }
    if (has('edge') && has('center') && has('hi') && has('three') && has('hud')) {
      return { rvr: 75, three: true, key: 'h75',
        note: '高光强边灯＋中线灯（间距 ≤15 m）＋经批准的横向引导系统，三段 RVR 报告。③：横向引导用 ILS 需满足 CAT Ⅲ 航向信号要求，用 GLS 需满足 CAT Ⅲ 性能类型。' };
    }
    if (has('edge') && has('center') && has('hi') && has('three')) {
      return { rvr: 125, three: true, key: 'h125',
        note: '高光强跑道边灯＋跑道中线灯（间距 ≤15 m），带三段 RVR 报告（②）。' };
    }
    if (has('edge') && has('center') && has('three')) {
      return { rvr: 150, three: true, key: 'e150',
        note: '跑道边灯＋跑道中线灯，带三段 RVR 报告（②）。' };
    }
    if (has('edge') && has('center')) {
      return { rvr: 200, three: false, key: 'edgeCtr', note: '跑道边灯＋跑道中线灯。' };
    }
    if (has('edge') && has('mark')) {
      return { rvr: 300, three: false, key: 'edgeMark', note: '跑道边灯＋跑道中线标志。' };
    }
    if (has('edge') || has('mark')) {
      return { rvr: 400, three: false, key: 'base400',
        note: '跑道边灯或跑道中线标志，有其一即可。' };
    }
    return null;
  }

  // 当前 RVR 不够时，列出所有「再补哪些设施就能满足」的方案（按门限从高到低）
  function suggestAll(head, night, minRvr) {
    // LVP 标准由机型类别决定，补灯不会降低门限，所以不给建议
    if (S.lvp) return [];
    var KEYS = ['edge', 'end', 'center', 'mark', 'hi', 'three', 'hud'];
    minRvr = minRvr || 0;
    // 选了「仅目视参考」时，建议就是「改用哪些具体设施」，所以以空集为起点
    var base = S.picked.vis ? {} : S.picked;
    var best = {};                       // rvr -> { rvr, added }
    for (var m = 1; m < (1 << KEYS.length); m += 1) {
      var cand = {};
      for (var i = 0; i < KEYS.length; i += 1) {
        if (m & (1 << i)) cand[KEYS[i]] = true;
      }
      // 只能在现有选择上「加」，不能把已选的去掉
      var superset = true;
      for (var k in base) {
        if (!cand[k]) { superset = false; break; }
      }
      if (!superset) continue;

      // 夜间还必须有跑道末端灯 + 边灯/中线灯
      if (night && !(cand.end && (cand.edge || cand.center))) continue;

      var f2 = judgeFacilities(cand);
      if (!f2 || f2.dayOnly || head < f2.rvr) continue;
      if (f2.rvr < minRvr) continue;                 // 无 CAT Ⅱ 时不给 400 以下的组合

      var added = [];
      for (var j = 0; j < KEYS.length; j += 1) {
        if (cand[KEYS[j]] && !base[KEYS[j]]) added.push(KEYS[j]);
      }
      if (!added.length) continue;

      // 同一个门限只留「补得最少」的组合；并列的（如「跑道边灯」和「跑道中线标志」都够 400）都收着
      var cur = best[f2.rvr];
      if (!cur || added.length < cur.min) {
        best[f2.rvr] = { rvr: f2.rvr, min: added.length, list: [added] };
      } else if (added.length === cur.min) {
        var dup = cur.list.some(function (a2) { return a2.join(',') === added.join(','); });
        if (!dup) cur.list.push(added);
      }
    }

    function nameOf(k) {
      for (var i = 0; i < Q.ITEMS.length; i += 1) {
        if (Q.ITEMS[i].k === k) return Q.ITEMS[i].label;
      }
      return k === 'three' ? '三段 RVR 报告' : k;    // three 在「三段」开关上，不在 ITEMS 里
    }

    return Object.keys(best)
      .map(function (k) { return best[k]; })
      .sort(function (a, b) { return b.rvr - a.rvr; })
      .slice(0, 1)      // 只给「刚好能满足」的那一档
      .map(function (x) {
        // 同一档里有几种并列选法 → 用「或」连接；同一种选法里多项 → 用「、」连接
        var parts = x.list.map(function (added) {
          return added.map(nameOf).join('」、「');
        });
        return { rvr: x.rvr, names: parts.join('」或「') };
      });
  }

  // 画设施按钮（多选，再点一次取消）
  function renderTags() {
    var box = Q.el('fac');
    box.innerHTML = '';
    Q.ITEMS.forEach(function (it) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'tag' + (S.picked[it.k] ? ' on' : '');
      b.dataset.v = it.k;
      b.innerHTML = it.label + (it.tip ? '<i>' + it.tip + '</i>' : '');
      b.addEventListener('click', function () {
        // LVP 实施中：跑道边灯、跑道中线灯不能取消
        if (S.lvp && (it.k === 'edge' || it.k === 'center') && S.picked[it.k]) {
          Q.warn('LVP 运行期间强制要求跑道边灯和跑道中线灯，不能取消「' + it.label + '」。');
          return;
        }
        if (S.lvp && it.k === 'vis') {
          Q.warn('LVP 运行期间强制要求跑道边灯和跑道中线灯，不能改为「仅目视参考」。');
          return;
        }
        Q.clearWarn();
        if (it.k === 'vis') {
          S.picked = S.picked.vis ? {} : { vis: true };   // 仅目视参考与其它设施互斥
        } else {
          delete S.picked.vis;
          if (S.picked[it.k]) { delete S.picked[it.k]; } else { S.picked[it.k] = true; }
        }
        renderTags();
        syncThreeBtn();
        syncFac();
      });
      box.appendChild(b);
    });
  }

  // 该时段的默认设施：昼间中线标志；夜间边灯＋末端灯（LVP 时固定边灯＋中线灯）
  function defaultPick() {
    if (S.lvp) {
      S.picked = { edge: true, center: true };
    } else {
      S.picked = (S.dayNight === 'night') ? { edge: true, end: true } : { mark: true };
    }
    renderTags();
    syncThreeBtn();
    syncFac();
  }

  // 「三段 RVR 报告」开关（放在昼/夜那一行）
  function syncThreeBtn() {
    Q.el('segThree').classList.toggle('on', !!S.picked.three);
  }

  // 设施提示 + 三段输入框显隐 + 已选摘要，统一在这里刷新
  function syncFac() {
    // 选了机场跑道（或 LVP）时，判定里已含机场公布标准，那句「只按全天候起飞最低标准」就不适用了
    Q.el('note').hidden = !!(Q.curRwy() || S.lvp);
    var f = judgeFacilities();
    // 只有勾了「三段 RVR 报告」才出现中间端 / 停止端
    var three = !!S.picked.three;
    Q.el('rvrMid').parentNode.hidden = !three;
    Q.el('rvrEnd').parentNode.hidden = !three;
    Q.el('rvrNote').hidden = !three;            // 三段报告时才提示「RVR 可由驾驶员目视判断」
    if (three) {
      Q.unlockSeg(Q.el('rvrMid'));
      Q.unlockSeg(Q.el('rvrEnd'));
    } else {
      Q.lockSeg(Q.el('rvrMid'));
      Q.lockSeg(Q.el('rvrEnd'));
    }

    if (!f) {
      Q.el('facHint').textContent = '请至少选「跑道边灯」或「跑道中线标志」（或昼间勾「仅目视参考」）。';
    } else {
      var needShow = S.hasCat2 ? f.rvr : Math.max(f.rvr, 400);
      Q.el('facHint').textContent = (Q.el('baseStd').checked
        ? '已勾选「机场未公布起飞标准」，判定按 4.2.1.3 基本标准，下面的设施选择不参与。'
        : '要求 ' + (S.rvrKind === 'vis' ? 'VIS' : 'RVR') + ' ≥ ' + needShow + ' 米'
        + (f.three && S.hasCat2 ? '（三段都要达到）' : '')
        + (S.hasCat2 ? '' : '（无资质 CAT Ⅱ，标准不低于 400 米）')
        + '。' + f.note
        + (three && !f.three && !Q.curRwy()
          ? ' 注意：当前设施组合还达不到三段 RVR 的标准，需跑道边灯＋跑道中线灯。' : ''));
    }
    renderPicks();
  }

  // 判定结果上方：把用户的选择汇总成一排小标签
  function renderPicks() {
    var box = Q.el('picks');
    box.innerHTML = '';
    var chips = [];
    function add(t, c) { chips.push({ t: t, c: c || '' }); }

    // 机场 / 跑道
    var rw = Q.curRwy();
    if (rw) add(Q.AP[S.airport].name + ' ' + rw.label);
    else if (S.airport) add(Q.AP[S.airport].name + '（未选跑道）', 'miss');

    // 昼 / 夜
    add(S.dayNight === 'night' ? '夜间' : '昼间');

    // LVP
    if (S.lvp) add('LVP 实施中（' + S.acCat + ' 类）');

    // 资质
    add(S.hasCat2 ? '资质 CAT Ⅱ' : '无资质 CAT Ⅱ');

    // 跑道设施
    var fac = [];
    Q.ITEMS.forEach(function (it) { if (S.picked[it.k]) fac.push(it.label); });
    if (S.picked.three) fac.push('三段 RVR 报告');
    if (!fac.length) add('未选跑道设施', 'miss');
    fac.forEach(function (n) { add(n); });

    // 实测 RVR / VIS
    var u = S.rvrKind === 'vis' ? 'VIS' : 'RVR';
    var h = Q.el('rvr').value.trim();
    var m = Q.el('rvrMid').value.trim();
    var e2 = Q.el('rvrEnd').value.trim();
    if (h === '') {
      add(u + ' 未填');
    } else if (S.picked.three && m !== '' && e2 !== '') {
      add(u + ' ' + h + ' / ' + m + ' / ' + e2 + ' 米');
    } else {
      add(u + ' ' + h + ' 米');
    }

    // 其它勾选项
    if (Q.el('baseStd').checked) add('未公布起飞最低标准（4.2.1.3）');
    if (Q.el('obst').checked) add('需目视避障（4.2.2）');

    chips.forEach(function (x) {
      var s = document.createElement('span');
      s.className = 'chip ' + x.c;
      s.textContent = x.t;
      box.appendChild(s);
    });
  }

  Q.judgeFacilities = judgeFacilities;
  Q.suggestAll = suggestAll;
  Q.renderTags = renderTags;
  Q.defaultPick = defaultPick;
  Q.syncThreeBtn = syncThreeBtn;
  Q.syncFac = syncFac;
  Q.renderPicks = renderPicks;
})(window.QTH);
