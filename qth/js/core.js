/* 起飞最低标准判定 —— 基础层（全局状态 + DOM 小工具）
   依赖：js/data.js（QTH.AP）*/
window.QTH = window.QTH || {};
(function (Q) {
  'use strict';

  Q.el = function (id) { return document.getElementById(id); };

  // 全部可变状态集中在这里，别的模块统一读 Q.state
  Q.state = {
    dayNight: 'day',      // day / night
    picked: {},           // 当前选中的跑道设施
    rvrKind: 'rvr',       // rvr / vis
    hasCat2: true,        // 是否有资质 CAT Ⅱ（默认有）
    airport: '',          // 机场（空 = 默认全天候）
    rwy: '',              // 跑道
    lvp: false,           // LVP（低能见运行）是否实施中
    acCat: 'C'            // 机型类别 C / D（LVP 标准 200 / 250）
  };

  // 当前选中的跑道公布标准，没选就返回 null
  Q.curRwy = function () {
    var S = Q.state;
    var ap = Q.AP[S.airport];
    if (!ap) return null;
    for (var i = 0; i < ap.rwys.length; i += 1) {
      if (ap.rwys[i].k === S.rwy) return ap.rwys[i];
    }
    return null;
  };

  // 中间端 / 停止端：没勾「三段 RVR 报告」时锁住
  Q.lockSeg = function (inp) {
    inp.readOnly = true;
    inp.classList.add('locked');
  };

  Q.unlockSeg = function (inp) {
    inp.readOnly = false;
    inp.classList.remove('locked');
  };

  // 读输入框的数值，空 / 非数字返回 null
  Q.num = function (id) {
    var v = Q.el(id).value.trim();
    if (v === '') return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  };

  // 画一条检查项
  Q.line = function (kind, text, sub) {
    var li = document.createElement('li');
    li.className = kind;
    li.innerHTML = '<span class="ic">' + (kind === 'pass' ? '✓' : kind === 'fail' ? '✗' : '·') + '</span>'
      + '<span class="tx">' + text + (sub ? ' <em>' + sub + '</em>' : '') + '</span>';
    return li;
  };

  // 红字提示（LVP 强制项之类），再点别的操作就清掉
  Q.warn = function (msg) {
    Q.el('lpvWarn').hidden = false;
    Q.el('lpvWarn').textContent = msg;
  };

  Q.clearWarn = function () {
    Q.el('lpvWarn').hidden = true;
    Q.el('lpvWarn').textContent = '';
  };
})(window.QTH);
