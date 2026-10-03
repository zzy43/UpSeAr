/**
 * 工作系统（5/5）启动与事件
 * ==================================================================
 * 表格上的点击分发、工具栏按钮、两个小面板的开合、启动顺序。
 * 必须最后加载：其他文件先把函数挂到 window.Work，这里才开始绑定和启动。
 */

(function (W) {
    'use strict';

    const {
        $, esc, state, board, boardWrap, modal,
        toast, closeModal, isModalOpen,
        hasPendingSave, uploadNow, loadAll,
        applyFont, currentTheme, applyTheme, initTheme,
        scrollToToday, render, holidayYears,
        openTaskEditor, openItemEditor, deleteItem, clearAssignee, togglePin,
        renderAssigneeChips, bindAssigneeDrag, bindRowDrag, openAssigneeDeleter,
        toggleBlankRow,
        toggleHideDone,
        openAssigneeStyleEditor, onStylePreview,
        clearQuery, setQueryRange,
        exportJson, openImport, exportCsv,
        toggleCalendar, bindCalendar, calToToday
    } = W;

    /* ============================== 表格点击分发 ============================== */

    function onBoardClick(e) {
        // 工作查询视图里的「← 返回表格」和「全部」
        if (e.target.closest('#btn-query-back')) {
            clearQuery();
            return;
        }
        if (e.target.closest('#btn-query-all')) {
            setQueryRange('', '');
            return;
        }

        // 点线上的日期牌 → 直接编辑那条安排（日子在时间轴外面的也只有这里能点回来）
        const due = e.target.closest('.cell-link-date');
        if (due) {
            openTaskEditor(due.getAttribute('data-item'), due.getAttribute('data-date'));
            return;
        }

        // 点格子里的责任人小牌子 → 只把这一个人移除，不打开编辑弹层
        const owner = e.target.closest('.cell-owner');
        if (owner) {
            const cell = owner.closest('.cell');
            clearAssignee(cell.getAttribute('data-item'), cell.getAttribute('data-date'),
                owner.getAttribute('data-name'));
            return;
        }

        // 行头上的编辑/删除按钮，以及左上角那一格里的「＋」（新增项目）
        const actBtn = e.target.closest('[data-act]');
        if (actBtn) {
            const act = actBtn.getAttribute('data-act');
            if (act === 'add-item') {
                openItemEditor(null);
            } else if (act === 'edit-item') {
                openItemEditor(actBtn.getAttribute('data-item'));
            } else if (act === 'pin-item') {
                togglePin(actBtn.getAttribute('data-item'));
            } else {
                deleteItem(actBtn.getAttribute('data-item'));
            }
            return;
        }

        // 日期单元格：填/改某天的安排
        const cell = e.target.closest('.cell');
        if (cell) {
            // 「只看某个人」时被藏起来的格子（别人的活）不响应点击
            if ((cell.getAttribute('data-state') || '').indexOf('hidden') >= 0) return;
            openTaskEditor(cell.getAttribute('data-item'), cell.getAttribute('data-date'));
            return;
        }

        // 行头其它位置：编辑项目
        const rowHead = e.target.closest('.row-head');
        if (rowHead) openItemEditor(rowHead.getAttribute('data-item'));
    }

    /* ============================== 按住日期表头左右拖 ============================== */

    /**
     * 在日期表头上按住鼠标左右拖，表格就跟着横向滚动，效果跟拖滚动条一样。
     * （表头那一行本来就没点击行为，所以放心让它当拖动区）
     */
    function bindHeaderDrag() {
        let dragging = false;
        let startX = 0;
        let startLeft = 0;

        board.addEventListener('mousedown', (e) => {
            const head = e.target.closest('.col-head');
            if (!head || e.button !== 0) return;

            dragging = true;
            startX = e.clientX;
            startLeft = boardWrap.scrollLeft;
            board.classList.add('is-panning');
            e.preventDefault();   // 别顺手把表头文字选中
        });

        document.addEventListener('mousemove', (e) => {
            if (!dragging) return;
            boardWrap.scrollLeft = startLeft - (e.clientX - startX);
        });

        document.addEventListener('mouseup', () => {
            if (!dragging) return;
            dragging = false;
            board.classList.remove('is-panning');
        });
    }

    /* ============================== 格子上悬浮预览详细内容 ============================== */

    /**
     * 鼠标停在「有详细内容」的格子上，浮出一个小窗预览：
     * 标题 + 详细内容（保留换行）+ 附件名单。
     * 鼠标可以移到小窗上（这样内容多了能用滚轮滑着看），
     * 滚表格、按下鼠标、鼠标离开小窗才收起来。
     */
    function bindDetailTip() {
        const tip = $('hover-tip');
        if (!tip) return;

        const TIP_W = Math.min(570, window.innerWidth - 24);
        let current = null;
        let showTimer = null;
        let hideTimer = null;

        const hideNow = () => {
            clearTimeout(showTimer);
            clearTimeout(hideTimer);
            current = null;
            tip.classList.remove('show');
            tip.hidden = true;
        };

        // 鼠标从格子挪到小窗上（或反过来）中间会先离开一次，所以延迟一点再收；
        // 真到时间了，鼠标停在小窗或原来那格上就不收（不然一滚就没了）
        const hideSoon = () => {
            clearTimeout(showTimer);
            clearTimeout(hideTimer);
            hideTimer = setTimeout(() => {
                const overTip = !tip.hidden && tip.matches(':hover');
                const overCell = current && current.matches(':hover');
                if (overTip || overCell) return;
                hideNow();
            }, 300);
        };

        const findTask = (cell) => (state.data.tasks || []).find(
            (t) => t.item === cell.getAttribute('data-item') && t.date === cell.getAttribute('data-date')
        );

        const show = (cell, task) => {
            const files = task.files || [];
            tip.innerHTML =
                (task.text ? `<div class="hover-tip-head">${esc(task.text)}</div>` : '')
                + `<div class="hover-tip-body">${esc(task.detail)}</div>`
                + (files.length
                    ? `<div class="hover-tip-foot">📎 附件：${esc(files.map((f) => f.name).join('、'))}</div>`
                    : '');

            // 先量高度，再决定浮在格子上方还是下方，都保证不超出窗口
            const rect = cell.getBoundingClientRect();
            // 这块小窗日历模式也在用（那边是自动宽度 + 只上下滚），
            // 这里用定宽，所以 width / maxWidth 和那个 is-cal 类每次都要显式清掉，
            // 不然会被日历那套限制住
            tip.style.width = `${TIP_W}px`;
            tip.style.maxWidth = 'none';
            tip.classList.remove('is-cal');
            tip.style.left = '0px';
            tip.style.top = '0px';
            tip.hidden = false;

            const h = tip.offsetHeight;
            const left = Math.max(8, Math.min(rect.left, window.innerWidth - TIP_W - 12));
            let top = rect.top - h - 8;
            if (top < 8) top = Math.min(rect.bottom + 8, window.innerHeight - h - 8);

            tip.style.left = `${left}px`;
            tip.style.top = `${Math.max(8, top)}px`;
            tip.classList.add('show');
        };

        board.addEventListener('mouseover', (e) => {
            const cell = e.target.closest('.cell');
            if (!cell || cell === current) return;

            hideNow();
            const task = findTask(cell);
            if (!task || !task.detail) return;   // 没详细内容就不浮窗

            current = cell;
            showTimer = setTimeout(() => {
                if (current === cell) show(cell, task);
            }, 180);
        });

        board.addEventListener('mouseout', (e) => {
            const cell = e.target.closest('.cell');
            if (!cell) return;
            // 在格子里挪动（从文字挪到牌子）不算离开
            if (e.relatedTarget && cell.contains(e.relatedTarget)) return;
            hideSoon();
        });

        // 鼠标停在小窗里：别收（还能滚内容）
        tip.addEventListener('mouseenter', () => {
            clearTimeout(showTimer);
            clearTimeout(hideTimer);
        });
        tip.addEventListener('mouseleave', hideSoon);

        board.addEventListener('mousedown', hideNow);
        tip.addEventListener('mousedown', hideNow);   // 点小窗 = 不要它了
        boardWrap.addEventListener('scroll', hideNow, { passive: true });
        window.addEventListener('blur', hideNow);
    }

    /* ============================== 图片附件悬浮预览 ============================== */

    /**
     * 鼠标停在「图片附件」的链接上（工作查询表、弹层里的附件列表都算），
     * 浮出图片本身看一眼；非图片附件不理会。
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
            const link = e.target.closest('a.query-file, a.file-name');
            if (!link || !isImage(link.getAttribute('href'))) return;

            clearTimeout(timer);
            timer = setTimeout(() => show(link), 200);
        });

        document.addEventListener('mouseout', (e) => {
            const link = e.target.closest('a.query-file, a.file-name');
            if (!link) return;
            if (e.relatedTarget && link.contains(e.relatedTarget)) return;
            hide();
        });

        img.addEventListener('error', hide);
        document.addEventListener('mousedown', hide);
        // 抓所有滚动容器（表格横滚时预览不能飘）
        window.addEventListener('scroll', hide, true);
    }

    /* ============================== 小面板 ============================== */

    /**
     * 两个「按钮 + 面板」：
     * · 「责任人」→ 开合工具栏上方那一排名字（stayOpen：它不是悬浮小面板，点别处不自动收，
     *   不然拖完一个名字它就没了）；
     * · 「⋯」→ 右上角那个悬浮菜单（点别处或 Esc 关掉）。
     */
    function bindPopovers() {
        const groups = [
            { btn: $('btn-assignee'), panel: $('assignee-bar'), stayOpen: true },
            { btn: $('btn-more'), panel: $('more-menu') }
        ].filter((g) => g.btn && g.panel);

        const closeAll = () => groups.forEach((g) => {
            if (!g.stayOpen) g.panel.hidden = true;
        });

        groups.forEach((g) => {
            g.btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const willOpen = g.panel.hidden;
                closeAll();
                g.panel.hidden = !willOpen;
            });

            g.panel.addEventListener('click', (e) => {
                // 面板内部的点击不要冒泡到 document，否则拖牌子时面板会自己关
                e.stopPropagation();
                // 「更多」里点了菜单项就把菜单收起来
                if (e.target.closest('.menu-item')) g.panel.hidden = true;
            });
        });

        document.addEventListener('click', closeAll);
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeAll();
        });
    }

    /* ============================== 更新节假日 ============================== */

    /**
     * 工具栏「‥」→「↻ 更新节假日」：去网上把当前视图用到的那几年的放假安排拉下来。
     *
     * 为什么是手动的：节假日数据一年只变一次，启动时联网只会拖慢打开速度，
     * 所以不自动拉，用户自己点（2026-09-21 用户要求）。
     * 拉取 / 合并 / 缓存都在 work-holidays.js 末尾，这里只负责「点一下 → 报结果」。
     */
    async function updateHolidays() {
        const api = window.WORK_HOLIDAYS_FETCH;
        if (!api) { toast('节假日模块没加载到，看看 js/work-holidays.js 有没有报错'); return; }

        // 当前视图用到的年份：日历模式是三栏那几个年，表格模式是时间轴跨的年
        const years = holidayYears();
        toast(`正在更新节假日（${years.join('、')} 年）…`);

        let res;
        try {
            res = await api.updateYears(years);
        } catch (e) {
            toast('更新节假日失败：' + ((e && e.message) || e));
            return;
        }

        // 一年都没拉到：没网 / CDN 被拦。本地那份照常用，不影响任何功能
        if (!res.ok) {
            toast(`❌ 更新失败：连不上节假日数据源（${res.failed.join('、')} 年）—— 检查网络后重试`);
            return;
        }

        if (res.added > 0) {
            render();     // 重画一次，标记立刻就出来
            toast(`✅ 更新成功：新补了 ${res.added} 天`
                + (res.missing.length ? `；${res.missing.join('、')} 年还没公布` : '')
                + (res.failed.length ? `；${res.failed.join('、')} 年拉取失败` : ''));
            return;
        }

        if (res.missing.length) {
            // 官方文件里就是空的：放假通知还没发，等公布后再点一次
            toast(`ℹ 没有可更新的：${res.missing.join('、')} 年的放假通知官方还没公布`);
            return;
        }

        toast(`ℹ 已是最新：表里已有 ${years.join('、')} 年的安排（从网上核对过 ${res.got} 条）`);
    }

    /* ============================== 事件绑定 ============================== */

    function bindEvents() {
        board.addEventListener('click', onBoardClick);

        // 查询里的日期范围：改了就重新列一遍
        board.addEventListener('change', (e) => {
            const id = e.target.id;
            if (id !== 'q-from' && id !== 'q-to') return;
            setQueryRange($('q-from').value, $('q-to').value);
        });

        $('btn-today').addEventListener('click', () => {
            // 日历模式下「回到今天」= 跳回今天所在的那个月
            if (state.calendar) calToToday();
            else scrollToToday('smooth');
        });
        $('btn-calendar').addEventListener('click', toggleCalendar);
        $('btn-add-item').addEventListener('click', () => openItemEditor(null));
        $('btn-export').addEventListener('click', exportJson);
        $('btn-export-csv').addEventListener('click', exportCsv);
        $('btn-blankrow').addEventListener('click', toggleBlankRow);
        $('btn-hidedone').addEventListener('click', toggleHideDone);
        $('btn-import').addEventListener('click', openImport);
        $('btn-del-assignee').addEventListener('click', openAssigneeDeleter);
        $('btn-style-assignee').addEventListener('click', openAssigneeStyleEditor);

        // 「编辑责任人样式」里改一下输入就更新左边那个预览牌子。
        // ⚠ 绑在 #modal-body 上、**只绑一次** —— 写在 openAssigneeStyleEditor() 里
        //   会每开一次弹层叠一个监听器。
        $('modal-body').addEventListener('input', onStylePreview);

        // 点「工作查询」小框：正在查询的话回到表格
        $('work-query').addEventListener('click', () => {
            if (state.query) clearQuery();
        });

        // 亮色 / 暗色切换
        $('btn-theme').addEventListener('click', () => {
            applyTheme(currentTheme() === 'light' ? 'dark' : 'light');
        });

        $('btn-reload').addEventListener('click', async () => {
            // 先把还没传完的改动传上去，再重新拉取，避免刚改的内容被覆盖
            if (hasPendingSave()) await uploadNow();
            await loadAll();
            toast('已从 OSS 重新载入');
        });

        $('btn-holidays').addEventListener('click', updateHolidays);

        // 有改动还没传完就想关页面时拦一下
        window.addEventListener('beforeunload', (e) => {
            if (hasPendingSave()) {
                e.preventDefault();
                e.returnValue = '';
            }
        });

        $('modal-x').addEventListener('click', closeModal);

        // 点弹层外面的背景把弹层关掉。
        // ⚠ 不能写成 `click + e.target === modal`：在输入框里用鼠标**框选文字**时，
        //   如果拖出了卡片再松手，click 会打在「按下点和松开点的共同祖先」上
        //   （也就是这个背景），弹层就会莫名其妙自己关掉 —— 看着像「闪退」。
        //   所以必须确认**按下和松开都在背景上**才算点背景（2026-09-21 修）。
        let downOnBackdrop = false;
        modal.addEventListener('mousedown', (e) => {
            downOnBackdrop = (e.target === modal);
        });
        modal.addEventListener('mouseup', (e) => {
            const onBackdrop = (e.target === modal);
            if (downOnBackdrop && onBackdrop) closeModal();
            downOnBackdrop = false;
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && isModalOpen()) closeModal();
            // 弹层里 Ctrl/Cmd + Enter 直接保存
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && isModalOpen()) {
                const primary = $('modal-foot').querySelector('.btn.primary');
                if (primary) primary.click();
            }
        });
    }

    /* ============================== 启动 ============================== */

    bindEvents();
    bindPopovers();
    bindAssigneeDrag();
    bindRowDrag();
    bindHeaderDrag();
    bindCalendar();
    bindDetailTip();
    bindImageTip();
    renderAssigneeChips();
    applyFont();
    initTheme();
    loadAll().catch((e) => {
        console.error('工作系统初始化失败：', e);
        toast('初始化失败：' + e.message);
    });
})(window.Work);
