/* 写笔记 — 网页里随手记事：写好点保存，自动存到云端（纯前端，无需后端）。
   · 纯文本，不做 Markdown 渲染（写什么显示什么，只保留换行）；
   · 左侧导航按部门分类（飞行部 / 运技部 / 安监部），点一下只看这一类；
   · 每条记录可以「✎ 编辑 / ✓ 完成 / 🗑 删除」；
   · 附件挂在**具体某一条记录**上（跟着笔记走），鼠标停上去能预览：
     图片直接看，PDF / Word / Excel 用内嵌预览。 */

/* ===== 改这里：换成你自己的 OSS ===== */
const OSS = {
  bucket: 'datarestore',         // ← 只填 Bucket 名字，不要带 https:// 和 .com
  region: 'oss-cn-hangzhou',     // ← 「概览 → 访问端口 → 外网访问」那一行
  file: '笔记.json'              // ← 存到 Bucket 里的哪个文件（整份 JSON）
};
// 想让笔记集中放一个目录，就写成 'note/笔记.json'，并在云端建好 note 目录

/* ---------- OSS 地址 ---------- */
const ossBase = () => {
  const b = String(OSS.bucket || '').trim().replace(/\/+$/, '');
  if (/^https?:\/\//i.test(b)) return b;                      // bucket 里粘了整段网址
  if (/^[\w-]+(\.[\w-]+)+$/.test(b)) return 'https://' + b;
  let host = String(OSS.region || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  if (!host) return '';
  if (!host.includes('.')) host += '.aliyuncs.com';
  if (b && host.indexOf(b + '.') !== 0) host = b + '.' + host;
  return 'https://' + host;
};
const keyUrl = key => ossBase() + '/' + key.split('/').map(encodeURIComponent).join('/');
const objUrl = () => keyUrl(OSS.file);
const FILE_PREFIX = 'files/';        // 上传的文件放这里（图片在 images/）

const fmtSize = n => n < 1024 ? n + ' B'
  : n < 1048576 ? (n / 1024).toFixed(1) + ' KB'
  : (n / 1048576).toFixed(1) + ' MB';

const fmtTime = s => {
  const d = new Date(s);
  if (isNaN(d)) return '';
  const p = n => String(n).padStart(2, '0');
  return p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
};

/* ---------- 元素 / 小工具 ---------- */
const $ = id => document.getElementById(id);
const editor = $('editor'), statusEl = $('status'), docEl = $('doc');

/** 转义 HTML（不做 md 渲染了，正文一律当纯文本显示） */
const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const DRAFT = 'mdnotes.draft';        // 本机草稿的 key
const THEME = 'mdnotes.theme';        // 亮 / 暗模式的记忆
const FOLDED = 'mdnotes.folded';      // 哪几条是收起的（本机记着，下次打开还收起）

/* 收起状态的记忆：存记录的时间戳（一条一个，不会串） */
let folded = new Set();
try {
  const raw = localStorage.getItem(FOLDED);
  const arr = raw ? JSON.parse(raw) : [];
  folded = new Set(Array.isArray(arr) ? arr.map(String) : []);
} catch (e) { folded = new Set(); /* 隐私模式下就算了 */ }

/** 一条记录的身份证：用它记住「收起 / 展开」 */
const keyOf = (it, i) => String((it && it.time) || ('idx' + i));
const isFolded = (it, i) => folded.has(keyOf(it, i));
function saveFolded() {
  try { localStorage.setItem(FOLDED, JSON.stringify(Array.from(folded))); } catch (e) { /* 忽略 */ }
}
/** 正文超过两行（或很长）才给收起按钮，两行以内的不白放一个按钮 */
const needFold = it => {
  const t = String((it && it.body) || '').trim();
  return t.split('\n').length > 2 || t.length > 90;
};

/* ---------- 分类（左侧导航那几个部门） ---------- */
const DEPTS = ['飞行部', '运技部', '安监部'];
const DEPT_COLOR = { '飞行部': '#9B7BE8', '运技部': '#5B8FF9', '安监部': '#3FA796' };
const deptColor = d => DEPT_COLOR[d] || 'var(--faint)';

/** 附件前面那个小图标（内联 SVG，不依赖字体） */
const CLIP = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M14 2v6h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';

let busy = false;
const setStatus = msg => { statusEl.textContent = msg; };

/** 亮 / 暗模式：写在 <html data-theme> 上，样式由 md阅读器.css 里两套变量切 */
function applyTheme(t) {
  const theme = (t === 'light') ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', theme);
  try { localStorage.setItem(THEME, theme); } catch (e) { /* 忽略 */ }
  const b = $('theme');
  if (b) b.textContent = theme === 'light' ? '☾ 暗色' : '☀ 亮色';
}

// 形如 2026-09-18 20:35（周五）
function stamp() {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
    + ' ' + p(d.getHours()) + ':' + p(d.getMinutes())
    + '（周' + '日一二三四五六'[d.getDay()] + '）';
}

/* ---------- 读写云端（JSON） ---------- */

/** 空数据（云端还没有这个文件时用） */
const emptyData = () => ({ app: '写笔记', version: 1, updated: '', entries: [] });

/** 清洗从云端读到的数据：字段缺了补默认值，空条目丢掉 */
function normalizeData(raw) {
  const d = (raw && typeof raw === 'object') ? raw : {};
  const list = Array.isArray(d.entries) ? d.entries : [];
  return {
    app: '写笔记',
    version: 1,
    updated: String(d.updated || ''),
    entries: list.map(e => ({
      time: String((e && e.time) || ''),
      done: String((e && e.done) || ''),
      dept: String((e && e.dept) || ''),
      body: String((e && e.body) || ''),
      atts: (Array.isArray(e && e.atts) ? e.atts : []).map(k => String(k)).filter(Boolean)
    })).filter(e => e.time || e.body.trim() || e.atts.length)
  };
}

async function readData() {
  const r = await fetch(objUrl(), { cache: 'no-store' });
  if (r.status === 404) return emptyData();          // 文件还不存在，当空的
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const txt = await r.text();
  if (!txt.trim()) return emptyData();
  try {
    return normalizeData(JSON.parse(txt));
  } catch (e) {
    throw new Error('文件内容不是合法 JSON');
  }
}

async function writeData(data) {
  const body = JSON.stringify(Object.assign({}, data, { updated: stamp() }), null, 2);
  const r = await fetch(objUrl(), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body
  });
  if (!r.ok) {
    let code = '';
    try {
      const xml = new DOMParser().parseFromString(await r.text(), 'application/xml');
      const n = xml.getElementsByTagName('Code')[0];
      if (n) code = ' ' + n.textContent;
    } catch (e) { /* 忽略 */ }
    throw new Error('HTTP ' + r.status + code);
  }
}

/* ---------- 数据：一条条记录 ----------
   entries = [ { time, done, dept, body, atts: ['files/xxx.pdf'] } ]
     · time  写入时的时间戳（如 2026-10-11 17:13（周日））
     · done  非空 = 已完成（存的是标记完成的时间）
     · dept  分类（飞行部 / 运技部 / 安监部；空 = 未分类）
     · body  正文（纯文本，保留换行）
     · atts  这条记录带的附件 key（文件都在 files/ 下） */
let DATA = emptyData();     // 云端读到的整份数据
let ENTRIES = DATA.entries; // DATA.entries 的引用
let filter = 'all';         // all | open | done（列表上那排小牌子）
let deptFilter = 'all';     // all | 部门名 | none（左侧导航选的分类）
let query = '';             // 搜索框里的词（搜正文 / 分类 / 附件名）
let draftDept = DEPTS[0];   // 正在写的新记录归到哪一类
let editing = -1;           // 正在就地编辑哪一条（-1 = 没有）
let editBody = '';          // 编辑中的正文
let editDept = '';          // 编辑中的分类
let editAtts = [];          // 编辑中的附件
let draftAtts = [];         // 正在写的新记录带的附件

/** 接手一份数据并在页面上显示 */
function paint(data) {
  DATA = normalizeData(data);
  ENTRIES = DATA.entries;
  paintEntries();
}

/** 附件 key → 显示名（文件都放在 files/ 下） */
const attName = key => String(key).replace(/^files\//, '');
const attUrl = key => keyUrl(key);
/** 附件牌子上的小「✕」 */
const attDelBtn = key => '<button class="att-del" data-key="' + esc(key) + '" title="移除这个附件">✕</button>';

/** 一个附件小牌子：点开原文件，鼠标停上去预览 */
function attChip(key, extra) {
  const name = attName(key);
  return '<span class="att" data-url="' + esc(attUrl(key)) + '" data-name="' + esc(name) + '">'
    + CLIP
    + '<a href="' + esc(attUrl(key)) + '" target="_blank" rel="noopener">' + esc(name) + '</a>'
    + (extra || '')
    + '</span>';
}

/** 正文：纯文本（保留换行），网址变链接；给了搜索词就把命中的地方标黄
    （先按命中的位置切开，再逐段转义 / 变链接，保证标黄不会把链接弄坏） */
function textHtml(text, q) {
  const s = String(text == null ? '' : text);
  const linkOut = t => esc(t).replace(/(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener">$1</a>');
  const needle = String(q || '').trim();
  if (!needle) return linkOut(s);
  const lower = s.toLowerCase(), n = needle.toLowerCase();
  let out = '', pos = 0, k = lower.indexOf(n);
  while (k >= 0) {
    out += linkOut(s.slice(pos, k)) + '<mark>' + esc(s.slice(k, k + needle.length)) + '</mark>';
    pos = k + needle.length;
    k = lower.indexOf(n, pos);
  }
  return out + linkOut(s.slice(pos));
}

/** 搜索命中：正文 / 分类 / 附件名 里有没有这个词 */
const hitText = (it, q) => !q
  || String(it.body || '').toLowerCase().includes(q)
  || String(it.dept || '').toLowerCase().includes(q)
  || it.atts.some(k => attName(k).toLowerCase().includes(q));

function paintEntries() {
  paintSide();                       // 左侧分类导航（数量跟着数据走）
  // 筛选小牌子
  const fbox = $('filter');
  if (fbox) {
    fbox.innerHTML = [['all', '全部'], ['open', '未完成'], ['done', '已完成']]
      .map(p => '<button class="chip-filter' + (filter === p[0] ? ' is-on' : '') + '" data-filter="' + p[0] + '">' + p[1] + '</button>')
      .join('');
  }
  const cnt = $('entrycount');

  const q = query.trim().toLowerCase();      // 搜索词（空 = 没在搜）
  const rows = ENTRIES.map((it, i) => ({ it, i }))
    .filter(r => deptMatch(r.it))
    .filter(r => filter === 'all' ? true : (filter === 'done' ? !!r.it.done : !r.it.done))
    .filter(r => hitText(r.it, q))
    .sort((a, b) => (a.it.done ? 1 : 0) - (b.it.done ? 1 : 0));   // 已完成的沉到最后（同类里还是新的在上）

  if (cnt) cnt.textContent = !ENTRIES.length ? ''
    : (q ? '找到 ' + rows.length + ' 条 / 共 ' + ENTRIES.length + ' 条' : '共 ' + ENTRIES.length + ' 条');

  if (!rows.length) {
    docEl.innerHTML = '<p class="hint">' + (q
      ? '没找到包含「' + esc(query.trim()) + '」的记录。'
      : (ENTRIES.length ? '这个分类 / 筛选下没有记录。' : '（还没有内容）')) + '</p>';
    return;
  }

  docEl.innerHTML = rows.map((r, k) => {
    // 头一条已完成的前面加一句分隔提示，一眼看出下面都是收尾的
    const sep = (k > 0 && r.it.done && !rows[k - 1].it.done) ? '<p class="done-sep">已完成</p>' : '';
    return sep + (r.i === editing ? editCard(r.it, r.i) : viewCard(r.it, r.i));
  }).join('');
}

/** 左侧分类导航：全部 / 三个部门 / （真有无分类记录时的）未分类 */
function paintSide() {
  const box = $('depts');
  if (!box) return;
  const num = k => k === 'all' ? ENTRIES.length
    : (k === 'none' ? ENTRIES.filter(x => !x.dept).length : ENTRIES.filter(x => x.dept === k).length);
  const list = [['all', '全部']].concat(DEPTS.map(d => [d, d]));
  if (num('none')) list.push(['none', '未分类']);
  box.innerHTML = list.map(p =>
    '<button type="button" class="side-item' + (deptFilter === p[0] ? ' is-on' : '') + '" data-dept="' + esc(p[0]) + '">'
    + '<span class="dot' + (p[0] === 'all' ? ' all' : (p[0] === 'none' ? ' none' : '')) + '"'
      + (DEPT_COLOR[p[1]] ? ' style="background:' + deptColor(p[1]) + '"' : '') + '></span>'
    + '<span class="side-name">' + esc(p[1]) + '</span>'
    + '<span class="side-num">' + num(p[0]) + '</span>'
    + '</button>').join('');
}

/** 分类小牌子（写新记录 / 编辑某条时用来选分类） */
const deptBtns = cur => DEPTS.map(d =>
  '<button type="button" class="chip-filter' + (cur === d ? ' is-on' : '') + '" data-d="' + esc(d) + '">'
  + '<span class="dot" style="background:' + deptColor(d) + '"></span>' + esc(d) + '</button>').join('');

/** 写新记录时那几个分类小牌子 */
function paintDraftDept() {
  const box = $('draft-dept');
  if (box) box.innerHTML = deptBtns(draftDept);
}

/** 记录头上的分类小牌子（没分类就不显示） */
const deptChip = d => d
  ? '<span class="chip dept"><span class="dot" style="background:' + esc(deptColor(d)) + '"></span>' + esc(d) + '</span>'
  : '';

/** 左侧导航选的分类是否命中这条记录 */
const deptMatch = it => deptFilter === 'all' ? true
  : (deptFilter === 'none' ? !it.dept : it.dept === deptFilter);

/** 正常显示的一条 */
function viewCard(it, i) {
  const text = String(it.body || '').trim();
  const q = query.trim();
  const fold = needFold(it);                            // 够长才给收起按钮
  const col = fold && !q && isFolded(it, i);            // 这条现在是收起的（搜索时一律展开）
  return '<article class="entry' + (it.done ? ' is-done' : '') + (col ? ' is-collapsed' : '')
      + '" data-i="' + i + '">'
    + '<div class="entry-head">'
      + (it.time ? '<span class="entry-time">' + esc(it.time) + '</span>' : '')
      + deptChip(it.dept)
      + (it.done ? '<span class="chip done">✓ 已完成</span>' : '')
      + '<span class="entry-acts">'
        + (fold && !q ? '<button class="btn mini" data-act="fold">' + (col ? '▾ 展开' : '▸ 收起') + '</button>' : '')
        + '<button class="btn mini" data-act="edit">✎ 编辑</button>'
        + '<button class="btn mini" data-act="done">' + (it.done ? '↺ 取消完成' : '✓ 完成') + '</button>'
        + '<button class="btn mini" data-act="del">🗑 删除</button>'
      + '</span>'
    + '</div>'
    + (text ? '<div class="entry-body">' + textHtml(text, q) + '</div>' : '')
    + (it.atts.length ? '<div class="atts">' + it.atts.map(k => attChip(k)).join('') + '</div>' : '')
  + '</article>';
}

/** 正在就地编辑的一条（正文变输入框，附件能加能删） */
function editCard(it, i) {
  return '<article class="entry is-editing" data-i="' + i + '">'
    + '<div class="entry-head">'
      + (it.time ? '<span class="entry-time">' + esc(it.time) + '</span>' : '')
      + '<span class="entry-acts"><span class="hint">编辑中…</span></span>'
    + '</div>'
    + '<textarea class="edit-area" id="edit-area" placeholder="写点什么…">' + esc(editBody) + '</textarea>'
    + '<div class="chips edit-dept" id="edit-dept">' + deptBtns(editDept) + '</div>'
    + '<div class="atts">'
      + editAtts.map(k => attChip(k, attDelBtn(k))).join('')
      + '<button class="btn mini" id="edit-add" type="button">＋ 附件</button>'
    + '</div>'
    + '<div class="edit-foot">'
      + '<button class="btn mini" data-act="cancel" type="button">取消</button>'
      + '<button class="btn mini primary" data-act="save-edit" type="button">保存修改</button>'
    + '</div>'
  + '</article>';
}

async function loadAll() {
  setStatus('正在读取…');
  let data;
  try {
    data = await readData();
  } catch (e) {
    setStatus('❌ 读取失败：' + e.message);
    return;
  }
  paint(data);
  setStatus('已读取 · 共 ' + ENTRIES.length + ' 条');
}

/* ---------- 保存新记录 ---------- */
async function save() {
  syncEdit();
  const body = editor.value.trim();
  if (!body && !draftAtts.length) { setStatus('先写点东西（或加点附件）再保存吧'); editor.focus(); return; }
  if (busy) { setStatus('上一个操作还没结束，稍等一下'); return; }
  busy = true; $('save').disabled = true;
  setStatus('正在保存…');
  const prev = ENTRIES.slice();
  try {
    // 新的一条放最上面，老的接在后面
    const fresh = { time: stamp(), done: '', dept: draftDept, body, atts: draftAtts.slice() };
    DATA.entries = [fresh].concat(ENTRIES);
    await writeData(DATA);
    paint(DATA);                                             // 页面里立刻显示
    editor.value = '';
    draftAtts = [];
    paintDraftAtts();
    try { localStorage.removeItem(DRAFT); } catch (e) { /* 忽略 */ }
    setStatus('✅ 已保存　共 ' + ENTRIES.length + ' 条　' + new Date().toLocaleTimeString('zh-CN'));
  } catch (e) {
    DATA.entries = prev;
    paint(DATA);
    setStatus('❌ 保存失败：' + e.message + '（内容还在，别关页面）');
  } finally {
    busy = false; $('save').disabled = false;
    editor.focus();
  }
}

/* ---------- 完成 / 删除（整篇重写后再上传） ---------- */

/** 一个简单的确认弹层，返回 Promise<boolean> */
function askConfirm(title, text, okText) {
  return new Promise(resolve => {
    const m = $('modal');
    $('modal-title').textContent = title;
    $('modal-body').textContent = text;
    const foot = $('modal-foot');
    foot.innerHTML = '';
    const close = v => {
      m.classList.remove('show');
      setTimeout(() => { m.hidden = true; }, 170);
      resolve(v);
    };
    const mk = (txt, cls, val) => {
      const b = document.createElement('button');
      b.className = 'btn ' + (cls || '');
      b.textContent = txt;
      b.onclick = () => close(val);
      foot.appendChild(b);
    };
    mk('取消', '', false);
    mk(okText || '确定', '', true);      // 确认按钮也用普通样式（不用红色，太刺眼）
    m.hidden = false;
    requestAnimationFrame(() => m.classList.add('show'));
  });
}

/** 把某一批记录当成新的整份数据写回云端（先改界面，写失败再回滚） */
async function persist(next, okMsg) {
  if (busy) { setStatus('上一个操作还没结束，稍等一下'); return false; }
  busy = true;
  const prev = ENTRIES.slice();
  DATA.entries = next;
  paint(DATA);                       // 先让界面立刻变
  try {
    await writeData(DATA);
    setStatus(okMsg);
    return true;
  } catch (e) {
    DATA.entries = prev;             // 写失败就还原，别让页面和云端对不上
    paint(DATA);
    setStatus('❌ 写入失败：' + e.message);
    return false;
  } finally {
    busy = false;
  }
}

async function toggleDone(i) {
  const it = ENTRIES[i];
  if (!it) return;
  const next = ENTRIES.map((x, k) => k === i
    ? { time: x.time, done: x.done ? '' : stamp(), dept: x.dept, body: x.body, atts: x.atts.slice() }
    : x);
  await persist(next, next[i].done ? '✅ 已标记完成' : '↺ 已取消完成');
}

async function delEntry(i) {
  const it = ENTRIES[i];
  if (!it) return;
  const first = (String(it.body || '').trim().split('\n')[0] || '').slice(0, 60);
  const ok = await askConfirm('删除这条记录？',
    (it.time ? it.time + '　' : '') + (first ? first + '…' : '删除后不能恢复。'),
    '删除');
  if (!ok) return;
  await persist(ENTRIES.filter((x, k) => k !== i), '🗑 已删除');
}

/* ---------- 收起 / 展开（只改本机记忆，不动云端数据） ---------- */
function toggleFold(i) {
  const it = ENTRIES[i];
  if (!it) return;
  const k = keyOf(it, i);
  if (folded.has(k)) folded.delete(k); else folded.add(k);
  saveFolded();
  paintEntries();
}

/* ---------- 附件：上传 + 挂到「当前这条」上 ---------- */
function saveDraft() {
  try { localStorage.setItem(DRAFT, editor.value); } catch (e) { /* 忽略 */ }
}

/** 上传时的文件名：**保留原文件名**（重名就是覆盖），都存在 files/ 下 */
function fileKey(name) {
  const safe = String(name || 'file').replace(/[\\/]/g, '_');   // 只把路径分隔符换掉，其余原样
  return FILE_PREFIX + safe;
}

async function uploadKey(file) {
  const key = fileKey(file.name);
  const r = await fetch(keyUrl(key), {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return key;
}

/** 附件往哪儿加：正在编辑某条 → 加到那条；否则 → 加到正在写的新记录 */
function attTarget() {
  if (editing >= 0) return { list: editAtts, paint: () => { syncEdit(); paintEntries(); } };
  return { list: draftAtts, paint: paintDraftAtts };
}

/** 选好 / 拖进来 / 粘进来的文件 → 逐个上传，然后挂到当前那条记录上 */
async function addAttachments(files) {
  const arr = Array.from(files || []).filter(Boolean);
  if (!arr.length) return;
  if (busy) { setStatus('上一个操作还没结束，稍等一下'); return; }
  const t = attTarget();
  busy = true;
  try {
    for (let i = 0; i < arr.length; i++) {
      const f = arr[i];
      setStatus('正在上传 ' + f.name + '（' + (i + 1) + '/' + arr.length + '）…');
      // eslint-disable-next-line no-await-in-loop
      const key = await uploadKey(f);
      t.list.push(key);
      t.paint();
    }
    setStatus('✅ 附件已上传（点「保存」才挂到这条记录上）');
  } catch (e) {
    setStatus('❌ 上传失败：' + e.message);
  } finally {
    busy = false;
  }
}

/** 把「正在写的那条」的附件画出来（在写内容的下方） */
function paintDraftAtts() {
  const box = $('draft-atts');
  if (!box) return;
  box.innerHTML = draftAtts.map(k => attChip(k, attDelBtn(k))).join('')
    + '<button class="btn mini" id="draft-add" type="button">＋ 附件</button>';
}

/** 编辑中的那条：把输入框里还没保存的文字先收进 editBody（重画不丢字） */
function syncEdit() {
  const ta = $('edit-area');
  if (ta && editing >= 0) editBody = ta.value;
}

/* ---------- 事件 ---------- */
$('save').onclick = save;
$('theme').onclick = () => applyTheme(
  document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light');
editor.addEventListener('input', saveDraft);

// 工具栏：全部收起 / 全部展开（只收内容够长的那些）
$('fold-all').onclick = () => {
  ENTRIES.forEach((it, i) => { if (needFold(it)) folded.add(keyOf(it, i)); });
  saveFolded();
  paintEntries();
  setStatus('▸ 已全部收缩（下次打开也保持）');
};
$('unfold-all').onclick = () => {
  folded.clear();
  saveFolded();
  paintEntries();
  setStatus('▾ 已全部展开');
};

// 筛选小牌子
$('filter').addEventListener('click', ev => {
  const b = ev.target.closest('button[data-filter]');
  if (!b) return;
  filter = b.dataset.filter;
  paintEntries();
});

// 搜索：边打边筛；命中的记录一律展开，并把命中的词标黄
$('search').addEventListener('input', ev => {
  query = ev.target.value;
  syncEdit();                 // 正在编辑的那条，先把输入框里的字收好再重画
  paintEntries();
});

// 左侧分类导航：换分类；选部门时顺手把新记录也归到这一类
$('depts').addEventListener('click', ev => {
  const b = ev.target.closest('button[data-dept]');
  if (!b) return;
  deptFilter = b.dataset.dept;
  if (DEPTS.indexOf(deptFilter) >= 0) draftDept = deptFilter;
  paintDraftDept();
  paintEntries();
});

// 写新记录时选分类（再点一下同一类 = 取消分类）
$('draft-dept').addEventListener('click', ev => {
  const b = ev.target.closest('button[data-d]');
  if (!b) return;
  draftDept = draftDept === b.dataset.d ? '' : b.dataset.d;
  paintDraftDept();
});

/* ---------- 亮 / 暗模式 ---------- */
$('theme').onclick = () => applyTheme(
  document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light');

/* ---------- 记录卡片上的按钮：编辑 / 完成 / 删除 / 取消 / 保存修改 ---------- */
docEl.addEventListener('click', async ev => {
  const del = ev.target.closest('.att-del');          // 编辑时移除某个附件
  if (del) {
    syncEdit();
    editAtts = editAtts.filter(x => x !== del.dataset.key);
    paintEntries();
    return;
  }
  if (ev.target.closest('#edit-add')) { $('anyfile').click(); return; }   // 编辑时加附件

  const dp = ev.target.closest('#edit-dept button[data-d]');              // 编辑时改分类
  if (dp) {
    syncEdit();
    editDept = editDept === dp.dataset.d ? '' : dp.dataset.d;
    paintEntries();
    return;
  }

  const b = ev.target.closest('button[data-act]');
  if (!b) return;
  const art = b.closest('.entry');
  const i = art ? +art.dataset.i : -1;
  if (i < 0) return;
  const act = b.dataset.act;
  if (act === 'edit') startEdit(i);
  else if (act === 'cancel') { editing = -1; paintEntries(); }
  else if (act === 'save-edit') await saveEdit(i);
  else if (act === 'done') { syncEdit(); await toggleDone(i); }
  else if (act === 'del') await delEntry(i);
  else if (act === 'fold') toggleFold(i);
});

/* ---------- 进入 / 退出 / 保存「编辑」 ---------- */
function startEdit(i) {
  const it = ENTRIES[i];
  if (!it) return;
  syncEdit();
  editing = i;
  editBody = String(it.body || '').replace(/^\n+/, '').replace(/\s+$/, '');
  editDept = it.dept || '';
  editAtts = it.atts.slice();
  paintEntries();
  const ta = $('edit-area');
  if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
}

async function saveEdit(i) {
  syncEdit();
  const next = ENTRIES.map((x, k) => k === i
    ? { time: x.time, done: x.done, dept: editDept, atts: editAtts.slice(), body: editBody }
    : x);
  editing = -1;
  await persist(next, '✅ 已保存修改');
}

/* ---------- 附件上传（写新内容那块 / 页头的「📎 附件」都走这里） ---------- */
$('draft-atts').addEventListener('click', ev => {
  if (ev.target.closest('#draft-add')) { $('anyfile').click(); return; }
  const del = ev.target.closest('.att-del');
  if (del) {
    draftAtts = draftAtts.filter(k => k !== del.dataset.key);
    paintDraftAtts();
  }
});

$('anyfile').onchange = async () => {
  const files = [...$('anyfile').files];
  $('anyfile').value = '';              // 同一个文件能连着选第二次
  await addAttachments(files);
};

/* ---------- 附件悬浮预览：图片 / PDF / Word / Excel ---------- */
const tipEl = $('file-tip');
let tipTimer = null, tipOn = false, tipAnchor = null;

function tipHtml(url, name) {
  if (/\.(png|jpe?g|gif|webp|bmp|svg|avif)(\?|#|$)/i.test(url)) return '<img src="' + esc(url) + '" alt="">';
  if (/\.pdf(\?|#|$)/i.test(url)) return '<iframe src="' + esc(url) + '#toolbar=1&view=FitH" title="PDF 预览"></iframe>';
  if (/\.(docx?|xlsx?|pptx?)(\?|#|$)/i.test(url)) {
    return '<iframe src="https://view.officeapps.live.com/op/embed.aspx?src=' + encodeURIComponent(url) + '" title="Office 预览"></iframe>';
  }
  return '<p class="file-tip-hint">' + esc(name) + '<br>（这种类型不支持预览，点一下打开原文件）</p>';
}

function hideTip() {
  clearTimeout(tipTimer);
  tipEl.hidden = true;
  tipEl.innerHTML = '';
  tipOn = false;
  tipAnchor = null;
}

/** 鼠标离开附件后等一下再关，好让鼠标能移进预览框里翻看 */
function scheduleHide() {
  clearTimeout(tipTimer);
  tipTimer = setTimeout(() => { if (!tipOn) hideTip(); }, 280);
}

/** 摆在这一行旁边：优先右边，右边不够就放左边，别出屏 */
function placeTip(row) {
  const r = row.getBoundingClientRect(), t = tipEl.getBoundingClientRect();
  let left = r.right + 10;
  if (left + t.width > window.innerWidth - 8) left = Math.max(8, r.left - t.width - 10);
  let top = r.top;
  if (top + t.height > window.innerHeight - 8) top = Math.max(8, window.innerHeight - t.height - 8);
  tipEl.style.left = left + 'px';
  tipEl.style.top = top + 'px';
}

document.addEventListener('mouseover', ev => {
  const el = ev.target.closest('.att');
  if (!el || !el.dataset.url) return;
  if (tipAnchor === el && !tipEl.hidden) return;      // 同一块里移动就不用重画
  clearTimeout(tipTimer);
  tipEl.innerHTML = tipHtml(el.dataset.url, el.dataset.name || '');
  tipEl.hidden = false;
  tipAnchor = el;
  placeTip(el);
});
document.addEventListener('mouseout', ev => {
  if (ev.target.closest('.att')) scheduleHide();
});
tipEl.addEventListener('mouseenter', () => { tipOn = true; clearTimeout(tipTimer); });
tipEl.addEventListener('mouseleave', () => { tipOn = false; scheduleHide(); });
// 图片加载完才有真实尺寸，加载完再摆一次
tipEl.addEventListener('load', ev => {
  if (tipAnchor && ev.target && ev.target.tagName === 'IMG') placeTip(tipAnchor);
}, true);
window.addEventListener('scroll', () => { if (!tipOn) hideTip(); }, true);
// 粘贴：剪贴板里是图片 → 直接当附件传上去
document.addEventListener('paste', async ev => {
  const items = [...((ev.clipboardData || {}).items || [])];
  const imgs = items.filter(x => x.type && x.type.startsWith('image/'))
    .map(x => x.getAsFile()).filter(Boolean);
  if (!imgs.length) return;             // 不是图片就按普通粘贴走
  ev.preventDefault();
  await addAttachments(imgs);
});

// 拖文件进来 → 当附件（拖到页面哪都行；拖到附件区里会高亮）
function clearDropHints() {
  document.body.classList.remove('dragging');
  document.querySelectorAll('.atts.is-over').forEach(el => el.classList.remove('is-over'));
}
function hasFiles(ev) {
  return !!(ev.dataTransfer && [...(ev.dataTransfer.types || [])].includes('Files'));
}

['dragenter', 'dragover'].forEach(t => document.addEventListener(t, ev => {
  if (!hasFiles(ev)) return;
  ev.preventDefault();
  ev.dataTransfer.dropEffect = 'copy';
  document.body.classList.add('dragging');
  const zone = ev.target && ev.target.closest ? ev.target.closest('.atts') : null;
  document.querySelectorAll('.atts.is-over').forEach(el => { if (el !== zone) el.classList.remove('is-over'); });
  if (zone) zone.classList.add('is-over');
}));

// 鼠标带着文件离开窗口（relatedTarget 为空）就把提示清掉
document.addEventListener('dragleave', ev => { if (!ev.relatedTarget) clearDropHints(); });
document.addEventListener('dragend', clearDropHints);

document.addEventListener('drop', ev => {
  if (!hasFiles(ev)) return;
  ev.preventDefault();
  clearDropHints();
  addAttachments(ev.dataTransfer.files);
});
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) { e.preventDefault(); save(); }
});

/* ---------- 启动 ---------- */
(async function init() {
  try { applyTheme(localStorage.getItem(THEME) === 'dark' ? 'dark' : 'light'); } catch (e) { /* 忽略 */ }
  paintDraftAtts();
  paintDraftDept();
  let draft = '';
  try { draft = localStorage.getItem(DRAFT) || ''; } catch (e) { /* 忽略 */ }
  await loadAll();
  if (draft.trim()) {
    editor.value = draft;
    setStatus('⚠ 恢复了本机未保存的草稿，改完点「保存」');
  }
})();
