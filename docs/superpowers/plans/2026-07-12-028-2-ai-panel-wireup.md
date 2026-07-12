# [028.2] workspace.openAiPanel 真接 orchestration handler Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** 把 workspace `openAiPanel` 的 3 条静态 mock proposals（`timeboxes-workspace.tsx:412-416`）替换为真 `TimeboxOrchestrationHandler.onGenerate` 调用 — 4 源归集（appointments + templates + tasks + habits）+ §04 硬规则词典序 + Tier0/1/2 编排 + 5 维评分真生效。Surface dataModel 暴露 score 字段，AIOrchestratePanel 上方显示评分徽章。

**Architecture:** 在 `cnui/handlers.ts:open scheduleProposal` 分支内调 `TimeboxOrchestrationHandler.onGenerate(request, aiRuntime)` 跑编排，把 proposalSet + score + needConfirm 注入 dataSnapshot。`workspace.openAiPanel` 改为 await `openCnuiSurface('timebox', 'scheduleProposal', { date })` 拿 proposals 渲染。surface `dataModel` 扩 `score?: number, dimensions?: Record<string, number>` 字段，AIOrchestratePanel 顶部显示评分。

**Tech Stack:** Next.js 16.1.6, React 19.2.3, TypeScript 5, Drizzle ORM 0.45.1, Vitest

**Design doc SSOT:** 沿用 [028] design `~/.gstack/projects/walker2002-lifeware/walker-main-design-20260711-028-schedule-proposal.md`（[028.2] 是 [028] 已 ship 后的 wire-up 收口，无独立 design）

## Global Constraints

- **1 SDD task（单 ticket 收口）** + final whole-branch review
- **TDD**：先写 failing test 再实现
- **零 DDL**：纯 runtime 接入，[028] 表结构不动
- **不动** [028] 已 ship 代码的核心算法（编排 / 排序 / 评分 / NL 解析）
- **不动** A1/A2 隔离（scheduleProposal vs adjustRemainingTimeboxes 共享 handler 但 strategy 隔离）
- **不动** [028] T9 已闭环的 6 注册点 + 3 关注点（manifest / handlers map / surfaceHandlers / server / client / batch recording）
- **测试基线**：base/head 失败集合 0 新增
- **tsc 零新增**
- **pre-push hooks 全过**（`validate:manifest 0 errors`、`validate:domain-structure ✓`）
- **中文注释 + @file/@brief header**（CLAUDE.md §5）
- **Vitest 必须在 `frontend/` cwd 跑**
- **Vitest 不做 TS 类型检查**（配 tsc 双验证）
- **TZ canonical UTC**（[023.09] 已就位）
- **不破坏 [028.1] ISS-002 修复**：surface `handleAcceptClick` 的 4 字段 spread 仍正确（payload 仍是 ScheduleProposal.tsx 自定义字段，非 onGenerate 的 GeneratedProposal）

## 现有基础（important context for implementer）

| 已有 | 路径 | 现状 |
|---|---|---|
| `TimeboxOrchestrationHandler` | `frontend/src/domains/timebox/handlers/orchestration-handler.ts:148` | T1-T7 已 ship；onGenerate 签名 `(request, aiRuntime): Promise<GenerationResult>`；空 deps 也能跑（[023.08] 兼容） |
| `cnui/handlers.ts:open scheduleProposal` | `frontend/src/domains/timebox/cnui/handlers.ts:118-163` | **本任务核心改造点** — 当前只拉 context，不调 onGenerate |
| `cnui/handlers.ts:submit scheduleProposal` | `frontend/src/domains/timebox/cnui/handlers.ts:552-628` | [028] T9 已 ship — 自含 batch recording；本次**不动** |
| `openCnuiSurface` server action | `frontend/src/app/actions/intent.ts:1357-1428` | 已存在，workspace 可直接调 |
| `workspace.openAiPanel` | `frontend/src/domains/timebox/components/timeboxes-workspace.tsx:407-418` | **本任务核心改造点** — 当前静态 mock |
| `ScheduleProposal.tsx` | `frontend/src/domains/timebox/cnui/surfaces/ScheduleProposal.tsx:50-66` | dataModel 加 `score?/dimensions?` 字段（不改主路径） |
| `AIOrchestratePanel.tsx` | `frontend/src/domains/timebox/components/AIOrchestratePanel.tsx:14-77` | 顶部加 score 徽章 |
| `createAIRuntime()` factory | `frontend/src/nexus/ai-runtime/` | 已存在；mock LLM provider 在 [023.08] T1 已 ship |
| `[028.1] ISS-002 修复注释` | `ScheduleProposal.tsx:128-131` | 必须保留 — 4 字段 spread 仍是正解（payload 不存在） |

**关键事实**：
- `TimeboxOrchestrationHandler` 构造 deps 全 optional（orchestration-handler.ts:151），空 deps = 走内建默认值（ruleEngine 缺则跳过 detectConflicts，不影响主流程）
- `onGenerate` 调 `aiRuntime.generate` 两次（一次 parseNL 仅当 nlText 有值，一次内容优化）。MVP mock provider 已就位
- `GenerationResult.proposalSet` 形状：`{ proposals: GeneratedProposal[], warnings, presentation, score? }`（[028] T7 scoreSchedule 返回 score 已 merge）
- `GeneratedProposal` 形状（orchestration-handler.ts:48）：`{ payload: { startTime, endTime, title, ... }, sourceType, priority, energyMatch, ... }`
- surface `Proposal` 形状（ScheduleProposal.tsx:30）只 4 字段（id/title/startTime/endTime）— GeneratedProposal → Proposal 需 map `payload.startTime/endTime + payload.title + proposal.id`
- `[028.1] ISS-002 修复注释` 必须保留（避免有人再误加 payload 字段）— 但本次不动 handleAcceptClick（4 字段 spread 仍正确）

---

## Task 1: cnui handler open scheduleProposal 调 onGenerate + workspace openAiPanel 走 openCnuiSurface + surface dataModel 扩 score

**Files:**
- Modify: `frontend/src/domains/timebox/cnui/handlers.ts`（scheduleProposal open 分支 line 118-163 — 调 onGenerate + 把 proposalSet 注入 dataSnapshot）
- Modify: `frontend/src/domains/timebox/components/timeboxes-workspace.tsx`（`openAiPanel` line 407-418 — 改为 async + 调 openCnuiSurface + loading/error 态 + handleAiConfirm 加 scheduleProposal accept 分支）
- Modify: `frontend/src/domains/timebox/cnui/surfaces/ScheduleProposal.tsx`（`dataModel` 加 `score?: number, dimensions?: Record<string, number>` 字段）
- Modify: `frontend/src/domains/timebox/components/AIOrchestratePanel.tsx`（顶部加 score 徽章 — props 加 `score?/dimensions?` + UI 显示）
- Test: `frontend/src/domains/timebox/__tests__/cnui-handlers.test.ts`（扩 scheduleProposal open 调 onGenerate 测试）
- Test: `frontend/src/domains/timebox/__tests__/timeboxes-workspace.test.tsx` 或新建 `timeboxes-workspace-openai.test.tsx`（覆盖 openAiPanel 真接 openCnuiSurface）
- Test: `frontend/src/domains/timebox/__tests__/schedule-proposal-surface.test.tsx` 或扩现有（覆盖 score 字段渲染）

**Interfaces:**
- Consumes: [028] T1-T7 全产物（4 源 + §04 + Tier0/1/2 + 5 维评分）
- Produces: workspace.openAiPanel 真接 handler；surface dataModel 含 score；AIOrchestratePanel 显示评分

### Step 1: Write failing test — cnui handler open scheduleProposal 调 onGenerate

在 `cnui-handlers.test.ts` 加：

```typescript
describe('[028.2] scheduleProposal open 调 onGenerate', () => {
  it('调 TimeboxOrchestrationHandler.onGenerate 并把 proposalSet 注入 dataSnapshot', async () => {
    // mock TimeboxOrchestrationHandler.onGenerate 返回 { proposalSet: { proposals: [GeneratedProposal mock] }, score: 8.5 }
    // 调 handler.open('scheduleProposal', { date: '2026-07-12' })
    // 断言 dataSnapshot.proposals 含 1 条 + dataSnapshot.score === 8.5
  })

  it('onGenerate 返 needConfirm → dataSnapshot.needConfirm=true + archetypeCandidates 透传', async () => {
    // mock onGenerate 返 { needConfirm: true, archetypeCandidates: [...] }
    // 断言 dataSnapshot.needConfirm=true + dataModel.archetypeCandidates 长度 > 0
  })

  it('onGenerate throw → dataSnapshot 空 + 不抛到 caller（catch 内降级）', async () => {
    // mock onGenerate throw
    // 断言 dataSnapshot.proposals=[] + 不 panic
  })
})
```

Run: `cd frontend && npx vitest run src/domains/timebox/__tests__/cnui-handlers.test.ts -t "[028.2]"`
Expected: FAIL（onGenerate 未被调，dataSnapshot 不含 proposals/score）

### Step 2: Implement — cnui handler open scheduleProposal 调 onGenerate

在 `cnui/handlers.ts` scheduleProposal open 分支（line 118-163）补 onGenerate 逻辑：

```typescript
if (action === SCHEDULE_PROPOSAL_ACTION) {
  const [timeboxes, tasks, habits] = await Promise.all([
    getTodayTimeboxes(),
    getActiveTasks(),
    getPendingHabits(),
  ])
  const revertableBatches = await getRevertableBatches({
    sessionId: SESSION_KEY,
    userId: MVP_USER_ID,
    windowMs: 5 * 60 * 1000,
  }).catch(() => [])

  // [028.2] 调 TimeboxOrchestrationHandler.onGenerate 跑 4 源归集 + §04 + Tier0/1/2 + 5 维评分
  // onGenerate 调 aiRuntime.generate 两次（mock provider 在 [023.08] T1 就位）；
  // throw 时降级返空 proposals + UI 仍可点开 + 不阻塞。
  let proposals: Array<{ id: string; title: string; startTime: string; endTime: string }> = []
  let score: number | undefined
  let dimensions: Record<string, number> | undefined
  let needConfirm = false
  let archetypeCandidates: unknown[] = []
  let confirmReason = ''
  try {
    const aiRuntime = createAIRuntime()  // [023.08] T1 mock LLM provider
    const orchestrator = new TimeboxOrchestrationHandler()
    const todayLocal = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
    const result = await orchestrator.onGenerate({
      intent: { action: SCHEDULE_PROPOSAL_ACTION, targetDomain: 'timebox', fields: { date: todayLocal } },
      contexts: {
        existingTimeboxes: timeboxes,
        activeTasks: tasks,
        pendingHabits: habits,
        // [028] T1 contexts 已含 appointments/templates；handler.collectMaterials 已读
      },
    }, aiRuntime)
    if (result.needConfirm) {
      needConfirm = true
      archetypeCandidates = result.archetypeCandidates ?? []
      confirmReason = result.confirmReason ?? ''
    } else if (result.proposalSet?.proposals) {
      proposals = result.proposalSet.proposals.map((p: any) => ({
        id: p.id ?? `prop-${p.title}-${p.payload?.startTime}`,
        title: p.payload?.title ?? p.title ?? '未命名',
        startTime: p.payload?.startTime ?? p.startTime,  // ISO UTC string
        endTime: p.payload?.endTime ?? p.endTime,
      }))
      score = (result as { score?: number }).score
      dimensions = (result as { dimensions?: Record<string, number> }).dimensions
    }
  } catch (e) {
    console.warn('[timeboxCnuiHandler] scheduleProposal open onGenerate 失败:', e)
    // 降级：proposals=[] + revertableBatches/上下文仍返回 → UI 提示"今日编排暂不可用"
  }

  return {
    content: '智能编排时间盒 — ...',
    dataSnapshot: {
      existingTimeboxes: timeboxes.map(...),
      activeTasks: tasks.map(...),
      pendingHabits: habits.map(...),
      revertableBatches: revertableBatches.map(...),
      proposals,           // [028.2] 新增
      score,               // [028.2] 新增
      dimensions,          // [028.2] 新增
      needConfirm,         // [028.2] 新增
      archetypeCandidates, // [028.2] 新增
      confirmReason,       // [028.2] 新增
    },
  }
}
```

**关键决策**：
- `createAIRuntime` import 来源：从 `@/nexus/ai-runtime` 主入口 import（[023.08] T1 mock provider 已 ship）
- `TimeboxOrchestrationHandler` import 已存在（同文件 line 5/10）
- 异常降级：throw 不阻塞 UI；proposals=[] + UI 显示「编排暂不可用」
- score/dimensions 是 optional — onGenerate 不返时为 undefined（[028] T7 scoreSchedule 已 merge 到 result）

### Step 3: Implement — workspace.openAiPanel 改为 async + 调 openCnuiSurface

在 `timeboxes-workspace.tsx:407-418` 改 `openAiPanel`：

```typescript
const [aiProposalsLoading, setAiProposalsLoading] = useState(false)
const [aiNeedConfirm, setAiNeedConfirm] = useState<{
  archetypeCandidates: Array<{ id: string; title: string; source: string; reason: string }>
  confirmReason: string
} | null>(null)
const [aiScore, setAiScore] = useState<number | undefined>()

const openAiPanel = useCallback(async () => {
  setAiProposalsLoading(true)
  setAiNeedConfirm(null)
  try {
    const todayLocal = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
    const result = await openCnuiSurface('timebox', 'scheduleProposal', { date: todayLocal })
    const snapshot = result.surface.dataSnapshot as {
      proposals?: Array<{ id: string; title: string; startTime: string; endTime: string }>
      revertableBatches?: Array<{ batchId: string; acceptedAt: number; count: number }>
      needConfirm?: boolean
      archetypeCandidates?: Array<{ id: string; title: string; source: string; reason: string }>
      confirmReason?: string
      score?: number
    }
    if (snapshot.needConfirm) {
      setAiNeedConfirm({
        archetypeCandidates: snapshot.archetypeCandidates ?? [],
        confirmReason: snapshot.confirmReason ?? '需要您确认候选',
      })
    } else {
      setAiProposals(snapshot.proposals ?? [])
    }
    setAiScore(snapshot.score)
    setRevertableBatches(snapshot.revertableBatches ?? [])
    setAiPanelOpen(true)
  } catch (e) {
    console.error('[openAiPanel] failed', e)
    toast.error('编排服务暂不可用，请稍后重试')
  } finally {
    setAiProposalsLoading(false)
  }
}, [])
```

**关键决策**：
- workspace 已是 client component，openCnuiSurface 是 server action 可直调
- loading 态 + error 态（toast）
- needConfirm 路径：setAiNeedConfirm（与 [028] T6 surface 的 needConfirm 卡片一致）
- revertableBatches 从 open 拿（之前是静态 state，现在真接）
- `aiScore` state 新增 + AIOrchestratePanel 显示

### Step 4: ScheduleProposal.tsx dataModel 加 score 字段

在 `ScheduleProposal.tsx:50-66` dataModel 加：

```typescript
interface ScheduleProposalProps {
  surfaceType: string
  dataModel: {
    proposals?: Proposal[]
    revertableBatches?: RevertableBatch[]
    needConfirm?: boolean
    archetypeCandidates?: ArchetypeCandidate[]
    confirmReason?: string
    handoffHint?: string
    // [028.2] 新增：5 维评分透传
    score?: number
    dimensions?: Record<string, number>
  }
  ...
}
```

读取 + 透传给 AIOrchestratePanel：

```typescript
const score = dataModel.score
const dimensions = dataModel.dimensions
// ...
<AIOrchestratePanel
  proposals={proposals}
  rejected={rejected}
  score={score}
  dimensions={dimensions}
  onAccept={...}
  onReject={...}
/>
```

### Step 5: AIOrchestratePanel.tsx 顶部加 score 徽章

在 `AIOrchestratePanel.tsx` props 加 `score?/dimensions?`，UI 加评分徽章：

```typescript
interface AIOrchestratePanelProps {
  proposals: Proposal[]
  rejected: Set<string>
  onAccept: (id: string) => void
  onReject: (id: string) => void
  // [028.2] 新增
  score?: number
  dimensions?: Record<string, number>
}

export function AIOrchestratePanel({ proposals, rejected, onAccept, onReject, score, dimensions }: AIOrchestratePanelProps) {
  if (proposals.length === 0) return null

  return (
    <div className="space-y-2">
      {/* [028.2] 5 维评分徽章 */}
      {typeof score === 'number' && (
        <div data-testid="score-badge" className="rounded border border-primary/20 bg-primary/5 px-3 py-2">
          <div className="flex items-baseline justify-between">
            <span className="text-xs uppercase tracking-wide text-body/60">今日方案综合分</span>
            <span className="text-lg font-semibold text-primary">{score.toFixed(1)} / 10</span>
          </div>
          {dimensions && Object.keys(dimensions).length > 0 && (
            <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-body/70">
              {Object.entries(dimensions).map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span>{k}</span>
                  <span className="font-mono">{typeof v === 'number' ? v.toFixed(1) : v}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <p className="text-xs uppercase tracking-wide text-body/60">AI 编排建议</p>
      {proposals.map(...)}
    </div>
  )
}
```

### Step 6: workspace handleAiConfirm 加 scheduleProposal accept 分支

在 `timeboxes-workspace.tsx:handleAiConfirm`（line 427+）加 scheduleProposal 分支（surface 现在用新 action 名发 onConfirm）：

```typescript
const handleAiConfirm = useCallback(async (data: Record<string, unknown>) => {
  const action = data.action as string
  if (!action) return
  try {
    setActionSubmitting(true)
    if (action === 'revertSmartTimeboxes') {
      // ... 现有 ...
    } else if (action === 'scheduleProposal') {
      // [028.2] 真接 handler submit — 现有 [028.1] ISS-002 修复路径
      const fields = (data.fields ?? {}) as { items: Array<{ title: string; date: string; startTime: string; endTime: string }> }
      const result = await submitCnuiSurface(
        '',  // cnuiSurfaceId — ignored by handler
        'timebox',
        'scheduleProposal',
        fields,
      )
      if (result.success) {
        await loadRange(dateMode, currentDate)
        setAiPanelOpen(false)
        const batchId = (result as { batchId?: string }).batchId
        if (batchId) {
          setRevertableBatches([{ batchId, acceptedAt: Date.now(), count: fields.items.length }])
        }
        toast.success(`已创建 ${fields.items.length} 个时间盒`)
      } else {
        toast.error(`创建失败：${result.error ?? '未知错误'}`)
      }
    } else if (action === 'createTimebox') {
      // ... 现有 ...
    }
  } catch (e) {
    console.error('[TimeboxesWorkspace.handleAiConfirm] failed', e)
    toast.error(`操作失败：${e instanceof Error ? e.message : String(e)}`)
  } finally {
    setActionSubmitting(false)
  }
}, [dateMode, currentDate, loadRange, revertableBatches])
```

**关键决策**：
- 现有 [023.08] T5 createTimebox 路径保留（与 scheduleProposal 并存）
- scheduleProposal 分支是 [028] T9 + [028.2] 的真路径
- ScheduleProposal.tsx 的 handleAcceptClick 已用 SCHEDULE_PROPOSAL_ACTION（[028] I-2 polish），与本分支名一致
- batchId 写入 revertableBatches 让 [023.08] T5 撤销按钮显示

### Step 7: Write failing test — workspace openAiPanel 真接 + surface score 渲染

新建/扩测试文件（具体路径以测试结构为准）：

```typescript
describe('[028.2] workspace.openAiPanel 真接 openCnuiSurface', () => {
  it('openAiPanel 调 openCnuiSurface(\'timebox\', \'scheduleProposal\', { date }) 拿 proposals', async () => {
    // mock openCnuiSurface 返 { surface: { dataSnapshot: { proposals: [...], score: 8.5, ... } } }
    // 触发 openAiPanel
    // 断言 aiProposals state 更新 + setAiPanelOpen(true)
  })

  it('openAiPanel 失败 → toast.error + 不打开 panel', async () => {
    // mock openCnuiSurface throw
    // 断言 toast.error 被调 + aiPanelOpen 仍 false
  })

  it('needConfirm 路径 → setAiNeedConfirm 不调 setAiProposals', async () => {
    // mock openCnuiSurface 返 needConfirm=true
    // 断言 aiNeedConfirm state 有值 + aiProposals 仍 []
  })
})

describe('[028.2] ScheduleProposal surface 渲染 score', () => {
  it('dataModel.score 有值 → 透传给 AIOrchestratePanel', () => {
    // 渲染 ScheduleProposal dataModel={..., score: 8.5}
    // 断言 AIOrchestratePanel data-testid="score-badge" 存在
  })
})
```

Run: `cd frontend && npx vitest run src/domains/timebox/__tests__/timeboxes-workspace.test.tsx -t "[028.2]"`
Expected: FAIL（openAiPanel 仍用静态 mock，未调 openCnuiSurface）

### Step 8: Run tests + tsc + validate:manifest + pre-push hooks + /browse E2E

```bash
cd frontend
# 1. unit tests
npx vitest run src/domains/timebox/__tests__/ 2>&1 | tail -20
# 2. tsc baseline 对比
npx tsc --noEmit | grep -c "error TS"  # 看绝对数,关注被改文件
# 3. validate hooks
npm run validate:manifest 2>&1 | tail -3
npm run validate:domain-structure 2>&1 | tail -3
# 4. dev server smoke
npm run dev &
sleep 8
curl -s http://localhost:3000/timeboxes | grep -c "新建今日计划"  # 期望 ≥1
# 5. /browse E2E: 点「新建今日计划」→ mock LLM 生成 4 源 proposal → 看 score 徽章 → 接受 → DB 落库 → 撤销按钮显示
```

Expected: 
- tests PASS（含新 3 + 现有零回归）
- tsc 0 新增（被改文件）
- validate:manifest 0 errors
- /browse E2E：看到真 4 源归集 + score 徽章 + 接受后 DB 新增 3 条 + 5 分钟内显示撤销按钮

### Step 9: Commit

```bash
git add frontend/src/domains/timebox/cnui/handlers.ts \
        frontend/src/domains/timebox/components/timeboxes-workspace.tsx \
        frontend/src/domains/timebox/cnui/surfaces/ScheduleProposal.tsx \
        frontend/src/domains/timebox/components/AIOrchestratePanel.tsx \
        frontend/src/domains/timebox/__tests__/
git commit -m "feat(028.2): workspace.openAiPanel 真接 TimeboxOrchestrationHandler.onGenerate — 4 源归集 + 5 维评分生效 [028.1-archive]"
```

---

## Self-Review

**1. Spec coverage（[028] design → [028.2] 任务映射）：**
- P6 5 维评分显示 → Step 5 AIOrchestratePanel 徽章 ✓
- R8 prod 命中率 gate（[024]）— 不在 [028.2] 范围（[028] 已 ship，未跑 prod gate）
- [028.1] ISS-002 4 字段 spread 不变 → Step 6 注释保留 ✓
- T9 6 注册点 + 3 关注点不动 → Step 1 仅改 open 分支（不改 submit / manifest） ✓

**2. 风险评估：**
- **R1：onGenerate mock LLM 失败导致 open 阻塞** — 已用 try/catch 降级（proposals=[] + console.warn + UI 提示「编排暂不可用」），不阻塞 panel 打开
- **R2：GeneratedProposal → Proposal map 形状错误** — 用 `payload.startTime/endTime/title` 而非顶层；surface Proposal 形状是 HH:MM 但 payload.startTime 是 ISO UTC string — **冲突点**：现有 surface 渲染用 `p.startTime` (HH:MM) 直接显示；ISO UTC 在 Asia/Shanghai 时区会显示成「10:00」而非「18:00」。**修**：map 时转换 ISO UTC → HH:MM（用 toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Shanghai' })）
- **R3：score 字段缺省** — `[028] T7 scoreSchedule` 已 merge 到 result.score，但 GenerationResult interface 是否包含？implementer 须 verify（用 `(result as any).score` 兜底）

**3. Placeholder scan：** 无"TBD/TODO"占位；onGenerate 调用的 aiRuntime.generate 两次 mock provider 已在 [023.08] T1 就位。

**4. Type consistency：** GeneratedProposal.payload 是 ISO UTC → Proposal.startTime/endTime 是 HH:MM。Map 时 toLocaleTimeString 转换（统一 `Asia/Shanghai` 时区，沿用 workspace 既有约定）。score/dimensions optional。

**5. 已知边界：**
- onGenerate mock provider 命中率依赖 [023.08] T1 setup — 假定 dev/test 环境 mock 已就位
- AIOrchestratePanel score 徽章是 UX 增量（5 维细目数据透传，不要求用户理解 — design P6「不 block」原则）

---

## Execution Handoff

Plan v1 ready to SDD。

**单 task（mini-plan 适配）**：T1 wire-up（1 task 9 step）。

**Assignment 前置**：
- [028] 已 ship 在 main（1b4a3c4 + 13 commits ahead）
- baseline 已知（[028] memory 提到 health 71.5 → /qa 后待重跑 ≥95）
- 1 个 task → 1 implementer subagent + 1 task reviewer + 1 final code reviewer
- workspace.revert.test.tsx 撤销路径 work 确认（[028.1] 修复后保留）

**SDD 启动流程**：
1. 创建 `.superpowers/sdd/progress.md`
2. dispatch implementer（用 scripts/task-brief 抽 brief）
3. implementer 写 failing tests → 实现 → 跑 base/head → commit
4. dispatch task reviewer（用 scripts/review-package 抽 diff）
5. 视 reviewer 反馈决定 fix subagent / re-review / pass
6. dispatch final code reviewer（whole-branch）
7. 视 whole-branch 反馈决定 fix subagent
8. superpowers:finishing-a-development-branch

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | — | — | 0 | — | — (mini-plan 范围窄，office-hours 不必要) |
| Codex Review | — | — | 0 | — | — (single task ticket，codex outside voice 价值低) |
| Eng Review | `/plan-eng-review` | Architecture & tests | 0 | — | — (用户决策直接 SDD) |
| Design Review | — | — | 0 | — | — (仅 score 徽章 UI 增量，复用现有 AIOrchestratePanel) |
| DX Review | — | — | 0 | — | — (mini-plan) |

- **VERDICT (v1):** 用户已决策直 SDD（mini-plan 范围窄、单 task ticket）。plan 已 complete + 已识别 R1/R2/R3 风险并给出 mitigation。**READY TO SDD**。

NO UNRESOLVED DECISIONS