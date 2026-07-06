---
id: TD-NNN
title: 一句话标题
status: 新建
created: YYYY-MM-DD
last_updated: YYYY-MM-DD
---

# TD-NNN: 一句话标题

> 摘要：3-5 行说清「问题是什么 + 当前用什么方案绕开 + 何时会爆」

## 元信息

| 字段 | 值 |
|---|---|
| 严重性 | 🔴 Critical / 🟠 High / 🟡 Medium / 🟢 Low / ⚪ Trivial |
| 类别 | 架构 / 数据 / 性能 / 安全 / 测试 / 文档 / 工具 / 流程 / 兼容性 |
| 领域 | `lifeware-habits` / `lifeware-tasks` / `lifeware-okrs` / `lifeware-timebox` / `lifeware-appointments` / `cross-domain` / `infra` |
| 录入版本 | v0.X.X ([023.XX]) |
| 负责人 | 暂未指派 / @username |
| 修复目标版本 | v0.Y.Y ([024.YY]) / 未知 |
| 关联 PR/分支 | `feat/xxx` |
| 关联 Constitution 条款 | C-NN（可选）/ N/A |

## 现象（What）

> 用户/系统实际观察到的偏差。包含报错、行为偏离、性能数据、可复现的最小步骤。

例：
- 在 Chrome 124+ 上，`/tasks` 页面打开耗时 ≥3.5s，devtools 显示 `ProseMirror` 序列化阻塞主线程 800ms+
- `completeTask` 调用 `revertSmartTimeboxes` 时偶发 1/50 概率抛 `null pointer in orchestrator.dispatch`

## 根因（Why）

> 为什么会出现这个现象。代码、架构、流程、依赖、数据层面的真实原因。

例：
- `cnui/handlers.ts:440` 的 `revertSmartTimeboxes` guard 误把"draft proposal 全部跳过"当成"无 proposal 可回滚"，导致空 batches 也走完整编排管线
- 设计期未考虑 `generateProposals` 在边界场景下的 livelock（参 [[project-023-07-pre-existing-cleanup]]）

## 影响（Impact）

| 维度 | 影响 |
|---|---|
| 业务 | … |
| 用户 | … |
| 技术 | … |
| 范围 | `frontend/src/cnui/handlers.ts`、`frontend/src/nexus/orchestrator/dispatcher.ts` 等 N 个文件 |
| 严重性依据 | 影响多少用户 / 多大概率触发 / 多大损失 |

## 触发场景（When）

> 什么时候会暴露：复现路径、触发条件、出现频率。

- 触发条件：…
- 复现步骤：1. … 2. … 3. …
- 出现频率：100% / 偶发（~1/N）/ 罕见（<1/1000）

## 临时方案（Workaround）

> 已经采取的规避措施。如果还没有就写「无」。

- …
- 兜底开关：`feature_flag_X = false`
- 关联 commit：`abc1234`

## 理想修复（Ideal Fix）

> 根因级别的解决方案。重构 / 重写 / 加迁移 / 改宪章 等。

- **方案 A（推荐）**：…
- **方案 B**：…
- **方案 C**：…

## 修复成本评估

| 维度 | 评估 |
|---|---|
| 工作量 | X 人日 |
| 风险 | 高 / 中 / 低 |
| 前置依赖 | … |
| 是否跨域 | 是 / 否 |
| 是否影响 manifest | 是 / 否 |
| 是否需要 Drizzle migration | 是 / 否 |
| 是否需要宪章修订 | 是 / 否 |

## 验收标准（Done Criteria）

> 怎么确认这个问题被彻底修复了（不是表面掩盖）。

- [ ] …
- [ ] vitest 新增测试覆盖根因场景，CI 全绿
- [ ] tsc 无新增报错
- [ ] `/qa` 或 `/browse` 在真实 PG 落库下复现 → 修复后不再复现
- [ ] 已删除临时方案的兜底代码
- [ ] 已更新宪章/USOM/DB 设计文档（如适用）

## 跟踪记录（History）

> 时间倒序，最近在上。每条带版本号或 commit hash。

- YYYY-MM-DD · v0.X.X ([023.XX]) · 创建条目
- YYYY-MM-DD · v0.Y.Y · 临时方案上线（commit `abc1234`）
- YYYY-MM-DD · v0.Z.Z · 根本修复，关闭条目

## 关联

- 相关技术债：[[TD-NNN]]（双向链）
- 相关 PR：`feat/xxx` / `#123`
- 相关 spec/plan：`docs/superpowers/specs/...md` / `docs/superpowers/plans/...md`
- 相关 memory：`[[memory-name]]`
- 相关 chatgpt 对话：（可选链接）
- 触发的设计讨论：`~/.gstack/.../*.md`

---

**模板使用说明**

1. 复制本文件 → `TD-NNN-{slug}.md`（slug 用 kebab-case 中文拼音或英文短词）
2. 填完元信息表 + 各小节，未知项写「未知」而不是留空（防止检索时漏掉）
3. 同步更新 `docs/tech-debt/README.md` 索引
4. 完成修复后：状态改为「已修复」、加关闭日期、保留历史记录不删（审计可追溯）