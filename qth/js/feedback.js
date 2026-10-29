/* 圆通-全天候 —— 需求记录（右上角带圈感叹号）
   ------------------------------------------------------------------
   用阿里云 OSS 当"记录本"，只依赖 OSS 自身的 V1 签名（不需要服务器）：
     · 打开弹窗 → 列出 qth-feedback/ 下所有 .json，按时间倒序显示
     · 提交 → PUT 一个新 json
     · 完成 → 把该 json 的 status 改成 done 后覆盖写回
     · 删除 → DELETE 该 json
   离线时：提交内容先存本机（localStorage），下次联网自动补发。

   需要的 OSS 权限（Bucket 授权策略，资源限制在 qth-feedback/*）：
     oss:PutObject / oss:GetObject / oss:DeleteObject，以及 bucket 级的 oss:ListObjects
   CORS 需要放行：GET、POST、PUT、DELETE、HEAD，暴露 ETag
*/
(function () {
  'use strict';

  var OSS = window.OSS_CONFIG || {};
  // 只要能拿到 bucket 配置就能工作：
  //   · 默认匿名直传（bucket 需对 qth-feedback/* 开放匿名读写）
  //   · 若 oss-config.js 里另填了 AccessKey，则自动改用签名（适合私有 bucket）
  var USE_OSS = !!OSS.bucket;
  var USE_SIGN = !!(OSS.accessKeyId && OSS.accessKeySecret &&
                    window.crypto && window.crypto.subtle);
  var QUEUE_KEY = 'qth-feedback-queue';
  var DIR = OSS.dir || 'qth-feedback/';
  var ENDPOINT = OSS.bucket ? ('https://' + OSS.bucket + '.' + OSS.region + '.aliyuncs.com') : '';

  var isLanding = document.body.classList.contains('page-landing');
  var PAGE_NAME = isLanding ? '落地标准' : '起飞标准';

  var items = [];           // 已加载的记录
  var listState = 'idle';   // idle / loading / ok / err
  var listErr = '';

  // ============ 签名与请求 ============

  function b64(str) {
    var bytes = new TextEncoder().encode(str);
    var s = '';
    for (var i = 0; i < bytes.length; i += 1) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }

  function hmacSha1(secret, msg) {
    var enc = new TextEncoder();
    return window.crypto.subtle
      .importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'])
      .then(function (k) { return window.crypto.subtle.sign('HMAC', k, enc.encode(msg)); })
      .then(function (buf) {
        var bytes = new Uint8Array(buf);
        var s = '';
        for (var i = 0; i < bytes.length; i += 1) s += String.fromCharCode(bytes[i]);
        return btoa(s);
      });
  }

  // 发请求：默认匿名；配了 AccessKey 才走签名
  function ossFetch(method, key, opt) {
    opt = opt || {};
    var init = { method: method };
    if (opt.contentType) init.headers = { 'Content-Type': opt.contentType };
    if (opt.body) init.body = opt.body;
    var url = ENDPOINT + '/' + key + (opt.query || '');

    // 匿名直传：不带任何认证头（与 CheckQuestion 的做法一致）
    if (!USE_SIGN) return Promise.resolve(fetch(url, init));

    // 私有 bucket：用 x-oss-date + V1 签名
    // （浏览器禁止设 Date 头，这个 bucket 又禁用了 URL 签名，所以只能用 x-oss-date）
    var resource = '/' + OSS.bucket + '/' + key;
    var xdate = new Date().toUTCString();
    var contentType = opt.contentType || '';
    var toSign = method + '\n\n' + contentType + '\n' + xdate + '\n'
      + 'x-oss-date:' + xdate + '\n' + resource;

    return hmacSha1(OSS.accessKeySecret, toSign).then(function (sig) {
      init.headers['x-oss-date'] = xdate;
      init.headers['Authorization'] = 'OSS ' + OSS.accessKeyId + ':' + sig;
      return fetch(url, init);
    });
  }

  function ossList() {
    return ossFetch('GET', '', {
      query: '?prefix=' + encodeURIComponent(DIR) + '&max-keys=1000'
    }).then(function (res) {
      if (!res.ok) throw new Error('列表请求失败 ' + res.status);
      return res.text();
    }).then(function (xml) {
      var doc = new DOMParser().parseFromString(xml, 'text/xml');
      var keys = [];
      Array.prototype.forEach.call(doc.getElementsByTagName('Key'), function (n) {
        var v = n.textContent;
        if (v.slice(-5) === '.json') keys.push(v);
      });
      return keys;
    });
  }

  function ossGet(key) {
    return ossFetch('GET', key, {}).then(function (res) {
      if (!res.ok) throw new Error('读取失败 ' + res.status);
      return res.text();
    });
  }

  function ossPut(key, text) {
    return ossFetch('PUT', key, {
      contentType: 'application/json; charset=utf-8',
      body: new Blob([text], { type: 'application/json' })
    }).then(function (res) { return res.ok; });
  }

  function ossDelete(key) {
    return ossFetch('DELETE', key, {}).then(function (res) { return res.ok; });
  }

  // ============ 本机暂存队列（离线用） ============

  function loadQueue() {
    try {
      var s = localStorage.getItem(QUEUE_KEY);
      return s ? JSON.parse(s) : [];
    } catch (e) { return []; }
  }

  function saveQueue(arr) {
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(arr)); } catch (e) { /* 存不下就算了 */ }
  }

  function pushQueue(item) {
    var q = loadQueue();
    q.push(item);
    saveQueue(q);
  }

  // 把本机积压逐条补发
  function flushQueue() {
    if (!USE_OSS) return Promise.resolve();
    var q = loadQueue();
    if (!q.length) return Promise.resolve();
    return Promise.all(q.map(function (item) {
      return ossPut(DIR + item.id + '.json', JSON.stringify(item, null, 2)).then(function (ok) {
        if (!ok) return;
        saveQueue(loadQueue().filter(function (x) { return x.id !== item.id; }));
      }).catch(function () { /* 留着下次再发 */ });
    }));
  }

  // ============ 界面 ============

  function buildButton(nav) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'help-btn';
    btn.title = '需求记录';
    btn.setAttribute('aria-label', '需求记录');
    btn.textContent = '!';
    btn.addEventListener('click', openPanel);
    nav.appendChild(btn);
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtTime(t) {
    if (!t) return '';
    var d = new Date(t);
    if (isNaN(d.getTime())) return t;
    function p(n) { return n < 10 ? '0' + n : '' + n; }
    return (d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function renderList() {
    var box = document.getElementById('fbList');
    if (!box) return;
    if (!USE_OSS) {
      box.innerHTML = '<div class="fb-empty">未配置上传地址，只保存在本机。</div>' + renderQueue();
      return;
    }
    if (listState === 'loading') {
      box.innerHTML = '<div class="fb-empty">正在读取记录…</div>';
      return;
    }
    if (listState === 'err') {
      box.innerHTML = '<div class="fb-empty bad">读取失败：' + esc(listErr)
        + '<br>多半是权限或跨域没配好（需要 ListObjects / GetObject 权限，CORS 放行 GET / PUT / DELETE）。</div>'
        + renderQueue();
      return;
    }
    if (!items.length) {
      box.innerHTML = '<div class="fb-empty">还没有记录。</div>' + renderQueue();
      return;
    }
    var html = '<div class="fb-list-head">共 ' + items.length + ' 条</div>';
    items.forEach(function (it, idx) {
      var done = it.status === 'done';
      html += '<div class="fb-item' + (done ? ' done' : '') + '">'
        + '<div class="fb-item-text">' + esc(it.text) + '</div>'
        + '<div class="fb-item-btns">'
        + '<button type="button" class="fb-mark ok' + (done ? ' on' : '') + '" data-act="toggle" data-i="' + idx
        + '" title="' + (done ? '取消完成' : '标记完成') + '">✓</button>'
        + '<button type="button" class="fb-mark del" data-act="del" data-i="' + idx + '" title="删除">✕</button>'
        + '</div>'
        + '</div>';
    });
    box.innerHTML = html + renderQueue();
  }

  function renderQueue() {
    var q = loadQueue();
    if (!q.length) return '';
    var html = '<div class="fb-list-head">本机待发送 ' + q.length + ' 条</div>';
    q.forEach(function (it) {
      html += '<div class="fb-item pending">'
        + '<div class="fb-item-text">' + esc(it.text) + '</div>'
        + '</div>';
    });
    return html;
  }

  function loadList() {
    var box = document.getElementById('fbList');
    if (!box) return;
    if (!USE_OSS) { renderList(); return; }
    listState = 'loading';
    renderList();
    ossList().then(function (keys) {
      if (!keys.length) { items = []; listState = 'ok'; renderList(); return; }
      Promise.all(keys.map(function (k) {
        return ossGet(k).then(function (txt) {
          var o = JSON.parse(txt);
          o.key = k;
          return o;
        }).catch(function () { return null; });
      })).then(function (arr) {
        items = arr.filter(Boolean).sort(function (a, b) {
          return String(b.time || '').localeCompare(String(a.time || ''));
        });
        listState = 'ok';
        renderList();
      });
    }).catch(function (err) {
      listState = 'err';
      listErr = String((err && err.message) || err);
      renderList();
    });
  }

  function openPanel() {
    if (document.getElementById('fbMask')) { closePanel(); return; }

    var mask = document.createElement('div');
    mask.id = 'fbMask';
    mask.className = 'fb-mask';
    mask.addEventListener('click', function (e) { if (e.target === mask) closePanel(); });

    var panel = document.createElement('div');
    panel.className = 'fb-panel';
    panel.innerHTML =
      '<h3>需求记录</h3>'
      + '<div class="fb-list" id="fbList"></div>'
      + '<textarea id="fbText"></textarea>'
      + '<div class="fb-row">'
      + '<button type="button" class="primary" id="fbSend">提交</button>'
      + '<button type="button" class="ghost" id="fbClose">关闭</button>'
      + '<button type="button" class="ghost fb-mini" id="fbRefresh">刷新</button>'
      + '<span class="fb-state" id="fbState"></span>'
      + '</div>';

    mask.appendChild(panel);
    document.body.appendChild(mask);

    var ta = document.getElementById('fbText');
    var state = document.getElementById('fbState');

    document.getElementById('fbClose').addEventListener('click', closePanel);
    document.getElementById('fbRefresh').addEventListener('click', function () {
      flushQueue().then(loadList);
    });

    // 列表里的「完成 / 删除」
    document.getElementById('fbList').addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('button[data-act]') : null;
      if (!btn) return;
      var it = items[Number(btn.dataset.i)];
      if (!it) return;
      var act = btn.dataset.act;
      btn.disabled = true;
      if (act === 'del') {
        ossDelete(it.key).then(function (ok) {
          if (ok) {
            items = items.filter(function (x) { return x.key !== it.key; });
            renderList();
          } else {
            btn.disabled = false;
            state.textContent = '删除失败（检查 DeleteObject 权限）';
            state.className = 'fb-state bad';
          }
        });
      } else if (act === 'toggle') {
        var next = Object.assign({}, it, { status: it.status === 'done' ? 'todo' : 'done' });
        delete next.key;
        ossPut(it.key, JSON.stringify(next, null, 2)).then(function (ok) {
          if (ok) {
            it.status = next.status;
            renderList();
          } else {
            btn.disabled = false;
            state.textContent = '更新失败（检查 PutObject 权限）';
            state.className = 'fb-state bad';
          }
        });
      }
    });

    document.getElementById('fbSend').addEventListener('click', function () {
      var text = ta.value.trim();
      if (!text) {
        state.textContent = '还没写内容';
        state.className = 'fb-state bad';
        ta.focus();
        return;
      }
      var item = {
        id: String(Date.now()) + '-' + Math.random().toString(36).slice(2, 7),
        time: new Date().toISOString(),
        page: PAGE_NAME,
        text: text,
        status: 'todo',
        ua: navigator.userAgent
      };
      state.textContent = '正在提交…';
      state.className = 'fb-state';

      if (!USE_OSS) {
        pushQueue(item);
        ta.value = '';
        state.textContent = '未配置上传地址，已存在本机。';
        state.className = 'fb-state warn';
        renderList();
        return;
      }

      ossPut(DIR + item.id + '.json', JSON.stringify(item, null, 2)).then(function (ok) {
        if (ok) {
          ta.value = '';
          state.textContent = '已提交，谢谢！';
          state.className = 'fb-state ok';
          loadList();
        } else {
          pushQueue(item);
          ta.value = '';
          state.textContent = '当前没网或上传失败，已存在本机，联网后自动发出。';
          state.className = 'fb-state warn';
          renderList();
        }
      }).catch(function () {
        pushQueue(item);
        ta.value = '';
        state.textContent = '当前没网，已存在本机，联网后自动发出。';
        state.className = 'fb-state warn';
        renderList();
      });
    });

    flushQueue().then(loadList);
  }

  function closePanel() {
    var mask = document.getElementById('fbMask');
    if (mask && mask.parentNode) mask.parentNode.removeChild(mask);
  }

  // ============ 启动 ============

  function init() {
    var nav = document.querySelector('.nav');
    if (!nav) return;
    buildButton(nav);
    flushQueue();                                // 有积压就顺手补发
    window.addEventListener('online', flushQueue);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
