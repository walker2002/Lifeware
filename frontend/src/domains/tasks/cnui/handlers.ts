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

/** 任务生命周期状态映射 */
const TASK_LIFECYCLE_STATUS_MAP: Record<string, string> = {
  completeTask: 'active',
  archiveTask: 'completed',
}

/** 任务生命周期状态机动作映射 */
const TASK_LIFECYCLE_SM_ACTION: Record<string, string> = {
  completeTask: 'complete',
  archiveTask: 'archive',
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
      return { content: '请填写任务信息', dataSnapshot: {} }
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

    return { content: '请填写信息', dataSnapshot: {} }
  },

  async submit(action, fields): Promise<CnuiSurfaceSubmitResult> {
    try {
      // promoteToThread 是多阶段编排操作（创建主线 + 关联任务），
      // 不走 SM 单步转换路径，直接调用专用服务端操作
      if (action === 'promoteToThread') {
        const { promoteToThread } = await import('@/app/actions/tasks')
        const thread = await promoteToThread(fields.taskId as string, fields as Partial<import('@/usom/interfaces/irepository').CreateThreadInput>)
        return { success: true, data: { object: thread } }
      }

      const { submitDynamicIntent } = await import('@/app/actions/intent')
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
