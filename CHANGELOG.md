# Changelog

All notable changes to AITaskQueue will be documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.3.0] - 2026-04-02

### Added
- Claude CLI subprocess engine — 替代 Agent SDK，使用 `asyncio.create_subprocess_exec` 管理 Claude CLI 子进程
- PriorityScheduler — P0>P1>P2>P3 优先级调度，同优先级 FIFO
- OrchestratorEngine — 后台引擎 (dispatch tick + uptime loop + 超时检测 + 失败重试)
- Chat 对话走 Claude CLI `run_once()` 单次调用
- Dark/Light 主题切换 (smooth transition)
- Queue 页面右键上下文菜单 (暂停/恢复/优先级调整/删除)
- 过渡动画补充 (page-enter, slide-out, overlay-in, context-menu, card-in)
- Docker Compose 完整化 (db + backend + frontend 三服务)
- `pnpm dev:all` 一键本地开发脚本

## [0.2.0] - 2026-04-02

### Added
- FastAPI + PostgreSQL 后端 (SQLAlchemy 2.0 + asyncpg + Alembic)
- REST API — /api/tasks (CRUD + pause/resume/approve/reject/block/unblock), /api/agents, /api/activities, /api/history, /api/chat
- WebSocket 实时推送 — full_sync + incremental task/agent/activity/notification 更新
- 前端 live/mock 双模式切换 (VITE_BACKEND_MODE 环境变量)
- 项目分组 + 子任务层级 (project field + parentId + children)
- blocked 默认状态 — 新建任务需手动激活加入队列
- TaskDrawer 状态编辑器 — inline 编辑标题/描述/状态/优先级/队列类型
- 拖拽与点击分离 — drag handle 独立，单击打开详情
- 任务名称字段 + 编辑/删除支持

### Fixed
- Backend schemas 统一 camelCase 输出，匹配前端 TypeScript 类型
- TaskDrawer action buttons (approve/reject/pause/resume) 走 REST API

## [0.1.0] - 2026-04-02

First working skeleton: project scaffolding, data layer, and full frontend UI.

### Added
- **Project scaffolding**: Vite 8 + React 18 + TypeScript (strict mode)
- **Styling foundation**: Tailwind CSS v4 with `@theme` design tokens in `src/index.css`
  - 完整的语义化颜色系统: 背景层次、状态色、队列标识色、优先级色
  - 4 个自定义动画: pulse-dot, fade-in, slide-in-right, slide-in-up
- **TypeScript types**: Task, Agent, Activity 完整类型定义 (`src/types/`)
- **State management**: 5 个 Zustand stores
  - `taskStore` — 任务 CRUD、队列筛选、优先级排序、状态统计
  - `agentStore` — 主 Agent 状态 + 子 Agent 列表 + 决策日志
  - `activityStore` — Live feed (max 50) + 通知 + 未读计数
  - `uiStore` — Drawer/Modal/Chat 开关状态
  - `historyStore` — 历史记录 + 筛选 + 统计
- **Mock data layer**: 种子数据 (9 tasks, 3 agents, 5 decisions, 6 events, 8 history entries)
- **MockSimulator**: 5 个 setInterval 模拟实时后端行为
- **Full frontend UI**: Dashboard, Queue (Kanban + DnD), Agents, History 四页面
- **Overlay components**: TaskDrawer, NewTaskModal, ChatPanel, NotificationBell
- **Keyboard shortcuts**: N = 新建任务, ESC = 关闭面板

### Architecture Decisions
- **三队列模型**: auto (全自动) / semi (半自动, 人验收) / human (人在loop)
- **深色模式优先**: 支持 dark/light 切换
- **Tailwind v4 CSS-first config**: 颜色在 CSS `@theme` 中定义
- **Mock-first 开发**: `src/mock/` 作为临时模拟层
- **Zustand 多 store**: 按职责拆分 5 个独立 store
