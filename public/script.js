// 全局变量
let ws = null;
let taskHistory = [];

// DOM元素
const taskForm = document.getElementById('taskForm');
const statusContent = document.getElementById('statusContent');
const statusDot = document.getElementById('statusDot');
const connectionStatus = document.getElementById('connectionStatus');
const taskHistoryContainer = document.getElementById('taskHistory');
const messageToast = document.getElementById('messageToast');
const fileUploadArea = document.getElementById('fileUploadArea');
const fileInput = document.getElementById('taskAttachments');
const fileList = document.getElementById('fileList');

// 文件上传相关变量
let selectedFiles = [];

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

// 标签切换功能
function switchTab(tabName) {
    // 移除所有活动状态
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    // 激活选中的标签
    event.target.classList.add('active');
    document.getElementById(tabName === 'pending' ? 'pendingTasks' : 
                          tabName === 'completed' ? 'completedTasks' : 'rawContent').classList.add('active');
    
    // 如果是第一次加载该标签，则加载内容
    if (tabName === 'pending' && !document.getElementById('pendingTasks').dataset.loaded) {
        loadPendingTasks();
    } else if (tabName === 'completed' && !document.getElementById('completedTasks').dataset.loaded) {
        loadCompletedTasks();
    } else if (tabName === 'raw' && !document.getElementById('rawContent').dataset.loaded) {
        loadRawContent();
    }
}

// 初始化应用
function initializeApp() {
    setupFormSubmission();
    setupFileUpload();
    connectWebSocket();
    loadInitialData();
    setupDateDefault();
    // 默认加载待处理任务
    loadPendingTasks();
}

// 设置表单提交
function setupFormSubmission() {
    taskForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const formData = new FormData();
        
        // 添加表单字段
        formData.append('title', document.getElementById('taskTitle').value.trim());
        formData.append('description', document.getElementById('taskDescription').value.trim());
        formData.append('priority', document.getElementById('taskPriority').value);
        formData.append('deadline', document.getElementById('taskDeadline').value);
        formData.append('expected', document.getElementById('taskExpected').value.trim());
        formData.append('notes', document.getElementById('taskNotes').value.trim());
        
        // 添加文件
        selectedFiles.forEach(file => {
            formData.append('attachments', file);
        });
        
        // 验证必填字段
        if (!formData.get('title') || !formData.get('description')) {
            showMessage('请填写任务标题和描述', 'error');
            return;
        }
        
        try {
            await submitTaskWithFiles(formData);
        } catch (error) {
            console.error('提交任务失败:', error);
            showMessage('提交任务失败，请重试', 'error');
        }
    });
}

// 提交任务（支持文件上传）
async function submitTaskWithFiles(formData) {
    try {
        const response = await fetch('/api/tasks', {
            method: 'POST',
            body: formData // 不设置Content-Type，让浏览器自动设置multipart/form-data
        });
        
        const result = await response.json();
        
        if (result.success) {
            showMessage('任务提交成功！', 'success');
            taskForm.reset();
            clearFileList();
            setupDateDefault();
            
            // 添加到历史记录
            const taskData = {
                title: formData.get('title'),
                description: formData.get('description'),
                priority: formData.get('priority'),
                deadline: formData.get('deadline'),
                expected: formData.get('expected'),
                notes: formData.get('notes'),
                attachments: result.attachments || []
            };
            addTaskToHistory(taskData);
        } else {
            throw new Error(result.message || '提交失败');
        }
    } catch (error) {
        throw error;
    }
}

// 连接WebSocket
function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    try {
        ws = new WebSocket(wsUrl);
        
        ws.onopen = function() {
            updateConnectionStatus(true);
            showMessage('已连接到智能体', 'success');
        };
        
        ws.onmessage = function(event) {
            try {
                const data = JSON.parse(event.data);
                handleWebSocketMessage(data);
            } catch (error) {
                console.error('解析WebSocket消息失败:', error);
            }
        };
        
        ws.onclose = function() {
            updateConnectionStatus(false);
            showMessage('与智能体连接断开', 'error');
            // 5秒后尝试重连
            setTimeout(connectWebSocket, 5000);
        };
        
        ws.onerror = function(error) {
            console.error('WebSocket错误:', error);
            updateConnectionStatus(false);
        };
    } catch (error) {
        console.error('WebSocket连接失败:', error);
        updateConnectionStatus(false);
    }
}

// 处理WebSocket消息
function handleWebSocketMessage(data) {
    if (data.type === 'status-update') {
        updateStatusContent(data.content);
    } else if (data.type === 'task-added') {
        showMessage('任务已添加到智能体队列', 'info');
    }
}

// 更新连接状态
function updateConnectionStatus(connected) {
    if (connected) {
        statusDot.className = 'status-dot connected';
        connectionStatus.textContent = '已连接到智能体';
    } else {
        statusDot.className = 'status-dot disconnected';
        connectionStatus.textContent = '连接断开';
    }
}

// 更新状态内容
function updateStatusContent(content) {
    statusContent.textContent = content;
    statusContent.scrollTop = statusContent.scrollHeight;
}

// 加载初始数据
async function loadInitialData() {
    try {
        // 加载智能体状态
        const statusResponse = await fetch('/api/status');
        const statusResult = await statusResponse.json();
        
        if (statusResult.success) {
            updateStatusContent(statusResult.data);
        }
        
        // 加载任务历史
        const tasksResponse = await fetch('/api/tasks');
        const tasksResult = await tasksResponse.json();
        
        if (tasksResult.success && tasksResult.data.length > 0) {
            taskHistory = tasksResult.data;
            renderTaskHistory();
        }
    } catch (error) {
        console.error('加载初始数据失败:', error);
        showMessage('加载数据失败', 'error');
    }
}

// 添加任务到历史记录
function addTaskToHistory(taskData) {
    const task = {
        ...taskData,
        id: Date.now(),
        timestamp: new Date().toLocaleString('zh-CN')
    };
    
    taskHistory.unshift(task);
    
    // 只保留最近10个任务
    if (taskHistory.length > 10) {
        taskHistory = taskHistory.slice(0, 10);
    }
    
    renderTaskHistory();
}

// 渲染任务历史
function renderTaskHistory() {
    if (taskHistory.length === 0) {
        taskHistoryContainer.innerHTML = '<p class="no-tasks">暂无任务历史</p>';
        return;
    }
    
    const historyHtml = taskHistory.map(task => `
        <div class="task-item priority-${task.priority === '高' ? 'high' : task.priority === '中' ? 'medium' : 'low'}">
            <h4>${escapeHtml(task.title)}</h4>
            <p>${escapeHtml(task.description)}</p>
            <div class="task-meta">
                <span>优先级: ${task.priority}</span>
                <span>提交时间: ${task.timestamp}</span>
                ${task.deadline ? `<span>截止: ${task.deadline}</span>` : ''}
            </div>
        </div>
    `).join('');
    
    taskHistoryContainer.innerHTML = historyHtml;
}

// 设置默认日期（明天）
function setupDateDefault() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateString = tomorrow.toISOString().split('T')[0];
    document.getElementById('taskDeadline').value = dateString;
}

// 显示消息提示
function showMessage(message, type = 'info') {
    messageToast.textContent = message;
    messageToast.className = `message-toast ${type} show`;
    
    setTimeout(() => {
        messageToast.classList.remove('show');
    }, 3000);
}

// HTML转义函数
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 加载待处理任务
async function loadPendingTasks() {
    try {
        const response = await fetch('/api/inbox-content');
        const result = await response.json();
        
        if (result.success) {
            const pendingContainer = document.getElementById('pendingTasks');
            const pendingTasks = result.data.pendingTasks;
            
            if (pendingTasks && pendingTasks.length > 0) {
                pendingContainer.innerHTML = pendingTasks.map(task => `
                    <div class="task-section">
                        <h4>${escapeHtml(task.title)} <span class="status-badge status-pending">待处理</span></h4>
                        <p><strong>描述:</strong> ${escapeHtml(task.description)}</p>
                        ${task.priority ? `<p><strong>优先级:</strong> ${escapeHtml(task.priority)}</p>` : ''}
                        ${task.deadline ? `<p><strong>截止时间:</strong> ${escapeHtml(task.deadline)}</p>` : ''}
                        ${task.expected ? `<p><strong>预期结果:</strong> ${escapeHtml(task.expected)}</p>` : ''}
                        ${task.notes ? `<p><strong>备注:</strong> ${escapeHtml(task.notes)}</p>` : ''}
                    </div>
                `).join('');
            } else {
                pendingContainer.innerHTML = '<p class="loading">目前没有待处理任务</p>';
            }
            
            pendingContainer.dataset.loaded = 'true';
        }
    } catch (error) {
        console.error('加载待处理任务失败:', error);
        document.getElementById('pendingTasks').innerHTML = '<p class="loading">加载失败，请稍后重试</p>';
    }
}

// 加载已处理任务
async function loadCompletedTasks() {
    try {
        const response = await fetch('/api/inbox-content');
        const result = await response.json();
        
        if (result.success) {
            const completedContainer = document.getElementById('completedTasks');
            const completedTasks = result.data.completedTasks;
            
            if (completedTasks && completedTasks.length > 0) {
                completedContainer.innerHTML = completedTasks.map(task => `
                    <div class="task-section">
                        <h4>${escapeHtml(task.title)} <span class="status-badge status-completed">已完成</span></h4>
                        <p><strong>完成时间:</strong> ${escapeHtml(task.completedTime || '未知')}</p>
                        <p><strong>描述:</strong> ${escapeHtml(task.description)}</p>
                        ${task.priority ? `<p><strong>优先级:</strong> ${escapeHtml(task.priority)}</p>` : ''}
                        ${task.deliverables ? `
                            <div>
                                <strong>交付成果:</strong>
                                <ul>
                                    ${task.deliverables.map(item => `<li>${escapeHtml(item)}</li>`).join('')}
                                </ul>
                            </div>
                        ` : ''}
                        ${task.techImplementation ? `
                            <div>
                                <strong>技术实现:</strong>
                                <ul>
                                    ${task.techImplementation.map(item => `<li>${escapeHtml(item)}</li>`).join('')}
                                </ul>
                            </div>
                        ` : ''}
                    </div>
                `).join('');
            } else {
                completedContainer.innerHTML = '<p class="loading">暂无已处理任务</p>';
            }
            
            completedContainer.dataset.loaded = 'true';
        }
    } catch (error) {
        console.error('加载已处理任务失败:', error);
        document.getElementById('completedTasks').innerHTML = '<p class="loading">加载失败，请稍后重试</p>';
    }
}

// 加载原始内容
async function loadRawContent() {
    try {
        const response = await fetch('/api/inbox-raw');
        const result = await response.json();
        
        if (result.success) {
            const rawContainer = document.getElementById('rawContent');
            rawContainer.innerHTML = `<pre class="raw-content">${escapeHtml(result.data)}</pre>`;
            rawContainer.dataset.loaded = 'true';
        }
    } catch (error) {
        console.error('加载原始内容失败:', error);
        document.getElementById('rawContent').innerHTML = '<pre class="raw-content">加载失败，请稍后重试</pre>';
    }
}

// 设置文件上传功能
function setupFileUpload() {
    // 文件选择事件
    fileInput.addEventListener('change', function(e) {
        handleFileSelect(e.target.files);
    });
    
    // 拖拽上传
    fileUploadArea.addEventListener('dragover', function(e) {
        e.preventDefault();
        fileUploadArea.classList.add('dragover');
    });
    
    fileUploadArea.addEventListener('dragleave', function(e) {
        e.preventDefault();
        fileUploadArea.classList.remove('dragover');
    });
    
    fileUploadArea.addEventListener('drop', function(e) {
        e.preventDefault();
        fileUploadArea.classList.remove('dragover');
        handleFileSelect(e.dataTransfer.files);
    });
}

// 处理文件选择
function handleFileSelect(files) {
    const maxFiles = 5;
    const maxSize = 10 * 1024 * 1024; // 10MB
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf', 
                         'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                         'text/plain', 'application/zip', 'application/x-rar-compressed',
                         'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                         'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'];
    
    // 检查文件数量
    if (selectedFiles.length + files.length > maxFiles) {
        showMessage(`最多只能上传${maxFiles}个文件`, 'error');
        return;
    }
    
    // 验证每个文件
    for (let file of files) {
        // 检查文件大小
        if (file.size > maxSize) {
            showMessage(`文件 "${file.name}" 超过10MB限制`, 'error');
            continue;
        }
        
        // 检查文件类型
        if (!allowedTypes.includes(file.type) && !isAllowedExtension(file.name)) {
            showMessage(`文件 "${file.name}" 类型不支持`, 'error');
            continue;
        }
        
        // 检查是否已存在
        if (selectedFiles.some(f => f.name === file.name && f.size === file.size)) {
            showMessage(`文件 "${file.name}" 已存在`, 'warning');
            continue;
        }
        
        selectedFiles.push(file);
    }
    
    updateFileList();
    fileInput.value = ''; // 清空input，允许重复选择同一文件
}

// 检查文件扩展名
function isAllowedExtension(filename) {
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.pdf', '.doc', '.docx', 
                              '.txt', '.zip', '.rar', '.xlsx', '.xls', '.ppt', '.pptx'];
    const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));
    return allowedExtensions.includes(ext);
}

// 更新文件列表显示
function updateFileList() {
    if (selectedFiles.length === 0) {
        fileList.innerHTML = '';
        return;
    }
    
    const html = selectedFiles.map((file, index) => `
        <div class="file-item">
            <div class="file-info">
                <span class="file-name">${file.name}</span>
                <span class="file-size">(${formatFileSize(file.size)})</span>
            </div>
            <button type="button" class="file-remove" onclick="removeFile(${index})">
                删除
            </button>
        </div>
    `).join('');
    
    fileList.innerHTML = html;
}

// 删除文件
function removeFile(index) {
    selectedFiles.splice(index, 1);
    updateFileList();
}

// 清空文件列表
function clearFileList() {
    selectedFiles = [];
    updateFileList();
}

// 格式化文件大小
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// 页面卸载时关闭WebSocket连接
window.addEventListener('beforeunload', function() {
    if (ws) {
        ws.close();
    }
});

// 错误处理
window.addEventListener('error', function(event) {
    console.error('页面错误:', event.error);
    showMessage('页面发生错误，请刷新重试', 'error');
});

// 网络状态监听
window.addEventListener('online', function() {
    showMessage('网络已连接', 'success');
    if (!ws || ws.readyState === WebSocket.CLOSED) {
        connectWebSocket();
    }
});

window.addEventListener('offline', function() {
    showMessage('网络连接断开', 'error');
});