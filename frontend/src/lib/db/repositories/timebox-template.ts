/**
 * @file timebox-template.repository
 * @brief 时间盒模板仓储实现（[023] A2，配置类不走 Nexus）
 *
 * 每次 create/update/delete 操作自动写入 user_audit_log（OQ-7）。
 * A3 owner-check：写入前校验 subscribed_habits/tasks/threads 中每个 id 归属当前 userId。
 *
 * @see docs/usom-design.md §3.12
 * @see docs/database-design.md §7.8
 */

import { eq, and } from 'drizzle-orm'
import { db } from '@/lib/db'
import type { DbClient } from '@/lib/db'
import * as s from '@/lib/db/schema'
import type { USOM_ID } from '@/usom/types/primitives'

/** 单段生存时间锚点 */
export interface SurvivalSegment {
  start: string
  end: string
}

/** TimeboxTemplate（USOM 形状，DB 行 → 业务对象的映射目标） */
export interface TimeboxTemplate {
  id: USOM_ID
  userId: USOM_ID
  schemaVersion: number
  name: string
  survivalSegments: Record<string, SurvivalSegment>
  subscribedHabits: string[]
  subscribedTasks: string[]
  subscribedThreads: string[]
  createdAt: string
  updatedAt: string
}

/** Create/Update 输入（除 id/userId 外字段全部可选） */
export interface TimeboxTemplateInput {
  id?: string
  name: string
  survivalSegments: Record<string, SurvivalSegment>
  subscribedHabits?: string[]
  subscribedTasks?: string[]
  subscribedThreads?: string[]
}

/** DB 行 → USOM TimeboxTemplate */
function rowToTemplate(row: typeof s.timeboxTemplates.$inferSelect): TimeboxTemplate {
  return {
    id: row.id,
    userId: row.userId,
    schemaVersion: row.schemaVersion,
    name: row.name,
    survivalSegments: row.survivalSegments,
    subscribedHabits: row.subscribedHabits ?? [],
    subscribedTasks: row.subscribedTasks ?? [],
    subscribedThreads: row.subscribedThreads ?? [],
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
      // A3 owner-check：每个订阅 id 必须归属当前 user
      await this.assertSubscriptionsOwned(input, userId, client)

      const [row] = await client
        .insert(s.timeboxTemplates)
        .values({
          userId,
          name: input.name,
          survivalSegments: input.survivalSegments,
          subscribedHabits: input.subscribedHabits ?? [],
          subscribedTasks: input.subscribedTasks ?? [],
          subscribedThreads: input.subscribedThreads ?? [],
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

      // A3 owner-check：若订阅字段被改，则重新校验
      const subscriptionsChanged =
        input.subscribedHabits !== undefined ||
        input.subscribedTasks !== undefined ||
        input.subscribedThreads !== undefined
      if (subscriptionsChanged) {
        await this.assertSubscriptionsOwned(
          {
            ...input,
            subscribedHabits: input.subscribedHabits ?? old.subscribedHabits,
            subscribedTasks: input.subscribedTasks ?? old.subscribedTasks,
            subscribedThreads: input.subscribedThreads ?? old.subscribedThreads,
          },
          userId,
          client,
        )
      }

      const changedFields: string[] = []
      const setData: Record<string, unknown> = { updatedAt: new Date() }

      if (input.name !== undefined) {
        setData.name = input.name
        changedFields.push('name')
      }
      if (input.survivalSegments !== undefined) {
        setData.survivalSegments = input.survivalSegments
        changedFields.push('survivalSegments')
      }
      if (input.subscribedHabits !== undefined) {
        setData.subscribedHabits = input.subscribedHabits
        changedFields.push('subscribedHabits')
      }
      if (input.subscribedTasks !== undefined) {
        setData.subscribedTasks = input.subscribedTasks
        changedFields.push('subscribedTasks')
      }
      if (input.subscribedThreads !== undefined) {
        setData.subscribedThreads = input.subscribedThreads
        changedFields.push('subscribedThreads')
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
   * A3 owner-check：批量校验 subscribed_habits/tasks/threads 归属当前 userId。
   * 任一 id 不归属或不存在则抛错。
   *
   * 注：使用静态导入避免循环依赖（HabitRepository / TaskRepository / ThreadRepository）。
   * 若引入 dynamic import 则失去并行优势且类型不安全。
   */
  private async assertSubscriptionsOwned(
    input: TimeboxTemplateInput,
    userId: USOM_ID,
    client: DbClient,
  ): Promise<void> {
    // 懒加载：仅在有订阅时才引入各 Repo（避免无谓依赖）
    const tasks = await Promise.all([
      input.subscribedHabits && input.subscribedHabits.length > 0
        ? this._checkHabits(input.subscribedHabits, userId, client)
        : Promise.resolve(),
      input.subscribedTasks && input.subscribedTasks.length > 0
        ? this._checkTasks(input.subscribedTasks, userId, client)
        : Promise.resolve(),
      input.subscribedThreads && input.subscribedThreads.length > 0
        ? this._checkThreads(input.subscribedThreads, userId, client)
        : Promise.resolve(),
    ])
    void tasks
  }

  private async _checkHabits(ids: string[], userId: USOM_ID, client: DbClient): Promise<void> {
    // 内联查询（避免引入 HabitRepository 形成跨域耦合）
    const rows = await client
      .select({ id: s.habits.id })
      .from(s.habits)
      .where(and(eq(s.habits.userId, userId)))
    const owned = new Set(rows.map((r) => r.id))
    const missing = ids.filter((id) => !owned.has(id as USOM_ID))
    if (missing.length > 0) {
      throw new Error(`订阅的习惯 ${missing.join(', ')} 不存在或不属于当前用户`)
    }
  }

  private async _checkTasks(ids: string[], userId: USOM_ID, client: DbClient): Promise<void> {
    const rows = await client
      .select({ id: s.tasks.id })
      .from(s.tasks)
      .where(and(eq(s.tasks.userId, userId)))
    const owned = new Set(rows.map((r) => r.id))
    const missing = ids.filter((id) => !owned.has(id as USOM_ID))
    if (missing.length > 0) {
      throw new Error(`订阅的任务 ${missing.join(', ')} 不存在或不属于当前用户`)
    }
  }

  private async _checkThreads(ids: string[], userId: USOM_ID, client: DbClient): Promise<void> {
    const rows = await client
      .select({ id: s.threads.id })
      .from(s.threads)
      .where(and(eq(s.threads.userId, userId)))
    const owned = new Set(rows.map((r) => r.id))
    const missing = ids.filter((id) => !owned.has(id as USOM_ID))
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