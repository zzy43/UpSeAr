/**
 * 节点标记管理模块
 * 负责在轨迹上添加/移除时间节点标记，支持显示飞行参数
 * 支持多个弹窗同时显示
 */

const MarkerManager = (function() {
    let markers = [];
    let currentPoints = null;
    
    // 时间格式标准化：将 5:55:55 转换为 05:55:55
    function normalizeTime(timeStr) {
        if (!timeStr) return timeStr;
        const parts = timeStr.split(':');
        if (parts.length === 3) {
            const hour = parts[0].padStart(2, '0');
            const minute = parts[1].padStart(2, '0');
            const second = parts[2].padStart(2, '0');
            return `${hour}:${minute}:${second}`;
        }
        return timeStr;
    }
    
    function parseTimeToSeconds(timeStr) {
        const normalized = normalizeTime(timeStr);
        const parts = normalized.split(':');
        if (parts.length === 3) {
            return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
        }
        return 0;
    }
    
    function findPositionAndParamsByTime(time, points) {
        if (!points || points.length === 0) return null;
        
        const targetTime = normalizeTime(time);
        
        let point = points.find(p => normalizeTime(p.time) === targetTime);
        if (point) {
            return {
                lat: point.lat,
                lon: point.lon,
                time: point.time,
                exact: true,
                params: point.params || {}
            };
        }
        
        for (let i = 0; i < points.length - 1; i++) {
            const p1 = points[i];
            const p2 = points[i + 1];
            
            const p1Time = normalizeTime(p1.time);
            const p2Time = normalizeTime(p2.time);
            
            if (targetTime >= p1Time && targetTime <= p2Time) {
                const t1 = parseTimeToSeconds(p1.time);
                const t2 = parseTimeToSeconds(p2.time);
                const tt = parseTimeToSeconds(targetTime);
                const ratio = (tt - t1) / (t2 - t1);
                
                const lat = p1.lat + (p2.lat - p1.lat) * ratio;
                const lon = p1.lon + (p2.lon - p1.lon) * ratio;
                
                const params = {};
                if (p1.params && p2.params) {
                    for (let key in p1.params) {
                        if (typeof p1.params[key] === 'number' && typeof p2.params[key] === 'number') {
                            params[key] = p1.params[key] + (p2.params[key] - p1.params[key]) * ratio;
                        } else if (p1.params[key] !== undefined) {
                            params[key] = p1.params[key];
                        }
                    }
                }
                
                return {
                    lat: lat,
                    lon: lon,
                    time: targetTime,
                    exact: false,
                    between: `${p1.time} ~ ${p2.time}`,
                    params: params
                };
            }
        }
        
        return null;
    }
    
    function buildPopupContent(data, paramsToShow) {
        let content = `
            <div style="min-width: 180px;">
                <b>📍 时间节点</b><br>
                🕐 时间: ${data.time}${!data.exact ? `<br><span style="color:#ff9800; font-size:10px;">⚠️ 插值位置 (介于 ${data.between})</span>` : ''}
                <hr style="margin: 6px 0; border-color: #555;">
        `;
        
        if (paramsToShow.longitude && data.lon !== undefined) {
            content += `📍 经度: ${data.lon.toFixed(2)}°<br>`;
        }
        if (paramsToShow.latitude && data.lat !== undefined) {
            content += `📍 纬度: ${data.lat.toFixed(2)}°<br>`;
        }
        if (paramsToShow.altitude && data.params.altitude !== undefined) {
            content += `🏔️ 高度: ${Math.round(data.params.altitude)} ft<br>`;
        }
        if (paramsToShow.flap && data.params.flap !== undefined) {
            content += `✈️ 襟翼: ${data.params.flap}°<br>`;
        }
        if (paramsToShow.ias && data.params.ias !== undefined) {
            content += `📊 表速: ${Math.round(data.params.ias)} kt<br>`;
        }
        if (paramsToShow.vspeed && data.params.vspeed !== undefined) {
            content += `📈 垂直: ${Math.round(data.params.vspeed)} ft/min<br>`;
        }
        if (paramsToShow.windDir && data.params.windDir !== undefined) {
            content += `🌬️ 风向: ${Math.round(data.params.windDir)}°<br>`;
        }
        if (paramsToShow.windSpd && data.params.windSpd !== undefined) {
            content += `💨 风速: ${Math.round(data.params.windSpd)} kt<br>`;
        }
        
        content += `</div>`;
        return content;
    }
    
    function setTrackPoints(points) {
        currentPoints = points;
    }
    
    function addMarker(time, paramsToShow = {}, callback) {
        if (!currentPoints || currentPoints.length === 0) {
            if (callback) callback('请先加载 FDR 轨迹数据');
            return false;
        }
        
        const data = findPositionAndParamsByTime(time, currentPoints);
        if (!data) {
            if (callback) callback(`未找到时间点: ${time}`);
            return false;
        }
        
        const existing = markers.find(m => normalizeTime(m.time) === normalizeTime(time));
        if (existing) {
            if (callback) callback(`时间点 ${time} 已存在标记`);
            return false;
        }
        
        const popupContent = buildPopupContent(data, paramsToShow);
        
        const newMarker = L.marker([data.lat, data.lon], {
            icon: L.divIcon({
                className: 'time-marker',
                html: '<div style="background-color:#ff9800; width:14px; height:14px; border-radius:50%; border:2px solid white; box-shadow:0 0 4px rgba(0,0,0,0.3);"></div>',
                iconSize: [18, 18],
                popupAnchor: [0, -9]
            })
        });
        
        // 关键设置：允许多个弹窗同时打开
        newMarker.bindPopup(popupContent, {
            autoClose: false,      // 打开其他弹窗时不自动关闭当前弹窗
            closeOnClick: false,   // 点击地图时不关闭弹窗
            closeButton: true      // 保留右上角的 X 关闭按钮
        });
        
        // 点击标记时打开弹窗
        newMarker.on('click', function() {
            newMarker.openPopup();
        });
        
        const markersLayer = MapManager.getMarkersLayer();
        if (markersLayer) {
            newMarker.addTo(markersLayer);
        } else {
            newMarker.addTo(MapManager.getMap());
        }
        
        markers.push({
            time: time,
            marker: newMarker,
            position: data,
            paramsToShow: paramsToShow
        });
        
        if (callback) callback(null, { time, position: data });
        return true;
    }
    
    function removeMarker(time) {
        const index = markers.findIndex(m => normalizeTime(m.time) === normalizeTime(time));
        if (index !== -1) {
            const marker = markers[index].marker;
            const markersLayer = MapManager.getMarkersLayer();
            if (markersLayer) {
                markersLayer.removeLayer(marker);
            } else {
                marker.remove();
            }
            markers.splice(index, 1);
            return true;
        }
        return false;
    }
    
    function clearAllMarkers() {
        const markersLayer = MapManager.getMarkersLayer();
        markers.forEach(item => {
            if (markersLayer) {
                markersLayer.removeLayer(item.marker);
            } else {
                item.marker.remove();
            }
        });
        markers = [];
    }
    
    function getAllMarkers() {
        return markers.map(m => ({ time: m.time, paramsToShow: m.paramsToShow }));
    }
    
    function refreshMarkers() {
        if (!currentPoints) return;
        
        markers.forEach(item => {
            const newData = findPositionAndParamsByTime(item.time, currentPoints);
            if (newData) {
                const newLatLng = [newData.lat, newData.lon];
                item.marker.setLatLng(newLatLng);
                
                const newContent = buildPopupContent(newData, item.paramsToShow);
                item.marker.bindPopup(newContent, {
                    autoClose: false,
                    closeOnClick: false,
                    closeButton: true
                });
                item.position = newData;
            }
        });
    }
    
// 获取所有标记的完整数据（包括 marker 对象）
function getAllMarkersFull() {
    return markers;
}

// 更新所有标记的样式
function updateAllMarkersStyle(color, size) {
    const sizePx = size;
    const radiusPx = Math.floor(sizePx / 2);
    
    markers.forEach(item => {
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

    return {
    setTrackPoints: setTrackPoints,
    addMarker: addMarker,
    removeMarker: removeMarker,
    clearAllMarkers: clearAllMarkers,
    getAllMarkers: getAllMarkers,
    getAllMarkersFull: getAllMarkersFull,      // 新增
    updateAllMarkersStyle: updateAllMarkersStyle,  // 新增
    refreshMarkers: refreshMarkers
};
})();