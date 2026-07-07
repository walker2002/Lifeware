---
id: TD-022
title: "[026.01] post-ship adversarial review deferred findings:archetype clearing 语义 + 防御深度微调"
status: 新建
created: 2026-07-07
last_updated: 2026-07-07
---

# TD-022: [026.01] post-ship adversarial review 5 项 deferred

> 摘要:`/pre-land-review` 在 [026.01] (5 commits ship-ready + push gitee origin main) 之后运行,Claude adversarial subagent + critical pass 找到 7 项真问题。**2 项 P1 已 AUTO-FIX**(commit 2315613):LLM-supplied newStartTime ISO 验证 + EditAppointment 双视图 state desync 修复(useEffect resync)。剩余 **5 项 defer** 见下表。**修复影响范围**:archetype-clearing 是用户实际能触发的 UX bug(picker 选「无」+ 保存 → DB 仍保旧 id),需要设计决策(3-state 语义 vs 当前 2-state),所以 defer。

## 元信息

| 字段 | 值 |
|---|---|
| 严重性 | 🟡 Medium (P2 #6 archetype-clearing 是用户可见 stale;P2 #7 perf 微;P2 #8 cosmetic;P1 #2/#3 防御硬化但无实际 exploit) |
| 类别 | UX / 性能 / 防御硬化 |
| 领域 | `lifeware-timebox` |
| 录入版本 | v0.X.X ([026.01] ship 后 pre-land-review) |
| 负责人 | 暂未指派 |
| 修复目标版本 | 下次涉及 archetype 或 CNUI surface 的 session |
| 关联 PR/分支 | main [026.01] 已 ship + 2 项 P1 已 hotfix commit 2315613 |
| 关联 Constitution 条款 | N/A |

## 已 AUTO-FIX (commit 2315613)

| # | 严重度 | 文件 | 问题 | 修复 |
|---|---|---|---|---|
| **P1 #1** | P1 confidence 8/10 | `parse-appointments.ts:122-128` | LLM 返回 `"yesterday"` / `"下午3点"` 等非 ISO 字符串,直接流入 `AppointmentFormFields.tsx:64` 的 `new Date(garbage).toISOString()` 抛 RangeError | 加 `Date.parse(newStartTime)` ISO 验证,invalid 降级 `kind: 'unsure', reason: 'LLM 返回时间格式无效(需 ISO 8601)'` |
| **P1 #4** | P1 confidence 7/10 | `EditAppointment.tsx:31-43` | `useState(initialMode)` / `useState(initialSelectedId)` / `useState(prefill)` 仅 mount 读取一次;AI panel 第二次 open('editAppointment') 同一 surface 复用,props 变但 state 不 resync → 显示 stale draft | `useEffect` 跟随 `[initialSelectedId, prefill]` 重置 view/selectedId/draft;page 故意保留(PAG-1 体验保留)|

## Deferred 5 项

### P1 #2 — Candidate-ID validation by accident (defensive hardening)
- **文件**:`parse-appointments.ts:117` `candidates.find(c => c.id === parsed.appointmentId)`
- **现状**:严格 `===` 匹配,candidate id 都是 UUID(via Postgres defaultRandom),攻击面实际为零;但 trust boundary "by accident" 而非 "by design"
- **修复**:1 行 regex 验证 `parsed.appointmentId` 是合法 UUID v4 后再 find,防御未来改成 fuzzy match 时
- **为什么 defer**:当前无实际 exploit,属未来防御;1 行修复但需要更新测试 prompt 文风 + LLM 概率降低(LLM 不会输出 UUID 模式)
- **影响**:零

### P1 #3 — `newDurationMin: 0` 语义歧义 (UX/contract)
- **文件**:`parse-appointments.ts:128` + prompt template line 28 "新时长分钟数或 0"
- **现状**:LLM 输出 `newDurationMin: 0` 与 undefined 等价(都"不修改");但用户语义上「改成 0 分钟」与「不修改」不同
- **修复**:prompt 措辞改 "新时长(数字必须>0;留空表示不修改)" — 1 行常量修改
- **影响**:消除歧义,涉及 LLM 行为 + 测试期望

### P2 #6 — `archetype clearing` 不落库 (real UX bug, needs 3-file design decision)
- **文件**:3 处
  - `AppointmentFormFields.tsx:117-121` picker `onChange(undefined)` 语义模糊
  - `handlers.ts:596, 642` `?(it.activityArchetypeId ? {...} : {})` 三态折叠 (undefined / null / string 全部折叠为同一)
  - `updateAppointment` server action `updateAppointment.ts:?` filter `if (value === undefined) continue` 同样折叠
- **现状**:picker 清空 + 保存,DB 仍保留旧 archetype_id。**用户实际可见**的 stale 状态。
- **修复选项**:
  - **A) 3-state 语义**:type 改 `string | null | undefined`,Form 把 picker `undefined` 转 `null`,handler 区分(仅 undefined 跳过,string 写,null 清空)。3 文件改动,语义最清晰
  - **B) 2-state + 显式 clear callback**:picker 加 `onClear` prop,Form 接 onClear 后调 onChange 清空 (类似 null 但用 undefined)。架构侵入大
  - **C) 不修**:用户必须删 appointment + 重建
- **为什么 defer**:需要用户在 brainstorming session 与设计师 align,3 选项决策成本 > 1-commit hotfix 复杂度。技术债成本中等。
- **影响**:用户操作 archetype 后想"清空"会失败(看似修了但 DB 没改)

### P2 #7 — `assertArchetypeOwned` perf N+1 (micro-perf)
- **文件**:`timebox.ts:316, 364` `if (typeof fields.activityArchetypeId === 'string') await assertArchetypeOwned(...)`
- **现状**:每次 `updateAppointment` 含 archetypeId 触发 1 次 `findById` roundtrip;archetype 未变也跑一次
- **修复**(可选):diff check `existing.activityArchetypeId === patch.activityArchetypeId` 跳过;但需要先 fetch existing,可能反 N+1
- **影响**:perf 微(archetype 写频率低),预算足够才修复

### P2 #8 — Stale `originalPrompt` banner (cosmetic)
- **文件**:`EditAppointment.tsx:73-76`
- **现状**:editing 视图顶部显示「💡 把 a-1 改到下午3点」即使用户已经手动改了 draft.title
- **修复**:banner 仅在 selecting 视图显示,或添加 "提示已应用"
- **影响**:仅 UX 噪声

## 状态

- [x] 列入 tech-debt ledger
- [x] 2 项 P1 AUTO-FIX 已 ship(commit 2315613, 23+/3-, 34/34 测试 PASS, tsc 0 新增)
- [x] 5 项 deferred 留本 ledger
- [ ] P2 #6 archetype clearing — 决策 brainstorming session 修复
- [ ] P1 #2/#3 防御硬化 — 顺手在下次改 parseAppointmentIntent 时一起做
- [ ] P2 #7/#8 — low priority,跟下个 CNUI session 处理

## 关联

- Whole-branch review (post-ship retro): `/home/walker/.claude/projects/-home-walker-lifeware/memory/project-026-01-appointment-archetype-design.md`
- 已 commit 的 hotfix: `2315613 fix(026.01): post-ship adversarial review 2 项 P1 AUTO-FIX`
- Adversarial review 来源: pre-land-review skill 派遣的 Claude subagent
- 同步 TD: TD-020 (docs conflict markers), TD-021 ([023.12] 交互债)
