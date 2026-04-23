/**
 * UI组件模块
 * 负责创建和控制界面元素
 */

const UI = (function() {
    let statusDiv = null;
    let infoDiv = null;
    let currentImageOverlay = null;
    let updateStatusCallback = null;
    
    // 初始化UI组件
    function init(statusElementId, infoElementId) {
        statusDiv = document.getElementById(statusElementId);
        infoDiv = document.getElementById(infoElementId);
    }
    
    // 设置状态更新回调
    function setStatusCallback(callback) {
        updateStatusCallback = callback;
    }
    
    // 更新状态栏
    function updateStatus(message, isError = false) {
        if (updateStatusCallback) {
            updateStatusCallback(message, isError);
        } else if (statusDiv) {
            statusDiv.innerHTML = `<span>${message}</span>`;
            statusDiv.style.opacity = '1';
            if (!isError) {
                setTimeout(() => {
                    statusDiv.style.opacity = '0.8';
                }, 3000);
            }
        }
    }
    
    // 更新信息栏
    function updateInfo(points) {
        if (!infoDiv) return;
        
        if (!points || points.length === 0) {
            infoDiv.innerHTML = '📊 无数据';
            return;
        }
        
        const startTime = points[0].time;
        const endTime = points[points.length - 1].time;
        const startCoord = `${points[0].lat.toFixed(6)}°, ${points[0].lon.toFixed(6)}°`;
        const endCoord = `${points[points.length - 1].lat.toFixed(6)}°, ${points[points.length - 1].lon.toFixed(6)}°`;
        
        infoDiv.innerHTML = `📊 航点: ${points.length}个 | 起点: ${startTime} (${startCoord}) | 终点: ${endTime} (${endCoord})`;
    }
    
    // 添加航图控制面板
    function addImageControlPanel(onApplyCallback, onClearCallback) {
        // 创建控制面板容器
        const panel = document.createElement('div');
        panel.id = 'image-overlay-panel';
        panel.innerHTML = `
            <div class="image-panel-header">
                <span>📸 杰普逊航图叠加</span>
                <button id="toggleImagePanel" class="panel-toggle">−</button>
            </div>
            <div class="image-panel-content">
                <div class="upload-area">
                    <input type="file" id="jeppesenImageInput" accept="image/jpeg,image/png,image/jpg,image/webp" />
                    <label for="jeppesenImageInput" class="upload-label">📁 选择航图图片</label>
                </div>
                <div class="coords-input">
                    <div class="coord-row">
                        <span>左上角:</span>
                        <input type="text" id="topLeftLat" placeholder="纬度 20.5" value="20.5">
                        <input type="text" id="topLeftLng" placeholder="经度 71.5" value="71.5">
                    </div>
                    <div class="coord-row">
                        <span>右下角:</span>
                        <input type="text" id="bottomRightLat" placeholder="纬度 19.0" value="19.0">
                        <input type="text" id="bottomRightLng" placeholder="经度 74.5" value="74.5">
                    </div>
                </div>
                <div class="opacity-control">
                    <span>透明度:</span>
                    <input type="range" id="imageOpacity" min="0" max="100" value="65">
                    <span id="opacityValue">65%</span>
                </div>
                <div class="panel-buttons">
                    <button id="applyImageOverlay" class="btn-primary">📌 应用航图</button>
                    <button id="clearImageOverlay" class="btn-secondary">🗑️ 清除航图</button>
                </div>
                <div class="hint">
                    💡 提示：航图图片应裁剪为矩形，系统会自动拉伸适配
                </div>
            </div>
        `;
        
        document.body.appendChild(panel);
        
        // 添加样式
        const style = document.createElement('style');
        style.textContent = `
            #image-overlay-panel {
                position: fixed;
                top: 80px;
                right: 10px;
                width: 280px;
                background: rgba(30, 30, 40, 0.95);
                backdrop-filter: blur(10px);
                border-radius: 12px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                z-index: 1000;
                font-size: 13px;
                color: #eee;
                border: 1px solid rgba(255,255,255,0.2);
                transition: all 0.3s ease;
            }
            .image-panel-header {
                padding: 12px 15px;
                background: rgba(0,0,0,0.5);
                border-radius: 12px 12px 0 0;
                cursor: pointer;
                display: flex;
                justify-content: space-between;
                font-weight: bold;
            }
            .image-panel-content {
                padding: 12px;
                border-top: 1px solid rgba(255,255,255,0.1);
            }
            .upload-area {
                margin-bottom: 12px;
            }
            .upload-label {
                display: block;
                background: #4CAF50;
                padding: 8px;
                text-align: center;
                border-radius: 6px;
                cursor: pointer;
                font-size: 12px;
                transition: background 0.2s;
            }
            .upload-label:hover {
                background: #45a049;
            }
            #jeppesenImageInput {
                display: none;
            }
            .coords-input {
                margin-bottom: 12px;
            }
            .coord-row {
                display: flex;
                gap: 8px;
                margin-bottom: 8px;
                align-items: center;
            }
            .coord-row span {
                width: 55px;
                font-size: 12px;
            }
            .coord-row input {
                flex: 1;
                background: rgba(0,0,0,0.6);
                border: 1px solid #555;
                padding: 6px 8px;
                border-radius: 4px;
                color: white;
                font-size: 12px;
            }
            .coord-row input:focus {
                outline: none;
                border-color: #4CAF50;
            }
            .opacity-control {
                display: flex;
                align-items: center;
                gap: 10px;
                margin-bottom: 12px;
            }
            .opacity-control input {
                flex: 1;
            }
            .panel-buttons {
                display: flex;
                gap: 10px;
                margin-bottom: 10px;
            }
            .btn-primary, .btn-secondary {
                flex: 1;
                padding: 8px;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-weight: bold;
                transition: all 0.2s;
            }
            .btn-primary {
                background: #2196F3;
                color: white;
            }
            .btn-primary:hover {
                background: #0b7dda;
            }
            .btn-secondary {
                background: #f44336;
                color: white;
            }
            .btn-secondary:hover {
                background: #da190b;
            }
            .hint {
                font-size: 10px;
                color: #aaa;
                text-align: center;
                margin-top: 8px;
            }
            .panel-toggle {
                background: none;
                border: none;
                color: white;
                cursor: pointer;
                font-size: 16px;
            }
            .image-panel-content.collapsed {
                display: none;
            }
            @media (max-width: 768px) {
                #image-overlay-panel {
                    width: 260px;
                    top: 70px;
                    right: 5px;
                    font-size: 11px;
                }
            }
        `;
        document.head.appendChild(style);
        
        // 绑定事件
        let panelContent = panel.querySelector('.image-panel-content');
        const toggleBtn = document.getElementById('toggleImagePanel');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                panelContent.classList.toggle('collapsed');
                toggleBtn.textContent = panelContent.classList.contains('collapsed') ? '+' : '−';
            });
        }
        
        const fileInputJepp = document.getElementById('jeppesenImageInput');
        const applyBtn = document.getElementById('applyImageOverlay');
        const clearBtn = document.getElementById('clearImageOverlay');
        const opacitySlider = document.getElementById('imageOpacity');
        const opacityValue = document.getElementById('opacityValue');
        
        let currentImageFile = null;
        
        if (fileInputJepp) {
            fileInputJepp.addEventListener('change', (e) => {
                if (e.target.files && e.target.files[0]) {
                    currentImageFile = e.target.files[0];
                    updateStatus(`📸 已选择图片: ${currentImageFile.name}`);
                }
            });
        }
        
        // 透明度调节 - 修复版
        if (opacitySlider) {
            opacitySlider.addEventListener('input', () => {
                const val = opacitySlider.value;
                opacityValue.textContent = val + '%';
                if (currentImageOverlay) {
                    // 修复：currentImageOverlay 是 {imageOverlay, boundsRect} 对象
                    if (currentImageOverlay.imageOverlay) {
                        currentImageOverlay.imageOverlay.setOpacity(val / 100);
                    } else if (typeof currentImageOverlay.setOpacity === 'function') {
                        // 兼容旧版本
                        currentImageOverlay.setOpacity(val / 100);
                    }
                }
            });
        }
        
        if (applyBtn) {
            applyBtn.addEventListener('click', () => {
                if (!currentImageFile) {
                    updateStatus('❌ 请先选择航图图片文件', true);
                    alert('请先选择杰普逊航图的截图文件');
                    return;
                }
                
                const topLat = parseFloat(document.getElementById('topLeftLat').value);
                const topLng = parseFloat(document.getElementById('topLeftLng').value);
                const bottomLat = parseFloat(document.getElementById('bottomRightLat').value);
                const bottomLng = parseFloat(document.getElementById('bottomRightLng').value);
                
                if (isNaN(topLat) || isNaN(topLng) || isNaN(bottomLat) || isNaN(bottomLng)) {
                    updateStatus('❌ 坐标格式错误', true);
                    alert('请输入有效的经纬度坐标');
                    return;
                }
                
                const bounds = [
                    [Math.min(topLat, bottomLat), Math.min(topLng, bottomLng)],
                    [Math.max(topLat, bottomLat), Math.max(topLng, bottomLng)]
                ];
                
                const reader = new FileReader();
                reader.onload = function(e) {
                    if (currentImageOverlay) {
                        MapManager.removeImageOverlay(currentImageOverlay);
                    }
                    
                    const opacity = opacitySlider ? opacitySlider.value / 100 : 0.65;
                    currentImageOverlay = MapManager.addImageOverlay(e.target.result, bounds, {
                        opacity: opacity,
                        showBounds: true
                    });
                    
                    // 叠加航图后，确保轨迹在最上层
                    if (typeof TrackDrawer !== 'undefined' && TrackDrawer.bringToFront) {
                        TrackDrawer.bringToFront();
                    }
                    
                    if (onApplyCallback) onApplyCallback(currentImageOverlay);
                    updateStatus(`✅ 航图已叠加，范围: 纬度 ${bounds[0][0]}~${bounds[1][0]}, 经度 ${bounds[0][1]}~${bounds[1][1]}`);
                };
                reader.readAsDataURL(currentImageFile);
            });
        }
        
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                if (currentImageOverlay) {
                    MapManager.removeImageOverlay(currentImageOverlay);
                    currentImageOverlay = null;
                    updateStatus('🗑️ 已清除航图叠加层');
                }
                if (fileInputJepp) {
                    fileInputJepp.value = '';
                    currentImageFile = null;
                }
                if (onClearCallback) onClearCallback();
            });
        }
    }
    
    return {
        init: init,
        setStatusCallback: setStatusCallback,
        updateStatus: updateStatus,
        updateInfo: updateInfo,
        addImageControlPanel: addImageControlPanel
    };
})();