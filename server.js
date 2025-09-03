const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

// 配置
const config = {
    port: process.env.PORT || 3000,
    inboxPath: process.env.INBOX_PATH || path.join(__dirname, '..', 'inbox.md'),
    outboxPath: process.env.OUTBOX_PATH || path.join(__dirname, '..', 'outbox.md'),
    corsOrigin: process.env.CORS_ORIGIN || '*',
    logLevel: process.env.LOG_LEVEL || 'info',
    wsHeartbeat: parseInt(process.env.WS_HEARTBEAT_INTERVAL) || 30000,
    rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000,
    rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100
};

// 创建Express应用
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// 中间件
app.use(cors({
    origin: config.corsOrigin,
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// 生产环境安全头
if (process.env.NODE_ENV === 'production') {
    app.use((req, res, next) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('X-XSS-Protection', '1; mode=block');
        next();
    });
}

// 存储WebSocket连接
const clients = new Set();

// 工具函数
function log(message) {
    const timestamp = new Date().toLocaleString('zh-CN');
    console.log(`[${timestamp}] ${message}`);
}

function generateTaskId() {
    return Date.now().toString();
}

function formatTaskForMarkdown(taskData) {
    const taskId = generateTaskId();
    const deadline = taskData.deadline || '未设定';
    const expected = taskData.expected || '无特殊要求';
    const notes = taskData.notes || '无';
    
    return `
### 任务 ${taskId} - ${taskData.title}
**优先级**: ${taskData.priority}
**截止时间**: ${deadline}
**状态**: 待处理

**任务描述**:
${taskData.description}

**预期结果**:
${expected}

**备注**:
${notes}

---
`;
}

function validateTaskData(taskData) {
    if (!taskData.title || !taskData.description) {
        return { valid: false, message: '任务标题和描述不能为空' };
    }
    
    if (taskData.title.length > 200) {
        return { valid: false, message: '任务标题过长（最多200字符）' };
    }
    
    if (taskData.description.length > 2000) {
        return { valid: false, message: '任务描述过长（最多2000字符）' };
    }
    
    return { valid: true };
}

function sanitizeInput(text) {
    if (typeof text !== 'string') return '';
    return text.replace(/[<>"'&]/g, function(match) {
        const map = {
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;',
            '&': '&amp;'
        };
        return map[match];
    });
}

// 文件操作函数
function readFile(filePath) {
    try {
        if (!fs.existsSync(filePath)) {
            log(`文件不存在，创建: ${filePath}`);
            fs.writeFileSync(filePath, '', 'utf8');
            return '';
        }
        return fs.readFileSync(filePath, 'utf8');
    } catch (error) {
        log(`读取文件失败: ${filePath}, 错误: ${error.message}`);
        throw error;
    }
}

function writeFile(filePath, content) {
    try {
        fs.writeFileSync(filePath, content, 'utf8');
        log(`文件写入成功: ${filePath}`);
    } catch (error) {
        log(`写入文件失败: ${filePath}, 错误: ${error.message}`);
        throw error;
    }
}

function appendToFile(filePath, content) {
    try {
        fs.appendFileSync(filePath, content, 'utf8');
        log(`文件追加成功: ${filePath}`);
    } catch (error) {
        log(`追加文件失败: ${filePath}, 错误: ${error.message}`);
        throw error;
    }
}

// WebSocket连接处理
wss.on('connection', function connection(ws, request) {
    log(`新的WebSocket连接: ${request.socket.remoteAddress}`);
    clients.add(ws);
    
    // 发送当前状态
    try {
        const outboxContent = readFile(config.outboxPath);
        ws.send(JSON.stringify({
            type: 'status-update',
            content: outboxContent
        }));
    } catch (error) {
        log(`发送初始状态失败: ${error.message}`);
    }
    
    ws.on('close', function() {
        log('WebSocket连接关闭');
        clients.delete(ws);
    });
    
    ws.on('error', function(error) {
        log(`WebSocket错误: ${error.message}`);
        clients.delete(ws);
    });
});

// 广播消息给所有客户端
function broadcast(message) {
    const messageStr = JSON.stringify(message);
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            try {
                client.send(messageStr);
            } catch (error) {
                log(`广播消息失败: ${error.message}`);
                clients.delete(client);
            }
        }
    });
}

// API路由

// 获取任务列表
app.get('/api/tasks', (req, res) => {
    try {
        log('获取任务列表请求');
        
        // 这里可以解析inbox.md文件来获取任务列表
        // 目前返回空数组，因为主要功能是添加任务
        res.json({
            success: true,
            data: [],
            message: '获取任务列表成功'
        });
    } catch (error) {
        log(`获取任务列表失败: ${error.message}`);
        res.status(500).json({
            success: false,
            message: '获取任务列表失败'
        });
    }
});

// 添加新任务
app.post('/api/tasks', (req, res) => {
    try {
        log('收到添加任务请求');
        
        const taskData = req.body;
        
        // 验证数据
        const validation = validateTaskData(taskData);
        if (!validation.valid) {
            return res.status(400).json({
                success: false,
                message: validation.message
            });
        }
        
        // 清理输入数据
        const cleanTaskData = {
            title: sanitizeInput(taskData.title),
            description: sanitizeInput(taskData.description),
            priority: taskData.priority || '中',
            deadline: taskData.deadline || '',
            expected: sanitizeInput(taskData.expected || ''),
            notes: sanitizeInput(taskData.notes || '')
        };
        
        // 格式化任务为Markdown
        const taskMarkdown = formatTaskForMarkdown(cleanTaskData);
        
        // 读取当前inbox.md内容
        let inboxContent = readFile(config.inboxPath);
        
        // 查找"待处理任务"部分并插入新任务
        const waitingTasksRegex = /(## 待处理任务\s*)(\*目前没有新任务\*)?/;
        const match = inboxContent.match(waitingTasksRegex);
        
        if (match) {
            // 替换"目前没有新任务"或在待处理任务部分后添加
            const replacement = match[1] + taskMarkdown;
            inboxContent = inboxContent.replace(waitingTasksRegex, replacement);
        } else {
            // 如果找不到待处理任务部分，直接追加
            inboxContent += taskMarkdown;
        }
        
        // 写入文件
        writeFile(config.inboxPath, inboxContent);
        
        // 广播任务添加通知
        broadcast({
            type: 'task-added',
            task: cleanTaskData
        });
        
        log(`任务添加成功: ${cleanTaskData.title}`);
        
        res.json({
            success: true,
            message: '任务添加成功'
        });
        
    } catch (error) {
        log(`添加任务失败: ${error.message}`);
        res.status(500).json({
            success: false,
            message: '添加任务失败，请重试'
        });
    }
});

// 获取智能体状态
app.get('/api/status', (req, res) => {
    try {
        log('获取状态请求');
        
        const outboxContent = readFile(config.outboxPath);
        
        res.json({
            success: true,
            data: outboxContent,
            message: '获取状态成功'
        });
    } catch (error) {
        log(`获取状态失败: ${error.message}`);
        res.status(500).json({
            success: false,
            message: '获取状态失败'
        });
    }
});

// 健康检查
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// 错误处理中间件
app.use((error, req, res, next) => {
    log(`服务器错误: ${error.message}`);
    res.status(500).json({
        success: false,
        message: '服务器内部错误'
    });
});

// 404处理
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: '接口不存在'
    });
});

// 监控outbox.md文件变化
function watchOutboxFile() {
    try {
        if (fs.existsSync(config.outboxPath)) {
            fs.watchFile(config.outboxPath, { interval: 1000 }, (curr, prev) => {
                if (curr.mtime !== prev.mtime) {
                    log('检测到outbox.md文件变化');
                    try {
                        const content = readFile(config.outboxPath);
                        broadcast({
                            type: 'status-update',
                            content: content
                        });
                    } catch (error) {
                        log(`读取outbox.md失败: ${error.message}`);
                    }
                }
            });
            log('开始监控outbox.md文件变化');
        } else {
            log('outbox.md文件不存在，创建空文件');
            writeFile(config.outboxPath, '');
            // 递归调用以开始监控
            setTimeout(watchOutboxFile, 1000);
        }
    } catch (error) {
        log(`监控文件失败: ${error.message}`);
    }
}

// 启动服务器
server.listen(config.port, () => {
    log(`服务器启动成功`);
    log(`HTTP服务: http://localhost:${config.port}`);
    log(`WebSocket服务: ws://localhost:${config.port}`);
    log(`Inbox文件: ${config.inboxPath}`);
    log(`Outbox文件: ${config.outboxPath}`);
    
    // 开始监控文件变化
    watchOutboxFile();
});

// 优雅关闭
process.on('SIGTERM', () => {
    log('收到SIGTERM信号，正在关闭服务器...');
    server.close(() => {
        log('服务器已关闭');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    log('收到SIGINT信号，正在关闭服务器...');
    server.close(() => {
        log('服务器已关闭');
        process.exit(0);
    });
});

// 未捕获异常处理
process.on('uncaughtException', (error) => {
    log(`未捕获异常: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    log(`未处理的Promise拒绝: ${reason}`);
    console.error('Promise:', promise);
});

module.exports = { app, server, wss };