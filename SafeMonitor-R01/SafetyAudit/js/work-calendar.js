/**
 * 工作系统 · 日历模式
 * ==================================================================
 * 把当前的安排用「月历」画出来：法定放假淡淡染红 + 节日名，
 * 调休上班（补班）按工作日配色、只多写一行「XX调班」。
 * 数据来源就是同一份 tasks（OSS 上的 plan.json），这里只换一种看法，不改数据。
 *
 * 依赖：
 *   · work-core.js   —— 状态、工具函数、弹层、轻提示
 *   · work-board.js  —— render()（表格层会按 state.calendar 走到这里）
 *   · work-edit.js   —— openTaskEditor()（点一条安排改它）
 *   · work-holidays.js —— 节假日数据 window.WORK_HOLIDAYS
 *
 * 三个视图的优先级（见 work-board.js 的 render）：
 *   工作查询（state.query） > 日历模式（state.calendar） > 日期 × 项目表格
 * ==================================================================
 */

(function (W) {
    'use strict';

    const {
        $, esc, pad, fmtDate, parseDate, addDays, isWeekend,
        state, TODAY, board, boardWrap, lsGet, lsSet,
        toast, openModal, closeModal, openTaskEditor, render,
        assigneeColor, assigneeShort, assigneeStyle, BLANK_ID,
        filterOn, filterHit, filterText
    } = W;

    const WEEK_SHORT = ['日', '一', '二', '三', '四', '五', '六'];

    /* ============================== 节假日 ============================== */

    /** 节假日表（work-holidays.js 里定义的；没加载到就当没有节假日，日历照常能用） */
    const holidays = () => window.WORK_HOLIDAYS || {};

    /** 这一天的法定节假日信息：{ off: true 放假 / false 调休上班, name }；不是节假日返回 null */
    function holidayOf(date) {
        return holidays()[date] || null;
    }

    /* ============================== 当前月份 ============================== */

    /** 日历正在看哪个月（第一次进来自动落到今天所在的月） */
    function month() {
        if (!state.calendar) {
            const t = parseDate(TODAY);
            state.calendar = { y: t.getFullYear(), m: t.getMonth() };
        }
        return state.calendar;
    }

    /** 一「天」占多宽（含格子之间的间隙）：拿当前月那一栏的前两格量 */
    function dayWidth() {
        const days = board.querySelectorAll('.cal-month[data-role="cur"] .cal-day');
        if (days.length >= 2) return days[1].offsetLeft - days[0].offsetLeft;
        const one = board.querySelector('.cal-day');
        return one ? one.offsetWidth + 3 : 100;
    }

    /** 上个月在左边露出几天（改这一个数就行）—— 默认留 1.5 天，视线一进来就落在当前月 */
    const KEEP_DAYS_BEFORE = 1.5;

    /**
     * 横向的默认位置：**上个月只在左边留 1.5 天左右**，紧接着就是当前月。
     *
     * 屏幕够宽、整三个月都放得下时，算出来是负数被 Math.max 夹成 0；
     * 宽到「当前月 + 下个月」都能完整显示时，浏览器自己会把 scrollLeft 限制在最大范围内，
     * 结果是上个月露得比 1.5 天多 —— 这正是想要的效果（能看清就不去遮它）。
     * 一栏比屏幕还宽（窄屏）时同样的夹取会把它贴到当前月的左边界。
     */
    function focusCurrentMonth(behavior) {
        const cur = board.querySelector('.cal-month[data-role="cur"]');
        if (!cur) return;
        const target = cur.offsetLeft - KEEP_DAYS_BEFORE * dayWidth();
        boardWrap.scrollTo({ left: Math.max(0, target), behavior: behavior || 'auto' });
    }

    /** 换月份：n 是 ±1 */
    function shift(n) {
        const cur = month();
        const d = new Date(cur.y, cur.m + n, 1);
        state.calendar = { y: d.getFullYear(), m: d.getMonth() };
        rememberView();
        render();
        focusCurrentMonth('auto');
    }

    /**
     * 跳回今天所在的月份
     */
    function toToday() {
        if (!state.calendar) return;
        const t = parseDate(TODAY);
        state.calendar = { y: t.getFullYear(), m: t.getMonth() };
        rememberView();
        render();
        focusCurrentMonth('auto');
    }

    /* ============================== 记住视图（刷新后不跳回表格） ============================== */

    const VIEW_KEY = 'safemonitor:work:view';         // 'calendar' | 'grid'
    const MONTH_KEY = 'safemonitor:work:calmonth';    // '2026-9'

    /** 把「现在是不是日历模式、看的是哪个月」记到浏览器里（切模式/翻月时调） */
    function rememberView() {
        if (!state.calendar) {
            lsSet(VIEW_KEY, 'grid');
            return;
        }
        lsSet(VIEW_KEY, 'calendar');
        lsSet(MONTH_KEY, `${state.calendar.y}-${state.calendar.m + 1}`);
    }

    /**
     * 启动时恢复上次的视图。
     * 由 work-core 的 loadAll() 在**第一次 render 之前**调用，
     * 所以按下 F5 刷新后直接就是上次那个视图（包括上次看的那个月），不会先闪一下表格。
     *
     * 浏览器里**一点记录都没有**（第一次打开、或者清了浏览器数据）→ 默认进日历模式；
     * 之后就按上次选的走：'calendar' 回日历、'grid' 回表格。
     * （滚动到当前月由 work-core 启动尾部的 scrollToToday 负责，两种模式都盖到了）
     */
    function restoreView() {
        const saved = lsGet(VIEW_KEY);

        if (!saved) {
            month();            // 落在今天所在那个月
            rememberView();     // 顺手记下来，让浏览器里的记录和当前状态一致
            return;
        }
        if (saved !== 'calendar') return;   // 'grid'：老老实实回表格

        const m = /^(\d{4})-(\d{1,2})$/.exec(lsGet(MONTH_KEY));
        if (m) state.calendar = { y: Number(m[1]), m: Number(m[2]) - 1 };
        else month();     // 没记过月份就落在今天所在那个月
    }

    /* ============================== 画日历 ============================== */

    /**
     * 一天里的一条安排。
     * 格子里只显示「责任人」：一个名字一个字（朱震宇 → 朱），底色还是那个人的牌子色。
     * 内容、项目名、附件这些**不写进 title**（浏览器自带的提示又慢又丑，
     * 会和下面那个悬浮小窗撞在一起），改成鼠标停上去就浮出小窗，见 bindCalendarTip。
     * 点它 = 打开编辑弹层。
     */
    function taskHtml(t) {
        const owners = t.assignees || [];

        const st = [];
        if (t.done) st.push('done');
        else if (t.date < TODAY) st.push('overdue');

        /*
         * 这条安排挂在哪个工作项目下：**置顶的项目**，它名下每一条都加紫色虚线框
         * （pinned 是项目级标记，见 work-edit.js 的置顶那段）。
         * 完成的加灰色虚线框（就是上面那个 done）—— 两个样式都在 css/work-calendar.css。
         * 这里直接问 work-edit 要 items（日历一天可能好几条，但 items 就几十个，
         * 比把 itemMap 一路从 calendarHtml 传进 dayHtml 省事得多）。
         */
        const item = W.findItem ? W.findItem(t.item) : null;
        if (item && item.pinned) st.push('pin');

        // 一个责任人一个牌子：只放**那一个字**（朱震宇 → 朱；
        // 想在「⋯ → 🎨 编辑责任人样式」里自己改，见 assigneeShort）
        const badges = owners.map((n) => (
            `<span class="cal-owner" style="${esc(assigneeStyle(n))}">${esc(assigneeShort(n))}</span>`
        )).join('');

        return `<button class="cal-task" data-item="${esc(t.item)}" data-date="${t.date}"
            data-state="${st.join(' ')}"
            >${badges || '<span class="cal-owner is-none">？</span>'}</button>`;
    }

    /**
     * 一个日期格子。
     * 三栏并列的自然月布局下，每格里的日子一定属于它所在那一栏的那个月，
     * 所以不再有「上下月压暗」和「跨月月份标签」这些事了。
     */
    function dayHtml(d, byDate) {
        const date = fmtDate(d);
        const hol = holidayOf(date);
        const off = !!(hol && hol.off);          // 法定放假
        const makeup = !!(hol && !hol.off);      // 调休上班（多半是周末补班）

        // 状态统一放在一个 data-state 里（空格分隔），样式在 css/work-calendar.css
        const st = [];
        // 调休上班那天按**工作日**处理：不算周末，底色就和普通工作日一样
        // （2026-09-21 用户要求：9/20 是补班，就该长得跟 9/21 一样）
        if (isWeekend(d) && !makeup) st.push('weekend');
        if (off) st.push('off');
        if (makeup) st.push('makeup');
        if (date === TODAY) st.push('today');
        else if (date < TODAY) st.push('past');

        // 节假日那一行：放假只写节日名；调休上班写「XX调班」。
        // 不再用「休 / 班」两个字（2026-09-21 用户要求去掉）
        const holNote = !hol ? '' : (off ? esc(hol.name) : `${esc(hol.name)}调班`);

        const tasks = byDate.get(date) || [];

        // 三栏并列后格子只有 ~55px 宽，所以节日再单独占一行，
        // 「＋」用绝对定位钉在右上角 —— 它们都不跟日期数字抢宽度，再窄也挤不出来
        return `<div class="cal-day" data-date="${date}" data-state="${st.join(' ')}">
            <span class="cal-num">${d.getDate()}</span>
            <button class="cal-add" data-cal-act="add" data-date="${date}"
                    title="新建一项工作，排到这天">＋</button>
            ${holNote ? `<div class="cal-hol"
                title="${off ? '法定节假日：放假' : '调休上班（这天要上班）'}">${holNote}</div>` : ''}
            <div class="cal-tasks">${tasks.length ? tasks.map(taskHtml).join('') : ''}</div>
        </div>`;
    }

    /**
     * 一个月历面板：**自然月** —— 1 号到月末，前面按「1 号是周几」补几个空格，
     * 不借上/下个月的日子进来（那些由左右两栏各自己的面板负责）。
     */
    function monthPanel(y, m, role, byDate) {
        const daysInMonth = new Date(y, m + 1, 0).getDate();
        const lead = new Date(y, m, 1).getDay();   // 1 号是周几，前面就空几格

        // 这一栏有多少条安排（选了责任人只算选中的那几个人，跟格子里画的一致）
        const key = `${y}-${pad(m + 1)}`;
        const count = (state.data.tasks || []).filter((t) => t.date.slice(0, 7) === key
            && (!filterOn() || filterHit(t.assignees))).length;

        let cells = '';
        for (let i = 0; i < lead; i += 1) cells += '<div class="cal-day is-blank"></div>';
        for (let day = 1; day <= daysInMonth; day += 1) {
            cells += dayHtml(new Date(y, m, day), byDate);
        }
        // 补满 6 行（42 格）：三栏高度一致、行线也对得齐。
        // 补的是透明空格，不是邻月的日子 —— 自然月不变
        for (let i = lead + daysInMonth; i < 42; i += 1) cells += '<div class="cal-day is-blank"></div>';

        return `<section class="cal-month" data-role="${role}">
            <h3 class="cal-mtitle">${y} 年 ${m + 1} 月
                <span class="cal-mcount">${count} 条安排</span></h3>
            <div class="cal-week">
                ${WEEK_SHORT.map((w, i) => (
                    `<span data-state="${(i === 0 || i === 6) ? 'weekend' : ''}">${w}</span>`
                )).join('')}
            </div>
            <div class="cal-grid">${cells}</div>
        </section>`;
    }

    /** 整个日历视图的 HTML（由 work-board.js 的 render() 塞进 #board） */
    function calendarHtml() {
        const { y, m } = month();

        // 翻月按钮上直接写月份数字，这样「上一个月 / 下一个月」是哪一个也一目了然
        const prevM = new Date(y, m - 1, 1);
        const nextM = new Date(y, m + 1, 1);

        // 先把安排按日期归好，画格子时直接取，免得每个格子都去遍历一遍 tasks。
        // 选了责任人（「只看」，可多选）时，不在名单里的安排直接不进这张表 —— 日历上就不画它
        const byDate = new Map();
        (state.data.tasks || []).forEach((t) => {
            if (filterOn() && !filterHit(t.assignees)) return;
            if (!byDate.has(t.date)) byDate.set(t.date, []);
            byDate.get(t.date).push(t);
        });

        // 本月落在时间轴以外的安排也能看见（日历不受 DAYS_BACK / DAYS_FORWARD 限制）
        const monthKey = `${y}-${pad(m + 1)}`;
        // 统计也只算选中那几个人的（和格子里画的一致）
        const mine = (state.data.tasks || []).filter((t) => t.date.slice(0, 7) === monthKey
            && (!filterOn() || filterHit(t.assignees)));
        const done = mine.filter((t) => t.done).length;
        const overdue = mine.filter((t) => !t.done && t.date < TODAY).length;

        // 本月有哪几个法定假期（按名字去重，只为了在标题旁边提示一句）
        const names = [];
        Object.keys(holidays()).forEach((k) => {
            if (k.slice(0, 7) !== monthKey) return;
            const n = holidays()[k].name;
            if (names.indexOf(n) < 0) names.push(n);
        });

        return `
        <div class="cal">
            <div class="cal-head">
                <h2 class="cal-title">${y} 年 ${m + 1} 月</h2>
                <div class="cal-nav">
                    <button class="btn ghost" data-cal="prev"
                            title="上一个月">‹ ${prevM.getMonth() + 1} 月</button>
                    <button class="btn ghost" data-cal="today" title="回到今天所在的月份">今天</button>
                    <button class="btn ghost" data-cal="next"
                            title="下一个月">${nextM.getMonth() + 1} 月 ›</button>
                </div>
                <div class="cal-tools">
                    <button class="btn" data-cal="close">← 返回表格</button>
                </div>
            </div>

            <p class="cal-sum">${filterOn() ? `只看 <b>${esc(filterText())}</b>（别人的安排已隐藏） · ` : ''}本月 <b>${mine.length}</b> 条安排 ·
                <b class="s-done">${done}</b> 条已完成 ·
                <b class="s-overdue">${overdue}</b> 条逾期未完成${names.length
                    ? ` · 法定假期：<b class="cal-sum-hol">${esc(names.join('、'))}</b>` : ''}</p>

            <div class="cal-months">
                ${monthPanel(prevM.getFullYear(), prevM.getMonth(), 'prev', byDate)}
                ${monthPanel(y, m, 'cur', byDate)}
                ${monthPanel(nextM.getFullYear(), nextM.getMonth(), 'next', byDate)}
            </div>
        </div>`;
    }

    /* ============================== 给某天排活 ============================== */

    /**
     * 日历里给某天加工作。
     *
     * 2026-09-21 用户要求：**默认自动新建一个工作项目**，然后直接进那个「填安排」弹层
     * （和表格模式一样的输入框）—— 不再每次都先弹一个项目列表让人选。
     *
     * 实现上就是拿**首行那条空白行的假 id**（BLANK_ID）去开弹层：
     *   · 名字/标题显示成「新工作」；
     *   · 点保存的那一刻才真建项目（`upsertTask` → `resolveItemId`），
     *     自动起名「工作A001」这种编号；
     *   · **点了取消就什么也不建** —— 不会白留一条空项目。
     * 跟表格模式里「点首行空白行的格子」走的是同一条路，两边行为完全一致。
     *
     * 想挂到**已有**项目上：把名字牌子拖到那天（见 work-edit.js 的 bindAssigneeDrag，
     * 那条路走的是 pickItemFor，会先让你选哪个项目）。
     */
    function addItemFor(date) {
        openTaskEditor(BLANK_ID, date);
    }

    /**
     * 日历里给某天加安排：先选一个工作项目（安排必须挂在某个项目下），
     * 选完再打开原来那个「填安排」弹层，流程和表格里点格子一样。
     *
     * @param {string} date  哪一天（YYYY-MM-DD）
     * @param {Function} [onPick] 传统上不传，选完就开弹层填内容；
     *        传了就先别开弹层，把项目 id 交给它 ——
     *        目前用在「把一个名字牌子拖到空白的那天上」：选完项目直接把那个人排上去
     *        （见 work-edit.js 的 bindAssigneeDrag）。
     */
    function pickItemFor(date, onPick) {
        const items = state.data.items || [];
        if (!items.length) {
            // 一个工作项目都没有：没什么可选的，直接建一个
            // （和点「＋」走另一条路时的效果一致；也避免了以前那句「先切回表格模式」的死路）
            if (typeof onPick === 'function') onPick(W.materializeBlank(), date);
            return;
        }

        openModal({
            title: `${date} · 给哪个工作项目排活？`,
            body: `<div class="pick-list">
                ${items.map((i) => `<button class="pick-item" data-pick="${esc(i.id)}">
                    <span class="pick-name">${esc(i.name)}</span>
                    ${i.subtitle ? `<span class="pick-sub">${esc(i.subtitle)}</span>` : ''}
                </button>`).join('')}
            </div>
            <p class="hint">${typeof onPick === 'function'
                ? '选一个项目，那个人就排到这天了，之后可以再填内容。'
                : '选一个项目，接着就能填这天的内容、责任人和完成状态。'}</p>`,
            buttons: [{ text: '取消', cls: 'ghost', onClick: closeModal }]
        });

        // 事件绑在刚建出来的 .pick-list 上：弹层内容每次都会重建，
        // 绑在 #modal-body 上会一次次叠加，绑在它里面就不会。
        const list = $('modal-body').querySelector('.pick-list');
        if (!list) return;
        list.addEventListener('click', (e) => {
            const b = e.target.closest('[data-pick]');
            if (!b) return;
            const id = b.getAttribute('data-pick');
            closeModal();
            if (typeof onPick === 'function') {
                onPick(id, date);
                return;
            }
            // 弹层收起有 160ms 动画，等它收完再开下一个，不然会看到两个弹层叠一起
            setTimeout(() => openTaskEditor(id, date), 180);
        });
    }

    /* ============================== 进出日历模式 ============================== */

    /** 工具栏那个按钮的文案跟着模式变 */
    function paintBtn() {
        const btn = $('btn-calendar');
        if (!btn) return;
        btn.textContent = state.calendar ? '▦ 表格模式' : '▤ 日历模式';
        btn.title = state.calendar
            ? '切回「日期 × 工作项目」的表格'
            : '用月历看这些安排（标出法定节假日和调休上班）';
        btn.classList.toggle('is-on', !!state.calendar);
    }

    function openCalendar() {
        // 日历和「工作查询」是两种视图，进日历先把查询收起来
        if (state.query) W.clearQuery();

        month();          // 保证有当前月份
        rememberView();   // 记住「现在是日历模式」，刷新后还回这儿
        render();
        boardWrap.scrollTo({ top: 0, behavior: 'auto' });
        focusCurrentMonth('auto');
        paintBtn();
        // 原来这里会弹一条「日历模式：点一条安排可以改…」的说明，
        // 2026-09-21 用户要求取消（每次进日历都弹，烦）。要恢复就加回：
        //   toast('日历模式：点一条安排可以改，点日期右上角「＋」给这天排活');
    }

    function closeCalendar() {
        if (!state.calendar) return;
        state.calendar = null;
        rememberView();
        render();
        paintBtn();
        W.scrollToToday('auto');   // 回表格时重新停在今天
    }

    function toggleCalendar() {
        if (state.calendar) closeCalendar();
        else openCalendar();
    }

    /* ============================== 点击分发 ============================== */

    /**
     * 日历上的点击都走这里（绑在 #board 上）。
     * 不在日历模式时直接返回，表格那套点击逻辑在 work-main.js 里，互不干扰。
     */
    function bindCalendar() {
        board.addEventListener('click', (e) => {
            if (!state.calendar) return;

            // 上一个 / 下一个 / 今天 / 返回表格
            const nav = e.target.closest('[data-cal]');
            if (nav) {
                const act = nav.getAttribute('data-cal');
                if (act === 'prev') shift(-1);
                else if (act === 'next') shift(1);
                else if (act === 'today') toToday();
                else if (act === 'close') closeCalendar();
                return;
            }

            // 日期右上角的「＋」：新建一项工作排到这天（直接进填安排弹层）
            const add = e.target.closest('[data-cal-act="add"]');
            if (add) {
                addItemFor(add.getAttribute('data-date'));
                return;
            }

            // 点一条安排：打开原来那个编辑弹层
            const task = e.target.closest('.cal-task');
            if (task) {
                openTaskEditor(task.getAttribute('data-item'), task.getAttribute('data-date'));
            }
        });

        // 悬浮看「这个人这天要干什么」（小窗那一套）
        bindCalendarTip();

        paintBtn();
    }

    /* ============================== 悬浮看「他要干的活」 ============================== */

    /**
     * 日历格子里每位责任人只写一个字，看不出这天要干什么，
     * 所以鼠标停在一条安排上（停在某个人的牌子上更好）时，浮出一个小窗。
     *
     * 显示什么：**内容**（没写就空着）、**详细内容**、**附件名单** —— 有哪个显示哪个，
     * 结构和表格模式那个小窗一样（head 内容 / body 详细 / foot 附件）。
     * 责任人、工作项目、日期**不写**：人就在鼠标底下、日期在格子里、项目名没那么重要，
     * 真正看不出来的是「这天到底要干什么活」。（2026-09-21 用户先要求「就简单显示内容」，
     * 再补「有附件或详细内容的话也显示一下」）
     *
     * 小窗复用 work-main.js 里那个 #hover-tip（表格模式预览详细内容用的是同一块）。
     * 两边靠选择器和 state.calendar 严格分开：表格那边只认 .cell，这里只认 .cal-task。
     * ⚠ 所以本文件里每个处理器开头都要先判 state.calendar —— 否则在表格模式下
     *   鼠标离开小窗时，会把表格那边的小窗一起关掉。
     */
    function bindCalendarTip() {
        const tip = $('hover-tip');
        if (!tip) return;

        const TIP_W = Math.min(380, window.innerWidth - 24);   // 最大宽度（内容短时比这窄）
        let current = null;        // 现在浮着小窗的那条安排
        let showTimer = null;
        let hideTimer = null;

        const hideNow = () => {
            clearTimeout(showTimer);
            clearTimeout(hideTimer);
            current = null;
            tip.classList.remove('show');
            tip.hidden = true;
        };

        // 鼠标从小窗挪回安排上中间会先离开一次，所以延迟一点再收；
        // 真到时间了，鼠标还停在小窗或原来那条安排上就不收
        const hideSoon = () => {
            if (!state.calendar) return;      // 表格模式的小窗不归这里管
            clearTimeout(showTimer);
            clearTimeout(hideTimer);
            hideTimer = setTimeout(() => {
                const overTip = !tip.hidden && tip.matches(':hover');
                const overTask = current && current.matches(':hover');
                if (overTip || overTask) return;
                hideNow();
            }, 300);
        };

        /** 日期 + 项目 id 就是主键，和表格模式找 task 的方式一致 */
        const findTask = (btn) => (state.data.tasks || []).find(
            (t) => t.item === btn.getAttribute('data-item')
                && t.date === btn.getAttribute('data-date')
        );

        const show = (btn, task) => {
            clearTimeout(hideTimer);      // 内容都重建了，就别再排着「稍后收掉」

            // 有哪个显示哪个：内容 / 详细内容 / 附件名单
            // （结构和表格模式那个小窗一模一样：head 内容、body 详细、foot 附件）
            const files = task.files || [];
            let html = '';
            if (task.text) html += `<div class="hover-tip-head">${esc(task.text)}</div>`;
            if (task.detail) html += `<div class="hover-tip-body">${esc(task.detail)}</div>`;
            if (files.length) {
                html += `<div class="hover-tip-foot">📎 附件：`
                    + `${esc(files.map((f) => f.name).join('、'))}</div>`;
            }
            tip.innerHTML = html || '<div class="hover-tip-body">（这条安排还没写内容）</div>';

            // 宽度**跟着内容走**：内容短就是一个窄框（定宽时短内容旁边一大片空白很难看），
            // 内容长到 TIP_W 就不再变宽，自己折行。
            // 用 width:auto（固定定位元素会 shrink-to-fit）而不是 max-content ——
            // 全局是 box-sizing:border-box，max-content 会被 padding 挤掉 24px 导致莫名折行。
            // maxWidth 必须每次显式写：这块小窗是跟表格模式共用的，
            // 那边用的是定宽 + maxWidth:none（见 work-main.js）
            tip.style.width = 'auto';
            tip.style.maxWidth = `${TIP_W}px`;
            // .is-cal：内容超宽就换行、只允许上下滚（样式在 work-parts.css）
            tip.classList.add('is-cal');
            tip.style.left = '0px';
            tip.style.top = '0px';
            tip.hidden = false;

            // 先量尺寸（宽度也得量，量出来才知道实际多宽），再决定浮在上面还是下面、贴不贴边
            const rect = btn.getBoundingClientRect();
            const h = tip.offsetHeight;
            const w = tip.offsetWidth;
            const left = Math.max(8, Math.min(rect.left - 20, window.innerWidth - w - 12));
            let top = rect.top - h - 10;
            if (top < 8) top = Math.min(rect.bottom + 10, window.innerHeight - h - 8);

            tip.style.left = `${left}px`;
            tip.style.top = `${Math.max(8, top)}px`;
            tip.classList.add('show');
        };

        board.addEventListener('mouseover', (e) => {
            if (!state.calendar) return;

            // 鼠标已经在小窗上（多半是要拖滚动条 / 选文字）：保持现状
            if (!tip.hidden && tip.matches(':hover')) return;

            const btn = e.target.closest('.cal-task');
            if (btn === current) return;      // 在同一条安排里挪动不用重建

            // ⚠ 这里用 hideSoon（延迟 300ms）而不是 hideNow：
            //   小窗和格子之间有 10px 缝，鼠标从牌子挪到小窗上要路过其他格子，
            //   立刻收掉的话就永远够不到小窗上的滚动条。
            //   下面的 show() 会把排着的「收掉」取消掉
            hideSoon();

            if (!btn) return;

            const task = findTask(btn);
            if (!task) return;

            current = btn;
            showTimer = setTimeout(() => {
                if (current === btn) show(btn, task);
            }, 180);
        });

        board.addEventListener('mouseout', (e) => {
            if (!state.calendar) return;
            const btn = e.target.closest('.cal-task');
            if (!btn) return;
            // 在按钮里挪动（从一个人的牌子挪到另一个）不算离开
            if (e.relatedTarget && btn.contains(e.relatedTarget)) return;
            hideSoon();
        });

        // 鼠标停在小窗里：别收（内容长了还能滚着看）
        tip.addEventListener('mouseenter', () => {
            if (!state.calendar) return;
            clearTimeout(showTimer);
            clearTimeout(hideTimer);
        });
        tip.addEventListener('mouseleave', hideSoon);
    }

    /* ============================== 挂到命名空间 ============================== */

    Object.assign(W, {
        holidayOf, calendarHtml, bindCalendar, pickItemFor,
        openCalendar, closeCalendar, toggleCalendar,
        calShift: shift, calToToday: toToday, paintCalendarBtn: paintBtn,
        calFocusMonth: focusCurrentMonth,
        restoreView, rememberView
    });
})(window.Work);
