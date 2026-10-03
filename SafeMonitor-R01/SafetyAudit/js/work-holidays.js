/**
 * 法定节假日 / 调休数据（中国大陆）
 * ==================================================================
 * 只给「日历模式」区分「法定放假（淡红 + 节日名）」和「调休上班（写 XX调班）」用，
 * 不参与任何计算。
 *
 * 数据结构：{ 日期: { off: true = 放假 / false = 调休上班, name: 节日名 } }
 *   · 表里没有的日期就是普通工作日，日历上不额外标记；
 *   · 周末放假是日历自己就能算出来的，这里只写「国家规定的假期」和「补班」。
 *
 * 想补后面的年份：跑一下同目录的 _gen_holidays.py 重新生成即可
 * （数据来自国务院办公厅放假通知，经 holiday-cn 整理）。
 *
 * 但**不用指望它自己变新**：这只是一份打包时的快照。国办的放假通知一般是
 * 前一年 11 月才发（2027 年的通知要到 2026 年 11 月），没公布的年份只能是空的。
 * 所以文件末尾还有一层「更新节假日」：**用户点工具栏的按钮**才去网上拉一次，
 * 更新过之后会缓存在浏览器里，刷新页面还在。详见文件末尾的注释。
 * ==================================================================
 */

window.WORK_HOLIDAYS = {
    "2024-01-01": { off: true , name: "元旦" },
    "2024-02-04": { off: false, name: "春节" },
    "2024-02-10": { off: true , name: "春节" },
    "2024-02-11": { off: true , name: "春节" },
    "2024-02-12": { off: true , name: "春节" },
    "2024-02-13": { off: true , name: "春节" },
    "2024-02-14": { off: true , name: "春节" },
    "2024-02-15": { off: true , name: "春节" },
    "2024-02-16": { off: true , name: "春节" },
    "2024-02-17": { off: true , name: "春节" },
    "2024-02-18": { off: false, name: "春节" },
    "2024-04-04": { off: true , name: "清明节" },
    "2024-04-05": { off: true , name: "清明节" },
    "2024-04-06": { off: true , name: "清明节" },
    "2024-04-07": { off: false, name: "清明节" },
    "2024-04-28": { off: false, name: "劳动节" },
    "2024-05-01": { off: true , name: "劳动节" },
    "2024-05-02": { off: true , name: "劳动节" },
    "2024-05-03": { off: true , name: "劳动节" },
    "2024-05-04": { off: true , name: "劳动节" },
    "2024-05-05": { off: true , name: "劳动节" },
    "2024-05-11": { off: false, name: "劳动节" },
    "2024-06-10": { off: true , name: "端午节" },
    "2024-09-14": { off: false, name: "中秋节" },
    "2024-09-15": { off: true , name: "中秋节" },
    "2024-09-16": { off: true , name: "中秋节" },
    "2024-09-17": { off: true , name: "中秋节" },
    "2024-09-29": { off: false, name: "国庆节" },
    "2024-10-01": { off: true , name: "国庆节" },
    "2024-10-02": { off: true , name: "国庆节" },
    "2024-10-03": { off: true , name: "国庆节" },
    "2024-10-04": { off: true , name: "国庆节" },
    "2024-10-05": { off: true , name: "国庆节" },
    "2024-10-06": { off: true , name: "国庆节" },
    "2024-10-07": { off: true , name: "国庆节" },
    "2024-10-12": { off: false, name: "国庆节" },
    "2025-01-01": { off: true , name: "元旦" },
    "2025-01-26": { off: false, name: "春节" },
    "2025-01-28": { off: true , name: "春节" },
    "2025-01-29": { off: true , name: "春节" },
    "2025-01-30": { off: true , name: "春节" },
    "2025-01-31": { off: true , name: "春节" },
    "2025-02-01": { off: true , name: "春节" },
    "2025-02-02": { off: true , name: "春节" },
    "2025-02-03": { off: true , name: "春节" },
    "2025-02-04": { off: true , name: "春节" },
    "2025-02-08": { off: false, name: "春节" },
    "2025-04-04": { off: true , name: "清明节" },
    "2025-04-05": { off: true , name: "清明节" },
    "2025-04-06": { off: true , name: "清明节" },
    "2025-04-27": { off: false, name: "劳动节" },
    "2025-05-01": { off: true , name: "劳动节" },
    "2025-05-02": { off: true , name: "劳动节" },
    "2025-05-03": { off: true , name: "劳动节" },
    "2025-05-04": { off: true , name: "劳动节" },
    "2025-05-05": { off: true , name: "劳动节" },
    "2025-05-31": { off: true , name: "端午节" },
    "2025-06-01": { off: true , name: "端午节" },
    "2025-06-02": { off: true , name: "端午节" },
    "2025-09-28": { off: false, name: "国庆节、中秋节" },
    "2025-10-01": { off: true , name: "国庆节、中秋节" },
    "2025-10-02": { off: true , name: "国庆节、中秋节" },
    "2025-10-03": { off: true , name: "国庆节、中秋节" },
    "2025-10-04": { off: true , name: "国庆节、中秋节" },
    "2025-10-05": { off: true , name: "国庆节、中秋节" },
    "2025-10-06": { off: true , name: "国庆节、中秋节" },
    "2025-10-07": { off: true , name: "国庆节、中秋节" },
    "2025-10-08": { off: true , name: "国庆节、中秋节" },
    "2025-10-11": { off: false, name: "国庆节、中秋节" },

    // ===== 2026（当年，日历主要用这一段）=====
    "2026-01-01": { off: true , name: "元旦" },
    "2026-01-02": { off: true , name: "元旦" },
    "2026-01-03": { off: true , name: "元旦" },
    "2026-01-04": { off: false, name: "元旦" },
    "2026-02-14": { off: false, name: "春节" },
    "2026-02-15": { off: true , name: "春节" },
    "2026-02-16": { off: true , name: "春节" },
    "2026-02-17": { off: true , name: "春节" },
    "2026-02-18": { off: true , name: "春节" },
    "2026-02-19": { off: true , name: "春节" },
    "2026-02-20": { off: true , name: "春节" },
    "2026-02-21": { off: true , name: "春节" },
    "2026-02-22": { off: true , name: "春节" },
    "2026-02-23": { off: true , name: "春节" },
    "2026-02-28": { off: false, name: "春节" },
    "2026-04-04": { off: true , name: "清明节" },
    "2026-04-05": { off: true , name: "清明节" },
    "2026-04-06": { off: true , name: "清明节" },
    "2026-05-01": { off: true , name: "劳动节" },
    "2026-05-02": { off: true , name: "劳动节" },
    "2026-05-03": { off: true , name: "劳动节" },
    "2026-05-04": { off: true , name: "劳动节" },
    "2026-05-05": { off: true , name: "劳动节" },
    "2026-05-09": { off: false, name: "劳动节" },
    "2026-06-19": { off: true , name: "端午节" },
    "2026-06-20": { off: true , name: "端午节" },
    "2026-06-21": { off: true , name: "端午节" },
    // 2026 中秋 (9/25~27) 和国庆 (10/1~7) 是分开的，中间 9/28~30 要上班
    "2026-09-20": { off: false, name: "国庆节" },   // 周日补班
    "2026-09-25": { off: true , name: "中秋节" },
    "2026-09-26": { off: true , name: "中秋节" },
    "2026-09-27": { off: true , name: "中秋节" },
    "2026-10-01": { off: true , name: "国庆节" },
    "2026-10-02": { off: true , name: "国庆节" },
    "2026-10-03": { off: true , name: "国庆节" },
    "2026-10-04": { off: true , name: "国庆节" },
    "2026-10-05": { off: true , name: "国庆节" },
    "2026-10-06": { off: true , name: "国庆节" },
    "2026-10-07": { off: true , name: "国庆节" },
    "2026-10-10": { off: false, name: "国庆节" }   // 周六补班
};

/* ==================================================================
   手动「更新节假日」（工具栏 ‥ → ↻ 更新节假日）
   ==================================================================
 * 上面那张表是**打包时的快照**，只到生成脚本跑过的那一年为止。
 * 国办的放假通知一般前一年 11 月才发，所以现在（2026-09）翻到 2027 什么都没有，
 * 不是程序坏了，是官方还没公布。
 *
 * ⚠ 这里**不做自动更新**（2026-09-21 用户要求：自动联网会拖慢打开速度）。
 *   改成工具栏「‥」里的「↻ 更新节假日」，**用户自己点**才去拉。
 *
 * 点一下会发生什么：
 *   · 把当前视图用到的年份（日历是三栏那几个年，表格是时间轴跨的年）各拉一次；
 *   · 拉到数据 → 并进 WORK_HOLIDAYS + 写 localStorage 缓存，页面上立刻能看到标记；
 *   · 该年通知还没公布 → 官方文件里就是空的，会如实回「没有可更新的」；
 *   · 没网 / CDN 不通 → 回「更新失败」，本地那份照常用，不影响任何功能。
 *
 * 缓存（localStorage 的 safemonitor:work:holidays:<年>）会在页面启动时
 * **直接读回表里**（hydrateCache，纯本地不联网），所以更新过之后刷新页面还在，
 * 不用再点一次。
 *
 * 对外接口：window.WORK_HOLIDAYS_FETCH
 *   · hasYear(y)         表里有没有这一年的数据
 *   · updateYears([y…])  去网上更新，返回 Promise<{ok, added, missing, failed, got}>
 *   · hydrateCache()     把缓存并回表里（启动时自动调一次）
 * ================================================================== */
(function () {
    'use strict';

    // 按顺序试：jsDelivr 带 CORS、国内一般也通；raw.githubusercontent 国内常连不上，只当备胎
    const SRC = [
        'https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/{y}.json',
        'https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/{y}.json'
    ];
    const TIMEOUT = 6000;
    const CACHE = 'safemonitor:work:holidays:';

    const store = window.WORK_HOLIDAYS;

    function readCache(y) {
        try {
            const raw = localStorage.getItem(CACHE + y);
            return raw ? JSON.parse(raw) : null;
        } catch (e) { return null; }   // 隐私模式 / 存满了都当没有
    }

    function writeCache(y, days) {
        try { localStorage.setItem(CACHE + y, JSON.stringify(days)); } catch (e) { /* 存不下就算了 */ }
    }

    /** 表里已经有这一年的数据了吗 */
    function hasYear(y) {
        return Object.keys(store).some((k) => k.slice(0, 4) === String(y));
    }

    /** 把一天的记录并进表里（已有的不覆盖：本地那份是对过并带注释的），返回新增条数 */
    function merge(days) {
        let added = 0;
        (days || []).forEach((d) => {
            if (!d || !d.date || store[d.date]) return;
            store[d.date] = { off: !!d.isOffDay, name: d.name };
            added += 1;
        });
        return added;
    }

    /**
     * 启动时把以前更新过的年份从缓存并回表里。
     * 纯本地读取、不联网，所以不会拖慢打开速度；
     * 隐私模式下 localStorage 不让读，直接忽略。
     */
    function hydrateCache() {
        let added = 0;
        try {
            for (let i = 0; i < localStorage.length; i += 1) {
                const k = localStorage.key(i);
                if (!k || k.indexOf(CACHE) !== 0) continue;
                const days = readCache(k.slice(CACHE.length));
                if (days) added += merge(days);
            }
        } catch (e) { /* 隐私模式：当没有缓存 */ }
        return added;
    }

    function fetchJson(url) {
        // 自己掐超时：CDN 慢或被墙时别把请求挂着
        const ctl = typeof AbortController === 'function' ? new AbortController() : null;
        const timer = setTimeout(() => { if (ctl) ctl.abort(); }, TIMEOUT);
        return fetch(url, ctl ? { signal: ctl.signal } : undefined)
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
            .finally(() => clearTimeout(timer));
    }

    /** 按顺序试几个源，第一个成功的就用 */
    function fetchYear(y) {
        let p = Promise.reject(new Error('没有可用数据源'));
        SRC.forEach((tpl) => { p = p.catch(() => fetchJson(tpl.replace('{y}', y))); });
        return p;
    }

    /**
     * 去网上更新这几年的节假日。**只有用户点按钮才调**，而且不短路 ——
     * 每次都真去拉一次，这样「更新成功了没有」才是可信的。
     * @param {Array<number|string>} years
     * @returns {Promise<{ok:boolean, added:number, missing:string[], failed:string[], got:number}>}
     *   ok      至少有一年请求成功（拿到了 JSON）；全失败就是没网 / CDN 不通
     *   added   这次新并进表里的天数（0 = 表里本来就有，或该年还没公布）
     *   missing 网上拉下来是空的年份（官方通知还没发布）
     *   failed  请求失败的年份
     *   got     这次从网上拿到的总条数
     */
    function updateYears(years) {
        const list = Array.from(new Set(years.map(String))).filter((k) => /^\d{4}$/.test(k));
        const res = { ok: false, added: 0, missing: [], failed: [], got: 0 };

        // 一年一年串着拉，别一下并发好几个请求
        return list.reduce((p, key) => p.then(() => fetchYear(key).then((data) => {
            res.ok = true;
            const days = (data && data.days) || [];
            res.got += days.length;
            if (!days.length) { res.missing.push(key); return; }   // 通知还没发，官方文件就是空的
            writeCache(key, days);
            res.added += merge(days);
        }).catch(() => { res.failed.push(key); })), Promise.resolve())
            .then(() => res);
    }

    // 页面一打开就把以前更新过的年份读回来（本地操作，不联网）
    hydrateCache();

    window.WORK_HOLIDAYS_FETCH = { hasYear, updateYears, hydrateCache };
})();
