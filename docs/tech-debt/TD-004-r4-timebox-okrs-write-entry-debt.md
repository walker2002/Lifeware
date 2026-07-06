---
id: TD-004
title: R4 timebox/okrs 写入口债(跨域规则未落地)
status: 登记
created: 2026-07-06
last_updated: 2026-07-06
---

# TD-004: R4 timebox/okrs 写入口债(跨域规则未落地)

> 摘要：[018] 第三组规则三层架构 R0/R1/R2/R3 已在 habits+tasks 两域落地(d12215f),但 R4(timebox / okrs 跨域)的写入口债未处理,继续累积。

## 元信息

| 字段 | 值 |
|---|---|
| 严重性 | 🟠 High |
| 类别 | 架构 |
| 领域 | `cross-domain` |
| 录入版本 | v0.X.X ([023.10]) |
| 负责人 | 暂未指派 |
| 修复目标版本 | 未知 |
| 关联 PR/分支 | N/A(跨多 PR) |
| 关联 Constitution 条款 | C-NN(规则三层架构) |

## 现象（What）

timebox 和 okrs 两个域之间的规则联动仍按"各自独立"实现,无统一写入口,导致：
- timebox 完成时触发 OKR progress 联动 → 通过直接调用 OKR repository 绕开 orchestrator
- OKR 进度变化触发建议生成 timebox → 通过直接调用 timebox repository 绕开 orchestrator
- 双重写入难以审计,无统一回滚路径

## 根因（Why）

- [018] G1+G2+G3 完成后,habits+tasks 两域走通三层架构(R0 规则定义 / R1 rule-engine 校验 / R2 orchestrator dispatch / R3 mutation service 原子写)
- R4(timebox / okrs 跨域联动)被排到 followup,因为跨域写路径更复杂(涉及多表事务)
- 至今未启 R4 design session

## 影响（Impact）

| 维度 | 影响 |
|---|---|
| 业务 | timebox → OKR 进度联动的数据完整性无审计 |
| 用户 | 用户撤销 timebox 时,OKR 进度可能未回滚,造成统计偏差 |
| 技术 | 跨域写入债,与 [025] 级联规则决策已部分触及但未根治 |
| 范围 | `frontend/src/domains/timebox/` + `frontend/src/domains/okrs/` + `frontend/src/nexus/orchestrator/` |
| 严重性依据 | 每次跨域写入都潜在触发,影响所有联动用户 |

## 触发场景（When）

- 触发条件：timebox 完成 + 该 timebox 关联 OKR keyResult
- 复现步骤：1. 创建 OKR 含 keyResult 2. 创建 timebox 关联该 keyResult 3. 完成 timebox 4. 查看 OKR 进度
- 出现频率：高频(联动功能主路径)

## 临时方案（Workaround）

- 当前跨域写入按"各自独立"实现,直接调用对端 repository
- 无事务边界,失败时数据不一致风险
- 已有 memory `[[project-018-followup-todos]]` 标记为遗留

## 理想修复（Ideal Fix）

- **方案 A（推荐）**：R4 design session 启 → spec 落 → plan 落 → 实现跨域写入口
  - 引入"跨域事务边界"概念
  - orchestrator 增加 cross-domain dispatch path
  - OKR progress 变化触发建议生成 → 走 orchestrator
- **方案 B**：先用 eventual consistency 兜底,事件溯源 + 定时校对
- **方案 C**：维持现状,优先修复 P1 backlog

## 修复成本评估

| 维度 | 评估 |
|---|---|
| 工作量 | 5-10 人日(架构级) |
| 风险 | 高(跨域事务边界设计) |
| 前置依赖 | R4 design session + spec + plan |
| 是否跨域 | 是(本质就是跨域) |
| 是否影响 manifest | 是 |
| 是否需要 Drizzle migration | 可能(新增 cross_domain_events 表) |
| 是否需要宪章修订 | 是(补"跨域写边界"条款) |

## 验收标准（Done Criteria）

- [ ] R4 design session 完成,产出 spec 到 `docs/superpowers/specs/`
- [ ] plan-eng-review APPROVED
- [ ] 实现跨域写入口,timebox ↔ OKR 联动走 orchestrator
- [ ] vitest 跨域事务测试通过(失败回滚场景)
- [ ] 宪章补"跨域写边界"条款
- [ ] 已更新 docs/usom-design.md + docs/database-design.md

## 跟踪记录（History）

- 2026-07-06 · [023.10] · 创建条目,源自 [018] followup 历史遗留
- 2026-06-XX · R3 habits+tasks 已修(d12215f)
- 2026-05-XX · R2 orchestrator dispatch 落地
- 2026-04-XX · R1 rule-engine 落地

## 关联

- 相关技术债：[[TD-008]] (lifecycle-configs require 多键域债,同根因:写入口未统一)
- 相关 PR：d12215f(R3 ff-merge)
- 相关 spec/plan：`docs/superpowers/specs/2026-XX-XX-018-r4-design.md`(待创建)
- 相关 memory：`[[project-018-followup-todos]]` `[[project-025-cascade-decisions]]` `[[project-019-domain-paradigm]]`
- 触发的设计讨论：`~/.gstack/.../018-rule-three-layer-architecture.md`