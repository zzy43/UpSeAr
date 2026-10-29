/* 起飞最低标准判定 —— 输入层（各控件的交互与复位）
   依赖：core.js、facility.js、judge.js*/
window.QTH = window.QTH || {};
(function (Q) {
  'use strict';

  var S = Q.state;

  function each(sel, fn) {
    Array.prototype.forEach.call(document.querySelectorAll(sel), fn);
  }

  // ---------- 机场 / 跑道 ----------

  function rwyText(rw) {
    return Q.AP[S.airport].name + ' ' + rw.label + ' 公布起飞标准：'
      + '有跑道边灯（或中线灯）RVR ' + rw.edge + ' 米；'
      + '无跑道灯光 RVR ' + rw.nolight + ' 米（仅昼间）。';
  }

  // LVP 开关：实施中强制「跑道边灯 + 跑道中线灯」，标准 C 类 200 米 / D 类 250 米
  function setLvp(on) {
    S.lvp = !!on;
    Q.el('lpvBtn').classList.toggle('on', S.lvp);
    Q.el('acSeg').hidden = !S.lvp;
    Q.clearWarn();
    // LVP 实施中，跑道已公布标准那一行不再显示（标准由机型类别决定）
    if (S.lvp) {
      Q.el('rwyHint').hidden = true;
    } else {
      var rw0 = Q.curRwy();
      if (rw0) {
        Q.el('rwyHint').hidden = false;
        Q.el('rwyHint').textContent = rwyText(rw0);
      }
    }
    if (S.lvp) {
      delete S.picked.vis;
      S.picked.edge = true;
      S.picked.center = true;
      // LVP 运行必须有资质 CAT Ⅱ
      S.hasCat2 = true;
      Q.el('cat2Btn').classList.add('on');
      Q.renderTags();
      Q.syncThreeBtn();
    }
    Q.syncFac();
  }

  function bindAirport() {
    Q.el('airport').addEventListener('change', function () {
      S.airport = Q.el('airport').value;
      S.rwy = '';
      var sel = Q.el('rwy');
      sel.innerHTML = '';
      var ap = Q.AP[S.airport];
      if (!ap) {
        // 默认（全天候）：按表 1 通用设施组合
        var o0 = document.createElement('option');
        o0.value = '';
        o0.textContent = '---';
        sel.appendChild(o0);
        sel.disabled = true;
        Q.el('rwyHint').hidden = true;
        Q.el('rwyHint').textContent = '';
        Q.el('baseStdField').hidden = false;
        setLvp(false);               // 非昆明机场不提供 LVP
        Q.el('lpvRow').hidden = true;
      } else {
        var o1 = document.createElement('option');
        o1.value = '';
        o1.textContent = '---';
        sel.appendChild(o1);
        ap.rwys.forEach(function (r) {
          var o = document.createElement('option');
          o.value = r.k;
          o.textContent = r.label;
          sel.appendChild(o);
        });
        sel.disabled = false;
        Q.el('rwyHint').hidden = false;
        Q.el('rwyHint').textContent = '已选 ' + ap.name + '，请选择跑道后按该跑道公布标准判定。';
        // 机场已公布起飞标准，就不再适用 4.2.1.3 基本标准
        Q.el('baseStd').checked = false;
        Q.el('baseStdBox').hidden = true;
        Q.el('baseStdField').hidden = true;
        // 只有昆明机场可实施 LVP
        if (!ap.lvp) setLvp(false);
        Q.el('lpvRow').hidden = !ap.lvp;
      }
      Q.syncFac();
    });

    Q.el('rwy').addEventListener('change', function () {
      S.rwy = Q.el('rwy').value;
      var rw = Q.curRwy();
      if (!rw || S.lvp) {
        Q.el('rwyHint').hidden = true;
      } else {
        Q.el('rwyHint').hidden = false;
        Q.el('rwyHint').textContent = rwyText(rw);
      }
      Q.syncFac();
    });

    Q.el('lpvBtn').addEventListener('click', function () { setLvp(!S.lvp); });

    // C / D 类机型（LVP 标准 200 / 250）
    each('#acSeg button', function (b) {
      b.addEventListener('click', function () {
        S.acCat = b.dataset.v;
        each('#acSeg button', function (x) { x.classList.toggle('on', x === b); });
        Q.syncFac();
      });
    });
  }

  // ---------- 时段 / 三段 / 资质 ----------

  function bindSegs() {
    // 昼 / 夜切换：套用该时段的默认设施
    each('#seg button', function (b) {
      b.addEventListener('click', function () {
        S.dayNight = b.dataset.v;
        each('#seg button', function (x) { x.classList.toggle('on', x === b); });
        document.body.classList.toggle('is-night', S.dayNight === 'night');   // 夜间给背景加一点夜色
        var isNight = S.dayNight === 'night';
        Q.el('obstField').hidden = isNight;         // 夜间不提供「目视避障」这一项
        if (isNight) {
          Q.el('obst').checked = false;
          Q.el('obstBox').hidden = true;
        }
        Q.defaultPick();
      });
    });

    // RVR / VIS 切换
    each('#rvrSeg button', function (b) {
      b.addEventListener('click', function () {
        S.rvrKind = b.dataset.v;
        each('#rvrSeg button', function (x) { x.classList.toggle('on', x === b); });
        Q.el('rvrKindLabel').textContent = S.rvrKind === 'vis' ? '实际 VIS（米）' : '实际 RVR（米）';
        Q.syncFac();          // 单位换了，提示里的门限和摘要都要跟着刷新
      });
    });

    // 「三段 RVR 报告」开关（放在昼/夜那一行）
    Q.el('segThree').addEventListener('click', function () {
      S.picked.three = !S.picked.three;
      if (S.picked.three) {
        // 三段 RVR 的前提就是跑道边灯＋跑道中线灯，一并勾上
        delete S.picked.vis;
        S.picked.edge = true;
        S.picked.center = true;
        Q.renderTags();
      }
      Q.syncThreeBtn();
      Q.syncFac();
    });

    // 资质 CAT Ⅱ：没有的话，起飞标准不低于 400 米
    Q.el('cat2Btn').addEventListener('click', function () {
      // LVP 实施中：资质 CAT Ⅱ 不能取消
      if (S.lvp && S.hasCat2) {
        Q.warn('LVP 运行期间，资质 CAT Ⅱ 不能取消。');
        return;
      }
      S.hasCat2 = !S.hasCat2;
      Q.el('cat2Btn').classList.toggle('on', S.hasCat2);
      Q.syncFac();
    });
  }

  // ---------- 数值输入 / 勾选 ----------

  function bindInputs() {
    Q.el('baseStd').addEventListener('change', function () {
      Q.el('baseStdBox').hidden = !Q.el('baseStd').checked;
      Q.syncFac();
    });

    Q.el('obst').addEventListener('change', function () {
      Q.el('obstBox').hidden = !Q.el('obst').checked;
      Q.renderPicks();
    });

    // 输入数值变化时同步上方摘要
    ['rvr', 'rvrMid', 'rvrEnd', 'cloud', 'obstH'].forEach(function (id) {
      Q.el(id).addEventListener('input', Q.renderPicks);
    });

    // 中间端 / 停止端：锁着的时候点一下就能放开
    Q.el('rvrMid').addEventListener('click', function () { Q.unlockSeg(Q.el('rvrMid')); });
    Q.el('rvrEnd').addEventListener('click', function () { Q.unlockSeg(Q.el('rvrEnd')); });
  }

  // ---------- 复位 ----------

  function resetAll() {
    Q.el('rvr').value = '';
    Q.el('rvrMid').value = '';
    Q.el('rvrEnd').value = '';
    Q.lockSeg(Q.el('rvrMid'));
    Q.lockSeg(Q.el('rvrEnd'));
    Q.el('cloud').value = '';
    Q.el('obstH').value = '';
    Q.el('obst').checked = false;
    Q.el('obstBox').hidden = true;
    Q.el('obstField').hidden = false;
    Q.el('baseStd').checked = false;
    Q.el('baseStdBox').hidden = true;
    Q.el('engCount').value = '2';

    // 机场 / 跑道复位成默认（全天候）
    S.airport = '';
    S.rwy = '';
    Q.el('airport').value = '';
    Q.el('rwy').innerHTML = '<option value="">---</option>';
    Q.el('rwy').disabled = true;
    Q.el('rwyHint').hidden = true;
    Q.el('rwyHint').textContent = '';
    Q.el('baseStdField').hidden = false;

    // LVP 复位
    Q.el('lpvRow').hidden = true;
    setLvp(false);

    // 资质 / RVR 类型复位
    S.hasCat2 = true;
    Q.el('cat2Btn').classList.add('on');
    S.rvrKind = 'rvr';
    Q.el('rvrKindLabel').textContent = '实际 RVR（米）';
    each('#rvrSeg button', function (x) { x.classList.toggle('on', x.dataset.v === 'rvr'); });

    // 时段复位
    S.dayNight = 'day';
    document.body.classList.remove('is-night');
    each('#seg button', function (x) { x.classList.toggle('on', x.dataset.v === 'day'); });

    Q.defaultPick();
    Q.el('checks').innerHTML = '';
    Q.el('picks').innerHTML = '';          // 清空后摘要也清掉，等用户重新操作
    Q.el('verdict').className = 'verdict idle';
    Q.el('verdictBig').textContent = '等待输入';
    Q.el('verdictSub').textContent = '';
  }

  // 统一绑定全部控件
  Q.setup = function () {
    bindAirport();
    bindSegs();
    bindInputs();
    Q.el('btn-run').addEventListener('click', function () { Q.run(); });
    Q.el('btn-reset').addEventListener('click', resetAll);
  };
})(window.QTH);
