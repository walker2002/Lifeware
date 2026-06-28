# [023] Timebox Domain 重组 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重组 Timebox 域（5 action 标准化 + 跨域 Activity Archetype 共享本体 + EnergyState 能量管理），让每个时间盒携带能量语义。

**Architecture:** Approach A 4 子阶段增量（A0 Phase 0 基础设施 → A1 USOM Activity Archetype → A2 Timebox 域重写 → A3 Tasks/Habits 接入 → A4 KR junction + manifest 清理）。本文件含 **A0 完整 task-by-task plan** + **A1-A4 大纲**（后续各自单独写详细 plan）。

**Tech Stack:** Next.js 16 / React 19 / TypeScript 5 / Drizzle ORM / vitest / 手写 SQL 迁移

## 关键决策（plan 前置，来自 design doc + writing-plans 澄清）

- **D8/D9/OQ-6（plan-eng-review 最新决策）**：MVP **不做 applyEvent 自动扣减 EnergyState**。能量消耗记录 = timebox/task/habit 完成时存 `activityArchetypeId`（+可选 EnergyCost 快照）作为对象自身字段，走正常 mutation。EnergyState.activeLevel 更新 = 手动校准（SM 写）+ EnergyCurve 推断（读时算）。**design doc Success Criteria 第 253-258 行（applyEvent 扣减/optimistic locking/event_id 幂等/dead_letter_events/reconcile job）为 office-hours 残留，已作废**——本 plan 不实现扣减链路。
- **D10**：peakHours/lowHours 5 处重复（`energy-profile-provider.ts` / `register-providers.ts` / `scheduling-handler.ts:32` / `process.ts:67` / `schema.ts:582`）整合为单一 `EnergyCurve` 类型 + `DEFAULT_ENERGY_CURVE` 常量，归 ContextEngine（`EnergyStateManager.curve()`）。
- **D9**：EnergyStateManager 骨架建在 `nexus/context-engine/`，`current()`/`trend()`/`curve()` 实现，`applyEvent` 签名预留不接线。
- **codex E5**：timebox `rules-registry.ts` 新建，`onValidate` 改薄壳委托 `evaluateDomainRules`，对齐 [018-G3]/[020] tasks/habits 范式。

## Global Constraints

- **分支**：`feat/023-timebox-domain-reorg`（worktree `/home/walker/lifeware-timebox`，HEAD = main = 622c5f9 [022]，含 rules 三层 + 跨域事件基础设施）。
- **vitest 必须在 `frontend/` cwd 跑**（`@/` 映射，repo root 跑会假失败）；tsc 双验证（vitest 不做类型检查）。
- **Change Gate**：base/head 失败集合对比，别用硬编码失败数。
- **注释全简体中文**；每个新建/修改 TS 文件须有 `/** @file ... @brief ... */` 文件头。
- **drizzle 迁移手写**（`npm run db:generate/migrate` 跑不通，snapshot 债）：SQL 手写 + psql + 登记 `_journal.json`。A0 无 schema 变更（仅类型/代码整合），不涉及迁移。
- **CSS 变量令牌**（UI-DESIGN-SPEC）：`bg-canvas`/`text-ink` 等，禁 Tailwind 默认颜色类（A2+ UI 阶段适用，A0 无 UI）。
- **design doc SSOT**：`~/.gstack/projects/walker2002-lifeware/walker-feat-023-timebox-domain-reorg-design-20260627-174227.md`。

---

# A0: EnergyCurve 整合 + EnergyStateManager 骨架 + timebox rules-registry（Phase 0）

**A0 范围**：纯基础设施，无 UI、无 schema 变更、无用户可见行为变化。3 块交付：
1. **D10 EnergyCurve 5 处整合**（Task A0.1 类型 SSOT + Task A0.2 消费方改名）
2. **D9 EnergyStateManager 骨架**（Task A0.3）
3. **codex E5 timebox rules-registry**（Task A0.4）

**A0 验收**：现有 vitest/tsc 零新增失败；EnergyCurve 单一类型消除 5 处重复；EnergyStateManager.current()/trend()/curve() 可调用；timebox onValidate 走 rules-registry（行为不变）。

## A0 File Structure

| 文件 | 动作 | 职责 |
|------|------|------|
| `frontend/src/usom/types/primitives.ts` | 修改 | 新增 `EnergyCurve` interface + `DEFAULT_ENERGY_CURVE` const（SSOT） |
| `frontend/src/usom/types/process.ts` | 修改 | `DerivedSignals.energyPattern` 引用 `EnergyCurve` |
| `frontend/src/domains/timebox/providers/energy-curve-provider.ts` | 新建（改名） | `EnergyCurveProvider`，引用 `DEFAULT_ENERGY_CURVE` |
| `frontend/src/domains/timebox/providers/energy-profile-provider.ts` | 删除 | 改名后旧文件移除 |
| `frontend/src/domains/timebox/providers/index.ts` | 修改 | 导出改名 `EnergyCurveProvider` |
| `frontend/src/domains/timebox/index.ts` | 修改 | 导出改名 |
| `frontend/src/domains/timebox/handlers/scheduling-handler.ts` | 修改 | `interface EnergyProfile` → `EnergyCurve`，fallback 引用 SSOT |
| `frontend/src/nexus/context-engine/register-providers.ts` | 修改 | import/schema/id/class 改名 |
| `frontend/src/nexus/context-engine/energy-state-manager.ts` | 新建 | `EnergyStateManager` 骨架（current/trend/curve） |
| `frontend/src/nexus/context-engine/index.ts` | 修改 | 导出 `EnergyStateManager` + `DEFAULT_ENERGY_CURVE` |
| `frontend/src/nexus/context-engine/__tests__/energy-state-manager.test.ts` | 新建 | EnergyStateManager 单元测试 |
| `frontend/src/domains/timebox/rules-registry.ts` | 新建 | timebox 规则注册表（对齐 tasks 范式） |
| `frontend/src/domains/timebox/__tests__/rules-registry.test.ts` | 新建 | rules-registry 单元测试 |
| `frontend/src/domains/timebox/hooks.ts` | 修改 | `onValidate` 改 async 委托 `evaluateDomainRules` |
| `frontend/src/domains/timebox/__tests__/scheduling-handler.test.ts` | 修改 | fixture `energyProfile` → `energyCurve`（若字段名暴露） |

---

## Task A0.1: EnergyCurve 类型 SSOT（USOM 层）

**Files:**
- Modify: `frontend/src/usom/types/primitives.ts`（在 `EnergyState` interface 后追加）
- Modify: `frontend/src/usom/types/process.ts:67-71`（`DerivedSignals.energyPattern`）
- Test: `frontend/src/usom/types/__tests__/energy-curve.test.ts`（新建）

**Interfaces:**
- Produces: `EnergyCurve` interface（`{ peakHours: number[]; lowHours: number[] }`）+ `DEFAULT_ENERGY_CURVE` const（`{ peakHours: [9,10,11], lowHours: [14,15,16] }`）。后续 task 的 provider/handler/EnergyStateManager 都引用这两个 export。

- [ ] **Step 1: 写失败测试**

新建 `frontend/src/usom/types/__tests__/energy-curve.test.ts`:

```typescript
/**
 * @file energy-curve.test
 * @brief EnergyCurve 类型 + DEFAULT_ENERGY_CURVE 常量单元测试（D10 SSOT）
 */
import { describe, it, expect } from 'vitest'
import { DEFAULT_ENERGY_CURVE } from '@/usom/types/primitives'
import type { EnergyCurve } from '@/usom/types/primitives'

describe('DEFAULT_ENERGY_CURVE', () => {
  it('peakHours 为 [9,10,11]（整合 5 处默认值的 SSOT）', () => {
    expect(DEFAULT_ENERGY_CURVE.peakHours).toEqual([9, 10, 11])
  })

  it('lowHours 为 [14,15,16]（修复 scheduling-handler [13,14] 与 provider [14,15,16] 的不一致）', () => {
    expect(DEFAULT_ENERGY_CURVE.lowHours).toEqual([14, 15, 16])
  })

  it('满足 EnergyCurve 类型契约（number[] × 2）', () => {
    const curve: EnergyCurve = DEFAULT_ENERGY_CURVE
    expect(Array.isArray(curve.peakHours)).toBe(true)
    expect(Array.isArray(curve.lowHours)).toBe(true)
    expect(curve.peakHours.every(h => typeof h === 'number')).toBe(true)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/usom/types/__tests__/energy-curve.test.ts`
Expected: FAIL — `DEFAULT_ENERGY_CURVE` / `EnergyCurve` 未导出（`primitives.ts` 暂无此 symbol）

- [ ] **Step 3: 在 primitives.ts 追加 EnergyCurve 类型 + 默认值**

在 `frontend/src/usom/types/primitives.ts` 的 `EnergyState` interface（约第 83 行）之后追加：

```typescript
// ─── Energy Curve (D10 整合：5 处重复归一) ─────────────────────
/**
 * 能量曲线 — 用户每日能量时段分布（高效/低效小时）。
 *
 * D10 整合：原 peakHours/lowHours 在 5 处重复定义
 * （energy-profile-provider / register-providers / scheduling-handler /
 * DerivedSignals.energyPattern / schema energyPattern jsonb），统一为本类型。
 * 归 ContextEngine 管理（EnergyStateManager.curve()），MVP 静态默认值。
 */
export interface EnergyCurve {
  /** 高效时段（24h 制小时数组，如 [9, 10, 11]） */
  peakHours: number[]
  /** 低效时段（24h 制小时数组，如 [14, 15, 16]） */
  lowHours: number[]
}

/**
 * 默认能量曲线（D10 SSOT）。
 *
 * 整合前各处不一致：provider 用 [9,10,11]/[14,15,16]，
 * scheduling-handler fallback 用 [9,10,11]/[13,14]。统一为本常量。
 * MVP 静态（符合"只做静态设置"），未来用户校准走 EnergyStateManager。
 */
export const DEFAULT_ENERGY_CURVE: EnergyCurve = {
  peakHours: [9, 10, 11],
  lowHours: [14, 15, 16],
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/usom/types/__tests__/energy-curve.test.ts`
Expected: PASS（3 tests）

- [ ] **Step 5: 让 DerivedSignals 引用 EnergyCurve**

在 `frontend/src/usom/types/process.ts` 第 67-71 行，将内联结构改为引用 `EnergyCurve`。先确认顶部已 import（`primitives.ts` 的其他类型若已 import 则追加 `EnergyCurve`）。

把：
```typescript
  energyPattern: {
    peakHours: number[]
    lowHours: number[]
    confidence: number
  } | null
```
改为：
```typescript
  energyPattern: {
    /** 能量曲线（D10：引用 SSOT 类型） */
    curve: EnergyCurve
    /** 置信度（派生信号专属，不在 EnergyCurve 内） */
    confidence: number
  } | null
```

并在 `process.ts` 顶部 import 区追加（若未有）：
```typescript
import type { EnergyCurve } from './primitives'
```

> ⚠️ **breaking change**：`DerivedSignals.energyPattern` 形状从 `{peakHours, lowHours, confidence}` 变为 `{curve: {peakHours, lowHours}, confidence}`。Task A0.2 会同步改所有消费方（`schema.ts:582` jsonb `$type<>`、`action-surface-engine/index.ts:50`、timebox/habits 测试 fixture 的 `energyPattern: null` 不受影响因是 null）。

- [ ] **Step 6: tsc 验证（暴露所有 DerivedSignals.energyPattern 消费方的编译错误）**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep -i "energyPattern\|energy" | head -20`
Expected: 列出 `schema.ts`、`action-surface-engine/index.ts` 等处的类型不匹配错误（这些在 Task A0.2 修复）。**记录错误清单**，A0.2 逐个消除。

- [ ] **Step 7: commit**

```bash
cd frontend
git add src/usom/types/primitives.ts src/usom/types/process.ts src/usom/types/__tests__/energy-curve.test.ts
git commit -m "refactor(usom): [023] A0.1 EnergyCurve 类型 SSOT + DEFAULT_ENERGY_CURVE

D10 整合第一步：primitives.ts 新增 EnergyCurve interface +
DEFAULT_ENERGY_CURVE 常量，统一 5 处 peakHours/lowHours 重复
（含修复 scheduling-handler [13,14] vs provider [14,15,16] 不一致）。
DerivedSignals.energyPattern 改引用 EnergyCurve（形状变更，
消费方在 A0.2 同步）。

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task A0.2: provider/handler/register 消费方改名 EnergyProfile → EnergyCurve（D10 整合）

**Files:**
- Create: `frontend/src/domains/timebox/providers/energy-curve-provider.ts`
- Delete: `frontend/src/domains/timebox/providers/energy-profile-provider.ts`
- Modify: `frontend/src/domains/timebox/providers/index.ts`
- Modify: `frontend/src/domains/timebox/index.ts:44`
- Modify: `frontend/src/domains/timebox/handlers/scheduling-handler.ts`（interface + fallback + contexts 取数键）
- Modify: `frontend/src/nexus/context-engine/register-providers.ts`（import/schema/id/class）
- Modify: `frontend/src/lib/db/schema.ts:582`（jsonb `$type<>` 形状）
- Modify: `frontend/src/nexus/core/action-surface-engine/index.ts:50`（`energyPattern: null` fixture，形状变更）
- Test: `frontend/src/domains/timebox/__tests__/scheduling-handler.test.ts`（fixture 改名）

**Interfaces:**
- Consumes: `EnergyCurve` + `DEFAULT_ENERGY_CURVE`（from Task A0.1）
- Produces: `EnergyCurveProvider` class（替代 `EnergyProfileProvider`）；context capability id 从 `'energyProfile'` 改为 `'energyCurve'`；`scheduling-handler` 的 `interface EnergyProfile` 改名 `EnergyCurve`。

> **context capability id 改名影响**：`scheduling-handler.ts:158` 的 `contexts.energyProfile` 取数键要同步改成 `contexts.energyCurve`。manifest 的 `context_capabilities` 配置（query_actions/generation_actions 引用 `energyProfile`）需同步——核查 timebox manifest 是否引用此 id，若引用则改名。

- [ ] **Step 1: 新建 energy-curve-provider.ts（改名 + 引用 SSOT）**

新建 `frontend/src/domains/timebox/providers/energy-curve-provider.ts`:

```typescript
/**
 * @file energy-curve-provider
 * @brief 能量曲线上下文提供者（D10 改名自 energy-profile-provider）
 *
 * 实现 ContextProvider 接口，提供用户能量曲线数据。
 * D10 整合：peakHours/lowHours 引用 DEFAULT_ENERGY_CURVE（SSOT），
 * 消除与 scheduling-handler 的默认值不一致。
 */
import type { ContextProvider } from '@/usom/types/process'
import { DEFAULT_ENERGY_CURVE } from '@/usom/types/primitives'

/**
 * 能量曲线上下文提供者
 */
export class EnergyCurveProvider implements ContextProvider {
  /**
   * 提供能量曲线上下文数据
   *
   * @param query - 查询类型
   * @param _params - 查询参数（暂未使用）
   * @returns 能量曲线数据
   */
  async provide(query: string, _params: Record<string, unknown>): Promise<unknown> {
    if (query !== 'energy_curve') return null

    return {
      ...DEFAULT_ENERGY_CURVE,
      source: 'system_default',
    }
  }
}
```

- [ ] **Step 2: 更新 providers/index.ts 导出**

`frontend/src/domains/timebox/providers/index.ts` 把：
```typescript
export { EnergyProfileProvider } from './energy-profile-provider'
```
改为：
```typescript
export { EnergyCurveProvider } from './energy-curve-provider'
```

- [ ] **Step 3: 更新 timebox/index.ts 导出**

`frontend/src/domains/timebox/index.ts:44` 把：
```typescript
export { TimeboxProvider, EnergyProfileProvider } from './providers'
```
改为：
```typescript
export { TimeboxProvider, EnergyCurveProvider } from './providers'
```

- [ ] **Step 4: 删除旧 provider 文件**

```bash
cd frontend
git rm src/domains/timebox/providers/energy-profile-provider.ts
```

- [ ] **Step 5: 改 scheduling-handler.ts（interface 改名 + fallback 引用 SSOT + contexts 取数键）**

`frontend/src/domains/timebox/handlers/scheduling-handler.ts`:

5a. 第 29-37 行 interface 改名：
```typescript
/**
 * 能量曲线（D10：原 EnergyProfile，改名消除与 Activity Archetype 旧名撞车）
 */
interface EnergyCurve {
  /** 高效时段 */
  peakHours: number[]
  /** 低效时段 */
  lowHours: number[]
}
```

5b. 第 158 行 fallback + 取数键改名（注意修复 `[13,14]` → 引用 SSOT）：
```typescript
    const energyCurve = (contexts.energyCurve ?? DEFAULT_ENERGY_CURVE) as EnergyCurve

    return { habitTemplates, pendingHabits, activeTasks, existingTimeboxes, energyCurve }
```
顶部追加 import：
```typescript
import { DEFAULT_ENERGY_CURVE } from '@/usom/types/primitives'
```

5c. 全文 `energyProfile` → `energyCurve`、`EnergyProfile` → `EnergyCurve`（第 104, 254, 285, 396, 399-400 行等）。用编辑器全局替换本文件内的标识符（注意只替换本文件，不波及其他文件）。

- [ ] **Step 6: 改 register-providers.ts（import/schema/id/class）**

`frontend/src/nexus/context-engine/register-providers.ts`:

6a. 第 3 行 import 改名：
```typescript
import { TimeboxProvider, EnergyCurveProvider } from '@/domains/timebox/providers'
```

6b. 第 48-52 行 schema 改名 + 形状对齐 EnergyCurve：
```typescript
const EnergyCurveSchema = z.object({
  peakHours: z.array(z.number()),
  lowHours: z.array(z.number()),
  source: z.string(),
})
```

6c. 第 121-127 行 capability id + class 改名：
```typescript
  registerContextCapability({
    id: 'energyCurve',
    visibility: 'planning',
    schema: EnergyCurveSchema,
    description: '能量曲线（高效/低效时段）',
    provider: new EnergyCurveProvider(),
  })
```

- [ ] **Step 7: 改 schema.ts:582 jsonb $type 形状（对齐 DerivedSignals.energyPattern 新形状）**

`frontend/src/lib/db/schema.ts:582` 把：
```typescript
  energyPattern: jsonb('energy_pattern').$type<{ peakHours: number[]; lowHours: number[]; confidence: number } | null>(),
```
改为：
```typescript
  energyPattern: jsonb('energy_pattern').$type<{ curve: { peakHours: number[]; lowHours: number[] }; confidence: number } | null>(),
```

> 注：DB 列名 `energy_pattern` 不变（避免迁移），仅 TS `$type<>` 形状对齐。运行时该 jsonb 列 MVP 为 null，无存量数据形状问题。

- [ ] **Step 8: 改 action-surface-engine/index.ts:50（若该处构造 DerivedSignals）**

核查 `frontend/src/nexus/core/action-surface-engine/index.ts:50` 上下文。若是构造 `DerivedSignals` 的 `energyPattern: null`，保持 `null` 不变（null 不受形状影响）。若构造非 null 值则按新形状 `{ curve: {...}, confidence }` 调整。**实际该行是 `energyPattern: null`（fixture），无需改**——确认后跳过。

- [ ] **Step 9: 核查 timebox manifest 是否引用 capability id 'energyProfile'**

```bash
cd frontend
grep -n "energyProfile\|energy_profile\|energyCurve" src/domains/timebox/manifest.yaml
```
若 manifest 的 `context_capabilities`/`query_actions`/`generation_actions` 引用 `energyProfile`，改为 `energyCurve`。若 grep 无结果（manifest 不直接引用此 capability id），跳过。

- [ ] **Step 10: 改 scheduling-handler.test.ts fixture**

`frontend/src/domains/timebox/__tests__/scheduling-handler.test.ts` 第 40/65/82/99/127 行的 `energyProfile: { peakHours: [...], lowHours: [...], source: 'test' }` fixture 改名为 `energyCurve`（对齐 contexts 取数键改名）。

> 这些是 `contexts` 对象的键，必须与 scheduling-handler 第 158 行 `contexts.energyCurve` 一致。逐个替换 `energyProfile:` → `energyCurve:`（仅本测试文件）。

- [ ] **Step 11: 跑 scheduling-handler 测试确认通过**

Run: `cd frontend && npx vitest run src/domains/timebox/__tests__/scheduling-handler.test.ts`
Expected: PASS（5 tests，所有 fixture 改名后取数键匹配）

- [ ] **Step 12: tsc 全量验证（消除 A0.1 Step 6 记录的所有 energyPattern 编译错误）**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep -i "energy" | head -20`
Expected: 无 energy 相关错误（所有 DerivedSignals.energyPattern 消费方已对齐新形状）

- [ ] **Step 13: 跑 timebox + context-engine + 全量 vitest 基线**

Run: `cd frontend && npx vitest run src/domains/timebox src/nexus/context-engine 2>&1 | tail -20`
Expected: 全 PASS，零新增失败

- [ ] **Step 14: commit**

```bash
cd frontend
git add src/domains/timebox/providers/energy-curve-provider.ts \
        src/domains/timebox/providers/index.ts \
        src/domains/timebox/index.ts \
        src/domains/timebox/handlers/scheduling-handler.ts \
        src/nexus/context-engine/register-providers.ts \
        src/lib/db/schema.ts \
        src/domains/timebox/__tests__/scheduling-handler.test.ts
git rm src/domains/timebox/providers/energy-profile-provider.ts  # 若 Step 4 未 git rm
git commit -m "refactor(timebox): [023] A0.2 EnergyProfile→EnergyCurve 消费方改名

D10 整合第二步：provider/handler/register/schema 全部改名
EnergyProfile→EnergyCurve，capability id energyProfile→energyCurve，
默认值统一引用 DEFAULT_ENERGY_CURVE（修复 [13,14] 不一致）。
DerivedSignals.energyPattern 形状对齐 {curve, confidence}。

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task A0.3: EnergyStateManager 骨架（D9）

**Files:**
- Create: `frontend/src/nexus/context-engine/energy-state-manager.ts`
- Modify: `frontend/src/nexus/context-engine/index.ts`（导出）
- Test: `frontend/src/nexus/context-engine/__tests__/energy-state-manager.test.ts`（新建）

**Interfaces:**
- Consumes: `EnergyState`（`primitives.ts:77`，单维 activeLevel，D8 不改）+ `EnergyCurve`/`DEFAULT_ENERGY_CURVE`（Task A0.1）
- Produces: `EnergyStateManager` interface + `createEnergyStateManager()` 工厂，方法：
  - `current(state: EnergyState, hour: number): EnergyState` — 读时推断 inferredLevel（peak 时段 +2 cap 10，low 时段 -2 floor 1，否则 activeLevel）
  - `curve(): EnergyCurve` — 返回 `DEFAULT_ENERGY_CURVE`（MVP 静态）
  - `trend(snapshots: EnergyState[]): EnergyState[]` — 历史趋势（MVP 透传，未来增强）
- `applyEvent` **不实现**（D9：MVP 不做扣减；签名以注释预留，未来 Scheduler 用）

- [ ] **Step 1: 写失败测试**

新建 `frontend/src/nexus/context-engine/__tests__/energy-state-manager.test.ts`:

```typescript
/**
 * @file energy-state-manager.test
 * @brief EnergyStateManager 骨架单元测试（D9）
 *
 * MVP 范围（D8/D9/OQ-6）：current() 读时推断 inferredLevel + curve() 静态默认 +
 * trend() 透传。applyEvent 不接线（未来 Scheduler）。
 */
import { describe, it, expect } from 'vitest'
import { createEnergyStateManager } from '@/nexus/context-engine/energy-state-manager'
import { DEFAULT_ENERGY_CURVE } from '@/usom/types/primitives'
import type { EnergyState } from '@/usom/types/primitives'

const baseState = (activeLevel: number): EnergyState => ({
  inferredLevel: activeLevel,
  calibratedLevel: null,
  activeLevel,
  source: 'system',
})

describe('EnergyStateManager.curve()', () => {
  it('返回 DEFAULT_ENERGY_CURVE（MVP 静态）', () => {
    const mgr = createEnergyStateManager()
    expect(mgr.curve()).toEqual(DEFAULT_ENERGY_CURVE)
  })
})

describe('EnergyStateManager.current()', () => {
  it('peak 时段（hour=10）→ inferredLevel = activeLevel + 2（cap 10）', () => {
    const mgr = createEnergyStateManager()
    const result = mgr.current(baseState(6), 10)
    expect(result.inferredLevel).toBe(8)
    expect(result.activeLevel).toBe(6) // activeLevel 不变（D8 单维，手动校准）
  })

  it('peak 时段 cap 10（activeLevel=9 → inferred=10 不溢出）', () => {
    const mgr = createEnergyStateManager()
    expect(mgr.current(baseState(9), 10).inferredLevel).toBe(10)
  })

  it('low 时段（hour=15）→ inferredLevel = activeLevel - 2（floor 1）', () => {
    const mgr = createEnergyStateManager()
    expect(mgr.current(baseState(6), 15).inferredLevel).toBe(4)
  })

  it('low 时段 floor 1（activeLevel=2 → inferred=1 不下溢）', () => {
    const mgr = createEnergyStateManager()
    expect(mgr.current(baseState(2), 15).inferredLevel).toBe(1)
  })

  it('普通时段（hour=20）→ inferredLevel = activeLevel（不调整）', () => {
    const mgr = createEnergyStateManager()
    expect(mgr.current(baseState(6), 20).inferredLevel).toBe(6)
  })

  it('返回新对象，不修改入参 state（纯函数）', () => {
    const mgr = createEnergyStateManager()
    const input = baseState(6)
    const result = mgr.current(input, 10)
    expect(result).not.toBe(input)
    expect(input.inferredLevel).toBe(6) // 入参未被改
  })
})

describe('EnergyStateManager.trend()', () => {
  it('MVP 透传历史快照（未来增强为趋势计算）', () => {
    const mgr = createEnergyStateManager()
    const snapshots = [baseState(5), baseState(6), baseState(7)]
    expect(mgr.trend(snapshots)).toEqual(snapshots)
  })

  it('空快照 → 空数组', () => {
    const mgr = createEnergyStateManager()
    expect(mgr.trend([])).toEqual([])
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/nexus/context-engine/__tests__/energy-state-manager.test.ts`
Expected: FAIL — `createEnergyStateManager` 模块不存在

- [ ] **Step 3: 实现 EnergyStateManager**

新建 `frontend/src/nexus/context-engine/energy-state-manager.ts`:

```typescript
/**
 * @file energy-state-manager
 * @brief EnergyStateManager 骨架（D9）
 *
 * EnergyState 是"人的当前状态"（非业务对象），归 ContextEngine 管理
 * （D9）。ContextEngine 从纯 ContextAggregator 扩展为
 * ContextAggregator + EnergyStateManager。
 *
 * MVP 范围（D8/D9/OQ-6）：
 * - current()：读时推断 inferredLevel（peak 时段 +2 / low 时段 -2 / 否则不变），
 *   activeLevel 不变（D8 单维，手动校准走 SM）
 * - curve()：返回 DEFAULT_ENERGY_CURVE（MVP 静态）
 * - trend()：历史快照透传（未来增强为趋势计算）
 * - applyEvent：**不接线**（MVP 不做自动扣减，B1 单写者问题消失）；
 *   未来 AI Energy Scheduler 落地时在此扩展 + optimistic locking
 *
 * 全纯函数（不耦合 repo/IO），易测。hour 由调用方传入（避免 new Date()）。
 */
import type { EnergyState, EnergyScore, EnergyCurve } from '@/usom/types/primitives'
import { DEFAULT_ENERGY_CURVE } from '@/usom/types/primitives'

/** inferredLevel 推断的调整幅度 */
const PEAK_ADJUSTMENT = 2
const LOW_ADJUSTMENT = 2

/** 能量分数边界（1-10） */
const MIN_LEVEL: EnergyScore = 1
const MAX_LEVEL: EnergyScore = 10

/** 限定到 [MIN_LEVEL, MAX_LEVEL] */
function clamp(score: number): EnergyScore {
  return Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, score)) as EnergyScore
}

/**
 * EnergyStateManager（D9 骨架）
 */
export interface EnergyStateManager {
  /**
   * 当前能量状态（读时推断 inferredLevel）。
   *
   * @param state 持久化的 EnergyState（activeLevel 为准）
   * @param hour 当前小时（24h 制，由调用方传入避免 new Date()）
   * @returns 推断后的 EnergyState（新对象，inferredLevel 按 EnergyCurve 调整）
   */
  current(state: EnergyState, hour: number): EnergyState

  /**
   * 能量曲线（D10：归 ContextEngine，MVP 静态默认）。
   * @returns DEFAULT_ENERGY_CURVE
   */
  curve(): EnergyCurve

  /**
   * 历史趋势（MVP 透传，未来增强）。
   *
   * @param snapshots 历史 EnergyState 快照（调用方从 context_snapshots 查）
   * @returns 透传快照（MVP）；未来按窗口聚合/趋势计算
   */
  trend(snapshots: EnergyState[]): EnergyState[]

  // /**
  //  * 应用完成事件扣减 EnergyState（D9：MVP 不接线）。
  //  *
  //  * 未来 AI Energy Scheduler 落地时实现：
  //  * - archetypeId → 查 EnergyCost → 扣减 activeLevel（下限保护 1）
  //  * - optimistic locking + event_id 幂等 + dead_letter_events 兜底
  //  * 当前签名预留，不实现（B1 单写者问题因此消失）。
  //  */
  // applyEvent(event: DomainEvent): Promise<void>
}

/**
 * 创建 EnergyStateManager 实例（工厂模式，对齐 Nexus 组件风格）
 */
export function createEnergyStateManager(): EnergyStateManager {
  return {
    current(state: EnergyState, hour: number): EnergyState {
      const curve = DEFAULT_ENERGY_CURVE
      const isPeak = curve.peakHours.includes(hour)
      const isLow = curve.lowHours.includes(hour)

      let inferred: EnergyScore
      if (isPeak) {
        inferred = clamp(state.activeLevel + PEAK_ADJUSTMENT)
      } else if (isLow) {
        inferred = clamp(state.activeLevel - LOW_ADJUSTMENT)
      } else {
        inferred = state.activeLevel
      }

      return { ...state, inferredLevel: inferred }
    },

    curve(): EnergyCurve {
      return DEFAULT_ENERGY_CURVE
    },

    trend(snapshots: EnergyState[]): EnergyState[] {
      // MVP 透传；未来在此做窗口聚合/趋势计算
      return snapshots
    },
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/nexus/context-engine/__tests__/energy-state-manager.test.ts`
Expected: PASS（9 tests）

- [ ] **Step 5: 在 context-engine/index.ts 导出**

`frontend/src/nexus/context-engine/index.ts` 追加：

```typescript
export { createEnergyStateManager } from './energy-state-manager'
export type { EnergyStateManager } from './energy-state-manager'
```

（`DEFAULT_ENERGY_CURVE` 已从 `primitives.ts` 导出，无需在此 re-export；消费方直接 `import from '@/usom/types/primitives'`。）

- [ ] **Step 6: tsc 验证**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep -i "energy-state-manager" | head -10`
Expected: 无错误

- [ ] **Step 7: commit**

```bash
cd frontend
git add src/nexus/context-engine/energy-state-manager.ts \
        src/nexus/context-engine/index.ts \
        src/nexus/context-engine/__tests__/energy-state-manager.test.ts
git commit -m "feat(context-engine): [023] A0.3 EnergyStateManager 骨架

D9：新建 EnergyStateManager（nexus/context-engine/），current() 读时
推断 inferredLevel（peak +2/low -2/否则不变，cap 10 floor 1）+
curve() 静态默认 + trend() 透传。applyEvent 签名预留不接线
（MVP 不做扣减，B1 单写者问题消失）。全纯函数易测。

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task A0.4: timebox rules-registry（codex E5）

**Files:**
- Create: `frontend/src/domains/timebox/rules-registry.ts`
- Create: `frontend/src/domains/timebox/__tests__/rules-registry.test.ts`
- Modify: `frontend/src/domains/timebox/hooks.ts:44-72`（onValidate 改 async 委托）

**Interfaces:**
- Consumes: `evaluateDomainRules`（`@/nexus/rules`）+ `DomainRuleRegistry`/`RealtimeCheck`/`SubmitCheck` 类型（`@/nexus/rules`）+ `StructuredIntent`（`@/usom/types/objects`）+ `USOMSnapshot`（`@/usom/types/process`）
- Produces: `timeboxRuleRegistry: DomainRuleRegistry`（realtime: title/duration/startTime 单字段 + submit: `timebox_fields_valid` 聚合，复刻现有 onValidate 全逻辑）
- 范式参考：`frontend/src/domains/tasks/rules-registry.ts` + `tasks/hooks.ts:94-106`（onValidate async 委托）+ `tasks/__tests__/rules-registry.test.ts`（测试范式）

> **行为不变约束**：现有 `timebox-domain.test.ts` 的 8 个 onValidate 测试（第 146-256 行）必须全部继续通过。rules-registry 复刻现有校验逻辑（title 非空 / startTime 有效 ISO / duration 5-480 整数），不增不减。

- [ ] **Step 1: 写失败测试（rules-registry 单元测试，对齐 tasks 范式）**

新建 `frontend/src/domains/timebox/__tests__/rules-registry.test.ts`:

```typescript
/**
 * @file rules-registry.test
 * @brief timebox 域规则注册表单元测试（codex E5，对齐 [018-G3]/[020] tasks 范式）
 * - realtime check 行为（title/duration/startTime 边界）
 * - submit 聚合规则 timebox_fields_valid（复刻原 onValidate 全逻辑）
 * - [020] registry rule 自带 meta（check/fields/message）不变式
 */
import { describe, it, expect } from 'vitest'
import { timeboxRuleRegistry } from '../rules-registry'

const { realtime } = timeboxRuleRegistry

describe('timebox_title_required (realtime)', () => {
  const check = realtime.timebox_title_required.check

  it('非空字符串 → 无错误', () => {
    expect(check('深度工作', {})).toEqual([])
  })

  it('空字符串 → 报错', () => {
    const issues = check('', {})
    expect(issues).toHaveLength(1)
    expect(issues[0].field).toBe('title')
  })

  it('纯空白 → 报错', () => {
    const issues = check('   ', {})
    expect(issues).toHaveLength(1)
  })

  it('undefined → 无错误（允许部分更新，submit 聚合兜底）', () => {
    expect(check(undefined, {})).toEqual([])
  })
})

describe('timebox_duration_range (realtime)', () => {
  const check = realtime.timebox_duration_range.check

  it('5-480 整数 → 无错误', () => {
    expect(check(5, {})).toEqual([])
    expect(check(480, {})).toEqual([])
    expect(check(60, {})).toEqual([])
  })

  it('< 5 → 报错', () => {
    expect(check(4, {})).toHaveLength(1)
  })

  it('> 480 → 报错', () => {
    expect(check(481, {})).toHaveLength(1)
  })

  it('非整数 → 报错', () => {
    expect(check(60.5, {})).toHaveLength(1)
  })

  it('非 number → 无错误（submit 兜底）', () => {
    expect(check('abc', {})).toEqual([])
    expect(check(undefined, {})).toEqual([])
  })
})

describe('timebox_start_time_format (realtime)', () => {
  const check = realtime.timebox_start_time_format.check

  it('有效 ISO 8601 → 无错误', () => {
    expect(check('2026-06-28T14:00:00Z', {})).toEqual([])
    expect(check('2026-06-28T14:00', {})).toEqual([])
  })

  it('无效格式 → 报错', () => {
    expect(check('not-a-date', {})).toHaveLength(1)
    expect(check(12345, {})).toHaveLength(1)
  })

  it('空值 → 无错误（submit 兜底）', () => {
    expect(check('', {})).toEqual([])
    expect(check(undefined, {})).toEqual([])
  })
})

describe('timebox_fields_valid (submit — 聚合规则，复刻原 onValidate)', () => {
  const check = timeboxRuleRegistry.submit.timebox_fields_valid.check
  const baseIntent = (fields: Record<string, unknown>) => ({
    id: '1', intentionId: 'i1', targetDomain: 'timebox', action: 'createTimebox',
    fields, confidence: 1, resolvedBy: 'form', createdAt: '',
  }) as any

  it('全字段合法 → Passed', async () => {
    const result = await check(
      baseIntent({ title: '写作', startTime: '2026-06-28T14:00:00Z', duration: 60 }),
      { repos: {}, userId: 'u' as any, now: 0 },
    )
    expect(result.kind).toBe('Passed')
  })

  it('缺 title → Rejected', async () => {
    const result = await check(
      baseIntent({ startTime: '2026-06-28T14:00:00Z', duration: 60 }),
      { repos: {}, userId: 'u' as any, now: 0 },
    )
    expect(result.kind).toBe('Rejected')
  })

  it('duration 超范围 → Rejected', async () => {
    const result = await check(
      baseIntent({ title: '写作', startTime: '2026-06-28T14:00:00Z', duration: 600 }),
      { repos: {}, userId: 'u' as any, now: 0 },
    )
    expect(result.kind).toBe('Rejected')
  })

  it('startTime 无效 → Rejected', async () => {
    const result = await check(
      baseIntent({ title: '写作', startTime: 'bad', duration: 60 }),
      { repos: {}, userId: 'u' as any, now: 0 },
    )
    expect(result.kind).toBe('Rejected')
  })
})

// ─── [020] registry rule 自带 meta 不变式 ──────────────────────────
describe('[020] timebox registry rule 自带 meta', () => {
  it('每条 realtime rule 含 check/fields/message 且 fields 恰 1 字段', () => {
    for (const [id, rule] of Object.entries(timeboxRuleRegistry.realtime)) {
      expect(typeof rule.check, `${id} check`).toBe('function')
      expect(Array.isArray(rule.fields), `${id} fields`).toBe(true)
      expect(rule.fields.length, `${id} fields 恰 1 字段`).toBe(1)
      expect(typeof rule.message, `${id} message`).toBe('string')
      expect(rule.message.length, `${id} message 非空`).toBeGreaterThan(0)
    }
  })

  it('submit 聚合规则 timebox_fields_valid 含 meta', () => {
    const rule = timeboxRuleRegistry.submit.timebox_fields_valid
    expect(rule).toBeDefined()
    expect(typeof rule.check).toBe('function')
    expect(Array.isArray(rule.fields)).toBe(true)
    expect(rule.message.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/domains/timebox/__tests__/rules-registry.test.ts`
Expected: FAIL — `timeboxRuleRegistry` 模块不存在

- [ ] **Step 3: 实现 timebox/rules-registry.ts**

新建 `frontend/src/domains/timebox/rules-registry.ts`:

```typescript
/**
 * @file rules-registry
 * @brief timebox 域规则注册表（codex E5，命令式处理器）。
 *
 * 纯 TS 模块（无 React / 无 fs），client + server 皆可 import。对齐 [018-G3]/[020]
 * tasks/habits 范式：
 * - realtime（phase: both）：单字段纯函数（title/duration/startTime），客户端 blur
 * - submit（phase: submit）：timebox_fields_valid 聚合规则，复刻原 hooks.ts onValidate
 *   全分支（title 非空 / startTime 有效 ISO / duration 5-480 整数），返回
 *   validationRejected(全部 errors)
 *
 * [020] registry 即 SSOT：每条 rule 自带 { check, fields, message } meta。
 * manifest 不声明 rules（timebox manifest 已无 rules 区）。
 * @see frontend/src/domains/tasks/rules-registry.ts 范式参考
 */
import { validationPassed, validationRejected } from '@/usom/types/process'
import type { DomainRuleRegistry, RealtimeCheck, SubmitCheck } from '@/nexus/rules'
import type { StructuredIntent } from '@/usom/types/objects'

/** 最小持续时间（分钟） */
const MIN_DURATION = 5
/** 最大持续时间（分钟） */
const MAX_DURATION = 480

/** timebox 规则提示文案（单源，与 realtime message 同源） */
const TIMEBOX_RULE_MESSAGES = {
  titleRequired: 'title 不能为空',
  durationRange: `duration 必须是 ${MIN_DURATION}~${MAX_DURATION} 之间的整数（分钟）`,
  startTimeFormat: 'startTime 必须是有效的 ISO 8601 时间格式',
  fieldsValid: '时间盒字段校验失败',
} as const

// ── realtime checks（phase: both，单字段纯函数）──────────

const titleRequired: RealtimeCheck = (value) => {
  if (typeof value === 'string' && value.trim() === '') {
    return [{ field: 'title', message: TIMEBOX_RULE_MESSAGES.titleRequired }]
  }
  return []
}

const durationRange: RealtimeCheck = (value) => {
  if (typeof value === 'number' && (!Number.isInteger(value) || value < MIN_DURATION || value > MAX_DURATION)) {
    return [{ field: 'duration', message: TIMEBOX_RULE_MESSAGES.durationRange }]
  }
  return []
}

const startTimeFormat: RealtimeCheck = (value) => {
  if (value !== undefined && value !== null && value !== '') {
    if (typeof value !== 'string' || isNaN(Date.parse(value))) {
      return [{ field: 'startTime', message: TIMEBOX_RULE_MESSAGES.startTimeFormat }]
    }
  }
  return []
}

// ── submit 聚合（phase: submit，复刻原 onValidate 全逻辑）──────────

const timeboxFieldsValid: SubmitCheck = async (intent: StructuredIntent) => {
  const errors: string[] = []
  const { fields } = intent

  const title = fields['title']
  if (!title || (typeof title === 'string' && title.trim() === '')) {
    errors.push(TIMEBOX_RULE_MESSAGES.titleRequired)
  }

  const startTime = fields['startTime']
  if (!startTime || typeof startTime !== 'string' || isNaN(Date.parse(startTime))) {
    errors.push(TIMEBOX_RULE_MESSAGES.startTimeFormat)
  }

  const duration = fields['duration']
  if (
    typeof duration !== 'number' ||
    !Number.isInteger(duration) ||
    duration < MIN_DURATION ||
    duration > MAX_DURATION
  ) {
    errors.push(TIMEBOX_RULE_MESSAGES.durationRange)
  }

  return errors.length === 0 ? validationPassed() : validationRejected(errors)
}

export const timeboxRuleRegistry: DomainRuleRegistry = {
  realtime: {
    timebox_title_required: {
      check: titleRequired,
      fields: ['title'],
      message: TIMEBOX_RULE_MESSAGES.titleRequired,
    },
    timebox_duration_range: {
      check: durationRange,
      fields: ['duration'],
      message: TIMEBOX_RULE_MESSAGES.durationRange,
    },
    timebox_start_time_format: {
      check: startTimeFormat,
      fields: ['startTime'],
      message: TIMEBOX_RULE_MESSAGES.startTimeFormat,
    },
  },
  submit: {
    timebox_fields_valid: {
      check: timeboxFieldsValid,
      fields: ['title', 'startTime', 'duration'],
      message: TIMEBOX_RULE_MESSAGES.fieldsValid,
    },
  },
}
```

- [ ] **Step 4: 跑 rules-registry 测试确认通过**

Run: `cd frontend && npx vitest run src/domains/timebox/__tests__/rules-registry.test.ts`
Expected: PASS（全部 realtime + submit + meta 不变式测试）

- [ ] **Step 5: 改 timebox/hooks.ts onValidate 为 async 委托**

`frontend/src/domains/timebox/hooks.ts`:

5a. 顶部 import 区追加（在现有 import 后）：
```typescript
import { evaluateDomainRules } from '@/nexus/rules'
import { timeboxRuleRegistry } from './rules-registry'
```

5b. 删除文件内的 `MIN_DURATION`/`MAX_DURATION` 常量（第 24-26 行，已迁入 rules-registry）——**核查是否仅 onValidate 用**。若 `UPCOMING_THRESHOLD_MS`（第 28 行）保留（onActionSurfaceRequest 用）。仅删 onValidate 专用的 duration 常量。

5c. 替换 onValidate（第 44-72 行）为 async 委托薄壳（对齐 tasks/hooks.ts:94-106）：

```typescript
  /**
   * 验证意图（codex E5：改调 evaluateDomainRules，规则声明式化）
   * 规则逻辑全部迁入 timeboxRuleRegistry（见 ./rules-registry）；本处仅薄壳委托。
   */
  async function onValidate(
    intent: StructuredIntent,
    snapshot: USOMSnapshot,
  ): Promise<ValidationResult> {
    return evaluateDomainRules('timebox', intent, {
      repos: {},
      userId: snapshot.userId,
      now: snapshot.currentTime ? Date.parse(snapshot.currentTime) : 0,
    }, timeboxRuleRegistry)
  }
```

> onEvent / onActionSurfaceRequest 保持不变。

- [ ] **Step 6: 跑现有 timebox-domain.test.ts 确认 8 个 onValidate 测试不破**

Run: `cd frontend && npx vitest run src/domains/timebox/__tests__/timebox-domain.test.ts 2>&1 | tail -25`
Expected: PASS — 所有现有 onValidate 测试（第 146-256 行）继续通过（rules-registry 复刻同样逻辑）

> 若有测试失败：核对失败用例的 fields，确认 rules-registry 的 submit 聚合规则覆盖了原 onValidate 的所有分支。**不修改现有测试断言**——若失败说明 rules-registry 逻辑与原 onValidate 有偏差，修正 rules-registry。

- [ ] **Step 7: tsc 验证**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep -iE "timebox|rules-registry" | head -10`
Expected: 无错误

- [ ] **Step 8: 全量 vitest + tsc 基线（A0 收尾）**

Run: `cd frontend && npx vitest run 2>&1 | tail -15`
Expected: 全 PASS，零新增失败（对比 A0 开始前的 base 失败集合）

Run: `cd frontend && npx tsc --noEmit 2>&1 | tail -5`
Expected: 零新增错误

- [ ] **Step 9: commit**

```bash
cd frontend
git add src/domains/timebox/rules-registry.ts \
        src/domains/timebox/__tests__/rules-registry.test.ts \
        src/domains/timebox/hooks.ts
git commit -m "refactor(timebox): [023] A0.4 timebox rules-registry + onValidate 委托

codex E5：新建 timebox/rules-registry.ts（对齐 [018-G3]/[020]
tasks/habits 范式），onValidate 改 async 薄壳委托 evaluateDomainRules。
realtime（title/duration/startTime 单字段）+ submit（timebox_fields_valid
聚合，复刻原 onValidate 全逻辑）。现有 timebox-domain.test.ts 8 个
onValidate 测试零回归。

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## A0 完成验收（Change Gate）

- [ ] EnergyCurve 单一类型消除 5 处重复（grep `peakHours\|lowHours` 仅命中 `primitives.ts` 定义 + `DEFAULT_ENERGY_CURVE` 引用处）
- [ ] EnergyStateManager.current()/trend()/curve() 可调用 + 测试覆盖
- [ ] timebox onValidate 走 rules-registry（timebox-domain.test.ts 零回归）
- [ ] `cd frontend && npx vitest run` 全 PASS（base 失败集合对比，零新增）
- [ ] `cd frontend && npx tsc --noEmit` 零新增错误
- [ ] `docs/usom-design.md` 同步 EnergyCurve/EnergyStateManager 说明（§IX 数据层先行，A0.1 Step 7 后补一段）

---

# A1-A4 大纲（后续各自单独写详细 plan）

> 以下为 A1-A4 的 file structure + task 边界大纲。每个子阶段在 A0 完成后、单独 writing-plans 时展开为完整 task-by-task plan。估时按 codex E3 校准建议上调（design doc 原估偏乐观）。

## A1: USOM Activity Archetype 落地（~12-15 天 / 60-80 min CC，codex E3 上调）

**前置**：A0 完成 + OQ-1 治理文档判决（design doc 已解除：类型归 USOM / 数据归 DB，不违反 Constitution IV）。

**File Structure**:
- Create: `frontend/src/usom/activity-archetype/types.ts`（ActivityArchetype interface + EnergyCost 4 维 + ActivityLabel 6 维）
- Create: `frontend/src/usom/activity-archetype/l1-categories.ts`（L1 7 大类 const：工作/生存/投资/关系/放松/健康/浪费）
- Create: `frontend/src/usom/seed/activity-archetypes.ts`（L2 30+ 条 seed，每条带 EnergyCost 4 维 + ActivityLabel 6 维）
- Create: `frontend/src/lib/db/schema.ts` 追加 `activityArchetypes` 表（L2 数据，GenericRepo CRUD）
- Create: `frontend/src/lib/db/repositories/activity-archetype.ts`（Repository + 手写 SQL 迁移）
- Modify: `frontend/src/usom/interfaces/irepository.ts`（加 `IActivityArchetypeRepository`）
- Create: `frontend/src/app/config/activity-archetypes/page.tsx`（手写配置管理页，CRUD + `user_audit_log`）
- Modify: `frontend/src/domains/*/manifest.yaml`（view_routes 加 `/config/activity-archetypes`，或新建 config 域 manifest）
- Modify: `docs/usom-design.md`（§IX step 0 先行，新增 Activity Archetype 章节）

**Task 边界**（7 tasks）:
1. `docs/usom-design.md` Activity Archetype 章节先行（Constitution IV）
2. USOM types + L1 const + L2 seed（types.ts/l1-categories.ts/seed）
3. schema `activityArchetypes` 表 + 手写迁移 + journal
4. Repository（interface + GenericRepo 实现）
5. 配置管理 page（CRUD + audit log）
6. manifest view_routes 注册
7. §IX 七层 checklist 验证 + vitest/tsc 基线

**关键约束**：EnergyCost 4 维 `{physical, mental, emotional, creative}` 各 1-10（D8，在 Archetype 侧）；业务表只引用 `activityArchetypeId` 不存 4 维；配置修改走 `user_audit_log` DB 表不走 SM（OQ-7）。

## A2: Timebox 域重写（~8-10 天 / 70-90 min CC，codex E3 上调）

**前置**：A0 + A1 完成。

**File Structure**:
- Create: `frontend/src/app/schedule/page.tsx`（手写，参 022 OKRWorkspace standalone 模式 + AppShell）
- Create: `frontend/src/app/timebox-templates/page.tsx`（7 段生存时间 + pull 模式订阅 habits/tasks/threads）
- Create: `frontend/src/domains/timebox/cnui/create-timebox.tsx` / `adjust-schedule.tsx` / `log-timebox.tsx`（3 个手写 CNUI surface，019.1 合规）
- Modify: `frontend/src/lib/db/schema.ts` timebox 表加 `activityArchetypeId` 外键（nullable，ON DELETE SET NULL，CQ-2）
- Create: 手写 SQL 迁移（timebox.activityArchetypeId）
- Modify: `frontend/src/domains/timebox/manifest.yaml`（intent_triggers 收敛导航类 + 5 action 走 SM + view_routes 标准化 + subscribed_events）
- Create: timebox Drawer 组件（参 design doc Variant C v2：520px 抽屉 + Archetype 嵌套 sub-card + 4 维 accordion 默认收起 + 数字可输入）

**Task 边界**（8 tasks）:
1. schema timebox.activityArchetypeId + 迁移
2. /schedule page（day-view 复用 + Drawer 骨架）
3. Timebox Drawer（Variant C v2，Archetype sub-card + 4 维 accordion）
4. createTimebox CNUI surface
5. adjustSchedule CNUI surface
6. logTimebox CNUI surface
7. /timebox-templates page（7 段生存时间 + pull 订阅）
8. manifest 清理 + §IX 七层 + 基线

**关键约束（D9/OQ-6）**：**不接 applyEvent 扣减**。logTimebox 完成时存 `activityArchetypeId`（+可选 EnergyCost 快照）作为 timebox 自身字段，走正常 mutation。scheduling-handler 防新增 direct import（加 ESLint `no-restricted-imports`，N-1）。UI 用 Variant C v2（design doc UI Design Decisions + `variant-c-v2.html`）。

## A3: Tasks/Habits 接入 + habitsTemplates 硬删 + B→C 迁移（~6-8 天 / 50-70 min CC，codex E3 上调）

**前置**：A0 + A1（+ A2 同 PR 部署外键）。

**File Structure**:
- Modify: `frontend/src/lib/db/schema.ts` tasks 表删 `energyProfile`（D11 B→C 迁移）+ 加 `activityArchetypeId`；habits 表加 `activityArchetypeId`
- Modify: `frontend/src/usom/types/primitives.ts:303` 删 `type EnergyProfile`
- Modify: `frontend/src/domains/tasks/repository/task.ts:283,319` mapper 删 energyProfile
- Modify: `frontend/src/domains/tasks/components/task-edit-zone.tsx:277`（ENERGY_ICONS → Archetype 下拉）
- Create: B→C 迁移 SQL（enum→archetypeId backfill：light→工作.响应式 / deep→工作.深度专注 / admin→工作.日常 / creative→工作.方案设计 / reactive→工作.响应式）
- Modify: tasks/habits CNUI 表单加 Archetype 下拉（mutation_mode = ContentField，optional，不进 onValidate，C-5）
- Modify: tasks/habits 详情面板加只读 Archetype 展示
- Delete: `frontend/src/app/habit-templates/`（habitsTemplates 页面硬删）+ `habit_templates` 表 DROP（SELECT count 守护，C-7）

**Task 边界**（7 tasks）:
1. D11 B→C 迁移前置（enum→archetypeId 映射 + backfill SQL + 删 EnergyProfile 类型/字段/mapper）
2. tasks.activityArchetypeId 外键 + 迁移
3. habits.activityArchetypeId 外键 + 迁移（注意 lifecycle-configs require 债，N-5）
4. tasks/habits CNUI 表单 Archetype 下拉（ContentField）
5. tasks/habits 详情面板只读展示
6. habitsTemplates 硬删（页面 + 表 DROP + SELECT count 守护）
7. §IX 七层 + 基线

**关键约束（D9/OQ-6）**：taskComplete/habitLogged **不接 applyEvent 扣减**，存 `activityArchetypeId` 走正常 mutation。D11 是破坏性变更（删 energyProfile enum），回归测试必覆盖（mapper/irepository/IREPOSITORY 引用全改）。

## A4: Timebox ↔ KR junction + Manifest 清理（~6-8 天 / 50-70 min CC，codex E3 上调）

**前置**：A2 完成。

**File Structure**:
- Modify: `frontend/src/lib/db/schema.ts:156` contributor_type enum 加 `'timebox'`（drizzle text+enum，单 PR 单次迁移，P2-4）
- Create: 迁移 SQL（`ALTER TABLE contributions DROP CONSTRAINT ... ADD CONSTRAINT ... CHECK (... IN ('task','habit','manual','timebox'))`）
- Create: `frontend/src/domains/timebox/providers/active-timeboxes-provider.ts`（ActiveTimeboxesProvider，参 022 CompletedTasksProvider 模式）
- Modify: `frontend/src/nexus/context-engine/register-providers.ts`（注册 activeTimeboxes capability）
- Modify: `frontend/src/hooks/use-okrs.ts` ContributionPanel（通过 ActiveTimeboxesProvider 搜 timebox 关联 KR，F-6）
- Modify: `frontend/src/domains/okrs/` recompute 跨域事件处理 TimeboxLogged
- Modify: timebox + okrs manifest（subscribed_events 配对：timebox 订阅 [TaskCompleted, HabitLogged]，okrs 订阅 TimeboxLogged）

**Task 边界**（6 tasks）:
1. schema contributor_type + 迁移（单 PR）
2. ActiveTimeboxesProvider + 注册
3. useOKRs ContributionPanel 搜 timebox 关联 KR
4. OKR recompute 处理 TimeboxLogged 跨域事件
5. timebox + okrs manifest subscribed_events 配对 + intent_triggers/view_routes 清理
6. §IX 七层 + 基线

**关键约束**：contributor_type 是 drizzle `text({ enum })`（varchar + CHECK），非 PG enum，单 PR 单次迁移（OQ-4）。跨域事件走 022 A4 已建的 `dispatchCrossDomainEvents`。timebox subscribed_events 保持现状（OQ-8，不订阅自己——orchestrator 已有同域跳过）。

---

## Self-Review（writing-plans 内置检查）

**1. Spec coverage**（A0 Success Criteria 逐条 → task）:
- D10 EnergyCurve 5 处整合 → A0.1（类型 SSOT）+ A0.2（5 个消费方：provider/register/handler/process/schema）✓
- D9 EnergyStateManager 骨架 current/trend + applyEvent 不接线 → A0.3 ✓
- codex E5 timebox rules-registry + onValidate 委托 → A0.4 ✓
- D8 不改治理文档 / EnergyState 单维 → A0.3 注释明确（EnergyState 不动）✓
- vitest/tsc 零新增 → 每个 task 末尾 + A0 收尾验收 ✓
- §IX 数据层先行 → A0.1（类型）+ A0 验收（usom-design.md 同步）✓

**2. Placeholder scan**: 无 TBD/TODO/"add validation"/"similar to Task N"。每步含实际代码。✓

**3. Type consistency**:
- `EnergyCurve`（A0.1 定义）→ A0.2/A0.3 消费，签名一致 `{peakHours: number[]; lowHours: number[]}` ✓
- `DEFAULT_ENERGY_CURVE`（A0.1）→ A0.2 provider/handler + A0.3 EnergyStateManager.curve() 引用 ✓
- `EnergyStateManager.current(state, hour)` / `.curve()` / `.trend(snapshots)`（A0.3 定义）→ 测试一致 ✓
- `timeboxRuleRegistry: DomainRuleRegistry`（A0.4 定义）→ hooks.ts onValidate 委托引用 ✓
- `evaluateDomainRules('timebox', intent, serverCtx, timeboxRuleRegistry)`（A0.4）签名对齐 tasks/hooks.ts:101 ✓

**4. 已知风险/开放点**（实现期关注）:
- A0.2 Step 5c 全文替换 `energyProfile`→`energyCurve` 需仔细（仅本文件，不波及测试 fixture 的 contexts 键——那是 Step 10 单独处理）
- A0.2 DerivedSignals.energyPattern 形状变更是 breaking change，Step 6 tsc 会暴露所有消费方，Step 7/8 逐个修
- A0.4 删 hooks.ts 的 MIN_DURATION/MAX_DURATION 常量前确认仅 onValidate 用（UPCOMING_THRESHOLD_MS 保留）
- A1 OQ-1 治理文档判决虽 design doc 已解除，实现期若 Constitution review 有异议需停（A1 解锁前置）

---

## Review 修订清单（plan-eng-review + codex outside voice）

本 plan 经 plan-eng-review（4 section + codex outside voice）评审，产生以下修订 overlay。**实现时以本清单为准**（覆盖前文对应 step 的原始描述）。Self-Review 第 4 部分 bullet 2（"形状变更是 breaking change"）因 R1 作废。

### R1 — Issue 1（1A）：DerivedSignals.energyPattern 类型复用，不改运行时形状
**覆盖**: A0.1 Step 5 + A0.2 Step 7（作废形状变更）
**改动**: DerivedSignals.energyPattern 用 `(EnergyCurve & { confidence: number }) | null`（类型复用），**不**改成 `{curve: EnergyCurve, confidence}` 嵌套。运行时形状保持 `{peakHours, lowHours, confidence}` 不变。
- A0.1 Step 5：process.ts energyPattern 类型声明改为 `(EnergyCurve & { confidence: number }) | null`，顶部 import EnergyCurve。**无 breaking change**（运行时形状不变），tsc 不报消费方错误。
- A0.2 Step 7：schema.ts:582 的 `$type<>` 保持 `{ peakHours: number[]; lowHours: number[]; confidence: number } | null`（运行时形状不变，**无需改**）。A0.2 Step 6 tsc grep 不再有 energyPattern 错误。

### R2 — Issue 3（3A）：DEFAULT_ENERGY_CURVE 移到 energy-state-manager.ts
**覆盖**: A0.1 + A0.3（尊重 [usom-pure-type-layer] learning）
**改动**: DEFAULT_ENERGY_CURVE 不放 primitives.ts。primitives.ts 只放 `EnergyCurve` interface（纯类型）。DEFAULT_ENERGY_CURVE 定义在 `nexus/context-engine/energy-state-manager.ts`。A0.1 建文件壳（文件头 + import EnergyCurve + DEFAULT_ENERGY_CURVE），A0.3 在同文件追加 createEnergyStateManager/current/trend/curve。provider（A0.2）+ EnergyStateManager 都从 energy-state-manager.ts import。

### R3 — Issue 4 + codex #1（4A）：mappers.ts DerivedSignalsRow 引用 EnergyCurve
**覆盖**: A0.2（新增 step）
**改动**: A0.2 加一步改 `mappers.ts:769` 的 `type DerivedSignalsRow.energyPattern` 为 `(EnergyCurve & { confidence: number }) | null`（引用 EnergyCurve，与 process.ts 同源）。透传函数（derivedSignalsRowToUSOM / derivedSignalsUSOMToRow）不变。R1 后运行时形状不变，安全。

### R4 — codex #3（P1）：manifest query 成对改名
**覆盖**: A0.2 Step 9（强化为强制）
**改动**: manifest.yaml 两处（line 247-248, 265-266）**成对**改名：`id: energyProfile` → `id: energyCurve` **且** `query: energy_profile` → `query: energy_curve`。provider.provide 检查 `query !== 'energy_curve'`——只改 id 不改 query 会导致 provider 返回 null（silent runtime breakage）。**id + query 必须同时改**。

### R5 — codex #5（P2）：scheduling-handler import EnergyCurve 而非重声明
**覆盖**: A0.2 Step 5a
**改动**: scheduling-handler.ts **不**重新声明 `interface EnergyCurve`（那会重复 SSOT，违背 D10）。改 `import type { EnergyCurve } from '@/usom/types/primitives'`。删除 A0.2 Step 5a 的本地 interface 声明代码块。

### R6 — codex #9（P2）：current() 用 calibratedLevel ?? activeLevel
**覆盖**: A0.3 Step 3（current 实现代码）
**改动**: EnergyStateManager.current() 推断基础用 `state.calibratedLevel ?? state.activeLevel`（尊重手动校准，D8）。测试补 calibratedLevel-set 用例。
```typescript
current(state: EnergyState, hour: number): EnergyState {
  const curve = DEFAULT_ENERGY_CURVE
  const base = state.calibratedLevel ?? state.activeLevel  // R6: 尊重手动校准
  const isPeak = curve.peakHours.includes(hour)
  const isLow = curve.lowHours.includes(hour)
  let inferred: EnergyScore
  if (isPeak) inferred = clamp(base + PEAK_ADJUSTMENT)
  else if (isLow) inferred = clamp(base - LOW_ADJUSTMENT)
  else inferred = base
  return { ...state, inferredLevel: inferred }
}
```
测试补：`baseState` 加 calibratedLevel 用例（calibratedLevel=8, activeLevel=6, hour=10 → inferred=10）。

### R7 — codex #10（P2）：Object.freeze(DEFAULT_ENERGY_CURVE)
**覆盖**: R2（energy-state-manager.ts 文件壳）
**改动**: `export const DEFAULT_ENERGY_CURVE: EnergyCurve = Object.freeze({ peakHours: [9,10,11], lowHours: [14,15,16] })`（防调用方 `mgr.curve().peakHours.push()` 误改 SSOT）。curve() 直接返回 frozen 引用（无需 clone）。EnergyCurve interface 加 `readonly` 修饰（`readonly peakHours: readonly number[]`）强化不可变契约。

### R8 — codex #12（P2）：补 stale inferredLevel test
**覆盖**: A0.3 Step 1（测试）
**改动**: energy-state-manager.test.ts 补用例：input `{inferredLevel: 9, calibratedLevel: null, activeLevel: 6, source: 'system' }` hour=10 → output inferredLevel=8（证明从 activeLevel 重算，非从入参 stale inferredLevel）。

### R9 — codex #17（P2）：usom-design.md 成显式 A0 step
**覆盖**: A0.1（新增 step）+ A0 验收
**改动**: usom-design.md 同步（EnergyCurve/EnergyStateManager 说明）从 floating TODO 改为 A0.1 显式 step（带独立 commit），非"A0.1 Step 7 后补一段"。A0 验收 checklist 该项改为有 commit 的 step（§IX 数据层先行）。

### R10 — codex #2（P2）：core/rule-engine 职责区分 note
**覆盖**: A0.4（新增 note）
**改动**: A0.4 加 note：`nexus/core/rule-engine`（提案评估，scheduling-handler 生成的提案；intent.ts:265,512 + okr.ts:177 调 `createRuleEngine`）与 `nexus/rules`（意图校验，onValidate 走 evaluateDomainRules）是**两个职责层**，非重复。A0.4 只接 nexus/rules（意图校验），**不动 core/rule-engine**（提案评估层，留作 A2 timebox 重写时评估是否清理）。

### R11 — codex #4（注明）：onValidate 唯一调用方已 await
**覆盖**: A0.4 Step 5c（注明）
**改动**: A0.4 注明：已确认 onValidate 唯一生产调用方 `orchestrator/index.ts:742` 用 `await domain.onValidate(...)`，async 改名安全。测试 `timebox-domain.test.ts` 用 `await timeboxPlugin.onValidate` 兼容。无需额外 caller audit。

### R12 — codex #7（P3）：fixture 值注明
**覆盖**: A0.2 Step 10
**改动**: scheduling-handler.test.ts fixture 的 lowHours 保持自定义值（如 [14,15]），加注释"fixture 自定义值，非 SSOT DEFAULT_ENERGY_CURVE；handler 不校验曲线数学"。或实现期统一为 SSOT，二选一。

### R13 — codex #8（P3）：source 字段决策
**覆盖**: A0.2 Step 1（provider）+ Step 6（Zod schema）
**改动**: EnergyCurve SSOT **不加** source（保持纯净 `{peakHours, lowHours}`）。provider 返回时加 source 作为运行时元数据 `{ ...DEFAULT_ENERGY_CURVE, source: 'system_default' }`。Zod EnergyCurveSchema 保留 source 字段（运行时校验 provider 返回值）。注明 source 是 provider 运行时附加，非 EnergyCurve 类型字段。

### R14 — codex #11（P3）：补 evaluateDomainRules fail-CLOSED test
**覆盖**: A0.4（可选 test）
**改动**: rules-registry.test.ts 补：注入一个 throw 的 realtime rule 到临时 registry，verify `evaluateDomainRules` 返回 Rejected（非 unhandled reject）。对齐 evaluate.ts:33-37 fail-CLOSED 契约。

### R15 — codex #13（P3）：normalizeFieldValues 省略注明
**覆盖**: A0.4
**改动**: A0.4 注明：timebox onValidate **有意省略** normalizeFieldValues（tasks 有，因中文 enum 字段；timebox 字段简单无 enum）。A1 若给 timebox 加 enum 字段（如 activityArchetypeId L1/L2 校验），需补 normalize 预处理。

### R16 — codex #14（P3）：Change Gate grep 措辞修正
**覆盖**: A0 完成验收
**改动**: A0 验收"grep peakHours|lowHours 仅命中 primitives + DEFAULT_CURVE"改为：grep 命中定义处（primitives EnergyCurve + energy-state-manager DEFAULT_ENERGY_CURVE）+ 不可避免的引用（register-providers Zod schema 键、scheduling-handler.test fixture 字面量、mappers DerivedSignalsRow）。或用更精确 gate（grep 时排除 `__tests__/` 与 Zod schema）。

### R17 — codex #16（P3）：EnergyCurvePoint 命名 note
**覆盖**: A0.1
**改动**: primitives.ts 新增 EnergyCurve 时加注释说明：与既有 `EnergyCurvePoint`（line 100, `{hour, baseline}` 逐小时基线）区分——EnergyCurve 是聚合时段（peakHours/lowHours），EnergyCurvePoint 是逐小时点。重命名 EnergyCurvePoint → HourlyEnergyBaseline 留 future（A0 不扩范围）。

### R18 — codex #15（UNRESOLVED）：估时上调
**状态**: UNRESOLVED（实现期校准）
**说明**: codex E3 + outside voice 一致认为 A0 估时偏乐观（plan 标 3-4 天 / 25-30 min CC，codex 建议 5-7 天）。D10 涉及 5 文件 + 类型复用 + manifest 4 引用点 + 5 fixture + 私有 mapper 类型；D9 骨架含 calibratedLevel 设计假设；codex E5 + 8 测试回归 + core/rule-engine note。**实现期按实际 task 工时校准**，不阻塞架构。

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review`（outside voice on A0 plan） | Independent 2nd opinion | 1 | issues_found | 17 findings（1 P1 runtime + 6 P2 + 6 P3 + 4 已覆盖/不适用），13 项采纳落入修订清单 R3-R17；CROSS-MODEL 无 tension（codex 补充 prior review 漏项，非反对已确认 Issue） |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | clean | 3 issues（Issue 1 能量形状类型复用 / Issue 3 DEFAULT_CURVE 位置 / Issue 4 mappers DRY）全部采纳；Step 0 scope proceed as-is（17 文件 DRY 整合必然）；4 section（Arch 1 + CodeQuality 2 + Test 0 actionable gap + Perf 0）；2 prior learning 命中（energy-profile-naming-collision / usom-pure-type-layer） |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | —（A0 纯基础设施无 UI；design doc 已过 design-review） |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **CODEX:** codex outside voice 抓到 prior review 漏的 1 个 P1（manifest.yaml query 字段未同步改名 → provider 返回 null runtime breakage）+ 5 个 P2（scheduling-handler 本地 interface 重复 SSOT / current() 忽略 calibratedLevel / curve() 返回可变共享引用 / stale inferredLevel test 缺失 / usom-design.md floating TODO）+ core/rule-engine 职责区分 note。全部 verify 真实，13 项采纳。
- **CROSS-MODEL:** 无 tension。Claude（prior review）的 Issue 1/3/4 与 codex 一致；codex 是补充（review 漏的 P1/P2），非反对已确认决策。两模型贡献互补。
- **VERDICT:** ENG + CODEX CLEARED — A0 plan 经 plan-eng-review 4 section + codex outside voice，3 个 review issue + 13 个 codex finding 全部落入修订清单（R1-R17），可进入实现。Step 0 scope proceed as-is（17 文件是 DRY 整合必然，新 class 仅 1）。

**UNRESOLVED DECISIONS:**
- codex #15 / E3 估时校准：A0 plan 估时（3-4 天 / 25-30 min CC）仍偏乐观，codex 建议 5-7 天。实现期按实际 task 工时校准，不阻塞架构（R18）。
- A0 实现期 worktree 接入（EnterWorktree `/home/walker/lifeware-timebox`）需用户显式指令（design doc D7）。
