---
id: TD-013
title: manifest validator K-component PascalCase 约束未文档化 → docs/manifest-rules.md + validator 错误信息附链接
status: ✅ 已修复
severity: 🟢 → ✅
created: 2026-07-06
last_updated: 2026-07-12
closed: 2026-07-12
fix_version: main docs/manifest-rules.md (new file) + validate-manifest.ts 增强
---

# TD-013: manifest validator K-component PascalCase 约束未文档化

> 摘要：`validate-manifest` 的 K-component 强制 PascalCase 命名约束曾在 [023] pre-push hook 抓出 3 个 surface 文件命名违规,但该约束未沉淀到 manifest 编写指南,后续新增 surface 易再次踩坑。

## 元信息

| 字段 | 值 |
|---|---|
| 严重性 | 🟢 Low |
| 类别 | 流程 |
| 领域 | `infra` |
| 录入版本 | v0.X.X ([023.10]) |
| 负责人 | 暂未指派 |
| 修复目标版本 | 未知 |
| 关联 PR/分支 | N/A |
| 关联 Constitution 条款 | C-NN(manifest validator 约束) |

## 现象（What）

新增 CNUI surface 文件时,文件名 kebab-case(如 `create-timebox.tsx`)会被 validator 拦下,要求 PascalCase(如 `CreateTimebox.tsx`)。该约束在 [023] A2 ship 时被 pre-push hook 抓 3 次,导致 commit 0ab6e6c 改名后才通过。但该约束未沉淀到 `docs/manifest-rules.md` 或类似指南,后续 onboarding 易踩坑。

## 根因（Why）

- validator 实现已包含 PascalCase 检查(代码层面),但无对应文档
- [023] A2 时抓出问题后立即修复,未抽时间补文档
- 表面/规范的文档化债(类似 `validate:manifest K-component` 在 plan-eng-review 常被提到)

## 影响（Impact）

| 维度 | 影响 |
|---|---|
| 业务 | 无功能影响 |
| 用户 | 无 |
| 技术 | onboarding 摩擦,validator 抓错不友好 |
| 范围 | `docs/superpowers/specs/` 缺一篇 manifest 编写指南 |
| 严重性依据 | 流程效率影响 |

## 触发场景（When）

- 触发条件：新开发者新增 CNUI surface 文件,kebab-case 命名
- 复现步骤：1. 创建 `frontend/src/cnui/surfaces/my-new-card.tsx` 2. pre-push hook 拦下
- 出现频率：新 PR 阶段

## 临时方案（Workaround）

- 出错后问 Claude 或查 git 历史
- 自行研究 validator 源码

## 理想修复（Ideal Fix）

- **方案 A（推荐）**：新增 `docs/manifest-rules.md` 编写指南,沉淀 validator 全部约束(命名/字段/版本等)
- **方案 B**：增强 validator 错误信息(已部分做,但需更详细)
- **方案 C**：维持现状

## 修复成本评估

| 维度 | 评估 |
|---|---|
| 工作量 | 1 人日(读 validator 源码 + 沉淀文档) |
| 风险 | 低(纯文档) |
| 前置依赖 | 无 |
| 是否跨域 | 否 |
| 是否影响 manifest | 否 |
| 是否需要 Drizzle migration | 否 |
| 是否需要宪章修订 | 否 |

## 验收标准（Done Criteria）

- [ ] `docs/manifest-rules.md` 编写指南上线
- [ ] 指南覆盖：命名约定 / 必填字段 / 版本号规范 / K-component / 约束规则
- [ ] pre-push hook 错误信息附指南链接
- [ ] 新开发者按指南编写 surface 文件 0 报错

## 跟踪记录（History）

- 2026-07-06 · [023.10] · 创建条目,源自 [023] A2 ship 时 pre-push hook 抓 3 次(commit 0ab6e6c)
- 2026-06-29 · [023] A2 commit `0ab6e6c` · 3 surface 文件名 kebab → PascalCase
- 2026-07-12 · 「技术债清除会话[001-002]」本次修复:
  - **(a) 新建 `docs/manifest-rules.md`**（13 节,~360 行）:沉淀 `validate-manifest.ts` 全部约束：
    1. 文件位置 & 入口
    2. 必填字段(id/name/version)
    3. 顶级区块顺序约定
    4. 命名约定（surfaceType kebab-case + 组件 PascalCase + handler 路径）
    5. 区块 A intent_triggers 规则
    6. 区块 K cnui_surfaces 规则（**K-component PascalCase 约束主文档**）
    7. 区块 G/Q generation_actions & query_actions
    8. 跨域约束（surface type 全局唯一）
    9. 区块 C field_metadata 嵌套
    10. 区块 L lifecycle
    11. 执行命令
    12. 常见错误速查（11 个错误 + 修复）
    13. 实战示例（完整 timebox manifest）
  - **(b) validator 增强**:`validate-manifest.ts:319` K-component-not-found 错误信息附 `docs/manifest-rules.md §4.2` 章节指引；文件头加 [TD-013] 标记 + 顶层指引
  - **(c) 验证**:`npx tsx scripts/validate-manifest.ts` 跑通 — 4 domain, 0 错, 2 警告 (K-unreferenced-surface pre-existing in tasks), 2 info, **0 新增 error**
- 2026-07-12 · **TD-013 关闭**:约束文档化 + validator 错误信息附指引 + 0 regression

## 关联

- 相关 PR：[023] A2 commit `0ab6e6c`
- 相关 spec/plan：`docs/superpowers/plans/2026-07-04-023-04-timebox-cnui-optimization-design.md` 段
- 相关 memory：`[[project-023-timebox-reorg]]`(A2 ship 段)
- 相关代码：`frontend/scripts/validate-manifest.*`