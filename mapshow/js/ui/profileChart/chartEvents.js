/**
 * 图表事件处理模块（鼠标悬停、拖拽调整高度）
 */

const ChartEvents = (function() {
    let isDragging = false;
    let dragStartY = 0;
    let dragStartHeight = 0;
    let onHeightChange = null;
    let onPointHover = null;
    let onPointLeave = null;
    let tempMarker = null;
    
    function initResizeHandle(handleId, onHeightChangeCallback) {
        onHeightChange = onHeightChangeCallback;
        const handle = document.getElementById(handleId);
        if (!handle) return;
        
        handle.addEventListener('mousedown', (e) => {
            isDragging = true;
            dragStartY = e.clientY;
            dragStartHeight = ChartCore.getHeight();
            document.body.style.cursor = 'ns-resize';
            e.preventDefault();
        });
        
        window.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const deltaY = dragStartY - e.clientY;
            let newHeight = dragStartHeight + deltaY;
            newHeight = Math.max(120, Math.min(500, newHeight));
            if (newHeight !== ChartCore.getHeight()) {
                ChartCore.setHeight(newHeight);
                if (onHeightChange) onHeightChange(newHeight);
            }
        });
        
        window.addEventListener('mouseup', () => {
            isDragging = false;
            document.body.style.cursor = '';
        });
    }
    
    function bindCanvasEvents(canvasId, tooltipId) {
        const canvas = document.getElementById(canvasId);
        const tooltip = document.getElementById(tooltipId);
        if (!canvas) return;
        
        canvas.addEventListener('mousemove', (e) => {
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const mouseX = (e.clientX - rect.left) * scaleX;
            
            const point = ChartCore.getPointAtPixel(mouseX, canvas.width);
            if (!point) {
                if (tooltip) tooltip.style.display = 'none';
                if (onPointLeave) onPointLeave();
                return;
            }
            
            if (tooltip) {
                tooltip.innerHTML = `🕐 ${point.time}<br>🏔️ ${Math.round(point.params.altitude)} ft`;
                tooltip.style.display = 'block';
                tooltip.style.left = (e.clientX + 10) + 'px';
                tooltip.style.top = (e.clientY - 30) + 'px';
            }
            
            if (onPointHover) onPointHover(point);
        });
        
        canvas.addEventListener('mouseleave', () => {
            if (tooltip) tooltip.style.display = 'none';
            if (onPointLeave) onPointLeave();
        });
    }
    
    function setHoverCallbacks(onHover, onLeave) {
        onPointHover = onHover;
        onPointLeave = onLeave;
    }
    
    function showMapMarker(lat, lon, time, altitude) {
        const map = MapManager.getMap();
        if (!map) return;
        
        if (tempMarker) map.removeLayer(tempMarker);
        
        const popupContent = `
            <div style="text-align: center;">
                <b>📍 剖面定位</b><br>
                🕐 ${time}<br>
                🏔️ ${Math.round(altitude)} ft
            </div>
        `;
        
        tempMarker = L.marker([lat, lon], {
            icon: L.divIcon({
                className: 'temp-marker',
                html: '<div style="background-color:#00bcd4; width:12px; height:12px; border-radius:50%; border:2px solid white; box-shadow:0 0 4px rgba(0,0,0,0.3);"></div>',
                iconSize: [16, 16]
            })
        }).bindPopup(popupContent).openPopup();
        
        tempMarker.addTo(map);
    }
    
    function hideMapMarker() {
        if (tempMarker) {
            const map = MapManager.getMap();
            if (map) map.removeLayer(tempMarker);
            tempMarker = null;
        }
    }
    
    return {
        initResizeHandle: initResizeHandle,
        bindCanvasEvents: bindCanvasEvents,
        setHoverCallbacks: setHoverCallbacks,
        showMapMarker: showMapMarker,
        hideMapMarker: hideMapMarker
    };
})();