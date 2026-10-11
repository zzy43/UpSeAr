/**
 * 管理评审系统（3/4）项目闭环视图
 * ==================================================================
 * 左边：QAR 项目列表（搜索 + 按部门过滤）
 * 右边：选中项目的「六步闭环」详情（调查 → 分析 → 讲评 → 措施 → 改进 → 督促）
 *       每一步都能单独编辑：状态、日期、负责部门、办理人、说明、附件。
 * ==================================================================
 */

(function (W) {
    'use strict';

    const { $, esc, state, toast } = W;

    /* ============================== 取数 ============================== */

    /** 当前正在看的项目；没有就取列表第一个 */
    function currentItem() {
        const items = state.data.items || [];
        if (!items.length) return null;
        return items.find((it) => it.id === state.item) || items[0];
    }

    /** 按搜索词 + 级别过滤后的项目列表 */
    function visibleItems() {
        const q = String(state.query || '').trim().toLowerCase();
        return (state.data.items || []).filter((it) => {
            if (state.level && it.level !== state.level) return false;
            if (!q) return true;
            const hay = [it.no, it.title, it.desc, it.owner, it.flight, it.aircraft, it.source].join(' ').toLowerCase();
            return hay.indexOf(q) >= 0;
        });
    }

    /* ============================== 小片段 ============================== */

    /** 部门名字牌子 */
    const deptChip = (name) => (name
        ? `<span class="chip dept" style="${W.deptStyle(name)}">${esc(name)}</span>` : '');

    /** 附件小牌子上的图标：内联 SVG（不依赖任何字体，一定画得出来） */
    const CLIP = '<svg class="clip" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M14 2v6h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';

    /** 附件小牌子：点开原文件，鼠标悬停预览（图片 / PDF / Word 等） */
    const fileChip = (f) => `<a class="file-chip" href="${esc(f.url)}" target="_blank" rel="noopener"
        data-url="${esc(f.url)}" data-name="${esc(f.name)}">${CLIP}${esc(f.name)}</a>`;

    /** 六个小圆点，表示进度（已完成=实心绿，进行中=半亮，未开始=灰） */
    function dots(item) {
        return `<span class="dots">${W.itemStages(item).map((s) => `<i class="dot is-${s.status}"></i>`).join('')}</span>`;
    }

    /* ============================== 左边列表 ============================== */

    function renderList() {
        const box = $('item-list');
        if (!box) return;

        const list = visibleItems();

        // 级别过滤小牌子（全部 + QAR事件 / 396事件）
        const fbox = $('level-filter');
        if (fbox) {
            const levels = W.CFG.LEVELS || [];
            fbox.innerHTML = [`<button class="chip-filter${state.level ? '' : ' is-on'}" data-level="">全部</button>`]
                .concat(levels.map((v) => `<button class="chip-filter${state.level === v ? ' is-on' : ''}" data-level="${esc(v)}">${esc(v)}</button>`))
                .join('');
        }

        if (!list.length) {
            box.innerHTML = '<p class="hint" style="padding:10px">没有匹配的项目</p>';
            return;
        }

        const cur = currentItem();
        box.innerHTML = list.map((it) => {
            const p = W.itemProgress(it);
            return `
            <button class="item${cur && cur.id === it.id ? ' is-on' : ''}${it.status === 'done' ? ' is-closed' : ''}" data-id="${esc(it.id)}">
                <span class="item-top">
                    <span class="item-no">${esc(it.no || '未编号')}</span>
                    <span class="chip ${W.levelClass(it.level)}">${esc(it.level)}</span>
                </span>
                <span class="item-title">${esc(it.title)}</span>
                <span class="item-bottom">
                    ${dots(it)}
                    <span class="item-prog">${p.done}/${p.total}</span>
                    ${deptChip(it.lead)}
                </span>
            </button>`;
        }).join('');
    }

    /** 一条情况说明（不同部门 / 办理人分开显示，附件跟着这条走） */
    function noteBlock(n) {
        const files = (n.files || []);
        return `
        <div class="note">
            <div class="note-head">
                ${n.dept ? deptChip(n.dept) : ''}
                ${n.by ? `<span class="note-who">👤 ${esc(n.by)}</span>` : ''}
                ${n.date ? `<span class="note-who">${esc(n.date)}</span>` : ''}
            </div>
            ${n.text ? `<p class="note-text">${esc(n.text)}</p>` : ''}
            ${files.length ? `<div class="note-files">${files.map(fileChip).join('')}</div>` : ''}
        </div>`;
    }

    /* ============================== 右边详情 ============================== */

    /** 一步（阶段）的卡片 */
    function stageCard(st, idx) {
        const def = W.stageDef(st.key) || {};
        const notes = (st.notes || []);
        return `
        <div class="stage is-${st.status}" data-key="${esc(st.key)}">
            <div class="stage-head">
                <span class="stage-idx">${idx}</span>
                <span class="stage-name">${esc(def.name || st.key)}</span>
                ${deptChip(st.dept || def.dept)}
                <span class="stage-status">${esc(W.stageStatusText(st.status))}</span>
                <button class="btn ghost stage-edit" data-key="${esc(st.key)}">编辑</button>
            </div>
            <p class="stage-desc">${esc(def.desc || '')}</p>
            <div class="stage-notes">${notes.length
                ? notes.map(noteBlock).join('')
                : '<p class="hint">（这一步还没有情况说明）</p>'}</div>
            ${st.date ? `<div class="stage-foot"><span class="stage-meta">${esc(st.date)}</span></div>` : ''}
        </div>`;
    }

    function renderMain() {
        const box = $('main');
        if (!box) return;

        const item = currentItem();
        if (!item) {
            box.innerHTML = `
                <div class="pane">
                    <div class="empty">
                        <p>还没有 QAR 项目。</p>
                        <button class="btn primary" id="btn-new-item-empty">＋ 新建项目</button>
                    </div>
                </div>`;
            return;
        }

        const p = W.itemProgress(item);
        const defs = W.stageDefs();
        const cur = W.currentStage(item);

        box.innerHTML = `
        <div class="pane">
            <div class="pane-head">
                <h2 class="pane-title">${esc(item.title)}<span class="pane-sub">${esc(item.no || '')}</span></h2>
                <div class="pane-tools">
                    <button class="btn" id="btn-edit-item">✎ 编辑项目</button>
                    <button class="btn danger" id="btn-del-item">🗑 删除</button>
                </div>
            </div>
            <div class="pane-body">
                <div class="meta-row">
                    <span class="chip ${W.levelClass(item.level)}">${esc(item.level)}</span>
                    <span class="chip plain">${esc(item.source)}</span>
                    <span class="stage-meta">事件日期 ${esc(item.date)}</span>
                    ${item.flight ? `<span class="stage-meta">✈ 航班 ${esc(item.flight)}</span>` : ''}
                    ${item.aircraft ? `<span class="stage-meta">机号 ${esc(item.aircraft)}</span>` : ''}
                </div>
                <div class="meta-row">
                    <span class="stage-meta">牵头：</span>${deptChip(item.lead)}
                    ${item.owner ? `<span class="stage-meta">👤 负责人 ${esc(item.owner)}</span>` : ''}
                    ${item.status === 'done' ? '<span class="chip done">✓ 已闭环</span>' : ''}
                </div>
                ${item.desc ? `<p class="item-desc">${esc(item.desc)}</p>` : ''}

                <div class="prog">
                    <div class="prog-track"><span class="prog-fill" style="width:${p.pct}%"></span></div>
                    <span class="prog-txt">闭环进度 ${p.done}/${p.total}${cur ? ` · 当前：${esc((W.stageDef(cur.key) || {}).name || cur.key)}` : ' · 已全部完成'}</span>
                </div>

                <div class="stages">
                    ${defs.map((def, i) => {
                        const st = (item.stages || []).find((s) => s.key === def.key) || { key: def.key, files: [] };
                        return stageCard(st, i + 1);
                    }).join('')}
                </div>
            </div>
        </div>`;
    }

    function render() {
        hideTip();
        renderList();
        renderMain();
    }

    /* ============================== 附件悬浮预览 ============================== */

    const tipEl = () => $('file-tip');

    let tipTimer = null;
    let tipOn = false;      // 鼠标是不是正停在预览框里
    let tipAnchor = null;   // 当前预览对应的附件牌子（图片加载完要重新定位）

    /** 按文件类型生成预览：图片直接显，PDF / Office 用 iframe 嵌 */
    function tipHtml(url, name) {
        if (W.isImageUrl(url)) return `<img src="${esc(url)}" alt="">`;
        if (/\.pdf(\?|#|$)/i.test(url)) return `<iframe src="${esc(url)}#toolbar=1&view=FitH" title="PDF 预览"></iframe>`;
        if (/\.(docx?|xlsx?|pptx?)(\?|#|$)/i.test(url)) {
            return `<iframe src="https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}" title="Office 预览"></iframe>`;
        }
        return `<p class="file-tip-hint">${esc(name)}<br>（该类型不支持预览，点一下打开原文件）</p>`;
    }

    function hideTip() {
        clearTimeout(tipTimer);
        const t = tipEl();
        if (!t) return;
        t.hidden = true;
        t.innerHTML = '';
        tipOn = false;
        tipAnchor = null;
    }

    /** 鼠标离开附件牌子后**等一下**再关 —— 好让鼠标能移进预览框里翻看 */
    function scheduleHide() {
        clearTimeout(tipTimer);
        tipTimer = setTimeout(() => { if (!tipOn) hideTip(); }, 280);
    }

    /** 把预览框摆在附件牌子旁边：优先右侧，右边不够就摆左边，别出屏 */
    function placeTip(a, t) {
        const r = a.getBoundingClientRect();
        const tr = t.getBoundingClientRect();
        let left = r.right + 10;
        if (left + tr.width > window.innerWidth - 8) left = Math.max(8, r.left - tr.width - 10);
        let top = r.top;
        if (top + tr.height > window.innerHeight - 8) top = Math.max(8, window.innerHeight - tr.height - 8);
        t.style.left = `${left}px`;
        t.style.top = `${top}px`;
    }

    function onOver(e) {
        const a = e.target.closest('.file-chip');
        if (!a) return;
        const url = a.getAttribute('data-url');
        if (!url) return;
        const t = tipEl();
        if (!t) return;

        clearTimeout(tipTimer);
        t.innerHTML = tipHtml(url, a.getAttribute('data-name') || '');
        t.hidden = false;
        tipAnchor = a;
        placeTip(a, t);
    }

    function onOut(e) {
        if (e.target.closest('.file-chip')) scheduleHide();
    }

    /** 预览框自己能接鼠标（鼠标移进去就不关，可以翻页 / 滚动） */
    function bindTip() {
        const t = tipEl();
        if (!t) return;
        t.addEventListener('mouseenter', () => { tipOn = true; clearTimeout(tipTimer); });
        t.addEventListener('mouseleave', () => { tipOn = false; scheduleHide(); });
        // 图片是加载完才有真实尺寸的，加载完再重新摆一次
        t.addEventListener('load', (e) => {
            if (tipAnchor && e.target && e.target.tagName === 'IMG') placeTip(tipAnchor, t);
        }, true);
    }

    /* ============================== 编辑项目 ============================== */

    /**
     * 下一个自动编号：<前缀>-<年>-<序号>。
     * 前缀跟级别走（QAR事件 → QAR，396事件 → 396）；
     * 年份取当前年（跨年到 2027 就自动变 2027）；
     * 序号在该前缀 + 该年份的已有编号里取最大 +1，不会重。
     */
    function nextNo(level) {
        const head = `${W.levelPrefix(level)}-${new Date().getFullYear()}-`;
        let max = 0;
        (state.data.items || []).forEach((it) => {
            const no = String(it.no || '');
            if (no.indexOf(head) !== 0) return;
            const n = parseInt(no.slice(head.length), 10);
            if (!Number.isNaN(n) && n > max) max = n;
        });
        return head + String(max + 1).padStart(2, '0');
    }

    const deptOptions = (sel) => (state.data.departments || [])
        .map((d) => `<option value="${esc(d.name)}"${d.name === sel ? ' selected' : ''}>${esc(d.name)}</option>`).join('');

    function newProject() {
        editProject(null);
    }

    function editProject(item) {
        const isNew = !item;
        const defLevel = (W.CFG.LEVELS || [])[0];
        // 新建时先给个自动编号（级别一改就跟着换，除非用户自己改过）
        const it = item || {
            no: nextNo(defLevel), title: '', level: defLevel, source: (W.CFG.SOURCES || [])[0],
            date: W.TODAY, flight: '', aircraft: '',
            lead: (state.data.departments[0] || {}).name || '', owner: '', desc: ''
        };
        let noEdited = false;

        W.openModal({
            title: isNew ? '新建项目' : '编辑项目',
            size: 'xl',
            body: `
                <div class="field-row">
                    <label class="field"><span class="field-label">项目编号</span>
                        <input type="text" id="it-no" value="${esc(it.no)}" placeholder="如 QAR-2026-01"></label>
                    <label class="field"><span class="field-label">事件日期</span>
                        <input type="date" id="it-date" value="${esc(it.date)}"></label>
                </div>
                <label class="field"><span class="field-label">项目名称 / 事件概述</span>
                    <input type="text" id="it-title" value="${esc(it.title)}" placeholder="如 起飞机段俯仰配平超限（非 396 事件）"></label>
                <div class="field-row">
                    <label class="field"><span class="field-label">级别</span>
                        <select id="it-level">${(W.CFG.LEVELS || []).map((v) => `<option${v === it.level ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select></label>
                    <label class="field"><span class="field-label">来源</span>
                        <select id="it-source">${(W.CFG.SOURCES || []).map((v) => `<option${v === it.source ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select></label>
                </div>
                <div class="field-row">
                    <label class="field"><span class="field-label">航班号</span>
                        <input type="text" id="it-flight" value="${esc(it.flight)}"></label>
                    <label class="field"><span class="field-label">机号</span>
                        <input type="text" id="it-aircraft" value="${esc(it.aircraft)}"></label>
                </div>
                <div class="field-row">
                    <label class="field"><span class="field-label">牵头部门</span>
                        <select id="it-lead">${deptOptions(it.lead)}</select></label>
                    <label class="field"><span class="field-label">负责人</span>
                        <input type="text" id="it-owner" list="resp-list" value="${esc(it.owner)}"></label>
                </div>
                <div class="field"><span class="field-label">事件描述 / 说明</span>
                    <textarea id="it-desc" class="tall">${esc(it.desc)}</textarea></label>
                <datalist id="resp-list">${(W.CFG.RESPONSIBLES || []).map((n) => `<option value="${esc(n)}">`).join('')}</datalist>`,
            buttons: [
                { text: isNew ? '创建' : '保存', cls: 'primary', onClick: save },
                { text: '取消', onClick: W.closeModal }
            ]
        });

        // 级别一改，编号跟着换前缀重生成；用户自己动过编号就不再自动改
        // （新建、编辑都适用：比如编辑时把 QAR事件 改成 396事件，编号自动变 396-…）
        {
            const noEl = $('it-no');
            const lvEl = $('it-level');
            if (noEl) noEl.addEventListener('input', () => { noEdited = true; });
            if (lvEl) lvEl.addEventListener('change', () => {
                if (!noEdited && noEl) noEl.value = nextNo(lvEl.value);
            });
        }

        function save() {
            const title = $('it-title').value.trim();
            if (!title) { toast('请填写项目名称'); return; }

            const data = {
                no: $('it-no').value.trim(),
                title,
                level: $('it-level').value,
                source: $('it-source').value,
                date: $('it-date').value || W.TODAY,
                flight: $('it-flight').value.trim(),
                aircraft: $('it-aircraft').value.trim(),
                lead: $('it-lead').value,
                owner: $('it-owner').value.trim(),
                desc: $('it-desc').value.trim()
            };

            if (isNew) {
                const defs = W.stageDefs();
                const depts = W.stageDefaultDepts(data.level);   // 「调查」按级别定（QAR→运技部 / 396→安监部）
                const id = W.uid('qar');
                state.data.items.unshift(Object.assign({ id, status: 'open' }, data, {
                    stages: defs.map((d, i) => ({ key: d.key, status: 'todo', dept: depts[i], files: [] }))
                }));
                state.item = id;
            } else {
                Object.assign(item, data);
            }
            W.closeModal();
            W.markChanged();
            render();
            toast(isNew ? '已新建项目' : '已保存');
        }
    }

    /* ============================== 编辑某一步 ============================== */

    function editStage(item, key) {
        const def = W.stageDef(key) || { name: key, dept: '' };
        const st = (item.stages || []).find((s) => s.key === key);
        if (!st) { st = { key, status: 'todo', dept: def.dept, notes: [] }; item.stages.push(st); }

        const statusOpt = () => ['todo', 'doing', 'done']
            .map((s) => `<option value="${s}"${(st.status || 'todo') === s ? ' selected' : ''}>${esc(W.stageStatusText(s))}</option>`)
            .join('');

        // 每行情况说明：{ dept, by, date, text, files:[{name,url,size}] }
        // （老数据的单条 note/by、以及步骤级附件，已在 core 迁进来）
        let notes = (st.notes || []).map((n) => ({
            dept: n.dept || '', by: n.by || '', date: n.date || '', text: n.text || '',
            files: (n.files || []).slice()
        }));
        // 新的一行：办理人空的、日期默认今天
        const blank = () => ({ dept: st.dept || def.dept || '', by: '', date: W.TODAY, text: '', files: [] });
        if (!notes.length) notes = [blank()];

        W.openModal({
            title: `${def.name} · ${item.title}`,
            size: 'xl',
            tall: true,          // 这一步的弹框尽量占满屏（内容多）
            body: `
                <div class="field-row">
                    <label class="field"><span class="field-label">状态</span>
                        <select id="st-status">${statusOpt()}</select></label>
                    <label class="field"><span class="field-label">完成 / 更新日期</span>
                        <input type="date" id="st-date" value="${esc(st.date || '')}"></label>
                    <label class="field"><span class="field-label">主负责部门</span>
                        <select id="st-dept">${deptOptions(st.dept || def.dept)}</select></label>
                </div>
                <div class="notes-field">
                    <span class="field-label">情况说明</span>
                    <div class="notes-edit" id="st-notes"></div>
                    <button type="button" class="btn ghost note-add" id="st-note-add">＋ 增加情况说明</button>
                </div>`,
            buttons: [
                { text: '保存', cls: 'primary', onClick: save },
                { text: '取消', onClick: W.closeModal }
            ]
        });

        // ---- 情况说明：画 / 读 / 增 / 删 / 加附件 ----
        const fileHtml = (f, i, j) => `<span class="nr-file">
            <a href="${esc(f.url)}" target="_blank" rel="noopener">${CLIP}${esc(f.name)}</a>
            <button type="button" class="nr-file-del" data-i="${i}" data-j="${j}" title="移除">✕</button>
        </span>`;

        const rowHtml = (n, i) => `
            <div class="note-row" data-i="${i}">
                <div class="note-row-head">
                    <select class="nr-dept">${deptOptions(n.dept || def.dept)}</select>
                    <input type="text" class="nr-by" placeholder="办理人" value="${esc(n.by || '')}">
                    <input type="date" class="nr-date" value="${esc(n.date || '')}">
                    <button type="button" class="btn danger nr-del">删除</button>
                </div>
                <textarea class="nr-text" placeholder="这一步的情况说明……">${esc(n.text || '')}</textarea>
                <div class="nr-files" id="nf-zone-${i}">
                    ${(n.files || []).map((f, j) => fileHtml(f, i, j)).join('')}
                    <button type="button" class="btn ghost nr-add" id="nf-pick-${i}">＋ 附件</button>
                    <input type="file" id="nf-input-${i}" multiple hidden>
                </div>
            </div>`;

        const readNotes = () => {
            const box = $('st-notes');
            if (!box) return;
            notes = Array.from(box.querySelectorAll('.note-row')).map((row, i) => ({
                dept: row.querySelector('.nr-dept').value,
                by: row.querySelector('.nr-by').value.trim(),
                date: row.querySelector('.nr-date').value || '',
                text: row.querySelector('.nr-text').value,
                // 附件不在输入框里，由上传 / 删除直接维护在这个数组上
                files: (notes[i] && notes[i].files) || []
            }));
        };

        // 每行的附件区：选文件 / 拖放 → 立刻上传到 OSS → 记到这一条情况说明
        const uploadTo = async (i, list) => {
            const arr = Array.from(list || []).filter(Boolean);
            if (!arr.length) return;
            readNotes();                       // 先把各行现有的文字收进来，重画才不会丢
            const target = notes[i] || (notes[i] = blank());
            target.files = target.files || [];
            for (let k = 0; k < arr.length; k += 1) {
                const f = arr[k];
                W.toast(`正在上传 ${f.name}…（${k + 1}/${arr.length}）`);
                try {
                    // eslint-disable-next-line no-await-in-loop
                    const info = await W.uploadFile(f);
                    target.files.push(info);
                } catch (e) {
                    W.toast(`上传「${f.name}」失败：${(e && e.message) || e}`);
                }
            }
            paintNotes();
            W.toast('已上传附件（点「保存」才挂上去）');
        };

        const bindRowFiles = (i) => {
            const pick = $(`nf-pick-${i}`);
            const input = $(`nf-input-${i}`);
            const zone = $(`nf-zone-${i}`);

            if (pick && input) {
                pick.addEventListener('click', () => input.click());
                input.addEventListener('change', () => { uploadTo(i, input.files); input.value = ''; });
            }
            if (zone) {
                zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('is-over'); });
                zone.addEventListener('dragleave', () => zone.classList.remove('is-over'));
                zone.addEventListener('drop', (e) => {
                    e.preventDefault();
                    zone.classList.remove('is-over');
                    uploadTo(i, e.dataTransfer && e.dataTransfer.files);
                });
            }
        };

        const paintNotes = () => {
            const box = $('st-notes');
            if (!box) return;
            box.innerHTML = notes.map((n, i) => rowHtml(n, i)).join('');
            notes.forEach((n, i) => bindRowFiles(i));
        };

        paintNotes();

        $('st-note-add').addEventListener('click', () => {
            readNotes();
            notes.push(blank());
            paintNotes();
        });

        $('st-notes').addEventListener('click', (e) => {
            const del = e.target.closest('.nr-del');
            if (del) {
                const i = Number(del.closest('.note-row').getAttribute('data-i'));
                readNotes();
                notes.splice(i, 1);
                if (!notes.length) notes.push(blank());
                paintNotes();
                return;
            }
            const fdel = e.target.closest('.nr-file-del');
            if (fdel) {
                readNotes();
                const i = Number(fdel.getAttribute('data-i'));
                const j = Number(fdel.getAttribute('data-j'));
                if (notes[i] && notes[i].files) notes[i].files.splice(j, 1);
                paintNotes();
            }
        });

        function save() {
            readNotes();

            st.status = $('st-status').value;
            st.date = $('st-date').value || '';
            st.dept = $('st-dept').value;
            // 只留填了内容的（空行丢掉）
            st.notes = notes
                .map((n) => ({
                    dept: n.dept || '', by: (n.by || '').trim(), date: n.date || '',
                    text: (n.text || '').trim(),
                    files: (n.files || []).slice()
                }))
                .filter((n) => n.text || n.by || n.files.length);

            item.stages = W.itemStages(item);       // 重排成 STAGES 顺序（附件已归各条情况说明）
            // 六步全完成 → 自动标记「已闭环」
            item.status = W.itemClosed(item) ? 'done' : 'open';

            W.closeModal();
            W.markChanged();
            render();
            toast('已保存该步骤');
        }
    }

    /* ============================== 导出 Excel ============================== */

    /**
     * 把若干项目组装成三张表（导出 Excel / xlsx 用）：
     *   ① 项目总览        —— 一个项目一行
     *   ② 六步明细        —— 一个项目六行
     *   ③ 情况说明明细    —— 一条情况说明一行（附件名字列在一起）
     */
    function buildSheets(items) {
        const overview = [[
            '项目编号', '级别', '项目名称', '来源', '事件日期', '航班号', '机号',
            '牵头部门', '负责人', '状态', '闭环进度', '当前步骤', '情况说明条数', '附件数'
        ]];
        const stages = [['项目编号', '项目名称', '级别', '步骤', '状态', '主负责部门', '更新/完成日期']];
        const notes = [['项目编号', '项目名称', '级别', '步骤', '情况说明部门', '办理人', '日期', '情况说明', '附件']];

        (items || []).forEach((it) => {
            const st = W.itemStages(it);
            const p = W.itemProgress(it);
            const cur = W.currentStage(it);
            const noteCount = st.reduce((n, s) => n + s.notes.length, 0);
            const fileCount = st.reduce((n, s) => n + s.notes.reduce((m, x) => m + x.files.length, 0), 0);

            overview.push([
                it.no, it.level, it.title, it.source, it.date, it.flight, it.aircraft,
                it.lead, it.owner,
                it.status === 'done' ? '已闭环' : '进行中',
                `${p.done}/${p.total}`,
                cur ? ((W.stageDef(cur.key) || {}).name || '') : '（已全部完成）',
                String(noteCount), String(fileCount)
            ]);

            st.forEach((s) => {
                const def = W.stageDef(s.key) || {};
                const name = def.name || s.key;
                stages.push([it.no, it.title, it.level, name, W.stageStatusText(s.status), s.dept, s.date]);
                s.notes.forEach((n) => {
                    notes.push([
                        it.no, it.title, it.level, name,
                        n.dept, n.by, n.date, n.text,
                        (n.files || []).map((f) => f.name).join('、')
                    ]);
                });
            });
        });

        return [
            { name: '项目总览', rows: overview, widths: [16, 10, 40, 12, 12, 10, 10, 10, 10, 10, 10, 12, 13, 8] },
            { name: '六步明细', rows: stages, widths: [16, 40, 10, 10, 10, 12, 15] },
            { name: '情况说明明细', rows: notes, widths: [16, 30, 10, 10, 12, 10, 12, 70, 26] }
        ];
    }

    /**
     * 导出 Excel。
     * @param {'all'|'single'} mode  all = 全部项目；single = 只导出当前选中的项目
     */
    function exportExcel(mode) {
        const all = state.data.items || [];
        const list = (mode === 'single') ? [currentItem()].filter(Boolean) : all;
        if (!list.length) { toast('没有可导出的项目'); return; }

        const file = (mode === 'single')
            ? `${(list[0].no || '项目').replace(/[\\/:*?"<>|]/g, '_')}.xlsx`
            : `管理复盘-项目汇总-${W.todayStr()}.xlsx`;

        W.downloadXlsx(file, buildSheets(list));
        toast(mode === 'single' ? '已导出当前项目' : `已导出 ${list.length} 个项目`);
    }

    /* ============================== 事件绑定 ============================== */

    function onListClick(e) {
        const btn = e.target.closest('.item');
        if (btn) { state.item = btn.getAttribute('data-id'); render(); return; }
        const f = e.target.closest('.chip-filter');
        if (f) { state.level = f.getAttribute('data-level') || ''; render(); }
    }

    function onMainClick(e) {
        if (e.target.closest('#btn-edit-item')) { editProject(currentItem()); return; }
        if (e.target.closest('#btn-del-item')) { delProject(currentItem()); return; }
        if (e.target.closest('#btn-new-item-empty')) { newProject(); return; }

        // 点某一步（卡片任意处，或右上角「编辑」）就打开这一步的编辑框
        const stage = e.target.closest('.stage');
        if (stage && !e.target.closest('a')) {
            editStage(currentItem(), stage.getAttribute('data-key'));
        }
    }

    function delProject(item) {
        if (!item) return;
        W.openModal({
            title: '删除项目',
            body: `<p>确定删除项目「<b>${esc(item.title)}</b>」吗？<br><span class="hint">删除后这个项目的所有记录和附件都会从数据里移除。</span></p>`,
            buttons: [
                { text: '删除', cls: 'danger', onClick: () => {
                    state.data.items = state.data.items.filter((x) => x.id !== item.id);
                    state.item = '';
                    W.closeModal();
                    W.markChanged();
                    render();
                    toast('已删除');
                } },
                { text: '取消', onClick: W.closeModal }
            ]
        });
    }

    function bind() {
        // 监听挂在整个左边栏上：项目卡片和部门过滤牌子都在里面
        // （不能只挂 #item-list —— 部门过滤牌子在它外面的 .side-tools 里）
        const side = document.querySelector('.side');
        if (side) side.addEventListener('click', onListClick);
        const main = $('main');
        if (main) {
            main.addEventListener('click', onMainClick);
            main.addEventListener('mouseover', onOver);
            main.addEventListener('mouseout', onOut);
            main.addEventListener('scroll', () => { if (!tipOn) hideTip(); }, true);
        }
        bindTip();
        const search = $('item-search');
        if (search) search.addEventListener('input', () => { state.query = search.value; renderList(); });
    }

    W.items = { render, renderList, renderMain, currentItem, newProject, editProject, editStage, exportExcel, bind };
})(window.Review = window.Review || {});
