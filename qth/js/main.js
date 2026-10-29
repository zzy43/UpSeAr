/* 起飞最低标准判定 —— 启动（绑好事件、锁住三段输入、铺默认设施）
   依赖：以上全部模块，放最后加载*/
(function (Q) {
  'use strict';

  Q.setup();                                  // 绑定全部控件事件

  Q.lockSeg(Q.el('rvrMid'));
  Q.lockSeg(Q.el('rvrEnd'));

  Q.defaultPick();                            // 铺默认设施并刷新提示 / 摘要
})(window.QTH);
