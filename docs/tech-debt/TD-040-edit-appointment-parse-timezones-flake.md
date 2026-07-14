---
id: TD-040
title: handlers-edit-appointment parse-timezones flake（baseline RED）
status: 登记
created: 2026-07-14
last_updated: 2026-07-14
---

# TD-040: handlers-edit-appointment parse-timezones flake（baseline RED）

> 摘要：editAppointment handler 测试 "returns editing mode when parse succeeds with high confidence" 在 baseline main 上即 RED（与 [TD-003 I-4] mapper 修复无关），疑似 parse-timezones 解析 flake，pre-existing 已存在；本 session 修复未涉及。

## 元信息

| 字段 | 值 |
|---|---|
| 严重性 | 🟡 Medium |
| 类别 | 测试 |
| 领域 | `lifeware-timebox` |
| 录入版本 | v0.X.X ([TD-003] whole-branch review follow-up) |
| 负责人 | 暂未指派 |
| 修复目标版本 | 未知 |
| 关联 PR/分支 | N/A（pre-existing on origin/main） |
| 关联 Constitution 条款 | N/A |

## 现象（What）

`src/domains/timebox/cnui/__tests__/handlers-edit-appointment.test.ts` 的 1 个 case 在 baseline main 上持续 RED：

```
FAIL  ... > timeboxCnuiHandler.open("editAppointment") > returns editing mode when parse succeeds with high confidence
AssertionError: expected 'selecting' to be 'editing' // Object.is equality
```

- 期望：parse-timezones 返回 high confidence → handler.open('editAppointment') 走 editing 模式
- 实际：落到 selecting 模式（兜底分支）
- 9 个 case 中仅 1 个 RED，其它 8 个 PASS

## 根因（Why）

`src/domains/timebox/cnui/parse-timeboxes.ts` 的 NL 解析在 mock fixture 下 confidence 评估漂移，导致应进入 editing 模式的 case 实际被 gate 降级为 selecting。怀疑与 `[023.04]` I-7 confidence<0.5 强制降级 selecting 的 safe-default 阈值相关，但具体 case 的 mock input 是否触线需进一步调研。

**[TD-003 I-4] systematic-debugging 复现确认**：stash mapper 修复后该 case 仍 RED，证实与本 session 修复完全无关。

## 影响（Impact）

| 维度 | 影响 |
|---|---|
| 业务 | 无直接影响（parse 兜底 selecting 模式用户体验降级但仍可用） |
| 用户 | 用户在 selecting 模式下需手动选 timebox 而非直接编辑 |
| 技术 | 测试 baseline 不干净，CI 报告永远有 1 RED 被 skip |
| 范围 | `frontend/src/domains/timebox/cnui/__tests__/handlers-edit-appointment.test.ts` 1 个 case |
| 严重性依据 | 单 case / parse 兜底仍可工作 / 不阻塞任何生产路径 |

## 触发场景（When）

- 触发条件：vitest 跑 `src/domains/timebox/cnui/__tests__/handlers-edit-appointment.test.ts`
- 复现步骤：`cd frontend && npx vitest run src/domains/timebox/cnui/__tests__/handlers-edit-appointment.test.ts`
- 出现频率：100%（每次跑都 RED）

## 临时方案（Workaround）

- 无。直接 RED 被 CI 跳过；pre-push hook 不一定捕到此路径
- 类似 pattern 已在 [memory [[feedback_change-gate-baseline]]] 中记录："验收别用硬编码预存失败数（会漂：21→26）；用 base/head 失败集合对比，聚焦被改文件"

## 理想修复（Ideal Fix）

- **方案 A（推荐）**：先在 baseline 重跑 5 次确认是否纯确定性 failure（vs 时序敏感 flake）；若是确定性，定位 mock input 与 confidence 阈值边界，调整 fixture
- **方案 B**：拆 case 为 2 个 sub-case（high confidence → editing 验证 + boundary case），更精准隔离

## 修复成本评估

| 维度 | 评估 |
|---|---|
| 工作量 | 0.5 人日 |
| 风险 | 低（测试修复不触碰生产代码） |
| 依赖 | 无 |

## 关联债

- 相关 memory：[[feedback_change-gate-baseline]]（baseline RED 漂移防范）
- 同类历史债：TD-002 (log-timebox batch failure asymmetric)、TD-009 (log-timebox duplicate filter)