/**
 * 法定自查系统（4/4）启动与事件
 * ==================================================================
 * render()（把顶部信息 + 当前视图 + 左边单位栏串起来）、按钮绑定、导入导出、启动。
 * 必须最后加载：前面的文件先把函数挂到 window.Check，这里才开始绑定和启动。
 * ==================================================================
 */

(function (W) {
    'use strict';

    const {
        $, esc, state, CFG, themeParam,
        monthLabel, planText, countsFor, nextCheck,
        toast, openModal, closeModal, isModalOpen,
        markChanged, loadAll, uploadNow, hasPendingSave,
        openIssueEditor, openIssueView, openUnitEditor, openUnitView, setUnit, toggleIssue, deleteIssue,
        applyTheme, currentTheme, initTheme, initView, setView,
        auditorColor, auditorStyle, pushRoster
    } = W;

    /* ============================== 重画 ============================== */

    function paintViewBtn() {
        const btn = $('btn-view');
        if (!btn) return;
        const isPlan = state.view === 'plan';
        btn.textContent = isPlan ? '▤ 问题库' : '▤ 审核计划';
        btn.title = isPlan ? '回到问题库' : '看年度审核计划总览';
        btn.classList.toggle('is-on', isPlan);
    }

    /**
     * 重画整个界面。
     * ⚠ 顶部那排（标题 / 主题 / 概况）**跟视图无关**，必须放在最前面 ——
     *   放进某个视图分支里的话，另一种视图下就永远是「加载中…」。
     */
    function render() {
        const d = state.data;

        document.title = d.title || W.STD_TITLE;
        const bt = $('brand-title');
        if (bt) bt.textContent = d.title || W.STD_TITLE;
        const bg = $('brand-genre');
        if (bg) bg.textContent = String(d.theme || themeParam() || 'Statutory Inspection');

        const total = countsFor('__all');
        const next = nextCheck();
        const meta = $('brand-meta');
        if (meta) {
            meta.textContent = `${(d.units || []).length} 个受检单位`
                + ` · 问题库 ${total.total} 条（待审核 ${total.open}、已完成 ${total.done}）`
                + (next ? ` · 下次检查：${monthLabel(next.unit.plan)} ${next.unit.name}（${planText(next.unit.plan)}）` : '')
                + (d.updated ? ` · 数据更新于 ${d.updated}` : '');
        }

        if (state.view === 'plan') W.renderPlanView();
        else W.renderIssuesView();

        W.renderSide();
        paintViewBtn();
        renderAuditorChips();   // 审核员那一排（名单是共用的，两边改动后刷新就跟着变）
    }

    /* ============================== 小面板（⋯） ============================== */

    let menus = [];

    /**
     * 关上那些悬浮面板。
     * ⚠ 带 stayOpen 的不关：它是「审核员」那一条常驻的带子，不是点别处就该消失的浮窗
     *   （不然刚点一下里面的牌子它就没了）。
     */
    function closeMenus() {
        menus.forEach((g) => { if (!g.stayOpen) g.panel.hidden = true; });
    }

    /**
     * 两个「按钮 + 面板」：
     * · 「审核员」→ 开合工具栏上面那一排名字（stayOpen：它不是悬浮小面板，
     *   点别处不自动收 —— 和安全审核那边的「👤 责任人」一个规矩）；
     * · 「⋯」→ 右上角那个悬浮菜单（点别处或 Esc 关掉）。
     */
    function bindPopovers() {
        menus = [
            { btn: $('btn-auditor'), panel: $('auditor-bar'), stayOpen: true },
            { btn: $('btn-more'), panel: $('more-menu') }
        ].filter((g) => g.btn && g.panel);

        menus.forEach((g) => {
            g.btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const willOpen = g.panel.hidden;
                closeMenus();
                g.panel.hidden = !willOpen;
            });
            g.panel.addEventListener('click', (e) => {
                // 面板内部的点击不要冒泡到 document，否则点牌子时会顺手把面板收起来
                e.stopPropagation();
                // 「更多」里点了菜单项就把菜单收起来
                if (e.target.closest('.menu-item')) g.panel.hidden = true;
            });
        });

        document.addEventListener('click', closeMenus);
    }

    /* ============================== 导出 / 导入 / 重新载入 ============================== */

    /**
     * 导出 CSV：跟着当前视图走 ——
     * 问题库就导现在看到的问题清单，审核计划就导单位总表。
     * （CSV 的实现和 BOM 处理在 check-core.js 的 downloadCsv）
     */
    function exportCsv() {
        if (state.view === 'plan') W.exportPlanCsv();
        else W.exportIssuesCsv();
    }

    function exportJson() {
        const text = JSON.stringify(W.serialize(), null, 2);
        try {
            const blob = new Blob([text], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'check.json';
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        } catch (e) {
            toast('导出失败：' + ((e && e.message) || e));
            return;
        }
        toast('已导出 check.json（平时改动会自动保存，这只是备份手段）');
    }

    function openImport() {
        openModal({
            title: '导入 JSON',
            body: `<label class="field"><span class="field-label">把 check.json 的内容粘在这里</span>
                    <textarea id="imp-text" class="tall" placeholder='{ "units": [ … ], "issues": [ … ] }'></textarea></label>
                <p class="hint">
                    导入后会<b>替换</b>当前全部内容（受检单位 + 问题库），并立即上传到 OSS。<br>
                    不确定就先点「⋯ → ⤓ 导出 JSON」备份一份。<br>
                    单位或问题的字段说明见 <code>js/check-config.js</code> 开头的注释。
                </p>`,
            buttons: [
                { text: '取消', cls: 'ghost', onClick: closeModal },
                {
                    text: '导入并覆盖',
                    cls: 'danger',
                    onClick: () => {
                        const raw = ($('imp-text').value || '').trim();
                        if (!raw) { toast('先粘贴 JSON 内容'); return; }

                        let obj;
                        try {
                            obj = JSON.parse(raw);
                        } catch (e) {
                            toast('JSON 解析失败：' + e.message);
                            return;
                        }

                        state.data = W.normalize(obj);
                        state.data.updated = W.stamp();
                        state.unit = W.defaultUnitId();   // 回到默认那个单位（第一个）
                        setView('issues');
                        state.query = '';

                        closeModal();
                        toast('导入成功，正在保存到 OSS…');
                        markChanged();
                    }
                }
            ]
        });
    }

    async function reloadAll() {
        // 先把还没传完的改动传上去，再重新拉取，避免刚改的内容被覆盖
        if (hasPendingSave()) await uploadNow();
        await loadAll();
        toast('已从 OSS 重新载入');
    }

    /* ============================== 事件绑定 ============================== */

    function bindEvents() {
        const main = $('main');
        const unitList = $('unit-list');

        // 左边点一个单位：切到问题库看它的
        unitList.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-unit]');
            if (!btn) return;
            const id = btn.getAttribute('data-unit');
            if (id === state.unit && state.view === 'issues') return;
            setView('issues');
            setUnit(id);
        });

        /*
         * 「点一下」的判定：必须**按下和松开都在同一个元素上（卡片 / 表格行），
         * 而且几乎没动**。
         * 为什么：拖鼠标选文字时，浏览器会把 click 派给「按下点和松开点的共同祖先」——
         * 在卡片或行里拖就是那个卡片 / 那一行，于是拖一下就弹框
         * （2026-09-21 用户要求「拖拽不要弹出任何框体」）。
         */
        let pressCard = null;
        let pressRow = null;
        let pressX = 0;
        let pressY = 0;
        main.addEventListener('mousedown', (e) => {
            pressCard = e.target.closest('.issue');
            pressRow = e.target.closest('tr[data-unit-view]');
            pressX = e.clientX;
            pressY = e.clientY;
        });
        /** 刚才是「稳稳点了一下」吗（按下到松开没怎么动） */
        const steadyClick = (e) => Math.abs(e.clientX - pressX) + Math.abs(e.clientY - pressY) <= 5;

        // 右边：问题卡片上的操作 / 计划表里的按钮
        main.addEventListener('click', (e) => {
            const card = e.target.closest('.issue');
            const act = e.target.closest('[data-act]');

            if (card && act) {
                const id = card.getAttribute('data-id');
                const a = act.getAttribute('data-act');
                if (a === 'edit') openIssueEditor(id);
                else if (a === 'toggle') toggleIssue(id);
                else if (a === 'del') deleteIssue(id);
                return;
            }

            // 点卡片空白处 = 看这条（**只读**，2026-09-21 用户要求：不再直接弹编辑框）
            if (card) {
                const steady = card === pressCard && steadyClick(e);
                // 点的是里面的附件链接：让它自己打开/下载，不要再弹框
                if (!e.target.closest('a') && steady) openIssueView(card.getAttribute('data-id'));
                return;
            }

            if (act) {
                const a = act.getAttribute('data-act');
                if (a === 'new-issue') openIssueEditor(null);
                else if (a === 'new-unit') openUnitEditor(null);
                else if (a === 'export-csv') exportCsv();
                // 问题库视图标题旁边那个 ✎：编辑当前这个受检单位
                else if (a === 'edit-unit' && state.unit !== '__all') openUnitEditor(state.unit);
                return;
            }

            /*
             * 计划表：
             *   ① 行里的 ✎ ✕ 两个按钮先拦掉 —— 它们是行内的，有自己的动作；
             *   ② 其余地方点一下 = 弹出这个单位的**只读内容页**。
             * ⚠ 整行才是热区（`tr[data-unit-view]`），不是只有单位名那几个字
             *   —— 2026-09-21 用户澄清「不是点受检单位那几个字，是点整行」。
             *   所以这两个按钮的判断**必须排在整行判断前面**。
             */
            const editUnit = e.target.closest('[data-edit-unit]');
            if (editUnit) { openUnitEditor(editUnit.getAttribute('data-edit-unit')); return; }

            const delUnit = e.target.closest('[data-del-unit]');
            if (delUnit) { W.deleteUnit(delUnit.getAttribute('data-del-unit')); return; }

            const row = e.target.closest('tr[data-unit-view]');
            if (row) {
                if (row === pressRow && steadyClick(e)) {
                    openUnitView(row.getAttribute('data-unit-view'));
                }
                return;
            }

            // （旧写法：点单位名直接跳问题库。内容页里那个「▤ 看它的问题库」会走这条）
            const openUnit = e.target.closest('[data-open-unit]');
            if (openUnit) { setView('issues'); setUnit(openUnit.getAttribute('data-open-unit')); return; }
        });

        // 搜索：只重画统计行和列表，不重建搜索框（否则焦点和光标会丢）
        main.addEventListener('input', (e) => {
            if (e.target.id !== 'q-search') return;
            state.query = e.target.value;
            W.renderIssuesList();
        });

        // 「编辑样式」弹层里拖动取色器 → 实时更新预览（绑一次就够，见 onStylePreview 的注释）
        $('modal-body').addEventListener('input', onStylePreview);

        // 「＋ 记录问题」只在问题库视图的 pane-tools 里（顶栏那个已去掉，和它重复）
        $('btn-new-unit').addEventListener('click', () => openUnitEditor(null));
        $('btn-new-unit-2').addEventListener('click', () => openUnitEditor(null));
        $('btn-style').addEventListener('click', openStyleEditor);
        $('btn-del-auditor').addEventListener('click', openAuditorDeleter);

        $('btn-view').addEventListener('click', () => {
            setView(state.view === 'plan' ? 'issues' : 'plan');
            state.query = '';
            render();
        });

        $('btn-theme').addEventListener('click', () => {
            applyTheme(currentTheme() === 'light' ? 'dark' : 'light');
        });

        $('btn-export').addEventListener('click', exportJson);
        $('btn-export-csv').addEventListener('click', exportCsv);
        $('btn-import').addEventListener('click', openImport);
        $('btn-reload').addEventListener('click', reloadAll);

        // 读取失败时点角标看原因；保存失败时点状态重试
        $('source-badge').addEventListener('click', () => {
            if (state.source === 'error') toast('读取 OSS 失败：' + (state.ossError || '未知原因'));
        });
        $('save-state').addEventListener('click', () => {
            if (state.saveState === 'error') { toast('正在重试保存…'); uploadNow(); }
        });

        // 弹层
        $('modal-x').addEventListener('click', closeModal);

        // 点弹层外面的背景把弹层关掉。
        // ⚠ 不能写成 `click + e.target === modal`：在输入框里用鼠标**框选文字**时，
        //   如果拖出了卡片再松手，click 会打在「按下点和松开点的共同祖先」上
        //   （也就是这个背景），弹层就会莫名其妙自己关掉 —— 看着像「闪退」。
        //   所以必须确认**按下和松开都在背景上**才算点背景（2026-09-21 修）。
        let downOnBackdrop = false;
        $('modal').addEventListener('mousedown', (e) => {
            downOnBackdrop = (e.target === $('modal'));
        });
        $('modal').addEventListener('mouseup', (e) => {
            const onBackdrop = (e.target === $('modal'));
            if (downOnBackdrop && onBackdrop) closeModal();
            downOnBackdrop = false;
        });

        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            if (isModalOpen()) closeModal();
            closeMenus();
        });

        bindPopovers();
        bindImageTip();

        // 有改动还没传完就想关页面时拦一下
        window.addEventListener('beforeunload', (e) => {
            if (hasPendingSave()) {
                e.preventDefault();
                e.returnValue = '';
            }
        });
    }

    /* ============================== 图片附件悬浮预览 ============================== */

    /**
     * 鼠标停在「图片附件」的链接上（问题卡片上的、弹层里的附件列表都算），
     * 浮出图片本身看一眼，省得每次都点开新标签页；非图片附件不理会。
     * 事件挂在 document 上：卡片是每次重画换掉的，挂卡片上就丢了。
     */
    function bindImageTip() {
        const tip = $('image-tip');
        const img = $('image-tip-img');
        if (!tip || !img) return;

        const isImage = (url) => /\.(png|jpe?g|gif|webp|bmp|svg|avif)(\?|#|$)/i.test(url || '');
        let timer = null;

        const hide = () => {
            clearTimeout(timer);
            tip.hidden = true;
        };

        const place = (link) => {
            const rect = link.getBoundingClientRect();
            const w = tip.offsetWidth;
            const h = tip.offsetHeight;

            // 优先放链接右边，右边不够就翻到左边，上下夹在窗口里
            let left = rect.right + 12;
            if (left + w > window.innerWidth - 8) left = Math.max(8, rect.left - w - 12);
            const top = Math.min(Math.max(8, rect.top - 8), Math.max(8, window.innerHeight - h - 8));

            tip.style.left = `${left}px`;
            tip.style.top = `${top}px`;
        };

        const show = (link) => {
            img.src = link.getAttribute('href');
            tip.hidden = false;
            // 图片可能还没解码完，等好了再摆位置
            if (img.complete) place(link);
            else img.onload = () => place(link);
        };

        document.addEventListener('mouseover', (e) => {
            const link = e.target.closest('a.file-name');
            if (!link || !isImage(link.getAttribute('href'))) return;

            clearTimeout(timer);
            timer = setTimeout(() => show(link), 200);
        });

        document.addEventListener('mouseout', (e) => {
            const link = e.target.closest('a.file-name');
            if (!link) return;
            if (e.relatedTarget && link.contains(e.relatedTarget)) return;
            hide();
        });

        img.addEventListener('error', hide);
        document.addEventListener('mousedown', hide);
        // 抓所有滚动容器（列表滚起来时预览不能飘在原地）
        window.addEventListener('scroll', hide, true);
    }

    /* ============================== 审核员那一排（名单） ============================== */

    /**
     * 工具栏上方那一排审核员的名字牌子 + 最右边一个「＋」（新增审核员）。
     *
     * 安全审核（SafetyAudit/work.html）那边叫「👤 责任人」，是一模一样的一条带子
     * （那边人多的时候还能把名字拖到格子上排活；这边没有格子，就是名单 + 加人）。
     *
     * ★ 名单是**两个系统共用**的（OSS 上的 审核员.json）：
     *   在这边加人 / 改颜色，安全审核那边刷新后就是同一套；反过来也一样。
     */
    function renderAuditorChips() {
        const box = $('auditor-chips');
        if (!box) return;

        const list = state.data.auditors || [];
        const who = state.who || [];

        box.innerHTML = list.map((a) => (
            `<span class="chip who" data-name="${esc(a.name)}"`
            + ` style="${esc(auditorStyle(a.name))}"`
            + ` title="点一下 = 把「${esc(a.name)}」记的问题加进/移出「只看」（可以选好几个）">`
            + `${esc(a.name)}<i class="chip-x">✕</i></span>`
        )).join('')
            // 多选时给个一次清空的入口，不用一个个点掉
            + (who.length ? '<span class="chip chip-clear" id="chip-clear"'
                + ' title="取消只看，显示全部问题">✕ 看全部</span>' : '')
            + '<button class="chip-add" id="btn-add-auditor" type="button"'
            + ' title="新增审核员（安全审核那边也会一起加上）">＋</button>';

        // 只绑一次（这个盒子是固定的，重画内容不会丢监听）
        if (!box.dataset.boundClick) {
            box.dataset.boundClick = '1';
            box.addEventListener('click', (e) => {
                if (e.target.closest('.chip-add')) { openAuditorEditor(); return; }
                if (e.target.closest('.chip-clear')) { setWho([]); return; }
                const chip = e.target.closest('.chip');
                if (!chip) return;
                filterByAuditor(chip.getAttribute('data-name'));
            });
        }

        paintAuditorChips();
    }

    /** 把「正在只看哪几个人」画到牌子上（选中的带亮圈 + ✕）+ 工具栏按钮的提示 */
    function paintAuditorChips() {
        const who = state.who || [];
        document.querySelectorAll('#auditor-chips .chip[data-name]').forEach((c) => {
            c.classList.toggle('is-active', who.indexOf(c.getAttribute('data-name')) >= 0);
        });

        const btn = $('btn-auditor');
        if (btn) {
            btn.classList.toggle('is-filtering', who.length > 0);
            btn.textContent = who.length ? `👤 只看 ${who.join('、')}` : '👤 审核员';
            btn.title = who.length
                ? '正在只看这几个人的问题；点开这一排，再点名字可以加减（点已选中的就是取消他）'
                : '点名字只看他记的问题（可以多选几个）；最右边的「＋」是加人';
        }
    }

    /**
     * 点一个审核员牌子 = 把这个人**加进/移出**「只看」，**可以多选**（和安全审核那套一样）。
     * 想一次清空就点后面那个「✕ 看全部」。
     */
    function filterByAuditor(name) {
        const who = String(name || '');
        if (!who) return;

        const cur = state.who || [];
        const next = cur.indexOf(who) >= 0
            ? cur.filter((n) => n !== who)
            : cur.concat([who]);

        setWho(next);
        toast(next.length ? `只看 ${next.join('、')} 记的问题` : '已看全部问题');
    }

    /**
     * 设定「只看这几个人」。
     * 名单非空就顺手切到问题库视图（那才看得出筛选效果），并把单位放开到「全部单位」——
     * 一个人记的问题通常挂在不同单位上，不放开的话会被当前单位挡住，看着像没筛出来。
     */
    function setWho(list) {
        state.who = [].concat(list || []).filter(Boolean);
        if (state.who.length) {
            setView('issues');
            state.unit = '__all';
        }
        render();
    }

    /**
     * 「＋」：新增一个审核员（名字 + 牌子底色 + 牌子上的字）。
     * 加完会写进**两个系统共用**的 审核员.json，所以安全审核那边刷新后也有这个人。
     */
    function openAuditorEditor() {
        const preset = ['#E8688A', '#5B8FF9', '#3FA796', '#9B7BE8', '#F5A623', '#4A90D9', '#C0C4CC'];

        openModal({
            title: '新增审核员',
            body: `
                <label class="field">
                    <span class="field-label">名字</span>
                    <input type="text" id="f-auditor" placeholder="例如：张伟">
                </label>
                <label class="field">
                    <span class="field-label">牌子颜色</span>
                    <div class="color-row">
                        <input type="color" id="f-auditor-color" value="${preset[1]}">
                        ${preset.map((c) => (
                            `<button type="button" class="color-dot" data-color="${c}"`
                            + ` style="background:${c}" title="用这个颜色"></button>`
                        )).join('')}
                    </div>
                </label>
                <label class="field">
                    <span class="field-label">一个字（可空：安全审核的日历格子里显示的那个字）</span>
                    <input type="text" id="f-auditor-short" maxlength="1"
                           placeholder="留空就取名字第一个字">
                </label>
                <p class="hint">
                    名单是和安全审核<b>共用</b>的：在这里加好，那边（拖动刷一下）也会出现这个人，
                    日历格子里就显示你填的那一个字。<br>
                    新加的人牌子上的字默认是<b>纯白</b>，想改就在「⋯ → ⟳ 编辑样式」里调。
                </p>`,
            buttons: [
                { text: '取消', cls: 'ghost', onClick: closeModal },
                {
                    text: '添加', cls: 'primary',
                    onClick: () => {
                        const name = ($('f-auditor').value || '').trim();
                        const color = $('f-auditor-color').value || '#5B8FF9';
                        const short = ($('f-auditor-short').value || '').trim().slice(0, 1);

                        if (!name) { toast('请填写名字'); return; }
                        if ((state.data.auditors || []).some((a) => a.name === name)) {
                            toast(`「${name}」已经在名单里了`);
                            return;
                        }

                        const one = { name, color, ink: '#ffffff' };   // 新建的人默认纯白字
                        if (short) one.short = short;
                        state.data.auditors.push(one);

                        closeModal();
                        // 加完把这条带子展开，能立刻看到新牌子；markChanged 里会重画
                        const bar = $('auditor-bar');
                        if (bar) bar.hidden = false;
                        markChanged();
                        pushRoster();     // 同步给安全审核那一边
                        toast(`已添加审核员「${name}」，安全审核那边刷新后也有他`);
                    }
                }
            ]
        });

        // 颜色小板子：点一下就换色，和「新增责任人」那套一致
        setTimeout(() => {
            const row = document.querySelector('#modal-body .color-row');
            if (!row) return;
            row.addEventListener('click', (e) => {
                const dot = e.target.closest('.color-dot');
                if (!dot) return;
                $('f-auditor-color').value = dot.getAttribute('data-color');
            });
        }, 40);
    }

    /* ============================== 删除审核员 ============================== */

    /**
     * 「⋯ → 🗑 删除审核员」：列出名单，点名字后面的 ✕ 就把他删掉
     * （和安全审核那套的「🗑 删除责任人」一样）。
     *
     * ⚠ 和那边有个**有意的不一样**：那边删人会把表格里所有安排中的这个名字一起去掉
     *   （因为那是「现在谁负责」，人走了这条安排就没人负责了）；
     *   这边**不动** `issues[].by` 和 `units[].auditors` ——
     *   「记录人」是历史事实（这条问题当时就是他记的），单位审核员也是，
     *   删名字等于篡改记录。所以只是名单里没有他了：牌子回落成中性灰，
     *   下拉框里不再出现他。弹层里会把「还被 N 处引用」说清楚。
     */
    function openAuditorDeleter() {
        const people = state.data.auditors || [];

        openModal({
            title: '删除审核员',
            body: `
                <p class="hint" style="margin:0 0 12px">
                    点名字后面的 ✕ 就把他从名单里删掉。<br>
                    他记过的问题<b>不会</b>跟着删（记录人是历史事实），
                    只是牌子上不再有他的颜色、下拉框里也不再出现他，
                    这些地方会显示成灰色的「名字」。<br>
                    名单是两个系统共用的，删完安全审核那边刷新一下也少这个人。
                </p>
                <div class="chips">
                    ${people.map((a) => (
                        `<span class="chip who owner-del" style="${esc(auditorStyle(a.name))}"`
                        + ` data-name="${esc(a.name)}" title="删除「${esc(a.name)}」">`
                        + `${esc(a.name)}<i class="owner-x">✕</i></span>`
                    )).join('') || '<span class="hint">名单是空的</span>'}
                </div>`,
            buttons: [{ text: '关闭', cls: 'ghost', onClick: closeModal }]
        });

        // 弹层内容是异步落定的，稍后再绑（和别的弹层一个做法）
        setTimeout(() => {
            const box = document.querySelector('#modal-body .chips');
            if (!box) return;
            box.addEventListener('click', (e) => {
                const chip = e.target.closest('.owner-del');
                if (chip) removeAuditor(chip.getAttribute('data-name'));
            });
        }, 40);
    }

    /** 真的从名单里拿掉（前面的确认和「不动引用」的理由见 openAuditorDeleter 的注释） */
    async function removeAuditor(name) {
        const who = String(name || '');
        if (!who) return;

        const byIssues = (state.data.issues || []).filter((q) => q.by === who).length;
        const byUnits = (state.data.units || [])
            .filter((u) => (u.auditors || []).indexOf(who) >= 0).length;
        const used = byIssues + byUnits;

        const ok = window.confirm(used
            ? `「${who}」还被引用 ${used} 处`
                + `（问题记录人 ${byIssues} 条、单位审核员 ${byUnits} 个单位）。\n`
                + '删除只是把他从名单里去掉 —— 那些记录还留着，\n'
                + '只是他的牌子会变成灰色的名字。确定删吗？'
            : `确定把「${who}」从审核员名单里删掉吗？`);
        if (!ok) return;

        state.data.auditors = (state.data.auditors || []).filter((a) => a.name !== who);
        // 正在「只看」他的话，顺手退出——不然列表会空一片，看着像数据没了
        state.who = (state.who || []).filter((n) => n !== who);

        markChanged();
        await pushRoster();          // 同步给安全审核那一边
        if (isModalOpen()) openAuditorDeleter();   // 弹层里的名单跟着刷新
        toast(`已删除审核员「${who}」`);
    }

    /* ============================== 编辑样式（名字牌子的颜色 / 单字） ============================== */
    /**
     * 「⋯ → 🎨 编辑样式」：给每个审核员单独定
     *   · **单字** —— 安全审核日历格子里显示的那一个字（默认取名字第一个字）；
     *   · **底色** —— 名字牌子的底色；
     *   · **字色** —— 牌子上那个字的颜色（不填 = 跟 CSS 的 --chip-ink 那道亮蓝）。
     *
     * 和安全审核（SafetyAudit/work.html）的「🎨 编辑责任人样式」是**同一个东西**：
     * 存的是两个系统共用的 审核员.json，所以在这边改，那边刷新后就是同一套，反之亦然。
     */
    function openStyleEditor() {
        const list = state.data.auditors || [];
        if (!list.length) { toast('审核员名单是空的，先去 js/check-config.js 的 AUDITORS 里加'); return; }

        // 没自定义过字色的人，取色器就默认取当前的 --chip-ink，省得用户自己猜
        const fallbackInk = W.defaultChipInk();

        const rowHtml = (a) => {
            const bg = a.color || '#6b7280';
            const ink = a.ink || fallbackInk;
            const short = a.short || String(a.name || '').slice(0, 1);
            return `<div class="style-row" data-name="${esc(a.name)}">
                <span class="style-full">${esc(a.name)}</span>
                <span class="chip who" data-preview
                      style="background:${esc(bg)};color:${esc(ink)}">${esc(short)}</span>
                <label class="style-pick"><span>单字</span>
                    <input type="text" data-k="short" maxlength="1" value="${esc(short)}"></label>
                <label class="style-pick"><span>底色</span>
                    <input type="color" data-k="color" value="${esc(bg)}"></label>
                <label class="style-pick"><span>字色</span>
                    <input type="color" data-k="ink" value="${esc(ink)}"></label>
                <span class="style-hex" data-hex>${esc(bg)} / ${esc(ink)}</span>
            </div>`;
        };

        openModal({
            title: '编辑样式 · 名字牌子',
            size: 'xl',
            buttons: [
                { text: '恢复默认', cls: 'danger', onClick: resetStyleForm },
                { spacer: true },
                { text: '取消', cls: 'ghost', onClick: closeModal },
                { text: '保存', cls: 'primary', onClick: saveStyleForm }
            ],
            body: `${list.map(rowHtml).join('')}
                <p class="hint">
                    左边是实时预览，改了马上变。<br>
                    <b>底色</b>是名字牌子的底，<b>字色</b>是牌子上的字 ——
                    这两个在审核计划表、问题卡片、单位编辑弹层里都跟着变。<br>
                    <b>单字</b>是<b>安全审核那套日历格子里显示的那一个字</b>（一格一个字），
                    法定自查这边的牌子一直显示全名，用不到它。<br>
                    名单和这三个值都是<b>两套系统共用</b>的（OSS 上的 审核员.json）——
                    在这边改，安全审核那边刷新后就是同一套。
                </p>`
        });
    }

    /**
     * 「编辑样式」里改一下输入就顺手更新预览（单字 / 底色 / 字色三种输入都走这里）。
     * ⚠ 绑在 #modal-body 上、**只绑一次**（放在 bindEvents 里）：
     *   写在 openStyleEditor() 里的话，每开一次弹层就叠一个监听器。
     */
    function onStylePreview(e) {
        const input = e.target.closest('#modal-body .style-row input');
        if (!input) return;

        const row = input.closest('.style-row');
        const name = row.getAttribute('data-name');
        const shortEl = row.querySelector('input[data-k="short"]');
        const colorEl = row.querySelector('input[data-k="color"]');
        const inkEl = row.querySelector('input[data-k="ink"]');
        const chip = row.querySelector('[data-preview]');

        if (shortEl) chip.textContent = (shortEl.value || '').trim() || String(name || '').slice(0, 1);
        if (colorEl && colorEl.value) chip.style.background = colorEl.value;
        if (inkEl && inkEl.value) chip.style.color = inkEl.value;

        const hex = row.querySelector('[data-hex]');
        if (hex) hex.textContent = `${colorEl ? colorEl.value : ''} / ${inkEl ? inkEl.value : ''}`;
    }

    /**
     * 把弹层里选的收上来存进数据（顺便把纯字符串的名单补成对象），
     * 存完再同步到**两个系统共用**的 审核员.json —— 安全审核那边刷新后就是同一套。
     */
    async function saveStyleForm() {
        const rows = Array.from(document.querySelectorAll('#modal-body .style-row'));
        if (!rows.length) { closeModal(); return; }

        rows.forEach((row) => {
            const name = row.getAttribute('data-name');
            const bg = row.querySelector('input[data-k="color"]').value;
            const inkEl = row.querySelector('input[data-k="ink"]');
            const ink = inkEl ? inkEl.value : '';
            const shortEl = row.querySelector('input[data-k="short"]');
            const short = shortEl ? (shortEl.value || '').trim().slice(0, 1) : '';

            let hit = (state.data.auditors || []).find((a) => a.name === name);
            if (!hit) {
                hit = { name, color: '', ink: '', short: '' };
                state.data.auditors.push(hit);
            }
            hit.color = bg;
            hit.ink = ink;
            hit.short = short;
        });

        closeModal();
        toast('样式已保存');
        markChanged();
        pushRoster();
    }

    /**
     * 全部恢复成 check-config.js 里 AUDITORS 的那套颜色
     * （单字 / 自定义字色一起清掉，也同步回共用名单）。
     */
    async function resetStyleForm() {
        const cfg = CFG.AUDITORS || [];
        (state.data.auditors || []).forEach((a) => {
            const c = cfg.find((x) => x.name === a.name);
            // 配置里没有这个人（页面上加的）就保留底色，只清掉自定的字 / 字色
            if (c) a.color = c.color || '';
            a.ink = (c && c.ink) || '';
            a.short = (c && c.short) || '';
        });
        closeModal();
        toast('已恢复默认颜色');
        markChanged();
        pushRoster();
    }

    /* ============================== 启动 ============================== */

    async function init() {
        initTheme();
        initView();        // 上次看的是哪一页（刷新后不要跳回问题库）
        bindEvents();
        render();          // 先把空壳画出来，别让右边白着
        await loadAll();
    }

    Object.assign(W, { render, paintViewBtn, exportJson, exportCsv, openImport, reloadAll, openStyleEditor });
    init();
})(window.Check);
