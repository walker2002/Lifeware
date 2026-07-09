# [026.02.4] TD-022 5 items + TD-028 5 sites + EditAppointment cast 修复 — 设计

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 1 PR ship-ready，关闭 TD-022 5 items（archetype clearing 真实 UX bug + 4 项次要）+ TD-028 5 sites（timebox 'running' JS 层 drift + repository Site 0 root source）+ EditAppointment.tsx:32 cast 透明性。Appoinment 域 + timebox 域混合 scope。

**Architecture:** 6 SDD tasks（T1-T6），逐 task 独立 commit + 独立 vitest 验证 + tsc 0 新增。whole-branch review 后 ff-merge main + push gitee（项目既定模式）。Post-ship second-opinion（Opus）抓 whole-branch review 漏的 drift（沿用 [[feedback_post-ship-review-meta-pattern]] 模式）。

**Tech Stack:** Next.js 16.1.6 / React 19.2.3 / TypeScript 5 / Drizzle ORM 0.45.1 / PostgreSQL。vitest + tsc 双验证。pre-push hooks（validate:manifest + validate:structure + validate:rules-registry）。

---

## Global Constraints

1. **Scope 锁死**:1 PR ship-ready，包含 TD-022 5 items + TD-028 5 sites + EditAppointment cast。不拆 2 PR（用户已确认）。
2. **TD-022 #6 3-state 语义**:`undefined` = skip / `null` = clear / `string` = set。三处文件必须协调：AppointmentFormFields picker transform + handlers.ts mapper + updateAppointment server action。任一处塌缩回 2-state 即 bug 复现。
3. **TD-028 修复路径**:Site 0 repository 先重写（status='planned' + startTime<=NOW() + endTime>=NOW()），Sites 1-4 caller 逐个改用 derive-display-status 或内联推导。**不抽 shared helper**（用户已确认，避免额外抽象层）。
4. **Cast 透明性**:`as (AppointmentDraftFields & { status: string })[]` → `as AppointmentDraftFields[]`（已含 `status: AppointmentStatus` literal union）。Lines 32, 36, 42 同步修。
5. **不在 scope**:TD-022 #7 N+1（micro-perf defer），TD-023（timebox 写入口绕过，架构 session），TD-008（lifecycle-configs require 多键域债，架构 session）。
6. **文档同步**:CHANGELOG.md `[026.02.4]` 段 + manifest.md `[026.02.4]` 入口 + TD-028 ledger 关闭 + memory 更新。沿用 [026.02.3.1] 的 "post-ship round 2 修复" 子段模式。
7. **Post-ship 二轮 review**:dispatch Opus 子 agent 重新从 "diff vs codebase reality" 视角审（不沿用 whole-branch reviewer 的 "plan compliance" 视角）。
8. **Verification 必跑**:每 task 后 vitest 局部 + tsc 局部；final 后 vitest baseline=head + tsc 0 新增 + pre-push 3 hooks 全过 + TD-028 grep `'running'` 返回 0 hits（closure proof）。

---

## Task 1: TD-022 #2 + #3 defensive hardening

**Files:**
- Modify: `frontend/src/domains/timebox/cnui/parse-appointments.ts:117` (UUID validation)
- Modify: `frontend/src/domains/timebox/cnui/parse-appointments.ts:128` (newDurationMin validation)
- Modify: `frontend/src/domains/timebox/cnui/parse-appointments.ts:43` (prompt template wording, same file)
- Test: `frontend/src/domains/timebox/cnui/__tests__/parse-appointment.test.ts` (add 2 cases)

**Interfaces:**
- Consumes: existing `parseAppointmentIntent(intent: string): Promise<ParsedIntent>`
- Produces: same signature, but `kind: 'unsure'` + reason for invalid UUID / newDurationMin=0

**Changes:**

1. Add UUID v4 regex check before `candidates.find(c => c.id === parsed.appointmentId)`:
   ```ts
   const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
   if (parsed.appointmentId && !UUID_V4.test(parsed.appointmentId)) {
     return { kind: 'unsure', reason: '候选 appointmentId 不是合法 UUID v4' }
   }
   ```

2. Add newDurationMin validation:
   ```ts
   if (parsed.newDurationMin !== undefined) {
     if (typeof parsed.newDurationMin !== 'number' || !Number.isFinite(parsed.newDurationMin) || parsed.newDurationMin <= 0) {
       return { kind: 'unsure', reason: '新时长必须 > 0;留空表示不修改' }
     }
   }
   ```
   Treat `null` as `undefined` (no-change).

3. Prompt template wording: change "新时长分钟数或 0" → "新时长(数字必须>0;留空表示不修改)"

**Test cases:**
```ts
it('rejects non-UUID candidate appointmentId', async () => {
  const result = await parseAppointmentIntent({ ...validIntent, appointmentId: 'not-a-uuid' })
  expect(result.kind).toBe('unsure')
  expect(result.reason).toMatch(/UUID v4/)
})

it('rejects newDurationMin=0', async () => {
  const result = await parseAppointmentIntent({ ...validIntent, newDurationMin: 0 })
  expect(result.kind).toBe('unsure')
  expect(result.reason).toMatch(/> 0/)
})
```

---

## Task 2: TD-022 #6 archetype clearing 3-state（真实 UX bug）

**Files:**
- Modify: `frontend/src/domains/timebox/cnui/surfaces/AppointmentFormFields.tsx:117-121` (picker transform)
- Modify: `frontend/src/app/actions/handlers.ts:596, 642` (handler mapper — 3-state semantics)
- Modify: `frontend/src/app/actions/updateAppointment.ts` (server action — write null as SQL NULL)
- Test: `frontend/src/domains/timebox/components/__tests__/edit-appointment.test.tsx` (add 1 integration + 2 sub-cases)

**Interfaces:**
- Consumes: existing `AppointmentFormFieldsProps.onChange: (patch: Partial<AppointmentDraftFields>) => void`
- Produces: `onChange({ activityArchetypeId: string | null | undefined })` — null = explicit clear, undefined = no-change, string = set

**Changes:**

1. `AppointmentFormFields.tsx` picker transform (lines 117-121):
   ```tsx
   // Before: onChange(e => onChange({ activityArchetypeId: e.target.value }))
   // After:
   <Select
     value={draft.activityArchetypeId ?? ''}
     onValueChange={value => {
       if (value === '') {
         onChange({ activityArchetypeId: null })  // explicit clear
       } else {
         onChange({ activityArchetypeId: value })  // string id
       }
     }}
   >
   ```

2. `handlers.ts:596, 642` mapper (3-state semantics):
   ```ts
   // Before: ?(it.activityArchetypeId ? {...} : {})  // collapses all 3 states
   // After:
   activityArchetypeId: it.activityArchetypeId === undefined 
     ? undefined  // skip field, server action's `if (undefined) continue` triggers
     : it.activityArchetypeId,  // string or null passes through
   ```

3. `updateAppointment.ts` server action (JSDoc + logic):
   ```ts
   /**
    * patch field semantics:
    *   undefined = do not modify
    *   null      = explicitly clear (SQL NULL)
    *   value     = set to value
    */
   for (const [field, value] of Object.entries(patch)) {
     if (value === undefined) continue;
     await updateField(column, value);  // null → Drizzle writes SQL NULL
   }
   ```

**Test cases:**
```ts
it('clears archetype on picker clear → DB NULL', async () => {
  setupAppointmentWithArchetype('a-1', 'arch-1')
  render(<EditAppointment ... />)
  await userEvent.click(screen.getByRole('combobox', { name: /activity-archetype/i }))
  await userEvent.click(screen.getByRole('option', { name: /无/ }))
  await userEvent.click(screen.getByRole('button', { name: /save/i }))
  
  expect(mockServerAction).toHaveBeenCalledWith(
    expect.objectContaining({
      patch: expect.objectContaining({ activityArchetypeId: null })
    })
  )
})

it('does not modify archetype when picker unchanged', async () => {
  // patch should NOT contain activityArchetypeId at all
})

it('distinguishes null (clear) from undefined (skip) in handler mapper', () => {
  // unit test the mapper logic
})
```

---

## Task 3: TD-022 #8 banner + EditAppointment cast transparency

**Files:**
- Modify: `frontend/src/domains/timebox/cnui/surfaces/EditAppointment.tsx:32, 36, 42` (cast)
- Modify: `frontend/src/domains/timebox/cnui/surfaces/EditAppointment.tsx:73-76` (banner conditional)
- Test: `frontend/src/domains/timebox/components/__tests__/edit-appointment.test.tsx` (add 1 UI test)

**Interfaces:**
- Consumes: existing `EditAppointmentProps`
- Produces: same props, internal state changes (banner visibility conditional on viewMode)

**Changes:**

1. Cast tightening (lines 32, 36, 42):
   ```tsx
   // Before: const items = (dataModel.items as (AppointmentDraftFields & { status: string })[]) ?? []
   // After:
   const items = (dataModel.items as AppointmentDraftFields[]) ?? []
   
   // Before: const prefill = dataModel.prefill as (AppointmentDraftFields & { status: string }) | undefined
   // After:
   const prefill = dataModel.prefill as AppointmentDraftFields | undefined
   
   // Before: const [draft, setDraft] = useState<(AppointmentDraftFields & { status: string }) | null>(prefill ?? null)
   // After:
   const [draft, setDraft] = useState<AppointmentDraftFields | null>(prefill ?? null)
   ```
   `AppointmentDraftFields['status']` is `AppointmentStatus` (literal union), so the cast becomes more accurate.

2. Banner conditional (lines 73-76):
   ```tsx
   // Before: <Banner>{originalPrompt && `💡 ${originalPrompt}`}</Banner>  // always shown
   // After:
   {viewMode === 'selecting' && originalPrompt && (
     <Banner>💡 {originalPrompt}</Banner>
   )}
   ```

**Test cases:**
```ts
it('shows originalPrompt banner in selecting mode', () => {
  render(<EditAppointment viewMode="selecting" originalPrompt="..." />)
  expect(screen.getByText(/💡/)).toBeInTheDocument()
})

it('hides originalPrompt banner in editing mode', () => {
  render(<EditAppointment viewMode="editing" originalPrompt="..." />)
  expect(screen.queryByText(/💡/)).not.toBeInTheDocument()
})
```

**Verification:**
- `npx tsc --noEmit` — cast change triggers re-type-check on dataModel.items; if items has unexpected status, tsc fails (intended protection)

---

## Task 4: TD-028 Site 0 findRunning rewrite（root source）

**Files:**
- Modify: `frontend/src/domains/timebox/repository/index.ts:48-52` (findRunning method)
- Test: `frontend/src/domains/timebox/__tests__/timebox-repository.test.ts` (add 1 + 1 sub-case)

**Interfaces:**
- Consumes: existing `findRunning(userId: USOM_ID): Promise<Timebox[]>`
- Produces: same signature, returns planned rows where NOW() ∈ [start, end]

**Changes:**

```ts
// Before:
async findRunning(userId: USOM_ID): Promise<Timebox[]> {
  const rows = await db.select().from(s.timeboxes)
    .where(and(eq(s.timeboxes.userId, userId), eq(s.timeboxes.status, 'running')))
  return this.loadWithJunctions(rows)
}

// After:
async findRunning(userId: USOM_ID): Promise<Timebox[]> {
  // [026.02.4] TD-028 Site 0 fix: derive 'running' from planned + time-bounds
  // (matches v_running_timeboxes view predicate + derive-display-status.ts logic)
  const rows = await db.select().from(s.timeboxes)
    .where(and(
      eq(s.timeboxes.userId, userId),
      eq(s.timeboxes.status, 'planned'),
      lte(s.timeboxes.startTime, sql`NOW()`),
      gte(s.timeboxes.endTime, sql`NOW()`),
    ))
  return this.loadWithJunctions(rows)
}
```

Add `sql` and ensure `lte`/`gte` are imported from `drizzle-orm`.

**Test cases:**
```ts
it('findRunning returns planned rows where NOW() ∈ [start, end]', async () => {
  // 5 fixture rows: planned+now, planned+past, planned+future, logged+now, cancelled+now
  // expect: returns only planned+now (1 row)
})

it('findRunning returns [] when no planned rows match', async () => {
  // expect: empty array
})
```

---

## Task 5: TD-028 Sites 1-4 caller updates

**Files:**
- Modify: `frontend/src/app/actions/intent.ts:649-650` (matchTarget)
- Modify: `frontend/src/hooks/use-auto-trigger.ts:53` (auto-trigger logic)
- Modify: `frontend/src/app/actions/timebox.ts:299` (error message ternary)
- Modify: `frontend/src/domains/timebox/__tests__/createSmartTimeboxes-integration.test.ts:116` (fixture)
- Test: 4 separate test files (add 1 case per caller)

**Interfaces:**
- Each caller's signature unchanged; internal logic updated

**Changes:**

1. `intent.ts:649-650` matchTarget — use derive-display-status:
   ```ts
   // Before: target.value === "running" && timeboxes.find(t => t.status === "running")
   // After:
   import { deriveTimeboxDisplayStatus } from '@/domains/timebox/status/derive-display-status'
   
   const matches = target.value === "running" || target.value === "current"
     ? timeboxes.find(t => deriveTimeboxDisplayStatus(t.status, t.startTime, t.endTime, new Date()) === 'running')
     : null
   ```

2. `use-auto-trigger.ts:53` auto-trigger — inline derivation (Option B from Section 3):
   ```ts
   // Before: if (tb.status === "running" && endTime <= now) { ... }
   // After:
   if (tb.status === 'planned' && new Date(tb.endTime) <= now) { ... }
   ```

3. `timebox.ts:299` error message — drop 'running' branch:
   ```ts
   // Before: throw new Error(`该时间盒${tb.status === 'running' ? '进行中' : 'logged' : ...}`)
   // After: drop 'running' branch (always logged or cancelled since no rows have running status post-[023.12])
   ```

4. `createSmartTimeboxes-integration.test.ts:116` fixture:
   ```ts
   // Before: fakeTimeboxStore.values().filter(t => t.status === 'running')
   // After:
   fakeTimeboxStore.values().filter(t => 
     t.status === 'planned' && 
     new Date(t.startTime) <= new Date() && 
     new Date(t.endTime) >= new Date()
   )
   ```

**Test cases:** one per caller (4 cases total).

---

## Task 6: docs sync + ship

**Files:**
- Modify: `CHANGELOG.md` (new `[026.02.4]` section)
- Modify: `manifest.md` (new `[026.02.4]` entry)
- Modify: `docs/tech-debt/TD-028-timebox-stale-status-running-literals.md` (mark closed, set status=已修复)
- Modify: `docs/tech-debt/README.md` (move TD-028 to 已修复 table)
- Modify: `~/.claude/projects/-home-walker-lifeware/memory/MEMORY.md` (add new project entry)

**Changes:** Standard project SSOT update pattern (per [project-changelog-split]).

---

## Verification Gates (cumulative)

```bash
# Per-task gate (after T1-T5 commit)
npx vitest run <specific test file> 2>&1 | tail -5
npx tsc --noEmit 2>&1 | tail -5
npm run validate:manifest 2>&1 | tail -3

# Final gate (after T6)
npx vitest run  # all suites
npx tsc --noEmit
npm run validate:manifest && npm run validate:structure && npm run validate:rules-registry

# TD-028 closure proof (post-T5)
grep -rn "'running'\|\"running\"" frontend/src/ --include="*.ts" --include="*.tsx" | grep -v "test.*fixture\|mock" | head
# Expected: 0 hits
```

---

## Out of Scope

- **TD-022 #7 N+1**: micro-perf, defer to next CNUI session
- **TD-023** (timebox write entry bypass): separate architecture session
- **TD-008** (lifecycle-configs require multi-key): separate architecture session
- **prod migrate**: [026.02.4] is logic-layer only, no schema change
- **GitHub/GitLab PR workflow**: project uses ff-merge + push gitee (per CLAUDE.md ship pattern)

---

## Known Drift Risks

1. TD-028 grep `'running'` may find stale mocks or test fixtures not in scope → triage at T5 review
2. `EditAppointment.tsx` cast sites might be more than 3 (lines 32, 36, 42) → discover at T3 review
3. `handlers.ts:596, 642` are 2 sites but may have more `it.activityArchetypeId` usages → discover at T2 review
4. `timebox.ts` has both TD-022 #7 (deferred) and TD-028 Site 3 → ensure T5 doesn't accidentally touch TD-022 #7 path
5. Post-ship second-opinion (Opus) may catch drift the whole-branch review missed (per [[feedback_post-ship-review-meta-pattern]])

---

## Post-Ship Workflow

1. SDD whole-branch review (Opus) → verdict SHIP-READY
2. Fix any Critical/Important findings inline
3. ff-merge to main + push gitee (pre-push hooks auto-run)
4. **Proactive**: dispatch post-ship second-opinion review (Opus) per [feedback_post-ship-review-meta-pattern]
5. Apply round 2 findings as separate commits
6. Final push to gitee
7. Update memory + TD-028 ledger close
8. Next candidate: [026.02.5] (if any deferred items remain) or new feature work