/**
 * @file activity-archetype.repository
 * @brief Activity Archetype 仓储实现（[023] A1 D4 拆分方案：类型归 USOM，运行时数据归 DB）
 *
 * 每次 create/update/delete 操作自动写入 user_audit_log（OQ-7）。
 * seedDefaults 幂等插入种子数据（按 l1Category + l2Name 判重）。
 *
 * @see docs/usom-design.md §3.11
 */

import { eq, and } from 'drizzle-orm'
import { db } from '@/lib/db'
import type { DbClient } from '@/lib/db'
import * as s from '@/lib/db/schema'
import type {
  IActivityArchetypeRepository,
  CreateActivityArchetypeInput,
  UpdateActivityArchetypeInput,
} from '@/usom/interfaces/irepository'
import type { ActivityArchetype } from '@/usom/activity-archetype/types'
import type { L1Category } from '@/usom/activity-archetype/l1-categories'
import type { USOM_ID } from '@/usom/types/primitives'
import { SEED_ACTIVITY_ARCHETYPES } from '@/usom/seed/activity-archetypes'

/** 将 DB 行映射为 USOM ActivityArchetype（Date → ISO string） */
function rowToArchetype(row: typeof s.activityArchetypes.$inferSelect): ActivityArchetype {
  return {
    id: row.id,
    userId: row.userId,
    l1Category: row.l1Category as L1Category,
    l2Name: row.l2Name,
    energyCost: row.energyCost,
    activityLabel: row.activityLabel,
    synonyms: row.synonyms ?? [],
    isSystem: row.isSystem,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export class ActivityArchetypeRepository implements IActivityArchetypeRepository {
  async findById(id: USOM_ID, userId: USOM_ID, tx?: DbClient): Promise<ActivityArchetype | null> {
    const client = tx ?? db
    const rows = await client
      .select()
      .from(s.activityArchetypes)
      .where(and(eq(s.activityArchetypes.id, id), eq(s.activityArchetypes.userId, userId)))
    return rows[0] ? rowToArchetype(rows[0]) : null
  }

  async findByUser(userId: USOM_ID, tx?: DbClient): Promise<ActivityArchetype[]> {
    const client = tx ?? db
    const rows = await client
      .select()
      .from(s.activityArchetypes)
      .where(eq(s.activityArchetypes.userId, userId))
      .orderBy(s.activityArchetypes.l1Category, s.activityArchetypes.l2Name)
    return rows.map(rowToArchetype)
  }

  async findByL1Category(
    l1Category: L1Category,
    userId: USOM_ID,
    tx?: DbClient,
  ): Promise<ActivityArchetype[]> {
    const client = tx ?? db
    const rows = await client
      .select()
      .from(s.activityArchetypes)
      .where(
        and(
          eq(s.activityArchetypes.userId, userId),
          eq(s.activityArchetypes.l1Category, l1Category),
        ),
      )
      .orderBy(s.activityArchetypes.l2Name)
    return rows.map(rowToArchetype)
  }

  async create(
    input: CreateActivityArchetypeInput,
    userId: USOM_ID,
    tx?: DbClient,
  ): Promise<ActivityArchetype> {
    const exec = async (client: DbClient) => {
      const [row] = await client
        .insert(s.activityArchetypes)
        .values({
          userId,
          l1Category: input.l1Category,
          l2Name: input.l2Name,
          energyCost: input.energyCost,
          activityLabel: input.activityLabel,
          synonyms: input.synonyms ?? [],
          isSystem: false,
        })
        .returning()

      const archetype = rowToArchetype(row)

      // OQ-7: 写 audit log（同一事务）
      await this._logAudit(client, userId, 'create', archetype.id, {
        newValues: archetype as unknown as Record<string, unknown>,
      })

      return archetype
    }
    return tx ? exec(tx) : db.transaction(exec)
  }

  async update(
    id: USOM_ID,
    input: UpdateActivityArchetypeInput,
    userId: USOM_ID,
    tx?: DbClient,
  ): Promise<ActivityArchetype> {
    const exec = async (client: DbClient) => {
      const old = await this.findById(id, userId, client)
      if (!old) throw new Error(`ActivityArchetype ${id} not found`)

      const changedFields: string[] = []
      const setData: Record<string, unknown> = { updatedAt: new Date() }

      if (input.l1Category !== undefined) {
        setData.l1Category = input.l1Category
        changedFields.push('l1Category')
      }
      if (input.l2Name !== undefined) {
        setData.l2Name = input.l2Name
        changedFields.push('l2Name')
      }
      if (input.energyCost !== undefined) {
        setData.energyCost = input.energyCost
        changedFields.push('energyCost')
      }
      if (input.activityLabel !== undefined) {
        setData.activityLabel = input.activityLabel
        changedFields.push('activityLabel')
      }
      if (input.synonyms !== undefined) {
        setData.synonyms = input.synonyms
        changedFields.push('synonyms')
      }

      const [updated] = await client
        .update(s.activityArchetypes)
        .set(setData)
        .where(and(eq(s.activityArchetypes.id, id), eq(s.activityArchetypes.userId, userId)))
        .returning()

      if (!updated) {
        throw new Error(`ActivityArchetype ${id} 不存在（可能已被并发删除）`)
      }

      const archetype = rowToArchetype(updated)

      // OQ-7: 写 audit log（同一事务）
      await this._logAudit(client, userId, 'update', id, {
        changedFields,
        oldValues: this._pickFields(old, changedFields),
        newValues: this._pickFields(archetype, changedFields),
      })

      return archetype
    }
    return tx ? exec(tx) : db.transaction(exec)
  }

  async delete(id: USOM_ID, userId: USOM_ID, tx?: DbClient): Promise<void> {
    const exec = async (client: DbClient) => {
      const archetype = await this.findById(id, userId, client)
      if (!archetype) throw new Error(`ActivityArchetype ${id} not found`)
      if (archetype.isSystem) {
        throw new Error(`系统内置 Archetype "${archetype.l2Name}" 不可删除`)
      }

      await client
        .delete(s.activityArchetypes)
        .where(and(eq(s.activityArchetypes.id, id), eq(s.activityArchetypes.userId, userId)))

      // OQ-7: 写 audit log（同一事务）
      await this._logAudit(client, userId, 'delete', id, {
        oldValues: archetype as unknown as Record<string, unknown>,
      })
    }
    return tx ? exec(tx) : db.transaction(exec)
  }

  async seedDefaults(userId: USOM_ID, tx?: DbClient): Promise<number> {
    const client = tx ?? db
    // 先查已存在的 (l1Category, l2Name) 对，避免重复插入
    const existing = await client
      .select({
        l1Category: s.activityArchetypes.l1Category,
        l2Name: s.activityArchetypes.l2Name,
      })
      .from(s.activityArchetypes)
      .where(eq(s.activityArchetypes.userId, userId))

    const existingSet = new Set(existing.map((e) => `${e.l1Category}::${e.l2Name}`))

    let inserted = 0
    for (const seed of SEED_ACTIVITY_ARCHETYPES) {
      const key = `${seed.l1Category}::${seed.l2Name}`
      if (existingSet.has(key)) continue

      await client.insert(s.activityArchetypes).values({
        userId,
        l1Category: seed.l1Category,
        l2Name: seed.l2Name,
        energyCost: seed.energyCost,
        activityLabel: seed.activityLabel,
        isSystem: true,
      })
      inserted++
    }
    return inserted
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
      tableName: 'activity_archetypes',
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