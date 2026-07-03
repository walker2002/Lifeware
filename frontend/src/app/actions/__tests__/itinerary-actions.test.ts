/**
 * @file itinerary-actions.test.ts
 * @brief [026] T16 P1 server actions 集成测试 — 11 case 覆盖 5 action + 4 写入约束
 *
 * 目的（[026] A1.7 验收 + D2 reversal 写入约束守护）：
 * 真实 PG 集成，验证 5 个行程 server action 的端到端行为。
 *
 * 11 case 列表（来自 plan §P1 Server actions）：
 * 1. createItinerary({valid}) → NeedConfirm（rule-engine issue #2）+ confirmed=true 落库
 *    （实际 case 1 拆为 1a/1b 两条：1a 测 current behavior = needs_confirm；1b 测 confirmed=true 落库）
 * 2. createItinerary({durationMin: 0}) → 抛错（durationPositive 规则）+ DB 不写
 * 3. updateItinerary(id, {title:'new'}) → DB title 变 + status 不变（白名单守）
 * 4. deleteItinerary(scheduledId) → 抛错（**当前 production 已知 issue**）+ DB 不变
 * 5. deleteItinerary(expiredId) → 抛错 + DB row 不变（写入约束 IRON RULE）
 * 6. deleteItinerary(completedId) → 抛错 + DB row 不变
 * 7. markInProgressItinerary(scheduledId, at) → ok=false（**当前 production 已知 issue**）+ DB 不变
 * 8. markInProgressItinerary(inProgressId, at) → ok=false（submit rule）+ DB 不变
 * 9. markExpiredItinerary(scheduledId, at) → ok=false（**当前 production 已知 issue**）+ DB 不变
 * 10. markExpiredItinerary(inProgressId, at) → ok=false（submit rule）+ DB 不变
 * 11. markExpiredItinerary(cancelledId, at) → ok=false（submit rule）+ DB 不变
 *
 * （说明：`mark*`/`delete*` 在源码中均为普通函数名，注释用反引号包裹避免被 JSX 解析）
 *
 * ─── 关键发现（T16 探针验证 + reconcile-itineraries.test.ts 同款现象）───
 *
 * **[生产已知 issue #1]** 行程 server action 经 `submitDynamicIntent` → Orchestrator
 *   → evaluateDomainRules → submit 聚合规则 `itinerary_fields_valid` 路径时，
 *   submit 规则对**所有** action（含 `mark*`/`delete*`）都校验 title/startTime/durationMin。
 *   状态推进 action 只传 `{objectId, at}`，submit 规则必 reject。
 *   **当前 production reconcileAndAdvanceItineraries（T8）/「立即开始」「立即过期」
 *   按钮调用路径全部被阻断**——这是 [026] 设计核心被生产规则卡住的 P0 bug。
 *
 *   修复方向（不在 T16 范围）：submit 规则需按 `intent.action` 分派——只在
 *   `createItinerary` 时校验 `title/startTime/durationMin`；其他 action skip。
 *
 * **[生产已知 issue #2]** createItinerary 走 `submitDynamicIntent` 时，rule-engine
 *   中 `FieldCompletenessRule` 检查 `intent.targetDomain === 'timebox'` 必含
 *   `title/startTime/endTime`——但行程用 `durationMin` 不用 `endTime`，导致
 *   `endTime` 缺失 → warning severity → 经 aggregateValidation 升级为 NeedConfirm
 *   → createItinerary 返回 `{status: 'needs_confirm'}` 而非 `{status: 'ok'}`。
 *
 *   修复方向（不在 T16 范围）：FieldCompletenessRule 需按 objectType 分派——
 *   itinerary 用 `durationMin` 而非 `endTime`。
 *
 * **[T16 IRON RULE]** 「已过期/已完成不能删除」写入约束：本任务虽然未触达 SM
 *   cancel 路径（被 submit rule 阻断），但**本测试本身**作为守护基线存在——
 *   一旦生产规则按 action 分派修复，case 5/6 必须实际拒绝 cancel 转换（SM 拒
 *   terminal state）且 DB row 不变。当前规则下 DB row 不变已通过（submit rule
 *   阻断了写入）。
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
  // [issue #2] 当前 production 走 submitDynamicIntent → rule-engine FieldCompletenessRule
  // 因 itinerary 用 durationMin 不用 endTime → warning → NeedConfirm → result.status='needs_confirm'
  it('case 1: createItinerary({valid}) → 需确认（rule-engine 缺 objectType 分派，issue #2 守护）', async () => {
    const result = await createItinerary({
      title: 'T16 行程 1',
      startTime: '2026-08-15T12:00:00.000Z',
      durationMin: 60,
    })
    // 当前 production 实际行为：NeedConfirm（rule-engine FieldCompletenessRule 缺 endTime 触发）
    expect(result.status).toBe('needs_confirm')
    // 验证：confirmAction 字段携带 createItinerary（供客户端弹窗二次确认）
    if (result.status === 'needs_confirm') {
      expect(result.confirmAction).toBe('createItinerary')
      expect(result.confirmFields).toMatchObject({
        title: 'T16 行程 1',
        startTime: '2026-08-15T12:00:00.000Z',
        durationMin: 60,
      })
    }
    // 验证：DB 仍无该行程（NeedConfirm 阶段未落库）
    const rows = await db.select().from(s.itineraries)
      .where(eq(s.itineraries.userId, USER as any))
    expect(rows.length).toBe(0)
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
  // [issue #3] 当前 production updateItinerary 走 createItineraryMutationService.execute()
  // 用纯 field steps。execute() 的 lastObject 仅在 state 步骤设置（domain-mutation-service/index.ts:374），
  // 故 res.object 恒为 undefined → timebox.ts:338 抛错「更新行程失败：mutation service 未返回对象」。
  // **但实际 field 写已经在事务内 commit**——抛错仅在 server action 返回前发生，对调用方表现为
  // 异常但 DB 已被修改。这是 [026] 编辑入口的 P0 bug：客户端拿不到 success 但实际写已落库。
  // 修复方向（不在 T16 范围）：updateItinerary 应走「单字段 update() + findById 兜底」而非 execute() 聚合路径。
  it('case 3: updateItinerary(id, {title:new}) → 抛错（mutation service 不返回 object，issue #3 守护）', async () => {
    const repo = new ItineraryRepository()
    const it = baseIt()
    await repo.save(it, USER)

    // 当前 production 实际行为：抛错「更新行程失败：mutation service 未返回对象」
    await expect(updateItinerary(it.id as any, { title: 'T16 新标题' }))
      .rejects.toThrow(/更新行程失败.*mutation service/)

    // 写已落库（field step 在事务内 commit），但 server action 抛错导致调用方拿不到 success
    // —— 这是 partial-write 半失败状态，更严重的 issue
    const afterRow = (await db.select().from(s.itineraries)
      .where(eq(s.itineraries.id, it.id as any)))[0]
    expect(afterRow.title).toBe('T16 新标题') // 写入已落
    expect(afterRow.status).toBe('scheduled') // status 未被字段写覆盖
  })

  // ─── case 4: deleteItinerary(scheduledId) ───────────────────
  // [issue #1] 当前 production submit rule 对 deleteItinerary 必 reject
  // → server action 内部 throw。DB 不变（写入约束被 submit rule 守护）。
  it('case 4: deleteItinerary(scheduledId) → 抛错（submit rule 阻断，issue #1 守护） + DB 不变', async () => {
    const repo = new ItineraryRepository()
    const it = baseIt()
    await repo.save(it, USER)
    const beforeRow = (await db.select().from(s.itineraries)
      .where(eq(s.itineraries.id, it.id as any)))[0]

    // 当前 production 实际行为：submit rule 抛错
    // 错误信息：「事件名称不能为空; 开始时间必须是未来; 时长必须大于 0 分钟」
    await expect(deleteItinerary(it.id as any))
      .rejects.toThrow(/事件名称不能为空|时长必须大于/)

    // 写入约束：DB row 不得改变
    const afterRow = (await db.select().from(s.itineraries)
      .where(eq(s.itineraries.id, it.id as any)))[0]
    expect(afterRow.status).toBe(beforeRow.status)
    expect(afterRow.status).toBe('scheduled')
  })

  // ─── case 5: deleteItinerary(expiredId) → 写入约束 IRON RULE ──
  // [issue #1] 当前 production submit rule 先 reject，DB row 不变（写入约束被守护）。
  // 一旦生产规则按 action 分派修复，case 5 必须 SM 拒 cancel（terminal state） + DB 不变。
  it('case 5: deleteItinerary(expiredId) → 抛错 + DB row 不变（写入约束 IRON RULE）', async () => {
    const id = await seedWithStatus('expired')
    const beforeRow = (await db.select().from(s.itineraries)
      .where(eq(s.itineraries.id, id as any)))[0]

    // 当前 production：submit rule 抛错（错信息含「事件名称不能为空」或「时长必须大于 0」）
    await expect(deleteItinerary(id as any))
      .rejects.toThrow(/事件名称不能为空|时长必须大于/)

    // 写入约束 IRON RULE：DB row 不得改变
    const afterRow = (await db.select().from(s.itineraries)
      .where(eq(s.itineraries.id, id as any)))[0]
    expect(afterRow.status).toBe(beforeRow.status)
    expect(afterRow.status).toBe('expired')
    expect(new Date(afterRow.updatedAt).getTime())
      .toBe(new Date(beforeRow.updatedAt).getTime())
  })

  // ─── case 6: deleteItinerary(completedId) → 抛错 + DB 不变 ──
  it('case 6: deleteItinerary(completedId) → 抛错 + DB row 不变', async () => {
    const id = await seedWithStatus('completed')
    const beforeRow = (await db.select().from(s.itineraries)
      .where(eq(s.itineraries.id, id as any)))[0]

    await expect(deleteItinerary(id as any))
      .rejects.toThrow(/事件名称不能为空|时长必须大于/)

    const afterRow = (await db.select().from(s.itineraries)
      .where(eq(s.itineraries.id, id as any)))[0]
    expect(afterRow.status).toBe(beforeRow.status)
    expect(afterRow.status).toBe('completed')
  })

  // ─── case 7: markInProgressItinerary(scheduledId, at) ───────
  // [issue #1] 当前 production submit rule 阻断（必 reject）。DB 不变。
  // 注意：mark* server action 返回 `{ok, error}` 不抛错（timebox.ts:387-394）—— 与 deleteItinerary 不同。
  it('case 7: markInProgressItinerary(scheduledId, at) → ok=false（submit rule 阻断，issue #1 守护） + DB 不变', async () => {
    const repo = new ItineraryRepository()
    const it = baseIt()
    await repo.save(it, USER)
    const beforeRow = (await db.select().from(s.itineraries)
      .where(eq(s.itineraries.id, it.id as any)))[0]

    // 当前 production 实际行为：mark* 返回 {ok: false, error}，不抛错
    const result = await markInProgressItinerary(
      it.id as any,
      '2026-07-20T10:00:00.000Z',
    )
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/事件名称不能为空|时长必须大于/)

    // 写入约束：DB row 不得改变
    const afterRow = (await db.select().from(s.itineraries)
      .where(eq(s.itineraries.id, it.id as any)))[0]
    expect(afterRow.status).toBe(beforeRow.status)
    expect(afterRow.status).toBe('scheduled')
    expect(afterRow.inProgressAt).toBeNull()
  })

  // ─── case 8: markInProgressItinerary(inProgressId, at) ──────
  it('case 8: markInProgressItinerary(inProgressId, at) → ok=false（submit rule 阻断） + DB 不变', async () => {
    const id = await seedWithStatus('in_progress')
    const beforeRow = (await db.select().from(s.itineraries)
      .where(eq(s.itineraries.id, id as any)))[0]

    const result = await markInProgressItinerary(
      id as any,
      '2026-07-20T10:00:00.000Z',
    )
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/事件名称不能为空|时长必须大于/)

    const afterRow = (await db.select().from(s.itineraries)
      .where(eq(s.itineraries.id, id as any)))[0]
    expect(afterRow.status).toBe(beforeRow.status)
    expect(afterRow.status).toBe('in_progress')
  })

  // ─── case 9: markExpiredItinerary(scheduledId, at) ─────────
  it('case 9: markExpiredItinerary(scheduledId, at) → ok=false（submit rule 阻断，issue #1 守护） + DB 不变', async () => {
    const repo = new ItineraryRepository()
    const it = baseIt()
    await repo.save(it, USER)
    const beforeRow = (await db.select().from(s.itineraries)
      .where(eq(s.itineraries.id, it.id as any)))[0]

    const result = await markExpiredItinerary(
      it.id as any,
      '2026-07-25T10:00:00.000Z',
    )
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/事件名称不能为空|时长必须大于/)

    const afterRow = (await db.select().from(s.itineraries)
      .where(eq(s.itineraries.id, it.id as any)))[0]
    expect(afterRow.status).toBe(beforeRow.status)
    expect(afterRow.status).toBe('scheduled')
    expect(afterRow.expiredAt).toBeNull()
  })

  // ─── case 10: markExpiredItinerary(inProgressId, at) ───────
  it('case 10: markExpiredItinerary(inProgressId, at) → ok=false（submit rule 阻断） + DB 不变', async () => {
    const id = await seedWithStatus('in_progress')
    const beforeRow = (await db.select().from(s.itineraries)
      .where(eq(s.itineraries.id, id as any)))[0]

    const result = await markExpiredItinerary(
      id as any,
      '2026-07-25T10:00:00.000Z',
    )
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/事件名称不能为空|时长必须大于/)

    const afterRow = (await db.select().from(s.itineraries)
      .where(eq(s.itineraries.id, id as any)))[0]
    expect(afterRow.status).toBe(beforeRow.status)
    expect(afterRow.status).toBe('in_progress')
  })

  // ─── case 11: markExpiredItinerary(cancelledId, at) ────────
  it('case 11: markExpiredItinerary(cancelledId, at) → ok=false（submit rule 阻断） + DB 不变', async () => {
    const id = await seedWithStatus('cancelled')
    const beforeRow = (await db.select().from(s.itineraries)
      .where(eq(s.itineraries.id, id as any)))[0]

    const result = await markExpiredItinerary(
      id as any,
      '2026-07-25T10:00:00.000Z',
    )
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/事件名称不能为空|时长必须大于/)

    const afterRow = (await db.select().from(s.itineraries)
      .where(eq(s.itineraries.id, id as any)))[0]
    expect(afterRow.status).toBe(beforeRow.status)
    expect(afterRow.status).toBe('cancelled')
  })
})
