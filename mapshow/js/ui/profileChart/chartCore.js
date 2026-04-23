/**
 * 图表核心绘制模块
 */

const ChartCore = (function() {
    let chartData = [];
    let CHART_HEIGHT = 200;
    let CHART_PADDING = { top: 15, right: 30, bottom: 20, left: 40 };
    
    function setData(data) {
        chartData = data;
    }
    
    function getData() {
        return chartData;
    }
    
    function setHeight(height) {
        CHART_HEIGHT = height;
    }
    
    function getHeight() {
        return CHART_HEIGHT;
    }
    
    function getPadding() {
        return CHART_PADDING;
    }
    
    function draw(canvasId) {
        const canvas = document.getElementById(canvasId);
        if (!canvas || chartData.length < 2) return;
        
        const container = document.getElementById('profile-chart-container');
        const width = container ? container.clientWidth - 20 : 800;
        canvas.width = width;
        canvas.height = CHART_HEIGHT;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        const altitudes = chartData.map(d => d.params.altitude);
        const minAlt = Math.min(...altitudes);
        const maxAlt = Math.max(...altitudes);
        const altRange = maxAlt - minAlt;
        
        const plotWidth = canvas.width - CHART_PADDING.left - CHART_PADDING.right;
        const plotHeight = canvas.height - CHART_PADDING.top - CHART_PADDING.bottom;
        
        ctx.save();
        ctx.strokeStyle = '#444';
        ctx.fillStyle = '#aaa';
        ctx.font = '10px monospace';
        ctx.lineWidth = 0.5;
        
        // 水平网格线
        for (let i = 0; i <= 4; i++) {
            const y = CHART_PADDING.top + (i / 4) * plotHeight;
            const alt = maxAlt - (i / 4) * altRange;
            ctx.beginPath();
            ctx.moveTo(CHART_PADDING.left, y);
            ctx.lineTo(canvas.width - CHART_PADDING.right, y);
            ctx.stroke();
            ctx.fillStyle = '#888';
            ctx.fillText(Math.round(alt) + ' ft', 5, y - 2);
        }
        
        // 垂直网格线
        const timeCount = Math.min(8, chartData.length);
        for (let i = 0; i <= timeCount; i++) {
            const idx = Math.floor((i / timeCount) * (chartData.length - 1));
            const x = CHART_PADDING.left + (idx / (chartData.length - 1)) * plotWidth;
            ctx.beginPath();
            ctx.moveTo(x, CHART_PADDING.top);
            ctx.lineTo(x, canvas.height - CHART_PADDING.bottom);
            ctx.stroke();
            ctx.fillStyle = '#888';
            ctx.fillText(chartData[idx].time, x - 20, canvas.height - CHART_PADDING.bottom + 12);
        }
        
        // 绘制曲线
        ctx.beginPath();
        ctx.strokeStyle = '#ff9800';
        ctx.lineWidth = 2;
        
        for (let i = 0; i < chartData.length; i++) {
            const x = CHART_PADDING.left + (i / (chartData.length - 1)) * plotWidth;
            const y = CHART_PADDING.top + plotHeight - ((chartData[i].params.altitude - minAlt) / altRange) * plotHeight;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
        
        // 绘制数据点
        ctx.fillStyle = '#ff9800';
        for (let i = 0; i < chartData.length; i += Math.max(1, Math.floor(chartData.length / 100))) {
            const x = CHART_PADDING.left + (i / (chartData.length - 1)) * plotWidth;
            const y = CHART_PADDING.top + plotHeight - ((chartData[i].params.altitude - minAlt) / altRange) * plotHeight;
            ctx.beginPath();
            ctx.arc(x, y, 2, 0, Math.PI * 2);
            ctx.fill();
        }
        
        ctx.restore();
    }
    
    function getPointAtPixel(mouseX, canvasWidth) {
        if (chartData.length < 2) return null;
        
        const plotWidth = canvasWidth - CHART_PADDING.left - CHART_PADDING.right;
        if (mouseX < CHART_PADDING.left || mouseX > canvasWidth - CHART_PADDING.right) return null;
        
        const ratio = (mouseX - CHART_PADDING.left) / plotWidth;
        const index = Math.round(ratio * (chartData.length - 1));
        if (index < 0 || index >= chartData.length) return null;
        
        return chartData[index];
    }
    
    return {
        setData: setData,
        getData: getData,
        setHeight: setHeight,
        getHeight: getHeight,
        getPadding: getPadding,
        draw: draw,
        getPointAtPixel: getPointAtPixel
    };
})();