/* 起飞最低标准判定 —— 判定层（4.2 表 1 与 4.2.1.3 基本标准）
   依赖：core.js、facility.js*/
window.QTH = window.QTH || {};
(function (Q) {
  'use strict';

  var S = Q.state;

  // 4.2.1.3 基本起飞最低标准：双发 VIS1600/RVR1500，三发及以上 VIS800/RVR720
  function runBaseStd() {
    var box = Q.el('checks');
    var fails = [], lines = [];
    var head = Q.num('rvr');
    var three = Number(Q.el('engCount').value) === 3;
    var needRvr = three ? 720 : 1500;
    var needVis = three ? 800 : 1600;
    var isVis = S.rvrKind === 'vis';
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

    lines.forEach(function (x) { box.appendChild(Q.line(x[0], x[1], x[2])); });

    Q.el('verdict').className = 'verdict ' + (fails.length ? 'bad' : 'ok');
    Q.el('verdictBig').textContent = fails.length ? '不满足起飞标准' : '满足起飞标准';
    Q.el('verdictSub').textContent = fails.length
      ? fails[0]
      : '仅依据全天候 4.2.1.3 基本起飞最低标准，本条件可以起飞。';
  }

  // 主判定：按当前设施组合 + 机场跑道 / LVP / 资质 / 目视避障逐条检查
  function run() {
    var box = Q.el('checks');
    box.innerHTML = '';

    // 选了机场但没选跑道：先提示选跑道，不给判定结果
    if (S.airport && !Q.curRwy()) {
      box.appendChild(Q.line('fail', '还没选跑道', '请先选 ' + Q.AP[S.airport].name + ' 的跑道'));
      Q.el('verdict').className = 'verdict bad';
      Q.el('verdictBig').textContent = '请选择跑道';
      Q.el('verdictSub').textContent = '已选机场 ' + Q.AP[S.airport].name + '，请先选择跑道后再判定。';
      return;
    }

    // 勾了「机场未公布起飞标准」→ 按 4.2.1.3 基本起飞最低标准判
    if (Q.el('baseStd').checked) { runBaseStd(); return; }

    var f = Q.judgeFacilities();
    var night = S.dayNight === 'night';

    var fails = [];
    var lines = [];
    var head = Q.num('rvr');

    // 0) 设施组合本身不够
    if (!f) {
      box.appendChild(Q.line('fail', '设施选择不足', '至少选「跑道边灯」或「跑道中线标志」'));
      Q.el('verdict').className = 'verdict bad';
      Q.el('verdictBig').textContent = '无法判定';
      Q.el('verdictSub').textContent = '先选出实际可用的跑道设施。';
      return;
    }

    // 1) 运行时段（含夜间灯光要求）
    var lightOk = S.picked.end && (S.picked.edge || S.picked.center);
    if (night && f.dayOnly) {
      fails.push(f.key === 'rwyNoLight'
        ? '无跑道灯光时只能昼间起飞（' + Q.curRwy().label + ' 公布标准）。'
        : '「仅目视参考」只在昼间可用，夜间不能作为起飞最低标准的依据（表 1）。');
      lines.push(['fail', '运行时段', '该组合仅昼间可用']);
    } else if (night && !lightOk) {
      fails.push('夜间运行至少需要「跑道边灯 + 跑道末端灯」或「跑道中线灯 + 跑道末端灯」正常工作（表 1 ①）。');
      lines.push(['fail', '夜间灯光要求（①）',
        S.picked.end ? '缺跑道边灯/跑道中线灯' : '没勾跑道末端灯']);
    } else {
      lines.push(['pass', '运行时段', night ? '夜间（边灯或中线灯 + 跑道末端灯）' : '昼间']);
    }

    // 2) LVP 实施中：灯光强制 + 机型类别标准
    if (S.lvp) {
      lines.push(['info', 'LVP 实施中（' + S.acCat + ' 类）',
        'RVR ≥ <b>' + (S.acCat === 'D' ? 250 : 200) + ' 米</b>，跑道边灯＋跑道中线灯']);
    }

    // 3) 需要的 RVR / VIS（无 CAT Ⅱ 资质时不低于 400 米）
    var unit = S.rvrKind === 'vis' ? 'VIS' : 'RVR';
    var need = S.hasCat2 ? f.rvr : Math.max(f.rvr, 400);
    var needThree = f.three && S.hasCat2;      // 门限抬到 400 时不再需要三段报告
    lines.push(['info', '本设施组合要求', unit + ' ≥ <b>' + need + ' 米</b>'
      + (needThree ? '（三段都要达到）' : '')
      + (S.hasCat2 ? '' : '（无资质 CAT Ⅱ，标准不低于 400 米）')]);

    if (head === null) {
      fails.push('还没填实际 RVR/VIS 数值。');
      lines.push(['fail', '数值输入', '缺少实际 RVR/VIS']);
    } else {
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
        var mid = Q.num('rvrMid');
        var end = Q.num('rvrEnd');
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
    if (Q.el('obst').checked && !night) {
      var cloud = Q.num('cloud'), oh = Q.num('obstH');
      if (cloud === null || oh === null) {
        lines.push(['info', '目视避障云底高（4.2.2）', '填了云底高和障碍物高才能判断']);
      } else {
        var needCloud = Math.ceil((oh + 60) / 10) * 10;   // 高出控制障碍物 60 米，按 10 米向上取整
        if (cloud >= needCloud) {
          lines.push(['pass', '云底高 ' + cloud + ' 米 ≥ ' + needCloud + ' 米', '障碍物 ' + oh + ' 米 + 60 米，按 10 米向上取整']);
        } else {
          fails.push('需要目视避障时，云底高至少要 ' + needCloud + ' 米（障碍物 ' + oh + ' 米 + 60 米，按 10 米向上取整）。');
          lines.push(['fail', '云底高 ' + cloud + ' 米 < ' + needCloud + ' 米', '4.2.2']);
        }
      }
    }

    // 4.5) 不满足时给设施建议：最少再勾哪几项就能满足
    if (fails.length && head !== null && head < need) {
      var sugs = Q.suggestAll(head, night, S.hasCat2 ? 0 : 400);
      sugs.forEach(function (sg) {
        lines.push(['sug', '满足建议',
          '需要「' + sg.names + '」，标准降到 RVR ' + sg.rvr + ' 米']);
      });
    }

    lines.forEach(function (x) { box.appendChild(Q.line(x[0], x[1], x[2])); });

    // 5) 结论
    var v = Q.el('verdict');
    v.className = 'verdict ' + (fails.length ? 'bad' : 'ok');
    Q.el('verdictBig').textContent = fails.length ? '不满足起飞标准' : '满足起飞标准';
    Q.el('verdictSub').textContent = fails.length
      ? fails[0] + (fails.length > 1 ? '（共 ' + fails.length + ' 条不满足）' : '')
      : '仅依据全天候按表1设施—RVR 对应关系，本条件可以起飞。';
  }

  Q.run = run;
  Q.runBaseStd = runBaseStd;
})(window.QTH);
