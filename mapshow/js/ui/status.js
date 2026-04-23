/**
 * 状态栏模块
 * 管理页面底部的状态提示和信息栏
 */

const StatusBar = (function() {
    let statusDiv = null;
    let infoDiv = null;
    let updateStatusCallback = null;
    
    function init(statusElementId, infoElementId) {
        statusDiv = document.getElementById(statusElementId);
        infoDiv = document.getElementById(infoElementId);
    }
    
    function setStatusCallback(callback) {
        updateStatusCallback = callback;
    }
    
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
    
    // 更新信息栏 - 只显示航点数量和时间范围
    function updateInfo(points) {
        if (!infoDiv) return;
        
        if (!points || points.length === 0) {
            infoDiv.innerHTML = '📊 无数据';
            return;
        }
        
        const startTime = points[0].time;
        const endTime = points[points.length - 1].time;
        
        infoDiv.innerHTML = `📊 航点: ${points.length}个 | 时间范围: ${startTime} → ${endTime}`;
    }
    
    return {
        init: init,
        setStatusCallback: setStatusCallback,
        updateStatus: updateStatus,
        updateInfo: updateInfo
    };
})();