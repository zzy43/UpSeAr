/**
 * 工作系统（1/5）基础层
 * ==================================================================
 * 这里放全局配置、工具函数、状态、数据读取与清洗、保存到 OSS、弹层基础、字体、亮/暗主题。
 * 其他文件通过 window.Work 命名空间取用这里的函数（不直接依赖全局变量）。
 *
 * 脚本加载顺序（见 work.html）：work-config.js → work-core.js → work-board.js
 *                              → work-edit.js → work-io.js → work-main.js
 *
 * 数据流：OSS JSON → 内存 → 表格，改动自动写回 OSS
 * · 打开页面就从 OSS 读 plan.json（不走浏览器缓存）；
 * · 页面上任何改动都会在停手后自动 PUT 覆盖回 OSS，右上角显示保存状态；
 * · 只有确实从 OSS 读到数据时才允许写回，避免网络异常时用示例数据把真数据覆盖掉。
 */

window.Work = window.Work || {};

(function (W) {
    'use strict';

    /* ============================== 配置与常量 ============================== */

    const CFG = Object.assign({
        OSS_BASE_URL: '',
        OSS_JSON_FILE: 'plan.json',
        OSS_JSON_URL: '',
        NO_CACHE: true,
        FALLBACK_ENABLED: true,
        OSS_AUTO_SAVE: true,      // 改动后自动上传
        OSS_SAVE_DEBOUNCE: 800,   // 连续编辑时，停手多少毫秒后上传
        DAYS_BACK: 8,
        DAYS_FORWARD: 15,
        TODAY_OFFSET_DAYS: 1,
        COL_WIDTH: 104,
        ROW_HEAD_WIDTH: 268,
        ROW_HEIGHT: 62,
        MAX_COLUMNS: 400,
        FONT_FAMILY: '',
        FONT_URL: '',
        ASSIGNEES: [],
        // 和「法定自查」共用的审核员名单文件（见 work-config.js 的说明）
        OSS_ROSTER_FILE: '审核员.json',
        OSS_ROSTER_URL: ''
    }, window.WORK_CONFIG || {});

    /*
     * 「空白行」用的假 id。
     * 首行永远留一条空的方便随手加新工作（2026-09-21 用户要求）——
     * 关键：**它不在 state.data.items 里**，只是渲染时多画的一行（见 work-board.js）。
     * 所以它不会存到 OSS，用户真在上面干活时才「做实」成真项目
     * （work-edit.js 的 resolveItemId / materializeBlank）。
     * 这么长的前缀是为了不可能和真 id（uid('item') 生成的）撞上。
     */
    const BLANK_ID = '__blank_row__';

    // 短写：给「今天 2026-09-21 周一」这种地方用
    const WEEK_LABEL = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    // 全写：表格模式的日期列头用（「星期一」比「周一」好认）
    const WEEK_FULL = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

    /* ============================== 小工具 ============================== */

    const $ = (id) => document.getElementById(id);
    const pad = (n) => String(n).padStart(2, '0');
    const fmtDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const parseDate = (s) => {
        const parts = String(s || '').split('-').map(Number);
        return new Date(parts[0] || 1970, (parts[1] || 1) - 1, parts[2] || 1);
    };
    const addDays = (d, n) => {
        const x = new Date(d);
        x.setDate(x.getDate() + n);
        return x;
    };
    const isWeekend = (d) => d.getDay() === 0 || d.getDay() === 6;
    const uid = (prefix) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));

    /**
     * 读写浏览器的 localStorage（界面偏好用；工作数据一律在 OSS，不往这儿放）。
     * 隐私模式下会抛错，统一在这里吃掉。
     */
    const lsGet = (key) => { try { return localStorage.getItem(key) || ''; } catch (e) { return ''; } };
    const lsSet = (key, val) => { try { localStorage.setItem(key, String(val)); } catch (e) { /* 忽略 */ } };

    const TODAY = fmtDate(new Date());
    const params = new URLSearchParams(window.location.search);
    // 主题标识：拿轮播页传过来的 genre，转成小写短横线形式，用于 {theme} 占位符
    const slug = (params.get('theme') || 'workplan').trim().toLowerCase()
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'workplan';

    const themeParam = () => (params.get('theme') || '').trim();

    const titleFromParam = () => {
        const t = (params.get('title') || '').trim();
        return t ? `${t} · 工作计划` : '工作计划';
    };

    /* ============================== 状态 ============================== */

    const state = {
        data: { theme: slug, title: '', updated: '', range: null, assignees: [], items: [], tasks: [] },
        dates: [],
        filter: [],         // 正在「只看这几个人」的名单（可多选）；空数组 = 不过滤（只影响显示，不写进数据）
        query: '',         // 正在「工作查询」看谁的全部工作，空 = 看表格
        queryFrom: '',     // 查询视图的日期范围（空 = 不限）
        queryTo: '',
        calendar: null,    // 日历模式：{ y, m }（m 是 0 基的月份；0 月就是 1 月），null = 表格模式
        cacheOnly: false,  // 现在画的是浏览器里的旧缓存（真数据还没回来），只读
        blankRow: false,   // 首行要不要留一条「空白行」方便加新工作（**默认关**，用户点开过一次就记住）
        hideDone: false,   // 要不要把**已完成的工作项目**整行藏起来（工具栏那个「✓ 已完成项」，默认显示）
        keepScroll: null,  // 进查询前的滚动位置，退出时还原（不然会卡在最左边）
        source: 'demo',    // oss | demo | error
        ossError: '',
        rosterLoaded: false, // 共用审核员名单（审核员.json）读到了没有
        rosterError: '',     // 读共用名单失败的原因（自己看，不弹提示）
        saveState: 'idle', // idle | pending | saving | saved | error | paused
        dropped: 0         // 项目 id 对不上的安排条数
    };

    // 自动上传的防抖 / 并发控制
    let saveTimer = null;
    let saving = false;
    let pendingSave = false;

    const board = $('board');
    const boardWrap = $('board-wrap');
    const modal = $('modal');

    /* ============================== 轻提示 ============================== */

    let toastTimer = null;

    function toast(msg) {
        const el = $('toast');
        el.textContent = msg;
        el.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
    }

    /** 责任人名字 → 牌子颜色（名单里找不到就给个中性灰） */
    function assigneeColor(name) {
        const found = assigneeList().find((p) => p.name === name);
        return (found && found.color) || '#7a8087';
    }

    /**
     * 责任人名字 → 牌子上的**字色**。
     * 没自定义过就返回空字符串 —— 交给 CSS 的 --chip-ink 兜底（那是统一的亮蓝色）。
     */
    function assigneeInk(name) {
        const found = assigneeList().find((p) => p.name === name);
        return (found && found.ink) || '';
    }

    /**
     * 名字牌子的一整串 inline style（底色 + 字色）。
     * 各处的牌子统一用它 —— 以后要改牌子的画法只改这一处。
     */
    function assigneeStyle(name) {
        const ink = assigneeInk(name);
        return `background:${assigneeColor(name)}` + (ink ? `;color:${ink}` : '');
    }

    /**
     * 默认字色：**直接读 CSS 变量 --chip-ink**。
     * 这样 CSS 里改了那个数，「编辑样式」弹层里的取色器就跟着变，不用两处改。
     */
    function defaultChipInk() {
        const v = getComputedStyle(document.documentElement).getPropertyValue('--chip-ink').trim();
        return v || '#cfe4ff';
    }

    /**
     * 责任人名字 → **日历格子里那一个字**（朱震宇 → 朱）。
     * 默认取名字的第一个字；用户可以在「⋯ → 🎨 编辑责任人样式」里自己改成任意一个字
     * （比如「朱震宇」习惯用「宇」，或者用个花名「泰」），存在 plan.json 的
     * `assignees[].short` 里，换台电脑打开也是这个字。
     */
    function assigneeShort(name) {
        const found = assigneeList().find((p) => p.name === name);
        const s = (found && found.short) || '';
        return s || String(name || '').slice(0, 1);
    }

    /*
     * 「只看某几个人」的状态查询（2026-09-21 起支持多选，state.filter 是数组）：
     *   · filterOn()        —— 现在有没有开「只看」（名单非空）
     *   · filterHit(owners) —— 这条安排算不算要看的（owners 里有任意一个选中的人）
     *   · filterText()      —— 名单拼成「景志详、方乔」，用来显示
     * 表格、日历、底部统计都调这三个，免得各处写法不一致。
     */
    const filterList = () => (Array.isArray(state.filter) ? state.filter : []);
    const filterOn = () => filterList().length > 0;
    const filterHit = (owners) => filterOn()
        && (owners || []).some((n) => filterList().indexOf(n) >= 0);
    const filterText = () => filterList().join('、');

    /**
     * 当前有效的责任人名单：
     * 页面上加过人（数据里存了 assignees）就用数据里的；否则用 work-config.js 里的默认那几个。
     */
    function assigneeList() {
        const fromData = state.data && state.data.assignees;
        return (Array.isArray(fromData) && fromData.length) ? fromData : (CFG.ASSIGNEES || []);
    }

    /**
     * 责任人统一存成数组（第一个人是主责任人），兼容老写法 assignee: "张三"。
     * 顺序有意义（第一个才是主责任人），所以只去重、不重排。
     */
    function toAssigneeList(one, many) {
        const src = [].concat(Array.isArray(many) ? many : (many ? [many] : []), one ? [one] : []);
        const out = [];
        src.forEach((n) => {
            const name = String(n == null ? '' : n).trim();
            if (name && out.indexOf(name) < 0) out.push(name);
        });
        return out;
    }

    /* ============================== 数据读取 ============================== */

    /** 拼出数据文件的完整地址：优先用 OSS_JSON_URL，否则 OSS_BASE_URL + OSS_JSON_FILE */
    function resolveOssUrl() {
        const explicit = (CFG.OSS_JSON_URL || '').trim();
        const base = (CFG.OSS_BASE_URL || '').trim();
        const file = (CFG.OSS_JSON_FILE || '').trim();

        let raw = explicit;
        if (!raw && base && file) raw = base.replace(/\/+$/, '') + '/' + file.replace(/^\/+/, '');
        if (!raw) return '';

        return raw.replace(/\{theme\}/g, encodeURIComponent(slug));
    }

    /**
     * 拼出「共用审核员名单」文件的地址。
     * 两个系统（安全审核 / 法定自查）**共用这一份**，所以它放在 bucket 根目录
     * （SafetyAudit/ 和 CheckQuestion/ 是两个独立目录，根目录才是它们共同的地方）。
     * 优先级：CFG.OSS_ROSTER_URL（完整地址）> OSS_BASE_URL 的上一级 + OSS_ROSTER_FILE。
     * 想换地方：在两边配置里都填上 OSS_ROSTER_URL。
     */
    function resolveRosterUrl() {
        const explicit = (CFG.OSS_ROSTER_URL || '').trim();
        if (explicit) return explicit;

        const base = (CFG.OSS_BASE_URL || '').trim();
        const file = (CFG.OSS_ROSTER_FILE || '').trim();
        if (!base || !file) return '';

        // 砍掉最后一段目录：…/SafetyAudit/ → …（bucket 根）
        const root = base.replace(/\/+$/, '').replace(/\/[^/]*$/, '');
        return `${root}/${file.replace(/^\/+/, '')}`;
    }

    /** 共用名单里的一条 → 本系统的字段（name / color / ink / short），没名字的丢掉 */
    function normalizeRosterList(list) {
        return (Array.isArray(list) ? list : [])
            .filter((a) => a && a.name)
            .map((a) => {
                const o = { name: String(a.name).trim(), color: String(a.color || '') };
                if (a.ink) o.ink = String(a.ink);
                if (a.short) o.short = String(a.short).slice(0, 1);
                return o;
            })
            .filter((a) => a.name);
    }

    /**
     * 读「共用审核员名单」——**只取，不碰 state**。
     *
     * 为什么拆成「取」和「套」两步：这样它能和主数据**同时发请求**，
     * 谁先回来都不会互相覆盖（不拆的话：名单先回来会被 state.data = 主数据 盖掉）。
     * 返回名单数组；文件不存在 / 读失败就返回 null。
     */
    async function fetchRoster() {
        const url = resolveRosterUrl();
        if (!url) return null;

        let obj;
        try {
            obj = await fetchJson(url);
        } catch (e) {
            // 404 = 还没建过（正常，第一次改样式/加人才会建）；其他错误也只是拿不到共用名单
            const msg = String((e && e.message) || e);
            state.rosterError = /HTTP\s*404/.test(msg) ? '' : msg;
            return null;
        }

        const list = normalizeRosterList(obj && obj.auditors);
        return list.length ? list : null;
    }

    /** 把取回来的名单套上去。真的换了名单返回 true。 */
    function applyRoster(list) {
        if (!list || !list.length) return false;
        state.data.assignees = list;
        state.rosterLoaded = true;
        return true;
    }

    /**
     * 读共用名单（取回来就套上，一次搞定）。
     *
     * ⚠ 只要这个文件存在、里面有人，就**以它为准** —— 它才是唯一真相。
     *   不然「在法定自查里改的颜色 / 删掉的人」在安全审核这边就不生效了。
     *   代价：往 plan.json 里手写 assignees 是没用的（两边都以 审核员.json 为准）。
     *
     * ⚠ 启动流程**不走这个** —— 那样会把「取」和「套」绑成一步、又不能和主数据并行。
     *   启动走 fetchRoster() + applyRoster()，见 loadAll()。
     */
    async function loadRoster() {
        return applyRoster(await fetchRoster());
    }

    /**
     * 把当前名单写回「共用审核员名单」文件（两边都读它，所以写一份就行）。
     * 加了人 / 删了人 / 改了颜色字色单字 之后都要调它。
     * 写失败只是提示一句，不影响本地 —— 下次改动还会再试。
     */
    async function pushRoster() {
        const url = resolveRosterUrl();
        if (!url) return false;

        const body = {
            updated: `${TODAY} ${pad(new Date().getHours())}:${pad(new Date().getMinutes())}`,
            note: '安全审核 / 法定自查 共用的人员名单，两个系统都会读写这一份',
            auditors: assigneeList().map((p) => {
                const o = { name: p.name, color: p.color || '' };
                if (p.ink) o.ink = p.ink;
                if (p.short) o.short = p.short;
                return o;
            })
        };

        try {
            const res = await fetch(url, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json; charset=utf-8' },
                body: JSON.stringify(body, null, 2)
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return true;
        } catch (e) {
            toast(`人员名单没能同步到共用文件：${(e && e.message) || e}`);
            return false;
        }
    }

    /**
     * 把相对路径补成 OSS 上的完整地址
     * 照片、附件等资料都放在 OSS_BASE_URL（SafetyAudit/）下面，例如：
     *   resolveAsset('图片/审核现场.jpg') → https://.../SafetyAudit/图片/审核现场.jpg
     */
    function resolveAsset(path) {
        const p = String(path || '').trim();
        if (!p) return '';
        if (/^(https?:|data:|blob:|\/\/)/i.test(p)) return p;

        const base = (CFG.OSS_BASE_URL || '').trim();
        if (!base) return p;
        return base.replace(/\/+$/, '') + '/' + p.replace(/^\/+/, '');
    }

    // 方便以后在页面里拼资料地址，例如：ossAsset('图片/审核现场.jpg')
    window.ossAsset = resolveAsset;

    async function fetchJson(url) {
        const finalUrl = CFG.NO_CACHE
            ? url + (url.indexOf('?') >= 0 ? '&' : '?') + '_t=' + Date.now()
            : url;
        const res = await fetch(finalUrl, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    }

    /** 统一清洗数据：补默认值、丢掉无效项、统计对不上的安排 */
    function normalize(raw) {
        const d = (raw && typeof raw === 'object') ? raw : {};

        const items = (Array.isArray(d.items) ? d.items : [])
            .filter((i) => i && (i.id || i.name))
            .map((i, idx) => ({
                id: String(i.id || `item-${idx + 1}`),
                name: String(i.name || i.id || '未命名项目'),
                // 副标题：这一栏以前是把责任人写在 owner 里，老数据也认，读进来统一成 subtitle
                subtitle: (i.subtitle || i.owner) ? String(i.subtitle || i.owner) : '',
                // 置顶（2026-09-21 加）：用户手动钉的「重要项目」，永远排在全部项目最前面（空白行下面）
                pinned: !!i.pinned,
                // 手动排过序（拖过行头）：这一项不再参与「按临近日期自动排序」，
                // 就留在用户放的那个位置上（见 work-edit.js 的 reorder）
                manual: !!i.manual
            }));

        const ids = new Set(items.map((i) => i.id));
        const rawTasks = Array.isArray(d.tasks) ? d.tasks : [];
        const tasks = rawTasks
            .filter((t) => t && t.item && t.date && ids.has(String(t.item)))
            .map((t) => ({
                item: String(t.item),
                date: String(t.date).slice(0, 10),
                text: String(t.text || ''),
                done: !!t.done,
                assignees: toAssigneeList(t.assignee, t.assignees),
                // 详细内容（弹层「详细」里填的）
                detail: t.detail ? String(t.detail) : '',
                // 相关附件：存在 OSS 上的文件地址
                files: (Array.isArray(t.files) ? t.files : [])
                    .filter((f) => f && f.url)
                    .map((f) => ({
                        name: String(f.name || '文件'),
                        url: String(f.url),
                        size: Number(f.size) || 0
                    }))
            }));
        state.dropped = rawTasks.length - tasks.length;

        // 责任人名单（页面上加过人就在这儿）；没写就用 work-config.js 里的默认。
        // short = 日历格子里那个字；ink = 牌子上的字色（留空用 CSS 的 --chip-ink）
        const assignees = (Array.isArray(d.assignees) ? d.assignees : [])
            .filter((a) => a && a.name)
            .map((a) => {
                const o = { name: String(a.name), color: String(a.color || '#7a8087') };
                if (a.ink) o.ink = String(a.ink);
                if (a.short) o.short = String(a.short).slice(0, 1);
                return o;
            });

        return {
            theme: d.theme ? String(d.theme) : (themeParam() || slug),
            title: d.title ? String(d.title) : titleFromParam(),
            updated: d.updated ? String(d.updated) : '',
            range: (d.range && d.range.start && d.range.end)
                ? { start: String(d.range.start).slice(0, 10), end: String(d.range.end).slice(0, 10) }
                : null,
            assignees,
            items,
            tasks
        };
    }

    /** 内置示例数据：生成的都是“今天前后”的日期，方便直接看效果 */
    function createDemoData() {
        const today = new Date();
        const d = (n) => fmtDate(addDays(today, n));

        return normalize({
            theme: themeParam() || slug,
            title: titleFromParam(),
            updated: TODAY,
            items: [
                { id: 'plan', name: '年度审核计划编制与发布', subtitle: '' },
                { id: 'prep', name: '审核准备会 / 进场会', subtitle: '' },
                { id: 'doc', name: '文件审查', subtitle: '' },
                { id: 'onsite', name: '现场观察 / 访谈 / 实操验证', subtitle: '' },
                { id: 'report', name: '末次会与审核报告评审', subtitle: '' },
                { id: 'rectify', name: '整改通知下发与验证关闭', subtitle: '' },
                { id: 'ledger', name: '台账维护与统计分析（重复率、整改及时率）', subtitle: '' },
                { id: 'committee', name: '向安委会报告体系监督情况', subtitle: '' }
            ],
            tasks: [
                { item: 'plan', date: d(-5), text: '收集各部门年度计划输入', done: true },
                { item: 'plan', date: d(3), text: '计划初稿完成并送审', done: false },
                { item: 'prep', date: d(1), text: '飞行部审核准备会 09:30 会议室A', done: false },
                { item: 'doc', date: d(2), text: '调取近三月飞行记录抽样清单', done: false },
                { item: 'onsite', date: d(6), text: '现场观察 + 机组访谈', done: false },
                { item: 'report', date: d(9), text: '审核报告评审会', done: false },
                { item: 'rectify', date: d(12), text: '下发整改通知单', done: false },
                { item: 'ledger', date: d(0), text: '更新审核监察台账', done: false },
                { item: 'committee', date: d(20), text: '季度体系监督情况报告', done: false }
            ]
        });
    }

    /** 生成日期列：优先用数据里的 range，否则用配置的“今天 ± N 天” */
    function buildDates() {
        const today = new Date();
        const range = state.data.range;
        const start = range ? parseDate(range.start) : addDays(today, -CFG.DAYS_BACK);
        const end = range ? parseDate(range.end) : addDays(today, CFG.DAYS_FORWARD);

        const dates = [];
        for (let d = new Date(start); d <= end && dates.length < CFG.MAX_COLUMNS; d = addDays(d, 1)) {
            dates.push(fmtDate(d));
        }
        state.dates = dates.length ? dates : [TODAY];
    }

    /** 用轮播页传过来的海报做背景（相对路径会自动补成 OSS 地址） */
    function applyBackground() {
        const url = resolveAsset((params.get('poster') || '').trim());
        if (!url) return;
        $('bg').style.backgroundImage = `url("${url.replace(/["'\\]/g, '')}")`;
    }

    /* ============================== 首屏缓存（先秒画上次的数据） ============================== */

    /*
     * 为什么要有它（2026-09-21 用户报「进入的时候加载很长时间，而且有时候加载不进去」）：
     * 从 OSS 要数据是一个完整的网络来回，跨区域可能几百毫秒到一两秒 ——
     * 这期间页面只能空白、或者拿「示例数据」顶着。
     * 所以把**上次成功读到的数据**存一份在浏览器里：打开先拿它秒画一屏，
     * 真正的数据一到就盖掉（stale-while-revalidate）。
     *
     * ⚠ 画缓存的那一下 `state.cacheOnly = true`，**不许保存**（见 canWrite）：
     *   不然一个快速操作就可能把旧数据整份写回 OSS。
     * ⚠ 读不到 OSS 时，**有缓存就用缓存顶着**（不再直接退示例数据），
     *   但这时是只读的、右上角角标会写「读取失败」—— 免得把旧的当成真的、又写回去。
     */
    const CACHE_KEY = 'safemonitor:work:cache';
    const CACHE_MAX = 900 * 1024;   // 超过这个大小就不存了（localStorage 一般就 5MB）

    /** 把当前数据存一份到浏览器（只在**确实从 OSS 读到/存过**之后调） */
    function saveCache() {
        try {
            if (!W.serialize) return;
            const raw = JSON.stringify(W.serialize());
            if (raw.length > CACHE_MAX) { localStorage.removeItem(CACHE_KEY); return; }
            localStorage.setItem(CACHE_KEY, raw);
        } catch (e) { /* 隐私模式 / 存满了：算了，不影响主流程 */ }
    }

    /** 读上次存的那份；没有 / 坏了就返回 null */
    function readCache() {
        try {
            const raw = localStorage.getItem(CACHE_KEY);
            if (!raw) return null;
            return normalize(JSON.parse(raw));
        } catch (e) {
            return null;
        }
    }

    /** 清掉缓存（想看看「真正第一次打开」什么样子时用） */
    function clearCache() {
        try { localStorage.removeItem(CACHE_KEY); } catch (e) { /* 忽略 */ }
    }

    /**
     * 把当前 state.data 画上去（启动时可能跑两遍：先缓存、后真数据，所以抽出来）。
     * @param {boolean} silent 画缓存那一遍传 true：别把「自动上传已暂停」那个角标闪出来
     */
    function paintData(silent) {
        applyBackground();
        buildDates();

        // 恢复上次的界面状态（是不是日历模式、看的是哪个月、「只看」名单、空白行开关）。
        // 必须放在 render 之前 —— 这样刷新后直接就是上次那个视图，不会先闪一下表格。
        // （重画两遍也无所谓：这几个 restoreXxx 都是只读 localStorage 的，幂等）
        if (W.restoreView) W.restoreView();
        if (W.restoreFilter) W.restoreFilter();
        if (W.restoreBlankRow) W.restoreBlankRow();
        if (W.restoreHideDone) W.restoreHideDone();

        // 读进来的数据也先把顺序摆正（没安排项目的提前、按临近日期排、已完成沉底）
        // （这里**不** markChanged：只是把顺序摆正，不必为此写回 OSS，
        //   下次真编辑时自然会把这份顺序一起存回去）
        if (W.reorder) W.reorder();

        W.render();
        // 名单也是存在数据里的（页面上加过人就在 plan.json 的 assignees 里），
        // 先画的那一遍可能是配置文件里的默认那几个，数据到了要再画一次
        W.renderAssigneeChips();
        W.updateBadge();

        // 没从 OSS 读到数据就不自动上传，免得把 OSS 上的真数据冲掉
        setSaveState((silent || canWrite()) ? 'idle' : 'paused');

        // 渲染完再滚，保证能定位到今天那一列；首帧列宽可能没算好，稍后再校正一次
        requestAnimationFrame(() => W.scrollToToday('auto'));
        setTimeout(() => W.scrollToToday('auto'), 120);
    }

    /** 读取数据并渲染：OSS →（读不到时才用）首屏缓存 / 示例数据 */
    async function loadAll() {
        const url = resolveOssUrl();

        /*
         * ⚡ 共用名单的请求**现在就发**，和主数据同时出去。
         * 原来是在主数据回来之后才 await 它 —— 白等一个完整来回：
         * 实测两个请求是串着的（plan.json 102ms 走完，审核员.json 才开始）。
         * 它只是拿来盖责任人的名单和颜色，不值得让整页等它。
         */
        const rosterP = fetchRoster();

        // ⚡ 先拿上次缓存的秒画一屏（真数据回来再盖掉）—— 见上面 saveCache 那段注释
        const cached = url ? readCache() : null;
        if (cached) {
            state.data = cached;
            state.source = 'oss';      // 先当正常，角标才不会闪一下
            state.cacheOnly = true;    // 但先不让保存（这份可能是旧的）
            paintData(true);
        }

        let oss = null;
        let err = '';

        if (url) {
            /*
             * 网络抖一下就重试一次（用户反馈「有时候加载不进去」）——
             * 以前一失败就直接退示例数据 + 暂停上传，得手动刷新才行。
             * 4xx（比如 404 还没这个文件）重试没用，直接认。
             */
            for (let attempt = 0; attempt < 2; attempt += 1) {
                try {
                    oss = normalize(await fetchJson(url));
                    err = '';
                    break;
                } catch (e) {
                    err = (e && e.message) ? e.message : String(e);
                    if (/HTTP\s*4\d\d/.test(err)) break;
                    if (attempt === 0) await new Promise((r) => setTimeout(r, 600));
                }
            }

            // 浏览器因跨域失败时只会给一个笼统的 Failed to fetch，这里补一句人话
            if (/failed to fetch|networkerror|load failed/i.test(err)) {
                err += '（多数是 bucket 没配 CORS，或地址/网络不对，见 说明.txt 第四节）';
            }
        }

        state.ossError = err;
        state.cacheOnly = false;   // 真数据（或失败）已经有结论了，恢复正常写权限判定

        if (oss) {
            state.data = oss;
            state.source = 'oss';
            saveCache();           // 读到了就更新缓存
        } else if (cached) {
            // 这次没读到，但手里有上次的数据 —— 就用它撑着，并且**只读**
            state.source = 'error';
        } else if (url && !CFG.FALLBACK_ENABLED) {
            state.data = normalize({ title: titleFromParam() });
            state.source = 'error';
        } else {
            state.data = createDemoData();
            state.source = url ? 'error' : 'demo';
        }

        paintData();

        if (state.dropped > 0) {
            toast(`有 ${state.dropped} 条安排的项目 id 找不到对应的工作项目，已忽略`);
        }

        // 读不到 OSS 时明确提示一次，避免以为是页面坏了
        if (state.source === 'error' && !cached) {
            toast('读不到 OSS 数据，正在显示示例数据：' + (state.ossError || '未知原因'));
        } else if (state.source === 'error') {
            toast('读不到 OSS 数据，先显示上次的内容（只读）：' + (state.ossError || '未知原因'));
        }

        // 名单回来了再套上（多半这时已经到了，同一个微任务里就定下来，看不见跳变）
        rosterP.then((list) => {
            if (!applyRoster(list)) return;
            W.render();
            W.renderAssigneeChips();
        });
    }

    /* ============================== 保存到 OSS ============================== */

    /** 只有确实从 OSS 读到数据时才允许写回。
     *  ⚠ 首屏那一下用的是浏览器里的**旧缓存**（cacheOnly），一律不许写回去 ——
     *    否则一个快速操作就可能把旧的整份数据盖到 OSS 上。 */
    function canWrite() {
        if (state.cacheOnly) return false;
        return state.source === 'oss' && !!resolveOssUrl();
    }

    /** 还有没传完的改动吗（关页面拦截、重新载入前用它判断） */
    function hasPendingSave() {
        return !!(saveTimer || saving);
    }

    /** 有改动：刷新统计，并触发一次自动上传（连续编辑会防抖合并） */
    function markChanged() {
        // 重排工作项目的顺序（函数在 work-edit.js，和置顶一起管数组顺序）——
        // 必须在这次 render 之前定下来：「数组顺序 = 显示顺序」是表格唯一的第一真相
        if (W.reorder) W.reorder();

        W.updateStat();
        scheduleSave();
    }

    /** 计划一次上传：停手 OSS_SAVE_DEBOUNCE 毫秒后才真正发请求 */
    function scheduleSave() {
        if (!CFG.OSS_AUTO_SAVE) return;
        if (!canWrite()) {
            setSaveState('paused');
            return;
        }

        clearTimeout(saveTimer);
        setSaveState('pending');
        saveTimer = setTimeout(uploadNow, Math.max(0, CFG.OSS_SAVE_DEBOUNCE || 0));
    }

    /** 立刻把当前内容 PUT 覆盖到 OSS 上的数据文件 */
    async function uploadNow() {
        clearTimeout(saveTimer);
        saveTimer = null;

        if (!canWrite()) {
            setSaveState('paused');
            return;
        }
        if (saving) {
            // 正在上传：记个标记，等这次传完再补一次，避免并发覆盖
            pendingSave = true;
            return;
        }

        saving = true;
        setSaveState('saving');

        try {
            const res = await fetch(resolveOssUrl(), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json; charset=utf-8' },
                body: JSON.stringify(W.serialize(), null, 2)
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            saveCache();          // 存好了就顺手更新浏览器里那份首屏缓存
            setSaveState('saved');
        } catch (e) {
            setSaveState('error', (e && e.message) ? e.message : String(e));
        } finally {
            saving = false;
            if (pendingSave) {
                pendingSave = false;
                uploadNow();
            }
        }
    }

    /** 更新右上角的保存状态（保存失败时点一下可以重试） */
    function setSaveState(kind, detail) {
        state.saveState = kind;

        const el = $('save-state');
        if (!el) return;

        const now = new Date();
        const map = {
            idle: { text: '已同步', cls: 'is-oss', tip: '当前内容与 OSS 一致' },
            pending: { text: '待保存…', cls: 'is-local', tip: '停手后会自动上传到 OSS' },
            saving: { text: '保存中…', cls: 'is-local', tip: '正在上传到 OSS' },
            saved: {
                text: `已保存 ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`,
                cls: 'is-oss',
                tip: '已覆盖上传到 ' + resolveOssUrl()
            },
            error: { text: '保存失败，点此重试', cls: 'is-error', tip: detail || '' },
            paused: {
                text: '自动上传已暂停',
                cls: 'is-local',
                tip: '没有从 OSS 读到数据，为防止误覆盖已暂停自动上传；可先点「导出 JSON」备份'
            }
        };

        const info = map[kind] || map.idle;
        el.textContent = info.text;
        el.className = 'badge save-state ' + info.cls;
        el.title = info.tip;
        el.hidden = kind === 'idle';
        el.onclick = kind === 'error' ? () => uploadNow() : null;
    }

    /* ============================== 弹层基础 ============================== */

    function openModal(options) {
        $('modal-title').textContent = options.title || '编辑';
        $('modal-body').innerHTML = options.body || '';

        // 大弹层（「详细 + 上传文件」用）：卡片放宽放宽一点
        const card = modal.querySelector('.modal-card');
        if (card) {
            // size 决定框有多大（CSS 里对应两个类，两个是互斥的，都要切）：
            //   'wide' = 1200px，'xl' = 1488px（「填安排」用它，和法定自查的「编辑问题」同规格）
            card.classList.toggle('is-wide', options.size === 'wide');
            card.classList.toggle('is-xl', options.size === 'xl');
        }

        const foot = $('modal-foot');
        foot.innerHTML = '';
        (options.buttons || []).forEach((b) => {
            const btn = document.createElement('button');
            btn.className = 'btn ' + (b.cls || '');
            btn.textContent = b.text;
            btn.addEventListener('click', () => b.onClick && b.onClick());
            foot.appendChild(btn);
        });

        modal.hidden = false;
        requestAnimationFrame(() => modal.classList.add('show'));
    }

    function closeModal() {
        modal.classList.remove('show');
        setTimeout(() => {
            modal.hidden = true;
            $('modal-body').innerHTML = '';
        }, 160);
    }

    const isModalOpen = () => !modal.hidden;

    /* ============================== 字体 ============================== */

    /**
     * 套用字体：
     * · 配了 FONT_URL（字体文件放在 OSS）就先注册一个 @font-face，所有人看到的都一致；
     * · 没配就只用 FONT_FAMILY，本地装了该字体才生效，没装会自动回退到后面的字体。
     */
    function applyFont() {
        const families = [];
        const url = (CFG.FONT_URL || '').trim();

        if (url) {
            const family = 'work-custom';
            const ext = url.split('.').pop().toLowerCase();
            const format = ext === 'woff2' ? 'woff2'
                : ext === 'woff' ? 'woff'
                    : ext === 'otf' ? 'opentype'
                        : 'truetype';

            const style = document.createElement('style');
            style.textContent = `@font-face{font-family:"${family}";`
                + `src:url("${resolveAsset(url)}") format("${format}");font-display:swap;}`;
            document.head.appendChild(style);

            families.push(`"${family}"`);
        }

        families.push((CFG.FONT_FAMILY || '').trim()
            || '"Inter", "Microsoft YaHei", "PingFang SC", system-ui, sans-serif');

        document.documentElement.style.setProperty('--font', families.join(', '));
    }

    /* ============================== 亮色 / 暗色模式 ============================== */

    const THEME_KEY = 'safemonitor:work:theme';
    let themeMode = 'dark';

    const currentTheme = () => themeMode;

    /** 切换亮/暗：值写在 <html data-theme> 上，样式由 CSS 里的 html[data-theme="light"] 覆盖 */
    function applyTheme(mode) {
        themeMode = mode === 'light' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', themeMode);

        const btn = $('btn-theme');
        if (btn) {
            const toLight = themeMode === 'dark';
            btn.textContent = toLight ? '☀ 亮色' : '☾ 暗色';
            btn.title = toLight ? '切换到亮色模式' : '切换到暗色模式';
        }

        // 只存这一个界面偏好，工作数据一律在 OSS 上（不存浏览器本地）
        try {
            localStorage.setItem(THEME_KEY, themeMode);
        } catch (e) { /* 隐私模式忽略 */ }
    }

    function initTheme() {
        let saved = '';
        try {
            saved = localStorage.getItem(THEME_KEY) || '';
        } catch (e) { /* 忽略 */ }

        applyTheme(saved === 'light' ? 'light' : 'dark');
    }

    /* ============================== 挂到命名空间 ============================== */

    Object.assign(W, {
        // 配置 / 状态 / DOM
        CFG, WEEK_LABEL, WEEK_FULL, state, board, boardWrap, modal, BLANK_ID,
        // 工具函数
        $, pad, fmtDate, parseDate, addDays, isWeekend, uid, esc, lsGet, lsSet,
        TODAY, params, slug, themeParam, titleFromParam,
        // 数据
        resolveOssUrl, resolveAsset, fetchJson, normalize, createDemoData, buildDates,
        loadAll, applyBackground, assigneeColor, assigneeInk, assigneeStyle, assigneeShort,
        defaultChipInk, toAssigneeList, assigneeList,
        // 和法定自查共用的审核员名单（审核员.json）
        resolveRosterUrl, normalizeRosterList, fetchRoster, applyRoster, loadRoster, pushRoster,
        // 首屏缓存（打开先秒画上次的数据）
        saveCache, readCache, clearCache, CACHE_KEY,
        // 「只看某几个人」
        filterList, filterOn, filterHit, filterText,
        // 保存
        canWrite, hasPendingSave, markChanged, scheduleSave, uploadNow, setSaveState,
        // 弹层 / 提示
        openModal, closeModal, isModalOpen, toast,
        // 字体 / 主题
        applyFont, currentTheme, applyTheme, initTheme
    });
})(window.Work);
