/**
 * @file task-execution-log
 * @brief 任务执行日志仓储实现
 * 
 * 实现 ITaskExecutionLogRepository 接口，提供任务执行日志的数据库操作
 */

import { eq, and } from 'drizzle-orm'
import { db } from '../../../lib/db/index'
import * as s from '../../../lib/db/schema'
import type { TaskExecutionLog } from '../../../usom/types/objects'
import type { USOM_ID } from '../../../usom/types/primitives'
import type { ITaskExecutionLogRepository } from '../../../usom/interfaces/irepository'
import { taskExecutionLogRowToUSOM, taskExecutionLogUSOMToRow } from '../../../lib/db/repositories/mappers'

/**
 * 任务执行日志仓储
 */
export class TaskExecutionLogRepository implements ITaskExecutionLogRepository {
  async findByTask(taskId: USOM_ID, userId: USOM_ID): Promise<TaskExecutionLog[]> {
    const rows = await db.select().from(s.taskExecutionLogs)
      .where(and(eq(s.taskExecutionLogs.taskId, taskId), eq(s.taskExecutionLogs.userId, userId)))
    return rows.map(r => taskExecutionLogRowToUSOM(r as any))
  }

  async findByTimebox(timeboxId: USOM_ID, userId: USOM_ID): Promise<TaskExecutionLog[]> {
    const rows = await db.select().from(s.taskExecutionLogs)
      .where(and(eq(s.taskExecutionLogs.timeboxId, timeboxId), eq(s.taskExecutionLogs.userId, userId)))
    return rows.map(r => taskExecutionLogRowToUSOM(r as any))
  }

  async save(log: TaskExecutionLog, userId: USOM_ID): Promise<void> {
    await db.insert(s.taskExecutionLogs).values(taskExecutionLogUSOMToRow(log, userId))
  }
}
