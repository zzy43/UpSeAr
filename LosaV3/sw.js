/* LOSA|TEM|观察模版 —— Service Worker（离线缓存）
   ------------------------------------------------------------------
   作用：装上之后整个页面离线可用，飞机上几个月没网也能打开填写。

   ⚠ 两个前提：
     1. 本文件和 LOSA模版V3.html 放在同一目录，一起上传到网站
     2. 第一次打开时**必须有网**（让 SW 装好），之后就能断网用

   ⚠ 如果以后改了 HTML 的文件名，把下面 PAGE 改掉，并把 CACHE 的版本号 +1
*/
var CACHE = 'losa-v2';
var PAGE = './LOSA模版V3.html';

var ASSETS = [
  PAGE,
  './css/losa.css',
  './js/losa.js',
  './manifest.json',
  './apple-touch-icon.png',
  './icon-192.png',
  './icon-512.png'
];

// 安装：把页面和图标拉进缓存
self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return Promise.all(ASSETS.map(function (u) {
        return c.add(new Request(u, { cache: 'reload' })).catch(function () { /* 单个失败不影响整体 */ });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

// 激活：清掉旧版本缓存
self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

// 取数据：有网走网络（顺手更新缓存），没网回退缓存
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  // 只管同源请求（页面本身、图标等），跨域的直接放行
  try {
    if (new URL(req.url).origin !== self.location.origin) return;
  } catch (err) { return; }

  e.respondWith(
    fetch(req).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(req, copy); }).catch(function () {});
      return res;
    }).catch(function () {
      return caches.match(req, { ignoreSearch: true }).then(function (hit) {
        if (hit) return hit;
        // 导航请求（打开页面）兜底回页面本体
        if (req.mode === 'navigate') {
          return caches.match(PAGE, { ignoreSearch: true });
        }
      });
    })
  );
});
