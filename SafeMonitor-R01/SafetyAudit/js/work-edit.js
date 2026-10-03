/**
 * 工作系统（3/5）编辑层
 * ==================================================================
 * 单元格安排的填写/删除、工作项目的增删改、责任人小牌子拖到格子里。
 * 依赖 work-core.js（弹层/提示/保存）和 work-board.js（重渲染）。
 */

(function (W) {
    'use strict';

    const {
        $, esc, parseDate, uid,
        state, CFG, WEEK_LABEL, board, boardWrap,
        toast, openModal, closeModal, markChanged, render,
        assigneeColor, assigneeStyle, assigneeList, pushRoster, defaultChipInk,
        filterList, filterOn, lsGet, lsSet
    } = W;

    /* ============================== 空白行（首行的新工作占位） ============================== */

    /*
     * 首行永远留一条空的，方便随手加新工作（2026-09-21 用户要求）。
     *
     * ⚠ **这条空白行不是 state.data.items 里的东西** —— 它只是渲染时多画的一行
     *   （work-board.js 的 render），所以不会污染数据、也不会被存到 OSS 上。
     *   用户真在上面干活了（填名字 / 点格子存内容 / 拖个人上去），
     *   才在那一刻把它「做实」成一个真的工作项目。
     *   做实是 unshift 到 items 最前面 —— 所以**做实后它还是第一行**，
     *   新的空白行自动出现在它上面（这就是用户要的「每次添加了新工作，首行再自动生成新空白」）。
     */
    const BLANKROW_KEY = 'safemonitor:work:blankrow';

    /**
     * 启动时恢复那个开关。
     * ⚠ **默认是关的**（2026-09-21 用户要求）：首次打开（浏览器里没这个键）不显示空白行，
     *   只有用户自己点开过一次、把 '1' 写进去之后才默认开着。
     */
    function restoreBlankRow() {
        state.blankRow = lsGet(BLANKROW_KEY) === '1';
    }

    /**
     * 工具栏那个按钮的文案跟着开关走。
     * ⚠ 文案**开/关都一样**，只写「▤ 空白行」—— 2026-09-21 用户要求
     *   「不要有『空白行 关』这样，直接『空白行』就行了，底色已经做了区分」，
     *   开关状态靠 `.btn.is-on` 的底色区分（和「▤ 日历模式」那个按钮一个规矩）。
     */
    function paintBlankRowBtn() {
        const btn = $('btn-blankrow');
        if (!btn) return;
        btn.classList.toggle('is-on', !!state.blankRow);
        btn.textContent = '▤ 空白行';
        btn.title = state.blankRow
            ? '第一行是留给你填新工作的空白行；点一下可以关掉'
            : '现在不显示第一行那条空白行；点一下打开';
    }

    /** 开 / 关空白行 */
    function toggleBlankRow() {
        state.blankRow = !state.blankRow;
        lsSet(BLANKROW_KEY, state.blankRow ? '1' : '0');
        paintBlankRowBtn();
        render();
        toast(state.blankRow ? '已打开：第一行留一条空白行' : '已关闭：第一行不留空白行');
    }

    /**
     * 把空白行做实成一个真的工作项目，返回新项目的 id。
     * 名字没给就自动起一个（工作A001 那种，见 nextItemName）。
     */
    function materializeBlank(name) {
        if (!Array.isArray(state.data.items)) state.data.items = [];
        const item = {
            id: uid('item'),
            name: String(name || '').trim() || nextItemName(),
            subtitle: ''
        };
        state.data.items.unshift(item);
        return item.id;
    }

    /**
     * 传进来的可能是空白行的假 id：那就在这一刻做实，返回真项目的 id。
     * 各个「真的要写数据」的入口先过一道它（见 upsertTask / assignTo）。
     */
    function resolveItemId(itemId) {
        if (itemId !== W.BLANK_ID) return itemId;
        const id = materializeBlank();
        const item = findItem(id);
        toast(`已新建「${(item && item.name) || '新工作'}」，接着往里面填就行`);
        return id;
    }

    /*
     * 「✓ 已完成项」开关（2026-09-21 用户要求：「工具栏增加一个按钮，实现显示/隐藏 已完成项」）。
     * 管的是**已完成的工作项目**（整行藏起来，只看还没干完的）——
     * 已完成的**单条安排**不管，它们留在自己项目的格子里。
     * 和「空白行」一个规矩：默认是显示的（关），点过一次就记住（localStorage）。
     */
    const HIDEDONE_KEY = 'safemonitor:work:hidedone';

    /** 启动时恢复那个开关（默认 false = 显示） */
    function restoreHideDone() {
        state.hideDone = lsGet(HIDEDONE_KEY) === '1';
    }

    /** 按钮文案 + 开关底色（文案开/关都一样，靠 .is-on 区分，和「▤ 空白行」一致） */
    function paintHideDoneBtn() {
        const btn = $('btn-hidedone');
        if (!btn) return;
        btn.classList.toggle('is-on', !!state.hideDone);
        btn.textContent = '✓ 已完成项';
        btn.title = state.hideDone
            ? '现在把已完成的工作项目整行藏起来了；点一下显示出来'
            : '点一下把已完成的工作项目藏起来（只看还没干完的）';
    }

    /** 开 / 关「隐藏已完成项」，重画表格 */
    function toggleHideDone() {
        state.hideDone = !state.hideDone;
        lsSet(HIDEDONE_KEY, state.hideDone ? '1' : '0');
        paintHideDoneBtn();
        render();
        toast(state.hideDone ? '已隐藏已完成的工作项目' : '已显示全部工作项目');
    }

    /* ============================== 单元格：某天的安排 ============================== */

    function findItem(itemId) {
        return (state.data.items || []).find((i) => i.id === itemId);
    }

    /**
     * 「填安排」弹层里那行责任人 —— **只画牌子，不写任何说明文字**
     * （2026-09-21 用户要求：「责任人（第一个人是主责任人…）」和
     *   「把上面那一排名字牌子拖到…就能加人」这两句都去掉）。
     * 怎么减人依然能看到：牌子自己的 title 写了「把「某某」从这条安排里移除」。
     *
     * 为什么这个牌子还得在弹层里（日历模式没有格子可点）：
     *   加人靠拖名字牌子（表格拖到格子上 / 日历拖到当天那条安排上）；
     *   减人表格模式是点格子里的名字，日历模式就只能点这里的 ✕。
     */
    function ownersHint(itemId, date) {
        const task = (state.data.tasks || []).find((t) => t.item === itemId && t.date === date);
        const owners = (task && task.assignees) || [];

        return owners.map((n) => (
            `<span class="cell-owner owner-del" data-owner="${esc(n)}"`
            + ` style="${esc(assigneeStyle(n))}" title="把「${esc(n)}」从这条安排里移除">`
            + `${esc(n)}<i class="owner-x">✕</i></span>`
        )).join('');
    }

    /**
     * 填/改某天的安排。**内容、详细内容、相关文件一次填完**，不再分两个弹层。
     *
     * 2026-09-21 用户要求：「添加新工作，直接用一个大一点的对话框，不要另外再点一次
     * 详细说明的按钮。逻辑和弹窗大小参考 check 里面『编辑问题』那个弹窗」——
     * 所以现在：
     *   · `size: 'xl'`（1488px，和法定自查的「编辑问题」同一个规格，字号也跟着放大）；
     *   · 原来的「📄 详细 / 文件」弹层（openDetailEditor）已经并进来了，那个按钮去掉了；
     *   · 附件和那边一个规矩：**上传是立刻的，但要点「保存」才挂到这条安排上**
     *     （见 work-io.js 的 bindFileBox）—— 好处是保存前能看到传了哪些、也能删掉传错的。
     */
    function openTaskEditor(itemId, date) {
        const item = findItem(itemId);
        const isBlank = itemId === W.BLANK_ID;   // 首行那条空白行（还没做实）
        const existing = (state.data.tasks || []).find((t) => t.item === itemId && t.date === date);
        const d = parseDate(date);

        // 附件区先建好，保存时读它的 get()
        let fileBox = null;

        openModal({
            size: 'xl',
            title: `${item ? item.name : (isBlank ? '新工作' : '任务')} · ${date} ${WEEK_LABEL[d.getDay()]}`,
            body: `
                <label class="field">                    
                    <div class="date-parts">
                        <input type="number" id="f-y" value="${d.getFullYear()}"
                               min="2000" max="2100" inputmode="numeric">
                        <span class="date-unit">年</span>
                        <input type="number" id="f-m" value="${d.getMonth() + 1}"
                               min="1" max="12" inputmode="numeric">
                        <span class="date-unit">月</span>
                        <input type="number" id="f-d" value="${d.getDate()}"
                               min="1" max="31" inputmode="numeric">
                        <span class="date-unit">日</span>
                    </div>
                </label>
                <label class="field">
                    <span class="field-label">工作内容：</span>
                    <textarea id="f-text" rows="2" placeholder="例如：与飞行部对接审核准备会材料"
                    >${existing ? esc(existing.text) : ''}</textarea>
                </label>
                <label class="field">
                    <span class="field-label">详细内容：</span>
                    <textarea id="f-detail" class="tall"
                        placeholder="例如：与飞行部对接审核准备会材料，核对近三月飞行记录抽样清单……"
                    >${existing ? esc(existing.detail || '') : ''}</textarea>
                </label>
                <div class="field">
                    <span class="field-label">相关文件（可空：把文件拖进虚线框，或点「选择文件」）</span>
                    <div class="file-list" id="f-file-list"></div>
                    <div class="drop-zone" id="f-drop-zone">
                        把文件拖到这里，或者
                        <button type="button" class="btn ghost" id="f-pick">选择文件</button>
                        <input type="file" id="f-file-input" multiple hidden>
                    </div>
                </div>
                <p class="hint" id="f-owners"${existing && (existing.assignees || []).length ? ' style="margin-top:14px"' : ''}>${ownersHint(itemId, date)}</p>
                <label class="check">
                    <input type="checkbox" id="f-done" ${existing && existing.done ? 'checked' : ''}>
                    <span>已完成</span>
                </label>
            `,
            buttons: [
                existing ? {
                    text: '删除', cls: 'danger',
                    onClick: () => removeTask(itemId, date)
                } : null,
                { text: '取消', cls: 'ghost', onClick: closeModal },
                {
                    text: '保存', cls: 'primary',
                    onClick: () => {
                        // ⚠ 一行都存：文字 + 详细 + 附件。
                        //   从空白行进来的话，「保存」这一下才真建项目（saveTaskForm → upsertTask）
                        const saved = saveTaskForm(itemId, date, {
                            detail: $('f-detail') ? $('f-detail').value.trim() : '',
                            files: fileBox ? fileBox.get() : null
                        });
                        if (saved) {
                            closeModal();
                            render();
                            toast('已保存');
                        }
                    }
                }
            ].filter(Boolean)
        });

        // 附件区（拖放 / 选择 / 去掉某个）
        fileBox = W.bindFileBox({
            list: 'f-file-list',
            zone: 'f-drop-zone',
            input: 'f-file-input',
            pick: 'f-pick',
            files: (existing && existing.files) || []
        });

        setTimeout(() => {
            const el = $('f-text');
            if (el) {
                el.focus();
                el.setSelectionRange(el.value.length, el.value.length);
            }

            // 年/月/日：点进去全选（直接打数字就能换掉），年填满跳月、月填满跳日
            const yEl = $('f-y');
            const mEl = $('f-m');
            const dEl = $('f-d');
            if (!yEl || !mEl || !dEl) return;
            [yEl, mEl, dEl].forEach((el2) => el2.addEventListener('focus', () => el2.select()));
            yEl.addEventListener('input', () => { if (yEl.value.length >= 4) mEl.focus(); });
            mEl.addEventListener('input', () => { if (mEl.value.length >= 2) dEl.focus(); });

            // 点责任人牌子后面的 ✕ = 把他从这条安排里移除。
            // 日历模式下没有格子可点，这里就是唯一的移除入口。
            const owners = $('f-owners');
            if (owners) {
                owners.addEventListener('click', (e) => {
                    const chip = e.target.closest('[data-owner]');
                    if (!chip) return;
                    clearAssignee(itemId, date, chip.getAttribute('data-owner'));
                    // 列表原地重画，不动已填的内容；一个都不剩时把那段间距也收掉
                    owners.innerHTML = ownersHint(itemId, date);
                    owners.style.marginTop = owners.innerHTML ? '14px' : '';
                });
            }
        }, 40);
    }

    /**
     * 读弹层里的表单、校验后写进数据（改日期就是搬家）。
     * 成功返回那条安排（含新日期），失败或用户取消返回 null。
     *
     * @param {Object} [extra] 一并写回去的东西：`{ detail, files }`
     *        （2026-09-21 并了「详细 / 文件」弹层之后，这些和正文是同一次保存）
     */
    function saveTaskForm(itemId, date, extra) {
        const existing = (state.data.tasks || []).find((t) => t.item === itemId && t.date === date);
        const text = $('f-text').value.trim();

        // 日期：年月日分开填，这里拼回去并检查是不是真实存在的一天
        const y = Number($('f-y').value);
        const m = Number($('f-m').value);
        const day = Number($('f-d').value);
        const dt = new Date(y, m - 1, day);
        if (!y || !m || !day || dt.getFullYear() !== y
            || dt.getMonth() !== m - 1 || dt.getDate() !== day) {
            toast('日期不对，检查一下年 / 月 / 日');
            return null;
        }

        // 只有责任人的安排是允许的，所以有责任人时可以留空内容
        const hasOwner = !!(existing && (existing.assignees || []).length);
        if (!text && !hasOwner) {
            toast('内容不能为空；要清空这条安排请点「删除」');
            return null;
        }

        const task = upsertTask(itemId, date, text, $('f-done').checked, W.fmtDate(dt));

        // 详细内容 / 附件跟正文一起存（upsertTask 已经 markChanged 过一次，
        // 改完这些再补一次，保证写回 OSS 的是这一份完整的）
        if (task && extra) {
            if (extra.detail !== undefined) task.detail = extra.detail;
            if (extra.files) task.files = extra.files.slice();
            markChanged();
        }

        return task;
    }

    /**
     * 保存某天的安排；newDate 跟 date 不一样就表示用户改了日期，把这条安排搬过去。
     * 目标那天已经有安排了就先问一句，用户点了取消就返回 null。（不关弹层，由调用方决定）
     */
    function upsertTask(itemId, date, text, done, newDate) {
        // 从空白行来的：**到真要存这一步才做实** —— 只是点开弹层又取消的话，
        // 不会白留一条「工作A001」在表里
        itemId = resolveItemId(itemId);

        const target = newDate || date;
        const tasks = state.data.tasks || (state.data.tasks = []);

        if (target !== date) {
            const clash = tasks.find((t) => t.item === itemId && t.date === target);
            if (clash) {
                if (!window.confirm(`${target} 这天已经有安排了，覆盖它吗？`)) return null;
                state.data.tasks = tasks.filter((t) => t !== clash);
            }
        }

        const found = state.data.tasks.find((t) => t.item === itemId && t.date === date);
        if (found) {
            found.date = target;      // 改日期 = 把这条安排搬到新的一天
            found.text = text;
            found.done = !!done;
        } else {
            state.data.tasks.push({ item: itemId, date: target, text, done: !!done });
        }

        markChanged();
        render();

        if (target !== date) {
            // 日子在时间轴外面也允许存，只是表格上没有那一格，连线会画到最边上一格
            const inRange = state.dates.indexOf(target) >= 0;
            toast(inRange
                ? `已把这条安排挪到 ${target}`
                : `已挪到 ${target}：超出时间轴，连线画在最边上那一格`);
        }

        return state.data.tasks.find((t) => t.item === itemId && t.date === target) || null;
    }

    /*
     * 「📄 详细 / 文件」那个独立弹层（openDetailEditor）、以及它用的 sizeText()
     * 2026-09-21 已经**删掉**：用户要求「添加新工作直接用一个大一点的对话框，
     * 不要另外再点一次详细说明的按钮」，于是详细内容 + 附件都并进了上面的
     * openTaskEditor（size: 'xl'，和法定自查的「编辑问题」同一个规格）。
     * 附件的上传/画列表/去掉那套搬到了 work-io.js 的 bindFileBox()。
     */


    function removeTask(itemId, date) {
        state.data.tasks = (state.data.tasks || []).filter((t) => !(t.item === itemId && t.date === date));
        markChanged();
        closeModal();
        render();
    }

    /*
     * 置顶（2026-09-21 用户要求：「工作项目添加置顶功能，比如重要的工作项目，
     * 用户可以放在最上面。但是在空白行下面」）。
     *
     * ⚠ 只用 `items[].pinned` 这一个标记 + **数组顺序**来表达，**不另写 sort**：
     *   「置顶的都在数组最前面」就是全部规则。所以只有三种操作：
     *     · 置顶 / 取消 → placeItem()
     *     · 拖拽顺序     → moveItem()（跨过边界就自动加/去置顶）
     *     · 「只看」置顶  → bringHitsToTop()（改成只在两区内部重排）
     *   首行那条空白行是渲染时画出来的（见 work-board.js），永远在所有项目之上，
     *   所以「最上面」指的是空白行下面第一行。
     */

    /** 置顶项有几个（= 置顶区占了数组的前几个） */
    const pinnedCount = () => (state.data.items || []).filter((i) => i.pinned).length;

    /*
     * 工作项目的**自动排序**（2026-09-21 用户要求）：
     *   「工作项目，按临近日期从上到下排列。比如 9 月 22 日的工作，就排在 9 月 24 日前面。
     *     除非用户手动移动工作项目的排序。」
     *   「没有具体工作的工作项目，移动到上端行，同时底色也做好标记。」
     *
     * 所以一整条流水线（`reorder()`，每次数据变都跑一遍）分成四段，段内保持原来的先后：
     *   ① 置顶区      —— 用户亲手钉的，永远最上面（空白行下面）
     *   ② 还没排活的项目（一条安排都没有）—— 提到上端，底色 + 左边金条标记「待安排」
     *   ③ 有活没干完的 —— **按「最早那条未完成的安排」升序**：
     *                      过去的日期天然排在未来的前面（超期的最急），9/22 排在 9/24 前面
     *   ④ 已完成的项目 —— 沉到最下面（见上面那段）
     *
     * ⚠ ③ 里面**用户手动拖过的行（`item.manual`）不参与排序**，就留在原位 ——
     *   这就是「除非用户手动移动」：拖过谁，谁就永久脱离自动排序（存进 items[].manual）。
     * ⚠ 序号是**段内**的：手动拖过的项目依然会跟着它自己的状态换段
     *   （比如把安排全删完，它会跟着进 ② 段），只是在段里不按日期挪。
     *
     * ⚠ 重排是**真的改 items 数组顺序**，不是只在渲染时换个画法：
     *   「数组顺序 = 显示顺序」是这个表格唯一的第一真相（和上面置顶那条一样），
     *   只在渲染时重排的话，拖动排序会按视觉落点去算数组的下标，一拖就乱。
     * ⚠ 已完成的项目沉底时顺手把 pinned 清掉：带个 pinned 标记排在数组中间，
     *   「置顶的 = 数组最前面那几个」这条不变量就破了（拖动、placeItem 全会算错）。
     *   反过来也成立：已完成的项目不给置顶（togglePin 会拦，拖到顶上也不置顶）。
     */

    /** 这个项目名下有几条安排 */
    const taskCountOf = (item) => (state.data.tasks || []).filter((t) => t.item === item.id).length;

    /**
     * 「临近日期」：这个项目**还没干完的安排里最早的那一天**（YYYY-MM-DD）。
     * 都没安排就返回空串。日期是字符串，直接比大小就是按时间先后比 ——
     * 过去的日子天然小于未来，所以超期的会排在最前面（那本来最急）。
     */
    function nextDateOf(item) {
        let min = '';
        (state.data.tasks || []).forEach((t) => {
            if (t.item !== item.id || t.done || !t.date) return;
            if (!min || t.date < min) min = t.date;
        });
        return min;
    }

    /** 一个工作项目名下的安排是否已经全部完成（至少 1 条） */
    function itemFinished(item) {
        if (!item) return false;
        const list = (state.data.tasks || []).filter((t) => t.item === item.id);
        return list.length > 0 && list.every((t) => t.done);
    }

    /**
     * 段内按「临近日期」升序，**手动拖过的项原地不动**：
     * 取出所有非手动项占的槽位，排序后按槽位填回去。
     * （Array.sort 是稳定的，同一天的几项保持原来的先后。）
     */
    function sortByNextDate(list) {
        const slots = [];
        const movable = [];
        list.forEach((i, n) => {
            if (i.manual) return;
            slots.push(n);
            movable.push(i);
        });
        if (movable.length < 2) return;

        movable.sort((a, b) => {
            const ka = nextDateOf(a);
            const kb = nextDateOf(b);
            if (ka === kb) return 0;
            return ka < kb ? -1 : 1;
        });

        slots.forEach((slot, n) => { list[slot] = movable[n]; });
    }

    /**
     * 摆正 items 的顺序（四段：置顶 → 没排活的 → 按临近日期 → 已完成）。
     * 顺序真的变了（或清掉了置顶标记）就返回 true。
     * 由 work-core.js 的 markChanged() 和 paintData() 调用。
     */
    function reorder() {
        const items = state.data.items;
        if (!Array.isArray(items) || items.length < 2) return false;

        const before = items.slice();

        const pinned = [];
        const empty = [];
        const normal = [];
        const fin = [];
        items.forEach((i) => {
            if (itemFinished(i)) {
                if (i.pinned) i.pinned = false;   // 完成了就不再占着置顶位（见上面那段）
                fin.push(i);
            } else if (i.pinned) {
                pinned.push(i);
            } else if (taskCountOf(i)) {
                normal.push(i);
            } else {
                empty.push(i);
            }
        });

        sortByNextDate(normal);

        const next = pinned.concat(empty, normal, fin);
        if (next.length === before.length && next.every((x, n) => x === before[n])) return false;

        state.data.items = next;
        return true;
    }

    /**
     * 把一个项目放到「置顶区」或「普通区」的第一位。
     * @param {Object} item  已经在 items 里的，或刚落好没进去的
     * @param {boolean} pinned
     */
    function placeItem(item, pinned) {
        const items = state.data.items || (state.data.items = []);
        const idx = items.indexOf(item);
        if (idx >= 0) items.splice(idx, 1);

        item.pinned = !!pinned;
        if (item.pinned) {
            items.unshift(item);                                    // 置顶：放到最上面
            return;
        }
        // 普通：排到所有置顶项后面（不是塞回原位，那样去、去不回来更绕）
        items.splice(items.filter((i) => i.pinned).length, 0, item);
    }

    /** 置顶 / 取消置顶（行头上那个 ▲） */
    function togglePin(itemId) {
        const item = findItem(itemId);
        if (!item) return;

        // 已完成的项目是自动沉到最下面的，置顶会被下一次 reorder 立刻抹掉 —— 
        // 与其让用户看到「点了没反应」，不如直说
        if (itemFinished(item)) {
            toast(`「${item.name}」名下的安排都做完了，会自动排在表格最下面，不用置顶`);
            return;
        }

        const want = !item.pinned;
        placeItem(item, want);
        markChanged();
        render();
        toast(want ? `已把「${item.name}」置顶` : `已取消「${item.name}」的置顶`);
    }

    /* ============================== 责任人（拖到格子里） ============================== */

    let dragAssignee = null;   // 正在被拖的人名
    let lastDropCell = null;   // 当前高亮的格子

    /** 责任人一排：几个名字牌子 + 最右边一个「＋」用来新增人 */
    function renderAssigneeChips() {
        const box = $('assignee-chips');
        if (!box) return;

        box.innerHTML = (assigneeList() || []).map((p) => (
            `<span class="chip" draggable="true" data-name="${esc(p.name)}"`
            + ` style="${esc(assigneeStyle(p.name))}"`
            + ` title="拖到某天的格子上排活（日历模式里拖到那天的安排上）；点一下把这个人的活加进/移出「只看」">`
            + `${esc(p.name)}<i class="chip-x">✕</i></span>`
        )).join('')
            // 多选时给个一次清空的入口，不用一个个点掉
            + (filterOn() ? '<span class="chip chip-clear" id="chip-clear"'
                + ' title="取消只看，显示全部安排">✕ 看全部</span>' : '')
            + '<button class="chip-add" id="btn-add-assignee" type="button"'
            + ' title="新增责任人">＋</button>';

        // 点名字 = 把这个人的活加进/移出「只看」（可以多选）；点「＋」= 加人。
        // 只绑一次，重复渲染不会绑重
        if (!box.dataset.boundClick) {
            box.dataset.boundClick = '1';
            box.addEventListener('click', (e) => {
                if (e.target.closest('.chip-add')) {
                    openAssigneeEditor();
                    return;
                }
                if (e.target.closest('.chip-clear')) {
                    setFilter('');
                    return;
                }
                const chip = e.target.closest('.chip');
                if (chip) setFilter(chip.getAttribute('data-name'));
            });
        }

        paintFilter();
    }

    /** 「⋯ → 删除责任人」：列出名单，点名字后面的 ✕ 就把他删掉 */
    function openAssigneeDeleter() {
        const people = assigneeList();

        openModal({
            title: '删除责任人',
            body: `
                <p class="hint" style="margin:0 0 12px">点名字后面的 ✕ 就把他从名单里删掉；
                   他名下还有安排的话，那些安排里他的名字会一起去掉
                   （那格如果只剩内容就保留，空的就跟着删）。</p>
                <div class="chips" id="del-chips">
                    ${people.map((p) => (
                        `<span class="cell-owner owner-del" style="${esc(assigneeStyle(p.name))}"`
                        + ` data-name="${esc(p.name)}" title="删除「${esc(p.name)}」">`
                        + `${esc(p.name)}<i class="owner-x">✕</i></span>`
                    )).join('') || '<span class="hint">名单是空的</span>'}
                </div>
            `,
            buttons: [{ text: '关闭', cls: 'ghost', onClick: closeModal }]
        });

        setTimeout(() => {
            const box = $('del-chips');
            if (!box) return;
            box.addEventListener('click', (e) => {
                const chip = e.target.closest('.owner-del');
                if (chip) removeAssignee(chip.getAttribute('data-name'));
            });
        }, 40);
    }

    /**
     * 「⋯ → 🎨 编辑责任人样式」：给每个责任人定
     *   · **单字** —— 日历格子里那个字（默认取名字第一个字，可以改成「宇」「泰」等）；
     *   · **底色** —— 名字牌子的底色；
     *   · **字色** —— 牌子上那个字的颜色（不填 = 跟 CSS 的 --chip-ink 那道亮蓝）。
     * 左边是实时预览（就是日历里那个牌子的样子）。
     * 存进**两个系统共用的 审核员.json**（法定自查的「🎨 编辑样式」改的也是它），
     * 所以在这边改、在 check 里也生效，反之亦然。
     */
    function openAssigneeStyleEditor() {
        const people = assigneeList();
        if (!people.length) { toast('责任人名单是空的，先去 js/work-config.js 的 ASSIGNEES 里加'); return; }

        // 没自定义过字色的人，取色器默认取当前的 --chip-ink，省得用户自己猜
        const fallbackInk = defaultChipInk();

        const rowHtml = (p) => {
            const bg = p.color || '#7a8087';
            const ink = p.ink || fallbackInk;
            const short = p.short || String(p.name || '').slice(0, 1);
            return `<div class="style-row" data-name="${esc(p.name)}">
                <span class="style-full">${esc(p.name)}</span>
                <span class="cal-owner" data-preview
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
            title: '编辑责任人样式',
            // 「恢复默认」已按用户要求去掉（2026-09-21）：弹层里就只留 取消 / 保存
            buttons: [
                { text: '取消', cls: 'ghost', onClick: closeModal },
                { text: '保存', cls: 'primary', onClick: saveAssigneeStyle }
            ],
            body: `${people.map(rowHtml).join('')}
                <p class="hint">
                    左边那个小牌子就是<b>日历格子里的样子</b> —— 一格一个字，底色区分人。<br>
                    <b>单字</b>：默认取名字第一个字，可以改成任意一个字（比如「朱震宇」用「宇」）。<br>
                    <b>底色 / 字色</b>：表格里、日历里、弹层里那个名字牌子的颜色，改了都跟着变。<br>
                    这份名单是<b>和「法定自查」共用的</b>（OSS 上的 审核员.json）——
                    在这边改，那边刷新后也是同一套。
                </p>`
        });
    }

    /**
     * 「编辑责任人样式」里改一下输入就顺手更新预览。
     * ⚠ 这个监听器是**全局委托、只绑一次**的（见下方 $('modal-body') 的绑定），
     *   不要写在 openAssigneeStyleEditor() 里 —— 那样每开一次弹层就叠一个。
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

        chip.textContent = (shortEl.value || '').trim() || String(name || '').slice(0, 1);
        if (colorEl && colorEl.value) chip.style.background = colorEl.value;
        if (inkEl && inkEl.value) chip.style.color = inkEl.value;

        const hex = row.querySelector('[data-hex]');
        if (hex) hex.textContent = `${colorEl ? colorEl.value : ''} / ${inkEl ? inkEl.value : ''}`;
    }

    /**
     * 把弹层里填的收上来存进数据（名单里还没有就先复制一份）
     * 存完立刻同步到**两个系统共用**的 审核员.json，那边一刷新就是同一套。
     */
    async function saveAssigneeStyle() {
        const rows = Array.from(document.querySelectorAll('#modal-body .style-row'));
        if (!rows.length) { closeModal(); return; }

        // 数据里还没有名单就先刻一份，再改
        if (!Array.isArray(state.data.assignees) || !state.data.assignees.length) {
            state.data.assignees = assigneeList().map((p) => ({ name: p.name, color: p.color }));
        }

        rows.forEach((row) => {
            const name = row.getAttribute('data-name');
            const short = (row.querySelector('input[data-k="short"]').value || '').trim().slice(0, 1);
            const color = row.querySelector('input[data-k="color"]').value;
            const inkEl = row.querySelector('input[data-k="ink"]');
            const ink = inkEl ? inkEl.value : '';

            let hit = state.data.assignees.find((p) => p.name === name);
            if (!hit) {
                hit = { name, color: '' };
                state.data.assignees.push(hit);
            }
            hit.color = color;
            if (ink) hit.ink = ink; else delete hit.ink;
            if (short) hit.short = short; else delete hit.short;
        });

        closeModal();
        toast('责任人样式已保存');
        markChanged();
        renderAssigneeChips();
        pushRoster();          // 同步给法定自查那一套
    }

    /** 真的删掉：从名单里拿掉，并把表格里所有安排中的这个名字也去掉 */
    function removeAssignee(name) {
        const list = assigneeList();
        const used = (state.data.tasks || []).filter((t) => (t.assignees || []).indexOf(name) >= 0);
        const ok = window.confirm(used.length
            ? `「${name}」名下还有 ${used.length} 条安排，删除后这些安排里他的名字也会一起去掉。确定吗？`
            : `确定把「${name}」从责任人名单里删掉吗？`);
        if (!ok) return;

        // 名单：数据里还没有就先复制一份配置里的默认，再改
        if (!Array.isArray(state.data.assignees) || !state.data.assignees.length) {
            state.data.assignees = list.map((p) => ({ name: p.name, color: p.color }));
        }
        state.data.assignees = state.data.assignees.filter((p) => p.name !== name);

        // 表格里的安排：去掉这个名字；只剩空壳（没内容也没责任人）的安排直接删掉
        (state.data.tasks || []).forEach((t) => {
            if (!Array.isArray(t.assignees) || t.assignees.indexOf(name) < 0) return;
            t.assignees = t.assignees.filter((n) => n !== name);
        });
        state.data.tasks = (state.data.tasks || []).filter((t) => t.text || (t.assignees || []).length);

        const cur = filterList();
        if (cur.indexOf(name) >= 0) {
            state.filter = cur.filter((x) => x !== name);   // 删人时顺手取消只看他
            rememberFilter();
        }

        markChanged();
        renderAssigneeChips();
        render();
        pushRoster();                                   // 删人也要告诉法定自查那一边
        openAssigneeDeleter();                          // 弹层里的名单跟着刷新
        toast(`已删除责任人「${name}」`);
    }

    /**
     * 「工作查询」：把某个人的全部工作列成清单（表格区域换成那个视图）。
     * 与「只看」互斥 —— 进来先把只看取消，两个视图不打架。
     */
    function setQuery(name) {
        const who = String(name || '');
        if (!who) return;

        state.query = who;
        state.filter = [];
        state.calendar = null;   // 日历和查询是两个视图，进查询就退出日历模式

        // 记住表格现在的滚动位置（哪一天、滚到第几行），退出查询时原样还原
        state.keepScroll = { left: boardWrap.scrollLeft, top: boardWrap.scrollTop };

        // 日期范围先默认盖住这个人全部安排的跨度（后面可以自己改小）
        const span = (state.data.tasks || [])
            .filter((t) => (t.assignees || []).indexOf(who) >= 0)
            .map((t) => t.date)
            .sort();
        state.queryFrom = span[0] || '';
        state.queryTo = span[span.length - 1] || '';

        paintFilter();
        render();

        // 刚进来先滚到最左边、最上面，从头看
        boardWrap.scrollTo({ left: 0, top: 0, behavior: 'auto' });

        toast(`正在看「${who}」的全部工作，点右上角可以返回表格`);
    }

    /** 改查询里的日期范围（空字符串 = 不限），改了立刻重列一遍 */
    function setQueryRange(from, to) {
        state.queryFrom = from || '';
        state.queryTo = to || '';
        render();
        boardWrap.scrollTo({ left: 0, top: 0, behavior: 'auto' });
    }

    /** 退出工作查询，回到日历表格 */
    function clearQuery() {
        if (!state.query) return;
        state.query = '';
        render();

        // 回到表格时把日期位置、上下位置还原到进查询之前，不然会卡在最左边（得拉很久）
        if (state.keepScroll) {
            boardWrap.scrollTo({
                left: state.keepScroll.left,
                top: state.keepScroll.top,
                behavior: 'auto'
            });
        }
    }

    /** 「＋」：新增一个责任人（名字 + 牌子颜色），名单会一起存到 OSS */
    function openAssigneeEditor() {
        const preset = ['#E8688A', '#5B8FF9', '#3FA796', '#9B7BE8', '#F5A623', '#4A90D9', '#C0C4CC'];

        openModal({
            title: '新增责任人',
            body: `
                <label class="field">
                    <span class="field-label">名字</span>
                    <input type="text" id="f-person" placeholder="例如：张伟">
                </label>
                <label class="field">
                    <span class="field-label">牌子颜色</span>
                    <div class="color-row">
                        <input type="color" id="f-color" value="${preset[1]}">
                        ${preset.map((c) => (
                            `<button type="button" class="color-dot" data-color="${c}"`
                            + ` style="background:${c}" title="用这个颜色"></button>`
                        )).join('')}
                    </div>
                </label>
                <p class="hint">加好之后可以拖到某天的格子上排活；这个名字会跟着存到 OSS 的责任人名单里，
                    别的电脑打开也能看到。<br>
                    牌子上的字默认是<b>纯白</b>，想改就在「⋯ → 🎨 编辑责任人样式」里调。</p>
            `,
            buttons: [
                { text: '取消', cls: 'ghost', onClick: closeModal },
                {
                    text: '添加', cls: 'primary',
                    onClick: () => {
                        const name = $('f-person').value.trim();
                        const color = $('f-color').value || '#5B8FF9';

                        if (!name) {
                            toast('请填写名字');
                            return;
                        }
                        if (assigneeList().some((p) => p.name === name)) {
                            toast(`「${name}」已经在名单里了`);
                            return;
                        }
                        // 第一次在页面上加人：先把配置里的默认名单复制成数据里的一份，再追加
                        if (!Array.isArray(state.data.assignees) || !state.data.assignees.length) {
                            state.data.assignees = assigneeList().map((p) => ({ name: p.name, color: p.color }));
                        }
                        // 新建的人牌子上的字默认纯白（和法定自查那边一致）
                        state.data.assignees.push({ name, color, ink: '#ffffff' });

                        markChanged();
                        closeModal();
                        pushRoster();      // 同步给法定自查：那边刷新后也有这个人
                        // 加完把这条带子展开，能立刻看到新牌子
                        const bar = $('assignee-bar');
                        if (bar) bar.hidden = false;
                        renderAssigneeChips();
                        toast(`已添加责任人「${name}」，拖到格子上就能给他排活`);
                    }
                }
            ]
        });

        setTimeout(() => {
            const el = $('f-person');
            if (el) el.focus();
            // 点下面那几个色块 = 直接换颜色
            document.querySelectorAll('.color-dot').forEach((dot) => {
                dot.addEventListener('click', () => {
                    $('f-color').value = dot.getAttribute('data-color');
                });
            });
        }, 40);
    }

    const FILTER_KEY = 'safemonitor:work:filter';   // 「只看」名单（存 JSON 数组）

    /** 把「只看」名单记到浏览器里（刷新后不丢） */
    function rememberFilter() {
        lsSet(FILTER_KEY, JSON.stringify(filterList()));
    }

    /**
     * 启动时恢复「只看」名单。
     * 由 work-core 的 loadAll() 在**数据到位之后、第一次 render 之前**调用 ——
     * 这时才拿得到真实的责任人名单，可以把已经删掉的人筛掉，
     * 也不会先画一遗全部再跳回只看。
     */
    function restoreFilter() {
        let saved = [];
        try { saved = JSON.parse(lsGet(FILTER_KEY) || '[]'); } catch (e) { saved = []; }
        if (!Array.isArray(saved) || !saved.length) return;

        const names = (assigneeList() || []).map((p) => p.name);
        state.filter = saved.filter((n) => names.indexOf(n) >= 0);
    }

    /**
     * 「只看」：**可以多选**。点一个还没选的名字 = 加进名单；点已经选中的名字 = 去掉他。
     * 名单空了就是看全部。传空字符串 = 一次清空。
     * 取消时不会把行还原 —— 置顶的顺序直接写进 items 里，一直保留。
     */
    function setFilter(name) {
        const n = String(name || '').trim();
        const cur = filterList();

        let added = false;
        if (!n || cur.indexOf(n) >= 0) {
            // 清空 / 点已选中的名字 → 去掉他
            state.filter = n ? cur.filter((x) => x !== n) : [];
        } else {
            state.filter = cur.concat([n]);
            added = true;
        }

        rememberFilter();   // 记住，刷新后还在这个「只看」状态

        // 新加了人：把有他们活的工作项目行提到最前（顺序会存进 OSS）
        const moved = added ? bringHitsToTop(state.filter) : false;

        // 重画牌子：高亮选中的这几个，顺便决定「✕ 看全部」露不露（里面会调 paintFilter）
        renderAssigneeChips();
        render();

        // 说明一下视图变了：别人的活是真的藏起来了，不是没安排
        if (!state.filter.length) toast('已看回全部安排');
        else {
            toast(`只看「${state.filter.join('、')}」：别人的安排已经藏起来了`
                + `${moved ? '（他们的项目行已提到最前）' : ''}`);
        }
    }

    /**
     * 把有这几个人安排的工作项目行整体提到最前面（顺序会跟着存到 OSS，取消只看也不还原）。
     * names 是名字数组（可以只一个）。真的改了顺序就返回 true。
     */
    function bringHitsToTop(names) {
        const list = [].concat(names || []).filter(Boolean);
        if (!list.length) return false;

        const items = state.data.items || [];
        const hit = [];
        const rest = [];
        const has = new Set();
        (state.data.tasks || []).forEach((t) => {
            if ((t.assignees || []).some((x) => list.indexOf(x) >= 0)) has.add(t.item);
        });
        items.forEach((i) => (has.has(i.id) ? hit : rest).push(i));
        if (!hit.length) return false;

        // 重排只能在「置顶区」「普通区」各自己内部搞：置顶的必须一直在最前面
        const pick = (arr, pin) => arr.filter((i) => !!i.pinned === pin);
        const next = pick(hit, true)
            .concat(pick(rest, true), pick(hit, false), pick(rest, false));
        const same = next.length === items.length && next.every((i, n) => i === items[n]);
        if (same) return false;

        state.data.items = next;
        markChanged();
        return true;
    }

    /** 把过滤状态画到界面上：选中几个名字牌子就高亮几个 + 工具栏按钮文字 */
    function paintFilter() {
        const flt = filterList();

        document.querySelectorAll('#assignee-chips .chip').forEach((c) => {
            c.classList.toggle('is-active', flt.indexOf(c.getAttribute('data-name')) >= 0);
        });

        const btn = $('btn-assignee');
        if (btn) {
            btn.classList.toggle('is-filtering', flt.length > 0);
            btn.textContent = flt.length ? `👤 只看 ${flt.join('、')}` : '👤 责任人';
            btn.title = flt.length
                ? '正在只看这几个人的活；点开这项，再点名字可以加减（点已选中的就是取消他）'
                : '点名字只看他的活（可以多选几个）；按住名字拖到格子上是排活'
                    + '（日历模式里拖到那天的安排上）';
        }
    }

    /**
     * 把责任人加到某天的格子里：一格可以有好几个人，后加的排在后面（第一个人是主责任人）。
     * 格里还没安排就新建一条「只有责任人、没有内容」的安排。
     */
    function assignTo(itemId, date, name) {
        itemId = resolveItemId(itemId);   // 拖到空白行的格子上：先把这一行做实

        const tasks = state.data.tasks || (state.data.tasks = []);
        let task = tasks.find((t) => t.item === itemId && t.date === date);
        if (!task) {
            task = { item: itemId, date, text: '', done: false, assignees: [] };
            tasks.push(task);
        }
        if (!Array.isArray(task.assignees)) {
            task.assignees = W.toAssigneeList('', task.assignee);
        }

        if (task.assignees.indexOf(name) >= 0) {
            toast(`「${name}」已经是这天的责任人了`);
            return;
        }
        task.assignees.push(name);

        markChanged();
        render();

        const item = findItem(itemId);
        const main = task.assignees.length > 1 ? `（主责任人：${task.assignees[0]}）` : '';
        toast(`已把「${name}」排到 ${date} · ${item ? item.name : itemId}${main}`);
    }

    /**
     * 清除责任人：给了名字只移除那一个，不给名字就全部清除。
     * 移除后既没内容也没责任人了，这条安排就一起删掉。
     */
    function clearAssignee(itemId, date, name) {
        const tasks = state.data.tasks || [];
        const task = tasks.find((t) => t.item === itemId && t.date === date);
        if (!task) return;

        const before = Array.isArray(task.assignees) ? task.assignees : [];
        // 不给名字 = 全部清除；给了名字 = 只把那个人拿掉
        const left = name ? before.filter((n) => n !== name) : [];
        if (name && left.length === before.length) return;   // 本来就没这个人

        if (task.text || left.length) {
            task.assignees = left;
        } else {
            state.data.tasks = tasks.filter((t) => t !== task);
        }

        markChanged();
        render();
        toast(name ? `已把「${name}」从这天移除` : '已清除全部责任人');
    }

    /** 把工具栏的小牌子拖到格子上 */
    function bindAssigneeDrag() {
        const box = $('assignee-chips');
        if (!box) return;

        // 「工作查询」那个小框：把名字拖上去 = 列出他的全部工作
        const queryBox = $('work-query');
        if (queryBox) {
            queryBox.addEventListener('dragover', (e) => {
                if (!dragAssignee) return;
                e.preventDefault();
                if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
                queryBox.classList.add('is-over');
            });
            queryBox.addEventListener('dragleave', () => queryBox.classList.remove('is-over'));
            queryBox.addEventListener('drop', (e) => {
                e.preventDefault();
                queryBox.classList.remove('is-over');
                if (dragAssignee) setQuery(dragAssignee);
            });
        }

        // 开始拖：记下拖的是谁（Firefox 必须 setData 才允许拖）
        box.addEventListener('dragstart', (e) => {
            const chip = e.target.closest('.chip');
            // 「✕ 看全部」不是人，不能拖
            if (!chip || chip.classList.contains('chip-clear')) return;
            dragAssignee = chip.getAttribute('data-name');
            if (e.dataTransfer) {
                e.dataTransfer.effectAllowed = 'copy';
                e.dataTransfer.setData('text/plain', dragAssignee);
            }
        });

        document.addEventListener('dragend', () => {
            dragAssignee = null;
            if (lastDropCell) {
                lastDropCell.classList.remove('is-drop-target');
                lastDropCell = null;
            }
        });

        /*
         * 拖到哪儿才算数：表格模式和日历模式都要能接。
         *   · 表格模式 → `.cell`（格子上就带着 data-item / data-date）；
         *   · 日历模式 → `.cal-task`（某天的那一条安排，也带着这两个）；
         *     拖到整天的空白处（`.cal-day`）时：这天**只有一条**安排就直接算那条，
         *     **没有**安排就先问「给哪个工作项目排活」再排上去，
         *     **有好几条**就不猜了（猜错了更麻烦），提示让人直接拖到那一条上。
         * 返回 { el, item, date, many } —— el 是拿来高亮的那个元素。
         */
        const dropTarget = (node) => {
            if (!node) return null;

            if (!state.calendar) {
                const cell = node.closest('.cell');
                if (!cell) return null;
                return {
                    el: cell,
                    item: cell.getAttribute('data-item'),
                    date: cell.getAttribute('data-date')
                };
            }

            const task = node.closest('.cal-task');
            if (task) {
                return {
                    el: task,
                    item: task.getAttribute('data-item'),
                    date: task.getAttribute('data-date')
                };
            }

            const day = node.closest('.cal-day');
            if (!day) return null;
            const date = day.getAttribute('data-date');
            if (!date) return null;      // 月初 / 月末那些空白占位格，不是真日子
            const list = (state.data.tasks || []).filter((t) => t.date === date);
            if (list.length === 1) return { el: day, item: list[0].item, date };
            return { el: day, item: '', date, many: list.length > 1 };
        };

        // 拖着名字经过可以放的地方：高亮，表示可以松手
        board.addEventListener('dragover', (e) => {
            if (!dragAssignee) return;
            const t = dropTarget(e.target);
            if (!t) return;

            e.preventDefault();   // 不 preventDefault 浏览器就不允许放下
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';

            if (lastDropCell !== t.el) {
                if (lastDropCell) lastDropCell.classList.remove('is-drop-target');
                t.el.classList.add('is-drop-target');
                lastDropCell = t.el;
            }
        });

        board.addEventListener('dragleave', (e) => {
            const t = dropTarget(e.target);
            if (t && t.el === lastDropCell) {
                t.el.classList.remove('is-drop-target');
                lastDropCell = null;
            }
        });

        board.addEventListener('drop', (e) => {
            const t = dropTarget(e.target);
            if (!t || !dragAssignee) return;

            e.preventDefault();
            t.el.classList.remove('is-drop-target');
            lastDropCell = null;

            const who = dragAssignee;
            dragAssignee = null;      // 先清掉，免得弹层的回调里又当成在拖

            if (t.many) {
                toast(`这天有好几个安排，把「${who}」直接拖到要排的那一条上`);
                return;
            }
            if (!t.item) {
                // 这天还空着：先问是哪个工作项目（安排必须挂在项目下），选完就把这个人排上去
                if (W.pickItemFor) {
                    W.pickItemFor(t.date, (itemId) => assignTo(itemId, t.date, who));
                }
                return;
            }
            assignTo(t.item, t.date, who);
        });
    }

    /* ============================== 工作项目 ============================== */

    /**
     * 下一个默认项目名：「工作」+ 编号，从 A001 一路排到 Z999，跳过已经用过的编号
     * （把名字改掉，那个编号就腾出来了，下次还会用上）。
     */
    function nextItemName() {
        const used = new Set((state.data.items || []).map((i) => i.name));
        const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        for (let li = 0; li < letters.length; li += 1) {
            for (let n = 1; n <= 999; n += 1) {
                const name = `工作${letters[li]}${String(n).padStart(3, '0')}`;
                if (!used.has(name)) return name;
            }
        }
        return '工作A001';
    }

    function openItemEditor(itemId) {
        // 空白行点进去 = 「新增」（名字预填工作A001，**存的时候才建真项目**）——
        // 和工具栏那个「＋ 工作项目」走同一条路
        const item = (itemId && itemId !== W.BLANK_ID) ? findItem(itemId) : null;
        // 新增时先把名字填好（工作A001 这种），省得每次都要打名字
        const nameValue = item ? esc(item.name) : esc(nextItemName());
        // 已完成的项目会自动沉到最下面（见 reorder），置顶对它没意义 —— 勾选框禁掉
        const finished = item ? itemFinished(item) : false;

        openModal({
            title: item ? '编辑工作项目' : '新增工作项目',
            body: `
                <label class="field">
                    <span class="field-label">工作项目名称</span>
                    <input type="text" id="f-name" value="${nameValue}"
                           placeholder="例如：年度审核计划编制与发布">
                </label>
                <label class="field">
                    <span class="field-label">副标题（可留空）</span>
                    <input type="text" id="f-subtitle" value="${item ? esc(item.subtitle || '') : ''}"
                           placeholder="例如：9 月批次">
                </label>
                <label class="check">
                    <input type="checkbox" id="f-pin"${item && item.pinned ? ' checked' : ''}${finished ? ' disabled' : ''}>
                    <span>置顶（排在所有项目最上面，首行那条空白行下面）${finished
                        ? ' —— 这个项目名下的安排都做完了，会自动排在表格最下面' : ''}</span>
                </label>
                <p class="hint">项目名称就是表格最左侧那一列（新增时预填了「工作A001」这种编号，可以直接改掉）；
                   副标题会显示在项目名下面一行，不填就不占位置；
                   添加后在右侧各日期格子里点一下即可填写安排。<br>
                   置顶也可以直接点行头上那个 ▲ 按钮（拖到最上面那条线也会自动置顶）。</p>
            `,
            buttons: [
                item ? {
                    text: '删除项目', cls: 'danger',
                    onClick: () => deleteItem(item.id)
                } : null,
                { text: '取消', cls: 'ghost', onClick: closeModal },
                {
                    text: '保存', cls: 'primary',
                    onClick: () => {
                        const name = $('f-name').value.trim();
                        if (!name) {
                            toast('请填写工作项目名称');
                            return;
                        }
                        const subtitle = $('f-subtitle').value.trim();
                        const pinned = $('f-pin').checked;
                        if (item) {
                            const wasPinned = !!item.pinned;
                            item.name = name;
                            item.subtitle = subtitle;
                            // 只有「置顶」这一项真的变了才挪位置 ——
                            // 不然改个名字会把这个项目从下面一下子拽到最前面
                            if (wasPinned !== pinned) placeItem(item, pinned);
                        } else {
                            placeItem({ id: uid('item'), name, subtitle }, pinned);
                        }
                        markChanged();
                        closeModal();
                        render();
                    }
                }
            ].filter(Boolean)
        });

        setTimeout(() => {
            const el = $('f-name');
            if (el) {
                el.focus();
                if (!item) el.select();   // 新增时名字是预填的，全选一下，直接打就换掉
            }
        }, 40);
    }

    function deleteItem(itemId) {
        const item = findItem(itemId);
        const count = (state.data.tasks || []).filter((t) => t.item === itemId).length;
        const ok = window.confirm(
            `确认删除「${item ? item.name : itemId}」？\n该项目的 ${count} 条安排也会一起删除。`
        );
        if (!ok) return;

        state.data.items = state.data.items.filter((i) => i.id !== itemId);
        state.data.tasks = (state.data.tasks || []).filter((t) => t.item !== itemId);
        markChanged();
        closeModal();
        render();
    }

    /* ============================== 拖动行头调整项目顺序 ============================== */

    let dragRowId = null;    // 正在被拖的工作项目 id
    let rowInsertAt = null;  // { id, after }：松手时插到哪一行的前面/后面
    let rowMids = null;      // 拖动开始时量好的「每行中线 Y 坐标」：id → mid

    /**
     * 量一遍每行头的中线位置。
     * 拖动时每帧调 getBoundingClientRect() 会让浏览器强制重排整张表（几十列 × 十几行），
     * 手感就是“黏”——所以只在按下那一刻量一次，后面全部用缓存数字比大小。
     */
    function measureRowMids() {
        const map = new Map();
        board.querySelectorAll('.row-head').forEach((el) => {
            const r = el.getBoundingClientRect();
            map.set(el.getAttribute('data-item'), r.top + r.height / 2);
        });
        return map;
    }

    /** 按住行头左侧的把手上下拉，松手就换位置（顺序会一起存到 OSS） */
    function bindRowDrag() {
        board.addEventListener('dragstart', (e) => {
            if (filterOn()) return;   // 只看模式下显示顺序是重排过的，不允许拖
            const head = e.target.closest('.row-head');
            // 点在 ✎ / ✕ 按钮上不算拖行
            if (!head || e.target.closest('[data-act]')) return;

            dragRowId = head.getAttribute('data-item');
            rowMids = measureRowMids();   // 只在开始拖的时候量一次
            head.classList.add('is-dragging');
            if (e.dataTransfer) {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', dragRowId);   // Firefox 必须 setData 才允许拖
            }
        });

        board.addEventListener('dragover', (e) => {
            if (!dragRowId) return;
            const head = e.target.closest('.row-head');
            if (!head) return;

            e.preventDefault();   // 不 preventDefault 浏览器就不允许放下
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';

            // 光标在上半行 = 插到这行前面，下半行 = 插到后面
            const id = head.getAttribute('data-item');
            let mid = rowMids && rowMids.get(id);
            if (mid == null) {   // 缓存里没有（比如拖动中途表格变了）就现量一次
                const rect = head.getBoundingClientRect();
                mid = rect.top + rect.height / 2;
                if (rowMids) rowMids.set(id, mid);
            }
            const after = e.clientY > mid;
            if (!rowInsertAt || rowInsertAt.id !== id || rowInsertAt.after !== after) {
                clearRowMark();
                rowInsertAt = { id, after };
                head.classList.add(after ? 'is-drop-after' : 'is-drop-before');
            }
        });

        board.addEventListener('drop', (e) => {
            if (!dragRowId || !rowInsertAt) return;
            e.preventDefault();
            moveItem(dragRowId, rowInsertAt.id, rowInsertAt.after);
            endRowDrag();
        });

        document.addEventListener('dragend', endRowDrag);
    }

    /** 把所有插入位置标记清掉 */
    function clearRowMark() {
        board.querySelectorAll('.row-head.is-drop-before, .row-head.is-drop-after')
            .forEach((el) => el.classList.remove('is-drop-before', 'is-drop-after'));
    }

    function endRowDrag() {
        clearRowMark();
        board.querySelectorAll('.row-head.is-dragging').forEach((el) => el.classList.remove('is-dragging'));
        dragRowId = null;
        rowInsertAt = null;
        rowMids = null;
    }

    /** 把 dragId 这一行挪到 targetId 的前面（after=true 则挪到后面） */
    function moveItem(dragId, targetId, after) {
        if (dragId === targetId) return;

        const items = state.data.items || [];
        const from = items.findIndex((i) => i.id === dragId);
        if (from < 0) return;

        // 拖到最上面那条空白行那里 = 挪到最顶上（空白行的 id 不在 items 里，得特判）
        const toTop = targetId === W.BLANK_ID;
        if (!toTop && items.findIndex((i) => i.id === targetId) < 0) return;

        const moved = items.splice(from, 1)[0];
        let to = toTop ? 0 : items.findIndex((i) => i.id === targetId);   // 拿掉之后重新找位置
        if (!toTop && after) to += 1;
        items.splice(to, 0, moved);

        /*
         * 拖进 / 拖出「置顶区」= 顺手加 / 去置顶（和手机上那种列表一个感觉）。
         * 置顶区就是数组最前面那 npin 个，所以「落点 < npin」就是在置顶区里面。
         * （moved 已经从数组里拿掉了，npin 数的是**剩下**的置顶项）
         */
        const npin = items.filter((i) => i.pinned).length;
        // 已完成的项目不给置顶（见 reorder 那段）
        moved.pinned = !itemFinished(moved) && (toTop || to < npin);

        // ★ 「除非用户手动移动排序」：拖过就打个标记，这一项从此不参与
        //   「按临近日期自动排序」，就待在用户放的这个位置上（会跟着存进 OSS）
        moved.manual = true;

        markChanged();
        render();
        toast(`已把「${moved.name}」搬到第 ${to + 1} 行${moved.pinned ? '（并置顶）' : ''}`);
    }

    /* ============================== 挂到命名空间 ============================== */

    Object.assign(W, {
        findItem, openTaskEditor, upsertTask, removeTask, saveTaskForm,
        renderAssigneeChips, setFilter, paintFilter, openAssigneeEditor, openAssigneeDeleter,
        openAssigneeStyleEditor, onStylePreview,
        restoreFilter, rememberFilter,
        removeAssignee, setQuery, clearQuery, setQueryRange,
        assignTo, clearAssignee, bindAssigneeDrag,
        bindRowDrag, moveItem,
        openItemEditor, deleteItem, placeItem, pinnedCount, togglePin,
        itemFinished, nextDateOf, reorder,
        resolveItemId, materializeBlank, restoreBlankRow, toggleBlankRow, paintBlankRowBtn,
        restoreHideDone, toggleHideDone, paintHideDoneBtn
    });
})(window.Work);
