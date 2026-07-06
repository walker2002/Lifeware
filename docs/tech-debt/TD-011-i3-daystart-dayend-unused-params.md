---
id: TD-011
title: I-3 assertNoInternalOverlap _dayStart/_dayEnd unused params
status: 登记
created: 2026-07-06
last_updated: 2026-07-06
---

# TD-011: I-3 assertNoInternalOverlap _dayStart/_dayEnd unused params

> 摘要：`assertNoInternalOverlap` 函数签名收了 `dayStart` / `dayEnd` 两个参数但函数体内未使用。死参数。

## 元信息

| 字段 | 值 |
|---|---|
| 严重性 | ⚪ Trivial |
| 类别 | 代码债 |
| 领域 | `lifeware-timebox` |
| 录入版本 | v0.X.X ([023.10]) |
| 负责人 | 暂未指派 |
| 修复目标版本 | 未知 |
| 关联 PR/分支 | N/A |
| 关联 Constitution 条款 | N/A |

## 现象（What）

`assertNoInternalOverlap(items, dayStart, dayEnd)` 函数体内只对比 `items` 之间的 epoch 毫秒数,`dayStart` / `dayEnd` 两个参数收到但未读取。下划线前缀 `_dayStart` / `_dayEnd` 表原作者知道没用但保留签名(可能为了未来扩展或 API 一致)。

## 根因（Why）

- [023.04] overlap.ts 设计时考虑"边界转换"语义,实际实现走纯 epoch 算术不需要 dayStart/dayEnd
- 保留参数是为了跟 `computeOverlapLayout` 等其他函数签名一致
- 但目前调用方传参是机械性传递,实际语义未用

## 影响（Impact）

| 维度 | 影响 |
|---|---|
| 业务 | 无 |
| 用户 | 无 |
| 技术 | 代码债,签名误导(读 signature 以为会做 day 边界过滤) |
| 范围 | `frontend/src/domains/timebox/lib/overlap.ts` |
| 严重性依据 | 仅签名一致性 |

## 触发场景（When）

- 触发条件：阅读 overlap.ts 试图理解边界语义
- 出现频率：人工排查时

## 临时方案（Workaround）

- 无需 workaround,功能正确

## 理想修复（Ideal Fix）

- **方案 A（推荐）**：删除参数,简化签名
- **方案 B**：补 JSDoc 注释说明参数保留原因
- **方案 C**：维持现状

## 修复成本评估

| 维度 | 评估 |
|---|---|
| 工作量 | 0.1 人日(删除参数 + 全仓库调用方更新) |
| 风险 | 低(纯重构,函数行为不变) |
| 前置依赖 | 确认调用方数量 |
| 是否跨域 | 否 |
| 是否影响 manifest | 否 |
| 是否需要 Drizzle migration | 否 |
| 是否需要宪章修订 | 否 |

## 验收标准（Done Criteria）

- [ ] 函数签名简化
- [ ] 全仓库调用方更新编译通过
- [ ] vitest 回归通过
- [ ] tsc 无新增报错

## 跟踪记录（History）

- 2026-07-06 · [023.10] · 创建条目,源自 [023.04] plan-eng-review 21 findings I-3

## 关联

- 相关 PR：[023.04] commit `581809b`
- 相关 spec/plan：`docs/superpowers/plans/2026-07-04-023-05-1-timebox-schedule-cleanup.md` 收尾段
- 相关 memory：`[[project-023-04-cnui-optimization]]`(I-3 defer)