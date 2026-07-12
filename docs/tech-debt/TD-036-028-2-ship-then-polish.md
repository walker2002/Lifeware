---
id: TD-036
title: "[028.2] 9 项 ship-then-polish backlog + 3 项 meta-pattern 债"
status: backlog
severity: 🟡 Medium
area: lifeware-timebox
created: 2026-07-12
source: [028.2] SDD reviewer + /browse + /qa + fix subagent
related: [028], [028.1], TD-006, TD-022, TD-023
---

# TD-036: [028.2] 9 项 ship-then-polish backlog + 3 项 meta-pattern 债

## 概述

`[028.2]` SHIP 后共发现 12 项遗留技术债，分 3 类：

| 类别 | 数量 | 来源 |
|---|---|---|
| **A. Ship-then-polish backlog**（SDD reviewer + /qa） | 9 项 | I-3 + 7 Minor + M-qa-1 |
| **B. /browse 抓的真 bug 模式**（测试基础设施债） | 1 项 | fix subagent 报告 [[.superpowers/sdd/task-2-fix-report.md]] |
| **C. Meta-pattern 债**（USOM 设计 + 通用 helper 抽象） | 2 项 | dispatcher 观察 |

按 record-tech-debt skill 原则：12 项债全 backlog 状态（不阻断 ship），但每项应记录到本文件并跟踪 close。

## A. Ship-then-polish backlog（9 项）

### A-1. revertableBatches state 隐式 coupling
- **Severity**: 🟡 Medium
- **来源**: SDD task reviewer (I-3)
- **位置**: `timeboxes-workspace.tsx:openAiPanel` + `handleAiConfirm` scheduleProposal 分支
- **症状**: `setRevertableBatches` 仅在 `snapshot.revertableBatches.length > 0` 时覆盖 state；空 mock 不覆盖刚 accept 写入的 batch
- **影响**: 隐式耦合，新 contributor 难以理解 state lifecycle
- **建议**: 显式状态机 `RevertableBatchesState { source: 'open' | 'submit' | 'revert' }` + 统一 reducer
- **关联**: TD-023 (timebox 写入口 bypass), TD-007 (CNUI loopback 不完整)

### A-2. score/dimensions reset 不分 branch
- **Severity**: 🔵 Low
- **来源**: SDD whole-branch reviewer (Minor 1)
- **位置**: `timeboxes-workspace.tsx:openAiPanel` setAiScore / setDimensions
- **症状**: close panel 后 score 未 reset，下一次打开仍显示旧分
- **影响**: UX 残留
- **建议**: `setAiPanelOpen(false)` 时同时 reset 所有 ai* state；或 useReducer 单一 state

### A-3. console 格式不统一
- **Severity**: 🔵 Low
- **来源**: SDD whole-branch reviewer (Minor 2)
- **位置**: cnui/handlers.ts, timeboxes-workspace.tsx 多处
- **症状**: `console.warn` / `console.error` 文案不统一（"降级返空" vs "失败（不影响主流程）" vs "失败"）
- **影响**: 调试 grep 困难
- **建议**: 集中 logger helper（`lib/log.ts`）+ 统一 tag prefix `[timeboxCnuiHandler]`

### A-4. test mock 样板重复
- **Severity**: 🔵 Low
- **来源**: SDD whole-branch reviewer (Minor 3)
- **位置**: `__tests__/cnui-handlers.test.ts` + `__tests__/timeboxes-workspace.openai.test.tsx`
- **症状**: mock `TimeboxOrchestrationHandler.onGenerate` 返回 fixtures 在多 file 重复
- **影响**: 改 onGenerate shape 时多 file 同步改
- **建议**: `__tests__/fixtures/schedule-proposal.ts` 集中 mock factory

### A-5. 双 selector / data-testid 重复
- **Severity**: 🔵 Low
- **来源**: SDD whole-branch reviewer (Minor 4)
- **位置**: AIOrchestratePanel + ScheduleProposal
- **症状**: `[data-testid=proposal-card]` 在 2 file 各自定义；`[data-testid=accept-all-btn]` 重复
- **影响**: E2E 改 selector 时多 file 同步
- **建议**: 集中 `components/test-ids.ts` const

### A-6. 文件头 @file/@brief verify 缺口
- **Severity**: 🔵 Low
- **来源**: SDD whole-branch reviewer (Minor 5)
- **位置**: 新建 `time-input-helpers.ts` + `schedule-proposal.test.tsx` 文件头 verify 不充分
- **症状**: 部分新文件头注释略简（[028.2] T1 brief 关注核心，文件头让 reviewer 抓出可改进）
- **影响**: 注释规范遵守度弱化
- **建议**: lint rule 强制 @file/@brief 行存在 + 长度 ≥ 50 字符

### A-7. handleAiConfirm verify 缺口
- **Severity**: 🔵 Low
- **来源**: SDD whole-branch reviewer (Minor 6)
- **位置**: `timeboxes-workspace.ai-submit.test.tsx` scheduleProposal 分支覆盖薄弱
- **症状**: scheduleProposal accept 路径只有 1 个 mock test，缺 batchId 写入 revertableBatches 验证
- **影响**: future regression 风险
- **建议**: 补 unit test 覆盖 batchId 写入 + toast.success 路径

### A-8. isoOrHhmmToHhmmInShanghai helper 缺 throw 测试
- **Severity**: 🔵 Low
- **来源**: SDD whole-branch reviewer (Minor 7)
- **位置**: `time-input-helpers.ts:isoOrHhmmToHhmmInShanghai`
- **症状**: 已加 +26 contract test，但非法输入（null / 24:00 / 'abc'）未覆盖
- **影响**: edge case 行为未锁定
- **建议**: 补 3-5 case: null / undefined / '24:00' / 'abc' / ISO without Z

### A-9. AIOrchestratePanel 缺 aria-label
- **Severity**: 🔵 Low
- **来源**: /qa post-ship review (M-qa-1)
- **位置**: `AIOrchestratePanel.tsx:32-77` 所有 button 缺 aria-label
- **症状**: button 用 Chinese text "接受" / "拒绝"——AT-readable 但 WCAG 2.1 AA 推荐 explicit aria-label
- **影响**: a11y 评分中段
- **建议**: `aria-label="接受 ${title} 时间盒"` + `aria-label="拒绝 ${title} 时间盒"`

## B. 测试基础设施债（1 项）

### B-1. mock LLM provider 测试用 ISO 替身 vs 真实 generateProposals 走 HH:MM 双路径并存
- **Severity**: 🟠 High（meta-pattern，已导致 [028.2] /browse 抓 Bug #2）
- **来源**: [028.2] fix subagent 报告 insight
- **位置**: `__tests__/orchestration-handler.test.ts`（mock fixture ISO）+ `orchestration-handler.ts:716`（`formatTime` 写 HH:MM）
- **症状**: unit test 用 ISO string mock onGenerate 返 payload.startTime 走 ISO 路径 pass，但真实 runtime `generateProposals` 直接 `formatTime(cursorHour, cursorMinute)` 写 HH:MM，两条路径并存导致 T1 unit test pass 但 [028.2] /browse break
- **影响**: 任何 future shape 变更难被 unit test catch
- **建议**: 
  1. 补 `__tests__/schedule-proposal.test.tsx` **真实 `generateProposals` 集成测试** + visual assertion（DOM 时间显示）
  2. fixture 统一：mock provider 必须用真实 generateProposals 走查
  3. contract test: `payload.startTime` shape 在 mock + 真实两条路径都相同
- **关联**: TD-006 (orchestration N+1 sequential), TD-036-A-4 (mock 样板重复)

## C. Meta-pattern 债（2 项）

### C-1. GenerationResult interface 在 USOM 是 read-only surface，但 runtime add field via type-pun
- **Severity**: 🟡 Medium（USOM design 债）
- **来源**: dispatcher 观察 [028.2] fix Bug #1 时发现
- **位置**: `frontend/src/usom/types/process.ts:GenerationResult` interface + `orchestration-handler.ts:218` type-pun `result as { score?: number; dimensions?: Record<string, number> }`
- **症状**: `[028]` ship 时遗漏 result shape 字段；[028.2] fix 用了 type-pun 而非 interface 升级；其他 handler 可能重复此模式
- **影响**: USOM definition 与 runtime result shape 不一致，编译时 type-pun 隐藏错误
- **建议**: 
  1. GenerationResult interface 升级（加 optional field）
  2. 加 lint rule 禁 `as { ... }` type-pun 在 result handling
  3. 评估 USOM ↔ runtime result shape governance（与 TD-022 archetype clearing 3-state 模式同源）
- **关联**: TD-022 (post-ship adversarial deferred)

### C-2. ISO↔localTime 转换 helper 未通用抽象
- **Severity**: 🔵 Low（dev debt）
- **来源**: dispatcher 观察 [028.2] T1 fix 时发现
- **位置**: `time-input-helpers.ts` 当前 3 个 helper：`isoToLocalDatetimeInput` / `localDatetimeInputToIso` / `hhmmToIso` / `isoToHhmmInShanghai` / `isoOrHhmmToHhmmInShanghai`
- **症状**: 5 个 helper 各自处理特定方向，未来 ISO↔HH:MM↔datetime-local 转换会重复 pattern
- **影响**: 命名 + 位置不一致（有些 export 有些不 export）
- **建议**: 提取 `lib/time-format.ts` 统一 abstraction + export all

## 跟踪与状态

| 债 | Severity | 来源 | 状态 |
|---|---|---|---|
| A-1 revertableBatches coupling | 🟡 | SDD I-3 | backlog |
| A-2 score reset 不分 branch | 🔵 | SDD Minor | backlog |
| A-3 console 格式 | 🔵 | SDD Minor | backlog |
| A-4 test mock 样板重复 | 🔵 | SDD Minor | backlog |
| A-5 双 selector | 🔵 | SDD Minor | backlog |
| A-6 文件头 verify | 🔵 | SDD Minor | backlog |
| A-7 handleAiConfirm verify | 🔵 | SDD Minor | backlog |
| A-8 helper 缺 throw test | 🔵 | SDD Minor | backlog |
| A-9 aria-label | 🔵 | /qa M-qa-1 | backlog |
| B-1 mock vs 真实 generateProposals | 🟠 | fix subagent | backlog |
| C-1 GenerationResult type-pun | 🟡 | dispatcher | backlog |
| C-2 ISO↔HH:MM helper 抽象 | 🔵 | dispatcher | backlog |

## 关联

- `[028]` ScheduleProposal ship + `[028.1]` ISS-002 fix → `[028.2]` wire-up
- `[[feedback_post-ship-review-meta-pattern]]` **第 5 次**（A-1/A-2/A-3 印证） + 累积 5 次
- `[[project-cross-module-dispatch-blindspot]]` **第 N 次**（B-1 印证）
- TD-006 orchestration N+1（[028.2] 4 源归集后可能加剧 — future audit）
- TD-022 post-ship adversarial deferred（C-1 同源）

## 修复优先级建议

| 优先级 | 债 | 理由 |
|---|---|---|
| P1 | B-1 mock vs 真实 | 已导致 [028.2] /browse Bug #2，下个 PR 必须修 |
| P2 | C-1 GenerationResult type-pun | USOM design 债，多次出现已显示 pattern |
| P3 | A-1 revertableBatches coupling | UX 残留，新 contributor 困惑 |
| P4 | A-9 aria-label | a11y 评分 |
| P5+ | A-2..A-8 + C-2 | dev debt / 注释规范 / 重构 — 累积 |

## Why

[028.2] SDD 4 层 verification（task review + whole-branch review + pre-push hooks + unit test）全过且 Ship-ready，但 `/browse` 真实浏览器验证抓 2 P0——印证 [[feedback_post-ship-review-meta-pattern]] 第 5 次。ship-then-polish backlog 不仅是 [028.2] 债，也是 Lifeware 项目对「post-ship 真实视觉验证」的累积学习。

## How to apply

- **下次 [028.3] 或 timebox 域 feature**: 起新 ticket 前，先看本文件 backlog + TD-006/TD-022/TD-023 关联债
- **季度回顾**: `/plan-ceo-review` 调起本文件作为 input
- **/record-tech-debt skill**: 新债录入保持 TD-NNN-{slug}.md 单 file 模式，本汇总文件是 [028.2] 一组债的容器（不重复登记）