/**
 * 航图控制面板模块（主面板）
 * 整合坐标转换、列表管理、样式
 * 选择图片后自动添加航图
 */

const ImagePanel = (function() {
    let updateStatusFn = null;
    let onApplyCallback = null;
    let onClearCallback = null;
    
    function init(statusUpdateFn) {
        updateStatusFn = statusUpdateFn;
        
        // 初始化子模块
        ImageList.init(updateStatusFn, renderImageList);
        
        // 添加样式
        const style = document.createElement('style');
        style.textContent = PanelStyles.getStyles();
        document.head.appendChild(style);
        
        createPanel();
    }
    
    function createPanel() {
        const panel = document.createElement('div');
        panel.id = 'image-overlay-panel';
        panel.innerHTML = `
            <div class="image-panel-header">
                <span>📸 航图叠加（多图）</span>
                <button id="toggleImagePanel" class="panel-toggle">−</button>
            </div>
            <div class="image-panel-content">
                <div class="upload-area">
                    <input type="file" id="jeppesenImageInput" accept="image/jpeg,image/png,image/jpg,image/webp" multiple />
                    <label for="jeppesenImageInput" class="upload-label">📁 选择航图图片（可多选）</label>
                </div>
                <div class="image-list" id="imageList">
                    <div class="image-list-title">已添加的航图：</div>
                    <div id="imageListContainer">暂无</div>
                </div>
                <div class="hint">
                    💡 文件名格式：20.30-72.10-18.50-74.00_描述.jpg 自动识别坐标<br>
                    💡 可叠加多张航图 || 网页制作者：朱震宇
                </div>
            </div>
        `;
        document.body.appendChild(panel);
        
        bindEvents(panel);
        panel.style.display = 'none';
    }
    
    function bindEvents(panel) {
        let panelContent = panel.querySelector('.image-panel-content');
        const toggleBtn = document.getElementById('toggleImagePanel');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                panelContent.classList.toggle('collapsed');
                toggleBtn.textContent = panelContent.classList.contains('collapsed') ? '+' : '−';
            });
        }
        
        const fileInput = document.getElementById('jeppesenImageInput');
        
        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                if (e.target.files && e.target.files.length > 0) {
                    const selectedFiles = Array.from(e.target.files);
                    if (updateStatusFn) {
                        updateStatusFn(`📸 已选择 ${selectedFiles.length} 张图片，正在添加...`);
                    }
                    
                    // 自动添加所有选中的图片
                    selectedFiles.forEach((file) => {
                        const parsed = FileParser.parseFilenameForBounds(file.name);
                        let bounds = null;
                        let boundsInfo = '';
                        
                        if (parsed) {
                            const topLat = Coordinates.degMinToDecimal(parsed.topLeft.lat);
                            const topLng = Coordinates.degMinToDecimal(parsed.topLeft.lng);
                            const bottomLat = Coordinates.degMinToDecimal(parsed.bottomRight.lat);
                            const bottomLng = Coordinates.degMinToDecimal(parsed.bottomRight.lng);
                            
                            bounds = [
                                [Math.min(topLat, bottomLat), Math.min(topLng, bottomLng)],
                                [Math.max(topLat, bottomLat), Math.max(topLng, bottomLng)]
                            ];
                            boundsInfo = ` (自动识别坐标: ${parsed.topLeft.lat},${parsed.topLeft.lng} → ${parsed.bottomRight.lat},${parsed.bottomRight.lng})`;
                        } else {
                            if (updateStatusFn) {
                                updateStatusFn(`⚠️ 无法识别 ${file.name} 的坐标，请在列表中手动编辑`, true);
                            }
                            const defaultBounds = [
                                [18.5, 72.0],
                                [20.5, 74.0]
                            ];
                            bounds = defaultBounds;
                            boundsInfo = ' (使用默认坐标，请手动编辑)';
                        }
                        
                        addImageOverlay(file, bounds, 0.65);
                        if (updateStatusFn) {
                            updateStatusFn(`✅ 已添加: ${file.name}${boundsInfo}`);
                        }
                    });
                    
                    // 清空文件选择，允许再次选择同一文件
                    fileInput.value = '';
                }
            });
        }
    }
    
    function addImageOverlay(file, bounds, opacity) {
        const reader = new FileReader();
        
        reader.onload = function(e) {
            const overlay = MapManager.addImageOverlay(e.target.result, bounds, {
                opacity: opacity,
                showBounds: true
            });
            
            ImageList.add(file, bounds, opacity, overlay);
            
            if (typeof TrackDrawer !== 'undefined' && TrackDrawer.bringToFront) {
                TrackDrawer.bringToFront();
            } else if (typeof MapManager !== 'undefined' && MapManager.bringTrackToFront) {
                MapManager.bringTrackToFront();
            }
            
            renderImageList();
        };
        reader.readAsDataURL(file);
    }
    
    function clearAllOverlays() {
        const items = ImageList.getAll();
        items.forEach(item => {
            MapManager.removeImageOverlay(item.overlay);
        });
        ImageList.clearAll();
        renderImageList();
    }
    
    function updateImageBounds(itemId, newBounds) {
        const item = ImageList.updateBounds(itemId, newBounds);
        if (item) {
            MapManager.removeImageOverlay(item.overlay);
            
            const reader = new FileReader();
            reader.onload = function(e) {
                const newOverlay = MapManager.addImageOverlay(e.target.result, newBounds, {
                    opacity: item.opacity,
                    showBounds: true
                });
                item.overlay = newOverlay;
                
                if (typeof TrackDrawer !== 'undefined' && TrackDrawer.bringToFront) {
                    TrackDrawer.bringToFront();
                }
                
                renderImageList();
                
                if (updateStatusFn) {
                    updateStatusFn(`✅ 已更新航图坐标: ${item.file.name}`);
                }
            };
            reader.readAsDataURL(item.file);
        }
    }
    
    // 透明度调节时不重新渲染整个列表
    function updateImageOpacity(itemId, opacity) {
        const item = ImageList.updateOpacity(itemId, opacity);
        if (item && item.overlay) {
            if (item.overlay.imageOverlay) {
                item.overlay.imageOverlay.setOpacity(opacity);
            } else if (typeof item.overlay.setOpacity === 'function') {
                item.overlay.setOpacity(opacity);
            }
        }
        // 只更新当前滑块的值，不重新渲染整个列表
        const slider = document.querySelector(`.item-opacity[data-id="${itemId}"]`);
        if (slider && slider.value != opacity * 100) {
            slider.value = opacity * 100;
        }
    }
    
    function renderImageList() {
        const container = document.getElementById('imageListContainer');
        if (!container) return;
        
        const items = ImageList.getAll();
        
        if (items.length === 0) {
            container.innerHTML = '暂无';
            return;
        }
        
        container.innerHTML = items.map(item => {
            const bounds = item.bounds;
            const display = ImageList.getBoundsDisplay(bounds);
            
            return `
            <div class="image-item" data-id="${item.id}">
                <div class="image-item-name">📷 ${item.file.name.substring(0, 35)}${item.file.name.length > 35 ? '...' : ''}</div>
                <div class="image-item-bounds">📐 范围: ${display.topLat}°, ${display.topLng}° → ${display.bottomLat}°, ${display.bottomLng}°</div>
                <div class="image-item-controls">
                    <span style="font-size:10px;">透明度:</span>
                    <input type="range" min="0" max="100" value="${item.opacity * 100}" class="item-opacity" data-id="${item.id}">
                    <button class="edit-item" data-id="${item.id}">✏️ 坐标</button>
                    <button class="remove-item" data-id="${item.id}">移除</button>
                </div>
            </div>
        `}).join('');
        
        // 绑定透明度调节 - 使用 oninput
        document.querySelectorAll('.item-opacity').forEach(slider => {
            slider.oninput = (e) => {
                e.stopPropagation();
                const id = parseInt(e.target.dataset.id);
                const val = e.target.value / 100;
                updateImageOpacity(id, val);
            };
        });
        
        // 绑定编辑按钮
        document.querySelectorAll('.edit-item').forEach(btn => {
            btn.removeEventListener('click', btn._clickHandler);
            const handler = (e) => {
                const id = parseInt(e.target.dataset.id);
                const item = ImageList.getAll().find(i => i.id === id);
                if (item) {
                    Coordinates.showEditDialog(item, item.bounds, (newBounds) => {
                        updateImageBounds(id, newBounds);
                    }, updateStatusFn);
                }
            };
            btn._clickHandler = handler;
            btn.addEventListener('click', handler);
        });
        
        // 绑定移除按钮
        document.querySelectorAll('.remove-item').forEach(btn => {
            btn.removeEventListener('click', btn._removeHandler);
            const handler = (e) => {
                const id = parseInt(e.target.dataset.id);
                const item = ImageList.getAll().find(i => i.id === id);
                if (item) {
                    MapManager.removeImageOverlay(item.overlay);
                    ImageList.remove(id);
                    renderImageList();
                    if (updateStatusFn) updateStatusFn(`🗑️ 已移除航图`);
                }
            };
            btn._removeHandler = handler;
            btn.addEventListener('click', handler);
        });
    }
    
    function setCallbacks(applyCb, clearCb) {
        onApplyCallback = applyCb;
        onClearCallback = clearCb;
    }
    
    // 显示航图面板
    function show() {
        const panel = document.getElementById('image-overlay-panel');
        if (panel) panel.style.display = 'block';
    }
    
    // 隐藏航图面板
    function hide() {
        const panel = document.getElementById('image-overlay-panel');
        if (panel) panel.style.display = 'none';
    }
    
    // 切换航图面板
    function toggle() {
        const panel = document.getElementById('image-overlay-panel');
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
        setCallbacks: setCallbacks,
        show: show,
        hide: hide,
        toggle: toggle
    };
})();