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

// 防冰修正常量
const ANTI_ICE_CLIMB_REDUCTION = 27;
const ANTI_ICE_FIELD_REDUCTION = 18;

// 数据存储
let airportData = null;
let zshcData = null;
let zpppData = null;

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

// ---------- 辅助函数 ----------
function parseTempValue(tempStr) {
    if (!tempStr) return 0;
    return parseInt(tempStr.toString().replace('A', ''), 10);
}

// 提取限制重量 - 支持*、T、F、B、V
function extractLimitWeight(cell) {
    if (!cell) return null;
    let match = cell.match(/^(\d+)[*TFBV]?\//);
    return match ? parseInt(match[1], 10) : null;
}

// 获取限制类型 - T/F/B/V/*
function getLimitType(cell) {
    if (!cell) return null;
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

// 加载数据文件
async function loadAirportData(airportCode) {
    if (!airportCode) return null;
    
    try {
        if (airportCode === 'ZSHC') {
            if (zshcData) return zshcData;
            if (typeof ZSHC_DATA !== 'undefined') {
                zshcData = ZSHC_DATA;
                return zshcData;
            }
        } else if (airportCode === 'ZPPP') {
            if (zpppData) return zpppData;
            if (typeof ZPPP_DATA !== 'undefined') {
                zpppData = ZPPP_DATA;
                return zpppData;
            }
        }
    } catch (e) {
        console.error('加载数据失败:', e);
        dataStatus.innerHTML = '❌ 数据加载失败';
    }
    return null;
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

// ---------- 事件监听 ----------
function initEvents() {
    // 飞机选择
    aircraftSelect.addEventListener('change', function() {
        currentAircraft = this.value || null;
        aircraftDisplay.textContent = currentAircraft || '未选择';
        applyWarningStyle();
        if (airportData) renderTable();
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
        dataStatus.innerHTML = `⏳ 加载 ${code} 数据...`;
        
        airportData = await loadAirportData(code);
        
        if (airportData) {
            dataStatus.innerHTML = `✅ 已加载: ${code}`;
            currentRunway = '';
            resetRunwayButtons();
        } else {
            dataStatus.innerHTML = `❌ 加载 ${code} 失败`;
            airportData = null;
        }
        
        renderTable();
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
    applyWarningStyle();
    applyWetRunwayStyle();
    
    if (!airportData) {
        tableContainer.innerHTML = `<div style="padding: 50px; text-align: center; color: #54738c;">📋 请先选择机场</div>`;
        matchStatus.innerHTML = '⏳ 请选择机场';
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

    // ----- 高亮逻辑（使用QNH修正后的重量、防冰修正后的限制进行比较）-----
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

    // ----- 构建表格 -----
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
        
        html += `<td ${isHighlight ? 'class="both-highlight"' : ''}><strong>${row.temp}</strong></td>`;
        html += `<td ${isHighlight ? 'class="both-highlight"' : ''}>${row.climb} kg</td>`;
        
        for (let i = 0; i < winds.length; i++) {
            let cellText = row.cells[i] || '';
            let displayText = cellText;
            
            if (cellText.includes('*')) {
                displayText = displayText.replace('*', '<span class="star">*</span>');
            }
            
            const shouldHighlight = (windIndex !== -1 && i === windIndex && isHighlight);
            const tdClass = shouldHighlight ? 'both-highlight' : '';
            
            html += `<td class="${tdClass}">${displayText || '--'}</td>`;
        }
        html += '</tr>';
    });
    
    html += '</tbody></table>';
    tableContainer.innerHTML = html;

    // ----- 更新状态栏（修复重复爬升、添加粗体）-----
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
        
        // ----- QNH修正信息（带粗体）-----
        let qnhText = '';
        if (qnhData) {
            const diff = qnhData.qnhDiff;
            const sign = diff > 0 ? '+' : '';
            qnhText = ` · Q修:<strong>${qnhData.correctedWeight.toFixed(1)}kg</strong> (${sign}${diff})`;
        }
        
        // ----- 爬升显示（带粗体）- 只显示一次 -----
        let climbText = '';
        if (currentAntiIce === 'on') {
            climbText = ` · 爬升:${bestRow.climb}-><strong>${highlightAdjustedClimb}kg</strong>(-${ANTI_ICE_CLIMB_REDUCTION})`;
        } else {
            climbText = ` · 爬升:<strong>${bestRow.climb}kg</strong>`;
        }
        
        // ----- 限制类型显示：只有F类型且防冰ON时才显示修正，其他类型显示原始值（带粗体）-----
        let limitText = '';
        if (highlightLimitType) {
            if (currentAntiIce === 'on' && highlightLimitType === '场地长度' && highlightOriginalLimitWeight !== null && highlightLimitWeight !== null) {
                // F类型：显示修正前后，修正后加粗
                limitText = ` · ${highlightLimitType}:${highlightOriginalLimitWeight}-><strong>${highlightLimitWeight}kg</strong>(-${ANTI_ICE_FIELD_REDUCTION})`;
            } else {
                // 非F类型或防冰OFF：只显示当前使用的限制重量并加粗
                limitText = ` · ${highlightLimitType}:<strong>${highlightLimitWeight}kg</strong>`;
            }
        } else {
            // 无限制类型（应该是*类型）
            limitText = ` · 越障:<strong>${highlightLimitWeight}kg</strong>`;
        }
        
        // ----- 防冰ON标记（不重复爬升）-----
        let antiIceText = currentAntiIce === 'on' ? ` · 防冰ON` : '';
        
        // ----- 组装最终消息（无重复）-----
        let msg = `✅ 推荐: ${bestRow.temp} · 输入:${currentWeight.toFixed(1)}kg${qnhText}${climbText}${limitText}${antiIceText}`;
        
        if (currentOAT !== null && highlightTemp < currentOAT) {
            msg += ` · ❗ 温度超限 (${bestRow.temp} < ${currentOAT}°C)`;
            matchStatus.className = 'info-item status-badge status-danger';
        } else {
            matchStatus.className = 'info-item status-badge status-success';
        }
        matchStatus.innerHTML = msg;
    } else {
        // 无满足条件（带粗体）
        let qnhText = '';
        if (qnhData) {
            const diff = qnhData.qnhDiff;
            const sign = diff > 0 ? '+' : '';
            qnhText = ` · Q修:<strong>${qnhData.correctedWeight.toFixed(1)}kg</strong> (${sign}${diff})`;
        }
        
        let antiIceText = currentAntiIce === 'on' ? ' · 防冰ON' : '';
        
        matchStatus.innerHTML = `⚠️ 无满足条件 · 输入:<strong>${currentWeight?.toFixed(1) || '--'}kg</strong>${qnhText}${antiIceText}`;
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
    
    // 加载ZSHC数据
    airportData = await loadAirportData('ZSHC');
    if (airportData) {
        dataStatus.innerHTML = '✅ 已加载: ZSHC';
        resetRunwayButtons();
    }
    
    initEvents();
    renderTable();
}

// 启动应用
init();