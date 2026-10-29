/* 起飞最低标准判定 —— 交互与判定逻辑（依据《全天候运行规定》4.2 · 表 1）*/
(function () {
  'use strict';

  // 设施项（多选）：每个按钮一个设施，用户把实际可用的勾出来，
  // 再由 judgeFacilities() 反查表 1 对应哪一行、要求多少米。
  var ITEMS = [
    { k: 'vis',    label: '仅目视参考', tip: '仅昼间' },
    { k: 'edge',   label: '跑道边灯', tip: '' },
    { k: 'end',    label: '跑道末端灯', tip: '' },
    { k: 'center', label: '跑道中线灯', tip: '' },
    { k: 'mark',   label: '跑道中线标志', tip: '' },
    { k: 'hi',     label: '高光强（间距≤15m）', tip: '' },
    { k: 'hud',    label: '横向引导（如HUD）', tip: '' }
  ];

  var el = function (id) { return document.getElementById(id); };
  var dayNight = 'day';
  var picked = {};                     // 当前选中的设施
  var rvrKind = 'rvr';                 // 输入的是 RVR 还是 VIS（默认 RVR）
  var hasCat2 = true;                  // 是否有资质 CAT Ⅱ（默认有）

  // RVR / VIS 切换
  Array.prototype.forEach.call(el('rvrSeg').querySelectorAll('button'), function (b) {
    b.addEventListener('click', function () {
      rvrKind = b.dataset.v;
      Array.prototype.forEach.call(el('rvrSeg').querySelectorAll('button'), function (x) {
        x.classList.toggle('on', x === b);
      });
      el('rvrKindLabel').textContent = rvrKind === 'vis' ? '实际 VIS（米）' : '实际 RVR（米）';
    });
  });


  // 按表 1 从高到低匹配：看不清的就逐级降标准
  function judgeFacilities(pp) {
    var p = pp || picked;
    var has = function (k) { return !!p[k]; };
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
    var KEYS = ['edge', 'end', 'center', 'mark', 'hi', 'three', 'hud'];
    minRvr = minRvr || 0;
    // 选了「仅目视参考」时，建议就是「改用哪些具体设施」，所以以空集为起点
    var base = picked.vis ? {} : picked;
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
      for (var i = 0; i < ITEMS.length; i += 1) {
        if (ITEMS[i].k === k) return ITEMS[i].label;
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
    var box = el('fac');
    box.innerHTML = '';
    ITEMS.forEach(function (it) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'tag' + (picked[it.k] ? ' on' : '');
      b.dataset.v = it.k;
      b.innerHTML = it.label + (it.tip ? '<i>' + it.tip + '</i>' : '');
      b.addEventListener('click', function () {
        if (it.k === 'vis') {
          picked = picked.vis ? {} : { vis: true };      // 仅目视参考与其它设施互斥
        } else {
          delete picked.vis;
          if (picked[it.k]) { delete picked[it.k]; } else { picked[it.k] = true; }
        }
        renderTags();
        syncThreeBtn();
        syncFac();
      });
      box.appendChild(b);
    });
  }

  // 该时段的默认设施：昼间中线标志；夜间边灯＋末端灯
  function defaultPick() {
    picked = (dayNight === 'night') ? { edge: true, end: true } : { mark: true };
    renderTags();
    syncThreeBtn();
    syncFac();
  }

  // 「三段 RVR 报告」开关（放在昼/夜那一行）
  function syncThreeBtn() {
    el('segThree').classList.toggle('on', !!picked.three);
  }

  // 资质 CAT Ⅱ：没有的话，起飞标准不低于 400 米
  el('cat2Btn').addEventListener('click', function () {
    hasCat2 = !hasCat2;
    el('cat2Btn').classList.toggle('on', hasCat2);
    syncFac();
  });

  el('segThree').addEventListener('click', function () {
    picked.three = !picked.three;
    if (picked.three) {
      // 三段 RVR 的前提就是跑道边灯＋跑道中线灯，一并勾上
      delete picked.vis;
      picked.edge = true;
      picked.center = true;
      renderTags();
    }
    syncThreeBtn();
    syncFac();
  });

  // 昼 / 夜切换：套用该时段的默认设施
  Array.prototype.forEach.call(el('seg').querySelectorAll('button'), function (b) {
    b.addEventListener('click', function () {
      dayNight = b.dataset.v;
      Array.prototype.forEach.call(el('seg').querySelectorAll('button'), function (x) {
        x.classList.toggle('on', x === b);
      });
      document.body.classList.toggle('is-night', dayNight === 'night');   // 夜间给背景加一点夜色
      var isNight = dayNight === 'night';
      el('obstField').hidden = isNight;            // 夜间不提供「目视避障」这一项
      if (isNight) {
        el('obst').checked = false;
        el('obstBox').hidden = true;
      }
      defaultPick();
    });
  });

  function syncFac() {
    var f = judgeFacilities();
    // 只有勾了「三段 RVR 报告」才出现中间端 / 停止端
    var three = !!picked.three;
    el('rvrMid').parentNode.hidden = !three;
    el('rvrEnd').parentNode.hidden = !three;
    el('rvrNote').hidden = !three;              // 三段报告时才提示「RVR 可由驾驶员目视判断」
    if (three) {
      unlockSeg(el('rvrMid'));
      unlockSeg(el('rvrEnd'));
    } else {
      lockSeg(el('rvrMid'));
      lockSeg(el('rvrEnd'));
    }

    if (!f) {
      el('facHint').textContent = '请至少选「跑道边灯」或「跑道中线标志」（或昼间勾「仅目视参考」）。';
    } else {
      var needShow = hasCat2 ? f.rvr : Math.max(f.rvr, 400);
      el('facHint').textContent = (el('baseStd').checked
        ? '已勾选「机场未公布起飞标准」，判定按 4.2.1.3 基本标准，下面的设施选择不参与。'
        : '要求 RVR ≥ ' + needShow + ' 米'
        + (f.three && hasCat2 ? '（三段都要达到）' : '')
        + (hasCat2 ? '' : '（无资质 CAT Ⅱ，标准不低于 400 米）')
        + '。' + f.note
        + (three && !f.three ? ' 注意：当前设施组合还达不到三段 RVR 的标准，需跑道边灯＋跑道中线灯。' : ''));
    }
  }

  // 中间端 / 停止端：没勾「三段 RVR 报告」时锁住并隐藏
  function lockSeg(inp) {
    inp.readOnly = true;
    inp.classList.add('locked');
  }

  function unlockSeg(inp) {
    inp.readOnly = false;
    inp.classList.remove('locked');
  }

  el('baseStd').addEventListener('change', function () {
    el('baseStdBox').hidden = !el('baseStd').checked;
    syncFac();
  });

  el('obst').addEventListener('change', function () {
    el('obstBox').hidden = !el('obst').checked;
  });

  // 画一条检查项
  function line(kind, text, sub) {
    var li = document.createElement('li');
    li.className = kind;
    li.innerHTML = '<span class="ic">' + (kind === 'pass' ? '✓' : kind === 'fail' ? '✗' : '·') + '</span>'
      + '<span class="tx">' + text + (sub ? ' <em>' + sub + '</em>' : '') + '</span>';
    return li;
  }

  function num(id) {
    var v = el(id).value.trim();
    if (v === '') return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  // 4.2.1.3 基本起飞最低标准：双发 VIS1600/RVR1500，三发及以上 VIS800/RVR720
  function runBaseStd() {
    var box = el('checks');
    var fails = [], lines = [];
    var head = num('rvr');
    var three = Number(el('engCount').value) === 3;
    var needRvr = three ? 720 : 1500;
    var needVis = three ? 800 : 1600;
    var isVis = rvrKind === 'vis';
    var need = isVis ? needVis : needRvr;
    var unit = isVis ? 'VIS' : 'RVR';

    lines.push(['info', '适用依据', '机场未公布起飞最低标准，按 4.2.1.3 基本起飞最低标准']);
    lines.push(['info', three ? '三发及以上' : '双发',
      'VIS ≥ ' + needVis + ' 米　或　RVR ≥ ' + needRvr + ' 米']);
    lines.push(['info', '本次按 ' + unit + ' 判定', unit + ' ≥ ' + need + ' 米']);

    if (head === null) {
      fails.push('还没填接地端 ' + unit + ' 数值。');
      lines.push(['fail', '数值输入', '缺少 ' + unit]);
    } else if (head >= need) {
      lines.push(['pass', unit + ' ' + head + ' 米 ≥ ' + need + ' 米', '']);
    } else {
      fails.push(unit + ' ' + head + ' 米低于基本起飞最低标准的 ' + need + ' 米。');
      lines.push(['fail', unit + ' ' + head + ' 米 < ' + need + ' 米',
        '差 ' + (need - head) + ' 米']);
    }

    lines.forEach(function (x) { box.appendChild(line(x[0], x[1], x[2])); });

    el('verdict').className = 'verdict ' + (fails.length ? 'bad' : 'ok');
    el('verdictBig').textContent = fails.length ? '不满足起飞标准' : '满足起飞标准';
    el('verdictSub').textContent = fails.length
      ? fails[0]
      : '仅依据全天候 4.2.1.3 基本起飞最低标准，本条件可以起飞。';
  }

  function run() {
    var box = el('checks');
    box.innerHTML = '';

    // 勾了「机场未公布起飞标准」→ 按 4.2.1.3 基本起飞最低标准判
    if (el('baseStd').checked) { runBaseStd(); return; }

    var f = judgeFacilities();
    var night = dayNight === 'night';

    var fails = [];
    var lines = [];
    var head = el('rvr') && num('rvr');

    // 0) 设施组合本身不够
    if (!f) {
      box.appendChild(line('fail', '设施选择不足', '至少选「跑道边灯」或「跑道中线标志」'));
      el('verdict').className = 'verdict bad';
      el('verdictBig').textContent = '无法判定';
      el('verdictSub').textContent = '先选出实际可用的跑道设施。';
      return;
    }

    // 1) 运行时段（含夜间灯光要求）
    var lightOk = picked.end && (picked.edge || picked.center);
    if (night && f.dayOnly) {
      fails.push('「仅目视参考」只在昼间可用，夜间不能作为起飞最低标准的依据（表 1）。');
      lines.push(['fail', '运行时段', '该组合仅昼间可用']);
    } else if (night && !lightOk) {
      fails.push('夜间运行至少需要「跑道边灯 + 跑道末端灯」或「跑道中线灯 + 跑道末端灯」正常工作（表 1 ①）。');
      lines.push(['fail', '夜间灯光要求（①）',
        picked.end ? '缺跑道边灯/跑道中线灯' : '没勾跑道末端灯']);
    } else {
      lines.push(['pass', '运行时段', night ? '夜间（边灯或中线灯 + 跑道末端灯）' : '昼间']);
    }

    // 3) 需要的 RVR（无 CAT Ⅱ 资质时不低于 400 米）
    var need = hasCat2 ? f.rvr : Math.max(f.rvr, 400);
    var needThree = f.three && hasCat2;      // 门限抬到 400 时不再需要三段报告
    lines.push(['info', '本设施组合要求', 'RVR ≥ <b>' + need + ' 米</b>'
      + (needThree ? '（三段都要达到）' : '')
      + (hasCat2 ? '' : '（无资质 CAT Ⅱ，标准不低于 400 米）')]);

    if (head === null) {
      fails.push('还没填实际 RVR/VIS 数值。');
      lines.push(['fail', '数值输入', '缺少实际 RVR/VIS']);
    } else {
      var unit = rvrKind === 'vis' ? 'VIS' : 'RVR';

      if (!needThree) {
        if (head >= need) {
          lines.push(['pass', unit + ' ' + head + ' 米 ≥ ' + need + ' 米', '']);
        } else {
          fails.push(unit + ' ' + head + ' 米低于本设施组合要求的 ' + need + ' 米。');
          lines.push(['fail', unit + ' ' + head + ' 米 < ' + need + ' 米', '差 ' + (need - head) + ' 米']);
        }
      } else {
        // 勾了三段 RVR 报告：三段都报了才按三段那一行判；
        // 只报接地端时，按 ④ 退回 200 米（200 米含以上只需接地端报告）
        var mid = num('rvrMid');
        var end = num('rvrEnd');
        if (mid !== null && end !== null) {
          var segs = [['接地端', head], ['中间端', mid], ['停止端', end]];
          segs.forEach(function (s) {
            if (s[1] >= f.rvr) {
              lines.push(['pass', s[0] + ' RVR ' + s[1] + ' 米', '≥ ' + f.rvr + ' 米']);
            } else {
              fails.push(s[0] + ' RVR ' + s[1] + ' 米低于 ' + f.rvr + ' 米。');
              lines.push(['fail', s[0] + ' RVR ' + s[1] + ' 米', '< ' + f.rvr + ' 米']);
            }
          });
        } else {
          var needFloor = Math.max(f.rvr, 200);
          lines.push(['info', '只报了接地端', '按 ④：200 米（含）以上只需接地端报告，本标准按 ' + needFloor + ' 米判']);
          if (head >= needFloor) {
            lines.push(['pass', '接地端 RVR ' + head + ' 米 ≥ ' + needFloor + ' 米', '']);
          } else {
            fails.push('接地端 RVR ' + head + ' 米低于 200 米，此时必须获得接地端、中间端、停止端三段 RVR 报告（④）。');
            lines.push(['fail', '接地端 RVR ' + head + ' 米 < ' + needFloor + ' 米', '低于 200 米须三段报告']);
          }
        }
      }
    }

    // 4) 目视避障的云底高（4.2.2）—— 夜间不允许目视避障
    if (el('obst').checked && !night) {
      var cloud = num('cloud'), oh = num('obstH');
      if (cloud === null || oh === null) {
        lines.push(['info', '目视避障云底高（4.2.2）', '填了云底高和障碍物高才能判断']);
      } else {
        var need = Math.ceil((oh + 60) / 10) * 10;   // 高出控制障碍物 60 米，按 10 米向上取整
        if (cloud >= need) {
          lines.push(['pass', '云底高 ' + cloud + ' 米 ≥ ' + need + ' 米', '障碍物 ' + oh + ' 米 + 60 米，按 10 米向上取整']);
        } else {
          fails.push('需要目视避障时，云底高至少要 ' + need + ' 米（障碍物 ' + oh + ' 米 + 60 米，按 10 米向上取整）。');
          lines.push(['fail', '云底高 ' + cloud + ' 米 < ' + need + ' 米', '4.2.2']);
        }
      }
    }

    // 4.5) 不满足时给设施建议：最少再勾哪几项就能满足
    if (fails.length && head !== null && head < need) {
      var sugs = suggestAll(head, night, hasCat2 ? 0 : 400);
      sugs.forEach(function (sg) {
        lines.push(['sug', '满足建议',
          '需要「' + sg.names + '」，标准降到 RVR ' + sg.rvr + ' 米']);
      });
    }

    lines.forEach(function (x) { box.appendChild(line(x[0], x[1], x[2])); });

    // 5) 结论
    var v = el('verdict');
    v.className = 'verdict ' + (fails.length ? 'bad' : 'ok');
    el('verdictBig').textContent = fails.length ? '不满足起飞标准' : '满足起飞标准';
    el('verdictSub').textContent = fails.length
      ? fails[0] + (fails.length > 1 ? '（共 ' + fails.length + ' 条不满足）' : '')
      : '仅依据全天候按表1设施—RVR 对应关系，本条件可以起飞。';

  }

  el('btn-run').addEventListener('click', run);

  el('btn-reset').addEventListener('click', function () {
    el('rvr').value = '';
    el('rvrMid').value = '';
    el('rvrEnd').value = '';
    lockSeg(el('rvrMid'));
    lockSeg(el('rvrEnd'));
    el('cloud').value = '';
    el('obstH').value = '';
    el('obst').checked = false;
    el('obstBox').hidden = true;
    el('obstField').hidden = false;
    el('baseStd').checked = false;
    el('baseStdBox').hidden = true;
    el('engCount').value = '2';
    // RVR / VIS 复位成 RVR
    hasCat2 = true;
    el('cat2Btn').classList.add('on');
    rvrKind = 'rvr';
    el('rvrKindLabel').textContent = '实际 RVR（米）';
    Array.prototype.forEach.call(el('rvrSeg').querySelectorAll('button'), function (x) {
      x.classList.toggle('on', x.dataset.v === 'rvr');
    });
    dayNight = 'day';
    document.body.classList.remove('is-night');
    Array.prototype.forEach.call(el('seg').querySelectorAll('button'), function (x) {
      x.classList.toggle('on', x.dataset.v === 'day');
    });
    defaultPick();
    el('checks').innerHTML = '';
    el('verdict').className = 'verdict idle';
    el('verdictBig').textContent = '等待输入';
    el('verdictSub').textContent = '';
  });

  lockSeg(el('rvrMid'));
  lockSeg(el('rvrEnd'));
  el('rvrMid').addEventListener('click', function () { unlockSeg(el('rvrMid')); });
  el('rvrEnd').addEventListener('click', function () { unlockSeg(el('rvrEnd')); });

  defaultPick();
})();
