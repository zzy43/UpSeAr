/* LOSA|TEM|观察模版 —— 交互（从 LOSA模版V3.html 拆出）*/
/* ---------- 分类标签：勾选 ---------- */
document.querySelectorAll('.section .tag').forEach(function(el){
  el.addEventListener('click', function(){
    this.classList.toggle('sel');
    syncBadge(this);
  });
});

/* ---------- 分类标签：备注（带圈感叹号） ---------- */
var noteMask    = document.getElementById('noteMask');
var noteInput   = document.getElementById('noteInput');
var noteTitle   = document.getElementById('noteTitle');
var currentTag  = null;

/* 给每个分类标签套一层容器，并在右上角挂一个感叹号徽标 */
function wrapSectionTags(){
  document.querySelectorAll('.section .tag').forEach(function(el){
    var parent = el.parentNode;
    if (parent && parent.classList && parent.classList.contains('tag-wrap')) return;

    var wrap = document.createElement('span');
    wrap.className = 'tag-wrap';
    parent.insertBefore(wrap, el);
    wrap.appendChild(el);

    var badge = document.createElement('button');
    badge.type = 'button';
    badge.className = 'note-badge';
    badge.textContent = '!';
    badge.setAttribute('aria-label', '添加/编辑备注');
    badge.addEventListener('click', function(e){
      e.stopPropagation();
      e.preventDefault();
      openNote(el);
    });
    wrap.appendChild(badge);
  });
}

/* 同步徽标显示：仅选中时出现；有备注时变为实心 */
function syncBadge(tag){
  var wrap = tag.parentNode;
  if (!wrap || !wrap.classList || !wrap.classList.contains('tag-wrap')) return;
  var badge = wrap.querySelector('.note-badge');
  if (!badge) return;
  var note = (tag.getAttribute('data-note') || '').trim();
  badge.classList.toggle('show', tag.classList.contains('sel'));
  badge.classList.toggle('has-note', !!note);
  badge.title = note ? ('备注：' + note) : '点击添加备注';
}

function syncAllBadges(){
  document.querySelectorAll('.section .tag').forEach(syncBadge);
}

function openNote(tag){
  currentTag = tag;
  noteTitle.textContent = tag.textContent.trim();
  noteInput.value = tag.getAttribute('data-note') || '';
  noteMask.classList.add('show');
  setTimeout(function(){ try { noteInput.focus(); } catch (e) {} }, 50);
}

function closeNote(){
  noteMask.classList.remove('show');
  currentTag = null;
}

function applyNote(value){
  if (!currentTag) return;
  var v = (value || '').trim();
  if (v) currentTag.setAttribute('data-note', v);
  else currentTag.removeAttribute('data-note');
  syncBadge(currentTag);
  if (typeof saveNow === 'function') saveNow();
  showToast(v ? '备注已保存' : '未填写备注');
  closeNote();
}

document.getElementById('noteSaveBtn').addEventListener('click', function(){
  applyNote(noteInput.value);
});
document.getElementById('noteCancelBtn').addEventListener('click', closeNote);
noteMask.addEventListener('click', function(e){
  if (e.target === noteMask) closeNote();
});
document.addEventListener('keydown', function(e){
  if (e.key === 'Escape' && noteMask.classList.contains('show')) closeNote();
});

wrapSectionTags();

var descContainer = document.getElementById('descContainer');
var addDescBtn = document.getElementById('addDescBtn');

/* 飞行阶段标签点击（事件委托，支持动态新增的表单） */
descContainer.addEventListener('click', function(e){
  var tag = e.target.closest('.phaseGroup .tag');
  if (tag) { tag.classList.toggle('sel'); return; }
  if (e.target.classList.contains('btn-remove')) {
    e.target.closest('.form-box').remove();
    renumberForms();
  }
});

/* 是否管理切换（事件委托） */
descContainer.addEventListener('change', function(e){
  if (e.target.classList.contains('mgmtSelect')) {
    var box = e.target.closest('.form-box').querySelector('.mgmtBox');
    box.classList.toggle('show', e.target.value === '是');
  }
});

/* ---------- 观察描述表单：填充 / 新增 / 编号 ---------- */
function fillBox(box, data){
  data = data || {};
  box.querySelector('.descInput').value = data.desc || '';
  box.querySelector('.mgmtInput').value = data.mgmtText || '';
  var sel = box.querySelector('.mgmtSelect');
  sel.value = data.mgmt || '否';
  box.querySelector('.mgmtBox').classList.toggle('show', sel.value === '是');
  var phases = data.phases || [];
  box.querySelectorAll('.phaseGroup .tag').forEach(function(t){
    t.classList.toggle('sel', phases.indexOf(t.getAttribute('data-phase')) > -1);
  });
}

function createFormBox(data){
  var template = descContainer.querySelector('.form-box');
  var clone = template.cloneNode(true);
  fillBox(clone, data);
  clone.querySelector('.btn-remove').style.display = '';
  descContainer.appendChild(clone);
  renumberForms();
  return clone;
}

/* 新增观察描述 */
addDescBtn.addEventListener('click', function(){
  var clone = createFormBox();
  clone.querySelector('.descInput').focus();
  clone.scrollIntoView({ behavior: 'smooth', block: 'center' });
});

/* 重新编号 & 控制删除按钮显示 */
function renumberForms(){
  var boxes = descContainer.querySelectorAll('.form-box');
  boxes.forEach(function(box, i){
    box.querySelector('.form-index').textContent = '观察描述 ' + (i + 1);
    box.querySelector('.btn-remove').style.display = boxes.length > 1 ? '' : 'none';
  });
}

/* ---------- 表头：日期默认今天 ---------- */
function setDefaultDate(){
  var d = document.getElementById('hdDate');
  if (d && !d.value) {
    var t = new Date();
    d.value = t.getFullYear() + '-' +
      String(t.getMonth() + 1).padStart(2, '0') + '-' +
      String(t.getDate()).padStart(2, '0');
  }
}

/* ---------- 草稿自动保存（离线可用，关闭后再打开内容还在） ---------- */
var SAVE_KEY = 'losa_form_state_v1';
var saveTimer = null;

function collectState(){
  var header = {};
  document.querySelectorAll('#headerBox input').forEach(function(el){
    header[el.id] = el.value;
  });
  var boxes = [];
  descContainer.querySelectorAll('.form-box').forEach(function(box){
    boxes.push({
      desc: box.querySelector('.descInput').value,
      phases: Array.prototype.map.call(
        box.querySelectorAll('.phaseGroup .tag.sel'),
        function(t){ return t.getAttribute('data-phase'); }
      ),
      mgmt: box.querySelector('.mgmtSelect').value,
      mgmtText: box.querySelector('.mgmtInput').value
    });
  });
  var tags = [];
  document.querySelectorAll('.section .tag.sel').forEach(function(t){
    tags.push(t.getAttribute('data-code'));
  });
  /* 标签备注：{ 编码: 说明 } */
  var notes = {};
  document.querySelectorAll('.section .tag[data-note]').forEach(function(t){
    var code = t.getAttribute('data-code');
    var note = (t.getAttribute('data-note') || '').trim();
    if (code && note) notes[code] = note;
  });
  return { header: header, boxes: boxes, tags: tags, notes: notes };
}

function saveNow(){
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(collectState())); } catch (e) {}
}
function scheduleSave(){
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 500);
}
document.addEventListener('input', scheduleSave);
document.addEventListener('change', scheduleSave);

function restoreState(){
  var saved = null;
  try { saved = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { saved = null; }
  if (!saved) return;
  if (saved.header) {
    Object.keys(saved.header).forEach(function(id){
      var el = document.getElementById(id);
      if (el) el.value = saved.header[id];
    });
  }
  if (saved.boxes && saved.boxes.length) {
    fillBox(descContainer.querySelector('.form-box'), saved.boxes[0]);
    for (var i = 1; i < saved.boxes.length; i++) createFormBox(saved.boxes[i]);
  }
  if (saved.tags && saved.tags.length) {
    saved.tags.forEach(function(code){
      var el = document.querySelector('.section .tag[data-code="' + code + '"]');
      if (el) el.classList.add('sel');
    });
  }
  if (saved.notes) {
    Object.keys(saved.notes).forEach(function(code){
      var el = document.querySelector('.section .tag[data-code="' + code + '"]');
      if (el && saved.notes[code]) el.setAttribute('data-note', saved.notes[code]);
    });
  }
  renumberForms();
  if (typeof syncAllBadges === 'function') syncAllBadges();
}

restoreState();
setDefaultDate();
renumberForms();

/* ---------- 提交观察单 ---------- */
var submitBtn = document.getElementById('submitBtn');
var resultPanel = document.getElementById('resultPanel');
var resultText = document.getElementById('resultText');
var toastEl = document.getElementById('toast');
var toastTimer = null;
var lastReportText = '';

function showToast(msg){
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function(){ toastEl.classList.remove('show'); }, 1800);
}

/* 按章节汇总已勾选的分类项 */
function collectSections(){
  var result = [];
  document.querySelectorAll('.section').forEach(function(sec){
    var titleEl = sec.querySelector('.section-title');
    if (!titleEl) return;
    var groups = [];
    var current = null;
    sec.querySelectorAll('.sub-cat, .tag.sel').forEach(function(el){
      if (el.classList.contains('sub-cat')) {
        current = { name: el.textContent.trim(), items: [] };
        groups.push(current);
      } else {
        if (!current) { current = { name: '', items: [] }; groups.push(current); }
        var note = (el.getAttribute('data-note') || '').trim();
        current.items.push(
          el.textContent.trim() + '（' + el.getAttribute('data-code') + '）' +
          (note ? '  ▸ 备注：' + note : '')
        );
      }
    });
    groups = groups.filter(function(g){ return g.items.length > 0; });
    if (groups.length) result.push({ title: titleEl.textContent.trim(), groups: groups });
  });
  return result;
}

function buildReport(){
  var lines = [];
  var now = new Date();
  var pad = function(n){ return String(n).padStart(2, '0'); };
  var submitTime = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) +
                   ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes());

  lines.push('========== LOSA / TEM 观察单 ==========');
  lines.push('航班日期：' + (document.getElementById('hdDate').value || '—'));
  lines.push('航班号：' + (document.getElementById('hdFlightNo').value || '—'));
  lines.push('航线观察员：' + (document.getElementById('hdObserver').value || '—'));
  lines.push('机长资质：' + (document.getElementById('hdCapQual').value || '—'));
  lines.push('副驾驶1资质：' + (document.getElementById('hdFo1Qual').value || '—'));
  lines.push('副驾驶2资质：' + (document.getElementById('hdFo2Qual').value || '—'));
  lines.push('提交时间：' + submitTime);
  lines.push('');

  /* 观察描述 */
  lines.push('---------- 观察描述 ----------');
  var boxes = descContainer.querySelectorAll('.form-box');
  var boxNo = 0;
  boxes.forEach(function(box){
    var desc = box.querySelector('.descInput').value.trim();
    var phases = Array.prototype.map.call(box.querySelectorAll('.phaseGroup .tag.sel'),
      function(t){ return t.getAttribute('data-phase'); });
    var mgmt = box.querySelector('.mgmtSelect').value;
    var mgmtText = box.querySelector('.mgmtInput').value.trim();
    if (!desc && !phases.length && mgmt !== '是') return;
    boxNo++;
    lines.push('【观察描述 ' + boxNo + '】');
    lines.push('  内容：' + (desc || '（未填写）'));
    lines.push('  飞行阶段：' + (phases.length ? phases.join('、') : '未选择'));
    lines.push('  是否管理：' + mgmt + (mgmt === '是' ? '（措施：' + (mgmtText || '未填写') + '）' : ''));
    lines.push('');
  });
  if (boxNo === 0) { lines.push('（无）'); lines.push(''); }

  /* 分类勾选 */
  var sections = collectSections();
  if (!sections.length) {
    lines.push('---------- 分类勾选 ----------');
    lines.push('（无）');
  } else {
    sections.forEach(function(sec){
      var total = 0;
      sec.groups.forEach(function(g){ total += g.items.length; });
      lines.push('---------- ' + sec.title + '（共 ' + total + ' 项） ----------');
      sec.groups.forEach(function(g){
        if (g.name) lines.push('[' + g.name + ']');
        g.items.forEach(function(it){ lines.push('  · ' + it); });
      });
      lines.push('');
    });
  }

  lines.push('=======================================');
  return lines.join('\n');
}

submitBtn.addEventListener('click', function(){
  var anyDesc = false;
  descContainer.querySelectorAll('.descInput').forEach(function(t){
    if (t.value.trim()) anyDesc = true;
  });
  var anyTag = document.querySelector('.section .tag.sel') !== null;
  if (!anyDesc && !anyTag) {
    showToast('请先填写观察描述或勾选分类项');
    return;
  }
  lastReportText = buildReport();
  resultText.textContent = lastReportText;
  resultPanel.classList.add('show');

  /* 归档到本地（保留最近 20 份） */
  try {
    var KEY = 'losa_submitted_v1';
    var list = JSON.parse(localStorage.getItem(KEY) || '[]');
    list.unshift({ time: new Date().toISOString(), text: lastReportText });
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 20)));
  } catch (e) {}

  resultPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  showToast('观察单已提交');
});

document.getElementById('hideResultBtn').addEventListener('click', function(){
  resultPanel.classList.remove('show');
});

document.getElementById('copyResultBtn').addEventListener('click', function(){
  if (!lastReportText) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(lastReportText).then(function(){ showToast('已复制到剪贴板'); },
      function(){ fallbackCopy(); });
  } else { fallbackCopy(); }
});
function fallbackCopy(){
  var ta = document.createElement('textarea');
  ta.value = lastReportText;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); showToast('已复制到剪贴板'); }
  catch (e) { showToast('复制失败，请手动选择文本'); }
  document.body.removeChild(ta);
}

document.getElementById('downloadResultBtn').addEventListener('click', function(){
  if (!lastReportText) return;
  var d = new Date();
  var pad = function(n){ return String(n).padStart(2, '0'); };
  var name = 'LOSA观察单_' + (document.getElementById('hdFlightNo').value || '未命名') +
             '_' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) +
             pad(d.getHours()) + pad(d.getMinutes()) + '.txt';
  var blob = new Blob(['\ufeff' + lastReportText], { type: 'text/plain;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function(){ URL.revokeObjectURL(url); }, 2000);
  showToast('已生成文件');
});

document.getElementById('shareResultBtn').addEventListener('click', function(){
  if (!lastReportText) return;
  if (navigator.share) {
    navigator.share({ title: 'LOSA观察单', text: lastReportText }).catch(function(){});
  } else {
    showToast('当前环境不支持系统分享');
  }
});

/* ---------- 离线 PWA：注册 Service Worker ---------- */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function(){
    navigator.serviceWorker.register('./sw.js').catch(function(){});
  });
}
