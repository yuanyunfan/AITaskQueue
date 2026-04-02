# AITaskQueue

个人 AI 任务编排 Dashboard — 管理「主 Agent + 动态子 Agent」的全自动/半自动/人在loop 任务调度系统。

## 核心功能

- **主 Agent 常驻监控** — 任务拆解、子 Agent 调度、异常自动决策
- **三类任务队列** — 全自动（无人参与）、半自动（人验收）、人在loop（人协作）
- **四级优先级** — P0 紧急 → P3 低优先级，支持拖拽排序
- **实时 Dashboard** — 一屏总览所有运行状态、队列深度、活动日志
- **子 Agent 动态管理** — 按需创建/销毁，独立并行执行

## 页面

| 页面 | 功能 |
|------|------|
| Dashboard | 状态卡片 + 主 Agent 概览 + 队列概览 + 活跃任务表 + 实时活动流 |
| Queue | 三列看板（全自动/半自动/人在loop），拖拽排序，右键操作 |
| Agents | 主 Agent 决策日志 + 子 Agent 状态网格 |
| History | 执行历史时间线 + 统计（成功率、平均耗时）+ 筛选 |

## Quick Start

```bash
# 环境要求: Node.js >= 22, pnpm
./init.sh            # 一键初始化环境
pnpm dev             # 启动开发服务器 → http://localhost:5173
```

## Tech Stack

React 18 · TypeScript · Vite 8 · Tailwind CSS v4 · Zustand · @dnd-kit · React Router v6 · lucide-react

## 开发状态

详见 [claude-progress.txt](./claude-progress.txt) 和 [feature_list.json](./feature_list.json)。
