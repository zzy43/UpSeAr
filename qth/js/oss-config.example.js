/* 阿里云 OSS 直传配置 —— 模板文件（可以提交到 Git）
   ------------------------------------------------------------------
   用法：
     1. 把本文件复制一份，命名为 oss-config.js（同目录）
     2. 在 oss-config.js 里填真实的 bucket / AccessKey
     3. oss-config.js 已被 .gitignore 忽略，不会进仓库

   ⚠ oss-config.js 会随网页一起发布，里面的 AccessKey 谁打开都能看到。所以务必：
       1) 在阿里云 RAM 里新建一个「子账号」，只给下面这条自定义策略：
          {
            "Version": "1",
            "Statement": [
              { "Effect": "Allow",
                "Action": ["oss:GetObject","oss:PutObject","oss:DeleteObject"],
                "Resource": ["acs:oss:*:*:你的bucket名/qth-feedback/*"] },
              { "Effect": "Allow",
                "Action": ["oss:ListObjects"],
                "Resource": ["acs:oss:*:*:你的bucket名"],
                "Condition": { "StringLike": { "oss:Prefix": ["qth-feedback/*"] } } }
            ]
          }
       2) 不要用主账号 AccessKey
       3) 发现外泄随时禁用该子账号

   bucket 还需要配置 CORS（跨域设置）：
     · 来源：你部署网页的域名（本地测试可写 *）
     · 允许方法：GET、POST、PUT、DELETE、HEAD
     · 允许 Headers：*（需要放行 x-oss-date、authorization、content-type）
     · 暴露 Headers：ETag
*/
window.OSS_CONFIG = {
  bucket: '',                              // 例：softinstore
  region: 'oss-cn-hangzhou',
  dir: 'qth-feedback/',
  accessKeyId: '',                         // RAM 子账号 AccessKeyId
  accessKeySecret: '',                     // RAM 子账号 AccessKeySecret
  expiration: '2035-01-01T00:00:00.000Z'
};
