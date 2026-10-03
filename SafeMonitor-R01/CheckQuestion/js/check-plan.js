/**
 * 法定自查系统（2/4）审核计划视图
 * ==================================================================
 * 左边「受检单位」那一栏 + 右边的「年度审核计划」总览表 + 单位的新增/编辑/删除。
 * 问题库在 check-issues.js，这里只负责「什么时候去查哪个单位」。
 * ==================================================================
 */

(function (W) {
    'use strict';

    const {
        $, esc, state, CFG, uid, TODAY,
        monthLabel, daysToPlan, planText, planSoon,
        auditorStyle, defaultChipInk, isImageUrl, sizeText,
        openModal, closeModal, toast, markChanged
    } = W;

    /* ============================== 单位与统计 ============================== */

    /**
     * 一个单位属于哪一档（计划表的排序和分割条都靠它判）：
     *   1 = 还没到的正常计划（含还没排计划的）
     *   2 = 已经过期、却还没完成
     *   3 = 已完成审核
     */
    function planGroup(u) {
        if (u.audited) return 3;
        const d = daysToPlan(u.plan);
        if (d !== null && d < 0) return 2;
        return 1;
    }

    /**
     * 单位的排队规则（2026-09-21 用户要求）。从上到下分三档：
     *   ① **还没到的正常计划**（包括还没排计划的，它们在①里沉到最后）；
     *   ② **已经过期、却还没完成的** —— 下一批要盯的就是这些；
     *   ③ **已完成审核的**，沉到最下面。
     * 计划表里②、③两档前面各插一条分割条（见 renderPlanView）。
     * 每档里再按计划月份从近到远，同月按名字。
     */
    function sortUnits(list) {
        return (list || []).slice().sort((a, b) => {
            const ga = planGroup(a);
            const gb = planGroup(b);
            if (ga !== gb) return ga - gb;

            if (!!a.plan !== !!b.plan) return a.plan ? -1 : 1;
            if (a.plan && b.plan && a.plan !== b.plan) return a.plan < b.plan ? -1 : 1;
            return a.name.localeCompare(b.name, 'zh-Hans-CN');
        });
    }

    function unitOf(id) {
        return (state.data.units || []).find((u) => u.id === id) || null;
    }

    /**
     * 默认看哪个单位：**左边列表的第一个**（不是「全部单位」）。
     * 2026-09-21 用户要求：「问题页，受检单位默认选择第一个，不要默认选全部单位」。
     * 列表的顺序就是 sortUnits() 排出来的（正常计划 → 已过期未完成 → 已完成），
     * 所以「第一个」就是屏幕上看到的那一行。一个单位都没有时才回到「全部单位」。
     */
    function defaultUnitId() {
        const first = sortUnits(state.data.units || [])[0];
        return first ? first.id : '__all';
    }

    /**
     * 某个单位的问题统计。
     * @param {string} unitId  传 '__all' 就是全部单位
     * @returns {{total:number, byLevel:Object, open:number, done:number}}
     */
    function countsFor(unitId) {
        const all = state.data.issues || [];
        const list = (unitId && unitId !== '__all')
            ? all.filter((q) => q.unit === unitId)
            : all;

        const byLevel = {};
        (CFG.LEVELS || []).forEach((lv) => { byLevel[lv] = 0; });

        let open = 0;
        let done = 0;
        list.forEach((q) => {
            if (byLevel[q.level] === undefined) byLevel[q.level] = 0;
            byLevel[q.level] += 1;
            if (q.status === 'done') done += 1; else open += 1;
        });

        return { total: list.length, byLevel, open, done };
    }

    /** 最近一次还没到的检查：{ unit, days }；全都过了或没排计划就返回 null */
    function nextCheck() {
        // 已完成审核的不算「下一次」—— 别把刚查完的那个又拿出来说
        const list = sortUnits(state.data.units || []).filter((u) => u.plan && !u.audited);
        for (let i = 0; i < list.length; i += 1) {
            const d = daysToPlan(list[i].plan);
            if (d !== null && d >= 0) return { unit: list[i], days: d };
        }
        return null;
    }

    /** 「2027-04 检查 · 还有 192 天」这行小字，颜色按远近来；已完成的就直接标出来 */
    function planLine(u) {
        if (u.audited) return '<span class="unit-plan is-done">✓ 已完成审核</span>';
        if (!u.plan) return '<span class="unit-plan">未排检查计划</span>';
        const s = planSoon(u.plan);
        const cls = s === 'over' ? 'is-over' : (s === 'soon' ? 'is-soon' : '');
        return `<span class="unit-plan ${cls}">${esc(monthLabel(u.plan))} 检查 · ${esc(planText(u.plan))}</span>`;
    }

    /* ============================== 左边：受检单位栏 ============================== */

    function renderSide() {
        const box = $('unit-list');
        if (!box) return;

        const units = sortUnits(state.data.units || []);
        const total = countsFor('__all');

        let html = '';

        units.forEach((u) => {
            const c = countsFor(u.id);
            html += `<button class="unit ${state.unit === u.id ? 'is-on' : ''}" data-unit="${esc(u.id)}">
                <span class="unit-body">
                    <span class="unit-name">${esc(u.name)}</span>
                    ${planLine(u)}
                </span>
                <span class="unit-badge ${c.total ? 'has' : ''}">${c.total}</span>
            </button>`;
        });

        // 「全部单位」放在**最后**（2026-09-21 用户要求：具体单位排前面）
        html += `<button class="unit ${state.unit === '__all' ? 'is-on' : ''}" data-unit="__all">
            <span class="unit-body">
                <span class="unit-name">全部单位</span>
                <span class="unit-plan">${units.length} 个受检单位</span>
            </span>
            <span class="unit-badge ${total.total ? 'has' : ''}">${total.total}</span>
        </button>`;

        box.innerHTML = html;

        const cnt = $('side-count');
        if (cnt) cnt.textContent = `${units.length} 个 · ${total.total} 条问题`;
    }

    /* ============================== 右边：审核计划总览 ============================== */

    function renderPlanView() {
        const main = $('main');
        if (!main) return;

        const units = sortUnits(state.data.units || []);
        const total = countsFor('__all');
        const next = nextCheck();

        /*
         * 三个档次之间各插一条分割条（2026-09-21 用户要求：过期的也要和正常计划分开）：
         *   ① 正常计划 ─── ② 已过期未完成 ─── ③ 已完成
         * 每档前面只有「上面确实还有东西」才插 —— 整表就只有过期项时，
         * 顶上那条分割线没有任何分隔意义。
         */
        const groupCount = [0, 0, 0, 0];
        units.forEach((u) => { groupCount[planGroup(u)] += 1; });

        let lastGroup = 0;

        const rows = units.map((u) => {
            const c = countsFor(u.id);
            const g = planGroup(u);
            const s = planSoon(u.plan);
            const cls = s === 'over' ? 'is-over' : (s === 'soon' ? 'is-soon' : '');
            const who = (u.auditors || []).length
                ? `<span class="who-list">${u.auditors.map((n) => `<span class="chip who" style="${esc(auditorStyle(n))}">${esc(n)}</span>`).join('')}</span>`
                : '<span class="chip plain">未指定</span>';

            // 跨档了 → 插一条分割条（上面那一档有几个就写几个）
            let divider = '';
            if (g !== lastGroup) {
                const above = groupCount.slice(1, g).reduce((n, x) => n + x, 0);
                if (g === 2 && above) {
                    divider = `<tr class="plan-divider is-over"><td colspan="8">`
                        + `<span>已过期未完成（${groupCount[2]} 个）</span></td></tr>`;
                } else if (g === 3 && above) {
                    divider = `<tr class="plan-divider"><td colspan="8">`
                        + `<span>已完成审核（${groupCount[3]} 个）</span></td></tr>`;
                }
                lastGroup = g;
            }

            // ⚠ 热区是**整行**（用户澄清：不是点单位名那几个字，是点整行）。
            //   所以 data-unit-view 挂在 <tr> 上；单位名就是个普通加粗文字，
            //   **不再做成链接的样子**（不然会让人以为只有那几个字能点 —— 2026-09-21 用户要求）。
            return divider + `<tr data-unit-view="${esc(u.id)}"${u.audited ? ' class="is-audited"' : ''}>
                <td><span class="plan-unit-name">${esc(u.name)}</span></td>
                <td>${esc(u.plan ? monthLabel(u.plan) : '—')}</td>
                <td class="${u.audited ? '' : cls}">${u.audited
                    ? '<span class="chip done">✓ 已完成</span>'
                    : esc(planText(u.plan))}</td>
                <td class="num">${c.total}</td>
                <td class="num">${c.byLevel[CFG.LEVELS[CFG.LEVELS.length - 1]] || 0}</td>
                <td>${who}</td>
                <td>${esc(u.note || '')}${(u.files || []).length
                    ? `<span class="chip file-n">附件 ${u.files.length}</span>` : ''}</td>
                <td class="cell-actions">
                    <button class="ico" data-edit-unit="${esc(u.id)}" title="编辑这个单位">✎</button>
                    <button class="ico del" data-del-unit="${esc(u.id)}" title="删除这个单位">✕</button>
                </td>
            </tr>`;
        }).join('');

        const sub = `${units.length} 个受检单位 · 问题库共 ${total.total} 条`
            + (next ? ` · 最近一次：${monthLabel(next.unit.plan)} ${next.unit.name}（${planText(next.unit.plan)}）` : '');

        main.innerHTML = `<div class="pane">
            <div class="pane-head">
                <h2 class="pane-title">年度审核计划<span class="pane-sub">${esc(sub)}</span></h2>
                <div class="pane-tools">
                    <button class="btn" data-act="export-csv" title="导出下面这张表">⤓ 导出 CSV</button>
                    <button class="btn primary" data-act="new-unit">＋ 新增受检单位</button>
                </div>
            </div>
            <div class="plan-body">
                ${units.length ? `<table class="plan-table">
                    <thead><tr>
                        <th>受检单位</th><th>计划检查</th><th>距今</th>
                        <th class="num">问题</th><th class="num">严重</th>
                        <th>审核员</th><th>备注</th><th></th>
                    </tr></thead>
                    <tbody>${rows}</tbody>
                </table>` : `<div class="empty">
                    还没有受检单位。<br>
                    点右上角「＋ 新增受检单位」加一个（比如「飞行部」），再填上计划检查的月份。<br>
                    比如：2027 年 4 月查飞行部、7 月查运技部、8 月查达卡航站、9 月查昆明航站。
                </div>`}
            </div>
        </div>`;
    }

    /* ============================== 单位：新增 / 编辑 / 删除 ============================== */

    /**
     * 单位编辑器里附件区的「当前附件数组」。
     * 保存按钮是先建好、后点击的，闭包拿不到局部变量，所以存在这儿（同行问题的 editorFiles）。
     */
    let editorFiles = null;

    function openUnitEditor(id) {
        const u = id ? unitOf(id) : null;
        const auditors = state.data.auditors || [];

        // 审核员：一排小牌子，点一下选中 / 再点一下取消，**可以多选**
        const picked = new Set(u ? (u.auditors || []) : []);
        const whoPick = auditors.length
            ? `
                <div class="who-pick" id="u-auditors">
                    ${auditors.map((a) => `<button type="button" class="who-opt${picked.has(a.name) ? ' is-on' : ''}"
                        data-who="${esc(a.name)}"
                        style="--who:${esc(a.color || '#6b7280')};--ink:${esc(a.ink || defaultChipInk())}">${esc(a.name)}</button>`).join('')}
                </div>
                `
            : '<p class="hint" style="margin:0">审核员名单是空的，去 <code>js/check-config.js</code> 的 AUDITORS 里加。</p>';

        const buttons = [];
        if (u) buttons.push({ text: '删除这个单位', cls: 'danger', onClick: () => deleteUnit(u.id) });
        buttons.push({ spacer: true });
        buttons.push({ text: '取消', cls: 'ghost', onClick: closeModal });
        buttons.push({ text: '保存', cls: 'primary', onClick: () => saveUnitForm(u) });

        openModal({
            title: u ? `编辑受检单位 · ${u.name}` : '新增受检单位',
            size: 'xl',       // 和「编辑问题 / 问题详情」一样大（用户要求）
            buttons: buttons,
            body: `
                <label class="field"><span class="field-label">单位名称</span>
                    <input type="text" id="u-name" value="${esc(u ? u.name : '')}" placeholder="例如：飞行部"></label>
                <label class="field"><span class="field-label">计划检查月份</span>
                    <input type="month" id="u-plan" value="${esc(u ? u.plan : '')}"></label>
                <div class="field">
                    <label class="check">
                        <input type="checkbox" id="u-audited"${u && u.audited ? ' checked' : ''}>
                        已完成审核
                    </label>
                </div>
                <div class="field">
                    <span class="field-label">审核员（可多选）</span>
                    ${whoPick}
                </div>
                <label class="field"><span class="field-label">备注</span>
                    <input type="text" id="u-note" value="${esc(u ? u.note : '')}" placeholder="可空，例如：年度审核 / 专项"></label>
                <label class="field"><span class="field-label">情况说明（可空：这次审核的总体情况、结论、后续要求…）</span>
                    <textarea id="u-conclusion" class="tall"
                        placeholder="例如：本次审核共发现 5 项问题，均已现场确认；要求飞行部于 2027 年 5 月 31 日前完成整改并书面反馈…">${esc(u ? u.conclusion : '')}</textarea></label>
                <div class="field">
                    <span class="field-label">相关附件（可空：审核计划、记录表、证据材料…）</span>
                    <div class="file-list" id="u-file-list"></div>
                    <div class="drop-zone" id="u-drop-zone">
                        把文件拖到这里，或者
                        <button type="button" class="btn ghost" id="u-pick">选择文件</button>
                        <input type="file" id="u-file-input" multiple hidden>
                    </div>
                </div>
               `
        });

        // 小牌子上的点击：在刚建出来的那个元素上挂，关掉就跟着销毁，不会一次次叠加
        const pick = $('u-auditors');
        if (pick) {
            pick.addEventListener('click', (e) => {
                const b = e.target.closest('.who-opt');
                if (b) b.classList.toggle('is-on');
            });
        }

        // 附件区（画列表 / 拖放上传 / 去掉）都在 check-core.js 的 bindFileBox 里，两边共用
        const box = W.bindFileBox({
            list: 'u-file-list',
            zone: 'u-drop-zone',
            input: 'u-file-input',
            pick: 'u-pick',
            files: (u && u.files) || []
        });
        editorFiles = box.get();
    }

    function saveUnitForm(u) {
        const name = ($('u-name').value || '').trim();
        const plan = W.normalizeMonth($('u-plan').value);
        // 审核员可以多选：把亮着的小牌子都收上来
        const auditors = Array.from(document.querySelectorAll('#u-auditors .who-opt.is-on'))
            .map((b) => b.getAttribute('data-who'));
        const note = ($('u-note').value || '').trim();
        const audited = $('u-audited').checked;
        const conclusion = ($('u-conclusion').value || '').trim();
        // 附件：上传早就完成了，这里只是把记录挂上去
        const files = (editorFiles || []).slice();

        if (!name) {
            toast('单位名称不能为空');
            $('u-name').focus();
            return;
        }

        /*
         * 这里**故意不做重名校验**（2026-09-21 用户要求）。
         * 审核是长期的事：飞行部 2025 年审过一遍，2026 年、2027 年还要再审。
         * 所以同一部门可以有好几行，**每行是一轮年度审核**，各自带自己的问题库。
         * 靠「计划检查月份 / 已完成」把同一部门的不同轮次区分开。
         */

        if (u) {
            u.name = name;
            u.plan = plan;
            u.auditors = auditors;
            u.audited = audited;
            u.note = note;
            u.conclusion = conclusion;
            u.files = files;
            delete u.lead;          // 老字段清掉，存回 OSS 的就是新格式
            toast(`已保存「${name}」`);
        } else {
            state.data.units.push({ id: uid('unit'), name, plan, auditors, audited, note, conclusion, files });
            state.data.units = sortUnits(state.data.units);
            toast(`已新增受检单位「${name}」`);
        }

        closeModal();
        markChanged();
    }

    /* ============================== 看一个单位（只读） ============================== */

    /**
     * 「看」一个受检单位：只读的内容框，和「问题详情」一个模式。
     *
     * 为什么要有它（2026-09-21 用户要求）：计划表里点单位名以前是**直接跳到问题库**，
     * 但那时候很多信息（备注、情况说明、相关附件）根本看不到，附件里的图片也没法预览。
     * 现在点名字先弹这个，想看问题库就点右下角那个「▤ 看它的问题库」。
     */
    function openUnitView(id) {
        const u = unitOf(id);
        if (!u) return;

        const c = countsFor(u.id);
        const files = u.files || [];
        const pics = files.filter((f) => isImageUrl(f.url));
        const s = planSoon(u.plan);
        const soonCls = s === 'over' ? 'is-over' : (s === 'soon' ? 'is-soon' : '');

        const who = (u.auditors || []).length
            ? u.auditors.map((n) => `<span class="chip who" style="${esc(auditorStyle(n))}">${esc(n)}</span>`).join('')
            : '<span class="chip plain">未指定审核员</span>';

        openModal({
            title: `受检单位 · ${u.name}`,
            size: 'xl',
            buttons: [
                { text: '关闭', cls: 'ghost', onClick: closeModal },
                // 直接换内容就行，不要先 closeModal（它是延时藏起来的，会把新框一起藏掉）
                { text: '✎ 编辑单位', cls: 'ghost', onClick: () => openUnitEditor(id) },
                {
                    text: '▤ 看它的问题库', cls: 'primary',
                    onClick: () => { closeModal(); W.setView('issues'); W.setUnit(id); }
                }
            ],
            body: `
                <div class="view-head">
                    <span class="view-date">${esc(u.plan ? monthLabel(u.plan) : '未排检查计划')}</span>
                    ${u.plan ? `<span class="chip plain ${soonCls}">${esc(planText(u.plan))}</span>` : ''}
                    ${u.audited ? '<span class="chip done">✓ 已完成</span>' : ''}
                    ${who}
                </div>
                <p class="unit-view-count">问题库共 <b>${c.total}</b> 条
                    （待审核 <b>${c.open}</b>、已完成 <b>${c.done}</b>）</p>
                ${u.note ? `<p class="unit-view-note">备注：${esc(u.note)}</p>` : ''}
                ${u.conclusion ? `
                <div class="view-note">
                    <span class="field-label">情况说明</span>
                    <p class="view-note-body">${esc(u.conclusion)}</p>
                </div>` : ''}
                ${files.length ? `
                <div class="view-files">
                    <span class="field-label">相关附件（共 ${files.length} 个${pics.length ? '，图片停一下就能预览' : ''}）</span>
                    <div class="file-list">${files.map((f) => `
                        <div class="file-row">
                            <a class="file-name" href="${esc(f.url)}" target="_blank"
                               rel="noopener">📄 ${esc(f.name)}</a>
                            <span class="file-size">${esc(sizeText(f.size))}</span>
                        </div>`).join('')}</div>
                    ${pics.length ? `<div class="view-thumbs">${pics.map((f) => `
                        <a class="view-thumb" href="${esc(f.url)}" target="_blank" rel="noopener">
                            <img src="${esc(f.url)}" alt="${esc(f.name)}" loading="lazy">
                        </a>`).join('')}</div>` : ''}
                </div>` : ''}
            `
        });
    }

    function deleteUnit(id) {
        const u = unitOf(id);
        if (!u) return;

        const n = (state.data.issues || []).filter((q) => q.unit === id).length;
        // 带上计划月份：同一个部门可以有好几行（每年一轮），光写名字分不清删的是哪一轮
        const label = u.name + (u.plan ? `（${monthLabel(u.plan)} 那一轮）` : '');
        const msg = n
            ? `「${label}」下面还有 ${n} 条问题记录，删除会把这些问题一起删掉。确定吗？`
            : `确定删除受检单位「${label}」吗？`;
        if (!window.confirm(msg)) return;

        state.data.units = state.data.units.filter((x) => x.id !== id);
        state.data.issues = state.data.issues.filter((q) => q.unit !== id);
        // 删掉的正好是正在看的那个：回到默认的「第一个单位」（不再一头扎进「全部单位」）
        if (state.unit === id) state.unit = defaultUnitId();

        closeModal();
        toast(`已删除「${label}」`);
        markChanged();
    }

    /* ============================== 导出计划 CSV ============================== */

    /** 把审核计划总览导成 CSV（Excel 能直接打开，中文不会乱码） */
    function exportPlanCsv() {
        const units = sortUnits(state.data.units || []);
        if (!units.length) { toast('还没有受检单位'); return; }

        const rows = [['受检单位', '计划检查', '距今', '审核完成', '问题总数', '严重', '审核员', '备注', '情况说明', '附件']];
        units.forEach((u) => {
            const c = countsFor(u.id);
            rows.push([
                u.name,
                u.plan ? monthLabel(u.plan) : '',
                u.plan ? planText(u.plan) : '未排检查计划',
                u.audited ? '是' : '否',
                c.total,
                c.byLevel[CFG.LEVELS[CFG.LEVELS.length - 1]] || 0,
                (u.auditors || []).join('、'),
                u.note || '',
                u.conclusion || '',
                (u.files || []).length ? (u.files || []).map((f) => f.name).join('、') : ''
            ]);
        });

        W.downloadCsv(`年度审核计划_${TODAY}.csv`, rows);
        toast(`已导出 ${units.length} 个受检单位`);
    }

    /* ============================== 挂到命名空间 ============================== */

    Object.assign(W, {
        sortUnits, unitOf, defaultUnitId, countsFor, nextCheck,
        renderSide, renderPlanView, openUnitEditor, openUnitView, saveUnitForm, deleteUnit,
        exportPlanCsv
    });
})(window.Check);
