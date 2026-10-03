/**
 * 法定自查系统（1/4）基础层
 * ==================================================================
 * 状态、小工具、OSS 读写（含自动保存）、弹层、轻提示、亮暗主题。
 * 业务界面在 check-plan.js（审核计划）和 check-issues.js（问题库）。
 * ==================================================================
 */

(function (W) {
    'use strict';

    /** 配置：以 check-config.js 里的为准，缺什么补什么 */
    const CFG = Object.assign({
        OSS_BASE_URL: '',
        OSS_JSON_FILE: 'check.json',
        OSS_JSON_URL: '',
        // 和安全审核共用的审核员名单文件（见 check-config.js 的说明）
        OSS_ROSTER_FILE: '审核员.json',
        OSS_ROSTER_URL: '',
        NO_CACHE: true,
        FALLBACK_ENABLED: true,
        OSS_AUTO_SAVE: true,
        OSS_SAVE_DEBOUNCE: 800,
        FONT_FAMILY: '',
        FONT_URL: '',
        AUDITORS: [],
        LEVELS: ['一般', '重要', '严重'],
        SOURCES: ['其他'],
        UNITS: [],
        SOON_DAYS: 60
    }, window.CHECK_CONFIG || {});

    /* ============================== 小工具 ============================== */

    const $ = (id) => document.getElementById(id);
    const pad = (n) => String(n).padStart(2, '0');
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
    const uid = (prefix) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

    /** 今天（本地时区）的 YYYY-MM-DD */
    const todayStr = () => {
        const d = new Date();
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    };
    const TODAY = todayStr();

    /** 时间戳，写进数据的 updated 字段 */
    const stamp = () => {
        const d = new Date();
        return `${todayStr()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    const lsGet = (k) => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
    const lsSet = (k, v) => { try { localStorage.setItem(k, String(v)); } catch (e) { /* 忽略 */ } };

    const params = new URLSearchParams(window.location.search);
    const themeParam = () => (params.get('theme') || '').trim();
    const titleParam = () => (params.get('title') || '').trim();

    /**
     * 这一页的标题（左上角那个大标题 + 浏览器标签页）。
     * **固定就是这一句**，不用轮播页传过来的 title ——
     * 轮播页传过来的是「法定自查 证据标准和整改验证规则」，
     * 那是轮播页上那两行字的拼法，「证据标准和整改验证规则」不是这一页的标题。
     * （2026-09-21 用户要求改成「法定自查 年度审核计划」）
     */
    const STD_TITLE = '法定自查 年度审核计划';
    const pageTitle = () => STD_TITLE;

    /**
     * 从数据里取标题。
     * 老数据里存的标题是以前自动拼的「<轮播页传的标题> · 年度审核计划」，
     * 碰到这种就换成标准标题；如果是**手改过 JSON 里的 title**（不含那串 URL 标题），就尊重手改的。
     */
    function titleFromData(d) {
        const t = String((d && d.title) || '').trim();
        if (!t) return STD_TITLE;
        const fromUrl = titleParam();
        if (fromUrl && t.indexOf(fromUrl) === 0) return STD_TITLE;
        return t;
    }

    /* ============================== 日期 / 计划 ============================== */

    /** 把 '2027-4' 统一成 '2027-04'；不是合法年月就返回空串 */
    function normalizeMonth(v) {
        const m = /^(\d{4})-(\d{1,2})$/.exec(String(v || '').trim());
        if (!m) return '';
        const mm = Number(m[2]);
        if (mm < 1 || mm > 12) return '';
        return `${m[1]}-${pad(mm)}`;
    }

    /** '2027-04' → '2027 年 4 月' */
    function monthLabel(v) {
        const key = normalizeMonth(v);
        if (!key) return '未排计划';
        return `${key.slice(0, 4)} 年 ${Number(key.slice(5, 7))} 月`;
    }

    /**
     * 距离计划检查还有几天。
     * 用「计划月 1 号」当基准：正数 = 还没到，0 = 就是这个月，负数 = 已经过了。
     * 没排计划返回 null。
     */
    function daysToPlan(v) {
        const key = normalizeMonth(v);
        if (!key) return null;
        const y = Number(key.slice(0, 4));
        const m = Number(key.slice(5, 7));
        const target = new Date(y, m - 1, 1);
        const now = new Date(TODAY + 'T00:00:00');
        return Math.round((target - now) / 86400000);
    }

    /** 「还有 192 天」这种给人看的一句话 */
    function planText(v) {
        const d = daysToPlan(v);
        if (d === null) return '未排计划';
        if (d > 0) return `还有 ${d} 天`;
        if (d === 0) return '就是这个月';
        return `已过 ${-d} 天`;
    }

    /** 快到期了吗（用来上暖色）：null = 没排计划，false = 还早 */
    function planSoon(v) {
        const d = daysToPlan(v);
        if (d === null) return null;
        if (d < 0) return 'over';
        return d <= (CFG.SOON_DAYS || 60) ? 'soon' : 'far';
    }

    /* ============================== 颜色 / 分类 ============================== */

    /**
     * 在「当前生效的审核员名单」里找这个人。
     * 先看数据里的（用户可以改颜色），没找到再退回配置文件里的 AUDITORS。
     */
    function auditorOf(name) {
        const n = String(name || '');
        return (state.data.auditors || []).find((a) => a.name === n)
            || (CFG.AUDITORS || []).find((a) => a.name === n)
            || null;
    }

    /** 审核员牌子底色 */
    function auditorColor(name) {
        const hit = auditorOf(name);
        return (hit && hit.color) || '#6b7280';
    }

    /**
     * 审核员牌子上的字色。
     * 没自定义过就返回空字符串 —— 交给 CSS 的 --chip-ink 兜底（那是统一的亮蓝色）。
     */
    function auditorInk(name) {
        const hit = auditorOf(name);
        return (hit && hit.ink) || '';
    }
    /**
     * 审核员名字 → **一个字**。
     * 这只是给**安全审核（work.html）的日历格子**用的（那边一格一个字，如朱震宇 → 朱）；
     * 法定自查这边牌子上一直显示全名，不用这个字。
     * 存在共用的 审核员.json 里（两边一起改），没自定义过就取名字第一个字。
     */
    function auditorShort(name) {
        const hit = auditorOf(name);
        const s = (hit && hit.short) || '';
        return s || String(name || '').slice(0, 1);
    }
    /**
     * 默认字色：**直接读 CSS 变量 --chip-ink**。
     * 这样 CSS 里改了那个数，「编辑样式」弹层里的取色器跟着变，不用两处改。
     */
    function defaultChipInk() {
        const v = getComputedStyle(document.documentElement).getPropertyValue('--chip-ink').trim();
        return v || '#cfe4ff';
    }

    /**
     * 名字牌子的一整串 inline style（底色 + 字色）。
     * 各处渲染统一用它 —— 要改牌子的画法只改这里一处。
     */
    function auditorStyle(name) {
        const ink = auditorInk(name);
        return `background:${auditorColor(name)}` + (ink ? `;color:${ink}` : '');
    }

    /** 问题级别 → chip 的 class（一般=lv-1 重要=lv-2 严重=lv-3） */
    function levelClass(level) {
        const i = (CFG.LEVELS || []).indexOf(level);
        return `lv-${i >= 0 ? i + 1 : 1}`;
    }

    /** 是不是能在浏览器里直接看的图片（决定要不要出缩略图 / 悬停预览） */
    const isImageUrl = (url) => /\.(png|jpe?g|gif|webp|bmp|svg|avif)(\?|#|$)/i.test(url || '');

    /* ============================== 看哪个视图 ============================== */

    /*
     * 「问题库」还是「年度审核计划」要**记住**。
     * 为什么（2026-09-21 用户反馈「在年度审核计划里刷新就跳回问题库」）：
     *   以前 state.view 写死是 'issues'，刷新（或从别处重新进来）就回问题库了。
     *   和安全审核那套一个规矩：存在 localStorage，下次打开还在那一页。
     */
    const VIEW_KEY = 'checkquestion:view';

    /** 启动时按记录决定看哪一页（没记录就是问题库） */
    function initView() {
        state.view = lsGet(VIEW_KEY) === 'plan' ? 'plan' : 'issues';
    }

    /** 切视图（并记住）。★ 所有改 state.view 的地方都走这里，别直接赋值 */
    function setView(v) {
        state.view = (v === 'plan') ? 'plan' : 'issues';
        lsSet(VIEW_KEY, state.view);
    }

    /* ============================== 状态 ============================== */

    const state = {
        data: {
            theme: '', title: '', updated: '',
            auditors: [], units: [], issues: []
        },
        view: 'issues',      // issues = 问题库 | plan = 审核计划总览
        unit: '__all',       // 正在看哪个单位，'__all' = 全部单位
        query: '',           // 问题库里的搜索词
        who: [],             // 「只看这几个人记的问题」，空数组 = 不过滤（**可多选**，和名称一样）
        source: 'demo',      // oss | demo | error
        ossNew: false,       // OSS 上还没有这个文件（第一次保存会建出来）
        cacheOnly: false,    // 现在画的是浏览器里的旧缓存（真数据还没回来）
        ossError: '',
        rosterLoaded: false, // 共用审核员名单（审核员.json）读到了没有
        rosterError: '',     // 读共用名单失败的原因（自己看，不弹提示）
        saveState: 'idle'    // idle | pending | saving | saved | error | paused
    };

    let saveTimer = null;
    let saving = false;
    let pendingSave = false;

    /* ============================== 数据清洗 ============================== */

    /**
     * 审核员名单：对象数组或纯字符串数组都认。
     * 字色（ink）没写就留空 → 渲染时用 CSS 的 --chip-ink 兜底。
     * ⚠ 写成纯字符串（老数据）时，底色/字色去 CFG.AUDITORS 里按名字找回来，
     *   否则会把颜色丢掉、全变成灰的。
     */
    function normalizeAuditors(list) {
        const arr = Array.isArray(list) ? list : [];
        const out = arr.map((a) => {
            const o = (a && typeof a === 'object') ? a : { name: a };
            const name = String(o.name || '').trim();
            const cfg = (CFG.AUDITORS || []).find((c) => c.name === name) || {};
            return {
                name,
                color: String(o.color || cfg.color || ''),
                ink: String(o.ink || cfg.ink || ''),
                // 一个字（安全审核的日历格子用）；留空 = 取名字第一个字
                short: String(o.short || cfg.short || '').slice(0, 1)
            };
        }).filter((a) => a.name);

        if (out.length) return out;
        return (CFG.AUDITORS || []).map((a) => ({
            name: a.name, color: a.color, ink: a.ink || '', short: a.short || ''
        }));
    }

    /** 一个单位的审核员名单（可多人）。
     *  新数据是 auditors 数组；老数据写的是单个的 lead 字符串，读进来转成数组。 */
    function unitAuditors(u) {
        const src = (u && u.auditors !== undefined) ? u.auditors : (u ? u.lead : '');
        if (Array.isArray(src)) return src.map((n) => String(n).trim()).filter(Boolean);
        if (src) return [String(src).trim()];
        return [];
    }

    /**
     * 附件清单的清洗：只要有 url 就算数，名字和大小缺了就给个默认值。
     * 结构：{ name: '现场照片.jpg', url: 'https://…/CheckQuestion/文件/….jpg', size: 123456 }
     */
    function normalizeFiles(list) {
        if (!Array.isArray(list)) return [];
        return list
            .filter((f) => f && (f.url || f.name))
            .map((f) => ({
                name: String(f.name || '附件'),
                url: String(f.url || ''),
                size: Number(f.size) || 0
            }))
            .filter((f) => f.url);
    }

    /** 附件大小：1024 以内报 B，其余 KB / MB 保留一位小数 */
    function sizeText(n) {
        const b = Number(n) || 0;
        if (b < 1024) return `${b} B`;
        if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
        return `${(b / 1024 / 1024).toFixed(1)} MB`;
    }

    /** 统一清洗数据：补默认值、丢掉无效项（和数据对不上的问题会被丢掉） */
    function normalize(raw) {
        const d = (raw && typeof raw === 'object') ? raw : {};

        const units = (Array.isArray(d.units) ? d.units : [])
            .filter((u) => u && (u.id || u.name))
            .map((u, i) => ({
                id: String(u.id || `unit-${i + 1}`),
                name: String(u.name || u.id || '未命名单位'),
                plan: normalizeMonth(u.plan),
                auditors: unitAuditors(u),
                // 「这次审核已经做完了」—— 单位自己一个状态，跟问题的 open/done 是两回事
                audited: !!u.audited,
                note: String(u.note || ''),
                // 单位的「情况说明」+ 相关附件（和问题那条一样的东西，只是挂在单位上）
                conclusion: String(u.conclusion || ''),
                files: normalizeFiles(u.files)
            }));

        const unitIds = new Set(units.map((u) => u.id));
        const levels = CFG.LEVELS || [];
        const sources = CFG.SOURCES || [];

        const issues = (Array.isArray(d.issues) ? d.issues : [])
            .filter((q) => q && q.unit && q.text && unitIds.has(String(q.unit)))
            .map((q, i) => ({
                id: String(q.id || `q-${i + 1}`),
                unit: String(q.unit),
                date: /^\d{4}-\d{2}-\d{2}$/.test(String(q.date || '')) ? String(q.date).slice(0, 10) : TODAY,
                level: levels.indexOf(q.level) >= 0 ? q.level : levels[0],
                source: sources.indexOf(q.source) >= 0 ? q.source : sources[0],
                by: String(q.by || ''),
                text: String(q.text || ''),
                detail: String(q.detail || ''),
                // 审核完成后的「审核情况说明」（去检查之后才填，平时是空的）
                conclusion: String(q.conclusion || ''),
                files: normalizeFiles(q.files),
                status: q.status === 'done' ? 'done' : 'open'
            }));

        return {
            theme: d.theme ? String(d.theme) : (themeParam() || 'Statutory Inspection'),
            title: titleFromData(d),
            updated: d.updated ? String(d.updated) : '',
            auditors: normalizeAuditors(d.auditors),
            units,
            issues
        };
    }

    /** 准备 PUT 回 OSS 的内容（就是 check-config.js 顶上文档里那个结构） */
    function serialize() {
        const d = state.data;
        return {
            theme: d.theme,
            title: d.title,
            updated: d.updated,
            auditors: d.auditors,
            units: d.units,
            issues: d.issues
        };
    }

    /** OSS 上什么都没有时用的「空白但有默认计划」的数据 */
    function defaultData() {
        return normalize({
            theme: themeParam() || 'Statutory Inspection',
            title: pageTitle(),
            updated: '',
            auditors: CFG.AUDITORS,
            units: CFG.UNITS,
            issues: []
        });
    }

    /** 连不上 OSS 时给人看的示例数据（只展示，不会自动上传） */
    function demoData() {
        const d = defaultData();
        const first = d.units[0] ? d.units[0].id : '';
        const second = d.units[1] ? d.units[1].id : first;
        d.issues = [
            {
                id: 'demo-1', unit: first, date: '2026-11-05', level: '重要',
                source: '日常观察', by: (d.auditors[3] || d.auditors[0] || {}).name || '',
                text: '排班出现连续夜航后紧接早班，见 11 月 3 日班表。',
                detail: '按《运行手册》第 X 章要求，值勤期后应保证最低休息时间。先记着，去检查时一并核。',
                status: 'open'
            },
            {
                id: 'demo-2', unit: second, date: '2026-11-18', level: '一般',
                source: '文件审查', by: (d.auditors[0] || {}).name || '',
                text: '上次检查发现项的整改验证记录里，缺了责任人签字。',
                detail: '', status: 'open'
            }
        ];
        return d;
    }

    /* ============================== OSS 读写 ============================== */

    /** 拼出数据文件的完整地址 */
    function resolveOssUrl() {
        const explicit = String(CFG.OSS_JSON_URL || '').trim();
        const base = String(CFG.OSS_BASE_URL || '').trim();
        const file = String(CFG.OSS_JSON_FILE || '').trim();
        if (explicit) return explicit;
        if (base && file) return base.replace(/\/+$/, '') + '/' + file.replace(/^\/+/, '');
        return '';
    }

    /** 把相对路径补成 OSS 上的完整地址 */
    function resolveAsset(path) {
        const p = String(path || '').trim();
        if (!p) return '';
        if (/^(https?:|data:|blob:|\/\/)/i.test(p)) return p;
        const base = String(CFG.OSS_BASE_URL || '').trim();
        if (!base) return p;
        return base.replace(/\/+$/, '') + '/' + p.replace(/^\/+/, '');
    }

    /**
     * 拼出「共用审核员名单」文件的地址。
     * 法定自查（CheckQuestion/）和安全审核（SafetyAudit/）是同一台 bucket 下的两个目录，
     * 这份名单两套系统**共用**，所以放在 bucket 根目录。
     * 优先级：CFG.OSS_ROSTER_URL（完整地址）> OSS_BASE_URL 的上一级 + OSS_ROSTER_FILE。
     */
    function resolveRosterUrl() {
        const explicit = String(CFG.OSS_ROSTER_URL || '').trim();
        if (explicit) return explicit;

        const base = String(CFG.OSS_BASE_URL || '').trim();
        const file = String(CFG.OSS_ROSTER_FILE || '').trim();
        if (!base || !file) return '';

        // 砍掉最后一段目录：…/CheckQuestion/ → …（bucket 根）
        const root = base.replace(/\/+$/, '').replace(/\/[^/]*$/, '');
        return `${root}/${file.replace(/^\/+/, '')}`;
    }

    /** 共用名单里的一条 → 本系统的字段（name / color / ink / short），没名字的丢掉 */
    function normalizeRosterList(list) {
        return (Array.isArray(list) ? list : [])
            .filter((a) => a && a.name)
            .map((a) => ({
                name: String(a.name).trim(),
                color: String(a.color || ''),
                ink: String(a.ink || ''),
                short: String(a.short || '').slice(0, 1)
            }))
            .filter((a) => a.name);
    }

    /**
     * 去把共用名单**取回来**（⚠ 只取，不碰 state）。
     *
     * 为什么拆成「取」和「套」两步：这样它能和主数据**同时发请求**，
     * 谁先回来都不会互相覆盖（不拆的话：名单先回来会被 state.data = 主数据 盖掉）。
     * 返回名单数组；没有这个文件 / 读失败就返回 null。
     */
    async function fetchRoster() {
        const url = resolveRosterUrl();
        if (!url) return null;

        let obj;
        try {
            obj = await fetchJson(url);
        } catch (e) {
            // 404 = 还没建过（正常，第一次改样式/加人才会建）
            const msg = String((e && e.message) || e);
            state.rosterError = /HTTP\s*404/.test(msg) ? '' : msg;
            return null;
        }

        const list = normalizeRosterList(obj && obj.auditors);
        return list.length ? list : null;
    }

    /** 把取回来的名单套上去。真的换了名单返回 true（调用方据此决定要不要重画）。 */
    function applyRoster(list) {
        if (!list || !list.length) return false;
        state.data.auditors = list;
        state.rosterLoaded = true;
        return true;
    }

    /**
     * 读「共用审核员名单」（取回来就套上，一次搞定）。
     *
     * ⚠ 只要这个文件存在、里面有人，就**以它为准** —— 它才是唯一真相。
     *   不然「在安全审核里加的人 / 改的颜色」在法定自查这边就不生效了。
     *   代价：往 check.json 里手写 auditors 是没用的（两边都以 审核员.json 为准）。
     *
     * ⚠ 启动流程**不走这个** —— 那样会把「取」和「套」绑成一步、又不能和主数据并行。
     *   启动走的是 fetchRoster() + applyRoster()，见 loadAll()。
     */
    async function loadRoster() {
        return applyRoster(await fetchRoster());
    }

    /**
     * 把当前名单写回「共用审核员名单」文件（两套系统都读它，所以写一份就够）。
     * 加了人 / 删了人 / 改了颜色字色单字 之后都要调它。
     * 写失败只是提示一句，不影响本地 —— 下次改动还会再试。
     */
    async function pushRoster() {
        const url = resolveRosterUrl();
        if (!url) return false;

        const now = new Date();
        const body = {
            updated: `${todayStr()} ${pad(now.getHours())}:${pad(now.getMinutes())}`,
            note: '安全审核 / 法定自查 共用的人员名单，两个系统都会读写这一份',
            auditors: (state.data.auditors || []).map((a) => {
                const o = { name: a.name, color: a.color || '' };
                if (a.ink) o.ink = a.ink;
                if (a.short) o.short = a.short;
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
            toast(`审核员名单没能同步到共用文件：${(e && e.message) || e}`);
            return false;
        }
    }

    async function fetchJson(url) {
        const finalUrl = CFG.NO_CACHE
            ? url + (url.indexOf('?') >= 0 ? '&' : '?') + '_t=' + Date.now()
            : url;
        const res = await fetch(finalUrl, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    }

    /**
     * 把单个文件 PUT 到 OSS 的 CheckQuestion/文件/ 下（匿名直传，不用密钥）。
     * 文件名前面加时间戳，不同人传同名文件也不会互相覆盖；
     * 返回记录用的 { name, url, size }，存进 issues[].files。
     */
    async function uploadFile(file) {
        const safe = String(file.name || 'file').replace(/[\\/:*?"<>|]/g, '_');
        const now = new Date();
        const t = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
            + `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
        const url = resolveAsset(`文件/${t}-${safe}`);

        const res = await fetch(url, {
            method: 'PUT',
            headers: { 'Content-Type': file.type || 'application/octet-stream' },
            body: file
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        return { name: String(file.name || safe), url, size: file.size || 0 };
    }

    /* ============================== 通用附件区 ============================== */

    /**
     * 一个「附件区」：画列表 + 选文件/拖放上传 + 去掉某个附件。
     * 现在两个地方用：记录/编辑问题（check-issues.js）、编辑受检单位（check-plan.js）。
     * 两边行为完全一样，所以抽在这里，别各写一份。
     *
     * 用法：
     *   const box = W.bindFileBox({
     *       list: 'u-file-list', zone: 'u-drop-zone', input: 'u-file-input', pick: 'u-pick',
     *       files: unit.files || []      // 初始附件（内部会拷一份，不直接改传进来的数组）
     *   });
     *   box.get()      // 保存时取当前附件数组
     *
     * ⚠ 上传是**立刻**发生的（PUT 到 OSS），但要点「保存」才挂到对象上 ——
     *   所以调用方必须在保存时把 box.get() 的结果写回数据。
     *   好处是：保存前就能看到传了哪些、也能去掉传错的；点取消只是不挂上去，文件仍在 OSS 上。
     */
    function bindFileBox(opt) {
        const o = opt || {};
        const files = (o.files || []).slice();

        const paint = () => {
            const box = $(o.list);
            if (!box) return;
            box.innerHTML = files.length
                ? files.map((f, i) => `
                    <div class="file-row">
                        <a class="file-name" href="${esc(f.url)}" target="_blank" rel="noopener">📄 ${esc(f.name)}</a>
                        <span class="file-size">${esc(sizeText(f.size))}</span>
                        <button type="button" class="file-del" data-i="${i}">✕</button>
                    </div>`).join('')
                : '<p class="hint" style="margin:0 0 8px">还没有上传附件</p>';
        };

        const handleFiles = async (list) => {
            const arr = Array.from(list || []).filter(Boolean);
            if (!arr.length) return;

            for (let i = 0; i < arr.length; i += 1) {
                const f = arr[i];
                toast(`正在上传 ${f.name}…（${i + 1}/${arr.length}）`);
                try {
                    // eslint-disable-next-line no-await-in-loop
                    const info = await uploadFile(f);
                    files.push(info);
                    paint();
                } catch (e) {
                    toast(`上传「${f.name}」失败：${(e && e.message) || e}`);
                    return;
                }
            }
            toast(`已上传 ${arr.length} 个附件（点「保存」才挂上去）`);
        };

        paint();

        // 等这次 openModal 的 innerHTML 落定再绑（调用方紧接着就会调它）
        setTimeout(() => {
            const zone = $(o.zone);
            const input = $(o.input);
            const list = $(o.list);
            const pick = $(o.pick);
            if (!zone || !input || !list || !pick) return;

            pick.addEventListener('click', () => input.click());
            input.addEventListener('change', () => {
                handleFiles(input.files);
                input.value = '';      // 同一个文件再选一次也能触发
            });

            zone.addEventListener('dragover', (e) => {
                e.preventDefault();
                zone.classList.add('is-over');
            });
            zone.addEventListener('dragleave', () => zone.classList.remove('is-over'));
            zone.addEventListener('drop', (e) => {
                e.preventDefault();
                zone.classList.remove('is-over');
                handleFiles(e.dataTransfer && e.dataTransfer.files);
            });

            // 去掉某个附件（绑在容器上，重画列表也不会丢）
            list.addEventListener('click', (e) => {
                const del = e.target.closest('.file-del');
                if (!del) return;
                files.splice(Number(del.getAttribute('data-i')), 1);
                paint();
            });
        }, 50);

        return { get: () => files, paint };
    }

    /**
     * 只有确实连得上 OSS（或确认是 404 新文件）才允许写回。
     * ⚠ 首屏那一下用的是浏览器里的**旧缓存**（cacheOnly），一律不许写回去 ——
     *   否则一个快速操作就可能把旧的整份数据盖到 OSS 上。
     */
    function canWrite() {
        if (state.cacheOnly) return false;
        return (state.source === 'oss') && !!resolveOssUrl();
    }

    function hasPendingSave() {
        return !!(saveTimer || saving);
    }

    /* ============================== 首屏缓存（先秒画上次的数据） ============================== */

    /*
     * 为什么要有它（2026-09-21 提速第二步）：
     * 从 OSS 要数据是一个完整的网络来回，跨区域可能几百毫秒到一两秒 ——
     * 这期间页面只能空着、或者拿「示例数据」顶着（以前就是后者）。
     * 所以把**上次成功读到的数据**存一份在浏览器里：打开先拿它秒画一屏，
     * 真正的数据一到就盖掉（stale-while-revalidate）。
     *
     * 代价：头几百毫秒看到的是上次的数据（比如刚删掉的那条又冒一下）。
     * 但比看示例数据强得多，而且时间短到一般注意不到。
     *
     * ⚠ 画缓存的那一下 `state.cacheOnly = true`，**不许保存**（见 canWrite）：
     *   不然一个快速操作就可能把旧数据整份写回 OSS。
     */
    const CACHE_KEY = 'checkquestion:cache';
    const CACHE_MAX = 600 * 1024;   // 超过这个大小就不存了（localStorage 一般就 5MB）

    /** 把当前数据存一份到浏览器（只在**确实从 OSS 读到/存过**之后调） */
    function saveCache() {
        try {
            const raw = JSON.stringify(serialize());
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

    /** 把一份数据画上去（首次启动要跑两遍：先缓存、后真数据，所以抽出来） */
    function paintData() {
        applyBackground();
        applyFont();

        // 默认看左边列表的**第一个受检单位**，不是「全部单位」（2026-09-21 用户要求）。
        // 这里要放在数据到位之后：不加载完不知道有哪几个单位。
        if (state.unit === '__all' && W.defaultUnitId) state.unit = W.defaultUnitId();

        if (W.render) W.render();
    }

    /**
     * 启动：把 OSS 上的数据读进来。
     * 注意 404 是**正常的**（第一次用，OSS 上还没有 check.json）：
     * 这时用默认计划，并且允许写回 —— 第一次保存就把文件建出来。
     */
    async function loadAll() {
        const url = resolveOssUrl();

        /*
         * ⚡ 这份名单的请求**现在就发**，和主数据同时出去（2026-09-21 提速）。
         * 原来是在主数据回来之后才 await 它 —— 白等一个完整来回：
         * 实测两个请求是串着的（check.json 123ms 走完，审核员.json 才开始）。
         * 它只是拿来盖审核员名单和颜色，不值得让整页等它。
         */
        const rosterP = fetchRoster();

        // ⚡ 先拿上次缓存的秒画一屏（真数据回来再盖掉）—— 见上面 saveCache 那段注释
        const cached = url ? readCache() : null;
        if (cached) {
            state.data = cached;
            state.source = 'oss';        // 先当正常，角标才不会闪一下「只读」
            state.cacheOnly = true;      // 但先不让保存（这份可能是旧的）
            paintData();
            updateBadge();               // source 是 oss 且不是新文件 → 角标直接藏掉
            setSaveState('idle');        // 也不显示「待保存 / 只读」那些
        }

        let oss = null;
        let err = '';
        let missing = false;

        if (url) {
            /*
             * 网络抖一下就重试一次（2026-09-21 补上，和 work 那边一个做法）——
             * 以前一失败就直接退示例数据 + 只读，得手动刷新才行。
             * 4xx（比如 404：还没建过这个文件）重试也没用，直接认。
             */
            for (let attempt = 0; attempt < 2; attempt += 1) {
                try {
                    oss = normalize(await fetchJson(url));
                    err = '';
                    break;
                } catch (e) {
                    err = (e && e.message) ? e.message : String(e);
                    if (/HTTP\s*404/.test(err)) {
                        missing = true;
                        err = '';
                        break;
                    }
                    if (/HTTP\s*4\d\d/.test(err)) break;
                    if (attempt === 0) await new Promise((r) => setTimeout(r, 600));
                }
            }

            if (/failed to fetch|networkerror|load failed/i.test(err)) {
                err += '（多数是 bucket 没配 CORS，或地址/网络不对）';
            }
        }

        state.ossError = err;
        state.cacheOnly = false;         // 真数据（或失败）已经有结论了，恢复正常的写权限判定

        if (oss) {
            state.data = oss;
            state.source = 'oss';
            state.ossNew = false;
            saveCache();                 // 读到了就更新缓存
        } else if (cached) {
            // 这次没读到，但手里有上次的数据 —— 就用它撑着，并且**只读**（别把旧的写回去）
            state.source = 'error';
            state.ossNew = false;
        } else if (missing) {
            state.data = defaultData();
            state.source = 'oss';
            state.ossNew = true;          // 可写：第一次保存会新建这个文件
        } else {
            state.data = demoData();
            state.source = url ? 'error' : 'demo';
            state.ossNew = false;
        }

        paintData();
        updateBadge();
        setSaveState(canWrite() ? 'idle' : 'paused');

        /*
         * 主数据画完了，再把名单套上去（不再让它挡首屏）。
         * 名单多半这时已经到了，then 会在同一个微任务批次里跑完 ——
         * 两种情况的屏幕表现都是「一次就画对」，不会看到颜色跳一下。
         */
        rosterP.then((list) => {
            if (applyRoster(list) && W.render) W.render();
        });
    }

    /** 有改动：先把更新时间戳盖上，再重画 + 自动上传 */
    function markChanged() {
        state.data.updated = stamp();
        if (W.render) W.render();
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

    /** 立刻把当前内容 PUT 覆盖到 OSS（不存在就新建） */
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
                body: JSON.stringify(serialize(), null, 2)
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            state.ossNew = false;
            saveCache();          // 存好了就顺手更新浏览器里那份首屏缓存
            updateBadge();
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

    /* ============================== 角标 / 保存状态 ============================== */

    function updateBadge() {
        const el = $('source-badge');
        if (!el) return;
        el.className = 'badge';
        el.title = '';

        // 一切正常就不挂这个标签（2026-09-21 用户要求：没异常就藏起来）——
        // 只有「还没建文件 / 用的是示例数据 / 读取失败」这几种**需要你留意的**才露出来。
        // 和安全审核那套同一个规矩（SafetyAudit/js/work-io.js 的 updateBadge）。
        el.hidden = false;

        if (state.source === 'oss') {
            if (state.ossNew) {
                el.classList.add('is-new');
                el.textContent = 'OSS · 待首次保存';
                el.title = 'OSS 上还没有这个数据文件，第一次改动会自动建出来';
            } else {
                el.classList.add('is-oss');
                el.textContent = 'OSS 数据';
                el.hidden = true;
            }
            return;
        }
        if (state.source === 'demo') {
            el.classList.add('is-demo');
            el.textContent = '示例数据（未连 OSS）';
            return;
        }
        el.classList.add('is-error');
        el.textContent = '读取失败 · 点此看原因';
        el.title = state.ossError || '';
    }

    function setSaveState(kind, detail) {
        state.saveState = kind;
        const el = $('save-state');
        if (!el) return;

        const map = {
            idle: '', pending: '待保存…', saving: '保存中…', saved: '✓ 已保存', error: '保存失败，点此重试'
        };
        if (kind === 'idle' || kind === 'paused') {
            el.hidden = true;
            el.className = 'badge save-state';
            el.textContent = kind === 'paused' ? '只读（未连 OSS）' : '';
            if (kind === 'paused') el.hidden = false;
            return;
        }

        el.hidden = false;
        el.className = 'badge save-state' + (kind === 'error' ? ' is-error' : (kind === 'saved' ? ' is-oss' : ''));
        el.textContent = map[kind] || '';
        el.title = detail || '';
        if (kind === 'saved') {
            clearTimeout(setSaveState.t);
            setSaveState.t = setTimeout(() => setSaveState('idle'), 1600);
        }
    }

    /* ============================== 导出 CSV ============================== */

    /** CSV 单元格：一律套双引号，内部的双引号翻倍（Excel 的通用写法） */
    const csvCell = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;

    /**
     * 下载一个 CSV。
     * @param {string} filename
     * @param {Array<Array<any>>} rows  第一行当表头
     * ⚠ 开头必须加 BOM（\uFEFF），否则 Excel 打开中文全是乱码；换行用 \r\n 才合 Excel 的胃口。
     */
    function downloadCsv(filename, rows) {
        const text = '\uFEFF' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
        const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }

    /* ============================== 轻提示 ============================== */

    let toastTimer = null;
    function toast(msg) {
        const el = $('toast');
        if (!el) return;
        el.textContent = msg;
        el.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
    }

    /* ============================== 弹层 ============================== */

    /** closeModal 那个「延时清空」的计时器，openModal 里要把它取消掉（见 openModal 的注释） */
    let hideTimer = null;

    /**
     * 打开通用弹层。
     * @param {{title:string, body:string, buttons:Array<{text,cls,onClick,spacer}>, size:string}} opt
     *        size 决定框有多大（CSS 里对应两个类）：
     *          'wide' = 930px  ——（暂时没人用，留着当中间档）
     *          'xl'   = 1488px ——「记录 / 编辑问题」和「问题详情」都是这个
     *        不传就是默认的 620px（编辑单位、导入 JSON、编辑样式这些）
     */
    function openModal(opt) {
        const o = opt || {};

        // ⚠ 一定要先把「关弹层的延时」取消掉：
        //   有的地方是 closeModal(); openModal(...); 连着调的（比如详情框点「✎ 编辑这条」），
        //   closeModal 那个 170ms 后才执行的隐藏如果不取消，
        //   就会把刚打开的弹层又藏起来 —— 看着就是「新弹层一闪就没了」（2026-09-21 修）。
        clearTimeout(hideTimer);

        $('modal-title').textContent = o.title || '编辑';
        $('modal-body').innerHTML = o.body || '';

        const card = document.querySelector('#modal .modal-card');
        if (card) {
            card.classList.toggle('is-wide', o.size === 'wide');
            card.classList.toggle('is-xl', o.size === 'xl');
        }

        const foot = $('modal-foot');
        foot.innerHTML = '';
        (o.buttons || []).forEach((b) => {
            if (b && b.spacer) {
                const sp = document.createElement('span');
                sp.className = 'spacer';
                foot.appendChild(sp);
                return;
            }
            const btn = document.createElement('button');
            btn.className = 'btn ' + (b.cls || '');
            btn.textContent = b.text;
            btn.addEventListener('click', b.onClick);
            foot.appendChild(btn);
        });

        const m = $('modal');
        m.hidden = false;
        requestAnimationFrame(() => m.classList.add('show'));
    }

    function closeModal() {
        const m = $('modal');
        if (!m || m.hidden) return;
        m.classList.remove('show');

        // 内容等淡出动画（0.16s）走完再清，
        // 这 170ms 的延时**必须记下来**，好让 openModal 把它取消掉
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => {
            m.hidden = true;
            $('modal-body').innerHTML = '';
            $('modal-foot').innerHTML = '';
        }, 170);
    }

    const isModalOpen = () => {
        const m = $('modal');
        return !!m && !m.hidden;
    };

    /* ============================== 亮 / 暗主题 ============================== */

    const THEME_KEY = 'checkquestion:theme';
    const currentTheme = () => (document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark');

    function applyTheme(t) {
        const theme = (t === 'light') ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', theme);
        lsSet(THEME_KEY, theme);
        const btn = $('btn-theme');
        if (btn) btn.textContent = theme === 'light' ? '☾ 暗色' : '☀ 亮色';
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute('content', theme === 'light' ? '#f0e8d5' : '#0f1114');
    }

    /**
     * 启动时定主题。
     * 浏览器里**没有记录**（第一次打开 / 清了数据）→ **默认亮色**；
     * 之后完全听记录的（选过暗色就回暗色）。
     * ⚠ 这套「没记录就亮色」的规矩和 check.html 里那段提前套主题的脚本必须一致，
     *   否则会先闪一下再变。
     */
    function initTheme() {
        const saved = lsGet(THEME_KEY);
        applyTheme(saved === 'dark' ? 'dark' : 'light');
    }

    /* ============================== 背景海报 / 字体 ============================== */

    function applyBackground() {
        const url = (params.get('poster') || '').trim();
        const bg = $('bg');
        if (!bg) return;
        if (url) bg.style.backgroundImage = `url("${url.replace(/"/g, '%22')}")`;
    }

    function applyFont() {
        const family = String(CFG.FONT_FAMILY || '').trim();
        if (family) document.documentElement.style.setProperty('--font', family);

        // 网络字体（放 OSS 上）：注册 @font-face 并排到最前面
        const url = String(CFG.FONT_URL || '').trim();
        if (!url) return;
        try {
            const abs = resolveAsset(url);
            const st = document.createElement('style');
            st.textContent = `@font-face{font-family:"CheckWebFont";src:url("${abs}");font-display:swap;}`;
            document.head.appendChild(st);
            document.documentElement.style.setProperty('--font', `"CheckWebFont", ${family || 'sans-serif'}`);
        } catch (e) { /* 字体只是好看，失败不影响用 */ }
    }

    /* ============================== 挂到命名空间 ============================== */

    Object.assign(W, {
        CFG, state, params,
        $, esc, pad, uid, TODAY, todayStr, stamp,
        lsGet, lsSet, themeParam, titleParam, pageTitle, titleFromData, STD_TITLE,

        normalizeMonth, monthLabel, daysToPlan, planText, planSoon,
        unitAuditors, auditorOf, auditorColor, auditorInk, auditorShort, auditorStyle, defaultChipInk,
        levelClass, isImageUrl, csvCell, downloadCsv,
        normalizeFiles, sizeText,

        normalize, serialize, defaultData, demoData,
        saveCache, readCache, clearCache, CACHE_KEY,
        resolveOssUrl, resolveAsset, fetchJson, uploadFile, bindFileBox,
        // 和安全审核共用的审核员名单（审核员.json）
        resolveRosterUrl, normalizeRosterList, fetchRoster, applyRoster, loadRoster, pushRoster,
        canWrite, hasPendingSave, loadAll, markChanged, scheduleSave, uploadNow,
        updateBadge, setSaveState,
        initView, setView,

        toast, openModal, closeModal, isModalOpen,
        applyTheme, currentTheme, initTheme,
        applyBackground, applyFont
    });
})(window.Check = window.Check || {});
