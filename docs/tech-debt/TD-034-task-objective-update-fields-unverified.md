---
id: TD-034
title: "TaskRepository / ObjectiveRepository updateFields 同模式未验证:dateOnly 列 Drizzle 行为待实测"
status: 新建
created: 2026-07-11
last_updated: 2026-07-11
---

# TD-034: Task/Objective updateFields 同模式未验证

> 摘要：`TaskRepository.updateFields` / `ObjectiveRepository.updateFields` 与 [[TD-032]] / [[TD-033]] 同样把 fields dict 直接透传给 Drizzle `.set()`,但其时间相关字段（`startDate/endDate/dueDate`）是 `dateOnly` 列（非 timestamp）,Drizzle 行为可能不同。**未实际复现验证**——是「同类根因债但具体表现待定」。建议下次有时间跑一次 failing test 验证,如确实爆错升级严重性,否则关闭本 TD。

## 元信息

| 字段 | 值 |
|---|---|
| 严重性 | ⚪ Trivial（待验证;如触发升级到 🟠） |
| 类别 | 数据 / 测试债 |
| 领域 | `cross-domain`（tasks + okrs） |
| 录入版本 | v0.X.X ([026.02.4] 后系统性调试发现) |
| 负责人 | 暂未指派 |
| 修复目标版本 | 验证完成决定（不修即关闭;爆错即升级到 [[TD-033]] 同级） |
| 关联 PR/分支 | N/A |
| 关联 Constitution 条款 | N/A |

## 现象（What）

**未知**。未实际跑过下列测试：
- `TaskRepository.updateFields(id, { startDate: '2026-...' }, userId)`
- `TaskRepository.updateFields(id, { dueDate: '2026-...' }, userId)`
- `ObjectiveRepository.updateFields(...)`（无 dateOnly 字段，验证后可能关闭）

可能结果：
- (A) Drizzle `dateOnly` 列接受 ISO string 直接 cast → 不报错
- (B) Drizzle 同样抛 `value.toISOString is not a function`（如 dateOnly 内部用 PgDate）→ 需修
- (C) Drizzle 要求 Date 对象但 silently 转 → 数据可能错

## 根因（Why）

与 [[TD-032]] 同根因:`updateFields` 缺类型归一化。
差异点:`tasks` / `objectives` schema 的 dateOnly 列 vs `appointments` / `timeboxes` schema 的 timestamp 列:
```typescript
// tasks
startDate: date('start_date'),  // dateOnly 不是 timestamp
endDate:   date('end_date'),
dueDate:   date('due_date'),

// objectives
// 无 dateOnly 列;可能不需关心
```

Drizzle 的 `PgDate` vs `PgTimestamp` 实现不同:
- `PgTimestamp.mapToDriverValue`: 期望 Date 对象,调 `.toISOString()`
- `PgDate.mapToDriverValue`: 可能接受 ISO string 或 Date,需验证

## 影响（Impact）

| 维度 | 影响 |
|---|---|
| 业务 | 未知（未实测） |
| 用户 | 未知 |
| 技术 | 如果爆错 = 同 [[TD-032]] 100% 触发阻断 edit;不爆错 = 无影响 |
| 范围 | `frontend/src/domains/tasks/repository/task.ts` + `frontend/src/domains/okrs/repository/objective.ts` |
| 严重性依据 | 未知（需实测） |

## 触发场景（When）

未知。验证方式:
```typescript
it('verify TaskRepository.updateFields ISO string startDate', async () => {
  const repo = new TaskRepository()
  const t = baseTask()
  await repo.save(t, USER)
  const updated = await repo.updateFields(t.id, { startDate: '2026-12-21' }, USER)
  // 期望: 无异常 + updated.startDate === '2026-12-21'
})
```

## 临时方案（Workaround）

无（未触达所以未临时方案）

## 理想修复（Ideal Fix）

- 如验证结果为 (A)/(C) → 关闭本 TD（drizzle 内部处理 OK）
- 如验证结果为 (B) → 加归一化（方案同 [[TD-032]]）：
  ```typescript
  if (typeof setPayload.startDate === 'string') setPayload.startDate = new Date(setPayload.startDate)
  ```
  并提到 [[TD-035]] 通用 helper 一起治理

## 修复成本评估

| 维度 | 评估 |
|---|---|
| 工作量 | 验证 < 0.1 人日；如需修复 ~0.2 人日 |
| 风险 | 低 |
| 前置依赖 | 无 |
| 是否跨域 | 是（tasks + okrs 两域） |
| 是否影响 manifest | 否 |
| 是否需要 Drizzle migration | 否 |
| 是否需要宪章修订 | 否 |

## 验收标准（Done Criteria）

- [ ] 写 failing-or-passing 探针测试覆盖 `TaskRepository.updateFields` startDate/endDate/dueDate
- [ ] 验证结果分类（A/B/C）
- [ ] 如 B → 修;如 A/C → 关 TD
- [ ] 无论结果，在本 TD 历史段记录验证证据

## 跟踪记录（History）

- 2026-07-11 · v0.X.X · 创建条目（系统性调试 [[TD-032]] 时同模式扫描发现;Tasks/Okrs 列类型不同故未直接归并到 [[TD-033]]）

## 关联

- 同根因已修：[[TD-032]]
- 同根因已识别：[[TD-033]]
- 架构治理：[[TD-035]]