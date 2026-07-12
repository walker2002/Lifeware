---
id: TD-038
title: 跨域写边界预防性观察债(timebox↔{tasks,habits,appointments})
status: 🆕 新建
created: 2026-07-12
last_updated: 2026-07-12
---

# TD-038: 跨域写边界预防性观察债(timebox↔{tasks,habits,appointments})

> 摘要:**继承自 TD-004** —— TD-004 ledger「timebox↔okrs 跨域联动」描述基于过时假设,2026-07-12 用户洞察「timebox 不该直接关联 OKR,tasks/habits/appointments 才是 OKR 关联对象」。真正的跨域写边界债是 timebox↔{tasks,habits,appointments},但**当前无现实联动需求**,纯预防性观察 + 监控。本债登记用于:git grep 守卫跨域 direct repo 调用数 = 0,直至真实产品决策触发设计专题。

## 元信息

| 字段 | 值 |
|---|---|
| 严重性 | 🟢 Low(观察债,无现实缺口) |
| 类别 | 架构 |
| 领域 | `cross-domain` |
| 录入版本 | v0.X.X ([023.10]+) |
| 负责人 | 暂未指派 |
| 修复目标版本 | 未知(无需求时不实装;产品决策触发时启 design session) |
| 关联 PR/分支 | N/A(跨多 PR) |
| 关联 Constitution 条款 | §III 业务事实写入口 + §XVII Orchestrator Purity(均为单域边界,跨域边界待补) |
| 继承债 | [[TD-004]] (2026-07-12 关闭) |

## 现象（What）

> 当前无现实缺口。本债为**预防性观察**,记录「若未来产品决策引入跨域联动需求,需提前设计的架构边界」。

**潜在跨域联动场景**(代码为权威源,均**未实装**):

| 场景 | 现状 | 业务紧迫性 | 修复触发条件 |
|---|---|---|---|
| timebox 完成 → linked task 状态变(completed?) | ❌ | 低(timebox logged ≠ task completed,语义分离) | 产品决策:timebox 是 task 的"时间盒化执行"? |
| timebox 完成 → linked habit streak +1 | ❌ | 中(语义模糊:timebox logged ≠ habit performed) | 产品决策:habit 可在 timebox 中执行? |
| timebox 完成 → linked appointment 状态变 | ❌ | 低(已废,appointment 域内 status 自管 [026] PR2) | 无 |
| timebox 撤销 → 回滚 linked task/habit/appointment 状态 | ❌ | 低 | 取决于上面 3 个 |
| appointment 完成 → 触发 KR progress recalc | ❌ | 待产品决策 | appointment↔KR 关联字段 |

**核心架构债**(若未来任一触发):
- 当前 `domainMutationService.execute(intent)` 是**单域单事务**(`nexus/domain-mutation-service/index.ts:306-403`):一个 `domainId` + 一个顶层 `db.transaction` + 步骤可跨 objectType 但**不跨 domainId**
- 跨域路径当前依赖**Orchestrator 拆分多 StructuredIntent 串行处理**(`§XVII Orchestrator Purity`),**非原子**——partial-fail 留不一致
- 无 validator 卡死「app/actions/* 内禁止直接 import 跨域 repo」
- 无 cron / event bus 兜底对账

## 根因（Why）

- **历史认知偏差**:TD-004 创建时(2026-07-06)假设「timebox 该关联 OKR」(错误),导致 ledger 描述无对应债
- **真实现状**:tasks/habits/appointments 才是 OKR 关联对象(timebox 不直接关联),且跨域联动需求**未规划**
- **架构边界未提前设计**:即便未来引入联动,§III 单域 execute 边界 + §XVII sequential splitting 都需扩展才能支持原子跨域事务
- **无 validator 守卫**:跨域 direct repo 调用未被 validator 拦截,出现债扩散无自动发现

## 影响（Impact）

| 维度 | 影响 |
|---|---|
| 业务 | 当前 0(无现实联动需求) |
| 用户 | 当前 0(无感知债) |
| 技术 | 预防性债:跨域事务边界架构未提前设计,未来触发时需 5-10 人日设计专题 |
| 范围 | `frontend/src/domains/{timebox,tasks,habits,appointments,okrs}/` + `frontend/src/nexus/orchestrator/` + `frontend/src/nexus/domain-mutation-service/` + `.specify/memory/constitution.md` |
| 严重性依据 | 仅在产品决策引入跨域联动时才会爆;现无决策 |

## 触发场景（When）

> 当前不触发。本债为观察型,监控指标见「临时方案」段。

**潜在触发路径**:
1. 产品/用户反馈 →「我完成 timebox 后想看到 task 自动完成」→ 业务需求确立
2. 工程师 hack 实现 → 直接在 `app/actions/timebox.ts` 调 `tasksRepository.update()` 跨域写 → 债扩散
3. KR 进度算法改造 → habit streak 加 timebox completion 计数 → 数据层跨域读聚合,但触发层跨域写
4. appointment↔OKR 关联字段新增 → appointment 完成触发 KR recalc → 跨域写

## 临时方案（Workaround）

**当前已就位的监控机制**:
- `git grep "okrsRepository\|tasksRepository\|habitsRepository\|appointmentsRepository" frontend/src/app/actions/timebox.ts` 应 = **0 hits**(TD-004 关闭时验证)
- `git grep "timeboxRepository" frontend/src/app/actions/{tasks,okrs,habits,appointment}.ts` 应 = **0 hits**
- `git grep -E "Repository[^.]" frontend/src/domains/timebox/cnui/handlers.ts` 应仅含本域 repo
- validate:structure 已含 `write-entry-bypass` 规则(参 [[TD-023]] 短期白名单路径),但**未覆盖跨域 direct repo 调用**

**workaround 缺口**:
- 无 validator 自动卡「跨域 repo 调用」
- 无 cron 对账任务
- 无事件总线 + outbox 模式

## 理想修复（Ideal Fix）

> 无现实需求,不实施。仅记录「若未来触发,推荐方案」。

- **方案 A(推荐,触发时启用)**:orchestrator 加 cross-domain atomic transaction path —— 跨域 execute 共享一个 db.transaction(打破单域 execute transaction 边界)。变更:宪法补「跨域事务边界」条款 + Orchestrator 加 multi-domain tx coordinator + manifest schema_version 升级 + 跨域 mutation service 适配。Scope 5-10 人日(原 R4 估算)。
- **方案 B**:最终一致 + 事件总线 + outbox pattern —— timebox 完成 emit system_event → OKR subscriber 异步处理(at-least-once delivery + idempotent handler)。变更:event_bus 扩跨域 pub/sub + outbox 表 + cross_domain_subscribers 表。Scope 3-5 人日。
- **方案 C(最小预防)**:validator 卡死跨域 direct repo 调用 + cron 对账 —— 加 validator rule 检测 `app/actions/*` 内跨域 repo import,加 nightly cron 对账。Scope 0.5-1 人日。**适合无现实需求时启用**。
- **方案 D(产品决策触发)**:若产品真引入 timebox↔{tasks,habits,appointments} 联动,启 design session,基于方案 A/B/C 选型。

## 修复成本评估

| 维度 | 评估 |
|---|---|
| 工作量 | 0(无需求时不实施) / 5-10 人日(方案 A,产品触发时) / 3-5 人日(方案 B) / 0.5-1 人日(方案 C 最小预防) |
| 风险 | 0(无实施) / High(方案 A 动 §III + §XVII) / Med(方案 B 异步一致性窗口) / Low(方案 C 局部 validator) |
| 前置依赖 | 无 / R4 design session + spec + plan |
| 是否跨域 | 是(本质就是跨域) |
| 是否影响 manifest | 是 / 否 |
| 是否需要 Drizzle migration | 可能(方案 A:cross_domain_tx 表;方案 B:outbox + subscribers 表)/ 否 |
| 是否需要宪章修订 | 是(方案 A 补 §III 子章节;方案 B/C 不动宪章) |

## 验收标准（Done Criteria）

> 当前无现实缺口,无验收标准。本债为观察型,直至产品决策触发时再启 design session 评估方案 A/B/C。

**观察期验收标准**(监控指标):
- [x] `git grep "okrsRepository\|tasksRepository\|habitsRepository\|appointmentsRepository" frontend/src/app/actions/timebox.ts` = **0 hits**(TD-004 关闭时验证)
- [x] `git grep "timeboxRepository" frontend/src/app/actions/{tasks,okrs,habits,appointment}.ts` = **0 hits**
- [x] `git grep -E "Repository[^.]" frontend/src/domains/timebox/cnui/handlers.ts` 仅含本域 repo
- [ ] (产品决策触发时)启 R4 design session 评估方案 A/B/C
- [ ] (产品决策触发时)写 spec 到 `docs/superpowers/specs/*-038-r4-cross-domain-design.md`

## 跟踪记录（History）

> 时间倒序,最近在上。每条带版本号或 commit hash。

- 2026-07-12 · v0.X.X · 创建条目,继承自 [[TD-004]] 关闭(同日)
- 2026-07-12 · TD-004 关闭:5 路 grep 验证 ledger 描述基于过时假设,真实对象图是 tasks/habits/appointments↔okr(timebox 不直接关联 OKR),timebox↔{tasks,habits,appointments} 才是真跨域写边界债,但无现实联动需求 → 重开为观察债 TD-038

## 关联

- 相关技术债:[[TD-004]] (2026-07-12 关闭,继承债) · [[TD-008]] (lifecycle-configs 已治本) · [[TD-023]] (timebox 写入口绕过 mutation service) · [[TD-018]] ([023.12] pre-existing 写入口连锁债)
- 相关 PR:[025] 已 ship `completeTask` 全走 Orchestrator + 复用 mutation service(D1 模式)
- 相关 spec/plan:无(无设计专题启动)
- 相关 memory:[[project-018-followup-todos]] · [[project-025-cascade-decisions]] · [[project-019-domain-paradigm]] · [[feedback_post-ship-review-meta-pattern]] (第 N+2 次)
- 触发的设计讨论:`~/.gstack/projects/walker2002-lifeware/walker-main-design-20260712-TD-004-closure.md` (本会话 SSOT)
- 修复触发条件:产品决策引入 timebox↔{tasks,habits,appointments} 联动 / KR 进度算法改造 / appointment↔KR 关联字段新增