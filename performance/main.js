// ---------- 全局变量 ----------
let currentAircraft = null;
let currentAirport = 'ZSHC';
let currentRunway = '22';
let currentAC = 'auto';
let currentAntiIce = 'off';
let currentSurface = 'dry';
let currentWeight = null;
let currentWind = '';
let currentOAT = null;
let currentQNH = null;
let currentImprovedClimb = 'off'; // 新增：改进爬升状态

// 防冰修正常量
const ANTI_ICE_CLIMB_REDUCTION = 27;
const ANTI_ICE_FIELD_REDUCTION = 18;

// 数据存储
let airportData = null;

// ---------- DOM 元素 ----------
const aircraftSelect = document.getElementById('aircraftSelect');
const aircraftDisplay = document.getElementById('aircraftDisplay');
const airportSelect = document.getElementById('airportSelect');
const airportTitle = document.getElementById('airportTitle');
const airportDisplay = document.getElementById('airportDisplay');
const runwayGroup = document.getElementById('runwayGroup');
const runwayDisplay = document.getElementById('runwayDisplay');
const acDisplay = document.getElementById('acDisplay');
const antiIceDisplay = document.getElementById('antiIceDisplay');
const surfaceDisplay = document.getElementById('surfaceDisplay');
const weightDisplay = document.getElementById('weightDisplay');
const windDisplay = document.getElementById('windDisplay');
const matchStatus = document.getElementById('matchStatus');
const weightInput = document.getElementById('weightInput');
const windSelect = document.getElementById('windSelect');
const currentTempInput = document.getElementById('currentTempInput');
const tempDisplay = document.getElementById('tempDisplay');
const tableContainer = document.getElementById('tableContainer');
const dataStatus = document.getElementById('dataStatus');
const wetLegend = document.getElementById('wetLegend');
const qnhInput = document.getElementById('qnhInput');
const qnhDisplay = document.getElementById('qnhDisplay');
const improvedClimbDisplay = document.getElementById('improvedClimbDisplay');
const maxTakeoffWeightDisplay = document.getElementById('maxTakeoffWeightDisplay');
const airportElevationDisplay = document.getElementById('airportElevationDisplay');
const minFlapRetractDisplay = document.getElementById('minFlapRetractDisplay');
const engineOutProcedureDisplay = document.getElementById('engineOutProcedureDisplay');

// ---------- 辅助函数 ----------
function parseTempValue(tempStr) {
    if (!tempStr) return 0;
    return parseInt(tempStr.toString().replace('A', ''), 10);
}

// 提取限制重量 - 支持*、**、T、F、B、V
function extractLimitWeight(cell) {
    if (!cell) return null;
    
    // 先匹配改进爬升限制格式：数字+**/ 例如 807**/
    let match = cell.match(/^(\d+)\*\*\//);
    if (match) {
        return parseInt(match[1], 10);
    }
    
    // 再匹配普通限制格式：数字+[*TFBV]?/ 例如 807*/、807T/、807F/等
    match = cell.match(/^(\d+)[*TFBV]?\//);
    return match ? parseInt(match[1], 10) : null;
}

// 获取限制类型 - T/F/B/V/*/**
function getLimitType(cell) {
    if (!cell) return null;
    
    // 检查是否为改进爬升限制（**）
    if (cell.includes('**')) {
        return '改进爬升';
    }
    
    // 检查普通限制类型
    let match = cell.match(/^\d+([*TFBV])?\//);
    if (!match) return null;
    if (!match[1]) return null;
    
    const type = match[1];
    if (type === '*') return '越障';
    if (type === 'T') return '轮胎速度';
    if (type === 'F') return '场地长度';
    if (type === 'B') return '刹车能量';
    if (type === 'V') return 'VMCG';
    return null;
}

// 判断是否为改进爬升限制（**）
function isImprovedClimbLimit(cell) {
    if (!cell) return false;
    return cell.includes('**');
}

// 判断是否为场地长度限制（F）
function isFieldLengthLimit(cell) {
    if (!cell) return false;
    return cell.includes('F/');
}

// 计算防冰修正后的爬升限制
function getAdjustedClimb(originalClimb) {
    if (currentAntiIce === 'on') {
        return originalClimb - ANTI_ICE_CLIMB_REDUCTION;
    }
    return originalClimb;
}

// 计算防冰修正后的限制重量 - 只有F类型才修正，其他类型返回原始值
function getAdjustedLimitWeight(cell, originalLimitWeight) {
    if (!cell || originalLimitWeight === null) return originalLimitWeight;
    
    if (currentAntiIce === 'on' && isFieldLengthLimit(cell)) {
        return originalLimitWeight - ANTI_ICE_FIELD_REDUCTION;
    }
    // 非F类型或防冰关闭时，返回原始限制重量
    return originalLimitWeight;
}

// 计算QNH修正重量
function calculateQNHWeight() {
    if (currentWeight === null || currentQNH === null) return null;
    
    const qnhDiff = currentQNH - 1013;
    const correction = qnhDiff * 1.5;
    const correctedWeight = currentWeight + correction;
    return {
        originalWeight: currentWeight,
        qnh: currentQNH,
        qnhDiff: qnhDiff,
        correction: correction,
        correctedWeight: Math.round(correctedWeight * 100) / 100
    };
}

// ---------- 清除已加载的数据全局变量 ----------
function clearLoadedData() {
    // 删除已定义的全局数据变量，避免新旧数据冲突
    if (typeof ZSHC_DATA !== 'undefined') {
        delete window.ZSHC_DATA;
        console.log('已清除 ZSHC_DATA');
    }
    if (typeof ZPPP_DATA !== 'undefined') {
        delete window.ZPPP_DATA;
        console.log('已清除 ZPPP_DATA');
    }
}

// ---------- 动态加载数据文件 ----------
async function loadAirportData(airportCode) {
    if (!airportCode) {
        console.error('机场代码为空');
        return null;
    }
    
    if (!currentAircraft) {
        console.error('未选择飞机');
        dataStatus.innerHTML = '⏳ 请先选择飞机';
        return null;
    }
    
    try {
        // 构建文件路径
        const climbType = currentImprovedClimb === 'on' ? 'ImprovedClimb' : 'Climb';
        const fileSuffix = currentImprovedClimb === 'on' ? 'improve' : 'climb';
        const fileName = `${airportCode.toLowerCase()}-${fileSuffix}.js`;
        const filePath = `./${currentAircraft}/${climbType}/${fileName}`;
        
        console.log('========== 数据加载调试 ==========');
        console.log('当前飞机:', currentAircraft);
        console.log('当前机场:', airportCode);
        console.log('改进爬升状态:', currentImprovedClimb);
        console.log('文件类型:', climbType);
        console.log('文件后缀:', fileSuffix);
        console.log('文件名:', fileName);
        console.log('完整路径:', filePath);
        console.log('=================================');
        
        dataStatus.innerHTML = `⏳ 加载 ${currentAircraft}/${climbType}/${airportCode} 数据...`;
        
        // 先清除旧数据
        clearLoadedData();
        
        // 动态加载脚本
        const script = document.createElement('script');
        script.src = filePath;
        
        // 返回一个Promise，等待脚本加载完成
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('加载超时'));
            }, 10000);
            
            script.onload = () => {
                clearTimeout(timeout);
                
                console.log('脚本加载成功，检查全局变量:');
                console.log('ZSHC_DATA 是否存在:', typeof ZSHC_DATA !== 'undefined');
                console.log('ZPPP_DATA 是否存在:', typeof ZPPP_DATA !== 'undefined');
                
                // 根据机场代码获取对应的全局变量
                let data = null;
                if (airportCode === 'ZSHC' && typeof ZSHC_DATA !== 'undefined') {
                    data = ZSHC_DATA;
                    console.log('✅ 成功加载 ZSHC 改进爬升数据');
                    console.log('数据内容:', data);
                    
                    // 验证是否真的是改进爬升数据
                    const runway22 = data.runways.find(r => r.id === '22');
                    if (runway22) {
                        const dryAuto = runway22.conditions.find(c => 
                            c.surface === 'dry' && c.aircon === 'auto'
                        );
                        if (dryAuto) {
                            console.log('干跑道-空调AUTO 第一行数据:', dryAuto.rows[0]);
                        }
                    }
                    
                } else if (airportCode === 'ZPPP' && typeof ZPPP_DATA !== 'undefined') {
                    data = ZPPP_DATA;
                    console.log('✅ 成功加载 ZPPP 改进爬升数据');
                }
                
                if (data) {
                    console.log(`✅ 成功加载: ${airportCode} 数据`);
                    dataStatus.innerHTML = `✅ 已加载: ${currentAircraft}/${climbType}/${airportCode}`;
                    resolve(data);
                } else {
                    reject(new Error(`无法找到 ${airportCode} 的数据，请检查文件是否存在`));
                }
                
                script.remove();
            };
            
            script.onerror = (error) => {
                clearTimeout(timeout);
                console.error('❌ 脚本加载失败:', error);
                console.error('失败路径:', filePath);
                
                const errorMsg = `加载失败: ${filePath} - 文件不存在`;
                console.error(errorMsg);
                dataStatus.innerHTML = `❌ 加载失败: ${currentAircraft}/${climbType}/${airportCode} 数据文件不存在`;
                reject(new Error(errorMsg));
                script.remove();
            };
            
            document.head.appendChild(script);
        });
        
    } catch (e) {
        console.error('加载数据失败:', e);
        dataStatus.innerHTML = `❌ 数据加载失败: ${e.message}`;
        return null;
    }
}

// 重置跑道按钮
function resetRunwayButtons() {
    if (!airportData || !airportData.runways) return;
    
    const runways = airportData.runways;
    let html = '';
    runways.forEach((runway, index) => {
        const activeClass = runway.id === currentRunway ? 'active' : (index === 0 && !currentRunway ? 'active' : '');
        html += `<button class="btn ${activeClass}" data-runway="${runway.id}">${runway.id}</button>`;
    });
    runwayGroup.innerHTML = html;
    
    if (!currentRunway) {
        currentRunway = runways[0].id;
    }
    runwayDisplay.textContent = currentRunway;
    
    document.querySelectorAll('#runwayGroup .btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('#runwayGroup .btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            currentRunway = this.dataset.runway;
            runwayDisplay.textContent = currentRunway;
            if (airportData) renderTable();
        });
    });
}

// 应用空值警告样式
function applyWarningStyle() {
    aircraftSelect.classList.toggle('empty-warning', aircraftSelect.value === '');
    weightInput.classList.toggle('empty-warning', 
        currentWeight === null || currentWeight === '' || currentWeight < 555);
    windSelect.classList.toggle('empty-warning', !currentWind);
    currentTempInput.classList.toggle('empty-warning', currentTempInput.value === '');
    qnhInput.classList.toggle('empty-warning', qnhInput.value === '');
}

// 应用湿跑道样式
function applyWetRunwayStyle() {
    const isWet = (currentSurface === 'wet');
    tableContainer.classList.toggle('wet-runway', isWet);
    wetLegend.style.display = isWet ? 'flex' : 'none';
}

// ---------- 更新机场附加信息显示 ----------
function updateAirportInfo() {
    if (!airportData) {
        // 无数据时显示 "--"
        if (maxTakeoffWeightDisplay) maxTakeoffWeightDisplay.textContent = '--';
        if (airportElevationDisplay) airportElevationDisplay.textContent = '--';
        if (minFlapRetractDisplay) minFlapRetractDisplay.textContent = '--';
        if (engineOutProcedureDisplay) engineOutProcedureDisplay.textContent = '--';
        return;
    }
    // 调试输出当前跑道和对应数据
    console.log('当前跑道:', currentRunway);
    console.log('跑道数据:', airportData.runways.find(r => r.id === currentRunway));
    // ----- 1. 机场级别属性 -----
    // 最大起飞重量
    const mtow = airportData.max_takeoff_weight;
    maxTakeoffWeightDisplay.textContent = mtow ? `${mtow} kg` : '--';

    // 机场标高
    const elev = airportData.airport_elevation;
    airportElevationDisplay.textContent = elev ?? '--';

    // ----- 2. 跑道级别属性（需要当前跑道）-----
    if (currentRunway && airportData.runways) {
        const runway = airportData.runways.find(r => r.id === currentRunway);
        if (runway) {
            // 最低收襟翼高度
            const minFlap = runway.min_flap_retract_height;
            minFlapRetractDisplay.textContent = minFlap ?? '--';

            // 单发程序
            const eop = runway.engine_out_procedure;
            engineOutProcedureDisplay.textContent = eop || '--';
        } else {
            minFlapRetractDisplay.textContent = '--';
            engineOutProcedureDisplay.textContent = '--';
        }
    } else {
        minFlapRetractDisplay.textContent = '--';
        engineOutProcedureDisplay.textContent = '--';
    }
}
// ---------- 事件监听 ----------
function initEvents() {
    // 飞机选择
    aircraftSelect.addEventListener('change', async function() {
        currentAircraft = this.value || null;
        aircraftDisplay.textContent = currentAircraft || '未选择';
        applyWarningStyle();
        
        // 当飞机改变时，重新加载当前机场的数据
        if (currentAircraft && currentAirport) {
            // 清除旧数据
            clearLoadedData();
            airportData = null;
            
            // 加载新数据
            airportData = await loadAirportData(currentAirport);
            if (airportData) {
                currentRunway = '';
                resetRunwayButtons();
                renderTable();
            } else {
                renderTable();
            }
        } else {
            renderTable();
        }
    });

    // 机场选择
    airportSelect.addEventListener('change', async function() {
        const code = this.value;
        currentAirport = code;
        
        if (!code) {
            airportTitle.textContent = '--';
            airportDisplay.textContent = '未选择';
            airportData = null;
            runwayGroup.innerHTML = '<button class="btn" disabled>请先选机场</button>';
            runwayDisplay.textContent = '--';
            dataStatus.innerHTML = '⏳ 请选择机场';
            renderTable();
            return;
        }
        
        airportTitle.textContent = code;
        airportDisplay.textContent = code;
        
        // 如果已选择飞机，则加载对应数据
        if (currentAircraft) {
            // 清除旧数据
            clearLoadedData();
            airportData = null;
            
            // 加载新数据
            airportData = await loadAirportData(code);
            if (airportData) {
                currentRunway = '';
                resetRunwayButtons();
            }
        } else {
            dataStatus.innerHTML = '⏳ 请先选择飞机';
            airportData = null;
            runwayGroup.innerHTML = '<button class="btn" disabled>请先选飞机</button>';
            runwayDisplay.textContent = '--';
        }
        
        renderTable();
    });

    // 改进爬升
    document.querySelectorAll('#improvedClimbGroup .btn').forEach(btn => {
        btn.addEventListener('click', async function() {
            document.querySelectorAll('#improvedClimbGroup .btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            currentImprovedClimb = this.dataset.improved;
            improvedClimbDisplay.textContent = currentImprovedClimb === 'on' ? 'ON' : 'OFF';
            
            // 当改进爬升状态改变时，重新加载数据
            if (currentAircraft && currentAirport) {
                // 清除旧数据
                clearLoadedData();
                airportData = null;
                
                // 加载新数据
                airportData = await loadAirportData(currentAirport);
                if (airportData) {
                    currentRunway = '';
                    resetRunwayButtons();
                    renderTable();
                }
            } else {
                renderTable();
            }
        });
    });

    // 跑道
    document.querySelectorAll('#runwayGroup .btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('#runwayGroup .btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            currentRunway = this.dataset.runway;
            runwayDisplay.textContent = currentRunway;
            if (airportData) renderTable();
        });
    });

    // 空调
    document.querySelectorAll('#acGroup .btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('#acGroup .btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            currentAC = this.dataset.ac;
            acDisplay.textContent = currentAC.toUpperCase();
            if (airportData) renderTable();
        });
    });

    // 防冰
    document.querySelectorAll('#antiIceGroup .btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('#antiIceGroup .btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            currentAntiIce = this.dataset.antiice;
            antiIceDisplay.textContent = currentAntiIce === 'on' ? 'ON' : 'OFF';
            if (airportData) renderTable();
        });
    });

    // 道面
    document.querySelectorAll('#surfaceGroup .btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('#surfaceGroup .btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            currentSurface = this.dataset.surface;
            surfaceDisplay.textContent = currentSurface === 'dry' ? '干跑道' : '湿跑道';
            applyWetRunwayStyle();
            if (airportData) renderTable();
        });
    });

    // 重量
    weightInput.addEventListener('input', function() {
        let val = this.value.trim() === '' ? null : parseFloat(this.value);
        currentWeight = (val !== null && !isNaN(val) && val > 0) ? Math.round(val * 100) / 100 : null;
        weightDisplay.textContent = currentWeight ? currentWeight.toFixed(1) + ' kg' : '未输入';
        applyWarningStyle();
        if (airportData) renderTable();
    });

    // 风速
    windSelect.addEventListener('change', function() {
        currentWind = this.value;
        windDisplay.textContent = currentWind || '未选择';
        applyWarningStyle();
        if (airportData) renderTable();
    });

    // 温度
    currentTempInput.addEventListener('input', function() {
        let val = this.value.trim() === '' ? null : parseFloat(this.value);
        currentOAT = (val !== null && !isNaN(val)) ? val : null;
        tempDisplay.textContent = (currentOAT !== null) ? currentOAT + '°C' : '未输入';
        applyWarningStyle();
        if (airportData) renderTable();
    });

    // QNH输入
    qnhInput.addEventListener('input', function() {
        let val = this.value.trim() === '' ? null : parseFloat(this.value);
        currentQNH = (val !== null && !isNaN(val) && val > 0) ? Math.round(val) : null;
        qnhDisplay.textContent = currentQNH ? currentQNH + ' hPa' : '未输入';
        applyWarningStyle();
        if (airportData) renderTable();
    });
}

// ---------- 核心渲染 ----------
function renderTable() {
    updateAirportInfo();
    applyWarningStyle();
    applyWetRunwayStyle();
    
    // 检查是否选择了飞机
    if (!currentAircraft) {
        tableContainer.innerHTML = `<div style="padding: 50px; text-align: center; color: #54738c;">✈️ 请先选择飞机</div>`;
        matchStatus.innerHTML = '⏳ 请选择飞机';
        matchStatus.className = 'info-item status-badge status-warning';
        return;
    }
    
    // 检查是否选择了机场
    if (!currentAirport) {
        tableContainer.innerHTML = `<div style="padding: 50px; text-align: center; color: #54738c;">📍 请先选择机场</div>`;
        matchStatus.innerHTML = '⏳ 请选择机场';
        matchStatus.className = 'info-item status-badge status-warning';
        return;
    }
    
    if (!airportData) {
        tableContainer.innerHTML = `<div style="padding: 50px; text-align: center; color: #54738c;">📋 正在加载数据...</div>`;
        matchStatus.innerHTML = '⏳ 正在加载数据...';
        matchStatus.className = 'info-item status-badge';
        return;
    }

    // 查找跑道
    const runway = airportData.runways.find(r => r.id === currentRunway);
    if (!runway) {
        tableContainer.innerHTML = `<div style="padding: 40px; text-align: center; color: #c7452b;">❌ 找不到跑道 ${currentRunway} 的数据</div>`;
        return;
    }

    // 查找道面+空调条件
    const condition = runway.conditions.find(c => 
        c.surface === currentSurface && 
        c.aircon === currentAC
    );
    
    if (!condition) {
        tableContainer.innerHTML = `<div style="padding: 40px; text-align: center; color: #c7452b;">❌ 找不到 ${currentSurface === 'dry' ? '干跑道' : '湿跑道'} · 空调${currentAC.toUpperCase()} 的数据</div>`;
        return;
    }

    const winds = condition.winds;
    const rows = condition.rows;

    // 当前风速列索引
    let windIndex = -1;
    if (currentWind) {
        windIndex = winds.indexOf(currentWind);
    }

    // 计算QNH修正重量
    const qnhData = calculateQNHWeight();
    const comparisonWeight = qnhData ? qnhData.correctedWeight : currentWeight;

    // ----- 高亮逻辑（改进爬升时只比较**数据，不考虑爬升限制）-----
    let highlightRowIndex = -1;
    let highlightLimitType = null;
    let highlightLimitWeight = null;
    let highlightOriginalLimitWeight = null;
    let highlightCellText = null;
    let highlightAdjustedClimb = null;
    let highlightOriginalClimb = null;
    
    if (windIndex !== -1 && comparisonWeight !== null && comparisonWeight > 0) {
        const validRows = [];
        
        rows.forEach((row, index) => {
            const cellText = row.cells[windIndex];
            const originalLimitWeight = extractLimitWeight(cellText);
            
            // 改进爬升开启时：只检查**限制，忽略爬升限制
            if (currentImprovedClimb === 'on') {
                // 只检查单元格是否包含**（改进爬升限制）
                if (isImprovedClimbLimit(cellText)) {
                    const adjustedLimitWeight = getAdjustedLimitWeight(cellText, originalLimitWeight);
                    const meetLimit = adjustedLimitWeight !== null && comparisonWeight <= adjustedLimitWeight;
                    
                    if (meetLimit) {
                        validRows.push({
                            index: index,
                            tempValue: parseTempValue(row.temp),
                            temp: row.temp,
                            originalClimb: row.climb,
                            adjustedClimb: row.climb, // 改进爬升时不考虑爬升限制，但保留值用于显示
                            cellText: cellText,
                            originalLimitWeight: originalLimitWeight,
                            adjustedLimitWeight: adjustedLimitWeight,
                            limitType: getLimitType(cellText),
                            isFieldLimit: isFieldLengthLimit(cellText),
                            isImprovedClimbLimit: true
                        });
                    }
                }
            } 
            // 改进爬升关闭时：同时检查爬升限制和各类限制（原有逻辑）
            else {
                // 应用防冰修正
                const adjustedClimb = getAdjustedClimb(row.climb);
                const adjustedLimitWeight = getAdjustedLimitWeight(cellText, originalLimitWeight);
                
                const meetClimb = comparisonWeight <= adjustedClimb;
                const meetLimit = adjustedLimitWeight !== null && comparisonWeight <= adjustedLimitWeight;
                
                if (meetClimb && meetLimit) {
                    validRows.push({
                        index: index,
                        tempValue: parseTempValue(row.temp),
                        temp: row.temp,
                        originalClimb: row.climb,
                        adjustedClimb: adjustedClimb,
                        cellText: cellText,
                        originalLimitWeight: originalLimitWeight,
                        adjustedLimitWeight: adjustedLimitWeight,
                        limitType: getLimitType(cellText),
                        isFieldLimit: isFieldLengthLimit(cellText)
                    });
                }
            }
        });
        
        if (validRows.length > 0) {
            validRows.sort((a, b) => b.tempValue - a.tempValue);
            highlightRowIndex = validRows[0].index;
            highlightLimitType = validRows[0].limitType;
            highlightLimitWeight = validRows[0].adjustedLimitWeight;
            highlightOriginalLimitWeight = validRows[0].originalLimitWeight;
            highlightCellText = validRows[0].cellText;
            highlightAdjustedClimb = validRows[0].adjustedClimb;
            highlightOriginalClimb = validRows[0].originalClimb;
        }
    }

    // ----- 构建表格（取消爬升重量列的黄色高亮）-----
    let html = '<table><thead><tr>';
    html += '<th>温度<br><span style="font-size:0.7rem;">(°C)</span></th>';
    html += '<th>爬升重量<br><span style="font-size:0.7rem;">(kg)</span></th>';
    winds.forEach(wind => {
        html += `<th>${wind} kts</th>`;
    });
    html += '</tr></thead><tbody>';

    rows.forEach((row, rowIndex) => {
        const tempValue = parseTempValue(row.temp);
        const isHighlight = (rowIndex === highlightRowIndex);
        
        const isTempLimited = (currentOAT !== null && tempValue < currentOAT);
        
        let trClass = isTempLimited ? 'temp-limit-violation' : '';
        html += `<tr class="${trClass}">`;
        
        // 温度列：保持黄色高亮
        html += `<td ${isHighlight ? 'class="both-highlight"' : ''}><strong>${row.temp}</strong></td>`;
        
        // 爬升重量列：取消黄色高亮，永远不加 both-highlight 类
        html += `<td>${row.climb} kg</td>`;
        
        for (let i = 0; i < winds.length; i++) {
            let cellText = row.cells[i] || '';
            let displayText = cellText;
            
            if (cellText.includes('*')) {
                displayText = displayText.replace('*', '<span class="star">*</span>');
            }
            if (cellText.includes('**')) {
                displayText = displayText.replace('**', '<span class="star">**</span>');
            }
            
            const shouldHighlight = (windIndex !== -1 && i === windIndex && isHighlight);
            const tdClass = shouldHighlight ? 'both-highlight' : '';
            
            html += `<td class="${tdClass}">${displayText || '--'}</td>`;
        }
        html += '</tr>';
    });
    
    html += '</tbody></table>';
    tableContainer.innerHTML = html;

// ----- 更新状态栏（改进爬升时只显示**限制信息）-----
if (!currentAircraft) {
    matchStatus.innerHTML = '⏳ 请选择飞机';
    matchStatus.className = 'info-item status-badge status-warning';
} else if (!currentAirport) {
    matchStatus.innerHTML = '⏳ 请选择机场';
    matchStatus.className = 'info-item status-badge';
} else if (!currentWind) {
    matchStatus.innerHTML = '⏳ 请选择风速';
    matchStatus.className = 'info-item status-badge status-warning';
} else if (currentWeight === null || currentWeight < 555) {
    matchStatus.innerHTML = '⚠️ 请输入有效重量 (≥555kg)';
    matchStatus.className = 'info-item status-badge status-warning';
} else if (currentQNH === null) {
    matchStatus.innerHTML = '⚠️ 请输入QNH';
    matchStatus.className = 'info-item status-badge status-warning';
} else if (highlightRowIndex !== -1) {
    const bestRow = rows[highlightRowIndex];
    const highlightTemp = parseTempValue(bestRow.temp);
    
    // ----- QNH修正信息（显示实际修正量，括号内是差值×1.5）-----
    let qnhText = '';
    if (qnhData) {
        const diff = qnhData.qnhDiff;
        // 修正量已经是 diff * 1.5，直接显示这个值
        const correctionValue = qnhData.correction;
        const sign = correctionValue > 0 ? '+' : '';
        qnhText = ` · Q修:<strong>${qnhData.correctedWeight.toFixed(1)}kg</strong> (${sign}${correctionValue.toFixed(1)})`;
    }
    
    // ----- 改进爬升时：不显示爬升信息，只显示**限制信息 -----
    let msg = '';
    if (currentImprovedClimb === 'on') {
        // 限制类型显示：只显示**限制
        let limitText = '';
        
        if (highlightLimitType) {
            if (currentAntiIce === 'on' && highlightLimitType === '场地长度' && highlightOriginalLimitWeight !== null && highlightLimitWeight !== null) {
                limitText = ` · ${highlightLimitType}:${highlightOriginalLimitWeight}-><strong>${highlightLimitWeight}kg</strong>(-${ANTI_ICE_FIELD_REDUCTION})`;
            } else {
                limitText = ` · ${highlightLimitType}:<strong>${highlightLimitWeight}kg</strong>`;
            }
        } else {
            // 如果没有限制类型，但有**标记，显示为改进爬升限制
            if (highlightCellText && highlightCellText.includes('**')) {
                limitText = ` · 改进爬升:<strong>${highlightLimitWeight}kg</strong>`;
            } else {
                limitText = ` · 越障:<strong>${highlightLimitWeight}kg</strong>`;
            }
        }
        
        let antiIceText = currentAntiIce === 'on' ? ` · 防冰ON` : '';
        
        msg = `✅ 推荐: ${bestRow.temp} · 输入:${currentWeight.toFixed(1)}kg${qnhText}${limitText}${antiIceText}`;
    } else {
        // 原始模式：显示爬升和限制信息
        let climbText = '';
        if (currentAntiIce === 'on') {
            climbText = ` · 爬升:${bestRow.climb}-><strong>${highlightAdjustedClimb}kg</strong>(-${ANTI_ICE_CLIMB_REDUCTION})`;
        } else {
            climbText = ` · 爬升:<strong>${bestRow.climb}kg</strong>`;
        }
        
        let limitText = '';
        if (highlightLimitType) {
            if (currentAntiIce === 'on' && highlightLimitType === '场地长度' && highlightOriginalLimitWeight !== null && highlightLimitWeight !== null) {
                limitText = ` · ${highlightLimitType}:${highlightOriginalLimitWeight}-><strong>${highlightLimitWeight}kg</strong>(-${ANTI_ICE_FIELD_REDUCTION})`;
            } else {
                limitText = ` · ${highlightLimitType}:<strong>${highlightLimitWeight}kg</strong>`;
            }
        } else {
            limitText = ` · 越障:<strong>${highlightLimitWeight}kg</strong>`;
        }
        
        let antiIceText = currentAntiIce === 'on' ? ` · 防冰ON` : '';
        
        msg = `✅ 推荐: ${bestRow.temp} · 输入:${currentWeight.toFixed(1)}kg${qnhText}${climbText}${limitText}${antiIceText}`;
    }
    
    if (currentOAT !== null && highlightTemp < currentOAT) {
        msg += ` · ❗ 温度超限 (${bestRow.temp} < ${currentOAT}°C)`;
        matchStatus.className = 'info-item status-badge status-danger';
    } else {
        matchStatus.className = 'info-item status-badge status-success';
    }
    matchStatus.innerHTML = msg;
} else {
    // 无满足条件
    console.log('无满足条件，当前状态:', {
        weight: currentWeight,
        qnhWeight: qnhData?.correctedWeight,
        windIndex: windIndex,
        rows: rows.map(row => ({
            temp: row.temp,
            cell: row.cells[windIndex],
            isImproved: isImprovedClimbLimit(row.cells[windIndex]),
            limitWeight: extractLimitWeight(row.cells[windIndex])
        }))
    });
    
    let qnhText = '';
    if (qnhData) {
        const diff = qnhData.qnhDiff;
        const correctionValue = qnhData.correction;
        const sign = correctionValue > 0 ? '+' : '';
        qnhText = ` · Q修:<strong>${qnhData.correctedWeight.toFixed(1)}kg</strong> (${sign}${correctionValue.toFixed(1)})`;
    }
    
    let antiIceText = currentAntiIce === 'on' ? ' · 防冰ON' : '';
    let modeText = currentImprovedClimb === 'on' ? ' · 改进爬升' : '';
    
    matchStatus.innerHTML = `⚠️ 无满足条件 · 输入:<strong>${currentWeight?.toFixed(1) || '--'}kg</strong>${qnhText}${antiIceText}${modeText}`;
    matchStatus.className = 'info-item status-badge status-warning';
}
}

// ---------- 初始化 ----------
async function init() {
    // 设置初始状态
    aircraftDisplay.textContent = '未选择';
    weightDisplay.textContent = '未输入';
    windDisplay.textContent = '未选择';
    tempDisplay.textContent = '未输入';
    surfaceDisplay.textContent = '干跑道';
    qnhDisplay.textContent = '未输入';
    antiIceDisplay.textContent = 'OFF';
    improvedClimbDisplay.textContent = 'OFF';
    
    // 不自动加载数据，等待用户选择飞机
    dataStatus.innerHTML = '⏳ 请选择飞机和机场';
    
    initEvents();
    renderTable();
}

// 启动应用
init();