---
id: TD-009
title: logTimebox 重复 filter(同 query 多次过滤) → [TD-002] 重构后已 O(N)
status: ✅ 已修复
severity: 🟢 → ✅
created: 2026-07-06
last_updated: 2026-07-12
closed: 2026-07-12
fix_version: [TD-002] cnui/handlers.ts:777 重构(单 filter + loop continue)
---

# TD-009: logTimebox 重复 filter(同 query 多次过滤)

> 摘要：`logTimebox` handler 在批量处理时,对同一次 DB query 结果多次 filter,造成重复计算。

## 元信息

| 字段 | 值 |
|---|---|
| 严重性 | 🟢 Low |
| 类别 | 性能 |
| 领域 | `lifeware-timebox` |
| 录入版本 | v0.X.X ([023.10]) |
| 负责人 | 暂未指派 |
| 修复目标版本 | 未知 |
| 关联 PR/分支 | N/A(pre-existing) |
| 关联 Constitution 条款 | N/A |

## 现象（What）

`logTimebox` 在 batch 处理时,对 `entries` 数组先 filter `isValid`,再 filter `isWithinScope`,再 filter `hasConflict`。同一数组遍历 3 次,O(3N) 而非 O(N)。

## 根因（Why）

- handler 内联多个 `.filter()` 链,未合并为单次 reduce
- 性能债但功能正确
- 与 [[TD-006]] 同根因(N+1 / 多 pass),但粒度更细(单 handler 内部)

## 影响（Impact）

| 维度 | 影响 |
|---|---|
| 业务 | 无功能影响 |
| 用户 | N 大时(<100)可能有 100ms+ 性能损失 |
| 技术 | 性能债 |
| 范围 | `frontend/src/domains/timebox/handlers/logTimebox.ts` |
| 严重性依据 | 仅性能影响,功能正确 |

## 触发场景（When）

- 触发条件：批量 logTimebox + N ≥ 50
- 复现步骤：1. 准备 50+ timebox 2. 批量 log 3. profile
- 出现频率：低(N 大时)

## 临时方案（Workaround）

- 维持现状,接受性能损失

## 理想修复（Ideal Fix）

- **方案 A（推荐）**：合并为单次 reduce / for 循环
- **方案 B**：保持多 filter 但用 lazy iterator
- **方案 C**：维持现状

## 修复成本评估

| 维度 | 评估 |
|---|---|
| 工作量 | 0.5 人日 |
| 风险 | 低(纯性能优化) |
| 前置依赖 | 无 |
| 是否跨域 | 否 |
| 是否影响 manifest | 否 |
| 是否需要 Drizzle migration | 否 |
| 是否需要宪章修订 | 否 |

## 验收标准（Done Criteria）

- [ ] 合并 filter 为单次遍历
- [ ] vitest 性能测试 N=50/100/200 三档,无回归
- [ ] tsc 无新增报错

## 跟踪记录（History）

- 2026-07-06 · [023.10] · 创建条目,源自 Codex cold read(2026-07-05 [023.07] 7 PRE-EXISTING 债)
- 2026-07-12 · 「技术债清除会话[001-002]」grep 闭环验证:
  - **TD-009 引用文件已删除**:`ls frontend/src/domains/timebox/handlers/` 只剩 `index.ts` + `orchestration-handler.ts`,原 `logTimebox.ts` 文件不存在
  - **实际 logTimebox 逻辑位置**:`frontend/src/domains/timebox/cnui/handlers.ts`(CNUI surface handler 内联)
  - **[TD-002] 重构后**:`cnui/handlers.ts:777` 单次 `.filter()`:
    ```ts
    const attempted = items.filter(i => i.state && i.state !== 'skipped')
    ```
    其余跳过逻辑走 loop 内 `continue`(L782 `if (it.status && it.status !== 'planned') continue`)。**已是 O(N)**——TD-009 提到「filter `isValid` + filter `isWithinScope` + filter `hasConflict`」3 次遍历的结构不复存在
  - **性能债已根除** — 副作用是 [TD-002] 把 batch semantics 统一 partial-success 时顺手把单 filter O(N) 化了
- 2026-07-12 · **TD-009 关闭**:TD-002 重构主任务 + 副效应消除 TD-009 双 filter 债

## 关联

- 相关技术债：[[TD-002]] (logTimebox 批失败) [[TD-006]] (orchestration N+1)
- 相关 PR：N/A(pre-existing)
- 相关 memory：`[[project-023-07-pre-existing-cleanup]]`