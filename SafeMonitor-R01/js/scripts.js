/**
 * Vanilla CardSlider - Material Design 内容展示组件
 * 一个高度可定制、响应式的卡片轮播，带 Material Design 控件
 *
 * 作者：Riad Kilani @SyntaxSidekick
 * 作品集：https://riadkilani.com
 * GitHub：https://github.com/SyntaxSidekick
 * CodePen：https://codepen.io/SyntaxSidekick
 * X.com：https://x.com/syntaxsidekick
 * LinkedIn：https://linkedin.com/in/riad-kilani
 */

// 使用外部配置的幻灯片轮播
const slideData = window.SLIDE_DATA || [];
const CAROUSEL_CONFIG = window.CAROUSEL_CONFIG || {};

// 图标内置成 SVG 字符串：不依赖外网图标字体（国外 CDN 国内打不开）
const ICON_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';

class SlideCarousel {
    constructor() {
        // 状态管理
        this.activeIndex = 0;
        this.totalSlides = slideData.length;
        this.sequenceArray = Array.from({length: this.totalSlides}, (_, i) => i);
        this.isAutoActive = CAROUSEL_CONFIG.AUTO_PLAY_ENABLED !== false;
        this.autoTimer = null;
        this.usePrimaryInfo = true;
        this.cycleCounter = 0;
        
        // 调试日志
        this.debug = CAROUSEL_CONFIG.DEBUG_LOGGING || false;
        
        this.log('🚀 Initializing with configuration:', CAROUSEL_CONFIG);
        this.init();
    }
    
    log(...args) {
        if (this.debug) {
            console.log(...args);
        }
    }
    
    cacheDOMElements() {
        const elements = {};
        const ids = [
            'slide-carousel', 'slide-info-primary', 'slide-info-secondary',
            'loading-screen'
        ];
        
        ids.forEach(id => {
            const element = document.getElementById(id);
            if (!element) {
                console.error(`❌ Element with ID '${id}' not found!`);
            } else {
                console.log(`✅ Found element with ID '${id}'`);
            }
            elements[id.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = element;
        });
        
        // 缓存 Material Design 导航元素
        elements.materialControls = document.querySelector('.material-controls');
        elements.navLeft = document.querySelector('[data-action="prev"]');
        elements.navRight = document.querySelector('[data-action="next"]');
        elements.playPauseBtn = document.querySelector('[data-action="play-pause"]');
        elements.progressIndicator = document.querySelector('.progress-fill');
        elements.currentSlide = document.querySelector('.current-slide');
        elements.totalSlides = document.querySelector('.total-slides');
        elements.bottomProgressIndicator = document.querySelector('.progress-indicator');
        
        // 输出查找到的元素
        this.log('🔧 Cached elements:', {
            slideCarousel: elements.slideCarousel,
            slideInfoPrimary: elements.slideInfoPrimary,
            slideInfoSecondary: elements.slideInfoSecondary,
            materialControls: elements.materialControls,
            navLeft: elements.navLeft,
            navRight: elements.navRight
        });
        
        return elements;
    }
    
    calculateLayout() {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        
        // 读取响应式配置
        const RESPONSIVE_CONFIG = window.RESPONSIVE_CONFIG || {};
        
        // 判断当前所处的断点
        const isMobile = vw <= (RESPONSIVE_CONFIG.MOBILE_MAX || 768);
        const isTablet = vw > (RESPONSIVE_CONFIG.MOBILE_MAX || 768) && vw <= (RESPONSIVE_CONFIG.TABLET_MAX || 1024);
        
        // 使用响应式取值
        const thumbWidth = isMobile ? (RESPONSIVE_CONFIG.MOBILE_THUMB_WIDTH || 120) :
                          isTablet ? (RESPONSIVE_CONFIG.TABLET_THUMB_WIDTH || 160) :
                          CAROUSEL_CONFIG.THUMB_WIDTH;
        
        const thumbHeight = isMobile ? (RESPONSIVE_CONFIG.MOBILE_THUMB_HEIGHT || 180) :
                           isTablet ? (RESPONSIVE_CONFIG.TABLET_THUMB_HEIGHT || 240) :
                           CAROUSEL_CONFIG.THUMB_HEIGHT;
        
        const maxThumbs = isMobile ? (RESPONSIVE_CONFIG.MOBILE_MAX_THUMBS || 2) :
                         isTablet ? (RESPONSIVE_CONFIG.TABLET_MAX_THUMBS || 3) :
                         CAROUSEL_CONFIG.MAX_VISIBLE_THUMBS;
        
        // 响应式定位
        const thumbAreaRight = isMobile ? Math.min(vw * 0.1, 50) : 
                              isTablet ? Math.min(vw * 0.15, 200) :
                              CAROUSEL_CONFIG.THUMB_AREA_RIGHT;
        
        const thumbAreaBottom = isMobile ? Math.min(vh * 0.25, 200) :
                               isTablet ? Math.min(vh * 0.3, 300) :
                               CAROUSEL_CONFIG.THUMB_AREA_BOTTOM;
        
        const layout = {
            thumbAreaX: Math.max(CAROUSEL_CONFIG.MIN_AREA_OFFSET || 100, vw - thumbAreaRight),
            thumbAreaY: Math.max(CAROUSEL_CONFIG.MIN_AREA_OFFSET || 100, vh - thumbAreaBottom),
            entryX: vw + 200,
            textOffsetY: thumbHeight - 100,
            thumbWidth,
            thumbHeight,
            maxThumbs,
            isMobile,
            isTablet,
            breakpoint: isMobile ? 'mobile' : isTablet ? 'tablet' : 'desktop'
        };
        
        console.log(`🔧 Layout calculated for ${layout.breakpoint}:`, layout);
        return layout;
    }
    
    init() {
        this.log('🚀 Initializing slide carousel...');
        
        try {
            this.elements = this.cacheDOMElements();
            
            if (!this.elements.slideCarousel) {
                console.error('❌ slideCarousel element not found! Cannot initialize.');
                return;
            }
            
            this.layoutCache = this.calculateLayout();
            this.sequenceArray = Array.from({length: this.totalSlides}, (_, i) => i);
            
            this.createSlideElements();
            this.initializeSlideCounter();
            this.bindEventHandlers();
            this.initializeFirstSlide();
            this.showUIElements();
            
            // 启动自动播放
            setTimeout(() => this.startAutoPlayTimer(), 3000);
            
        } catch (error) {
            console.error('❌ Carousel initialization failed:', error);
        }
    }
    
    createSlideElements() {
        const fragment = document.createDocumentFragment();
        
        slideData.forEach((slide, index) => {
            const slideEl = this.createSlideElement(slide, index);
            fragment.appendChild(slideEl);
        });
        
        this.elements.slideCarousel.innerHTML = '';
        this.elements.slideCarousel.appendChild(fragment);
        
        // 元素创建且首张幻灯片显示后，隐藏加载动画
        setTimeout(() => {
            this.elements.loadingScreen.classList.add('hidden');
        }, 500);
    }
    
    createSlideElement(slide, index) {
        const slideEl = document.createElement('div');
        slideEl.className = 'slide-poster';
        slideEl.style.position = 'absolute';
        slideEl.style.left = '0';
        slideEl.style.top = '0';
        slideEl.style.transformOrigin = 'top left';
        slideEl.style.backgroundImage = `url(${slide.poster})`;
        slideEl.style.backgroundSize = 'cover';
        slideEl.style.backgroundPosition = 'center';
        slideEl.setAttribute('data-slide', index);
        
        const contentEl = document.createElement('div');
        contentEl.className = 'poster-content';
        contentEl.style.position = 'absolute';
        contentEl.innerHTML = `
            <div class="content-start"></div>
            <div class="content-genre">${slide.genre}</div>
            <div class="content-title">${slide.titleTop} ${slide.titleBottom}</div>
        `;
        
        slideEl.appendChild(contentEl);
        
        // 初始状态 - 设置正确的初始样式
        if (index === 0) {
            // 设置主幻灯片的初始样式
            slideEl.style.width = '100%';
            slideEl.style.height = '100vh';
            slideEl.style.opacity = '1';
            slideEl.style.zIndex = '10';
        } else {
            this.hideElement(slideEl);
        }
        
        return slideEl;
    }
    
    initializeSlideCounter() {
        if (this.elements.totalSlides) {
            this.elements.totalSlides.textContent = this.totalSlides;
        }
        if (this.elements.currentSlide) {
            this.elements.currentSlide.textContent = '1';
        }
    }
    
    bindEventHandlers() {
        this.elements.navLeft?.addEventListener('click', () => this.previousSlide());
        this.elements.navRight?.addEventListener('click', () => this.nextSlide());
        this.elements.playPauseBtn?.addEventListener('click', () => this.toggleAutoPlay());
        
        document.addEventListener('keydown', this.handleKeyPress.bind(this));
        
        // 为移动设备添加触摸事件处理
        this.bindTouchEvents();
        
        // 点击当前显示的主题信息面板 → 进入该主题的工作系统
        this.bindWorkSystemEntry();
        
        let resizeTimer;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                this.layoutCache = this.calculateLayout();
                this.refreshThumbnailPositions();
                this.positionControlsUnderThumbs();
            }, 150);
        });
        
        // 处理移动设备的屏幕旋转
        window.addEventListener('orientationchange', () => {
            setTimeout(() => {
                this.layoutCache = this.calculateLayout();
                this.refreshThumbnailPositions();
                this.positionControlsUnderThumbs();
            }, 300); // 延迟等待旋转完成
        });
    }
    
    bindTouchEvents() {
        let touchStartX = 0;
        let touchStartY = 0;
        let touchEndX = 0;
        let touchEndY = 0;
        let isTouch = false;
        
        const carousel = this.elements.slideCarousel;
        if (!carousel) return;
        
        // 触摸开始
        carousel.addEventListener('touchstart', (e) => {
            isTouch = true;
            touchStartX = e.changedTouches[0].screenX;
            touchStartY = e.changedTouches[0].screenY;
        }, { passive: true });
        
        // 触摸结束 - 处理滑动手势
        carousel.addEventListener('touchend', (e) => {
            if (!isTouch) return;
            
            touchEndX = e.changedTouches[0].screenX;
            touchEndY = e.changedTouches[0].screenY;
            
            const deltaX = touchEndX - touchStartX;
            const deltaY = touchEndY - touchStartY;
            const minSwipeDistance = 50;
            
            // 只处理水平滑动（忽略垂直滚动）
            if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > minSwipeDistance) {
                e.preventDefault();
                
                if (deltaX > 0) {
                    // 右滑 - 上一张
                    this.previousSlide();
                } else {
                    // 左滑 - 下一张
                    this.nextSlide();
                }
            }
            
            isTouch = false;
        }, { passive: false });
        
        // 阻止按钮上的默认触摸行为
        document.querySelectorAll('.material-fab').forEach(button => {
            button.addEventListener('touchstart', (e) => {
                e.stopPropagation();
            }, { passive: true });
        });
    }
    
    /**
     * 点击当前正在显示的主题信息面板时，打开该主题的工作系统页面
     * （主/副两块信息面板交替显示，只有带 .active 的那块响应点击）
     */
    bindWorkSystemEntry() {
        [this.elements.slideInfoPrimary, this.elements.slideInfoSecondary].forEach((panel) => {
            if (!panel) return;
            panel.addEventListener('click', () => {
                if (!panel.classList.contains('active')) return;
                this.openWorkSystem();
            });
        });
    }
    
    /**
     * 打开工作系统页面，并把当前主题的海报、名称通过 URL 带过去
     */
    openWorkSystem() {
        const slide = slideData[this.activeIndex];
        if (!slide) return;
        
        const params = new URLSearchParams({
            theme: slide.genre || '',
            title: [slide.titleTop, slide.titleBottom].filter(Boolean).join(' '),
            poster: slide.poster || ''
        });
        
        // 「法定自查」进的是另一个系统（年度审核计划 + 问题库），
        // 其余主题还是进「安全审核 · 工作计划」。
        // 想换别的主题进别的页，在这里加一个映射就行。
        const ENTRY = {
            'Statutory Inspection': 'CheckQuestion/check.html'
        };
        const page = ENTRY[(slide.genre || '').trim()] || 'SafetyAudit/work.html';
        
        // 原地跳转：直接替换当前标签页（不再新开一个标签）
        // 想改回新标签页打开，把下面的 '_self' 换成 '_blank'
        window.open(`${page}?${params.toString()}`, '_self');
    }
    
    handleKeyPress(e) {
        const actions = {
            'ArrowLeft': () => this.previousSlide(),
            'ArrowRight': () => this.nextSlide(),
            ' ': () => this.toggleAutoPlay()
        };
        
        if (actions[e.key]) {
            e.preventDefault();
            actions[e.key]();
        }
    }
    
    initializeFirstSlide() {
        console.log('🔧 Initializing first slide...');
        
        if (slideData.length === 0) {
            console.error('❌ No slide data available!');
            return;
        }
        
        const firstSlideData = slideData[0];
        this.updateTextContent('primary', firstSlideData);
        this.elements.slideInfoPrimary.classList.add('active');
        this.elements.slideInfoPrimary.style.zIndex = '25';
        
        // 将进度条初始化到第一个位置
        setTimeout(() => {
            this.updateProgressAndNumbers(0);
        }, 300);
        
        // 显示第一张幻灯片及其缩略图
        setTimeout(() => {
            console.log('🔧 Displaying slide 0');
            this.displaySlide(0);
        }, 100);
        
        // DOM 就绪后，按正确的布局初始化首张幻灯片
        setTimeout(() => {
            console.log('🔧 Setting up initial slide layout');
            this.displaySlide(0);
        }, 500);
    }
    
    showUIElements() {
        setTimeout(() => {
            const materialControls = this.elements.materialControls;
            if (materialControls) {
                materialControls.classList.add('visible');
                this.positionControlsUnderThumbs();
            }
        }, 500);
    }
    
    positionControlsUnderThumbs() {
        const materialControls = this.elements.materialControls;
        if (!materialControls) return;
        
        // 使用响应式取值计算缩略图区域的中心点
        const vw = window.innerWidth;
        const thumbAreaWidth = this.layoutCache.maxThumbs * (this.layoutCache.thumbWidth + CAROUSEL_CONFIG.THUMB_SPACING);
        const thumbAreaCenterX = this.layoutCache.thumbAreaX + (thumbAreaWidth / 2);
        
        // 响应式定位
        if (this.layoutCache.isMobile) {
            // 移动端：控件在底部居中
            materialControls.style.right = '50%';
            materialControls.style.transform = 'translateX(50%)';
            materialControls.style.bottom = '20px';
        } else {
            // 控件在缩略图下方居中
            materialControls.style.right = `${vw - thumbAreaCenterX}px`;
            materialControls.style.transform = 'translateX(50%)';
            materialControls.style.bottom = this.layoutCache.isTablet ? '40px' : '60px';
        }
        
        console.log(`🎯 Controls positioned for ${this.layoutCache.breakpoint}: center at ${Math.round(thumbAreaCenterX)}px`);
    }
    
    displaySlide(targetIndex) {
        this.log(`🎯 Displaying slide ${targetIndex}: ${slideData[targetIndex].genre}`);
        
        const zIndices = this.calculateZIndices();
        
        this.activeIndex = targetIndex;
        this.rotateSequenceToFront(targetIndex);
        
        const [activeIdx, ...restIndices] = this.sequenceArray;
        
        const switchText = this.setupTextTransition(targetIndex, zIndices);
        this.updatePosterStates(activeIdx, restIndices, zIndices, switchText);
        this.updateProgressAndNumbers(targetIndex);
    }
    
    calculateZIndices() {
        this.cycleCounter++;
        const cyclePos = this.cycleCounter % CAROUSEL_CONFIG.Z_INDEX_CYCLE_LENGTH;
        const baseZ = CAROUSEL_CONFIG.Z_INDEX_BASE + (cyclePos * CAROUSEL_CONFIG.Z_INDEX_SPACING);
        
        const indices = {
            oldText: baseZ,
            growingImage: baseZ + 1,
            newText: baseZ + 2
        };
        
        if (cyclePos === 1) {
            this.cleanupOldElements();
        }
        
        return indices;
    }
    
    cleanupOldElements() {
        [this.elements.slideInfoPrimary, this.elements.slideInfoSecondary].forEach(el => {
            if (!el.classList.contains('active')) {
                el.style.zIndex = '1';
                el.classList.add('inactive');
                el.classList.remove('active');
            }
        });
        
        const allSlides = this.elements.slideCarousel.querySelectorAll('.slide-poster');
        allSlides.forEach(slide => {
            const currentZ = parseInt(slide.style.zIndex) || 0;
            if (!slide.classList.contains('active') && !slide.classList.contains('thumbnail') && currentZ > 40) {
                slide.style.zIndex = '1';
            }
        });
    }
    
    rotateSequenceToFront(targetIndex) {
        while (this.sequenceArray[0] !== targetIndex) {
            this.sequenceArray.push(this.sequenceArray.shift());
        }
    }
    
    setupTextTransition(targetIndex, zIndices) {
        const currentActive = this.usePrimaryInfo ? this.elements.slideInfoPrimary : this.elements.slideInfoSecondary;
        currentActive.style.zIndex = zIndices.oldText;
        
        const switchText = (delayOldTextHide = false) => {
            this.usePrimaryInfo = !this.usePrimaryInfo;
            const newActive = this.usePrimaryInfo ? this.elements.slideInfoPrimary : this.elements.slideInfoSecondary;
            const oldActive = this.usePrimaryInfo ? this.elements.slideInfoSecondary : this.elements.slideInfoPrimary;
            
            this.updateTextContent(this.usePrimaryInfo ? 'primary' : 'secondary', slideData[targetIndex]);
            newActive.style.zIndex = zIndices.newText;
            newActive.classList.add('active');
            newActive.classList.remove('inactive');
            
            if (delayOldTextHide) {
                setTimeout(() => this.hideTextContainer(oldActive), CAROUSEL_CONFIG.TEXT_HIDE_DELAY);
            } else {
                this.hideTextContainer(oldActive);
            }
        };
        
        return switchText;
    }
    
    updateTextContent(container, slideData) {
        const suffix = container === 'primary' ? '-primary' : '-secondary';
        document.getElementById(`current-genre${suffix}`).textContent = slideData.genre;
        document.getElementById(`current-title-top${suffix}`).textContent = slideData.titleTop;
        document.getElementById(`current-title-bottom${suffix}`).textContent = slideData.titleBottom;
        document.getElementById(`current-synopsis${suffix}`).textContent = slideData.synopsis;
    }
    
    hideTextContainer(element) {
        element.classList.add('inactive');
        element.classList.remove('active');
        element.style.zIndex = '1';
    }
    
    updatePosterStates(activeIdx, restIndices, zIndices, switchText) {
        const allSlides = this.elements.slideCarousel.querySelectorAll('.slide-poster');
        
        allSlides.forEach((slide, index) => {
            slide.classList.remove('active', 'thumbnail');
            
            if (index === activeIdx) {
                this.handleActivePoster(slide, zIndices, switchText);
            } else if (restIndices.includes(index)) {
                const thumbPos = restIndices.indexOf(index);
                if (thumbPos < CAROUSEL_CONFIG.MAX_VISIBLE_THUMBS) {
                    this.handleThumbnailPoster(slide, index, thumbPos);
                } else {
                    this.hideElement(slide);
                }
            } else {
                this.hideElement(slide);
            }
        });
    }
    
    handleActivePoster(slide, zIndices, switchText) {
        const wasThumbnail = slide.style.width && slide.style.width !== '100%';
        slide.classList.add('active');
        
        if (wasThumbnail) {
            this.animateFromThumbnail(slide, zIndices, switchText);
        } else {
            this.setAsMainSlide(slide, zIndices.growingImage);
            if (switchText) switchText();
        }
        
        const content = slide.querySelector('.poster-content');
        if (content) {
            content.classList.remove('visible');
            content.style.opacity = '0';
        }
    }
    
    animateFromThumbnail(slide, zIndices, switchText) {
        // 该元素可能刚被 hideElement() 移出屏幕（-1000px），
        // 从这里开始放大则整个过程都看不到海报，画面只剩纯黑背景；
        // 所以没有有效缩略图坐标时，直接按主幻灯片显示
        if (!this.hasExistingPosition(slide)) {
            this.setAsMainSlide(slide, zIndices.growingImage);
            if (switchText) switchText();
            return;
        }
        
        const transform = slide.style.transform;
        const match = transform.match(/translate\(([^,]+),\s*([^)]+)\)/);
        const currentX = match ? parseFloat(match[1]) : 0;
        const currentY = match ? parseFloat(match[2]) : 0;
        const currentWidth = parseFloat(slide.style.width) || this.layoutCache.thumbWidth;
        
        const backgroundImage = slide.style.backgroundImage;
        
        const scale = currentWidth / window.innerWidth;
        slide.style.width = '100%';
        slide.style.height = '100vh';
        slide.style.backgroundSize = 'cover';
        slide.style.backgroundPosition = 'center';
        slide.style.backgroundImage = backgroundImage;
        slide.style.zIndex = zIndices.growingImage;
        slide.style.transition = 'none';
        slide.style.transform = `translate(${currentX}px, ${currentY}px) scale(${scale})`;
        slide.style.transformOrigin = 'top left';
        
        slide.offsetHeight;
        slide.style.transition = `transform ${CAROUSEL_CONFIG.ANIMATION_DURATION}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`;
        slide.style.transform = 'translate(0, 0) scale(1)';
        
        setTimeout(() => {
            switchText(true);
        }, CAROUSEL_CONFIG.TEXT_SWITCH_DELAY);
        
        setTimeout(() => {
            slide.style.transition = 'none';
            slide.style.transform = '';
            slide.style.transformOrigin = '';
        }, CAROUSEL_CONFIG.ANIMATION_DURATION);
    }
    
    setAsMainSlide(slide, zIndex = 10) {
        const backgroundImage = slide.style.backgroundImage;
        slide.style.position = 'absolute';
        slide.style.left = '0';
        slide.style.top = '0';
        slide.style.width = '100%';
        slide.style.height = '100vh';
        slide.style.backgroundSize = 'cover';
        slide.style.backgroundPosition = 'center';
        slide.style.zIndex = zIndex;
        slide.style.transformOrigin = 'top left';
        slide.style.backgroundImage = backgroundImage;
        slide.style.transitionDelay = '0s';
        
        // 已经在显示中的幻灯片（例如首屏被重复调用）只更新位置与层级，
        // 否则重复淡入会出现明显闪烁
        if (slide.style.opacity === '1') {
            slide.style.transform = 'translate(0, 0) scale(1)';
            return;
        }
        
        // 先清掉 hideElement() 遗留的屏幕外位移（-1000px）和“禁用过渡”状态，
        // 否则海报会一直停在屏幕外，只能看到纯黑背景
        slide.style.transition = 'none';
        slide.style.transform = 'translate(0, 0) scale(1)';
        slide.style.opacity = '0';
        
        // 强制重排后再淡入，避免切换瞬间出现黑屏
        slide.offsetHeight;
        slide.style.transition = `opacity ${CAROUSEL_CONFIG.ANIMATION_DURATION}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`;
        slide.style.opacity = '1';
    }
    
    handleThumbnailPoster(slide, slideIndex, thumbPos) {
        slide.classList.add('thumbnail');
        
        // 使用响应式布局取值
        const finalX = this.layoutCache.thumbAreaX + thumbPos * (this.layoutCache.thumbWidth + CAROUSEL_CONFIG.THUMB_SPACING);
        const wasActive = slide.classList.contains('active');
        const hasPosition = this.hasExistingPosition(slide);
        
        const staggerDelay = thumbPos * CAROUSEL_CONFIG.STAGGER_DELAY;
        const zIndex = 50 + thumbPos;
        
        // 根据响应式上限判断该缩略图是否需要显示
        if (thumbPos >= this.layoutCache.maxThumbs) {
            this.hideElement(slide);
            return;
        }
        
        if (wasActive || hasPosition) {
            this.animateToThumbnail(slide, finalX, staggerDelay, zIndex);
        } else {
            this.slideInThumbnail(slide, finalX, staggerDelay, zIndex);
        }
        
        this.updateThumbnailContent(slide, slideIndex, finalX, staggerDelay);
        this.addThumbnailClickHandler(slide, slideIndex);
    }
    
    hasExistingPosition(slide) {
        const transform = slide.style.transform;
        return transform && transform.includes('translate') && !transform.includes('-1000px');
    }
    
    animateToThumbnail(slide, finalX, delay, zIndex) {
        const backgroundImage = slide.style.backgroundImage;
        slide.style.transition = `transform ${CAROUSEL_CONFIG.ANIMATION_DURATION}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`;
        slide.style.transitionDelay = `${delay}s`;
        slide.style.transform = `translate(${finalX}px, ${this.layoutCache.thumbAreaY}px)`;
        slide.style.width = `${this.layoutCache.thumbWidth}px`;
        slide.style.height = `${this.layoutCache.thumbHeight}px`;
        slide.style.zIndex = zIndex;
        slide.style.opacity = '1';
        slide.style.backgroundImage = backgroundImage;
    }
    
    slideInThumbnail(slide, finalX, delay, zIndex) {
        const backgroundImage = slide.style.backgroundImage;
        slide.style.position = 'absolute';
        slide.style.left = '0';
        slide.style.top = '0';
        slide.style.width = `${this.layoutCache.thumbWidth}px`;
        slide.style.height = `${this.layoutCache.thumbHeight}px`;
        slide.style.transform = `translate(${this.layoutCache.entryX}px, ${this.layoutCache.thumbAreaY}px)`;
        slide.style.zIndex = zIndex;
        slide.style.opacity = '1';
        slide.style.transition = 'none';
        slide.style.transitionDelay = '0s';
        slide.style.backgroundImage = backgroundImage;
        
        slide.offsetHeight;
        slide.style.transition = `transform ${CAROUSEL_CONFIG.ANIMATION_DURATION}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`;
        slide.style.transitionDelay = `${delay}s`;
        slide.style.transform = `translate(${finalX}px, ${this.layoutCache.thumbAreaY}px)`;
    }
    
    updateThumbnailContent(slide, slideIndex, finalX, delay) {
        const content = slide.querySelector('.poster-content');
        if (!content) return;
        
        const slideInfo = slideData[slideIndex];
        content.style.position = 'absolute';
        content.style.zIndex = `${60 + (slideIndex % 4)}`;
        content.style.opacity = '1';
        content.style.transition = `transform ${CAROUSEL_CONFIG.ANIMATION_DURATION}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`;
        content.style.transitionDelay = `${delay}s`;
        content.style.transform = `translate(${finalX}px, ${this.layoutCache.thumbAreaY + this.layoutCache.textOffsetY}px)`;
        
        content.classList.add('visible');
        content.querySelector('.content-genre').textContent = slideInfo.genre;
        content.querySelector('.content-title').textContent = `${slideInfo.titleTop} ${slideInfo.titleBottom}`;
    }
    
    addThumbnailClickHandler(slide, slideIndex) {
        slide.onclick = (e) => {
            e.preventDefault();
            this.navigateToSlide(slideIndex);
        };
        slide.style.cursor = 'pointer';
    }
    
    hideElement(slide) {
        slide.style.position = 'absolute';
        slide.style.opacity = '0';
        slide.style.zIndex = '1';
        slide.style.transform = 'translate(-1000px, -1000px)';
        slide.style.transition = 'none';
        
        const content = slide.querySelector('.poster-content');
        if (content) {
            content.classList.remove('visible');
            content.style.opacity = '0';
        }
    }
    
    updateProgressAndNumbers(index) {
        // 计算已完成的幻灯片百分比（按张数离散计算）
        const progress = ((index + 1) / this.totalSlides) * 100;
        
        // 带平滑推进动画地更新 Material Design 进度条
        if (this.elements.progressIndicator) {
            // 稍作延迟，让进度推进显得更有节奏感
            setTimeout(() => {
                this.elements.progressIndicator.style.transition = 'width 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
                this.elements.progressIndicator.style.width = `${progress}%`;
            }, 100);
        }
        
        // 以轻微动画更新幻灯片计数
        if (this.elements.currentSlide) {
            this.elements.currentSlide.style.transform = 'scale(1.1)';
            this.elements.currentSlide.textContent = index + 1;
            setTimeout(() => {
                this.elements.currentSlide.style.transform = 'scale(1)';
            }, 150);
        }
        
        console.log(`📊 Progress animated to: ${Math.round(progress)}% (slide ${index + 1}/${this.totalSlides})`);
    }
    
    refreshThumbnailPositions() {
        const thumbnails = this.elements.slideCarousel.querySelectorAll('.slide-poster.thumbnail');
        thumbnails.forEach((thumb, index) => {
            // 只对需要显示的缩略图进行定位
            if (index < this.layoutCache.maxThumbs) {
                const finalX = this.layoutCache.thumbAreaX + index * (this.layoutCache.thumbWidth + CAROUSEL_CONFIG.THUMB_SPACING);
                thumb.style.transform = `translate(${finalX}px, ${this.layoutCache.thumbAreaY}px)`;
                thumb.style.width = `${this.layoutCache.thumbWidth}px`;
                thumb.style.height = `${this.layoutCache.thumbHeight}px`;
                thumb.style.opacity = '1';
                
                const content = thumb.querySelector('.poster-content');
                if (content) {
                    content.style.transform = `translate(${finalX}px, ${this.layoutCache.thumbAreaY + this.layoutCache.textOffsetY}px)`;
                }
            } else {
                // 隐藏多余的缩略图
                this.hideElement(thumb);
            }
        });
    }
    
    nextSlide() {
        this.sequenceArray.push(this.sequenceArray.shift());
        this.displaySlide(this.sequenceArray[0]);
    }
    
    previousSlide() {
        this.sequenceArray.unshift(this.sequenceArray.pop());
        this.displaySlide(this.sequenceArray[0]);
    }
    
    navigateToSlide(index) {
        if (index === this.activeIndex) return;
        this.displaySlide(index);
        if (this.isAutoActive) this.startAutoPlayTimer();
    }
    
    startAutoPlayTimer() {
        this.stopAutoPlayTimer();
        if (!this.isAutoActive) return;
        
        // 立即把控件区进度条更新到当前位置
        this.updateProgressAndNumbers(this.activeIndex);
        
        // 启动底部进度条动画
        this.animateBottomProgressIndicator();
        
        this.autoTimer = setInterval(() => {
            this.nextSlide();
            // 为下一张幻灯片重新启动进度条动画
            this.animateBottomProgressIndicator();
        }, CAROUSEL_CONFIG.AUTO_PLAY_INTERVAL);
    }
    
    stopAutoPlayTimer() {
        if (this.autoTimer) {
            clearInterval(this.autoTimer);
            this.autoTimer = null;
        }
        this.resetProgressIndicator();
    }
    
    animateBottomProgressIndicator() {
        const bottomIndicator = this.elements.bottomProgressIndicator;
        if (!bottomIndicator) return;
        
        // 重置进度指示条
        bottomIndicator.classList.remove('animating');
        bottomIndicator.classList.add('reset');
        bottomIndicator.style.left = '0';
        bottomIndicator.style.right = '0';
        bottomIndicator.style.width = '100vw';
        bottomIndicator.style.transformOrigin = 'center';
        bottomIndicator.style.transform = 'scaleX(0)';
        bottomIndicator.style.transition = 'none';
        
        // 强制触发重排
        bottomIndicator.offsetHeight;
        
        // 在幻灯片展示时长内播放动画
        setTimeout(() => {
            bottomIndicator.classList.remove('reset');
            bottomIndicator.classList.add('animating');
            bottomIndicator.style.transition = `transform ${CAROUSEL_CONFIG.AUTO_PLAY_INTERVAL}ms linear`;
            bottomIndicator.style.transform = 'scaleX(1)';
        }, 50);
        
        console.log(`⏱️ Bottom progress indicator animating over ${CAROUSEL_CONFIG.AUTO_PLAY_INTERVAL}ms`);
    }
    
    resetProgressIndicator() {
        const indicator = this.elements.progressIndicator;
        const bottomIndicator = this.elements.bottomProgressIndicator;
        
        if (indicator) {
            const currentProgress = ((this.activeIndex + 1) / this.totalSlides) * 100;
            indicator.style.width = `${currentProgress}%`;
            indicator.style.transition = 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
        }
        
        if (bottomIndicator) {
            bottomIndicator.classList.remove('animating');
            bottomIndicator.classList.add('reset');
            bottomIndicator.style.transform = 'scaleX(0)';
            bottomIndicator.style.transition = 'none';
        }
    }
    
    toggleAutoPlay() {
        this.isAutoActive = !this.isAutoActive;
        const playPauseBtn = this.elements.playPauseBtn;
        
        if (playPauseBtn) {
            const icon = playPauseBtn.querySelector('.material-icon');
            if (icon) {
                if (this.isAutoActive) {
                    icon.innerHTML = ICON_PAUSE;
                    playPauseBtn.setAttribute('aria-label', 'Pause carousel');
                    this.startAutoPlayTimer();
                } else {
                    icon.innerHTML = ICON_PLAY;
                    playPauseBtn.setAttribute('aria-label', 'Play carousel');
                    this.stopAutoPlayTimer();
                }
            }
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.slideCarousel = new SlideCarousel();
});
