---
id: TD-015
title: Claude Code 内置 /review shadow gstack /review skill
status: 新建
created: 2026-07-06
last_updated: 2026-07-06
---

# TD-015: Claude Code 内置 /review shadow gstack /review skill

> Claude Code 在 `cli.js` 里硬编码了 `/review` 命令（`type: "prompt"`, `source: "builtin"`, 描述 "Review a pull request"）。当用户在装了 gstack `/review` skill 的项目里输入 `/review` 时，**内置命令优先匹配**，gstack 的多轮专项派单 review 实际不跑。`skillOverrides` / `disableBundledSkills` 都关不掉这个内置命令（前者只对 skill 有效，后者明确"built-in slash commands stay typable"）。本项目走「本地 shadow skill + sync.sh」方案临时绕开。

## 元信息

| 字段 | 值 |
|---|---|
| 严重性 | 🟢 Low |
| 类别 | 兼容性 / 工具 |
| 领域 | `infra` |
| 录入版本 | N/A（工具链债） |
| 负责人 | 暂未指派 |
| 修复目标版本 | 未知（依赖 Anthropic 把内置 `/review` 改名） |
| 关联 PR/分支 | N/A |
| 关联 Constitution 条款 | N/A |

## 现象（What）

- 用户在本项目（lifecycle 配置下用 gstack `plan → review → ship` 硬关卡）输入 `/review` → 实际触发的是 Claude Code 内置的"Review a pull request"（单步 diff 审查），不是 gstack 的 SQL safety / LLM trust boundary / 7 类 specialist 并行派单 review
- 表现：内置 review 不做 scope drift check、不查 plan completion、不调 specialists——和 gstack review 的产出结构差异明显
- 用户在 gstack 已注入 `~/.claude/skills/gstack/review/SKILL.md`（在 `~/.claude/skills/review` 是它的 symlink）的情况下，仍然无法走 gstack 流程
- gstack 自己的 `test/skill-collision-sentinel.test.ts:84` 已记录此问题在 `KNOWN_COLLISIONS_TOLERATED`，注释说「gstack version pre-dates built-in, consider renaming to /diff-review or /pre-land if the collision bites」

## 根因（Why）

- Claude Code 内部 slash command 注册优先级：**内置 prompt 类命令 > skill 类**
- 内置 `/review` 注册路径在 `cli.js`（`type: "prompt"`, `source: "builtin"`，无 SKILL.md），不会被 skill system 管理
- `skillOverrides` 是 per-skill listing 控制，对 prompt 类内置命令无效
- `disableBundledSkills` 文档明说"built-in slash commands stay typable but are hidden from the model"——仍可输入
- 关键代码（实证）：
  ```javascript
  // /home/walker/.npm/_npx/.../@anthropic-ai/claude-code/cli.js
  IkY = {
    type: "prompt",          // ← 不是 skill
    name: "review",
    description: "Review a pull request",
    source: "builtin"
  }
  ```

## 影响（Impact）

| 维度 | 影响 |
|---|---|
| 业务 | 无（项目未因此出 bug） |
| 用户 | 误以为 `/review` 跑了 gstack review，实际跑内置——hard gate 失效 |
| 技术 | CLAUDE.md 描述的 `plan → review → ship` 流程在「review」步骤上被默默绕过 |
| 范围 | 所有同时装了 gstack `/review` skill 的项目 |
| 严重性依据 | **本项目已用本地 shadow 兜底，sync.sh 维护**——无功能性损失，但临时方案存在本身就是债 |

## 触发场景（When）

- 触发条件：用户在装了 gstack `~/.claude/skills/gstack/review/` 的项目里输入 `/review`
- 复现步骤：
  1. 安装 gstack（`cd ~/.claude/skills/gstack && ./setup`）
  2. 进入任意 git 仓库，输入 `/review`
  3. 触发的是内置「Review a pull request」，不是 gstack
- 出现频率：100%（每次输入 `/review` 都触发）

## 临时方案（Workaround）

- ✅ 已落地：项目本地 `.claude/skills/pre-land-review/` 建 shadow skill（name: pre-land-review，从 gstack/review 复制改名）
- ✅ 配套工具：`scripts/sync.sh`（流式 sed + 原子 rename，幂等，连跑 3 次 log diff 为空），gstack 升级后跑一次
- ✅ CLAUDE.md 已改：line 128 + 177 把 `/review` 路由改为 `/pre-land-review`
- ✅ Memory + TD 双轨落档：避免未来会话再踩坑
- 兜底：gstack sentinel test `KNOWN_COLLISIONS_TOLERATED` 已知 tolerated，**不影响 gstack 自身 release**

## 理想修复（Ideal Fix）

- **方案 A（推荐 / 等待上游 Anthropic）**：Anthropic 把内置 `/review` 改名（候选：`review-pr` / `pr-review` / `code-review-pr`），或者把内置 /review 改造成 prompt-based wrapper 主动 fallback 到 skill（如有重名 skill 优先调 skill）
- **方案 B（gstack 改名）**：gstack 把自己 `/review` 改名为 `/pre-land-review` 或 `/diff-review`，**配合方案 A**（或单独走）—— 但会破坏 gstack 用户已有 muscle memory，**改动成本高**
- **方案 C（本项目当前）**：本地 shadow skill + sync.sh，已落地，可长期维持；缺点是 gstack 每次升级要重跑 sync.sh
- **方案 D（混合）**：向 Claude Code 提 feature request，让 `settings.json` 暴露 `slashCommandOverrides`（同 name 时优先 skill）

## 修复成本评估

| 维度 | 评估 |
|---|---|
| 工作量 | N/A（依赖上游或 gstack 改名） |
| 风险 | N/A |
| 前置依赖 | Anthropic 改内置 `/review` 命名 OR gstack 自我改名 OR 接受方案 C 长期 |
| 是否跨域 | 否 |
| 是否影响 manifest | 否（manifest 是项目业务 manifest，不是 Claude Code 工具链） |
| 是否需要 Drizzle migration | 否 |
| 是否需要宪章修订 | 否 |

## 验收标准（Done Criteria）

满足任一即可关闭：

- [ ] **方案 A 路径**：Anthropic 把内置 `/review` 改名（验证：删除本地 shadow 后 `/review` 仍走 gstack）→ 删 `.claude/skills/pre-land-review/`、删 CLAUDE.md 注释、删 sync.sh、删本 TD
- [ ] **方案 B 路径**：gstack 把 `/review` 改名为 `/pre-land-review`（验证：gstack upstream release 含此改名）→ 项目 CLI 入口名跟 gstack 对齐，删本 TD，删本地 shadow
- [ ] **方案 D 路径**：Claude Code settings.json 支持 `slashCommandOverrides`，关掉内置 `/review` → 删本 TD，保留 gstack 原 `/review`

**不接受**：仅靠本地 shadow 维持 → 债不关，记为 "accepted debt" 状态。

## 跟踪记录（History）

- 2026-07-06 · N/A · 创建条目，关联发现于本项目 `/review` 冲突调查
- 2026-07-06 · N/A · 临时方案上线：本地 shadow skill `.claude/skills/pre-land-review/` + sync.sh + CLAUDE.md 改 routing
- 2026-07-06 · N/A · memory `feedback_claude-code-builtin-review-shadow` 建立

## 关联

- 相关技术债：[[TD-014]]（同期发现的另一工具链债——settings.json schema 严格，是本次落档的另一面）
- 相关 PR：N/A
- 相关 spec/plan：N/A
- 相关 memory：`[[project_claude-code-builtin-review-shadow]]`（反向引用 + 「已入库：TD-015」标记）
- 相关 gstack 内部记录：`~/.claude/skills/gstack/test/skill-collision-sentinel.test.ts:84`
- 触发的设计讨论：N/A

---

**已知边界**：
- 升级 gstack 后必须 `bash .claude/skills/pre-land-review/scripts/sync.sh`（已脚本化，幂等）
- `skillOverrides` 对本债无效（不是 skill 类）—— TD-015 不会因为 settings.json 改动而消除
- gstack 自己的 sentinel test 不会因本项目本地 shadow 而改变
- 长期债本质：依赖外部生态协调，lifeware 侧只能"接受 + 监测"
