# AITaskQueue

个人 AI 任务编排 Dashboard — 一个人 + N 个 AI Agent 的任务调度系统。

创建任务、设定优先级、选择执行模式，系统自动调度 Claude CLI 子进程完成工作。所有状态实时同步到深色主题的 Web Dashboard 上。

## 架构

```
┌──────────────────────────────────────────────────────────┐
│                    Browser (localhost:5173)               │
│  React 18 · TypeScript · Tailwind v4 · Zustand · dnd-kit │
│                                                          │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐       │
│  │Dashboard│ │ Queue   │ │ Agents  │ │ History │       │
│  │ 总览    │ │ 看板    │ │ Agent状态│ │ 历史统计│       │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘       │
│       │ REST (CRUD)              ▲ WebSocket (实时推送)   │
└───────┼──────────────────────────┼───────────────────────┘
        ▼                          │
┌───────────────────────────────────────────────────────────┐
│                 FastAPI Backend (localhost:8000)           │
│                                                           │
│  REST API ──→ TaskService ──→ PostgreSQL (localhost:5433) │
│                                                           │
│  Orchestrator Engine (后台循环)                            │
│    ├── PriorityScheduler    P0 > P1 > P2 > P3 FIFO      │
│    └── ClaudeCodeRunner     asyncio subprocess 管理       │
│          └── claude --print "task prompt" ──→ 结果写回 DB │
│                                                           │
│  WebSocket Manager ──→ broadcast 状态变更给所有前端连接    │
└───────────────────────────────────────────────────────────┘
```

## 核心概念

### 三类队列

| 队列 | 执行方式 | 人工参与 |
|------|---------|---------|
| **全自动** (auto) | Agent 独立完成 → 直接标记 done | 无 |
| **半自动** (semi) | Agent 完成后进入 review → 等人验收 | 验收通过 / 打回重做 |
| **人在 Loop** (human) | Agent 与人协作，全程参与 | 全程 |

### 任务生命周期

```
blocked ──(手动激活)──→ queued ──(调度器分配)──→ running
                          ▲                        │
                          │ (打回)                  ▼
                        review ◄──(semi队列)──── done / failed
                          │                        ▲
                          └──(验收通过)─────────────┘

running ──→ paused ──→ queued (恢复后重新排队)
```

- **blocked**: 默认状态，任务入队后不会自动执行，需手动激活
- **queued**: 等待调度，Orchestrator 按优先级 FIFO 分配
- **running**: Claude CLI 子进程执行中，进度实时推送
- **review**: 半自动任务完成后等待人工验收
- **done / failed**: 终态

### 四级优先级

P0 紧急 → P1 高 → P2 中 → P3 低，同优先级按入队时间排序。支持拖拽手动调整顺序。

### 项目分组

任务可归属于项目（Finance、VibeLancer 等），也可以是独立任务。Queue 页面顶部 tab 按项目筛选。支持父子任务层级。

## Quick Start

### 环境要求

- Node.js >= 22 + pnpm
- Docker (运行 PostgreSQL)
- Python >= 3.12 (后端)
- Claude CLI (`claude` 命令可用，Orchestrator 执行任务时需要)

### 1. 启动数据库

```bash
docker compose up -d db
```

PostgreSQL 运行在 **5433** 端口（避免与本地 PG 冲突）。

### 2. 启动后端

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -e .
# 首次需要初始化数据库
alembic upgrade head
# 启动
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### 3. 启动前端

```bash
pnpm install
pnpm dev    # → http://localhost:5173
```

前端通过 `.env` 中的 `VITE_BACKEND_MODE=live` 连接后端。改为 `mock` 可以无后端独立运行（MockSimulator 模拟数据）。

### 纯前端体验（无需后端）

```bash
VITE_BACKEND_MODE=mock pnpm dev
```

## 配置

所有配置通过项目根目录 `.env` 文件管理：

```bash
# 数据库
AITASK_DATABASE_URL=postgresql+asyncpg://aitask:aitask@localhost:5433/aitaskqueue

# Orchestrator（自动调度引擎）
AITASK_ORCHESTRATOR_ENABLED=false   # true 开启自动执行任务
AITASK_MAX_CONCURRENT_AGENTS=4      # 最大并行 Agent 数
AITASK_TASK_TIMEOUT_SECONDS=600     # 单任务超时（秒）

# Claude CLI
AITASK_CLAUDE_MAX_TURNS=25          # 每个任务最大对话轮次
AITASK_CLAUDE_PERMISSION_MODE=acceptEdits

# 前端模式
VITE_BACKEND_MODE=live              # live = 连后端, mock = 本地模拟
```

Claude CLI 读取 shell 环境变量 `ANTHROPIC_API_KEY` 和 `ANTHROPIC_BASE_URL`，不在 `.env` 中配置。

## 技术栈

| 层 | 技术 |
|----|------|
| **前端** | React 18 · TypeScript (strict) · Vite 8 · Tailwind CSS v4 · Zustand · @dnd-kit · React Router · lucide-react |
| **后端** | FastAPI · SQLAlchemy 2.0 (async) · asyncpg · Pydantic v2 · Alembic |
| **数据库** | PostgreSQL 16 |
| **AI 执行** | Claude CLI subprocess (`claude --print`) |
| **通信** | REST API (CRUD) + WebSocket (实时状态推送) |
| **容器** | Docker Compose (PostgreSQL) |

## 项目结构

```
AITaskQueue/
├── src/                          # 前端 React 应用
│   ├── types/                    #   TypeScript 类型
│   ├── stores/                   #   5 个 Zustand store
│   ├── components/               #   UI 组件（按功能域分组）
│   ├── pages/                    #   4 个页面
│   ├── lib/                      #   API client · WebSocket · 工具函数
│   ├── hooks/                    #   use-backend (live/mock 切换)
│   └── mock/                     #   MockSimulator (离线模拟层)
│
├── backend/                      # FastAPI 后端
│   └── app/
│       ├── api/                  #   REST endpoints (tasks, agents, chat, health...)
│       ├── models/               #   SQLAlchemy ORM (6 张表)
│       ├── schemas/              #   Pydantic v2 (camelCase 序列化)
│       ├── services/             #   业务逻辑层
│       ├── orchestrator/         #   调度引擎 + Claude CLI runner
│       ├── ws/                   #   WebSocket 连接管理 + 广播
│       └── config.py             #   pydantic-settings 配置
│
├── docker-compose.yml            # PostgreSQL 容器
├── .env                          # 环境配置（不提交到 git）
└── CLAUDE.md                     # Claude Code AI 协作指令
```

## 开发命令

```bash
# 前端
pnpm dev              # 开发服务器
pnpm build            # 类型检查 + 生产构建
pnpm lint             # ESLint
pnpm test             # Vitest 单元测试
pnpm test:coverage    # 测试覆盖率

# 后端
cd backend && source .venv/bin/activate
uvicorn app.main:app --reload --port 8000   # 热重载开发
alembic upgrade head                         # 执行数据库迁移
alembic revision --autogenerate -m "描述"    # 生成新迁移

# 数据库
docker compose up -d db       # 启动 PostgreSQL
docker compose down           # 停止
docker compose down -v        # 停止 + 删除数据
```

## WebSocket 协议

连接 `ws://localhost:8000/ws`，首次连接收到 `state:full_sync`（全量状态），之后增量推送：

| 消息类型 | 触发时机 |
|---------|---------|
| `task:created` | 新建任务 |
| `task:updated` | 任务状态/字段变更 |
| `task:deleted` | 删除任务 |
| `task:progress` | 执行进度更新 |
| `activity:event` | 活动流事件 |
| `chat:message` | Agent 对话消息 |

## Git 质量门禁

每次 commit 自动执行 pre-commit hook：

1. `tsc -b` — TypeScript 类型检查，0 error
2. `lint-staged` — ESLint 检查 staged 文件，0 warning
3. `pnpm test` — 所有测试通过

## License

Private project.
