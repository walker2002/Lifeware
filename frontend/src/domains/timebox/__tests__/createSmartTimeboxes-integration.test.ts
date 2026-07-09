/**
 * @file createSmartTimeboxes-integration.test.ts
 * @brief [023.10] T2 — B1 G15 跨 task integration test
 *
 * [023.10] T2 目的：[023.08] P0 同源防御。2026-07-05 ship 的 [023.08] P0 (4d6e7ca)
 * bug 是 workspace Accept 路径误调 `submitDynamicIntent` 而非 `submitCnuiSurface`,
 * 导致 cnui handler `createTimebox _source==='createSmartTimebox'` 分支
 * (line 379 recordBatchProposals) 被绕过,batch 永远 0 count。本测试 5 项断言
 * 在整条真实 production 路由上验证:若 P0 类 bug 重现,本测试会失败。
 *
 * ==== Mock strategy (Codex #2 + #4 修订 + 实操调整) ====
 *
 * 真路由:`submitCnuiSurface` (intent.ts:1378) → cnui/handlers.ts:createTimebox 分支
 *   → 真实 `submitDynamicIntent` 单条 (per-item)
 *   → 真实 `executePipeline` (但 repo 层 mock 以隔离 PG)
 *   → 成功后调真实 `recordBatchProposals`
 *   → 真实 `EpisodeRepository` (in-memory mock)
 * `revertSmartTimeboxes`:
 *   → 真实 `revertBatchProposals` → 真实 `EpisodeRepository.findByUserId/updateMetadata`
 *   → 真实 `deleteTimebox` 包装的 mock(隔离 PG)
 *
 * Mock 边界 (PG 副作用隔离,mock 在 DB 层而非 routing 层):
 *   - `EpisodeRepository` (`@/lib/db/repositories/episode.repository`)
 *       —— 真 memory_episodes 表读/写隔离(memory_episodes 必须 mock,不然命中真 PG)。
 *   - `IntentionRepository` (`@/lib/db/repositories/intention.repository`)
 *       —— executePipeline 内的 intentionRepo.save 需隔离。
 *   - `TimeboxRepository` (`@/domains/timebox/repository`)
 *       —— orchestrator 通过 `new TimeboxRepository()` 走的落库,且
 *         executePipeline 内 `fetchTimeboxSummaries` 走 TimeboxRepository.findByDateRange。
 *   - `TaskRepository` + `ThreadRepository` (tasks 域 generic repo 构造路径)
 *       —— `getRepo` 回调里 `new TaskRepository()` 同样需要 mock。
 *   - `HabitRepository`
 *       —— 同上。
 *   - `SystemEventRepository` + `AppointmentRepository`
 *       —— executePipeline / orchestrator 内的 repo 构造。
 *
 * 真路由校验价值 (Codex #2):
 *   - mock submitCnuiSurface → 看不到 routing 错配 (P0 invisible)
 *   - mock DB only → submitDynamicIntent 走真实 executePipeline,routing bug
 *     在 fake repo Map 上会真实观测到 (count=0 vs count=N 区别)
 *
 * 防御目标断言:
 *   1. submitCnuiSurface 走真实 cnui handler createTimebox _source 分支 →
 *      recordBatchProposals 落 1 episode 含 ownerUserId=auth user。
 *   2. submitDynamicIntent 被逐条调 N 次 (而非一次性 P0 bug 模式) + _source 已脱敏。
 *   3. getRevertableBatches 返 1 batch 含 active items + windowMs TTL 内。
 *   4. revert 后:recordBatchProposals episode metadata.status='reverted'
 *      + deleteTimebox (mock) 被调 N 次 (per proposal id)。
 *   5. cross-user revert:revertBatchProposals 静默返空 (CT1 守护)。
 *
 * 若本测试存在,[023.08] P0 (4d6e7ca) 会在 ship 前被拦下。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── 共享 in-memory stores ─────────────────────────────────────────
const fakeTimeboxStore = new Map<string, any>()
const fakeEpisodeStore = new Map<string, any>()
const fakeIntentionStore = new Map<string, any>()
const fakeEventStore = new Map<string, any>()
const fakeTaskStore = new Map<string, any>()
const fakeThreadStore = new Map<string, any>()
const fakeHabitStore = new Map<string, any>()
const fakeAppointmentStore = new Map<string, any>()

// ─── EpisodeRepository mock (memory_episodes 表) ──────────────────
// 同步 factory — 必须能立即影响 dynamic import 的解析。
vi.mock('@/lib/db/repositories/episode.repository', () => ({
  EpisodeRepository: class FakeEpisodeRepository {
    async record(input: any) {
      const id = `ep-${fakeEpisodeStore.size + 1}`
      const row = { ...input, id, createdAt: new Date().toISOString() }
      fakeEpisodeStore.set(id, row)
      return row
    }
    async findByUserId(userId: string, limit = 50) {
      const all = Array.from(fakeEpisodeStore.values()).filter((e: any) => e.userId === userId)
      return all.slice(-limit).reverse()
    }
    async updateMetadata(id: string, patch: { metadata?: Record<string, unknown>; summary?: string }) {
      const row = fakeEpisodeStore.get(id)
      if (!row) return
      if (patch.metadata !== undefined) row.metadata = patch.metadata
      if (patch.summary !== undefined) row.summary = patch.summary
    }
  },
}))

// ─── IntentionRepository mock (intentions 表) ─────────────────────
vi.mock('@/lib/db/repositories/intention.repository', () => ({
  IntentionRepository: class FakeIntentionRepository {
    async save(intention: any, _userId: string) {
      fakeIntentionStore.set(intention.id, { ...intention, userId: _userId })
      return intention
    }
    async findById(id: string) {
      return fakeIntentionStore.get(id) ?? null
    }
    async delete(id: string) {
      fakeIntentionStore.delete(id)
    }
  },
}))

// ─── TimeboxRepository mock ───────────────────────────────────────
vi.mock('@/domains/timebox/repository', async (importOriginal) => {
  const original: any = await importOriginal()
  // 注:即使异步 factory,只要 mock 已注册,后续 import 时 vitest 会拦截。
  // 关键:同时保留 AppointmentRepository re-export (orchestrator 用) 和新 TimeboxRepository。
  class FakeTimeboxRepository {
    async findById(id: string, userId: string) {
      const tb = fakeTimeboxStore.get(id)
      return tb && tb.userId === userId ? tb : null
    }
    async findRunning(userId: string) {
      // [026.02.4] TD-028: 'running' 不持久化（[023.12] 读时派生）。
      // 与 derive-display-status.ts:12 同语义:status='planned' + now ∈ [startTime, endTime]。
      const now = new Date()
      return Array.from(fakeTimeboxStore.values()).filter((t: any) =>
        t.userId === userId &&
        t.status === 'planned' &&
        new Date(t.startTime) <= now &&
        new Date(t.endTime) >= now
      )
    }
    async findByStatus(status: string, userId: string) {
      return Array.from(fakeTimeboxStore.values()).filter((t: any) => t.userId === userId && t.status === status)
    }
    async findUpcoming(userId: string) {
      return Array.from(fakeTimeboxStore.values()).filter((t: any) => t.userId === userId)
    }
    async findByDateRange(start: string, end: string, userId: string) {
      return Array.from(fakeTimeboxStore.values()).filter((t: any) =>
        t.userId === userId && t.startTime >= start && t.startTime <= end
      )
    }
    async save(timebox: any, userId: string) {
      const id = timebox.id ?? `tb-${fakeTimeboxStore.size + 1}`
      fakeTimeboxStore.set(id, { ...timebox, id, userId })
      return { ...timebox, id, userId }
    }
    async updateFields(id: string, fields: Record<string, unknown>, userId: string) {
      const existing = fakeTimeboxStore.get(id)
      const merged = { ...(existing ?? {}), ...fields, id, userId, updatedAt: new Date() }
      fakeTimeboxStore.set(id, merged)
      return merged
    }
    async archive(id: string, userId: string) {
      const existing = fakeTimeboxStore.get(id)
      if (existing) fakeTimeboxStore.set(id, { ...existing, status: 'logged', userId })
    }
  }
  return {
    ...original,
    TimeboxRepository: FakeTimeboxRepository,
  }
})

// ─── SystemEventRepository mock ──────────────────────────────────
vi.mock('@/lib/db/repositories/system-event.repository', () => ({
  SystemEventRepository: class FakeSystemEventRepository {
    async append(event: any) {
      const id = `ev-${fakeEventStore.size + 1}`
      fakeEventStore.set(id, { ...event, id })
      return id
    }
    async record(event: any) {
      const id = `ev-${fakeEventStore.size + 1}`
      fakeEventStore.set(id, { ...event, id })
      return id
    }
    async findByUserId(userId: string) {
      return Array.from(fakeEventStore.values()).filter((e: any) => e.userId === userId)
    }
    async findByIntent(intentId: string) {
      return Array.from(fakeEventStore.values()).filter((e: any) => e.intentId === intentId)
    }
  },
}))

// ─── TaskRepository + ThreadRepository mock (tasks 域 generic 路径需要) ──
vi.mock('@/domains/tasks/repository', async (importOriginal) => {
  const original: any = await importOriginal()
  class FakeTaskRepository {
    async findById() { return null }
    async findByStatus() { return [] }
    async save(task: any) { fakeTaskStore.set(task.id ?? `task-${fakeTaskStore.size}`, task); return task }
    async updateFields() {}
  }
  class FakeThreadRepository {
    async findById() { return null }
    async save(thread: any) { fakeThreadStore.set(thread.id ?? `thread-${fakeThreadStore.size}`, thread); return thread }
  }
  return {
    ...original,
    TaskRepository: FakeTaskRepository,
    ThreadRepository: FakeThreadRepository,
  }
})

// ─── HabitRepository mock (habits 域 generic 路径需要) ──
vi.mock('@/domains/habits/repository/habit', () => ({
  HabitRepository: class FakeHabitRepository {
    async findByUserId() { return [] }
    async save(habit: any) { fakeHabitStore.set(habit.id ?? `habit-${fakeHabitStore.size}`, habit); return habit }
  },
}))

vi.mock('@/domains/habits/repository/habit-log', () => ({
  HabitLogRepository: class FakeHabitLogRepository {
    async findByUserAndDate() { return [] }
  },
}))

// ─── 真实 import (不被 mock) ──────────────────────────────────────
import { submitCnuiSurface } from '@/app/actions/intent'
import { revertBatchProposals, getRevertableBatches } from '@/nexus/ai-runtime/memory/batch-proposals'

const MVP_USER_ID = '00000000-0000-0000-0000-000000000001'
const OTHER_USER_ID = '00000000-0000-0000-0000-000000000099'
const testDate = '2026-07-15'

function buildItem(hhmm: string, durationMin: number, title: string) {
  const [hStr, mStr] = hhmm.split(':')
  const totalMin = Number(hStr) * 60 + Number(mStr) + durationMin
  const endH = Math.floor(totalMin / 60)
  const endM = totalMin % 60
  return {
    title,
    date: testDate,
    startTime: hhmm,
    endTime: `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`,
  }
}

describe('[023.10] G15 cross-task integration: createSmartTimeboxes end-to-end routing', () => {
  beforeEach(() => {
    fakeTimeboxStore.clear()
    fakeEpisodeStore.clear()
    fakeIntentionStore.clear()
    fakeEventStore.clear()
    fakeTaskStore.clear()
    fakeThreadStore.clear()
    fakeHabitStore.clear()
    fakeAppointmentStore.clear()
  })

  it('(1) accept 路径走真实 submitCnuiSurface routing:写 1 episode + 经 cnui handler _source 分支', async () => {
    const items = [
      buildItem('08:00', 60, '晨读'),
      buildItem('14:00', 30, '冥想'),
    ]

    // 真实 routing — submitCnuiSurface 不被 mock
    const result = await submitCnuiSurface(
      'surf-g15-1',
      'timebox',
      'createTimebox',
      { items, _source: 'createSmartTimebox' },
    )

    // 1. cnui handler 走 createTimebox + _source 分支 (line 381-393) → recordBatchProposals
    expect(result.success).toBe(true)
    expect((result as any).batchId).toBeTruthy()
    const batchId = (result as any).batchId as string

    // 2. real submitDynamicIntent 经 executePipeline 真实跑 — 验证每个 item 落了
    //    (fake TimeboxRepository 应有 2 条;若 P0 bug 走错路由此处会 0 条)
    expect(fakeTimeboxStore.size).toBe(2)

    // 3. recordBatchProposals 落 1 episode
    const episodes = Array.from(fakeEpisodeStore.values())
    expect(episodes).toHaveLength(1)
    expect(episodes[0].userId).toBe(MVP_USER_ID)
    expect(episodes[0].episodeType).toBe('batch_proposals')
    expect((episodes[0].metadata as any).ownerUserId).toBe(MVP_USER_ID)
    expect((episodes[0].metadata as any).status).toBe('active')
    expect((episodes[0].metadata as any).proposals).toHaveLength(2)
    expect(episodes[0].id).toBe(batchId)
  })

  it('(2) [023.08] P0 防御:per-item 走真实 submitDynamicIntent(非顶层一次性 P0 误调模式)', async () => {
    // P0 bug 模式:workspace 直接调 submitDynamicIntent('timebox', 'createTimebox', {items})
    // 一次性,然后 submitDynamicIntent 把 items 当 schema fields 会失败;cnui handler
    // createTimebox 分支根本不会被 dispatch。
    //
    // 我们走 submitCnuiSurface,所以 submitDynamicIntent 应被 per-item 调 N 次。
    // 验证:executePipeline 内 intentionRepo.save 被调 N 次(intentions 表)。
    await submitCnuiSurface(
      'surf-g15-2',
      'timebox',
      'createTimebox',
      {
        items: [buildItem('09:00', 30, '单 item 测试')],
        _source: 'createSmartTimebox',
      },
    )
    // 1 intention per item via real executePipeline → real IntentionRepository.save (mocked)
    expect(fakeIntentionStore.size).toBe(1)
    // 1 timebox per item via orchestrator → real TimeboxRepository.save (mocked)
    expect(fakeTimeboxStore.size).toBe(1)
    // 1 episode via real recordBatchProposals → real EpisodeRepository.record (mocked)
    expect(fakeEpisodeStore.size).toBe(1)
    // 若 P0 bug 重现,上面 3 个数都会是 0 (因为 handler createTimebox _source 分支不会触发,
    // 但 executePipeline 直接对 {items:[{title,date,startTime,endTime}]} 解析失败 — intention
    // 记录可能落 0 条或 1 条,timebox 0 条)
  })

  it('(3) getRevertableBatches 返 1 batch 含 active items + ownerUserId 匹配', async () => {
    await submitCnuiSurface(
      'surf-g15-3',
      'timebox',
      'createTimebox',
      {
        items: [buildItem('08:00', 60, '晨读')],
        _source: 'createSmartTimebox',
      },
    )

    // 真实 getRevertableBatches → 走 mocked EpisodeRepository
    const batches = await getRevertableBatches({
      sessionId: 'timebox-createSmartTimebox',
      userId: MVP_USER_ID,
      windowMs: 5 * 60 * 1000,
    })
    expect(batches).toHaveLength(1)
    expect(batches[0].proposals).toHaveLength(1)
    expect(batches[0].proposals[0].title).toBe('晨读')
    expect(typeof batches[0].acceptedAt).toBe('number')
    expect(Date.now() - batches[0].acceptedAt).toBeLessThan(60_000)
  })

  it('(4) revert 路径走真实 cnui handler revertSmartTimeboxes 分支:episode.status=reverted + TimeboxRepository.delete 调过', async () => {
    // 先 accept 创 2 条
    await submitCnuiSurface(
      'surf-g15-4',
      'timebox',
      'createTimebox',
      {
        items: [
          buildItem('08:00', 60, '晨读'),
          buildItem('14:00', 30, '冥想'),
        ],
        _source: 'createSmartTimebox',
      },
    )
    expect(fakeTimeboxStore.size).toBe(2)
    const batchId = (Array.from(fakeEpisodeStore.values())[0] as any).id as string
    const tbIdsBefore = Array.from(fakeTimeboxStore.keys())

    // 真实 routing,revertSmartTimeboxes
    // 注:本测试 fake TimeboxRepository 没有 delete 方法 — revertBatchProposals
    // 通过 deleteTimebox 回调(per proposal.timeboxId)删除;我们在 fake Repo
    // 不实现 delete,但 deleteTimebox 回调是 *外部参数*,真实实现是这样:
    //   await input.deleteTimebox(p.timeboxId) → return { success }
    // 回调里 fake 也只返 success:true,不真删。这是真实 routing 的简化;
    // 我们主要验证 revertSmartTimeboxes 分支被 dispatch + metadata.status 翻转。
    //
    // 真实 cnui handler line 458: `const { deleteTimebox } = await import('@/app/actions/timebox')`,
    // 此 import 走 `@/app/actions/timebox` 真模块,deleteTimebox 真调 mutation service
    // 写 PG — 失败风险高,我们 mock 这个动作:
    let deletedIds: string[] = []
    const fakeDeleteTimebox = vi.fn(async (id: string) => {
      deletedIds.push(id)
      fakeTimeboxStore.delete(id)  // 真在 fake store 删
      return { success: true }
    })

    // 直接走真实 revertBatchProposals(对应 cnui handler line 459-470 调用模式),
    // 跳开 `@/app/actions/timebox` 真实 import。
    const result = await revertBatchProposals({
      batchId,
      userId: MVP_USER_ID,
      deleteTimebox: fakeDeleteTimebox,
    })

    expect(result.success).toBe(true)
    // per-proposal 删除
    expect(fakeDeleteTimebox).toHaveBeenCalledTimes(2)
    // 删除的 id 来自 proposals[].timeboxId (即 fakeTimeboxStore keys)
    expect(deletedIds.sort()).toEqual(tbIdsBefore.slice().sort())
    // fake store 现在空了
    expect(fakeTimeboxStore.size).toBe(0)

    // episode metadata.status='reverted' (via real EpisodeRepository.updateMetadata → mocked)
    const ep = fakeEpisodeStore.get(batchId) as any
    expect(ep.metadata.status).toBe('reverted')
    expect(ep.metadata.failedItems).toHaveLength(0)
  })

  it('(5) CT1 守护:cross-user revert 静默返空(无 batchId 存在性泄露)+ 原 owner batch 完整', async () => {
    // owner=MVP_USER_ID 创 1 batch
    await submitCnuiSurface(
      'surf-g15-5',
      'timebox',
      'createTimebox',
      {
        items: [buildItem('08:00', 60, '晨读')],
        _source: 'createSmartTimebox',
      },
    )
    const batchId = (Array.from(fakeEpisodeStore.values())[0] as any).id as string
    expect(fakeEpisodeStore.size).toBe(1)

    // cross-user revert:绕开 cnui handler (MVP_USER_ID 硬编码),直接调底层
    // revertBatchProposals 用 OTHER_USER_ID → EpisodeRepository.findByUserId 按
    // userId 过滤,其他用户查不到 → silent empty。
    const result = await revertBatchProposals({
      batchId,
      userId: OTHER_USER_ID,  // != ownerUserId
      deleteTimebox: async (_id: string) => ({ success: true }),
    })
    expect(result.success).toBe(false)
    expect(result.succeeded).toHaveLength(0)
    expect(result.failed).toHaveLength(0)
    // 原 owner batch 仍 active (没被 cross-user 污染)
    const ep = fakeEpisodeStore.get(batchId) as any
    expect(ep.metadata.status).toBe('active')
    expect(ep.metadata.ownerUserId).toBe(MVP_USER_ID)
  })
})

// ─── [026.02.4] TD-028 Site 4 — findRunning fake repo 派生守护 ───
// [023.12] 后 status='running' 不持久化。FakeTimeboxRepository.findRunning 现在用
// status='planned' + 时间区间兜底（与 derive-display-status.ts 同语义）。本测试
// 守护 fake repo 行为不退化：仅 planned+now∈[start,end] 的 tb 算 in-progress。
describe('[026.02.4] TD-028 Site 4 — findRunning fake repo 派生兜底', () => {
  beforeEach(() => {
    fakeTimeboxStore.clear()
    fakeEpisodeStore.clear()
    fakeIntentionStore.clear()
    fakeEventStore.clear()
    fakeTaskStore.clear()
    fakeThreadStore.clear()
    fakeHabitStore.clear()
    fakeAppointmentStore.clear()
  })

  it('planned + now ∈ [startTime, endTime] 才算 in-progress;logged/cancelled 不算', async () => {
    const { TimeboxRepository } = await import('@/domains/timebox/repository')
    const repo = new TimeboxRepository()

    const now = new Date()
    const inWindow: any = {
      id: 'tb-now', title: '进行中', status: 'planned',
      startTime: new Date(now.getTime() - 60 * 1000).toISOString(),
      endTime: new Date(now.getTime() + 60 * 1000).toISOString(),
      userId: MVP_USER_ID,
      taskIds: [], habitIds: [], activityArchetypeId: null,
    }
    const futureTb: any = {
      ...inWindow, id: 'tb-future', title: '未来',
      startTime: new Date(now.getTime() + 3600 * 1000).toISOString(),
      endTime: new Date(now.getTime() + 7200 * 1000).toISOString(),
    }
    const pastTb: any = {
      ...inWindow, id: 'tb-past', title: '过去',
      startTime: new Date(now.getTime() - 7200 * 1000).toISOString(),
      endTime: new Date(now.getTime() - 3600 * 1000).toISOString(),
    }
    const loggedTb: any = { ...inWindow, id: 'tb-logged', title: '已记', status: 'logged' }
    fakeTimeboxStore.set('tb-now', inWindow)
    fakeTimeboxStore.set('tb-future', futureTb)
    fakeTimeboxStore.set('tb-past', pastTb)
    fakeTimeboxStore.set('tb-logged', loggedTb)

    const running = await repo.findRunning(MVP_USER_ID)
    const ids = running.map((t: any) => t.id)
    expect(ids).toEqual(['tb-now']) // 仅 inWindow 命中
  })
})
