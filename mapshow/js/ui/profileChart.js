/**
 * 高度剖面图模块（主入口）
 */

const ProfileChart = (function() {
    let chartDiv = null;
    let isVisible = false;
    let updateStatusFn = null;
    
    function init(statusUpdateFn) {
        updateStatusFn = statusUpdateFn;
        createChartContainer();
    }
    
    function createChartContainer() {
        chartDiv = document.createElement('div');
        chartDiv.id = 'profile-chart-container';
        chartDiv.innerHTML = `
            <div class="chart-resize-handle" id="chartResizeHandle"></div>
            <div class="chart-header">
                <span class="chart-title">📈 高度剖面图</span>
                <div class="chart-controls">
                    <input type="text" id="chartStartTime" placeholder="开始时间" style="width:70px;" title="HH:MM:SS">
                    <span> ~ </span>
                    <input type="text" id="chartEndTime" placeholder="结束时间" style="width:70px;" title="HH:MM:SS">
                    <button id="applyTimeRangeBtn" class="chart-btn">筛选</button>
                    <button id="resetTimeRangeBtn" class="chart-btn">重置</button>
                    <div class="chart-color-group">
                        <label>🎨 轨迹色块:</label>
                        <input type="color" id="segmentColorPicker" value="#ff0000">
                        <button id="applySegmentColorBtn" class="chart-btn" style="background:#4CAF50;">应用</button>
                    </div>
                    <button id="closeChartBtn" class="chart-close">✕</button>
                </div>
            </div>
            <canvas id="altitudeChart" width="800" height="200" style="width:100%; height:200px;"></canvas>
            <div class="chart-tooltip" id="chartTooltip" style="display:none;"></div>
        `;
        document.body.appendChild(chartDiv);
        
        // 默认隐藏
        chartDiv.style.display = 'none';
        
        bindEvents();
    }
    
    function bindEvents() {
        // 关闭按钮
        const closeBtn = document.getElementById('closeChartBtn');
        if (closeBtn) closeBtn.addEventListener('click', () => hide());
        
        // 筛选按钮
        const applyBtn = document.getElementById('applyTimeRangeBtn');
        if (applyBtn) {
            applyBtn.addEventListener('click', () => {
                const startInput = document.getElementById('chartStartTime');
                const endInput = document.getElementById('chartEndTime');
                const startTime = startInput.value.trim();
                const endTime = endInput.value.trim();
                
                if (!startTime || !endTime) {
                    if (updateStatusFn) updateStatusFn('❌ 请输入开始和结束时间', true);
                    return;
                }
                
                const success = ChartControls.applyTimeRange(startTime, endTime);
                if (success) {
                    ChartCore.draw('altitudeChart');
                    if (updateStatusFn) updateStatusFn(`📊 已筛选，显示 ${ChartCore.getData().length} 个点`);
                } else {
                    if (updateStatusFn) updateStatusFn('❌ 时间格式错误或无数据', true);
                }
            });
        }
        
        // 重置按钮
        const resetBtn = document.getElementById('resetTimeRangeBtn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                const count = ChartControls.resetTimeRange();
                ChartCore.draw('altitudeChart');
                // 重置输入框显示
                const allData = ChartControls.getFilteredPoints();
                if (allData.length > 0) {
                    document.getElementById('chartStartTime').value = allData[0].time;
                    document.getElementById('chartEndTime').value = allData[allData.length - 1].time;
                }
                if (updateStatusFn) updateStatusFn(`📊 已重置，显示全部 ${count} 个点`);
            });
        }
        
        // 轨迹分段着色
        const applyColorBtn = document.getElementById('applySegmentColorBtn');
        if (applyColorBtn) {
            applyColorBtn.addEventListener('click', () => {
                const colorPicker = document.getElementById('segmentColorPicker');
                const color = colorPicker.value;
                ChartControls.applySegmentColor(color);
                if (updateStatusFn) updateStatusFn(`🎨 已应用轨迹色块: ${color}`);
            });
        }
        
        // 拖拽调整高度
        ChartEvents.initResizeHandle('chartResizeHandle', (newHeight) => {
            const canvas = document.getElementById('altitudeChart');
            if (canvas) {
                canvas.style.height = newHeight + 'px';
                canvas.height = newHeight;
                ChartCore.draw('altitudeChart');
            }
        });
        
        // 鼠标悬停事件
        ChartEvents.setHoverCallbacks(
            (point) => {
                ChartEvents.showMapMarker(point.lat, point.lon, point.time, point.params.altitude);
            },
            () => {
                ChartEvents.hideMapMarker();
            }
        );
        ChartEvents.bindCanvasEvents('altitudeChart', 'chartTooltip');
    }
    
    function loadData(points) {
        if (!points || points.length === 0) return;
        
        const validPoints = points.filter(p => p.params && p.params.altitude !== undefined && !isNaN(p.params.altitude));
        if (validPoints.length === 0) {
            if (updateStatusFn) updateStatusFn('⚠️ 无有效高度数据', true);
            return;
        }
        
        ChartControls.setAllPoints(validPoints);
        ChartCore.setData(validPoints);
        ChartCore.draw('altitudeChart');
        
        // 设置输入框默认值
        if (validPoints.length > 0) {
            const startInput = document.getElementById('chartStartTime');
            const endInput = document.getElementById('chartEndTime');
            if (startInput) startInput.value = validPoints[0].time;
            if (endInput) endInput.value = validPoints[validPoints.length - 1].time;
        }
    }
    
    // 轨迹分段着色（修改轨迹中特定时间段的颜色）
    function applySegmentColorToTrack(segmentPoints, color) {
        if (!segmentPoints || segmentPoints.length === 0) return;
        
        const trackLayer = MapManager.getTrackLayer();
        if (!trackLayer) return;
        
        // 获取原始轨迹线
        const trackLines = trackLayer.getLayers().filter(l => l instanceof L.Polyline);
        if (trackLines.length === 0) return;
        
        const originalLine = trackLines[0];
        const originalLatLngs = originalLine.getLatLngs();
        
        // 找到需要着色的线段范围
        const startTime = segmentPoints[0].time;
        const endTime = segmentPoints[segmentPoints.length - 1].time;
        
        // 找到起点和终点在原始轨迹中的索引
        let startIndex = -1, endIndex = -1;
        for (let i = 0; i < originalLatLngs.length; i++) {
            const point = originalLatLngs[i];
            // 需要根据时间匹配，这里简化：通过坐标匹配
            for (let j = 0; j < segmentPoints.length; j++) {
                if (Math.abs(point.lat - segmentPoints[j].lat) < 0.0001 && 
                    Math.abs(point.lng - segmentPoints[j].lon) < 0.0001) {
                    if (startIndex === -1) startIndex = i;
                    endIndex = i;
                    break;
                }
            }
        }
        
        if (startIndex === -1 || endIndex === -1) return;
        
        // 分割轨迹线
        const beforeSegment = originalLatLngs.slice(0, startIndex);
        const segment = originalLatLngs.slice(startIndex, endIndex + 1);
        const afterSegment = originalLatLngs.slice(endIndex + 1);
        
        // 移除原轨迹
        originalLine.remove();
        
        // 重新绘制三段轨迹
        if (beforeSegment.length > 1) {
            L.polyline(beforeSegment, { color: '#5019e6', weight: 5, opacity: 1.0 }).addTo(trackLayer);
        }
        if (segment.length > 1) {
            L.polyline(segment, { color: color, weight: 5, opacity: 1.0 }).addTo(trackLayer);
        }
        if (afterSegment.length > 1) {
            L.polyline(afterSegment, { color: '#5019e6', weight: 5, opacity: 1.0 }).addTo(trackLayer);
        }
        
        // 将轨迹置顶
        MapManager.bringTrackToFront();
    }
    
    function show() {
        if (chartDiv) {
            chartDiv.style.display = 'block';
            isVisible = true;
            setTimeout(() => ChartCore.draw('altitudeChart'), 100);
            if (updateStatusFn) updateStatusFn('📈 高度剖面图已显示');
        }
    }
    
    function hide() {
        if (chartDiv) {
            chartDiv.style.display = 'none';
            isVisible = false;
            ChartEvents.hideMapMarker();
            if (updateStatusFn) updateStatusFn('📈 高度剖面图已隐藏');
        }
    }
    
    function toggle() {
        isVisible ? hide() : show();
    }
    
    function refresh() {
        if (isVisible) ChartCore.draw('altitudeChart');
    }
    
    // 初始化 ChartControls 的回调
    ChartControls.init([], (newData) => {
        ChartCore.setData(newData);
        ChartCore.draw('altitudeChart');
    }, (segmentPoints, color) => {
        applySegmentColorToTrack(segmentPoints, color);
    });
    
    return {
        init: init,
        loadData: loadData,
        show: show,
        hide: hide,
        toggle: toggle,
        refresh: refresh
    };
})();