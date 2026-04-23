/**
 * 地图管理模块（等高线增强版）
 * 使用 Esri 地形图作为默认底图
 */

const MapManager = (function() {
    let map = null;
    let currentBaseLayer = null;
    let trackLayer = null;
    let markersLayer = null;
    
    // 定义可用的底图源
    const baseMaps = {
        esriTopo: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
            attribution: 'Tiles &copy; Esri &mdash; Source: Esri, DeLorme, NAVTEQ, TomTom, Intermap, iPC, USGS, FAO, NPS, NRCAN, GeoBase, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), and the GIS User Community',
            maxZoom: 17,
            minZoom: 3
        }),
        
        openTopoMap: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
            attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors, SRTM | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
            maxZoom: 17,
            minZoom: 3,
            subdomains: 'abc'
        }),
        
        esriImagery: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
            maxZoom: 18,
            minZoom: 3
        }),
        
        cartodb: L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; CartoDB',
            subdomains: 'abcd',
            maxZoom: 19,
            minZoom: 3
        })
    };
    
    function init(containerId, defaultCenter = [19.09, 73.24], defaultZoom = 14) {
        map = L.map(containerId).setView(defaultCenter, defaultZoom);
        
        currentBaseLayer = baseMaps.esriTopo;
        currentBaseLayer.addTo(map);
        
        L.control.scale({ metric: true, imperial: false, position: 'bottomleft' }).addTo(map);
        
        if (L.Control.FullScreen) {
            map.addControl(new L.Control.FullScreen());
        }
        
        trackLayer = L.layerGroup().addTo(map);
        markersLayer = L.layerGroup().addTo(map);
        
        return map;
    }
    
    function switchBaseMap(mapType) {
        if (currentBaseLayer) {
            map.removeLayer(currentBaseLayer);
        }
        
        if (baseMaps[mapType]) {
            currentBaseLayer = baseMaps[mapType];
            currentBaseLayer.addTo(map);
        } else {
            currentBaseLayer = baseMaps.esriTopo;
            currentBaseLayer.addTo(map);
        }
    }
    
    function getMap() { return map; }
    function getTrackLayer() { return trackLayer; }
    function getMarkersLayer() { return markersLayer; }
    
    // 清除所有轨迹和标记
function clearAll() {
    if (trackLayer) {
        trackLayer.clearLayers();
    }
    if (markersLayer) {
        markersLayer.clearLayers();
    }
}
    
    function fitBounds(latLngs, padding = 0.1) {
        if (!map || !latLngs || latLngs.length === 0) return;
        const bounds = L.latLngBounds(latLngs);
        map.fitBounds(bounds.pad(padding));
    }
    
    function resetView(center = [19.09, 73.24], zoom = 14) {
        map.setView(center, zoom);
    }
    
    function addTrackLine(latLngs, options = {}) {
        const defaultOptions = {
            color: '#5019e6',
            weight: 5,
            opacity: 1.0,
            smoothFactor: 1,
            lineJoin: 'round',
            lineCap: 'round'
        };
        
        const polyline = L.polyline(latLngs, { ...defaultOptions, ...options });
        polyline.bindTooltip('✈️ 飞行轨迹', { sticky: true });
        polyline.addTo(trackLayer);
        
        const glowOptions = {
            color: '#ff8888',
            weight: 9,
            opacity: 0.3,
            smoothFactor: 1,
            lineJoin: 'round'
        };
        const glowLine = L.polyline(latLngs, glowOptions);
        glowLine.addTo(trackLayer);
        if (glowLine.bringToBack) glowLine.bringToBack();
        
        return polyline;
    }
    
    function addStartMarker(latLng, popupContent) {
        const icon = L.divIcon({
            className: 'custom-div-icon',
            html: '<div class="custom-marker-start"></div>',
            iconSize: [18, 18],
            popupAnchor: [0, -9]
        });
        const marker = L.marker(latLng, { icon: icon });
        marker.bindPopup(popupContent);
        marker.addTo(markersLayer);
        return marker;
    }
    
    function addEndMarker(latLng, popupContent) {
        const icon = L.divIcon({
            className: 'custom-div-icon',
            html: '<div class="custom-marker-end"></div>',
            iconSize: [18, 18],
            popupAnchor: [0, -9]
        });
        const marker = L.marker(latLng, { icon: icon });
        marker.bindPopup(popupContent);
        marker.addTo(markersLayer);
        return marker;
    }
    
    function addWaypointMarker(latLng, tooltipText, options = {}) {
        const circleMarker = L.circleMarker(latLng, {
            radius: options.radius || 4,
            color: options.color || '#ff6600',
            fillColor: options.fillColor || '#ffaa00',
            fillOpacity: options.fillOpacity || 0.8,
            weight: options.weight || 2
        });
        
        if (tooltipText) {
            circleMarker.bindTooltip(tooltipText, { sticky: true });
        }
        
        circleMarker.addTo(markersLayer);
        return circleMarker;
    }
    
    // 添加图片叠加层（返回包含图片和边框的对象）
    function addImageOverlay(imageUrl, bounds, options = {}) {
        const imageOverlay = L.imageOverlay(imageUrl, bounds, {
            opacity: options.opacity || 0.7,
            interactive: options.interactive || true,
            className: 'jeppesen-overlay'
        });
        imageOverlay.addTo(map);
        
        let boundsRect = null;
        if (options.showBounds !== false) {
            boundsRect = L.rectangle(bounds, {
                color: '#ff6600',
                weight: 2,
                opacity: 0.8,
                fillOpacity: 0,
                dashArray: '5, 5'
            }).addTo(map);
        }
        
        // 返回一个包含图片和边框的对象
        return {
            imageOverlay: imageOverlay,
            boundsRect: boundsRect
        };
    }
    
    // 移除图片叠加层（同时移除图片和边框）
    function removeImageOverlay(overlay) {
        if (overlay) {
            if (overlay.imageOverlay) {
                map.removeLayer(overlay.imageOverlay);
            }
            if (overlay.boundsRect) {
                map.removeLayer(overlay.boundsRect);
            }
        }
    }
       
    // 将轨迹和标记置顶
function bringTrackToFront() {
    if (trackLayer) {
        map.removeLayer(trackLayer);
        map.addLayer(trackLayer);
    }
    if (markersLayer) {
        map.removeLayer(markersLayer);
        map.addLayer(markersLayer);
    }
}
    
    return {
        init: init,
        getMap: getMap,
        getTrackLayer: getTrackLayer,
        getMarkersLayer: getMarkersLayer,
        clearAll: clearAll,
        fitBounds: fitBounds,
        resetView: resetView,
        switchBaseMap: switchBaseMap,
        addTrackLine: addTrackLine,
        addStartMarker: addStartMarker,
        addEndMarker: addEndMarker,
        addWaypointMarker: addWaypointMarker,
        addImageOverlay: addImageOverlay,
        removeImageOverlay: removeImageOverlay,
        bringTrackToFront: bringTrackToFront
    };
})();