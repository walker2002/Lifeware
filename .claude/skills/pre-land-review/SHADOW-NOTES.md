# Pre-Landing Review (local shadow)

> **本地 shadow skill — 不是 gstack 原版。**

## 为什么有这个

Claude Code 自带 `/review` 命令（内置在 `cli.js`，`type: "prompt"`, `source: "builtin"`，描述 `Review a pull request`）shadows 了 gstack `/review` skill。当前行为：

- 输 `/review` → 触发 Claude Code 内置版（gstack 没在跑）
- 输 `/pre-land-review` → 触发**本目录的本地 shadow**（gstack 流程）

gstack 自己也知道这件事，写在它的 `test/skill-collision-sentinel.test.ts:63,84`，它对 `/review` 的态度是「gstack 版本 pre-dates 内置版，Tolerated」。Claude Code 把 `/review` 关键字优先分给内置，所以 gstack skill 即便安装了也不会被命中。

我们项目里 CLAUDE.md 把 gstack `plan → review → ship` 当 hard gate，跑的是硬关卡，不是 Claude Code 内置那一套 diff review。所以建这个本地 shadow 守住入口。

## 升级策略

这是一个 **2026-07-06** 从 `~/.claude/skills/gstack/review/` 复制的副本。gstack 升级不会自动同步本地副本——每次 gstack 升级后跑一次 sync.sh 即可：

```bash
bash .claude/skills/pre-land-review/scripts/sync.sh
```

sync.sh 幂等（连跑 3 次 log diff 为空），**用流式 sed transform + 原子 rename**，不依赖「cp 覆盖后 sed 修复」的脆弱顺序——中断不会留错版（已修过验证）。

### sync.sh 做了什么

1. 流式 sed pipe：`src 文件 → 通用 transforms → dst`（写到临时文件再 mv，原子写）
2. 通用 transforms（任何运行时文件都跑）：
   - `name: review` → `name: pre-land-review`
   - `.claude/skills/review/checklist.md` → `.claude/skills/pre-land-review/checklist.md`
   - `.claude/skills/review/greptile-triage.md` → `.claude/skills/pre-land-review/greptile-triage.md`
   - `description: Pre-landing PR review. (gstack)` → 加 shadow 注释版
3. checklist.md 额外一条：`See \`review/specialists/\` for these.` → `See \`specialists/\` (in this same directory) for these.`
4. specialists/ 直接 cp（不需要 transform）
5. 跑完做 verify：grep 检查 name 和无 stale 路径，失败 exit 1

### 不动的事

- SKILL.md 里 `~/.claude/skills/gstack/review/specialists/` 那些路径（指向 gstack 原版，仍有效；本地副本不重存 specialists 数据）
- `SKILL.md.tmpl`（gstack 生成模板，运行时不用）

### 手动改不改 sync.sh？

如果你只改了 shadow 模板（小补丁），直接跑 sync.sh 会把你的手动改动覆盖掉。两条路：

- **首选**：维护一个 sync 跳过名单（在 sync.sh 顶部加 `SKIP_FILES=("foo.md")`），但目前没必要
- **临时**：sync 完后用 `git diff` 看 manual changes，恢复你要保留的

下次升级前做：`git status` 看是否有 uncommitted 的手动改，如有先评估是否要被 sync 覆盖。

## 长期方案

如果将来 gstack 改名（或 Anthropic 把内置 /review 改成 kebab-case 不冲突），可以考虑：
1. 删掉本目录
2. 让项目回到 `/review` 直跑 gstack（或 Anthropic 内置）
3. 更新 CLAUDE.md 的 skill routing

## 不要做的事

- **不要复制 / link `~/.claude/skills/review/` 到本目录**（那是 gstack 的 symlink alias，会再撞上 builtin）
- **不要在 `.claude/settings.local.json` 用 `_comment` 之类的 key 写说明**——Claude Code 的 settings schema 顶层 `additionalProperties: false`，加 unknown key 会被校验拒绝整个文件（实测 2026-07-06）
- **不要给 SKILL.md 的 frontmatter 起名 `review`**——会跟 builtin 直接命名冲突

## 验收清单

- [x] 系统可用 skill 列表里出现 `pre-land-review`
- [ ] 项目 CLAUDE.md 里有 `Code review/diff check → /pre-land-review` 这一路由（用户/团队决策，没做）
- [ ] gstack 升级时有人负责 re-sync（建议放 [tech-debt] 跟踪）
