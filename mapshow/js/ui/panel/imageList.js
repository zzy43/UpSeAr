/**
 * 航图列表管理模块
 */

const ImageList = (function() {
    let imageOverlays = [];
    let nextId = 1;
    let updateStatusFn = null;
    let onImageUpdate = null;
    
    function init(statusFn, onUpdate) {
        updateStatusFn = statusFn;
        onImageUpdate = onUpdate;
    }
    
    function getAll() {
        return imageOverlays;
    }
    
    function add(file, bounds, opacity, overlayObj) {
        const id = nextId++;
        imageOverlays.push({
            id: id,
            file: file,
            overlay: overlayObj,
            opacity: opacity,
            bounds: bounds
        });
        if (onImageUpdate) onImageUpdate();
        return id;
    }
    
    function remove(id) {
        const index = imageOverlays.findIndex(item => item.id === id);
        if (index !== -1) {
            imageOverlays.splice(index, 1);
            if (onImageUpdate) onImageUpdate();
            return true;
        }
        return false;
    }
    
    function clearAll() {
        imageOverlays = [];
        if (onImageUpdate) onImageUpdate();
    }
    
    function updateBounds(id, newBounds) {
        const item = imageOverlays.find(i => i.id === id);
        if (item) {
            item.bounds = newBounds;
            if (onImageUpdate) onImageUpdate();
            return item;
        }
        return null;
    }
    
    // 修复：更新透明度时不触发重新渲染
    function updateOpacity(id, opacity) {
        const item = imageOverlays.find(i => i.id === id);
        if (item) {
            item.opacity = opacity;
            // 删除这行：if (onImageUpdate) onImageUpdate();
            return item;
        }
        return null;
    }
    
    function getBoundsDisplay(bounds) {
        const topLat = Coordinates.decimalToDegMin(bounds[1][0]).toFixed(2);
        const topLng = Coordinates.decimalToDegMin(bounds[0][1]).toFixed(2);
        const bottomLat = Coordinates.decimalToDegMin(bounds[0][0]).toFixed(2);
        const bottomLng = Coordinates.decimalToDegMin(bounds[1][1]).toFixed(2);
        return { topLat, topLng, bottomLat, bottomLng };
    }
    
    return {
        init: init,
        getAll: getAll,
        add: add,
        remove: remove,
        clearAll: clearAll,
        updateBounds: updateBounds,
        updateOpacity: updateOpacity,
        getBoundsDisplay: getBoundsDisplay
    };
})();