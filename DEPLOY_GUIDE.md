# 云平台部署指南

## 推荐平台：Render

基于研究结果，推荐使用 Render 平台部署，因为：
- 仍提供免费额度
- 支持 Node.js 应用
- 配置简单
- 自动 HTTPS

## Render 部署步骤

### 1. 准备 GitHub 仓库

```bash
# 在项目目录下初始化 Git
git init
git add .
git commit -m "Initial commit for deployment"

# 推送到 GitHub（需要先创建仓库）
git remote add origin https://github.com/yourusername/web-task-manager.git
git branch -M main
git push -u origin main
```

### 2. 在 Render 上部署

1. 访问 [Render Dashboard](https://dashboard.render.com/)
2. 点击 "New +" -> "Web Service"
3. 连接你的 GitHub 仓库
4. 选择 `web-task-manager` 仓库
5. 配置部署设置：
   - **Name**: `web-task-manager`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: `Free`

### 3. 配置环境变量

在 Render 的环境变量设置中添加：

```
NODE_ENV=production
INBOX_PATH=./inbox.md
OUTBOX_PATH=./outbox.md
CORS_ORIGIN=*
```

### 4. 部署完成

- Render 会自动构建和部署
- 获得类似 `https://web-task-manager-xxxx.onrender.com` 的 URL
- 支持自动 HTTPS

## 备选方案：Vercel

如果 Render 不可用，可以尝试 Vercel：

1. 安装 Vercel CLI：`npm i -g vercel`
2. 在项目目录运行：`vercel`
3. 按提示完成部署

## 重要说明

### 文件同步限制

⚠️ **重要**: 云部署的应用无法直接访问你本地的 `inbox.md` 和 `outbox.md` 文件。

云端应用会使用自己的 `inbox.md` 和 `outbox.md` 文件，这意味着：
- 云端和本地的任务数据是分离的
- 需要手动同步或使用其他方案

### 解决方案

1. **纯云端使用**: 直接在云端界面管理任务
2. **本地服务 + 内网穿透**: 使用 ngrok 等工具暴露本地服务
3. **文件同步服务**: 使用 GitHub、Dropbox 等同步文件

## 推荐的混合方案

考虑到你需要同步本地文件，建议：

1. **部署到云端**: 提供移动端访问
2. **本地运行**: 保持文件同步
3. **使用内网穿透**: 如 ngrok 提供外网访问

```bash
# 安装 ngrok
npm install -g ngrok

# 启动本地服务
npm start

# 在另一个终端暴露服务
ngrok http 3000
```

这样可以获得一个临时的外网 URL，同时保持本地文件同步。