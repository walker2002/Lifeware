---
id: TD-035
title: "updateFields 通用归一化 helper 缺失:4 域 repo 各自分散归一化,新域必再踩同坑"
status: 新建
created: 2026-07-11
last_updated: 2026-07-11
---

# TD-035: updateFields 通用归一化 helper 缺失

> 摘要:`updateFields` 是 4 域共用的「字段写统一通道」([018] G3 架构),但每个 repo 自己处理 timestamp/dateOnly 归一化（[[TD-032]] 已修 AppointmentRepo;[[TD-033]] 待修 TimeboxRepo;[[TD-034]] 待验 Task/Objective）。架构层缺一个**读 schema column 类型自动归一化**的 helper,导致每加新域必再踩同一坑。根因是 `updateFields` 路径绕开了 mapper（`appointmentUSOMToRow` 等）的归一化逻辑——架构债,需重新统一。

## 元信息

| 字段 | 值 |
|---|---|
| 严重性 | 🟡 Medium（架构治理债;每次加新域/新时间字段必再踩） |
| 类别 | 架构 |
| 领域 | `cross-domain`（4 域: habits / tasks / okrs / timebox-appointments） |
| 录入版本 | v0.X.X ([026.02.4] 后系统性调试发现) |
| 负责人 | 暂未指派 |
| 修复目标版本 | 下次大重构（[023.14] 或 [024.YY]）顺手解决 |
| 关联 PR/分支 | N/A |
| 关联 Constitution 条款 | C-NN 业务事实写入口（[018] G3） |

## 现象（What）

4 域 `updateFields` 各自实现,各自归一化（或漏归一化）:
- `AppointmentRepository.updateFields`:[[TD-032]] 已加 `if (typeof startTime === 'string') startTime = new Date(startTime)`
- `TimeboxRepository.updateFields`:[[TD-033]] 待加 startTime/endTime 归一化
- `TaskRepository.updateFields`:`startDate/endDate/dueDate` dateOnly 列——[[TD-034]] 待验
- `ObjectiveRepository.updateFields`:无时间字段——可能 OK

每个新域加 `updateFields` 时,开发者必须记得:
1. 哪些字段是 timestamp 列
2. USOM 是 string,DB 要 Date
3. 自己写 `if (typeof X === 'string') new Date(X)` 归一化

**风险**：未来加新域（如 [025] 待定的 R4 timebox/okrs 写入口债务）,开发者漏归一化 → 同 [[TD-032]] bug 100% 触发。

## 根因（Why）

**架构错配**：`updateFields` 是字段写统一通道,但其实现需要每个 repo 重复 mapper 的归一化逻辑。

**正确架构应该是**:
- 方案 A：通用 helper `normalizeFieldsForUpdate(fields, tableSchema)` ——读 schema column 类型,对 timestamp/dateOnly 列自动 string→Date 归一化
- 方案 B：`updateFields` 内部强制走 mapper —— 每个 repo 定义 `usomToRowPartial(partialFields): RowPartial`,`updateFields` 调它做归一化

当前是**最差状态**:既无统一 helper,也无统一 mapper 复用。

## 影响（Impact）

| 维度 | 影响 |
|---|---|
| 业务 | 当前已 ship 的域（如 appointment）可能 silent fail 或显式爆错 |
| 用户 | 同 [[TD-032]] 100% 触发时 UI 阻断 edit |
| 技术 | 4 个 repo 4 份重复代码;新域必踩坑;code review 难发现（仅写测试才能发现） |
| 范围 | 4 域 `repository/*.ts:updateFields` |
| 严重性依据 | 架构债,不会立即爆,但每次扩展都积累风险 |

## 触发场景（When）

- 触发条件：新域加 `updateFields` 时漏做 timestamp 归一化
- 复现步骤：见 [[TD-032]] 复现模式
- 出现频率：每次新域/新字段

## 临时方案（Workaround）

每个 repo 各自在 `updateFields` 内部加 `if (typeof X === 'string') X = new Date(X)`（如 [[TD-032]] 已修）。

## 理想修复（Ideal Fix）

**方案 A（推荐）：通用 helper 读 schema 自动归一化**

```typescript
// frontend/src/lib/db/repositories/update-fields-normalizer.ts
import type { PgTable } from 'drizzle-orm/pg-core'

export function normalizeFieldsForUpdate<T extends Record<string, unknown>>(
  fields: T,
  table: PgTable,
): T {
  const normalized = { ...fields }
  for (const [key, value] of Object.entries(normalized)) {
    if (typeof value !== 'string') continue
    const column = (table as any)[key]
    // Drizzle PgColumn types — timestamp/date 列需 string→Date
    if (column?.columnType?.startsWith('PgTimestamp') || column?.columnType?.startsWith('PgDate')) {
      (normalized as any)[key] = new Date(value)
    }
  }
  return normalized
}
```

然后每个 repo:
```typescript
async updateFields(id, fields, userId, tx = db) {
  const setPayload = normalizeFieldsForUpdate({ ...fields, updatedAt: new Date() }, s.appointments)
  await tx.update(s.appointments).set(setPayload)...
}
```

**方案 B：mapper 复用**

每个 repo 加 `usomToRowPartial(partial: Partial<USOM>): Partial<Row>`,`updateFields` 内部调它做归一化。缺点：每个 repo 仍需写一份 mapper。

**方案 C：放弃 mapper 复用,接受显式 if**

接受 [[TD-032]] 当前方案,后续每个新域/新字段都加 if。缺点：长期积累债。

## 修复成本评估

| 维度 | 评估 |
|---|---|
| 工作量 | 方案 A:1 人日（含测试 + 4 域迁移）;方案 B:1 人日;方案 C:0.1 人日/域 |
| 风险 | 中（涉及 4 域核心写路径） |
| 前置依赖 | 无（可独立完成） |
| 是否跨域 | 是（4 域） |
| 是否影响 manifest | 否 |
| 是否需要 Drizzle migration | 否 |
| 是否需要宪章修订 | 否（属于 R-01 仓储隔离原则的细化，不动 C-NN 条款） |

## 验收标准（Done Criteria）

- [ ] 抽 `normalizeFieldsForUpdate` helper（方案 A）或 `usomToRowPartial`（方案 B）
- [ ] 4 域 `updateFields` 全部迁移到 helper
- [ ] 关闭 [[TD-032]] / [[TD-033]] / [[TD-034]]（如已修）
- [ ] vitest 新增 helper 单测覆盖 timestamp/dateOnly/普通 string/普通 number 等场景
- [ ] 4 域 `updateFields` 现有测试无回归

## 跟踪记录（History）

- 2026-07-11 · v0.X.X · 创建条目（系统性调试 [[TD-032]] 时发现根因类债,必须单独立条避免未来再踩）

## 关联

- 同类债：
  - [[TD-032]] ✅ closed (Appointment 已修)
  - [[TD-033]] 🟠 (Timebox 待修)
  - [[TD-034]] ⚪ (Task/Objective 待验证)
- 写入口架构债：[[TD-004]] R4 timebox/okrs 写入口债（不同维度——本 TD 是 update 路径,TD-004 是 SM 路由）
- 写入口 bypass 债：[[TD-023]] timebox revertTimebox 绕过 mutation service（不同维度——本 TD 是写时归一化,TD-023 是绕过架构）
- 关联 Constitution：[018] 业务事实写入口 G3 设计
- 触发会话：系统性调试 `Appointment 215e7b79... not found after updateFields`