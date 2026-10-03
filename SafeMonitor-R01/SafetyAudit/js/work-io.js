/**
 * 工作系统（4/5）数据进出层
 * ==================================================================
 * 导出 JSON、导入 JSON、右上角「数据源」角标（OSS 数据 / 示例数据 / 读取失败）。
 * 依赖 work-core.js 和 work-board.js。
 */

(function (W) {
    'use strict';

    const {
        $, pad, slug, themeParam, titleFromParam, esc,
        state, CFG, TODAY, WEEK_FULL, parseDate,
        toast, openModal, closeModal,
        normalize, buildDates, render, scrollToToday, scheduleSave, resolveOssUrl, resolveAsset,
        assigneeList
    } = W;

    /* ============================== 导入 / 导出 ============================== */

    /** 导出时统一整理成 OSS 上的 JSON 结构 */
    function serialize() {
        // 责任人按数组写，第一个人是主责任人；没有责任人的就不写这个字段，手改 JSON 时更清爽
        const tasks = (state.data.tasks || []).map((t) => {
            const one = { item: t.item, date: t.date, text: t.text || '', done: !!t.done };
            const owners = Array.isArray(t.assignees) ? t.assignees : [];
            if (owners.length) one.assignees = owners;
            if (t.detail) one.detail = String(t.detail);
            if (Array.isArray(t.files) && t.files.length) one.files = t.files;
            return one;
        }).sort((a, b) => (
            a.date === b.date ? String(a.item).localeCompare(String(b.item)) : (a.date < b.date ? -1 : 1)
        ));
        const items = (state.data.items || []).map((i) => {
            const one = { id: i.id, name: i.name };
            if (i.subtitle) one.subtitle = String(i.subtitle);
            if (i.pinned) one.pinned = true;   // 没置顶的就不写这个字段，手改 JSON 时更清皙
            // 手动排过序的项（拖过行头）：自动排序不再碰它，所以必须存下来，
            // 否则刷新一次它又跑回按日期排的位置（见 work-edit.js 的 reorder）
            if (i.manual) one.manual = true;
            return one;
        });
        const now = new Date();
        const out = {
            theme: state.data.theme || themeParam() || slug,
            title: state.data.title || titleFromParam(),
            updated: `${TODAY} ${pad(now.getHours())}:${pad(now.getMinutes())}`,
            items,
            tasks
        };

        // 原 JSON 里写死了 range 就保留；没写就不写，这样日期列会一直跟着“今天”走
        if (state.data.range) out.range = state.data.range;

        // 页面上加过责任人（名单和配置里的默认不一样）就一起存，换台电脑打开也是这份名单
        const people = assigneeList();
        if (JSON.stringify(people) !== JSON.stringify(CFG.ASSIGNEES || [])) out.assignees = people;

        return out;
    }

    function exportJson() {
        const text = JSON.stringify(serialize(), null, 2);
        const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${slug}-${TODAY}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(
                () => toast('已导出 JSON 并复制到剪贴板（平时改动会自动保存，这只是备份手段）'),
                () => toast('已导出 JSON（平时改动会自动保存，这只是备份手段）')
            );
        } else {
            toast('已导出 JSON（平时改动会自动保存，这只是备份手段）');
        }
    }

    function openImport() {
        openModal({
            title: '导入 JSON',
            body: `
                <label class="field">
                    <span class="field-label">把 OSS 上的 JSON（或导出的文件内容）粘贴到这里</span>
                    <textarea id="f-json" class="code" spellcheck="false"
                              placeholder='{ "items": [], "tasks": [] }'></textarea>
                </label>
                <p class="hint">导入后会立即覆盖上传到 OSS 上的数据文件（右上角会显示保存结果）。</p>
            `,
            buttons: [
                { text: '取消', cls: 'ghost', onClick: closeModal },
                {
                    text: '导入', cls: 'primary',
                    onClick: () => {
                        let raw;
                        try {
                            raw = JSON.parse($('f-json').value);
                        } catch (e) {
                            toast('JSON 解析失败：' + e.message);
                            return;
                        }
                        state.data = normalize(raw);
                        closeModal();
                        buildDates();
                        render();
                        scrollToToday('auto');
                        scheduleSave();
                        toast('导入成功，正在保存到 OSS…');
                    }
                }
            ]
        });

        setTimeout(() => {
            const el = $('f-json');
            if (el) el.focus();
        }, 40);
    }

    /* ============================== 上传附件到 OSS ============================== */

    /**
     * 把单个文件 PUT 到 OSS 的 SafetyAudit/文件/ 下（匿名直传，不用密钥）。
     * 文件名前面加时间戳，同名也不会互相覆盖；返回记录用的 { name, url, size }。
     */
    async function uploadFile(file) {
        const safe = String(file.name || 'file').replace(/[\\/:*?"<>|]/g, '_');
        const now = new Date();
        const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
            + `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
        const url = resolveAsset(`文件/${stamp}-${safe}`);

        const res = await fetch(url, {
            method: 'PUT',
            headers: { 'Content-Type': file.type || 'application/octet-stream' },
            body: file
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        return { name: String(file.name || safe), url, size: file.size || 0 };
    }

    /* ============================== 通用附件区 ============================== */

    /** 文件大小显示成人看的格式（1024 以内报 B，其余 KB / MB 保留一位小数） */
    function sizeText(n) {
        const b = Number(n) || 0;
        if (b < 1024) return `${b} B`;
        if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
        return `${(b / 1024 / 1024).toFixed(1)} MB`;
    }

    /**
     * 一个「附件区」：画列表 + 选文件/拖放上传 + 去掉某个附件。
     * （和法定自查那套的 bindFileBox 一个思路，那边在 check-core.js；
     *   这个原来是写在 work-edit.js 的「详细」弹层里的，2026-09-21 抽出来共用。）
     *
     * 用法：
     *   const box = W.bindFileBox({
     *       list: 'f-file-list', zone: 'f-drop-zone',
     *       input: 'f-file-input', pick: 'f-pick',
     *       files: task.files || []      // 初始附件（内部会拷一份，不直接改传进来的数组）
     *   });
     *   box.get()      // 保存时取当前附件数组
     *
     * ⚠ 上传是**立刻**发生的（PUT 到 OSS），但要点「保存」才挂到那条安排上 ——
     *   所以调用方必须在保存时把 box.get() 的结果写回数据。
     *   好处：保存前就能看到传了哪些、也能去掉传错的；点取消文件仍在 OSS 上。
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
                        <button type="button" class="file-del" data-i="${i}"
                                title="从这条安排里去掉（OSS 上的文件还在）">✕</button>
                    </div>`).join('')
                : '<p class="hint" style="margin:0 0 8px">还没有上传文件</p>';
        };

        /** 一个或几个文件依次传上去 */
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
            toast(`已上传 ${arr.length} 个文件（点「保存」才挂上去）`);
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

            // 去掉某个附件（事件绑在容器上，重画列表也不会丢）
            list.addEventListener('click', (e) => {
                const del = e.target.closest('.file-del');
                if (!del) return;
                files.splice(Number(del.getAttribute('data-i')), 1);
                paint();
                toast('已去掉一个附件（点「保存」才真正去掉）');
            });
        }, 50);

        return { get: () => files, paint };
    }

    /* ============================== 导出 CSV ============================== */

    /** CSV 单元格：一律套双引号，内部的双引号翻倍（Excel 的通用写法） */
    const csvCell = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;

    /**
     * 下载一个 CSV。
     * ⚠ 开头必须加 BOM（\uFEFF），否则 Excel 打开中文全是乱码；
     *   换行用 \r\n 才合 Excel 的胃口。
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

    /**
     * 把**现在能看到的这些安排**导成一张扁平表（一行一条安排），拿去 Excel
     * 排序 / 筛选 / 打印都方便 —— 表格模式那种「日期做列」的矩阵，Excel 里不好使。
     *
     * 「现在能看到的」跟着两个筛选走，和屏幕上一致：
     *   · 开着「工作查询」→ 只导那个人的（在日期范围内）；
     *   · 开着「只看」→ 只导选中那几个人的。
     * 日历模式没有筛选，就导全部。
     */
    function exportCsv() {
        const who = state.query || '';
        const flt = (W.filterList ? W.filterList() : []);

        let list = (state.data.tasks || []).slice();
        if (who) {
            list = list.filter((t) => (t.assignees || []).indexOf(who) >= 0);
            // 工作查询的日期范围也要跟着（「全部」时 state.queryFrom/To 是空串）
            if (state.queryFrom) list = list.filter((t) => t.date >= state.queryFrom);
            if (state.queryTo) list = list.filter((t) => t.date <= state.queryTo);
        } else if (flt.length) {
            list = list.filter((t) => (t.assignees || []).some((n) => flt.indexOf(n) >= 0));
        }

        if (!list.length) { toast('现在没有可导出的安排'); return; }

        const itemName = (id) => {
            const it = (state.data.items || []).find((i) => i.id === id);
            return it ? it.name : String(id || '');
        };

        const rows = [['日期', '星期', '工作项目', '内容', '责任人', '状态', '详细内容', '附件']];

        list
            .sort((a, b) => (
                a.date === b.date
                    ? String(a.item).localeCompare(String(b.item), 'zh-Hans-CN')
                    : (a.date < b.date ? -1 : 1)
            ))
            .forEach((t) => {
                // 状态和「工作查询」里那张表一个口径
                const st = t.done ? '已完成' : (t.date < TODAY ? '逾期未完成' : '待办');
                rows.push([
                    t.date,
                    WEEK_FULL[parseDate(t.date).getDay()],
                    itemName(t.item),
                    t.text || '',
                    (t.assignees || []).join('、'),
                    st,
                    t.detail || '',
                    (Array.isArray(t.files) ? t.files : []).map((f) => f.name).join('、')
                ]);
            });

        const tag = who || (flt.length ? flt.join('、') : '全部');
        downloadCsv(`工作计划_${tag}_${TODAY}.csv`, rows);
        toast(`已导出 ${list.length} 条安排（CSV）`);
    }

    /* ============================== 数据源角标 ============================== */

    function updateBadge() {
        const badge = $('source-badge');
        // 还没上传数据文件时单独提示一下，别让人误以为是配置写错了
        const notUploaded = /404/.test(state.ossError || '');
        const map = {
            oss: { text: 'OSS 数据', cls: 'is-oss' },
            demo: { text: '示例数据（未接 OSS）', cls: 'is-demo' },
            error: notUploaded
                ? { text: 'OSS 上还没有 plan.json（用示例数据）', cls: 'is-local' }
                : { text: 'OSS 读取失败（已用本地数据）', cls: 'is-error' }
        };
        const info = map[state.source] || map.demo;
        badge.textContent = info.text;
        badge.className = 'badge ' + info.cls;
        badge.title = state.ossError
            ? 'OSS 报错：' + state.ossError
            : (resolveOssUrl() || '未配置 OSS 地址：见 js/work-config.js 的 OSS_BASE_URL');
        // 一切正常就不用挂着这个标签，只有用的是示例/本地数据时才露出来提醒一下
        badge.hidden = state.source === 'oss';
    }

    /* ============================== 挂到命名空间 ============================== */

    Object.assign(W, {
        serialize, exportJson, exportCsv, downloadCsv, openImport, updateBadge, uploadFile,
        bindFileBox, sizeText
    });
})(window.Work);
