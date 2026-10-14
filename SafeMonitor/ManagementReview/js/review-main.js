/**
 * 管理评审系统（启动与事件绑定）
 * ==================================================================
 * 看哪个视图（项目闭环 / 六步看板）、顶栏按钮、导入导出、启动加载。
 * ==================================================================
 */

(function (W) {
    'use strict';

    const { $, esc, state, toast } = W;

    /* ============================== 总渲染 ============================== */

    /**
     * 所有「该重画了」的地方都调它（核心层的 loadAll / markChanged 也调 W.render）。
     * 看板视图用整屏宽，所以把左边栏藏起来。
     */
    function render() {
        const wrap = document.querySelector('.wrap');
        if (wrap) wrap.classList.toggle('is-board', state.view === 'board');

        if (state.view === 'board') {
            W.board.render();
        } else {
            W.items.render();
        }

        const vbtn = $('btn-view');
        if (vbtn) vbtn.textContent = state.view === 'board' ? '▤ 项目闭环' : '▦ 六步看板';

        showMeta();
    }

    // 核心层通过 W.render 回调这里
    W.render = render;

    /** 顶栏标题 / 更新时间 */
    function showMeta() {
        const d = state.data || {};
        const genre = String(d.theme || W.themeParam() || 'Management Evaluation').toUpperCase();
        const title = d.title || W.pageTitle();

        const g = $('brand-genre'); if (g) g.textContent = genre;
        const t = $('brand-title'); if (t) t.textContent = title;
        document.title = title;
        const m = $('brand-meta');
        if (m) m.textContent = d.updated ? `数据更新：${d.updated}` : '尚未上传';
    }

    /* ============================== 顶栏 ============================== */

    function bindTopbar() {
        const vbtn = $('btn-view');
        if (vbtn) vbtn.addEventListener('click', () => {
            W.setView(state.view === 'board' ? 'items' : 'board');
            render();
        });

        const tbtn = $('btn-theme');
        if (tbtn) tbtn.addEventListener('click', () => {
            W.applyTheme(W.currentTheme() === 'light' ? 'dark' : 'light');
        });

        // 「⋯」更多菜单：点外面收起
        const more = $('btn-more');
        const menu = $('more-menu');
        if (more && menu) {
            more.addEventListener('click', (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; });
            document.addEventListener('click', () => { menu.hidden = true; });
            menu.addEventListener('click', (e) => e.stopPropagation());
        }

        const closeMenu = () => { if (menu) menu.hidden = true; };

        const ni = $('btn-new-item');
        if (ni) ni.addEventListener('click', () => { closeMenu(); W.setView('items'); render(); W.items.newProject(); });

        const ni2 = $('btn-new-item-2');
        if (ni2) ni2.addEventListener('click', () => { W.setView('items'); render(); W.items.newProject(); });

        const ex = $('btn-export');
        if (ex) ex.addEventListener('click', () => { closeMenu(); exportJson(); });

        const exx = $('btn-export-xlsx');
        if (exx) exx.addEventListener('click', () => { closeMenu(); exportExcelDialog(); });

        const im = $('btn-import');
        if (im) im.addEventListener('click', () => { closeMenu(); importJson(); });

        const rl = $('btn-reload');
        if (rl) rl.addEventListener('click', () => { closeMenu(); location.reload(); });
    }

    /**
     * 弹层：只有右上角 ✕ 能关（底部还有「取消」按钮）。
     * ⚠ 点遮罩**不关** —— 一是容易误触（在框里拖拽选中文字、鼠标划到外面松开就会被当成点遮罩），
     *   二是用户明确要求：点弹框外面不要关（2026-10-11）。
     */
    function bindModal() {
        const x = $('modal-x');
        if (x) x.addEventListener('click', W.closeModal);
    }

    /* ============================== 导入 / 导出 ============================== */

    /**
     * 导出 Excel：先问一句要导哪个（当前项目 / 全部项目），再走 items.exportExcel。
     * 文件里含三张表：项目总览 / 六步明细 / 情况说明明细。
     */
    function exportExcelDialog() {
        const cur = W.items && W.items.currentItem ? W.items.currentItem() : null;
        W.openModal({
            title: '导出 Excel',
            body: `<p class="hint">导出为 Excel（.xlsx），含「项目总览 / 六步明细 / 情况说明明细」三张表。</p>
                <p class="hint">当前项目：${cur ? `${esc(cur.no || '')} ${esc(cur.title)}` : '（没有可选的项目）'}</p>`,
            buttons: [
                {
                    text: '当前项目', cls: 'primary',
                    onClick: () => { W.closeModal(); W.items.exportExcel('single'); }
                },
                { text: '全部项目', onClick: () => { W.closeModal(); W.items.exportExcel('all'); } },
                { text: '取消', onClick: W.closeModal }
            ]
        });
    }

    function exportJson() {
        const blob = new Blob([JSON.stringify(W.serialize(), null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'review.json';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }

    function importJson() {
        W.openModal({
            title: '导入 JSON',
            body: `<p class="hint">把之前导出的 review.json 内容粘贴进来，覆盖当前数据（导入后会立刻上传）。</p>
                <textarea id="imp-text" class="tall" placeholder='{"departments":[…],"items":[…]}'></textarea>`,
            buttons: [
                { text: '导入', cls: 'primary', onClick: () => {
                    try {
                        const raw = JSON.parse($('imp-text').value);
                        state.data = W.normalize(raw);
                        state.item = '';
                        W.closeModal();
                        W.markChanged();      // 记时间戳 + 自动上传
                        render();
                        toast('已导入');
                    } catch (e) {
                        toast(`JSON 解析失败：${(e && e.message) || e}`);
                    }
                } },
                { text: '取消', onClick: W.closeModal }
            ]
        });
    }

    /* ============================== 启动 ============================== */

    function init() {
        W.initView();                 // 先定看哪个视图（记住上次）
        W.initTheme();                // 亮/暗模式（没记录默认亮色）
        W.items.bind();
        W.board.bind();
        bindTopbar();
        bindModal();
        W.loadAll();                  // 读 OSS（内部会调 W.render）
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})(window.Review = window.Review || {});
