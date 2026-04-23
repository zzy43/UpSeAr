/**
 * 数据解析模块
 * 支持 Excel (.xlsx) 和 CSV (.csv) 文件
 */

const DataParser = (function() {
    
    // Excel时间数字转时间字符串
    function excelTimeToTimeString(excelTime) {
        if (typeof excelTime === 'number' && !isNaN(excelTime)) {
            const totalSeconds = Math.floor(excelTime * 24 * 3600);
            const hours = Math.floor(totalSeconds / 3600);
            const minutes = Math.floor((totalSeconds % 3600) / 60);
            const seconds = totalSeconds % 60;
            return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
        return String(excelTime).trim();
    }
    
    // 度格式转换（直接返回数值）
    function convertDD(coordStr) {
        if (!coordStr || typeof coordStr !== 'string') return null;
        
        coordStr = coordStr.trim().toUpperCase();
        if (coordStr.length === 0) return null;
        
        let direction = coordStr.charAt(0);
        let numPart = coordStr.substring(1);
        
        if (!['N', 'S', 'E', 'W'].includes(direction)) {
            direction = null;
            numPart = coordStr;
        }
        
        let decimalDeg = parseFloat(numPart);
        if (isNaN(decimalDeg)) return null;
        
        if (direction === 'S' || direction === 'W') {
            decimalDeg = -decimalDeg;
        }
        
        return decimalDeg;
    }
    
    // 解析 CSV 数据
    function parseCSVData(csvText) {
        const lines = csvText.split(/\r?\n/);
        if (lines.length < 2) {
            throw new Error("CSV 数据为空或格式不正确");
        }
        
        // 解析表头
        const header = lines[0].split(/[,\t]/).map(h => h.replace(/["']/g, '').trim().toLowerCase());
        
        // 查找列索引
        let timeColIdx = -1, lonColIdx = -1, latColIdx = -1;
        let altColIdx = -1, flapColIdx = -1, iasColIdx = -1;
        let ivvColIdx = -1, windDirColIdx = -1, windSpdColIdx = -1;
        
        for (let i = 0; i < header.length; i++) {
            const colName = header[i];
            if (colName.includes('recorded') || colName.includes('时间') || colName === 'recorded time' || colName === 'time') {
                timeColIdx = i;
            } else if (colName.includes('lon') || colName.includes('经度') || colName === 'lonp' || colName === 'longitude') {
                lonColIdx = i;
            } else if (colName.includes('lat') || colName.includes('纬度') || colName === 'latp' || colName === 'latitude') {
                latColIdx = i;
            } else if (colName.includes('alt') || colName === 'alt_qnh') {
                altColIdx = i;
            } else if (colName.includes('flap') || colName === 'flapc') {
                flapColIdx = i;
            } else if (colName.includes('ias') || colName === 'ias_c') {
                iasColIdx = i;
            } else if (colName.includes('ivv') || colName === 'ivv') {
                ivvColIdx = i;
            } else if (colName.includes('win_dir') || colName === 'win_dir') {
                windDirColIdx = i;
            } else if (colName.includes('win_spd') || colName === 'win_spd') {
                windSpdColIdx = i;
            }
        }
        
        // 如果没找到经纬度列，尝试根据第一行数据自动判断
        if (lonColIdx === -1 || latColIdx === -1) {
            const sampleLine = lines[1];
            if (sampleLine) {
                const sampleRow = sampleLine.split(/[,\t]/);
                for (let i = 0; i < sampleRow.length; i++) {
                    const val = String(sampleRow[i]).toUpperCase().replace(/["']/g, '');
                    if (val.startsWith('E') || val.startsWith('W')) {
                        lonColIdx = i;
                    } else if (val.startsWith('N') || val.startsWith('S')) {
                        latColIdx = i;
                    }
                }
            }
        }
        
        console.log(`CSV列索引: 时间=${timeColIdx}, 经度=${lonColIdx}, 纬度=${latColIdx}`);
        console.log(`参数列: 高度=${altColIdx}, 襟翼=${flapColIdx}, 表速=${iasColIdx}, 垂直速度=${ivvColIdx}, 风向=${windDirColIdx}, 风速=${windSpdColIdx}`);
        
        let points = [];
        let lastValidTime = "";
        
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line === "") continue;
            
            // 处理 CSV 中的引号
            let row = line.split(/[,\t]/);
            row = row.map(cell => cell.replace(/["']/g, '').trim());
            
            // 获取时间
            let timeStr = "";
            if (timeColIdx !== -1 && row[timeColIdx]) {
                timeStr = row[timeColIdx];
                lastValidTime = timeStr;
            } else {
                timeStr = lastValidTime;
            }
            
            // 获取经纬度
            let lonRaw = lonColIdx !== -1 ? row[lonColIdx] : "";
            let latRaw = latColIdx !== -1 ? row[latColIdx] : "";
            
            if (lonRaw === "" || latRaw === "") continue;
            
            let lon = convertDD(lonRaw);
            let lat = convertDD(latRaw);
            
            if (lon === null || lat === null || isNaN(lon) || isNaN(lat)) continue;
            
            // 解析飞行参数
            let params = {};
            if (altColIdx !== -1 && row[altColIdx]) {
                params.altitude = parseFloat(row[altColIdx]);
            }
            if (flapColIdx !== -1 && row[flapColIdx]) {
                params.flap = parseFloat(row[flapColIdx]);
            }
            if (iasColIdx !== -1 && row[iasColIdx]) {
                params.ias = parseFloat(row[iasColIdx]);
            }
            if (ivvColIdx !== -1 && row[ivvColIdx]) {
                params.vspeed = parseFloat(row[ivvColIdx]);
            }
            if (windDirColIdx !== -1 && row[windDirColIdx]) {
                params.windDir = parseFloat(row[windDirColIdx]);
            }
            if (windSpdColIdx !== -1 && row[windSpdColIdx]) {
                params.windSpd = parseFloat(row[windSpdColIdx]);
            }
            
            points.push({
                time: timeStr,
                lon: lon,
                lat: lat,
                rawLon: lonRaw,
                rawLat: latRaw,
                params: params
            });
        }
        
        if (points.length < 2) {
            throw new Error("有效航点不足2个，请检查 CSV 格式");
        }
        
        console.log('CSV解析完成，共', points.length, '个点');
        console.log('第一个点:', points[0]);
        
        return points;
    }
    
    // 解析 Excel 数据
    function parseExcelData(data) {
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: "" });
        
        if (!rows || rows.length < 2) {
            throw new Error("数据为空或格式不正确");
        }
        
        const header = rows[0];
        let timeColIdx = -1, lonColIdx = -1, latColIdx = -1;
        let altColIdx = -1, flapColIdx = -1, iasColIdx = -1;
        let ivvColIdx = -1, windDirColIdx = -1, windSpdColIdx = -1;
        
        for (let i = 0; i < header.length; i++) {
            const colName = String(header[i]).toLowerCase();
            if (colName.includes('recorded') || colName.includes('时间')) {
                timeColIdx = i;
            } else if (colName.includes('lon') || colName.includes('经度')) {
                lonColIdx = i;
            } else if (colName.includes('lat') || colName.includes('纬度')) {
                latColIdx = i;
            } else if (colName.includes('alt') || colName === 'alt_qnh') {
                altColIdx = i;
            } else if (colName.includes('flap') || colName === 'flapc') {
                flapColIdx = i;
            } else if (colName.includes('ias') || colName === 'ias_c') {
                iasColIdx = i;
            } else if (colName.includes('ivv') || colName === 'ivv') {
                ivvColIdx = i;
            } else if (colName.includes('win_dir') || colName === 'win_dir') {
                windDirColIdx = i;
            } else if (colName.includes('win_spd') || colName === 'win_spd') {
                windSpdColIdx = i;
            }
        }
        
        // 如果没找到经纬度列，根据第一行数据自动判断
        if (lonColIdx === -1 || latColIdx === -1) {
            const sampleRow = rows[1];
            for (let i = 0; i < sampleRow.length; i++) {
                const val = String(sampleRow[i]).toUpperCase();
                if (val.startsWith('E') || val.startsWith('W')) {
                    lonColIdx = i;
                } else if (val.startsWith('N') || val.startsWith('S')) {
                    latColIdx = i;
                }
            }
        }
        
        console.log(`Excel列索引: 时间=${timeColIdx}, 经度=${lonColIdx}, 纬度=${latColIdx}`);
        console.log(`参数列: 高度=${altColIdx}, 襟翼=${flapColIdx}, 表速=${iasColIdx}, 垂直速度=${ivvColIdx}, 风向=${windDirColIdx}, 风速=${windSpdColIdx}`);
        
        let points = [];
        let lastValidTime = "";
        
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length === 0) continue;
            
            let timeVal = row[timeColIdx];
            let timeStr = "";
            
            if (timeVal && timeVal !== "") {
                timeStr = excelTimeToTimeString(timeVal);
                lastValidTime = timeStr;
            } else {
                timeStr = lastValidTime;
            }
            
            let lonRaw = lonColIdx !== -1 && row[lonColIdx] ? String(row[lonColIdx]).trim() : "";
            let latRaw = latColIdx !== -1 && row[latColIdx] ? String(row[latColIdx]).trim() : "";
            
            if (lonRaw === "" || latRaw === "") continue;
            
            let lon = convertDD(lonRaw);
            let lat = convertDD(latRaw);
            
            if (lon === null || lat === null || isNaN(lon) || isNaN(lat)) continue;
            
            // 解析飞行参数
            let params = {};
            if (altColIdx !== -1 && row[altColIdx]) {
                params.altitude = parseFloat(row[altColIdx]);
            }
            if (flapColIdx !== -1 && row[flapColIdx]) {
                params.flap = parseFloat(row[flapColIdx]);
            }
            if (iasColIdx !== -1 && row[iasColIdx]) {
                params.ias = parseFloat(row[iasColIdx]);
            }
            if (ivvColIdx !== -1 && row[ivvColIdx]) {
                params.vspeed = parseFloat(row[ivvColIdx]);
            }
            if (windDirColIdx !== -1 && row[windDirColIdx]) {
                params.windDir = parseFloat(row[windDirColIdx]);
            }
            if (windSpdColIdx !== -1 && row[windSpdColIdx]) {
                params.windSpd = parseFloat(row[windSpdColIdx]);
            }
            
            points.push({
                time: timeStr,
                lon: lon,
                lat: lat,
                rawLon: lonRaw,
                rawLat: latRaw,
                params: params
            });
        }
        
        if (points.length < 2) {
            throw new Error("有效航点不足2个");
        }
        
        console.log('Excel解析完成，共', points.length, '个点');
        console.log('第一个点:', points[0]);
        
        return points;
    }
    
    // 生成示例数据
    function generateDemoData() {
        const points = [];
        const startLon = 73.8968;
        const startLat = 19.4286;
        const endLon = 72.8573;
        const endLat = 19.0887;
        
        const numPoints = 100;
        
        for (let i = 0; i < numPoints; i++) {
            const t = i / (numPoints - 1);
            const lon = startLon - (startLon - endLon) * t;
            const lat = startLat - (startLat - endLat) * t;
            
            const hour = 5;
            const minute = 32 + Math.floor(i / 60);
            const second = 44 + (i % 60);
            
            points.push({
                time: `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:${second.toString().padStart(2, '0')}`,
                lon: lon,
                lat: lat,
                rawLon: `E${lon.toFixed(4)}`,
                rawLat: `N${lat.toFixed(4)}`,
                params: {}
            });
        }
        
        return points;
    }
    
    return {
        parseExcelData: parseExcelData,
        parseCSVData: parseCSVData,
        generateDemoData: generateDemoData,
        convertDD: convertDD
    };
})();