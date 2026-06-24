/**
 * @file cascade-check.test
 * @brief [025] 级联检测 + 约束检查 + 拆分执行 集成测试
 *
 * 覆盖 15 个测试场景（T1-T15），通过 createOrchestrator().executeIntent()
 * 端到端验证 cascadeCheck、parentConstraintCheck 与级联拆分执行。
 *
 * 关键约束：
 * - cascadeCheck/parentConstraintCheck 内部使用 new TaskRepository() /
 *   new ThreadRepository()，因此 vi.mock 必须提供可 new 的构造函数
 *   （vi.fn(function() {...}) 模式）。
 * - cascadeCheck 的 BFS 会递归查询 findByParent，mock 必须对
 *   不同 parentId 返回不同值（使用 mockImplementation），否则
 *   mockResolvedValue 对所有调用返回同一数组会导致无限 BFS → OOM。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { StructuredIntent } from '@/usom/types/objects'
import type { USOM_ID } from '@/usom/types/primitives'

// ─── Mock 函数 ────────────────────────────────────────────────────

const mockTaskFindById = vi.fn()
const mockTaskFindByParent = vi.fn()
const mockTaskFindByUserId = vi.fn()
const mockTaskUpdateStatus = vi.fn()
const mockTaskCreate = vi.fn()

vi.mock('@/domains/tasks/repository/task', () => ({
  TaskRepository: vi.fn(function () {
    this.findById = mockTaskFindById
    this.findByParent = mockTaskFindByParent
    this.findByUserId = mockTaskFindByUserId
    this.updateStatus = mockTaskUpdateStatus
    this.create = mockTaskCreate
  }),
}))

const mockThreadFindById = vi.fn()
const mockThreadUpdateStatus = vi.fn()

vi.mock('@/domains/tasks/repository/thread', () => ({
  ThreadRepository: vi.fn(function () {
    this.findById = mockThreadFindById
    this.updateStatus = mockThreadUpdateStatus
  }),
}))

// ─── Mock 域注册 / manifest / lifecycle ───────────────────────────

vi.mock('@/domains/registry', () => ({
  findDomain: () => null,
  findHandler: vi.fn(),
}))

vi.mock('@/domains/manifest-loader', () => ({
  loadDomainManifest: () => ({
    success: true,
    manifest: {
      id: 'tasks', version: '1.0.0', name: 'Tasks',
      intent_triggers: [], lifecycle: {}, field_metadata: {},
      list_actions: [], required_fields: {}, subscribed_events: [],
    },
  }),
  formatManifestError: () => '',
}))

vi.mock('@/domains/plugin-factory', () => ({ createDomainPlugin: () => null }))

vi.mock('../lifecycle-configs', () => {
  const lifecycles: Record<string, Array<{ from: string | string[] | null; action: string; to: string; eventType: string }>> = {
    task: [
      { from: null, action: 'create', to: 'todo', eventType: 'TaskCreated' },
      { from: 'todo', action: 'activate', to: 'in_progress', eventType: 'TaskActivated' },
      { from: 'in_progress', action: 'complete', to: 'completed', eventType: 'TaskCompleted' },
      { from: ['todo', 'in_progress', 'completed'], action: 'archive', to: 'archived', eventType: 'TaskArchived' },
      { from: ['todo', 'in_progress', 'completed', 'archived'], action: 'delete', to: 'deleted', eventType: 'TaskDeleted' },
      { from: ['todo', 'in_progress'], action: 'cascade_complete', to: 'completed', eventType: 'TaskCompleted' },
      { from: ['todo', 'in_progress', 'completed'], action: 'cascade_archive', to: 'archived', eventType: 'TaskArchived' },
      { from: ['todo', 'in_progress', 'completed', 'archived'], action: 'cascade_delete', to: 'deleted', eventType: 'TaskDeleted' },
    ],
    thread: [
      { from: null, action: 'create', to: 'active', eventType: 'ThreadCreated' },
      { from: 'active', action: 'complete', to: 'completed', eventType: 'ThreadCompleted' },
      { from: ['active', 'completed'], action: 'archive', to: 'archived', eventType: 'ThreadArchived' },
      { from: ['active', 'completed', 'archived'], action: 'delete', to: 'deleted', eventType: 'ThreadDeleted' },
    ],
  }
  const terminalStates: Record<string, string[]> = { task: ['completed', 'archived', 'deleted'], thread: ['completed', 'archived', 'deleted'] }
  return {
    buildActionMap: () => ({
      createTask: 'create', completeTask: 'complete', archiveTask: 'archive',
      deleteTask: 'delete', activateTask: 'activate',
      createThread: 'create', completeThread: 'complete', archiveThread: 'archive',
      deleteThread: 'delete',
      cascade_complete: 'cascade_complete', cascade_archive: 'cascade_archive',
      cascade_delete: 'cascade_delete',
    }),
    resolveObjectType: (domainId: string, action: string) =>
      domainId === 'tasks' && (action.endsWith('Thread') || action.includes('thread')) ? 'thread' : 'task',
    getTransitionFromManifest: (_d: string, objType: string, fromState: string | null, action: string) => {
      const transitions = lifecycles[objType] ?? []
      return transitions.find(t => {
        const fromMatch = t.from === null ? fromState === null : Array.isArray(t.from) ? t.from.includes(fromState!) : t.from === fromState
        return fromMatch && t.action === action
      })
    },
    getLifecycleFromManifest: (_d: string, objType: string) => {
      const transitions = lifecycles[objType] ?? []
      if (transitions.length === 0) return undefined
      const states = [...new Set(transitions.flatMap(t => [t.from, t.to]).filter((s): s is string => s !== null))]
      const initialState = transitions.find(t => t.from === null)?.to ?? states[0]
      return { states, initial_state: initialState, transitions: transitions.map(t => ({ from: t.from, action: t.action, to: t.to, event_type: t.eventType })), terminal_states: terminalStates[objType] ?? [] }
    },
  }
})

vi.mock('../path-router', () => ({ resolvePathType: () => 'contract' }))
vi.mock('../query-cnui-formatter', () => ({ formatCNUIFromContext: () => ({}), formatTextSummary: () => '' }))

// ─── Mock state-machine ───────────────────────────────────────────

const mockSmExecute = vi.fn()

vi.mock('@/nexus/core/state-machine', () => ({
  createGenericStateMachine: () => ({ execute: mockSmExecute }),
}))

// ─── Mock 基础设施 ────────────────────────────────────────────────

vi.mock('@/nexus/infrastructure/event-bus', () => ({
  createEventBus: () => ({ publish: vi.fn(), subscribe: vi.fn() }),
}))
vi.mock('@/nexus/context-engine', () => ({ assembleContext: vi.fn() }))
vi.mock('@/nexus/ai-runtime', () => ({ createAIRuntime: () => ({}) }))
vi.mock('@/nexus/ai-runtime/session', () => ({
  createAISessionManager: () => ({
    findActiveSessionByDomain: () => null,
    create: vi.fn(), activate: vi.fn(), recordQueryResult: vi.fn(),
  }),
}))
vi.mock('@/nexus/core/rule-engine', () => ({ evaluateProposals: () => [] }))

// ─── 导入被测模块 ────────────────────────────────────────────────

import { createOrchestrator } from '../index'

// ─── 测试辅助 ────────────────────────────────────────────────────

const userId = 'user-test' as USOM_ID

function makeIntent(overrides: Partial<StructuredIntent> = {}): StructuredIntent {
  return {
    id: 'intent-001' as USOM_ID,
    intentionId: 'intention-001' as USOM_ID,
    targetDomain: 'tasks',
    action: 'completeTask',
    fields: { taskId: 't1' },
    confidence: 1.0,
    resolvedBy: 'template_form',
    pathType: 'contract',
    createdAt: '2026-06-24T00:00:00Z' as any,
    ...overrides,
  } as StructuredIntent
}

function createTestOrchestrator(overrides?: {
  ruleResult?: { result: 'pass' | 'warning' | 'confirm'; warnings?: string[]; confirmations?: string[] }
}) {
  const ruleResult = overrides?.ruleResult ?? { result: 'pass', warnings: [] }
  return createOrchestrator({
    eventRepo: { append: vi.fn().mockResolvedValue(undefined) } as any,
    intentEngine: { parse: vi.fn() } as any,
    ruleEngine: { evaluate: vi.fn().mockResolvedValue(ruleResult) } as any,
    getRepo: () => ({
      findById: vi.fn().mockResolvedValue({ id: 't1', status: 'in_progress' }),
      findByUserId: vi.fn(), findByParent: vi.fn(),
      updateStatus: vi.fn().mockResolvedValue({}),
      create: vi.fn().mockResolvedValue({ id: 'new-id', status: 'todo' }),
      save: vi.fn(),
    }),
  } as any)
}

/**
 * 安全地设置 findByParent mock：对匹配 parentId 返回 children，否则返回 []。
 * 防止 BFS 中 mockResolvedValue 对所有参数返回同一数组导致的无限循环。
 */
function setupFindByParent(map: Record<string, Array<{ id: string; status: string; title: string; parentId: string | null }>>) {
  mockTaskFindByParent.mockImplementation(async (parentId: string) => {
    return map[parentId] ?? []
  })
}

// ─── 测试套件 ────────────────────────────────────────────────────

describe('[025] 任务级联处理', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSmExecute.mockReset()
    mockSmExecute.mockResolvedValue({
      success: true,
      object: { id: 't1', status: 'completed' },
      event: { type: 'TaskCompleted', payload: {} },
    })
  })

  // ═══════════════════════════════════════════════════════════════
  describe('cascadeCheck — completeTask', () => {
    it('T1: 无子任务 → Passed，正常完成', async () => {
      mockTaskFindByParent.mockResolvedValue([])
      const orchestrator = createTestOrchestrator()
      const result = await orchestrator.executeIntent(
        makeIntent({ action: 'completeTask', fields: { taskId: 't1' } }),
        userId,
      )
      expect(result.success).toBe(true)
      expect(result.suspended).toBeUndefined()
      expect(mockSmExecute).toHaveBeenCalled()
    })

    it('T2: 有 1 个直接子任务 → NeedConfirm(CascadePreview)', async () => {
      mockTaskFindById.mockResolvedValue({ id: 't1', status: 'in_progress', title: '父任务' })
      setupFindByParent({
        t1: [{ id: 't2', status: 'todo', title: '子任务', parentId: 't1' }],
      })
      const orchestrator = createTestOrchestrator()
      const result = await orchestrator.executeIntent(
        makeIntent({ action: 'completeTask', fields: { taskId: 't1' } }),
        userId,
      )
      expect(result.success).toBe(false)
      expect(result.suspended!.reason).toBe('need_confirm')
      const data = result.suspended!.data as Record<string, unknown>
      expect(data.source).toBe('cascade')
      const preview = data.cascadePreview as any
      expect(preview.parentAction).toBe('completeTask')
      expect(preview.parentId).toBe('t1')
      expect(preview.parentTitle).toBe('父任务')
      expect(preview.parentType).toBe('task')
      expect(preview.directCount).toBe(1)
      expect(preview.totalCount).toBe(1)
      expect(preview.cascadeAction).toBe('cascade_complete')
      expect(preview.allDescendants).toHaveLength(1)
      expect(preview.allDescendants[0].id).toBe('t2')
      // [025] D2 — 需正确 surfacing 出 needsConfirmation 信号 + 透传中文确认消息
      expect(result.needsConfirmation).toBe(true)
      expect(result.confirmationMessage).toContain('连带')
      expect(result.confirmationMessage).toContain('完成')
      expect(mockSmExecute).not.toHaveBeenCalled()
    })

    it('T3: 有 2 级子任务 → BFS 统计正确（directCount=2, totalCount=5）', async () => {
      mockTaskFindById.mockResolvedValue({ id: 't1', status: 'in_progress', title: '父任务' })
      setupFindByParent({
        t1: [
          { id: 't2', status: 'todo', title: '子2', parentId: 't1' },
          { id: 't3', status: 'in_progress', title: '子3', parentId: 't1' },
        ],
        t2: [
          { id: 't4', status: 'todo', title: '孙4', parentId: 't2' },
          { id: 't5', status: 'todo', title: '孙5', parentId: 't2' },
          { id: 't6', status: 'todo', title: '孙6', parentId: 't2' },
        ],
      })
      const orchestrator = createTestOrchestrator()
      const result = await orchestrator.executeIntent(
        makeIntent({ action: 'completeTask', fields: { taskId: 't1' } }),
        userId,
      )
      expect(result.suspended!.reason).toBe('need_confirm')
      const preview = (result.suspended!.data as any).cascadePreview
      expect(preview.directCount).toBe(2)
      expect(preview.totalCount).toBe(5)
      expect(preview.allDescendants).toHaveLength(5)
      const ids = preview.allDescendants.map((d: any) => d.id)
      expect(ids).toEqual(expect.arrayContaining(['t2', 't3', 't4', 't5', 't6']))
      // [025] D2 — 有孙级时确认消息应含孙级数量与直接子任务数量
      expect(result.needsConfirmation).toBe(true)
      expect(result.confirmationMessage).toContain('连带')
      expect(result.confirmationMessage).toContain('5 个下级任务')
      expect(result.confirmationMessage).toContain('2 个直接子任务')
      expect(result.confirmationMessage).toContain('3 个孙级')
    })
  })

  // ═══════════════════════════════════════════════════════════════
  describe('cascadeCheck — archive/delete/cascade_ 直通', () => {
    it('T4: deleteTask 有 archived 子任务 → 含 archived 不含 deleted', async () => {
      mockTaskFindById.mockResolvedValue({ id: 't1', status: 'in_progress', title: '父任务' })
      setupFindByParent({
        t1: [
          { id: 't2', status: 'archived', title: '已归档', parentId: 't1' },
          { id: 't3', status: 'deleted', title: '已删除', parentId: 't1' },
        ],
      })
      const orchestrator = createTestOrchestrator()
      const result = await orchestrator.executeIntent(
        makeIntent({ action: 'deleteTask', fields: { taskId: 't1' } }),
        userId,
      )
      expect(result.suspended!.reason).toBe('need_confirm')
      const preview = (result.suspended!.data as any).cascadePreview
      expect(preview.totalCount).toBe(1)
      expect(preview.allDescendants).toHaveLength(1)
      expect(preview.allDescendants[0].id).toBe('t2')
      expect(preview.allDescendants.map((d: any) => d.id)).not.toContain('t3')
    })

    it('T5: cascade_complete action → Passed（不递归）', async () => {
      const orchestrator = createTestOrchestrator()
      const result = await orchestrator.executeIntent(
        makeIntent({ action: 'cascade_complete', fields: { taskId: 't1' } }),
        userId,
      )
      expect(result.success).toBe(true)
      expect(result.suspended).toBeUndefined()
      expect(mockSmExecute).toHaveBeenCalled()
    })

    it('T6: createTask action → Passed（非白名单）', async () => {
      mockThreadFindById.mockResolvedValue({ id: 'th1', status: 'active', name: '事业' })
      const orchestrator = createTestOrchestrator()
      const result = await orchestrator.executeIntent(
        makeIntent({ action: 'createTask', fields: { threadId: 'th1', title: '新任务' } }),
        userId,
      )
      expect(result.success).toBe(true)
      expect(result.suspended).toBeUndefined()
      expect(mockSmExecute).toHaveBeenCalled()
    })
  })

  // ═══════════════════════════════════════════════════════════════
  describe('cascadeCheck — Thread 级联', () => {
    it('T7: completeThread 级联其下所有 task', async () => {
      mockThreadFindById.mockResolvedValue({ id: 'th1', status: 'active', name: '事业' })
      mockTaskFindByUserId.mockResolvedValue([
        { id: 't1', status: 'todo', title: '任务1', parentId: null },
        { id: 't2', status: 'in_progress', title: '任务2', parentId: null },
        { id: 't3', status: 'todo', title: '任务3', parentId: null },
      ])
      // BFS 展开：各任务无子任务
      setupFindByParent({})
      const orchestrator = createTestOrchestrator()
      const result = await orchestrator.executeIntent(
        makeIntent({ action: 'completeThread', fields: { threadId: 'th1' } }),
        userId,
      )
      expect(result.suspended!.reason).toBe('need_confirm')
      const preview = (result.suspended!.data as any).cascadePreview
      expect(preview.parentType).toBe('thread')
      expect(preview.parentTitle).toBe('事业')
      expect(preview.directCount).toBe(3)
      expect(preview.totalCount).toBe(3)
      expect(preview.allDescendants).toHaveLength(3)
      expect(preview.cascadeAction).toBe('cascade_complete')
    })

    it('T8: Thread 自身状态转换不走级联', async () => {
      mockTaskFindByUserId.mockResolvedValue([])
      const orchestrator = createTestOrchestrator()
      const result = await orchestrator.executeIntent(
        makeIntent({ action: 'completeThread', fields: { threadId: 'th1' } }),
        userId,
      )
      expect(result.success).toBe(true)
      expect(result.suspended).toBeUndefined()
      expect(mockSmExecute).toHaveBeenCalled()
    })
  })

  // ═══════════════════════════════════════════════════════════════
  describe('parentConstraintCheck — createTask 双重约束', () => {
    it('T9: completed thread 下 createTask → Rejected', async () => {
      mockThreadFindById.mockResolvedValue({ id: 'th1', status: 'completed', name: '已完成主线' })
      const orchestrator = createTestOrchestrator()
      const result = await orchestrator.executeIntent(
        makeIntent({ action: 'createTask', fields: { threadId: 'th1', title: '新任务' } }),
        userId,
      )
      expect(result.success).toBe(false)
      expect(result.error).toContain('无法在已完成/已归档的主线下创建任务')
      expect(mockSmExecute).not.toHaveBeenCalled()
    })

    it('T10: archived parent task 下 createTask → Rejected', async () => {
      mockTaskFindById.mockResolvedValue({ id: 't1', status: 'archived', title: '已归档父任务' })
      const orchestrator = createTestOrchestrator()
      const result = await orchestrator.executeIntent(
        makeIntent({ action: 'createTask', fields: { parentId: 't1', title: '子任务' } }),
        userId,
      )
      expect(result.success).toBe(false)
      expect(result.error).toContain('无法在已完成/已归档/已删除的任务下创建子任务')
      expect(mockSmExecute).not.toHaveBeenCalled()
    })
  })

  // ═══════════════════════════════════════════════════════════════
  describe('级联确认与执行', () => {
    it('T11: NeedConfirm 但 confirmed≠true → 不执行级联', async () => {
      mockTaskFindById.mockResolvedValue({ id: 't1', status: 'in_progress', title: '父任务' })
      setupFindByParent({
        t1: [{ id: 't2', status: 'todo', title: '子任务', parentId: 't1' }],
      })
      const orchestrator = createTestOrchestrator()
      const result = await orchestrator.executeIntent(
        makeIntent({ action: 'completeTask', fields: { taskId: 't1' } }),
        userId,
      )
      expect(result.success).toBe(false)
      expect(result.suspended!.reason).toBe('need_confirm')
      expect(mockSmExecute).not.toHaveBeenCalled()
    })

    it('T12: confirmed=true → 父+子全部执行成功', async () => {
      mockTaskFindById.mockResolvedValue({ id: 't1', status: 'in_progress', title: '父任务' })
      setupFindByParent({
        t1: [{ id: 't2', status: 'todo', title: '子任务', parentId: 't1' }],
      })
      mockSmExecute.mockResolvedValue({ success: true, object: { id: 't1', status: 'completed' } })
      const orchestrator = createTestOrchestrator()
      const result = await orchestrator.executeIntent(
        makeIntent({ action: 'completeTask', fields: { taskId: 't1' } }),
        userId, true,
      )
      expect(result.success).toBe(true)
      expect(result.warnings).toBeDefined()
      expect(result.warnings!.some(w => w.includes('级联操作完成'))).toBe(true)
      expect(result.warnings!.some(w => w.includes('1 个子任务已处理'))).toBe(true)
      expect(mockSmExecute).toHaveBeenCalledTimes(2)
    })

    it('T13: 父 SM 执行失败 → 子任务不执行', async () => {
      mockTaskFindById.mockResolvedValue({ id: 't1', status: 'in_progress', title: '父任务' })
      setupFindByParent({
        t1: [{ id: 't2', status: 'todo', title: '子任务', parentId: 't1' }],
      })
      mockSmExecute.mockResolvedValue({ success: false, error: '非法状态转换' })
      const orchestrator = createTestOrchestrator()
      const result = await orchestrator.executeIntent(
        makeIntent({ action: 'completeTask', fields: { taskId: 't1' } }),
        userId, true,
      )
      expect(result.success).toBe(false)
      expect(result.error).toBe('非法状态转换')
      expect(mockSmExecute).toHaveBeenCalledTimes(1)
    })

    it('T14: 部分子任务失败 → warnings 含失败计数', async () => {
      mockTaskFindById.mockResolvedValue({ id: 't1', status: 'in_progress', title: '父任务' })
      setupFindByParent({
        t1: [
          { id: 't2', status: 'todo', title: '子2', parentId: 't1' },
          { id: 't3', status: 'todo', title: '子3', parentId: 't1' },
          { id: 't4', status: 'todo', title: '子4', parentId: 't1' },
        ],
      })
      mockSmExecute
        .mockResolvedValueOnce({ success: true, object: { id: 't1', status: 'completed' } })
        .mockResolvedValueOnce({ success: true, object: { id: 't2', status: 'completed' } })
        .mockResolvedValueOnce({ success: false, error: 't3 SM 错误' })
        .mockResolvedValueOnce({ success: true, object: { id: 't4', status: 'completed' } })
      const orchestrator = createTestOrchestrator()
      const result = await orchestrator.executeIntent(
        makeIntent({ action: 'completeTask', fields: { taskId: 't1' } }),
        userId, true,
      )
      expect(result.success).toBe(false)
      expect(result.error).toBe('1/3 个子任务级联失败')
      expect(result.warnings).toBeDefined()
      expect(result.warnings!.some(w =>
        w.includes('级联操作完成') && w.includes('3 个子任务已处理') && w.includes('1 个失败')
      )).toBe(true)
      expect(mockSmExecute).toHaveBeenCalledTimes(4)
    })

    it('T15: threadId + parentId 同时违规 → 两个错误都报告', async () => {
      mockThreadFindById.mockResolvedValue({ id: 'th1', status: 'completed', name: '已完成主线' })
      mockTaskFindById.mockResolvedValue({ id: 't1', status: 'archived', title: '已归档父任务' })
      const orchestrator = createTestOrchestrator()
      const result = await orchestrator.executeIntent(
        makeIntent({ action: 'createTask', fields: { threadId: 'th1', parentId: 't1', title: '新任务' } }),
        userId,
      )
      expect(result.success).toBe(false)
      expect(result.error).toContain('无法在已完成/已归档的主线下创建任务')
      expect(result.error).toContain('无法在已完成/已归档/已删除的任务下创建子任务')
    })
  })
})
