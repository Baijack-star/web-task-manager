# Web任务管理系统

一个用于管理智能体任务和实时状态同步的Web应用程序。

## 项目信息

- **远程仓库地址**：https://github.com/Baijack-star/web-task-manager.git
- **在线演示**：https://sour-dragons-tease.loca.lt
- **项目状态**：生产就绪，支持24小时稳定运行

## 功能特性

- 📝 **任务添加**：通过Web界面添加任务，自动写入inbox.md文件
- 📊 **实时状态**：实时显示outbox.md内容，了解智能体工作进度
- 🔄 **自动同步**：WebSocket实现实时状态更新
- 📁 **文件管理**：支持文件上传下载，任务附件和结果文档管理
- 📱 **响应式设计**：适配桌面和移动设备
- 🎨 **现代化UI**：美观的用户界面和交互体验

## 技术栈

- **后端**：Node.js + Express.js
- **前端**：HTML5 + CSS3 + 原生JavaScript
- **实时通信**：WebSocket (ws库)
- **文件操作**：Node.js fs模块

## 安装和运行

### 1. 安装依赖

```bash
cd web-task-manager
npm install
```

### 2. 启动应用

```bash
# 开发模式
npm run dev

# 生产模式
npm start
```

### 3. 访问应用

打开浏览器访问：http://localhost:3000

## 使用说明

### 添加任务

1. 在"添加新任务"区域填写任务信息
2. 必填项：任务标题、任务描述
3. 可选项：优先级、截止时间、预期结果、备注
4. 点击"提交任务"按钮

### 查看状态

- "智能体工作状态"区域实时显示outbox.md的内容
- 连接状态指示器显示与智能体的连接状态
- "最近添加的任务"显示任务提交历史

### 文件管理

**文件上传**：
1. 在任务添加表单中点击"选择文件"按钮
2. 支持多文件选择和拖拽上传
3. 支持常见文件格式：文档、图片、压缩包等
4. 单个文件最大10MB，最多5个文件
5. 文件自动保存到uploads目录

**文件下载**：
1. 点击"文件管理"按钮查看已上传文件
2. 点击文件名即可下载
3. 支持智能体生成的结果文档下载
4. 文件列表实时更新
5. 亦可通过静态路径直接访问：`/uploads/<filename>`

## 文件结构

```
web-task-manager/
├── package.json          # 项目配置和依赖
├── server.js            # 主服务器文件
├── public/              # 静态文件目录
│   ├── index.html      # 主页面
│   ├── style.css       # 样式文件
│   └── script.js       # 前端逻辑
└── README.md           # 项目说明
```

## API接口

### REST API

- `GET /health` - 健康检查（返回服务状态与运行时间）
- `GET /api/status` - 获取智能体状态（outbox.md内容）
- `GET /api/inbox-content` - 获取inbox.md解析后的结构化数据
- `GET /api/inbox-raw` - 获取inbox.md原始Markdown
- `GET /api/tasks` - 获取任务列表
- `POST /api/tasks` - 添加新任务（支持表单提交与附件上传 attachments[]，单个≤10MB，最多5个）
- `GET /api/files` - 获取文件列表
- `GET /api/files/:filename` - 下载指定文件
- `静态 /uploads/` - 直接访问已上传文件

### WebSocket事件

- `status-update` - 状态更新推送
- `task-added` - 任务添加通知

## 配置选项

### 环境变量

- `PORT` - 服务器端口（默认：3000）
- `INBOX_PATH` - inbox.md文件路径
- `OUTBOX_PATH` - outbox.md文件路径
- `CORS_ORIGIN` - 允许的跨域来源（默认：*）
- `LOG_LEVEL` - 日志级别（默认：info）
- `WS_HEARTBEAT` - WebSocket心跳间隔（毫秒，默认：30000）
- `RATE_LIMIT_WINDOW` - 速率限制时间窗口（毫秒，默认：900000）
- `RATE_LIMIT_MAX` - 时间窗口内允许的最大请求数（默认：100）

### 默认配置

```javascript
const config = {
    port: process.env.PORT || 3000,
    inboxPath: '../inbox.md',
    outboxPath: '../outbox.md'
};
```

## 安全特性

- 输入验证和清理
- 文件路径限制
- CORS配置
- 输入长度限制

## 浏览器兼容性

- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+

## 故障排除

### 常见问题

1. **连接失败**
   - 检查服务器是否正常运行
   - 确认端口3000未被占用
   - 检查防火墙设置

2. **文件读写错误**
   - 确认inbox.md和outbox.md文件存在
   - 检查文件权限
   - 验证文件路径配置

3. **WebSocket连接断开**
   - 应用会自动重连
   - 检查网络连接
   - 查看浏览器控制台错误信息

### 日志查看

服务器日志会显示详细的错误信息和运行状态。

## 开发说明

### 本地开发

1. 修改代码后重启服务器
2. 前端文件修改后刷新浏览器
3. 使用浏览器开发者工具调试

### 扩展功能

- 任务编辑和删除
- 用户认证系统
- 任务分类和标签
- 数据导出功能
- 移动端应用

## 许可证

MIT License

## 支持

如有问题或建议，请通过以下方式联系：

- 创建Issue
- 提交Pull Request
- 发送邮件反馈

---

*此应用专为智能体任务管理和协作而设计*