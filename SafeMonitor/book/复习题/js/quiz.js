/* ============================================================
   SOP 第 1 章 填空复习 —— 交互
   ------------------------------------------------------------
   · 题目数据在 questions.js（window.QUIZ_DATA），这里只负责画和判分
   · 判分忽略空格 / 标点 / 全半角，所以「10,000」「10000」「一万」这种
     写在 a: [] 里的都算对（一个空可以有多个可接受答案）
   · 不需要服务器，双击 index.html 就能用
   ============================================================ */

(function () {
    'use strict';

    var D = window.QUIZ_DATA;
    var box = document.getElementById('quiz');
    var statEl = document.getElementById('stat');
    var items = [];   // 每道题：{ data, li, input, fb, state }

    // 标题 / 说明从题库里取（说明里的 {{N}} 在 build 里换成真实题数）
    if (D.title) document.getElementById('title').textContent = D.title + ' · 填空复习';
    if (D.subtitle) document.getElementById('sub').textContent = D.subtitle;

    /* ---------------- 小工具 ---------------- */

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    /** 判分用的归一化：全角转半角、去掉空格和标点、统一小写 */
    function norm(s) {
        return String(s == null ? '' : s)
            .replace(/[\uFF01-\uFF5E]/g, function (c) {      // 全角 → 半角
                return String.fromCharCode(c.charCodeAt(0) - 0xFEE0);
            })
            .replace(/\u3000/g, ' ')
            .replace(/[\s，。、；：""''《》（）()\[\]{}<>·．,;:'"\/\\|~!?@#$%^&*+=_\-–—±]/g, '')
            .toLowerCase();
    }

    /** 这道题有几个空、每个空的正确答案。旧题库只写 a（单空）也能用 */
    function answersOf(it) {
        if (it.aa && it.aa.length) return it.aa;
        return [it.a || []];
    }

    /** 删掉题干后的空白数（{{}} 的个数），没写的话算 1 个 */
    function blankCount(it) {
        var n = String(it.q).split('{{}}').length - 1;
        return n > 0 ? n : 1;
    }

    /**
     * 判一道题（支持多空）。
     * @return true 全对 / false 有错 / null 一个都没填（不判）
     */
    function judgeItem(values, it) {
        var ans = answersOf(it);
        var filled = 0;
        for (var i = 0; i < ans.length; i += 1) {
            if (norm(values[i] || '')) filled += 1;
        }
        if (filled === 0) return null;                 // 一个空都没填：不判
        var all = true;
        for (var j = 0; j < ans.length; j += 1) {
            var v = norm(values[j] || '');
            var ok = false;
            for (var k = 0; k < ans[j].length; k += 1) {
                if (v && norm(ans[j][k]) === v) { ok = true; break; }
            }
            if (!ok) all = false;
        }
        return all;
    }

    /* ---------------- 画题目 ---------------- */

    /** 题干里的 {{}} 换成输入框（一条题目一个空） */
    function stemHtml(q) {
        var parts = String(q).split('{{}}');
        var html = '';
        for (var i = 0; i < parts.length; i += 1) {
            html += '<span>' + esc(parts[i]) + '</span>';
            if (i < parts.length - 1) {
                html += '<input class="blank" type="text" autocomplete="off" spellcheck="false">';
            }
        }
        // 万一哪道题忘了写 {{}}，在末尾补一个空，别让整页崩掉
        if (parts.length === 1) {
            html += '<input class="blank" type="text" autocomplete="off" spellcheck="false">';
        }
        return html;
    }

    function build() {
        var html = '';
        var n = 0;

        D.sections.forEach(function (sec) {
            html += '<h2 class="sec">' + esc(sec.name) + '</h2><ol class="qs">';
            sec.items.forEach(function (it) {
                n += 1;
                html += '<li>'
                    + '<span class="no">' + n + '</span>'
                    + '<p class="stem">' + stemHtml(it.q) + '</p>'
                    + '<div class="fb" hidden></div>'
                    + '</li>';
            });
            html += '</ol>';
        });

        box.innerHTML = html;

        // 建索引
        var lis = box.querySelectorAll('ol.qs > li');
        var k = 0;
        D.sections.forEach(function (sec) {
            sec.items.forEach(function (it) {
                var li = lis[k];
                k += 1;
                var list = li.querySelectorAll('input.blank');
                var inputs = [];
                for (var m = 0; m < list.length; m += 1) inputs.push(list[m]);
                var fb = li.querySelector('.fb');
                // 答案长的话框给宽一点（按每个空自己的答案）
                var ans = answersOf(it);
                for (var t = 0; t < inputs.length; t += 1) {
                    var one = ans[t] || ans[0] || [];
                    if (String(one[0] || '').length >= 8) inputs[t].classList.add('wide');
                }

                var rec = { data: it, li: li, inputs: inputs, input: inputs[0], fb: fb, state: '' };
                items.push(rec);

                // 回车：本道题还有空没填 → 跳到下一个空；都填了 → 判这道题并跳到下一题
                inputs.forEach(function (inp) {
                    inp.addEventListener('keydown', function (e) {
                        if (e.key !== 'Enter') return;
                        e.preventDefault();
                        var empty = null;
                        for (var q = 0; q < inputs.length; q += 1) {
                            if (!norm(inputs[q].value)) { empty = inputs[q]; break; }
                        }
                        if (empty) { empty.focus(); return; }
                        checkOne(rec);
                        var next = items[items.indexOf(rec) + 1];
                        if (next) next.inputs[0].focus();
                    });
                    inp.addEventListener('change', function () {
                        // 多空题：所有空都填了才自动判。
                        // 否则从第一个空点到第二个空时，会拿“第二个空还空着”去判，误报错误。
                        var allFilled = inputs.every(function (x) { return norm(x.value); });
                        if (allFilled) checkOne(rec);
                    });
                });
            });
        });

        var sub = document.getElementById('sub');
        if (sub) sub.textContent = sub.textContent.replace('{{N}}', String(items.length));
        paintStat();
    }

    /* ---------------- 判分 / 显示 ---------------- */

    /**
     * 判一道题。
     * @param {Object} it  那道题
     * @param {boolean} [revealOnly] true = 只把答案亮出来（不算「答对」）
     */
    function checkOne(it, revealOnly) {
        var vals = it.inputs.map(function (x) { return x.value; });
        var ans = answersOf(it.data);
        var ansText = ans.map(function (g) { return g[0]; }).join('、');
        var ok = judgeItem(vals, it.data);
        var fb = it.fb;

        it.li.classList.remove('ok', 'bad');
        fb.hidden = false;
        fb.className = 'fb';

        if (revealOnly) {
            it.state = it.state === 'ok' ? 'ok' : 'shown';
            fb.className = 'fb';
            fb.innerHTML = '<span class="ans">答案：' + esc(ansText) + '</span>'
                + ' <span class="note">（出处 ' + esc(it.data.note || '') + '）</span>';
            return;
        }

        if (ok === null) {              // 一个空都没填：什么都不标
            it.state = '';
            fb.hidden = true;
            paintStat();
            return;
        }

        if (ok) {
            it.state = 'ok';
            it.li.classList.add('ok');
            fb.className = 'fb ok';
            fb.innerHTML = '✓ 正确 <span class="note">（出处 ' + esc(it.data.note || '') + '）</span>';
        } else {
            it.state = 'bad';
            it.li.classList.add('bad');
            fb.className = 'fb bad';
            fb.innerHTML = '✗ 答案是 <span class="ans">' + esc(ansText) + '</span>'
                + ' <span class="note">（出处 ' + esc(it.data.note || '') + '）</span>';
        }
        paintStat();
    }

    /** 顶上的统计：已答 / 正确 / 错误 */
    function paintStat() {
        var done = 0;
        var ok = 0;
        var bad = 0;
        items.forEach(function (it) {
            if (it.state === 'ok') { done += 1; ok += 1; }
            else if (it.state === 'bad') { done += 1; bad += 1; }
        });
        statEl.innerHTML = '共 <b>' + items.length + '</b> 题 · 已答 <b>' + done + '</b>'
            + ' · <span class="ok">正确 <b>' + ok + '</b></span>'
            + ' · <span class="bad">错误 <b>' + bad + '</b></span>';
    }

    /* ---------------- 按钮 ---------------- */

    /** 检查全部：填了的都判一遍，没填的跳过；全对时给句鼓励 */
    function checkAll() {
        var empty = 0;
        items.forEach(function (it) {
            var vals = it.inputs.map(function (x) { return x.value; });
            if (judgeItem(vals, it.data) === null) { empty += 1; return; }
            checkOne(it);
        });
        paintStat();
        if (empty === items.length) {
            alert('还一道都没填呢，随便写几个再检查吧。');
        } else if (empty > 0) {
            alert('还有 ' + empty + ' 题没填（没填的不判分）。');
        }
    }

    function revealAll() {
        items.forEach(function (it) { checkOne(it, true); });
    }

    function resetAll() {
        items.forEach(function (it) {
            it.inputs.forEach(function (x) { x.value = ''; });
            it.state = '';
            it.li.classList.remove('ok', 'bad');
            it.fb.hidden = true;
            it.fb.innerHTML = '';
        });
        paintStat();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        var first = items[0];
        if (first) first.inputs[0].focus();
    }

    /** 打乱：只在每个小节内部打乱，小节顺序不变（方便对着章节复习） */
    function shuffle() {
        D.sections.forEach(function (sec) {
            for (var i = sec.items.length - 1; i > 0; i -= 1) {
                var j = Math.floor(Math.random() * (i + 1));
                var t = sec.items[i];
                sec.items[i] = sec.items[j];
                sec.items[j] = t;
            }
        });
        items = [];
        build();
    }

    document.getElementById('btn-check').addEventListener('click', checkAll);
    document.getElementById('btn-reveal').addEventListener('click', revealAll);
    document.getElementById('btn-reset').addEventListener('click', resetAll);
    document.getElementById('btn-shuffle').addEventListener('click', shuffle);

    build();
})();
