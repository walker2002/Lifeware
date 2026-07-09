# [026.02.3.1] 4 项 fresh drift 修复 设计

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 /lifeware-neat (2026-07-09) 重扫发现的 4 项 fresh drift: AISessionStatus 三向不一致、v_running_timeboxes stale filter、ai_sessions 文档格式不齐、docs 页脚过期；同 PR 收掉 [026.02.2] whole-branch review 5 cosmetic minor polish。

**Architecture:**

- **T1 (USOM/DB/code 同步)**: `AISessionStatus` 扩到 6 值,对齐 schema.ts + database-design.md; 删 `session/index.ts:3` 局部 `SessionStatus` 别名,改 import USOM 类型
- **T2 (DB view 重写)**: `v_running_timeboxes` 视图从「`WHERE status IN ('running','overtime')`」改「派生显示: 仍有 end_time 字段的 timebox 范围 + `now()` between start_time/end_time + status IN ('logged')」(注: [023.12] 后 running 是读时派生态,不持久化)
- **T3 (docs 格式统一)**: `database-design.md:1703-1723` Markdown table 改 `\`\`\`sql CREATE TABLE\`\`\`` block,列与 schema.ts:619 / `ai_sessions` 一致
- **T4 (页脚 bump + 4 变更段)**: usom-design.md / database-design.md 页脚 2026_07_07 → 2026_07_09,补 4 段 [026.02.X] 变更记录
- **T5 (5 cosmetic minor polish)**: 从 [026.02.2] whole-branch review 收尾,具体为 CHANGELOG 数字修正 + spec/plan 数字修正 + 2 个 test 注释/mock 修

**Tech Stack:** TypeScript 5, Drizzle ORM 0.45.1, Vitest, USOM 1.x, vitest-globals baseline 已存在 TS2304 噪声 (47 文件 pre-existing)

## 全局约束

- **宪章**: `.specify/memory/constitution.md` v2.1.1
  - R-01~R-04 (Repository) — 数据库层隔离
  - T-01~T-04 (Multi-Tenancy) — user_id 处理
  - A~D (Bridge Layer — MVP 仅约束)
  - G-01~G-08 (USOM Governance)
- **tier-2 文档强制同步**: USOM 变更 MUST 同步 `docs/usom-design.md` + `docs/database-design.md` + `frontend/src/lib/db/schema.ts` + `CHANGELOG.md`
- **pre-push hooks** (强制过):
  - `npm run validate:manifest` (0 errors)
  - `npm run validate:structure` (全部通过)
  - `npm run validate:rules-registry` (6 项 lifecycle 一致)
- **drizzle migrations 手写**: 项目不使用 `drizzle-kit up`,迁移一律手写 SQL + journal 登记 (convention 沿用 F2)
- **测试 IRON RULE**: 新增 IRON RULE 测试的相对基线 = 当前 main (commit c220e15 顶端)

## 文件结构与任务拆分

| Task | Files 触及 | Lines | Complexity |
|---|---|---|---|
| T1 | primitives.ts:230-235 + session/index.ts:3-30 + database-design.md:1710 | 12+ / 3- | Low |
| T2 | database-design.md:1548-1552 + docs/usom-design.md:§3.9 + migrations/0036_drop_v_running_timeboxes_recreate.sql | 30+ / 10- | Med |
| T3 | database-design.md:1703-1723 | 18+ / 12- | Low |
| T4 | usom-design.md 页脚 + database-design.md 页脚 | 6+ / 3- | Low |
| T5 | CHANGELOG.md [026.02.2] 段 + spec/plan 数字 + 2 tests | 9+ / 7- | Low |
| T6 | CHANGELOG.md `## [026.02.3.1]` + manifest.md | 50+ / 0- | Low |

**合计**: 1 PR + 6 commit + ~125 lines

---

## Task 1: TD-024 AISessionStatus 三向一致

### Files
- Modify: `frontend/src/usom/types/primitives.ts:225-237`
- Modify: `frontend/src/nexus/ai-runtime/session/index.ts:3`
- Modify: `docs/database-design.md:1710`

### Before (current state)
```ts
// primitives.ts:230
export type AISessionStatus = 'active' | 'archived' | 'deleted'

// session/index.ts:3
type SessionStatus = 'created' | 'active' | 'completing' | 'archived' | 'closed'

// database-design.md:1710
ENUM(created/active/completing/archived/deleted/closed)
```

### After (target state)
```ts
// primitives.ts:230 - 扩到 6 值,完全对齐 DB
export type AISessionStatus = 'created' | 'active' | 'completing' | 'archived' | 'closed' | 'deleted'

// session/index.ts:3 - 删局部别名,改 import USOM
import type { AISessionStatus } from '@/usom/types/primitives'
// 删除 type SessionStatus = ...

// database-design.md:1710 - 已对齐,无需改
ENUM(created/active/completing/archived/deleted/closed)
```

### 步骤
1. Search `frontend/src/nexus/ai-runtime/session/` 所有引用 `SessionStatus` 处,记录 5 个调用点
2. Modify `primitives.ts:230` 添加 3 个值: `created | completing | closed`, 添加 JSDoc 注释每个值语义
3. Modify `session/index.ts:3` 删 `type SessionStatus`,改 `import type { AISessionStatus } ...`
4. Run vitest 确认 nexus/ai-runtime/__tests__ 全过 (现 baseline = pre-existing 47 fail 与本 task 无关)
5. Search schema.ts:619 + database-design.md:1710 + session/index.ts:3 三处均 6 值,IR pass
6. Commit `fix(026.02.3.1): T1 AISessionStatus USOM 3→6 值与 DB schema 对齐`

### 测试
- IRON RULE: `nexus/ai-runtime/__tests__/session-status.test.ts` 新增 6 值 type test
  - 用 `as const` array literal `['created', 'active', 'completing', 'archived', 'closed', 'deleted'] as const satisfies readonly AISessionStatus[]`
  - 编译通过 = type 与 runtime 数组一致

### 风险
- `deleted` 真实无 server action 调用 → 字段保留兼容未来 use (不删)
- 旧测试可能锁定 `SessionStatus` 类型 → 须同步改 import

---

## Task 2: TD-025 v_running_timeboxes view 重写

### Files
- Modify: `docs/database-design.md:1548-1552`
- Modify: `frontend/src/usom/types/objects.ts` 添加派生语义注释
- Create: `frontend/src/lib/db/migrations/0036_drop_v_running_timeboxes_recreate.sql`

### Before (current state — broken since [023.12])
```sql
-- docs/database-design.md:1548-1552
CREATE VIEW v_running_timeboxes AS
SELECT id, user_id, title, status, start_time, end_time, tags
FROM timeboxes
WHERE status IN ('running', 'overtime');
-- [023.12] 2026-07-06 后 status 收敛 6→3 态,删 'running'/'overtime' → 此视图永远空集
```

### After (target state)
```sql
-- 新视图语义: 时间派生态 [023.12] 后,「运行中」= planned 且 now 在 [start_time, end_time] 之间
-- 时间派生态不持久化 → 用 SQL 实时计算
CREATE OR REPLACE VIEW v_running_timeboxes AS
SELECT id, user_id, title, status, start_time, end_time, tags
FROM timeboxes
WHERE status = 'planned'
  AND start_time <= NOW()
  AND end_time >= NOW();
```

### 步骤
1. Search 代码所有 `v_running_timeboxes` 引用 → 确认是否仍被 query
2. Modify `docs/database-design.md:1548-1552` SQL 块 (含完整 CREATE OR REPLACE + 注释)
3. Create `migrations/0036_drop_v_running_timeboxes_recreate.sql` (IF EXISTS DROP + CREATE OR REPLACE)
4. Journal 登记 idx=36
5. 添加 §3.9 USOM 派生语义注释 (`usom-design.md:§3.9` timebox 段)
6. Commit `fix(026.02.3.1): T2 v_running_timeboxes view stale filter 重写`

### 测试
- IRON RULE: `lib/db/__tests__/v-running-timeboxes.test.ts` (迁移后 SELECT * FROM v_running_timeboxes 应 return non-empty if seeded)
- 不需要新单元测试 (DB 层验证 SQL 工作); 用 dev seed 验证

### 风险
- 真生产数据是否有 'running'/'overtime' 旧 status 行? schema.ts enum 已 3 值 → 若有 INSERT 历史行,迁移前需先 UPDATE 或 TRUNCATE
- 项目惯例 [023] A2 已 TRUNCATE timeboxes → 安全

---

## Task 3: TD-026 ai_sessions docs 格式统一

### Files
- Modify: `docs/database-design.md:1703-1723`

### Before (current state)
```markdown
## 8.x 新增表：AI 会话与用户设置

### `ai_sessions`

| 列名 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | UUID | PK, defaultRandom() | 主键 |
| `user_id` | UUID | NOT NULL, FK→users(id) ON DELETE CASCADE | 所属用户 |
| `title` | TEXT | NOT NULL, DEFAULT '新对话' | 会话标题 |
| `status` | TEXT | NOT NULL, DEFAULT 'created', ENUM(created/active/completing/archived/deleted/closed) | 状态 |
| `domain_id` | TEXT | NULLABLE | 关联的 Domain ID |
| `action` | TEXT | NULLABLE | 触发的 action |
| `session_mode` | TEXT | NOT NULL, DEFAULT 'single_shot' | 会话模式 |
| `messages` | JSONB | NOT NULL, DEFAULT [] | ChatMessage[] |
| `state_snapshot` | JSONB | NOT NULL, DEFAULT {} | 状态快照 |
| `referenced_object_ids` | JSONB | NOT NULL, DEFAULT [] | 引用对象 ID 列表 |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | 创建时间 |
| `updated_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | 更新时间 |
| `archived_at` | TIMESTAMPTZ | NULLABLE | 归档时间 |

索引：
- `idx_ai_sessions_user_status` ON (user_id, status)
- `idx_ai_sessions_updated` ON (user_id, updated_at)
```

### After
```sql
-- docs format aligned with §4.x user_settings / memory_episodes
CREATE TABLE ai_sessions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  schema_version        integer NOT NULL DEFAULT 1,
  title                 text NOT NULL DEFAULT '新对话',
  -- [023.12] D1 衍生: status 6 值真实枚举, running/overtime 派生 → 此处不用
  status                text NOT NULL DEFAULT 'created'
                          CHECK (status IN ('created', 'active', 'completing', 'archived', 'closed', 'deleted')),
  domain_id             text,  -- 关联 Domain (l1)
  action                text,  -- 触发的 action (l2)
  session_mode          text NOT NULL DEFAULT 'single_shot',
  messages              jsonb NOT NULL DEFAULT '[]',  -- ChatMessage[]
  state_snapshot        jsonb NOT NULL DEFAULT '{}',  -- 状态快照
  referenced_object_ids jsonb NOT NULL DEFAULT '[]',  -- 引用对象 ID 列表
  created_at            timestamptz NOT NULL DEFAULT NOW(),
  updated_at            timestamptz NOT NULL DEFAULT NOW(),
  archived_at           timestamptz  -- 归档时间
);
CREATE INDEX idx_ai_sessions_user_status ON ai_sessions(user_id, status);
CREATE INDEX idx_ai_sessions_updated     ON ai_sessions(user_id, updated_at);
```

### 步骤
1. Read schema.ts `ai_sessions` 段,确认列类型/默认值
2. Modify `database-design.md:1703-1723`: 删 Markdown table 块,改 ```sql CREATE TABLE``` block
3. 保留 2 个 idx 段在 SQL block 后
4. Commit `docs(026.02.3.1): T3 ai_sessions docs Markdown table → SQL block`

### 测试
- 无 (纯 docs 格式统一) ✓

### 风险
- docs 与 schema.ts 列对齐: 现有 schema.ts 列全部保留,新增 `schema_version` + 列对齐
- 不影响运行时

---

## Task 4: TD-027 docs 页脚 bump + 4 变更段

### Files
- Modify: `docs/usom-design.md` (页脚 + 4 变更段)
- Modify: `docs/database-design.md` (页脚 + 4 变更段)

### Before
```
---
*文档版本：2026_07_07*
*变更：[023.13] (2026_07_07) — §3.9 ...*
```

### After
```
---
*文档版本：2026_07_09*
*变更：[026.02.3.1] (2026_07_09) — T1 AISessionStatus 三向一致 + T2 v_running_timeboxes 重写*
*变更：[026.02.2] (2026_07_09) — 「行程」→「约定」后 polish 7 项收口（T1-T7）*
*变更：[026.02] (2026_07_08) — §1 CNUI bug fix + §2 /appointments Day/Month 双视图重构*
*变更：[026.02.1] (2026_07_08) — I-1 mk() TS2322 修复 + 7 项 polish 登记*
*变更：[023.13] (2026_07_07) — §3.9 DetailedExecutionRecord +4 字段*
```

### 步骤
1. Modify `usom-design.md` 末 6 行 (footer) + 添加 4 变更段
2. Modify `database-design.md` 末 6 行 (footer) + 添加 4 变更段
3. Commit `docs(026.02.3.1): T4 usom-design.md + database-design.md 页脚 bump 2026_07_07→2026_07_09`

### 测试
- 无 (docs-only)

### 风险
- 历史变更段准确反映 [026.02] / [026.02.1] / [026.02.2] 已 ship 内容

---

## Task 5: 5 cosmetic minor polish from [026.02.2]

| # | 项目 | 文件 | 修复 |
|---|---|---|---|
| C1 | M-1 count "8 处" → 实际 11 | CHANGELOG.md [026.02.2] 段 | "M-1：移除 8 处 `as any`" → "11 处" |
| C2 | I-2 spec/plan "4 处 test" → 实际 2 | `docs/superpowers/specs/2026-07-09-026-02-2-appointment-polish-design.md` + `plans/2026-07-09-026-02-2-appointment-polish.md` | "4 test contract" → "2 test contract" |
| C3 | CHANGELOG "tsc 0 新增" 不准 | CHANGELOG.md [026.02.2] 段 | "tsc 变更文件 0 新增错误" → "tsc 0 新增语义错误（2 个 TS2304 baseline noise,项目 pre-existing TS2304 模式）" |
| C4 | M-3 mk() comment "本月惯例" 误导 | `frontend/src/lib/__tests__/appointment-filter.test.ts` mk() 注释 | "本月惯例" → "本月约定筛选 (fixture)" |
| C5 | M-6 test mock `{ ok: true } as any` 与 default 不一致 | `frontend/src/domains/timebox/components/__tests__/appointment-workspace.test.tsx:294` | `{ ok: true } as any` → `{ status: 'ok', appointment: { id: 'a-1' } }` |

### 步骤
1. 5 处 modify
2. 跑 vitest: 仅 workspace + filter 测试,确认 baseline = head
3. tsc: 0 新增
4. Commit `polish(026.02.3.1): T5 5 cosmetic minor ship-then-polish 收口`

### 测试
- 现有 vitest pass (无新增,纯 polish)

### 风险
- 无 (5 处均 cosmetic,1:1 替换)

---

## Task 6: CHANGELOG `[026.02.3.1]` 段 + manifest 入口

### Files
- Modify: `CHANGELOG.md` 加 `## [026.02.3.1] 4 项 fresh drift 修复 + 5 cosmetic minor 收口` 段
- Modify: `manifest.md` 加 `# [026.02.3.1] 4 项 fresh drift 修复` 索引

### 段结构 (照 [026.02.3] 模式)
- **决策摘要**: scope = 4 fresh drift (TD-024/025/026/027) + 5 cosmetic minor polish
- **决策**: 6 task 串行,1 PR ship,真实 4 drift + 5 minor
- **改动清单**: 6 task 各列关键 commit (T1=primitives+session, ...)
- **验证结果**: baseline=head 0 回归, tsc 0 新增, IRON RULE 测试通过, validate:manifest 0 errors
- **风险与缓解**: 类型 cast (留 [026.02.4] TD-022 范围) + view 重写可能影响时间态判读
- **遗留 / Follow-up**: 仍 → [026.02.4] TD-022 5 项
- **参照**: spec SSOT (本文档) + plan + commits TBD

### 步骤
1. CHANGELOG 段写完
2. manifest 加 [026.02.3.1] 入口
3. pre-push hooks 过
4. Push gitee origin main

---

## 验证 (整体)

| 验证项 | 命令 | 期望 |
|---|---|---|
| TypeScript 编译 | `cd frontend && npx tsc --noEmit 2>&1 \| grep "edit\|ai_session\|session-status\|appointment-filter\|appointment-workspace"` | 0 新增 error (vs baseline 95) |
| vitest (timebox + ai-runtime) | `cd frontend && npx vitest run src/nexus/ai-runtime/session src/domains/timebox/lib/__tests__ src/domains/timebox/components/__tests__/appointment-workspace.test.tsx src/domains/timebox/components/__tests__/appointment-filter.test.ts 2>&1 \| tail` | baseline 失败集合 0 新增 |
| pre-push hooks | `cd frontend && npm run validate:manifest && npm run validate:structure && npm run validate:rules-registry` | 0 errors ✓ |
| USOM ↔ DB 互验 2A | `cd frontend && grep "^export type AISessionStatus" src/usom/types/primitives.ts && grep "status.*enum.*ai_sessions" src/lib/db/schema.ts` | 6 值一致 |
| IRON RULE: AISessionStatus 6 值 | session-status.test.ts | pass |
| IRON RULE: view 重写 | migration 0036 + dev DB 测 | SQL 语法 ok |

## 风险与缓解

- **AISessionStatus 扩 6 值影响小**,因为现存代码用 `SessionStatus` 别名不依赖 USOM,改 import 后 vitest 应 0 回归
- **v_running_timeboxes view 重写**仅影响 runtime 显示,不影响写入路径;trigger 重新评估在 [023.13] 已迁
- **5 cosmetic minor polish** 是 1:1 替换,无功能影响
- **不会引入 PG enum 类型**改动: text + CHECK 仍 app 层

## Out of scope (deferred)

- T1 不动 `deleteAISession` server action(若需要,留 future)
- T2 不删旧视图字段 (id/user_id/title 保留)
- T2 不动 derive-display-status 派生逻辑(留 [023.13])
- T5 不修 spec 中其它 stale 字眼 (仅本任务列出的 5 处)

## SDD 流程计划

1. 启用 `.superpowers/sdd/progress.md` ledger
2. Per-task implementer + reviewer (本任务 scope 6 task,机械为主,模型选 fast)
3. Final whole-branch review (`/pre-land-review` skill,代码 review 维度)
4. `/superpowers:finishing-a-development-branch` → ff-merge main + worktree cleanup
5. push gitee origin main + manifest 更新

## 成功标准 (Definition of Done)

- ✅ 6 commits on main (T1-T5 + T6 CHANGELOG)
- ✅ vitest baseline=head 0 回归
- ✅ tsc 0 新增 error
- ✅ pre-push hooks 全过
- ✅ TD-024/025/026/027 在 `docs/tech-debt/` 入库 + status 🟢
- ✅ manifest.md 加 [026.02.3.1] 入口
- ✅ CHANGELOG.md `## [026.02.3.1]` 段
- ✅ Lifeware-neat 2A-2F 再扫确认无新增 drift

---

## 关联

- 上游:`[026.02.3]` fix(2026-07-09, e97b9a4) — /editAppointment TypeError 双层防御
- 本任务重扫:`/lifeware-neat` (2026-07-09) 发现 4 项 fresh drift
- 入口:manifest.md `## [026.02.3]` 段
- 项目宪章: v2.1.1
- Memory: `~/.claude/projects/-home-walker-lifeware/memory/feedback_tier2-sync.md` (Tier 2 文档同步强制执行)

## 关联命令与脚本

- 验证:`cd frontend && npm run validate:manifest && npm run validate:structure`
- 单测:`cd frontend && npx vitest run src/<path>`
- Tsc:`cd frontend && npx tsc --noEmit`
- 推动:`git add <files> && git commit -m "fix(026.02.3.1): T1 AISessionStatus..." && git push origin main`

## SSOT

- **本文档 (spec)** = `/home/walker/lifeware/docs/superpowers/specs/2026-07-09-026-02-3-1-follow-up-fixes-design.md`
- Plan TBD (writing-plans skill 流程下一步产物)
- 落实 commit 序列 in `.superpowers/sdd/progress.md` (随 SDD 进行更新)
