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

## Claude Code Orchestrator 实现详解

本项目的核心能力是通过 **Claude Code CLI subprocess** 实现 AI 任务自动执行。不使用任何 SDK 或 HTTP API，而是直接通过 `asyncio.create_subprocess_exec` 调用 Claude Code CLI 作为子进程，利用其 stream-json 输出实时解析任务进度。

### 技术选型：为什么用 CLI subprocess 而不是 SDK

| 方案 | 优点 | 缺点 |
|------|------|------|
| ~~Claude Agent SDK~~ | 原生 Python API | SDK 版本不稳定，依赖重，需手动管理认证 |
| ~~Anthropic HTTP API~~ | 轻量直接 | 无法使用 Claude Code 的工具生态（文件读写、命令执行等） |
| **Claude Code CLI** ✅ | 完整的 agentic 能力、自动继承 shell 环境变量认证、`--bare` 模式跳过不必要的初始化 | 需要解析 JSONL 输出 |

项目早期使用 `claude-agent-sdk`，后期重构为 CLI subprocess 架构以获得更好的稳定性和更丰富的 agentic 能力。

### 架构总览

```
┌─────────────────────────────────────────────────────────────┐
│                    Orchestrator Engine                        │
│                   (常驻 asyncio 后台循环)                      │
│                                                               │
│  _dispatch_loop()                    _uptime_loop()          │
│  ┌──────────────────────────┐        ┌──────────────────┐    │
│  │ 每 N 秒一个 _tick():     │        │ 每 1 秒广播:     │    │
│  │  1. 超时检查 running 任务 │        │  主 Agent 心跳   │    │
│  │  2. Scheduler 选择任务    │        │  + uptime 秒数   │    │
│  │  3. Dispatch 到空闲 Agent │        └──────────────────┘    │
│  └─────────┬────────────────┘                                 │
│            │                                                   │
│            ▼                                                   │
│  ┌──────────────────────────────────────────────────┐         │
│  │         ClaudeCodeRunner (子进程管理器)            │         │
│  │                                                    │         │
│  │  spawn_streaming()     run_once()                  │         │
│  │  ┌─────────────┐      ┌─────────────┐             │         │
│  │  │ stream-json  │      │    json     │             │         │
│  │  │ 任务执行     │      │  Chat 对话  │             │         │
│  │  │ 多轮 tool   │      │  单轮无 tool │             │         │
│  │  │ --bare      │      │  max-turns=1│             │         │
│  │  └──────┬──────┘      └──────┬──────┘             │         │
│  │         │                     │                    │         │
│  │         ▼                     ▼                    │         │
│  │    claude -p --output-format stream-json ...       │         │
│  │    claude -p --output-format json ...              │         │
│  │         │ (asyncio subprocess)                     │         │
│  └─────────┼─────────────────────────────────────────┘         │
│            │                                                    │
│            ▼                                                    │
│  ┌──────────────────────────────────────────────────┐          │
│  │        PriorityScheduler (无状态调度器)            │          │
│  │  P0 > P1 > P2 > P3, 同优先级 FIFO               │          │
│  │  自动跳过 human 队列 (需手动触发)                  │          │
│  └──────────────────────────────────────────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

### 主 Agent vs 子 Agent 的职责划分

**主 Agent (Orchestrator Engine)**  — 编排者，不直接执行任务

| 职责 | 实现方式 |
|------|---------|
| **任务调度** | `_tick()` 循环：检查超时 → Scheduler 选任务 → dispatch 到空闲子 Agent |
| **决策日志** | 每次调度记录 `add_decision()`，广播到前端 DecisionLog 面板 |
| **健康监控** | `_uptime_loop()` 每秒广播心跳（status + uptimeSeconds + model） |
| **崩溃恢复** | `start()` 时将残留的 RUNNING 任务重置为 QUEUED，防止死锁 |
| **Chat 对话** | 通过 `ClaudeCodeRunner.run_once()` 以 `--max-turns 1` 单轮对话回答用户问题，自带当前队列状态的 system context |
| **进程管理** | `stop()` 时 SIGTERM → 5s → SIGKILL 清理所有子进程 |

**子 Agent (Claude CLI Subprocess)**  — 执行者，每个任务一个独立进程

| 职责 | 实现方式 |
|------|---------|
| **任务执行** | `claude -p --output-format stream-json --bare --verbose "prompt"` |
| **Tool 调用** | Claude Code CLI 自带的文件读写、命令执行、搜索等工具 |
| **进度上报** | 输出 JSONL，由 `_reader_loop()` 解析为 `AgentEvent` 流 |
| **结果返回** | 输出 `type: "result"` 事件，含 `result_text` + `total_cost_usd` |
| **生命周期** | 完全由 `ClaudeCodeRunner` 管理，任务完成后自动回收 PID |

### Agent 之间的通信机制

Agent 之间**不直接通信**——所有协调通过 Orchestrator Engine 中转：

```
用户 (Browser)
  │
  ├──[REST POST /api/tasks]──→ 创建任务 → DB
  ├──[REST POST /api/chat]──→ Chat 对话 → ClaudeCodeRunner.run_once() → 响应
  │
  ▼
WebSocket ←── ws_manager.broadcast() ←── Orchestrator
  │                                          │
  │                                          ├── _tick() 读 DB → Scheduler 选任务
  │                                          ├── _dispatch() 写 DB + 启动子进程
  │                                          └── _run_agent() 消费子进程事件流
  │                                                  │
  │                                                  ▼
  │                                          ClaudeCodeRunner
  │                                           spawn_streaming()
  │                                                  │
  │                                                  ▼
  │                                          claude CLI subprocess
  │                                          (独立进程, stdout JSONL)
  ▼
前端 Zustand Store ←── store-sync.ts 解析 WS 消息并更新状态
```

**通信协议**：
- **前端 ↔ 后端**: REST API (CRUD 操作) + WebSocket (实时状态推送)
- **Orchestrator ↔ 子进程**: `asyncio.create_subprocess_exec` + stdout JSONL 流
- **Orchestrator ↔ DB**: SQLAlchemy async session，每次 tick 创建新 session
- **状态同步**: 所有状态变更先写 DB，再通过 `ws_manager.broadcast()` 推送到所有前端连接

### Claude CLI 调用方式

两种模式，对应不同场景：

**1. 任务执行 — stream-json 模式（多轮、有 tool）**

```bash
claude -p \
  --output-format stream-json \
  --verbose \
  --bare \                           # 跳过 hooks/LSP/MCP，无头模式执行更快
  --permission-mode acceptEdits \    # 自动接受文件编辑
  --model claude-sonnet-4-20250514 \
  --max-turns 25 \
  --max-budget-usd 1.0 \
  "# 任务: Fix authentication bug\n..."
```

**2. Chat 对话 — json 模式（单轮、无 tool）**

```bash
claude -p \
  --output-format json \
  --permission-mode acceptEdits \
  --max-turns 1 \                    # 单轮，禁止 tool 循环
  --system-prompt "你是 AITaskQueue 的主 Agent 助手。当前任务队列状态: ..." \
  "用户的聊天消息"
```

### 子进程事件流解析

`ClaudeCodeRunner` 使用 **background reader + asyncio.Queue** 模式解析子进程输出：

```
CLI stdout (JSONL)                    Python 侧
─────────────────                    ──────────
{"type":"system","subtype":"init"}  → _reader_loop: 记录 session_id, skip
{"type":"assistant","message":{     → _reader_loop: 解析 content blocks
    "content":[                         ├── tool_use → AgentEvent(TOOL_USE, progress=N%)
      {"type":"tool_use",...},           └── text     → AgentEvent(TEXT, progress=N%)
      {"type":"text",...}
    ]}}
{"type":"result","result":"..."}    → _reader_loop: AgentEvent(RESULT, 100%)
                                         └── queue.put(_STREAM_END)
```

**进度估算算法**：
- **有 tool 调用时**: `progress = min(tool_calls_seen / max_turns × 90, 95)%` — 基于 tool 调用次数
- **无 tool 调用时**: `progress = min(elapsed / timeout × 80, 80)%` — 基于已用时间
- **永远不到 100%**: 只有收到 `type: "result"` 才设为 100%

### 三种队列的完成路径

```python
# engine.py _complete_task() 中的路由逻辑：

if queue_type == "auto":
    # 全自动 → 直接完成，归档到历史
    task.status = DONE
    archive_to_history(task)

elif queue_type == "semi":
    # 半自动 → 进入验收，创建通知等待人工审批
    task.status = REVIEW
    create_notification("等待验收")
    # 用户在前端点击 approve → DONE / reject → QUEUED (重做)

else:  # human
    # 人在 Loop → 直接完成（人已全程参与）
    task.status = DONE
    archive_to_history(task)
```

### 容错与恢复

| 场景 | 处理方式 |
|------|---------|
| **系统崩溃重启** | `Orchestrator.start()` 扫描所有 RUNNING 任务 → 重置为 QUEUED（旧子进程已死） |
| **子进程超时** | `_tick()` 每轮检查 `is_timed_out()` → `kill_process()` → SIGTERM/SIGKILL |
| **任务执行失败** | `retry_count < max_retries` → 重新入队重试；否则标记 FAILED + 归档 |
| **CLI 不存在** | `FileNotFoundError` 捕获 → 返回 ERROR 事件，不崩溃 |
| **Orchestrator 关闭** | `stop()` → `kill_all()` 清理所有子进程 → cancel 所有 asyncio.Task → 主 Agent 设为 idle |

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
