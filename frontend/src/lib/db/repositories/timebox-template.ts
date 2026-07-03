/**
 * @file timebox-template.repository
 * @brief 时间盒模板仓储实现（[023-02] 行列表 + 模板级星期，配置类不走 Nexus）
 *
 * 每次 create/update/delete 操作自动写入 user_audit_log（OQ-7）。
 * A3 owner-check：rows 中 source∈{habit,task,thread} 的 sourceId 全部归属当前 userId。
 *
 * @see docs/usom-design.md §3.12
 * @see docs/database-design.md §7.8
 */

import { eq, and, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import type { DbClient } from '@/lib/db'
import * as s from '@/lib/db/schema'
import type { TemplateRow } from '@/lib/db/schema'
import type { USOM_ID } from '@/usom/types/primitives'

/** TimeboxTemplate（USOM 形状，DB 行 → 业务对象的映射目标） */
export interface TimeboxTemplate {
  id: USOM_ID
  userId: USOM_ID
  schemaVersion: number
  name: string
  daysOfWeek: number[]
  rows: TemplateRow[]
  createdAt: string
  updatedAt: string
}

/** Create/Update 输入（除 id 外字段必填） */
export interface TimeboxTemplateInput {
  id?: string
  name: string
  daysOfWeek: number[]
  rows: TemplateRow[]
}

/** DB 行 → USOM TimeboxTemplate */
function rowToTemplate(row: typeof s.timeboxTemplates.$inferSelect): TimeboxTemplate {
  return {
    id: row.id,
    userId: row.userId,
    schemaVersion: row.schemaVersion,
    name: row.name,
    daysOfWeek: row.daysOfWeek ?? [0, 1, 2, 3, 4, 5, 6],
    rows: row.rows ?? [],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export class TimeboxTemplateRepository {
  async findById(id: USOM_ID, userId: USOM_ID, tx?: DbClient): Promise<TimeboxTemplate | null> {
    const client = tx ?? db
    const rows = await client
      .select()
      .from(s.timeboxTemplates)
      .where(and(eq(s.timeboxTemplates.id, id), eq(s.timeboxTemplates.userId, userId)))
    return rows[0] ? rowToTemplate(rows[0]) : null
  }

  async findByUser(userId: USOM_ID, tx?: DbClient): Promise<TimeboxTemplate[]> {
    const client = tx ?? db
    const rows = await client
      .select()
      .from(s.timeboxTemplates)
      .where(eq(s.timeboxTemplates.userId, userId))
      .orderBy(s.timeboxTemplates.updatedAt)
    return rows.map(rowToTemplate)
  }

  async create(input: TimeboxTemplateInput, userId: USOM_ID, tx?: DbClient): Promise<TimeboxTemplate> {
    const exec = async (client: DbClient) => {
      await this.assertSubscriptionsOwned(input, userId, client)

      const [row] = await client
        .insert(s.timeboxTemplates)
        .values({
          userId,
          name: input.name,
          daysOfWeek: input.daysOfWeek,
          rows: input.rows,
        })
        .returning()

      const template = rowToTemplate(row)

      // OQ-7：写 audit log（同一事务）
      await this._logAudit(client, userId, 'create', template.id, {
        newValues: template as unknown as Record<string, unknown>,
      })

      return template
    }
    return tx ? exec(tx) : db.transaction(exec)
  }

  async update(id: USOM_ID, input: TimeboxTemplateInput, userId: USOM_ID, tx?: DbClient): Promise<TimeboxTemplate> {
    const exec = async (client: DbClient) => {
      const old = await this.findById(id, userId, client)
      if (!old) throw new Error(`TimeboxTemplate ${id} not found`)

      // A.2：rows 引用相等时跳过 owner-check（编辑器 setState 总是给新数组，
      // 所以引用相等 = rows 结构未变 = 不需校验 habits/tasks/threads 归属）
      if (old.rows !== input.rows) {
        await this.assertSubscriptionsOwned(input, userId, client)
      }

      const changedFields: string[] = []
      const setData: Record<string, unknown> = { updatedAt: new Date() }

      if (input.name !== undefined) {
        setData.name = input.name
        changedFields.push('name')
      }
      if (input.daysOfWeek !== undefined) {
        setData.daysOfWeek = input.daysOfWeek
        changedFields.push('daysOfWeek')
      }
      if (input.rows !== undefined) {
        setData.rows = input.rows
        changedFields.push('rows')
      }

      const [updated] = await client
        .update(s.timeboxTemplates)
        .set(setData)
        .where(and(eq(s.timeboxTemplates.id, id), eq(s.timeboxTemplates.userId, userId)))
        .returning()

      if (!updated) {
        throw new Error(`TimeboxTemplate ${id} 不存在（可能已被并发删除）`)
      }

      const template = rowToTemplate(updated)

      // OQ-7：写 audit log（同一事务）
      await this._logAudit(client, userId, 'update', id, {
        changedFields,
        oldValues: this._pickFields(old, changedFields),
        newValues: this._pickFields(template, changedFields),
      })

      return template
    }
    return tx ? exec(tx) : db.transaction(exec)
  }

  async delete(id: USOM_ID, userId: USOM_ID, tx?: DbClient): Promise<void> {
    const exec = async (client: DbClient) => {
      const template = await this.findById(id, userId, client)
      if (!template) throw new Error(`TimeboxTemplate ${id} not found`)

      await client
        .delete(s.timeboxTemplates)
        .where(and(eq(s.timeboxTemplates.id, id), eq(s.timeboxTemplates.userId, userId)))

      // OQ-7：写 audit log（同一事务）
      await this._logAudit(client, userId, 'delete', id, {
        oldValues: template as unknown as Record<string, unknown>,
      })
    }
    return tx ? exec(tx) : db.transaction(exec)
  }

  /**
   * A3 owner-check：遍历 input.rows 收集 source∈{habit,task,thread} 的 sourceId，
   * 按来源分组去重后校验归属。任一 id 不归属或不存在则抛错。
   *
   * 仅在 rows 结构变化时由 update()/create() 调用——rows 未变时跳过可避免
   * 3 张表的全表 inArray（[023-02] 决议 A.2）。
   *
   * 注：使用静态导入避免循环依赖（HabitRepository / TaskRepository / ThreadRepository）。
   */
  private async assertSubscriptionsOwned(
    input: TimeboxTemplateInput,
    userId: USOM_ID,
    client: DbClient,
  ): Promise<void> {
    const habitIds = uniq(input.rows.filter((r) => r.source === 'habit' && r.sourceId).map((r) => r.sourceId!))
    const taskIds = uniq(input.rows.filter((r) => r.source === 'task' && r.sourceId).map((r) => r.sourceId!))
    const threadIds = uniq(input.rows.filter((r) => r.source === 'thread' && r.sourceId).map((r) => r.sourceId!))

    const tasks = await Promise.all([
      habitIds.length > 0 ? this._checkHabits(habitIds, userId, client) : Promise.resolve(),
      taskIds.length > 0 ? this._checkTasks(taskIds, userId, client) : Promise.resolve(),
      threadIds.length > 0 ? this._checkThreads(threadIds, userId, client) : Promise.resolve(),
    ])
    void tasks
  }

  private async _checkHabits(ids: string[], userId: USOM_ID, client: DbClient): Promise<void> {
    // [I2 perf] inArray 收窄到订阅 id（最多 ids.length 行），避免全用户表扫；userId 仍走索引前缀保租户隔离
    const uniqueIds = [...new Set(ids)]
    const rows = await client
      .select({ id: s.habits.id })
      .from(s.habits)
      .where(and(eq(s.habits.userId, userId), inArray(s.habits.id, uniqueIds)))
    const owned = new Set(rows.map((r) => r.id))
    const missing = uniqueIds.filter((id) => !owned.has(id as USOM_ID))
    if (missing.length > 0) {
      throw new Error(`订阅的习惯 ${missing.join(', ')} 不存在或不属于当前用户`)
    }
  }

  private async _checkTasks(ids: string[], userId: USOM_ID, client: DbClient): Promise<void> {
    const uniqueIds = [...new Set(ids)]
    const rows = await client
      .select({ id: s.tasks.id })
      .from(s.tasks)
      .where(and(eq(s.tasks.userId, userId), inArray(s.tasks.id, uniqueIds)))
    const owned = new Set(rows.map((r) => r.id))
    const missing = uniqueIds.filter((id) => !owned.has(id as USOM_ID))
    if (missing.length > 0) {
      throw new Error(`订阅的任务 ${missing.join(', ')} 不存在或不属于当前用户`)
    }
  }

  private async _checkThreads(ids: string[], userId: USOM_ID, client: DbClient): Promise<void> {
    const uniqueIds = [...new Set(ids)]
    const rows = await client
      .select({ id: s.threads.id })
      .from(s.threads)
      .where(and(eq(s.threads.userId, userId), inArray(s.threads.id, uniqueIds)))
    const owned = new Set(rows.map((r) => r.id))
    const missing = uniqueIds.filter((id) => !owned.has(id as USOM_ID))
    if (missing.length > 0) {
      throw new Error(`订阅的主线 ${missing.join(', ')} 不存在或不属于当前用户`)
    }
  }

  /** 写 user_audit_log（OQ-7） */
  private async _logAudit(
    client: DbClient,
    userId: USOM_ID,
    action: 'create' | 'update' | 'delete',
    recordId: USOM_ID,
    meta: {
      changedFields?: string[]
      oldValues?: Record<string, unknown>
      newValues?: Record<string, unknown>
    },
  ): Promise<void> {
    await client.insert(s.userAuditLog).values({
      userId,
      tableName: 'timebox_templates',
      recordId,
      action,
      changedFields: meta.changedFields ?? null,
      oldValues: meta.oldValues ?? null,
      newValues: meta.newValues ?? null,
    })
  }

  /** 从对象中提取指定字段（供 audit log old/new 对比） */
  private _pickFields(obj: object, fields: string[]): Record<string, unknown> {
    const result: Record<string, unknown> = {}
    for (const f of fields) {
      if (f in obj) result[f] = (obj as Record<string, unknown>)[f]
    }
    return result
  }
}

/** 数组去重（保序）；owner-check 前置收窄 inArray */
function uniq<T>(arr: T[]): T[] {
  return [...new Set(arr)]
}