/**
 * 管理评审系统（4/4）六步闭环看板
 * ==================================================================
 * 把全部 QAR 项目按「当前所处的那一步」摆进六列（调查 → 分析 → 讲评 →
 * 措施 → 改进 → 督促），六步全完成的进最右边「✓ 已闭环」那一列。
 * 点某张卡片，就回到「项目闭环」视图并定位到那个项目。
 * ==================================================================
 */

(function (W) {
    'use strict';

    const { $, esc, state } = W;

    const deptChip = (name) => (name
        ? `<span class="chip dept" style="${W.deptStyle(name)}">${esc(name)}</span>` : '');

    const dots = (item) => `<span class="dots">${W.itemStages(item)
        .map((s) => `<i class="dot is-${s.status}"></i>`).join('')}</span>`;

    /** 按搜索词 + 级别过滤 */
    function filterItems() {
        const q = String(state.query || '').trim().toLowerCase();
        return (state.data.items || []).filter((it) => {
            if (state.level && it.level !== state.level) return false;
            if (!q) return true;
            const hay = [it.no, it.title, it.desc, it.owner, it.flight, it.aircraft, it.source].join(' ').toLowerCase();
            return hay.indexOf(q) >= 0;
        });
    }

    function card(it) {
        return `
        <button class="bcard" data-id="${esc(it.id)}">
            <span class="bcard-top">
                <span class="bcard-no">${esc(it.no || '未编号')}</span>
                <span class="chip ${W.levelClass(it.level)}">${esc(it.level)}</span>
            </span>
            <span class="bcard-title">${esc(it.title)}</span>
            <span class="bcard-foot">${dots(it)}${deptChip(it.lead)}</span>
        </button>`;
    }

    function col(def, items) {
        const key = def.key;
        return `
        <div class="bcol" data-key="${esc(key)}">
            <div class="bcol-head">
                <span class="bcol-name">${esc(def.name)}</span>
                ${deptChip(def.dept)}
                <span class="bcol-count">${items.length}</span>
            </div>
            <div class="bcol-desc">${esc(def.desc || '')}</div>
            <div class="bcol-list">${items.map(card).join('') || '<p class="hint">—</p>'}</div>
        </div>`;
    }

    function render() {
        const box = $('main');
        if (!box) return;

        const defs = W.stageDefs();
        const items = filterItems();

        const cols = defs.map((d) => ({ def: d, items: [] }));
        const closed = [];
        items.forEach((it) => {
            const cur = W.currentStage(it);
            if (!cur) { closed.push(it); return; }
            const col2 = cols.find((c) => c.def.key === cur.key);
            (col2 ? col2.items : closed).push(it);
        });

        const levels = W.CFG.LEVELS || [];
        const filters = [`<button class="chip-filter${state.level ? '' : ' is-on'}" data-level="">全部</button>`]
            .concat(levels.map((v) => `<button class="chip-filter${state.level === v ? ' is-on' : ''}" data-level="${esc(v)}">${esc(v)}</button>`))
            .join('');

        box.innerHTML = `
        <div class="pane">
            <div class="pane-head">
                <h2 class="pane-title">六步闭环看板<span class="pane-sub">共 ${items.length} 个项目</span></h2>
                <div class="pane-tools">
                    <div class="chips">${filters}</div>
                    <input class="search" id="board-search" placeholder="搜索项目…" value="${esc(state.query)}">
                </div>
            </div>
            <div class="board-body">
                <div class="board-cols">
                    ${cols.map((c) => col(c.def, c.items)).join('')}
                </div>
                <!-- 已闭环单独放下面：以后可能上百项，做成会换行的网格 -->
                <div class="board-closed">
                    <div class="bcol-head">
                        <span class="bcol-name">✓ 已闭环</span>
                        <span class="bcol-count">${closed.length}</span>
                    </div>
                    <div class="closed-grid">${closed.map(card).join('') || '<p class="hint">—</p>'}</div>
                </div>
            </div>
        </div>`;
    }

    function onClick(e) {
        const cardEl = e.target.closest('.bcard');
        if (cardEl) {
            state.item = cardEl.getAttribute('data-id');
            W.setView('items');           // 回到项目闭环视图并定位
            W.render();
            return;
        }
        const f = e.target.closest('.chip-filter');
        if (f) { state.level = f.getAttribute('data-level') || ''; render(); }
    }

    function onInput(e) {
        if (e.target.id !== 'board-search') return;
        state.query = e.target.value;
        // 只重画看板，别把焦点弄丢：输入框在上面，重画后要还原
        const v = state.query;
        render();
        const inp = $('board-search');
        if (inp) { inp.value = v; inp.focus(); }
    }

    function bind() {
        const main = $('main');
        if (main) {
            main.addEventListener('click', onClick);
            main.addEventListener('input', onInput);
        }
    }

    W.board = { render, bind };
})(window.Review = window.Review || {});
