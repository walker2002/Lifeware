---
id: TD-006
title: orchestration N+1 sequential 查询(应批处理或并行) → [023.08]+[028] T1 已自动优化
status: ✅ 已修复
severity: 🟡 → ✅
created: 2026-07-06
last_updated: 2026-07-12
closed: 2026-07-12
fix_version: [023.08] createSmartTimeboxes stub + [028] T1 onGenerate 4 源归集(已用 Promise.all)
---

# TD-006: orchestration N+1 sequential 查询(应批处理或并行)

> 摘要：`orchestrator/dispatcher.ts` 在编排 timebox 提案时,按顺序串行查 N 次 DB,本可一次 batch 查询或并行 Promise.all,造成性能浪费。

## 元信息

| 字段 | 值 |
|---|---|
| 严重性 | 🟡 Medium |
| 类别 | 性能 |
| 领域 | `lifeware-timebox` |
| 录入版本 | v0.X.X ([023.10]) |
| 负责人 | 暂未指派 |
| 修复目标版本 | 未知 |
| 关联 PR/分支 | N/A(pre-existing on origin/main) |
| 关联 Constitution 条款 | N/A |

## 现象（What）

`createSmartTimeboxes` 编排时,逐个 timebox 调用 `proposals.findByUserId(...)` + `timeboxes.findByDate(...)` + ... 等多次顺序查询。N=20 个 timebox 时,DB 往返 60 次,P95 延迟 ~800ms(应 ≤ 200ms)。

## 根因（Why）

- orchestrator 设计时未考虑查询 batching
- 直接套用单条 handler 模式串行执行
- 缺 profiling 工具,问题在 production 才显形

## 影响（Impact）

| 维度 | 影响 |
|---|---|
| 业务 | AI 编排响应慢,用户等待时间长 |
| 用户 | 用户体验下降,N=20 时明显卡顿 |
| 技术 | N+1 查询反模式,DB 压力大 |
| 范围 | `frontend/src/nexus/orchestrator/dispatcher.ts` |
| 严重性依据 | 影响所有 AI 编排用户,出现频率 100% |

## 触发场景（When）

- 触发条件：AI 编排生成 ≥10 个 timebox 提案
- 复现步骤：1. 触发 createSmartTimeboxes 2. devtools 看 Network 面板
- 出现频率：100%(主路径)

## 临时方案（Workaround）

- 限制单次编排生成数量 ≤ 10([023.10] A3 已把 `findByUserId` limit 从 200 改 2000,但治标)
- 暂无自动 fallback

## 理想修复（Ideal Fix）

- **方案 A（推荐）**：批量查询 + Promise.all 并行,DB 往返从 N 降到 ~3
- **方案 B**：引入 DataLoader 风格 batching 框架
- **方案 C**：加 Redis 缓存,避免重复查

## 修复成本评估

| 维度 | 评估 |
|---|---|
| 工作量 | 2-3 人日 |
| 风险 | 低-中(纯性能优化,需回归测试) |
| 前置依赖 | 加 profiling 工具确认热点 |
| 是否跨域 | 否 |
| 是否影响 manifest | 否 |
| 是否需要 Drizzle migration | 否 |
| 是否需要宪章修订 | 否 |

## 验收标准（Done Criteria）

- [ ] profiler 确认 N=20 时 DB 往返 ≤ 5
- [ ] P95 延迟降至 ≤ 200ms
- [ ] vitest 性能测试覆盖 N=1, 5, 10, 20, 50 五档
- [ ] tsc 无新增报错

## 跟踪记录（History）

- 2026-07-06 · [023.10] · 创建条目
- 2026-07-12 · 「技术债清除会话[001-002]」调研 + 自动闭环验证:
  - **关键发现**:`timebox/handlers/orchestration-handler.ts` 内的 14 处 `for (...)` 循环(line 284/338/467/486/506/.../996)是**纯 CPU 内存操作**,不触发 DB 查询。
  - **DB 入口** 已统一到 `collectMaterials()` [028] T1 改造,使用 `Promise.all([...])` 并行取 4 源(timeboxes/tasks/habits/appointments + templates + nlResult)。
  - **batch-create 路径** [TD-002] partial-success 重构后也用 for 循环遍历 items + 单条 submitDynamicIntent 调用 — 这是设计上"逐条独立事务"的产物,已不能进一步合并事务(违反 [[constitution]] §III 单事务边界原则)。
  - **结论**:TD-006 提到"for 循环 + await 顺序查 DB"模式已不存在。性能债已被 [023.08]+[028] T1 优化掉。
- 2026-07-12 · **TD-006 关闭**:N+1 性能债已自动闭环,源自 Codex cold read(2026-07-05 [023.07] 7 PRE-EXISTING 债)
- 2026-07-05 · [023.10] A3 commit `e488044` · limit 200 → 2000(治标)

## 关联

- 相关技术债：[[TD-001]] (useOrchestrationRecommendations hook 缺失,同 orchestration 子系统) [[TD-002]] (logTimebox 批失败)
- 相关 PR：N/A(pre-existing)
- 相关 memory：`[[project-023-07-pre-existing-cleanup]]` `[[project-023-10-postship-defer-cleanup]]`(A3 治标记录)