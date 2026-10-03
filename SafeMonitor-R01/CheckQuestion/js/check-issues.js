/**
 * 法定自查系统（3/4）问题库视图
 * ==================================================================
 * 右边那块：某个受检单位的问题清单 + 记录/编辑/删除问题。
 *
 * 这个「问题库」是整个系统的核心用法：
 *   还没到计划检查的那个月之前，审核员平时发现什么就先记一条（几十条攒着），
 *   等到计划那个月真去检查时，打开这个单位的问题库，一条条核对。
 * ==================================================================
 */

(function (W) {
    'use strict';

    const {
        $, esc, state, CFG, uid, TODAY,
        monthLabel, planSoon, levelClass, auditorStyle, isImageUrl,
        sortUnits, unitOf, countsFor, sizeText,
        openModal, closeModal, toast, markChanged
    } = W;

    /* ============================== 取数据 ============================== */

    const currentUnit = () => (state.unit === '__all' ? null : unitOf(state.unit));

    /**
     * 当前该显示哪些问题：按单位过滤、按搜索词过滤。
     *
     * 排序（2026-09-21 用户要求「新增加的放在最上面」「已完成的排到最后」）：
     *   ① **待审核的在前，已完成的沉到最后**；
     *   ② 同一组里按**发现日期**新的在前；
     *   ③ 同一天里**后加的在前**（先把数组倒过来再排，sort 是稳定的）。
     * 为什么③要在同一天里倒一下：只按日期排的话，同一天的几条会按录入先后从上往下排，
     * 刚记完的那条反而跑到这天的最下面去了，看不到。
     */
    function visibleIssues() {
        const q = String(state.query || '').trim().toLowerCase();
        const who = state.who || [];
        return (state.data.issues || [])
            .filter((it) => state.unit === '__all' || it.unit === state.unit)
            // 「只看这几个人记的问题」（点顶上的审核员牌子选的，可多选）
            .filter((it) => !who.length || who.indexOf(it.by) >= 0)
            .filter((it) => {
                if (!q) return true;
                // 附件名也一起搜：想起「有张照片叫…」但忘了是记在哪条上时用得上
                const fname = (it.files || []).map((f) => f.name).join(' ');
                return `${it.text} ${it.detail} ${it.conclusion} ${it.by} ${it.source} ${it.level} ${fname}`
                    .toLowerCase().indexOf(q) >= 0;
            })
            .reverse()      // 同一天里，后加的排前面
            .sort((a, b) => {
                // ① 已完成的沉到最后
                const da = a.status === 'done' ? 1 : 0;
                const db = b.status === 'done' ? 1 : 0;
                if (da !== db) return da - db;
                // ② 发现日期新的在前（同一天的返回 0，保持上面 reverse 过的顺序）
                if (a.date !== b.date) return a.date < b.date ? 1 : -1;
                return 0;
            });
    }

    const nameOfUnit = (id) => {
        const u = unitOf(id);
        return u ? u.name : id;
    };

    /**
     * 卡片上显示长文本前，把**连续空行压掉**（2026-09-21 用户要求）。
     *
     * 为什么：录入详细说明时，段落之间通常是空行（敲两下回车），
     * 而 CSS 的 pre-wrap 下**空行也占一行** —— 卡片上那点行数额度被空行吃掉一半，
     * 看着就像「文字没填满宽度就被截断了」。压掉空行后同样行数能多显示一个段落。
     *
     * ⚠ 只在**卡片**上用。点开「问题详情」看的仍是原样（`it.detail` 本身不动，
     *   CSV 导出的也是原样）—— 排版是排版，数据是数据。
     */
    const squashBlank = (s) => String(s || '').replace(/\n{2,}/g, '\n');

    /**
     * 带计划月份的完整叫法：`飞行部（2027 年 4 月）`。
     * 为什么要带：**同一个部门可以有好几行**（每年一轮审核，见 check-plan.js 的说明），
     * 光写「飞行部」在「全部单位」那个混排列表里根本分不清是哪一轮的。
     */
    const labelOfUnit = (id) => {
        const u = unitOf(id);
        if (!u) return id;
        return u.plan ? `${u.name}（${monthLabel(u.plan)}）` : u.name;
    };

    /* ============================== 拼 HTML ============================== */

    /** 统计那一行 */
    function statHtml() {
        const c = countsFor(state.unit);
        const lv = (CFG.LEVELS || [])
            .map((name) => `<span>${esc(name)} <b>${c.byLevel[name] || 0}</b></span>`)
            .join('<span class="stat-sep">·</span>');

        const who = state.who || [];

        return `<span>共 <b>${c.total}</b> 条</span>
            <span class="stat-sep">·</span>${lv}
            <span class="stat-sep">·</span>
            <span>待审核 <b>${c.open}</b></span>
            <span class="stat-sep">·</span>
            <span>已完成 <b>${c.done}</b></span>`
            + (who.length ? `<span class="stat-sep">·</span><span>只看 <b>${esc(who.join('、'))}</b> <b>${visibleIssues().length}</b> 条</span>` : '')
            + (state.query ? `<span class="stat-sep">·</span><span>搜索筛出 <b>${visibleIssues().length}</b> 条</span>` : '');
    }

    /** 问题卡片列表 */
    function listHtml() {
        const list = visibleIssues();
        const u = currentUnit();

        if (!list.length) {
            const tip = state.query
                ? '没有符合搜索条件的问题。'
                : ((state.who || []).length
                    ? `「${esc((state.who || []).join('、'))}」名下暂时没有记录的问题。<br>
                       点顶上那个名字牌子可以取消只看。`
                    : (u
                        ? `「${esc(u.name)}」的问题库还是空的。<br>
                           平时发现了什么先记一条攒着${u.plan ? `，等 ${esc(monthLabel(u.plan))} 去检查时一并核对` : ''}。`
                        : '还没有任何问题记录。点右上角「＋ 记录问题」开始攒。'));
            return `<div class="empty">${tip}</div>`;
        }

        // 上面是待审核、下面是已完成，中间插一条分割线（2026-09-21 用户要求）
        const openCount = list.filter((it) => it.status !== 'done').length;
        const doneCount = list.length - openCount;
        let dividerDone = false;

        return list.map((it) => {
            const done = it.status === 'done';
            const files = it.files || [];

            let divider = '';
            if (done && !dividerDone) {
                dividerDone = true;
                // 只有上面确实还有「待审核」的才插；整页都是已完成的时候插在最顶上没意义
                if (openCount) {
                    divider = `<div class="issue-divider"><span>已完成（${doneCount} 条）</span></div>`;
                }
            }

            return divider + `<article class="issue" data-level="${esc(it.level)}"
                    data-status="${esc(it.status)}" data-id="${esc(it.id)}">
                <div class="issue-head">
                    <span class="issue-date">${esc(it.date)}</span>
                    <span class="chip ${levelClass(it.level)}">${esc(it.level)}</span>
                    <span class="chip plain">${esc(it.source)}</span>
                    ${state.unit === '__all' ? `<span class="issue-unit">· ${esc(labelOfUnit(it.unit))}</span>` : ''}
                    ${it.by ? `<span class="chip who" style="${esc(auditorStyle(it.by))}">${esc(it.by)}</span>` : ''}
                    ${done ? '<span class="chip done">已完成</span>' : ''}
                    ${files.length ? `<span class="chip file-n">附件 ${files.length}</span>` : ''}
                    <span class="issue-actions">
                        <button class="ico" data-act="edit" title="编辑这条问题">✎</button>
                        <button class="ico ok" data-act="toggle"
                                title="${done ? '改回待审核' : '标记为已完成'}">${done ? '↺' : '✓'}</button>
                        <button class="ico del" data-act="del" title="删除这条问题">✕</button>
                    </span>
                </div>
                <p class="issue-text">${esc(it.text)}</p>
                ${it.detail ? `<p class="issue-detail">${esc(squashBlank(it.detail))}</p>` : ''}
                ${it.conclusion ? `<p class="issue-note"><b>审核情况：</b>${esc(squashBlank(it.conclusion))}</p>` : ''}
                ${files.length ? `<div class="issue-files">${files.map((f) => `
                    <a class="file-name" href="${esc(f.url)}" target="_blank"
                       rel="noopener">📄 ${esc(f.name)}</a>
                    <span class="file-size">${esc(sizeText(f.size))}</span>`).join('')}</div>` : ''}
            </article>`;
        }).join('');
    }

    /**
     * 标题那一行。
     * ⚠ 2026-09-21 用户要求：**所有单位的副标题全部取消**，
     *   腾出来的位置换成原来单独一栏的「统计行」（共 N 条 · 一般 … · 已完成 …），
     *   这样标题和统计并成一行、省掉一整栏的高度。
     *   所以这里只返回标题，不再算 sub 了（原来那个包含计划月份 / 备注 / 审核员）。
     */
    function titleParts() {
        const u = currentUnit();
        if (!u) return { title: '全部单位' };

        const s = planSoon(u.plan);
        const cls = s === 'over' ? 'is-over' : (s === 'soon' ? 'is-soon' : '');
        return { title: u.name, cls };
    }

    /* ============================== 画整块 / 只刷新列表 ============================== */

    function renderIssuesView() {
        const main = $('main');
        if (!main) return;

        const t = titleParts();
        const u = currentUnit();

        // 「统计行」现在就在标题后面（.stat-row.is-inline），不再是单独一栏 ——
        // 这样只在 pane-head 里占一行，省掉原来 stat-row 那一整行的 padding 和下边框
        main.innerHTML = `<div class="pane">
            <div class="pane-head">
                <h2 class="pane-title">${esc(t.title)}<span class="stat-row is-inline">${statHtml()}</span></h2>
                <div class="pane-tools">
                    <input class="search" id="q-search" placeholder="搜问题内容 / 记录人…" value="${esc(state.query)}">
                    <button class="btn" data-act="export-csv" title="把现在看到的这些问题导成 CSV">⤓ 导出 CSV</button>
                    <!-- 「全部单位」时没有单个单位可改，就不显示这个按钮 -->
                    ${u ? '<button class="btn" data-act="edit-unit"'
                        + ' title="改这个单位的名称 / 计划检查月份 / 审核员">✎ 编辑单位</button>' : ''}
                    <button class="btn primary" data-act="new-issue">＋ 记录问题</button>
                </div>
            </div>
            <div class="issue-list">${listHtml()}</div>
        </div>`;
    }

    /**
     * 只换「统计行 + 问题列表」，标题和搜索框不动。
     * 搜索时每敲一个字都走这里 —— 整块重建会把输入焦点弄丢。
     */
    function renderIssuesList() {
        const pane = document.querySelector('#main .pane');
        if (!pane) return;
        const stat = pane.querySelector('.stat-row');
        const box = pane.querySelector('.issue-list');
        if (stat) stat.innerHTML = statHtml();
        if (box) box.innerHTML = listHtml();
    }

    /* ============================== 选中哪个单位 ============================== */

    function setUnit(id) {
        state.unit = id || '__all';
        state.query = '';
        if (W.render) W.render();
    }

    /* ============================== 记录 / 编辑问题 ============================== */

    function openIssueEditor(id) {
        const it = id ? (state.data.issues || []).find((x) => x.id === id) : null;
        const units = sortUnits(state.data.units || []);
        if (!units.length) {
            toast('先加一个受检单位 —— 问题要挂在单位下面');
            return;
        }

        const auditors = state.data.auditors || [];
        // 新问题时：默认落在左边当前选中的那个单位上
        const defUnit = it ? it.unit : (state.unit !== '__all' ? state.unit : units[0].id);
        const defLevel = it ? it.level : (CFG.LEVELS[0] || '一般');
        const defSource = it ? it.source : (CFG.SOURCES[0] || '其他');
        const defBy = it ? it.by : '';

        const unitOpts = units.map((u) => `<option value="${esc(u.id)}"${defUnit === u.id ? ' selected' : ''}>${esc(u.name)}</option>`).join('');
        const lvOpts = (CFG.LEVELS || []).map((n) => `<option value="${esc(n)}"${defLevel === n ? ' selected' : ''}>${esc(n)}</option>`).join('');
        const srcOpts = (CFG.SOURCES || []).map((n) => `<option value="${esc(n)}"${defSource === n ? ' selected' : ''}>${esc(n)}</option>`).join('');
        const byOpts = ['<option value="">（不填）</option>']
            .concat(auditors.map((a) => `<option value="${esc(a.name)}"${defBy === a.name ? ' selected' : ''}>${esc(a.name)}</option>`))
            .join('');

        const buttons = [];
        if (it) buttons.push({ text: '删除这条', cls: 'danger', onClick: () => deleteIssue(it.id) });
        buttons.push({ spacer: true });
        buttons.push({ text: '取消', cls: 'ghost', onClick: closeModal });
        buttons.push({ text: '保存', cls: 'primary', onClick: () => saveIssueForm(it) });

        openModal({
            title: it ? '编辑问题' : '记录一个问题',
            size: 'xl',       // 填的框，比默认那个大（CSS 的 .modal-card.is-xl）
            buttons: buttons,
            body: `
                <div class="field-row">
                    <label class="field"><span class="field-label">受检单位</span>
                        <select id="q-unit">${unitOpts}</select></label>
                    <label class="field"><span class="field-label">发现日期</span>
                        <input type="date" id="q-date" value="${esc(it ? it.date : TODAY)}"></label>
                </div>
                <div class="field-row">
                    <label class="field"><span class="field-label">问题级别</span>
                        <select id="q-level">${lvOpts}</select></label>
                    <label class="field"><span class="field-label">来源</span>
                        <select id="q-source">${srcOpts}</select></label>
                    <label class="field"><span class="field-label">记录人</span>
                        <select id="q-by">${byOpts}</select></label>
                </div>
                <label class="field"><span class="field-label">问题描述（一句话说清是什么问题）</span>
                    <textarea id="q-text" placeholder="例如：排班出现连续夜航后紧接早班">${esc(it ? it.text : '')}</textarea></label>
                <label class="field"><span class="field-label">详细说明（可空：取证情况、依据、当时的场景…）</span>
                    <textarea id="q-detail" class="tall">${esc(it ? it.detail : '')}</textarea></label>
                <div class="field">
                    <span class="field-label">取证附件（可空：现场照片、截图、文件…）</span>
                    <div class="file-list" id="q-file-list"></div>
                    <div class="drop-zone" id="q-drop-zone">
                        把文件拖到这里，或者
                        <button type="button" class="btn ghost" id="q-pick">选择文件</button>
                        <input type="file" id="q-file-input" multiple hidden>
                    </div>
                </div>
                <label class="field"><span class="field-label">审核情况说明（可空：审核完之后再回来填，平时先空着）</span>
                    <textarea id="q-conclusion" class="tall"
                        placeholder="例如：已现场核对 11 月班表，属实；已要求运控部于 12 月 15 日前调整排班规则…">${esc(it ? it.conclusion : '')}</textarea></label>
                <label class="check">
                    <input type="checkbox" id="q-done"${it && it.status === 'done' ? ' checked' : ''}>
                    已完成（去检查时已经用上这条了）
                </label>`
        });

        // 新问题时把光标放在「问题描述」上，省一次点击
        if (!it) setTimeout(() => { const t = $('q-text'); if (t) t.focus(); }, 60);

        /*
         * 附件不走「问题对象」，先在本地攒一个数组，点保存时才挂到问题上。
         * 为什么：新建问题时还没有问题对象（点了取消就不该留下半条空问题），
         * 但上传本身是立刻发生的（PUT 到 OSS），所以只能先攒着。
         * 提前上传、最后挂上去，这样保存前就能看到传了哪些、也能删掉传错的。
         */
        bindIssueFiles(it);
    }

    /**
     * 记录问题弹层里附件区的「当前附件数组」。
     * 弹层里的保存按钮是**先建好、后点击**的，闭包拿不到局部变量，
     * 所以把当前这一份挂在这里，保存时读它。
     */
    let editorFiles = null;

    /**
     * 记录问题弹层里的附件区（细节都在 check-core.js 的 bindFileBox 里）。
     * 附件**先攒着、保存时才挂上去** —— 新建问题时还没有问题对象，
     * 不这么做就得先存一条空问题。保存按钮是先建好、后点击的，
     * 闭包拿不到局部变量，所以把当前那一份存进 editorFiles，保存时读它。
     */
    function bindIssueFiles(it) {
        const box = W.bindFileBox({
            list: 'q-file-list',
            zone: 'q-drop-zone',
            input: 'q-file-input',
            pick: 'q-pick',
            files: (it && it.files) || []
        });
        editorFiles = box.get();
    }

    /* ============================== 看一条问题（只读） ============================== */

    /**
     * 「看」一条问题：**只读的内容框**，在里面改不了任何东西。
     *
     * 为什么要有它（2026-09-21 用户要求）：
     *   · 点一下卡片只是想**看看内容和附件**，直接弹编辑框太容易误改；
     *   · 附件要能点开（下载原文件）、图片要能预览。
     * 想改仍然走卡片上的 ✎（或者这里右下角那个「✎ 编辑这条」）。
     */
    function openIssueView(id) {
        const it = (state.data.issues || []).find((x) => x.id === id);
        if (!it) return;

        const u = unitOf(it.unit) || {};
        const files = it.files || [];
        const done = it.status === 'done';
        const pics = files.filter((f) => isImageUrl(f.url));

        openModal({
            title: '问题详情',
            size: 'xl',       // 和「编辑问题」一样大（2026-09-21 用户要求）
            buttons: [
                { text: '关闭', cls: 'ghost', onClick: closeModal },
                // 直接换内容就行，**不要先 closeModal() 再开**：
                // closeModal 是延时 170ms 才真正藏起来的，连着调会把新弹层一起藏掉（会闪退）
                { text: '✎ 编辑这条', cls: 'primary', onClick: () => openIssueEditor(id) }
            ],
            body: `
                <div class="view-head">
                    <span class="view-date">${esc(it.date)}</span>
                    <span class="chip ${levelClass(it.level)}">${esc(it.level)}</span>
                    <span class="chip plain">${esc(it.source)}</span>
                    <span class="view-unit">${esc(u.name || it.unit)}</span>
                    ${it.by ? `<span class="chip who" style="${esc(auditorStyle(it.by))}">${esc(it.by)}</span>` : ''}
                    <span class="chip ${done ? 'done' : 'plain'}">${done ? '已完成' : '待审核'}</span>
                </div>
                <p class="view-text">${esc(it.text)}</p>
                ${it.detail ? `<p class="view-detail">${esc(it.detail)}</p>` : ''}
                ${it.conclusion ? `
                <div class="view-note">
                    <span class="field-label">审核情况说明</span>
                    <p class="view-note-body">${esc(it.conclusion)}</p>
                </div>` : ''}
                ${files.length ? `
                <div class="view-files">
                    <span class="field-label">取证附件（共 ${files.length} 个${pics.length ? '，图片停一下就能预览' : ''}）</span>
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

    function saveIssueForm(it) {
        const unit = $('q-unit').value;
        const date = ($('q-date').value || '').slice(0, 10) || TODAY;
        const level = $('q-level').value;
        const source = $('q-source').value;
        const by = $('q-by').value;
        const text = ($('q-text').value || '').trim();
        const detail = ($('q-detail').value || '').trim();
        const conclusion = ($('q-conclusion').value || '').trim();
        const status = $('q-done').checked ? 'done' : 'open';
        // 附件：本次弹层里攒下来的那些（上传早就完成了，这里只是把记录挂上去）
        const files = (editorFiles || []).slice();

        if (!text) {
            toast('问题描述不能为空');
            $('q-text').focus();
            return;
        }

        if (it) {
            it.unit = unit;
            it.date = date;
            it.level = level;
            it.source = source;
            it.by = by;
            it.text = text;
            it.detail = detail;
            it.conclusion = conclusion;
            it.files = files;
            it.status = status;
            toast('已保存这条问题');
        } else {
            state.data.issues.push({
                id: uid('q'), unit, date, level, source, by, text, detail, conclusion, files, status
            });
            toast(`已记到「${nameOfUnit(unit)}」的问题库`);
        }

        closeModal();
        markChanged();
    }

    /** 待审核 ⇄ 已完成 */
    function toggleIssue(id) {
        const it = (state.data.issues || []).find((x) => x.id === id);
        if (!it) return;
        it.status = it.status === 'done' ? 'open' : 'done';
        toast(it.status === 'done' ? '已标记为「已完成」' : '已改回「待审核」');
        markChanged();
    }

    function deleteIssue(id) {
        const it = (state.data.issues || []).find((x) => x.id === id);
        if (!it) return;
        if (!window.confirm(`确定删除这条问题？\n\n${it.text.slice(0, 60)}${it.text.length > 60 ? '…' : ''}`)) return;

        state.data.issues = state.data.issues.filter((x) => x.id !== id);
        closeModal();
        toast('已删除');
        markChanged();
    }

    /* ============================== 导出问题库 CSV ============================== */

    /**
     * 把**现在屏幕上看到的**这些问题导成 CSV（跟着左边的单位 + 搜索词走），
     * 拿去 Excel 里排序、打印都行。
     */
    function exportIssuesCsv() {
        const list = visibleIssues();
        if (!list.length) { toast('现在没有可导出的问题'); return; }

        const u = currentUnit();
        const rows = [['受检单位', '发现日期', '问题级别', '来源', '记录人',
            '问题描述', '详细说明', '审核情况说明', '状态', '计划检查', '附件']];

        list.forEach((it) => {
            const unit = unitOf(it.unit) || {};
            rows.push([
                nameOfUnit(it.unit),
                it.date,
                it.level,
                it.source,
                it.by,
                it.text,
                it.detail,
                it.conclusion,
                it.status === 'done' ? '已完成' : '待审核',
                unit.plan ? monthLabel(unit.plan) : '',
                (it.files || []).length ? (it.files || []).map((f) => f.name).join('、') : ''
            ]);
        });

        W.downloadCsv(`问题库_${u ? u.name : '全部单位'}_${TODAY}.csv`, rows);
        toast(`已导出 ${list.length} 条问题`);
    }

    /* ============================== 挂到命名空间 ============================== */

    Object.assign(W, {
        currentUnit, visibleIssues, nameOfUnit,
        renderIssuesView, renderIssuesList, setUnit,
        openIssueEditor, openIssueView, saveIssueForm, toggleIssue, deleteIssue,
        exportIssuesCsv
    });
})(window.Check);
