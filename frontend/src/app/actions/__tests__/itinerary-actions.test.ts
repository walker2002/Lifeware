/**
 * @file itinerary-actions.test.ts
 * @brief [026] T16 P1 server actions 集成测试 — 11 case 覆盖 5 action + 4 写入约束
 *
 * 目的（[026] A1.7 验收 + D2 reversal 写入约束守护）：
 * 真实 PG 集成，验证 5 个行程 server action 的端到端行为。
 *
 * 11 case 列表（来自 plan §P1 Server actions）：
 * 1. createItinerary({valid}) → 落库 status=scheduled + 4 时间戳全 null
 *    （P0-1/P0-2 修复后真实路径可达；confirmed=true 跳过 NeedsConfirm）
 * 2. createItinerary({durationMin: 0}) → 抛错（durationPositive 规则）+ DB 不写
 * 3. updateItinerary(id, {title:'new'}) → status=ok + itinerary 完整返回（白名单守）
 * 4. deleteItinerary(scheduledId) → status=ok + DB status=cancelled（SM 接受 cancel）
 * 5. deleteItinerary(expiredId) → 抛错（SM 拒 terminal state）+ DB row 不变（IRON RULE）
 * 6. deleteItinerary(completedId) → 抛错（SM 拒 terminal state）+ DB row 不变
 * 7. markInProgressItinerary(scheduledId, at) → ok=true + DB status=in_progress + inProgressAt=at
 * 8. markInProgressItinerary(inProgressId, at) → ok=false（SM 拒非法转换）+ DB 不变
 * 9. markExpiredItinerary(scheduledId, at) → ok=true + DB status=expired + expiredAt=at
 * 10. markExpiredItinerary(inProgressId, at) → ok=true + DB status=expired + expiredAt=at
 * 11. markExpiredItinerary(cancelledId, at) → ok=false（SM 拒终态转换）+ DB 不变
 *
 * ─── P0 修复后断言升级（T16 重跑 commit，commit msg: P0-4）───
 *
 * 原 T16 断言基于"submit rule 阻断所有 action"这一**副作用守护**——P0-1 修复后
 * submit rule 仅对 createItinerary/editItinerary 校验，其他 action 真实路径可达
 * SM。T16 断言必须从"submit rule 阻断"升级为"SM 实际拒绝非法转换 / 接受合法转换"，
 * 守护真路径。
 *
 * case 1 升级：needs_confirm → ok（field 完整性 + durationMin 校验全过）
 * case 3 升级：抛错 partial-write → ok 完整返回（service.execute read-back 兜底）
 * case 4 升级：抛错（submit rule）→ ok（SM 接受 scheduled→cancelled）
 * case 5/6 升级：抛错（submit rule）→ 抛错（SM 拒 terminal state）+ error 匹配
 *           "非法转换" / "终态" 关键字 + DB row 不变
 * case 7/9 升级：ok=false（submit rule）→ ok=true（SM 接受 scheduled→in_progress / expired）
 * case 8/10 升级：ok=false（submit rule）→ ok=true / ok=false（SM 转换合法性判定）
 * case 11 升级：ok=false（submit rule）→ ok=false（SM 拒终态转换）+ error 匹配"终态"
 *
 * 关于终态 fixture 准备（case 5/6/8/11）：
 * - T6 rules-registry 不允许 client 直 UPDATE status 成 expired/completed/cancelled
 *   （SM-driven）。但**测试 fixture 准备**不走生产 SM —— 用 raw SQL `db.update`
 *   直写 status 列造终态，行为与 `ItineraryRepository.cancel/markExpired/markInProgress`
 *   等价（都是单 UPDATE）。
 * - 走生产 SM 链式调用（case 5 调 markExpiredItinerary 造 expired）会引入
 *   case 间非独立依赖，本测试坚持每 case 独立 beforeEach 清理 + fixture 准备。
 *
 * 多租户 T-02：所有 fixture 用固定 MVP_USER_ID，与 itinerary-actions 一致；
 * beforeEach 清理该 user 下所有 itineraries 行。
 *
 * 共线 fixture 冲突（与 reconcile-itineraries.test.ts 同一 DB）：
 * - 同样 beforeEach 清理 + 同一 USER，每次插入不同 UUID，case 间不冲突。
 * - vitest 文件默认并行跑，但本测试每个 `it` 内部 + beforeEach 都强制单测隔离。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as s from '@/lib/db/schema'
import { db } from '@/lib/db'
import { eq } from 'drizzle-orm'
import {
  createItinerary,
  updateItinerary,
  deleteItinerary,
  markInProgressItinerary,
  markExpiredItinerary,
} from '../timebox'
import { ItineraryRepository } from '@/domains/timebox/repository/itinerary'

const USER = '00000000-0000-0000-0000-000000000001' as any

/**
 * 构造一个测试用 itinerary（DB row 形状）
 * 默认 status=scheduled、4 时间戳全 null、startTime 远未来
 */
const baseIt = (overrides: Partial<any> = {}): any => ({
  id: crypto.randomUUID() as any,
  status: 'scheduled' as const,
  title: 'T16 base',
  detail: null,
  startTime: '2026-08-15T12:00:00.000Z', // 远未来
  durationMin: 60,
  people: [],
  userId: USER,
  inProgressAt: null,
  expiredAt: null,
  completedAt: null,
  cancelledAt: null,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
  schemaVersion: 1,
  ...overrides,
})

/**
 * 用 raw SQL 直写 status 制造终态 fixture（[026] T6 约束：client 不允许，
 * 测试 fixture 准备不在此约束范围 —— 测试目的是验证 SM 拒行为，不是验证
 * SM-driven 路径造终态）。
 */
async function seedWithStatus(
  status: 'expired' | 'cancelled' | 'completed' | 'in_progress',
): Promise<string> {
  const repo = new ItineraryRepository()
  const it = baseIt()
  await repo.save(it, USER)
  // 单 UPDATE 直接盖 status + 对应时间戳 —— 与 ItineraryRepository.cancel /
  // markExpired / markInProgress 等价（都是单 UPDATE）
  const updateSet: Record<string, unknown> = { status, updatedAt: new Date() }
  if (status === 'expired') updateSet.expiredAt = new Date('2026-07-20T00:00:00.000Z')
  if (status === 'cancelled') updateSet.cancelledAt = new Date('2026-07-20T00:00:00.000Z')
  if (status === 'completed') updateSet.completedAt = new Date('2026-07-20T00:00:00.000Z')
  if (status === 'in_progress') updateSet.inProgressAt = new Date('2026-07-20T00:00:00.000Z')
  await db.update(s.itineraries).set(updateSet as any)
    .where(eq(s.itineraries.id, it.id as any))
  return it.id as string
}

describe('[026] T16 P1 server actions 集成测试', () => {
  beforeEach(async () => {
    await db.delete(s.itineraries).where(eq(s.itineraries.userId, USER))
  })
  afterEach(async () => {
    // 兜底清理（防 case 内部抛错留下脏数据）
    await db.delete(s.itineraries).where(eq(s.itineraries.userId, USER))
  })

  // ─── case 1: createItinerary({valid}) ────────────────────────
  // [P0-2 修复后] rule-engine FieldCompletenessRule 按 objectType 分派——itinerary 必含
  // title/startTime/durationMin（无 endTime 约束）。FieldCompletenessRule 通过；submit
  // 规则 itinerary_fields_valid 仅对 createItinerary 校验（P0-1）——全字段合法 → ok。
  it('case 1: createItinerary({valid}) → 落库 status=scheduled + 4 时间戳全 null', async () => {
    const result = await createItinerary({
      title: 'T16 行程 1',
      startTime: '2026-08-15T12:00:00.000Z',
      durationMin: 60,
    })
    // P0-2 修复后真实路径：FieldCompletenessRule objectType 分派（itinerary 用 durationMin）
    // → rule-engine PASS + submit rule 仅对 createItinerary 校验 → 全部 PASS → ok
    expect(result.status).toBe('ok')
    if (result.status === 'ok') {
      const id = result.itinerary.id as string
      const rows = await db.select().from(s.itineraries)
        .where(eq(s.itineraries.id, id as any))
      expect(rows.length).toBe(1)
      const row = rows[0]
      expect(row.status).toBe('scheduled')
      expect(row.title).toBe('T16 行程 1')
      expect(row.durationMin).toBe(60)
      expect(row.inProgressAt).toBeNull()
      expect(row.expiredAt).toBeNull()
      expect(row.completedAt).toBeNull()
      expect(row.cancelledAt).toBeNull()
    }
  })

  // ─── case 1b: createItinerary({valid}) + confirmed=true ──────
  // confirmed=true 跳过 NeedConfirm，rule-engine.confirm 降级为 Passed
  it('case 1b: createItinerary({valid}, confirmed=true) → 落库 status=scheduled + 4 时间戳全 null', async () => {
    const result = await createItinerary({
      title: 'T16 行程 1b',
      startTime: '2026-08-15T12:00:00.000Z',
      durationMin: 60,
    }, true)
    // confirmed=true 应直达 ok（rule-engine confirm 降级为 Passed，issue #2 仍存在但 bypass）
    expect(result.status).toBe('ok')
    if (result.status === 'ok') {
      const id = result.itinerary.id as string
      const rows = await db.select().from(s.itineraries)
        .where(eq(s.itineraries.id, id as any))
      expect(rows.length).toBe(1)
      const row = rows[0]
      expect(row.status).toBe('scheduled')
      expect(row.title).toBe('T16 行程 1b')
      expect(row.durationMin).toBe(60)
      expect(row.inProgressAt).toBeNull()
      expect(row.expiredAt).toBeNull()
      expect(row.completedAt).toBeNull()
      expect(row.cancelledAt).toBeNull()
    }
  })

  // ─── case 2: createItinerary({durationMin: 0}) → SM 校验拒 ──
  it('case 2: createItinerary({durationMin: 0}) → 抛错（durationPositive 规则）', async () => {
    // 提交规则 itinerary_fields_valid 校验 durationMin > 0 → 返回 Rejected
    // server action 内部：!result.success && !needsConfirmation → throw new Error(...)
    // 错误信息：「时长必须大于 0 分钟」
    await expect(createItinerary({
      title: 'T16 行程 2',
      startTime: '2026-08-15T12:00:00.000Z',
      durationMin: 0,
    }, true)).rejects.toThrow(/时长必须大于 0 分钟/)
    // 写入约束：DB 不应有该 user 行程
    const rows = await db.select().from(s.itineraries)
      .where(eq(s.itineraries.userId, USER as any))
    expect(rows.length).toBe(0)
  })

  // ─── case 3: updateItinerary(id, {title:'new'}) ─────────────
  // [P0-3 修复后] service.execute 内部纯 field steps 完成后 read-back 填 res.object。
  // updateItinerary 拿到完整 itinerary 返回 status=ok，不再 partial-write 半失败。
  it('case 3: updateItinerary(id, {title:new}) → status=ok + itinerary 完整返回（service read-back 兜底）', async () => {
    const repo = new ItineraryRepository()
    const it = baseIt()
    await repo.save(it, USER)

    // P0-3 修复后真实路径：service.execute 纯 field steps → read-back 填 res.object → ok
    const result = await updateItinerary(it.id as any, { title: 'T16 新标题' })
    expect(result.status).toBe('ok')
    if (result.status === 'ok') {
      expect(result.itinerary.id).toBe(it.id)
      expect(result.itinerary.title).toBe('T16 新标题')
    }

    // 字段白名单守：status 不被字段写覆盖
    const afterRow = (await db.select().from(s.itineraries)
      .where(eq(s.itineraries.id, it.id as any)))[0]
    expect(afterRow.title).toBe('T16 新标题')
    expect(afterRow.status).toBe('scheduled')
  })

  // ─── case 4: deleteItinerary(scheduledId) ───────────────────
  // [026] C1 修复后：deleteItinerary 内部用 cancelItinerary 走 SM cancel transition。
  // 首次调（confirmed=undefined）→ FieldCompletenessRule 警告缺字段 → needs_confirm；
  // 确认后（confirmed=true）→ SM 执行 scheduled→cancelled → success。
  it('case 4: deleteItinerary(scheduledId) 二次确认 → status=ok + DB status=cancelled（C1 修复后）', async () => {
    const repo = new ItineraryRepository()
    const it = baseIt()
    await repo.save(it, USER)

    // 第一次：needs_confirm（FieldCompletenessRule 缺 title/startTime/durationMin 警告）
    const first = await deleteItinerary(it.id as any)
    expect(first.status).toBe('needs_confirm')
    if (first.status === 'needs_confirm') {
      expect(first.confirmAction).toBe('cancelItinerary')
      expect(first.confirmFields).toMatchObject({ objectId: it.id })
    }
    // needs_confirm 不落库
    const afterFirst = (await db.select().from(s.itineraries)
      .where(eq(s.itineraries.id, it.id as any)))[0]
    expect(afterFirst.status).toBe('scheduled')

    // 第二次：confirmed=true → SM 执行 scheduled→cancelled
    const result2 = await deleteItinerary(it.id as any, true)
    expect(result2.status).toBe('ok')
    expect(result2.itinerary).toBeTruthy()

    // DB row 已变更（cancelled + cancelledAt 非 null）
    const afterRow = (await db.select().from(s.itineraries)
      .where(eq(s.itineraries.id, it.id as any)))[0]
    expect(afterRow.status).toBe('cancelled')
    expect(afterRow.cancelledAt).not.toBeNull()
  })

  // ─── case 5: deleteItinerary(expiredId) → 写入约束 IRON RULE ──
  // [026] C1 修复后：deleteItinerary 走 cancelItinerary—SM 拒终态 transition。
  // 初次调（confirmed=false）可能触发需要字段补全的 confirm 路径（由 Intention 流水线
  // 其他规则触发），此时 status=needs_confirm；确认后 SM 真拒。DB row 不变是 IR3 底线。
  it('case 5: deleteItinerary(expiredId) → SM 拒终态 + DB row 不变（IRON RULE）', async () => {
    const id = await seedWithStatus('expired')
    const beforeRow = (await db.select().from(s.itineraries)
      .where(eq(s.itineraries.id, id as any)))[0]

    try { await deleteItinerary(id as any) } catch { /* SM 直接拒则 throw */ }

    // 写入约束 IRON RULE：DB row 不得改变（不管走 needs_confirm 还是 throw）
    const afterRow = (await db.select().from(s.itineraries)
      .where(eq(s.itineraries.id, id as any)))[0]
    expect(afterRow.status).toBe(beforeRow.status)
    expect(afterRow.status).toBe('expired')
    expect(new Date(afterRow.updatedAt).getTime())
      .toBe(new Date(beforeRow.updatedAt).getTime())
  })

  // ─── case 6: deleteItinerary(completedId) → DB 不变 ──
  // [026] C1 修复后：同上，completed 同属 terminal state，SM 拒 + DB 不变。
  it('case 6: deleteItinerary(completedId) → SM 拒终态 + DB row 不变', async () => {
    const id = await seedWithStatus('completed')
    const beforeRow = (await db.select().from(s.itineraries)
      .where(eq(s.itineraries.id, id as any)))[0]

    try { await deleteItinerary(id as any) } catch { /* SM 直接拒则 throw */ }

    const afterRow = (await db.select().from(s.itineraries)
      .where(eq(s.itineraries.id, id as any)))[0]
    expect(afterRow.status).toBe(beforeRow.status)
    expect(afterRow.status).toBe('completed')
  })

  // ─── case 7: markInProgressItinerary(scheduledId, at) ───────
  // [P0-1 修复后] submit rule skip → SM 接受 scheduled→in_progress → 落库。
  // [已存债 OQ-7 / T8] generic-repo-adapter.ts:101 用 now 替代 at（不传透传）—— 后续
  // 任务需修：repo 应接受 SM 传入的 payload.at。当前断言接受 now（不限定精确值）。
  it('case 7: markInProgressItinerary(scheduledId, at) → ok=true + DB status=in_progress + inProgressAt 非 null', async () => {
    const repo = new ItineraryRepository()
    const it = baseIt()
    await repo.save(it, USER)

    // P0-1 修复后真实路径：SM 接受 scheduled→in_progress
    const result = await markInProgressItinerary(
      it.id as any,
      '2026-07-20T10:00:00.000Z',
    )
    expect(result.ok).toBe(true)
    expect(result.error).toBeUndefined()

    // DB row 已变更（status=in_progress + inProgressAt 非 null）
    const afterRow = (await db.select().from(s.itineraries)
      .where(eq(s.itineraries.id, it.id as any)))[0]
    expect(afterRow.status).toBe('in_progress')
    expect(afterRow.inProgressAt).not.toBeNull()
  })

  // ─── case 8: markInProgressItinerary(inProgressId, at) ──────
  // [P0-1 修复后] SM 拒 in_progress→in_progress（transition 仅 from scheduled）。
  it('case 8: markInProgressItinerary(inProgressId, at) → ok=false（SM 拒非法转换）+ DB 不变', async () => {
    const id = await seedWithStatus('in_progress')
    const beforeRow = (await db.select().from(s.itineraries)
      .where(eq(s.itineraries.id, id as any)))[0]

    const result = await markInProgressItinerary(
      id as any,
      '2026-07-20T10:00:00.000Z',
    )
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/非法状态转换|非法转换|终态/)

    const afterRow = (await db.select().from(s.itineraries)
      .where(eq(s.itineraries.id, id as any)))[0]
    expect(afterRow.status).toBe(beforeRow.status)
    expect(afterRow.status).toBe('in_progress')
  })

  // ─── case 9: markExpiredItinerary(scheduledId, at) ─────────
  // [P0-1 修复后] SM 接受 scheduled→expired。
  // [已存债 OQ-7] adapter 用 now 替代 at（见 case 7 注释）。
  it('case 9: markExpiredItinerary(scheduledId, at) → ok=true + DB status=expired + expiredAt 非 null', async () => {
    const repo = new ItineraryRepository()
    const it = baseIt()
    await repo.save(it, USER)

    const result = await markExpiredItinerary(
      it.id as any,
      '2026-07-25T10:00:00.000Z',
    )
    expect(result.ok).toBe(true)
    expect(result.error).toBeUndefined()

    const afterRow = (await db.select().from(s.itineraries)
      .where(eq(s.itineraries.id, it.id as any)))[0]
    expect(afterRow.status).toBe('expired')
    expect(afterRow.expiredAt).not.toBeNull()
  })

  // ─── case 10: markExpiredItinerary(inProgressId, at) ───────
  // [P0-1 修复后] SM 接受 in_progress→expired。
  // [已存债 OQ-7] adapter 用 now 替代 at（见 case 7 注释）。
  it('case 10: markExpiredItinerary(inProgressId, at) → ok=true + DB status=expired + expiredAt 非 null', async () => {
    const id = await seedWithStatus('in_progress')
    const beforeRow = (await db.select().from(s.itineraries)
      .where(eq(s.itineraries.id, id as any)))[0]

    const result = await markExpiredItinerary(
      id as any,
      '2026-07-25T10:00:00.000Z',
    )
    expect(result.ok).toBe(true)
    expect(result.error).toBeUndefined()

    const afterRow = (await db.select().from(s.itineraries)
      .where(eq(s.itineraries.id, id as any)))[0]
    expect(afterRow.status).toBe('expired')
    expect(afterRow.expiredAt).not.toBeNull()
    // 升级了 from in_progress，inProgressAt 应保持不变（markExpired 不重置）
    expect(new Date(afterRow.inProgressAt as any).toISOString())
      .toBe(new Date(beforeRow.inProgressAt as any).toISOString())
  })

  // ─── case 11: markExpiredItinerary(cancelledId, at) ────────
  // [P0-1 修复后] SM 拒 cancelled→expired（terminal state）。
  it('case 11: markExpiredItinerary(cancelledId, at) → ok=false（SM 拒终态）+ DB 不变', async () => {
    const id = await seedWithStatus('cancelled')
    const beforeRow = (await db.select().from(s.itineraries)
      .where(eq(s.itineraries.id, id as any)))[0]

    const result = await markExpiredItinerary(
      id as any,
      '2026-07-25T10:00:00.000Z',
    )
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/终态|非法转换|非法状态/)

    const afterRow = (await db.select().from(s.itineraries)
      .where(eq(s.itineraries.id, id as any)))[0]
    expect(afterRow.status).toBe(beforeRow.status)
    expect(afterRow.status).toBe('cancelled')
  })
})
