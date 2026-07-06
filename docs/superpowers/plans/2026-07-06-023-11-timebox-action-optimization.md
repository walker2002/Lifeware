# [023.11] Timebox Action 优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **plan-eng-review 已评审**：scope 经一次扩张（折入 synonyms 字段，见 §全局约束 + T3-T5）；Issue 1（LLM 位置匹配）折入 T6。详见文末 `## GSTACK REVIEW REPORT`。

**Goal:** 修复 editTimeboxes 三处 UX 问题 + 给 createTimebox/editTimeboxes 加 AI 活动原型匹配；为让"规则优先"真正生效，给 archetype 表加 `synonyms` 字段（迁移 + seed + 配置 UI + matcher 接入）。

**Architecture:** 10 任务串行。Part 1（T1-T2）UX 修复，与 matcher 无关；Part 2 先落地 `synonyms` 字段（T3 schema/迁移/类型/docs → T4 seed 升级 → T5 配置 UI），再建 matcher（T6，含 Issue 1 位置匹配 + synonyms 接入）→ T7 action → T8 picker → T9 被动推断 → T10 两 surface 接线。每任务 1 commit、独立可 revert、TDD。

**Tech Stack:** Next.js 16.1.6, React 19.2.3, TypeScript 5, Drizzle 0.45.1, PostgreSQL, Vitest, @testing-library/react。

## 全局约束

- **TDD 强约束**：每任务先写失败测试 → 实现 → 通过 → commit。
- **vitest cwd**：必须在 `frontend/` 下跑（`@/` 映射；参 [[feedback_vitest-pitfalls]]）。
- **tsc 双验**：每任务末尾 `cd frontend && npx tsc --noEmit` 零新增错误。
- **失败集合对比**：base/head 失败集合对比（参 [[feedback_change-gate-baseline]]），不许新增无关失败；[025] PG 集成 flake 视为 pre-existing。
- **中文注释**：所有注释简体中文；新建 TS 文件须有 `/** @file ... @brief ... */` 文件头。
- **Tier-2 文档同步强制**（[[feedback_tier2-sync]]）：schema 变更**必须先更 docs 再合代码** —— T3 含 `docs/database-design.md`（activity_archetypes 表）+ `docs/usom-design.md` §3.11 同步。
- **CHANGELOG**：schema 变更 → 补 `[023.11]` 条目（覆盖 spec OQ-3 默认）。
- **迁移手写**（[[project-drizzle-migrations-handwritten]]）：迁移是手写 SQL + `psql` 应用 + 登记 journal；`db:generate/migrate` 跑不通。下一个 idx=34。
- **manifest 不增 surface / 不改 action 名**：不触发 C-1 四联审计。
- **置信度常量**：`RULE_CONFIDENCE = 0.9`（正向包含）、`REVERSE_CONFIDENCE = 0.75`（反向包含，标题≥3 字）、`LLM_THRESHOLD = 0.7`。
- **不在范围（defer）**：editTimeboxes 被动推断；用户自建 archetype 的 AI 辅助 synonyms 生成；editTimeboxes TOCTOU / batch failure UI / MVP_USER_ID 硬码。

---

## 文件结构总览

| 类型 | 路径 | 职责 | 任务 |
|---|---|---|---|
| 修改 | `frontend/src/domains/timebox/manifest.yaml` | editTimeboxes description 改名 | T1 |
| 修改 | `frontend/src/domains/timebox/cnui/surfaces/EditTimeboxes.tsx` | 删重复标题(T1) + useEffect 回填(T2) + picker props(T10) | T1/T2/T10 |
| 修改 | `frontend/src/domains/timebox/cnui/surfaces/__tests__/edit-timeboxes.test.tsx` | case2/7 更新(T1) + 回归(T2) + 接线(T10) | T1/T2/T10 |
| 修改 | `docs/database-design.md` + `docs/usom-design.md` | activity_archetypes 加 synonyms 列（Tier-2，T3 先做） | T3 |
| 修改 | `frontend/src/lib/db/schema.ts` | activityArchetypes 加 synonyms jsonb 列 | T3 |
| **新建** | `frontend/src/lib/db/migrations/0034_023_11_archetype_synonyms.sql` (+ `.down.sql`) | 迁移 | T3 |
| 修改 | `frontend/src/lib/db/migrations/meta/_journal.json` | 登记 idx=34 | T3 |
| 修改 | `frontend/src/usom/activity-archetype/types.ts` | ActivityArchetype.synonyms | T3 |
| 修改 | `frontend/src/usom/interfaces/irepository.ts` | Create/Update input 加 synonyms? | T3 |
| 修改 | `frontend/src/lib/db/repositories/activity-archetype.repository.ts` | rowToArchetype/create/update 加 synonyms + seedDefaults 升级路径 | T3(map)/T4(seed) |
| 修改 | `frontend/src/lib/db/__tests__/activity-archetype-repo.test.ts` | mapper/seed synonyms 用例 | T3/T4 |
| 修改 | `frontend/src/usom/seed/activity-archetypes.ts` | 30 条 seed 加 synonyms 字段 | T4 |
| 修改 | `frontend/src/app/config/activity-archetypes/archetype-form.tsx` | synonyms textarea + 透传 | T5 |
| **新建** | `frontend/src/domains/timebox/lib/archetype-matcher.ts` | 匹配原语（规则纳入 synonyms + 位置匹配） | T6 |
| **新建** | `frontend/src/domains/timebox/lib/__tests__/archetype-matcher.test.ts` | matcher 单测 | T6 |
| 修改 | `frontend/src/app/actions/activity-archetype.ts` | matchArchetypeForTitle action | T7 |
| **新建** | `frontend/src/app/actions/__tests__/activity-archetype.test.ts` | action 单测 | T7 |
| 修改 | `frontend/src/components/archetype/archetype-picker.tsx` | enableAiMatch/title + AI 按钮 | T8 |
| 修改 | `frontend/src/components/archetype/__tests__/archetype-picker.test.tsx` | 按钮用例 | T8 |
| 修改 | `frontend/src/app/actions/intent.ts` | parseTimeboxBatchIntentOnly 调 matcher | T9 |
| 修改 | `frontend/src/app/actions/__tests__/intent.test.ts` | drafts 带 archetypeId | T9 |
| 修改 | `frontend/src/domains/timebox/cnui/surfaces/CreateTimebox.tsx` | picker props | T10 |
| 修改 | `frontend/src/domains/timebox/cnui/surfaces/__tests__/create-timebox.test.tsx` | 接线断言 | T10 |

---

## Task 1: editTimeboxes selecting 模式 UX（manifest 改名 + 双重标题去重）

**Files:**
- Modify: `frontend/src/domains/timebox/manifest.yaml`
- Modify: `frontend/src/domains/timebox/cnui/surfaces/EditTimeboxes.tsx:125`
- Modify: `frontend/src/domains/timebox/cnui/surfaces/__tests__/edit-timeboxes.test.tsx`（case 2 & case 7）

**Interfaces:** Consumes 无；Produces selecting 模式不重复"请选择要操作的时间盒"（header 由 CnuiSurfaceWrapper 渲染）

- [ ] **Step 1: 更新 case 2 & case 7 断言**

`edit-timeboxes.test.tsx` case 2（约 104-109 行）改为：

```tsx
  it('case 2: selecting items>0 → 列表渲染 + 点击 item 进 editing', () => {
    render(<EditTimeboxes {...makeProps({ items: [tb('tb1', 'planned'), tb('tb2', 'running')] })} />)
    expect(screen.queryByText('请选择要操作的时间盒')).not.toBeInTheDocument()
    expect(screen.getByText('Ttb1')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Ttb1').closest('button')!)
    expect(screen.getByText(/编辑时间盒/)).toBeInTheDocument()
  })
```

case 7（约 170-180 行）末尾改为：

```tsx
    fireEvent.click(screen.getByText('返回列表'))
    expect(screen.getByText('Ttb1')).toBeInTheDocument()
    expect(screen.queryByText('返回列表')).not.toBeInTheDocument()
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/domains/timebox/cnui/surfaces/__tests__/edit-timeboxes.test.tsx`
Expected: case 2 FAIL（重复标题仍在）。

- [ ] **Step 3: 删 EditTimeboxes.tsx:125 重复标题行**

删除 `<div className="mb-2"><span className="text-sm font-medium text-ink">请选择要操作的时间盒</span></div>`（保留 102-123 originalPrompt echo 与空态分支）。

- [ ] **Step 4: 改 manifest description**

`manifest.yaml` editTimeboxes：`description: 修改/取消/删除当日时间盒（CNUI 三合一入口）` → `description: 修改/删除时间盒`。

- [ ] **Step 5: 验证**

Run: `cd frontend && npx vitest run src/domains/timebox/cnui/surfaces/__tests__/edit-timeboxes.test.tsx` → PASS
Run: `cd frontend && npm run validate:manifest` → `0 errors`
Run: `cd frontend && npx tsc --noEmit` → 零新增

- [ ] **Step 6: Commit**

```bash
git add frontend/src/domains/timebox/manifest.yaml \
  frontend/src/domains/timebox/cnui/surfaces/EditTimeboxes.tsx \
  frontend/src/domains/timebox/cnui/surfaces/__tests__/edit-timeboxes.test.tsx
git commit -m "fix(023.11): editTimeboxes manifest 改名 + 双重标题去重

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 2: editTimeboxes 编辑页空白修复（useEffect 同步 prefill → draft）

**Files:**
- Modify: `frontend/src/domains/timebox/cnui/surfaces/EditTimeboxes.tsx`（draft useState 后加 useEffect）
- Modify: `frontend/src/domains/timebox/cnui/surfaces/__tests__/edit-timeboxes.test.tsx`

**背景**：draft useState 只挂载时读一次 prefill；点选记录走 onDataChange 更新 dataModel.prefill/selectedId 但 draft 不重读 → 空白。**测试必须用 stateful Harness**（makeProps 的 `onDataChange: vi.fn()` 不回灌 → selectedId 不变 → useEffect 不触发 → 测不到 bug）。

- [ ] **Step 1: 写失败测试**

`edit-timeboxes.test.tsx` 顶部 import 加 `import { useState } from 'react'`，末尾追加：

```tsx
  /** [023.11] stateful Harness：onDataChange 回灌 dataModel，模拟 CnuiSurfaceWrapper 回环 */
  function Harness({ items }: { items: TimeboxSummary[] }) {
    const [dm, setDm] = useState<Record<string, unknown>>({ mode: 'selecting', items })
    return (
      <EditTimeboxes
        surfaceType="edit-timeboxes"
        dataModel={dm}
        onDataChange={setDm}
        onConfirm={vi.fn()}
      />
    )
  }

  it('[023.11] selecting 点击记录 → editing 表单带入原值（regression 空白页）', () => {
    render(<Harness items={[tb('tb1', 'planned', '晨间深度工作')]} />)
    fireEvent.click(screen.getByText('晨间深度工作').closest('button')!)
    expect((screen.getByLabelText('标题') as HTMLInputElement).value).toBe('晨间深度工作')
  })

  it('[023.11] 返回列表选另一条 → 表单刷新为新记录', () => {
    render(<Harness items={[tb('tb1', 'planned', '第一条'), tb('tb2', 'planned', '第二条')]} />)
    fireEvent.click(screen.getByText('第一条').closest('button')!)
    expect((screen.getByLabelText('标题') as HTMLInputElement).value).toBe('第一条')
    fireEvent.click(screen.getByText('返回列表'))
    fireEvent.click(screen.getByText('第二条').closest('button')!)
    expect((screen.getByLabelText('标题') as HTMLInputElement).value).toBe('第二条')
  })
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/domains/timebox/cnui/surfaces/__tests__/edit-timeboxes.test.tsx`
Expected: 两新用例 FAIL（value 为 ''）。

- [ ] **Step 3: 加 useEffect**

`EditTimeboxes.tsx` draft useState 之后插入：

```tsx
  // [023.11] 选中记录切换时把 prefill 同步进 draft（原仅 useState 初值读 → 选后空白）
  // 依赖 dataModel.selectedId（不是 prefill 引用）—— 切换记录才重置；用户编辑期间不覆盖
  useEffect(() => {
    setDraft({
      title: prefill.title ?? '',
      startTime: prefill.startTime ?? '',
      endTime: prefill.endTime ?? '',
      activityArchetypeId: prefill.activityArchetypeId,
      notes: prefill.notes ?? '',
      tags: prefill.tags ?? [],
      taskIds: prefill.taskIds ?? [],
      habitIds: prefill.habitIds ?? [],
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataModel.selectedId])
```

- [ ] **Step 4: 验证 + Commit**

Run: vitest 该文件 → 全 PASS（含既有 case 1-7 + fold-in A1-A4 无回归）；`npx tsc --noEmit` 零新增。

```bash
git add frontend/src/domains/timebox/cnui/surfaces/EditTimeboxes.tsx \
  frontend/src/domains/timebox/cnui/surfaces/__tests__/edit-timeboxes.test.tsx
git commit -m "fix(023.11): editTimeboxes 编辑页空白修复 — useEffect[selectedId] 同步 prefill→draft

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 3: synonyms 字段 —— schema + 迁移 + USOM 类型 + mapper + Tier-2 文档

**Files:**
- Modify: `docs/database-design.md`、`docs/usom-design.md`（**Tier-2 先做**）
- Modify: `frontend/src/lib/db/schema.ts:709-723`
- Create: `frontend/src/lib/db/migrations/0034_023_11_archetype_synonyms.sql` + `.down.sql`
- Modify: `frontend/src/lib/db/migrations/meta/_journal.json`
- Modify: `frontend/src/usom/activity-archetype/types.ts:69-84`
- Modify: `frontend/src/usom/interfaces/irepository.ts:1262-1284`
- Modify: `frontend/src/lib/db/repositories/activity-archetype.repository.ts`（rowToArchetype/create/update）
- Modify: `frontend/src/lib/db/__tests__/activity-archetype-repo.test.ts`

**Interfaces:**
- Produces: `activity_archetypes.synonyms jsonb`；`ActivityArchetype.synonyms: string[]`；`Create/UpdateInput.synonyms?: string[]`

**Tier-2 先行（合规必须）**：
- [ ] **Step 0: 先更 docs**

`docs/database-design.md` activity_archetypes 表：在 `activity_label` 后加一行 `synonyms jsonb NOT NULL DEFAULT '[]'`（同表注释补"同义词/范围描述数组，用于标题匹配"）。
`docs/usom-design.md` §3.11 ActivityArchetype 属性列表：加 `synonyms: string[]`（同义词与范围描述短语，供规则轮子串匹配 + LLM catalog 锚点）。
commit 这两处 docs（独立 commit 或与 T3 同 commit，按仓库惯例）。

- [ ] **Step 1: 改 schema.ts**

`activityArchetypes` 表（schema.ts:709）在 `activityLabel` 后加：

```ts
  /** [023.11] 同义词/范围描述（用于标题→archetype 匹配） */
  synonyms: jsonb('synonyms').$type<string[]>().notNull().default([]),
```

- [ ] **Step 2: 写迁移 SQL + down**

`0034_023_11_archetype_synonyms.sql`：

```sql
-- [023.11] activity_archetypes 加 synonyms 列（同义词/范围描述，用于标题→archetype 匹配）
-- 设计来源：docs/superpowers/specs/2026-07-06-023-11-timebox-action-optimization-design.md §10
-- 幂等：ADD COLUMN IF NOT EXISTS
BEGIN;
ALTER TABLE activity_archetypes
  ADD COLUMN IF NOT EXISTS synonyms jsonb NOT NULL DEFAULT '[]'::jsonb;
COMMIT;
```

`0034_023_11_archetype_synonyms.down.sql`：

```sql
BEGIN;
ALTER TABLE activity_archetypes DROP COLUMN IF EXISTS synonyms;
COMMIT;
```

- [ ] **Step 3: 登记 journal idx=34**

`meta/_journal.json` 在 idx=33 后追加（保持数组顺序，when 用一个大于 1783249628888 的毫秒时间戳，如 `1783500000000`）：

```json
    },
    {
      "idx": 34,
      "version": "7",
      "when": 1783500000000,
      "tag": "0034_023_11_archetype_synonyms",
      "breakpoints": false
    }
  ]
}
```

（注意：原 idx=33 项末尾的 `}` 后要有逗号。）

- [ ] **Step 4: 应用迁移到 dev DB**

```bash
cd frontend
PSQL_CMD="psql $(grep DATABASE_URL .env.local | sed 's/.*=//' | tr -d '\"')"
$PSQL_CMD -f src/lib/db/migrations/0034_023_11_archetype_synonyms.sql
$PSQL_CMD -c "\d activity_archetypes" | grep synonyms
```
Expected: 输出含 `synonyms | jsonb | not null default '[]'`。
（若 `.env.local` 形式不同，直接用 `psql "postgresql://..."` 连 `lifeware_dev@localhost:5432`，参 [[project-drizzle-migrations-handwritten]]。）

- [ ] **Step 5: 改 USOM 类型 + IRepo 输入**

`usom/activity-archetype/types.ts` ActivityArchetype 接口加（在 activityLabel 后）：

```ts
  /** 同义词/范围描述短语（用于标题→archetype 匹配；[] 表示未维护） */
  synonyms: string[]
```

`usom/interfaces/irepository.ts`：

```ts
export interface CreateActivityArchetypeInput {
  l1Category: L1Category
  l2Name: string
  energyCost: EnergyCost
  activityLabel: ActivityLabel
  /** [023.11] 同义词/范围描述（可选，默认 []） */
  synonyms?: string[]
}
export interface UpdateActivityArchetypeInput {
  l1Category?: L1Category
  l2Name?: string
  energyCost?: EnergyCost
  activityLabel?: ActivityLabel
  /** [023.11] 同义词/范围描述 */
  synonyms?: string[]
}
```

- [ ] **Step 6: 改 repository mapper + create + update**

`activity-archetype.repository.ts` `rowToArchetype` 加 `synonyms: row.synonyms ?? [],`。
`create` 的 `.values({...})` 加 `synonyms: input.synonyms ?? [],`。
`update` 加分支（在 activityLabel 分支后）：

```ts
      if (input.synonyms !== undefined) {
        setData.synonyms = input.synonyms
        changedFields.push('synonyms')
      }
```

- [ ] **Step 7: 写测试 —— mapper round-trip + create/update 透传**

`activity-archetype-repo.test.ts`（既有集成测试文件）追加：

```ts
  it('[023.11] create 带 synonyms → find 回来含 synonyms', async () => {
    const created = await repo.create({
      l1Category: '工作', l2Name: '测试原型',
      energyCost: { physical: 1, mental: 1, emotional: 1, creative: 1 },
      activityLabel: { enjoyment: 5, typicalDuration: 30, interruptTolerance: 'medium', environment: [], location: [], parallelizable: false },
      synonyms: ['写代码', '编程'],
    }, USER_ID)
    expect(created.synonyms).toEqual(['写代码', '编程'])
    const got = await repo.findById(created.id, USER_ID)
    expect(got?.synonyms).toEqual(['写代码', '编程'])
  })

  it('[023.11] create 不传 synonyms → 默认 []', async () => {
    const created = await repo.create({
      l1Category: '工作', l2Name: '无义词原型',
      energyCost: { physical: 1, mental: 1, emotional: 1, creative: 1 },
      activityLabel: { enjoyment: 5, typicalDuration: 30, interruptTolerance: 'medium', environment: [], location: [], parallelizable: false },
    }, USER_ID)
    expect(created.synonyms).toEqual([])
  })

  it('[023.11] update synonyms 落库 + audit changedFields 含 synonyms', async () => {
    const created = await repo.create({ /* 同上 l2Name:'更新原型' */ } as any, USER_ID)
    await repo.update(created.id, { synonyms: ['新词'] }, USER_ID)
    const got = await repo.findById(created.id, USER_ID)
    expect(got?.synonyms).toEqual(['新词'])
  })
```

（按既有测试文件的 USER_ID/repo fixture 命名调整；若该文件是真实 DB 集成测试，每个用例自清理或用唯一 l2Name。）

- [ ] **Step 8: 跑测试 + tsc + 验证**

Run: `cd frontend && npx vitest run src/lib/db/__tests__/activity-archetype-repo.test.ts` → PASS
Run: `cd frontend && npx tsc --noEmit` → 零新增（注意：rowToArchetype 现在要求 synonyms，已补；ActivityArchetype 类型变化会波及所有消费方——若有 TS 报错（如 archetype-form 读 archetype.synonyms 之前没该字段），这是预期的，T5 会用上；其它只读消费方不受影响因为类型只增了字段）。

- [ ] **Step 9: Commit（含 docs）**

```bash
git add docs/database-design.md docs/usom-design.md \
  frontend/src/lib/db/schema.ts \
  frontend/src/lib/db/migrations/0034_023_11_archetype_synonyms.sql \
  frontend/src/lib/db/migrations/0034_023_11_archetype_synonyms.down.sql \
  frontend/src/lib/db/migrations/meta/_journal.json \
  frontend/src/usom/activity-archetype/types.ts \
  frontend/src/usom/interfaces/irepository.ts \
  frontend/src/lib/db/repositories/activity-archetype.repository.ts \
  frontend/src/lib/db/__tests__/activity-archetype-repo.test.ts
git commit -m "feat(023.11): activity_archetypes 加 synonyms 字段（schema/迁移/类型/mapper + Tier-2 docs）

0034 迁移 idx=34 + down + journal；rowToArchetype/create/update 接入； Tier-2 docs 先行

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 4: synonyms seed 内容 + seedDefaults 升级路径

**Files:**
- Modify: `frontend/src/usom/seed/activity-archetypes.ts`
- Modify: `frontend/src/lib/db/repositories/activity-archetype.repository.ts`（seedDefaults）
- Modify: `frontend/src/lib/db/__tests__/activity-archetype-repo.test.ts`

**背景**：迁移后既有系统条目 synonyms=`[]`。seedDefaults 改升级路径：不存在则 INSERT（带 synonyms）；已存在系统条目且 synonyms 为空 → UPDATE；已有 synonyms 或用户自建 → 不动（幂等，避开 [[backfill-scalar-subquery-needs-unique-or-limit1]]，无 unique 约束 → app 层 UPDATE 而非迁移 backfill）。

- [ ] **Step 1: seed 类型加 synonyms + 30 条补内容**

`usom/seed/activity-archetypes.ts`：

```ts
export interface ActivityArchetypeSeed {
  l1Category: L1Category
  l2Name: string
  energyCost: EnergyCost
  activityLabel: ActivityLabel
  /** [023.11] 同义词/范围描述（用于标题匹配） */
  synonyms: string[]
}
```

每条 seed 追加 `synonyms`（示例；保持原 energyCost/activityLabel 不动）：

```ts
  { l1Category: '工作', l2Name: '深度专注', ..., synonyms: ['写代码','编程','coding','深度工作','技术研发','论文','研究','架构','专注写作'] },
  { l1Category: '工作', l2Name: '方案设计', ..., synonyms: ['设计','画图','建模','方案','原型','UI 设计','系统设计','画原型'] },
  { l1Category: '工作', l2Name: '日常事务', ..., synonyms: ['回邮件','整理','归档','报销','填表','行政','杂务'] },
  { l1Category: '工作', l2Name: '代码审查', ..., synonyms: ['review','code review','审 PR','看 PR','评审'] },
  { l1Category: '工作', l2Name: '会议', ..., synonyms: ['开会','讨论','对齐','站会','周会','评审会'] },
  { l1Category: '工作', l2Name: '响应式工作', ..., synonyms: ['回消息','处理 issue','答疑','看通知','碎片沟通'] },
  { l1Category: '生存', l2Name: '睡眠', ..., synonyms: ['睡觉','休息','入睡','午睡','补觉'] },
  { l1Category: '生存', l2Name: '饮食', ..., synonyms: ['吃饭','早餐','午餐','晚餐','做饭','点外卖'] },
  { l1Category: '生存', l2Name: '通勤', ..., synonyms: ['上班路上','地铁','公交','开车回家','路上'] },
  { l1Category: '生存', l2Name: '家务', ..., synonyms: ['打扫','洗衣','收拾','洗碗','整理房间'] },
  { l1Category: '投资', l2Name: '学习新技能', ..., synonyms: ['学习','上课','学课程','练习','练琴','背单词'] },
  { l1Category: '投资', l2Name: '阅读', ..., synonyms: ['看书','读书','看文章','看文档','翻书'] },
  { l1Category: '投资', l2Name: '写作', ..., synonyms: ['写文章','写博客','写日记','写笔记','记录'] },
  { l1Category: '投资', l2Name: '复盘反思', ..., synonyms: ['复盘','反思','总结','自省'] },
  { l1Category: '投资', l2Name: '知识整理', ..., synonyms: ['整理笔记','归档资料','做卡片','写文档'] },
  { l1Category: '关系', l2Name: '陪伴家人', ..., synonyms: ['陪孩子','陪父母','亲子','伴侣时间'] },
  { l1Category: '关系', l2Name: '社交活动', ..., synonyms: ['聚会','聚餐','和朋友','party'] },
  { l1Category: '关系', l2Name: '团队协作', ..., synonyms: ['协作','结对','mob','协同'] },
  { l1Category: '关系', l2Name: '一对一沟通', ..., synonyms: ['1v1','谈心','辅导','倾听','私聊'] },
  { l1Category: '放松', l2Name: '冥想', ..., synonyms: ['打坐','正念','静坐','呼吸练习'] },
  { l1Category: '放松', l2Name: '散步', ..., synonyms: ['走路','溜达','漫步','散步思考'] },
  { l1Category: '放松', l2Name: '娱乐', ..., synonyms: ['看剧','看电影','玩游戏','刷视频','听播客'] },
  { l1Category: '放松', l2Name: '午休', ..., synonyms: ['小憩','打盹','闭目养神'] },
  { l1Category: '健康', l2Name: '有氧运动', ..., synonyms: ['跑步','慢跑','骑车','游泳','跳绳','椭圆机'] },
  { l1Category: '健康', l2Name: '力量训练', ..., synonyms: ['举铁','健身','撸铁','深蹲','卧推'] },
  { l1Category: '健康', l2Name: '拉伸恢复', ..., synonyms: ['拉伸','瑜伽','泡沫轴','柔韧'] },
  { l1Category: '健康', l2Name: '体能监测', ..., synonyms: ['称体重','量血压','测心率','体测'] },
  { l1Category: '浪费', l2Name: '无目的刷手机', ..., synonyms: ['刷微博','刷抖音','刷朋友圈','无目的浏览'] },
  { l1Category: '浪费', l2Name: '拖延等待', ..., synonyms: ['发呆','磨蹭','拖延','走神'] },
  { l1Category: '浪费', l2Name: '无效会议', ..., synonyms: ['冗长会议','无聊会议','没意义的会'] },
```

（implementer 保留原 energyCost/activityLabel，仅加 `synonyms` 字段。`...` 在 plan 里表示"原字段不变"，实现时必须填全。）

- [ ] **Step 2: 改 seedDefaults 升级路径**

`activity-archetype.repository.ts` `seedDefaults` 改为：

```ts
  async seedDefaults(userId: USOM_ID, tx?: DbClient): Promise<number> {
    const client = tx ?? db
    const existing = await client
      .select({ l1Category: s.activityArchetypes.l1Category, l2Name: s.activityArchetypes.l2Name,
                synonyms: s.activityArchetypes.synonyms, isSystem: s.activityArchetypes.isSystem })
      .from(s.activityArchetypes)
      .where(eq(s.activityArchetypes.userId, userId))
    const existingMap = new Map(existing.map((e) => [`${e.l1Category}::${e.l2Name}`, e]))

    let changes = 0
    for (const seed of SEED_ACTIVITY_ARCHETYPES) {
      const key = `${seed.l1Category}::${seed.l2Name}`
      const row = existingMap.get(key)
      if (!row) {
        // 不存在 → INSERT（带 synonyms）
        await client.insert(s.activityArchetypes).values({
          userId, l1Category: seed.l1Category, l2Name: seed.l2Name,
          energyCost: seed.energyCost, activityLabel: seed.activityLabel,
          synonyms: seed.synonyms, isSystem: true,
        })
        changes++
      } else if (row.isSystem && Array.isArray(row.synonyms) && row.synonyms.length === 0) {
        // [023.11] 既有系统条目且 synonyms 为空 → 升级（不覆盖用户已维护的 / 用户自建条目）
        await client.update(s.activityArchetypes)
          .set({ synonyms: seed.synonyms })
          .where(and(eq(s.activityArchetypes.userId, userId),
                     eq(s.activityArchetypes.l1Category, seed.l1Category),
                     eq(s.activityArchetypes.l2Name, seed.l2Name),
                     eq(s.activityArchetypes.isSystem, true)))
        changes++
      }
      // else: 已有 synonyms 或用户自建 → skip
    }
    return changes
  }
```

- [ ] **Step 3: 写测试 —— 升级路径幂等**

`activity-archetype-repo.test.ts` 追加：

```ts
  it('[023.11] seedDefaults 给新用户插入带 synonyms 的系统条目', async () => {
    const n = await repo.seedDefaults(NEW_USER_ID)
    expect(n).toBeGreaterThan(0)
    const all = await repo.findByUser(NEW_USER_ID)
    const deep = all.find(a => a.l2Name === '深度专注')
    expect(deep?.synonyms).toContain('写代码')
  })

  it('[023.11] seedDefaults 升级既有空 synonyms 的系统条目（幂等）', async () => {
    await repo.seedDefaults(NEW_USER_ID)
    // 模拟既有条目被清空 synonyms（如迁移后状态）
    // （用 dev DB 时跳过此 trick；或 insert 一条 is_system=true synonyms=[] 的行）
    const n2 = await repo.seedDefaults(NEW_USER_ID)
    expect(n2).toBe(0) // 已全填，二次 seed 无变更
  })
```

（NEW_USER_ID 用既有 fixture 或新建临时用户；按文件约定。）

- [ ] **Step 4: 应用 dev DB seed 升级 + 验证**

```bash
cd frontend
# 跑一次 seedDefaults（通过既有 seedArchetypes action 或测试触发）；或直接 SQL 抽样：
$PSQL_CMD -c "SELECT l2_name, synonyms FROM activity_archetypes WHERE l2_name='深度专注';"
```
Expected: `synonyms` 含 `["写代码","编程",...]`。

Run: `cd frontend && npx vitest run src/lib/db/__tests__/activity-archetype-repo.test.ts` → PASS
Run: `cd frontend && npx tsc --noEmit` → 零新增

- [ ] **Step 5: Commit**

```bash
git add frontend/src/usom/seed/activity-archetypes.ts \
  frontend/src/lib/db/repositories/activity-archetype.repository.ts \
  frontend/src/lib/db/__tests__/activity-archetype-repo.test.ts
git commit -m "feat(023.11): seed 30 条 archetype synonyms + seedDefaults 幂等升级路径

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 5: archetype 配置 UI 加 synonyms 输入

**Files:**
- Modify: `frontend/src/app/config/activity-archetypes/archetype-form.tsx`

**Interfaces:** Consumes Create/UpdateInput.synonyms（T3）；Produces 表单可编辑 synonyms

- [ ] **Step 1: 写失败测试（若无 form 测试则新建轻量渲染断言）**

若有 `archetype-form.test.tsx` 则加用例；否则**手动验证 + 在 T5 commit 里说明**（form 是 client component，既有无测试）。建议最小加：创建 form 时不传 archetype，synonyms textarea 渲染且可输入；编辑模式带入既有 synonyms。

（若 team 惯例 config UI 不强测，此步可降级为手动验证 + /browse 视觉确认，commit 里注明。）

- [ ] **Step 2: 加 synonyms state + UI + 提交透传**

`archetype-form.tsx`：

(a) 顶部 `parseCommaList`/`joinCommaList` 已存在（line 72-83），复用。

(b) 加 state（在 `locText` 后）：

```tsx
  const [synonymsText, setSynonymsText] = useState<string>(joinCommaList(archetype?.synonyms));
```

(c) useEffect 同步（line 107-115）加：

```tsx
    setSynonymsText(joinCommaList(archetype?.synonyms));
```

(d) 提交（create 与 update 两处 payload 加 synonyms）：

```tsx
        // update
        const r = await updateArchetype(archetype.id, {
          l1Category: l1Category as L1Category,
          l2Name: l2Name.trim(),
          energyCost: energy,
          activityLabel: finalLabel,
          synonyms: parseCommaList(synonymsText),   // [023.11]
        });
        // create
        const r = await createArchetype({
          l1Category: l1Category as L1Category,
          l2Name: l2Name.trim(),
          energyCost: energy,
          activityLabel: finalLabel,
          synonyms: parseCommaList(synonymsText),   // [023.11]
        });
```

(e) UI —— 在 environment/location 那个 `grid-cols-2` 区块**之后**（parallelizable 之前）加：

```tsx
      {/* [023.11] synonyms（同义词/范围描述） */}
      <div className="space-y-2">
        <Label htmlFor="synonyms">同义词/范围（逗号分隔）</Label>
        <Textarea
          id="synonyms"
          value={synonymsText}
          onChange={(e) => setSynonymsText(e.target.value)}
          placeholder="如：写代码, 编程, coding"
          rows={2}
        />
        <p className="text-xs text-muted-foreground">
          用于 AI 从标题自动匹配活动原型；填同义词与该原型覆盖的具体活动
        </p>
      </div>
```

- [ ] **Step 3: 验证 + Commit**

Run: `cd frontend && npx tsc --noEmit` → 零新增
（可选）Run: `cd frontend && npx vitest run` 相关 form 测试。
`/browse` 视觉确认（可选，用户 opt-in）。

```bash
git add frontend/src/app/config/activity-archetypes/archetype-form.tsx
git commit -m "feat(023.11): archetype 配置表单加 synonyms 输入 + create/update 透传

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 6: archetype-matcher 共享原语（规则纳入 synonyms + Issue 1 位置匹配）

**Files:**
- Create: `frontend/src/domains/timebox/lib/archetype-matcher.ts`
- Test: `frontend/src/domains/timebox/lib/__tests__/archetype-matcher.test.ts`

**Interfaces:**
- Consumes `ActivityArchetype`（含 T3 的 `synonyms`）、`AIRuntime`
- Produces `matchArchetypesForTitles`、`ArchetypeMatch`、`RULE_CONFIDENCE`、`LLM_THRESHOLD`

- [ ] **Step 1: 写失败测试**

`frontend/src/domains/timebox/lib/__tests__/archetype-matcher.test.ts`：

```ts
/**
 * @file archetype-matcher.test
 * @brief [023.11] 活动原型匹配原语单测（规则含 synonyms + LLM 位置匹配）
 */
import { describe, it, expect, vi } from 'vitest'
import { matchArchetypesForTitles, RULE_CONFIDENCE, REVERSE_CONFIDENCE, LLM_THRESHOLD } from '../archetype-matcher'
import type { ActivityArchetype } from '@/usom/activity-archetype/types'
import type { AIRuntime } from '@/nexus/ai-runtime'

function arch(id: string, l2Name: string, synonyms: string[] = []): ActivityArchetype {
  return {
    id, l2Name, synonyms,
    l1Category: '工作' as never,
    energyCost: { physical: 1, mental: 1, emotional: 1, creative: 1 },
    activityLabel: { enjoyment: 5, typicalDuration: 60, interruptTolerance: 'medium', environment: [], location: [], parallelizable: false },
    isSystem: false, userId: 'u', createdAt: '', updatedAt: '',
  } as ActivityArchetype
}
function mockRuntime(content: string): AIRuntime {
  return { generate: vi.fn().mockResolvedValue({ content }) } as unknown as AIRuntime
}

describe('[023.11] archetype-matcher', () => {
  it('常量门槛', () => { expect(RULE_CONFIDENCE).toBe(0.9); expect(LLM_THRESHOLD).toBe(0.7) })

  it('规则精确命中 l2Name → rule', async () => {
    const [r] = await matchArchetypesForTitles(['深度专注'], [arch('a1', '深度专注')], mockRuntime('x'))
    expect(r).toEqual({ archetypeId: 'a1', confidence: RULE_CONFIDENCE, source: 'rule' })
  })

  it('[synonyms] 规则命中同义词（标题不含 l2Name）→ rule，零 LLM', async () => {
    const runtime = mockRuntime('x')
    const [r] = await matchArchetypesForTitles(['写代码'], [arch('a1', '深度专注', ['写代码', '编程'])], runtime)
    expect(r).toEqual({ archetypeId: 'a1', confidence: RULE_CONFIDENCE, source: 'rule' })
    expect(runtime.generate).not.toHaveBeenCalled()
  })

  it('规则子串命中 l2Name → rule', async () => {
    const [r] = await matchArchetypesForTitles(['下午深度专注写作'], [arch('a1', '深度专注')], mockRuntime('x'))
    expect(r?.source).toBe('rule'); expect(r?.archetypeId).toBe('a1')
  })

  it('多 archetype 命中 → 取最长匹配串', async () => {
    const [r] = await matchArchetypesForTitles(['深度专注'], [arch('a1', '专注'), arch('a2', '深度专注')], mockRuntime('x'))
    expect(r?.archetypeId).toBe('a2')
  })

  it('[C5] 反向包含（title≥3 字，term 含 title）→ REVERSE_CONFIDENCE(0.75)', async () => {
    // title '深度专注'(4字) 是 l2Name '深度专注工作' 的子串 → 反向包含
    const [r] = await matchArchetypesForTitles(['深度专注'], [arch('a1', '深度专注工作')], mockRuntime('x'))
    expect(r).toEqual({ archetypeId: 'a1', confidence: REVERSE_CONFIDENCE, source: 'rule' })
  })

  it('[C5] 2 字标题不触发反向包含 → 落 LLM（防泛词误匹配）', async () => {
    // title '专注'(2字) 是 l2Name '深度专注' 的子串，但 <3 字 → 反向被挡 → 规则 null
    const runtime = mockRuntime(JSON.stringify({ results: [{ archetypeId: 'a1', confidence: 0.8 }] }))
    const [r] = await matchArchetypesForTitles(['专注'], [arch('a1', '深度专注')], runtime)
    expect(r?.source).toBe('llm') // 规则未命中，LLM 兜底
  })

  it('[C5] 正向包含优先于反向（同时命中取正向高置信）', async () => {
    // a1 l2Name='深度专注'(正向命中 title '深度专注')；a2 l2Name='深度专注工作'(反向命中)
    const [r] = await matchArchetypesForTitles(['深度专注'],
      [arch('a1', '深度专注'), arch('a2', '深度专注工作')], mockRuntime('x'))
    expect(r?.archetypeId).toBe('a1')
    expect(r?.confidence).toBe(RULE_CONFIDENCE)
  })

  it('规则未命中 → LLM 位置匹配命中（≥门槛）→ llm', async () => {
    const runtime = mockRuntime(JSON.stringify({ results: [{ archetypeId: 'a1', confidence: 0.8 }] }))
    const [r] = await matchArchetypesForTitles(['写代码'], [arch('a1', '深度专注', ['编程'])], runtime)
    expect(r).toEqual({ archetypeId: 'a1', confidence: 0.8, source: 'llm' })
  })

  it('LLM confidence < 门槛 → null', async () => {
    const runtime = mockRuntime(JSON.stringify({ results: [{ archetypeId: 'a1', confidence: 0.4 }] }))
    const [r] = await matchArchetypesForTitles(['吃饭'], [arch('a1', '深度专注')], runtime)
    expect(r).toBeNull()
  })

  it('LLM 返回不存在 id → null（防幻觉）', async () => {
    const runtime = mockRuntime(JSON.stringify({ results: [{ archetypeId: 'ghost', confidence: 0.9 }] }))
    const [r] = await matchArchetypesForTitles(['写代码'], [arch('a1', '深度专注')], runtime)
    expect(r).toBeNull()
  })

  it('LLM 结果长度与 titles 不等 → 全 null（Issue 1 位置匹配安全降级）', async () => {
    const runtime = mockRuntime(JSON.stringify({ results: [{ archetypeId: 'a1', confidence: 0.9 }] }))
    const res = await matchArchetypesForTitles(['写代码', '跑步'], [arch('a1', '深度专注')], runtime)
    expect(res).toEqual([null, null])
  })

  it('LLM 畸形 JSON → null（不抛）', async () => {
    const [r] = await matchArchetypesForTitles(['写代码'], [arch('a1', '深度专注')], mockRuntime('not json'))
    expect(r).toBeNull()
  })

  it('空标题 → null', async () => {
    const [r] = await matchArchetypesForTitles([''], [arch('a1', '深度专注')], mockRuntime('x'))
    expect(r).toBeNull()
  })

  it('空 archetypes → 全 null 且不发 LLM', async () => {
    const runtime = mockRuntime('x')
    expect(await matchArchetypesForTitles(['写代码'], [], runtime)).toEqual([null])
    expect(runtime.generate).not.toHaveBeenCalled()
  })

  it('batch 混合：部分规则部分 LLM → 单次 LLM 调用，位置对齐', async () => {
    const runtime = mockRuntime(JSON.stringify({ results: [{ archetypeId: 'a2', confidence: 0.85 }] }))
    const res = await matchArchetypesForTitles(
      ['深度专注写作', '跑步'],
      [arch('a1', '深度专注', ['写代码']), arch('a2', '有氧运动', ['跑步'])],
      runtime,
    )
    expect(res[0]).toMatchObject({ archetypeId: 'a1', source: 'rule' })   // titles[0] 规则命中
    expect(res[1]).toMatchObject({ archetypeId: 'a2', source: 'llm' })    // titles[1] LLM 兜底
    expect(runtime.generate).toHaveBeenCalledTimes(1)
  })

  it('时间词被剥：含 HH:MM/点/时段词仍规则命中', async () => {
    const [r] = await matchArchetypesForTitles(['下午14:00 深度专注'], [arch('a1', '深度专注')], mockRuntime('x'))
    expect(r?.source).toBe('rule')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/domains/timebox/lib/__tests__/archetype-matcher.test.ts` → FAIL（模块不存在）

- [ ] **Step 3: 实现 archetype-matcher.ts**

创建 `frontend/src/domains/timebox/lib/archetype-matcher.ts`：

```ts
/**
 * @file archetype-matcher
 * @brief [023.11] 活动原型匹配原语（规则优先 + LLM 兜底）
 *
 * 纯函数 —— DB/aiRuntime 由调用方注入（守 R-01，便于单测 mock）。
 *
 * 规则轮（本地）：标题归一化后判 l2Name 或任一 synonym 的子串包含。
 *   正向包含（title 含 term）→ 0.9；反向包含（term 含 title，title≥3 字）→ 0.75（[C5] 防短词误匹配）。正向优先。
 * LLM 兜底轮（仅对规则未命中的非空标题，批量一次）：注入 archetype 目录（含 synonyms），
 *   要求 results 按输入 titles 顺序返回（位置匹配，Issue 1），长度不等则整体降级 null。
 */
import type { AIRuntime } from '@/nexus/ai-runtime'
import type { ActivityArchetype } from '@/usom/activity-archetype/types'

export interface ArchetypeMatch {
  archetypeId: string
  confidence: number
  source: 'rule' | 'llm'
}

export const RULE_CONFIDENCE = 0.9
/** [C5] 反向包含（term 含 title，title≥3 字）—— 较低置信，避免短标题过度自信误匹配 */
export const REVERSE_CONFIDENCE = 0.75
export const LLM_THRESHOLD = 0.7

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase()
    .replace(/\d{1,2}\s*[：:]\s*\d{1,2}/g, '')
    .replace(/\d{1,2}\s*点(半)?/g, '')
    .replace(/(上午|下午|早上|晚上|凌晨|中午)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * 规则轮：单标题在目录里找匹配。
 * - 正向包含（title 含 term）→ RULE_CONFIDENCE(0.9)，取最长 term
 * - 反向包含（term 含 title，且 title≥3 字）→ REVERSE_CONFIDENCE(0.75)，取最长 term
 * - 正向优先于反向（正向更具体）；都不命中 → null（交 LLM 兜底）
 * [C5] 反向要求 title≥3 字 + 降置信，挡住 2 字泛词（如"工作"/"运动"）误匹配。
 */
function ruleMatch(title: string, archetypes: ActivityArchetype[]): ArchetypeMatch | null {
  const norm = normalizeTitle(title)
  if (!norm) return null
  let bestForward: { a: ActivityArchetype; score: number } | null = null
  let bestReverse: { a: ActivityArchetype; score: number } | null = null
  for (const a of archetypes) {
    const terms = [a.l2Name, ...(a.synonyms ?? [])]
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0)
    for (const t of terms) {
      if (norm.includes(t)) {
        if (!bestForward || t.length > bestForward.score) bestForward = { a, score: t.length }
      } else if (norm.length >= 3 && t.includes(norm)) {
        if (!bestReverse || t.length > bestReverse.score) bestReverse = { a, score: t.length }
      }
    }
  }
  if (bestForward) return { archetypeId: bestForward.a.id, confidence: RULE_CONFIDENCE, source: 'rule' }
  if (bestReverse) return { archetypeId: bestReverse.a.id, confidence: REVERSE_CONFIDENCE, source: 'rule' }
  return null
}

function parseLoose(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  return JSON.parse((fenced ? fenced[1] : raw).trim())
}

/** LLM 兜底：批量未命中标题一次调用，位置匹配（Issue 1） */
async function llmMatch(
  titles: string[],
  archetypes: ActivityArchetype[],
  aiRuntime: AIRuntime,
): Promise<(ArchetypeMatch | null)[]> {
  const catalog = archetypes.map((a) => ({
    id: a.id, l2Name: a.l2Name, l1Category: a.l1Category, synonyms: a.synonyms ?? [],
    environment: a.activityLabel?.environment ?? [], location: a.activityLabel?.location ?? [],
  }))
  const systemPrompt = [
    '你是活动原型分类器。依据用户活动标题，从已有原型目录里选最匹配的一项。',
    '规则：',
    '- 只能从目录已有 id 里选，禁止编造 id。',
    '- 输出严格 JSON：{ "results": [{ "archetypeId": "<id 或 null>", "confidence": <0-1> }] }',
    '- results 必须与输入 titles 顺序一一对应、长度相等（不要回传 title，按下标对应）。',
    '- 无合适项时 archetypeId 给 null 或 confidence < 0.7。',
    '- 标题与原型语义无关时给低分。',
  ].join('\n')
  const resp = await aiRuntime.generate({
    domainId: 'timebox', action: 'matchArchetype', systemPrompt,
    messages: [{ role: 'user', content: JSON.stringify({ archetypes: catalog, titles }) }],
    taskType: 'field_extraction', temperature: 0,
  })
  const content = resp.content
  const jsonStr = typeof content === 'string' ? content : JSON.stringify(content)
  let parsed: { results?: Array<{ archetypeId: string | null; confidence: number } | null> }
  try {
    parsed = parseLoose(jsonStr) as typeof parsed
  } catch {
    return titles.map(() => null)
  }
  const arr = parsed.results ?? []
  // Issue 1：位置匹配；长度不对齐 → 整体降级（防 LLM 丢条/并条导致错位）
  if (!Array.isArray(arr) || arr.length !== titles.length) return titles.map(() => null)
  const validIds = new Set(archetypes.map((a) => a.id))
  return titles.map((_, i) => {
    const hit = arr[i]
    if (!hit || !hit.archetypeId) return null
    if (!validIds.has(hit.archetypeId)) return null
    if (typeof hit.confidence !== 'number' || hit.confidence < LLM_THRESHOLD) return null
    return { archetypeId: hit.archetypeId, confidence: hit.confidence, source: 'llm' }
  })
}

export async function matchArchetypesForTitles(
  titles: string[],
  archetypes: ActivityArchetype[],
  aiRuntime: AIRuntime,
): Promise<(ArchetypeMatch | null)[]> {
  if (archetypes.length === 0) return titles.map(() => null)
  const results: (ArchetypeMatch | null)[] = titles.map((t) => (t && t.trim() ? ruleMatch(t, archetypes) : null))
  const missIdx = titles.map((t, i) => ({ t, i })).filter((x) => !results[x.i] && x.t && x.t.trim())
  if (missIdx.length === 0) return results
  const llmHits = await llmMatch(missIdx.map((x) => x.t), archetypes, aiRuntime)
  missIdx.forEach((x, k) => { results[x.i] = llmHits[k] })
  return results
}
```

- [ ] **Step 4: 跑测试 + tsc**

Run: `cd frontend && npx vitest run src/domains/timebox/lib/__tests__/archetype-matcher.test.ts` → 全 PASS（17 用例）
Run: `cd frontend && npx tsc --noEmit` → 零新增

- [ ] **Step 5: Commit**

```bash
git add frontend/src/domains/timebox/lib/archetype-matcher.ts \
  frontend/src/domains/timebox/lib/__tests__/archetype-matcher.test.ts
git commit -m "feat(023.11): archetype-matcher 原语（规则含 synonyms + LLM 位置匹配）

规则轮纳入 synonyms 子串匹配(0.9) / LLM 批量兜底位置匹配(≥0.7,长度不等降级) / 防幻觉 / 空目录不发 LLM
+ 14 单测

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 7: matchArchetypeForTitle server action

**Files:**
- Modify: `frontend/src/app/actions/activity-archetype.ts`
- Create: `frontend/src/app/actions/__tests__/activity-archetype.test.ts`

**Interfaces:** Consumes matcher（T6）；Produces `matchArchetypeForTitle(title): Promise<{matched:boolean; archetypeId?:string}>`

- [ ] **Step 1: 写失败测试**

创建 `frontend/src/app/actions/__tests__/activity-archetype.test.ts`（见原 plan T4，照搬）：

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('@/nexus/ai-runtime', () => ({ createAIRuntime: vi.fn(() => ({})) }))
vi.mock('@/lib/db/repositories/activity-archetype.repository', () => ({ ActivityArchetypeRepository: vi.fn() }))
vi.mock('@/domains/timebox/lib/archetype-matcher', () => ({ matchArchetypesForTitles: vi.fn() }))
import { matchArchetypeForTitle } from '../activity-archetype'
import { ActivityArchetypeRepository } from '@/lib/db/repositories/activity-archetype.repository'
import { matchArchetypesForTitles } from '@/domains/timebox/lib/archetype-matcher'
const MockedRepo = vi.mocked(ActivityArchetypeRepository)
const mockMatch = vi.mocked(matchArchetypesForTitles)
beforeEach(() => {
  vi.clearAllMocks()
  MockedRepo.mockImplementation(function () {
    return { findByUser: vi.fn().mockResolvedValue([{ id: 'a1' }]) } as unknown as InstanceType<typeof ActivityArchetypeRepository>
  })
})
describe('[023.11] matchArchetypeForTitle', () => {
  it('matcher 命中 → { matched: true, archetypeId }', async () => {
    mockMatch.mockResolvedValueOnce([{ archetypeId: 'a1', confidence: 0.9, source: 'rule' }])
    expect(await matchArchetypeForTitle('深度专注')).toEqual({ matched: true, archetypeId: 'a1' })
  })
  it('matcher 未命中 → { matched: false }', async () => {
    mockMatch.mockResolvedValueOnce([null])
    expect(await matchArchetypeForTitle('未知活动')).toEqual({ matched: false })
  })
  it('空 title → { matched: false } 且不查 DB / 不调 matcher', async () => {
    expect(await matchArchetypeForTitle('   ')).toEqual({ matched: false })
    expect(mockMatch).not.toHaveBeenCalled()
  })
  it('[错误路径] repo.findByUser 抛错 → { matched: false }（catch 兜底）', async () => {
    MockedRepo.mockImplementationOnce(function () {
      return { findByUser: vi.fn().mockRejectedValue(new Error('db down')) } as unknown as InstanceType<typeof ActivityArchetypeRepository>
    })
    expect(await matchArchetypeForTitle('写代码')).toEqual({ matched: false })
  })
})
```

- [ ] **Step 2: 跑测试确认失败** → FAIL（未导出）

- [ ] **Step 3: 实现 action**

`activity-archetype.ts` 顶部 import 加：

```ts
import { createAIRuntime } from "@/nexus/ai-runtime";
import { matchArchetypesForTitles } from "@/domains/timebox/lib/archetype-matcher";
```

末尾追加：

```ts
/** [023.11] 单标题 AI 匹配结果 */
export interface ArchetypeMatchResult {
  matched: boolean;
  archetypeId?: string;
}

/** [023.11] 单标题 AI 匹配（规则优先 + LLM 兜底），供 ArchetypePicker「AI 匹配」按钮调用 */
export async function matchArchetypeForTitle(title: string): Promise<ArchetypeMatchResult> {
  if (!title || !title.trim()) return { matched: false };
  try {
    const repo = new ActivityArchetypeRepository();
    const archetypes = await repo.findByUser(MVP_USER_ID);
    if (archetypes.length === 0) return { matched: false };
    const aiRuntime = createAIRuntime();
    const [hit] = await matchArchetypesForTitles([title.trim()], archetypes, aiRuntime);
    if (!hit) return { matched: false };
    return { matched: true, archetypeId: hit.archetypeId };
  } catch {
    return { matched: false };
  }
}
```

- [ ] **Step 4: 跑测试 + tsc + Commit**

Run: vitest 该文件 → PASS；`npx tsc --noEmit` 零新增（`ArchetypeMatchResult` 是 interface，'use server' 文件允许，参既有 `ArchetypeActionResult`）。

```bash
git add frontend/src/app/actions/activity-archetype.ts \
  frontend/src/app/actions/__tests__/activity-archetype.test.ts
git commit -m "feat(023.11): matchArchetypeForTitle server action

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 8: ArchetypePicker「AI 匹配」按钮

**Files:**
- Modify: `frontend/src/components/archetype/archetype-picker.tsx`
- Modify: `frontend/src/components/archetype/__tests__/archetype-picker.test.tsx`

（与原 plan T5 完全一致：mock 加 matchArchetypeForTitle；新增 enableAiMatch/title props + runAiMatch + aiMatchBtn + aiError；5 用例。代码块见原 plan，此处为避免重复仅列要点 —— **implementer 必须完整实现**，参 spec §3.2.2。）

> ⚠️ 反占位：本任务不允许"参 Task N"跳过。实现要点：
> - mock 块 `vi.mock('@/app/actions/activity-archetype', () => ({ getArchetypes: vi.fn(), matchArchetypeForTitle: vi.fn() }))`
> - import `matchArchetypeForTitle` + `vi.mocked` → `mockMatchArchetype`，`beforeEach` reset
> - props 加 `enableAiMatch?: boolean; title?: string`
> - state `aiMatching`/`aiError`；`useEffect(() => setAiError(false), [title])`；`runAiMatch`（命中 onChange / 未命中 setAiError）
> - `showAiMatch = enableAiMatch && !readOnly && !!title?.trim()`；`aiMatchBtn`（"AI 匹配" / "匹配中…"）
> - selected 与 !selected 两分支的按钮区各用 `<div className="flex shrink-0 items-center gap-2">` 包「更换/选择」+ `{aiMatchBtn}`
> - 组件末尾 `{aiError && <p className="mt-1 text-xs text-error">未找匹配的活动原型</p>}`
> - 7 测试：渲染 / 无 title 不显 / readOnly 不显 / 命中 onChange / 未命中显提示 / **[错误路径] loading 态显示"匹配中…"且禁用按钮**（mock `mockMatchArchetype.mockReturnValueOnce(new Promise(()=>{}))` 永挂，断言"匹配中…"出现 + 按钮 disabled）/ **[错误路径] action reject → aiError 显示「未找匹配的活动原型」**（`mockMatchArchetype.mockRejectedValueOnce(new Error('net'))`）

- [ ] **Steps 1-5:** 写 5 失败测试 → 跑失败 → 实现 picker → 跑 PASS + tsc → commit `feat(023.11): ArchetypePicker 加「AI 匹配」按钮`

---

## Task 9: createTimebox 被动推断（parseTimeboxBatchIntentOnly）

**Files:**
- Modify: `frontend/src/app/actions/intent.ts`（parseTimeboxBatchIntentOnly）
- Modify: `frontend/src/app/actions/__tests__/intent.test.ts`

（与原 plan T6 一致。`ActivityArchetypeRepository` 已在 intent.ts import（line 17）；加 `matchArchetypesForTitles` import；drafts 类型加 `activityArchetypeId?`；map 后 try/catch 调 matcher 填字段；2 测试，mock repo + matcher。intent.test.ts 顶部加两 mock 块。）

> 反占位实现要点：
> - `intent.test.ts` 加 `vi.mock('@/lib/db/repositories/activity-archetype.repository', ...)` 与 `vi.mock('@/domains/timebox/lib/archetype-matcher', ...)`；import `matchArchetypesForTitles` → `mockMatchArchetypes`
> - parseTimeboxBatchIntentOnly：drafts map 后加 try/catch：`const archetypes = await new ActivityArchetypeRepository().findByUser(MVP_USER_ID); if (archetypes.length>0) { const matches = await matchArchetypesForTitles(drafts.map(d=>d.title), archetypes, aiRuntime); drafts.forEach((d,i)=>{ if(!d.activityArchetypeId && matches[i]) d.activityArchetypeId = matches[i]!.archetypeId }) }`
> - `TimeboxBatchParseResult.drafts` 元素类型加 `activityArchetypeId?: string`
> - 2 测试：命中带 id / 未命中 undefined（mock parseMultiTask 返固定 intent + mock matcher）
> - **[错误路径] archetype repo 抛错 → try/catch degrade**：drafts 仍 success 返回、不带 archetypeId（`MockedRepo.mockImplementationOnce` 让 findByUser reject；断言 `r.success===true && r.drafts[0].activityArchetypeId===undefined`）
> - **[错误路径] archetypes 为空 → 跳过 matcher**：repo 返 `[]`；断言 `mockMatchArchetypes` 未被调用、drafts 不带 archetypeId（覆盖 plan 的 `if (archetypes.length>0)` 短路）

- [ ] **Steps 1-5:** 写 2 失败测试 → 失败 → 实现 → PASS + tsc → commit `feat(023.11): createTimebox 被动推断 archetype`

---

## Task 10: 两个 CNUI surface 接线 ArchetypePicker

**Files:**
- Modify: `frontend/src/domains/timebox/cnui/surfaces/CreateTimebox.tsx:110-114`
- Modify: `frontend/src/domains/timebox/cnui/surfaces/EditTimeboxes.tsx:244-245`
- Modify: `frontend/src/domains/timebox/cnui/surfaces/__tests__/create-timebox.test.tsx`
- Modify: `frontend/src/domains/timebox/cnui/surfaces/__tests__/edit-timeboxes.test.tsx`

- [ ] **Step 1: 写失败测试**

`create-timebox.test.tsx` 末尾加（用既有 `makeDraft`）：

```tsx
describe('[023.11] CreateTimebox ArchetypePicker 接线', () => {
  it('title 非空时渲染「AI 匹配」按钮', async () => {
    render(<CreateTimebox surfaceType="createTimebox"
      dataModel={{ items: [makeDraft({ title: '下午写代码' })] }}
      onDataChange={vi.fn()} onConfirm={vi.fn()} />)
    expect(await screen.findByText('AI 匹配')).toBeInTheDocument()
  })
})
```

`edit-timeboxes.test.tsx` 末尾加：

```tsx
  it('[023.11] editing title 非空 → 渲染「AI 匹配」', async () => {
    render(<EditTimeboxes {...makeProps({ mode:'editing', items:[tb('tb1','planned')],
      selectedId:'tb1', prefill:{ title:'写代码' }, status:'planned' })} />)
    expect(await screen.findByText('AI 匹配')).toBeInTheDocument()
  })
```

- [ ] **Step 2: 跑失败** → 两用例 FAIL（按钮未渲染，未传 enableAiMatch）

- [ ] **Step 3: CreateTimebox.tsx 接线**（110-114）：

```tsx
            <ArchetypePicker
              value={cur.activityArchetypeId}
              onChange={(id) => update({ activityArchetypeId: id })}
              enableAiMatch
              title={cur.title}
            />
```

- [ ] **Step 4: EditTimeboxes.tsx 接线**（244-245）：

```tsx
            <ArchetypePicker value={draft.activityArchetypeId}
              onChange={id => update({ activityArchetypeId: id })}
              enableAiMatch
              title={draft.title} />
```

- [ ] **Step 5: 验证 + Commit**

Run: vitest 两文件 → PASS；`npx vitest run`（全量）base/head 零新增失败；`npx tsc --noEmit` 零新增。

```bash
git add frontend/src/domains/timebox/cnui/surfaces/CreateTimebox.tsx \
  frontend/src/domains/timebox/cnui/surfaces/EditTimeboxes.tsx \
  frontend/src/domains/timebox/cnui/surfaces/__tests__/create-timebox.test.tsx \
  frontend/src/domains/timebox/cnui/surfaces/__tests__/edit-timeboxes.test.tsx
git commit -m "feat(023.11): 两个 CNUI surface 接线 ArchetypePicker enableAiMatch/title

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## 收尾（全部 10 任务完成后）

- **CHANGELOG**：补 `[023.11]` 条目（schema 变更 + 功能）。
- **`/browse` 视觉验证**（用户 opt-in）：editTimeboxes 三修复；createTimebox 被动推断；两表单「AI 匹配」按钮；archetype 配置页 synonyms 输入。
- **prod 部署**：`./prod.sh --migrate`（应用 0034）+ 跑 `seedArchetypes`/seed-prod.ts 升级既有系统条目 synonyms。
- **finishing-a-development-branch → /review → /ship**。

---

## 验收对照（spec → task）

| spec 验收项 | 任务 |
|---|---|
| F1 manifest 改名 | T1 |
| F2 双重标题去重 | T1 |
| F3 编辑页回填 | T2 |
| F6 synonyms 列 + 迁移 + journal | T3 |
| F7 seed 全填 + 升级路径 | T4 |
| F8 配置 UI 编辑 synonyms | T5 |
| F4 createTimebox 被动推断 | T9 |
| F5 主动按钮（两 surface） | T6+T7+T8+T10 |
| F9 matcher 规则命中 synonyms | T6 |
| F10 LLM 位置匹配（Issue 1） | T6 |
| Tier-2 docs 同步 | T3 |
| 质量：vitest 零新增 / tsc 零新增 / validate:manifest 0 errors | 全任务 |
