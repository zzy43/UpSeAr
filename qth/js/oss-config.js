/* 阿里云 OSS 直传配置（需求反馈用）
   ------------------------------------------------------------------
   ⚠ 这个文件会随网页一起发布，里面的 AccessKey 谁打开都能看到。
     所以务必：
       1) 在阿里云 RAM 里新建一个「子账号」，只给这一个 bucket 的
          oss:PutObject 权限，且限制到 qth-feedback/ 前缀；
       2) 不要用主账号 AccessKey；
       3) 发现外泄随时禁用该子账号。

   填好下面四项，反馈就会以 qth-feedback/<时间戳-随机>.json 存进 bucket。
   留空 = 不上传，反馈只存在用户本机（localStorage）。

   另外 bucket 需要配置 CORS（跨域设置）：
     · 来源：你部署网页的域名（本地测试可写 *）
     · 允许方法：POST、GET、HEAD
     · 允许 Headers：*
     · 暴露 Headers：ETag
*/
window.OSS_CONFIG = {
  bucket: 'softinstore',                 // 你的 bucket 名
  region: 'oss-cn-hangzhou',               // 地域（endpoint 前缀）
  dir: 'qth-feedback/',                    // 存放目录
  accessKeyId: '',                         // RAM 子账号 AccessKeyId
  accessKeySecret: '',                     // RAM 子账号 AccessKeySecret
  expiration: '2035-01-01T00:00:00.000Z'   // 直传签名的有效期
};
