/**
 * 法定自查系统 · 配置文件
 * 只改这一个文件，就能切换数据源（OSS）、改审核员名单、改问题级别和来源分类
 *
 * ============================ 数据结构说明 ============================
 * 数据以 JSON 形式放在阿里云 OSS 上，页面直接 GET 读取、改动自动 PUT 回去：
 *
 * {
 *   "theme": "Statutory Inspection",        // 主题标识，和轮播页的 genre 对应
 *   "title": "法定自查 · 年度审核计划",       // 页面标题
 *   "updated": "2026-09-21 13:15",          // 数据更新时间，仅用于展示
 *
 *   "auditors": [ "景志详", "李孟清" ],        // 审核员名单（可以不写，会用下面的 AUDITORS）
 *     · 也可以写成带颜色的对象，页面上「⋯ → 🎨 编辑样式」改的就是这几个值：
 *       { "name": "景志详", "color": "#E8688A", "ink": "#cfe4ff", "short": "景" }
 *       color = 名字牌子的底色；ink = 牌子上文字的颜色（留空则用 CSS 的 --chip-ink）；
 *       short = **一个字**，安全审核的日历格子用它（默认取名字第一个字）。
 *     · ⚠ 名单实际上存在**两个系统共用的** OSS 文件 审核员.json 里（见下面
 *       OSS_ROSTER_FILE）；这里的 auditors 只是那份共享文件还没建出来时的初始值。
 *       在安全审核（SafetyAudit/work.html）里加人/改颜色，这边刷新后也一样。
 *
 *   "units": [                              // 受检单位 + 计划什么时候去查它
 *     // ⚠ 部门名**允许重复**：审核是长期的事，飞行部 2025 年审过，
 *     //   2026、2027 年还要再审 —— **每一条就是一轮**，各自带自己的问题库。
 *     //   所以同一个部门可以有好几条，靠 plan / note / audited 区分是哪一轮。
 *     { "id": "u-flight", "name": "飞行部", "plan": "2027-04",
 *       "auditors": ["景志详", "方乔"], "note": "年度审核", "audited": false,
 *       "conclusion": "审核情况说明（可空）",
 *       "files": [ { "name": "审核计划.pdf", "url": "https://…", "size": 1234 } ] }
 *   ],
 *     · plan 是「计划检查的年月」，格式 YYYY-MM；不排计划就留空字符串；
 *     · auditors 是**审核员，可以多个人**（数组）；只写一个也行。
 *       老数据把审核员写成单个字符串的 "lead" 也认，读进来会自动变成数组。
 *     · audited: true = **这个单位的计划审核已经做完了**（在「编辑受检单位」里勾）。
 *       跟问题的 status 是两回事：那个是“这条问题算不算用上了”，这个是“这趟审核完没完”。
 *     · conclusion / files 和问题里的**同名同义**（单位的总体情况说明 + 相关附件），
 *       也在「编辑受检单位」里填；files 的结构和 issues[].files 完全一样。
 *
 *   "issues": [                             // 问题库：还没去检查之前攒下来的问题
 *     { "id": "q-xxx", "unit": "u-flight", "date": "2026-11-05",
 *       "level": "一般", "source": "日常观察", "by": "朱震宇",
 *       "text": "排班出现……", "detail": "详细说明（可空）",
 *       "conclusion": "审核情况说明（可空：审核完之后回来填）",
 *       "files": [                          // 取证附件（可空，可以多个）
 *         { "name": "现场照片.jpg",
 *           "url": "https://…/CheckQuestion/文件/20260921-183012-现场照片.jpg",
 *           "size": 123456 }
 *       ],
 *       "status": "open" }
 *   ]
 *     · unit 必须等于某个 units[].id；
 *     · level 只能是 LEVELS 里的一个；source 只能是 SOURCES 里的一个；
 *     · status: "open" = 待审核（默认） / "done" = 已完成（去检查时用上这条了）；
 *     · conclusion 是**审核完成后的情况说明**（去检查之前是空的，检查完再回来填），
 *       卡片上只露三行、点开看全文；也一起导出到 CSV / 一起搜。
 *     · files[].url 是 OSS 上的文件地址（`文件/` 子目录，页面上传时自动生成，
 *       文件名前面加时间戳防重名）；图片（jpg/png/gif/webp/bmp/svg）鼠停可预览。
 *
 * 说明：
 *   - units[].id 是唯一标识，英文短横线或数字都行，不要重复；
 *   - 想加一个单位/一条问题，直接在 JSON 里加即可，页面不用改代码。
 * ====================================================================
 */

window.CHECK_CONFIG = {
    // ===== 数据源 =====
    // 「法定自查」在阿里云 OSS 上的专用目录：和安全审核分开放，互不影响
    OSS_BASE_URL: 'https://safety-audit-system.oss-cn-hangzhou.aliyuncs.com/CheckQuestion/',

    // 数据文件名（相对上面的目录）
    OSS_JSON_FILE: 'check.json',

    // 数据文件不在上面的目录时，可在这里直接写完整地址（填了就以它为准）
    OSS_JSON_URL: '',

    // ===== 和安全审核（SafetyAudit）共用的审核员名单 =====
    // 只写文件名时，地址 = OSS_BASE_URL 的上一级（也就是 bucket 根目录）+ 文件名。
    // 两个系统都读、都写这一份，所以一边改了名字/颜色/单字，另一边刷新后就是同一套；
    // 一边加了人/删了人，另一边也跟着变。想换地方就在两边配置里都填 OSS_ROSTER_URL。
    OSS_ROSTER_FILE: '审核员.json',
    OSS_ROSTER_URL: '',

    // 读 OSS 时附加时间戳，避免浏览器/CDN 缓存拿到旧数据
    NO_CACHE: true,

    // OSS 读取失败时，是否回退到示例数据（false 则直接报错）
    FALLBACK_ENABLED: true,

    // ===== 保存 =====
    // 页面上任何改动都会在停手后自动 PUT 回 OSS；
    // OSS 上还没有这个文件时（第一次用）也会建出来，见 check-core.js 的 loadAll
    OSS_AUTO_SAVE: true,
    OSS_SAVE_DEBOUNCE: 800,

    // ===== 字体 =====
    // 各系统自带的常规字体，打开最快；网络字体（放 OSS 上）填 FONT_URL
    FONT_FAMILY: '"Segoe UI", "Microsoft YaHei", "PingFang SC", "Noto Sans SC", "Hiragino Sans GB", system-ui, sans-serif',
    FONT_URL: '',

    // ===== 审核员 =====
    // 记录问题时「记录人」下拉里就是这几个人；
    // 单位里的审核员也是从这几个人里选（**可以多选**）；color 是名字牌子的底色，
    // ink 是牌子上的字色（留空就用 CSS 里的 --chip-ink 那道亮蓝），
    // short 是**一个字**，安全审核的日历格子用它（留空 = 取名字第一个字）。
    // 注意：这几项现在**存在两个系统共用的 审核员.json 里**（见上面 OSS_ROSTER_FILE），
    // 下面这份只是「共享文件还没建出来时」的初始默认值。
    AUDITORS: [
        { name: '景志详', color: '#E8688A' },
        { name: '李孟清', color: '#5B8FF9' },
        { name: '方乔',   color: '#9B7BE8' },
        { name: '朱震宇', color: '#3FA796' }
    ],

    // ===== 问题分级 / 来源 =====
    // 顺序就是从轻到重，颜色在 css/check-base.css 的 --lv-1/2/3
    LEVELS: ['一般', '重要', '严重'],
    SOURCES: ['日常观察', '现场检查', '文件审查', '访谈了解', '数据/记录分析', '其他'],

    // ===== 受检单位 =====
    // 第一次打开、或 OSS 上还没有 check.json 时，用这份默认计划
    // auditors 可以写多个
    UNITS: [
        { id: 'u-flight', name: '飞行部',   plan: '2027-04', auditors: ['景志详'], note: '年度审核' },
        { id: 'u-tech',   name: '运技部',   plan: '2027-07', auditors: ['李孟清'], note: '年度审核' },
        { id: 'u-dac',    name: '达卡航站', plan: '2027-08', auditors: ['方乔'],   note: '' },
        { id: 'u-kmg',    name: '昆明航站', plan: '2027-09', auditors: ['朱震宇'], note: '' }
    ],

    // ===== 其他 =====
    // 距计划检查还有多少天以内，就把「还有 N 天」标成暖色提醒
    SOON_DAYS: 60
};
