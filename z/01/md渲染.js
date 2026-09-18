/* md渲染 — 极简 Markdown → HTML（「md阅读器」和「写笔记」共用的渲染内核） */

/* ---------- 极简 Markdown 渲染 ---------- */
const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

function inline(s){
  s = esc(s);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Obsidian 双链 [[目标|别名]] / ![[嵌入]] → 只显示别名
  s = s.replace(/!?\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
    (m, t, a) => '<span class="wl">' + (a || t) + '</span>');
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img alt="$1" src="$2">');
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*\w])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  s = s.replace(/ {2,}$/, '<br>');
  return s;
}

function parseList(lines, i, base){
  const ordered = /^\s*\d+\.\s/.test(lines[i]);
  const items = [];
  while (i < lines.length) {
    const m = lines[i].match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);
    if (!m) break;
    const ind = m[1].length;
    if (ind < base) break;
    if (ind > base) {                       // 嵌套一层
      const sub = parseList(lines, i, ind);
      if (items.length) items[items.length - 1] += sub.html; else items.push(sub.html);
      i = sub.i; continue;
    }
    let text = m[3]; i++;
    while (i < lines.length && lines[i].trim() && !/^\s*([-*+]|\d+\.)\s+/.test(lines[i])) {
      text += ' ' + lines[i].trim(); i++;
    }
    items.push(inline(text));
  }
  const tag = ordered ? 'ol' : 'ul';
  return { html: `<${tag}>` + items.map(t => `<li>${t}</li>`).join('') + `</${tag}>`, i };
}

function render(md, opt){
  const lines = md.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n');
  const out = [], toc = [];
  let i = 0, hid = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) { i++; continue; }

    // 围栏代码块
    const fence = line.match(/^\s*(```|~~~)(.*)$/);
    if (fence) {
      const mark = fence[1], lang = fence[2].trim(), buf = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith(mark)) { buf.push(lines[i]); i++; }
      i++;
      out.push('<pre><code' + (lang ? ' class="lang-' + esc(lang) + '"' : '') + '>'
        + esc(buf.join('\n')) + '</code></pre>');
      continue;
    }

    // 表格
    if (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|?[\s:|-]*-[\s:|-]*\|/.test(lines[i + 1])) {
      const rows = [];
      while (i < lines.length && lines[i].trim() && lines[i].includes('|')) { rows.push(lines[i].trim()); i++; }
      const cells = r => r.replace(/^\||\|$/g, '').split('|').map(c => inline(c.trim()));
      let t = '<table><thead><tr>' + cells(rows[0]).map(c => `<th>${c}</th>`).join('') + '</tr></thead><tbody>';
      for (let r = 2; r < rows.length; r++)
        t += '<tr>' + cells(rows[r]).map(c => `<td>${c}</td>`).join('') + '</tr>';
      out.push(t + '</tbody></table>');
      continue;
    }

    // 标题
    const h = line.match(/^(#{1,6})\s+(.*?)\s*#*$/);
    if (h) {
      const lv = h[1].length, id = 'h' + (++hid);
      if (lv <= 3) toc.push({ lv, id, text: h[2].replace(/[*`_]/g, '') });
      out.push(`<h${lv} id="${id}">${inline(h[2])}</h${lv}>`);
      i++; continue;
    }

    // 分割线
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { out.push('<hr>'); i++; continue; }

    // 引用
    if (/^\s*>/.test(line)) {
      const buf = [];
      while (i < lines.length && (/^\s*>/.test(lines[i]) || (buf.length && lines[i].trim()))) {
        buf.push(lines[i].replace(/^\s*>\s?/, '')); i++;
      }
      out.push('<blockquote>' + render(buf.join('\n'), opt) + '</blockquote>');
      continue;
    }

    // 列表
    if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
      const r = parseList(lines, i, line.match(/^\s*/)[0].length);
      out.push(r.html); i = r.i; continue;
    }

    // 段落
    const buf = [];
    while (i < lines.length && lines[i].trim()
      && !/^\s*(#{1,6}\s|>|```|~~~|([-*+]|\d+\.)\s)/.test(lines[i])
      && !/^\s*([-*_])(\s*\1){2,}\s*$/.test(lines[i])) { buf.push(lines[i].trim()); i++; }
    out.push('<p>' + inline(buf.join('\n')) + '</p>');
  }

  let html = '';
  if (!(opt && opt.noToc) && toc.length > 2) {
    html += '<details class="toc"><summary>目录（' + toc.length + '）</summary>'
      + toc.map(t => `<a class="l${t.lv}" href="#${t.id}">${esc(t.text)}</a>`).join('') + '</details>';
  }
  return html + out.join('\n');
}
