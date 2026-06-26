/**
 * @file 022-migrate-period-to-cycle
 * @brief 把 objectives.period_* 抽取为 cycles，回填 objectives.cycle_id（幂等）
 *
 * @usage cd frontend && npx tsx scripts/022-migrate-period-to-cycle.ts
 *
 * 幂等保证：
 *   1. uq_cycles_user_period 唯一索引 + 先查后插防止同一 run 内重复创建 cycle；
 *   2. 已有 cycle_id 的 objective 直接跳过（WHERE cycle_id IS NULL）；
 *   3. 脚本可安全崩后重跑——第二次运行 migrated 0 objectives, 0 cycles。
 *
 * 修订（A022-A14/FM-15/FM-14）：
 *   - 按自然键 (user_id,period_start,period_end) upsert；
 *   - cycle.status 按 objective 状态推导（active/paused→in_progress,
 *     completed/archived→ended，其余→draft）；
 *   - daily/weekly→custom 标注原类型。
 */

import 'dotenv/config'
import { db } from '../src/lib/db'
import * as s from '../src/lib/db/schema'
import { eq, and, isNull } from 'drizzle-orm'

/** 无需映射的原始周期类型 */
const KEEP_TYPES = ['annual', 'quarterly', 'monthly', 'semi_annual'] as const

/**
 * 根据 objective 状态推导 cycle 状态
 */
function deriveCycleStatus(objStatus: string): string {
  if (['completed', 'archived'].includes(objStatus)) return 'ended'
  if (['active', 'paused'].includes(objStatus)) return 'in_progress'
  return 'draft'
}

async function main() {
  // 查询所有未回填的 objectives（cycle_id IS NULL）
  const rows = await db
    .select({
      id: s.objectives.id,
      user_id: s.objectives.userId,
      period_type: s.objectives.periodType,
      period_start: s.objectives.periodStart,
      period_end: s.objectives.periodEnd,
      status: s.objectives.status,
    })
    .from(s.objectives)
    .where(isNull(s.objectives.cycleId))

  if (rows.length === 0) {
    console.log('没有需要迁移的 objectives（所有 cycle_id 已回填）')
    process.exit(0)
  }

  // 过滤掉 period 信息不完整的行（defensive）
  const validRows = rows.filter(
    (r) => !!r.period_type && !!r.period_start && !!r.period_end
  ) as Array<{
    id: string
    user_id: string
    period_type: string
    period_start: string
    period_end: string
    status: string
  }>
  if (validRows.length < rows.length) {
    console.warn(
      `跳过 ${rows.length - validRows.length} 条 period 信息不完整的 objectives`
    )
  }

  // 同一次 run 内的内存去重：避免同一自然键重复查库/插入
  const cycleKeyMap = new Map<string, string>()
  let createdCount = 0
  let reusedCount = 0

  for (const r of validRows) {
    const mappedType: string = (KEEP_TYPES as readonly string[]).includes(r.period_type)
      ? r.period_type
      : 'custom'
    const key = `${r.user_id}|${r.period_start}|${r.period_end}`

    let cycleId = cycleKeyMap.get(key)
    if (!cycleId) {
      // 跨 run 幂等：按自然键查已有 cycle
      const existing = await db
        .select({ id: s.cycles.id })
        .from(s.cycles)
        .where(
          and(
            eq(s.cycles.userId, r.user_id),
            eq(s.cycles.periodStart, r.period_start as string),
            eq(s.cycles.periodEnd, r.period_end as string)
          )
        )
        .limit(1)

      if (existing.length > 0) {
        cycleId = existing[0].id
        reusedCount++
      } else {
        cycleId = crypto.randomUUID()
        const cycleStatus = deriveCycleStatus(r.status)
        await db.insert(s.cycles).values({
          id: cycleId,
          userId: r.user_id,
          cycleType: mappedType as 'annual' | 'quarterly' | 'monthly' | 'semi_annual' | 'custom',
          name: (KEEP_TYPES as readonly string[]).includes(r.period_type)
            ? `${r.period_start}~${r.period_end}`
            : `${r.period_type}:${r.period_start}~${r.period_end}`,
          periodStart: r.period_start as string,
          periodEnd: r.period_end as string,
          status: cycleStatus as 'draft' | 'not_started' | 'in_progress' | 'ended' | 'reviewed',
        })
        createdCount++
      }
      cycleKeyMap.set(key, cycleId)
    } else {
      reusedCount++
    }

    // 回填 objective.cycle_id
    await db
      .update(s.objectives)
      .set({ cycleId })
      .where(eq(s.objectives.id, r.id))
  }

  console.log(
    `迁移完成：${validRows.length} objectives 回填 cycle_id，` +
      `${createdCount} cycles 新建，${reusedCount} cycles 复用（含同 run 内存去重）`
  )
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
