# CLAUDE.md

## Project Overview

AITaskQueue — AI 任务编排 Dashboard。主 Agent 监控调度 + 子 Agent 动态执行，三类队列 (auto/semi/human) 控制流程。深色主题，本地部署。

Git: 个人 GitHub 账号 (yuanyunfan)，详见 `~/.claude/CLAUDE.md`。推送: `git push origin main`

## Commands

```bash
# Frontend
pnpm dev              # Dev → http://localhost:5173
pnpm build            # tsc -b + vite build (type check + bundle)
pnpm test             # Vitest (单个: pnpm test -- path/to/file)
pnpm lint             # ESLint

# Backend
cd backend && pytest -x -v   # 单个: pytest tests/test_foo.py -x -v
uvicorn app.main:app --reload --port 8000

# Infrastructure
docker compose up -d db      # PostgreSQL
```

## IMPORTANT: Verification First

YOU MUST verify every change before marking it complete:
1. `pnpm build` — 0 type errors
2. `pnpm test -- path/to/changed.test.tsx` — targeted test first, full suite before commit
3. `cd backend && pytest tests/test_changed.py -x -v` — if backend changed
4. If UI change: describe the visual result

**没有验证证据 = 没有完成。** 修 bug 时：先写失败测试复现 → 修复 → 验证通过。

## Critical Rules

1. **永远不要修改或 commit `.env`** — 包含 secrets
2. **修改 store 接口时同步更新 `src/mock/simulator.ts`** — Mock 模式会 break
3. **修改后端 schema 时同步 `src/types/`** — 前端依赖 camelCase JSON
4. **保持 backend schema camelCase 输出** — alias_generator, 前端硬依赖
5. **不要直接修改 `dist/`, `node_modules/`, `backend/.venv/`, `pnpm-lock.yaml`**

## Architecture Quick Ref

- **三类队列**: auto (全自动) / semi (完成后人工验收) / human (人在Loop)
- **5 Zustand stores**: task, agent, activity, ui, history
- **Orchestrator**: `backend/app/orchestrator/` — engine (tick loop) + scheduler (P0-P3 FIFO) + subprocess_runner (Claude CLI)
- **WebSocket**: backend 是 source of truth，前端 live 模式由 WS 驱动
- **双模式**: `VITE_BACKEND_MODE=live` (API+WS) / `mock` (MockSimulator)
- Config: `backend/app/config.py` — `AITASK_` 前缀环境变量

See @README.md for full project structure and setup.

## Vibe Coding 工作流

### 快速迭代循环

1. **描述意图** → 让 Claude 实现 → **立即验证** → 发现问题 → 迭代
2. 小步前进：每次改动聚焦一个目标，验证通过后再进入下一步
3. 如果连续 2 次修复失败 → `/clear` 重新开始，用更好的 prompt

### 什么时候用 Plan 模式

- 涉及 3+ 文件的改动
- 新增抽象或架构变更
- 不确定最佳方案时
- **先展示计划，等确认后再动手**

### 什么时候直接做

- 单文件改动、已知 root cause 的 bug
- 配置更新、重命名/格式化
- 有明确的测试可以验证

## Error Recovery 策略

遇到报错时的标准流程：
1. **完整阅读错误信息** — 不要只看第一行
2. **定位根因** — 用 Grep/Glob 精确搜索，不广撒网
3. **查看相关测试** — 理解预期行为
4. **修复并验证** — 跑测试确认，不要猜测性修复
5. **如果是新 pattern** — 记录到 Retrospective 中

## Session Workflow

每次 session 开始 **必须先**：读取 `claude-progress.txt` + `feature_list.json`，汇报进度和计划
每完成 feature **必须**：更新 `feature_list.json` + 同步 `README.md`
Session 结束前 **必须**：更新 `claude-progress.txt` + `CHANGELOG.md`

## Git Quality Gates

Pre-commit hook: `tsc -b` → `eslint (staged)` → `pnpm test`。**禁止 `--no-verify`。**

Commit 前确认:
- [ ] `pnpm build` 通过
- [ ] 相关测试通过
- [ ] 后端测试通过 (如果改了后端)
- [ ] camelCase 输出未被破坏
- [ ] Mock 模式未被 break

## Retrospective

> 格式: **[日期] 问题描述**: 根因 → 修复方式 → 教训

- **[2026-04-02] update_fields enum 处理**: task_service 中 enum 值需要 `.value` → 添加属性检查 → 所有 enum 序列化都要考虑 `.value`
