/**
 * 节点添加界面模块
 * 提供 UI 让用户输入时间点并选择要显示的飞行参数
 */

const MarkerUI = (function() {
    let panel = null;
    let updateStatusFn = null;
    
    function init(statusUpdateFn) {
        updateStatusFn = statusUpdateFn;
        createPanel();
    }
    
    function createPanel() {
    panel = document.createElement('div');
    panel.id = 'marker-panel';
    panel.innerHTML = `
        <div class="marker-panel-header">
            <span>📍 添加时间节点</span>
            <button id="toggleMarkerPanel" class="panel-toggle">+</button>
        </div>
        <div class="marker-panel-content">
                <div class="marker-input-row">
                    <input type="text" class="time-input hour-input" value="00" placeholder="时" maxlength="2" inputmode="numeric">
                    <span style="color:#aaa;">:</span>
                    <input type="text" class="time-input minute-input" value="00" placeholder="分" maxlength="2" inputmode="numeric">
                    <span style="color:#aaa;">:</span>
                    <input type="text" class="time-input second-input" value="00" placeholder="秒" maxlength="2" inputmode="numeric">
                </div>
                
                <div class="params-section">
                    <div class="params-header" id="paramsHeader">
                        <span>📊 选择要显示的飞行参数：</span>
                        <button id="paramsToggle" class="params-toggle">+</button>
                    </div>
                    <div class="params-grid" id="paramsGrid">
                        <label class="param-checkbox">
                            <input type="checkbox" class="param-longitude"> 📍 经度
                        </label>
                        <label class="param-checkbox">
                            <input type="checkbox" class="param-latitude"> 📍 纬度
                        </label>
                        <label class="param-checkbox">
                            <input type="checkbox" class="param-altitude" checked> 🏔️ 高度
                        </label>
                        <label class="param-checkbox">
                            <input type="checkbox" class="param-flap"> ✈️ 襟翼
                        </label>
                        <label class="param-checkbox">
                            <input type="checkbox" class="param-ias" checked> 📊 表速
                        </label>
                        <label class="param-checkbox">
                            <input type="checkbox" class="param-vspeed" checked> 📈 垂直
                        </label>
                        <label class="param-checkbox">
                            <input type="checkbox" class="param-winddir" checked> 🌬️ 风向
                        </label>
                        <label class="param-checkbox">
                            <input type="checkbox" class="param-windspd" checked> 💨 风速
                        </label>
                    </div>
                </div>
                
                <button id="applyMarkersBtn" class="apply-markers-btn">📍 添加节点</button>
                <button id="clearAllMarkersBtn" class="clear-markers-btn">🗑️ 清除所有节点</button>
                
                <div class="marker-list" id="markerList">
                    <div class="marker-list-title">已添加的节点：</div>
                    <div id="markerListContainer">暂无</div>
                </div>
                <div class="hint-text">
                    💡 格式: HH:MM:SS (如 05:32:44)
                </div>
            </div>
        `;
        document.body.appendChild(panel);
        
        bindEvents();
        updateMarkerList();
        
        // 默认折叠参数选择区域
        const paramsGrid = document.getElementById('paramsGrid');
        if (paramsGrid) {
            paramsGrid.classList.add('collapsed');
        }
        panel.style.display = 'none';
    }
    
    function getCurrentTime() {
        const hour = document.querySelector('.hour-input').value;
        const minute = document.querySelector('.minute-input').value;
        const second = document.querySelector('.second-input').value;
        
        let h = hour.replace(/\D/g, '').padStart(2, '0').slice(0, 2);
        let m = minute.replace(/\D/g, '').padStart(2, '0').slice(0, 2);
        let s = second.replace(/\D/g, '').padStart(2, '0').slice(0, 2);
        
        if (parseInt(h) > 23) h = '23';
        if (parseInt(m) > 59) m = '59';
        if (parseInt(s) > 59) s = '59';
        if (parseInt(h) < 0) h = '00';
        if (parseInt(m) < 0) m = '00';
        if (parseInt(s) < 0) s = '00';
        
        return `${h}:${m}:${s}`;
    }
    
    function getSelectedParams() {
        return {
            longitude: document.querySelector('.param-longitude')?.checked || false,
            latitude: document.querySelector('.param-latitude')?.checked || false,
            altitude: document.querySelector('.param-altitude')?.checked || false,
            flap: document.querySelector('.param-flap')?.checked || false,
            ias: document.querySelector('.param-ias')?.checked || false,
            vspeed: document.querySelector('.param-vspeed')?.checked || false,
            windDir: document.querySelector('.param-winddir')?.checked || false,
            windSpd: document.querySelector('.param-windspd')?.checked || false
        };
    }
    
    function bindEvents() {
        const toggleBtn = document.getElementById('toggleMarkerPanel');
        const panelContent = panel.querySelector('.marker-panel-content');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                panelContent.classList.toggle('collapsed');
                toggleBtn.textContent = panelContent.classList.contains('collapsed') ? '+' : '−';
            });
        }
        
        // 参数区域折叠/展开
        const paramsToggle = document.getElementById('paramsToggle');
        const paramsGrid = document.getElementById('paramsGrid');
        if (paramsToggle && paramsGrid) {
            paramsToggle.addEventListener('click', () => {
                paramsGrid.classList.toggle('collapsed');
                paramsToggle.textContent = paramsGrid.classList.contains('collapsed') ? '+' : '−';
            });
        }
        
        const applyBtn = document.getElementById('applyMarkersBtn');
        if (applyBtn) {
            applyBtn.addEventListener('click', () => {
                applyMarker();
            });
        }
        
        const clearBtn = document.getElementById('clearAllMarkersBtn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                MarkerManager.clearAllMarkers();
                updateMarkerList();
                if (updateStatusFn) updateStatusFn('🗑️ 已清除所有节点');
            });
        }
    }
    
    function applyMarker() {
        const time = getCurrentTime();
        const paramsToShow = getSelectedParams();
        
        if (!time || time === '00:00:00') {
            if (updateStatusFn) updateStatusFn('❌ 请输入有效的时间点', true);
            return;
        }
        
        const currentPoints = TrackDrawer.getCurrentPoints();
        if (!currentPoints || currentPoints.length === 0) {
            if (updateStatusFn) updateStatusFn('❌ 请先加载 FDR 轨迹数据', true);
            alert('请先选择并加载 FDR 数据文件');
            return;
        }
        
        MarkerManager.addMarker(time, paramsToShow, (err, res) => {
            if (err) {
                if (updateStatusFn) updateStatusFn(`❌ ${err}`, true);
                alert(err);
            } else {
                if (updateStatusFn) updateStatusFn(`✅ 已添加节点: ${time}`);
                updateMarkerList();
            }
        });
    }
    
    function updateMarkerList() {
        const container = document.getElementById('markerListContainer');
        if (!container) return;
        
        const markers = MarkerManager.getAllMarkers();
        
        if (markers.length === 0) {
            container.innerHTML = '暂无';
            return;
        }
        
        container.innerHTML = markers.map(marker => `
            <div class="marker-item" data-time="${marker.time}">
                <span class="marker-item-time">🕐 ${marker.time}</span>
                <button class="marker-item-remove" data-time="${marker.time}">移除</button>
            </div>
        `).join('');
        
        document.querySelectorAll('.marker-item-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const time = btn.dataset.time;
                MarkerManager.removeMarker(time);
                updateMarkerList();
                if (updateStatusFn) updateStatusFn(`🗑️ 已移除节点: ${time}`);
            });
        });
    }
    
    function refresh() {
        updateMarkerList();
        MarkerManager.refreshMarkers();
    }
    
    function show() {
    if (panel) panel.style.display = 'block';
}

function hide() {
    if (panel) panel.style.display = 'none';
}

function toggle() {
    if (panel) {
        if (panel.style.display === 'none') {
            panel.style.display = 'block';
        } else {
            panel.style.display = 'none';
        }
    }
}


    return {
    init: init,
    show: show,
    hide: hide,
    toggle: toggle,
    refresh: refresh
};
})();