# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AITaskQueue 是一个个人 AI 任务编排 Dashboard，用于管理「主 Agent + 动态子 Agent」的任务调度系统。本地部署，深色主题，一屏总览。

**核心架构**：一个常驻主 Agent 负责监控和调度，子 Agent 动态创建执行具体任务，任务通过三类队列控制执行流程。

## Tech Stack

- **Runtime**: Node.js (pnpm)
- **Framework**: React 18 + TypeScript (strict mode)
- **Bundler**: Vite 8
- **Styling**: Tailwind CSS v4 (CSS-first config via `@theme` in `src/index.css`)
- **State**: Zustand (5 stores, no Redux)
- **Routing**: React Router v6
- **Drag & Drop**: @dnd-kit
- **Icons**: lucide-react

## Commands

```bash
pnpm install          # Install dependencies
pnpm dev              # Start dev server (http://localhost:5173)
pnpm build            # Type-check + production build
pnpm lint             # ESLint
pnpm test             # Run tests (Vitest)
pnpm test:watch       # Run tests in watch mode
pnpm test:coverage    # Run tests with coverage report
pnpm preview          # Preview production build
./init.sh             # One-shot environment init (checks Node, installs deps, verifies files)
```

## Session Workflow (MANDATORY)

> **IMPORTANT**: 以下步骤是强制性的。每次 session 必须执行，不可跳过。

### Session 开始时 — 必须立即执行：
1. **读取 `claude-progress.txt`** — 了解上次 session 的进度、当前状态、已知问题
2. **读取 `feature_list.json`** — 确认下一个 `"passes": false` 的 feature 作为工作目标
3. **简要汇报给用户**: "上次进度: XXX，本次计划做: YYY"

### 每完成一个 feature 时：
4. **更新 `feature_list.json`** — 将对应 feature 的 `"passes"` 改为 `true`
5. **更新 phase 的 `"status"`** — 如果该 phase 所有 feature 都 passes，改为 `"done"`
6. **更新 `summary` 字段** — 重新计算 done/remaining/progress_pct

### Session 结束前 — 必须执行：
7. **更新 `claude-progress.txt`** — 记录本次完成了什么、下一步是什么、遇到的问题
8. **更新 `CHANGELOG.md`** — 如果有显著功能完成，添加新版本条目

## Testing

- **Framework**: Vitest + @testing-library/react + jsdom
- **Config**: `vite.config.ts` 中的 `test` 字段
- **Setup**: `test/setup.ts` — 加载 jest-dom matchers
- **Convention**: 测试文件与源文件同目录，命名 `*.test.ts(x)`
- **Store tests**: 每个 test 的 `beforeEach` 中用 `store.setState()` 重置状态
- **Coverage thresholds**: lines/functions/statements 60%, branches 45%

## Project Structure

```
src/
├── types/            # TypeScript interfaces (Task, Agent, Activity)
├── constants/        # Color mappings, seed mock data
├── lib/              # Utilities (cn, formatTime, formatDuration, generateId)
├── stores/           # Zustand stores (task, agent, activity, ui, history)
├── mock/             # MockSimulator — 模拟实时数据更新 (替换后端前的临时层)
├── hooks/            # Custom hooks (useSimulator)
├── components/       # UI components, grouped by feature domain
│   ├── layout/       # AppLayout, Sidebar
│   ├── shared/       # StatusBadge, PriorityBadge, ProgressBar, PageHeader
│   ├── dashboard/    # StatusCards, MainAgentCard, QueueOverview, ActiveTasksTable, LiveFeed
│   ├── queue/        # KanbanBoard, KanbanColumn, TaskCard (drag-sortable)
│   ├── agents/       # MainAgentPanel, DecisionLog, SubAgentGrid, SubAgentCard
│   ├── history/      # StatsBar, HistoryTable, HistoryFilters
│   ├── overlays/     # TaskDrawer (右侧抽屉), NewTaskModal, ChatPanel (主Agent对话)
│   └── notifications/# NotificationBell, NotificationDropdown
└── pages/            # Page-level composition (Dashboard, Queue, Agents, History)
```

## Architecture Decisions

### Three Queue Types
| Queue | 行为 | 人工参与 |
|-------|------|---------|
| `auto` (全自动) | Agent 独立完成 | 无 |
| `semi` (半自动) | Agent 完成后等人验收 | 验收通过/打回 |
| `human` (人在loop) | Agent 与人协作 | 全程参与 |

### State Management — 5 Zustand Stores
- **taskStore**: 任务 CRUD、队列筛选、优先级排序、状态统计
- **agentStore**: 主 Agent 状态 + 子 Agent 列表 + 决策日志
- **activityStore**: Live feed 事件流 (max 50) + 通知 + 未读计数
- **uiStore**: Drawer/Modal/Chat 等 UI 开关状态
- **historyStore**: 历史记录 + 筛选 + 统计 (成功率、平均耗时)

### Mock Simulator
`src/mock/simulator.ts` 用 5 个 `setInterval` 模拟真实后端行为：
- 2s: 运行中任务进度递增
- 5s: 检测 100% 任务 → auto 直接完成, semi 进入验收
- 8s: 主 Agent 调度 → 将排队任务分配给空闲子 Agent
- 15s: 随机事件 → 新任务入队 / 失败
- 1s: 主 Agent uptime 计数

**重要**: `src/mock/` 是临时模拟层，未来会替换为真实 WebSocket 后端。修改 store 接口时需同步更新 simulator。

### Design System
颜色通过 Tailwind v4 `@theme` 在 `src/index.css` 中定义，使用语义化 token：
- `bg-primary`, `bg-card`, `bg-hover` — 背景层次
- `status-running`, `status-failed`, `status-done` 等 — 状态色
- `queue-auto`, `queue-semi`, `queue-human` — 队列标识色
- `priority-p0` ~ `priority-p3` — 优先级色

深色模式 only，不需要 light mode 支持。

### Key UI Patterns
- **Task detail**: 右侧抽屉弹出 (不跳转页面)
- **Queue page**: 三列看板 (auto | semi | human)，@dnd-kit 拖拽排序
- **Chat panel**: 右下角可展开，与主 Agent 对话
- **Notifications**: 页面内铃铛 + 红点，无浏览器原生通知

## Conventions

- **Path alias**: `@/` maps to `src/` (configured in vite.config.ts and tsconfig.app.json)
- **Component files**: PascalCase (e.g., `StatusBadge.tsx`)
- **Store files**: kebab-case (e.g., `task-store.ts`)
- **Imports**: Use `@/` alias, never relative paths crossing feature boundaries
- **CSS utility**: Use `cn()` from `@/lib/utils` for conditional class merging (clsx + tailwind-merge)
- **No CSS modules or styled-components** — Tailwind utility classes only
- **中文 UI text**: 所有面向用户的文本使用中文，代码和注释用英文

## Git Quality Gates

每次 `git commit` 自动执行 pre-commit hook (`.husky/pre-commit`)，依次检查：

1. **TypeScript type check** (`tsc -b`) — 全项目类型检查，0 error 才通过
2. **ESLint** (via `lint-staged`) — 仅检查 staged 的 `*.{ts,tsx}` 文件，`--max-warnings=0`
3. **Unit tests** (`pnpm test`) — 所有 Vitest 测试必须通过

**禁止使用 `--no-verify` 绕过 hook**。如果 hook 失败，修复问题后重新 commit。

## Retrospective

> 每次 Agent session 中遇到重大踩坑、关键 bug、或架构决策教训时，在此追加一条记录。
> 格式: **[日期] 问题描述**: 根因 → 修复方式 → 教训

(暂无条目 — 随项目推进持续积累)
