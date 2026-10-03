/**
 * 工作系统（2/5）表格渲染层
 * ==================================================================
 * 只负责「把 state 里的数据画成表格」：日期表头、工作项目列、单元格、底部统计、定位到今天。
 * 依赖 work-core.js（先加载）。
 */

(function (W) {
    'use strict';

    // 从命名空间取用基础层的东西（保持函数体里的写法不变）
    const {
        $, esc, pad, isWeekend, parseDate, fmtDate,
        state, CFG, TODAY, WEEK_LABEL, WEEK_FULL, board, boardWrap,
        assigneeColor, assigneeStyle, BLANK_ID
    } = W;

    /* ============================== 渲染 ============================== */

    /** 两个日期差几天（正数 = a 在 b 之后） */
    const dayDiff = (a, b) => Math.round((parseDate(a) - parseDate(b)) / 86400000);

    /**
     * 「今天 ↔ 工作日」的那条细线。
     * · 已完成的不画线；一格一人一条，线用这个人的颜色，主责任人在最下面；
     * · 今天以后的：从「今天」那一格的右边界拉到本格的左边界；
     *   今天以前（超期未完成）：从本格右边界拉到「今天」那一格的左边界；
     * · 两头都只碰格子边界、不进格子里面，所以长度是 (相隔天数 - 1) 个列宽，
     *   紧挨着的一天没有空隙可画；
     * · group.due 跟本格日子不一样时，说明这条安排的日子在时间轴外面（表格里没那一格），
     *   线就画到最边上一格的边界上；
     * · group.top 是这条线在行内的高度位置（同一行可能有好几条，由 buildRowLinks 排好）；
     * · 相隔 ≥ 3 天的（前后都算），在整条线正中间标上应该完成的日期（月/日）。
     */
    function linkHtml(itemId, cellDate, owners, group) {
        if (!owners.length) return '';

        const due = (group && group.due) || cellDate;   // 应该完成的那天（可能不在时间轴里）
        const kDue = dayDiff(due, TODAY);
        const k = dayDiff(cellDate, TODAY);             // 线画在哪一格，就按那一格量长度
        if (Math.abs(kDue) < 2 || Math.abs(k) < 2) return '';

        const colW = CFG.COL_WIDTH;
        const fromEdge = due !== cellDate;              // 日子在时间轴外面，要拉到格子边界
        const width = (Math.abs(k) - 1 + (fromEdge ? 1 : 0)) * colW;
        const left = k > 0 ? -(Math.abs(k) - 1) * colW : (fromEdge ? 0 : colW);

        const lines = owners.map((n) => (
            `<i class="cell-link-line" style="background:${esc(assigneeColor(n))}"></i>`
        )).join('');
        // 日期牌：点它可以编辑那条安排（日子在时间轴外面的也能从这里改回来）
        const label = Math.abs(kDue) >= 3
            ? `<span class="cell-link-date" data-item="${esc(itemId)}" data-date="${due}"`
                + ` title="预计完成 ${due}（点一下编辑）">`
                + `${due.slice(5).replace('-', '/')}</span>`
            : '';

        return `<span class="cell-link" style="top:${group ? group.top : 0}px;`
            + `left:${left}px;width:${width}px">${label}${lines}</span>`;
    }

    const LINK_H = 2;      // 线高（跟 CSS 里的 height 一致）
    const LINK_GAP = 13;   // 线间距（跟 CSS 里的 gap 一致）

    /**
     * 给每一行的所有连线排座位。
     * 同一行可能同时有好几条线（不同日期的两项工作、借最边上一格画的、一格多人的），
     * 如果都居中就叠在一起看不清了 —— 所以按「2px 线 + 13px 间距」一路往下排，
     * 整叠在行高里垂直居中，然后每个格子自己那几条线各拿一个 top。
     * 返回：`${item}|${date}` → [{ top, owners, due }]
     */
    function buildRowLinks(items, dates) {
        const first = dates[0];
        const last = dates[dates.length - 1];
        const taskMap = indexTasks(state.data.tasks);
        const out = new Map();

        items.forEach((item) => {
            const groups = [];   // { date（画在哪一格）, owners, due（真正该完成的日子） }

            // 日子比第一天还早的排最前，比最后一天还晚的排最后（按时间先后自然排序）
            const head = [];
            const tail = [];
            (state.data.tasks || []).forEach((t) => {
                if (t.item !== item.id || t.done || !t.date) return;
                if (dates.indexOf(t.date) >= 0) return;
                const owners = t.assignees || [];
                if (t.date < first) head.push({ date: first, owners, due: t.date });
                else if (t.date > last) tail.push({ date: last, owners, due: t.date });
            });

            groups.push(...head);
            dates.forEach((date) => {
                const t = taskMap.get(`${item.id}|${date}`);
                if (t && !t.done && (t.assignees || []).length) {
                    groups.push({ date, owners: t.assignees, due: date });
                }
            });
            groups.push(...tail);

            const total = groups.reduce((n, g) => n + g.owners.length, 0);
            if (!total) return;

            // 这一行总共几条线，整叠垂直居中
            const stackH = total * LINK_H + (total - 1) * LINK_GAP;
            let y = (CFG.ROW_HEIGHT - stackH) / 2;

            groups.forEach((g) => {
                const key = `${item.id}|${g.date}`;
                if (!out.has(key)) out.set(key, []);
                out.get(key).push({ top: y, owners: g.owners, due: g.due });
                y += g.owners.length * (LINK_H + LINK_GAP);
            });
        });

        return out;
    }

    function indexTasks(tasks) {
        const map = new Map();
        (tasks || []).forEach((t) => map.set(`${t.item}|${t.date}`, t));
        return map;
    }

    /**
     * 工作项目的行头。
     * @param {Object} item
     * @param {boolean} [finished] 这个项目名下安排是否全部做完了（整体沉底 + 底色标记）
     * @param {boolean} [empty]    这个项目还一条安排都没排（提到上端 + 底色标记）
     */
    function rowHeadHtml(item, finished, empty) {
        /*
         * 空白行（首行那条新工作占位）：不能拖、也没有 ✎/✕。
         * 点行头 = 填名字（走 openItemEditor，它把这种 id 当成「新增」）；
         * 点右边的格子 = 直接填内容，那一刻才做实成真项目。
         */
        if (item.blank) {
            return `
            <div class="row-head is-blank" data-item="${esc(item.id)}"
                 title="点这里填新工作的名字，或者直接点右边的格子填内容">
                <span class="rh-grip is-off">⠿</span>
                <div class="rh-main">
                    <span class="rh-name">＋ 新工作…</span>
                    <span class="rh-sub">点这里填名字，或直接点右边的格子</span>
                </div>
                <div class="rh-actions"><span class="rh-flag">待填写</span></div>
            </div>`;
        }

        // 开了「只看」时只剩他们的行、顺序也没意义，干脆不让拖（拖了顺序会对不上）
        const fltOn = W.filterOn();
        const draggable = fltOn ? '' : ' draggable="true"';
        const gripTip = fltOn ? '只看模式下不能调整顺序' : '按住这里上下拖，可以调整这一行的位置';

        return `
        <div class="row-head${finished ? ' is-finished' : ''}${empty ? ' is-empty' : ''}"${draggable} data-item="${esc(item.id)}"
             title="${finished ? '这个项目名下的安排都做完了 · ' : ''}${empty
                ? '这个项目还没排过活 · ' : ''}点击编辑这个工作项目">
            <span class="rh-grip" title="${gripTip}">⠿</span>
            <div class="rh-main">
                <span class="rh-name">${item.pinned
                    ? '<span class="rh-pin" title="已置顶">▲</span>' : ''}${esc(item.name)}${finished
                    ? '<span class="rh-done">（已完成）</span>' : ''}</span>
                ${item.subtitle ? `<span class="rh-sub">${esc(item.subtitle)}</span>` : ''}
            </div>
            <div class="rh-actions">
                <button class="ico${item.pinned ? ' is-on' : ''}" data-act="pin-item"
                        data-item="${esc(item.id)}"
                        title="${item.pinned ? '取消置顶' : '置顶（放到最上面，空白行下面）'}">▲</button>
                <button class="ico" data-act="edit-item" data-item="${esc(item.id)}" title="编辑项目">✎</button>
                <button class="ico del" data-act="del-item" data-item="${esc(item.id)}" title="删除项目">✕</button>
                ${empty ? '<span class="rh-flag" title="这个项目还一条安排都没排，先排上活就会排到它该在的位置">待安排</span>' : ''}
            </div>
        </div>`;
    }

    /**
     * 一个单元格。
     * @param {Object} task
     * @param {Object[]} links
     * @param {boolean} [finished] 整个工作项目都做完了 → 这一格也跟着压暗
     * @param {boolean} [empty]    整个工作项目还没有安排 → 这一格也跟着标记
     */
    function cellHtml(item, date, task, links, finished, empty) {
        const d = parseDate(date);
        // 责任人可以是好几个：数组里的第一个是主责任人
        const owners = (task && Array.isArray(task.assignees)) ? task.assignees : [];

        // 状态统一放在一个 data-state 里（空格分隔），不再往 div 上挂一串 class
        const st = [];
        // 空白行的格子：带上 blank，CSS 里把它画成「还没实体」的样子
        if (item.blank) st.push('blank');
        // 双休日 / 法定放假 / 调休上班：和日历模式同一套标记
        // （补班那天按工作日算，不算周末，所以底色跟平时一样）
        const hol = W.holidayOf(date);
        const makeup = !!(hol && !hol.off);
        if (isWeekend(d) && !makeup) st.push('weekend');
        if (hol && hol.off) st.push('off');
        if (makeup) st.push('makeup');
        if (date === TODAY) st.push('today');
        else if (date < TODAY) st.push('past');
        // 整个项目都做完了：整格压暗（底色 + 内容透明度在 CSS 里）
        if (finished) st.push('finished');
        // 整个项目还一条安排都没有：整行也给个底色标记
        if (empty) st.push('empty');

        // 正在「只看这几个人」：这一格是别人的活 → 内容整个不画，只留一个点不动的空格
        // （格子必须留在网格里，少画一格整张表就错位了）
        if (W.filterOn() && task && !W.filterHit(owners)) {
            st.push('hidden');
            return `<div class="cell" data-item="${esc(item.id)}" data-date="${date}"
                data-state="${st.join(' ')}"></div>`;
        }

        // 有他们中某个人的活：这一格亮起来。
        // 必须判 task —— 上面已经把所有「别人的活」提前 return 掉了，
        // 走到这里还带着 task 就说明是要看的；空格子不能亮，否则整行都变蓝
        if (W.filterOn() && task) st.push('hit');

        if (task) {
            st.push('task');
            if (owners.length) st.push('owner');
            if (task.done) st.push('done');
            else if (date < TODAY) st.push('overdue');
        }

        let inner = '<span class="cell-add">＋</span>';
        if (task) {
            // 完成的安排：内容上面那一行、小圆点**旁边**跟一个「（已完成）」绿色标记，
            // 内容本身**不用删除线**（2026-09-21 用户要求：「表格模式的已完成的具体工作，
            // 也不要使用删除线，同样添加（已完成）标记」→「加在上面，小绿点旁边」）
            const doneMark = task.done ? '<span class="cell-done">（已完成）</span>' : '';
            const text = task.text ? `<span class="cell-text">${esc(task.text)}</span>` : '';
            const owner = owners.length
                ? '<span class="cell-owners">' + owners.map((n) => (
                    `<span class="cell-owner" data-name="${esc(n)}"`
                    + ` style="${esc(assigneeStyle(n))}"`
                    + ` title="点一下把「${esc(n)}」从这天移除">${esc(n)}</span>`
                )).join('') + '</span>'
                : '';
            inner = `<span class="cell-top"><span class="cell-dot"></span>${doneMark}</span>`
                + `${text}${owner}`;
        }

        // 里面有详细内容 / 附件：右上角分别标一下（两个都有就两个都标）
        const flags = [];
        if (task && task.detail) {
            flags.push('<span class="cell-more" title="有详细内容（鼠标停一下看预览）">📄</span>');
        }
        const fileCount = task ? (task.files || []).length : 0;
        if (fileCount) {
            flags.push(`<span class="cell-more" title="有 ${fileCount} 个附件">📎${fileCount}</span>`);
        }
        const more = flags.length ? `<span class="cell-mores">${flags.join('')}</span>` : '';

        // 有详细内容的格子改用自绘的浮动窗，原生 title 会和它打架，所以这里留空
        const tip = (task && task.detail)
            ? ''
            : (task
                ? ([task.text, owners.join('、')].filter(Boolean).join(' · ') || '点击填写这天的安排')
                : '点击填写这天的安排');

        // 连线：这一格排到的所有线（本格的 + 借格的；没做完才有，位置由 buildRowLinks 排好）
        const link = (links || []).map((g) => linkHtml(item.id, date, g.owners, g)).join('');

        return `<div class="cell" data-item="${esc(item.id)}" data-date="${date}"
            data-state="${st.join(' ')}" title="${esc(tip)}">`
            + link + more
            + `<div class="cell-inner">${inner}</div></div>`;
    }

    function render() {
        const data = state.data;
        const items = data.items || [];
        const dates = state.dates;
        const taskMap = indexTasks(data.tasks);
        const cols = Math.max(1, dates.length);

        // 工具栏那个按钮的文案跟着当前视图走（日历模式下显示「▦ 表格模式」）
        W.paintCalendarBtn();
        // 「空白行」那个开关的文案（函数在 work-edit.js，加载得晚一点，所以判一下）
        if (W.paintBlankRowBtn) W.paintBlankRowBtn();
        // 「✓ 已完成项」那个开关的文案（同上）
        if (W.paintHideDoneBtn) W.paintHideDoneBtn();

        // 顶部那一排（标题 / 主题 / 今天与时间轴范围）**跟视图无关**，
        // 所以必须放在下面那些 return 之前统一刷新。
        // （2026-09-21 之前这几句写在表格分支里，结果日历模式当上默认视图后，
        //   一进来就在日历分支 return 了，左上角永远是「加载中…」—— 数据其实早读到了）
        document.title = `${data.title || '工作计划'} · 工作系统`;
        $('brand-title').textContent = data.title || '工作计划';
        $('brand-genre').textContent = String(data.theme || W.themeParam() || W.slug);
        $('brand-meta').textContent = dates.length
            ? `今天 ${TODAY} ${WEEK_LABEL[new Date().getDay()]} · 时间轴 ${dates[0]} ~ ${dates[dates.length - 1]}`
                + (data.updated ? ` · 数据更新于 ${data.updated}` : '')
            : '加载中…';

        // 「工作查询」：把表格换成这个人的工作清单
        if (state.query) {
            board.classList.remove('is-filtered', 'is-calendar');
            board.classList.add('is-query');
            board.innerHTML = queryHtml(state.query);
            updateStat();
            return;
        }
        board.classList.remove('is-query');

        // 「日历模式」：把表格换成月历（画法在 work-calendar.js，含法定节假日标记）
        if (state.calendar) {
            board.classList.remove('is-filtered');
            board.classList.add('is-calendar');
            // 重建前先把横向滚动位置记下来（和表格那边同理）——
            // 不然改一条安排后重画，日历会跳回最左边（上个月那儿）
            const keepCalLeft = boardWrap.scrollLeft;
            board.innerHTML = W.calendarHtml();
            boardWrap.scrollLeft = keepCalLeft;
            updateStat();
            return;
        }
        board.classList.remove('is-calendar');

        // 「只看这几个人」（可多选）：先找出哪些工作项目里有他们中任意一人的活
        const fltOn = W.filterOn();
        const hitItems = new Set();
        if (fltOn) {
            (data.tasks || []).forEach((t) => {
                if (W.filterHit(t.assignees)) hitItems.add(t.item);
            });
        }
        // 只画他们名下有活的工作项目，其它项目**整行不画**（是隐藏，不是压暗）
        const rows = fltOn ? items.filter((i) => hitItems.has(i.id)) : items;

        /*
         * 两种「整行状态」，一个项目只可能占其中一种，先一次性算成集合
         * （行 × 列很容易上千格，每格都去 filter 一遍 tasks 太亏）：
         *   · finished —— 名下有安排、而且全部勾了完成（自动沉到表格最下面）
         *   · empty    —— 一条安排都还没排（自动提到上端，紧跟在置顶区后面）
         * 判定和 work-edit.js 的 itemFinished / taskCountOf 是同一套。
         */
        const taskTotal = new Map();
        const taskDone = new Map();
        (data.tasks || []).forEach((t) => {
            taskTotal.set(t.item, (taskTotal.get(t.item) || 0) + 1);
            if (t.done) taskDone.set(t.item, (taskDone.get(t.item) || 0) + 1);
        });
        const finishedIds = new Set();
        const emptyIds = new Set();
        rows.forEach((i) => {
            const n = taskTotal.get(i.id) || 0;
            if (!n) emptyIds.add(i.id);
            else if (n === (taskDone.get(i.id) || 0)) finishedIds.add(i.id);
        });

        // 「✓ 已完成项」打开时（工具栏那个按钮，在 work-edit.js）：
        // 已完成的那些项目**整行不画**，只看还没干完的。
        // ⚠ 只管表格视图 —— 日历模式在上面就 return 了，那边照旧全画
        //   （日历里「完成」是靠绿色虚框 + 压淡表达的）
        const shown = state.hideDone ? rows.filter((i) => !finishedIds.has(i.id)) : rows;

        // 首行那条「空白行」要不要画：开关开着、而且没在「只看」（它的 id 不在 items 里，
        // 混进「只看」的结果里会把那套语义弄乱）
        const showBlank = !!state.blankRow && !fltOn;

        board.classList.toggle('is-filtered', fltOn);
        board.dataset.filter = W.filterText();

        // 把配置里的尺寸写进 CSS 变量，表格布局跟着变
        board.style.setProperty('--col-w', CFG.COL_WIDTH + 'px');
        board.style.setProperty('--head-w', CFG.ROW_HEAD_WIDTH + 'px');
        board.style.setProperty('--row-h', CFG.ROW_HEIGHT + 'px');
        board.style.setProperty('--cols', cols);

        let html = `
        <div class="corner">
            <span class="corner-title">工作项目 \\ 日期</span>
            <span class="corner-sub">${shown.length} 个项目 · ${dates.length} 天${fltOn ? ` · 只看 ${esc(W.filterText())}` : ''}${state.hideDone ? ' · 已隐藏已完成' : ''}</span>
            <button class="corner-add" data-act="add-item" title="添加工作项目">＋</button>
        </div>`;

        // 日期表头：双休日 / 法定放假用底色标出来，放假写节日名、补班写「XX调班」
        // （和日历模式同一套规则；补班那天按工作日算，不标绿）
        dates.forEach((date) => {
            const d = parseDate(date);
            const hol = W.holidayOf(date);
            const off = !!(hol && hol.off);
            const makeup = !!(hol && !hol.off);

            const st = [];
            if (isWeekend(d) && !makeup) st.push('weekend');
            if (off) st.push('off');
            if (makeup) st.push('makeup');
            if (date === TODAY) st.push('today');
            else if (date < TODAY) st.push('past');

            const holNote = !hol ? '' : (off ? hol.name : `${hol.name}调班`);
            html += `
            <div class="col-head" data-date="${date}" data-state="${st.join(' ')}">
                <span class="ch-week">${WEEK_FULL[d.getDay()]}</span>
                <span class="ch-day">${pad(d.getMonth() + 1)}/${pad(d.getDate())}</span>
                ${holNote ? `<span class="ch-hol">${esc(holNote)}</span>` : ''}
                ${date === TODAY ? '<span class="ch-flag">今天</span>' : ''}
            </div>`;
        });

        if (!shown.length && !showBlank) {
            html += `<div class="empty">${fltOn
                ? `${esc(W.filterText())} 名下还没有安排。点工具栏的「👤 只看 …」，再点一下名字就看回全部。`
                : (state.hideDone
                    ? '没有未完成的工作项目（已完成的都藏起来了）—— 点工具栏的「✓ 已完成项」看回全部。'
                    : '还没有工作项目：点右上角「⋯」→「＋ 工作项目」添加一个。')}</div>`;
        }

        // 每一行：行头 + 各日期单元格
        // （只看某个人时只剩他名下的项目；「置顶」是在点名字那一刻直接把 items 顺序改掉的，这里不再重排）
        const rowLinks = buildRowLinks(shown, dates);

        /*
         * 首行那条「空白行」：先画它，再画真项目。
         * 它**不在 state.data.items 里**（见 work-edit.js 的注释），
         * 所以点格子里的空、拖个人上来、点行头填名字，都要先做实成真项目。
         */
        if (showBlank) {
            const blank = { id: BLANK_ID, name: '', subtitle: '', blank: true };
            html += rowHeadHtml(blank);
            dates.forEach((date) => {
                html += cellHtml(blank, date, null, null);
            });
        }

        shown.forEach((item) => {
            const finished = finishedIds.has(item.id);
            const empty = emptyIds.has(item.id);
            html += rowHeadHtml(item, finished, empty);
            dates.forEach((date) => {
                html += cellHtml(item, date, taskMap.get(`${item.id}|${date}`),
                    rowLinks.get(`${item.id}|${date}`), finished, empty);
            });
        });

        // 重渲染会重建整个网格，先把横向滚动位置记下来，渲染完再恢复
        // （否则 innerHTML 被换掉的瞬间 scrollLeft 会被浏览器夹回 0，一改格子就跑到最左边）
        const keepLeft = boardWrap.scrollLeft;

        board.innerHTML = html;
        boardWrap.scrollLeft = keepLeft;

        updateStat();
    }

    /**
     * 「工作查询」视图：把某个责任人的全部工作列成一段文字 + 一张表。
     * 排序分四层：逾期未完成 → 待办 → 今天以后完成的 → 今天之前完成的（沉到最下面）。
     */
    function queryHtml(name) {
        const items = state.data.items || [];
        const nameOf = (id) => {
            const it = items.find((i) => i.id === id);
            return it ? it.name : id;
        };
        const subOf = (id) => {
            const it = items.find((i) => i.id === id);
            return (it && it.subtitle) || '';
        };

        const from = state.queryFrom || '';
        const to = state.queryTo || '';

        const mineAll = (state.data.tasks || []).filter((t) => (t.assignees || []).indexOf(name) >= 0);
        const list = mineAll
            .filter((t) => (!from || t.date >= from) && (!to || t.date <= to))
            .sort((a, b) => {
                const ta = queryTier(a);
                const tb = queryTier(b);
                if (ta !== tb) return ta - tb;
                if (a.date !== b.date) return a.date < b.date ? -1 : 1;
                return nameOf(a.item).localeCompare(nameOf(b.item));
            });

        const done = list.filter((t) => t.done).length;
        const today = list.filter((t) => t.date === TODAY).length;
        const overdue = list.filter((t) => !t.done && t.date < TODAY).length;
        const future = list.filter((t) => !t.done && t.date > TODAY).length;
        const files = list.reduce((n, t) => n + (t.files || []).length, 0);
        const filtered = list.length !== mineAll.length;

        const rows = list.map((t) => {
            const d = parseDate(t.date);
            const st = t.done ? 'done' : (t.date < TODAY ? 'overdue' : (t.date === TODAY ? 'today' : 'future'));
            const stateText = { done: '已完成', overdue: '逾期未完成', today: '今天', future: '待办' }[st];
            // 每个附件单独一行
            const fileLinks = (t.files || []).map((f) => (
                `<a class="query-file" href="${esc(f.url)}" target="_blank" rel="noopener"`
                + ` title="${esc(f.name)}">📎 ${esc(f.name)}</a>`
            )).join('');

            return `<tr data-state="${st}">
                <td class="q-date">${pad(d.getMonth() + 1)}/${pad(d.getDate())}<span class="q-week">${WEEK_LABEL[d.getDay()]}</span></td>
                <td class="q-state">${stateText}</td>
                <td class="q-item">${esc(nameOf(t.item))}${subOf(t.item) ? `<span class="q-sub">${esc(subOf(t.item))}</span>` : ''}</td>
                <td class="q-text">${esc(t.text || '')}</td>
                <td class="q-files">${fileLinks || '<span class="q-none">—</span>'}</td>
                <td class="q-detail">${t.detail ? esc(t.detail) : '<span class="q-none">—</span>'}</td>
            </tr>`;
        }).join('');

        return `
        <div class="query">
            <div class="query-head">
                <div>
                    <h2 class="query-title">${esc(name)} 的工作</h2>
                    <p class="query-sum">共 <b>${list.length}</b> 条安排${filtered ? `（他的全部安排是 ${mineAll.length} 条，下面只列日期范围内的）` : ''}：已完成 <b>${done}</b> 条、
                        今天 <b>${today}</b> 条、逾期未完成 <b>${overdue}</b> 条、待办 <b>${future}</b> 条
                        ${files ? `· 相关附件 <b>${files}</b> 个` : ''}。</p>
                </div>
                <div class="query-tools">
                    <label class="query-range">日期范围
                        <input type="date" id="q-from" value="${esc(from)}">
                        <span class="q-tilde">~</span>
                        <input type="date" id="q-to" value="${esc(to)}">
                    </label>
                    <button class="btn ghost" id="btn-query-all" title="日期范围清空 = 全部">全部</button>
                    <button class="btn" id="btn-query-back">← 返回表格</button>
                </div>
            </div>
            ${list.length ? `<table class="query-table">
                <colgroup>
                    <col class="c-date"><col class="c-state"><col class="c-item">
                    <col class="c-text"><col class="c-files"><col class="c-detail">
                </colgroup>
                <thead>
                    <tr>
                        <th>日期</th><th>状态</th><th>工作项目</th><th>内容</th><th>相关文件</th><th>详细内容</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>`
                : `<p class="query-empty">${mineAll.length
                    ? '这个日期范围里没有安排，把范围放宽试试，或者点「全部」。'
                    : '这个人名下还没有安排。把名字拖到表格的格子上就能给他排活。'}</p>`}
        </div>`;
    }

    /**
     * 查询视图里一条安排的层号（小的排前面）：
     * 0 逾期未完成 → 1 待办（今天及以后、没完成） → 2 今天以后完成的 → 3 今天之前完成的（沉最下）
     */
    function queryTier(t) {
        if (!t.done) return t.date < TODAY ? 0 : 1;
        return t.date < TODAY ? 3 : 2;
    }

    function updateStat() {
        // 底部那条统计 2026-09-21 已按用户要求去掉（和上面的信息重复）。
        // 这里保留函数是为了不动所有调用处：页面上没有 #stat 就直接跳过。
        // 想加回来：work.html 里贴回 <span class="stat" id="stat"> 即可。
        const el = $('stat');
        if (!el) return;

        const items = state.data.items || [];
        const tasks = state.data.tasks || [];

        // 「工作查询」时底部就写一句说明
        if (state.query) {
            el.innerHTML = `工作查询：<b>${esc(state.query)}</b> · `
                + '点右上角「← 返回表格」回到表格';
            return;
        }

        // 「日历模式」时底部换成这个月的统计（选了责任人也只算他的，跟格子里画的一致）
        if (state.calendar) {
            const { y, m } = state.calendar;
            const from = fmtDate(new Date(y, m, 1));
            const to = fmtDate(new Date(y, m + 1, 0));
            const mine = tasks.filter((t) => t.date >= from && t.date <= to
                && (!W.filterOn() || W.filterHit(t.assignees)));

            el.innerHTML =
                (W.filterOn() ? `只看 <b>${esc(W.filterText())}</b>（别人的安排已隐藏） · ` : '') +
                `<b>${y} 年 ${m + 1} 月</b>（日历模式） · 共 <b>${mine.length}</b> 条安排 · ` +
                `<b class="s-done">${mine.filter((t) => t.done).length}</b> 条已完成 · ` +
                `<b>${mine.filter((t) => t.date === TODAY).length}</b> 条在今天 · ` +
                `<b class="s-overdue">${mine.filter((t) => !t.done && t.date < TODAY).length}</b> 条逾期未完成`;
            return;
        }

        // 正在「只看这几个人」就只统计他们的活
        if (W.filterOn()) {
            const mine = tasks.filter((t) => W.filterHit(t.assignees));
            el.innerHTML =
                `只看 <b>${esc(W.filterText())}</b>（别人的安排已隐藏） · 共 <b>${mine.length}</b> 条安排 · ` +
                `<b class="s-done">${mine.filter((t) => t.done).length}</b> 条已完成 · ` +
                `<b>${mine.filter((t) => t.date === TODAY).length}</b> 条在今天 · ` +
                `<b class="s-overdue">${mine.filter((t) => !t.done && t.date < TODAY).length}</b> 条逾期未完成`;
            return;
        }

        const done = tasks.filter((t) => t.done).length;
        const overdue = tasks.filter((t) => !t.done && t.date < TODAY).length;
        const todayCount = tasks.filter((t) => t.date === TODAY).length;

        el.innerHTML =
            `共 <b>${items.length}</b> 个工作项目 · <b>${tasks.length}</b> 条安排 · ` +
            `<b class="s-done">${done}</b> 条已完成 · <b>${todayCount}</b> 条在今天 · ` +
            `<b class="s-overdue">${overdue}</b> 条逾期未完成`;
    }

    /** 自动（或手动）滚到今天那一列；日历模式下改成让「当前月」那一栏滚进视野 */
    function scrollToToday(behavior, attempt) {
        if (state.calendar && W.calFocusMonth) {
            W.calFocusMonth(behavior);
            return;
        }

        const head = board.querySelector('.col-head[data-state~="today"]');
        if (!head) return;

        // 首次渲染时网格列宽可能还没算完（此时 offsetLeft 为 0），等一帧重试，最多 5 次
        if (!head.offsetLeft && (attempt || 0) < 5) {
            requestAnimationFrame(() => scrollToToday(behavior, (attempt || 0) + 1));
            return;
        }

        // 左侧项目列是吸左的会遮住一块；今天不居中，而是让左边留出 TODAY_OFFSET_DAYS 天
        const headW = CFG.ROW_HEAD_WIDTH;
        const gapDays = (CFG.TODAY_OFFSET_DAYS != null) ? CFG.TODAY_OFFSET_DAYS : 1;
        const target = head.offsetLeft - headW - gapDays * CFG.COL_WIDTH;

        boardWrap.scrollTo({ left: Math.max(0, target), top: 0, behavior: behavior || 'smooth' });
    }

    /* ============================== 挂到命名空间 ============================== */

    /**
     * 当前视图会用到哪几年的节假日：「↻ 更新节假日」拉这几年的。
     * 日历模式是三栏跨的那几年（可能同时跨两个年份），表格模式是时间轴跨的那几年。
     */
    function holidayYears() {
        if (state.calendar) {
            return [state.calendar.y - 1, state.calendar.y, state.calendar.y + 1];
        }
        return Array.from(new Set(state.dates.map((d) => Number(d.slice(0, 4)))));
    }

    Object.assign(W, { render, updateStat, scrollToToday, holidayYears });
})(window.Work);
