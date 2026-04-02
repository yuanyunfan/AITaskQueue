# Worktree B: 后端 Orchestrator 端到端验证 + 测试

## 分支名: `feat/orchestrator-e2e`

## 目标

1. 端到端验证 Orchestrator 引擎：blocked → queued → running (Claude CLI) → done/review 全链路
2. 补充后端单元测试和集成测试
3. 修复验证中发现的任何 bug

## 背景

Orchestrator 引擎代码已写完（`backend/app/orchestrator/`），但从未在 `AITASK_ORCHESTRATOR_ENABLED=true` 下真正运行过。引擎包含：

- **OrchestratorEngine** (`engine.py`) — 后台循环，每 N 秒一个 tick：超时检查 → Scheduler 选任务 → dispatch 到空闲 Agent
- **ClaudeCodeRunner** (`subprocess_runner.py`) — 用 `asyncio.create_subprocess_exec` 调用 `claude -p --output-format stream-json --bare`
- **PriorityScheduler** (`scheduler.py`) — 无状态调度：P0 > P1 > P2 > P3 FIFO，跳过 human 队列

当前问题：
- 数据库中 `main_agent_state` 表可能没有初始行，Orchestrator start() 时调用 `update_main_agent()` 可能失败
- Task model 有 `error_message` 字段在 engine.py 中被赋值（第 535 行），但不确定 model 中是否定义
- 从未有实际 Claude CLI 子进程跑过，JSONL 解析可能有边界情况

## 需要修改的文件（严格限制在此范围内）

| 文件 | 改动内容 |
|------|---------|
| `backend/app/orchestrator/engine.py` | 修复验证中发现的 bug |
| `backend/app/orchestrator/subprocess_runner.py` | 修复 JSONL 解析的边界情况 |
| `backend/app/orchestrator/scheduler.py` | 如有逻辑问题修复 |
| `backend/app/ws/handler.py` | full_sync 中补充 MainAgentState 初始化 |
| `backend/app/services/task_service.py` | 如状态转换有问题修复 |
| `backend/app/services/agent_service.py` | 确保 MainAgentState 有初始行 |
| `backend/app/models/task.py` | 如缺少 error_message 字段则添加 |
| `backend/app/models/agent.py` | 如有缺失字段则添加 |
| `backend/tests/test_api_tasks.py` | **新建** — 任务 API 测试 |
| `backend/tests/test_orchestrator.py` | **新建** — Orchestrator 测试 |
| `backend/tests/test_scheduler.py` | **新建** — Scheduler 测试 |

**禁止修改的文件**（其他 worktree 负责）：
- `src/` 下的任何前端文件
- `docker-compose.yml`、`package.json`
- `CHANGELOG.md`、`claude-progress.txt`、`feature_list.json`

## 具体任务

### 1. 预检：确认数据模型完整性

检查以下字段在 model 中是否存在：
- `backend/app/models/task.py` 中是否有 `error_message` 列（engine.py 第 535 行赋值 `task.error_message = error_msg`）
- `backend/app/models/agent.py` 中 SubAgent 是否有 `pid` 列（engine.py 调用 `update_sub_agent(agent_id, pid=pid)`）
- `backend/app/models/agent.py` 中 MainAgentState 是否保证有初始行

如果缺失，添加对应列和 Alembic migration。

### 2. 确保 MainAgentState 初始化

`backend/app/services/agent_service.py` 中的 `update_main_agent()` 需要能 upsert——如果表中没有行则 INSERT，有则 UPDATE。检查当前实现是否支持。

`backend/app/ws/handler.py` 的 `_send_full_sync()` 发送 mainAgent 数据——如果表中没行，应发合理的默认值（status=idle, uptimeSeconds=0）而非报错。

### 3. 端到端验证（手动测试流程）

准备工作：
```bash
# 确保 PostgreSQL 运行
docker compose up -d db

# 确保 claude CLI 可用
which claude && claude --version

# 启动后端（开启 Orchestrator）
cd backend && source .venv/bin/activate
AITASK_ORCHESTRATOR_ENABLED=true uvicorn app.main:app --port 8000
```

验证步骤：
1. 创建一个 auto P0 任务：
   ```bash
   curl -X POST http://localhost:8000/api/tasks \
     -H 'Content-Type: application/json' \
     -d '{"title":"讲个程序员笑话","queueType":"auto","priority":"p0"}'
   ```
   → 任务应为 blocked 状态

2. 解除 blocked：
   ```bash
   curl -X POST http://localhost:8000/api/tasks/{id}/unblock
   ```
   → 任务变为 queued

3. 观察 Orchestrator 日志：
   - 应该看到 "Dispatched task..." 日志
   - 子进程 PID 应该被记录
   - 进度更新应该通过 WebSocket 广播

4. 等待完成：
   - auto 队列任务应该最终变为 done
   - result 字段应包含 Claude 的回答

5. 创建一个 semi 任务重复上述流程：
   - 完成后应该进入 review 状态
   - 应该创建 notification

6. 验证失败场景：
   - 创建任务后立即 kill 子进程 → 应该触发重试
   - 设置极短超时 → 应该触发超时处理

### 4. 编写后端测试

#### test_scheduler.py（纯单元测试，不需要 DB）
```python
# 测试 PriorityScheduler:
# - P0 任务优先于 P1
# - 同优先级按 created_at 排序
# - human 队列被跳过
# - max_dispatch 限制生效
# - exclude_task_ids 过滤生效
# - 空列表返回空
```

#### test_api_tasks.py（需要测试 DB）
```python
# 使用 httpx.AsyncClient + 测试数据库
# - POST /api/tasks → 201, 返回 camelCase JSON
# - GET /api/tasks → 列表
# - PATCH /api/tasks/{id} → 字段更新
# - DELETE /api/tasks/{id} → 204
# - POST /api/tasks/{id}/approve → 仅 review 状态可用
# - POST /api/tasks/{id}/reject → 仅 review 状态可用
# - POST /api/tasks/{id}/unblock → 仅 blocked 状态可用
# - POST /api/tasks/{id}/block → 仅 queued/paused 状态可用
```

#### test_orchestrator.py（mock subprocess，集成测试）
```python
# Mock ClaudeCodeRunner，不实际调用 claude CLI
# - test_tick_dispatches_queued_task
# - test_tick_respects_max_concurrent
# - test_tick_skips_when_no_queued
# - test_complete_auto_task_goes_to_done
# - test_complete_semi_task_goes_to_review
# - test_fail_task_retries
# - test_fail_task_max_retries_exceeded
```

测试框架配置：
- 使用 `pytest-asyncio`
- conftest.py 中创建测试用 SQLite async engine（`sqlite+aiosqlite:///:memory:`）
- 需要安装 `aiosqlite`：`pip install aiosqlite`

### 5. 修复发现的 bug

在上述验证过程中遇到的任何问题，就地修复。常见预期问题：
- MainAgentState 无初始行 → agent_service 的 upsert 逻辑
- error_message 字段缺失 → 添加到 Task model
- JSONL 解析中遇到非标准输出行 → subprocess_runner 增加容错
- 超时后子进程未正确 kill → 检查 SIGTERM/SIGKILL 逻辑

## 验收标准

1. `AITASK_ORCHESTRATOR_ENABLED=true` 启动不报错
2. auto 任务：queued → running → done 全链路通过
3. semi 任务：queued → running → review 全链路通过
4. 后端日志无未处理异常
5. `pytest backend/tests/` 全部通过（≥15 个测试用例）
6. `pnpm build` 通过（确认没改坏前端的任何类型依赖）

## 关键文件参考

- `backend/app/config.py` — 所有配置项及默认值
- `backend/app/main.py` — lifespan 中 Orchestrator 的启动/关闭
- `backend/app/models/enums.py` — TaskStatus, QueueType, Priority, AgentStatus, EventType
- `backend/app/schemas/task.py` — TaskResponse.from_model() 是 WS 广播的 payload 格式
- `.env` — `AITASK_ORCHESTRATOR_ENABLED=false` 当前关闭状态
