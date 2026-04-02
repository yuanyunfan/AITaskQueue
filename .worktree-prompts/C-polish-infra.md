# Worktree C: UI 打磨 + 基础设施 + 文档清理

## 分支名: `chore/polish-infra`

## 目标

1. Queue 页面右键上下文菜单
2. 过渡动画补充
3. Docker Compose 完整化（一键启动全部服务）
4. 一键本地开发脚本
5. 文档清理和同步

## 背景

项目功能基本完成，但缺乏打磨：
- Queue 页面的 TaskCard 没有右键菜单（feature_list.json f064，唯一剩余的前端 feature）
- 页面切换没有过渡动画，抽屉弹出虽有 slide-in 但缺少关闭动画
- Docker Compose 只有 PostgreSQL，缺 backend + frontend 容器
- 本地开发需要手动开 3 个终端
- CHANGELOG.md 严重滞后，claude-progress.txt 有过期内容，feature_list.json 不含后端 feature

## 需要修改的文件（严格限制在此范围内）

| 文件 | 改动内容 |
|------|---------|
| `src/components/queue/ContextMenu.tsx` | **新建** — 右键上下文菜单组件 |
| `src/components/queue/KanbanColumn.tsx` | 集成右键菜单 |
| `src/index.css` | 补充过渡动画 keyframes |
| `docker-compose.yml` | 添加 backend + frontend service 定义 |
| `backend/Dockerfile` | **新建** — 后端容器 |
| `Dockerfile.frontend` | **新建** — 前端容器（Vite build + nginx） |
| `package.json` | 添加 `dev:all` 脚本 |
| `CHANGELOG.md` | 补全 v0.2.0 ~ v0.3.0 |
| `claude-progress.txt` | 清理过期内容，压缩已完成部分 |
| `feature_list.json` | 补后端 feature 条目，更新 summary |
| `CLAUDE_CONFIG_AUDIT.md` | **删除** |

**禁止修改的文件**（其他 worktree 负责）：
- `src/components/queue/TaskCard.tsx`（Worktree A 负责）
- `src/mock/simulator.ts`（Worktree A 负责）
- `backend/app/orchestrator/`（Worktree B 负责）
- `backend/app/services/`（Worktree B 负责）
- `backend/tests/`（Worktree B 负责）

## 具体任务

### 1. 右键上下文菜单

新建 `src/components/queue/ContextMenu.tsx`：

```tsx
// 基本结构：
// - 位置跟随鼠标右键点击位置
// - 点击外部或按 ESC 关闭
// - 菜单项根据任务状态动态显示

interface ContextMenuProps {
  x: number
  y: number
  task: Task
  onClose: () => void
}

// 菜单项（根据 task.status 条件显示）:
// blocked → "▶ 加入队列" (unblock)
// queued  → "⏹ 移出队列" (block), "⬆ 提升优先级", "⬇ 降低优先级"
// running → "⏸ 暂停" (pause)
// paused  → "▶ 恢复" (resume), "⏹ 移出队列" (block)
// review  → "✓ 验收通过" (approve), "✗ 打回" (reject)
// 所有状态 → "🗑 删除" (delete)
```

在 `KanbanColumn.tsx` 中集成：
- TaskCard 的 `onContextMenu` 事件 → 显示 ContextMenu
- 需要能传递点击坐标和 task 对象

Action 实现：
- 检查 `VITE_BACKEND_MODE`，live 模式调用 REST API（`src/lib/api.ts` 中已有全部函数）
- mock 模式直接改 store

### 2. 过渡动画补充

文件：`src/index.css`

当前已有的动画：
```css
@keyframes pulse-dot { ... }
@keyframes fade-in { ... }
@keyframes slide-in-right { ... }   /* TaskDrawer 弹出 */
@keyframes slide-in-up { ... }      /* Modal 弹出 */
```

需要补充：
```css
/* 页面路由切换 */
@keyframes page-enter {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
.animate-page-enter { animation: page-enter 0.2s ease-out; }

/* Drawer 关闭动画 */
@keyframes slide-out-right {
  from { transform: translateX(0); }
  to { transform: translateX(100%); }
}

/* Modal 背景遮罩 */
@keyframes overlay-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
.animate-overlay-in { animation: overlay-in 0.15s ease; }

/* 右键菜单弹出 */
@keyframes context-menu-in {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}
.animate-context-menu { animation: context-menu-in 0.1s ease-out; }

/* 卡片入场（staggered） */
@keyframes card-in {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}
```

注意：不要改 `@theme` 部分的颜色定义，那部分现在有 dark/light mode 的两套变量。

### 3. Docker Compose 完整化

当前 `docker-compose.yml` 只有 db service。添加：

```yaml
services:
  db:
    # ... 保持不变 ...

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    ports:
      - "8000:8000"
    depends_on:
      db:
        condition: service_healthy
    env_file:
      - .env.docker    # Docker 环境专用配置
    environment:
      AITASK_DATABASE_URL: postgresql+asyncpg://aitask:aitask@db:5432/aitaskqueue

  frontend:
    build:
      context: .
      dockerfile: Dockerfile.frontend
    ports:
      - "5173:80"
    depends_on:
      - backend
```

新建 `backend/Dockerfile`：
```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY pyproject.toml .
RUN pip install -e .
COPY . .
# Claude CLI 安装（可选，没有则 Orchestrator 无法执行任务但 API 正常）
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

新建 `Dockerfile.frontend`：
```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
# nginx proxy 配置需要把 /api 和 /ws 转发到 backend
COPY nginx.conf /etc/nginx/conf.d/default.conf
```

新建 `nginx.conf`（前端容器用）：
```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    location /api/ {
        proxy_pass http://backend:8000/api/;
    }
    location /ws {
        proxy_pass http://backend:8000/ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

### 4. 一键本地开发脚本

`package.json` 添加：
```json
{
  "scripts": {
    "dev:all": "concurrently -n db,api,web -c blue,green,yellow \"docker compose up db\" \"cd backend && source .venv/bin/activate && uvicorn app.main:app --reload --port 8000\" \"pnpm dev\""
  }
}
```

需要安装 concurrently：`pnpm add -D concurrently`

注意：shell source 在 concurrently 中可能有兼容性问题，可能需要改为：
```json
"dev:backend": "cd backend && .venv/bin/uvicorn app.main:app --reload --port 8000"
```

### 5. 文档清理

#### CHANGELOG.md
补充以下版本（参考 git log）：

```markdown
## [0.3.0] - 2026-04-02
### Added
- Claude CLI subprocess engine (替代 Agent SDK)
- PriorityScheduler 优先级调度
- Orchestrator 后台引擎 (dispatch + uptime loops)
- Chat 对话走 Claude CLI run_once()

## [0.2.0] - 2026-04-02
### Added
- FastAPI + PostgreSQL 后端
- REST API (tasks, agents, activities, history, chat)
- WebSocket 实时推送 (full_sync + incremental)
- 前端 live/mock 双模式
- 项目分组 + 子任务层级
- blocked 默认状态（手动激活）
- TaskDrawer 状态编辑器
- 拖拽与点击分离
```

#### claude-progress.txt
- 已完成的部分（Phase 0-8）压缩为一行总结
- "Not Started" 部分更新：删除已完成的项（如 "TaskDrawer actions wired to REST API"）
- 保留真正未完成的项

#### feature_list.json
- 添加后端 phases（backend-1: REST API, backend-2: WebSocket, backend-3: Orchestrator）
- 将已完成的后端 feature 标记 passes: true
- 更新 summary 的 total/done/remaining/progress_pct

#### CLAUDE_CONFIG_AUDIT.md
删除此文件，这是一次性审计报告，不应留在仓库中。

## 验收标准

1. 右键 TaskCard → 显示上下文菜单，菜单操作有效
2. 页面切换有平滑过渡动画
3. `docker compose up` → 三个服务全部启动，浏览器访问 localhost:5173 正常
4. `pnpm dev:all` → 本地一键启动三服务
5. CHANGELOG 反映真实版本历史
6. feature_list.json 包含后端 feature，summary 准确
7. `pnpm build` + `pnpm test` 通过
8. CLAUDE_CONFIG_AUDIT.md 已删除

## 关键文件参考

- `src/lib/api.ts` — 所有 REST API 函数（approveTask, rejectTask, pauseTask, resumeTask, blockTask, unblockTask, deleteTask）
- `src/constants/colors.ts` — STATUS_LABELS, QUEUE_LABELS 等中文标签
- `src/components/overlays/TaskDrawer.tsx` — live/mock 双模式 action 实现范本
- `git log --oneline` — commit 历史用于写 CHANGELOG
