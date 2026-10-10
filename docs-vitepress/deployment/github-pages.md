# GitHub Pages 文档站点

本文档本身就是一个 mdBook 项目，可直接部署到 GitHub Pages。

## 项目结构

```
docs-book/
├── book.toml              # mdBook 配置
└── src/
    ├── SUMMARY.md         # 目录结构
    ├── intro.md           # 简介
    ├── quickstart.md      # 快速开始
    ├── images/            # UI 截图
    │   ├── login-page.png
    │   ├── dashboard-main.png
    │   ├── worker-fleet.png
    │   ├── scan-jobs-queue.png
    │   ├── vulnerability-center.png
    │   ├── memory-manager.png
    │   ├── user-management.png
    │   └── node-detail.png
    ├── architecture/      # 架构文档
    ├── backend/           # 后端文档
    ├── frontend/          # 前端文档
    ├── worker/            # Worker 文档
    └── deployment/        # 部署文档
```

## 本地预览

```bash
cd docs-book
mdbook serve
# 访问 http://localhost:3000
```

## 构建静态站点

```bash
cd docs-book
mdbook build
# 产物在 docs-book/book/ 目录
```

## GitHub Pages 部署

### 方式一：GitHub Actions 自动部署

项目已包含 `.github/workflows/deploy-docs.yml` 工作流，推送到 main 分支时自动构建并部署。

### 方式二：手动部署

1. 构建文档：
   ```bash
   cd docs-book && mdbook build
   ```

2. 将 `book/` 目录的内容推送到 `gh-pages` 分支

3. 在 GitHub 仓库 Settings → Pages 中选择 `gh-pages` 分支

### 配置说明

确保 `book.toml` 中的 `git-repository-url` 指向正确的仓库地址：

```toml
[output.html]
git-repository-url = "https://github.com/your-org/combinate-agentic-review"
```
