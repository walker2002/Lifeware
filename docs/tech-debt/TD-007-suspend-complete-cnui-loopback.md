---
id: TD-007
title: "Suspend action 完整 CNUI 回环未闭环(双注册缺一层) → 描述与代码脱节,债不成立"
status: ✅ 已修复
severity: 🟡 → ✅ (误记,从未实际存在)
created: 2026-07-06
last_updated: 2026-07-12
closed: 2026-07-12
fix_version: N/A(债描述与代码脱节;tasks 域 Suspend 从未引入)
---

# TD-007: "Suspend action 完整 CNUI 回环未闭环(双注册缺一层)" → 描述与代码脱节,债不成立

> 摘要:**原描述错误**。tasks 域 lifecycle 从未含 `suspendTask` action。Suspend 字面量专属 habits 域(`suspendHabit`,4 路全闭合)。tasks 域的真实"暂停主线"是 `pauseThread`(≠suspend),"结束任务"是 `completeTask`/`archiveTask`。TD-007 创建时基于历史口头叙述,未与代码 sync。本会话通过 5 路 grep + 4 文件精读证实无功能缺口。

## 元信息

| 字段 | 值 |
|---|---|
| 严重性 | 🟡 Medium → ✅(误记,功能从未缺) |
| 类别 | 架构 |
| 领域 | `lifeware-tasks` |
| 录入版本 | v0.X.X ([023.10]) |
| 负责人 | 暂未指派 |
| 修复目标版本 | N/A(债不成立) |
| 关联 PR/分支 | N/A |
| 关联 Constitution 条款 | C-NN(CNUI 双注册约束) |

## 调研结论(代码为权威源)

5 路 grep 验证,均无 `task.suspend` / `suspendTask` 痕迹:

1. **`frontend/src/domains/tasks/manifest.yaml` `intent_triggers` A 区块**(line 12-138):
   - thread 域 actions:`createThread/updateThread/archiveThread/pauseThread/resumeThread/completeThread/deleteThread`(7 个)
   - task 域 actions:`createTask/updateTask/completeTask/archiveTask/deleteTask`(5 个)
   - **无 `suspendTask`**

2. **`frontend/src/domains/tasks/manifest.yaml` `cnui_surfaces` K-block**(line 498-512):
   - 6 个 surface:`thread-creation-card/thread-action-panel/task-creation-card/task-edit-card/task-action-panel/task-tree-view`
   - **无 `task-suspend`**

3. **`frontend/src/domains/tasks/cnui/handlers.ts`**(server side):
   - `TASK_LIFECYCLE_STATUS_MAP` line 14-17:仅 `completeTask: 'in_progress'` / `archiveTask: 'completed'`
   - `TASK_LIFECYCLE_SM_ACTION` line 23-27:仅 `completeTask: 'complete'` / `archiveTask: 'archive'` / `deleteTask: 'delete'`
   - **无 `suspendTask`**

4. **`frontend/src/nexus/ai-runtime/cnui/register-client-surfaces.ts`**(client side):
   - line 49-62:tasks 域已注册 6 个 surface
   - **无 `task-suspend` 注册**

5. **`grep -rn suspend frontend/src/`**:
   - 命中仅在 habits 域(`habits/cnui/handlers.ts:18` + `habits/manifest.yaml:29` + `habits/rules-registry.ts:70`)
   - tasks 域 0 hit

## 对照 pauseThread 4 路验证(全闭合,作为对照证据)

| 4 路注册 | pauseThread 状态 |
|---|---|
| Server `cnui/handlers.ts` | ✅ line 35 / 44 已注册(`pauseThread: 'active'` / `'pause'`) |
| Client `register-client-surfaces.ts` | ✅ line 61 `tasks / thread-action-panel` |
| Manifest K-block | ✅ `thread-action-panel`(handler: `./cnui/handlers`) |
| Manifest A-block intent_trigger | ✅ line 41 `action: pauseThread` shortcut `/pauseThread` |

## 原现象描述与代码脱节的具体差异

| 原描述 | 代码实际 |
|---|---|
| `[018]` G3 ④⑤ 落地后 server 注册了 `task.suspend` | tasks manifest 从未含 `suspendTask` action |
| 漏了 client 端 `task.suspend` 注册 | 无对应 client 注册(因为根本无该 surface) |
| 用户点 Suspend 弹"未知卡片类型" | 用户实际可点 `pauseThread`(主线) 或 `completeTask/archiveTask`(任务),无 Suspend 入口 |

## 影响（Impact）

| 维度 | 影响 |
|---|---|
| 业务 | **无功能缺口** —— tasks 域 lifecycle 设计本就不含 Suspend |
| 用户 | 用户真实可用的"暂停主线 / 结束任务"路径在 pauseThread + completeTask 上,均正常工作 |
| 技术 | [[project-cnui-surface-dual-registration]] 4 路约束在 tasks 域 6 个 surface 上**100% 闭合**(本会话已 ship [025]+[026.01] 多轮验证) |
| 范围 | N/A(债不成立) |

## 修复方案

**无代码改动** —— 债描述错误,功能从未缺。

- 若未来真有"暂停 task"需求,正确路径是**新增 `suspendTask` action**(走 [018] G3 流程,2 处 manifest + 1 处 server handler + 1 处 client register + 1 处 surface 组件 + vitest + /browse 验证)。**不是**"补注册"。
- 当前 lifecycle 的 `archiveTask`(已归档=变相"长期暂停")可满足多数场景。

## 验收标准（Done Criteria）

- [x] 5 路 grep 验证 tasks 域无 `suspendTask` 任何痕迹
- [x] 5 路 grep 验证 habits 域 `suspendHabit` 4 路全闭合(对照证据)
- [x] pauseThread 4 路全闭合(对照证据)
- [x] tasks 域 6 个 surface 4 路全闭合(本会话已 ship 多轮)
- [x] 用户实际可用路径(pauseThread / completeTask / archiveTask)功能正常
- [x] [[project-cnui-surface-dual-registration]] 自检清单 4 路全过

## 跟踪记录（History）

- 2026-07-06 · [023.10] · 创建条目,源自 [018] followup 历史遗留(Suspend ⑥ 未闭环)
- 2026-06-XX · G3 ④⑤ 判定模型落地(95c1907)
- 2026-07-12 · 「技术债清除会话[001-002+]」调研 + 关闭:
  - **关键发现**:tasks 域 manifest 从未含 `suspendTask` action,Suspend 字面量专属 habits 域。
  - **5 路验证**:manifest A-block / K-block / server handlers / client register / grep suspend → 0 缺口
  - **对照证据**:pauseThread 4 路全闭合(证实双注册约束在 tasks 域严格遵守)
  - **结论**:TD-007 描述与代码脱节,债不成立。印证[[feedback_post-ship-review-meta-pattern]] + 债目录与代码脱节自查模式(类似 TD-005 部分过期内容)
- 2026-07-12 · **TD-007 关闭**:无需代码改动,文档化调研结论。

## 关联

- 相关技术债：[[TD-012]] (CNUI 表单分叉,suspect 同根 → 但 TD-012 也需重新验证)
- 相关 PR：95c1907(G3 ⑤,但实际交付是 pauseThread 非 suspend)
- 相关 memory：`[[project-018-followup-todos]]`(Suspend ⑥ 段) `[[project-cnui-surface-dual-registration]]`(双注册约束)
- 相关约束：[[feedback_cnui-checkpoints]] CUC-01~CUC-12
- **模式记录**:**债目录与代码脱节自查模式** —— 任何债在关闭前必 grep + Read 4 路验证(manifest A-block/K-block/server/client/grep),不只是看描述就关。类似 [[feedback_post-ship-review-meta-pattern]] 第 N 次。