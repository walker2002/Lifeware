---
id: TD-004
title: R4 timebox/okrs 写入口债(跨域规则未落地) → 描述与代码脱节,关闭 + 重开为观察债 TD-038
status: ✅ 已修复
severity: 🟠 High → ✅ (历史债描述基于过时假设,5 路 grep 0 实际缺口)
created: 2026-07-06
last_updated: 2026-07-12
closed: 2026-07-12
fix_version: 文档调研,无代码改动
---

# TD-004: R4 timebox/okrs 写入口债 → 描述与代码脱节(关闭 + 重开为观察债)

> 摘要:TD-004 ledger 创建时(2026-07-06)基于过时假设「timebox 该关联 OKR」。2026-07-12 用户洞察「timebox 不该直接关联 OKR,tasks/habits/appointments 才是 OKR 关联对象」+ 5 路 grep 验证 ledger 描述无对应债。关闭 TD-004 + 新开观察债 TD-038(timebox↔{tasks,habits,appointments} 跨域写边界预防性监控)。模式记录:第 7 条「描述与代码脱节」型债闭环(继 TD-007/008/009/010/011/012 后)。

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

> ⚠️ **历史描述基于过时假设**,2026-07-12 关闭时验证:ledger 描述「timebox↔okrs 跨域联动」无对应代码债。详见下方「跟踪记录」2026-07-12 调研条目。

**历史描述(2026-07-06 ledger 原文)**:
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

> ⚠️ **历史验收标准全部作废**,基于错误前提。

- [x] 5 路 grep 验证 ledger 描述无对应债(2026-07-12)
- [x] 用户洞察确认 timebox↔okrs 反产品决策(2026-07-12)
- [x] 真实对象图重画:tasks/habits/appointments ↔ okrs(timebox 不直接关联 OKR)
- [x] TD-038 观察债新建,继承预防性监控职责
- [x] README.md 索引同步:TD-004 → 已修复,TD-038 → 新建
- [x] 无 DDL / 无 manifest 变更 / 无宪章修订 / 无代码改动
- [x] 历史记录保留(审计可追溯)

## 跟踪记录（History）

- 2026-07-12 · 「技术债清除会话[003]」调研 + **关闭**(无代码改动):
  - **关键发现**:TD-004 ledger 描述「timebox ↔ OKR 跨域联动」基于**过时假设**(timebox 该关联 OKR)。实际代码 grep 验证:
    - ① `grep keyResultId frontend/src/lib/db/schema.ts timebox 表` = **0 hits**(`timeboxes` 表 schema.ts:354 无 keyResultId 列)
    - ② `grep "linked_kr\|kr_id\|okrsRepository" frontend/src/domains/timebox/` = **0 hits**
    - ③ `grep "timeboxRepository\|\.timeboxes\." frontend/src/domains/okrs/` = **0 hits**
    - ④ `grep "okrRepository\|keyResultRepository" frontend/src/app/actions/timebox.ts` = **0 hits**
    - ⑤ `grep "keyResultId\|krId" frontend/src/usom/` = **0 hits**
  - **用户洞察(2026-07-12)**:「timebox 内容的来源,应该是 tasks、habits 和 Appointments,并不直接和 OKR 关联,而是这三个对象跟 OKR 关联,所以我觉得 timebox.keyResultID 的存在本身是有问题的」
  - **真实对象图**(代码为权威源):
    - OKR ↔ {tasks, habits, appointments}(tasks 已 ship [025] D1 模式,habits 保留 [018]/[019],appointments 待启)
    - timebox ↔ {tasks, habits}(已建 `timebox_tasks` / `timebox_habits` junction 表 + `timeboxes.taskIds[]` / `habitIds[]` soft FK array,**无** cascade 联动)
    - timebox **不**直接关联 OKR(反产品决策)
  - **真实跨域写** 已 ship:[025] completeTask 全走 Orchestrator + 复用 mutation service(D1 模式:Orchestrator 契约路径对「带字段 payload 的状态 intent」复用域业务事实写入口做原子字段+状态写)= **单域内复用**,**不**是 R4 跨域事务
  - **结论**:TD-004 ledger 描述的「跨域规则未落地」**没有真实对应债**。timebox↔okrs 不是真实跨域债,timebox↔{tasks,habits,appointments} 才是(且**无现实联动需求**,纯预防性)。
  - **用户决策**:关闭 TD-004 + 重开为观察债 [[TD-038]] (跨域写边界预防性监控)。
  - **模式记录**:第 7 条「描述与代码脱节」型债闭环(继 TD-007/008/009/010/011/012 后)。印证 [[feedback_post-ship-review-meta-pattern]] 第 N+2 次。
  - **SSOT**: `~/.gstack/projects/walker2002-lifeware/walker-main-design-20260712-TD-004-closure.md`
- 2026-07-06 · [023.10] · 创建条目,源自 [018] followup 历史遗留
- 2026-07-12 · 「技术债清除会话[001-002]」调研:
  - **R3 现状**: git log 显示 habits+tasks R3 已修(d12215f ff-merge),`completeTask` 已走 orchestrator(参 [project-025-cascade-decisions])。OKR 写入口 grep 守卫已实装(cbb7ea9 [022] 1B-T14)。
  - **R4 现状**: 无 `docs/superpowers/specs/*-018-r4-*` design doc;TD-023 (timebox 写入口绕 mutation service AM3 reuse `repo.updateFields` 列写) 已识别为单具体点但非根本跨域设计。
  - **5-10 人日** 评估仍成立 — 跨域事务边界设计 + orchestrator 加 cross-domain dispatch + manifest schema_version + DDL (cross_domain_events 表) + 宪章补"跨域写边界"条款。
  - **user 决策路线**: 与 TD-003 类似 — 暂停,等下 session 启 `R4 design session` brainstorming。
  - **关键交叉引用**:
    - [[TD-008]] lifecycle-configs require 多键域债(同根因:写入口未统一)
    - [[project-018-followup-todos]] "R4 timebox 写入口债" 已 memo
    - [[project-025-cascade-decisions]] 25 已部分触及 cross-domain 级联但未根治
    - [[project-019-domain-paradigm]] cross-domain 表单范式债 — 与 R4 治理正交但同议题
  - **下 session 待办**:
    (1) 启 `/office-hours` skill 启 R4 design session
    (2) 写 spec 到 `~/.gstack/.../*.md` + 拷到 `docs/superpowers/specs/*-018-r4-design.md`
    (3) `/plan-eng-review` 评审
    (4) SDD 多 task 实施(migration + orchestrator dispatch + manifest + handler 改造 + UI)
    (5) 宪章补「跨域写边界」条款
    (6) 文档分层同步(usom-design + database-design)
- 2026-07-12 · **TD-004 状态维持登记**: 大议题等 R4 design session 启动(类似 TD-003);不在「技术债清除会话[001-002]」scope 内实施。
- 2026-06-XX · R3 habits+tasks 已修(d12215f)
- 2026-05-XX · R2 orchestrator dispatch 落地
- 2026-04-XX · R1 rule-engine 落地

## 关联

- 相关技术债：[[TD-008]] (lifecycle-configs require 多键域债,同根因:写入口未统一)
- 相关 PR：d12215f(R3 ff-merge)
- 相关 spec/plan：`docs/superpowers/specs/2026-XX-XX-018-r4-design.md`(待创建)
- 相关 memory：`[[project-018-followup-todos]]` `[[project-025-cascade-decisions]]` `[[project-019-domain-paradigm]]`
- 触发的设计讨论：`~/.gstack/.../018-rule-three-layer-architecture.md`