/**
 * Vanilla CardSlider 配置文件
 * 可在此自定义卡片轮播的行为与外观
 *
 * 作者：Riad Kilani @SyntaxSidekick
 * 作品集：https://riadkilani.com
 * GitHub：https://github.com/SyntaxSidekick
 * CodePen：https://codepen.io/SyntaxSidekick
 * X.com：https://x.com/syntaxsidekick
 * LinkedIn：https://linkedin.com/in/riad-kilani
 */

// =============================================================================
// 轮播数据配置
// =============================================================================

/**
 * 幻灯片数据结构 - 替换为你自己的内容
 * 每张幻灯片包含：genre（类型）、titleTop（标题上）、titleBottom（标题下）、synopsis（简介）、poster（海报）
 */
window.SLIDE_DATA = [
    {
        genre: 'Safety Audit',
        titleTop: '安全审核',
        titleBottom: '监督检查体系维护',
        synopsis: '建立健全并维护公司安全审核/监督检查机制、 标准及 SMS 体系审核规定； 组织审核准备会、进场会、文件审查、现场观察、访谈、实操验证、末次会、报告评审、整改通知下发和验证关闭全流程管理。 建立审核监察台账和信息系统，定期对审核质量、检查一致性、发现项重复率、整改及时率进行统计分析和质量控制，向安全委员会/安委会报告体系监督情况。',
        poster: 'https://s.cinemacafe.net/imgs/p/BJtgHx1uckDhTMJk9wdIh5UDvA0DDQwLCgkI/261483.jpg'
        // poster: 'https://sonna-kanji.com/wp-content/uploads/2018/01/180128seia2.jpg'
    },
    
    {
        genre: 'Operation Supervision',
        titleTop: '运行监察',
        titleBottom: '飞行/维修/运控/航站',
        synopsis: ' 对飞行、维修、航务/运行控制、航站、客运、货运、危险品、地面服务、配载平衡、外站/代理、驻外站点及授权运行领域开展监察，覆盖常规监察、专项监察、随机抽查、夜间/节假日检查、换季检查、跟班监察、外站检查和代理审核等形式；制定各运行领域年度监察大纲和检查单，明确检查依据、抽样比例、证据要求和判定标准。',
        poster: 'https://img.cinematoday.jp/a/kx4RrNXIO5Pk/_size_640x/_v_1480565057/main.jpg'
    },
    {
        genre: 'Statutory Inspection',
        titleTop: '法定自查',
        titleBottom: '证据标准和整改验证规则',
        synopsis: '建立健全公司法定自查制度， 制定并跟踪年度计划，推动法定自查与 SMS 危险源识别、隐患排查治理、安全绩效监测深度融合，统一问题分级、证据标准和整改验证规则。并按要求上报局方。负责公司法定自查相关信息的收集、 整理、 分析和上报工作。',
        poster: 'https://www.crank-in.net/img/db/1198995_650.jpg'
    },
    {
        genre: 'Management Evaluation',
        titleTop: '管理评审',
        titleBottom: '建立并组织安全评审工作',
        synopsis: '负责建立并组织开展公司安全管理评审工作，制定管理评审年度计划、方案和议程，明确评审输入、输出、频次、参会范围、决议形成和跟踪验证机制。系统收集评审输入，包括安全政策与目标完成情况、安全绩效指标及警戒值/目标值趋势、危险源库和风险控制措施状态、风险管理与安全保证输出、审核监察/法定自查/IOSA/LOSA结果。',
        poster: 'https://pic.rmb.bdstatic.com/bjh/events/3a006ab07685005476cec807c6ed2e4f.jpeg@h_1280'
    },
    {
        genre: 'Construction of Work Style',
        titleTop: '作风建设',
        titleBottom: '排查作风隐患和薄弱点',
        synopsis: '建立和维护公司安全作风建设管理制度，围绕“敬畏生命、敬畏规章、敬畏职责”，明确安全监察部归口管理职责。组织作风建设宣贯、案例警示、典型问题通报、专项培训、班组示范和管理干部作风测评；对作风事件开展根因分析，推动双人复核、交叉互检、电子留痕、流程防错、随机抽查和制度固化，培育全员“严、细、实、勤”的良好安全作风。',
        
        poster: 'https://sonna-kanji.com/wp-content/uploads/2018/01/180128seia2.jpg'
    },
    {
        genre: 'IOSA',
        titleTop: 'IOSA 审计',
        titleBottom: '配合与相关检查单内审',
        synopsis: '配合牵头部门完成 IOSA 审计及复审/持续注册工作，作为安全管理和 ORG/ORA 等相关检查单的归口接口，负责组织条款差距分析、责任分解、证据准备、文件对标、访谈培训、模拟审计、现场陪同、发现项整改和关闭验证。建立 IOSA 内审矩阵，明确责任部门、证据材料、完成时限和验收标准。',
        poster: 'https://img.linekong.com/www8864_edt/2015/05/26/n131000014789226.jpg'
    },
    {
        genre: 'LOSA',
        titleTop: 'LOSA',
        titleBottom: '航线运行安全审计',
        synopsis: '统筹制定公司 LOSA 年度计划和抽样方案，覆盖机型、基地、航线、航段、昼夜时段、复杂机场、天气特点、机组搭配、高低威胁运行环境等维度；组织飞行部、运行标准技术部及训练、运控、安全信息等相关部门开展观察员选拔、培训、认证和校准，统一观察标准、TEM 判据、记录口径和质量控制方法。',
        poster: 'https://img0.baidu.com/it/u=386347427,3676949626&fm=253&fmt=auto&app=120&f=JPEG?w=1280&h=800'
    },
    {
        genre: 'Superhero Ensemble',
        titleTop: '安全文化',
        titleBottom: '安全宣传与教育培训',
        synopsis: '组织编写、修订《航空安全管理程序》《安全监察部管理手册》及相关支持性程序；对公司整体安全形势开展月度、季度、年度分析，综合强制/自愿报告、QAR/FOQA、审核监察、法定自查、LOSA、事件调查、安全绩效指标、行业安全信息和监管要求，识别重点风险、薄弱环节和培训需求。',
        poster: 'https://i2.hdslb.com/bfs/archive/ce7e52f54a70f57f97356c05069bc16287ed7bbc.jpg'
    },
    {
        genre: 'Various Assignment',
        titleTop: '各项任务',
        titleBottom: '安全专项/迎审迎检迎审迎检',
        synopsis: '贯彻落实上级有关指示、民航局/地区管理局政策及公司安委会决议，完成领导交办的各项任务；按分工承担安委会办公室日常、监管检查配合、安全信息报送、重大活动/换季/节假日/专包机（如适用）安全保障监察、安全专项行动、迎审迎检和经验交流；确保监督工作独立、客观、公正、规范。',
        poster: 'https://ss0.baidu.com/94o3dSag_xI4khGko9WTAnF6hhy/image/pic/item/3b292df5e0fe99253ce7528f3fa85edf8cb17101.jpg'
    }
];

// =============================================================================
// 布局与定位配置
// =============================================================================

window.CAROUSEL_CONFIG = {
    // 缩略图尺寸与间距
    THUMB_WIDTH: 200,
    THUMB_HEIGHT: 300,
    THUMB_SPACING: 40,
    MAX_VISIBLE_THUMBS: 4,
    
    // 定位
    THUMB_AREA_RIGHT: 900,      // 距屏幕右边缘的距离
    THUMB_AREA_BOTTOM: 500,     // 距屏幕底部的距离
    MIN_AREA_OFFSET: 300,       // 距屏幕边缘的最小偏移量
    
    // 动画时长（毫秒）
    ANIMATION_DURATION: 600,    // 主幻灯片的过渡时长
    STAGGER_DELAY: 0.1,         // 缩略图动画之间的错开延迟（秒）
    TEXT_SWITCH_DELAY: 320,     // 文字内容切换前的延迟
    TEXT_HIDE_DELAY: 200,       // 隐藏旧文字前的延迟
    
    // 自动播放设置
    AUTO_PLAY_INTERVAL: 5000,   // 两次自动切换之间的间隔（毫秒）
    // 启动时不开自动播放（用户要求：默认暂停，想看再点播放）
    AUTO_PLAY_ENABLED: false,
    
    // z-index 管理
    Z_INDEX_CYCLE_LENGTH: 8,    // 多少张幻灯片后重置 z-index
    Z_INDEX_BASE: 10,           // z-index 基础值
    Z_INDEX_SPACING: 4,         // 各 z-index 层级之间的间隔
    
    // 键盘导航
    KEYBOARD_ENABLED: true,     // 是否启用方向键导航
    
    // 调试模式
    DEBUG_LOGGING: false        // 是否在控制台输出调试日志
};

// =============================================================================
// 外观配置
// =============================================================================

window.APPEARANCE_CONFIG = {
    // 配色方案
    PRIMARY_COLOR: '#2196F3',       // Material 蓝
    ACCENT_COLOR: '#FF5722',        // Material 深橙色
    BACKGROUND_COLOR: '#121212',    // 深色背景
    TEXT_COLOR: '#ffffff',          // 主文字颜色
    
    // Material Design 高度阴影
    CONTROL_SHADOW: '0 4px 8px rgba(0,0,0,0.3)',
    THUMBNAIL_SHADOW: '0 2px 8px rgba(0,0,0,0.2)',
    
    // 圆角
    BORDER_RADIUS: '8px',
    
    // 字体排版
    TITLE_FONT_SIZE: '4rem',
    GENRE_FONT_SIZE: '1.1rem',
    SYNOPSIS_FONT_SIZE: '1rem',
    
    // 用于提升可见度的文字阴影
    TEXT_SHADOW: `
        0 0 20px rgba(0, 0, 0, 0.9),
        0 0 40px rgba(0, 0, 0, 0.7),
        0 4px 12px rgba(0, 0, 0, 0.8)
    `
};

// =============================================================================
// 响应式断点
// =============================================================================

window.RESPONSIVE_CONFIG = {
    // 现代断点定义
    MOBILE_MAX: 768,
    TABLET_MAX: 1024,
    DESKTOP_MIN: 1025,
    LARGE_DESKTOP_MIN: 1400,
    
    // 移动端调整（≤768px）
    MOBILE_THUMB_WIDTH: 100,
    MOBILE_THUMB_HEIGHT: 150,
    MOBILE_MAX_THUMBS: 2,
    MOBILE_TITLE_SIZE: '2rem',
    MOBILE_SPACING: 20,
    
    // 平板端调整（769px - 1024px）
    TABLET_THUMB_WIDTH: 140,
    TABLET_THUMB_HEIGHT: 210,
    TABLET_MAX_THUMBS: 3,
    TABLET_TITLE_SIZE: '3rem',
    TABLET_SPACING: 30,
    
    // 桌面端调整（≥1025px）
    DESKTOP_THUMB_WIDTH: 200,
    DESKTOP_THUMB_HEIGHT: 300,
    DESKTOP_MAX_THUMBS: 4,
    DESKTOP_TITLE_SIZE: '4rem',
    DESKTOP_SPACING: 40,
    
    // 大屏桌面调整（≥1400px）
    LARGE_DESKTOP_MAX_THUMBS: 5,
    LARGE_DESKTOP_TITLE_SIZE: '5rem',
    
    // 动态间距计算
    getResponsiveSpacing: function(screenWidth) {
        if (screenWidth <= this.MOBILE_MAX) return this.MOBILE_SPACING;
        if (screenWidth <= this.TABLET_MAX) return this.TABLET_SPACING;
        return this.DESKTOP_SPACING;
    },
    
    // 基于视口尺寸的定位
    getViewportPositioning: function(screenWidth, screenHeight) {
        const isMobile = screenWidth <= this.MOBILE_MAX;
        const isTablet = screenWidth > this.MOBILE_MAX && screenWidth <= this.TABLET_MAX;
        
        return {
            thumbAreaRight: isMobile ? Math.min(screenWidth * 0.05, 30) : 
                           isTablet ? Math.min(screenWidth * 0.1, 150) :
                           Math.min(screenWidth * 0.2, 400),
            
            thumbAreaBottom: isMobile ? Math.min(screenHeight * 0.2, 150) :
                            isTablet ? Math.min(screenHeight * 0.25, 250) :
                            Math.min(screenHeight * 0.3, 350),
            
            slideInfoLeft: isMobile ? Math.min(screenWidth * 0.05, 20) :
                          isTablet ? Math.min(screenWidth * 0.08, 40) :
                          60,
            
            slideInfoTop: isMobile ? Math.min(screenHeight * 0.15, 120) :
                         isTablet ? Math.min(screenHeight * 0.2, 180) :
                         240
        };
    }
};

// =============================================================================
// 自定义辅助工具
// =============================================================================

/**
 * 常用自定义项的快捷设置
 */
window.CAROUSEL_QUICK_SETUP = {
    /**
     * 使用自定义数据设置轮播
     */
    setSlideData: function(newData) {
        window.SLIDE_DATA = newData;
        return this;
    },
    
    /**
     * 调整播放节奏，让过渡更快或更慢
     */
    setTiming: function(speed = 'normal') {
        const timings = {
            slow: { duration: 1000, interval: 8000 },
            normal: { duration: 600, interval: 5000 },
            fast: { duration: 400, interval: 3000 }
        };
        
        const config = timings[speed] || timings.normal;
        window.CAROUSEL_CONFIG.ANIMATION_DURATION = config.duration;
        window.CAROUSEL_CONFIG.AUTO_PLAY_INTERVAL = config.interval;
        return this;
    },
    
    /**
     * 设置配色方案
     */
    setColors: function(primary, accent, background = '#121212') {
        window.APPEARANCE_CONFIG.PRIMARY_COLOR = primary;
        window.APPEARANCE_CONFIG.ACCENT_COLOR = accent;
        window.APPEARANCE_CONFIG.BACKGROUND_COLOR = background;
        return this;
    },
    
    /**
     * 关闭自动播放
     */
    disableAutoPlay: function() {
        window.CAROUSEL_CONFIG.AUTO_PLAY_ENABLED = false;
        return this;
    },
    
    /**
     * 开启调试模式
     */
    enableDebug: function() {
        window.CAROUSEL_CONFIG.DEBUG_LOGGING = true;
        return this;
    }
};

// =============================================================================
// 自定义示例
// =============================================================================

/**
 * 示例：产品展示配置
 */
window.PRODUCT_SHOWCASE_SETUP = function() {
    return window.CAROUSEL_QUICK_SETUP
        .setColors('#4CAF50', '#FF9800', '#fafafa')
        .setTiming('slow')
        .disableAutoPlay();
};

/**
 * 示例：作品集画廊配置  
 */
window.PORTFOLIO_SETUP = function() {
    return window.CAROUSEL_QUICK_SETUP
        .setColors('#9C27B0', '#E91E63')
        .setTiming('normal');
};

/**
 * 示例：新闻/文章轮播配置
 */
window.NEWS_SETUP = function() {
    return window.CAROUSEL_QUICK_SETUP
        .setColors('#607D8B', '#FF5722')
        .setTiming('fast');
};