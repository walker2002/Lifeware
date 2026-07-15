/**
 * @file backfill-logical-day
 * @brief [029] 存量 logical_day_id 回填（幂等）。
 *
 * 适用：T1 schema 加 logicalDayId 列后，迁移前已存在的 timebox/appointment
 * 行 logical_day_id 为 NULL。T7 adapter 注入只覆盖新建。本脚本把存量
 * 按 date(startTime, user_tz) 派生 + 懒建 logical_days 行回填。
 *
 * @usage npx tsx scripts/backfill-logical-day.ts
 *
 * 幂等：仅处理 logical_day_id IS NULL 的行；可安全重复运行。
 * tz 策略（spec §7）：按**当前** user_tz 派生历史（历史 tz 变更场景
 * 已知 limitation，MVP 单用户可接受；文档已在 spec/plan 写明）。
 */

import { eq, isNull, and } from 'drizzle-orm'
import type { USOM_ID } from '../src/usom/types/primitives'

async function main() {
  await import('dotenv/config')
  const { db } = await import('../src/lib/db')
  const s = await import('../src/lib/db/schema')
  const { getEffectiveTimezone } = await import('../src/lib/timezone-config')
  const { formatDateLabel } = await import('../src/lib/logical-day/resolver')
  const { LogicalDayRepository } = await import(
    '../src/domains/timebox/repository/logical-day'
  )

  const USER_ID = '00000000-0000-0000-0000-000000000001' as USOM_ID

  const tz = await getEffectiveTimezone(USER_ID)
  const ldgRepo = new LogicalDayRepository()
  let totalFilled = 0

  for (const { name, table } of [
    { name: 'timeboxes', table: s.timeboxes },
    { name: 'appointments', table: s.appointments },
  ]) {
    const nulls = await db
      .select()
      .from(table)
      .where(and(eq((table as any).userId, USER_ID), isNull((table as any).logicalDayId)))

    console.log(`[backfill] ${name}: ${(nulls as any[]).length} rows with logicalDayId=NULL`)

    for (const r of nulls as any[]) {
      const label = formatDateLabel(new Date(r.startTime), tz)
      const ld = await ldgRepo.findOrCreateByDate(label, USER_ID)
      await db
        .update(table)
        .set({ logicalDayId: ld.id } as any)
        .where(eq((table as any).id, r.id))
      totalFilled++
    }
  }

  console.log(`[backfill] total filled: ${totalFilled}`)
  process.exit(0)
}

main().catch((e) => {
  console.error('[backfill] failed:', e)
  process.exit(1)
})
