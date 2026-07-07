---
id: TD-020
title: "docs 文件残留 merge conflict markers:30+ 行 `<<<<<<< Updated upstream` 未解,预后续 neat-sync session 集中清理"
status: 已解决 (resolved 2026-07-07 via /lifeware-neat skill commit — 14 diff3 conflict blocks resolved across usom-design 5 + database-design 7 + CHANGELOG 2, all chosen canonical Updated upstream side, content integrity verified)
created: 2026-07-07
last_updated: 2026-07-07
---

# TD-020: docs 文件残留 merge conflict markers

> 摘要:[023.12] neat-sync session 合并时 docs 文件（至少 4 个：`docs/usom-design.md`、`docs/database-design.md`、`docs/manifest.md` + 1 个其他）未解 conflict,git 自动生成 `<<<<<<< Updated upstream` / `=======` / `>>>>>>> Stashed changes` markers 共 30+ 行,直接提交到 commit 29b409a。[026.01] T5 reviewer（T5 implementer 先报告）+ whole-branch review 探测均发现;**经 `git show 29b409a:` 确认 markers 在该 commit 已存在,非 [026.01] 引入**([026.01] 5ea9a37 严格 68+/0- 无 marker 新增)。建议 [023.13] neat-sync session 集中清理 + 建立 conflict 守护避免债继续积累。

## 元信息

| 字段 | 值 |
|---|---|
| 严重性 | 🟡 Medium (docs 噪声,不影响运行;但 vitest / validate / browser E2E 不报,债长期被忽略会污染后续 PR diff 可读性) |
| 类别 | docs / 工程卫生 |
| 领域 | 全部 docs |
| 录入版本 | v0.X.X ([026.01] ship 评审 T5 review 发现) |
| 负责人 | 暂未指派（建议 [023.13] owner） |
| 修复目标版本 | 下次 neat-sync / docs consolidation session |
| 关联 PR/分支 | main ([026.01] 已 ship,5ea9a37;orgin marker 来源 29b409a) |
| 关联 Constitution 条款 | N/A |

## 复现

```bash
$ grep -nE '^(<<<<<<<|=======|>>>>>>>)' docs/usom-design.md docs/database-design.md docs/manifest.md | wc -l
30+
```

(实际行数需要 grep 确认;按 T5 review 报告 ≥ 30)

## 实际影响

- 不影响代码运行、不影响 vitest / tsc / validate / schema 校验
- 不影响 git push / gitee merge / origin 同步
- **影响**:后续 reviewer 读 docs 时看到 conflict marker,需要 mental overhead 跳过,降低 review 信噪比;**最大隐患**是后续某次 docs 改动时 `<<<<<<<` 行为 git 当成内容 diff,可能 block merge / 引入错误 reset。

## 来源分析

- **引入 commit**:`29b409a fix(023.12): [lifeware-neat sync] docs 三方对齐 + seed-dev.ts 字段名/status 同步`(合并到 main on 2026-07-07)
- **引入原因**:`lifeware-neat` skill 在 docs 三方对齐 (usom-design ↔ database-design ↔ CHANGELOG + manifest 索引) 时用 sed 或 git merge,未对 conflict markers 做清理
- **[026.01] 是否引入**:否。`git show 29b409a:docs/<file>` 已含 markers,T5 diff 严格仅 +68/-0,未增 markers

## 建议修复方案

[023.13] neat-sync session 集中清理:

```bash
# 1. 列出所有 conflict marker 文件
grep -lrE '^(<<<<<<<|=======|>>>>>>>)' docs/*.md CHANGELOG.md manifest.md

# 2. 对每个文件,看 marker 上下文决定保留哪一边
# 通常 Updated upstream 是正确版本(同步新逻辑),Stashed changes 是 stale(旧实现)
# 但 [026.01] 后的 docs manifest 已是更新版,无需大量人工判断

# 3. 自动化方案:用 git history diff 对比,选时间最新的语义
```

**预防建议**:在 `lifeware-neat` skill 中添加「清理 git conflict markers」段(可基于 `sed -i '/^<<<<<<</,/^>>>>>>>/d'` + 手动 review 阻断防线),避免下次 neat-sync 再产生。

## 状态

- [x] 列入 tech-debt ledger
- [x] [026.01] T5 reviewer 确认非本任务引入(`git show 29b409a:` 已含)
- [x] 不阻塞 [026.01] ship (5ea9a37)
- [ ] [023.13] 集中清理 — 后续
- [ ] `lifeware-neat` skill 加 conflict marker 守护 — 后续

## 关联

- [026.01] T5 reviewer 报告: `/home/walker/.claude/projects/-home-walker-lifeware/memory/project-026-01-appointment-archetype-design.md`
- origin commit: `29b409a fix(023.12): [lifeware-neat sync] docs 三方对齐 ...`
- 严重度判定参考:`docs/tech-debt/README.md`(若无则按 "不影响运行但污染 review 信噪比 = Medium")
