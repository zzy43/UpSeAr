/**
 * 管理评审系统 · 配置文件
 * ==================================================================
 * 「非 396 事件重点 QAR 项目 · 多部门合作闭环」
 *
 * 干什么用的：
 *   · 安监部牵头，运技部、飞行部共同参与，把**非 396 事件**里的
 *     **重点 QAR 项目**做成一条闭环：调查 → 分析 → 讲评 → 措施 → 改进 → 督促。
 *   · 每个 QAR 项目就是一条记录，六步各自有负责部门、状态、日期、说明和附件；
 *     六步全部完成，这个项目就算闭环。
 *   · 数据放**云端**的独立目录（ManagementReview/），
 *     和安全审核（SafetyAudit/）、法定自查（CheckQuestion/）分开，互不影响。
 *
 * 只改这一个文件，就能切换数据源（云端地址）、改部门、改六步定义、改默认项目。
 * ==================================================================
 */

window.REVIEW_CONFIG = {
    // ===== 数据源 =====
    // 本系统的云端专用目录：和其他系统分开放（改地址只改这一个）
    OSS_BASE_URL: 'https://safety-audit-system.oss-cn-hangzhou.aliyuncs.com/ManagementReview/',

    // 数据文件名（相对上面的目录）
    OSS_JSON_FILE: 'review.json',

    // 数据文件不在上面的目录时，可在这里直接写完整地址（填了就以它为准）
    OSS_JSON_URL: '',

    // 读数据时附加时间戳，避免浏览器/CDN 缓存拿到旧数据
    NO_CACHE: true,

    // 读取失败时，是否回退到示例数据（false 则直接报错）
    FALLBACK_ENABLED: true,

    // ===== 保存 =====
    // 页面上任何改动都会在停手后自动上传到云端；
    // 云端还没有这个文件时（第一次用）也会建出来，见 review-core.js 的 loadAll
    OSS_AUTO_SAVE: true,
    OSS_SAVE_DEBOUNCE: 800,

    // ===== 字体 =====
    FONT_FAMILY: '"Segoe UI", "Microsoft YaHei", "PingFang SC", "Noto Sans SC", "Hiragino Sans GB", system-ui, sans-serif',
    FONT_URL: '',

    // ===== 协作部门 =====
    // 第一个是牵头部门（安监部）；color 是名字牌子/阶段色条的底色
    DEPARTMENTS: [
        { name: '安监部', color: '#3FA796', note: '牵头' },
        { name: '运技部', color: '#5B8FF9', note: '配合' },
        { name: '飞行部', color: '#9B7BE8', note: '配合' }
    ],

    // ===== 项目级别 / 来源 =====
    // 级别三档（从轻到重）；新建项目时按级别自动生成编号前缀（见 LEVEL_PREFIX）
    LEVELS: ['普通', '重要', '严重'],
    // 级别 → 自动编号前缀。普通 → 普通-2026-01，重要 → 重要-2026-01，严重 → 严重-2026-01
    LEVEL_PREFIX: { '普通': '普通', '重要': '重要', '严重': '严重' },
    // 老数据里的叫法 → 新档次（云端 review.json 里存过 QAR事件 / 396事件 的，读进来自动换算）
    LEVEL_ALIAS: { 'QAR事件': '重要', '396事件': '严重' },
    // 老编号前缀 → 新前缀。老编号 QAR-2026-01 → 重要-2026-01，396-2026-01 → 严重-2026-01
    NO_PREFIX_ALIAS: { 'QAR': '重要', '396': '严重' },
    // 新建项目时「调查」这一步的默认负责部门，按级别区分
    // （其余几步的默认部门都在 STAGES 里，所有级别共用）
    LEVEL_FIRST_STAGE_DEPT: { '普通': '运技部', '重要': '运技部', '严重': '安监部' },
    // 来源：**第一个是默认值**（新建项目时默认选中）
    SOURCES: ['机组报告', 'QAR/FOQA', '飞行数据', '其他'],

    // ===== 六步闭环（顺序就是闭环顺序，不要随意调换） =====
    // key 内部用（不要改），name 界面上显示，dept 是这一步的**默认负责部门**
    // （新建项目时按这个生成六步；每一步都能单独改成别的部门），desc 一句话释义
    STAGES: [
        { key: 'investigate', name: '调查', dept: '运技部', desc: '核实事件经过、调取 QAR/飞行数据与相关记录' },
        { key: 'analyze',     name: '分析', dept: '运技部', desc: '从机型性能、运行标准、程序执行等角度找原因' },
        { key: 'review',      name: '讲评', dept: '运技部', desc: '组织机组讲评、案例复盘，统一认识' },
        { key: 'measure',     name: '措施', dept: '飞行部', desc: '制定并下发针对性管控措施、明确责任与时限' },
        { key: 'improve',     name: '改进', dept: '飞行部', desc: '落实训练、程序、手册等改进并固化' },
        { key: 'supervise',   name: '督促', dept: '安监部', desc: '跟踪验证改进效果，确认闭环' }
    ],

    // 各阶段办理人（下拉可选；留空也能手填）
    RESPONSIBLES: ['陈吉龙', '陈震', '傅作彪'],

    // ===== 第一次打开、或 OSS 上还没有 review.json 时用的默认项目 =====
    // stages 里只写 key 和 status 即可，其余字段（name/dept）由 STAGES 补齐
    ITEMS: [
        {
            id: 'qar-demo-1',
            no: '重要-2026-01',
            title: '起飞机段俯仰配平超限（非 396 事件）',
            level: '重要',
            source: 'QAR/FOQA',
            date: '2026-09-12',
            flight: 'MU5123',
            aircraft: 'B-1234',
            lead: '安监部',
            owner: '陈吉龙',
            desc: '航班起飞爬升阶段出现俯仰配平超限，QAR 判读为硬警告，经确认为非 396 事件。',
            status: 'open',
            stages: [
                { key: 'investigate', status: 'done', date: '2026-09-15', by: '陈吉龙', note: '已调取 QAR 三轴数据与机组报告，事件经过核实完毕。' },
                { key: 'analyze',     status: 'doing', date: '2026-09-22', by: '陈震', note: '正在对比同机型历史数据，分析配平操作与重量配载的关系。' },
                { key: 'review',      status: 'todo' },
                { key: 'measure',     status: 'todo' },
                { key: 'improve',     status: 'todo' },
                { key: 'supervise',   status: 'todo' }
            ]
        },
        {
            id: 'qar-demo-2',
            no: '普通-2026-01',
            title: '进近阶段下降率偏大',
            level: '普通',
            source: 'QAR/FOQA',
            date: '2026-09-20',
            flight: 'MU6789',
            aircraft: 'B-5678',
            lead: '安监部',
            owner: '傅作彪',
            desc: '进近 1000 英尺以下下降率短时超出公司监控标准，非 396 事件。',
            status: 'open',
            stages: [
                { key: 'investigate', status: 'done', date: '2026-09-23', by: '陈震', note: '' },
                { key: 'analyze',     status: 'todo' },
                { key: 'review',      status: 'todo' },
                { key: 'measure',     status: 'todo' },
                { key: 'improve',     status: 'todo' },
                { key: 'supervise',   status: 'todo' }
            ]
        }
    ]
};
