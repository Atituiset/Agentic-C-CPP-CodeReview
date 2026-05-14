# Agentic CodeReview Platform

基于 FastAPI + Vite/React + Redis + SQLite 的代码审查平台。

## 技术栈

- **后端**: Python 3.11+, FastAPI, SQLAlchemy, Redis
- **前端**: Vite + React + TypeScript + Tailwind CSS
- **数据库**: SQLite
- **任务队列**: Redis

## 环境依赖

- Docker & Docker Compose（方式一）
- 或以下工具（方式二）：
  - Python 3.11+
  - [uv](https://github.com/astral-sh/uv)
  - Node.js 22+
  - Redis

---

## 启动方式

### 方式一：Docker Compose（推荐）

一键启动所有服务，适合快速体验或生产部署。

```bash
docker-compose up --build
```

- 前端页面: http://localhost:8000
- Health Check: http://localhost:8000/health

停止服务：

```bash
docker-compose down
```

---

### 方式二：本地开发启动

需要分别启动 Redis、后端和前端，适合开发调试。

#### 1. 启动 Redis

```bash
docker run -d -p 6379:6379 --name redis redis:7-alpine
```

#### 2. 启动后端

在项目根目录执行：

```bash
cd /home/atituiset/Projects/combinate-agentic-review
uv run --project backend uvicorn backend.main:app --reload --port 3000
```

- API 地址: http://localhost:3000
- Health Check: http://localhost:3000/health

> **注意**：前端 Vite 代理配置指向 `localhost:3000`，因此后端必须使用 3000 端口。

#### 3. 启动前端

```bash
cd /home/atituiset/Projects/combinate-agentic-review/frontend
npm install
npm run dev
```

- 开发服务器: http://localhost:5173
- API 请求会自动代理到后端的 3000 端口

---

## 常用命令

### 后端

```bash
# 运行测试
cd /home/atituiset/Projects/combinate-agentic-review
uv run --project backend pytest backend/tests/

# 生成数据库表（首次启动会自动创建）
# SQLite 数据库文件位于 ./data/app.db
```

### 前端

```bash
cd /home/atituiset/Projects/combinate-agentic-review/frontend

# 开发模式
npm run dev

# 构建生产版本
npm run build

# 预览生产构建
npm run preview

# TypeScript 类型检查
npm run lint
```

---

## 项目结构

```
combinate-agentic-review/
├── backend/          # FastAPI 后端
│   ├── main.py       # 应用入口
│   ├── routers/      # API 路由
│   ├── services/     # 业务逻辑
│   ├── models/       # ORM & Schema
│   └── tests/        # 测试用例
├── frontend/         # Vite + React 前端
│   ├── src/          # 源码
│   └── dist/         # 构建产物
├── worker/           # 扫描 worker
├── data/             # SQLite 数据目录
├── reports/          # 扫描报告目录
├── docker-compose.yml
└── Dockerfile
```
