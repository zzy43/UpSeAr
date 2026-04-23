/**
 * 主逻辑模块
 * 协调各模块，处理用户交互
 */

(function() {
    document.addEventListener('DOMContentLoaded', function() {
        
        // 初始化地图
        MapManager.init('map', [19.09, 73.24], 14);
        
        // 初始化状态栏
        StatusBar.init('status', 'info');
        StatusBar.setStatusCallback(function(message, isError) {
            const statusDiv = document.getElementById('status');
            if (statusDiv) {
                statusDiv.innerHTML = `<span>${message}</span>`;
                statusDiv.style.opacity = '1';
                if (!isError) {
                    setTimeout(() => {
                        statusDiv.style.opacity = '0.8';
                    }, 3000);
                }
            }
        });
        
        // 初始化航图面板
        ImagePanel.init(StatusBar.updateStatus);
        
        // 初始化节点添加界面
        MarkerUI.init(StatusBar.updateStatus);
        // 初始化美化面板
BeautifyPanel.init(StatusBar.updateStatus);
        // 初始化高度剖面图模块
        ProfileChart.init(StatusBar.updateStatus);
        
        // 获取DOM元素
        const fileSelectBtn = document.getElementById('fileSelectBtn');
        const fileInput = document.getElementById('fileInput');
        const addMarkerBtn = document.getElementById('addMarkerBtn');
        const toggleImagePanelBtn = document.getElementById('toggleImagePanelBtn');
        const resetViewBtn = document.getElementById('resetViewBtn');
        const baseMapSelect = document.getElementById('baseMapSelect');
        const toggleChartBtn = document.getElementById('toggleChartBtn');
        const beautifyBtn = document.getElementById('beautifyBtn');
        
        // 从文件加载
        function loadFromFile(file) {
            StatusBar.updateStatus('📖 正在读取文件...');
            
            const fileName = file.name;
            const fileExt = fileName.split('.').pop().toLowerCase();
            
            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    let points;
                    
                    if (fileExt === 'csv') {
                        const csvText = e.target.result;
                        points = DataParser.parseCSVData(csvText);
                    } else {
                        const data = e.target.result;
                        points = DataParser.parseExcelData(new Uint8Array(data));
                    }
                    
                    console.log('解析到的点数:', points.length);
                    
                    // 设置轨迹点到 MarkerManager
                    MarkerManager.setTrackPoints(points);
                    
                    const success = TrackDrawer.draw(points);
                    console.log('绘制结果:', success);
                    if (success) {
                        StatusBar.updateInfo(points);
                        StatusBar.updateStatus(`✅ 轨迹已加载，共 ${points.length} 个有效航点`);
                        
                        // 刷新节点标记（重新计算位置）
                        MarkerManager.refreshMarkers();
                        MarkerUI.refresh();
                        
                        // 加载高度剖面图数据
                        if (typeof ProfileChart !== 'undefined' && ProfileChart.loadData) {
                            ProfileChart.loadData(points);
                        }
                        
                        setTimeout(() => {
                            if (typeof TrackDrawer.bringToFront === 'function') {
                                TrackDrawer.bringToFront();
                            } else if (typeof MapManager.bringTrackToFront === 'function') {
                                MapManager.bringTrackToFront();
                            }
                        }, 100);
                    }
                } catch (err) {
                    console.error(err);
                    StatusBar.updateStatus(`❌ 解析失败: ${err.message}`, true);
                    alert("解析失败: " + err.message);
                }
            };
            
            if (fileExt === 'csv') {
                reader.readAsText(file, 'UTF-8');
            } else {
                reader.readAsArrayBuffer(file);
            }
        }
        
        // 重置视图
        function resetView() {
            const fitted = TrackDrawer.fitToTrack();
            if (!fitted) {
                MapManager.resetView([19.09, 73.24], 14);
                StatusBar.updateStatus('🎯 已重置到默认视图');
            } else {
                StatusBar.updateStatus('🎯 已重置视图到轨迹范围');
            }
        }
        
        // 切换底图
        function switchBaseMap() {
            const selected = baseMapSelect.value;
            MapManager.switchBaseMap(selected);
            StatusBar.updateStatus(`🗺️ 已切换至: ${baseMapSelect.options[baseMapSelect.selectedIndex].text}`);
        }
        
        // ========== 节点面板控制 ==========
        let isMarkerPanelVisible = false;
        function toggleMarkerPanel() {
            const markerPanel = document.getElementById('marker-panel');
            if (!markerPanel) return;
            
            if (isMarkerPanelVisible) {
                markerPanel.style.display = 'none';
                addMarkerBtn.innerHTML = '📍 添加节点';
                isMarkerPanelVisible = false;
            } else {
                markerPanel.style.display = 'block';
                addMarkerBtn.innerHTML = '🙈 隐藏面板';
                isMarkerPanelVisible = true;
            }
        }
        
        // ========== 航图面板控制 ==========
        let isImagePanelVisible = false;
        function toggleImagePanel() {
            const imagePanel = document.getElementById('image-overlay-panel');
            if (!imagePanel) return;
            
            if (isImagePanelVisible) {
                imagePanel.style.display = 'none';
                toggleImagePanelBtn.innerHTML = '🗺️ 叠加航图';
                isImagePanelVisible = false;
            } else {
                imagePanel.style.display = 'block';
                toggleImagePanelBtn.innerHTML = '🙈 隐藏航图';
                isImagePanelVisible = true;
            }
        }
        
        // ========== 高度剖面图控制 ==========
        let isChartVisible = false;
        function toggleChart() {
            if (isChartVisible) {
                ProfileChart.hide();
                toggleChartBtn.innerHTML = '📊 高度剖面';
                isChartVisible = false;
            } else {
                ProfileChart.show();
                toggleChartBtn.innerHTML = '🙈 隐藏剖面';
                isChartVisible = true;
            }
        }
        
        // ========== 美化面板控制 ==========
        let isBeautifyPanelVisible = false;
        function toggleBeautifyPanel() {
            if (isBeautifyPanelVisible) {
                BeautifyPanel.hide();
                beautifyBtn.innerHTML = '🎨 美化轨迹';
                isBeautifyPanelVisible = false;
            } else {
                BeautifyPanel.show();
                beautifyBtn.innerHTML = '🙈 隐藏面板';
                isBeautifyPanelVisible = true;
            }
        }
        
        // ========== 绑定事件 ==========
        // 文件选择按钮
        if (fileSelectBtn) {
            fileSelectBtn.addEventListener('click', function() {
                fileInput.click();
            });
        }
        
        // 文件输入
        if (fileInput) {
            fileInput.addEventListener('change', function(e) {
                if (e.target.files && e.target.files[0]) {
                    loadFromFile(e.target.files[0]);
                }
            });
        }
        
        // 添加节点按钮
        if (addMarkerBtn) {
            addMarkerBtn.addEventListener('click', toggleMarkerPanel);
        }
        
        // 叠加航图按钮
        if (toggleImagePanelBtn) {
            toggleImagePanelBtn.addEventListener('click', toggleImagePanel);
        }
        
        // 高度剖面图按钮
        if (toggleChartBtn) {
            toggleChartBtn.addEventListener('click', toggleChart);
        }
        
        // 美化轨迹按钮
        if (beautifyBtn) {
            beautifyBtn.addEventListener('click', toggleBeautifyPanel);
        }
        
        // 重置视图按钮
        if (resetViewBtn) {
            resetViewBtn.addEventListener('click', resetView);
        }
        
        // 底图切换
        if (baseMapSelect) {
            baseMapSelect.addEventListener('change', switchBaseMap);
        }
        
        // ========== 初始状态：所有面板都隐藏 ==========
        // 节点面板
        const markerPanel = document.getElementById('marker-panel');
        if (markerPanel) {
            markerPanel.style.display = 'none';
        }
        
        // 航图面板
        const imagePanel = document.getElementById('image-overlay-panel');
        if (imagePanel) {
            imagePanel.style.display = 'none';
        }
        
        // 美化面板
        const beautifyPanel = document.getElementById('beautify-panel');
        if (beautifyPanel) {
            beautifyPanel.style.display = 'none';
        }
        
        // 确保按钮文字正确
        if (addMarkerBtn) {
            addMarkerBtn.innerHTML = '📍 添加节点';
        }
        if (toggleImagePanelBtn) {
            toggleImagePanelBtn.innerHTML = '🗺️ 叠加航图';
        }
        if (toggleChartBtn) {
            toggleChartBtn.innerHTML = '📊 高度剖面';
        }
        if (beautifyBtn) {
            beautifyBtn.innerHTML = '🎨 美化轨迹';
        }
        
        StatusBar.updateStatus('📁 请选择 FDR 数据文件 (.xlsx 或 .csv)');
    });
})();