# 部署指南

## Railway 部署步骤

### 1. 准备工作
- 确保你有 [Railway](https://railway.app) 账户
- 安装 Railway CLI（可选）
- 准备 GitHub 仓库（推荐）

### 2. 通过 GitHub 部署（推荐）

1. **创建 GitHub 仓库**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin <your-github-repo-url>
   git push -u origin main
   ```

2. **连接 Railway**
   - 访问 [Railway Dashboard](https://railway.app/dashboard)
   - 点击 "New Project"
   - 选择 "Deploy from GitHub repo"
   - 选择你的仓库

3. **配置环境变量**
   在 Railway 项目设置中添加以下环境变量：
   ```
   NODE_ENV=production
   INBOX_PATH=./inbox.md
   OUTBOX_PATH=./outbox.md
   CORS_ORIGIN=*
   ```

4. **部署完成**
   - Railway 会自动检测 Node.js 项目
   - 自动安装依赖并启动服务
   - 获取分配的域名

### 3. 通过 Railway CLI 部署

1. **安装 Railway CLI**
   ```bash
   npm install -g @railway/cli
   ```

2. **登录 Railway**
   ```bash
   railway login
   ```

3. **初始化项目**
   ```bash
   railway init
   ```

4. **部署**
   ```bash
   railway up
   ```

### 4. 其他平台部署选项

#### Render
1. 连接 GitHub 仓库
2. 选择 "Web Service"
3. 设置构建命令：`npm install`
4. 设置启动命令：`npm start`

#### Heroku
1. 安装 Heroku CLI
2. 创建应用：`heroku create your-app-name`
3. 部署：`git push heroku main`

### 5. 部署后验证

访问分配的域名，确认以下功能正常：
- ✅ 页面正常加载
- ✅ 可以添加任务
- ✅ 状态实时更新
- ✅ WebSocket 连接正常

### 6. 自定义域名（可选）

在 Railway 项目设置中：
1. 进入 "Settings" → "Domains"
2. 添加自定义域名
3. 配置 DNS 记录

### 7. 监控和日志

- Railway 提供实时日志查看
- 可以监控应用性能和错误
- 支持自动重启和健康检查

### 8. 注意事项

- 免费计划有使用限制
- 文件系统是临时的，重启后会重置
- 建议使用数据库存储重要数据
- 定期备份 inbox.md 和 outbox.md 内容

### 9. 故障排除

**常见问题**：
- 端口配置：确保使用 `process.env.PORT`
- 文件路径：使用相对路径而非绝对路径
- CORS 设置：根据需要配置跨域策略
- 依赖安装：确保 package.json 正确配置

**查看日志**：
```bash
railway logs
```

**重新部署**：
```bash
railway up --detach
```