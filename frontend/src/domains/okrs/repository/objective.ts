/**
 * @file objective
 * @brief Objective 仓储实现
 *
 * [022] 1A-T6：所有读方法经 findObjRows helper 以 innerJoin cycles 取周期字段，
 * mapper 的 period 从 join 的 cycleType/cyclePeriodStart/cyclePeriodEnd 派生。
 * [022] 1C T17：cycle_id 已 SET NOT NULL + period 列已 DROP，leftJoin 切 innerJoin。
 * save 不再读 objective.period（create 路径无 period），改为从 cycleId 反查 cycle
 * 派生编号前缀。KR 查询统一改 inArray 批查，消除 N+1。
 */

import { eq, and, between, inArray, like, isNull, type SQL } from 'drizzle-orm'
import { db, type DbClient } from '../../../lib/db/index'
import * as s from '../../../lib/db/schema'
import type { IObjectiveRepository, ObjectiveWithKR } from '../../../usom/interfaces/irepository'
import type { Objective } from '../../../usom/types/objects'
import type { USOM_ID, DateOnly } from '../../../usom/types/primitives'
import { objectiveRowToUSOM, objectiveUSOMToRow, keyResultRowToUSOM } from '../../../lib/db/repositories/mappers'
import { CycleRepository } from './cycle'

/**
 * Objective 仓储
 */
export class ObjectiveRepository implements IObjectiveRepository {
  /**
   * 统一的 objective 行查询（innerJoin cycles）。
   * 选 cycle 三列供 mapper 派生 period。〔022〕1C T17：cycle_id NOT NULL，
   * 所有 objective 必有归属 cycle，故用 innerJoin。
   */
  private async findObjRows(where: SQL | undefined, tx: DbClient = db) {
    return tx.select({
      id: s.objectives.id,
      title: s.objectives.title,
      description: s.objectives.description,
      parentId: s.objectives.parentId,
      okrType: s.objectives.okrType,
      objectiveNumber: s.objectives.objectiveNumber,
      priority: s.objectives.priority,
      tags: s.objectives.tags,
      createdAt: s.objectives.createdAt,
      updatedAt: s.objectives.updatedAt,
      discardedAt: s.objectives.discardedAt,
      completedAt: s.objectives.completedAt,
      archivedAt: s.objectives.archivedAt,
      cycleId: s.objectives.cycleId,
      cycleType: s.cycles.cycleType,
      cyclePeriodStart: s.cycles.periodStart,
      cyclePeriodEnd: s.cycles.periodEnd,
    }).from(s.objectives)
      .innerJoin(s.cycles, eq(s.objectives.cycleId, s.cycles.id))
      .where(where)
  }

  /**
   * 批查 KR（单次 inArray 查询，按 objectiveId 分组），消除逐行 N+1。
   * ids 为空时跳过查询返回空 Map（避免 inArray([]) 生成不合法 SQL）。
   */
  private async batchKeyResultIds(ids: string[], tx: DbClient = db): Promise<Map<string, string[]>> {
    const byObj = new Map<string, string[]>()
    if (ids.length === 0) return byObj
    const krRows = await tx.select({ id: s.keyResults.id, objectiveId: s.keyResults.objectiveId })
      .from(s.keyResults)
      .where(inArray(s.keyResults.objectiveId, ids))
    for (const k of krRows) {
      let arr = byObj.get(k.objectiveId)
      if (!arr) { arr = []; byObj.set(k.objectiveId, arr) }
      arr.push(k.id)
    }
    return byObj
  }

  async findById(id: USOM_ID, userId: USOM_ID, tx: DbClient = db): Promise<Objective | null> {
    const rows = await this.findObjRows(
      and(eq(s.objectives.id, id), eq(s.objectives.userId, userId)), tx,
    )
    if (!rows[0]) return null
    const krByObj = await this.batchKeyResultIds([rows[0].id], tx)
    return objectiveRowToUSOM(rows[0] as any, krByObj.get(rows[0].id) ?? [])
  }

  async findAll(userId: USOM_ID): Promise<Objective[]> {
    // [022.01] Phase 3: status 列已删除，用时间戳过滤软删除
    const rows = await this.findObjRows(
      and(
        eq(s.objectives.userId, userId),
        isNull(s.objectives.discardedAt),
        isNull(s.objectives.archivedAt),
      ),
    )
    const krByObj = await this.batchKeyResultIds(rows.map((r) => r.id))
    return rows.map((r) => objectiveRowToUSOM(r as any, krByObj.get(r.id) ?? []))
  }

  async findActive(userId: USOM_ID): Promise<Objective[]> {
    // [023.12] T6：cycle.status 由 5 态收敛为 4 态，
    // 「活跃周期」语义从 in_progress 改为 approved（[AM6] 同步）。
    // 旧 not_started/in_progress/ended/reviewed → 新 approved/finished/reviewed。
    const rows = await this.findObjRows(
      and(
        eq(s.objectives.userId, userId),
        isNull(s.objectives.discardedAt),
        isNull(s.objectives.archivedAt),
        eq(s.cycles.status, 'approved'),
      ),
    )
    const krByObj = await this.batchKeyResultIds(rows.map((r) => r.id))
    return rows.map((r) => objectiveRowToUSOM(r as any, krByObj.get(r.id) ?? []))
  }

  /**
   * [024] G1：列出某周期下挂载的所有 objectives（含 archived）。
   *
   * 用于 deleteCycle 前置检查「周期下是否还有目标」——
   * 故不应用 findActive 那种过滤 archived 的策略，
   * 任何状态下挂载的 objective 都应阻止周期删除。
   *
   * 复用 findObjRows（innerJoin cycles）保证 mapper 派生 period 一致。
   */
  async findByCycleId(cycleId: USOM_ID, userId: USOM_ID, tx: DbClient = db): Promise<Objective[]> {
    const rows = await this.findObjRows(
      and(eq(s.objectives.cycleId, cycleId), eq(s.objectives.userId, userId)),
      tx,
    )
    const krByObj = await this.batchKeyResultIds(rows.map((r) => r.id), tx)
    return rows.map((r) => objectiveRowToUSOM(r as any, krByObj.get(r.id) ?? []))
  }

  async findByPeriod(start: DateOnly, end: DateOnly, userId: USOM_ID): Promise<Objective[]> {
    // [022-T6] period 已迁至 cycles 表，故 between 过滤改用 s.cycles.periodStart
    const rows = await this.findObjRows(
      and(eq(s.cycles.userId, userId), between(s.cycles.periodStart, start, end)),
    )
    const krByObj = await this.batchKeyResultIds(rows.map((r) => r.id))
    return rows.map((r) => objectiveRowToUSOM(r as any, krByObj.get(r.id) ?? []))
  }

  async findWithKeyResults(id: USOM_ID, userId: USOM_ID): Promise<ObjectiveWithKR | null> {
    // 独立 join：返回 ObjectiveWithKR 含完整 KR 对象，不复用 findObjRows
    const rows = await db.select({
      id: s.objectives.id,
      title: s.objectives.title,
      description: s.objectives.description,
      parentId: s.objectives.parentId,
      okrType: s.objectives.okrType,
      objectiveNumber: s.objectives.objectiveNumber,
      priority: s.objectives.priority,
      tags: s.objectives.tags,
      createdAt: s.objectives.createdAt,
      updatedAt: s.objectives.updatedAt,
      discardedAt: s.objectives.discardedAt,
      completedAt: s.objectives.completedAt,
      archivedAt: s.objectives.archivedAt,
      cycleId: s.objectives.cycleId,
      cycleType: s.cycles.cycleType,
      cyclePeriodStart: s.cycles.periodStart,
      cyclePeriodEnd: s.cycles.periodEnd,
    }).from(s.objectives)
      .innerJoin(s.cycles, eq(s.objectives.cycleId, s.cycles.id))
      .where(and(eq(s.objectives.id, id), eq(s.objectives.userId, userId)))
    if (!rows[0]) return null
    const krRows = await db.select().from(s.keyResults)
      .where(eq(s.keyResults.objectiveId, id))
    const obj = objectiveRowToUSOM(rows[0] as any, krRows.map((k) => k.id))
    return { ...obj, keyResults: krRows.map((r) => keyResultRowToUSOM(r as any)) }
  }

  async save(objective: Objective, userId: USOM_ID, tx: DbClient = db): Promise<void> {
    // [022-T6] create 路径的 objective 无 period（T7 objective.create 只构造 cycleId），
    // 故 save 不再读 objective.period，改为从 cycleId 反查 cycle 派生编号前缀。
    let obj = objective
    if (!obj.objectiveNumber) {
      const cycleRepo = new CycleRepository()
      const cycle = obj.cycleId ? await cycleRepo.findById(obj.cycleId, userId, tx) : null
      if (!cycle) {
        throw new Error(`save objective: cycle ${obj.cycleId} 不存在（无法派生编号）`)
      }
      const prefix = this.buildNumberPrefix(cycle.cycleType, cycle.period.start)
      const count = await this.countByPrefix(prefix, userId, tx)
      obj = { ...obj, objectiveNumber: `${prefix}-O${count + 1}` }
    }
    const row = objectiveUSOMToRow(obj, userId)
    await tx.insert(s.objectives).values(row).onConflictDoUpdate({
      target: s.objectives.id,
      set: row,
    })
  }

  /**
   * 局部字段更新（FactField 字段写的统一通道）。
   *
   * 单条 UPDATE，禁止读后写：直接 update().set(fields).where(id 且 userId) 一次完成。
   * fields 的键为 schema 列属性名（驼峰）。多租户 T-02：where 必含 userId 过滤。
   */
  async updateFields(
    id: USOM_ID,
    fields: Record<string, unknown>,
    userId: USOM_ID,
    tx: DbClient = db,
  ): Promise<Objective> {
    const setPayload: Record<string, unknown> = { ...fields, updatedAt: new Date() }
    await tx.update(s.objectives)
      .set(setPayload)
      .where(and(eq(s.objectives.id, id), eq(s.objectives.userId, userId)))
    const updated = await this.findById(id, userId, tx)
    if (!updated) throw new Error(`Objective ${id} not found after updateFields`)
    return updated
  }

  /**
   * 由周期类型 + 周期起始月派生目标编号前缀。
   * 入参语义：cycleType 取 Cycle.cycleType，periodStart 取 Cycle.period.start。
   */
  private buildNumberPrefix(cycleType: string, periodStart: string): string {
    const start = new Date(periodStart)
    const yy = String(start.getFullYear()).slice(-2)
    switch (cycleType) {
      case 'annual': return `${yy}Y`
      case 'semi_annual': return `${yy}H${start.getMonth() < 6 ? 1 : 2}`
      case 'quarterly': return `${yy}Q${Math.floor(start.getMonth() / 3) + 1}`
      case 'monthly': return `${yy}M${String(start.getMonth() + 1).padStart(2, '0')}`
      default: return `${yy}Q${Math.floor(start.getMonth() / 3) + 1}`
    }
  }

  private async countByPrefix(prefix: string, userId: USOM_ID, tx: DbClient = db): Promise<number> {
    const rows = await tx.select({ objectiveNumber: s.objectives.objectiveNumber })
      .from(s.objectives)
      .where(and(
        eq(s.objectives.userId, userId),
        like(s.objectives.objectiveNumber, `${prefix}-O%`),
      ))
    return rows.length
  }
}
