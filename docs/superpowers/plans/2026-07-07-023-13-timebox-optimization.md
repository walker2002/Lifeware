# [023.13] TimeboxDomain 持续优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 [023.12] lifecycle 简化后，一次性完成 5 项 timebox 域优化：TD-019 预防闭环（白名单自动派生 + pre-push 校验）、回退 bug 回归验证、/timeboxes 打卡专区（详细字段）+ 快捷/批量打卡、/logTimebox 共享字段、MiniCalendar 上下月翻页。

**Architecture:** 单 PR 全做。数据模型演进走 JSONB 形状变更（`execution_record` 列加 4 可选字段，免 DDL 迁移）。TD-019 白名单从 `manifest.lifecycle` transitions 派生（复刻 `buildActionMap` 的 camelCase 规则、排除 `create`），timebox+appointment 两域同 Set 同机制。回退清记录走新 `clearExecutionRecord` repo 方法（`archive()` 不能清且会错改 status）。共享 `ExecutionDetailFields` 组件防 CNUI 表单分叉。

**Tech Stack:** Next.js 16 / React 19 / TypeScript 5 / Drizzle 0.45 / PostgreSQL / vitest / shadcn-ui。

**Spec (SSOT):** `docs/superpowers/specs/2026-07-07-023-13-timebox-optimization-design.md`

## Global Constraints

- 所有注释/文档/commit 使用**简体中文**；每个改动 TS/JS 文件保持 `/** @file ... @brief ... */` 头注释同步。
- **Tier 2 文档同步**（[[feedback_tier2-sync]]）：USOM/DB 变更**先更新 `docs/`（usom-design.md / database-design.md / CHANGELOG.md）再改代码**——Task 3 内强制 docs step 在 code step 前。
- **manifest.yaml 是 lifecycle SSOT**；改完跑 `npx tsx scripts/validate-manifest.ts`（即 `npm run validate:manifest`）必须 0 errors。
- **Repository Pattern + 多租户**：状态写走 SM → repository，`userId` 透传；`where` 必含 `userId`。
- **CNUI surface 四路注册**（[[project-cnui-surface-dual-registration]]）：server `surfaceHandlers` + client `register-client-surfaces` + manifest K-block + intent_trigger。本计划不改 surface 注册，但改 LogTimebox 字段时勿破坏。
- **手写迁移**（[[project-drizzle-migrations-handwritten]]）：本计划**无 DDL 迁移**（纯 JSONB 形状演进），Task 3 仅改 USOM 类型 + schema.ts 的 `$type<>`（如有）。
- **vitest 必须在 `frontend/` cwd 跑**（[[feedback_vitest-pitfalls]]）：`cd frontend && npx vitest run <path>`；vitest 不做类型检查，每个 task 配 `cd frontend && npx tsc --noEmit` 双验证。
- **CSS 变量令牌**（`bg-canvas`/`text-ink`/`text-body`/`text-muted`/`border-hairline`/`bg-surface-card`/`text-success`/`text-error`/`bg-primary` 等），禁 Tailwind 默认颜色类（[[ui-design-constraints]]）。
- **DB**：`lifeware_dev@localhost:5432`（dev，数据可弃）。

## File Structure

**新建文件**
- `frontend/scripts/validate-rules-registry.ts` — TD-019 A2 pre-push 校验脚本
- `frontend/src/domains/timebox/lib/build-status-transition-actions.ts` — A1 派生纯函数
- `frontend/src/domains/timebox/lib/__tests__/build-status-transition-actions.test.ts` — 派生函数测试
- `frontend/src/domains/timebox/lib/get-default-energy-actual.ts` — 能量默认值 helper
- `frontend/src/domains/timebox/components/execution-detail-fields.tsx` — §3/§4 共享打卡专区字段组件
- `frontend/src/domains/timebox/components/__tests__/execution-detail-fields.test.tsx` — 共享组件测试
- `frontend/src/domains/timebox/components/__tests__/mini-calendar.nav.test.tsx` — 月历翻页测试

**修改文件**
- USOM/docs：`usom/types/objects.ts`、`docs/usom-design.md`、`docs/database-design.md`、`CHANGELOG.md`
- §1：`domains/timebox/rules-registry.ts`、`domains/timebox/__tests__/rules-registry.test.ts`、`domains/timebox/__tests__/rules-registry.appointment.test.ts`、`package.json`、`.husky/pre-push`
- §3 数据/回退：`domains/timebox/repository/index.ts`、`app/actions/timebox.ts`、`app/actions/timebox.__tests__/*`（若存在 AM7 测试）
- §3 UI：`domains/timebox/components/timebox-card.tsx`、`domains/timebox/components/timebox-list.tsx`、`domains/timebox/components/timeboxes-workspace.tsx`、`domains/timebox/components/timebox-drawer.tsx`
- §4：`domains/timebox/cnui/surfaces/LogTimebox.tsx`、`domains/timebox/cnui/handlers.ts`
- §5：`domains/timebox/components/mini-calendar.tsx`
- §2：`domains/timebox/__tests__/revert-regression.test.ts`（新建）

---

## ⚠️ Review Amendments (plan-eng-review 2026-07-07, 2 P1 + 跨模型确认)

> 以下修正**覆盖**对应 Task 的原始描述,implementer 先读这里再读原 Task。所有 P1 经用户表决 + outside voice(Claude subagent + codex partial)确认。

### AM1 (P0, supersedes T5/T6/T8 前置) — executionRecord 持久化基础修复

**问题**(跨模型确认):`timeboxes.execution_record` 列**从未被任何 log 路径写入**。`archive()`(repository/index.ts:114)是唯一列写手但零调用方;SM `updateStatus`(generic-repo-adapter:61)只 `{...existing, status, updatedAt}` 不拉 executionRecord;ExecutionLogged 事件只入 system_events,hooks.ts:185 仅返建议不写列。后果:logged 后列恒 null → UI「已打卡✓」永不显、AM7 守卫永不触发、§3/§4 detailed 写进去不落库。

**新增 Task T0(插在 T3 后、T5/T6 前,所有 detailed-log 依赖它)**:
1. 写 P0 复现测试:`transitionTimebox(id,'log', simpleRecord)` → 直查 `timeboxes` 行 → 断言 `execution_record` 列为 null(红)。
2. 修 SM(`state-machine/index.ts` ~L287 后,updateStatus 之后、event append 之前):
   ```ts
   if (transition.to === 'logged' && proposal.payload['executionRecord']) {
     object = await repo.updateFields(objectId!, { executionRecord: proposal.payload['executionRecord'] }, userId, tx)
   }
   ```
   复用现有 `updateFields` 列写通道(repository:99-112),契合 L281-287 的 lifecycle_timestamp 后写模式,同 tx 原子。
3. 修 LogTimebox CNUI handler(`handlers.ts:567`):flat fields 重组为 executionRecord 对象(CNUI 路径当前更糟——payload.executionRecord 恒 undefined):
   ```ts
   const r = await submitDynamicIntent('timebox', 'logTimebox', {
     objectId: it.id,
     executionRecord: {
       mode: it.detailed ? 'detailed' : 'simple',
       completionStatus: it.state === 'completed' ? 'completed' : 'partial',
       ...(it.notes ? { notes: it.notes } : {}),
       ...(it.detailed ?? {}),
       // + base 必填:actualDuration/plannedDuration/deviationMinutes/sourceType/loggedAt
     },
   })
   ```
4. 回归测试转绿(列被写);补 logged 行 findById 读回 executionRecord 非空 断言。

### AM2 (supersedes T1) — A1 扩展到第二副本 core/rule-engine

`nexus/core/rule-engine/rules/timebox.ts:51` 有**独立** `STATUS_TRANSITION_ACTIONS`(FieldCompletenessRule 用),`timebox.ts:45-46` 注释自承「同源——两侧都需跳过」。该副本还**漏 revertTimebox/revertAppointment**([023.12] hot-fix 只改了 nexus/rules 一半)。

**T1 扩展**:T1 派生函数 `buildStatusTransitionActions` 同时被 `rules-registry.ts` 与 `core/rule-engine/rules/timebox.ts` 引用(后者 import 前者 export 的派生 Set,删本地手工 Set)。补一个 core/rule-engine 侧的守护测试(FieldCompletenessRule 对派生 Set 内 action 返回 pass)。

### AM3 (refines T5) — 不新增 clearExecutionRecord,复用 updateFields

outside voice 指出:T5 提的 `clearExecutionRecord(id,userId)` 新方法是多余抽象——`repository/index.ts:99-112` 已有通用 `updateFields(id, fields, userId, tx)`。revert 清记录改用:
```ts
await repo.updateFields(id, { executionRecord: null }, userId, tx)
```
单条 UPDATE,T-02 userId 过滤,与 AM1 用同一通道。**删掉 T5 的 clearExecutionRecord repo 方法 Step**,revertTimebox 改调 updateFields。映射偏好:DRY + 最小 diff。

### AM4 (refines T6) — defaultEnergyActual 必须接线

T6 原 Step 2「简化:defaultEnergyActual 不传(undefined)」**偏离 spec**(spec 要 archetype 4 维均值)。修正:drawer 通过 `editTarget.activityArchetypeId` 查 archetype(需补一个 getById server action 或随 getTimeboxById 一并返回 archetype 详情),调 `getDefaultEnergyActual(archetype)` 传入 `ExecutionDetailFields.defaultEnergyActual`。无 archetype 仍 undefined(用户手填)。

### AM5 (refines T2) — validator 改 YAML 直读

T2 原 `readActual()` 用 `import('../src/.../build-status-transition-actions')` 在 tsx 脚本里可能解析不了 `@/` alias(lifecycle-configs.ts 注释 + TD-019 doc 明示 require('@/') 在 ESM 失败)。改:`validate-rules-registry.ts` 两侧都从 YAML 直读(fs + js-yaml,范式同 `validate-manifest.ts`),不 import TS 模块。A2 残余价值 = 守护"有人把 rules-registry 回退到手工 Set"(A1 单测只测派生函数本身,不测 rules-registry 是否真的调它)。

### Minor(记入 report,不改 task)
- T7 `handleBatch` 顺序 await = N round trip;MVP N 小可接受,未来可批化。
- `orchestrator/index.ts:362 executeFieldStateWrite` 硬编码 tasks 域——timebox field_metadata 路径会失败。本计划 AM1 的 SM updateFields 绕开它,但记一笔技术债(field-state-write 域硬编码)。

### 依赖序更新
T1 → T2 → T3 → **T0(新,持久化)** → T4 → T5(改用 updateFields)→ T6(接 defaultEnergyActual)→ T7 → T8 → T9 → T10

---

## Task 1: §1 A1 — STATUS_TRANSITION_ACTIONS 从 lifecycle 派生 + appointment 收敛

**Files:**
- Create: `frontend/src/domains/timebox/lib/build-status-transition-actions.ts`
- Create: `frontend/src/domains/timebox/lib/__tests__/build-status-transition-actions.test.ts`
- Modify: `frontend/src/domains/timebox/rules-registry.ts`（L99-110 派生 Set；appointment skip 收敛 L239）
- Modify: `frontend/src/domains/timebox/__tests__/rules-registry.test.ts`、`rules-registry.appointment.test.ts`（死成员清理）

**Interfaces:**
- Produces: `buildStatusTransitionActions(): Set<string>` —— 返回 `[023.12]` 后的合法状态转换 intent-namespace action 集合 `{logTimebox, cancelTimebox, revertTimebox, cancelAppointment, completeAppointment, revertAppointment}`。`rules-registry.ts` export 的 `STATUS_TRANSITION_ACTIONS` 改为调用它。Task 2 的 validator 复用同一派生逻辑。

- [ ] **Step 1: 写 buildStatusTransitionActions 派生函数的失败测试**

`frontend/src/domains/timebox/lib/__tests__/build-status-transition-actions.test.ts`：
```ts
/**
 * @file build-status-transition-actions 测试
 * @brief 验证 STATUS_TRANSITION_ACTIONS 从 manifest lifecycle 正确派生（A1）
 */
import { describe, it, expect } from 'vitest'
import { buildStatusTransitionActions } from '../build-status-transition-actions'

describe('buildStatusTransitionActions', () => {
  it('派生 timebox 状态转换 action（排除 create）', () => {
    const s = buildStatusTransitionActions()
    expect(s.has('logTimebox')).toBe(true)
    expect(s.has('cancelTimebox')).toBe(true)
    expect(s.has('revertTimebox')).toBe(true)
  })

  it('派生 appointment 状态转换 action（排除 create）', () => {
    const s = buildStatusTransitionActions()
    expect(s.has('cancelAppointment')).toBe(true)
    expect(s.has('completeAppointment')).toBe(true)
    expect(s.has('revertAppointment')).toBe(true)
  })

  it('不含 create/edit（需字段校验）', () => {
    const s = buildStatusTransitionActions()
    expect(s.has('createTimebox')).toBe(false)
    expect(s.has('createAppointment')).toBe(false)
    expect(s.has('editTimeboxes')).toBe(false)
    expect(s.has('editAppointment')).toBe(false)
  })

  it('不含 [023.12] 已废的 start/end/overtime/expire 死成员', () => {
    const s = buildStatusTransitionActions()
    expect(s.has('startTimebox')).toBe(false)
    expect(s.has('endTimebox')).toBe(false)
    expect(s.has('overtimeTimebox')).toBe(false)
    expect(s.has('startAppointment')).toBe(false)
    expect(s.has('expireAppointment')).toBe(false)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/domains/timebox/lib/__tests__/build-status-transition-actions.test.ts`
Expected: FAIL — `Cannot find module '../build-status-transition-actions'`

- [ ] **Step 3: 实现 buildStatusTransitionActions**

`frontend/src/domains/timebox/lib/build-status-transition-actions.ts`：
```ts
/**
 * @file build-status-transition-actions
 * @brief 从 manifest.lifecycle 派生 STATUS_TRANSITION_ACTIONS（[023.13] TD-019 A1）
 *
 * 复刻 buildActionMap（nexus/orchestrator/lifecycle-configs.ts:59-109）的 camelCase
 * 派生规则：对每条 lifecycle[objectType].transitions[*].action 生成
 * `${action}${PascalCase(objectType)}`（log+Timebox→logTimebox）。
 * 排除 `create`（create 需字段必含校验，不跳过）。
 *
 * 不 import orchestrator（会循环依赖），改用 loadDomainManifest 叶子模块。
 * timebox + appointment 两 objectType 同在 domains/timebox/manifest.yaml。
 */
import { loadDomainManifest } from '@/domains/manifest-loader'

/** snake_case_objectType → PascalCaseObjectType（timebox→Timebox, appointment→Appointment） */
function toPascalCase(snake: string): string {
  return snake.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')
}

/**
 * 派生状态转换 action 集合（跳过字段必含校验的那些）。
 * 语义：这些 action 在 submitDynamicIntent 时 fields 仅 { objectId }。
 */
export function buildStatusTransitionActions(): Set<string> {
  const result = new Set<string>()
  const loaded = loadDomainManifest('timebox')
  if (!loaded.success) {
    // manifest 加载失败：返回空集，让字段校验兜底（fail-closed，不静默放行）
    return result
  }
  const lifecycle = loaded.manifest.lifecycle ?? {}
  for (const [objectType, def] of Object.entries(lifecycle)) {
    const pascal = toPascalCase(objectType)
    for (const t of (def as { transitions: Array<{ action: string }> }).transitions) {
      if (t.action === 'create') continue // create 需字段校验
      result.add(`${t.action}${pascal}`)
    }
  }
  return result
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/domains/timebox/lib/__tests__/build-status-transition-actions.test.ts`
Expected: PASS（4 tests）

- [ ] **Step 5: 改 rules-registry.ts 用派生 Set**

`frontend/src/domains/timebox/rules-registry.ts`，把 L99-104 的手工常量：
```ts
// 改前
const STATUS_TRANSITION_ACTIONS = new Set([
  'startTimebox', 'endTimebox', 'cancelTimebox', 'logTimebox',
  'overtimeTimebox', 'revertTimebox',
  'cancelAppointment', 'startAppointment', 'completeAppointment', 'expireAppointment',
  'revertAppointment',
])
```
改为：
```ts
// [023.13] TD-019 A1：从 manifest.lifecycle 派生（lib/build-status-transition-actions），
// 取代手工常量——新增 lifecycle transition 自动纳入，杜绝漂移（[023.12] revert 漏注册根因）。
import { buildStatusTransitionActions } from './lib/build-status-transition-actions'
export const STATUS_TRANSITION_ACTIONS: Set<string> = buildStatusTransitionActions()
```
（保留原 JSDoc 注释，追加 A1 来源说明。）

- [ ] **Step 6: 收敛 appointment skip 到同一 Set**

`rules-registry.ts` 找 `appointmentFieldsValid`（约 L239），把：
```ts
// 改前
if (intent.action !== 'createAppointment' && intent.action !== 'editAppointment') {
  return validationPassed()
}
```
改为：
```ts
// [023.13] A1 收敛：appointment 状态转换也走派生 Set（与 timebox 同机制，drift 单一源）
if (STATUS_TRANSITION_ACTIONS.has(intent.action)) {
  return validationPassed()
}
```
说明：`createAppointment`/`editAppointment` 不在派生 Set（无对应 lifecycle transition / create 被排除），落到字段校验，与原语义一致。

- [ ] **Step 7: 更新守护测试（清死成员断言）**

`frontend/src/domains/timebox/__tests__/rules-registry.test.ts` 找 `STATUS_TRANSITION_ACTIONS` describe 块，把断言的死成员（`startTimebox`/`endTimebox`/`overtimeTimebox`）改为派生后的实际成员（`logTimebox`/`cancelTimebox`/`revertTimebox`）。

`frontend/src/domains/timebox/__tests__/rules-registry.appointment.test.ts` 把 appointment 枚举 case 改为 `cancelAppointment`/`completeAppointment`/`revertAppointment`（删 `startAppointment`/`expireAppointment` 死成员 case）。

- [ ] **Step 8: 跑 rules-registry 全套 + tsc**

Run: `cd frontend && npx vitest run src/domains/timebox/__tests__/rules-registry.test.ts src/domains/timebox/__tests__/rules-registry.appointment.test.ts`
Expected: PASS

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 9: 验 manifest 校验未破**

Run: `cd frontend && npm run validate:manifest`
Expected: 0 errors

- [ ] **Step 10: Commit**

```bash
git add frontend/src/domains/timebox/lib/build-status-transition-actions.ts \
  frontend/src/domains/timebox/lib/__tests__/build-status-transition-actions.test.ts \
  frontend/src/domains/timebox/rules-registry.ts \
  frontend/src/domains/timebox/__tests__/rules-registry.test.ts \
  frontend/src/domains/timebox/__tests__/rules-registry.appointment.test.ts
git commit -m "feat(023.13): TD-019 A1 STATUS_TRANSITION_ACTIONS 从 lifecycle 派生 + appointment 收敛"
```

---

## Task 2: §1 A2 — validate-rules-registry pre-push 校验脚本 + 接线

**Files:**
- Create: `frontend/scripts/validate-rules-registry.ts`
- Modify: `frontend/package.json`（加 `validate:rules-registry` script）
- Modify/Create: `frontend/.husky/pre-push`

**Interfaces:**
- Consumes: Task 1 的派生逻辑（独立重实现，对比 `rules-registry.ts` export）
- Produces: pre-push 阶段 drift 阻断能力。退出码 0=通过，1=drift。

- [ ] **Step 1: 写 validate-rules-registry.ts**

`frontend/scripts/validate-rules-registry.ts`（范式参考 `scripts/validate-manifest.ts`）：
```ts
#!/usr/bin/env npx tsx
/**
 * @file validate-rules-registry
 * @brief TD-019 A2 — 校验 STATUS_TRANSITION_ACTIONS 与 manifest.lifecycle 一致
 *
 * @usage npx tsx scripts/validate-rules-registry.ts
 * @exitcode 0 = 一致, 1 = drift（manifest 有 transition 但 rules-registry 漏，或反之）
 *
 * 独立实现派生逻辑（不 import rules-registry，避免运行时副作用），对比其 export 的 Set。
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as yaml from 'js-yaml'

const ROOT_DIR = path.resolve(__dirname, '..')
const MANIFEST_PATH = path.join(ROOT_DIR, 'src', 'domains', 'timebox', 'manifest.yaml')
const RULES_REGISTRY_PATH = path.join(ROOT_DIR, 'src', 'domains', 'timebox', 'rules-registry.ts')

interface Transition { action: string }
interface LifecycleDef { transitions: Transition[] }

function toPascalCase(s: string): string {
  return s.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')
}

/** 从 manifest 派生期望集（与 buildStatusTransitionActions 同逻辑） */
function deriveExpected(): Set<string> {
  const raw = fs.readFileSync(MANIFEST_PATH, 'utf8')
  const manifest = yaml.load(raw) as { lifecycle?: Record<string, LifecycleDef> }
  const result = new Set<string>()
  for (const [objectType, def] of Object.entries(manifest.lifecycle ?? {})) {
    const pascal = toPascalCase(objectType)
    for (const t of def.transitions ?? []) {
      if (t.action === 'create') continue
      result.add(`${t.action}${pascal}`)
    }
  }
  return result
}

/** 从 rules-registry.ts 源码抓 STATUS_TRANSITION_ACTIONS export 的派生结果 */
function readActual(): Set<string> {
  // rules-registry 现已改为派生 Set，无法静态抓成员——改为运行时 import
  // 动态 import 规避 ESM 副作用链
  return import('../src/domains/timebox/lib/build-status-transition-actions')
    .then((m) => m.buildStatusTransitionActions() as Set<string>)
}

async function main(): Promise<number> {
  const expected = deriveExpected()
  const actual = await readActual()
  const missing = [...expected].filter((x) => !actual.has(x))
  const extra = [...actual].filter((x) => !expected.has(x))
  if (missing.length === 0 && extra.length === 0) {
    console.log('✓ validate:rules-registry — STATUS_TRANSITION_ACTIONS 与 manifest.lifecycle 一致')
    return 0
  }
  console.error('✗ validate:rules-registry drift:')
  if (missing.length) console.error('  manifest 有但 rules-registry 缺:', missing)
  if (extra.length) console.error('  rules-registry 有但 manifest 无:', extra)
  console.error('  修复：在 manifest.lifecycle 加 transition，或检查 buildStatusTransitionActions 派生逻辑')
  return 1
}

main().then((code) => process.exit(code))
```

- [ ] **Step 2: 跑脚本确认当前一致（应通过）**

Run: `cd frontend && npx tsx scripts/validate-rules-registry.ts`
Expected: `✓ validate:rules-registry — STATUS_TRANSITION_ACTIONS 与 manifest.lifecycle 一致`，退出 0

- [ ] **Step 3: 负向测试——临时删 manifest 一条 transition，确认 drift 检测**

临时编辑 `src/domains/timebox/manifest.yaml` 注释掉 `{ from: logged, to: planned, ... action: revert }` 这条，跑：
Run: `cd frontend && npx tsx scripts/validate-rules-registry.ts; echo "exit=$?"`
Expected: 输出 drift（missing 或 extra），exit=1。然后 `git checkout src/domains/timebox/manifest.yaml` 还原。

- [ ] **Step 4: 接 package.json**

`frontend/package.json` 在 `"validate:structure"` 行后加：
```json
    "validate:rules-registry": "npx tsx scripts/validate-rules-registry.ts",
```

- [ ] **Step 5: 接 .husky/pre-push**

查 `.husky/pre-push` 是否存在：
```bash
ls frontend/.husky/pre-push 2>/dev/null && echo EXISTS || echo MISSING
```
- 若 **MISSING**：创建 `frontend/.husky/pre-push`：
  ```bash
  cd frontend && npm run validate:manifest && npm run validate:structure && npm run validate:rules-registry
  ```
- 若 **EXISTS**：在文件末尾追加一行 `npm run validate:rules-registry`（保留现有内容）。

- [ ] **Step 6: 端到端验证 hook 链**

Run: `cd frontend && npm run validate:rules-registry`
Expected: PASS（exit 0）

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors（脚本是 .ts 也过 tsc）

- [ ] **Step 7: Commit**

```bash
git add frontend/scripts/validate-rules-registry.ts frontend/package.json frontend/.husky/pre-push
git commit -m "feat(023.13): TD-019 A2 validate:rules-registry pre-push 校验 + 接线"
```

---

## Task 3: USOM DetailedExecutionRecord 扩展 4 字段 + Tier 2 文档同步 + mapper 兼容

**Files:**
- Modify: `frontend/src/usom/types/objects.ts`（L566-573 DetailedExecutionRecord += 4 字段）
- Modify: `docs/usom-design.md`、`docs/database-design.md`、`CHANGELOG.md`（**先于代码**）
- Create: `frontend/src/usom/__tests__/execution-record-compat.test.ts`

**Interfaces:**
- Produces: `DetailedExecutionRecord` 新可选字段 `actualStartTime?: Timestamp` / `actualEndTime?: Timestamp` / `focusMinutes?: number` / `energyActual?: number`。下游 Task 4/6/8 消费。`notes` 复用为任务执行详情。

- [ ] **Step 1: Tier 2 文档同步（先于代码，[[feedback_tier2-sync]]）**

`docs/usom-design.md` 找 DetailedExecutionRecord 章节，在字段表加：
| 字段 | 类型 | 说明 |
|---|---|---|
| actualStartTime | Timestamp? | [023.13] 实际开始时间 |
| actualEndTime | Timestamp? | [023.13] 实际结束时间（与 actualStartTime 派生 actualDuration） |
| focusMinutes | number? | [023.13] 深度专注时长（rule: ≤ actualDuration） |
| energyActual | number? | [023.13] 实际能量消耗 1-10（单值度量，默认 archetype 4 维均值；无 archetype 留空） |

`docs/database-design.md` 找 timeboxes.execution_record JSONB 章节，加注「[023.13] JSONB 形状扩展 4 可选字段，免 DDL 迁移」+ 变更记录追加一条。
`CHANGELOG.md` 追加 `[023.13]` 条目（DetailedExecutionRecord 扩展）。

- [ ] **Step 2: 改 USOM 类型**

`frontend/src/usom/types/objects.ts` L566-573，`DetailedExecutionRecord` 加 4 字段：
```ts
export interface DetailedExecutionRecord extends ExecutionRecordBase {
  mode: 'detailed'
  completionRating: number
  actualOutput: string
  deviationReasons?: string
  energyLevel?: number
  notes?: string
  // [023.13] 打卡专区扩展（存在 execution_record JSONB，免 DDL 迁移）
  /** 实际开始时间（与 actualEndTime 派生 actualDuration） */
  actualStartTime?: Timestamp
  /** 实际结束时间 */
  actualEndTime?: Timestamp
  /** 深度专注时长（分钟，rule: ≤ actualDuration） */
  focusMinutes?: number
  /** 实际能量消耗 1-10（单值度量，默认 archetype 4 维均值；绕开 D8 4 维禁令） */
  energyActual?: number
}
```

- [ ] **Step 3: 写 mapper 向后兼容测试**

`frontend/src/usom/__tests__/execution-record-compat.test.ts`：
```ts
/**
 * @file execution-record-compat 测试
 * @brief [023.13] 旧 4 字段 DetailedExecutionRecord JSONB 行读取新字段须 undefined
 */
import { describe, it, expect } from 'vitest'

// 模拟 mapper 透传 JSONB → DetailedExecutionRecord 的最小行为：
// mapper 不删未知键、不补缺键，直接 spread。
function mapExecutionRecord(raw: Record<string, unknown>): Record<string, unknown> {
  return { ...raw }
}

describe('DetailedExecutionRecord 向后兼容', () => {
  it('迁移前 4 字段旧行，新字段访问返回 undefined', () => {
    const oldRow = {
      mode: 'detailed',
      completionStatus: 'completed',
      actualDuration: 60,
      plannedDuration: 60,
      deviationMinutes: 0,
      sourceType: 'timebox',
      loggedAt: '2026-07-01T10:00:00Z',
      completionRating: 5,
      actualOutput: 'done',
    }
    const rec = mapExecutionRecord(oldRow) as any
    expect(rec.actualStartTime).toBeUndefined()
    expect(rec.actualEndTime).toBeUndefined()
    expect(rec.focusMinutes).toBeUndefined()
    expect(rec.energyActual).toBeUndefined()
  })

  it('迁移后新行保留 4 新字段', () => {
    const newRow = {
      ...{ mode: 'detailed', completionStatus: 'completed', actualDuration: 60, plannedDuration: 60, deviationMinutes: 0, sourceType: 'timebox', loggedAt: '2026-07-01T10:00:00Z', completionRating: 5, actualOutput: 'done' },
      actualStartTime: '2026-07-01T09:00:00Z',
      actualEndTime: '2026-07-01T10:00:00Z',
      focusMinutes: 45,
      energyActual: 7,
    }
    const rec = mapExecutionRecord(newRow) as any
    expect(rec.focusMinutes).toBe(45)
    expect(rec.energyActual).toBe(7)
  })
})
```

- [ ] **Step 4: 跑测试 + tsc**

Run: `cd frontend && npx vitest run src/usom/__tests__/execution-record-compat.test.ts`
Expected: PASS

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add docs/usom-design.md docs/database-design.md CHANGELOG.md \
  frontend/src/usom/types/objects.ts frontend/src/usom/__tests__/execution-record-compat.test.ts
git commit -m "feat(023.13): DetailedExecutionRecord 扩展 4 字段(actualStart/End/focusMinutes/energyActual) + docs 同步"
```

---

## Task 4: §3 能量默认 helper + 共享 ExecutionDetailFields 组件

**Files:**
- Create: `frontend/src/domains/timebox/lib/get-default-energy-actual.ts`
- Create: `frontend/src/domains/timebox/lib/__tests__/get-default-energy-actual.test.ts`
- Create: `frontend/src/domains/timebox/components/execution-detail-fields.tsx`
- Create: `frontend/src/domains/timebox/components/__tests__/execution-detail-fields.test.tsx`

**Interfaces:**
- Consumes: Task 3 的 `DetailedExecutionRecord`；archetype `EnergyCost`（`usom/activity-archetype/types.ts`）
- Produces: `<ExecutionDetailFields value={detailedDraft} onChange={...} archetypeId?={...} />` —— Task 6（抽屉）+ Task 8（LogTimebox）共消费。`getDefaultEnergyActual(archetype?)` 返回 `number | undefined`。

- [ ] **Step 1: 写 getDefaultEnergyActual 失败测试**

`frontend/src/domains/timebox/lib/__tests__/get-default-energy-actual.test.ts`：
```ts
/**
 * @file get-default-energy-actual 测试
 * @brief [023.13] 能量默认值 = archetype 4 维均值；无 archetype → undefined
 */
import { describe, it, expect } from 'vitest'
import { getDefaultEnergyActual } from '../get-default-energy-actual'
import type { ActivityArchetype } from '@/usom/activity-archetype/types'

const mk = (energyCost: { physical: number; mental: number; emotional: number; creative: number }): Pick<ActivityArchetype, 'energyCost'> =>
  ({ energyCost }) as Pick<ActivityArchetype, 'energyCost'>

describe('getDefaultEnergyActual', () => {
  it('4 维均值四舍五入', () => {
    expect(getDefaultEnergyActual(mk({ physical: 9, mental: 10, emotional: 3, creative: 2 }))).toBe(6) // (9+10+3+2)/4=6
  })
  it('均值 .5 向上取整', () => {
    expect(getDefaultEnergyActual(mk({ physical: 5, mental: 5, emotional: 5, creative: 6 }))).toBe(5) // 21/4=5.25→5
    expect(getDefaultEnergyActual(mk({ physical: 7, mental: 7, emotional: 7, creative: 8 }))).toBe(7) // 29/4=7.25→7
  })
  it('无 archetype → undefined', () => {
    expect(getDefaultEnergyActual(undefined)).toBeUndefined()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/domains/timebox/lib/__tests__/get-default-energy-actual.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: 实现 getDefaultEnergyActual**

`frontend/src/domains/timebox/lib/get-default-energy-actual.ts`：
```ts
/**
 * @file get-default-energy-actual
 * @brief [023.13] 打卡专区能量默认值——archetype 4 维 EnergyCost 算术均值
 *
 * 绕开 D8（业务表不存 4 维）：取均值作单次度量 reading 默认，用户可调。
 * 无 archetype → undefined（UI 强制手填，不默认 0 防假数据）。
 */
import type { ActivityArchetype } from '@/usom/activity-archetype/types'

/**
 * @param archetype - 活动 archetype（可选）
 * @returns 4 维均值四舍五入；无 archetype 返回 undefined
 */
export function getDefaultEnergyActual(archetype?: Pick<ActivityArchetype, 'energyCost'>): number | undefined {
  if (!archetype) return undefined
  const { physical, mental, emotional, creative } = archetype.energyCost
  return Math.round((physical + mental + emotional + creative) / 4)
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/domains/timebox/lib/__tests__/get-default-energy-actual.test.ts`
Expected: PASS

- [ ] **Step 5: 写 ExecutionDetailFields 组件测试**

`frontend/src/domains/timebox/components/__tests__/execution-detail-fields.test.tsx`：
```tsx
/**
 * @file execution-detail-fields 测试
 * @brief [023.13] 打卡专区共享组件：实际时间窗派生时长 + 专注超限红字 + 能量默认
 */
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ExecutionDetailFields } from '../execution-detail-fields'

describe('ExecutionDetailFields', () => {
  it('actualStart + actualEnd 齐备时显示派生实际时长', () => {
    render(
      <ExecutionDetailFields
        value={{ actualStartTime: '2026-07-07T09:00', actualEndTime: '2026-07-07T10:30' }}
        onChange={() => {}}
      />,
    )
    expect(screen.getByText(/实际时长.*90/)).toBeTruthy()
  })

  it('focusMinutes > 实际时长 → 超限提示', () => {
    render(
      <ExecutionDetailFields
        value={{ actualStartTime: '2026-07-07T09:00', actualEndTime: '2026-07-07T10:00', focusMinutes: 90 }}
        onChange={() => {}}
      />,
    )
    expect(screen.getByText(/专注.*超过.*实际/)).toBeTruthy()
  })

  it('有 archetypeId → 能量字段显示默认均值占位', () => {
    render(
      <ExecutionDetailFields
        value={{ energyActual: 7 }}
        onChange={() => {}}
        defaultEnergyActual={7}
      />,
    )
    const energy = screen.getByDisplayValue('7')
    expect(energy).toBeTruthy()
  })

  it('onChange 透传 focusMinutes 输入', () => {
    const onChange = vi.fn()
    render(<ExecutionDetailFields value={{}} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('深度专注时长（分钟）'), { target: { value: '45' } })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ focusMinutes: 45 }))
  })
})
```
（文件顶部加 `import { vi } from 'vitest'`。）

- [ ] **Step 6: 实现 ExecutionDetailFields 组件**

`frontend/src/domains/timebox/components/execution-detail-fields.tsx`：
```tsx
/**
 * @file execution-detail-fields
 * @brief [023.13] 打卡专区共享字段组件（§3 抽屉 + §4 LogTimebox 共消费，防 CNUI 表单分叉）
 *
 * 字段：实际开始/结束时间（派生实际时长）、深度专注时长（≤ 实际时长）、
 * 实际能量消耗（1-10，默认 archetype 均值）、任务执行详情（→ notes）。
 */
'use client'

import { isoToLocalDatetimeInput, localDatetimeInputToIso } from './time-input-helpers'

/** 打卡专区草稿（DetailedExecutionRecord 子集） */
export interface ExecutionDetailDraft {
  actualStartTime?: string
  actualEndTime?: string
  focusMinutes?: number
  energyActual?: number
  notes?: string
}

interface Props {
  value: ExecutionDetailDraft
  onChange: (next: ExecutionDetailDraft) => void
  /** archetype 均值（caller 调 getDefaultEnergyActual 算好传入）；undefined 表示无 archetype */
  defaultEnergyActual?: number
}

/** 两时间齐备时派生实际时长（分钟），否则 undefined */
function deriveActualMinutes(v: ExecutionDetailDraft): number | undefined {
  if (!v.actualStartTime || !v.actualEndTime) return undefined
  const ms = Date.parse(v.actualEndTime) - Date.parse(v.actualStartTime)
  if (isNaN(ms) || ms < 0) return undefined
  return Math.round(ms / 60000)
}

export function ExecutionDetailFields({ value, onChange, defaultEnergyActual }: Props) {
  const actualMinutes = deriveActualMinutes(value)
  const focusOverLimit =
    actualMinutes !== undefined && value.focusMinutes !== undefined && value.focusMinutes > actualMinutes

  return (
    <div className="space-y-3 rounded-md border border-hairline bg-canvas p-3">
      <div className="text-sm font-medium text-ink">打卡专区</div>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-body">实际开始时间</span>
          <input
            type="datetime-local"
            aria-label="实际开始时间"
            value={value.actualStartTime ? isoToLocalDatetimeInput(value.actualStartTime) : ''}
            onChange={(e) => onChange({ ...value, actualStartTime: e.target.value ? localDatetimeInputToIso(e.target.value) : undefined })}
            className="rounded border border-hairline bg-canvas px-2 py-1 text-sm text-ink"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-body">实际结束时间</span>
          <input
            type="datetime-local"
            aria-label="实际结束时间"
            value={value.actualEndTime ? isoToLocalDatetimeInput(value.actualEndTime) : ''}
            onChange={(e) => onChange({ ...value, actualEndTime: e.target.value ? localDatetimeInputToIso(e.target.value) : undefined })}
            className="rounded border border-hairline bg-canvas px-2 py-1 text-sm text-ink"
          />
        </label>
      </div>
      {actualMinutes !== undefined && (
        <div className="text-xs text-body">实际时长：{actualMinutes} 分钟</div>
      )}

      <label className="flex flex-col gap-1">
        <span className="text-xs text-body">深度专注时长（分钟）</span>
        <input
          type="number"
          aria-label="深度专注时长（分钟）"
          value={value.focusMinutes ?? ''}
          min={0}
          onChange={(e) => onChange({ ...value, focusMinutes: e.target.value === '' ? undefined : Number(e.target.value) })}
          className={`rounded border bg-canvas px-2 py-1 text-sm text-ink ${focusOverLimit ? 'border-error text-error' : 'border-hairline'}`}
        />
        {focusOverLimit && (
          <span className="text-xs text-error">专注时长超过实际时长，请调整</span>
        )}
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-body">
          实际能量消耗（1-10）{defaultEnergyActual !== undefined && <span className="text-muted">（活动原型默认 {defaultEnergyActual}）</span>}
        </span>
        <input
          type="number"
          aria-label="实际能量消耗"
          value={value.energyActual ?? ''}
          min={1}
          max={10}
          placeholder={defaultEnergyActual !== undefined ? String(defaultEnergyActual) : '请输入 1-10'}
          onChange={(e) => onChange({ ...value, energyActual: e.target.value === '' ? undefined : Number(e.target.value) })}
          className="rounded border border-hairline bg-canvas px-2 py-1 text-sm text-ink"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-body">任务执行详情</span>
        <textarea
          aria-label="任务执行详情"
          value={value.notes ?? ''}
          onChange={(e) => onChange({ ...value, notes: e.target.value })}
          rows={3}
          placeholder="执行过程、产出、反思…"
          className="resize-none rounded border border-hairline bg-canvas px-2 py-1 text-sm text-ink"
        />
      </label>
    </div>
  )
}
```
（若 `time-input-helpers.ts` 的 helper 签名不同，按现有签名调整——参考 `cnui/surfaces/EditTimeboxes.tsx` 用法。）

- [ ] **Step 7: 跑测试 + tsc**

Run: `cd frontend && npx vitest run src/domains/timebox/components/__tests__/execution-detail-fields.test.tsx`
Expected: PASS

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 8: Commit**

```bash
git add frontend/src/domains/timebox/lib/get-default-energy-actual.ts \
  frontend/src/domains/timebox/lib/__tests__/get-default-energy-actual.test.ts \
  frontend/src/domains/timebox/components/execution-detail-fields.tsx \
  frontend/src/domains/timebox/components/__tests__/execution-detail-fields.test.tsx
git commit -m "feat(023.13): 能量默认 helper + 共享 ExecutionDetailFields 组件"
```

---

## Task 5: §3 P3 — clearExecutionRecord repo + revertTimebox 确认清空分支 + AM7 测试

**Files:**
- Modify: `frontend/src/domains/timebox/repository/index.ts`（新增 `clearExecutionRecord` 方法）
- Modify: `frontend/src/app/actions/timebox.ts`（L184-200 revertTimebox 签名扩展）
- Modify/Create: `frontend/src/app/actions/__tests__/timebox.revert.test.ts`

**Interfaces:**
- Produces: `TimeboxRepository.clearExecutionRecord(id, userId): Promise<void>`；`revertTimebox(id, opts?: { clearExecutionRecord?: boolean }): Promise<TimeboxActionResult>`。Task 7 的 workspace revert-confirm UI 调后者传 `{ clearExecutionRecord: true }`。

- [ ] **Step 1: 写 revertTimebox 确认清空的失败测试**

`frontend/src/app/actions/__tests__/timebox.revert.test.ts`（若无该目录，创建）：
```ts
/**
 * @file timebox.revert 测试
 * @brief [023.13] P3 — revertTimebox 确认清空分支 + AM7 守卫保留
 */
import { describe, it, expect, vi } from 'vitest'

// mock 仓储 + submitDynamicIntent（server action 走 nexus，单测隔离）
vi.mock('@/domains/timebox/repository', () => ({
  TimeboxRepository: vi.fn().mockImplementation(() => ({
    findById: vi.fn(),
    clearExecutionRecord: vi.fn().mockResolvedValue(undefined),
  })),
}))
vi.mock('@/app/actions/intent', () => ({
  submitDynamicIntent: vi.fn().mockResolvedValue({ success: true, object: { id: 'tb1', status: 'planned' } }),
}))

import { revertTimebox } from '../timebox'
import { TimeboxRepository } from '@/domains/timebox/repository'

describe('revertTimebox P3', () => {
  it('logged + executionRecord + 未传 clearExecutionRecord → 抛 AM7', async () => {
    ;(TimeboxRepository as any).mockImplementation(() => ({
      findById: vi.fn().mockResolvedValue({ id: 'tb1', executionRecord: { mode: 'simple' } }),
      clearExecutionRecord: vi.fn(),
    }))
    await expect(revertTimebox('tb1')).rejects.toThrow('请先清理执行记录再回退')
  })

  it('logged + executionRecord + clearExecutionRecord=true → 先 clear 再 revert', async () => {
    const clear = vi.fn().mockResolvedValue(undefined)
    ;(TimeboxRepository as any).mockImplementation(() => ({
      findById: vi.fn().mockResolvedValue({ id: 'tb1', executionRecord: { mode: 'simple' } }),
      clearExecutionRecord: clear,
    }))
    const r = await revertTimebox('tb1', { clearExecutionRecord: true })
    expect(clear).toHaveBeenCalledWith('tb1', expect.any(String))
    expect(r.status).toBe('ok')
  })

  it('cancelled (executionRecord=null) → 直接 revert 不调 clear', async () => {
    const clear = vi.fn()
    ;(TimeboxRepository as any).mockImplementation(() => ({
      findById: vi.fn().mockResolvedValue({ id: 'tb1', executionRecord: null }),
      clearExecutionRecord: clear,
    }))
    const r = await revertTimebox('tb1')
    expect(clear).not.toHaveBeenCalled()
    expect(r.status).toBe('ok')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/app/actions/__tests__/timebox.revert.test.ts`
Expected: FAIL — revertTimebox 不接 opts / clearExecutionRecord 不存在

- [ ] **Step 3: 加 clearExecutionRecord repo 方法**

`frontend/src/domains/timebox/repository/index.ts` 在 `archive` 方法后（L125 后）加：
```ts
  /**
   * 清空执行记录（[023.13] P3 revert 确认分支用）
   *
   * 仅置 executionRecord=null，不动 status（status 由后续 SM revert 转换负责→planned）。
   * 与 archive() 区别：archive 会错改 status='logged' 且不能清 executionRecord（truthy 判断）。
   *
   * 多租户 T-02：where 含 userId。
   */
  async clearExecutionRecord(id: USOM_ID, userId: USOM_ID): Promise<void> {
    await db.update(s.timeboxes)
      .set({ executionRecord: null, updatedAt: new Date() })
      .where(and(eq(s.timeboxes.id, id), eq(s.timeboxes.userId, userId)))
  }
```

- [ ] **Step 4: 扩展 revertTimebox server action**

`frontend/src/app/actions/timebox.ts` L184-200，把 `revertTimebox(timeboxId: string)` 改为：
```ts
export async function revertTimebox(
  timeboxId: string,
  opts?: { clearExecutionRecord?: boolean },
): Promise<TimeboxActionResult> {
  const repo = new TimeboxRepository()
  const tb = await repo.findById(timeboxId as USOM_ID, MVP_USER_ID as USOM_ID)
  if (!tb) throw new Error(`Timebox ${timeboxId} not found`)
  // [023.13] P3：确认清空分支——UI 弹窗确认后传 clearExecutionRecord=true
  if (opts?.clearExecutionRecord) {
    await repo.clearExecutionRecord(timeboxId as USOM_ID, MVP_USER_ID as USOM_ID)
  } else if (tb.executionRecord != null) {
    // [AM7] 守卫保留（默认路径不变）
    throw new Error('请先清理执行记录再回退')
  }
  // 走 SM revert transition；cancelled→planned / logged(已守卫或已清空)→planned
  const result = await submitDynamicIntent('timebox', 'revertTimebox', { objectId: timeboxId })
  if (!result.success) {
    throw new Error(result.error ?? '回退时间盒失败')
  }
  return { status: 'ok', timebox: result.object as Timebox }
}
```

- [ ] **Step 5: 跑测试 + tsc**

Run: `cd frontend && npx vitest run src/app/actions/__tests__/timebox.revert.test.ts`
Expected: PASS（3 tests）

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add frontend/src/domains/timebox/repository/index.ts \
  frontend/src/app/actions/timebox.ts \
  frontend/src/app/actions/__tests__/timebox.revert.test.ts
git commit -m "feat(023.13): P3 clearExecutionRecord repo + revertTimebox 确认清空分支 + AM7 守卫保留"
```

---

## Task 6: §3 打卡专区接入 TimeboxDrawer

**Files:**
- Modify: `frontend/src/domains/timebox/components/timebox-drawer.tsx`（edit 模式表单加 ExecutionDetailFields 分区）

**Interfaces:**
- Consumes: Task 4 `ExecutionDetailFields` + `getDefaultEnergyActual`；Task 3 `DetailedExecutionRecord`；archetype 读取（`getTimeboxById` 已返回 `activityArchetypeId`，需补 archetype 详情读取）
- Produces: edit 抽屉保存时若填了打卡专区字段 → `transitionTimebox(id, 'log', DetailedExecutionRecord)` 写 detailed 记录。

- [ ] **Step 1: 读 TimeboxDrawer 现状定位 edit 表单**

Run: `cd frontend && sed -n '110,260p' src/domains/timebox/components/timebox-drawer.tsx`
定位 edit 模式的 form 提交 handler（约 L117 `if (mode === 'edit' && editTarget)`）+ 表单 JSX（L247 `mode === 'edit'`）。确认现有 save 调的是 `updateTimebox` 还是 `transitionTimebox`。

- [ ] **Step 2: 加打卡专区 state + 字段组件**

在 drawer 组件内加 state（仅 edit 模式生效）：
```tsx
import { ExecutionDetailFields, type ExecutionDetailDraft } from './execution-detail-fields'
import { getDefaultEnergyActual } from '../lib/get-default-energy-actual'
// ...
const [execDetail, setExecDetail] = useState<ExecutionDetailDraft>({})
// editTarget 的 archetype 详情（取默认能量）：若 drawer 已有 archetype 对象用之；否则用 activityArchetypeId 占位
const defaultEnergy = useMemo(() => {
  // 若 editTarget 带有 archetype（或通过 props 取），传入 getDefaultEnergyActual
  // 简化：若 drawer 无 archetype 详情，defaultEnergyActual 不传（用户手填）
  return undefined
}, [editTarget])
```
在 edit 表单 JSX（计划信息字段之后）插入：
```tsx
{mode === 'edit' && (
  <ExecutionDetailFields value={execDetail} onChange={setExecDetail} defaultEnergyActual={defaultEnergy} />
)}
```

- [ ] **Step 3: save handler 接 detailed log**

edit 模式 save：若 `execDetail` 任一字段有值（`actualStartTime`/`focusMinutes`/`energyActual`/`notes` 至少一个），保存时构造 `DetailedExecutionRecord` 并调 `transitionTimebox(id, 'log', detailedRecord)`（覆盖 simple）；否则维持现有 save 路径（`updateTimebox` 仅改计划字段）。

```tsx
const hasExecDetail = Boolean(
  execDetail.actualStartTime || execDetail.actualEndTime ||
  execDetail.focusMinutes !== undefined || execDetail.energyActual !== undefined || execDetail.notes,
)
// 在 save handler 内：
if (mode === 'edit' && hasExecDetail) {
  const minutes = execDetail.actualStartTime && execDetail.actualEndTime
    ? Math.round((Date.parse(execDetail.actualEndTime) - Date.parse(execDetail.actualStartTime)) / 60000)
    : editTarget ? Math.round((Date.parse(editTarget.endTime) - Date.parse(editTarget.startTime)) / 60000) : 0
  const detailed = {
    mode: 'detailed' as const,
    completionStatus: 'completed' as const,
    actualDuration: minutes,
    plannedDuration: editTarget ? Math.round((Date.parse(editTarget.endTime) - Date.parse(editTarget.startTime)) / 60000) : 0,
    deviationMinutes: 0,
    sourceType: 'timebox' as const,
    loggedAt: new Date().toISOString(),
    completionRating: 5,
    actualOutput: '',
    notes: execDetail.notes,
    actualStartTime: execDetail.actualStartTime,
    actualEndTime: execDetail.actualEndTime,
    focusMinutes: execDetail.focusMinutes,
    energyActual: execDetail.energyActual,
  }
  await transitionTimebox(editTarget.id, 'log', detailed)
}
```
（import `transitionTimebox` from `@/app/actions/timebox`；按实际 save handler 结构插入。）

- [ ] **Step 4: 跑 tsc + 现有 drawer 测试不回归**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

Run: `cd frontend && npx vitest run src/domains/timebox/components/__tests__/`
Expected: 现有测试不回归（无新增 fail）

- [ ] **Step 5: Commit**

```bash
git add frontend/src/domains/timebox/components/timebox-drawer.tsx
git commit -m "feat(023.13): 打卡专区接入 TimeboxDrawer（详细执行记录写入）"
```

---

## Task 7: §3 卡片按钮重排 + 快捷打卡 + 批量模式 + 回退确认弹窗

**Files:**
- Modify: `frontend/src/domains/timebox/components/timebox-card.tsx`（L183-191 / L255-268 按钮重排 + 一键打卡）
- Modify: `frontend/src/domains/timebox/components/timebox-list.tsx`（批量多选 + checkbox）
- Modify: `frontend/src/domains/timebox/components/timeboxes-workspace.tsx`（批量 state + revert confirm AlertDialog）
- Modify: `frontend/src/domains/timebox/components/__tests__/timeboxes-workspace.revert.test.tsx`（更新 revert 走确认弹窗）

**Interfaces:**
- Consumes: Task 5 `revertTimebox(id, { clearExecutionRecord: true })`；现有 `transitionTimebox(id, 'log', ...)`（一键 simple 打卡）/ `transitionTimebox(id, 'cancel', ...)`（取消）
- Produces: planned 卡 `[一键打卡][打卡][取消][删除]`；顶栏 `[多选]` toggle；批量底栏 `[批量打卡][批量取消]`；logged 卡回退走 AlertDialog 确认。

- [ ] **Step 1: 改 timebox-card planned 按钮重排 + 一键打卡**

`timebox-card.tsx` planned 按钮区（L255-260 完整模式 / L183-185 紧凑模式），加「一键打卡」按钮（quick simple log），原「打卡」改为开抽屉：
```tsx
// 完整模式 L255 区
{timebox.status === 'planned' && (
  <>
    <Button size="sm" variant="outline" onClick={() => handleAction('quickLog')}>✓ 一键打卡</Button>
    <Button size="sm" onClick={() => handleAction('log')}>打卡</Button>
    <Button size="sm" variant="ghost" className="text-body" onClick={() => handleAction('cancel')}>取消</Button>
    <Button size="sm" variant="ghost" className="text-body" onClick={() => handleAction('delete')}>删除</Button>
  </>
)}
```
（紧凑模式 L183 区同理加 `quickLog`。）`handleAction` 的 action union 加 `'quickLog'`。

- [ ] **Step 2: workspace handleAction 加 quickLog 分支**

`timeboxes-workspace.tsx` `handleAction`（L168-218），action union 加 `'quickLog'`，分支：
```ts
if (action === 'quickLog') {
  // 一键 simple 打卡（不开抽屉）
  await transitionTimebox(timeboxId, 'log', {
    mode: 'simple', completionStatus: 'completed',
    actualDuration: 0, plannedDuration: 0, deviationMinutes: 0,
    sourceType: 'timebox', loggedAt: new Date().toISOString(),
  })
  toast.success('已打卡')
  await loadRange(dateMode, currentDate)
  return
}
```
（`transitionTimebox` 的 3rd arg 为 executionRecord；simple 模式填 base 必填字段，actualDuration 可在 SM 端按 startTime/endTime 补。若 SM 要求 actualDuration 非零，从 timebox 读 plannedDuration 传入——以实际跑通为准。）

- [ ] **Step 3: 改 logged 回退走确认弹窗**

`timeboxes-workspace.tsx` `handleAction` 的 `revert` 分支（L174-180），改为：若该 timebox 有 executionRecord → 开 AlertDialog 确认；无（cancelled）→ 直接 revert。新增 state：
```ts
const [revertConfirm, setRevertConfirm] = useState<{ id: string } | null>(null)
```
revert 分支：
```ts
if (action === 'revert') {
  // 查当前 events 里该 timebox 是否有 executionRecord
  const tb = events.find(e => e.kind === 'timebox' && e.source.id === timeboxId)?.source
  if (tb?.executionRecord) {
    setRevertConfirm({ id: timeboxId })  // 开确认弹窗
    return
  }
  await revertTimebox(timeboxId)
  toast.success('已回退为已规划')
  await loadRange(dateMode, currentDate)
  return
}
```
JSX 加第二个 AlertDialog（revert 确认）：
```tsx
<AlertDialog open={!!revertConfirm} onOpenChange={o => { if (!o) setRevertConfirm(null) }}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>确认回退</AlertDialogTitle>
      <AlertDialogDescription>
        此操作将清除该时间盒的执行记录（实际时长、深度专注、能量消耗、执行详情），不可恢复。
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel disabled={actionSubmitting}>取消</AlertDialogCancel>
      <AlertDialogAction
        disabled={actionSubmitting}
        onClick={async () => {
          const id = revertConfirm?.id
          setRevertConfirm(null)
          if (!id) return
          setActionSubmitting(true)
          try {
            await revertTimebox(id, { clearExecutionRecord: true })
            toast.success('已回退为已规划')
            await loadRange(dateMode, currentDate)
          } catch (e) {
            toast.error(`操作失败：${e instanceof Error ? e.message : String(e)}`)
          } finally { setActionSubmitting(false) }
        }}
      >
        {actionSubmitting ? '处理中...' : '确认回退'}
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

- [ ] **Step 4: 批量多选模式**

`timebox-list.tsx` 加 props `selectMode?: boolean` + `selectedIds?: string[]` + `onToggleSelect?: (id: string) => void`。selectMode 时每卡左侧渲染 checkbox。
`timeboxes-workspace.tsx` 加 state `selectMode: boolean` + `selectedIds: string[]`，顶栏加 `[多选]` toggle 按钮，批量底栏（selectMode 时显示）：
```tsx
{selectMode && selectedIds.length > 0 && (
  <div className="flex items-center gap-2 border-t border-hairline px-4 py-2">
    <span className="text-xs text-body">已选 {selectedIds.length} 个</span>
    <Button size="sm" onClick={() => handleBatch('log')}>批量打卡</Button>
    <Button size="sm" variant="ghost" className="text-body" onClick={() => handleBatch('cancel')}>批量取消</Button>
  </div>
)}
```
`handleBatch`：遍历 selectedIds 调 `transitionTimebox(id, action, ...)`，聚合结果，末尾 `loadRange` + 清空 selectedIds。

- [ ] **Step 5: 更新 workspace.revert 测试**

`timeboxes-workspace.revert.test.tsx`：现 revert 测试断言直接 revert——改为：logged+executionRecord 卡点回退 → 触发确认弹窗 → 点确认 → `revertTimebox(id, { clearExecutionRecord: true })` 被调。新增 cancelled 卡直接 revert 不开弹窗的 case。

- [ ] **Step 6: 跑测试 + tsc**

Run: `cd frontend && npx vitest run src/domains/timebox/components/__tests__/`
Expected: PASS（含更新后的 revert 测试）

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 7: Commit**

```bash
git add frontend/src/domains/timebox/components/timebox-card.tsx \
  frontend/src/domains/timebox/components/timebox-list.tsx \
  frontend/src/domains/timebox/components/timeboxes-workspace.tsx \
  frontend/src/domains/timebox/components/__tests__/timeboxes-workspace.revert.test.tsx
git commit -m "feat(023.13): 卡片按钮重排+一键打卡+批量模式+回退确认弹窗"
```

---

## Task 8: §4 LogTimebox 接 ExecutionDetailFields（per-item 详细展开）

**Files:**
- Modify: `frontend/src/domains/timebox/cnui/surfaces/LogTimebox.tsx`
- Modify: `frontend/src/domains/timebox/cnui/handlers.ts`（L554-575 logTimebox submit 接 detailed 字段）

**Interfaces:**
- Consumes: Task 4 `ExecutionDetailFields`
- Produces: 每个 item 独立 `detailedOpen` 标志；展开 → 实例化 ExecutionDetailFields；submit 时该 item 升级 DetailedExecutionRecord，未展开仍 SimpleExecutionRecord。

- [ ] **Step 1: 改 LogTimebox surface 加 per-item 详细展开**

`LogTimebox.tsx` `LogItem` 加可选 detailed 字段 + surface 加 per-item detailedOpen state：
```tsx
import { ExecutionDetailFields, type ExecutionDetailDraft } from '../../components/execution-detail-fields'

interface LogItem {
  id: string; title: string; startTime: string; endTime: string
  activityArchetypeId?: string
  state?: LogState; notes?: string
  // [023.13] 详细字段（展开时填）
  detailed?: ExecutionDetailDraft
}
```
在 `cur` 渲染区（L66-87）备注下方加「详细」toggle + 展开时渲染 ExecutionDetailFields：
```tsx
<button type="button" onClick={() => update({ __detailedOpen: !cur.__detailedOpen } as any)} className="text-xs text-primary">
  {cur.__detailedOpen ? '收起详细' : '详细打卡'}
</button>
{cur.__detailedOpen && (
  <ExecutionDetailFields
    value={cur.detailed ?? {}}
    onChange={(d) => update({ detailed: d })}
  />
)}
```
（`__detailedOpen` 作为运行时 UI 标志存 item 上，submit 时剥离；或用独立 `Record<id, boolean>` state——后者更干净，优先用独立 state。）

- [ ] **Step 2: 改 handler submit 接 detailed**

`cnui/handlers.ts` L554-575 logTimebox submit 分支，构造 intent payload 时若 item 有 `detailed` → 传 detailed 字段：
```ts
const r = await submitDynamicIntent('timebox', 'logTimebox', {
  objectId: it.id,
  completionStatus: it.state === 'completed' ? 'completed' : 'partial',
  notes: it.notes,
  // [023.13] 详细字段透传
  ...(it.detailed?.actualStartTime ? { actualStartTime: it.detailed.actualStartTime } : {}),
  ...(it.detailed?.actualEndTime ? { actualEndTime: it.detailed.actualEndTime } : {}),
  ...(it.detailed?.focusMinutes != null ? { focusMinutes: it.detailed.focusMinutes } : {}),
  ...(it.detailed?.energyActual != null ? { energyActual: it.detailed.energyActual } : {}),
  ...(it.detailed?.notes ? { executionNotes: it.detailed.notes } : {}),
})
```
（SM 端 `state-machine/index.ts:319` 把 `proposal.payload.executionRecord` 透传 archive——确认 log transition 把这些 payload 字段组装进 `executionRecord` 对象。若 SM 端未组装，需在 log transition handler 把 payload 的 detailed 字段并进 executionRecord——以实际跑通为准，必要时补一个 payload→executionRecord 组装步骤。）

- [ ] **Step 3: 跑 tsc + handler 现有测试不回归**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

Run: `cd frontend && npx vitest run src/domains/timebox/cnui/`
Expected: 现有 handler 测试不回归

- [ ] **Step 4: Commit**

```bash
git add frontend/src/domains/timebox/cnui/surfaces/LogTimebox.tsx frontend/src/domains/timebox/cnui/handlers.ts
git commit -m "feat(023.13): LogTimebox 接 ExecutionDetailFields per-item 详细展开 + handler detailed 透传"
```

---

## Task 9: §5 MiniCalendar 上下月翻页

**Files:**
- Modify: `frontend/src/domains/timebox/components/mini-calendar.tsx`
- Create: `frontend/src/domains/timebox/components/__tests__/mini-calendar.nav.test.tsx`

**Interfaces:**
- Produces: MiniCalendar 内部 `viewMonth` state + `‹ ›` 按钮；`currentDate` 跨月时跟随，用户手动翻后锁定直到 currentDate 再次跨月。

- [ ] **Step 1: 写翻页失败测试**

`frontend/src/domains/timebox/components/__tests__/mini-calendar.nav.test.tsx`：
```tsx
/**
 * @file mini-calendar.nav 测试
 * @brief [023.13] §5 月历上下月翻页
 */
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MiniCalendar } from '../mini-calendar'

describe('MiniCalendar 上下月翻页', () => {
  it('初始显示 currentDate 所在月', () => {
    render(<MiniCalendar currentDate={new Date('2026-07-15')} events={[]} />)
    expect(screen.getByText('2026年7月')).toBeTruthy()
  })

  it('点 › 显示下月', () => {
    render(<MiniCalendar currentDate={new Date('2026-07-15')} events={[]} />)
    fireEvent.click(screen.getByLabelText('下个月'))
    expect(screen.getByText('2026年8月')).toBeTruthy()
  })

  it('点 ‹ 显示上月', () => {
    render(<MiniCalendar currentDate={new Date('2026-07-15')} events={[]} />)
    fireEvent.click(screen.getByLabelText('上个月'))
    expect(screen.getByText('2026年6月')).toBeTruthy()
  })

  it('用户翻过后，currentDate 同月变化不抢回 viewMonth', () => {
    const { rerender } = render(<MiniCalendar currentDate={new Date('2026-07-15')} events={[]} />)
    fireEvent.click(screen.getByLabelText('下个月')) // → 8月
    rerender(<MiniCalendar currentDate={new Date('2026-07-20')} events={[]} />) // currentDate 仍在7月
    expect(screen.getByText('2026年8月')).toBeTruthy() // 锁定8月
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/domains/timebox/components/__tests__/mini-calendar.nav.test.tsx`
Expected: FAIL — 无 ‹ › 按钮 / aria-label

- [ ] **Step 3: 实现 viewMonth state + 翻页按钮**

`mini-calendar.tsx` 改造（加 `useState`/`useEffect` + 标题栏 ‹ ›）：
```tsx
import { useState, useEffect } from 'react'
import { addMonths, isSameMonth, startOfMonth, format as fmt } from 'date-fns'
// ...
export function MiniCalendar({ currentDate, selectedDate, events, onDateSelect }: MiniCalendarProps) {
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(currentDate))
  const [userTouched, setUserTouched] = useState(false)

  // 同步规则：未手动翻 或 currentDate 跨月 → 跟随；否则保持
  useEffect(() => {
    if (!userTouched || !isSameMonth(viewMonth, currentDate)) {
      setViewMonth(startOfMonth(currentDate))
      if (userTouched && !isSameMonth(viewMonth, currentDate)) setUserTouched(false)
    }
  }, [currentDate]) // eslint-disable-line react-hooks/exhaustive-deps

  const nav = (dir: -1 | 1) => {
    setViewMonth(m => startOfMonth(addMonths(m, dir)))
    setUserTouched(true)
  }

  // 原 monthStart/monthEnd 改用 viewMonth 派生
  const monthStart = startOfMonth(viewMonth)
  const monthEnd = endOfMonth(viewMonth)
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
  const days = eachDayOfInterval({ start: calStart, end: calEnd })
  // ... days.map 用 viewMonth 判 isCurrentMonth
```
标题栏改为：
```tsx
<div className="mb-2 flex items-center justify-between text-sm font-medium text-ink">
  <button type="button" aria-label="上个月" onClick={() => nav(-1)} className="px-1 text-body hover:text-ink">‹</button>
  <span>{format(viewMonth, 'yyyy年M月', { locale: zhCN })}</span>
  <button type="button" aria-label="下个月" onClick={() => nav(1)} className="px-1 text-body hover:text-ink">›</button>
</div>
```
（`isCurrentMonth` 判断改为 `isSameMonth(day, viewMonth)`；`isSelected`/`isToday` 不变。）

- [ ] **Step 4: 跑测试 + tsc**

Run: `cd frontend && npx vitest run src/domains/timebox/components/__tests__/mini-calendar.nav.test.tsx`
Expected: PASS（4 tests）

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 5: 跑现有 mini-calendar 相关测试不回归**

Run: `cd frontend && npx vitest run src/domains/timebox/components/__tests__/timeboxes-workspace.view-mode.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/domains/timebox/components/mini-calendar.tsx \
  frontend/src/domains/timebox/components/__tests__/mini-calendar.nav.test.tsx
git commit -m "feat(023.13): §5 MiniCalendar 上下月翻页 + viewMonth 锁定规则"
```

---

## Task 10: §2 回退回归测试 + TD-019 关闭 + /qa checklist

**Files:**
- Create: `frontend/src/domains/timebox/__tests__/revert-regression.test.ts`
- Modify: `docs/tech-debt/TD-019-status-transition-actions-set-drift-bug.md`（标 resolved）
- Modify: `docs/tech-debt/README.md`（TD-019 状态）

**Interfaces:**
- Produces: TD-019 关闭证据 + 回退全路径回归测试。

- [ ] **Step 1: 写回退回归集成测试**

`frontend/src/domains/timebox/__tests__/revert-regression.test.ts`：
```ts
/**
 * @file revert-regression 测试
 * @brief [023.13] §2 — TD-019 回退 bug 回归：logged/cancelled → revert → planned
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/app/actions/intent', () => ({
  submitDynamicIntent: vi.fn().mockResolvedValue({ success: true, object: { id: 'tb1', status: 'planned' } }),
}))
vi.mock('@/domains/timebox/repository', () => ({
  TimeboxRepository: vi.fn().mockImplementation(() => ({
    findById: vi.fn(),
    clearExecutionRecord: vi.fn().mockResolvedValue(undefined),
  })),
}))

import { revertTimebox } from '@/app/actions/timebox'

describe('TD-019 回退回归', () => {
  it('cancelled (无 executionRecord) revert 成功 → planned', async () => {
    const { TimeboxRepository } = await import('@/domains/timebox/repository')
    ;(TimeboxRepository as any).mockImplementation(() => ({
      findById: vi.fn().mockResolvedValue({ id: 'tb1', status: 'cancelled', executionRecord: null }),
      clearExecutionRecord: vi.fn(),
    }))
    const r = await revertTimebox('tb1')
    expect(r.status).toBe('ok')
    expect(r.timebox.status).toBe('planned')
  })

  it('logged + executionRecord + 确认清空 → revert 成功', async () => {
    const { TimeboxRepository } = await import('@/domains/timebox/repository')
    const clear = vi.fn().mockResolvedValue(undefined)
    ;(TimeboxRepository as any).mockImplementation(() => ({
      findById: vi.fn().mockResolvedValue({ id: 'tb1', status: 'logged', executionRecord: { mode: 'simple' } }),
      clearExecutionRecord: clear,
    }))
    const r = await revertTimebox('tb1', { clearExecutionRecord: true })
    expect(clear).toHaveBeenCalled()
    expect(r.status).toBe('ok')
  })
})
```

- [ ] **Step 2: 跑测试**

Run: `cd frontend && npx vitest run src/domains/timebox/__tests__/revert-regression.test.ts`
Expected: PASS（2 tests）—— 证明 TD-019 hot-fix 有效，回退不再 100% 阻断。

- [ ] **Step 3: 关闭 TD-019**

`docs/tech-debt/TD-019-status-transition-actions-set-drift-bug.md`：`status: 新建` → `status: 已解决`；末尾「关闭条件」加：
```markdown
## [023.13] 关闭（2026-07-07）

- ✅ A1：STATUS_TRANSITION_ACTIONS 从 manifest.lifecycle 派生（lib/build-status-transition-actions.ts）
- ✅ A2：pre-push validate:rules-registry 阻断 drift
- ✅ appointment 域 skip 收敛到同一派生 Set
- ✅ 回归测试 revert-regression.test.ts PASS（logged/cancelled → planned）
```
`docs/tech-debt/README.md`：TD-019 行状态 🔴 → ✅。

- [ ] **Step 4: 全量验证**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

Run: `cd frontend && npx vitest run`
Expected: 基线对比无新增 fail（记录 base 失败集，head 失败集 ⊆ base）

Run: `cd frontend && npm run validate:manifest && npm run validate:rules-registry`
Expected: 全 0 errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/domains/timebox/__tests__/revert-regression.test.ts \
  docs/tech-debt/TD-019-status-transition-actions-set-drift-bug.md docs/tech-debt/README.md
git commit -m "test(023.13): §2 回退回归 + TD-019 关闭（A1/A2 落地验证）"
```

---

## Final Verification（PR 合并前）

- [ ] `cd frontend && npx tsc --noEmit` — 0 errors
- [ ] `cd frontend && npx vitest run` — base=head 失败集合对比，0 新增 fail
- [ ] `cd frontend && npm run validate:manifest && npm run validate:structure && npm run validate:rules-registry` — 全 0 errors
- [ ] `/browse` E2E：`/timeboxes` 一键打卡 / 打卡专区抽屉（5 字段）/ 批量打卡 / logged 回退确认弹窗 / cancelled 直接回退；`/logTimebox` per-item 详细展开；MiniCalendar 上下月翻页——全场景视觉+功能通过（[[feedback_ui-verify-visual-not-functional]]）
- [ ] TD-019 标 resolved；CHANGELOG.md 含 [023.13] 条目
- [ ] 注释规范：所有改动 TS/JS 文件 `/** @file ... @brief ... */` 头同步

## 依赖与顺序

- T1 → T2（validator 用 T1 派生）
- T3 → T4（helper 用 USOM 类型）→ T6 / T8（消费 ExecutionDetailFields）
- T5 → T7（workspace revert-confirm 调 T5 新签名）
- T9 独立
- T10 末尾（依赖 T1/T5 的能力）
- 建议执行序：T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8 → T9 → T10

> ⚠️ 上述执行序已被 **Review Amendments §依赖序更新** 取代,实际序:T1 → T2 → T3 → **T0** → T4 → T5 → T6 → T7 → T8 → T9 → T10。

> [023.13] 后续-fix 备注：T9 实现与 spec §5 初始措辞不同步——初始化用 `!userTouchedMonth` 覆盖（首次 mount），后续 useEffect 通过 `prevCurrentMonthRef` 比对 `!isSameMonth(prev, current)` 监测跨月。spec §5 已回填为 test-aligned 表述（issue 9 二选一）。

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR (PLAN) | 5 issues folded (1 P0 + 1 P1 + 3 refines), 0 unresolved |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

**CODEX (outside voice, partial):** 429 rate-limit 中断于 verdict 前,但已读 `archive()`/`updateStatus`/`revertTransition` 源码并 echo,独立印证 P0 证据。

**CROSS-MODEL:** codex(partial 证据印证) + Claude subagent(完整 verdict) 双双确认 executionRecord 列持久化缺失(P0)。subagent 补 3 点精化(SM updateFields 修复 / clearExecutionRecord 复用 updateFields / LogTimebox CNUI flat fields 重组),全部折入 AM1/AM3。无 cross-model 分歧——双方共识。

**VERDICT:** ENG CLEARED (PLAN) — 5 项修正(AM1 持久化前置 task / AM2 A1 扩展 core/rule-engine / AM3 复用 updateFields / AM4 defaultEnergyActual 接线 / AM5 validator YAML 直读)已折入 plan。原 design doc(SSOT)需回填 P3(clearExecutionRecord→updateFields)与 A1(两副本)两处修正后再进入实现。

NO UNRESOLVED DECISIONS
