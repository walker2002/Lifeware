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

/** 生命周期状态映射 */
const LIFECYCLE_STATUS_MAP: Record<string, string> = {
  completeTask: 'active',
  archiveTask: 'completed',
}

/** 生命周期状态机动作映射 */
const LIFECYCLE_SM_ACTION: Record<string, string> = {
  completeTask: 'complete',
  archiveTask: 'archive',
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

    if (action in LIFECYCLE_STATUS_MAP) {
      const status = LIFECYCLE_STATUS_MAP[action]
      const items = await getTasksByStatus(status)
      const smAction = LIFECYCLE_SM_ACTION[action]
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
      const { submitDynamicIntent } = await import('@/app/actions/intent')
      const result = await submitDynamicIntent('tasks', action, fields)
      return { success: result.success, error: result.error }
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
