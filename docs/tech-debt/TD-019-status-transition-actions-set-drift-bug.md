---
id: TD-019
title: "STATUS_TRANSITION_ACTIONS Set 漂移:新增 lifecycle transition 时漏注册,点「回退」/「完成约定」误触字段必含校验"
status: 新建
created: 2026-07-07
last_updated: 2026-07-07
---

# TD-019: STATUS_TRANSITION_ACTIONS Set 漂移:新增 lifecycle transition 时漏注册,点「回退」/「完成约定」误触字段必含校验

> 摘要:[023.12] D7/T4 新增 revertTimebox/revertAppointment 状态转换时,`rules-registry.ts:97 STATUS_TRANSITION_ACTIONS` 白名单漏加 → 用户点 /timeboxes 卡片「回退」按钮走 `app/actions/timebox.ts:178 submitDynamicIntent('timebox','revertTimebox',{objectId})`,Orchestrator 跑 submit 规则 `timebox_fields_valid`,因 action 不在白名单落到字段必含校验 → title/startTime/endTime 3 错聚合 → UI 显示「操作失败：title 不能为空; startTime 必须是有效的 ISO 8601 时间格式; endTime 必须是有效的 ISO 8601 时间格式且晚于 startTime」。已修(加白名单 + 加 6 个守护测试);模式归纳:手工维护的 action 集合是漂移源头,预防建议从 manifest 自动生成。

## 元信息

| 字段 | 值 |
|---|---|
| 严重性 | 🔴 Critical（阻断 [023.12] 已 ship 的 revert 功能,用户可见 — /timeboxes 任何 logged/cancelled 卡片点「回退」100% 失败） |
| 类别 | 测试 / 架构 |
| 领域 | `lifeware-timebox`（timebox + appointment 共用 rules-registry） |
| 录入版本 | v0.X.X ([023.12] ship-then-polish 紧急) |
| 负责人 | 暂未指派 |
| 修复目标版本 | 已修（commit 即将推送） |
| 关联 PR/分支 | main（紧急 hot-fix） |
| 关联 Constitution 条款 | N/A |

## 现象（What）

**用户场景**:在 /timeboxes 页面,点击任意 `status='logged'` 或 `status='cancelled'` 卡片右边的「回退」按钮。

**期望行为**:SM transition 触发,cancelled/logged → planned,卡片刷新状态。

**实际行为**:UI 显示 toast「操作失败：title 不能为空; startTime 必须是有效的 ISO 8601 时间格式; endTime 必须是有效的 ISO 8601 时间格式且晚于 startTime」(3 错误聚合字符串),卡片状态不变。

**根因路径**:
```
1. TimeboxCard.tsx:184 onClick → onAction(timebox.id, 'revert')
2. timeboxes-workspace.tsx → revertTimebox(timeboxId) server action
3. app/actions/timebox.ts:178 submitDynamicIntent('timebox', 'revertTimebox', { objectId })
4. parseDynamicForm 构造 StructuredIntent{ action: 'revertTimebox', fields: {objectId} }
5. Orchestrator → submit rule timebox_fields_valid
6. rules-registry.ts:105 STATUS_TRANSITION_ACTIONS.has('revertTimebox') === false（漏注册）
7. 落到 line 109-130 字段必含校验（title/startTime/endTime 都缺）
8. validationRejected(errors=[3条])
9. error 透传 UI
```

## 根因（Why）

**[023.12] D7 / T4 新增两条 lifecycle transition**:
- `domains/timebox/manifest.yaml:140` `{from: logged, to: planned, action: revert, event_type: TimeboxReverted}`
- `domains/timebox/manifest.yaml:141` `{from: cancelled, to: planned, action: revert, event_type: TimeboxReverted}`
- `domains/timebox/manifest.yaml:153-154` appointment 同样新增 2 条 revert 转换

**[023.12] server action 改造**: `app/actions/timebox.ts:168-184 revertTimebox` 函数实现 → `submitDynamicIntent` 走「fields={objectId}」路径(与其他 status transition 一致)。

**[023.12] 漏改**: `domains/timebox/rules-registry.ts:97 STATUS_TRANSITION_ACTIONS` 集合 **未追加** `'revertTimebox'` / `'revertAppointment'`。

**pattern 历史**:
- `[023.03] QA 发现`:点「开始」(startTimebox)按钮无反应 → 当时的 fix 是加 `startTimebox`/`endTimebox`/`cancelTimebox`/`logTimebox`/`overtimeTimebox` + 5 个 appointment action(commit 见 [023.03] plan)
- `[023.12] ship 重复**:同模式再次发生 — 新增状态转换 action,未扫 rules-registry 白名单
- 这是一个 **process-level 缺陷**:规则引擎的白名单是手工维护集合,新增 SM transition 与白名单更新没有强制绑定

**为什么 ship-then-polish 没抓到**:
- `/qa` 跑的是 UI 视觉验证(`/timeboxes` 渲染检查),不点 revert
- `vitest` 没覆盖「point-revert-button 端到端」路径
- `tsc` 不会发现 Set 漏成员(Set 是 dynamic-typed,加不加成员不报 type 错)
- pre-push hook `validate:manifest` 不检查 rules-registry 与 manifest 的一致性

## 影响（Impact）

| 维度 | 影响 |
|---|---|
| 业务 | 用户无法「撤销错误打卡」或「取消误操作」,状态机断一半（正向 transition 工作,反向断） |
| 用户 | /timeboxes 上任意 logged/cancelled 卡片点「回退」100% 失败,UI 给错误提示但不解释根因（用户以为是网络问题） |
| 技术 | STATUS_TRANSITION_ACTIONS 白名单是漂移源头,未来 [024]/[026.01]/[027] 等新增 action 时可能再踩 |
| 范围 | timebox revert + appointment revert(2 个 action,1 个 rules-registry 文件) |
| 严重性依据 | [023.12] ship 声明含「revert 完整闭环」,实际 100% 阻断 — ship 声明与现实不符,属 High-Critical |

## 修复（已落地）

### 主修复

`frontend/src/domains/timebox/rules-registry.ts` — `STATUS_TRANSITION_ACTIONS` 集合追加 2 个成员:

```ts
const STATUS_TRANSITION_ACTIONS = new Set([
  'startTimebox', 'endTimebox', 'cancelTimebox', 'logTimebox',
  'overtimeTimebox', 'revertTimebox',                                    // [023.12] hot-fix
  'cancelAppointment', 'startAppointment', 'completeAppointment', 'expireAppointment',
  'revertAppointment',                                                   // [023.12] hot-fix
])
```

注释同步更新,指明 [023.12] D7/T4 新增。

### 测试加固

**`frontend/src/domains/timebox/__tests__/rules-registry.test.ts`** — `STATUS_TRANSITION_ACTIONS` describe 块列表加 `'revertTimebox'`,自动生成 1 case(共 5 case)。

**`frontend/src/domains/timebox/__tests__/rules-registry.appointment.test.ts`** — 新增 `appointment 状态转换 action 跳过字段必含检查` describe 块,枚举 `completeAppointment/revertAppointment/cancelAppointment/startAppointment/expireAppointment` 5 个 case,守护 appointmentFieldsValid:236 `intent.action !== 'createAppointment' && intent.action !== 'editAppointment'` 这条 skip 不再回归。

**验证**:vitest 44 → 49 passed(0 regression)。

## 预防

### 短期(立即可做,代码改动小)

- **A1:manifest 自动生成测试** — 把 `STATUS_TRANSITION_ACTIONS` 集合改为从 `manifest.lifecycle[*].transitions[*].action` 派生 +「fields={objectId}」标记(side-effect-only action)。任何新增 SM transition 自动纳入,无需手工维护白名单。
- **A2:pre-push hook `validate:rules-registry`** — 对比 `manifest.lifecycle[*].transitions[*].action` 与 `STATUS_TRANSITION_ACTIONS` 集合,任何 manifest 有但白名单无的 action → ERROR 阻断 push。类似 `validate:manifest` 的 lint pass。

### 中期(架构层)

- **A3:消除两套规则引擎** — 当前 `nexus/rules/`(intent 校验层)与 `nexus/core/rule-engine/`(提案评估层)各自维护 timebox 字段校验,有重复(见 rules-registry.ts 注释「R10 core/rule-engine vs nexus/rules 职责区分」)。统一到一处 → 新增字段时不会漏改一处。
- **A4:STATUS_TRANSITION_ACTIONS 改由 Orchestrator 派生** — Orchestrator 自身知道 intent.action 是否是 SM transition,在 dispatch 前判定是否跳过字段校验,不需要每个 rules-registry 各自判别。

### 立即生效的工程纪律

- **L1**:plan-eng-review 评审 lifecycle 改动时,强制要求改 manifest + rules-registry + tests 三件套
- **L2**:`/qa` 新增「点 revert / 完成 / 取消按钮」E2E 检查清单(回归守护)
- **L3**:record-tech-debt 必须扫「STATUS_TRANSITION_ACTIONS 与 manifest 同步」5 数据源

## 关联

- [[TD-016]] / [[TD-017]] / [[TD-018]] — [023.12] ship-then-polish 3 簇同批录入
- [[TD-001]] ~ [[TD-010]] — [023.10] post-ship defer cleanup(同 family:状态机写入口债)
- [[memory/project-018-followup-todos]] — R4 timebox/okrs 写入口债
- memory `[023.12] A3 archetype` — 同 cycle archetype batch 入库前例,可参考其「manifest 自动生成 schema」模式
- memory `using-superpowers systematic-debugging` — 本次排查标准流程:现象 → 路径 → 根因 → 修复 → 预防

## 关闭条件

- ✅ STATUS_TRANSITION_ACTIONS 含 `revertTimebox`/`revertAppointment`
- ✅ 5+1 个守护测试 PASS
- ✅ tsc 0 新增错
- 预防 A1/A2 留 P2 跟踪(下次 lifecycle 改动前实施)