---
id: TD-018
title: "[023.12] pre-existing 写入口连锁债 → [019.1]+[023.13] 已自动清 tsc 错全闭环"
status: ✅ 已修复
severity: 🟡 → ✅
created: 2026-07-06
last_updated: 2026-07-12
closed: 2026-07-12
fix_version: [019.1] Adapter 退役 + [023.13] follow-up 自动清
---

# TD-018: [023.12] pre-existing 写入口连锁债:tasks/hooks.ts 死 action + generic-repo-adapter 死 repo 引用,2 处

> 摘要:[023.12] 未直接引入但 worktree tsc 暴露的 2 处 pre-existing 债:`domains/tasks/hooks.ts:139,149,159` switch case 引用已死 ActionType('resume_thread'/'add_task'/'archive_thread',[019.1] 退役 Adpater 后应清)+ `domains/tasks/repository/__tests__/generic-repo-adapter.test.ts:84,138` 与 `domains/habits/repository/__tests__/generic-repo-adapter.test.ts:92,151` 测试中 'repos.thread.updateStatus'/'repos.task.updateStatus' 报 possibly undefined。共 4 条 tsc 错,源头都在 [018] G3 写入口切片 + [019.1] Adapter 退役的连锁未清完。

## 元信息

| 字段 | 值 |
|---|---|
| 严重性 | 🟡 Medium（pre-existing 链未清完;不影响 [023.12] 功能,但占 tsc baseline 4/103=3.9%;[019.1] 已退役 Adapter 但 hooks.ts 还引用死 action 字符串——pre-existing 中 [023.12] 暴露） |
| 类别 | 测试 / 架构 |
| 领域 | `lifeware-tasks` / `lifeware-habits` |
| 录入版本 | v0.X.X ([023.12]) |
| 负责人 | 暂未指派 |
| 修复目标版本 | 未知（[023.13] 收口或下次 habits/tasks 域清理） |
| 关联 PR/分支 | `feat/023-12-lifecycle-simplify` |
| 关联 Constitution 条款 | N/A |

## 现象（What）

```
cd frontend && npx tsc --noEmit 2>&1 | grep -E "tasks/hooks.ts|tasks/repository/__tests__/generic-repo-adapter|habits/repository/__tests__/generic-repo-adapter"
```

输出（pre-existing 在 main 也存在）：

1. `domains/tasks/hooks.ts:139` — `error TS2322: Type '"resume_thread"' is not assignable to type 'ActionType'.`
2. `domains/tasks/hooks.ts:149` — `error TS2322: Type '"add_task"' is not assignable to type 'ActionType'.`
3. `domains/tasks/hooks.ts:159` — `error TS2322: Type '"archive_thread"' is not assignable to type 'ActionType'.`
4. `domains/tasks/repository/__tests__/generic-repo-adapter.test.ts:84` — `'repos.task.updateStatus' is possibly 'undefined'`
5. `domains/tasks/repository/__tests__/generic-repo-adapter.test.ts:138` — `'repos.thread.updateStatus' is possibly 'undefined'`
6. `domains/habits/repository/__tests__/generic-repo-adapter.test.ts:92` — `'repos.habit.updateStatus' is possibly 'undefined'`
7. `domains/habits/repository/__tests__/generic-repo-adapter.test.ts:151` — same

## 根因（Why）

- **hooks.ts:139,149,159** 引用 `ActionType` union 之外的 3 个死 action 字符串:
  - `'resume_thread'` / `'add_task'` / `'archive_thread'`
  - [019.1] 退役 CnuiFormAdapter 后(commit 41a5bc8),这些 action 在 manifest 已删,但 `hooks.ts:139,149,159` 仍引用它们于 switch case
  - Task 6 fix dispatch 删了 hooks.ts 的 OQ-1 TODO 块,但这三个 switch case 没被扫
- **generic-repo-adapter.test.ts** 4 处错:`'repos.task.updateStatus'/'repos.thread.updateStatus'/'repos.habit.updateStatus'` 在 [019.1] Adapter 退役后,这些方法签名已从 Repository 接口移除（走 mutation-service 路径）,但测试 fixture 仍按旧 Adapter 写法 mock

**模式**：[018] G3 写入口切片 + [019.1] Adapter 退役的连锁债,扫了生产代码和主路径但未扫 hooks switch + 旧 test fixture。codex review [023.10] 抓了 task-actions 同步/AI submit 路径,但 hooks.ts 这块被遗漏。

## 影响（Impact）

| 维度 | 影响 |
|---|---|
| 业务 | 旧 action 字符串进 switch 后被 narrow 成 'never' 分支,运行时 AI 路由到此直接走 default（无操作） |
| 用户 | 无可见影响（旧 action 已无入口） |
| 技术 | 4 条 tsc 错在 baseline 103 内,不阻挡 [023.12] ship |
| 范围 | 2 个 test 文件 + 1 个 hook 文件 |
| 严重性依据 | pre-existing 中 [023.12] 暴露,数字 4/103=3.9%。一次清理可彻底解决 |

## 修复建议

```ts
// 1. domains/tasks/hooks.ts
//    删除 case 'resume_thread' / 'add_task' / 'archive_thread'（3 个 case）—— [019.1] 后已无入口
//    改为 case 'create_task' / 'edit_task' / 'complete_task'（与当前 ActionType 一致）

// 2. domains/{tasks,habits}/repository/__tests__/generic-repo-adapter.test.ts
//    mock 写法从 'repos.task.updateStatus' 改为 'TaskMutationService.execute()'（[018] G3 后的新写入口）
//    或:改 fixtures 用 mutation service 真实调用路径
```

## 预防

- **L2 [019.1] 退役 adapter 时,做仓库级 grep**:`grep -rn "generic-repo-adapter\|updateStatus" frontend/src/` 找全量引用,逐个迁移或删除。
- **plan-eng-review 必扫 hooks.ts 的所有 switch case** vs 新的 ActionType union 范围,标 stale case。

## 关联

- [[TD-016]] — 测试 fixture 漏改（部分同源,但本 TD 聚焦 pre-existing chain 端）
- [[memory/project-018-followup-todos]] — R4 timebox/okrs 写入口债 + Suspend 完整 CNUI 回环（[025]级联债）
- [[memory/project-domain-paradigm-tech-debt]] — CNUI 表单层(手写 vs CnuiFormAdapter)分叉债务（[019.1] 已部分退役）
- codex review [023.10] 抓了 7 个 pre-existing 债部分已入 TD-001~TD-009
