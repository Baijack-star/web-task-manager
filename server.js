const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const multer = require('multer');

// 配置
const config = {
  port: process.env.PORT || 3000,
  // 默认指向上级目录（工作目录）的inbox.md和outbox.md
  inboxPath: process.env.INBOX_PATH || path.join(__dirname, '..', 'inbox.md'),
  outboxPath: process.env.OUTBOX_PATH || path.join(__dirname, '..', 'outbox.md'),
  uploadsPath: path.join(__dirname, 'uploads'),
  corsOrigin: process.env.CORS_ORIGIN || '*',
  logLevel: process.env.LOG_LEVEL || 'info',
  wsHeartbeat: parseInt(process.env.WS_HEARTBEAT) || 30000,
  rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW) || 900000,
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX) || 100
};

// 创建Express应用
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// 文件上传配置
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // 确保uploads目录存在
    if (!fs.existsSync(config.uploadsPath)) {
      fs.mkdirSync(config.uploadsPath, { recursive: true });
    }
    cb(null, config.uploadsPath);
  },
  filename: function (req, file, cb) {
    // 生成唯一文件名：时间戳_原文件名
    const timestamp = Date.now();
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    cb(null, `${timestamp}_${originalName}`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB限制
    files: 5 // 最多5个文件
  },
  fileFilter: function (req, file, cb) {
    // 允许的文件类型
    const allowedTypes = /\.(jpg|jpeg|png|gif|pdf|doc|docx|txt|zip|rar|xlsx|xls|ppt|pptx)$/i;
    if (allowedTypes.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('不支持的文件类型'));
    }
  }
});

// 中间件
app.use(cors({
    origin: config.corsOrigin,
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));
// 静态文件服务 - 用于文件下载
app.use('/uploads', express.static(config.uploadsPath));

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
    
    let attachmentSection = '';
    if (taskData.attachments && taskData.attachments.length > 0) {
        attachmentSection = '\n**附件**:\n';
        taskData.attachments.forEach(file => {
            attachmentSection += `- [${file.originalName}](/uploads/${file.filename}) (${(file.size / 1024).toFixed(1)}KB)\n`;
        });
    }
    
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
${notes}${attachmentSection}

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

// 解析inbox.md内容
function parseInboxContent(content) {
    const result = {
        pendingTasks: [],
        completedTasks: []
    };
    
    try {
        // 分割内容为不同部分
        const sections = content.split(/^## /m);
        
        sections.forEach(section => {
            const lines = section.trim().split('\n');
            const sectionTitle = lines[0];
            
            if (sectionTitle && sectionTitle.includes('待处理任务')) {
                // 解析待处理任务
                result.pendingTasks = parsePendingTasks(section);
            } else if (sectionTitle && sectionTitle.includes('已处理任务')) {
                // 解析已处理任务
                result.completedTasks = parseCompletedTasks(section);
            }
        });
        
    } catch (error) {
        log(`解析inbox内容失败: ${error.message}`);
    }
    
    return result;
}

// 解析待处理任务
function parsePendingTasks(section) {
    const tasks = [];
    const lines = section.split('\n');
    let currentTask = null;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // 检测任务标题（以###开头）
        if (line.startsWith('### ')) {
            if (currentTask) {
                tasks.push(currentTask);
            }
            currentTask = {
                title: line.replace('### ', '').trim(),
                description: '',
                priority: '',
                deadline: '',
                expected: '',
                notes: '',
                attachments: []
            };
        } else if (currentTask) {
            // 解析任务属性
            if (line.startsWith('**优先级**:')) {
                currentTask.priority = line.replace('**优先级**:', '').trim();
            } else if (line.startsWith('**截止时间**:')) {
                currentTask.deadline = line.replace('**截止时间**:', '').trim();
            } else if (line.startsWith('**任务描述**:')) {
                currentTask.description = line.replace('**任务描述**:', '').trim();
            } else if (line.startsWith('**预期结果**:')) {
                currentTask.expected = line.replace('**预期结果**:', '').trim();
            } else if (line.startsWith('**备注**:')) {
                currentTask.notes = line.replace('**备注**:', '').trim();
            } else if (line.startsWith('**附件**:')) {
                // 附件部分开始，下面的行将是附件链接
            } else if (line.startsWith('- [') && line.includes('](/uploads/')) {
                // 解析附件链接: - [filename](/uploads/actualfile) (size)
                const match = line.match(/- \[([^\]]+)\]\(([^\)]+)\)/);
                if (match) {
                    currentTask.attachments.push({
                        name: match[1],
                        url: match[2]
                    });
                }
            } else if (line && !line.startsWith('**') && !line.startsWith('---') && !line.startsWith('- [')) {
                // 如果是普通文本且不是属性行，添加到描述中
                if (currentTask.description) {
                    currentTask.description += ' ' + line;
                } else {
                    currentTask.description = line;
                }
            }
        }
    }
    
    if (currentTask) {
        tasks.push(currentTask);
    }
    
    return tasks;
}

// 解析已处理任务
function parseCompletedTasks(section) {
    const tasks = [];
    const lines = section.split('\n');
    let currentTask = null;
    let inDeliverables = false;
    let inTechImplementation = false;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // 检测任务标题（以###开头）
        if (line.startsWith('### ')) {
            if (currentTask) {
                tasks.push(currentTask);
            }
            currentTask = {
                title: line.replace('### ', '').replace(/\s*✅\s*$/, '').trim(),
                description: '',
                priority: '',
                completedTime: '',
                deliverables: [],
                techImplementation: []
            };
            inDeliverables = false;
            inTechImplementation = false;
        } else if (currentTask) {
            // 解析任务属性
            if (line.startsWith('**优先级**:')) {
                currentTask.priority = line.replace('**优先级**:', '').trim();
            } else if (line.startsWith('**完成时间**:')) {
                currentTask.completedTime = line.replace('**完成时间**:', '').trim();
            } else if (line.startsWith('**任务描述**:')) {
                currentTask.description = line.replace('**任务描述**:', '').trim();
                inDeliverables = false;
                inTechImplementation = false;
            } else if (line.startsWith('**交付成果**:')) {
                inDeliverables = true;
                inTechImplementation = false;
            } else if (line.startsWith('**技术实现**:')) {
                inTechImplementation = true;
                inDeliverables = false;
            } else if (line.startsWith('- ✅')) {
                const item = line.replace('- ✅', '').trim();
                if (inDeliverables) {
                    currentTask.deliverables.push(item);
                } else if (inTechImplementation) {
                    currentTask.techImplementation.push(item);
                }
            } else if (line.startsWith('-')) {
                const item = line.replace('-', '').trim();
                if (inDeliverables) {
                    currentTask.deliverables.push(item);
                } else if (inTechImplementation) {
                    currentTask.techImplementation.push(item);
                }
            } else if (line && !line.startsWith('**') && !line.startsWith('---') && !inDeliverables && !inTechImplementation) {
                // 如果是普通文本且不在列表中，添加到描述中
                if (currentTask.description) {
                    currentTask.description += ' ' + line;
                } else {
                    currentTask.description = line;
                }
            }
        }
    }
    
    if (currentTask) {
        tasks.push(currentTask);
    }
    
    return tasks;
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

// 添加新任务（支持文件上传）
app.post('/api/tasks', upload.array('attachments', 5), (req, res) => {
    try {
        log('收到添加任务请求');
        
        const taskData = req.body;
        const files = req.files || [];
        
        // 验证数据
        const validation = validateTaskData(taskData);
        if (!validation.valid) {
            return res.status(400).json({
                success: false,
                message: validation.message
            });
        }
        
        // 处理上传的文件
        const attachments = files.map(file => ({
            originalName: Buffer.from(file.originalname, 'latin1').toString('utf8'),
            filename: file.filename,
            size: file.size,
            mimetype: file.mimetype
        }));
        
        // 清理输入数据
        const cleanTaskData = {
            title: sanitizeInput(taskData.title),
            description: sanitizeInput(taskData.description),
            priority: taskData.priority || '中',
            deadline: taskData.deadline || '',
            expected: sanitizeInput(taskData.expected || ''),
            notes: sanitizeInput(taskData.notes || ''),
            attachments: attachments
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
            message: '任务添加成功',
            attachments: cleanTaskData.attachments
        });
        
    } catch (error) {
        log(`添加任务失败: ${error.message}`);
        // 如果任务添加失败，删除已上传的文件
        if (req.files) {
            req.files.forEach(file => {
                try {
                    fs.unlinkSync(file.path);
                } catch (deleteError) {
                    log(`删除文件失败: ${deleteError.message}`);
                }
            });
        }
        res.status(500).json({
            success: false,
            message: '添加任务失败，请重试'
        });
    }
});

// 文件下载API
app.get('/api/files/:filename', (req, res) => {
    try {
        const filename = req.params.filename;
        const filePath = path.join(config.uploadsPath, filename);
        
        // 检查文件是否存在
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                success: false,
                message: '文件不存在'
            });
        }
        
        // 获取原始文件名（去掉时间戳前缀）
        const originalName = filename.replace(/^\d+_/, '');
        
        // 设置下载头
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(originalName)}"`);
        res.setHeader('Content-Type', 'application/octet-stream');
        
        // 发送文件
        res.sendFile(filePath);
        
    } catch (error) {
        log(`文件下载失败: ${error.message}`);
        res.status(500).json({
            success: false,
            message: '文件下载失败'
        });
    }
});

// 获取文件列表API
app.get('/api/files', (req, res) => {
    try {
        if (!fs.existsSync(config.uploadsPath)) {
            return res.json({
                success: true,
                data: []
            });
        }
        
        const files = fs.readdirSync(config.uploadsPath).map(filename => {
            const filePath = path.join(config.uploadsPath, filename);
            const stats = fs.statSync(filePath);
            const originalName = filename.replace(/^\d+_/, '');
            
            return {
                filename: filename,
                originalName: originalName,
                size: stats.size,
                uploadTime: stats.birthtime,
                downloadUrl: `/api/files/${filename}`
            };
        });
        
        res.json({
            success: true,
            data: files
        });
        
    } catch (error) {
        log(`获取文件列表失败: ${error.message}`);
        res.status(500).json({
            success: false,
            message: '获取文件列表失败'
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

// 获取inbox结构化内容
app.get('/api/inbox-content', (req, res) => {
    try {
        log('获取inbox内容请求');
        
        const inboxContent = readFile(config.inboxPath);
        const parsedContent = parseInboxContent(inboxContent);
        
        res.json({
            success: true,
            data: parsedContent,
            message: '获取inbox内容成功'
        });
    } catch (error) {
        log(`获取inbox内容失败: ${error.message}`);
        res.status(500).json({
            success: false,
            message: '获取inbox内容失败'
        });
    }
});

// 获取inbox原始内容
app.get('/api/inbox-raw', (req, res) => {
    try {
        log('获取inbox原始内容请求');
        
        const inboxContent = readFile(config.inboxPath);
        
        res.json({
            success: true,
            data: inboxContent,
            message: '获取inbox原始内容成功'
        });
    } catch (error) {
        log(`获取inbox原始内容失败: ${error.message}`);
        res.status(500).json({
            success: false,
            message: '获取inbox原始内容失败'
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
const host = process.env.NODE_ENV === 'production' ? '0.0.0.0' : 'localhost';
server.listen(config.port, host, () => {
    log(`服务器启动成功`);
    log(`HTTP服务: http://${host}:${config.port}`);
    log(`WebSocket服务: ws://${host}:${config.port}`);
    log(`Inbox文件: ${config.inboxPath}`);
    log(`Outbox文件: ${config.outboxPath}`);
    log(`环境: ${process.env.NODE_ENV || 'development'}`);
    
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