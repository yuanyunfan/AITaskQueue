# Changelog

All notable changes to AITaskQueue will be documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.0] - 2026-04-02

First working skeleton: project scaffolding, data layer, and static HTML demo.

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
- **MockSimulator**: 5 个 setInterval 模拟实时后端行为 (进度递增 / 完成检测 / 调度 / 随机事件 / uptime)
- **Static HTML demo**: `demo.html` — 完整 4 页面 UI 原型 (Tailwind CDN, 纯静态)
- **Harness files**: CLAUDE.md, README.md, init.sh, claude-progress.txt, feature_list.json, CHANGELOG.md

### Architecture Decisions
- **三队列模型**: auto (全自动) / semi (半自动, 人验收) / human (人在loop)
- **深色模式 only**: 不支持 light mode, 参考 Linear 的 dark-first 设计
- **Tailwind v4 CSS-first config**: 不使用 tailwind.config.js, 颜色在 CSS `@theme` 中定义
- **Mock-first 开发**: `src/mock/` 作为临时模拟层, 未来替换为 WebSocket 后端
- **Zustand 多 store**: 按职责拆分 5 个独立 store, 避免单一巨型 store
