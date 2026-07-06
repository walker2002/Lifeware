---
id: TD-012
title: [023.05-1] PR1 Polish 3 Minor(测试文案残留旧词)
status: 登记
created: 2026-07-06
last_updated: 2026-07-06
---

# TD-012: [023.05-1] PR1 Polish 3 Minor(测试文案残留旧词)

> 摘要：`[023.05-1]` PR1 阶段 polish 后,3 处测试 fixture/it() 标题仍残留「日程 / schedule / view_schedule」旧词。

## 元信息

| 字段 | 值 |
|---|---|
| 严重性 | ⚪ Trivial |
| 类别 | 代码债 |
| 领域 | `lifeware-timebox` |
| 录入版本 | v0.X.X ([023.10]) |
| 负责人 | 暂未指派 |
| 修复目标版本 | 未知 |
| 关联 PR/分支 | N/A([023.05-1] 已 ship) |
| 关联 Constitution 条款 | N/A |

## 现象（What）

[023.05-1] PR1 已把 `it() title` 「调整日程」改为「调整剩余时间盒」,fixture keywords 从 `['日程','schedule']` 改为 `['时间盒','timebox']`,`view_schedule` 改为 `view_timebox_schedule`(INLINE_DISPATCH 清掉)。但仍有 3 处未跟进:

- `handlers.test.ts:139` it() title(可能被后续 PR 部分覆盖)
- `domain-types.test.ts:170-172` fixture keywords(部分 case)
- `action-view.test.tsx:75` 仍保留 `timebox.view_schedule` snake_case

## 根因（Why）

- PR1 polish 时 whole-branch review 抓出 Minor 项,实施时漏 3 处
- 后续 PR2 阶段 2(itinerary→appointment)目标词覆盖,polish 优先级降级
- 测试文案遗留不影响功能,但 F1 grep 0 hits 检查通过需先清

## 影响（Impact）

| 维度 | 影响 |
|---|---|
| 业务 | 无功能影响 |
| 用户 | 无 |
| 技术 | F1 grep 检查可能仍命中,违反 [023.05-1] 设计承诺 |
| 范围 | `frontend/src/domains/timebox/__tests__/handlers.test.ts` + `domain-types.test.ts` + `frontend/src/cnui/action-view.test.tsx` |
| 严重性依据 | 仅文案一致性 |

## 触发场景（When）

- 触发条件：F1 grep 检查 「日程 / schedule / view_schedule」
- 复现步骤：grep -rE "日程|view_schedule" frontend/src
- 出现频率：CI 检查时

## 临时方案（Workaround）

- 已知状态,手动 skip

## 理想修复（Ideal Fix）

- **方案 A（推荐）**：3 处文案统一改「时间盒 / timebox / view_timebox_schedule」
- **方案 B**：维持现状,接受 F1 grep 局部命中

## 修复成本评估

| 维度 | 评估 |
|---|---|
| 工作量 | 0.2 人日 |
| 风险 | 极低(纯文案) |
| 前置依赖 | 无 |
| 是否跨域 | 否 |
| 是否影响 manifest | 否 |
| 是否需要 Drizzle migration | 否 |
| 是否需要宪章修订 | 否 |

## 验收标准（Done Criteria）

- [ ] grep `view_schedule` 在 frontend/src 命中 = 0
- [ ] grep `日程` 在测试文件命中 = 0(除文档/翻译外)
- [ ] vitest 回归通过
- [ ] tsc 无新增报错

## 跟踪记录（History）

- 2026-07-06 · [023.10] · 创建条目,源自 [023.05-1] PR1 polish follow-up 遗留
- 2026-07-05 · [023.05-1] PR1 polish commit `f0efd68` · 4 Minor 修了 1 处,3 处遗留

## 关联

- 相关 PR：[023.05-1] commit `f0efd68`(PR1 polish)
- 相关 spec/plan：`docs/superpowers/plans/2026-07-04-023-05-1-timebox-schedule-cleanup.md`
- 相关 memory：`[[project-023-05-1-timebox-cleanup]]`(PR1 polish 段)