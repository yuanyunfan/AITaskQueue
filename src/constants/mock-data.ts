import type { Task, SubAgent, DecisionLogEntry, ActivityEvent, Notification } from '@/types'
import type { HistoryEntry } from '@/stores/history-store'

const now = Date.now()
const min = (m: number) => m * 60 * 1000

export const SEED_TASKS: Task[] = [
  {
    id: 't1',
    title: '爬取新闻聚合',
    description: '从多个 RSS 源和新闻 API 抓取最新 AI 领域新闻，按主题聚合',
    status: 'running',
    queueType: 'auto',
    priority: 'p0',
    progress: 62,
    assignedAgent: 'sub-03',
    createdAt: now - min(10),
    startedAt: now - min(3),
    estimatedMinutes: 5,
  },
  {
    id: 't2',
    title: '生成周报草稿',
    description: '基于本周完成的任务和收集的信息，自动生成周报初稿',
    status: 'running',
    queueType: 'semi',
    priority: 'p1',
    progress: 45,
    assignedAgent: 'sub-01',
    createdAt: now - min(15),
    startedAt: now - min(8),
    estimatedMinutes: 12,
  },
  {
    id: 't3',
    title: '整理 API 文档',
    description: '根据代码库自动生成 API 文档，整理为标准格式',
    status: 'review',
    queueType: 'semi',
    priority: 'p2',
    progress: 100,
    assignedAgent: 'sub-02',
    createdAt: now - min(30),
    startedAt: now - min(20),
    estimatedMinutes: 15,
    result: '已生成 API 文档，共 42 个端点，请验收',
  },
  {
    id: 't4',
    title: '数据同步 - MySQL',
    description: '将生产数据库增量同步到分析库',
    status: 'queued',
    queueType: 'auto',
    priority: 'p2',
    progress: 0,
    createdAt: now - min(5),
    estimatedMinutes: 5,
  },
  {
    id: 't5',
    title: '清理过期日志',
    description: '清理 30 天前的应用日志文件',
    status: 'queued',
    queueType: 'auto',
    priority: 'p2',
    progress: 0,
    createdAt: now - min(2),
    estimatedMinutes: 2,
  },
  {
    id: 't6',
    title: '探索性调研 - RAG 优化',
    description: '调研最新的 RAG 优化技术和 Reranking 方案',
    status: 'queued',
    queueType: 'semi',
    priority: 'p3',
    progress: 0,
    createdAt: now - min(8),
    estimatedMinutes: 15,
  },
  {
    id: 't7',
    title: '数据分析报告 - 用户行为',
    description: '分析过去一周的用户行为数据，生成可视化报告',
    status: 'queued',
    queueType: 'semi',
    priority: 'p3',
    progress: 0,
    createdAt: now - min(4),
    estimatedMinutes: 20,
  },
  {
    id: 't8',
    title: '学习 Kubernetes 基础',
    description: 'Agent 已整理好学习大纲，需要你确认学习路径并逐步消化内容',
    status: 'paused',
    queueType: 'human',
    priority: 'p2',
    progress: 0,
    createdAt: now - min(60),
  },
  {
    id: 't9',
    title: '产品方向 - Q2 规划',
    description: '已收集 3 个方向的分析，需要你做最终选择',
    status: 'paused',
    queueType: 'human',
    priority: 'p1',
    progress: 0,
    createdAt: now - min(120),
  },
]

export const SEED_SUB_AGENTS: SubAgent[] = [
  {
    id: 'sub-01',
    status: 'active',
    currentTaskId: 't2',
    currentTaskTitle: '生成周报草稿',
    progress: 45,
    completedCount: 4,
    runningMinutes: 25,
  },
  {
    id: 'sub-02',
    status: 'idle',
    progress: 0,
    completedCount: 3,
    runningMinutes: 5,
  },
  {
    id: 'sub-03',
    status: 'active',
    currentTaskId: 't1',
    currentTaskTitle: '爬取新闻聚合',
    progress: 62,
    completedCount: 2,
    runningMinutes: 12,
  },
]

export const SEED_DECISIONS: DecisionLogEntry[] = [
  { id: 'd1', timestamp: now - min(0), message: '拆解 "竞品分析" → 3 个子任务 (信息收集 + 数据整理 + 报告生成)' },
  { id: 'd2', timestamp: now - min(2), message: 'Sub-02 报告完成 → 移入验收队列，等待人工确认' },
  { id: 'd3', timestamp: now - min(18), message: 'Sub-04 失败 (网络超时) → 判断: 可重试，自动重新入队' },
  { id: 'd4', timestamp: now - min(33), message: '接收新任务 "生成周报" → 分类: 半自动, 优先级: P1 → 分配给 Sub-01' },
  { id: 'd5', timestamp: now - min(48), message: '创建 Sub-03 处理积压的全自动队列 (队列深度 > 3)' },
]

export const SEED_EVENTS: ActivityEvent[] = [
  { id: 'e1', timestamp: now - min(0), type: 'running', message: 'Sub-03 开始执行 "爬取新闻聚合"' },
  { id: 'e2', timestamp: now - min(2), type: 'dispatch', message: '主 Agent 将 "整理 API 文档" 分配给 Sub-02' },
  { id: 'e3', timestamp: now - min(5), type: 'done', message: '✅ "格式转换-CSV" 执行完成，耗时 2m 13s' },
  { id: 'e4', timestamp: now - min(18), type: 'failed', message: '🔴 "数据同步" 失败 (网络超时)，主 Agent 决定自动重试' },
  { id: 'e5', timestamp: now - min(33), type: 'review', message: 'Sub-02 完成 "竞品分析报告"，进入验收队列' },
  { id: 'e6', timestamp: now - min(48), type: 'done', message: '✅ "监控告警检查" 执行完成' },
]

export const SEED_NOTIFICATIONS: Notification[] = [
  { id: 'n1', timestamp: now - min(5), message: '"整理 API 文档" 等待验收', read: false, taskId: 't3' },
  { id: 'n2', timestamp: now - min(18), message: '"数据同步" 执行失败，已自动重试', read: false },
  { id: 'n3', timestamp: now - min(60), message: '"学习 K8s" 需要你的输入', read: false, taskId: 't8' },
]

export const SEED_HISTORY: HistoryEntry[] = [
  { id: 'h1', title: '格式转换 - CSV to JSON', queueType: 'auto', status: 'done', duration: 133, completedAt: now - min(0), note: undefined },
  { id: 'h2', title: '数据同步 - MySQL', queueType: 'auto', status: 'done', duration: 302, completedAt: now - min(33) },
  { id: 'h3', title: '竞品分析报告', queueType: 'semi', status: 'done', duration: 765, completedAt: now - min(63), note: '验收通过 ✓' },
  { id: 'h4', title: 'API 监控告警', queueType: 'auto', status: 'done', duration: 30, completedAt: now - min(108), note: '失败→重试→成功' },
  { id: 'h5', title: '日报生成', queueType: 'semi', status: 'done', duration: 500, completedAt: now - min(153), note: '验收通过 ✓' },
  { id: 'h6', title: '监控告警检查', queueType: 'auto', status: 'done', duration: 65, completedAt: now - min(183) },
  { id: 'h7', title: 'RSS 聚合 - AI News', queueType: 'auto', status: 'done', duration: 221, completedAt: now - min(213) },
  { id: 'h8', title: 'Slack 消息同步', queueType: 'auto', status: 'failed', duration: 15, completedAt: now - min(243), note: 'Auth token expired' },
]
