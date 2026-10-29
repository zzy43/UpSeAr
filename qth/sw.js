/* 圆通-全天候 · Service Worker
   目标：装到主屏后整站离线可用。
   策略：有网时用网络（顺手更新缓存），没网时回退缓存。
   匹配时忽略 ?v=xx 查询串，所以改版本号不用同步改这里的清单。*/

var CACHE = 'qth-v60';

// 首次安装要预缓存的文件（相对路径，部署在子目录也能用）
var ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/data.js',
  './js/core.js',
  './js/facility.js',
  './js/judge.js',
  './js/inputs.js',
  './js/main.js',
  './img/logo.png',
  './img/icon-192.png',
  './img/icon-512.png',
  './img/apple-touch-icon.png'
];

// 安装：把核心文件拉进缓存，然后立刻接管
self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) {
        return Promise.all(ASSETS.map(function (u) {
          return c.add(new Request(u, { cache: 'reload' })).catch(function () { /* 单个失败不影响整体 */ });
        }));
      })
      .then(function () { return self.skipWaiting(); })
  );
});

// 激活：清掉旧版本的缓存
self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (k) {
          if (k !== CACHE) return caches.delete(k);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

// 取数据：先网络，失败回缓存（忽略 ?v= 查询串）
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || req.url.indexOf('http') !== 0) return;

  e.respondWith(
    fetch(req)
      .then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
        return res;
      })
      .catch(function () {
        return caches.match(req, { ignoreSearch: true }).then(function (hit) {
          if (hit) return hit;
          // 导航请求兜底回首页
          if (req.mode === 'navigate') {
            return caches.match('./index.html', { ignoreSearch: true });
          }
        });
      })
  );
});
