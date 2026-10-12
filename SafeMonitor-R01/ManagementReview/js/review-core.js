/**
 * 管理评审系统（1/4）基础层
 * ==================================================================
 * 状态、小工具、云端读写（含自动上传）、弹层、轻提示、亮暗主题。
 * 业务界面在 review-items.js（项目闭环）和 review-board.js（六步看板）。
 * ==================================================================
 */

(function (W) {
    'use strict';

    /** 配置：以 review-config.js 里的为准，缺什么补什么 */
    const CFG = Object.assign({
        OSS_BASE_URL: '',
        OSS_JSON_FILE: 'review.json',
        OSS_JSON_URL: '',
        NO_CACHE: true,
        FALLBACK_ENABLED: true,
        OSS_AUTO_SAVE: true,
        OSS_SAVE_DEBOUNCE: 800,
        FONT_FAMILY: '',
        FONT_URL: '',
        DEPARTMENTS: [],
        LEVELS: ['普通', '重要', '严重'],
        LEVEL_PREFIX: {},
        LEVEL_ALIAS: {},
        NO_PREFIX_ALIAS: {},
        LEVEL_FIRST_STAGE_DEPT: {},
        SOURCES: ['其他'],
        STAGES: [],
        RESPONSIBLES: [],
        ITEMS: []
    }, window.REVIEW_CONFIG || {});

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
     * **固定就是这一句**，不用轮播页传过来的 title（那是轮播页上两行字的拼法）。
     */
    const STD_TITLE = '管理复盘 · 事件协同闭环管理';
    const pageTitle = () => STD_TITLE;

    /**
     * 以前用过的标准标题。
     * ⚠ 数据（OSS 上 review.json）里也存了一份 title，会**盖住**页面写死的标题；
     *   所以改了 STD_TITLE 之后，OSS 里存着的旧标准标题要在这换掉，
     *   否则刷新出来还是旧的（这就是“改了没用”的原因）。
     */
    const LEGACY_TITLES = ['管理评审 · 非396重点QAR多部门闭环'];

    /**
     * 从数据里取标题。
     * 旧标准标题 → 换成新标准标题；
     * 老数据里存的标题若以轮播页传的标题开头，也换成标准标题；
     * 如果是**手改过 JSON 里的 title**（既不是 URL 那串、也不是旧标准标题），就尊重手改的。
     */
    function titleFromData(d) {
        const t = String((d && d.title) || '').trim();
        if (!t) return STD_TITLE;
        const fromUrl = titleParam();
        if (fromUrl && t.indexOf(fromUrl) === 0) return STD_TITLE;
        if (LEGACY_TITLES.indexOf(t) >= 0) return STD_TITLE;
        return t;
    }

    /* ============================== 日期 ============================== */

    /** 是不是 YYYY-MM-DD */
    const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));

    /** '2026-09-12' → '2026-09-12'（不合法就空串） */
    const dateText = (v) => (isDate(v) ? String(v).slice(0, 10) : '');

    /* ============================== 部门 / 阶段 ============================== */

    /** 在「当前生效的部门名单」里找这个部门 */
    function deptOf(name) {
        const n = String(name || '');
        return (state.data.departments || []).find((d) => d.name === n)
            || (CFG.DEPARTMENTS || []).find((d) => d.name === n)
            || null;
    }

    /** 部门牌子底色 */
    function deptColor(name) {
        const hit = deptOf(name);
        return (hit && hit.color) || '#6b7280';
    }

    /** 部门名字牌子的一整串 inline style（底色 + 统一亮蓝字色） */
    function deptStyle(name) {
        return `background:${deptColor(name)};color:var(--chip-ink)`;
    }

    /** 六步定义：按 key 找 */
    function stageDef(key) {
        return (CFG.STAGES || []).find((s) => s.key === key) || null;
    }

    /** 六步定义（按顺序） */
    function stageDefs() {
        return (CFG.STAGES || []).slice();
    }

    /**
     * 新建项目时各步的**默认负责部门**。
     * 除第一步（调查）外都用 STAGES 里的 dept；「调查」按级别区分：
     * QAR事件 → 运技部，396事件 → 安监部（见 CFG.LEVEL_FIRST_STAGE_DEPT）。
     */
    function stageDefaultDepts(level) {
        const map = CFG.LEVEL_FIRST_STAGE_DEPT || {};
        return (CFG.STAGES || []).map((d, i) => ((i === 0 && map[level]) ? map[level] : d.dept));
    }

    /** 阶段状态 → 中文 */
    const STAGE_STATUS = { todo: '未开始', doing: '进行中', done: '已完成' };
    const stageStatusText = (s) => STAGE_STATUS[s] || '未开始';

    /**
     * 情况说明清洗。
     * 一步可以有**多条**情况说明，每条带自己的部门 / 办理人 / 日期 / 附件：
     *   { dept, by, date, text, files: [{name,url,size}] }
     * 老数据只有单条 note + by，阶段级还有一份 files，读进来都迁进情况说明里。
     */
    function normalizeNotes(st) {
        const arr = Array.isArray(st && st.notes) ? st.notes : [];
        const out = arr.map((n) => ({
            dept: String((n && n.dept) || ''),
            by: String((n && n.by) || ''),
            date: isDate(n && n.date) ? String(n.date).slice(0, 10) : '',
            text: String((n && n.text) || ''),
            files: normalizeFiles(n && n.files)
        })).filter((n) => n.text || n.by || n.files.length);

        // 老数据：单条 note / by → 迁成一条情况说明
        if (!out.length && st && (st.note || st.by)) {
            out.push({
                dept: String(st.dept || ''),
                by: String(st.by || ''),
                date: isDate(st.date) ? String(st.date).slice(0, 10) : '',
                text: String(st.note || ''),
                files: []
            });
        }

        // 老数据：步骤级的那份附件 → 归到第一条情况说明上（别丢了）
        const legacyFiles = normalizeFiles(st && st.files);
        if (legacyFiles.length) {
            if (!out.length) {
                out.push({ dept: String((st && st.dept) || ''), by: '', date: '', text: '', files: legacyFiles });
            } else {
                const have = new Set(out[0].files.map((f) => f.url));
                legacyFiles.forEach((f) => { if (!have.has(f.url)) out[0].files.push(f); });
            }
        }
        return out;
    }

    /** 一个项目的六步（按 STAGES 顺序补齐缺失的步骤） */
    function itemStages(item) {
        const have = Array.isArray(item && item.stages) ? item.stages : [];
        return (CFG.STAGES || []).map((def) => {
            const hit = have.find((s) => s && s.key === def.key) || {};
            return {
                key: def.key,
                status: (hit.status === 'doing' || hit.status === 'done') ? hit.status : 'todo',
                date: isDate(hit.date) ? String(hit.date).slice(0, 10) : '',
                dept: String(hit.dept || def.dept || ''),
                notes: normalizeNotes(hit)
            };
        });
    }

    /** 已完成几步 / 共几步 */
    function itemProgress(item) {
        const st = itemStages(item);
        const done = st.filter((s) => s.status === 'done').length;
        return { done, total: st.length, pct: st.length ? Math.round((done / st.length) * 100) : 0 };
    }

    /** 当前正在推进的那一步（第一个未完成的；都完成就是 null） */
    function currentStage(item) {
        return itemStages(item).find((s) => s.status !== 'done') || null;
    }

    /** 项目是不是已经整体闭环（六步全完成） */
    const itemClosed = (item) => itemStages(item).every((s) => s.status === 'done');

    /** 级别 chip 的 class（第 1 档=lv-1 第 2 档=lv-2 …） */
    function levelClass(level) {
        const i = (CFG.LEVELS || []).indexOf(level);
        return `lv-${i >= 0 ? i + 1 : 1}`;
    }

    /** 级别换算是「从轻到重」的三档：普通 → 重要 → 严重
        老数据里叫 QAR事件 / 396事件 的，按 CFG.LEVEL_ALIAS 换算（见 review-config.js） */
    function normalizeLevel(v) {
        const levels = CFG.LEVELS || [];
        const s = String(v == null ? '' : v).trim();
        if (levels.indexOf(s) >= 0) return s;
        const to = (CFG.LEVEL_ALIAS || {})[s];
        if (to && levels.indexOf(to) >= 0) return to;
        return levels[0];
    }

    /** 级别 → 自动编号前缀（普通 → 普通，重要 → 重要，严重 → 严重） */
    function levelPrefix(level) {
        const map = CFG.LEVEL_PREFIX || {};
        return map[level] || String(level || '') || (CFG.LEVELS || [])[0] || '';
    }

    /** 编号跟着级别走：老编号 QAR-2026-01 → 重要-2026-01、396-2026-01 → 严重-2026-01
        （只换认得出的老前缀，其余编号原样不动，用户自己改过的编号不会被覆盖） */
    function alignNo(no, level) {
        const s = String(no == null ? '' : no).trim();
        // 「前缀-年份-序号」，序号几位都行（QAR-2026-01 / QAR-2026-002 都认）
        const m = s.match(/^([A-Za-z0-9\u4e00-\u9fa5]+)-(\d{4}-\d+)$/);
        if (!m) return s;
        if (!(CFG.NO_PREFIX_ALIAS || {})[m[1]]) return s;      // 不是老前缀就不动
        const head = levelPrefix(level);
        return head ? `${head}-${m[2]}` : s;
    }


    /** 是不是能在浏览器里直接看的图片（决定要不要出缩略图 / 悬停预览） */
    const isImageUrl = (url) => /\.(png|jpe?g|gif|webp|bmp|svg|avif)(\?|#|$)/i.test(url || '');

    /* ============================== 看哪个视图 ============================== */

    /*
     * 「项目闭环」还是「六步看板」要**记住**（存 localStorage），
     * 刷新（或从别处重新进来）还在那一页。
     */
    const VIEW_KEY = 'managementreview:view';

    /** 启动时按记录决定看哪一页（没记录就是项目闭环） */
    function initView() {
        state.view = lsGet(VIEW_KEY) === 'board' ? 'board' : 'items';
    }

    /** 切视图（并记住）。★ 所有改 state.view 的地方都走这里，别直接赋值 */
    function setView(v) {
        state.view = (v === 'board') ? 'board' : 'items';
        lsSet(VIEW_KEY, state.view);
    }

    /* ============================== 状态 ============================== */

    const state = {
        data: {
            theme: '', title: '', updated: '',
            departments: [], items: []
        },
        view: 'items',       // items = 项目闭环 | board = 六步看板
        item: '',            // 正在看哪个项目（id）；'' = 第一个
        query: '',           // 项目列表里的搜索词
        level: '',           // 「只看某个级别（QAR事件 / 396事件）」，'' = 不过滤
        source: 'demo',      // oss | demo | error
        ossNew: false,       // OSS 上还没有这个文件（第一次保存会建出来）
        cacheOnly: false,    // 现在画的是浏览器里的旧缓存（真数据还没回来）
        ossError: '',
        rosterLoaded: false, // （保留位，本系统不用共用名单）
        rosterError: '',
        saveState: 'idle'    // idle | pending | saving | saved | error | paused
    };

    let saveTimer = null;
    let saving = false;
    let pendingSave = false;

    /* ============================== 数据清洗 ============================== */

    /*
     * 部门名单：对象数组或纯字符串都认。
     * color 没写就去 CFG.DEPARTMENTS 里按名字找回来，否则牌子会变灰。
     */
    function normalizeDepartments(list) {
        const arr = Array.isArray(list) ? list : [];
        const out = arr.map((d) => {
            const o = (d && typeof d === 'object') ? d : { name: d };
            const name = String(o.name || '').trim();
            const cfg = (CFG.DEPARTMENTS || []).find((c) => c.name === name) || {};
            return { name, color: String(o.color || cfg.color || ''), note: String(o.note || cfg.note || '') };
        }).filter((d) => d.name);

        if (out.length) return out;
        return (CFG.DEPARTMENTS || []).map((d) => ({ name: d.name, color: d.color || '', note: d.note || '' }));
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

    /** 统一清洗数据：补默认值、丢掉无效项 */
    function normalize(raw) {
        const d = (raw && typeof raw === 'object') ? raw : {};
        const sources = CFG.SOURCES || [];

        const departments = normalizeDepartments(d.departments);
        const deptNames = new Set(departments.map((x) => x.name));

        const items = (Array.isArray(d.items) ? d.items : [])
            .filter((it) => it && (it.id || it.title))
            .map((it, i) => {
                const stages = itemStages({ stages: it.stages });
                const open = stages.some((s) => s.status !== 'done');
                const level = normalizeLevel(it.level);          // 老档次（QAR事件/396事件）自动换算
                const no = alignNo(it.no, level);                // 编号前缀跟着级别走

                return {
                    id: String(it.id || `qar-${i + 1}`),
                    no,
                    title: String(it.title || '未命名项目'),
                    level,
                    source: sources.indexOf(it.source) >= 0 ? it.source : sources[0],
                    date: isDate(it.date) ? String(it.date).slice(0, 10) : TODAY,
                    flight: String(it.flight || ''),
                    aircraft: String(it.aircraft || ''),
                    // 牵头部门默认取名单第一个（安监部）
                    lead: deptNames.has(String(it.lead)) ? String(it.lead) : (departments[0] ? departments[0].name : ''),
                    owner: String(it.owner || ''),
                    desc: String(it.desc || ''),
                    // 整体状态：六步全完成自动算「已闭环」；手写的 done 也认
                    status: (it.status === 'done' || !open) ? 'done' : 'open',
                    stages
                };
            });

        return {
            theme: d.theme ? String(d.theme) : (themeParam() || 'Management Evaluation'),
            title: titleFromData(d),
            updated: d.updated ? String(d.updated) : '',
            departments,
            items
        };
    }

    /** 准备 PUT 回 OSS 的内容（就是 review-config.js 顶上文档里那个结构） */
    function serialize() {
        const d = state.data;
        return {
            theme: d.theme,
            title: d.title,
            updated: d.updated,
            departments: d.departments,
            items: d.items
        };
    }

    /** OSS 上什么都没有时用的「空白但有默认项目」的数据 */
    function defaultData() {
        return normalize({
            theme: themeParam() || 'Management Evaluation',
            title: pageTitle(),
            updated: '',
            departments: CFG.DEPARTMENTS,
            items: CFG.ITEMS
        });
    }

    /** 连不上 OSS 时给人看的示例数据（只展示，不会自动上传） */
    function demoData() {
        return defaultData();
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
     * 把单个文件 PUT 到 OSS 的 ManagementReview/文件/ 下（匿名直传，不用密钥）。
     * 文件名前面加时间戳，不同人传同名文件也不会互相覆盖；
     * 返回记录用的 { name, url, size }，存进 items[].stages[].files。
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
    const CACHE_KEY = 'managementreview:cache';
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

        // 默认看左边列表的**第一个项目**
        if (!state.item && state.data.items[0]) state.item = state.data.items[0].id;

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
                err += '（多数是云端没配跨域，或地址/网络不对）';
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
                el.textContent = '待首次上传';
                el.title = '还没有数据文件，第一次改动会自动上传';
            } else {
                el.classList.add('is-oss');
                el.textContent = '数据已上传';
                el.hidden = true;
            }
            return;
        }
        if (state.source === 'demo') {
            el.classList.add('is-demo');
            el.textContent = '示例数据（未连接）';
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
            idle: '', pending: '待上传…', saving: '上传中…', saved: '✓ 数据已上传', error: '上传失败，点此重试'
        };
        if (kind === 'idle' || kind === 'paused') {
            el.hidden = true;
            el.className = 'badge save-state';
            el.textContent = kind === 'paused' ? '只读（未连接）' : '';
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

    /* ============================== 导出 Excel（.xlsx） ============================== */

    /*
     * 为什么自己拼：这个系统跑在纯浏览器里，不能装 npm 包；引 CDN 又怕国内打不开、断网就废。
     * 其实 xlsx 就是个 zip，里面装几个 xml。这里只做「不压缩（store）」的 zip，
     * Excel 完全认；单元格一律 inlineStr（省掉 sharedStrings，少一堆代码）。
     */

    /** CRC32 查表（zip 每个文件头都要它） */
    const CRC_TABLE = (() => {
        const t = new Uint32Array(256);
        for (let n = 0; n < 256; n += 1) {
            let c = n;
            for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
            t[n] = c >>> 0;
        }
        return t;
    })();

    function crc32(u8) {
        let c = 0xFFFFFFFF;
        for (let i = 0; i < u8.length; i += 1) c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
        return (c ^ 0xFFFFFFFF) >>> 0;
    }

    const utf8 = new TextEncoder();

    /** xml 里的特殊字符转义 */
    const encXml = (s) => String(s == null ? '' : s)
        .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

    /** 列号：0 → A，25 → Z，26 → AA */
    function colRef(i) {
        let s = '';
        let n = i;
        do {
            s = String.fromCharCode(65 + (n % 26)) + s;
            n = Math.floor(n / 26) - 1;
        } while (n >= 0);
        return s;
    }

    /**
     * 把 [{ name, data:Uint8Array }] 打成 zip（store，不压缩）。
     * 就是 xlsx 的空壳；结构按 zip 规范来：本地头 + 数据 + 中央目录 + EOCD。
     */
    function zipStore(files) {
        const now = new Date();
        const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xFFFF;
        const dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xFFFF;

        const u16 = (v) => [v & 0xFF, (v >>> 8) & 0xFF];
        const u32 = (v) => [v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF];

        const chunks = [];
        const central = [];
        let offset = 0;

        files.forEach((f) => {
            const nameBytes = utf8.encode(f.name);
            const data = f.data;
            const crc = crc32(data);

            const local = [].concat(
                u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(dosTime), u16(dosDate),
                u32(crc), u32(data.length), u32(data.length), u16(nameBytes.length), u16(0)
            );

            chunks.push(new Uint8Array(local), nameBytes, data);

            central.push({
                head: [].concat(
                    u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(dosTime), u16(dosDate),
                    u32(crc), u32(data.length), u32(data.length), u16(nameBytes.length),
                    u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset)
                ),
                name: nameBytes
            });
            offset += local.length + nameBytes.length + data.length;
        });

        const cdStart = offset;
        let cdSize = 0;
        central.forEach((c) => {
            chunks.push(new Uint8Array(c.head), c.name);
            cdSize += c.head.length + c.name.length;
        });

        chunks.push(new Uint8Array([].concat(
            u32(0x06054b50), u16(0), u16(0), u16(central.length), u16(central.length),
            u32(cdSize), u32(cdStart), u16(0)
        )));

        return new Blob(chunks, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    }

    /** 一张工作表：第一行当表头（加粗 + 冻结），widths 是各列宽度（可选） */
    function sheetXml(rows, widths) {
        const cols = (widths && widths.length)
            ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
            : '';

        const body = (rows || []).map((row, ri) => {
            const cells = (row || []).map((v, ci) => {
                const s = String(v == null ? '' : v);
                if (!s) return '';
                const style = ri === 0 ? ' s="1"' : '';
                return `<c r="${colRef(ci)}${ri + 1}"${style} t="inlineStr"><is><t xml:space="preserve">${encXml(s)}</t></is></c>`;
            }).join('');
            return `<row r="${ri + 1}">${cells}</row>`;
        }).join('');

        const lastRow = (rows || []).length || 1;
        const lastCol = (rows && rows.length)
            ? colRef(Math.max.apply(null, rows.map((r) => (r || []).length)) - 1)
            : 'A';

        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            + `<dimension ref="A1:${lastCol}${lastRow}"/>`
            + '<sheetViews><sheetView workbookViewId="0">'
            + '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>'
            + '</sheetView></sheetViews>'
            + cols
            + `<sheetData>${body}</sheetData>`
            + '</worksheet>';
    }

    /** 两个字体：0 = 常规，1 = 加粗（表头用） */
    const STYLES_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        + '<fonts count="2">'
        + '<font><sz val="11"/><name val="宋体"/></font>'
        + '<font><b/><sz val="11"/><name val="宋体"/></font>'
        + '</fonts>'
        + '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
        + '<borders count="1"><border/></borders>'
        + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
        + '<cellXfs count="2">'
        + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
        + '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
        + '</cellXfs>'
        + '<cellStyles count="1"><cellStyle name="常规" xfId="0" builtinId="0"/></cellStyles>'
        + '</styleSheet>';

    /**
     * 下载一个 xlsx。
     * @param {string} filename
     * @param {Array<{name:string, rows:Array<Array<any>>, widths?:number[]}>} sheets
     *        name 是工作表名（Excel 限制 ≤31 字、不能含 []:*?/\ ），rows 第一行当表头
     */
    function downloadXlsx(filename, sheets) {
        const list = (sheets || []).filter((s) => s && s.name);
        if (!list.length) return;

        const parts = [];

        parts.push({
            name: '[Content_Types].xml',
            data: utf8.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
                + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
                + '<Default Extension="xml" ContentType="application/xml"/>'
                + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
                + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
                + list.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
                + '</Types>')
        });

        parts.push({
            name: '_rels/.rels',
            data: utf8.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
                + '</Relationships>')
        });

        parts.push({
            name: 'xl/workbook.xml',
            data: utf8.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
                + '<sheets>'
                + list.map((s, i) => `<sheet name="${encXml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')
                + '</sheets></workbook>')
        });

        parts.push({
            name: 'xl/_rels/workbook.xml.rels',
            data: utf8.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                + list.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
                + `<Relationship Id="rId${list.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`
                + '</Relationships>')
        });

        list.forEach((s, i) => {
            parts.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: utf8.encode(sheetXml(s.rows, s.widths)) });
        });

        parts.push({ name: 'xl/styles.xml', data: utf8.encode(STYLES_XML) });

        const blob = zipStore(parts);
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
     * @param {{title:string, body:string, buttons:Array<{text,cls,onClick,spacer}>, size:string, tall:boolean}} opt
     *        size 决定框有多大（CSS 里对应两个类）：
     *          'wide' = 930px  ——（暂时没人用，留着当中间档）
     *          'xl'   = 1488px ——「新建 / 编辑项目」和「编辑某一步」都是这个
     *        不传就是默认的 620px。
     *        tall = true：再高一点、尽量占满屏（六步「具体内容」的编辑框用，见 .is-tall）
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
            card.classList.toggle('is-tall', !!o.tall);
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

    const THEME_KEY = 'managementreview:theme';
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

        isDate, dateText,
        deptOf, deptColor, deptStyle, stageDef, stageDefs, stageStatusText, STAGE_STATUS,
        stageDefaultDepts,
        itemStages, itemProgress, currentStage, itemClosed, normalizeNotes,
        levelClass, levelPrefix, normalizeLevel, isImageUrl, csvCell, downloadCsv, downloadXlsx,
        normalizeFiles, sizeText,

        normalize, serialize, defaultData, demoData,
        saveCache, readCache, clearCache, CACHE_KEY,
        resolveOssUrl, resolveAsset, fetchJson, uploadFile, bindFileBox,
        canWrite, hasPendingSave, loadAll, markChanged, scheduleSave, uploadNow,
        updateBadge, setSaveState,
        initView, setView,

        toast, openModal, closeModal, isModalOpen,
        applyTheme, currentTheme, initTheme,
        applyBackground, applyFont
    });
})(window.Review = window.Review || {});
