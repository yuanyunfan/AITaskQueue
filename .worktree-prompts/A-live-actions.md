# Worktree A: 前端 live 模式修复

## 分支名: `fix/live-actions`

## 目标

修复前端在 `VITE_BACKEND_MODE=live` 模式下，部分 UI 操作不走 REST API 导致不持久化的问题；同时验证 mock 模式仍能正常运行。

## 背景

项目有两种运行模式（由 `.env` 中 `VITE_BACKEND_MODE` 控制）：
- **live**: 连接 FastAPI 后端，CRUD 走 REST API，状态通过 WebSocket 实时同步
- **mock**: 无后端，MockSimulator 用 setInterval 模拟数据变更

TaskDrawer（右侧抽屉详情面板）已经正确实现了 live/mock 双模式——每个 action 都检查 `isLive` 然后调用对应的 REST API 函数。但 **TaskCard**（看板卡片上的快捷按钮）没有做这个处理，直接调用 Zustand store 的 `updateTask()`，在 live 模式下操作不会持久化到数据库。

## 需要修改的文件（严格限制在此范围内）

| 文件 | 改动内容 |
|------|---------|
| `src/components/queue/TaskCard.tsx` | approve/reject 快捷按钮增加 live 模式 REST API 调用 |
| `src/mock/simulator.ts` | 验证与当前 store 接口一致，如有不兼容则修复 |
| `src/hooks/use-backend.ts` | 检查 live/mock 初始化逻辑，确认无遗漏 |
| `src/pages/DashboardPage.tsx` | 如果 Dashboard 数据在 live 模式下有缺失则修复 |

**禁止修改的文件**（其他 worktree 负责）：
- `backend/` 目录下的任何文件
- `docker-compose.yml`、`package.json`
- `CHANGELOG.md`、`claude-progress.txt`、`feature_list.json`
- `src/components/queue/KanbanColumn.tsx`（Worktree C 负责右键菜单）
- `src/index.css`（Worktree C 负责动画）

## 具体任务

### 1. 修复 TaskCard 快捷按钮（核心问题）

文件：`src/components/queue/TaskCard.tsx`

当前代码（第 91-99 行）：
```tsx
<button onClick={(e) => { 
  e.stopPropagation(); 
  updateTask(task.id, { status: 'done', completedAt: Date.now() }) 
}}>✓ 验收通过</button>
<button onClick={(e) => { 
  e.stopPropagation(); 
  updateTask(task.id, { status: 'running', progress: 0 }) 
}}>✗ 打回</button>
```

**问题**：直接调 store，live 模式不持久化。

**修复方案**：参考 `TaskDrawer.tsx` 的模式（第 87-110 行），读取 `VITE_BACKEND_MODE`，live 模式调用 `approveTask()`/`rejectTask()` REST API 函数：
```tsx
import { approveTask, rejectTask } from '@/lib/api'

const BACKEND_MODE = import.meta.env.VITE_BACKEND_MODE || 'mock'
const isLive = BACKEND_MODE === 'live'

// approve 按钮
onClick={(e) => {
  e.stopPropagation()
  if (isLive) {
    approveTask(task.id).catch(console.error)
  } else {
    updateTask(task.id, { status: 'done', completedAt: Date.now() })
  }
}}

// reject 按钮同理，调用 rejectTask()
```

REST API 函数已在 `src/lib/api.ts` 中定义好（approveTask, rejectTask, pauseTask, resumeTask, blockTask, unblockTask），直接 import 使用即可。

### 2. 验证 MockSimulator 兼容性

文件：`src/mock/simulator.ts`

检查项：
- simulator 调用的 store 方法（`addTask`, `updateTask`, `addEvent`, `addNotification` 等）是否都还存在
- Task 类型新增了 `project`, `parentId`, `children` 字段——simulator 创建的随机任务不含这些字段，确认 store 能容忍 undefined
- simulator 创建的随机任务 status 为 `'queued'`（不是 `'blocked'`），这在 mock 模式下是合理的，不需要改

运行验证：`VITE_BACKEND_MODE=mock pnpm dev`，浏览器确认：
- 任务进度条在递增
- 任务自动完成（auto）或进入验收（semi）
- 新任务随机入队
- 主 Agent uptime 在计数

### 3. 检查 Dashboard live 模式数据

文件：`src/pages/DashboardPage.tsx` 及其子组件

Dashboard 的数据全部来自 Zustand store，store 由 WebSocket full_sync 灌入。检查：
- StatusCards 读 taskStore 的 tasks → 计算各状态数量 ✅（纯 store 驱动）
- MainAgentCard 读 agentStore 的 mainAgent → 如果后端没有初始化 MainAgentState 行，可能是空的
- QueueOverview 读 taskStore → 按 queueType 分组 ✅
- LiveFeed 读 activityStore → events ✅

如果 MainAgentCard 在 live 模式下为空，这是后端的问题（Worktree B 负责），前端只需确保空状态不报错、显示合理的占位内容即可。

## 验收标准

1. `pnpm build` 零 error
2. `pnpm test` 全部通过
3. live 模式：TaskCard 上点「验收通过」→ 刷新页面后任务状态仍然是 done
4. live 模式：TaskCard 上点「打回」→ 任务回到 queued 状态且数据库同步
5. mock 模式：`VITE_BACKEND_MODE=mock pnpm dev` 正常运行，simulator 行为正常

## 参考文件

- `src/components/overlays/TaskDrawer.tsx` — live/mock 双模式的正确实现范本
- `src/lib/api.ts` — 所有 REST API 函数定义
- `src/types/task.ts` — Task 类型定义
- `src/stores/task-store.ts` — Zustand store 接口
