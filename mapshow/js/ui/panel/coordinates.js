/**
 * 坐标转换和编辑弹窗模块
 */

const Coordinates = (function() {
    
    // 度分格式转十进制度数（用于地图显示）
    // 例如：20.30 -> 20 + 30/60 = 20.5
    function degMinToDecimal(degMin) {
        const degrees = Math.floor(degMin);
        const minutes = (degMin - degrees) * 100;
        return degrees + minutes / 60;
    }
    
    // 十进制度数转度分格式（用于显示）
    // 例如：20.5 -> 20.30
    function decimalToDegMin(decimal) {
        const degrees = Math.floor(decimal);
        const minutes = (decimal - degrees) * 60;
        return degrees + minutes / 100;
    }
    
    // 显示编辑弹窗
    function showEditDialog(item, currentBounds, onSave, updateStatusFn) {
        // bounds 格式: [[南纬, 西经], [北纬, 东经]]
        const topLatDecimal = currentBounds[1][0];
        const topLngDecimal = currentBounds[0][1];
        const bottomLatDecimal = currentBounds[0][0];
        const bottomLngDecimal = currentBounds[1][1];
        
        const topLat = decimalToDegMin(topLatDecimal).toFixed(2);
        const topLng = decimalToDegMin(topLngDecimal).toFixed(2);
        const bottomLat = decimalToDegMin(bottomLatDecimal).toFixed(2);
        const bottomLng = decimalToDegMin(bottomLngDecimal).toFixed(2);
        
        const overlay = document.createElement('div');
        overlay.className = 'edit-dialog-overlay';
        overlay.innerHTML = `
            <div class="edit-dialog">
                <h4>编辑航图坐标: ${item.file.name.substring(0, 30)}</h4>
                <div class="coord-row">
                    <span>左上角:</span>
                    <input type="text" id="editTopLat" value="${topLat}" placeholder="纬度 例: 20.30">
                    <input type="text" id="editTopLng" value="${topLng}" placeholder="经度 例: 72.10">
                </div>
                <div class="coord-row">
                    <span>右下角:</span>
                    <input type="text" id="editBottomLat" value="${bottomLat}" placeholder="纬度 例: 18.50">
                    <input type="text" id="editBottomLng" value="${bottomLng}" placeholder="经度 例: 74.00">
                </div>
                <div class="hint">💡 格式：度分制（如 20.30 表示 20°30'）</div>
                <div class="edit-dialog-buttons">
                    <button class="save-btn">💾 保存</button>
                    <button class="cancel-btn">取消</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        
        const saveBtn = overlay.querySelector('.save-btn');
        const cancelBtn = overlay.querySelector('.cancel-btn');
        
        saveBtn.addEventListener('click', () => {
            const topLatDegMin = parseFloat(overlay.querySelector('#editTopLat').value);
            const topLngDegMin = parseFloat(overlay.querySelector('#editTopLng').value);
            const bottomLatDegMin = parseFloat(overlay.querySelector('#editBottomLat').value);
            const bottomLngDegMin = parseFloat(overlay.querySelector('#editBottomLng').value);
            
            if (isNaN(topLatDegMin) || isNaN(topLngDegMin) || isNaN(bottomLatDegMin) || isNaN(bottomLngDegMin)) {
                if (updateStatusFn) updateStatusFn('❌ 坐标格式错误', true);
                alert('请输入有效的经纬度坐标（度分格式，如 20.30）');
                return;
            }
            
            const topLat = degMinToDecimal(topLatDegMin);
            const topLng = degMinToDecimal(topLngDegMin);
            const bottomLat = degMinToDecimal(bottomLatDegMin);
            const bottomLng = degMinToDecimal(bottomLngDegMin);
            
            const newBounds = [
                [Math.min(topLat, bottomLat), Math.min(topLng, bottomLng)],
                [Math.max(topLat, bottomLat), Math.max(topLng, bottomLng)]
            ];
            
            onSave(newBounds);
            document.body.removeChild(overlay);
        });
        
        cancelBtn.addEventListener('click', () => {
            document.body.removeChild(overlay);
        });
        
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                document.body.removeChild(overlay);
            }
        });
    }
    
    // 从度分格式输入框获取十进制边界
    function getDecimalBoundsFromInput() {
        const topLatDegMin = parseFloat(document.getElementById('topLeftLat').value);
        const topLngDegMin = parseFloat(document.getElementById('topLeftLng').value);
        const bottomLatDegMin = parseFloat(document.getElementById('bottomRightLat').value);
        const bottomLngDegMin = parseFloat(document.getElementById('bottomRightLng').value);
        
        if (isNaN(topLatDegMin) || isNaN(topLngDegMin) || isNaN(bottomLatDegMin) || isNaN(bottomLngDegMin)) {
            return null;
        }
        
        const topLat = degMinToDecimal(topLatDegMin);
        const topLng = degMinToDecimal(topLngDegMin);
        const bottomLat = degMinToDecimal(bottomLatDegMin);
        const bottomLng = degMinToDecimal(bottomLngDegMin);
        
        return [
            [Math.min(topLat, bottomLat), Math.min(topLng, bottomLng)],
            [Math.max(topLat, bottomLat), Math.max(topLng, bottomLng)]
        ];
    }
    
    // 设置输入框的值（度分格式）
    function setInputValues(topLat, topLng, bottomLat, bottomLng) {
        document.getElementById('topLeftLat').value = topLat.toFixed(2);
        document.getElementById('topLeftLng').value = topLng.toFixed(2);
        document.getElementById('bottomRightLat').value = bottomLat.toFixed(2);
        document.getElementById('bottomRightLng').value = bottomLng.toFixed(2);
    }
    
    return {
        degMinToDecimal: degMinToDecimal,
        decimalToDegMin: decimalToDegMin,
        showEditDialog: showEditDialog,
        getDecimalBoundsFromInput: getDecimalBoundsFromInput,
        setInputValues: setInputValues
    };
})();