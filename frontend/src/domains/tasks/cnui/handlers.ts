/**
 * @file handlers
 * @brief Tasks CNUI Surface 处理器（[018-G3] R3：errors[] 透传回填）
 *
 * 实现 CN-UI 协议的 Surface Handler，处理任务相关的打开、提交事件
 */

import type { CnuiSurfaceHandler, CnuiSurfaceOpenResult, CnuiSurfaceSubmitResult } from '@/nexus/ai-runtime/cnui/types'
import { TaskRepository } from '@/domains/tasks/repository/task'
import type { USOM_ID } from '@/usom/types/primitives'

const MVP_USER_ID = '00000000-0000-0000-0000-000000000001'

/** 任务生命周期状态映射 — 用于查询对应状态的任务列表 */
const TASK_LIFECYCLE_STATUS_MAP: Record<string, string> = {
  completeTask: 'in_progress',
  archiveTask: 'completed',
}

/**
 * 可删除的任务状态列表 — 仅归档后可删除（业务规则）
 * 对应 manifest lifecycle: completed → archived → deleted
 */
const DELETABLE_TASK_STATUSES = ['archived']

/** 任务生命周期状态机动作映射 — 仅归档后可删除（业务规则） */
const TASK_LIFECYCLE_SM_ACTION: Record<string, string> = {
  completeTask: 'complete',
  archiveTask: 'archive',
  deleteTask: 'delete',
}

/** 主线生命周期状态映射 — 用于查询对应状态的主线列表 */
const THREAD_LIFECYCLE_STATUS_MAP: Record<string, string> = {
  pauseThread: 'active',
  resumeThread: 'paused',
  completeThread: 'active',
  archiveThread: 'completed',
  deleteThread: 'archived',
}

/** 主线生命周期状态机动作映射 */
const THREAD_LIFECYCLE_SM_ACTION: Record<string, string> = {
  pauseThread: 'pause',
  resumeThread: 'resume',
  completeThread: 'complete',
  archiveThread: 'archive',
  deleteThread: 'delete',
}

/**
 * 将 Task 对象格式化为 CNUI dataModel 的 detail 格式
 * @param t - 任务对象
 * @returns 格式化后的任务详情
 */
function formatTaskDetail(t: any): Record<string, unknown> {
  return {
    id: t.id,
    title: t.title,
    description: t.description ?? '',
    priority: t.priority,
    estimatedDuration: t.estimatedDuration,
    status: t.status,
    threadId: t.threadId,
    dueDate: t.endDate,
  }
}

/**
 * 将 Task 数组格式化为 CNUI dataModel 的列表格式
 * @param tasks - 任务数组
 * @returns 格式化的任务列表
 */
function formatTaskList(tasks: any[]): Record<string, unknown>[] {
  return tasks.map(t => ({
    id: t.id,
    title: t.title,
    priority: t.priority,
    estimatedDuration: t.estimatedDuration,
    status: t.status,
    clarity: t.clarity,
    startDate: t.startDate,
    endDate: t.endDate,
    actualDuration: t.actualDuration,
  }))
}

/**
 * 获取所有未归档的有效主线列表
 * @returns 主线列表（供 createTask CNUI surface 的主线下拉使用）
 */
async function getActiveThreads(): Promise<Record<string, unknown>[]> {
  try {
    const { ThreadRepository } = await import('@/domains/tasks/repository/thread')
    const repo = new ThreadRepository()
    const threads = await repo.findByUserId(MVP_USER_ID as USOM_ID)
    return threads
      .filter(t => t.status !== 'archived')
      .map(t => ({
        id: t.id,
        name: t.name,
        color: t.color,
        status: t.status,
      }))
  } catch (e) {
    console.error('[taskCnuiHandler] 查询主线列表失败:', e)
    return []
  }
}

/**
 * 根据状态获取任务列表
 *
 * @param status - 任务状态
 * @returns 任务列表
 */
async function getTasksByStatus(status: string): Promise<Record<string, unknown>[]> {
  try {
    const repo = new TaskRepository()
    const tasks = await repo.findByStatus(status as any, MVP_USER_ID as USOM_ID)
    return tasks.map(t => ({
      id: t.id,
      title: t.title,
      priority: t.priority,
      estimatedDuration: t.estimatedDuration,
      status: t.status,
    }))
  } catch (e) {
    console.error(`[taskCnuiHandler] 查询 tasks (status=${status}) 失败:`, e)
    return []
  }
}

async function getActiveTasks(): Promise<Record<string, unknown>[]> {
  try {
    const repo = new TaskRepository()
    const tasks = await repo.findActive(MVP_USER_ID as USOM_ID)
    return tasks.map(t => ({
      id: t.id,
      title: t.title,
      priority: t.priority,
      estimatedDuration: t.estimatedDuration,
      status: t.status,
      threadId: t.threadId,
    }))
  } catch (e) {
    console.error('[taskCnuiHandler] 查询 active tasks 失败:', e)
    return []
  }
}

/**
 * 构建任务树形数据（主线 + 任务），供 TaskTreeView 共享复用
 * @param taskFilter - 可选的任务过滤器（如按状态筛选）
 * @returns 主线列表和过滤后的任务列表
 */
async function buildTaskTreeData(
  taskFilter?: (t: any) => boolean
): Promise<{ threads: Record<string, unknown>[]; tasks: Record<string, unknown>[] }> {
  const { ThreadRepository } = await import('@/domains/tasks/repository/thread')
  const threadRepo = new ThreadRepository()
  const taskRepo = new TaskRepository()
  const allThreads = await threadRepo.findByUserId(MVP_USER_ID as USOM_ID)
  let allTasks = await taskRepo.findByUserId(MVP_USER_ID as USOM_ID)
  if (taskFilter) allTasks = allTasks.filter(taskFilter)

  return {
    threads: allThreads.map(t => ({
      id: t.id, name: t.name, color: t.color, status: t.status,
    })),
    tasks: allTasks.map(t => ({
      id: t.id, title: t.title, status: t.status, priority: t.priority,
      threadId: t.threadId, parentId: t.parentId,
      estimatedDuration: t.estimatedDuration,
      startDate: t.startDate, endDate: t.endDate, clarity: t.clarity,
    })),
  }
}

export const taskCnuiHandler: CnuiSurfaceHandler = {
  async open(action, intentFields): Promise<CnuiSurfaceOpenResult> {
    if (action === 'createTask') {
      const threads = await getActiveThreads()
      return { content: '请填写任务信息', dataSnapshot: { threads } }
    }

    if (action === 'updateTask') {
      if (intentFields?.taskId) {
        const repo = new TaskRepository()
        const task = await repo.findById(intentFields.taskId as USOM_ID, MVP_USER_ID as USOM_ID)
        if (task) return { content: '请编辑任务信息', dataSnapshot: { task: formatTaskDetail(task), action, phase: 'detail', tasks: [] } }
      }
      if (intentFields?.title) {
        const repo = new TaskRepository()
        const statusFilter = ['todo', 'planned', 'in_progress', 'completed']
        const candidates = await repo.searchByTitle(intentFields.title as string, MVP_USER_ID as USOM_ID, statusFilter as any)
        if (candidates.length === 1) {
          return { content: '请编辑任务信息', dataSnapshot: { task: formatTaskDetail(candidates[0]), action, phase: 'detail', tasks: [] } }
        }
        if (candidates.length > 1) {
          return { content: '找到多个匹配任务，请选择', dataSnapshot: { items: formatTaskList(candidates), action, phase: 'select', tasks: formatTaskList(candidates) } }
        }
      }
      const treeData = await buildTaskTreeData(t => !['archived', 'deleted'].includes(t.status))
      return { content: '请选择要修改的任务', dataSnapshot: { action: 'update', defaultStatusFilter: ['todo', 'planned', 'in_progress', 'completed'], ...treeData } }
    }

    // ── 主线操作 ──

    if (action === 'createThread') {
      return { content: '请填写主线信息', dataSnapshot: {} }
    }

    if (action === 'updateThread') {
      try {
        const { ThreadRepository } = await import('@/domains/tasks/repository/thread')
        const repo = new ThreadRepository()
        if (intentFields?.threadId) {
          const thread = await repo.findById(intentFields.threadId as USOM_ID, MVP_USER_ID as USOM_ID)
          if (thread) return { content: '编辑主线信息', dataSnapshot: { thread: { id: thread.id, name: thread.name, description: thread.description, color: thread.color, priority: thread.priority, status: thread.status }, action: 'update', phase: 'detail' } }
        }
        if (intentFields?.name) {
          const candidates = await repo.searchByName(intentFields.name as string, MVP_USER_ID as USOM_ID)
          if (candidates.length === 1) {
            const t = candidates[0]
            return { content: '编辑主线信息', dataSnapshot: { thread: { id: t.id, name: t.name, description: t.description, color: t.color, priority: t.priority, status: t.status }, action: 'update', phase: 'detail' } }
          }
          if (candidates.length > 1) {
            return { content: '找到多个匹配主线，请选择', dataSnapshot: { items: candidates.map(t => ({ id: t.id, name: t.name, color: t.color, priority: t.priority, status: t.status })), action: 'update', phase: 'select' } }
          }
        }
        const threads = await repo.findByUserId(MVP_USER_ID as USOM_ID)
        return {
          content: '请选择要修改的主线',
          dataSnapshot: {
            action: 'update',
            threads: threads.map(t => ({
              id: t.id,
              name: t.name,
              color: t.color,
              status: t.status,
              priority: t.priority,
            })),
          },
        }
      } catch (e) {
        console.error('[taskCnuiHandler] 查询 threads 失败:', e)
        return { content: '请填写信息', dataSnapshot: {} }
      }
    }

    // ── AI 辅助操作 ──

    if (action === 'refineTask') {
      try {
        const repo = new TaskRepository()
        const allTasks = await repo.findByUserId(MVP_USER_ID as USOM_ID)
        const fuzzyTasks = allTasks
          .filter(t => t.clarity === 'fuzzy' || t.clarity === 'scoped')
          .map(t => ({
            id: t.id,
            title: t.title,
            priority: t.priority,
            estimatedDuration: t.estimatedDuration,
            status: t.status,
          }))
        return {
          content: '请选择要细化的任务',
          dataSnapshot: { action: 'refine', items: fuzzyTasks },
        }
      } catch (e) {
        console.error('[taskCnuiHandler] 查询模糊任务失败:', e)
        return { content: '请填写信息', dataSnapshot: {} }
      }
    }

    if (action === 'splitTask') {
      const tasks = await getActiveTasks()
      return {
        content: '请选择要拆分的任务',
        dataSnapshot: { items: tasks },
      }
    }

    if (action in THREAD_LIFECYCLE_STATUS_MAP) {
      try {
        const { ThreadRepository } = await import('@/domains/tasks/repository/thread')
        const repo = new ThreadRepository()
        const status = THREAD_LIFECYCLE_STATUS_MAP[action]
        const threads = await repo.findByStatus(status as any, MVP_USER_ID as USOM_ID)
        const items = threads.map(t => ({
          id: t.id,
          name: t.name,
          color: t.color,
          priority: t.priority,
          status: t.status,
          description: t.description,
        }))
        const smAction = THREAD_LIFECYCLE_SM_ACTION[action]
        const labels: Record<string, string> = {
          pause: '暂停',
          resume: '恢复',
          complete: '完成',
          archive: '归档',
        }
        return {
          content: `请选择要${labels[smAction] ?? smAction}的主线`,
          dataSnapshot: { action: smAction, items },
        }
      } catch (e) {
        console.error('[taskCnuiHandler] 查询线程生命周期列表失败:', e)
        return { content: '请填写信息', dataSnapshot: {} }
      }
    }

    // ── 任务生命周期操作 ──

    if (action === 'deleteTask') {
      // intentFields 优先
      if (intentFields?.taskId) {
        const repo = new TaskRepository()
        const task = await repo.findById(intentFields.taskId as USOM_ID, MVP_USER_ID as USOM_ID)
        if (task) return { content: '确认删除任务', dataSnapshot: { task: formatTaskDetail(task), action: 'delete', phase: 'detail', items: [] } }
      }

      try {
        const treeData = await buildTaskTreeData(t => (DELETABLE_TASK_STATUSES as string[]).includes(t.status))
        return {
          content: '请选择要删除的任务',
          dataSnapshot: { action: 'delete', fixedStatusFilter: ['archived'], ...treeData },
        }
      } catch (e) {
        console.error('[taskCnuiHandler] 查询可删除任务失败:', e)
        return { content: '请填写信息', dataSnapshot: {} }
      }
    }

    if (action in TASK_LIFECYCLE_STATUS_MAP) {
      const status = TASK_LIFECYCLE_STATUS_MAP[action]
      const smAction = TASK_LIFECYCLE_SM_ACTION[action]
      const labels: Record<string, string> = { complete: '完成', archive: '归档' }

      // intentFields 优先：通过 ID 或标题定位任务
      if (intentFields?.taskId) {
        const repo = new TaskRepository()
        const task = await repo.findById(intentFields.taskId as USOM_ID, MVP_USER_ID as USOM_ID)
        if (task) return { content: `确认${labels[smAction] ?? smAction}任务`, dataSnapshot: { task: formatTaskDetail(task), action: smAction, phase: 'detail', items: [] } }
      }
      if (intentFields?.title) {
        const repo = new TaskRepository()
        const candidates = await repo.searchByTitle(intentFields.title as string, MVP_USER_ID as USOM_ID, [status as any])
        if (candidates.length === 1) {
          return { content: `确认${labels[smAction] ?? smAction}任务`, dataSnapshot: { task: formatTaskDetail(candidates[0]), action: smAction, phase: 'detail', items: [] } }
        }
        if (candidates.length > 1) {
          return { content: `找到多个匹配任务，请选择要${labels[smAction] ?? smAction}的`, dataSnapshot: { items: formatTaskList(candidates), action: smAction, phase: 'select' } }
        }
      }

      const treeData = await buildTaskTreeData(t => t.status === status)
      return {
        content: `请选择要${labels[smAction] ?? smAction}的任务`,
        dataSnapshot: { action: smAction, fixedStatusFilter: [status], ...treeData },
      }
    }

    if (action === 'viewTaskTree') {
      try {
        const { ThreadRepository } = await import('@/domains/tasks/repository/thread')
        const threadRepo = new ThreadRepository()
        const taskRepo = new TaskRepository()
        const allThreads = await threadRepo.findByUserId(MVP_USER_ID as USOM_ID)
        const allTasks = await taskRepo.findByUserId(MVP_USER_ID as USOM_ID)

        return {
          content: '任务树',
          dataSnapshot: {
            threads: allThreads.map(t => ({
              id: t.id,
              name: t.name,
              color: t.color,
              status: t.status,
            })),
            tasks: allTasks.map(t => ({
              id: t.id,
              title: t.title,
              status: t.status,
              priority: t.priority,
              threadId: t.threadId,
              parentId: t.parentId,
              estimatedDuration: t.estimatedDuration,
              startDate: t.startDate,
              endDate: t.endDate,
              clarity: t.clarity,
            })),
          },
        }
      } catch (e) {
        console.error('[taskCnuiHandler] 查询任务树失败:', e)
        return { content: '查询任务树失败', dataSnapshot: {} }
      }
    }

    return { content: '请填写信息', dataSnapshot: {} }
  },

  async submit(action, fields): Promise<CnuiSurfaceSubmitResult> {
    // viewTaskTree 是纯展示 query action，无提交操作
    if (action === 'viewTaskTree') {
      return { success: true }
    }

    try {
      // ── 字段更新：不走 SM，直接 repo 调用（临时方案） ──

      // updateTask: 字段更新走直接 repo
      if (action === 'updateTask') {
        const { updateTask, createTask } = await import('@/app/actions/tasks')
        const task = await updateTask(fields.taskId as string, fields as any)

        // 处理子任务创建
        if (fields.createSubtask && typeof fields.createSubtask === 'object') {
          const sub = fields.createSubtask as { title: string; parentId: string; threadId?: string | null }
          await createTask({
            title: sub.title,
            parentId: sub.parentId,
            threadId: sub.threadId ?? task.threadId ?? undefined,
          })
        }

        return { success: true, data: { object: task } }
      }

      // updateThread: 字段更新走直接 repo
      if (action === 'updateThread') {
        const { updateThread } = await import('@/app/actions/tasks')
        const thread = await updateThread(fields.threadId as string, fields as any)
        return { success: true, data: { object: thread } }
      }

      // refineTask: MVP 阶段仅确认收到（AI 细化管道待实现）
      if (action === 'refineTask') {
        return { success: true, data: { message: '细化请求已提交，AI 将分析任务并给出建议' } }
      }

      // splitTask: MVP 阶段仅确认收到（AI 拆分管道待实现）
      if (action === 'splitTask') {
        return { success: true, data: { message: '拆分请求已提交，AI 将分析任务并给出建议' } }
      }

      const { submitDynamicIntent } = await import('@/app/actions/intent')

      // 线程批量操作：selectedIds 存在时逐个执行（遇错即停）
      const threadActions = Object.keys(THREAD_LIFECYCLE_STATUS_MAP)
      if (threadActions.includes(action) && fields.selectedIds) {
        const ids = fields.selectedIds as string[]
        for (const id of ids) {
          const r = await submitDynamicIntent('tasks', action, { threadId: id })
          if (!r.success) return { success: false, error: r.error ?? `${id} 操作失败`, errors: r.error ? [r.error] : undefined }
        }
        return { success: true, data: { selectedIds: ids } }
      }

      // 任务批量操作：selectedIds 存在时逐个执行（遇错即停）
      if (fields.selectedIds && (action in TASK_LIFECYCLE_SM_ACTION)) {
        const ids = fields.selectedIds as string[]
        for (const id of ids) {
          const r = await submitDynamicIntent('tasks', action, { taskId: id })
          if (!r.success) return { success: false, error: r.error ?? `${id} 操作失败`, errors: r.error ? [r.error] : undefined }
        }
        return { success: true, data: { selectedIds: ids } }
      }

      // createTask 校验：已归档主线不允许添加任务
      if (action === 'createTask' && fields.threadId) {
        const { ThreadRepository } = await import('@/domains/tasks/repository/thread')
        const repo = new ThreadRepository()
        const thread = await repo.findById(fields.threadId as USOM_ID, MVP_USER_ID as USOM_ID)
        if (thread?.status === 'archived') {
          return { success: false, error: '已归档的主线不允许添加任务', errors: ['已归档的主线不允许添加任务'] }
        }
      }

      const result = await submitDynamicIntent('tasks', action, fields)
      // [018-G3] R3：将 orchestrator 返回的扁平 error 拆分为 errors[] 供 surface 回填
      let errors: string[] | undefined
      if (!result.success && result.error) {
        errors = result.error.split('\n').filter(Boolean)
      }
      return {
        success: result.success,
        error: result.error,
        errors,
        data: result.object ? { object: result.object } : undefined,
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '操作失败'
      return { success: false, error: msg, errors: [msg] }
    }
  },
}

/** 所有 tasks domain 的 CNUI surface handler 映射 */
export const surfaceHandlers: Record<string, CnuiSurfaceHandler> = {
  'task-creation-card': taskCnuiHandler,
  'task-edit-card': taskCnuiHandler,
  'task-action-panel': taskCnuiHandler,
  'thread-creation-card': taskCnuiHandler,
  'thread-action-panel': taskCnuiHandler,
  'task-split-card': taskCnuiHandler,
  'task-tree-view': taskCnuiHandler,
}
