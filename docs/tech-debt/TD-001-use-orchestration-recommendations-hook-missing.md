---
id: TD-001
title: useOrchestrationRecommendations hook 不存在,T8 defer 至 [023.11] → [028.2] 真接 submitCnuiSurface 关闭
status: ✅ 已修复
severity: 🟠 → ✅
created: 2026-07-06
last_updated: 2026-07-12
closed: 2026-07-12
fix_version: [028.2]
---

# TD-001: useOrchestrationRecommendations hook 不存在,T8 defer 至 [023.11]

> 摘要：[023.10] plan T8 假设 `useOrchestrationRecommendations` hook 已存在,实际 grep 全 src 零命中。T8 整体 defer 到 [023.11],需先建 hook 再完成 workspace proposals 的真 wire。

## 元信息

| 字段 | 值 |
|---|---|
| 严重性 | 🟠 High |
| 类别 | 架构 |
| 领域 | `lifeware-timebox` |
| 录入版本 | v0.X.X ([023.10]) |
| 负责人 | 暂未指派 |
| 修复目标版本 | v0.Y.Y ([023.11]) |
| 关联 PR/分支 | `feat/023-10-postship-defer-cleanup` |
| 关联 Constitution 条款 | N/A |

## 现象（What）

`/workspace` 页面中 `useOrchestrationRecommendations()` 在原 plan 里假设已 ship,实际调用站点 `workspace/handleAiConfirm` 在 [023.10] 阶段用 placeholder 替代(revert action 未真 wire)。

## 根因（Why）

- [023.08] createSmartTimeboxes stub fix 时,hook 实现被标 "future work",未与 main 同步
- [023.10] plan 写者按"已 ship"假设写 T8,但 whole-branch reviewer 通过 Codex cold read 抓出(`Codex #6` 修订)
- hook 缺失导致 `handleAiConfirm` revert 流程残废,用户撤销 AI 编排结果时走 placeholder 而非真 dispatch

## 影响（Impact）

| 维度 | 影响 |
|---|---|
| 业务 | `/workspace` 页"撤销 AI 编排结果"动作实质无效 |
| 用户 | 用户撤销操作后,AI 生成的 timeboxes 未真正 revert,造成用户预期与实际行为偏离 |
| 技术 | hook 不存在是架构债的早期信号——`/workspace` 子系统缺一个统一入口 |
| 范围 | `frontend/src/workspace/` `frontend/src/cnui/handlers.ts` |
| 严重性依据 | 影响 workspace 全部用户(单页面功能缺失),出现频率 100% |

## 触发场景（When）

- 触发条件：用户在 `/workspace` 页点击 AI 编排后撤销
- 复现步骤：1. 进入 `/workspace` 2. 触发 AI 编排 3. 点击撤销
- 出现频率：100%

## 临时方案（Workaround）

- T8 整体 defer 到 [023.11],本轮 ship [023.10] 不含此修复
- 占位实现：[023.10] commit `eece955` 提供了 revert placeholder,但不接真 dispatch

## 理想修复（Ideal Fix）

- **方案 A（推荐）**：在 [023.11] 新建 `useOrchestrationRecommendations` hook,封装 proposal 列表 + 推荐 reason + revert action 真 wire 到 `submitCnuiSurface`
- **方案 B**：复用已有 `useProposals` hook + 包装一层 orchestration 语义
- **方案 C**：直接走 cnui/handlers 的 surface handler,跳过 hook 层

## 修复成本评估

| 维度 | 评估 |
|---|---|
| 工作量 | 1-2 人日 |
| 风险 | 中(涉及 AI 编排流程,需回归测试) |
| 前置依赖 | [023.11] plan 落地 |
| 是否跨域 | 否 |
| 是否影响 manifest | 否 |
| 是否需要 Drizzle migration | 否 |
| 是否需要宪章修订 | 否 |

## 验收标准（Done Criteria）

- [ ] `useOrchestrationRecommendations` hook 实现完整(proposals / recommendations / revert action 三件套)
- [ ] `workspace/handleAiConfirm` revert 走真 `submitCnuiSurface`,不再 placeholder
- [ ] vitest 新增 hook 测试覆盖 reorder / revert / refresh 三路径
- [ ] `/browse` 真实 PG 落库下:`/workspace` 触发 AI → 撤销 → proposal 数量正确回退
- [ ] 删除 placeholder 代码

## 跟踪记录（History）

- 2026-07-06 · [023.10] · 创建条目,plan T8 标 defer,Codex #6 抓出 hook 缺失
- 2026-07-05 · [023.10] T1 commit `eece955` · revert placeholder 上线(非根本解决)
- 2026-07-05 · [023.10] commit `eece955` · **核心修复**:workspace `handleAiConfirm` revert 分支真 wire 到 `submitCnuiSurface('timebox', 'revertSmartTimeboxes', { batchId })`,替代原 placeholder toast
- 2026-07-05 · [023.10] commit `4d6e7ca` · accept path 也修：handleAiConfirm accept 走 `submitCnuiSurface` 而非 `submitDynamicIntent`(后者不接受 `{ items }` 格式)
- 2026-07-12 · [028.2] commit `34ba5b9` · `openAiPanel` 真接 `TimeboxOrchestrationHandler.onGenerate`(4 源归集 + 5 维评分),取代 [023.08] T5 静态 mock proposals
- 2026-07-12 · [028.2] commit `74fd9b1` · `/qa` ISSUE-001 P0:handleAiConfirm 加 `scheduleProposal` accept 分支(原 100% 静默无操作),走真 `submitCnuiSurface`
- 2026-07-12 · [028.2] · `handleAiConfirm` deps 加 `revertableBatches`(line 559),避开 stale closure 陷阱
- 2026-07-12 · [028.2] · **关闭条件齐**:`handleAiConfirm` 3 分支(revertSmartTimeboxes / createTimebox / scheduleProposal)+ `openAiPanel` 全部真 dispatch;`revertableBatches` deps 含;`/qa` health 100;dev server @e7 触发 AI → 接受 3 → DB `timeboxes` 表新增 3 行 planned;0 console errors
- 2026-07-12 · **TD-001 关闭**：cross-module dispatch 完整闭合(cnui/handlers open + workspace handleAiConfirm revert + submit batch recording),修复版本标 `[028.2]`

## 关联

- 相关技术债：[[TD-006]] (N+1 sequential,同 orchestration 子系统)
- 相关 PR：`feat/023-10-postship-defer-cleanup`
- 相关 spec/plan：`docs/superpowers/plans/2026-07-05-023-10-postship-defer-cleanup.md` (T8 段落)
- 相关 memory：`[[project-023-08-createSmartTimeboxes-stub-fix]]`(hook 未建的源头) `[[project-023-10-postship-defer-cleanup]]`
- 触发的设计讨论：`~/.gstack/.../023-10-postship-defer-cleanup.md` Code review