/**
 * 美化轨迹面板模块
 * 调整轨迹颜色、粗细，节点颜色、大小
 */

const BeautifyPanel = (function() {
    let panel = null;
    let updateStatusFn = null;
    
    // 当前样式值
    let currentStyles = {
        trackColor: '#5019e6',
        trackWeight: 5,
        markerColor: '#ff9800',
        markerSize: 14
    };
    
    function init(statusUpdateFn) {
        updateStatusFn = statusUpdateFn;
        createPanel();
        loadCurrentStyles();
    }
    
    function loadCurrentStyles() {
        // 从现有轨迹读取当前样式
        const trackLayer = MapManager.getTrackLayer();
        if (trackLayer && trackLayer.getLayers().length > 0) {
            const trackLines = trackLayer.getLayers().filter(l => l instanceof L.Polyline);
            if (trackLines.length > 0) {
                currentStyles.trackColor = trackLines[0].options.color || '#5019e6';
                currentStyles.trackWeight = trackLines[0].options.weight || 5;
            }
        }
        
        // 节点样式从 MarkerManager 读取
        const markersData = MarkerManager.getAllMarkersFull ? MarkerManager.getAllMarkersFull() : [];
        if (markersData.length > 0) {
            const firstMarker = markersData[0];
            if (firstMarker && firstMarker.marker && firstMarker.marker.options && firstMarker.marker.options.icon) {
                const html = firstMarker.marker.options.icon.options.html;
                const colorMatch = html.match(/background-color:([^;]+)/);
                if (colorMatch) {
                    currentStyles.markerColor = colorMatch[1].trim();
                }
                const sizeMatch = html.match(/width:(\d+)px/);
                if (sizeMatch) {
                    currentStyles.markerSize = parseInt(sizeMatch[1]);
                }
            }
        }
    }
    
    function createPanel() {
        panel = document.createElement('div');
        panel.id = 'beautify-panel';
        panel.className = 'beautify-panel';
        panel.innerHTML = `
            <div class="beautify-panel-header">
                <span>🎨 美化轨迹</span>
                <button id="closeBeautifyPanel" class="panel-close">✕</button>
            </div>
            <div class="beautify-panel-content">
                <div class="beautify-section">
                    <div class="beautify-title">✈️ 轨迹样式</div>
                    <div class="beautify-row">
                        <label>颜色：</label>
                        <input type="color" id="trackColorPicker" value="${currentStyles.trackColor}">
                    </div>
                    <div class="beautify-row">
                        <label>粗细：</label>
                        <input type="range" id="trackWeightSlider" min="1" max="10" step="1" value="${currentStyles.trackWeight}">
                        <span id="trackWeightValue">${currentStyles.trackWeight}px</span>
                    </div>
                </div>
                <div class="beautify-section">
                    <div class="beautify-title">📍 时间节点样式</div>
                    <div class="beautify-row">
                        <label>颜色：</label>
                        <input type="color" id="markerColorPicker" value="${currentStyles.markerColor}">
                    </div>
                    <div class="beautify-row">
                        <label>大小：</label>
                        <input type="range" id="markerSizeSlider" min="8" max="24" step="1" value="${currentStyles.markerSize}">
                        <span id="markerSizeValue">${currentStyles.markerSize}px</span>
                    </div>
                </div>
                <div class="beautify-buttons">
                    <button id="applyBeautifyBtn" class="apply-btn">✨ 应用样式</button>
                    <button id="resetBeautifyBtn" class="reset-btn">🔄 重置默认</button>
                </div>
            </div>
        `;
        document.body.appendChild(panel);
        
        // 默认隐藏
        panel.style.display = 'none';
        
        bindEvents();
    }
    
    function bindEvents() {
        // 关闭按钮
        const closeBtn = document.getElementById('closeBeautifyPanel');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                hide();
            });
        }
        
        // 轨迹粗细滑块显示
        const trackWeightSlider = document.getElementById('trackWeightSlider');
        const trackWeightValue = document.getElementById('trackWeightValue');
        if (trackWeightSlider) {
            trackWeightSlider.addEventListener('input', () => {
                trackWeightValue.textContent = trackWeightSlider.value + 'px';
            });
        }
        
        // 节点大小滑块显示
        const markerSizeSlider = document.getElementById('markerSizeSlider');
        const markerSizeValue = document.getElementById('markerSizeValue');
        if (markerSizeSlider) {
            markerSizeSlider.addEventListener('input', () => {
                markerSizeValue.textContent = markerSizeSlider.value + 'px';
            });
        }
        
        // 应用样式按钮
        const applyBtn = document.getElementById('applyBeautifyBtn');
        if (applyBtn) {
            applyBtn.addEventListener('click', () => {
                applyStyles();
            });
        }
        
        // 重置默认按钮
        const resetBtn = document.getElementById('resetBeautifyBtn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                resetToDefault();
            });
        }
    }
    
    function applyStyles() {
        const newTrackColor = document.getElementById('trackColorPicker').value;
        const newTrackWeight = parseInt(document.getElementById('trackWeightSlider').value);
        const newMarkerColor = document.getElementById('markerColorPicker').value;
        const newMarkerSize = parseInt(document.getElementById('markerSizeSlider').value);
        
        // 更新轨迹样式
        updateTrackStyle(newTrackColor, newTrackWeight);
        
        // 更新节点样式
        updateMarkersStyle(newMarkerColor, newMarkerSize);
        
        // 保存当前样式
        currentStyles = {
            trackColor: newTrackColor,
            trackWeight: newTrackWeight,
            markerColor: newMarkerColor,
            markerSize: newMarkerSize
        };
        
        if (updateStatusFn) updateStatusFn('✅ 样式已应用');
    }
    
    function updateTrackStyle(color, weight) {
        const trackLayer = MapManager.getTrackLayer();
        if (!trackLayer) return;
        
        const trackLines = trackLayer.getLayers().filter(l => l instanceof L.Polyline);
        trackLines.forEach(line => {
            line.setStyle({ color: color, weight: weight });
        });
    }
    
    function updateMarkersStyle(color, size) {
        // 使用 MarkerManager 的方法更新所有标记样式
        if (typeof MarkerManager.updateAllMarkersStyle === 'function') {
            MarkerManager.updateAllMarkersStyle(color, size);
        } else {
            // 备用方案：直接遍历
            const markersData = MarkerManager.getAllMarkersFull ? MarkerManager.getAllMarkersFull() : [];
            const sizePx = size;
            const radiusPx = Math.floor(sizePx / 2);
            
            markersData.forEach(item => {
                const marker = item.marker;
                if (marker && marker.setIcon) {
                    const newIcon = L.divIcon({
                        className: 'time-marker',
                        html: `<div style="background-color:${color}; width:${sizePx}px; height:${sizePx}px; border-radius:50%; border:2px solid white; box-shadow:0 0 4px rgba(0,0,0,0.3);"></div>`,
                        iconSize: [sizePx + 4, sizePx + 4],
                        popupAnchor: [0, -radiusPx]
                    });
                    marker.setIcon(newIcon);
                }
            });
        }
    }
    
    function resetToDefault() {
        const defaultColor = '#5019e6';
        const defaultWeight = 5;
        const defaultMarkerColor = '#ff9800';
        const defaultMarkerSize = 14;
        
        // 更新输入框
        document.getElementById('trackColorPicker').value = defaultColor;
        document.getElementById('trackWeightSlider').value = defaultWeight;
        document.getElementById('trackWeightValue').textContent = defaultWeight + 'px';
        document.getElementById('markerColorPicker').value = defaultMarkerColor;
        document.getElementById('markerSizeSlider').value = defaultMarkerSize;
        document.getElementById('markerSizeValue').textContent = defaultMarkerSize + 'px';
        
        // 应用默认样式
        updateTrackStyle(defaultColor, defaultWeight);
        updateMarkersStyle(defaultMarkerColor, defaultMarkerSize);
        
        currentStyles = {
            trackColor: defaultColor,
            trackWeight: defaultWeight,
            markerColor: defaultMarkerColor,
            markerSize: defaultMarkerSize
        };
        
        if (updateStatusFn) updateStatusFn('🔄 已恢复默认样式');
    }
    
    function show() {
        if (panel) {
            // 刷新当前样式到面板
            loadCurrentStyles();
            // 同步输入框值
            document.getElementById('trackColorPicker').value = currentStyles.trackColor;
            document.getElementById('trackWeightSlider').value = currentStyles.trackWeight;
            document.getElementById('trackWeightValue').textContent = currentStyles.trackWeight + 'px';
            document.getElementById('markerColorPicker').value = currentStyles.markerColor;
            document.getElementById('markerSizeSlider').value = currentStyles.markerSize;
            document.getElementById('markerSizeValue').textContent = currentStyles.markerSize + 'px';
            
            panel.style.display = 'block';
        }
    }
    
    function hide() {
        if (panel) panel.style.display = 'none';
    }
    
    function toggle() {
        if (panel) {
            if (panel.style.display === 'none') {
                show();
            } else {
                hide();
            }
        }
    }
    
    return {
        init: init,
        show: show,
        hide: hide,
        toggle: toggle
    };
})();