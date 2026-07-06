---
id: TD-014
title: Claude Code settings.json schema 顶层严格，自定义 key 整个文件加载失败
status: 新建
created: 2026-07-06
last_updated: 2026-07-06
---

# TD-014: Claude Code settings.json schema 顶层严格，自定义 key 整个文件加载失败

> Claude Code 的 `settings.json`（含 `.claude/settings.json` / `.claude/settings.local.json` / `~/.claude/settings.json`）顶层 schema 是 `additionalProperties: false`。任何 `_comment` / `$comment` / `_notes` 之类的自定义顶层 key 会被校验拒绝，导致**整个文件加载失败**——不只是拒绝那一个 key。当前所有 settings 失效（包括 `permissions.allow`），效果类似配置全丢。

## 元信息

| 字段 | 值 |
|---|---|
| 严重性 | 🟢 Low |
| 类别 | 工具 / 兼容性 |
| 领域 | `infra` |
| 录入版本 | N/A（工具链债，不绑 lifeware 业务版本） |
| 负责人 | 暂未指派 |
| 修复目标版本 | 未知（依赖 Anthropic 改 schema 设计） |
| 关联 PR/分支 | N/A |
| 关联 Constitution 条款 | N/A |

## 现象（What）

- 在 `.claude/settings.local.json` 顶层加任意 unknown key（例如 `_shadowSkill_review`）→ Edit 工具失败，错误信息：`Unrecognized field: _shadowSkill_review. Check for typos or refer to the documentation for valid fields`。
- 该错误是**配置级硬失败**——不是 warning，是 validate 拒绝整个文件。
- 失败后 `settings.local.json` 不会从磁盘删（Edit 工具的 atomic write 习惯），但 Claude Code 启动时如果不接受，整个文件等于不存在。

## 根因（Why）

- Claude Code 的 settings.json 顶层走 strict JSON schema（`additionalProperties: false`），所有合法 key 都被显式枚举。
- 设计意图：避免 settings.json 退化成"自由堆字段"的配置文件（防止字段漂移导致行为难预测）。
- 副作用：失去最自然的"在配置里加文档注释"位置。

## 影响（Impact）

| 维度 | 影响 |
|---|---|
| 业务 | 无 |
| 用户 | 无 |
| 技术 | settings.json 失去自文档能力；跨会话看到 settings 的人若想加注释会困惑 / 走弯路（实测 2026-07-06 一次） |
| 范围 | 所有 Claude Code 项目 settings.json 文件 |
| 严重性依据 | 影响零功能，**纯认知摩擦**。新会话看到这个文件的人有 ~50% 概率尝试加 `_comment` 类字段然后失败 |

## 触发场景（When）

- 触发条件：往 settings.json 顶层加任何未在 schema 中声明的 key
- 复现步骤：
  1. 编辑 `.claude/settings.local.json`
  2. 在 `permissions` 之前加 `"_my_note": {...}`
  3. 触发 Edit 工具的 validate 流程
  4. 收到 `Unrecognized field` 错误
- 出现频率：每次新会话涉及到"想给 settings 加点说明"时会触发
- 嵌套情况：`permissions.additionalProperties: {}` 是开放的（schema 里 `additionalProperties: {}`），所以 `permissions._notes` 这种**嵌套**自定义 key 不会被拒——但未实测 Claude Code 加载器对 `permissions` 块内 unknown key 的反应（文档没说）

## 临时方案（Workaround）

- 不要在 settings.json 顶层加自定义 key
- 想给 settings 加文档说明 → 写到：
  1. 项目 `NOTES.md` / `CLAUDE.md` 章节
  2. 配合的 skill 目录下 `README.md` / `SHADOW-NOTES.md` / `*-NOTES.md`
  3. 项目 memory（如本项目 `~/.claude/projects/-home-walker-lifeware/memory/`）
- 想要 settings 行为层自定义 → 走 schema 里的合法字段（`permissions.deny` / `skillOverrides` / `hooks` 等）

## 理想修复（Ideal Fix）

- **方案 A（推荐 / 等待上游）**：Anthropic 在 Claude Code 后续版本里给 settings.json 顶层加 `_comment` / `$comment` 类的 JSON-with-Comments 支持（部分 JSON 解析器原生支持 JSONC）
- **方案 B**：Anthropic 把 schema 改成 `additionalProperties: { "description": "...", "type": "object" }` 之类宽容形式，保留 unknown key 但 schema 不报错
- **方案 C（不可控）**：每个项目自己 fork Claude Code 并改 schema

## 修复成本评估

| 维度 | 评估 |
|---|---|
| 工作量 | N/A（依赖上游） |
| 风险 | N/A |
| 前置依赖 | Anthropic 改 settings.json schema |
| 是否跨域 | 否 |
| 是否影响 manifest | 否 |
| 是否需要 Drizzle migration | 否 |
| 是否需要宪章修订 | 否 |

## 验收标准（Done Criteria）

- [ ] Anthropic 在 settings.json 顶层接受 `_comment` / `$comment` 字段（或类似 JSONC 支持）
- [ ] 本项目 CI 确认 settings.json 不再因 unknown key 失败
- [ ] memory `[[feedback_claude-settings-schema-additionalprops]]` 标记为「已入库：TD-014」并补一条「Anthropic 已修」history
- [ ] 删除临时方案章节（如果已不需要）

## 跟踪记录（History）

- 2026-07-06 · N/A · 创建条目，关联发现于本项目 `/review` 冲突调查
- 2026-07-06 · N/A · memory `feedback_claude-settings-schema-additionalprops` 建立

## 关联

- 相关技术债：N/A（无重叠债条目）
- 相关 PR：N/A
- 相关 spec/plan：N/A
- 相关 memory：`[[feedback_claude-settings-schema-additionalprops]]`（反向引用 + 「已入库：TD-014」标记）
- 相关 chatgpt 对话：N/A
- 触发的设计讨论：N/A

---

**关联事件**：2026-07-06 调查项目 `/review` 冲突时，试图在 `.claude/settings.local.json` 加 `_shadowSkill_review` 字段被 Edit 工具拒绝 → 转为 `.claude/skills/pre-land-review/SHADOW-NOTES.md` 落档。
