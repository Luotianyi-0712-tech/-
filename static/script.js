// 游戏状态管理
class GameState {
    constructor() {
        this.poems = [];
        this.grid = Array(100).fill(null).map(() => Array(100).fill(null));
        this.selectedCell = null;
        this.currentDirection = 'horizontal';
        this.zoomLevel = 1;
        this.isFirstPoem = true;
        this.canvas = null;
        this.ctx = null;
        this.offsetX = 0;
        this.offsetY = 0;
        this.isDragging = false;
        this.lastMouseX = 0;
        this.lastMouseY = 0;
        this.selectedColor = '#9370DB';
        this.longPressTimer = null;
        this.isMobile = window.innerWidth <= 768;
        
        // 新增：用户和房间相关状态
        this.currentUser = null;
        this.currentRoom = null;
        this.socket = null;
        this.players = [];
        this.editingUsers = {};
        this.playerStats = {}; // 玩家统计信息
    }

    // 初始化Canvas
    initCanvas() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.resizeCanvas();
        this.bindCanvasEvents();
        this.renderCanvas();
        this.checkOrientation();

        // 监听屏幕方向变化
        window.addEventListener('orientationchange', () => {
            setTimeout(() => {
                this.checkOrientation();
                this.resizeCanvas();
                this.renderCanvas();
            }, 100);
        });

        // 监听窗口大小变化
        window.addEventListener('resize', () => {
            this.isMobile = window.innerWidth <= 768;
            this.checkOrientation();
        });
    }

    // 调整Canvas大小
    resizeCanvas() {
        if (!this.canvas) return;
        
        const container = this.canvas.parentElement;
        if (!container) return;
        
        const containerRect = container.getBoundingClientRect();
        
        if (this.isMobile) {
            // 移动端：保持画布比例，适应容器
            const containerAspectRatio = containerRect.width / containerRect.height;
            const canvasAspectRatio = 1; // 100x100网格，1:1比例
            
            if (containerAspectRatio > canvasAspectRatio) {
                // 容器更宽，以高度为准
                this.canvas.style.width = 'auto';
                this.canvas.style.height = '100%';
            } else {
                // 容器更高，以宽度为准
                this.canvas.style.width = '100%';
                this.canvas.style.height = 'auto';
            }
        } else {
            // 桌面端：填满容器
            this.canvas.style.width = '100%';
            this.canvas.style.height = '100%';
        }
        
        // 设置画布实际大小
        this.canvas.width = container.clientWidth;
        this.canvas.height = container.clientHeight;
        
        // 重新绘制
        this.renderCanvas();
    }

    // 绑定Canvas事件
    bindCanvasEvents() {
        // 鼠标滚轮缩放
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            this.zoomAt(e.offsetX, e.offsetY, delta);
        });

        // 鼠标拖拽
        this.canvas.addEventListener('mousedown', (e) => {
            this.isDragging = true;
            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;
            this.canvas.style.cursor = 'grabbing';
        });

        this.canvas.addEventListener('mousemove', (e) => {
            if (this.isDragging) {
                const deltaX = e.clientX - this.lastMouseX;
                const deltaY = e.clientY - this.lastMouseY;
                this.offsetX += deltaX;
                this.offsetY += deltaY;
                this.lastMouseX = e.clientX;
                this.lastMouseY = e.clientY;
                this.renderCanvas();
            }
        });

        this.canvas.addEventListener('mouseup', () => {
            this.isDragging = false;
            this.canvas.style.cursor = 'grab';
        });

        this.canvas.addEventListener('mouseleave', () => {
            this.isDragging = false;
            this.canvas.style.cursor = 'grab';
        });

        // 触摸事件支持
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (e.touches.length === 1) {
                const touch = e.touches[0];
                this.lastTouchX = touch.clientX;
                this.lastTouchY = touch.clientY;
                
                // 移动端长按删除功能
                if (this.isMobile) {
                    const rect = this.canvas.getBoundingClientRect();
                    const x = Math.floor((touch.clientX - rect.left - this.offsetX) / (40 * this.zoomLevel));
                    const y = Math.floor((touch.clientY - rect.top - this.offsetY) / (40 * this.zoomLevel));
                    
                    if (x >= 0 && x < 100 && y >= 0 && y < 100 && this.grid[y][x]) {
                        this.longPressTimer = setTimeout(() => {
                            this.showCorrectCharModal(x, y, this.grid[y][x]);
                            this.isDragging = false;
                        }, 1000);
                    }
                }
                this.isDragging = true;
            }
        }, { passive: false });

        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (this.longPressTimer) {
                clearTimeout(this.longPressTimer);
                this.longPressTimer = null;
            }
            if (e.touches.length === 1 && this.isDragging) {
                const touch = e.touches[0];
                const deltaX = touch.clientX - this.lastTouchX;
                const deltaY = touch.clientY - this.lastTouchY;
                this.offsetX += deltaX;
                this.offsetY += deltaY;
                this.lastTouchX = touch.clientX;
                this.lastTouchY = touch.clientY;
                this.renderCanvas();
            }
        }, { passive: false });

        this.canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            if (this.longPressTimer) {
                clearTimeout(this.longPressTimer);
                this.longPressTimer = null;
            }
            if (e.changedTouches.length === 1) {
                const touch = e.changedTouches[0];
                const rect = this.canvas.getBoundingClientRect();
                const x = Math.floor((touch.clientX - rect.left - this.offsetX) / (40 * this.zoomLevel));
                const y = Math.floor((touch.clientY - rect.top - this.offsetY) / (40 * this.zoomLevel));
                
                if (x >= 0 && x < 100 && y >= 0 && y < 100) {
                    this.handleCellClick(x, y, this.grid[y][x]);
                }
            }
            this.isDragging = false;
        }, { passive: false });

        // 双指缩放
        this.canvas.addEventListener('touchstart', (e) => {
            if (e.touches.length === 2) {
                this.initialDistance = this.getTouchDistance(e.touches[0], e.touches[1]);
                this.initialZoom = this.zoomLevel;
            }
        });

        this.canvas.addEventListener('touchmove', (e) => {
            if (e.touches.length === 2) {
                const currentDistance = this.getTouchDistance(e.touches[0], e.touches[1]);
                const scale = currentDistance / this.initialDistance;
                const newZoom = Math.max(0.1, Math.min(5, this.initialZoom * scale));
                
                if (Math.abs(newZoom - this.zoomLevel) > 0.01) {
                    this.zoomLevel = newZoom;
                    this.updateZoomDisplay();
                    this.renderCanvas();
                }
            }
        });

        // 点击事件
        this.canvas.addEventListener('click', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = Math.floor((e.clientX - rect.left - this.offsetX) / (40 * this.zoomLevel));
            const y = Math.floor((e.clientY - rect.top - this.offsetY) / (40 * this.zoomLevel));
            
            if (x >= 0 && x < 100 && y >= 0 && y < 100) {
                this.handleCellClick(x, y, this.grid[y][x]);
                // 发送编辑位置更新
                this.updateEditingPosition({ x, y });
            }
        });

        // 右键点击事件
        this.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const rect = this.canvas.getBoundingClientRect();
            const x = Math.floor((e.clientX - rect.left - this.offsetX) / (40 * this.zoomLevel));
            const y = Math.floor((e.clientY - rect.top - this.offsetY) / (40 * this.zoomLevel));
            
            if (x >= 0 && x < 100 && y >= 0 && y < 100 && this.grid[y][x]) {
                this.showCorrectCharModal(x, y, this.grid[y][x]);
            }
        });

        // 鼠标移动事件 - 用于实时编辑状态
        this.canvas.addEventListener('mousemove', (e) => {
            if (!this.isDragging) {
                const rect = this.canvas.getBoundingClientRect();
                const x = Math.floor((e.clientX - rect.left - this.offsetX) / (40 * this.zoomLevel));
                const y = Math.floor((e.clientY - rect.top - this.offsetY) / (40 * this.zoomLevel));
                
                if (x >= 0 && x < 100 && y >= 0 && y < 100) {
                    this.updateEditingPosition({ x, y });
                }
            }
        });

        // 鼠标进入和离开事件
        this.canvas.addEventListener('mouseenter', () => {
            this.startEditing({ x: 0, y: 0 });
        });

        this.canvas.addEventListener('mouseleave', () => {
            this.stopEditing();
        });

        // 窗口大小改变
        window.addEventListener('resize', () => {
            this.resizeCanvas();
            this.renderCanvas();
        });

        // 截屏按钮点击事件
        const captureBtn = document.getElementById('captureBtn');
        if (captureBtn) {
            captureBtn.addEventListener('click', () => {
                this.captureCanvas();
                this.showToast('画布截图已保存', 'success');
            });
        }
    }

    // 在指定位置缩放
    zoomAt(x, y, factor) {
        const newZoom = Math.max(0.1, Math.min(5, this.zoomLevel * factor));
        if (newZoom !== this.zoomLevel) {
            this.zoomLevel = newZoom;
            this.updateZoomDisplay();
            this.renderCanvas();
        }
    }
    
    // 计算触摸点之间的距离
    getTouchDistance(touch1, touch2) {
        const dx = touch1.clientX - touch2.clientX;
        const dy = touch1.clientY - touch2.clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }
    
    // 生成浅色背景色
    getLightBackgroundColor(color) {
        // 将颜色转换为浅色背景
        if (color.startsWith('#')) {
            const hex = color.slice(1);
            const r = parseInt(hex.slice(0, 2), 16);
            const g = parseInt(hex.slice(2, 4), 16);
            const b = parseInt(hex.slice(4, 6), 16);
            
            // 生成浅色背景（原色 + 大量白色）
            const lightR = Math.min(255, r + 200);
            const lightG = Math.min(255, g + 200);
            const lightB = Math.min(255, b + 200);
            
            return `rgb(${lightR}, ${lightG}, ${lightB})`;
        }
        
        // 默认浅色背景
        return '#f8f8f8';
    }

    // 更新缩放显示
    updateZoomDisplay() {
        const zoomDisplay = document.getElementById('zoomLevelDisplay');
        if (zoomDisplay) {
            zoomDisplay.textContent = Math.round(this.zoomLevel * 100) + '%';
        }
    }

    // 截取画布内容
    captureCanvas() {
        // 创建临时画布
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        
        // 设置临时画布大小为100*100格子的实际大小
        const cellSize = 40;
        tempCanvas.width = cellSize * 100;
        tempCanvas.height = cellSize * 100;
        
        // 设置白色背景
        tempCtx.fillStyle = '#fafafa';
        tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
        
        // 绘制网格
        tempCtx.strokeStyle = '#e8e8d0';
        tempCtx.lineWidth = 1;
        
        // 绘制垂直线和水平线
        for (let i = 0; i <= 100; i++) {
            tempCtx.beginPath();
            tempCtx.moveTo(i * cellSize, 0);
            tempCtx.lineTo(i * cellSize, tempCanvas.height);
            tempCtx.stroke();
            
            tempCtx.beginPath();
            tempCtx.moveTo(0, i * cellSize);
            tempCtx.lineTo(tempCanvas.width, i * cellSize);
            tempCtx.stroke();
        }
        
        // 绘制诗句内容
        for (let y = 0; y < 100; y++) {
            for (let x = 0; x < 100; x++) {
                const cellData = this.grid[y][x];
                if (cellData) {
                    const screenX = x * cellSize;
                    const screenY = y * cellSize;
                    
                    // 绘制背景色
                    tempCtx.fillStyle = this.getLightBackgroundColor(cellData.color);
                    tempCtx.fillRect(screenX, screenY, cellSize, cellSize);
                    
                    // 绘制文字
                    tempCtx.fillStyle = cellData.color;
                    tempCtx.font = '18px SimSun, 宋体, serif';
                    tempCtx.textAlign = 'center';
                    tempCtx.textBaseline = 'middle';
                    tempCtx.fillText(
                        cellData.char,
                        screenX + cellSize / 2,
                        screenY + cellSize / 2
                    );
                }
            }
        }

        // 添加水印
        tempCtx.fillStyle = 'rgba(12, 177, 243, 0.6)'; // 淡蓝色，半透明
        tempCtx.font = '24px SimSun, 宋体, serif';
        tempCtx.textAlign = 'right';
        tempCtx.textBaseline = 'bottom';
        
        // 获取当前时间
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        const timestamp = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
        
        // 获取房间号
        const roomCode = this.currentRoom || 'XXXXXX';
        
        // 绘制水印文字
        tempCtx.fillText('诗词煎饼摊-bigbing.v50tome.cn', tempCanvas.width - 20, tempCanvas.height - 40);
        tempCtx.fillText(`房间号${roomCode}-${timestamp}`, tempCanvas.width - 20, tempCanvas.height - 10);
        
        // 将画布内容转换为图片并下载
        const link = document.createElement('a');
        const filename = `诗词接龙_${year}${month}${day}${hours}${minutes}${seconds}.png`;        
        link.download = filename;
        link.href = tempCanvas.toDataURL('image/png');
        link.click();
    }

    // 添加诗句
    addPoem(poem) {
        // 为诗句生成唯一ID
        if (!poem.id) {
            poem.id = 'poem_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        }
        
        this.poems.push(poem);
        this.updateGrid(poem);
        this.updateUI();
        
        // 添加调试信息
        console.log('诗句添加成功:', {
            'ID': poem.id,
            '文本': poem.text,
            '方向': poem.direction,
            '位置': poem.startPosition,
            '当前方向': this.currentDirection
        });
    }

    // 更新网格
    updateGrid(poem) {
        const { x, y } = poem.startPosition;
        const text = poem.text;
        
        console.log('更新网格:', {
            '诗句ID': poem.id,
            '诗句文本': poem.text,
            '诗句方向': poem.direction,
            '起始位置': { x, y },
            '长度': text.length
        });
        
        if (poem.direction === 'horizontal') {
            for (let i = 0; i < text.length; i++) {
                if (x + i < 100 && y < 100) {
                    this.grid[y][x + i] = {
                        char: text[i],
                        poemId: poem.id,
                        color: poem.color
                    };
                    console.log(`横向填充网格 [${y}][${x + i}]:`, this.grid[y][x + i]);
                }
            }
        } else {
            for (let i = 0; i < text.length; i++) {
                if (x < 100 && y + i < 100) {
                    this.grid[y + i][x] = {
                        char: text[i],
                        poemId: poem.id,
                        color: poem.color
                    };
                    console.log(`纵向填充网格 [${y + i}][${x}]:`, this.grid[y + i][x]);
                }
            }
        }
    }

    // 更新UI
    updateUI() {
        this.renderCanvas();
        this.updatePoemCount();
        this.updateDirectionDisplay();
    }

    // 渲染Canvas
    renderCanvas() {
        if (!this.ctx) return;

        // 清空画布
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // 设置背景
        this.ctx.fillStyle = '#fafafa';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // 绘制网格
        this.drawGrid();

        // 绘制诗句
        this.drawPoems();

        // 绘制选中状态
        if (this.selectedCell) {
            this.drawSelection();
        }
    }

    // 绘制网格
    drawGrid() {
        this.ctx.strokeStyle = '#e8e8d0';
        this.ctx.lineWidth = 1;
        this.ctx.setLineDash([]);

        const cellSize = 40 * this.zoomLevel;
        const startX = this.offsetX;
        const startY = this.offsetY;

        // 绘制垂直线
        for (let x = 0; x <= 100; x++) {
            const screenX = startX + x * cellSize;
            if (screenX >= -cellSize && screenX <= this.canvas.width + cellSize) {
                this.ctx.beginPath();
                this.ctx.moveTo(screenX, startY);
                this.ctx.lineTo(screenX, startY + 100 * cellSize);
                this.ctx.stroke();
            }
        }

        // 绘制水平线
        for (let y = 0; y <= 100; y++) {
            const screenY = startY + y * cellSize;
            if (screenY >= -cellSize && screenY <= this.canvas.height + cellSize) {
                this.ctx.beginPath();
                this.ctx.moveTo(startX, screenY);
                this.ctx.lineTo(startX + 100 * cellSize, screenY);
                this.ctx.stroke();
            }
        }
    }

    // 绘制诗句
    drawPoems() {
        const cellSize = 40 * this.zoomLevel;
        const startX = this.offsetX;
        const startY = this.offsetY;

        for (let y = 0; y < 100; y++) {
            for (let x = 0; x < 100; x++) {
                const cellData = this.grid[y][x];
                if (cellData) {
                    const screenX = startX + x * cellSize;
                    const screenY = startY + y * cellSize;

                    // 绘制背景色（使用浅色背景）
                    this.ctx.fillStyle = this.getLightBackgroundColor(cellData.color);
                    this.ctx.fillRect(screenX, screenY, cellSize, cellSize);

                    // 绘制文字（使用选择的颜色）
                    this.ctx.fillStyle = cellData.color;
                    this.ctx.font = `${Math.max(14, Math.floor(18 * this.zoomLevel))}px SimSun, 宋体, serif`;
                    this.ctx.textAlign = 'center';
                    this.ctx.textBaseline = 'middle';
                    this.ctx.fillText(
                        cellData.char,
                        screenX + cellSize / 2,
                        screenY + cellSize / 2
                    );
                }
            }
        }
    }

    // 绘制选中状态
    drawSelection() {
        if (!this.selectedCell) return;

        const { x, y } = this.selectedCell;
        const cellSize = 40 * this.zoomLevel;
        const startX = this.offsetX;
        const startY = this.offsetY;

        const screenX = startX + x * cellSize;
        const screenY = startY + y * cellSize;

        this.ctx.strokeStyle = '#8b7355';
        this.ctx.lineWidth = 3;
        this.ctx.setLineDash([]);
        this.ctx.strokeRect(screenX, screenY, cellSize, cellSize);
    }

    // 处理单元格点击
    handleCellClick(x, y, cellData) {
        if (!cellData) {
            // 空单元格，可以开始新诗句
            if (this.isFirstPoem) {
                this.startNewPoem();
            }
            return;
        }

        // 已填充的单元格，可以接龙
        this.startChainPoem(x, y, cellData);
    }

    // 开始新诗句
    startNewPoem() {
        const input = document.getElementById('poemInput');
        input.focus();
        this.showToast('请输入第一句诗', 'info');
    }

    // 开始接龙诗句
    startChainPoem(x, y, cellData) {
        this.selectedCell = { x, y, data: cellData };
        
        // 找到对应的诗句
        const poem = this.poems.find(p => p.id === cellData.poemId);
        if (!poem) return;

        // 确定新诗句的方向（横纵转换）
        // 如果前句是横向，新句必须是纵向；如果前句是纵向，新句必须是横向
        const newDirection = poem.direction === 'horizontal' ? 'vertical' : 'horizontal';
        
        // 添加调试信息
        console.log('接龙方向转换:', {
            '前句ID': poem.id,
            '前句方向': poem.direction,
            '前句文本': poem.text,
            '新句方向': newDirection,
            '连接字符': cellData.char,
            '连接字符位置': { x, y },
            '网格数据': cellData
        });
        
        // 显示接龙模态框
        this.showChainModal(poem.direction, newDirection, cellData.char);
    }

    // 显示接龙模态框
    showChainModal(prevDirection, newDirection, connectChar) {
        // 创建模态框
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>接龙诗句输入</h3>
                    <span class="close">&times;</span>
                </div>
                <div class="modal-body">
                    <p>检测到前句方向: <span id="prevDirection">${prevDirection === 'horizontal' ? '横向' : '纵向'}</span></p>
                    <p>当前句方向: <span id="newDirection">${newDirection === 'horizontal' ? '横向' : '纵向'}</span></p>
                    <p>连接字符: <span id="connectChar">${connectChar}</span></p>
                    <p class="direction-hint">💡 <strong>方向转换规则：</strong>前句是${prevDirection === 'horizontal' ? '横向' : '纵向'}，新句必须是${newDirection === 'horizontal' ? '横向' : '纵向'}</p>
                    <div class="input-group">
                        <input type="text" id="chainInput" placeholder="请输入接龙诗句" maxlength="30">
                        <button id="confirmChainBtn" class="btn btn-primary">确认接龙</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        modal.style.display = 'block';

        // 绑定事件
        const closeBtn = modal.querySelector('.close');
        const confirmBtn = modal.querySelector('#confirmChainBtn');
        const input = modal.querySelector('#chainInput');

        closeBtn.addEventListener('click', () => this.hideChainModal(modal));
        confirmBtn.addEventListener('click', () => this.handleChainPoem(input.value, modal));
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.handleChainPoem(input.value, modal);
            }
        });

        // 点击外部关闭
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.hideChainModal(modal);
            }
        });

        // 聚焦到输入框
        input.focus();
        
        // 设置新诗句的方向（强制横纵转换）
        this.currentDirection = newDirection;
        
        // 添加调试信息
        console.log('模态框设置方向:', {
            '前句方向': prevDirection,
            '新句方向': newDirection,
            '当前方向': this.currentDirection
        });
    }

    // 隐藏接龙模态框
    hideChainModal(modal) {
        if (modal && modal.parentNode) {
            modal.parentNode.removeChild(modal);
        }
        this.selectedCell = null;
    }

    // 显示错字修正模态框
    showCorrectCharModal(x, y, cellData) {
        // 创建模态框
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>错字修正</h3>
                    <span class="close">&times;</span>
                </div>
                <div class="modal-body">
                    <p>原字符: <span id="originalChar">${cellData.char}</span></p>
                    <div class="input-group">
                        <input type="text" id="correctCharInput" placeholder="请输入修正后的字" maxlength="1">
                        <button id="confirmCorrectBtn" class="btn btn-primary">确认修正</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        modal.style.display = 'block';

        // 绑定事件
        const closeBtn = modal.querySelector('.close');
        const confirmBtn = modal.querySelector('#confirmCorrectBtn');
        const input = modal.querySelector('#correctCharInput');

        closeBtn.addEventListener('click', () => this.hideCorrectCharModal(modal));
        confirmBtn.addEventListener('click', () => this.handleCorrectChar(x, y, cellData, input.value, modal));
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.handleCorrectChar(x, y, cellData, input.value, modal);
            }
        });

        // 点击外部关闭
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.hideCorrectCharModal(modal);
            }
        });

        // 聚焦到输入框
        input.focus();
    }

    // 隐藏错字修正模态框
    hideCorrectCharModal(modal) {
        if (modal && modal.parentNode) {
            modal.parentNode.removeChild(modal);
        }
    }

    // 检查屏幕方向
    checkOrientation() {
        const orientationTip = document.getElementById('orientationTip');
        if (!orientationTip || !this.isMobile) return;

        if (window.innerWidth < window.innerHeight) {
            orientationTip.style.display = 'flex';
        } else {
            orientationTip.style.display = 'none';
        }
    }

    // 处理错字修正
    handleCorrectChar(x, y, cellData, newChar, modal) {
        if (!newChar.trim()) {
            this.showToast('请输入修正后的字', 'error');
            return;
        }

        if (newChar.length > 1) {
            this.showToast('只能输入一个字', 'error');
            return;
        }

        // 更新网格中的字符
        this.grid[y][x] = {
            ...cellData,
            char: newChar
        };

        // 更新对应诗句中的字符
        const poem = this.poems.find(p => p.id === cellData.poemId);
        if (poem) {
            const charIndex = poem.direction === 'horizontal'
                ? x - poem.startPosition.x
                : y - poem.startPosition.y;
            if (charIndex >= 0 && charIndex < poem.text.length) {
                poem.text = poem.text.substring(0, charIndex) + newChar + poem.text.substring(charIndex + 1);
            }
        }

        // 重新渲染画布
        this.renderCanvas();

        // 关闭模态框
        this.hideCorrectCharModal(modal);

        // 显示成功提示
        this.showToast('错字修正成功', 'success');
    }

    // 处理接龙诗句
    async handleChainPoem(text, modal) {
        if (!text.trim()) {
            this.showToast('请输入接龙诗句', 'error');
            return;
        }

        if (text.length > 30) {
            this.showToast('诗句长度不能超过30字', 'error');
            return;
        }

        if (!this.selectedCell) {
            this.showToast('请先选择连接位置', 'error');
            return;
        }

        try {
            const color = this.getSelectedColor();
            const direction = this.currentDirection;
            const { x: selectedX, y: selectedY, data } = this.selectedCell;
            
            // 找到连接的诗句
            const connectedPoem = this.poems.find(p => p.id === data.poemId);
            
            // 添加调试信息
            console.log('接龙处理:', {
                '当前方向': direction,
                '连接诗句ID': connectedPoem.id,
                '连接诗句方向': connectedPoem.direction,
                '连接诗句文本': connectedPoem.text,
                '新诗句文本': text,
                '连接字符': data.char,
                '选中位置': { x: selectedX, y: selectedY },
                '网格数据': data
            });
            
            // 验证方向转换规则
            if (connectedPoem.direction === direction) {
                this.showToast('接龙诗句方向必须与连接诗句方向不同（横纵转换）', 'error');
                console.error('方向转换验证失败:', {
                    '连接诗句方向': connectedPoem.direction,
                    '新诗句方向': direction
                });
                return;
            }
            
            // 双重验证：确保方向确实是横纵转换
            const expectedDirection = connectedPoem.direction === 'horizontal' ? 'vertical' : 'horizontal';
            if (direction !== expectedDirection) {
                this.showToast(`接龙诗句方向错误，应该是${expectedDirection === 'horizontal' ? '横向' : '纵向'}`, 'error');
                console.error('方向转换验证失败:', {
                    '连接诗句方向': connectedPoem.direction,
                    '期望方向': expectedDirection,
                    '实际方向': direction
                });
                return;
            }
            
            // 找到连接字符在新诗句中的位置
            const connectChar = data.char;
            const connectIndex = text.indexOf(connectChar);
            
            if (connectIndex === -1) {
                this.showToast('新诗句必须包含连接字符', 'error');
                return;
            }
            
            // 计算新诗句的起始位置，使连接字符位于选中的位置
            let startPosition;
            if (direction === 'horizontal') {
                startPosition = { x: selectedX - connectIndex, y: selectedY };
            } else {
                startPosition = { x: selectedX, y: selectedY - connectIndex };
            }
            
            // 检查边界
            if (startPosition.x < 0 || startPosition.y < 0 || 
                (direction === 'horizontal' && startPosition.x + text.length > 100) ||
                (direction === 'vertical' && startPosition.y + text.length > 100)) {
                this.showToast('诗句超出边界，请选择其他位置', 'error');
                return;
            }
            
            // 检查是否与已有诗句重叠
            console.log('开始检查重叠...');
            // 传入允许重叠的连接字符位置
            const allowedOverlapPosition = { x: selectedX, y: selectedY };
            if (this.wouldOverlapExistingPoem(text, direction, startPosition, allowedOverlapPosition)) {
                console.log('重叠检测失败，阻止添加');
                this.showToast('新诗句与已有诗句重叠，请选择其他位置', 'error');
                return;
            }
            console.log('重叠检测通过，可以添加');
            
            const poemData = {
                id: 'poem_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                text: text,
                direction: direction,
                startPosition: startPosition,
                color: color,
                connectedTo: [connectedPoem.id]
            };

            // 通过API添加到房间
            const result = await ApiService.addPoem(this.currentRoom, poemData);
            if (result.success) {
                // 添加到本地状态
                this.addPoem(result.poem);
                
                // 隐藏模态框
                this.hideChainModal(modal);
                
                this.showToast('接龙成功', 'success');
            } else {
                this.showToast(result.message || '接龙失败', 'error');
            }
        } catch (error) {
            this.showToast('接龙失败', 'error');
        }
    }

    // 获取选中的颜色
    getSelectedColor() {
        return this.selectedColor;
    }

    // 设置选中的颜色
    setSelectedColor(color) {
        this.selectedColor = color;
        
        // 移除之前的选中状态
        document.querySelectorAll('.color-option').forEach(option => {
            option.classList.remove('selected');
        });
        
        // 设置新的选中状态
        const colorOption = document.querySelector(`[data-color="${color}"]`);
        if (colorOption) {
            colorOption.classList.add('selected');
        }
        
        // 更新自定义颜色选择器
        const customColorPicker = document.getElementById('customColorPicker');
        if (customColorPicker) {
            customColorPicker.value = color;
        }
    }

    // 更新诗句数量
    updatePoemCount() {
        const poemCount = document.getElementById('poemCount');
        if (poemCount) {
            poemCount.textContent = this.poems.length;
        }
    }

    // 更新方向显示
    updateDirectionDisplay() {
        // 这个功能在新的UI中不需要了
    }
    
    // 调试方法：显示所有诗句信息
    debugPoems() {
        console.log('=== 当前所有诗句信息 ===');
        this.poems.forEach((poem, index) => {
            console.log(`诗句 ${index + 1}:`, {
                'ID': poem.id,
                '文本': poem.text,
                '方向': poem.direction,
                '位置': poem.startPosition,
                '颜色': poem.color,
                '连接关系': poem.connectedTo
            });
        });
        console.log('=== 网格状态 ===');
        // 显示非空网格单元格
        let filledCells = 0;
        for (let y = 0; y < 100; y++) {
            for (let x = 0; x < 100; x++) {
                if (this.grid[y][x]) {
                    filledCells++;
                    if (filledCells <= 20) { // 只显示前20个，避免日志过长
                        console.log(`网格 [${y}][${x}]:`, this.grid[y][x]);
                    }
                }
            }
        }
        console.log(`总共有 ${filledCells} 个填充的网格单元格`);
    }
    
    // 检查新诗句是否会与已有诗句重叠
    wouldOverlapExistingPoem(text, direction, startPosition, allowedOverlapPosition = null) {
        const { x, y } = startPosition;
        const length = text.length;
        
        console.log('检查重叠:', {
            '新诗句文本': text,
            '新诗句方向': direction,
            '起始位置': startPosition,
            '长度': length,
            '允许重叠位置': allowedOverlapPosition
        });
        
        // 检查每个字符位置是否已被占用
        for (let i = 0; i < length; i++) {
            let checkX, checkY;
            
            if (direction === 'horizontal') {
                checkX = x + i;
                checkY = y;
            } else {
                checkX = x;
                checkY = y + i;
            }
            
            // 检查边界
            if (checkX < 0 || checkX >= 100 || checkY < 0 || checkY >= 100) {
                console.log(`位置 [${checkY}][${checkX}] 超出边界`);
                return true; // 超出边界也算重叠
            }
            
            // 检查是否已被占用
            if (this.grid[checkY][checkX]) {
                const existingCell = this.grid[checkY][checkX];
                
                // 如果这个位置是允许重叠的连接字符位置，则跳过检查
                if (allowedOverlapPosition && 
                    checkX === allowedOverlapPosition.x && 
                    checkY === allowedOverlapPosition.y) {
                    console.log(`位置 [${checkY}][${checkX}] 是允许重叠的连接字符位置，跳过检查`);
                    continue;
                }
                
                console.log(`位置 [${checkY}][${checkX}] 已被占用:`, {
                    '字符': existingCell.char,
                    '诗句ID': existingCell.poemId,
                    '颜色': existingCell.color
                });
                return true; // 发现不允许的重叠
            }
        }
        
        console.log('无重叠，可以添加');
        return false; // 无重叠
    }

    // 重置游戏
    reset() {
        this.poems = [];
        this.grid = Array(100).fill(null).map(() => Array(100).fill(null));
        this.selectedCell = null;
        this.currentDirection = 'horizontal';
        this.isFirstPoem = true;
        this.zoomLevel = 1;
        this.offsetX = 0;
        this.offsetY = 0;
        this.updateUI();
        this.showToast('游戏已重置', 'success');
    }

    // 清除选择
    clearSelection() {
        this.selectedCell = null;
        this.renderCanvas();
        this.showToast('选择已清除', 'info');
    }

    // 缩放控制
    zoomIn() {
        this.zoomAt(this.canvas.width / 2, this.canvas.height / 2, 1.2);
    }

    zoomOut() {
        this.zoomAt(this.canvas.width / 2, this.canvas.height / 2, 0.8);
    }

    resetZoom() {
        this.zoomLevel = 1;
        this.offsetX = 0;
        this.offsetY = 0;
        this.updateZoomDisplay();
        this.renderCanvas();
    }

    // 显示提示信息
    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        
        const container = document.getElementById('toastContainer') || document.body;
        container.appendChild(toast);
        
        // 显示动画
        setTimeout(() => toast.classList.add('show'), 10);
        
        // 自动隐藏
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }, 3000);
    }

    // 新增：用户注册
    async registerUser(username) {
        try {
            const response = await fetch('/api/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username })
            });
            
            const result = await response.json();
            if (result.success) {
                this.currentUser = {
                    id: result.user_id,
                    username: result.username
                };
                this.updateUserDisplay();
                return true;
            } else {
                this.showToast(result.message, 'error');
                return false;
            }
        } catch (error) {
            this.showToast('注册失败', 'error');
            return false;
        }
    }

    // 新增：创建房间
    async createRoom() {
        try {
            const response = await fetch('/api/create_room', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                }
            });
            
            const result = await response.json();
            if (result.success) {
                this.currentRoom = result.room_code;
                this.joinSocketRoom();
                this.updateRoomDisplay();
                return true;
            } else {
                this.showToast(result.message, 'error');
                return false;
            }
        } catch (error) {
            this.showToast('创建房间失败', 'error');
            return false;
        }
    }

    // 新增：加入房间
    async joinRoom(roomCode) {
        try {
            // 检查是否为管理员房间
            if (roomCode === '207128' && this.currentUser && this.currentUser.username === '管理员') {
                const response = await fetch('/api/admin/join_admin_room', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    }
                });
                
                const result = await response.json();
                if (result.success) {
                    this.currentRoom = result.room_code;
                    this.joinSocketRoom();
                    this.updateRoomDisplay();
                    return true;
                } else {
                    this.showToast(result.message, 'error');
                    return false;
                }
            } else {
                const response = await fetch('/api/join_room', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ room_code: roomCode })
                });
                
                const result = await response.json();
                if (result.success) {
                    this.currentRoom = result.room_code;
                    this.joinSocketRoom();
                    this.updateRoomDisplay();
                    return true;
                } else {
                    this.showToast(result.message, 'error');
                    return false;
                }
            }
        } catch (error) {
            this.showToast('加入房间失败', 'error');
            return false;
        }
    }

    // 新增：初始化Socket连接
    initSocket() {
        this.socket = io();
        
        this.socket.on('connect', () => {
            console.log('Socket连接成功');
        });

        this.socket.on('disconnect', () => {
            console.log('Socket连接断开');
        });

        this.socket.on('user_joined', (data) => {
            this.showToast(data.message, 'info');
            this.updatePlayersList();
        });

        this.socket.on('user_left', (data) => {
            this.showToast(data.message, 'info');
            this.updatePlayersList();
        });

        this.socket.on('room_status', (data) => {
            this.players = data.players;
            this.editingUsers = data.editing_users;
            if (data.player_stats) {
                this.playerStats = data.player_stats;
            }
            this.updatePlayersList();
            this.updateEditingStatus();
        });

        this.socket.on('poem_added', (data) => {
            this.addPoem(data.poem);
            this.showToast(`${data.author} 添加了诗句`, 'info');
        });

        this.socket.on('game_reset', (data) => {
            this.reset();
            this.showToast(`${data.reset_by} 重置了游戏`, 'info');
        });

        this.socket.on('editing_status_update', (data) => {
            this.editingUsers = data.editing_users;
            this.updatePlayersList();
            this.updateEditingStatus();
        });

        this.socket.on('player_stats_update', (data) => {
            this.playerStats = data.player_stats;
            this.updatePlayersList();
        });

        this.socket.on('error', (data) => {
            this.showToast(data.message, 'error');
        });

        this.socket.on('admin_rooms_info', (data) => {
            this.updateAdminRoomsInfo(data);
        });

        this.socket.on('room_deleted', (data) => {
            this.handleRoomDeleted(data);
        });
    }

    // 新增：加入Socket房间
    joinSocketRoom() {
        if (this.socket && this.currentRoom && this.currentUser) {
            this.socket.emit('join_room', {
                room_code: this.currentRoom,
                username: this.currentUser.username
            });
        }
    }

    // 新增：离开Socket房间
    leaveSocketRoom() {
        if (this.socket && this.currentRoom && this.currentUser) {
            this.socket.emit('leave_room', {
                room_code: this.currentRoom,
                username: this.currentUser.username
            });
        }
    }

    // 新增：更新用户显示
    updateUserDisplay() {
        const currentUserElement = document.getElementById('currentUser');
        if (currentUserElement && this.currentUser) {
            currentUserElement.textContent = this.currentUser.username;
        }
    }

    // 新增：更新房间显示
    updateRoomDisplay() {
        const roomCodeElement = document.getElementById('roomCode');
        const roomCodeDisplayElement = document.getElementById('roomCodeDisplay');
        if (roomCodeElement && roomCodeDisplayElement && this.currentRoom) {
            roomCodeElement.textContent = this.currentRoom;
            roomCodeDisplayElement.textContent = this.currentRoom;
        }
    }

    // 新增：更新玩家列表
    updatePlayersList() {
        const playersListElement = document.getElementById('playersList');
        const playerCountElement = document.getElementById('playerCount');
        
        if (playersListElement) {
            playersListElement.innerHTML = '';
            this.players.forEach(player => {
                const li = document.createElement('li');
                li.className = 'player-item';
                
                // 获取玩家统计信息
                const playerStats = this.playerStats && this.playerStats[player];
                const isOnline = playerStats ? playerStats.is_online : false;
                const poemCount = playerStats ? playerStats.poem_count : 0;
                
                // 检查是否正在编辑
                const isEditing = Object.values(this.editingUsers).some(edit => edit.username === player);
                
                // 构建玩家信息HTML
                li.innerHTML = `
                    <div class="player-info">
                        <div class="player-name-row">
                            <span class="player-name ${player === '管理员' ? 'admin-badge' : ''}">${player}</span>
                            <span class="status-indicator ${isOnline ? 'online' : 'offline'}">${isOnline ? '在线' : '离线'}</span>
                        </div>
                        <div class="player-stats">
                            诗句: ${poemCount}
                        </div>
                    </div>
                `;
                
                if (isEditing) {
                    li.classList.add('editing');
                }
                
                playersListElement.appendChild(li);
            });
        }
        
        if (playerCountElement) {
            // 显示在线玩家数/总玩家数
            const onlineCount = this.players.filter(player => {
                const playerStats = this.playerStats && this.playerStats[player];
                return playerStats ? playerStats.is_online : false;
            }).length;
            playerCountElement.textContent = `${onlineCount}/${this.players.length}`;
        }
    }

    // 新增：更新编辑状态显示
    updateEditingStatus() {
        const editingStatusElement = document.getElementById('editingStatus');
        if (!editingStatusElement) return;
        
        const editingUsers = Object.values(this.editingUsers);
        if (editingUsers.length === 0) {
            editingStatusElement.style.display = 'none';
            return;
        }
        
        editingStatusElement.style.display = 'block';
        editingStatusElement.innerHTML = '<div style="font-weight: bold; margin-bottom: 6px;">正在编辑:</div>';
        
        editingUsers.forEach(edit => {
            const userDiv = document.createElement('div');
            userDiv.className = 'editing-user';
            userDiv.innerHTML = `
                <div class="editing-indicator"></div>
                <span>${edit.username}</span>
            `;
            editingStatusElement.appendChild(userDiv);
        });
    }

    // 新增：开始编辑
    startEditing(position) {
        if (this.socket && this.currentRoom && this.currentUser) {
            this.socket.emit('start_editing', {
                room_code: this.currentRoom,
                username: this.currentUser.username,
                position: position
            });
        }
    }

    // 新增：停止编辑
    stopEditing() {
        if (this.socket && this.currentRoom) {
            this.socket.emit('stop_editing', {
                room_code: this.currentRoom
            });
        }
    }

    // 新增：更新编辑位置
    updateEditingPosition(position) {
        if (this.socket && this.currentRoom) {
            this.socket.emit('update_editing_position', {
                room_code: this.currentRoom,
                position: position
            });
        }
    }

    // 新增：更新管理员房间信息
    updateAdminRoomsInfo(data) {
        if (this.currentRoom === '207128' && this.currentUser && this.currentUser.username === '管理员') {
            // 更新房间信息显示
            const totalRoomsElement = document.getElementById('totalRooms');
            const totalPlayersElement = document.getElementById('totalPlayers');
            
            if (totalRoomsElement) {
                totalRoomsElement.textContent = data.total_rooms;
            }
            if (totalPlayersElement) {
                totalPlayersElement.textContent = data.total_players;
            }
            
            // 更新房间列表
            this.updateRoomsList(data.rooms);
        }
    }

    // 新增：更新房间列表
    updateRoomsList(rooms) {
        const roomsListElement = document.getElementById('roomsList');
        if (!roomsListElement) return;
        
        roomsListElement.innerHTML = '';
        
        if (rooms.length === 0) {
            roomsListElement.innerHTML = '<div class="no-rooms">暂无活跃房间</div>';
            return;
        }
        
        rooms.forEach(room => {
            const roomDiv = document.createElement('div');
            roomDiv.className = 'room-item';
            roomDiv.innerHTML = `
                <div class="room-header">
                    <span class="room-code">房间 ${room.code}</span>
                    <div class="room-header-actions">
                        <span class="room-status ${room.player_count > 0 ? 'active' : 'inactive'}">
                            ${room.player_count > 0 ? '活跃' : '空闲'}
                        </span>
                        <button class="btn-delete-room" data-room-code="${room.code}" title="删除房间">
                            🗑️
                        </button>
                    </div>
                </div>
                <div class="room-info">
                    <div class="room-detail">
                        <span>创建者: ${room.creator}</span>
                        <span>玩家数: ${room.player_count}</span>
                    </div>
                    <div class="room-detail">
                        <span>诗句数: ${room.poem_count}</span>
                        <span>编辑中: ${room.editing_count}</span>
                    </div>
                    <div class="room-players">
                        玩家: ${room.players.join(', ')}
                    </div>
                    <div class="room-time">
                        创建时间: ${new Date(room.created_at).toLocaleString()}
                    </div>
                </div>
            `;
            
            // 为删除按钮添加事件监听器
            const deleteBtn = roomDiv.querySelector('.btn-delete-room');
            deleteBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('删除按钮被点击');
                const roomCode = deleteBtn.getAttribute('data-room-code');
                console.log('要删除的房间码:', roomCode);
                this.deleteRoom(roomCode);
            });
            
            roomsListElement.appendChild(roomDiv);
        });
    }

    // 新增：请求管理员房间信息
    requestAdminRoomsInfo() {
        if (this.socket && this.currentRoom === '207128' && this.currentUser && this.currentUser.username === '管理员') {
            this.socket.emit('request_admin_rooms_info', {
                room_code: this.currentRoom,
                username: this.currentUser.username
            });
        }
    }

    // 新增：处理房间被删除
    handleRoomDeleted(data) {
        // 如果当前用户在被删除的房间中
        if (this.currentRoom === data.room_code) {
            this.showToast(data.message, 'error');
            
            // 清理当前房间状态
            this.currentRoom = null;
            
            // 隐藏游戏界面
            const gameContainer = document.getElementById('gameContainer');
            if (gameContainer) {
                gameContainer.style.display = 'none';
            }
            
            // 显示房间选择界面
            this.showRoomModal();
        }
    }

    // 新增：删除房间
    async deleteRoom(roomCode) {
        console.log('尝试删除房间:', roomCode);
        
        // 确认删除
        if (!confirm(`确定要删除房间 ${roomCode} 吗？\n\n删除后房间内的所有玩家将被强制退出，且无法恢复！`)) {
            console.log('用户取消删除');
            return;
        }
        
        // 二次确认
        if (!confirm(`⚠️ 警告：此操作不可撤销！\n\n确定要删除房间 ${roomCode} 吗？`)) {
            console.log('用户取消删除（二次确认）');
            return;
        }
        
        console.log('开始删除房间:', roomCode);
        
        try {
            const response = await fetch('/api/admin/delete_room', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ room_code: roomCode })
            });
            
            console.log('删除请求响应:', response);
            
            const result = await response.json();
            console.log('删除结果:', result);
            
            if (result.success) {
                this.showToast(result.message, 'success');
                // 刷新房间列表
                this.requestAdminRoomsInfo();
            } else {
                this.showToast(result.message, 'error');
            }
        } catch (error) {
            console.error('删除房间错误:', error);
            this.showToast('删除房间失败', 'error');
        }
    }
}

// API 服务
class ApiService {
    static async getPoems(roomCode) {
        try {
            const response = await fetch(`/api/poems/${roomCode}`);
            return await response.json();
        } catch (error) {
            console.error('获取诗句失败:', error);
            return [];
        }
    }

    static async addPoem(roomCode, poemData) {
        try {
            const response = await fetch(`/api/poems/${roomCode}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(poemData)
            });
            return await response.json();
        } catch (error) {
            console.error('添加诗句失败:', error);
            throw error;
        }
    }

    static async resetGame(roomCode) {
        try {
            const response = await fetch(`/api/reset/${roomCode}`, {
                method: 'POST'
            });
            return await response.json();
        } catch (error) {
            console.error('重置游戏失败:', error);
            throw error;
        }
    }
}

// 游戏主类
class JianbingGame {
    constructor() {
        this.gameState = new GameState();
        this.poemLines = [
            '多情只有春庭月，犹为离人照落花。',
            '海棠未雨，梨花先雪，一半春休。',
            '飘零尽日不归去，点破清光万里天。',
            '青山隐隐水迢迢，秋尽江南草未周。',
            '远近枝横千树玉，往来人负一身花。',
            '西风驿马。落月书灯。',
            '倚危楼，人间何处，扫地八风曲。',
            '柳条折尽花飞尽，借问行人归不归。',
            '纵明月相思千里隔。梦咫尺。勤书尺。',
            '更被夕阳江岸上，断肠烟柳一丝丝。',
            '君看六幅南朝事，老木寒云满故城。',
            '二十四桥明月夜，玉人何处教吹箫。',
            '云想衣裳花想容，春风拂槛露华浓。',
            '春风不度玉门关。',
            '春江潮水连海平，海上明月共潮生。',
            '春色满园关不住，一枝红杏出墙来。',
            '红藕香残玉簟秋。轻解罗裳，独上兰舟。',
            '乱云低薄暮，急雪舞回风。',
            '桃花影落飞神剑，碧海潮生按玉箫。',
            '有时明月无人夜，独向昭潭制恶龙。',
            '秋风清，秋月明。'
        ];
        this.currentPoemIndex = 0;
        this.init();
    }

    async init() {
        this.gameState.initSocket();
        this.bindEvents();
        this.showDisclaimerModal();
        this.startPoemRotation();
        this.initMobileLayout();
    }

    async loadGameData() {
        if (!this.gameState.currentRoom) return;
        
        try {
            const poems = await ApiService.getPoems(this.gameState.currentRoom);
            this.gameState.poems = poems;
            
            // 重建网格
            this.gameState.grid = Array(100).fill(null).map(() => Array(100).fill(null));
            poems.forEach(poem => this.gameState.updateGrid(poem));
            
            this.gameState.isFirstPoem = poems.length === 0;
            this.gameState.updateUI();
        } catch (error) {
            console.error('加载游戏数据失败:', error);
        }
    }

    // 古风淡雅的诗句轮播
    startPoemRotation() {
        const subtitleEl = document.getElementById('subtitle');
        if (!subtitleEl) return;

        const applyLine = (text) => {
            subtitleEl.classList.remove('fade-in');
            subtitleEl.classList.add('fade-out');
            setTimeout(() => {
                subtitleEl.textContent = text;
                subtitleEl.classList.remove('fade-out');
                subtitleEl.classList.add('fade-in');
            }, 600);
        };

        // 初始淡入
        subtitleEl.classList.add('fade-in');

        // 轮播计时器（10s）
        setInterval(() => {
            this.currentPoemIndex = (this.currentPoemIndex + 1) % this.poemLines.length;
            applyLine(this.poemLines[this.currentPoemIndex]);
        }, 10000);
    }

    // 移动端布局初始化
    initMobileLayout() {
        // 检测是否为移动设备
        this.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        if (this.isMobile) {
            // 添加屏幕方向变化监听
            window.addEventListener('orientationchange', () => {
                setTimeout(() => {
                    this.handleOrientationChange();
                }, 100);
            });
            
            // 添加窗口大小变化监听
            window.addEventListener('resize', () => {
                this.handleOrientationChange();
            });
            
            // 初始布局设置
            this.handleOrientationChange();
            
            // 添加触摸优化
            this.optimizeTouchEvents();
        }
    }

    // 处理屏幕方向变化
    handleOrientationChange() {
        const isPortrait = window.innerHeight > window.innerWidth;
        const gameContainer = document.getElementById('gameContainer');
        
        if (gameContainer) {
            if (isPortrait) {
                gameContainer.classList.add('portrait-mode');
                gameContainer.classList.remove('landscape-mode');
            } else {
                gameContainer.classList.add('landscape-mode');
                gameContainer.classList.remove('portrait-mode');
            }
        }
        
        // 重新调整画布大小
        setTimeout(() => {
            if (this.gameState && this.gameState.canvas) {
                this.gameState.resizeCanvas();
            }
        }, 200);
    }

    // 优化触摸事件
    optimizeTouchEvents() {
        // 防止双击缩放
        let lastTouchEnd = 0;
        document.addEventListener('touchend', (event) => {
            const now = (new Date()).getTime();
            if (now - lastTouchEnd <= 300) {
                event.preventDefault();
            }
            lastTouchEnd = now;
        }, false);
        
        // 优化触摸滚动
        document.addEventListener('touchmove', (event) => {
            // 允许在可滚动元素上滚动
            const target = event.target;
            const scrollableParent = target.closest('.control-area, .control-panel');
            if (!scrollableParent) {
                event.preventDefault();
            }
        }, { passive: false });
    }

    // 分享功能：截图并下载
    async shareGame() {
        try {
            const canvas = document.getElementById('gameCanvas');
            if (!canvas) {
                this.gameState.showToast('无法获取游戏画布', 'error');
                return;
            }

            // 显示加载提示
            this.gameState.showToast('正在生成图片...', 'info');

            // 创建高分辨率画布
            const originalWidth = canvas.width;
            const originalHeight = canvas.height;
            const scale = 2; // 提高分辨率
            
            // 创建临时画布用于截图
            const tempCanvas = document.createElement('canvas');
            const tempCtx = tempCanvas.getContext('2d');
            tempCanvas.width = originalWidth * scale;
            tempCanvas.height = originalHeight * scale;
            
            // 设置白色背景
            tempCtx.fillStyle = '#ffffff';
            tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
            
            // 绘制原画布内容
            tempCtx.drawImage(canvas, 0, 0, tempCanvas.width, tempCanvas.height);
            
            // 添加水印信息
            tempCtx.fillStyle = '#666666';
            tempCtx.font = `${16 * scale}px Arial, sans-serif`;
            tempCtx.textAlign = 'right';
            tempCtx.textBaseline = 'bottom';
            
            const roomInfo = this.gameState.currentRoom ? `房间: ${this.gameState.currentRoom}` : '单人模式';
            const timestamp = new Date().toLocaleString('zh-CN');
            const watermark = `煎饼摊游戏 - ${roomInfo} - ${timestamp}`;
            
            tempCtx.fillText(watermark, tempCanvas.width - 20 * scale, tempCanvas.height - 20 * scale);
            
            // 转换为blob并下载
            tempCanvas.toBlob((blob) => {
                if (!blob) {
                    this.gameState.showToast('图片生成失败', 'error');
                    return;
                }
                
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `煎饼摊作品_${this.gameState.currentRoom || '单人'}_${Date.now()}.png`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
                
                this.gameState.showToast('图片已保存到下载文件夹', 'success');
            }, 'image/png', 0.9);
            
        } catch (error) {
            console.error('分享功能错误:', error);
            this.gameState.showToast('分享失败，请重试', 'error');
        }
    }

    // 新增：显示免责声明模态框
    showDisclaimerModal() {
        const modal = document.getElementById('disclaimerModal');
        if (modal) {
            modal.style.display = 'block';
        }
    }

    // 新增：隐藏免责声明模态框
    hideDisclaimerModal() {
        const modal = document.getElementById('disclaimerModal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    // 新增：显示注册模态框
    showRegisterModal() {
        const modal = document.getElementById('registerModal');
        if (modal) {
            modal.style.display = 'block';
        }
    }

    // 新增：隐藏注册模态框
    hideRegisterModal() {
        const modal = document.getElementById('registerModal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    // 新增：显示房间选择模态框
    showRoomModal() {
        const modal = document.getElementById('roomModal');
        if (modal) {
            modal.style.display = 'block';
        }
    }

    // 新增：隐藏房间选择模态框
    hideRoomModal() {
        const modal = document.getElementById('roomModal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    // 新增：显示游戏界面
    showGameInterface() {
        const gameContainer = document.getElementById('gameContainer');
        if (gameContainer) {
            gameContainer.style.display = 'grid';  // 使用grid布局
        }
        
        // 如果是管理员房间，显示管理员界面
        if (this.gameState.currentRoom === '207128' && this.gameState.currentUser && this.gameState.currentUser.username === '管理员') {
            this.showAdminInterface();
        } else {
            this.gameState.initCanvas();
            this.loadGameData();
        }
    }

    // 新增：显示管理员界面
    showAdminInterface() {
        // 隐藏游戏画布，显示管理员面板
        const gameCanvasWrapper = document.querySelector('.game-canvas-wrapper');
        if (gameCanvasWrapper) {
            gameCanvasWrapper.innerHTML = `
                <div class="admin-panel">
                    <div class="admin-header">
                        <h2>🏠 管理员控制台</h2>
                        <div class="admin-stats">
                            <div class="stat-item">
                                <span class="stat-label">总房间数:</span>
                                <span class="stat-value" id="totalRooms">0</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">总玩家数:</span>
                                <span class="stat-value" id="totalPlayers">0</span>
                            </div>
                        </div>
                    </div>
                    <div class="admin-content">
                        <div class="admin-section">
                            <h3>📊 房间监控</h3>
                            <div class="rooms-list" id="roomsList">
                                <div class="loading">加载中...</div>
                            </div>
                        </div>
                        <div class="admin-section">
                            <h3>🔄 操作</h3>
                            <div class="admin-actions">
                                <button id="refreshRoomsBtn" class="btn btn-primary">刷新房间信息</button>
                                <button id="cleanupRoomsBtn" class="btn btn-secondary">清理空房间</button>
                                <button id="testDeleteBtn" class="btn btn-danger">测试删除功能</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
            // 绑定管理员按钮事件
            this.bindAdminEvents();
            
            // 请求房间信息
            setTimeout(() => {
                this.gameState.requestAdminRoomsInfo();
            }, 1000);
            
            // 设置定期刷新
            this.adminRefreshInterval = setInterval(() => {
                this.gameState.requestAdminRoomsInfo();
            }, 10000); // 每10秒刷新一次
        }
    }

    // 新增：绑定管理员事件
    bindAdminEvents() {
        const refreshBtn = document.getElementById('refreshRoomsBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.gameState.requestAdminRoomsInfo();
            });
        }
        
        const cleanupBtn = document.getElementById('cleanupRoomsBtn');
        if (cleanupBtn) {
            cleanupBtn.addEventListener('click', () => {
                if (confirm('确定要清理所有空房间吗？')) {
                    this.gameState.showToast('清理功能开发中...', 'info');
                }
            });
        }
        
        const testDeleteBtn = document.getElementById('testDeleteBtn');
        if (testDeleteBtn) {
            testDeleteBtn.addEventListener('click', () => {
                console.log('测试删除功能按钮被点击');
                this.gameState.showToast('删除功能测试：请检查控制台日志', 'info');
                // 测试删除一个不存在的房间
                this.deleteRoom('999999');
            });
        }
    }

    bindEvents() {
        // 免责声明相关事件
        const acceptDisclaimerBtn = document.getElementById('acceptDisclaimer');
        if (acceptDisclaimerBtn) {
            acceptDisclaimerBtn.addEventListener('click', () => this.handleAcceptDisclaimer());
        }
        
        const rejectDisclaimerBtn = document.getElementById('rejectDisclaimer');
        if (rejectDisclaimerBtn) {
            rejectDisclaimerBtn.addEventListener('click', () => this.handleRejectDisclaimer());
        }

        // 用户注册相关事件
        const registerBtn = document.getElementById('registerBtn');
        if (registerBtn) {
            registerBtn.addEventListener('click', () => {
                this.handleRegister();
            });
        }

        const usernameInput = document.getElementById('usernameInput');
        if (usernameInput) {
            usernameInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.handleRegister();
                }
            });
        }

        // 房间相关事件
        const createRoomBtn = document.getElementById('createRoomBtn');
        if (createRoomBtn) {
            createRoomBtn.addEventListener('click', () => {
                this.handleCreateRoom();
            });
        }

        const joinRoomBtn = document.getElementById('joinRoomBtn');
        if (joinRoomBtn) {
            joinRoomBtn.addEventListener('click', () => {
                this.showJoinRoomInput();
            });
        }

        const confirmJoinBtn = document.getElementById('confirmJoinBtn');
        if (confirmJoinBtn) {
            confirmJoinBtn.addEventListener('click', () => {
                this.handleJoinRoom();
            });
        }

        const roomCodeInput = document.getElementById('roomCodeInput');
        if (roomCodeInput) {
            roomCodeInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.handleJoinRoom();
                }
            });
        }

        // 离开房间按钮
        const leaveRoomBtn = document.getElementById('leaveRoomBtn');
        if (leaveRoomBtn) {
            leaveRoomBtn.addEventListener('click', () => {
                this.handleLeaveRoom();
            });
        }

        // 输入新诗句按钮
        const addPoemBtn = document.getElementById('addPoemBtn');
        if (addPoemBtn) {
            addPoemBtn.addEventListener('click', () => {
                this.handleAddPoem();
            });
        }

        // 清除选择按钮
        const clearSelectionBtn = document.getElementById('clearSelectionBtn');
        if (clearSelectionBtn) {
            clearSelectionBtn.addEventListener('click', () => {
                this.gameState.clearSelection();
            });
        }

        // 重置游戏按钮
        const resetBtn = document.getElementById('resetBtn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                this.handleResetGame();
            });
        }

        // 分享按钮
        const shareBtn = document.getElementById('shareBtn');
        if (shareBtn) {
            shareBtn.addEventListener('click', () => {
                this.shareGame();
            });
        }

        // 颜色选择器
        const colorOptions = document.querySelectorAll('.color-option');
        colorOptions.forEach(option => {
            option.addEventListener('click', () => {
                const color = option.dataset.color;
                if (color) {
                    this.gameState.setSelectedColor(color);
                }
            });
        });

        // 自定义颜色选择器
        const customColorPicker = document.getElementById('customColorPicker');
        if (customColorPicker) {
            customColorPicker.addEventListener('change', (e) => {
                this.gameState.setSelectedColor(e.target.value);
            });
        }

        // 诗句输入框
        const poemInput = document.getElementById('poemInput');
        if (poemInput) {
            poemInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.handleAddPoem();
                }
            });

            poemInput.addEventListener('input', (e) => {
                const charCount = document.getElementById('currentChars');
                if (charCount) {
                    charCount.textContent = e.target.value.length;
                }
            });
        }
    }

    // 新增：处理接受免责声明
    handleAcceptDisclaimer() {
        this.hideDisclaimerModal();
        this.showRegisterModal();
    }

    // 新增：处理拒绝免责声明
    handleRejectDisclaimer() {
        // 显示拒绝消息
        alert('感谢您的访问！由于您不同意免责声明，无法继续使用本平台。\n\n如有疑问，请联系管理员。');
        
        // 可以选择关闭页面或显示其他内容
        // window.close(); // 如果是在弹窗中打开的话
        // 或者显示一个简单的页面
        document.body.innerHTML = `
            <div style="display: flex; justify-content: center; align-items: center; height: 100vh; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-align: center; font-family: Arial, sans-serif;">
                <div>
                    <h1>感谢您的访问</h1>
                    <p>由于您不同意免责声明，无法继续使用本平台。</p>
                    <p>如有疑问，请联系管理员。</p>
                    <button onclick="location.reload()" style="padding: 10px 20px; background: white; color: #667eea; border: none; border-radius: 5px; cursor: pointer; margin-top: 20px;">
                        重新考虑
                    </button>
                </div>
            </div>
        `;
    }

    // 新增：处理用户注册
    async handleRegister() {
        const usernameInput = document.getElementById('usernameInput');
        if (!usernameInput) return;

        const username = usernameInput.value.trim();
        if (!username) {
            this.gameState.showToast('请输入用户名', 'error');
            return;
        }

        const success = await this.gameState.registerUser(username);
        if (success) {
            this.hideRegisterModal();
            this.showRoomModal();
        }
    }

    // 新增：处理创建房间
    async handleCreateRoom() {
        const success = await this.gameState.createRoom();
        if (success) {
            this.hideRoomModal();
            this.showGameInterface();
        }
    }

    // 新增：显示加入房间输入框
    showJoinRoomInput() {
        const joinRoomInput = document.getElementById('joinRoomInput');
        if (joinRoomInput) {
            joinRoomInput.style.display = 'block';
        }
    }

    // 新增：处理加入房间
    async handleJoinRoom() {
        const roomCodeInput = document.getElementById('roomCodeInput');
        if (!roomCodeInput) return;

        const roomCode = roomCodeInput.value.trim();
        if (!roomCode) {
            this.gameState.showToast('请输入房间码', 'error');
            return;
        }

        if (roomCode.length !== 6) {
            this.gameState.showToast('房间码必须是6位数字', 'error');
            return;
        }

        const success = await this.gameState.joinRoom(roomCode);
        if (success) {
            this.hideRoomModal();
            this.showGameInterface();
        }
    }

    // 新增：处理离开房间
    handleLeaveRoom() {
        if (confirm('确定要离开房间吗？')) {
            this.gameState.leaveSocketRoom();
            this.gameState.currentRoom = null;
            this.gameState.currentUser = null;
            
            // 清理管理员刷新定时器
            if (this.adminRefreshInterval) {
                clearInterval(this.adminRefreshInterval);
                this.adminRefreshInterval = null;
            }
            
            // 隐藏游戏界面
            const gameContainer = document.getElementById('gameContainer');
            if (gameContainer) {
                gameContainer.style.display = 'none';
            }
            
            // 显示房间选择界面
            this.showRoomModal();
        }
    }

    async handleAddPoem() {
        const input = document.getElementById('poemInput');
        if (!input) return;

        const text = input.value.trim();
        
        if (!text) {
            this.gameState.showToast('请输入诗句', 'error');
            return;
        }

        if (text.length > 30) {
            this.gameState.showToast('诗句长度不能超过30字', 'error');
            return;
        }

        try {
            const color = this.gameState.getSelectedColor();
            const direction = this.gameState.currentDirection;
            
            // 确定起始位置 - 修改为(45,45)
            let startPosition;
            if (this.gameState.isFirstPoem) {
                // 第一句诗放在(45,45)位置
                startPosition = { x: 45, y: 45 };
                
                // 检查第一句诗是否与已有内容重叠（虽然通常不会有）
                console.log('检查第一句诗重叠...');
                if (this.gameState.wouldOverlapExistingPoem(text, direction, startPosition, null)) {
                    console.log('第一句诗重叠检测失败');
                    this.gameState.showToast('起始位置已被占用，请重置游戏', 'error');
                    return;
                }
                console.log('第一句诗重叠检测通过');
            } else {
                // 后续诗句需要选择位置
                this.gameState.showToast('请点击网格中的位置来放置诗句', 'info');
                return;
            }

            const poemData = {
                id: 'poem_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                text: text,
                direction: direction,
                startPosition: startPosition,
                color: color,
                connectedTo: []
            };

            // 通过API添加到房间
            const result = await ApiService.addPoem(this.gameState.currentRoom, poemData);
            if (result.success) {
                // 添加到本地状态
                this.gameState.addPoem(result.poem);
                
                // 清空输入框
                input.value = '';
                
                // 更新字符计数
                const charCount = document.getElementById('currentChars');
                if (charCount) {
                    charCount.textContent = '0';
                }
                
                // 第一句诗添加完成后，重置方向为横向，为下次接龙做准备
                this.gameState.currentDirection = 'horizontal';
                this.gameState.isFirstPoem = false;
                
                this.gameState.showToast('诗句添加成功', 'success');
            } else {
                this.gameState.showToast(result.message || '添加诗句失败', 'error');
            }
        } catch (error) {
            this.gameState.showToast('添加诗句失败', 'error');
        }
    }

    async handleResetGame() {
        if (confirm('确定要重置游戏吗？所有数据将丢失。')) {
            try {
                const result = await ApiService.resetGame(this.gameState.currentRoom);
                if (result.success) {
                    this.gameState.reset();
                } else {
                    this.gameState.showToast(result.message || '重置失败', 'error');
                }
            } catch (error) {
                this.gameState.showToast('重置失败', 'error');
            }
        }
    }

    handleSaveGame() {
        // 这里可以实现保存功能，比如导出为图片或保存到本地
        this.gameState.showToast('保存功能开发中...', 'info');
    }
    
    // 测试重叠检测功能
    testOverlapDetection() {
        console.log('=== 测试重叠检测功能 ===');
        
        // 测试用例1：检查空位置
        const emptyPosition = { x: 50, y: 50 };
        const testText1 = '测试诗句';
        const result1 = this.gameState.wouldOverlapExistingPoem(testText1, 'horizontal', emptyPosition, null);
        console.log('测试1 - 空位置横向:', { text: testText1, position: emptyPosition, result: result1 });
        
        // 测试用例2：检查已有诗句位置（不允许重叠）
        if (this.gameState.poems.length > 0) {
            const firstPoem = this.gameState.poems[0];
            const overlapPosition = { ...firstPoem.startPosition };
            const testText2 = '重叠测试';
            const result2 = this.gameState.wouldOverlapExistingPoem(testText2, 'horizontal', overlapPosition, null);
            console.log('测试2 - 重叠位置:', { text: testText2, position: overlapPosition, result: result2 });
        }
        
        // 测试用例3：检查边界
        const boundaryPosition = { x: 98, y: 50 };
        const testText3 = '边界测试';
        const result3 = this.gameState.wouldOverlapExistingPoem(testText3, 'horizontal', boundaryPosition, null);
        console.log('测试3 - 边界位置:', { text: testText3, position: boundaryPosition, result: result3 });
        
        // 测试用例4：检查允许重叠的连接字符位置
        if (this.gameState.poems.length > 0) {
            const firstPoem = this.gameState.poems[0];
            const connectPosition = { x: firstPoem.startPosition.x + 1, y: firstPoem.startPosition.y }; // 假设第二个字符
            const testText4 = '连接测试';
            const result4 = this.gameState.wouldOverlapExistingPoem(testText4, 'vertical', connectPosition, connectPosition);
            console.log('测试4 - 连接字符位置:', { text: testText4, position: connectPosition, result: result4 });
        }
        
        this.gameState.showToast('重叠检测测试完成，请查看控制台', 'info');
    }
}

// 页面加载完成后初始化游戏
let game;
document.addEventListener('DOMContentLoaded', () => {
    game = new JianbingGame();
});
