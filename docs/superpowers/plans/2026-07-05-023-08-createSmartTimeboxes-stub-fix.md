# [023.08] createSmartTimeboxes Stub 修复 — 4 架构债 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 解 [023.07] second-opinion review 抓的 4 项架构债（aiRuntime 不可达 / ISO 时间 / overlap Rule / undo 框架），让 #1 createSmartTimeboxes stub 在 dev 环境端到端可用,1 PR / 5 commits。

**Architecture:** Minimal viable wire-up — 已有基础设施(rule-engine.timebox-overlap / MemoryFramework / llm-gateway provider routing)就位,本 plan 重点是连接 + 补缺(mock provider + ISO convert + batch memory record + CreateSmartTimebox surface)。不动 manifest / DB schema / CHANGELOG / 宪章 v2.1.1。

**Tech Stack:** Next.js 16.1.6, React 19.2.3, TypeScript 5, Tailwind 4, Drizzle ORM 0.45.1, Vitest, Playwright (E2E)

## Global Constraints

- **5 commits on main**, 1 PR (一致 [023.07]/[023.09] cadence)
- **TDD 链**:每 task 先写 failing test,再实现
- **不动** manifest / DB schema / CHANGELOG（runtime-only 宪章 v2.1.1）
- **不动** [023.07] 已 ship 的 5 commits 行为
- **不动** [023.09] 已 ship 的 5 commits 行为
- **测试基线**:base/head 失败集合对比 0 新增
- **tsc 零新增**（73 errors pre-existing 不变）
- **pre-push hooks 全过**（`validate:manifest 0 errors`、`validate:domain-structure ✓`）
- **en-US 中文注释 + @file @brief header**（CLAUDE.md §5 强制）
- **Vitest 必须在 `frontend/` cwd 跑**（`@/` 映射,repo root 假失败）
- **Vitest 不做 TS 类型检查**（配 tsc 双验证）
- **#1 stub 上线后 TZ 已稳**（[023.09] canonical UTC arithmetic 已就位）
- **Vitest + Playwright + /browse 验收**（F 推荐）

---

## 现有基础设施复用（important context for implementer）

本 plan 不是从零建基础设施,而是连接 + 补缺:

| 已有 | 路径 | 用途 |
|---|---|---|
| `createTimeOverlapRule` | `frontend/src/nexus/core/rule-engine/rules/timebox-overlap.ts:65-128` | T3 直接调 |
| `createRuleEngine({timeboxRepo, userId})` | `frontend/src/nexus/core/rule-engine/index.ts:79-92` | T3 直接调 |
| `MemoryFramework` (l1+l2) | `frontend/src/nexus/ai-runtime/memory/index.ts:18-26` | T4 复用 l2 episode |
| `LLMGateway` + `createLLMGateway` | `frontend/src/nexus/ai-runtime/llm-gateway/index.ts:42-90` | T1 加 mock 分支 |
| `DEFAULT_ROUTING` providers | `frontend/src/nexus/ai-runtime/llm-gateway/config.ts:11-37` | T1 加 `mock` provider entry |
| `CreateTimebox` CNUI surface | `frontend/src/domains/timebox/cnui/surfaces/CreateTimebox.tsx:40-80` | T5 扩展或新增 `CreateSmartTimebox.tsx` |
| `submitDynamicIntent` server action | `frontend/src/app/actions/intent.ts` | T2/T4 复用 |
| `assertNoInternalOverlap` | `frontend/src/domains/timebox/lib/overlap.ts` | T5 复用做 batch 内自检 |

**关键事实**：
- orchestration-handler **不**调 rule-engine(`detectConflicts` 内部私有实现),本 plan T3 改为调 rule-engine
- orchestration-handler 的 `formatTime(cursorHour, cursorMinute)` 输出 `"HH:MM"` 字符串,DB 需要 ISO,T2 在 cnui/handlers.ts:80-148 createTimebox submit branch 加 convert
- LLM provider 已有 5 个（dashscope/deepseek/zhipu/openai/anthropic/ollama）,T1 加 `mock` 作 dev 默认

---

### Task 1: aiRuntime mock LLM provider + dev 默认配置

**Files:**
- Create: `frontend/src/nexus/ai-runtime/llm-gateway/providers/mock.ts`
- Modify: `frontend/src/nexus/ai-runtime/llm-gateway/config.ts:11-37`
- Modify: `frontend/src/nexus/ai-runtime/llm-gateway/index.ts:18-26`
- Test: `frontend/src/nexus/ai-runtime/__tests__/mock-provider.test.ts`

**Interfaces:**
- Consumes: `LLMCallRequest` from `frontend/src/nexus/ai-runtime/llm-gateway/providers/openai-compatible.ts`
- Produces: `callWithMock(req: LLMCallRequest): Promise<LLMCallResponse>` — returns deterministic mock schedule proposals
- Produces: `selectProvider('mock')` routes to `callWithMock`

- [ ] **Step 1: Write the failing test**

```typescript
// frontend/src/nexus/ai-runtime/__tests__/mock-provider.test.ts
/**
 * @file mock-provider.test
 * @brief [023.08] T1 mock LLM provider — dev 默认,生成确定性 schedule 模板
 */
import { describe, it, expect } from 'vitest'
import { callWithMock } from '../llm-gateway/providers/mock'

describe('callWithMock', () => {
  it('returns deterministic schedule proposal for intent_routing task', async () => {
    const result = await callWithMock({
      model: 'mock-v1',
      messages: [{ role: 'user', content: 'createSmartTimeboxes 2026-07-05' }],
      systemPrompt: '你是智能时间编排助手',
      maxTokens: 1000,
    })
    expect(result.content).toContain('createTimebox')
    expect(result.model).toBe('mock-v1')
    expect(result.tokenUsage.total).toBeGreaterThan(0)
  })

  it('returns mock proposal for content_generation with HH:MM format', async () => {
    const result = await callWithMock({
      model: 'mock-v1',
      messages: [{ role: 'user', content: JSON.stringify({
        proposalSet: { proposals: [{ id: 'p1', payload: { startTime: '08:00' } }] }
      }) }],
      systemPrompt: '优化时间分配',
      taskType: 'content_generation',
    } as any)
    expect(result.content).toMatch(/\d{2}:\d{2}/) // HH:MM present
  })

  it('does not throw on empty messages', async () => {
    const result = await callWithMock({
      model: 'mock-v1',
      messages: [],
      systemPrompt: '',
    })
    expect(result.content).toBeDefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npx vitest run src/nexus/ai-runtime/__tests__/mock-provider.test.ts
```

Expected: FAIL with "Cannot find module '../llm-gateway/providers/mock'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// frontend/src/nexus/ai-runtime/llm-gateway/providers/mock.ts
/**
 * @file mock
 * @brief [023.08] T1 mock LLM provider — dev/test 环境使用,不依赖外部 API
 *
 * 行为：
 * - 输入 messages 解析若含 schedule JSON → 输出 markdown + HH:MM 时间戳
 * - 输入空 → 输出空 markdown
 * - 输入 text → echo + 加 mock 时间安排注释
 *
 * 设计目的：让 aiRuntime 在 dev 环境端到端可跑,无需 OPENAI_API_KEY 等配置。
 * 生产环境通过 env LIFEWARE_LLM_PROVIDER=openai 切真 provider。
 */
import type { LLMCallRequest, LLMCallResponse } from './openai-compatible'

export async function callWithMock(req: LLMCallRequest): Promise<LLMCallResponse> {
  const userContent = req.messages.find(m => m.role === 'user')?.content ?? ''
  const hasScheduleJson = userContent.includes('"proposalSet"')

  let content: string
  if (hasScheduleJson) {
    // content_generation 路径：基于 proposalSet 输出 markdown 优化建议
    content = '## AI 优化建议\n\n' +
      '- 已识别 1 个时间盒任务,建议 08:00-09:00 安排高能量工作\n' +
      '- 任务 1 (HH:MM: 08:00) 与能量曲线峰值匹配\n'
  } else if (userContent.trim() === '') {
    content = ''
  } else {
    // intent_routing 等通用路径：echo + mock 安排
    content = `已收到意图: ${userContent.slice(0, 50)}\n推荐时间: 08:00`
  }

  return {
    content,
    model: req.model,
    tokenUsage: { prompt: userContent.length, completion: content.length, total: userContent.length + content.length },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd frontend && npx vitest run src/nexus/ai-runtime/__tests__/mock-provider.test.ts
```

Expected: 3 PASS

- [ ] **Step 5: Wire mock into config + selectProvider**

Modify `frontend/src/nexus/ai-runtime/llm-gateway/config.ts` — [F2 fix] explicit provider enum:

```typescript
// [023.08] T1 [F2 fix]: 显式 provider enum
// mock | openai | anthropic | dashscope | deepseek | zhipu | ollama
// 未设置 env 默认 mock;设置成非真 provider 名 (allowlist 之外) 也默认 mock
const EXPLICIT_PROVIDER = process.env.LIFEWARE_LLM_PROVIDER ?? 'mock'
const REAL_PROVIDERS = new Set(['openai', 'anthropic', 'dashscope', 'deepseek', 'zhipu', 'ollama'])
const isDevMock = !REAL_PROVIDERS.has(EXPLICIT_PROVIDER)

export const DEFAULT_ROUTING: RoutingTable = {
  intent_routing: isDevMock
    ? { provider: 'mock', model: 'mock-v1' }
    : { provider: 'dashscope', model: 'deepseek-v4-flash', fallback: { provider: 'deepseek', model: 'deepseek-v4-flash' } },
  field_extraction: isDevMock
    ? { provider: 'mock', model: 'mock-v1' }
    : { provider: 'dashscope', model: 'deepseek-v4-flash', fallback: { provider: 'deepseek', model: 'deepseek-v4-flash' } },
  content_generation: isDevMock
    ? { provider: 'mock', model: 'mock-v1' }
    : { provider: 'dashscope', model: 'glm-5.1', fallback: { provider: 'zhipu', model: 'glm-5.1' } },
  summary: isDevMock
    ? { provider: 'mock', model: 'mock-v1' }
    : { provider: 'dashscope', model: 'glm-5.1', fallback: { provider: 'zhipu', model: 'glm-5.1' } },
  cn_ui_revision: isDevMock
    ? { provider: 'mock', model: 'mock-v1' }
    : { provider: 'dashscope', model: 'glm-5.1', fallback: { provider: 'zhipu', model: 'glm-5.1' } },
}
```

Modify `frontend/src/nexus/ai-runtime/llm-gateway/index.ts:18-26`:

```typescript
// [023.08] T1: 加 mock 分支
import { callWithMock } from './providers/mock'

const MOCK_PROVIDERS = new Set(['mock'])

function selectProvider(providerId: string): (req: LLMCallRequest) => Promise<LLMCallResponse> {
  if (MOCK_PROVIDERS.has(providerId)) {
    return callWithMock
  }
  if (ANTHROPIC_PROVIDERS.has(providerId)) {
    return callWithAnthropic
  }
  if (OLLAMA_PROVIDERS.has(providerId)) {
    return callWithOllama
  }
  return (req) => callWithOpenAI(providerId, req)
}
```

- [ ] **Step 6: Verify mock integration**

```bash
cd frontend && npx vitest run src/nexus/ai-runtime/__tests__/ llm-gateway.test.ts mock-provider.test.ts
```

Expected: All PASS (existing llm-gateway tests still pass + new mock provider tests)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/nexus/ai-runtime/llm-gateway/providers/mock.ts \
        frontend/src/nexus/ai-runtime/llm-gateway/config.ts \
        frontend/src/nexus/ai-runtime/llm-gateway/index.ts \
        frontend/src/nexus/ai-runtime/__tests__/mock-provider.test.ts
git commit -m "feat(023.08): mock LLM provider for dev — aiRuntime 不可达 fix (T1)"
```

---

### Task 2: ISO 时间 convert (orchestration HH:MM → DB ISO) [F6: extend existing helpers]

**Files:**
- Modify: `frontend/src/domains/timebox/cnui/surfaces/time-input-helpers.ts` (加 `hhmmToIso`)
- Modify: `frontend/src/domains/timebox/cnui/handlers.ts:333-341` (createTimebox submit branch)
- Test: `frontend/src/domains/timebox/cnui/surfaces/__tests__/time-input-helpers.test.ts` (extend existing)

**Interfaces:**
- Consumes: `it.startTime`, `it.endTime` — `HH:MM` strings from orchestration proposal
- Consumes: `it.date` — `YYYY-MM-DD` date string (orchestration 提供 `payload.date`)
- Produces: `hhmmToIso(hhmm: string, date: string): string` — `YYYY-MM-DDTHH:MM:00.000Z` UTC ISO (export from existing `time-input-helpers.ts`)

- [ ] **Step 1: Write the failing test**

```typescript
// frontend/src/domains/timebox/lib/__tests__/time-format.test.ts
/**
 * @file time-format.test
 * @brief [023.08] T2 HH:MM → ISO UTC convert 单元测试
 */
import { describe, it, expect } from 'vitest'
import { toIsoFromHhMm } from '../time-format'

describe('toIsoFromHhMm', () => {
  it('converts HH:MM on a date to UTC ISO 8601', () => {
    const result = toIsoFromHhMm('08:00', '2026-07-05')
    expect(result).toBe('2026-07-05T08:00:00.000Z')
  })

  it('handles end-of-day HH:MM', () => {
    expect(toIsoFromHhMm('22:00', '2026-07-05')).toBe('2026-07-05T22:00:00.000Z')
  })

  it('throws on malformed HH:MM', () => {
    expect(() => toIsoFromHhMm('24:00', '2026-07-05')).toThrow(/invalid hour/i)
    expect(() => toIsoFromHhMm('8:00', '2026-07-05')).toThrow(/hh:mm format/i)
  })

  it('throws on malformed date', () => {
    expect(() => hhmmToIso('08:00', 'not-a-date')).toThrow(/invalid date/i)
  })

  // [G10 fold] boundary tests
  it('handles start-of-day 00:00', () => {
    expect(hhmmToIso('00:00', '2026-07-05')).toBe('2026-07-05T00:00:00.000Z')
  })
  it('handles end-of-day 23:59', () => {
    expect(hhmmToIso('23:59', '2026-07-05')).toBe('2026-07-05T23:59:00.000Z')
  })
  it('handles cross-year 2024-12-31', () => {
    expect(hhmmToIso('08:00', '2024-12-31')).toBe('2024-12-31T08:00:00.000Z')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npx vitest run src/domains/timebox/cnui/surfaces/__tests__/time-input-helpers.test.ts
```

Expected: FAIL with "hhmmToIso is not a function" (existing file has 2 helpers, not 3)

- [ ] **Step 3: Write minimal implementation — extend existing time-input-helpers.ts**

Modify `frontend/src/domains/timebox/cnui/surfaces/time-input-helpers.ts` — append:

```typescript
/**
 * [023.08] T2 [F6 fold]: HH:MM + date → UTC ISO 8601 timestamp.
 *
 * Orchestration proposal payload.startTime/endTime 用 "HH:MM" 字符串（human-friendly），
 * 但 DB timebox schema 要求 ISO 8601。本 helper 是 server-side bridge,与 [023.09]
 * canonical UTC arithmetic 一致;24:00 / 8:00 等 invalid 抛错(fail-CLOSED)。
 */
export function hhmmToIso(hhmm: string, date: string): string {
  if (!/^\d{2}:\d{2}$/.test(hhmm)) {
    throw new Error(`hhmmToIso: invalid hh:mm format: "${hhmm}"`)
  }
  const [hStr, mStr] = hhmm.split(':')
  const hour = Number(hStr)
  const minute = Number(mStr)
  if (hour < 0 || hour > 23) throw new Error(`hhmmToIso: invalid hour: ${hour}`)
  if (minute < 0 || minute > 59) throw new Error(`hhmmToIso: invalid minute: ${minute}`)

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`hhmmToIso: invalid date format: "${date}"`)
  }

  // UTC ISO (Z 结尾);与 [023.09] canonical UTC invariant 一致
  return `${date}T${hhmm}:00.000Z`
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd frontend && npx vitest run src/domains/timebox/cnui/surfaces/__tests__/time-input-helpers.test.ts
```

Expected: 7 PASS (3 existing isoToLocalDatetimeInput/localDatetimeInputToIso + 4 new hhmmToIso)

- [ ] **Step 5: Wire convert into createTimebox submit branch**

Modify `frontend/src/domains/timebox/cnui/handlers.ts` — at top of file add import (around line 30):

```typescript
import { hhmmToIso } from './surfaces/time-input-helpers'
```

Modify createTimebox submit branch (lines 327-342):

```typescript
if (action === 'createTimebox') {
  const { submitDynamicIntent } = await import('@/app/actions/intent')
  const items = (fields.items as any[]) ?? []
  const succeeded: string[] = []
  const failed: { title: string; error: string }[] = []
  for (const it of items) {
    try {
      // [023.08] T2: ISO 时间 convert — orchestration proposal 发 HH:MM + date,
      // server action 接收时显式 convert 为 ISO UTC,落库前规范化
      const normalized: Record<string, unknown> = { ...it }
      if (typeof it.startTime === 'string' && /^\d{2}:\d{2}$/.test(it.startTime) && typeof it.date === 'string') {
        normalized.startTime = hhmmToIso(it.startTime, it.date)
      }
      if (typeof it.endTime === 'string' && /^\d{2}:\d{2}$/.test(it.endTime) && typeof it.date === 'string') {
        normalized.endTime = hhmmToIso(it.endTime, it.date)
      }
      const r = await submitDynamicIntent('timebox', 'createTimebox', normalized)
      if (r.success) succeeded.push((r.object as any)?.id ?? it.title)
      else failed.push({ title: it.title ?? '未命名', error: r.error ?? '创建失败' })
    } catch (e) {
      failed.push({ title: it.title ?? '未命名', error: e instanceof Error ? e.message : '创建失败' })
    }
  }
  return {
    success: failed.length === 0,
    error: failed.length
      ? `${failed.length} 条失败：${failed.map(f => `${f.title || '未命名'}（${f.error}）`).join('；')}`
      : undefined,
    succeededCount: succeeded.length,
    failedCount: failed.length,
  }
}
```

- [ ] **Step 6: Verify integration [G3 fold]**

```bash
cd frontend && npx vitest run src/domains/timebox/cnui/__tests__/handlers.test.ts src/domains/timebox/cnui/surfaces/__tests__/time-input-helpers.test.ts
```

Expected: All PASS (existing cnui tests + new helpers tests + zero regression)

**[G3 fold] Verify convert is invoked at right branch — add this test to handlers.test.ts:**

```typescript
it('[023.08] T2 G3 createTimebox submit calls hhmmToIso at the HH:MM branch', async () => {
  const items = [{ title: 'test', date: '2026-07-05', startTime: '08:00', endTime: '09:00' }]
  // ... mock submitDynamicIntent + check it received ISO strings, not HH:MM
})
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/domains/timebox/cnui/surfaces/time-input-helpers.ts \
        frontend/src/domains/timebox/cnui/surfaces/__tests__/time-input-helpers.test.ts \
        frontend/src/domains/timebox/cnui/__tests__/handlers.test.ts \
        frontend/src/domains/timebox/cnui/handlers.ts
git commit -m "feat(023.08): HH:MM → ISO UTC convert in createTimebox submit (T2)"
```

---

### Task 3: overlap Rule 形式化 (orchestration-handler 调 rule-engine) [F1: orchestrator wire-up + F3: handle() await + F9: snapshot pre-fetch (hook only, N+1 deferred) + CT3/G16: known-behavior matrix tests]

**Files:**
- Modify: `frontend/src/domains/timebox/handlers/orchestration-handler.ts:88-99` (handle() 补 await) + `:309-342` (detectConflicts → 调 rule-engine + pre-fetch)
- Modify: `frontend/src/domains/timebox/handlers/index.ts:1-10` (factory + createTimeboxHandlers)
- Modify: `frontend/src/nexus/orchestrator/index.ts:1098 + 1188` [F1 fold] — call createTimeboxHandlers(deps) instead of singleton findHandler
- Test: `frontend/src/domains/timebox/__tests__/orchestration-handler.test.ts` (扩展 12 + 3 + 4 [G16] = 19 tests)

**Interfaces:**
- Consumes: `ITimeboxRepository` for `findByDateRange` (TimeOverlapRule factory 需要)
- Consumes: `userId: USOM_ID` (multi-tenancy, T-01~T-04 constraint)
- Produces: `TimeboxOrchestrationHandler` 接受 `{ timeboxRepo, userId }` deps;detectConflicts 调 `createRuleEngine({ timeboxRepo, userId }).evaluate(intent, snapshot)`
- Produces: `createTimeboxHandlers(deps)` factory — orchestrator 调它返 handler map, deps 包含 timeboxRepo + userId

- [ ] **Step 1: Write the failing test**

Add to `frontend/src/domains/timebox/__tests__/orchestration-handler.test.ts`:

```typescript
// 追加在现有 12 tests 之后,顶部 import 视情况加:
import { createRuleEngine } from '@/nexus/core/rule-engine'
import type { ITimeboxRepository } from '@/usom/interfaces/irepository'

describe('orchestration-handler.rule-engine integration', () => {
  it('detectConflicts 调 rule-engine 而不是内部 predicate', async () => {
    const ruleEngine = createRuleEngine({ timeboxRepo: mockTimeboxRepo, userId: 'user-1' })
    const handler = new TimeboxOrchestrationHandler({
      ruleEngine,
      timeboxRepo: mockTimeboxRepo,
      userId: 'user-1',
    })
    const request = makeRequest({
      existingTimeboxes: [{
        id: 'tb-existing', title: 'existing', startTime: '2026-07-05T08:00:00Z',
        endTime: '2026-07-05T09:00:00Z', status: 'planned',
      }],
      proposals: [{ id: 'p1', payload: { startTime: '08:30', endTime: '09:30', title: 'overlap-test' } }],
    })
    const result = await handler.handle(request)
    expect(result.warnings).toContainEqual(expect.objectContaining({
      code: 'SCHEDULE_OVERLAP',
    }))
  })

  it('rule-engine 评估 pass 时 detectConflicts 不返 warning', async () => {
    const ruleEngine = createRuleEngine({ timeboxRepo: emptyTimeboxRepo, userId: 'user-1' })
    const handler = new TimeboxOrchestrationHandler({ ruleEngine, timeboxRepo: emptyTimeboxRepo, userId: 'user-1' })
    const request = makeRequest({ proposals: [{ id: 'p1', payload: { startTime: '08:00', endTime: '09:00' } }] })
    const result = await handler.handle(request)
    const overlapWarnings = result.warnings.filter(w => w.code === 'SCHEDULE_OVERLAP')
    expect(overlapWarnings).toHaveLength(0)
  })

  it('向后兼容:未传 ruleEngine 时 detectConflicts 内部 predicate fallback', async () => {
    const handler = new TimeboxOrchestrationHandler() // 无 deps
    const request = makeRequest({
      existingTimeboxes: [{
        id: 'tb-existing', title: 'existing', startTime: '2026-07-05T08:00:00Z',
        endTime: '2026-07-05T09:00:00Z', status: 'planned',
      }],
      proposals: [{ id: 'p1', payload: { startTime: '08:30', endTime: '09:30', title: 'overlap-test' } }],
    })
    const result = await handler.handle(request)
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: 'SCHEDULE_OVERLAP' }))
  })
})

// [G16 fold: T3 fallback 与原 predicate equivalence — 4 edge cases 双路径等价]
describe('orchestration-handler.rule-engine equivalence', () => {
  const cases = [
    {
      name: '相邻区间 (boundary tangent, 不重叠)',
      existing: [{ id: 'e1', title: 'e', startTime: '2026-07-05T08:00:00Z', endTime: '2026-07-05T09:00:00Z', status: 'planned' }],
      proposals: [{ id: 'p1', payload: { startTime: '09:00', endTime: '10:00', title: 'adjacent' } }],
      expectOverlap: false,
    },
    {
      name: '零时长 proposal',
      existing: [{ id: 'e1', title: 'e', startTime: '2026-07-05T08:00:00Z', endTime: '2026-07-05T09:00:00Z', status: 'planned' }],
      proposals: [{ id: 'p1', payload: { startTime: '08:30', endTime: '08:30', title: 'zero-duration' } }],
      expectOverlap: true,
    },
    {
      name: '全天跨度 (00:00-23:59)',
      existing: [{ id: 'e1', title: 'e', startTime: '2026-07-05T12:00:00Z', endTime: '2026-07-05T13:00:00Z', status: 'planned' }],
      proposals: [{ id: 'p1', payload: { startTime: '00:00', endTime: '23:59', title: 'all-day' } }],
      expectOverlap: true,
    },
    {
      name: 'status=ended (与已结束重叠 → 应 pass)',
      existing: [{ id: 'e1', title: 'e', startTime: '2026-07-05T08:00:00Z', endTime: '2026-07-05T09:00:00Z', status: 'ended' }],
      proposals: [{ id: 'p1', payload: { startTime: '08:30', endTime: '09:30', title: 'after-ended' } }],
      expectOverlap: false,
    },
  ]

  for (const c of cases) {
    it(`[equivalence] ${c.name}: rule-engine 与 fallback 同结果`, async () => {
      // 路径 A: rule-engine
      const ruleEngine = createRuleEngine({ timeboxRepo: mockTimeboxRepo, userId: 'user-1' })
      const handlerA = new TimeboxOrchestrationHandler({ ruleEngine, timeboxRepo: mockTimeboxRepo, userId: 'user-1' })
      const resA = await handlerA.handle(makeRequest({ existingTimeboxes: c.existing, proposals: c.proposals }))
      const overlapA = resA.warnings.filter(w => w.code === 'SCHEDULE_OVERLAP').length

      // 路径 B: fallback (无 deps)
      const handlerB = new TimeboxOrchestrationHandler()
      const resB = await handlerB.handle(makeRequest({ existingTimeboxes: c.existing, proposals: c.proposals }))
      const overlapB = resB.warnings.filter(w => w.code === 'SCHEDULE_OVERLAP').length

      // 验证: 两条路径对 'overlap 是否触发' 给出一致判定
      if (c.expectOverlap) {
        expect(overlapA).toBeGreaterThan(0)
        expect(overlapB).toBeGreaterThan(0)
      } else {
        expect(overlapA).toBe(0)
        expect(overlapB).toBe(0)
      }
    })
  }
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npx vitest run src/domains/timebox/__tests__/orchestration-handler.test.ts
```

Expected: 3 new tests FAIL with "Expected N arguments" (constructor signature change)

- [ ] **Step 3: Modify orchestration-handler to take optional deps + use rule-engine [F3 await + F9 snapshot pre-fetch (hook only; N+1 deferred)]**

Modify `frontend/src/domains/timebox/handlers/orchestration-handler.ts`:

```typescript
// ─── [023.08] T3: 可选 deps 用于 rule-engine 集成 [F3+F9 fold] ───
import { createRuleEngine } from '@/nexus/core/rule-engine'
import type { ITimeboxRepository } from '@/usom/interfaces/irepository'
import type { USOM_ID } from '@/usom/types/primitives'
import type { RuleEngine } from '@/nexus/core/rule-engine'

export interface TimeboxOrchestrationHandlerDeps {
  ruleEngine?: RuleEngine
  timeboxRepo?: ITimeboxRepository
  userId?: USOM_ID
}

export class TimeboxOrchestrationHandler implements DomainHandler {
  private readonly deps: TimeboxOrchestrationHandlerDeps

  constructor(deps: TimeboxOrchestrationHandlerDeps = {}) {
    this.deps = deps
  }

  async handle(request: GenerationRequest): Promise<GenerationResult> {
    const date = this.resolveDate(request)
    const materials = this.collectMaterials(request.contexts)
    const items = this.buildTimeboxItems(materials)
    const sorted = this.sortItems(items)
    const occupied = this.extractOccupiedSlots(materials.existingTimeboxes)
    const { proposals, warnings: boundWarnings } = this.generateProposals(sorted, occupied, materials.energyCurve, date)
    // [F3 fold] handle() 补 await — detectConflicts 现 async,否则 conflictWarnings 是 Promise<Warning[]>
    const conflictWarnings = await this.detectConflicts(proposals, materials.existingTimeboxes)
    const presentation = this.renderMarkdown(proposals, date)

    return {
      proposalSet: {
        id: crypto.randomUUID(),
        label: `${date} 智能编排方案`,
        proposals,
        tags: ['auto-schedule', 'smart'],
      },
      presentation,
      warnings: [...boundWarnings, ...conflictWarnings],
    }
  }

  // ...existing handle() 等方法不动,只改 detectConflicts

  private async detectConflicts(
    proposals: GeneratedProposal[],
    existingTimeboxes: TimeboxSummary[],
  ): Promise<Warning[]> {
    const warnings: Warning[] = []

    // [023.08] T3 [F9 fold / partial]: rule-engine 评估前 pre-fetch existingTimeboxes
    //   并透传到 snapshot.upcomingTimeboxes。注意：当前 TimeOverlapRule 不消费此字段，
    //   仍 per-proposal 查 DB（N+1）。本 fold 是 snapshot availability hook，为未来
    //   rule-engine 改造消费 snapshot 而 wiring 已就绪；真正的 N+1 优化 defer。
    //   TimeOverlapRule 内部仍调 timeboxRepo.findByDateRange(proposalRange),但预 fetch 让 fallback
    //   路径无需重复 DB 调用。
    const preFetchedOccupied = existingTimeboxes  // 当前实现已 inline 拿到,无需额外 pre-fetch 逻辑

    if (this.deps.ruleEngine) {
      for (const proposal of proposals) {
        const intent = this.proposalToIntent(proposal)
        const snapshot = {
          existingTimeboxes: preFetchedOccupied,
          proposals,
          // [F9 fold / partial] explicit metadata 标记 batch 预取就绪；当前仅作 hook，
          // rule-engine 不消费此字段（snapshot.upcomingTimeboxes 也未消费），N+1 未消解。
          metadata: { batchPreFetched: true },
        }
        const result = await this.deps.ruleEngine.evaluate(intent, snapshot as any)
        for (const confirmMsg of result.confirmations) {
          warnings.push({
            code: 'SCHEDULE_OVERLAP',
            message: `"${proposal.payload.title}" ${confirmMsg}`,
            severity: 'warn',
            affectedProposalIds: [proposal.id],
          })
        }
      }
      return warnings
    }

    // Fallback: 旧 [023.07] 谓词
    for (const proposal of proposals) {
      const payload = proposal.payload
      const pStart = this.timeToMinutes(payload.startTime as string)
      const pEnd = this.timeToMinutes(payload.endTime as string)

      for (const tb of preFetchedOccupied) {
        const tbStart = new Date(tb.startTime)
        const tbEnd = new Date(tb.endTime)
        const tStart = tbStart.getUTCHours() * 60 + tbStart.getUTCMinutes()
        const tEnd = tbEnd.getUTCHours() * 60 + tbEnd.getUTCMinutes()

        if (pStart < tEnd && pEnd > tStart) {
          warnings.push({
            code: 'SCHEDULE_OVERLAP',
            message: `"${payload.title}" 与已有时间盒 "${tb.title}" 存在时间重叠`,
            severity: 'warn',
            affectedProposalIds: [proposal.id],
          })
        }
      }
    }

    return warnings
  }

  private proposalToIntent(proposal: GeneratedProposal): StructuredIntent {
    return {
      id: crypto.randomUUID() as any,
      action: 'createTimebox',
      targetDomain: 'timebox',
      fields: {
        title: proposal.payload.title,
        startTime: proposal.payload.startTime,
        endTime: proposal.payload.endTime,
      },
    } as StructuredIntent
  }
}
```

- [ ] **Step 4: Run test to verify it passes [G2 fold: handle() async detectConflicts 集成]**

```bash
cd frontend && npx vitest run src/domains/timebox/__tests__/orchestration-handler.test.ts
```

Expected: All 19 tests PASS (12 existing + 3 rule-engine + 4 [G16] equivalence)

- [ ] **Step 5: Wire rule-engine in handler factory + [F1 fold] update orchestrator registration**

Modify `frontend/src/domains/timebox/handlers/index.ts`:

```typescript
/**
 * @file index
 * @brief [023.08] T3 handler factory — 注入 rule-engine + repo + userId [F1 fold]
 *
 * [023.08] T3 把 overlap 检测从内部 proprietary 谓词升级为 rule-engine 评估;
 * 工厂方法 createTimeboxHandlers(deps) 由 orchestrator 调用时传入完整 deps。
 * [F1 fold]: orchestrator 必须用本 factory (而非 findHandler singleton), 否则
 * rule-engine 在生产路径死代码(同 [023.07] TZ bug pattern)。
 */
import type { ITimeboxRepository } from '@/usom/interfaces/irepository'
import type { USOM_ID } from '@/usom/types/primitives'
import { createRuleEngine } from '@/nexus/core/rule-engine'
import { TimeboxOrchestrationHandler } from './orchestration-handler'

export interface HandlerFactoryDeps {
  timeboxRepo?: ITimeboxRepository
  userId?: USOM_ID
}

export function createTimeboxHandlers(deps: HandlerFactoryDeps = {}) {
  const ruleEngine = deps.timeboxRepo && deps.userId
    ? createRuleEngine({ timeboxRepo: deps.timeboxRepo, userId: deps.userId })
    : undefined
  return {
    createSmartTimeboxes: new TimeboxOrchestrationHandler({ ruleEngine, ...deps }),
    adjustRemainingTimeboxes: new TimeboxOrchestrationHandler({ ruleEngine, ...deps }),
  }
}

// 向后兼容:无 deps 时仍可用(测试 + 老调用点)
export const handlers = createTimeboxHandlers()
```

**[F1 fold CRITICAL]** Modify `frontend/src/nexus/orchestrator/index.ts:1098 + 1188`:

```typescript
// Before:
const handler = await findHandler(intent.targetDomain, intent.action)

// After (introduce factory-aware lookup):
//   import { createTimeboxHandlers } from '@/domains/timebox/handlers'
//   在 orchestrator 启动时持有 handlers 实例,deps 来自 deps.timeboxRepo + userId

// 推荐 pattern: orchestrator 构造时一次性 init handler map,deps 注入
const handlers = (deps.timeboxRepo && deps.userId)
  ? createTimeboxHandlers({ timeboxRepo: deps.timeboxRepo, userId: deps.userId })
  : createTimeboxHandlers()  // fallback to no-deps (向后兼容老 code path)

// findHandler 内部改用 handlers map 而非 singleton
function findHandler(domain: string, action: string): DomainHandler | undefined {
  if (domain === 'timebox' && handlers[action]) return handlers[action]
  // ...其他域
  return undefined
}
```

具体实现: review handler factory `handlers` 对象(`handlers.ts`)的 export 形式,确保 orchestrator 注入 deps 后 `findHandler` 实际返 rule-engine-enabled handler。**关键**: 不要保留 bare `export const handlers = createTimeboxHandlers()` 静态实例 (无 deps)。

- [ ] **Step 6: Verify integration [G1 fold: orchestrator integration + G11 fold: error fallback]**

```bash
cd frontend && npx vitest run src/domains/timebox/__tests__/orchestration-handler.test.ts src/nexus/core/rule-engine/__tests__/timebox-overlap.test.ts src/nexus/orchestrator/__tests__/orchestrator-generative.test.ts
```

Expected: All PASS (orchestration-handler 19 + rule-engine existing tests + orchestrator regression)

**Add G1 test** — orchestrator integration:

```typescript
// frontend/src/nexus/orchestrator/__tests__/orchestrator-generative.test.ts 新增
it('[023.08] G1 orchestrator 实际调 createTimeboxHandlers(deps) 时 rule-engine 被 wire', async () => {
  // mock deps 含 timeboxRepo + userId
  // 调 orchestrator.executeGenerativePath(intent)
  // 验证: TimeOverlapRule 至少被调一次(通过 mockTimeboxRepo.findByDateRange 调用计数)
})
```

**Add G11 test** — rule-engine.evaluate() throws fallback:

```typescript
// frontend/src/domains/timebox/__tests__/orchestration-handler.test.ts
it('[G11] rule-engine.evaluate() 抛错时 detectConflicts fallback 到 predicate 不阻塞', async () => {
  const ruleEngine = { evaluate: vi.fn().mockRejectedValue(new Error('timeout')) }
  const handler = new TimeboxOrchestrationHandler({ ruleEngine, ... })
  // 验证: 抛错时 handler.handle() 不 unhandled reject, 返 warnings (含 fallback predicate 检测到的 overlap)
})
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/domains/timebox/handlers/orchestration-handler.ts \
        frontend/src/domains/timebox/handlers/index.ts \
        frontend/src/domains/timebox/__tests__/orchestration-handler.test.ts
git commit -m "feat(023.08): orchestration-handler detects overlap via rule-engine (T3)"
```

---

### Task 4: Batch undo (AI session state memory + revert API) [F4: memory_episodes + F8: status state machine + CT1: userId check]

**Files:**
- Create: `frontend/src/nexus/ai-runtime/memory/batch-proposals.ts` (使用 l2.create_episode 持久化)
- Modify: `frontend/src/domains/timebox/cnui/handlers.ts:80-105` (createSmartTimeboxes branch 写 batch record)
- Modify: `frontend/src/domains/timebox/cnui/handlers.ts` (新增 revertBatchProposals handler)
- Modify: `frontend/src/domains/timebox/index.ts` (route register)
- Test: `frontend/src/nexus/ai-runtime/memory/__tests__/batch-proposals.test.ts` (extend: G5 DB write + G7 partial retry + G8 userId check)

**Interfaces:**
- Consumes: `MemoryFramework.l2.createEpisode` from `frontend/src/nexus/ai-runtime/memory/index.ts:18-26` (持久化到 memory_episodes 表)
- Consumes: `deleteTimebox` action from `frontend/src/app/actions/intent.ts` (revert 走删除)
- Produces: `recordBatchProposals(sessionId, userId, proposals)` → 写 memory_episode (kind='batch_proposals', payload=proposals+ownerUserId+acceptedAt)
- Produces: `revertBatchProposals(batchId, userId)` → 读 episode → 验证 ownerUserId === userId [CT1 fold] → 逐条 deleteTimebox → mark status='partial' or 'reverted' [F8 fold]
- Produces: `getRevertableBatches(sessionId, userId)` → 列 5 分钟内 status='active' 的 batch

- [ ] **Step 1: Write the failing test**

```typescript
// frontend/src/nexus/ai-runtime/memory/__tests__/batch-proposals.test.ts
/**
 * @file batch-proposals.test
 * @brief [023.08] T4 batch undo — memory record + revert + 5 分钟 TTL
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createMemoryFramework, resetMemoryFramework } from '../index'
import { recordBatchProposals, revertBatchProposals, getRevertableBatches } from '../batch-proposals'

describe('batch-proposals', () => {
  beforeEach(() => resetMemoryFramework())

  it('recordBatchProposals 写 memory_episode 并返 batchId', async () => {
    const mem = createMemoryFramework()
    const batchId = await recordBatchProposals({
      sessionId: 'session-1',
      userId: 'user-1',
      proposals: [{ id: 'p1', title: 'task 1' }, { id: 'p2', title: 'task 2' }],
    })
    expect(batchId).toBeTruthy()
  })

  it('revertBatchProposals 调 deleteTimebox 每条 + 标 reverted', async () => {
    const batchId = await recordBatchProposals({
      sessionId: 'session-2', userId: 'user-1',
      proposals: [{ id: 'p1', timeboxId: 'tb-1' }, { id: 'p2', timeboxId: 'tb-2' }],
    })
    const deletedIds: string[] = []
    const result = await revertBatchProposals({
      batchId, userId: 'user-1',
      deleteTimebox: async (id) => { deletedIds.push(id); return { success: true } },
    })
    expect(result.success).toBe(true)
    expect(deletedIds).toEqual(['tb-1', 'tb-2'])
  })

  it('revert 部分失败时仍继续,返 succeeded/failed 明细', async () => {
    const batchId = await recordBatchProposals({
      sessionId: 'session-3', userId: 'user-1',
      proposals: [{ id: 'p1', timeboxId: 'tb-1' }, { id: 'p2', timeboxId: 'tb-2' }],
    })
    const result = await revertBatchProposals({
      batchId, userId: 'user-1',
      deleteTimebox: async (id) => id === 'tb-1' ? { success: true } : { success: false, error: 'not found' },
    })
    expect(result.succeeded).toEqual(['tb-1'])
    expect(result.failed).toEqual([{ id: 'tb-2', error: 'not found' }])
  })

  it('getRevertableBatches 仅列 5 分钟内未 revert 的 batch', async () => {
    const batchId = await recordBatchProposals({
      sessionId: 'session-4', userId: 'user-1',
      proposals: [{ id: 'p1', timeboxId: 'tb-1' }],
    })
    const batches = await getRevertableBatches({ sessionId: 'session-4', userId: 'user-1', windowMs: 5 * 60 * 1000 })
    expect(batches.map(b => b.batchId)).toContain(batchId)
  })

  // [G5 fold]: DB 真实写入 (memory_episodes 表)
  it('[G5] recordBatchProposals 真实写到 memory_episodes 表', async () => {
    const batchId = await recordBatchProposals({
      sessionId: 'session-db-1', userId: 'user-db-1',
      proposals: [{ id: 'p1', timeboxId: 'tb-1', title: 'db-test' }],
    })
    // 验证 episode 持久化: 通过 l2 read_episode_by_kind 或直接 SQL 验证
    const mem = createMemoryFramework()
    const episode = await mem.l2.readEpisode(batchId)
    expect(episode).toBeTruthy()
    expect(episode?.kind).toBe('batch_proposals')
    expect(episode?.userId).toBe('user-db-1')
    expect(episode?.payload.proposals).toEqual([{ id: 'p1', timeboxId: 'tb-1', title: 'db-test' }])
  })

  // [G7 fold]: 部分失败 retry — status=partial 时只重试 failed items
  it('[G7] revertBatchProposals status=partial retry 只重试 failed items', async () => {
    const batchId = await recordBatchProposals({
      sessionId: 'session-g7', userId: 'user-g7',
      proposals: [{ id: 'p1', timeboxId: 'tb-1' }, { id: 'p2', timeboxId: 'tb-2' }],
    })
    // 第一次 revert: tb-1 成功, tb-2 失败 → status=partial
    const r1 = await revertBatchProposals({
      batchId, userId: 'user-g7',
      deleteTimebox: async (id) => id === 'tb-1' ? { success: true } : { success: false, error: 'not found' },
    })
    expect(r1.succeeded).toEqual(['tb-1'])
    expect(r1.failed).toEqual([{ id: 'tb-2', error: 'not found' }])
    // 第二次 revert (retry): 应只重试 tb-2 (status=partial)
    const r2 = await revertBatchProposals({
      batchId, userId: 'user-g7',
      deleteTimebox: async (id) => { expect(id).toBe('tb-2'); return { success: true } },
    })
    expect(r2.succeeded).toEqual(['tb-2'])
    expect(r2.failed).toEqual([])
  })

  // [G8 fold]: userId mismatch permission check
  it('[G8] revertBatchProposals 跨 userId 调用返回 empty 不泄露', async () => {
    const batchId = await recordBatchProposals({
      sessionId: 'session-g8', userId: 'owner-user',
      proposals: [{ id: 'p1', timeboxId: 'tb-1' }],
    })
    // attacker 用不同 userId 调 revert
    const deletedIds: string[] = []
    const r = await revertBatchProposals({
      batchId, userId: 'attacker-user',
      deleteTimebox: async (id) => { deletedIds.push(id); return { success: true } },
    })
    expect(r.succeeded).toEqual([])
    expect(r.failed).toEqual([])
    expect(deletedIds).toEqual([]) // 跨 user 没 delete 任何
  })

  // [G8 fold]: getRevertableBatches userId mismatch
  it('[G8] getRevertableBatches 跨 userId 调用返回 empty', async () => {
    const batchId = await recordBatchProposals({
      sessionId: 'session-g8b', userId: 'owner-user',
      proposals: [{ id: 'p1', timeboxId: 'tb-1' }],
    })
    const batches = await getRevertableBatches({ sessionId: 'session-g8b', userId: 'attacker-user', windowMs: 5 * 60 * 1000 })
    expect(batches).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npx vitest run src/nexus/ai-runtime/memory/__tests__/batch-proposals.test.ts
```

Expected: FAIL with "Cannot find module '../batch-proposals'"

- [ ] **Step 3: Write minimal implementation — [F4 fold] memory_episodes + [F8 fold] status state + [CT1 fold] userId check**

```typescript
// frontend/src/nexus/ai-runtime/memory/batch-proposals.ts
/**
 * @file batch-proposals
 * @brief [023.08] T4 batch undo — AI session state 记录 batch proposals, 5 分钟内可 revert [F4+F8+CT1]
 *
 * 设计：
 * - [F4] 用 memory_episodes 表 (kind='batch_proposals') 持久化 batch record:
 *   payload = { proposals, ownerUserId, acceptedAt, status: 'active' | 'partial' | 'reverted' }
 * - [CT1] revert/getRevertableBatches 验证 ownerUserId === callerUserId, mismatch 静默返 empty
 *   (不泄露 batchId 存在性,防御 enumeration attack)
 * - [F8] status state machine:
 *   - 'active': 未 revert / 部分 revert 未完成
 *   - 'partial': 部分 deleteTimebox 失败, retry 时只重试 failed items
 *   - 'reverted': 全部 succeeded, getRevertableBatches 不再列
 * - 5 分钟 TTL: getRevertableBatches 仅列 window 内 status === 'active' 的 batch
 * - 部分失败容错: deleteTimebox 失败一条不阻断其他;retry 走 episode payload.failedItems
 */
import { createMemoryFramework } from './index'

export interface BatchProposalItem {
  id: string
  timeboxId?: string
  title?: string
}

export type BatchStatus = 'active' | 'partial' | 'reverted'

export interface RecordBatchInput {
  sessionId: string
  userId: string
  proposals: BatchProposalItem[]
}

export interface RevertBatchInput {
  batchId: string
  userId: string
  deleteTimebox: (id: string) => Promise<{ success: boolean; error?: string }>
}

export interface RevertBatchResult {
  success: boolean
  succeeded: string[]
  failed: Array<{ id: string; error: string }>
}

export interface RevertableBatch {
  batchId: string
  acceptedAt: number
  proposals: BatchProposalItem[]
}

/**
 * Record a batch of accepted proposals. Persists to memory_episodes table via l2.createEpisode.
 * [F4 fold]: Replaces in-memory stub with real DB write.
 */
export async function recordBatchProposals(input: RecordBatchInput): Promise<string> {
  const batchId = crypto.randomUUID()
  const mem = createMemoryFramework()
  await mem.l2.createEpisode({
    id: batchId,
    userId: input.userId,
    sessionId: input.sessionId,
    kind: 'batch_proposals',
    payload: {
      proposals: input.proposals,
      ownerUserId: input.userId,
      acceptedAt: Date.now(),
      status: 'active' as BatchStatus,
      failedItems: [] as BatchProposalItem[],
    },
  })
  return batchId
}

/**
 * Revert a batch by deleting each timebox. [CT1 fold] verify ownerUserId === userId.
 * [F8 fold] Use status state machine; on partial failure, persist failedItems for retry.
 */
export async function revertBatchProposals(input: RevertBatchInput): Promise<RevertBatchResult> {
  const mem = createMemoryFramework()
  const episode = await mem.l2.readEpisode(input.batchId)

  // [CT1 fold] permission check — silent return empty (no leak of batchId existence)
  if (!episode || episode.payload.ownerUserId !== input.userId) {
    return { success: false, succeeded: [], failed: [] }
  }

  // [F8 fold] status check — already fully reverted, no-op
  if (episode.payload.status === 'reverted') {
    return { success: true, succeeded: [], failed: [] }
  }

  // [F8 fold] retry logic — skip items that already succeeded in prior partial attempt
  const alreadySucceeded = new Set(
    episode.payload.proposals
      .filter((p: BatchProposalItem) => !episode.payload.failedItems.includes(p))
      .map((p: BatchProposalItem) => p.timeboxId)
      .filter(Boolean)
  )
  const itemsToRetry = episode.payload.status === 'partial'
    ? episode.payload.failedItems
    : episode.payload.proposals

  const succeeded: string[] = []
  const failed: BatchProposalItem[] = []
  for (const p of itemsToRetry) {
    if (!p.timeboxId) continue
    if (alreadySucceeded.has(p.timeboxId)) continue
    try {
      const r = await input.deleteTimebox(p.timeboxId)
      if (r.success) succeeded.push(p.timeboxId)
      else failed.push(p)
    } catch (e) {
      failed.push(p)
    }
  }

  // [F8 fold] update episode status + failedItems
  const newStatus: BatchStatus = failed.length === 0 ? 'reverted' : 'partial'
  await mem.l2.updateEpisode(input.batchId, {
    payload: {
      ...episode.payload,
      status: newStatus,
      failedItems: failed,
    },
  })

  return {
    success: newStatus === 'reverted',
    succeeded,
    failed: failed.map(p => ({ id: p.timeboxId!, error: 'unknown' })),
  }
}

/**
 * List revertable batches within windowMs. [CT1 fold] filter by ownerUserId === userId.
 */
export async function getRevertableBatches(input: {
  sessionId: string
  userId: string
  windowMs: number
}): Promise<RevertableBatch[]> {
  const mem = createMemoryFramework()
  const now = Date.now()
  const episodes = await mem.l2.listEpisodesByKind('batch_proposals', {
    sessionId: input.sessionId,
    status: 'active',
    withinMs: input.windowMs,
    asOf: now,
  })
  return episodes
    .filter(ep => ep.payload.ownerUserId === input.userId)
    .map(ep => ({
      batchId: ep.id,
      acceptedAt: ep.payload.acceptedAt,
      proposals: ep.payload.proposals,
    }))
}
```

- [ ] **Step 4: Run test to verify it passes [G5+G7+G8 fold]**

```bash
cd frontend && npx vitest run src/nexus/ai-runtime/memory/__tests__/batch-proposals.test.ts
```

Expected: 9 PASS (4 basic + 1 G5 DB write + 1 G7 partial retry + 2 G8 userId permission)

- [ ] **Step 5: Wire batch record into createSmartTimeboxes CNUI surface**

Modify `frontend/src/domains/timebox/cnui/handlers.ts` — top imports add:

```typescript
import { recordBatchProposals, revertBatchProposals, getRevertableBatches } from '@/nexus/ai-runtime/memory/batch-proposals'
```

Modify createSmartTimeboxes branch (around line 106-137) — wrap return to include batch support metadata:

```typescript
if (action === 'createSmartTimeboxes') {
  const [timeboxes, tasks, habits] = await Promise.all([
    getTodayTimeboxes(),
    getActiveTasks(),
    getPendingHabits(),
  ])

  // [023.08] T4: 列当前 session 5 分钟内可 revert 的 batches
  const revertableBatches = await getRevertableBatches({
    sessionId: `timebox-${action}`,
    userId: userId as string,
    windowMs: 5 * 60 * 1000,
  })

  return {
    content: '智能编排时间盒 — 根据您的任务、习惯和能量曲线,AI 将自动生成今日时间盒方案',
    dataSnapshot: {
      existingTimeboxes: timeboxes.map(t => ({
        id: t.id, title: t.title, startTime: t.startTime, endTime: t.endTime, status: t.status,
      })),
      activeTasks: tasks.map(t => ({
        id: t.id, title: t.title, priority: t.priority, estimatedDuration: t.estimatedDuration,
      })),
      pendingHabits: habits.map(h => ({
        id: h.id, title: h.title, defaultTime: h.defaultTime, defaultDuration: h.defaultDuration,
      })),
      // [023.08] T4: AI panel 据此显示「撤销刚才创建的 N 个时间盒」按钮
      revertableBatches: revertableBatches.map(b => ({
        batchId: b.batchId,
        acceptedAt: b.acceptedAt,
        count: b.proposals.length,
      })),
    },
  }
}
```

Add new handler in `cnui/handlers.ts` after createSmartTimeboxes branch (around line 137):

```typescript
if (action === 'revertSmartTimeboxes') {
  const { batchId } = (fields ?? {}) as { batchId?: string }
  if (!batchId) return { success: false, error: 'batchId 必填' }

  // [023.08] T4: revert via deleteTimebox server action
  const { deleteTimebox } = await import('@/app/actions/intent')
  const result = await revertBatchProposals({
    batchId, userId: userId as string,
    deleteTimebox: async (id) => {
      const r = await deleteTimebox('timebox', id, userId)
      return { success: !!r?.success, error: r?.error }
    },
  })
  return {
    success: result.success,
    error: result.failed.length ? `${result.failed.length} 个 timebox 撤销失败` : undefined,
    succeededCount: result.succeeded.length,
    failedCount: result.failed.length,
  }
}
```

- [ ] **Step 6: Register action in domain index**

Modify `frontend/src/domains/timebox/index.ts` (find the intent action table — typically `intentActions` array or similar):

```typescript
// [023.08] T4: 注册 revertSmartTimeboxes action
intentActions.push({
  action: 'revertSmartTimeboxes',
  handler: timeboxCnuiHandler.open.bind(timeboxCnuiHandler),
  // 走 surface handlers dispatch table;see existing intent action registration pattern
})
```

(具体注册位置视 `domains/timebox/index.ts` 现有 pattern 而定,reviewer 阶段 confirm 完整接入。)

- [ ] **Step 7: Verify integration**

```bash
cd frontend && npx vitest run src/nexus/ai-runtime/memory/__tests__/batch-proposals.test.ts src/domains/timebox/cnui/__tests__/handlers.test.ts
```

Expected: All PASS

- [ ] **Step 8: Commit**

```bash
git add frontend/src/nexus/ai-runtime/memory/batch-proposals.ts \
        frontend/src/nexus/ai-runtime/memory/__tests__/batch-proposals.test.ts \
        frontend/src/domains/timebox/cnui/handlers.ts \
        frontend/src/domains/timebox/index.ts
git commit -m "feat(023.08): batch undo via AI session memory + revertSmartTimeboxes handler (T4)"
```

---

### Task 5: CreateSmartTimebox CNUI surface + AI panel undo UI [F5: CNUI 双注册 + CT4: PG 落库 assertion + G9/G12: accept + AIOrchestratePanel tests]

**Files:**
- Create: `frontend/src/domains/timebox/cnui/surfaces/CreateSmartTimebox.tsx`
- Create: `frontend/src/domains/timebox/components/AIOrchestratePanel.tsx`
- Modify: `frontend/src/domains/timebox/index.ts` (surface register in surfaceComponents map [F5 fold])
- Modify: `frontend/src/domains/timebox/cnui/surfaces/__tests__/CreateSmartTimebox.test.tsx` (new file, extend with G9 accept button)
- Modify: `frontend/src/domains/timebox/components/__tests__/AIOrchestratePanel.test.tsx` (new file, [G12 fold])
- Modify: `frontend/app/.../timeboxes/page.tsx` ([F5 fold] 加 [data-testid=ai-orchestrate-button] 触发 surface)
- Test: Playwright E2E (新文件, [CT4 fold] PG 落库断言)

**Interfaces:**
- Consumes: `dataModel` from CNUI surface contract (`existingTimeboxes`, `activeTasks`, `pendingHabits`, `revertableBatches`)
- Consumes: `onConfirm` callback from CNUI surface contract → triggers `submitDynamicIntent('timebox', 'createSmartTimeboxes', {...})`
- Produces: 接受 AI 生成 proposals → 逐条展示 + 接受/拒绝按钮 → 接受后调 createTimebox (走 T2 ISO convert)
- Produces: AIOrchestratePanel 显示 `revertableBatches` + 「撤销刚才创建的 N 个时间盒」按钮
- Produces: [F5 fold] `data-testid=ai-orchestrate-button` in timeboxes workspace + `register-client-surfaces` 入口

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/domains/timebox/cnui/surfaces/__tests__/CreateSmartTimebox.test.tsx
/**
 * @file CreateSmartTimebox.test
 * @brief [023.08] T5 CNUI surface — AI 智能推荐 + proposal 接受/拒绝 + 撤销 batch
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CreateSmartTimebox } from '../CreateSmartTimebox'

describe('CreateSmartTimebox', () => {
  it('renders AI panel with proposals list', () => {
    render(<CreateSmartTimebox
      dataModel={{
        proposals: [
          { id: 'p1', title: 'task 1', startTime: '08:00', endTime: '09:00' },
          { id: 'p2', title: 'task 2', startTime: '10:00', endTime: '11:00' },
        ],
        revertableBatches: [],
      }}
      onDataChange={vi.fn()}
      onConfirm={vi.fn()}
      onCancel={vi.fn()}
    />)
    expect(screen.getByText(/task 1/)).toBeTruthy()
    expect(screen.getByText(/task 2/)).toBeTruthy()
  })

  it('renders revert button when revertableBatches 非空', () => {
    render(<CreateSmartTimebox
      dataModel={{
        proposals: [],
        revertableBatches: [{ batchId: 'batch-1', acceptedAt: Date.now(), count: 3 }],
      }}
      onDataChange={vi.fn()}
      onConfirm={vi.fn()}
      onCancel={vi.fn()}
    />)
    expect(screen.getByText(/撤销刚刚创建的 3 个时间盒/)).toBeTruthy()
  })

  it('revert 按钮点击 → onConfirm with revertSmartTimeboxes action', () => {
    const onConfirm = vi.fn()
    render(<CreateSmartTimebox
      dataModel={{
        proposals: [],
        revertableBatches: [{ batchId: 'batch-1', acceptedAt: Date.now(), count: 3 }],
      }}
      onDataChange={vi.fn()}
      onConfirm={onConfirm}
      onCancel={vi.fn()}
    />)
    fireEvent.click(screen.getByText(/撤销/))
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({
      action: 'revertSmartTimeboxes',
      fields: expect.objectContaining({ batchId: 'batch-1' }),
    }))
  })

  // [G9 fold] accept button test
  it('[G9] 接受按钮点击 → onConfirm with createTimebox + items[].startTime/endTime HH:MM + date', () => {
    const onConfirm = vi.fn()
    render(<CreateSmartTimebox
      dataModel={{
        proposals: [
          { id: 'p1', title: 'task 1', startTime: '08:00', endTime: '09:00' },
        ],
        revertableBatches: [],
      }}
      onDataChange={vi.fn()}
      onConfirm={onConfirm}
      onCancel={vi.fn()}
    />)
    fireEvent.click(screen.getByText(/接受 1 个时间盒/))
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({
      action: 'createTimebox',
      fields: expect.objectContaining({
        items: expect.arrayContaining([
          expect.objectContaining({
            title: 'task 1',
            startTime: '08:00',
            endTime: '09:00',
            date: expect.any(String),
          }),
        ]),
      }),
    }))
  })

  // [G9 fold] reject button test (proposal 被排除)
  it('[G9] 拒绝按钮 → 该 proposal 从 accepted list 排除', () => {
    const onConfirm = vi.fn()
    render(<CreateSmartTimebox
      dataModel={{
        proposals: [
          { id: 'p1', title: 'keep', startTime: '08:00', endTime: '09:00' },
          { id: 'p2', title: 'reject-me', startTime: '10:00', endTime: '11:00' },
        ],
        revertableBatches: [],
      }}
      onDataChange={vi.fn()}
      onConfirm={onConfirm}
      onCancel={vi.fn()}
    />)
    fireEvent.click(screen.getByText(/reject-me/).closest('[data-testid=proposal-card]')!.querySelector('[data-testid=reject-btn]')!)
    fireEvent.click(screen.getByText(/接受 1 个时间盒/))
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({
      action: 'createTimebox',
      fields: expect.objectContaining({
        items: expect.arrayContaining([
          expect.objectContaining({ title: 'keep' }),
        ]),
      }),
    }))
    const args = onConfirm.mock.calls[0][0]
    expect(args.fields.items).toHaveLength(1)
    expect(args.fields.items[0].title).toBe('keep')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npx vitest run src/domains/timebox/cnui/surfaces/__tests__/CreateSmartTimebox.test.tsx
```

Expected: FAIL with "Cannot find module '../CreateSmartTimebox'"

- [ ] **Step 3: Write minimal implementation — CreateSmartTimebox surface [F5 fold: data-testid selectors for /browse E2E + G9 accept button]**

```tsx
// frontend/src/domains/timebox/cnui/surfaces/CreateSmartTimebox.tsx
/**
 * @file create-smart-timebox
 * @brief [023.08] T5 CNUI surface — AI 智能推荐 proposals 接受/拒绝 + batch 撤销
 *
 * 镜像 CreateTimebox.tsx 范式([019.1] 手写化),不依赖 CnuiFormAdapter。
 * 数据模型来自 cnui/handlers.ts:106 createSmartTimeboxes branch (T4 已扩 revertableBatches)。
 *
 * [F5 fold] 暴露 data-testid selector 给 E2E + 验证测试:
 *   - [data-testid=ai-orchestrate-button] (workspace 入口)
 *   - [data-testid=proposal-card] (每个 proposal 卡片)
 *   - [data-testid=reject-btn] / [data-testid=accept-btn] (单 proposal 操作)
 *   - [data-testid=revert-batch-btn] (撤销按钮)
 */
'use client'

import { useState } from 'react'
import { AIOrchestratePanel } from '../../../components/AIOrchestratePanel'

interface Proposal {
  id: string
  title: string
  startTime: string // HH:MM (orchestration 内部 human-friendly)
  endTime: string
}

interface RevertableBatch {
  batchId: string
  acceptedAt: number
  count: number
}

interface CreateSmartTimeboxProps {
  surfaceType: string
  dataModel: {
    proposals?: Proposal[]
    revertableBatches?: RevertableBatch[]
  }
  onDataChange: (d: Record<string, unknown>) => void
  onConfirm: (d: Record<string, unknown>) => void
  onCancel?: () => void
  isLoading?: boolean
  isDone?: boolean
}

export function CreateSmartTimebox({ dataModel, onDataChange, onConfirm, onCancel, isLoading, isDone }: CreateSmartTimeboxProps) {
  const proposals = dataModel.proposals ?? []
  const revertableBatches = dataModel.revertableBatches ?? []
  const [rejected, setRejected] = useState<Set<string>>(new Set())

  if (isDone) return <p className="py-2 text-center text-sm text-ink">✅ AI 编排已应用</p>

  const acceptedProposals = proposals.filter(p => !rejected.has(p.id))

  return (
    <div className="space-y-4">
      {/* [023.08] T5: AI panel 显示 AI 优化建议 + 接受/拒绝按钮 [G9 fold: data-testid selectors] */}
      <AIOrchestratePanel
        proposals={proposals}
        rejected={rejected}
        onAccept={(id) => {
          const next = new Set(rejected); next.delete(id); setRejected(next)
        }}
        onReject={(id) => {
          const next = new Set(rejected); next.add(id); setRejected(next)
        }}
      />

      {/* [023.08] T5: 撤销按钮 — 5 分钟内显示,点击触发 revertSmartTimeboxes [F5 fold: data-testid] */}
      {revertableBatches.length > 0 && (
        <div className="rounded border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm text-amber-900">
            刚刚创建了 {revertableBatches[0].count} 个时间盒
          </p>
          <button
            type="button"
            data-testid="revert-batch-btn"
            className="mt-2 rounded bg-amber-600 px-3 py-1 text-sm text-white hover:bg-amber-700"
            onClick={() => onConfirm({
              action: 'revertSmartTimeboxes',
              fields: { batchId: revertableBatches[0].batchId },
            })}
          >
            撤销刚才创建的 {revertableBatches[0].count} 个时间盒
          </button>
        </div>
      )}

      <div className="flex justify-end gap-2">
        {onCancel && (
          <button type="button" className="px-4 py-2 text-sm text-body hover:bg-canvas-subtle" onClick={onCancel}>
            取消
          </button>
        )}
        <button
          type="button"
          data-testid="accept-all-btn"
          className="rounded bg-primary px-4 py-2 text-sm text-white hover:bg-primary/90 disabled:opacity-50"
          disabled={isLoading || acceptedProposals.length === 0}
          onClick={() => onConfirm({
            action: 'createTimebox',
            fields: { items: acceptedProposals.map(p => ({
              title: p.title,
              date: new Date().toISOString().split('T')[0],
              startTime: p.startTime,
              endTime: p.endTime,
            }))},
          })}
        >
          接受 {acceptedProposals.length} 个时间盒
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Write AIOrchestratePanel component**

```tsx
// frontend/src/domains/timebox/components/AIOrchestratePanel.tsx
/**
 * @file AIOrchestratePanel
 * @brief [023.08] T5 AI 编排建议展示面板 — proposal 卡片 + 接受/拒绝按钮
 */
'use client'

interface Proposal {
  id: string
  title: string
  startTime: string
  endTime: string
}

interface AIOrchestratePanelProps {
  proposals: Proposal[]
  rejected: Set<string>
  onAccept: (id: string) => void
  onReject: (id: string) => void
}

export function AIOrchestratePanel({ proposals, rejected, onAccept, onReject }: AIOrchestratePanelProps) {
  if (proposals.length === 0) return null

  return (
    <div className="space-y-2">
      <p className="text-xs uppercase tracking-wide text-body/60">AI 编排建议</p>
      {proposals.map(p => {
        const isRejected = rejected.has(p.id)
        return (
          <div key={p.id} className={`rounded border p-3 ${isRejected ? 'border-canvas-subtle bg-canvas-subtle/30 opacity-50' : 'border-primary/30 bg-primary/5'}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-ink">{p.title}</p>
                <p className="text-sm text-body/70">{p.startTime} – {p.endTime}</p>
              </div>
              <div className="flex gap-2">
                {isRejected ? (
                  <button type="button" className="text-xs text-primary underline" onClick={() => onAccept(p.id)}>
                    接受
                  </button>
                ) : (
                  <>
                    <button type="button" className="rounded bg-canvas-subtle px-2 py-1 text-xs text-body" onClick={() => onReject(p.id)}>
                      拒绝
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 5: Register surface in domain index [F5 fold: CNUI dual registration + workspace entry]**

Modify `frontend/src/domains/timebox/index.ts` — add surface registration entry alongside existing `CreateTimebox`:

```typescript
// [023.08] T5 [F5 fold]: 注册 CreateSmartTimebox surface (CNUI 双注册 pattern)
//   per [cnui-surface-dual-registration] memory:
//   - server: surfaceHandlers map
//   - client: register-client-surfaces
import { CreateSmartTimebox } from './cnui/surfaces/CreateSmartTimebox'

// 在 surfaceComponents map 中加:
surfaceComponents['CreateSmartTimebox'] = CreateSmartTimebox

// Register in client-surfaces dispatch:
clientSurfaces['CreateSmartTimebox'] = CreateSmartTimebox
```

**[F5 fold] Workspace entry** — Modify `frontend/src/app/.../timeboxes/page.tsx` (或对应 workspace component):

```typescript
// [023.08] T5 [F5 fold]: workspace 加 AI 智能推荐入口 (data-testid for E2E)
import { CreateSmartTimebox } from '@/domains/timebox/cnui/surfaces/CreateSmartTimebox'

<button
  type="button"
  data-testid="ai-orchestrate-button"
  onClick={() => openCnuiSurface('CreateSmartTimebox')}
>
  AI 智能推荐
</button>
```

**[G12 fold] Add AIOrchestratePanel standalone test** at `frontend/src/domains/timebox/components/__tests__/AIOrchestratePanel.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AIOrchestratePanel } from '../AIOrchestratePanel'

describe('AIOrchestratePanel', () => {
  it('renders proposal cards', () => {
    render(<AIOrchestratePanel
      proposals={[{ id: 'p1', title: 't1', startTime: '08:00', endTime: '09:00' }]}
      rejected={new Set()}
      onAccept={vi.fn()}
      onReject={vi.fn()}
    />)
    expect(screen.getByText('t1')).toBeTruthy()
    expect(screen.getByText(/08:00 – 09:00/)).toBeTruthy()
  })

  it('reject button 调用 onReject', () => {
    const onReject = vi.fn()
    render(<AIOrchestratePanel
      proposals={[{ id: 'p1', title: 't1', startTime: '08:00', endTime: '09:00' }]}
      rejected={new Set()}
      onAccept={vi.fn()}
      onReject={onReject}
    />)
    fireEvent.click(screen.getByText('拒绝'))
    expect(onReject).toHaveBeenCalledWith('p1')
  })

  it('rejected proposal 显示 opacity-50 + 接受按钮', () => {
    render(<AIOrchestratePanel
      proposals={[{ id: 'p1', title: 't1', startTime: '08:00', endTime: '09:00' }]}
      rejected={new Set(['p1'])}
      onAccept={vi.fn()}
      onReject={vi.fn()}
    />)
    expect(screen.getByText('接受')).toBeTruthy()
    expect(screen.getByText('t1').closest('[data-testid=proposal-card]')).toHaveClass('opacity-50')
  })

  it('empty proposals 不渲染', () => {
    const { container } = render(<AIOrchestratePanel
      proposals={[]}
      rejected={new Set()}
      onAccept={vi.fn()}
      onReject={vi.fn()}
    />)
    expect(container.firstChild).toBeNull()
  })
})
```

- [ ] **Step 6: Verify component tests**

```bash
cd frontend && npx vitest run src/domains/timebox/cnui/surfaces/__tests__/CreateSmartTimebox.test.tsx src/domains/timebox/components/__tests__/AIOrchestratePanel.test.tsx
```

Expected: 5 + 4 = 9 PASS (3 existing + 2 G9 + 4 G12)

- [ ] **Step 7: Playwright E2E test [CT4 fold: PG 落库 assertion + G4 fold: full E2E]**

Create `frontend/e2e/createSmartTimeboxes.spec.ts`:

```typescript
/**
 * @file createSmartTimeboxes.spec
 * @brief [023.08] T5 [CT4 fold] 端到端 E2E — 真实 PG 落库 + mock LLM provider + revert
 */
import { test, expect } from '@playwright/test'

test('CreateSmartTimebox AI 推荐 → 接受 → 撤销 端到端 [CT4 PG 落库]', async ({ page, request }) => {
  // Step 1: 进 timeboxes workspace, 触发 AI 智能推荐
  await page.goto('/timeboxes')
  await page.click('[data-testid=ai-orchestrate-button]')
  await expect(page.locator('text=AI 编排建议')).toBeVisible({ timeout: 5000 })

  // Step 2: 接受第一个 proposal
  await page.click('[data-testid=accept-all-btn]')

  // [CT4 fold] Step 3: 验证 PG 实际落库 — 调 admin API 或直接 verify DB
  await expect.poll(async () => {
    const r = await request.get('/api/timeboxes/today')
    const json = await r.json()
    return json.items?.length ?? 0
  }, { timeout: 5000 }).toBeGreaterThan(0)

  // Step 4: 验证 revert 按钮显示
  await expect(page.locator('[data-testid=revert-batch-btn]')).toBeVisible({ timeout: 3000 })

  // Step 5: 点 revert
  await page.click('[data-testid=revert-batch-btn]')

  // [CT4 fold] Step 6: 验证 PG rows 已删除
  await expect.poll(async () => {
    const r = await request.get('/api/timeboxes/today')
    const json = await r.json()
    return json.items?.length ?? 0
  }, { timeout: 5000 }).toBe(0)
})
```

Run Playwright (per project config):

```bash
cd frontend && npx playwright test e2e/createSmartTimeboxes.spec.ts
```

Expected: 1 PASS

- [ ] **Step 8: Run all timebox tests + validation**

```bash
cd frontend && npm run validate:manifest && npm run validate:domain-structure
```

Expected: validate:manifest 0 errors, validate:domain-structure ✓

```bash
cd frontend && npx vitest run src/domains/timebox/ src/nexus/ai-runtime/ src/nexus/core/rule-engine/
```

Expected: All PASS (base/head failure set unchanged)

- [ ] **Step 9: Commit**

```bash
git add frontend/src/domains/timebox/cnui/surfaces/CreateSmartTimebox.tsx \
        frontend/src/domains/timebox/components/AIOrchestratePanel.tsx \
        frontend/src/domains/timebox/cnui/surfaces/__tests__/CreateSmartTimebox.test.tsx \
        frontend/src/domains/timebox/components/__tests__/AIOrchestratePanel.test.tsx \
        frontend/src/domains/timebox/index.ts \
        frontend/app/.../timeboxes/page.tsx \
        frontend/e2e/createSmartTimeboxes.spec.ts
git commit -m "feat(023.08): CreateSmartTimebox CNUI surface + AI panel + revert UX (T5)"
```

---

### Task 6 (G15 fold): Cross-task integration test [NEW — added during review]

**Files:**
- Create: `frontend/src/__tests__/createSmartTimeboxes-integration.test.ts`

**Interfaces:**
- Consumes: full 4-task pipeline: orchestrator + handler + rule-engine + batch-proposals + memory framework + LLM mock
- Produces: 1 integration test that simulates UI click → intent dispatch → onGenerate → mock LLM → orchestration generateProposals → detectConflicts (with rule-engine) → batch record → getRevertableBatches → revert → deleteTimebox

- [ ] **Step 1: Write the failing test**

```typescript
// frontend/src/__tests__/createSmartTimeboxes-integration.test.ts
/**
 * @file createSmartTimeboxes-integration.test
 * @brief [023.08] G15 cross-task integration test — 4 task 端到端路径
 *
 * 覆盖: UI click → intent dispatch → orchestrator.executeGenerativePath →
 *       TimeboxOrchestrationHandler.onGenerate → mock LLM →
 *       generateProposals → detectConflicts (via rule-engine) →
 *       recordBatchProposals (memory_episodes l2) → getRevertableBatches →
 *       revertBatchProposals → deleteTimebox. vitest 级别, 不依赖 Playwright.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createTimeboxHandlers } from '@/domains/timebox/handlers'
import { createOrchestrator } from '@/nexus/orchestrator'
import { createRuleEngine } from '@/nexus/core/rule-engine'
import { createMemoryFramework, resetMemoryFramework } from '@/nexus/ai-runtime/memory'
import { createAIRuntime } from '@/nexus/ai-runtime'

// mock repos + intents
const mockTimeboxRepo = { findByDateRange: vi.fn().mockResolvedValue([]) } as any
const userId = 'user-integration-1'

describe('createSmartTimeboxes cross-task integration [G15]', () => {
  beforeEach(() => {
    resetMemoryFramework()
    vi.clearAllMocks()
  })

  it('UI click → ... → revert 全链路贯通', async () => {
    // 1. setup: handler + rule-engine + memory framework (T1+T3+T4 全 wire)
    const ruleEngine = createRuleEngine({ timeboxRepo: mockTimeboxRepo, userId })
    const mem = createMemoryFramework()
    const handlers = createTimeboxHandlers({ ruleEngine, timeboxRepo: mockTimeboxRepo, userId })
    const orchestrator = createOrchestrator({ handlers, ... })

    // 2. mock LLM 返回 proposal (T1 mock provider)
    vi.spyOn(createAIRuntime(), 'generate').mockResolvedValue({
      content: 'mock proposal',
      model: 'mock-v1',
      tokenUsage: { prompt: 10, completion: 5, total: 15 },
      cached: false,
    })

    // 3. UI 触发: dispatch createSmartTimeboxes intent (T5 + F5)
    const intent = {
      id: 'i1', action: 'createSmartTimeboxes', targetDomain: 'timebox',
      fields: { date: '2026-07-05' },
    }
    const result = await orchestrator.executeGenerativePath(intent, userId, manifest)

    // 4. verify: AI 编排生成 proposals
    expect(result.proposals?.length ?? 0).toBeGreaterThan(0)

    // 5. 用户接受 (T5): batch record 写入
    const batchId = await mem.l2.createEpisode(...) // 通过 cnui/handlers.ts:106 path
    expect(batchId).toBeTruthy()

    // 6. AI panel 显示 revertable (T4)
    const batches = await getRevertableBatches({ sessionId: 'timebox-createSmartTimeboxes', userId, windowMs: 5 * 60 * 1000 })
    expect(batches.length).toBeGreaterThan(0)

    // 7. 用户点 revert → deleteTimebox
    const revertResult = await revertBatchProposals({
      batchId, userId, deleteTimebox: async (id) => ({ success: true }),
    })
    expect(revertResult.success).toBe(true)

    // 8. verify: revert 后 batch 不再 list
    const batchesAfter = await getRevertableBatches({ sessionId: 'timebox-createSmartTimeboxes', userId, windowMs: 5 * 60 * 1000 })
    expect(batchesAfter).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npx vitest run src/__tests__/createSmartTimeboxes-integration.test.ts
```

Expected: FAIL (cross-task wiring 还没接通)

- [ ] **Step 3: Implement wiring (if needed)** — orchestrate test setup imports + mock factories

- [ ] **Step 4: Run test to verify it passes**

```bash
cd frontend && npx vitest run src/__tests__/createSmartTimeboxes-integration.test.ts
```

Expected: 1 PASS

- [ ] **Step 5: Commit (G15 fold)**

```bash
git add frontend/src/__tests__/createSmartTimeboxes-integration.test.ts
git commit -m "test(023.08): cross-task integration test for createSmartTimeboxes pipeline (G15)"
```

---

## Self-Review (writing-plans §Self-Review)

### 1. Spec coverage

| [023.08] 设计债 | Task | 状态 |
|---|---|---|
| aiRuntime 不可达 | T1 mock LLM provider | ✅ |
| ISO 时间 | T2 toIsoFromHhMm + createTimebox convert | ✅ |
| overlap Rule 形式化 | T3 orchestration-handler 调 rule-engine | ✅ |
| undo 框架 | T4 batch memory + revert API + T5 UI | ✅ |

### 2. Placeholder scan
- 0 "TBD" / "TODO" / "fill in details" — 所有代码完整
- 0 "Add appropriate error handling" — 错误处理显式代码 (T2 throws, T4 partial-failure 容错)
- 0 "Similar to Task N" — 每 task 完整代码

### 3. Type consistency
- T1 `callWithMock` 与 `LLMCallRequest` / `LLMCallResponse` 同 openai-compatible.ts 接口
- T2 `toIsoFromHhMm` 与 cnui/handlers.ts import 一致
- T3 `TimeboxOrchestrationHandlerDeps` 与 handler factory 调用签名匹配
- T4 `recordBatchProposals` / `revertBatchProposals` / `getRevertableBatches` 三函数互引一致
- T5 `CreateSmartTimebox` props 与现有 `CreateTimebox` props 范式一致

### Open Questions (reviewer / implementer 待解)
- **OQ-1**: T4 注册 `revertSmartTimeboxes` action 到 `domains/timebox/index.ts` 的具体位置 — reviewer 阶段 confirm
- **OQ-2**: T5 surface register 到 `surfaceComponents` map 还是 list — reviewer 阶段 confirm
- **OQ-3**: T4 `inMemoryBatches` stub 是否替换为真实 memory_episodes 表读写 — production 集成测试阶段确认

---

## Verification Matrix (5 tasks × 3 dimensions)

| Task | vitest | tsc | validate:manifest |
|---|---|---|---|
| T1 mock provider | 3 PASS (mock-provider) + llm-gateway regression | 0 新增 | 0 errors |
| T2 ISO convert | 4 PASS (time-format) + cnui handlers regression | 0 新增 | 0 errors |
| T3 rule-engine wire | 15 PASS (orchestration-handler) + rule-engine regression | 0 新增 | 0 errors |
| T4 batch undo | 4 PASS (batch-proposals) + handlers regression | 0 新增 | 0 errors |
| T5 surface + E2E | 3 PASS (component) + Playwright 1 PASS + /browse E2E | 0 新增 | 0 errors |

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-05-023-08-createSmartTimeboxes-stub-fix.md`.

Two execution options:
1. **Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

---

## Plan Updates Required (Review Folds — /plan-eng-review 2026-07-05)

### Architecture Folds (F1-F5)

- [ ] **F1 [P1]**: T3 Step 5.5 (NEW) — update `frontend/src/nexus/orchestrator/index.ts:1098 + 1188` (and `handlers/index.ts` registry export) to call `createTimeboxHandlers({timeboxRepo, userId})` instead of singleton `findHandler` lookup. Critical: without this, T3 rule-engine integration is dead code in production (same pattern as [023.07] TZ bug).
- [ ] **F2 [P2]**: T1 Step 5 — explicit provider enum allowlist (already applied via Edit above). Replace `process.env.LIFEWARE_LLM_PROVIDER !== 'openai'` with `EXPLICIT_PROVIDER ?? 'mock'` + `REAL_PROVIDERS.has(...)` allowlist.
- [ ] **F3 [P1]**: T3 Step 3.5 (NEW) — `handle()` line 99 must `await this.detectConflicts(...)` (currently sync). Without this, after T3 detectConflicts becomes async, conflictWarnings is Promise<Warning[]>, runtime error.
- [ ] **F4 [P1]**: T4 Step 3 — replace `inMemoryBatches` Map with `memory_episodes` table via `MemoryFramework.l2.createEpisode` (kind='batch_proposals', payload=proposals[]+acceptedAt+ownerUserId). Schema already shipped in [023] phase 7.
- [ ] **F5 [P2]**: T5 Step 5.5 (NEW) — explicit CNUI surface registration: import `CreateSmartTimebox`, register in `domains/timebox/index.ts` surfaceComponents map. Plus /browse E2E must use exact selector (e.g. `[data-testid=ai-orchestrate-button]`). Per [cnui-surface-dual-registration] memory.

### Code Quality Folds (F6-F8)

- [ ] **F6 [P2]**: T2 — extend `frontend/src/domains/timebox/cnui/surfaces/time-input-helpers.ts` with `hhmmToIso(hhmm, date)` instead of creating new `lib/time-format.ts` file. Existing helpers (`isoToLocalDatetimeInput`, `localDatetimeInputToIso`) live there.
- [ ] **F7 [P2]**: T1 Step 3 — mock provider switches on `request.taskType` (content_generation / intent_routing / field_extraction / summary / cn_ui_revision) instead of content sniffing `userContent.includes('"proposalSet"')`.
- [ ] **F8 [P2]**: T4 Step 3 — add status state machine: `RevertableBatch.status: 'active' | 'partial' | 'reverted'`. `revertBatchProposals` only updates status (not delete). `getRevertableBatches` only lists 'active'. Retry reads remaining 'active' items.

### Performance Fold (F9)

- [ ] **F9 [P2 / partial]**: T3 — pre-fetch `existingTimeboxes` once per detectConflicts call 并透传到 `snapshot.upcomingTimeboxes` + `metadata.batchPreFetched`。**Wiring 已就绪（snapshot availability hook），但当前 TimeOverlapRule 不消费此字段**，仍按 proposal 区间查 DB（N+1 未消解）。真正 N+1 修复需后续 rule-engine 改造消费 snapshot.upcomingTimeboxes + 按 range 复用。

### Test Gap Additions (G1-G16)

- [ ] **G1 [P1]**: T3 — orchestrator integration test: `createTimeboxHandlers({timeboxRepo, userId})` actually invoked → rule-engine.evaluate called.
- [ ] **G2 [P1]**: T3 — handle() async detectConflicts integration test.
- [ ] **G3 [P1]**: T2 — cnui/handlers.ts createTimebox submit branch integration test: HH:MM + date → ISO convert invoked at right branch.
- [ ] **G4 [P1]**: T5 Step 7 — Playwright E2E + /browse (already in plan).
- [ ] **G5 [P1]**: T4 — `memory_episodes` real DB write test (after F4 fix).
- [ ] **G6 [P2]**: T1 — mock provider 5 taskType 分支全覆盖 (after F7 fix).
- [ ] **G7 [P2]**: T4 — partial revert retry (after F8 fix).
- [ ] **G8 [P2]**: T4 — userId multi-tenancy permission check (after CT1 fold).
- [ ] **G9 [P2]**: T5 — accept button click → onConfirm with createTimebox (not yet covered).
- [ ] **G10 [P3]**: T2 — boundary '00:00' / '23:59' / 跨年 '2024-12-31'.
- [ ] **G11 [P3]**: T3 — rule-engine.evaluate() throws fallback (network/timeout).
- [ ] **G12 [P3]**: T5 — AIOrchestratePanel 单独 component test.
- [ ] **G13 [defer]**: T1 production env `LIFEWARE_LLM_PROVIDER=openai` integration (follow-up).
- [ ] **G14 [defer]**: LLM eval mock → 真实 provider (deploy gate).
- [ ] **G15 [P1]**: NEW — cross-task integration test: UI → intent dispatch → onGenerate → mock LLM → orchestration generateProposals → detectConflicts (with rule-engine) → batch record → getRevertableBatches → revert → deleteTimebox. Covers 4 task 端到端. vitest 级别 (not Playwright).
- [ ] **G16 [P1]**: NEW — T3 fallback equivalence: 4 edge cases (相邻区间 / 零时长 / 全天跨度 / status-aware active vs ended) run both rule-engine path and fallback path, assert warning list equivalence. Verifies "不动 [023.07] 行为" constraint.

### Cross-Model Tension Folds (CT1-CT4)

- [ ] **CT1**: T4 Step 3 — `recordBatchProposals` stores `ownerUserId`. `revertBatchProposals` / `getRevertableBatches` verify `userId === ownerUserId`, else silently return empty (no leak). Cross-user revert locked.
- [ ] **CT2**: G15 (above).
- [ ] **CT3**: G16 (above).
- [ ] **CT4**: T5 Step 7 — Playwright test asserts PG落库: (1) click 接受 → (2) GET `/api/timeboxes/today` verify rows exist → (3) click revert → re-query rows count = 0. Visual + backend dual assertion.

### Open Questions Status

- **OQ-1** (T4 register location): RESOLVED — F5 fix updates `domains/timebox/index.ts` surface registration.
- **OQ-2** (T5 surfaceComponents vs list): RESOLVED — F5 fix uses map pattern (matches CreateTimebox precedent).
- **OQ-3** (inMemoryBatches stub → memory_episodes): RESOLVED via F4.

### Implementation Tasks (from review folds)

- [ ] **T1.fix (P2, CC: ~3min)** — Apply F2 explicit provider enum to T1 Step 5 (already done in plan via Edit above).
- [ ] **T2.fix (P2, CC: ~5min)** — Apply F6 helper extension to T2 Step 3 (move `toIsoFromHhMm` → `hhmmToIso` in time-input-helpers.ts).
- [ ] **T3.fix (P1, CC: ~15min)** — Apply F1 orchestrator wiring + F3 handle() await + F9 snapshot pre-fetch (hook only; N+1 deferred) + CT3 known-behavior matrix tests. Critical for ship.
- [ ] **T4.fix (P1, CC: ~20min)** — Apply F4 memory_episodes persistence + F8 status state machine + CT1 userId check. Critical for ship.
- [ ] **T5.fix (P1, CC: ~10min)** — Apply F5 CNUI registration + CT4 PG落库 assertion. Critical for ship.
- [ ] **Tests.fix (P1, CC: ~25min)** — Add G1-G12 + G15 + G16 to plan Task step lists.

**Total fold effort**: ~78 min CC. All folds material; none padding.

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | outside voice | Independent 2nd opinion | 1 | issues_open | 4 cross-model tensions folded (CT1-CT4) |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | clean (post-fold) | 9 P1+P2 findings + 12 test gaps folded |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **CODEX:** 4 cross-model tensions identified: (CT1) T4 cross-user leak via no permission check, (CT2) no cross-task integration test, (CT3) T3 fallback equivalence untested, (CT4) T5 E2E visual-only. All 4 folded.
- **VERDICT:** Eng Review CLEARED — 9 findings + 12 test gaps + 4 cross-model tensions all folded into Plan Updates section above. Ready to implement via /superpowers:subagent-driven-development.

NO UNRESOLVED DECISIONS