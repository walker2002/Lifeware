---
id: TD-033
title: "TimeboxRepository.updateFields 同模式未修:startTime/endTime 也是 timestamp 列,edit 路径触发会同样爆 TypeError"
status: 新建
created: 2026-07-11
last_updated: 2026-07-11
---

# TD-033: TimeboxRepository.updateFields 同模式未修

> 摘要：`TimeboxRepository.updateFields` 与 `AppointmentRepository.updateFields` 同模式——直接把 fields dict 透传给 Drizzle `.set()`,未做 timestamp 列 string→Date 归一化。`timeboxes.start_time/end_time` 是 timestamp 列。**当前未触发**是因为 `/editTimeboxes` handler 路径只传 `title/startTime/endTime/activityArchetypeId/notes` 中的 string 字段(已通过 service.execute 校验 + 某些场景下 pg auto-cast 接受 ISO string),但**未做显式归一化** = 任何后续 edit 路径(AI parse、ad-hoc RPC、future features)都可能爆同款 `value.toISOString is not a function`。与 [[TD-032]] 同根因,需在 [[TD-035]] 通用 helper 一并治理。

## 元信息

| 字段 | 值 |
|---|---|
| 严重性 | 🟠 High |
| 类别 | 数据 / 架构（repo 与 mapper 一致性债） |
| 领域 | `lifeware-timebox` |
| 录入版本 | v0.X.X ([026.02.4] 后系统性调试发现) |
| 负责人 | 暂未指派 |
| 修复目标版本 | 下次 timebox edit 路径 polish 时（[026.03] 或 [023.13] 续）/ 或等 [[TD-035]] 通用 helper |
| 关联 PR/分支 | N/A |
| 关联 Constitution 条款 | N/A |

## 现象（What）

**当前未触发**——`/editTimeboxes` 现 handler 路径下,patch 经 `service.execute` 走到 `TimeboxRepository.updateFields` 时,`startTime/endTime` 字段作为 string 进入 Drizzle `.set()`。目前未爆错可能原因：
- AI parse 出来的 ISO string 经某些 drizzle 版本自动 cast
- 或实际触发了错但被 service.execute catch 吞掉 → 500 silent fail
- 未实际跑过测试覆盖此路径（按 systematic-debugging [[TD-032]] 复现模式,如不修必爆）

**潜在症状**：与 [[TD-032]] 一致：
- 「Timebox X not found after updateFields」
- 或「value.toISOString is not a function」

## 根因（Why）

完全同 [[TD-032]]：`TimeboxRepository.updateFields` 实现：
```typescript
async updateFields(id, fields, userId, tx = db): Promise<Timebox> {
  const setPayload: Record<string, unknown> = { ...fields, updatedAt: new Date() }
  await tx.update(s.timeboxes).set(setPayload)
    .where(and(eq(s.timeboxes.id, id), eq(s.timeboxes.userId, userId)))
  const updated = await this.findById(id, userId, tx)
  if (!updated) throw new Error(`Timebox ${id} not found after updateFields`)
  return updated
}
```

未做 `startTime/endTime` 的 string→Date 归一化。

`timeboxes` schema:
```typescript
startTime: timestamp('start_time', { withTimezone: true }).notNull(),
endTime:   timestamp('end_time',   { withTimezone: true }).notNull(),
```

两个字段都是 timestamp 列,与 `appointments.start_time` 同列类型。

## 影响（Impact）

| 维度 | 影响 |
|---|---|
| 业务 | `/editTimeboxes` 当前看似 OK,但未来任何改 `startTime/endTime` 的 RPC 路径(包括 AI parse 的 `confidenceGate.newStartTime` 走 `setStartTime` 步骤)都会爆错 |
| 用户 | 现阶段可能 silent fail 或报「找不到」 |
| 技术 | 与 [[TD-032]] 同根因,但因 `timeboxes` 时间字段是核心编辑维度,影响面可能更大 |
| 范围 | `frontend/src/domains/timebox/repository/index.ts:updateFields` |
| 严重性依据 | 高频编辑路径(改时间盒起止);同 [[TD-032]] 100% 触发条件 |

## 触发场景（When）

- 触发条件：patch 含 `startTime` 或 `endTime` 且为 ISO string 形态（USOM Timestamp）
- 复现步骤（预计）：
  1. `/editTimeboxes` 用 AI parse 改时间（如 `改到 14:00`）
  2. handler 构造 patch 含 `startTime: '2026-...'`
  3. service.execute → updateFields → Drizzle TypeError
- 出现频率：当前未实测;一旦触发即 100% 阻断 edit

## 临时方案（Workaround）

无（未触达所以未临时方案）

## 理想修复（Ideal Fix）

**方案 A（minimal fix）**：在 `TimeboxRepository.updateFields` 加同样归一化：
```typescript
if (typeof setPayload.startTime === 'string') setPayload.startTime = new Date(setPayload.startTime)
if (typeof setPayload.endTime === 'string') setPayload.endTime = new Date(setPayload.endTime)
```

**方案 B（推荐）**：等 [[TD-035]] 通用 helper ship,所有 `updateFields` 统一治理。

## 修复成本评估

| 维度 | 评估 |
|---|---|
| 工作量 | 方案 A:0.1 人日；方案 B:与 [[TD-035]] 共担 |
| 风险 | 低（与 [[TD-032]] 同模式） |
| 前置依赖 | 无 |
| 是否跨域 | 否（timebox 域内） |
| 是否影响 manifest | 否 |
| 是否需要 Drizzle migration | 否 |
| 是否需要宪章修订 | 否 |

## 验收标准（Done Criteria）

- [ ] 写 failing test 验证 `updateFields` 含 ISO string `startTime`/`endTime` 触发 TypeError
- [ ] 修复（方案 A 或 B）后测试通过
- [ ] timebox-mutation.test.ts / timebox.test.ts 无回归
- [ ] 验证 `/editTimeboxes` AI parse 路径（`/browse`）改时间真实落库

## 跟踪记录（History）

- 2026-07-11 · v0.X.X · 创建条目（系统性调试 [[TD-032]] 时同模式扫描发现）

## 关联

- 同根因已修：[[TD-032]]
- 同根因未验：[[TD-034]]
- 架构治理：[[TD-035]]
- 跨 session 债：[[TD-023]]（timebox 写入口绕过 mutation service 架构债，与本 TD 不同维度）