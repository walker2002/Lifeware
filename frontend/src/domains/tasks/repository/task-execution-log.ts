import { eq, and } from 'drizzle-orm'
import { db } from '../../../lib/db/index'
import * as s from '../../../lib/db/schema'
import type { TaskExecutionLog } from '../../../usom/types/objects'
import type { USOM_ID } from '../../../usom/types/primitives'
import type { ITaskExecutionLogRepository } from '../../../usom/interfaces/irepository'
import { taskExecutionLogRowToUSOM, taskExecutionLogUSOMToRow } from '../../../lib/db/repositories/mappers'

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
