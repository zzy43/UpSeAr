/* 起飞最低标准判定 —— 静态数据（设施清单 / 机场公布标准）
   依赖：无（最先加载，只挂 window.QTH 上的数据）*/
window.QTH = window.QTH || {};
(function (Q) {
  'use strict';

  // 设施项（多选）：每个按钮一个设施，用户把实际可用的勾出来，
  // 再由 judgeFacilities() 反查表 1 对应哪一行、要求多少米。
  Q.ITEMS = [
    { k: 'vis',    label: '仅目视参考', tip: '仅昼间' },
    { k: 'edge',   label: '跑道边灯', tip: '' },
    { k: 'end',    label: '跑道末端灯', tip: '' },
    { k: 'center', label: '跑道中线灯', tip: '' },
    { k: 'mark',   label: '跑道中线标志', tip: '' },
    { k: 'hi',     label: '高光强（间距≤15m）', tip: '' },
    { k: 'hud',    label: '横向引导（如HUD）', tip: '' }
  ];

  // 机场公布起飞标准（选了具体跑道就按这里的数，不再走表 1 通用设施组合）
  // edge    = 有跑道边灯/中线灯时的 RVR
  // nolight = 无跑道灯光时的 RVR（仅昼间）
  // vis     = 该跑道公布的 VIS 最低标准；未公布的填 null，按脚注⑥用等值 VIS 代替
  // lvp     = 该机场是否可实施 LVP
  Q.AP = {
    ZPPP: {
      name: 'ZPPP（昆明/长水）',
      lvp: true,
      rwys: [
        { k: '03',   label: 'RWY03',   edge: 400, nolight: 500, vis: null },
        { k: '21',   label: 'RWY21',   edge: 400, nolight: 500, vis: null },
        { k: '04R',  label: 'RWY04R',  edge: 400, nolight: 500, vis: null },
        { k: '22L',  label: 'RWY22L',  edge: 400, nolight: 500, vis: null }
      ]
    },
    ZSWZ: {
      name: 'ZSWZ（温州/龙湾）',
      lvp: false,
      rwys: [
        { k: '03',   label: 'RWY03',   edge: 400, nolight: 500, vis: 800 },
        { k: '21',   label: 'RWY21',   edge: 400, nolight: 500, vis: 800 }
      ]
    }
  };
})(window.QTH);
