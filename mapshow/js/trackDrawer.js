/**
 * 轨迹绘制模块
 * 只绘制轨迹线，不显示航路点
 * 支持鼠标悬停显示时间信息（仅在轨迹附近触发）
 */

const TrackDrawer = (function() {
    let currentPoints = null;
    let currentLatLngs = null;  // 存储轨迹坐标数组
    let hoverTimer = null;
    let hoverTooltip = null;
    let isNearTrack = false;     // 标记鼠标是否在轨迹附近
    
    // 计算鼠标到轨迹线段的距离
    function distanceToSegment(p, a, b) {
        const ab = { x: b.lng - a.lng, y: b.lat - a.lat };
        const ap = { x: p.lng - a.lng, y: p.lat - a.lat };
        
        const dot = ab.x * ap.x + ab.y * ap.y;
        const abLenSq = ab.x * ab.x + ab.y * ab.y;
        
        if (abLenSq === 0) return Math.hypot(ap.x, ap.y);
        
        let t = dot / abLenSq;
        t = Math.max(0, Math.min(1, t));
        
        const closest = {
            x: a.lng + ab.x * t,
            y: a.lat + ab.y * t
        };
        
        return Math.hypot(p.lng - closest.x, p.lat - closest.y);
    }
    
    // 检查鼠标是否在轨迹附近（阈值约 0.002 度，约 200 米）
    function isNearTrackLine(latLng, latLngs, threshold = 0.002) {
        if (!latLngs || latLngs.length < 2) return false;
        
        for (let i = 0; i < latLngs.length - 1; i++) {
            const a = { lat: latLngs[i][0], lng: latLngs[i][1] };
            const b = { lat: latLngs[i + 1][0], lng: latLngs[i + 1][1] };
            const p = { lat: latLng.lat, lng: latLng.lng };
            
            const dist = distanceToSegment(p, a, b);
            if (dist < threshold) {
                return true;
            }
        }
        return false;
    }
    
    // 找到轨迹上离鼠标最近的点
    function findNearestPoint(latLng, points) {
        if (!points || points.length === 0) return null;
        
        let minDistance = Infinity;
        let nearestPoint = null;
        
        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            const distance = Math.pow(latLng.lat - p.lat, 2) + Math.pow(latLng.lng - p.lon, 2);
            if (distance < minDistance) {
                minDistance = distance;
                nearestPoint = p;
            }
        }
        
        return nearestPoint;
    }
    
    // 创建悬停提示框
    function showHoverTooltip(latLng, point) {
        const map = MapManager.getMap();
        if (!map) return;
        
        if (hoverTooltip) {
            map.removeLayer(hoverTooltip);
        }
        
        const tooltipContent = `
            <div style="background: rgba(0,0,0,0.8); color: white; padding: 6px 12px; border-radius: 6px; font-size: 12px; white-space: nowrap; border-left: 3px solid #ff9800;">
                🕐 ${point.time}
            </div>
        `;
        
        hoverTooltip = L.marker(latLng, {
            icon: L.divIcon({
                className: 'hover-tooltip',
                html: tooltipContent,
                iconSize: [120, 30],
                popupAnchor: [0, -15]
            })
        }).addTo(map);
    }
    
    function hideHoverTooltip() {
        const map = MapManager.getMap();
        if (!map) return;
        
        if (hoverTimer) {
            clearTimeout(hoverTimer);
            hoverTimer = null;
        }
        if (hoverTooltip) {
            map.removeLayer(hoverTooltip);
            hoverTooltip = null;
        }
        isNearTrack = false;
    }
    
    // 绘制轨迹
    function draw(points) {
        if (!points || points.length < 2) {
            console.warn('航点不足，无法绘制轨迹');
            return false;
        }
        
        // 清除旧的轨迹和标记
        MapManager.clearAll();
        
        // 提取坐标数组
        const latLngs = points.map(p => [p.lat, p.lon]);
        currentLatLngs = latLngs;
        
        // 添加轨迹线（紫蓝色）
        MapManager.addTrackLine(latLngs, {
            color: '#5019e6',
            weight: 5,
            opacity: 1.0
        });
        
        // 添加起点标记
        const startPopup = `
            <b>✈️ 起飞点</b><br>
            📅 时间: ${points[0].time}<br>
            📍 经度: ${points[0].rawLon}<br>
            📍 纬度: ${points[0].rawLat}
        `;
        MapManager.addStartMarker([points[0].lat, points[0].lon], startPopup);
        
        // 添加终点标记
        const endPopup = `
            <b>🏁 终点</b><br>
            📅 时间: ${points[points.length - 1].time}<br>
            📍 经度: ${points[points.length - 1].rawLon}<br>
            📍 纬度: ${points[points.length - 1].rawLat}
        `;
        MapManager.addEndMarker([points[points.length - 1].lat, points[points.length - 1].lon], endPopup);
        
        // 将轨迹和标记图层置顶
        MapManager.bringTrackToFront();
        
        // 调整地图视野
        MapManager.fitBounds(latLngs, 0.1);
        
        currentPoints = points;
        
        // 添加鼠标悬停事件
        addHoverEvents();
        
        console.log('轨迹绘制完成，点数:', points.length);
        if (typeof ProfileChart !== 'undefined' && ProfileChart.loadData) {
        ProfileChart.loadData(points);
    }
        return true;
    }
    
    // 添加鼠标悬停事件
    function addHoverEvents() {
        const map = MapManager.getMap();
        if (!map) return;
        
        // 鼠标移动时检测
        map.on('mousemove', function(e) {
            if (!currentPoints || currentPoints.length === 0) return;
            if (!currentLatLngs) return;
            
            // 检查鼠标是否在轨迹附近
            const near = isNearTrackLine(e.latlng, currentLatLngs, 0.002);
            
            if (near) {
                // 在轨迹附近，启动定时器
                if (!isNearTrack) {
                    isNearTrack = true;
                }
                
                if (hoverTimer) {
                    clearTimeout(hoverTimer);
                }
                
                hoverTimer = setTimeout(() => {
                    if (isNearTrack) {
                        const nearestPoint = findNearestPoint(e.latlng, currentPoints);
                        if (nearestPoint) {
                            showHoverTooltip(e.latlng, nearestPoint);
                        }
                    }
                }, 2000);
            } else {
                // 不在轨迹附近，清除提示和定时器
                if (hoverTimer) {
                    clearTimeout(hoverTimer);
                    hoverTimer = null;
                }
                if (hoverTooltip) {
                    hideHoverTooltip();
                }
                isNearTrack = false;
            }
        });
        
        // 鼠标离开地图时清除提示
        map.on('mouseout', function() {
            hideHoverTooltip();
        });
    }
    
    // 获取当前轨迹点
    function getCurrentPoints() {
        return currentPoints;
    }
    
    // 重置视图到轨迹范围
    function fitToTrack() {
        if (currentPoints && currentPoints.length > 0) {
            const latLngs = currentPoints.map(p => [p.lat, p.lon]);
            MapManager.fitBounds(latLngs, 0.1);
            return true;
        }
        return false;
    }
    
    // 将轨迹置顶
    function bringToFront() {
        MapManager.bringTrackToFront();
    }
    
    return {
        draw: draw,
        getCurrentPoints: getCurrentPoints,
        fitToTrack: fitToTrack,
        bringToFront: bringToFront
    };
})();