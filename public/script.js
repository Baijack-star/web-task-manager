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

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

// 初始化应用
function initializeApp() {
    setupFormSubmission();
    connectWebSocket();
    loadInitialData();
    setupDateDefault();
}

// 设置表单提交
function setupFormSubmission() {
    taskForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const formData = new FormData(taskForm);
        const taskData = {
            title: formData.get('title').trim(),
            description: formData.get('description').trim(),
            priority: formData.get('priority'),
            deadline: formData.get('deadline'),
            expected: formData.get('expected').trim(),
            notes: formData.get('notes').trim()
        };
        
        // 验证必填字段
        if (!taskData.title || !taskData.description) {
            showMessage('请填写任务标题和描述', 'error');
            return;
        }
        
        try {
            await submitTask(taskData);
        } catch (error) {
            console.error('提交任务失败:', error);
            showMessage('提交任务失败，请重试', 'error');
        }
    });
}

// 提交任务
async function submitTask(taskData) {
    try {
        const response = await fetch('/api/tasks', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(taskData)
        });
        
        const result = await response.json();
        
        if (result.success) {
            showMessage('任务提交成功！', 'success');
            taskForm.reset();
            setupDateDefault();
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