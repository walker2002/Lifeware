/**
 * @file handlers
 * @brief Tasks CNUI Surface 处理器
 * 
 * 实现 CN-UI 协议的 Surface Handler，处理任务相关的打开、提交事件
 */

import type { CnuiSurfaceHandler, CnuiSurfaceOpenResult, CnuiSurfaceSubmitResult } from '@/nexus/ai-runtime/cnui/types'
import { TaskRepository } from '@/domains/tasks/repository/task'
import type { USOM_ID } from '@/usom/types/primitives'

const MVP_USER_ID = '00000000-0000-0000-0000-000000000001'

/** 任务生命周期状态映射 — 用于查询对应状态的任务列表 */
const TASK_LIFECYCLE_STATUS_MAP: Record<string, string> = {
  completeTask: 'active',
  archiveTask: 'completed',
}

/**
 * 可删除的任务状态列表（manifest lifecycle: from [todo, planned, in_progress, completed] → deleted）
 * deleteTask 不用单状态查询，需查多个状态
 */
const DELETABLE_TASK_STATUSES = ['todo', 'planned', 'in_progress', 'completed']

/** 任务生命周期状态机动作映射 */
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
}

/** 主线生命周期状态机动作映射 */
const THREAD_LIFECYCLE_SM_ACTION: Record<string, string> = {
  pauseThread: 'pause',
  resumeThread: 'resume',
  completeThread: 'complete',
  archiveThread: 'archive',
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
    }))
  } catch (e) {
    console.error('[taskCnuiHandler] 查询 active tasks 失败:', e)
    return []
  }
}

export const taskCnuiHandler: CnuiSurfaceHandler = {
  async open(action): Promise<CnuiSurfaceOpenResult> {
    if (action === 'createTask') {
      const threads = await getActiveThreads()
      return { content: '请填写任务信息', dataSnapshot: { threads } }
    }

    if (action === 'updateTask') {
      const tasks = await getActiveTasks()
      return { content: '请选择要修改的任务', dataSnapshot: { tasks } }
    }

    // ── 主线操作 ──

    if (action === 'createThread') {
      return { content: '请填写主线信息', dataSnapshot: {} }
    }

    if (action === 'updateThread') {
      try {
        const { ThreadRepository } = await import('@/domains/tasks/repository/thread')
        const repo = new ThreadRepository()
        const threads = await repo.findByUserId(MVP_USER_ID as USOM_ID)
        return {
          content: '请选择要修改的主线',
          dataSnapshot: {
            threads: threads.map(t => ({
              id: t.id,
              name: t.name,
              color: t.color,
              status: t.status,
            })),
          },
        }
      } catch (e) {
        console.error('[taskCnuiHandler] 查询 threads 失败:', e)
        return { content: '请填写信息', dataSnapshot: {} }
      }
    }

    if (action === 'promoteToThread') {
      const tasks = await getActiveTasks()
      return {
        content: '请选择要提升为主线的任务',
        dataSnapshot: { tasks },
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
      // deleteTask 需查询多个可删除状态（非单状态映射）
      try {
        const repo = new TaskRepository()
        const allTasks = await repo.findByUserId(MVP_USER_ID as USOM_ID)
        const items = allTasks
          .filter(t => (DELETABLE_TASK_STATUSES as string[]).includes(t.status))
          .map(t => ({
            id: t.id,
            title: t.title,
            priority: t.priority,
            estimatedDuration: t.estimatedDuration,
            status: t.status,
          }))
        return {
          content: '请选择要删除的任务',
          dataSnapshot: { action: 'delete', items },
        }
      } catch (e) {
        console.error('[taskCnuiHandler] 查询可删除任务失败:', e)
        return { content: '请填写信息', dataSnapshot: {} }
      }
    }

    if (action in TASK_LIFECYCLE_STATUS_MAP) {
      const status = TASK_LIFECYCLE_STATUS_MAP[action]
      const items = await getTasksByStatus(status)
      const smAction = TASK_LIFECYCLE_SM_ACTION[action]
      const labels: Record<string, string> = { complete: '完成', archive: '归档' }
      return {
        content: `请选择要${labels[smAction] ?? smAction}的任务`,
        dataSnapshot: { action: smAction, items },
      }
    }

    if (action === 'viewTree') {
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
    // viewTree 是纯展示 query action，无提交操作
    if (action === 'viewTree') {
      return { success: true }
    }

    try {
      // promoteToThread 是多阶段编排操作（创建主线 + 关联任务），
      // 不走 SM 单步转换路径，直接调用专用服务端操作
      if (action === 'promoteToThread') {
        const { promoteToThread } = await import('@/app/actions/tasks')
        const thread = await promoteToThread(fields.taskId as string, fields as Partial<import('@/usom/interfaces/irepository').CreateThreadInput>)
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
          if (!r.success) return { success: false, error: r.error ?? `${id} 操作失败` }
        }
        return { success: true, data: { selectedIds: ids } }
      }

      // 任务批量操作：selectedIds 存在时逐个执行（遇错即停）
      if (fields.selectedIds && (action in TASK_LIFECYCLE_SM_ACTION)) {
        const ids = fields.selectedIds as string[]
        for (const id of ids) {
          const r = await submitDynamicIntent('tasks', action, { taskId: id })
          if (!r.success) return { success: false, error: r.error ?? `${id} 操作失败` }
        }
        return { success: true, data: { selectedIds: ids } }
      }

      const result = await submitDynamicIntent('tasks', action, fields)
      return { success: result.success, error: result.error, data: result.object ? { object: result.object } : undefined }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '操作失败'
      return { success: false, error: msg }
    }
  },
}

/** 所有 tasks domain 的 CNUI surface handler 映射 */
export const surfaceHandlers: Record<string, CnuiSurfaceHandler> = {
  'task-creation-card': taskCnuiHandler,
  'task-edit-card': taskCnuiHandler,
  'task-action-panel': taskCnuiHandler,
  'thread-creation-card': taskCnuiHandler,
  'thread-promote-card': taskCnuiHandler,
  'thread-action-panel': taskCnuiHandler,
  'task-split-card': taskCnuiHandler,
}
