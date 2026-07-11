---
id: TD-032
title: "AppointmentRepository.updateFields 缺 timestamp 列 string→Date 归一化,editAppointment 保存触发 Drizzle TypeError"
status: 已修复
created: 2026-07-11
last_updated: 2026-07-11
closed: 2026-07-11
---

# TD-032: AppointmentRepository.updateFields 缺 timestamp 列 string→Date 归一化

> 摘要：`AppointmentRepository.updateFields` 把 fields dict 直接透传给 Drizzle `.set()`,未对 timestamp 列做 string→Date 归一化。USOM `Appointment.startTime` 是 ISO 字符串,handler.ts `/editAppointment` 提交 patch 时直接传 string,Drizzle `PgTimestamp.mapToDriverValue` 调 `.toISOString()` 抛 TypeError(`value.toISOString is not a function`),整个 `service.execute` 事务回滚,updateAppointment 抛错给 UI。**修复**:`appointment.ts:49-54` 在 `setPayload` 构造时加 `if (typeof setPayload.startTime === 'string') setPayload.startTime = new Date(setPayload.startTime)` 归一化;新增 failing test 守护回归。

## 元信息

| 字段 | 值 |
|---|---|
| 严重性 | 🟠 High → ✅ Closed |
| 类别 | 数据 / 架构（repo 与 mapper 一致性债） |
| 领域 | `lifeware-appointments` |
| 录入版本 | v0.X.X ([026.02.4] 后 hot-fix) |
| 负责人 | 暂未指派（系统性调试 session owner） |
| 修复目标版本 | 即时修复（见 commit） |
| 关联 PR/分支 | main (uncommitted fix) |
| 关联 Constitution 条款 | N/A |

## 现象（What）

用户在 `/editAppointment` 选记录修改后保存,UI 提示：
- 「操作失败: Appointment 215e7b79-84be-482b-bc96-7750096c5553 not found after updateFields」（部分场景）
- 或「value.toISOString is not a function」（直接抛错场景）

100% 复现：handler.ts 提交 patch 必含 `startTime: sel.startTime`(ISO 字符串)。

## 根因（Why）

**`AppointmentRepository.updateFields` 与 `appointmentUSOMToRow` mapper 行为不一致**:

| 路径 | mapper 处理 | Drizzle 收到 |
|---|---|---|
| `save(it)` → `appointmentUSOMToRow` | `startTime: new Date(it.startTime)` | Date 对象 ✅ |
| `updateFields(id, fields)` | 直接透传 | ISO 字符串 ❌ → TypeError |

`appointmentUSOMToRow:45` 显式做 `new Date(it.startTime)` 归一化,但 `updateFields:43-55` 跳过了这步。USOM 形态（startTime 是 Timestamp = ISO string）与 DB row 形态（startTime 是 Date）之间需要归一化,但 `updateFields` 这条字段写路径没复用 mapper。

Drizzle `PgTimestamp.mapToDriverValue` 在 buildQuery 阶段对 value 调 `.toISOString()`,收到 ISO string（非 Date）抛 TypeError:
```
TypeError: value.toISOString is not a function
  at PgTimestamp.mapToDriverValue (drizzle/pg-core/columns/timestamp.ts:68:15)
  at SQL.buildQueryFromSourceParams (drizzle/sql/sql.ts:163:29)
```

## 影响（Impact）

| 维度 | 影响 |
|---|---|
| 业务 | `/editAppointment` CNUI surface 100% 无法保存任何字段 |
| 用户 | 用户改完约定点保存 → 报错 → 无法完成编辑 |
| 技术 | `service.execute` 事务整体回滚(无脏数据);无更新落库 |
| 范围 | `appointment.ts:updateFields` 单点;但同类 pattern 见 [[TD-033]]/[[TD-034]] |
| 严重性依据 | 100% 触发,核心 CNUI surface,无兜底 |

## 触发场景（When）

- 触发条件：USOM Appointment 字段（白名单内含 `startTime`）经 `updateFields` 写库时未做 Date 归一化
- 复现步骤：
  1. `/editAppointment` 选任意记录
  2. 改任意字段或不改（draft 含 ISO startTime 字符串）
  3. 点保存 → handler.ts:696-705 构造 patch → `service.execute` → 抛错
- 出现频率：100%（patch 永远含 `startTime`）

## 临时方案（Workaround）

无（修复已 ship）

## 理想修复（Ideal Fix）

**已实施（minimal fix）**：在 `updateFields` 内对已知 timestamp 列做归一化：
```typescript
if (typeof setPayload.startTime === 'string') {
  setPayload.startTime = new Date(setPayload.startTime)
}
```

**理想方案**（见 [[TD-035]]）：抽通用 `updateFields` helper,读 schema column 类型自动归一化。

## 修复成本评估（已实际修复）

| 维度 | 评估 |
|---|---|
| 工作量 | 0.1 人日（1 方法 + 1 测试） |
| 风险 | 低（仅在 `setPayload` 构造时加 1 个 if） |
| 前置依赖 | 无 |
| 是否跨域 | 否 |
| 是否影响 manifest | 否 |
| 是否需要 Drizzle migration | 否 |
| 是否需要宪章修订 | 否 |

## 验收标准（Done Criteria）

- [x] vitest 新增 failing test `updateFields 把 ISO 字符串 startTime 归一化为 Date` PASS
- [x] appointment.test.ts 全套 13/13 PASS（无回归）
- [x] appointment-actions.test.ts 5/5 PASS（无回归）
- [x] 已记录同类未修债 → [[TD-033]] / [[TD-034]]
- [x] 已记录架构治理债 → [[TD-035]]
- [x] 已添加注释说明根因 + 归一化原因（defense in depth）

## 跟踪记录（History）

- 2026-07-11 · v0.X.X · 创建条目（系统性调试 session 发现）
- 2026-07-11 · v0.X.X · 修复 ship（uncommitted: appointment.ts:49-54 + appointment.test.ts 新测试），关闭条目

## 关联

- 同类未修债：
  - [[TD-033]] · TimeboxRepository.updateFields 同模式未修（startTime/endTime 都是 timestamp）
  - [[TD-034]] · Task/Objective updateFields 同模式未验证
- 架构治理债：[[TD-035]] · updateFields 通用归一化 helper 缺失
- 关联 PR：main（uncommitted hot-fix）
- 触发会话：系统性调试 `Appointment 215e7b79... not found after updateFields`