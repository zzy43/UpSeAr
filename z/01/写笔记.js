/* 写笔记 — 在网页里写文字，点保存直接存进阿里云 OSS（纯前端，无需后端） */

/* ===== 改这里：换成你自己的 OSS ===== */
const OSS = {
  bucket: 'datarestore',         // ← 只填 Bucket 名字，不要带 https:// 和 .com
  region: 'oss-cn-hangzhou',     // ← 「概览 → 访问端口 → 外网访问」那一行
  file: '笔记本.md'              // ← 写到 Bucket 里的哪个文件（追加到它末尾）
};
// 想让笔记集中放一个目录，就写成 'note/笔记本.md'，并在 OSS 里建好 note 目录

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

/* ---------- 元素 ---------- */
const $ = id => document.getElementById(id);
const editor = $('editor'), statusEl = $('status'), docEl = $('doc');
const DRAFT = 'mdnotes.draft';        // 本机草稿的 key
const SHOWTIME = 'mdnotes.showtime';  // 「显示时间」开关的记忆

let busy = false;
const setStatus = msg => { statusEl.textContent = msg; };

function setShowTime(on) {
  document.body.classList.toggle('showtime', on);
  $('togtime').classList.toggle('on', on);
}

// 形如 2026-09-18 20:35（周五）
function stamp() {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
    + ' ' + p(d.getHours()) + ':' + p(d.getMinutes())
    + '（周' + '日一二三四五六'[d.getDay()] + '）';
}

/* ---------- 读写 OSS ---------- */
async function readOss() {
  const r = await fetch(objUrl(), { cache: 'no-store' });
  if (r.status === 404) return '';        // 文件还不存在，当空的
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return await r.text();
}

async function writeOss(text) {
  const r = await fetch(objUrl(), {
    method: 'PUT',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    body: text
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

/* ---------- 渲染：按「## 时间」切成若干条，每条一个 div.card ---------- */
const ENTRY = /^##\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}[^\n]*?)\s*$/;

function splitEntries(md) {
  const items = [];
  let cur = null;
  for (const ln of md.replace(/\r\n?/g, '\n').split('\n')) {
    const m = ln.match(ENTRY);
    if (m) { items.push(cur = { time: m[1], body: [] }); continue; }
    if (!cur) items.push(cur = { time: '', body: [] });   // 开头没写时间的部分
    cur.body.push(ln);
  }
  return items.filter(it => it.time || it.body.join('').trim());
}

function paint(md) {
  const items = splitEntries(md);
  if (!items.length) { docEl.innerHTML = '<p class="hint">（还没有内容）</p>'; return; }
  docEl.innerHTML = items.map(it =>
    '<div class="entry">'
      + (it.time ? '<div class="time">' + esc(it.time) + '</div>' : '')
      + render(it.body.join('\n'), { noToc: true })
    + '</div>').join('');
}

async function loadFromOss() {
  setStatus('正在从 OSS 读取…');
  let text = '';
  try {
    text = await readOss();
  } catch (e) {
    setStatus('❌ 读取失败：' + e.message);
    return '';
  }
  paint(text);
  setStatus('已读取 ' + OSS.file + ' · ' + (text.trim() ? text.trim().split('\n').length : 0) + ' 行');
  return text;
}

/* ---------- 保存 ---------- */
async function save() {
  const body = editor.value.trim();
  if (!body) { setStatus('先写点东西再保存吧'); editor.focus(); return; }
  if (busy) { setStatus('上一个操作还没结束，稍等一下'); return; }
  busy = true; $('save').disabled = true;
  setStatus('正在保存到 OSS…');
  try {
    const old = await readOss();                             // 1. 先拿旧的
    const prev = old.replace(/^\s+/, '').replace(/\s+$/, '');
    const merged = '## ' + stamp() + '\n\n' + body + '\n'   // 2. 新内容放最上面
      + (prev ? '\n' + prev + '\n' : '');
    await writeOss(merged);
    paint(merged);                                           // 3. 页面里立刻显示
    editor.value = '';
    try { localStorage.removeItem(DRAFT); } catch (e) { /* 忽略 */ }
    setStatus('✅ 已保存　共 ' + splitEntries(merged).length + ' 条　' + new Date().toLocaleTimeString('zh-CN'));
  } catch (e) {
    setStatus('❌ 保存失败：' + e.message + '（内容还在，别关页面）');
  } finally {
    busy = false; $('save').disabled = false;
    editor.focus();
  }
}

/* ---------- 插入图片：先传到 OSS，再在光标处插一段 Markdown ---------- */
function saveDraft() {
  try { localStorage.setItem(DRAFT, editor.value); } catch (e) { /* 忽略 */ }
}

function insertAtCursor(text) {
  const v = editor.value, s = editor.selectionStart, e = editor.selectionEnd;
  const ins = (s > 0 && v[s - 1] !== '\n' ? '\n' : '') + text + '\n';
  editor.value = v.slice(0, s) + ins + v.slice(e);
  const pos = s + ins.length;
  editor.setSelectionRange(pos, pos);
  editor.focus();
  saveDraft();
}

// 图片存到 Bucket 的 images/ 下，文件名用「时间戳+随机串」避免重名
function imageKey(name) {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  const ext = (String(name).match(/\.(\w{2,5})$/) || ['', 'png'])[1].toLowerCase();
  const tail = Math.random().toString(36).slice(2, 7);
  return 'images/' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate())
    + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds())
    + '-' + tail + '.' + ext;
}

async function uploadImage(file) {
  const key = imageKey(file.name);
  const url = ossBase() + '/' + key.split('/').map(encodeURIComponent).join('/');
  const r = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'image/png' },
    body: file
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return url;
}

async function addImage(file) {
  if (!file) return;
  if (busy) { setStatus('上一个操作还没结束，稍等一下'); return; }
  busy = true;
  setStatus('正在上传图片（' + fmtSize(file.size) + '）…');
  try {
    const url = await uploadImage(file);
    const alt = (file.name || '图片').replace(/[\[\]()]/g, '');
    insertAtCursor('![' + alt + '](' + url + ')');
    setStatus('✅ 图片已上传，别忘了点「保存到 OSS」把这条存下来');
  } catch (e) {
    setStatus('❌ 图片上传失败：' + e.message);
  } finally {
    busy = false;
  }
}

/* ---------- 任意文件：上传到 files/，并在底部列表里列出 ---------- */
async function listPrefix(prefix) {
  const url = ossBase() + '/?list-type=2&max-keys=1000&prefix=' + encodeURIComponent(prefix);
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const xml = new DOMParser().parseFromString(await r.text(), 'application/xml');
  const msg = xml.getElementsByTagName('Message')[0];
  if (msg) throw new Error(msg.textContent);
  return [...xml.getElementsByTagName('Contents')].map(c => ({
    key: ((c.getElementsByTagName('Key')[0] || {}).textContent) || '',
    size: +(((c.getElementsByTagName('Size')[0] || {}).textContent) || 0),
    time: ((c.getElementsByTagName('LastModified')[0] || {}).textContent) || ''
  })).filter(it => it.key && it.key !== prefix);
}

function paintFiles(items) {
  $('filecount').textContent = items.length;
  if (!items.length) {
    $('filelist').innerHTML = '<p class="hint">还没有上传过文件。点页头的「文件」按钮传一个试试。</p>';
    return;
  }
  $('filelist').innerHTML = items.map(it => {
    const name = it.key.slice(FILE_PREFIX.length);
    const url = keyUrl(it.key);
    return '<div class="frow">'
      + '<span class="fname"><a href="' + esc(url) + '" target="_blank" rel="noopener" title="在新标签打开">' + esc(name) + '</a></span>'
      + '<span class="fsize">' + fmtSize(it.size) + '</span>'
      + '<span class="ftime">' + fmtTime(it.time) + '</span>'
      + '<button data-key="' + esc(it.key) + '" data-name="' + esc(name) + '" title="下载到本机">⤓</button>'
      + '</div>';
  }).join('');
}

async function loadFiles() {
  try {
    paintFiles(await listPrefix(FILE_PREFIX));
  } catch (e) {
    $('filelist').innerHTML = '<p class="hint">读取文件列表失败：' + esc(e.message) + '</p>';
  }
}

// 用 fetch+blob 下载，才能强制“存到本机”并保留原文件名
async function downloadKey(key, name) {
  if (busy) { setStatus('上一个操作还没结束，稍等一下'); return; }
  busy = true;
  setStatus('正在下载 ' + name + '…');
  try {
    const r = await fetch(keyUrl(key));
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const blob = await r.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    setStatus('✅ 已下载 ' + name + '（' + fmtSize(blob.size) + '）');
  } catch (e) {
    setStatus('❌ 下载失败：' + e.message);
  } finally {
    busy = false;
  }
}

async function addFile(file) {
  if (!file) return;
  if (busy) { setStatus('上一个操作还没结束，稍等一下'); return; }
  busy = true;
  setStatus('正在上传 ' + file.name + '（' + fmtSize(file.size) + '）…');
  try {
    // 保留原名（重名就是更新），中文名交给 URL 编码处理
    const key = FILE_PREFIX + file.name;
    const r = await fetch(keyUrl(key), {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    $('filesbox').open = true;
    await loadFiles();
    setStatus('✅ 已上传到 ' + key + '（' + fmtSize(file.size) + '）');
  } catch (e) {
    setStatus('❌ 上传失败：' + e.message);
  } finally {
    busy = false;
  }
}

/* ---------- 事件 ---------- */
$('save').onclick = save;
$('reload').onclick = async () => { await loadFromOss(); await loadFiles(); };
$('togtime').onclick = () => {
  const on = !document.body.classList.contains('showtime');
  setShowTime(on);
  try { localStorage.setItem(SHOWTIME, on ? '1' : '0'); } catch (e) { /* 忽略 */ }
};
editor.addEventListener('input', saveDraft);

// 图片：按钮 / Ctrl+V 粘贴 / 拖进来
$('imgbtn').onclick = () => $('imgfile').click();
$('imgfile').onchange = async () => {
  const f = $('imgfile').files[0];
  $('imgfile').value = '';              // 同一个文件能连着选第二次
  if (f) await addImage(f);
};
// 任意文件：按钮选 / 拖进来（图片优先交给 addImage）
$('filebtn').onclick = () => $('anyfile').click();
$('anyfile').onchange = async () => {
  const f = $('anyfile').files[0];
  $('anyfile').value = '';
  if (f) await addFile(f);
};
// 文件列表里的「⤓」下载按钮（事件委托）
$('filelist').addEventListener('click', ev => {
  const b = ev.target.closest('button[data-key]');
  if (b) downloadKey(b.dataset.key, b.dataset.name);
});
editor.addEventListener('paste', async ev => {
  const items = [...((ev.clipboardData || {}).items || [])];
  const it = items.find(x => x.type && x.type.startsWith('image/'));
  if (!it) return;                      // 不是图片就按普通粘贴走
  ev.preventDefault();
  await addImage(it.getAsFile());
});
editor.addEventListener('dragover', ev => {
  if (ev.dataTransfer && [...ev.dataTransfer.types].includes('Files')) {
    ev.preventDefault();
    ev.dataTransfer.dropEffect = 'copy';
  }
});
editor.addEventListener('drop', async ev => {
  const files = [...((ev.dataTransfer || {}).files || [])];
  if (!files.length) return;
  ev.preventDefault();
  for (const f of files) {
    if (f.type.startsWith('image/')) await addImage(f);   // 图片 → images/ 并插入 Markdown
    else await addFile(f);                                // 其他文件 → files/
  }
});
// 拖到编辑器外时别让浏览器直接打开那个文件
['dragover', 'drop'].forEach(t => document.addEventListener(t, ev => {
  if (ev.target === editor) return;
  ev.preventDefault();
}));
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) { e.preventDefault(); save(); }
});

/* ---------- 启动 ---------- */
$('targetName').textContent = ossBase() + '/' + OSS.file;

(async function init() {
  try { setShowTime(localStorage.getItem(SHOWTIME) === '1'); } catch (e) { /* 忽略 */ }
  let draft = '';
  try { draft = localStorage.getItem(DRAFT) || ''; } catch (e) { /* 忽略 */ }
  await loadFromOss();
  loadFiles();
  if (draft.trim()) {
    editor.value = draft;
    setStatus('⚠ 恢复了本机未保存的草稿，改完点「保存到 OSS」');
  }
})();
