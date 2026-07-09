# [026.02.2] 约定管理优化 — polish 收口 设计

**Date**: 2026-07-09
**Status**: APPROVED (brainstorming 全部 OK)
**Origin**: [026.02.1] post-ship review ([commit 22ac0a7](https://gitee.com/walker2002/lifeware/commit/22ac0a7))
**Predecessor**: [026.02] ship-ready ([commit 1372bb4](https://gitee.com/walker2002/lifeware/commit/1372bb4))
**Authority**: 本 spec + CHANGELOG.md `## [026.02.2]` + docs/superpowers/plans/2026-07-09-026-02-2-appointment-polish-plan.md

---

## 1. 背景与动机

[026.02] SHIP 后 `superpowers:requesting-code-review` 触发的 post-ship review 抓 1 Important + 7 Minor follow-up。其中 I-1 mk() 类型签名已 [026.02.1] (commit 22ac0a7) 修复。**本任务 ([026.02.2]) 处理剩余 7 项 polish**：1 Important UX（I-2「条」后缀）+ 5 mechanical（M-1/M-2/M-3/M-4/M-6）+ 1 defer 登记（M-5）。

## 2. Scope

### 2.1 In-scope（7 项 polish）

| ID | 项目 | 文件 | 类型 | 决策来源 |
|---|---|---|---|---|
| **I-2** | 月视图格子计数「条」后缀补回 | `appointment-month-view.tsx:94` | 1 行 + 2 test contract 调整（brief 估 4 处, 实际合并到 1 个 `it()` 块下, 2 个 test contract — count drift 由 reviewer 抓, ship-then-polish 收口） | user (brainstorming 3rd Q) |
| **M-1** | 5+ 处 `as any` 改 MkItem/AppointmentSummary 类型 | `appointment-workspace.test.tsx`（约 8 处） | 类型契约改进 | user (brainstorming 4th Q, multi) |
| **M-2** | mock variable rename `mockGetItinerariesByRange` → `mockGetAppointmentsByRange` | `appointment-workspace.test.tsx`（1 变量 + 引用） | cosmetic | user (4th Q, multi) |
| **M-3** | hardcoded date → fake timers + 相对 offset | `appointment-filter.test.ts:14` + setup/teardown | date determinism | user (4th Q, multi) |
| **M-4** | ymdKey DRY 抽 lib | 新建 `lib/appointment-date-utils.ts` + 3 处改 import | DRY | user (brainstorming M-4 Q) |
| **M-5** | click-toggle 保留 + CHANGELOG 登记 UX 验证 defer | CHANGELOG `## [026.02.2]` 段 | 0 代码改动 | user (brainstorming M-5 Q) |
| **M-6** | `handleDelete` sequential `await` → `Promise.allSettled` | `appointment-workspace.tsx` 1 函数 | perf + 错误隔离 | user (4th Q, multi) |

### 2.2 Out-of-scope

| ID | 项目 | 处理 |
|---|---|---|
| TD-022 5 项 | archetype clearing 语义 / UUID 验证 / perf N+1 / originalPrompt banner / 浏览器 E2E | [026.02.4] 单独 task（user 决定） |
| /editAppointment runtime TypeError | 点击 appointment 即崩，独立根因未明 | **[026.02.3] 单独 task**（user 决定） |
| USOM/DB schema 变更 | — | 排除 |
| Server action 新增 | — | 排除 |
| Manifest 变更 | — | 排除 |

## 3. 详细设计

### 3.1 I-2 月视图「条」后缀

**Before**（[026.02] commit 68be90d T8 test contract 选择）:
```tsx
// appointment-month-view.tsx:94
{info.count}
```

**After**:
```tsx
// appointment-month-view.tsx:94
{info.count} 条
```

**测试调整**（`appointment-month-view.test.tsx`）:
```tsx
// 原: expect(cell).toHaveTextContent('1')
// 新: expect(cell).toHaveTextContent('1 条')
```

影响 4 处 test assertion（已有约定格 + 未来格 + 跨月格等）。

### 3.2 M-1 `as any` 消除

**Before**（[026.02.1] I-1 fix 引入 MkItem，但 casts 残留）:
```tsx
render(<AppointmentWorkspace initialItems={[baseItem] as any} />)
render(<AppointmentWorkspace initialItems={[terminalItem] as any} />)
```

**After**:
```tsx
// baseItem/terminalItem 已是 AppointmentSummary 形状，移除 as any
render(<AppointmentWorkspace initialItems={[baseItem]} />)
```

[026.02.1] I-1 已定义 `MkItem = Omit<typeof baseItem, 'status' | 'detail' | 'people'> & { status: 3 态联合; detail/people optional }`，workspace props `initialItems: AppointmentSummary[]` 应能直接接受。

### 3.3 M-2 mock variable rename

**Before**:
```tsx
const mockGetItinerariesByRange = vi.fn()
```

**After**:
```tsx
const mockGetAppointmentsByRange = vi.fn()
```

`[023.05] itinerary→appointment` rename 的残留尾巴。grep 确认无其他引用点后整体 rename。

### 3.4 M-3 hardcoded date → fake timers

**Before**（`appointment-filter.test.ts:14`）:
```tsx
const startTime = '2026-07-08T10:00:00.000Z'
```

**After**:
```tsx
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-07-08T12:00:00.000Z'))
})
afterEach(() => {
  vi.useRealTimers()
})

const startTime = new Date(Date.now() + 60 * 60 * 1000).toISOString()
```

参照 [026.02] T6/T7/T8 fake timers 模式（`appointment-mini-calendar.test.tsx:19-28`），保证测试可重放 + 不随真实日期漂移。

### 3.5 M-4 ymdKey DRY

**Before**（3 处各自实现）:
```tsx
// appointment-workspace.tsx:124
const ymdKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// appointment-mini-calendar.tsx:21
function ymdKey(d: Date): string { /* 同上 */ }

// appointment-month-view.tsx:17
function ymdKey(d: Date): string { /* 同上 */ }
```

**After**:
```tsx
// lib/appointment-date-utils.ts（新建）
/**
 * @file appointment-date-utils
 * @brief [026.02.2] M-4 — appointment 域日期工具（DRY ymdKey）
 */
export function ymdKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
```

3 处改 `import { ymdKey } from '@/domains/timebox/lib/appointment-date-utils'`，删除本地副本。

### 3.6 M-5 click-toggle 保留

不改代码。CHANGELOG `[026.02.2]` 段登记为 "UX 验证 defer"（user 决定点击 item 应 toggle selected 还是打开 Edit 需人工 `/browse` 验证后决）。

### 3.7 M-6 handleDelete `Promise.allSettled`

**Before**（`appointment-workspace.tsx:162-178`）:
```tsx
const handleDelete = async (ids: string[]) => {
  startDelete(async () => {
    for (const id of ids) {
      try {
        await deleteAppointment(id)
      } catch (err) {
        toast.error(`删除失败: ${id}`)
      }
    }
    await reload()
  })
}
```

**After**:
```tsx
const handleDelete = async (ids: string[]) => {
  startDelete(async () => {
    const results = await Promise.allSettled(ids.map((id) => deleteAppointment(id)))
    const failed = results.filter((r) => r.status === 'rejected')
    if (failed.length > 0) {
      toast.error(`${failed.length} 条删除失败`)
    }
    await reload()
  })
}
```

并行执行 + 部分失败聚合显示，不阻断成功项。

## 4. 测试策略

| Task | TDD 模式 | 测试数量 |
|---|---|---|
| I-2 | 改 test contract，4 个 assertion `toBe('1')` → `toBe('1 条')` | 0 新增 |
| M-1 | 移除 `as any` 后跑现有 18/18 workspace test | 0 新增 |
| M-2 | rename 后 grep 验证无残留 + 18/18 仍 pass | 0 新增 |
| M-3 | 新增 fake timers setup/teardown，验证 6 个 filter test 仍 pass | 0 新增 |
| M-4 | 抽 ymdKey 后跑 mini-calendar(6) + month-view(4) + workspace(18) 全 pass | 0 新增 |
| M-5 | 无 | 0 |
| M-6 | 新增 1 test：`deleteAppointment` 部分 reject 时，验证成功项仍处理 + 失败 toast | +1 |

**总测试数变化**: +1 test，0 回归。

## 5. 错误处理

- **M-3** fake timers 配置需在 `beforeEach/afterEach` 严格 teardown，避免污染其他 test file（参照 T6/T7/T8）
- **M-6** `Promise.allSettled` 错误聚合显示，原 `try/catch` 单条 toast 改聚合 toast
- 其他无错误处理变更

## 6. 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| M-1 移除 `as any` 暴露原本被 bypass 的类型问题 | tsc error | 逐处替代，每处跑 vitest |
| M-3 fake timers 误用污染 | 其他测试 flake | 严格 `beforeEach/afterEach` + 验证全跑 pass |
| M-6 改 handleDelete 改顺序逻辑 | UI 体验变 | 新增 partial-failure test + 聚合 toast |
| M-4 ymdKey 提取时区微妙差 | 月视图显示漂移 | fake timer 锁定行为 + 全 pass 验证 |
| 7 项 polish 共 6 文件改动 | PR 偏大 | per-task brief 隔离；SDD 流程控制 |

## 7. 不在 scope（明确排除）

- TD-022 5 项 → [026.02.4]
- /editAppointment TypeError → [026.02.3]
- 任何 USOM/DB schema 变更
- 任何 server action 新增
- 任何 manifest 变更

## 8. SDD 流程

1. `superpowers:writing-plans` 写实现 plan（per-task brief）
2. `superpowers:subagent-driven-development` + TDD 执行
3. `superpowers:requesting-code-review` 验证
4. ff-merge main + push gitee origin
5. `/lifeware-neat` 同步 CHANGELOG/manifest/memory

## 9. 成功标准

- [ ] tsc 变更文件 0 新增错误
- [ ] vitest focused +1 pass（新增 M-6 partial-failure test）
- [ ] vitest base/head 失败集合零新增（baseline 47 不变）
- [ ] I-2 test contract 调整后 4 个 assertion 全 pass
- [ ] M-1 8 处 `as any` 全部移除
- [ ] M-2 rename 后 grep 0 残留
- [ ] M-3 fake timers setup 后 6 个 filter test pass
- [ ] M-4 ymdKey 抽 lib 后 28 个 mini-calendar/month-view/workspace test pass
- [ ] M-5 CHANGELOG 登记 UX defer
- [ ] M-6 handleDelete partial-failure test pass
- [ ] pre-push hooks 全过（validate:domain-structure + validate:rules-registry）

## 10. 关联

- **Predecessor**: [026.02] / [026.02.1]
- **Sibling**: [026.02.3] (/editAppointment TypeError fix)
- **Follow-up**: [026.02.4] (TD-022 5 项)
- **Memory**: [[project-026-02-appointment-management-optimization]] + [[feedback-post-ship-review-meta-pattern]]