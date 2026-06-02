/**
 * @file handlers
 * @brief Tasks CNUI Surface 处理器
 * 
 * 实现 CN-UI 协议的 Surface Handler，处理任务相关的打开、提交事件
 */

import type { CnuiSurfaceHandler, CnuiSurfaceOpenResult, CnuiSurfaceSubmitResult } from '@/nexus/ai-runtime/cnui/types'
import { TaskRepository } from '@/domains/tasks/repository/task'
import { SystemEventRepository } from '@/lib/db/repositories/system-event.repository'
import { taskTransitions, findTransition } from '@/domains/tasks/transitions'
import type { USOM_ID, Timestamp } from '@/usom/types/primitives'
import type { SystemEvent, SystemEventType } from '@/usom/types/process'

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
    if (action === 'createTask') {
      const title = fields['title'] as string
      if (!title || title.trim() === '') {
        return { success: false, error: '任务标题不能为空' }
      }

      try {
        const taskRepo = new TaskRepository()
        const eventRepo = new SystemEventRepository()
        const now = new Date().toISOString() as Timestamp

        const taskId = crypto.randomUUID() as USOM_ID
        await taskRepo.save({
          id: taskId,
          title: title.trim(),
          description: (fields['description'] as string) || undefined,
          status: 'draft',
          priority: (fields['priority'] as any) || 'medium',
          energyRequired: (fields['energyRequired'] as any) || 'medium',
          estimatedDuration: (fields['estimatedDuration'] as number) || 30,
          tags: [],
          createdAt: now,
          updatedAt: now,
        }, MVP_USER_ID as USOM_ID)

        const transition = findTransition(taskTransitions, null, 'create')
        if (transition) {
          const event: SystemEvent = {
            id: crypto.randomUUID() as USOM_ID,
            type: transition.eventType as SystemEventType,
            occurredAt: now,
            triggeredBy: 'handler',
            payload: { taskId, toStatus: transition.to },
            snapshotId: '' as USOM_ID,
          }
          await eventRepo.append(event, MVP_USER_ID as USOM_ID)
        }

        return { success: true }
      } catch (err) {
        const msg = err instanceof Error ? err.message : '创建任务失败'
        return { success: false, error: msg }
      }
    }

    if (action === 'updateTask') {
      const taskId = fields['taskId'] as string
      if (!taskId) {
        return { success: false, error: '未选择任务' }
      }

      try {
        const taskRepo = new TaskRepository()
        const existing = await taskRepo.findById(taskId as USOM_ID, MVP_USER_ID as USOM_ID)
        if (!existing) {
          return { success: false, error: '任务不存在' }
        }

        const updates: Record<string, unknown> = {
          ...existing,
          updatedAt: new Date().toISOString(),
        }
        if (fields['title']) updates.title = fields['title']
        if (fields['description']) updates.description = fields['description']
        if (fields['priority']) updates.priority = fields['priority']
        if (fields['estimatedDuration']) updates.estimatedDuration = fields['estimatedDuration']

        await taskRepo.save(updates as any, MVP_USER_ID as USOM_ID)
        return { success: true }
      } catch (err) {
        const msg = err instanceof Error ? err.message : '更新任务失败'
        return { success: false, error: msg }
      }
    }

    if (action in LIFECYCLE_SM_ACTION) {
      const selectedIds = fields['selectedIds'] as string[]
      if (!selectedIds || selectedIds.length === 0) {
        return { success: false, error: '未选择任何任务' }
      }

      const smAction = (fields['action'] as string ?? LIFECYCLE_SM_ACTION[action]) as 'complete' | 'archive'

      try {
        const taskRepo = new TaskRepository()
        const eventRepo = new SystemEventRepository()
        const now = new Date().toISOString() as Timestamp
        let lastError: string | undefined

        for (const taskId of selectedIds) {
          const existing = await taskRepo.findById(taskId as USOM_ID, MVP_USER_ID as USOM_ID)
          if (!existing) {
            lastError = `任务不存在: ${taskId}`
            continue
          }

          const transition = findTransition(taskTransitions, existing.status as any, smAction)
          if (!transition) {
            lastError = `非法状态转换: action="${smAction}", fromState="${existing.status}"`
            continue
          }

          await taskRepo.updateStatus(taskId as USOM_ID, transition.to, MVP_USER_ID as USOM_ID)

          const event: SystemEvent = {
            id: crypto.randomUUID() as USOM_ID,
            type: transition.eventType as SystemEventType,
            occurredAt: now,
            triggeredBy: 'handler',
            payload: { taskId, fromStatus: existing.status, toStatus: transition.to },
            snapshotId: '' as USOM_ID,
          }
          await eventRepo.append(event, MVP_USER_ID as USOM_ID)
        }

        if (lastError) return { success: false, error: lastError }
        return { success: true }
      } catch (err) {
        const msg = err instanceof Error ? err.message : '状态更新失败'
        return { success: false, error: msg }
      }
    }

    return { success: false, error: `Unknown CN-UI action: tasks/${action}` }
  },
}

/** 所有 tasks domain 的 CNUI surface handler 映射 */
export const surfaceHandlers: Record<string, CnuiSurfaceHandler> = {
  'task-creation-card': taskCnuiHandler,
  'task-edit-card': taskCnuiHandler,
  'task-action-panel': taskCnuiHandler,
}
