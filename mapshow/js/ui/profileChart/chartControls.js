/**
 * 图表控制模块（时间范围筛选、轨迹分段着色）
 */

const ChartControls = (function() {
    let allPoints = [];
    let filteredPoints = [];
    let onDataChange = null;
    let onSegmentColorApply = null;
    
    function init(allData, onDataChangeCallback, onSegmentColorCallback) {
        allPoints = allData;
        filteredPoints = [...allData];
        onDataChange = onDataChangeCallback;
        onSegmentColorApply = onSegmentColorCallback;
    }
    
    function setAllPoints(points) {
        allPoints = points;
        filteredPoints = [...points];
        if (onDataChange) onDataChange(filteredPoints);
    }
    
    function getFilteredPoints() {
        return filteredPoints;
    }
    
    function timeToSeconds(timeStr) {
        const parts = timeStr.split(':');
        if (parts.length === 3) {
            return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
        }
        return 0;
    }
    
    function applyTimeRange(startTime, endTime) {
        const startSec = timeToSeconds(startTime);
        const endSec = timeToSeconds(endTime);
        
        if (isNaN(startSec) || isNaN(endSec)) return false;
        if (startSec > endSec) return false;
        
        filteredPoints = allPoints.filter(p => {
            const pSec = timeToSeconds(p.time);
            return pSec >= startSec && pSec <= endSec;
        });
        
        if (onDataChange) onDataChange(filteredPoints);
        return filteredPoints.length > 0;
    }
    
    function resetTimeRange() {
        filteredPoints = [...allPoints];
        if (onDataChange) onDataChange(filteredPoints);
        return filteredPoints.length;
    }
    
    function applySegmentColor(color) {
        if (onSegmentColorApply && filteredPoints.length > 0) {
            onSegmentColorApply(filteredPoints, color);
        }
    }
    
    return {
        init: init,
        setAllPoints: setAllPoints,
        getFilteredPoints: getFilteredPoints,
        applyTimeRange: applyTimeRange,
        resetTimeRange: resetTimeRange,
        applySegmentColor: applySegmentColor,
        timeToSeconds: timeToSeconds
    };
})();