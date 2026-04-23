/**
 * 文件名解析模块
 * 解析航图文件名中的坐标（度分格式）
 * 格式: 左上纬度-左上经度-右下纬度-右下经度_描述.jpg
 * 例如: 20.30-72.10-18.50-74.00_孟买.jpg
 * 说明: 20.30 表示 20°30'，直接使用，不需要转换
 */

const FileParser = (function() {
    
    /**
     * 解析文件名中的坐标（度分格式）
     * @param {string} filename - 文件名
     * @returns {object|null} 解析后的坐标对象（度分格式原始值）
     */
    function parseFilenameForBounds(filename) {
        if (!filename) return null;
        
        // 去掉扩展名，并去掉下划线后面的描述部分
        let nameWithoutExt = filename.replace(/\.(jpg|jpeg|png|webp)$/i, '');
        // 如果包含下划线，只取下划线前面的部分
        if (nameWithoutExt.includes('_')) {
            nameWithoutExt = nameWithoutExt.split('_')[0];
        }
        
        const parts = nameWithoutExt.split('-');
        
        if (parts.length === 4) {
            const topLat = parseFloat(parts[0]);
            const topLng = parseFloat(parts[1]);
            const bottomLat = parseFloat(parts[2]);
            const bottomLng = parseFloat(parts[3]);
            
            if (!isNaN(topLat) && !isNaN(topLng) && !isNaN(bottomLat) && !isNaN(bottomLng)) {
                return {
                    topLeft: { lat: topLat, lng: topLng },
                    bottomRight: { lat: bottomLat, lng: bottomLng },
                    bounds: [
                        [Math.min(topLat, bottomLat), Math.min(topLng, bottomLng)],
                        [Math.max(topLat, bottomLat), Math.max(topLng, bottomLng)]
                    ]
                };
            }
        }
        return null;
    }
    
    return {
        parseFilenameForBounds: parseFilenameForBounds
    };
})();