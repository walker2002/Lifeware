# OKR 工作台改进 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 OKR 周期管理从目标表单内重构为左侧目录「周期→目标」二级树，新增 KR 信心字段，统一卡片样式，并改进 habits 卡片单击编辑交互。

**Architecture:** 四阶段递进 —— G2 KR 信心字段（schema/USOM/UI）→ G3 样式统一（滚动/边框）→ G4 habits 卡片交互 → G1 周期管理重构（最重）。每阶段独立可测、独立提交。KR 信心复用现有 `updateKR→updateKeyResult→KeyResultRepository.updateFields` 通用 FactField 写通道；周期删除新增 `deleteCycle` server action。

**Tech Stack:** Next.js 16 / React 19 / TypeScript 5 / Drizzle ORM 0.45 / PostgreSQL / vitest / shadcn Sheet

## Global Constraints

- **测试**：`cd frontend && npx vitest run <path>`（vitest 不做 TS 类型检查）；类型用 `npx tsc --noEmit` 双验证。必须在 `frontend/` 目录跑（`@/` 映射）。
- **迁移**：一律手写 SQL + `psql` + 登记 `_journal.json` + 补 `drizzle.__drizzle_migrations` hash（`drizzle-kit migrate` 跑不通）。DB = `lifeware_dev@localhost:5432`。
- **Tier2 文档同步强制**：USOM/DB 变更先更新 `docs/` 再改代码。
- **颜色令牌**：只用 CSS 变量令牌（`bg-canvas`/`text-ink`/`border-hairline`/`bg-muted` 等），禁止 Tailwind 默认颜色类。
- **零回归**：现有 okrs 21 测试、habits 基线零新增失败；`tsc` 零新增错误。
- **跨域隔离**：OKR domain 不 import tasks/habits 内部模块。
- **写入口**：所有数据写走 FieldExecutor/mutation-service/orchestrator（KR 信心走 `updateKeyResult` server action）。
- **文件头**：每个新建/修改的 TS/JS 文件必须有 `/** @file ... @brief ... */` 简体中文文件头。
- **提交**：分支 `feat/024-okr-improvements`，commit 消息末尾加 `Co-Authored-By: Claude <noreply@anthropic.com>`。

---

## File Structure

**新建：**
- `frontend/src/lib/db/migrations/0021_add_key_results_confidence.sql` — KR 信心列
- `frontend/src/domains/okrs/components/cycle-create-drawer.tsx` — 右侧抽屉新建周期
- `frontend/src/domains/okrs/components/okr-directory-item-menu.tsx` — 周期/目标 hover ⋯ 菜单（或并入 directory）
- 测试文件若干（见各 task）

**修改：**
- `frontend/src/lib/db/schema.ts` — key_results 加 confidence 列
- `frontend/src/usom/types/objects.ts` — KeyResult 接口加 confidence
- `frontend/src/lib/db/repositories/mappers.ts` — KR mapper 双向映射 confidence
- `frontend/scripts/seed-dev.ts` — KR seed 补 confidence
- `frontend/src/domains/okrs/manifest.yaml` — field_metadata 加 confidence
- `frontend/src/domains/okrs/components/kr-progress.tsx` — 信心显示+编辑
- `frontend/src/domains/okrs/components/okr-form.tsx` — 移除周期字段 + KR 信心输入 + presetCycleId
- `frontend/src/domains/okrs/components/okr-directory.tsx` — 重构为周期-目标二级树
- `frontend/src/domains/okrs/components/okr-workspace.tsx` — 抽屉/添加目标/删除周期 wiring
- `frontend/src/domains/okrs/components/okr-panel.tsx` — 透传 presetCycleId
- `frontend/src/domains/habits/components/habit-card.tsx` — 边框/底色/hover/单击编辑
- `frontend/src/hooks/use-okrs.ts` — 加 deleteCycle
- `frontend/src/app/actions/okr.ts` — 加 deleteCycle server action
- `docs/database-design.md` — key_results 加 confidence

---

## Phase 1 — G2: KR 信心字段

### Task 1: 文档同步 + Schema migration 0021（Tier2 先行）

**Files:**
- Modify: `docs/database-design.md`（key_results 表字段清单）
- Create: `frontend/src/lib/db/migrations/0021_add_key_results_confidence.sql`
- Modify: `frontend/src/lib/db/migrations/meta/_journal.json`（追加 idx 21 条目）

**Interfaces:**
- Produces: DB 列 `key_results.confidence integer NOT NULL DEFAULT 50 CHECK (0~100)`

- [ ] **Step 1: 更新 docs/database-design.md**

在 key_results 表字段清单中，`progressRate` 之后补：

```
| confidence | integer | NOT NULL | DEFAULT 50 | KR 达成信心度（0-100 百分比），选填，默认 50 |
```
并补 CHECK 约束说明：`CHECK (confidence BETWEEN 0 AND 100)`。

- [ ] **Step 2: 写迁移 SQL**

创建 `frontend/src/lib/db/migrations/0021_add_key_results_confidence.sql`：

```sql
-- [024] KeyResult 增加 confidence 字段（达成信心度，0-100 百分比，默认 50）
ALTER TABLE key_results
  ADD COLUMN IF NOT EXISTS confidence integer NOT NULL DEFAULT 50;

ALTER TABLE key_results
  ADD CONSTRAINT check_key_results_confidence_range
  CHECK (confidence BETWEEN 0 AND 100);
```

- [ ] **Step 3: 登记 journal**

在 `meta/_journal.json` 的 `entries` 数组末尾追加（idx 递增，参考现有 0020 条目格式）：

```json
{
  "idx": 21,
  "version": "7",
  "when": 1780900000000,
  "tag": "0021_add_key_results_confidence",
  "breakpoints": true
}
```

- [ ] **Step 4: 执行迁移 + 登记 drizzle hash**

```bash
cd frontend
psql "postgresql://lifeware_dev@localhost:5432/lifeware_dev" -f src/lib/db/migrations/0021_add_key_results_confidence.sql
# 计算 hash（drizzle 用 SHA256(SQL 文件内容).hex()）并登记：
# node -e "const c=require('fs').readFileSync('src/lib/db/migrations/0021_add_key_results_confidence.sql');console.log(require('crypto').createHash('sha256').update(c).digest('hex'))"
# 然后 INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('<hash>', <when>);
```
验证：`psql ... -c "\d key_results"` 看到 confidence 列 + check 约束。

- [ ] **Step 5: Commit**

```bash
git add docs/database-design.md frontend/src/lib/db/migrations/0021_add_key_results_confidence.sql frontend/src/lib/db/migrations/meta/_journal.json
git commit -m "feat(db): [024] G2 migration 0021 — key_results.confidence 字段(0-100,默认50)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: Schema.ts + USOM 类型 + mapper 双向映射

**Files:**
- Modify: `frontend/src/lib/db/schema.ts:120-148`（keyResults 表定义）
- Modify: `frontend/src/usom/types/objects.ts:228-247`（KeyResult 接口）
- Modify: `frontend/src/lib/db/repositories/mappers.ts`（keyResultRowToUSOM / keyResultUSOMToRow）
- Test: `frontend/src/lib/db/repositories/__tests__/mappers.test.ts`（若无则新建并遵循现有命名）

**Interfaces:**
- Consumes: Task 1 的 DB confidence 列
- Produces: `KeyResult.confidence: number`；mapper 读写 confidence

- [ ] **Step 1: 写失败测试（mapper round-trip 含 confidence）**

在 mappers 测试中加（或新建）：

```ts
import { keyResultRowToUSOM, keyResultUSOMToRow } from '../mappers'

describe('[024] KeyResult mapper confidence', () => {
  it('row→USOM 应映射 confidence', () => {
    const row = { /* 现有 KR row 字段 + */ confidence: 80 }
    const u = keyResultRowToUSOM(row as any)
    expect(u.confidence).toBe(80)
  })
  it('USOM→row 应写入 confidence', () => {
    const u = { /* 现有 KR 字段 + */ confidence: 30 } as any
    const r = keyResultUSOMToRow(u, 'user-1')
    expect(r.confidence).toBe(30)
  })
  it('confidence 缺省时默认 50', () => {
    const row = { /* 无 confidence */ } as any
    expect(keyResultRowToUSOM(row).confidence).toBe(50)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

`cd frontend && npx vitest run src/lib/db/repositories/__tests__/mappers.test.ts`
Expected: FAIL（confidence 未定义）

- [ ] **Step 3: schema.ts 加列**

在 `keyResults` 表定义中，`progressRate` 之后、`dueDate` 之前加：

```ts
  confidence: integer('confidence').notNull().default(50),
```
并在表约束数组中加 check：

```ts
  check('check_key_results_confidence_range', sql`${table.confidence} BETWEEN 0 AND 100`),
```

- [ ] **Step 4: USOM 类型加字段**

`objects.ts` KeyResult 接口中，`progressRate: number` 之后加：

```ts
  /** [024] 达成信心度（0-100 百分比），选填，默认 50 */
  confidence: number
```

- [ ] **Step 5: mapper 双向映射**

`mappers.ts` 的 `keyResultRowToUSOM`：在产物对象中加 `confidence: (row as any).confidence ?? 50`。
`keyResultUSOMToRow`：在产物对象中加 `confidence: kr.confidence ?? 50`。

- [ ] **Step 6: 跑测试确认通过**

`npx vitest run src/lib/db/repositories/__tests__/mappers.test.ts` → PASS
`npx tsc --noEmit` → 零新增错误

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/db/schema.ts frontend/src/usom/types/objects.ts frontend/src/lib/db/repositories/mappers.ts frontend/src/lib/db/repositories/__tests__/mappers.test.ts
git commit -m "feat(usom): [024] G2 KeyResult.confidence 类型+mapper 双向映射

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: seed-dev + manifest field_metadata 同步

**Files:**
- Modify: `frontend/scripts/seed-dev.ts:205-230`（KR upsert 补 confidence）
- Modify: `frontend/src/domains/okrs/manifest.yaml`（field_metadata 加 confidence）

- [ ] **Step 1: seed-dev KR 补 confidence**

在 `scripts/seed-dev.ts` 的 4 个 `upsert(s.keyResults, {...})` 调用中，每个对象补 `confidence: 60`（或按 KR 语义给不同值，如 50/70/60/40）。

- [ ] **Step 2: manifest field_metadata 加 confidence**

`manifest.yaml` `field_metadata:` 区块，在 `progressRate` 之后加：

```yaml
  confidence: { type: number, mutation_mode: FactField }
```

- [ ] **Step 3: 跑 seed + 结构校验**

```bash
cd frontend
npm run seed:dev   # 或 npx tsx scripts/seed-dev.ts（确认脚本名）
npx tsx scripts/validate-domain-structure.ts
```
Expected: seed 成功（KR 落库含 confidence）；结构校验通过。

- [ ] **Step 4: Commit**

```bash
git add frontend/scripts/seed-dev.ts frontend/src/domains/okrs/manifest.yaml
git commit -m "chore(okrs): [024] G2 seed+manifest 同步 confidence 字段

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: KRProgress UI 显示 + 编辑信心

**Files:**
- Modify: `frontend/src/domains/okrs/components/kr-progress.tsx`
- Test: `frontend/src/domains/okrs/components/__tests__/kr-progress.test.tsx`（若无则新建）

**Interfaces:**
- Consumes: `KeyResult.confidence`（Task 2）
- Produces: `KRProgress` 新增可选 prop `onConfidenceUpdate?: (krId: string, confidence: number) => Promise<KeyResult | null>`

- [ ] **Step 1: 写失败测试**

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { KRProgress } from '../kr-progress'

describe('[024] KRProgress 信心', () => {
  const kr = { id: 'kr1', title: 'KR1', targetValue: 100, currentValue: 40, unit: '%', confidence: 70, status: 'active', progressRate: 0.4, objectiveId: 'o1', createdAt: '', updatedAt: '' } as any

  it('显示信心百分比', () => {
    render(<KRProgress kr={kr} />)
    expect(screen.getByText(/70%/)).toBeInTheDocument()
  })

  it('editable 时点击进入信心编辑', () => {
    render(<KRProgress kr={kr} editable onConfidenceUpdate={jest.fn()} />)
    fireEvent.click(screen.getByText('更新信心'))
    expect(screen.getByDisplayValue('70')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

`npx vitest run src/domains/okrs/components/__tests__/kr-progress.test.tsx` → FAIL

- [ ] **Step 3: 实现 KRProgress 信心 UI**

在 `kr-progress.tsx` 的进度条区块下方、`{isEditing ? ... : ...}` currentValue 编辑行之后，追加信心行（复用 isEditing 模式，新增 `isEditingConfidence` state）：

```tsx
{/* [024] 信心度行 */}
<div className="flex items-center gap-2 text-xs text-muted-foreground">
  <span className="shrink-0">信心</span>
  {isEditingConfidence ? (
    <>
      <Input type="number" value={confidenceInput} min={0} max={100}
        onChange={e => setConfidenceInput(e.target.value)}
        className="w-16 h-7 text-xs"
        onKeyDown={e => e.key === "Enter" && handleSubmitConfidence()} />
      <span>%</span>
      <Button size="sm" variant="ghost" onClick={handleSubmitConfidence} disabled={isUpdatingConfidence} className="h-7 text-xs">
        {isUpdatingConfidence ? "..." : "确认"}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setIsEditingConfidence(false)} className="h-7 text-xs">取消</Button>
    </>
  ) : (
    <>
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden max-w-[120px]">
        <div className="h-full rounded-full bg-primary/60" style={{ width: `${kr.confidence}%` }} />
      </div>
      <span className="font-mono w-10 text-right">{kr.confidence}%</span>
      {editable && kr.status === "active" && onConfidenceUpdate && (
        <Button size="sm" variant="link" className="h-auto p-0 text-xs"
          onClick={() => { setConfidenceInput(String(kr.confidence)); setIsEditingConfidence(true) }}>
          更新信心
        </Button>
      )}
    </>
  )}
</div>
```

新增 state：`const [isEditingConfidence, setIsEditingConfidence] = useState(false)`、`const [confidenceInput, setConfidenceInput] = useState(String(kr.confidence))`、`const [isUpdatingConfidence, setIsUpdatingConfidence] = useState(false)`。

新增 handler：

```tsx
const handleSubmitConfidence = async () => {
  const val = Number(confidenceInput)
  if (isNaN(val) || val < 0 || val > 100) return
  setIsUpdatingConfidence(true)
  await onConfidenceUpdate?.(kr.id, val)
  setIsUpdatingConfidence(false)
  setIsEditingConfidence(false)
}
```

props 接口加 `onConfidenceUpdate?: (krId: string, confidence: number) => Promise<KeyResult | null>`。

- [ ] **Step 4: 跑测试确认通过 + tsc**

`npx vitest run src/domains/okrs/components/__tests__/kr-progress.test.tsx` → PASS
`npx tsc --noEmit` → 零新增

- [ ] **Step 5: Commit**

```bash
git add frontend/src/domains/okrs/components/kr-progress.tsx frontend/src/domains/okrs/components/__tests__/kr-progress.test.tsx
git commit -m "feat(okrs): [024] G2 KRProgress 信心度显示+inline 编辑

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: OKRPanel 接线信心回调 + OKRForm KR 行信心输入

**Files:**
- Modify: `frontend/src/domains/okrs/components/okr-panel.tsx`（透传 onConfidenceUpdate）
- Modify: `frontend/src/domains/okrs/components/okr-form.tsx`（KR 行加信心输入）
- Modify: `frontend/src/domains/okrs/components/okr-workspace.tsx`（传入 onConfidenceUpdate）
- Test: 复用 kr-progress 测试 + 手动验证 OKRForm

**Interfaces:**
- Consumes: `useOKRs.updateKR(id, {confidence})`（已有通用通道）
- Produces: OKRForm KR 行可填信心（留空=50）；OKRPanel create/edit 透传

- [ ] **Step 1: OKRWorkspace 传入 onConfidenceUpdate**

在 `okr-workspace.tsx` 的 `<OKRPanel ...>` 加：

```tsx
onConfidenceUpdate={selectedId ? (krId, v) => hook.updateKR(krId, { confidence: v }) : undefined}
```

- [ ] **Step 2: OKRPanel 接口 + 透传**

`OKRPanelProps` 加 `onConfidenceUpdate?: (krId: string, confidence: number) => Promise<KeyResult | null>`，解构接收，传给 `<KRProgress ... onConfidenceUpdate={onConfidenceUpdate} />`。

- [ ] **Step 3: OKRForm KR 行加信心输入**

`OKRFormFields.keyResults` 项类型加可选 `confidence?: number`。
KR state 初始值不变（不显示信心），但每个 KR 行在「目标值/单位」行下方加信心输入：

```tsx
<div className="flex items-center gap-2">
  <Label className="text-xs text-muted-foreground shrink-0">信心</Label>
  <Input type="number" min={0} max={100} value={kr.confidence ?? ''}
    onChange={e => updateKR(i, "confidence", e.target.value === '' ? undefined : Number(e.target.value))}
    placeholder="50" className="w-16 h-7 text-xs" />
  <span className="text-xs text-muted-foreground">%</span>
</div>
```

`handleSubmit` 提交时：`keyResults: keyResults.filter(...).map(kr => ({ ...kr, confidence: kr.confidence ?? 50 }))`。

- [ ] **Step 4: 跑回归 + tsc**

`npx vitest run src/domains/okrs` → 现有 21 测试零新增失败
`npx tsc --noEmit` → 零新增

- [ ] **Step 5: Commit**

```bash
git add frontend/src/domains/okrs/components/okr-panel.tsx frontend/src/domains/okrs/components/okr-form.tsx frontend/src/domains/okrs/components/okr-workspace.tsx
git commit -m "feat(okrs): [024] G2 OKRForm KR 信心输入 + Panel/Workspace 接线

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Phase 2 — G3: 样式统一

### Task 6: 左侧目录独立滚动 + 细滚动条

**Files:**
- Modify: `frontend/src/domains/okrs/components/okr-workspace.tsx:176-191`（左侧容器）
- Modify: `frontend/src/app/globals.css`（或现有滚动条样式文件，加 scrollbar-thin 工具类）

- [ ] **Step 1: 左侧容器加 min-h-0 + 细滚动条类**

`okr-workspace.tsx` 左侧 div 改为：

```tsx
<div
  className="shrink-0 overflow-y-auto min-h-0 lw-scrollbar-thin"
  style={{ width: leftWidth }}
>
```
（`min-h-0` 让 overflow-y-auto 在 flex 容器内真正生效；`lw-scrollbar-thin` 为自定义细滚动条。）

- [ ] **Step 2: 定义 lw-scrollbar-thin 工具类**

在 globals.css 追加（用令牌色，禁止 Tailwind 默认色）：

```css
.lw-scrollbar-thin {
  scrollbar-width: thin;
  scrollbar-color: var(--hairline) transparent;
}
.lw-scrollbar-thin::-webkit-scrollbar { width: 6px; height: 6px; }
.lw-scrollbar-thin::-webkit-scrollbar-thumb {
  background: var(--hairline);
  border-radius: 3px;
}
.lw-scrollbar-thin::-webkit-scrollbar-thumb:hover { background: var(--muted-foreground); }
.lw-scrollbar-thin::-webkit-scrollbar-track { background: transparent; }
```
（确认 `--hairline` / `--muted-foreground` 变量在 :root 已定义；若变量名不同，对齐现有令牌。）

- [ ] **Step 3: 手动验证**

`npm run dev`，打开 `/okrs`，左侧目录内容超出时独立滚动、滚动条细且浅色，不带动右侧/整页。

- [ ] **Step 4: Commit**

```bash
git add frontend/src/domains/okrs/components/okr-workspace.tsx frontend/src/app/globals.css
git commit -m "style(okrs): [024] G3 左侧目录独立滚动 + 细滚动条

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: KR Card 浅色边框

**Files:**
- Modify: `frontend/src/domains/okrs/components/okr-panel.tsx:231-256`（KR 的 `<Card>` 局部加 border-hairline）

- [ ] **Step 1: KR Card 加 border-hairline**

`okr-panel.tsx` 中 KR 渲染的 `<Card key={kr.id}>` 改为：

```tsx
<Card key={kr.id} className="border-hairline">
```
（不改 Card 组件本体；isAddingKR 的临时 Card 同样加 `border-hairline`。）

- [ ] **Step 2: 手动验证**

`npm run dev` → `/okrs` → 选目标 → KR 卡片边框变浅。

- [ ] **Step 3: 跑回归**

`npx vitest run src/domains/okrs` → 零新增失败

- [ ] **Step 4: Commit**

```bash
git add frontend/src/domains/okrs/components/okr-panel.tsx
git commit -m "style(okrs): [024] G3 KR 卡片浅色边框 border-hairline

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Phase 3 — G4: habits 卡片交互

### Task 8: HabitCard 边框/底色/hover/单击编辑

**Files:**
- Modify: `frontend/src/domains/habits/components/habit-card.tsx`
- Test: `frontend/src/domains/habits/components/__tests__/habit-card.test.tsx`（若无则新建）

**Interfaces:**
- Consumes: 现有 `onEdit` / `onSelectToggle` props
- Produces: 整卡 onClick=onEdit（非批量选择模式）；批量选择模式 onClick=onSelectToggle

- [ ] **Step 1: 写失败测试**

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { HabitCard } from '../habit-card'

const base = { title: '阅读', trackable: true, defaultTime: '09:00', earliestTime: '08:00', latestStartTime: '10:00', defaultDuration: 30, minDuration: 15, streak: 0 } as any

describe('[024] HabitCard 单击编辑', () => {
  it('非批量模式整卡单击触发 onEdit', () => {
    const onEdit = jest.fn()
    render(<HabitCard {...base} onEdit={onEdit} />)
    fireEvent.click(screen.getByText('阅读'))
    expect(onEdit).toHaveBeenCalled()
  })
  it('批量模式单击触发 onSelectToggle 而非 onEdit', () => {
    const onEdit = jest.fn(); const onSelectToggle = jest.fn()
    render(<HabitCard {...base} selectable onEdit={onEdit} onSelectToggle={onSelectToggle} />)
    fireEvent.click(screen.getByText('阅读'))
    expect(onSelectToggle).toHaveBeenCalled()
    expect(onEdit).not.toHaveBeenCalled()
  })
  it('点操作按钮不触发 onEdit', () => {
    const onEdit = jest.fn(); const onLog = jest.fn()
    render(<HabitCard {...base} status="active" onEdit={onEdit} onLog={onLog} />)
    fireEvent.click(screen.getByText('打卡'))
    expect(onLog).toHaveBeenCalled()
    expect(onEdit).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

`npx vitest run src/domains/habits/components/__tests__/habit-card.test.tsx` → FAIL

- [ ] **Step 3: 实现**

`habit-card.tsx`：
- `<Card>` className 追加 `border-hairline bg-canvas hover:bg-muted/50 transition-colors cursor-pointer`。
- `<Card onClick={() => selectable ? onSelectToggle?.() : onEdit?.()}>`（整卡单击）。
- 移除操作按钮区的显式「编辑」按钮（`{onEdit && <Button>编辑</Button>}` 整块删除）。
- 所有保留的操作按钮（打卡/暂停/激活/删除/恢复/归档）的 `onClick` 包 `e => { e.stopPropagation(); 原handler() }`。
- `<CardContent>` 顶部批量复选框的 `onClick` 已有 `stopPropagation`，保留。

- [ ] **Step 4: 跑测试 + 回归**

`npx vitest run src/domains/habits` → 新测试 PASS + 现有 habits 测试零新增失败
`npx tsc --noEmit` → 零新增

- [ ] **Step 5: 手动验证**

`npm run dev` → `/habits` → 卡片边框浅、底色浅、hover 变深、单击进编辑、点打卡不进编辑、批量选择模式单击=选中。

- [ ] **Step 6: Commit**

```bash
git add frontend/src/domains/habits/components/habit-card.tsx frontend/src/domains/habits/components/__tests__/habit-card.test.tsx
git commit -m "feat(habits): [024] G4 卡片单击编辑+hover+浅边框/底色

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Phase 4 — G1: 周期管理重构

### Task 9: deleteCycle server action + useOKRs.deleteCycle

**Files:**
- Modify: `frontend/src/app/actions/okr.ts`（加 deleteCycle）
- Modify: `frontend/src/hooks/use-okrs.ts`（加 deleteCycle + 接口）
- Test: `frontend/src/app/actions/__tests__/okr.test.ts`（若无则新建，含集成测试用真实 PG）

**Interfaces:**
- Produces: `deleteCycle(cycleId): Promise<OKRActionResult<void>>`；周期下有目标时返回 `{success:false, error}`

- [ ] **Step 1: 写失败测试（集成，真实 PG）**

```ts
import { deleteCycle, createCycle } from '../okr'
import { getObjectives } from '../okr'

describe('[024] deleteCycle', () => {
  it('空周期可删', async () => {
    const c = await createCycle({ id: crypto.randomUUID(), cycleType: 'quarterly', name: 'test-del', period: { start: '2026-07-01', end: '2026-09-30' }, status: 'in_progress', createdAt: '', updatedAt: '' } as any)
    const r = await deleteCycle(c.data!.id)
    expect(r.success).toBe(true)
  })
  it('有目标的周期拒绝删除', async () => {
    // 用 seed 已存在的、挂了目标的周期（参考 seed-dev.ts 的 CYCLE_ID）
    const r = await deleteCycle('90000000-0000-0000-0000-000000000001')
    expect(r.success).toBe(false)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

`npx vitest run src/app/actions/__tests__/okr.test.ts` → FAIL（deleteCycle 未定义）

- [ ] **Step 3: 实现 server action**

`okr.ts` 加（参考现有 createCycle 风格，注意写入口登记）：

```ts
/**
 * 删除周期。仅当周期下无目标时可删；有目标返回错误。
 */
export async function deleteCycle(cycleId: string): Promise<OKRActionResult<void>> {
  try {
    const cycleRepo = new CycleRepository();
    const objRepo = new ObjectiveRepository();
    const objs = await objRepo.findByCycleId(cycleId, MVP_USER_ID);  // 需确认该方法名
    if (objs.length > 0) {
      return { success: false, error: "周期下仍有目标，请先处理后再删除" };
    }
    await cycleRepo.delete(cycleId, MVP_USER_ID);  // 需在 CycleRepository 加 delete 方法
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "删除周期失败" };
  }
}
```

> 实现注意：若 `ObjectiveRepository` 无 `findByCycleId`、`CycleRepository` 无 `delete`，本 task 一并补上（Repository Pattern，遵循现有 repo 文件风格，加文件头注释）。

- [ ] **Step 4: useOKRs 加 deleteCycle**

`use-okrs.ts` 接口加 `deleteCycle: (cycleId: string) => Promise<boolean>`，实现：

```ts
const deleteCycle_ = useCallback(async (cycleId: string): Promise<boolean> => {
  const result = await deleteCycleAction(cycleId)
  if (result.success) {
    setCycles(prev => prev.filter(c => c.id !== cycleId))
  }
  return result.success
}, [])
```
return 块加 `deleteCycle: deleteCycle_`。import `deleteCycle as deleteCycleAction`。

- [ ] **Step 5: 跑测试 + tsc**

`npx vitest run src/app/actions/__tests__/okr.test.ts` → PASS
`npx tsc --noEmit` → 零新增

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/actions/okr.ts frontend/src/hooks/use-okrs.ts frontend/src/app/actions/__tests__/okr.test.ts
git commit -m "feat(okrs): [024] G1 deleteCycle server action（空周期可删，有目标拒绝）

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 10: CycleCreateDrawer 抽屉组件

**Files:**
- Create: `frontend/src/domains/okrs/components/cycle-create-drawer.tsx`
- Test: `frontend/src/domains/okrs/components/__tests__/cycle-create-drawer.test.tsx`

**Interfaces:**
- Consumes: `onCreateCycle: (cycle: Cycle) => Promise<Cycle>`（来自 useOKRs）
- Produces: `<CycleCreateDrawer open onOpenChange onCreateCycle isLoading />`

- [ ] **Step 1: 写失败测试**

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CycleCreateDrawer } from '../cycle-create-drawer'

describe('[024] CycleCreateDrawer', () => {
  it('提交调用 onCreateCycle 并关闭', async () => {
    const onCreateCycle = jest.fn().mockResolvedValue({ id: 'c1' })
    const onOpenChange = jest.fn()
    render(<CycleCreateDrawer open onOpenChange={onOpenChange} onCreateCycle={onCreateCycle} />)
    fireEvent.change(screen.getByPlaceholderText('例如：2026 Q3'), { target: { value: '2026 Q3' } })
    fireEvent.click(screen.getByText('创建周期'))
    await waitFor(() => expect(onCreateCycle).toHaveBeenCalled())
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

`npx vitest run src/domains/okrs/components/__tests__/cycle-create-drawer.test.tsx` → FAIL

- [ ] **Step 3: 实现组件**

创建 `cycle-create-drawer.tsx`（文件头注释 + 从 okr-form.tsx 迁移原内联新建周期字段：周期类型/名称/起止日期）：

```tsx
/**
 * @file cycle-create-drawer
 * @brief 新建周期右侧抽屉（[024] 从 OKRForm 内联表单迁出）
 */
"use client"
import { useState } from "react"
import { Loader2 } from "lucide-react"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { Cycle } from "@/usom/types/objects"
import type { USOM_ID } from "@/usom/types/primitives"

interface CycleCreateDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreateCycle: (cycle: Cycle) => Promise<Cycle>
  isLoading?: boolean
}

export function CycleCreateDrawer({ open, onOpenChange, onCreateCycle, isLoading }: CycleCreateDrawerProps) {
  const [cycleType, setCycleType] = useState<Cycle['cycleType']>("quarterly")
  const [name, setName] = useState("")
  const [start, setStart] = useState("")
  const [end, setEnd] = useState("")
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    setError(null)
    const now = new Date()
    const s = start || now.toISOString().slice(0, 10)
    const e = end || (() => { const d = new Date(now); d.setMonth(d.getMonth() + 3); return d.toISOString().slice(0, 10) })()
    try {
      const cycle: Cycle = {
        id: crypto.randomUUID() as USOM_ID,
        cycleType, name: name || `${s}~${e}`,
        period: { start: s as any, end: e as any },
        status: 'in_progress',
        createdAt: now.toISOString() as any, updatedAt: now.toISOString() as any,
      }
      await onCreateCycle(cycle)
      setName(""); setStart(""); setEnd("")
      onOpenChange(false)
    } catch {
      setError("创建周期失败，请重试")
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[400px] sm:max-w-[400px]">
        <SheetHeader><SheetTitle>新建 OKR 周期</SheetTitle></SheetHeader>
        <div className="space-y-4 p-4">
          {error && <p className="text-sm text-destructive">{error}</p>}
          {/* 周期类型 / 名称 / 起止日期 —— 沿用 okr-form.tsx 原内联表单字段（select + Input + 两个 date Input） */}
          {/* ...字段实现同 okr-form.tsx 第 362-392 行的 newCycle 区块... */}
        </div>
        <SheetFooter>
          <Button onClick={handleSubmit} disabled={isLoading}>
            {isLoading && <Loader2 className="size-4 animate-spin mr-1" />}创建周期
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
```

> 字段实现：把 `okr-form.tsx` 第 362-392 行的周期类型 select / 周期名称 Input / 起止日期两个 Input 原样迁入（绑定到本组件的 cycleType/name/start/end state），不要留省略号。

- [ ] **Step 4: 跑测试 + tsc**

`npx vitest run src/domains/okrs/components/__tests__/cycle-create-drawer.test.tsx` → PASS
`npx tsc --noEmit` → 零新增

- [ ] **Step 5: Commit**

```bash
git add frontend/src/domains/okrs/components/cycle-create-drawer.tsx frontend/src/domains/okrs/components/__tests__/cycle-create-drawer.test.tsx
git commit -m "feat(okrs): [024] G1 CycleCreateDrawer 右侧抽屉新建周期

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 11: OKRForm 移除周期字段 + presetCycleId

**Files:**
- Modify: `frontend/src/domains/okrs/components/okr-form.tsx`
- Modify: `frontend/src/domains/okrs/components/okr-panel.tsx`（透传 presetCycleId）
- Test: 更新现有 okr-form 相关测试（若有断言周期字段则调整）

**Interfaces:**
- Consumes: `presetCycleId?: string`
- Produces: OKRForm 不再渲染周期区块；提交 cycleId 来自 presetCycleId

- [ ] **Step 1: OKRForm 接收 presetCycleId，移除周期区块**

`okr-form.tsx`：
- props 接口加 `presetCycleId?: string`，移除 `cycles / isLoadingCycles / onCreateCycle`。
- `cycleId` state 初始值改为 `initial?.cycleId ?? presetCycleId ?? ""`。
- **删除**第 323-394 行整个「Cycle 选择器 + 内联新建表单」区块。
- **删除** `showNewCycleForm / newCycleType / newCycleName / newCycleStart / newCycleEnd / isCreatingCycle / cyclesEmpty / handleCreateCycle` 相关 state 与函数。
- `validate()` 中 `if (!cycleId)` 保留（presetCycleId 模式下 cycleId 必有）。

- [ ] **Step 2: OKRPanel 透传 presetCycleId**

`OKRPanelProps` 加 `presetCycleId?: string`，create 模式 `<OKRForm presetCycleId={presetCycleId} ... />`，移除传给 OKRForm 的 `cycles/isLoadingCycles/onCreateCycle`。

- [ ] **Step 3: 跑回归 + tsc**

`npx vitest run src/domains/okrs` → 调整后零新增失败（若有测试断言"新建周期"按钮，更新或删除）
`npx tsc --noEmit` → 零新增

- [ ] **Step 4: Commit**

```bash
git add frontend/src/domains/okrs/components/okr-form.tsx frontend/src/domains/okrs/components/okr-panel.tsx
git commit -m "refactor(okrs): [024] G1 OKRForm 移除周期字段 + presetCycleId 模式

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 12: OKRDirectory 重构为周期-目标二级树 + ⋯ 菜单

**Files:**
- Modify: `frontend/src/domains/okrs/components/okr-directory.tsx`
- Test: `frontend/src/domains/okrs/components/__tests__/okr-directory.test.tsx`

**Interfaces:**
- Consumes: `cycles: Cycle[]`、`objectives: Objective[]`、新增回调
- Produces: 周期-目标二级树；周期 ⋯ [添加目标][删除周期]；目标 ⋯ 按状态动态

- [ ] **Step 1: 写失败测试**

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { OKRDirectory } from '../okr-directory'

const cycles = [{ id: 'c1', name: '2026 Q3', period: { start: '2026-07-01', end: '2026-09-30' } }] as any
const objectives = [{ id: 'o1', title: '提升质量', cycleId: 'c1', status: 'active', objectiveNumber: 'O1' }] as any

describe('[024] OKRDirectory 二级树', () => {
  it('按周期分组渲染目标', () => {
    render(<OKRDirectory cycles={cycles} objectives={objectives} statusFilter="all" onStatusFilterChange={() => {}} onSelect={() => {}} selectedId={null} />)
    expect(screen.getByText('2026 Q3')).toBeInTheDocument()
    expect(screen.getByText('提升质量')).toBeInTheDocument()
  })
  it('目标 active 状态 ⋯ 菜单含 暂停/完成/废弃', () => {
    const onChange = jest.fn()
    render(<OKRDirectory cycles={cycles} objectives={objectives} statusFilter="all" onStatusFilterChange={() => {}} onSelect={() => {}} selectedId={null} onChangeObjectiveStatus={onChange} />)
    // hover/点击目标行的 ⋯ 触发菜单
    fireEvent.click(screen.getAllByLabelText('目标操作')[0])
    expect(screen.getByText('暂停')).toBeInTheDocument()
    expect(screen.getByText('完成')).toBeInTheDocument()
    expect(screen.getByText('废弃')).toBeInTheDocument()
  })
  it('空周期显示且 ⋯ 含 添加目标/删除周期', () => {
    render(<OKRDirectory cycles={[...cycles, { id: 'c2', name: '2026 Q4', period: { start: '2026-10-01', end: '2026-12-31' } }] as any} objectives={objectives} statusFilter="all" onStatusFilterChange={() => {}} onSelect={() => {}} selectedId={null} onAddObjectiveToCycle={jest.fn()} onDeleteCycle={jest.fn()} />)
    fireEvent.click(screen.getAllByLabelText('周期操作')[1])
    expect(screen.getByText('添加目标')).toBeInTheDocument()
    expect(screen.getByText('删除周期')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

`npx vitest run src/domains/okrs/components/__tests__/okr-directory.test.tsx` → FAIL

- [ ] **Step 3: 重构 OKRDirectory**

- **移除** `getPeriodGroupKey` 及其派生分组逻辑。
- props 改为：`cycles: Cycle[]`、`objectives: Objective[]`、`selectedId`、`statusFilter`、`onStatusFilterChange`、`onSelect(id)`、`onCreateCycleClick()`、`onAddObjectiveToCycle(cycleId)`、`onDeleteCycle(cycleId)`、`onChangeObjectiveStatus(id, action)`、`onEdit?`。移除 `onCreate`（新建目标）。
- 顶部按钮区：`+新建` → `+OKR周期`，onClick=`onCreateCycleClick`。
- 用 `cycles` 渲染周期节点；`objectives.filter(o => o.cycleId === cycle.id)` 挂载；状态筛选过滤目标层。
- 周期节点：周期名 + `(N)` 目标数；右侧 `⋯`（`aria-label="周期操作"`）hover/click 出 `DropdownMenu`：`添加目标` / `删除周期`（该周期 objectives.length>0 时 disabled + title 提示）。
- 目标节点：单击 `onSelect`；右侧 `⋯`（`aria-label="目标操作"`）出菜单，按状态动态：
  ```ts
  const objectiveMenuItems = (status) => {
    switch (status) {
      case 'draft': return [{ action: 'discard', label: '废弃' }]
      case 'active': return [{ action: 'pause', label: '暂停' }, { action: 'complete', label: '完成' }, { action: 'discard', label: '废弃' }]
      case 'paused': return [{ action: 'resume', label: '恢复' }, { action: 'discard', label: '废弃' }]
      case 'completed':
      case 'discarded': return [{ action: 'archive', label: '归档' }]
      default: return []
    }
  }
  ```
  菜单项 onClick → `onChangeObjectiveStatus(obj.id, action)`。
- 空状态：cycles.length===0 显示「点击 [+OKR周期] 创建第一个周期」。

> 用 shadcn `DropdownMenu`（确认 `src/components/ui/dropdown-menu.tsx` 存在；若无则先 `npx shadcn add dropdown-menu`）。

- [ ] **Step 4: 跑测试 + tsc**

`npx vitest run src/domains/okrs/components/__tests__/okr-directory.test.tsx` → PASS
`npx tsc --noEmit` → 零新增

- [ ] **Step 5: Commit**

```bash
git add frontend/src/domains/okrs/components/okr-directory.tsx frontend/src/domains/okrs/components/__tests__/okr-directory.test.tsx
git commit -m "refactor(okrs): [024] G1 OKRDirectory 周期-目标二级树 + ⋯ 菜单

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 13: OKRWorkspace 全量 wiring

**Files:**
- Modify: `frontend/src/domains/okrs/components/okr-workspace.tsx`

**Interfaces:**
- Consumes: Task 9-12 全部产出
- Produces: 完整可用的工作台（抽屉/添加目标/删除周期/目标菜单）

- [ ] **Step 1: 新增 state**

```tsx
const [cycleDrawerOpen, setCycleDrawerOpen] = useState(false)
const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null)
const [deleteCycleTarget, setDeleteCycleTarget] = useState<string | null>(null)
```

- [ ] **Step 2: 添加目标 handler**

```tsx
const handleAddObjectiveToCycle = useCallback((cycleId: string) => {
  setSelectedCycleId(cycleId)
  setSelectedId(null)
  setDetailData(null)
  setMode("create")
}, [])
```
`handleSaveCreate` 中 `cycleId: fields.cycleId` 改为 `cycleId: fields.cycleId || selectedCycleId!`（presetCycleId 模式下 fields.cycleId 来自 presetCycleId）。保存后清 `selectedCycleId`。

- [ ] **Step 3: 删除周期 handler + 确认框**

```tsx
const handleConfirmDeleteCycle = async () => {
  if (!deleteCycleTarget) return
  const ok = await hook.deleteCycle(deleteCycleTarget)
  setDeleteCycleTarget(null)
  if (!ok) return  // 失败提示（前端已禁用，后端兜底）
}
```

- [ ] **Step 4: 替换 OKRDirectory 调用**

```tsx
<OKRDirectory
  cycles={hook.cycles}
  objectives={filteredObjectives}
  selectedId={selectedId}
  statusFilter={statusFilter}
  onStatusFilterChange={setStatusFilter}
  onSelect={handleSelect}
  onEdit={handleEdit}
  onCreateCycleClick={() => setCycleDrawerOpen(true)}
  onAddObjectiveToCycle={handleAddObjectiveToCycle}
  onDeleteCycle={(cycleId) => setDeleteCycleTarget(cycleId)}
  onChangeObjectiveStatus={handleStatusChange}
  onImport={() => setImportOpen(true)}
/>
```

- [ ] **Step 5: OKRPanel 传 presetCycleId**

```tsx
<OKRPanel
  ...
  presetCycleId={mode === "create" ? selectedCycleId ?? undefined : undefined}
  onConfidenceUpdate={selectedId ? (krId, v) => hook.updateKR(krId, { confidence: v }) : undefined}
  ...
/>
```

- [ ] **Step 6: 挂载抽屉 + 删除确认框**

在 `<OKRImportDialog .../>` 旁加：

```tsx
<CycleCreateDrawer
  open={cycleDrawerOpen}
  onOpenChange={setCycleDrawerOpen}
  onCreateCycle={hook.createCycle}
  isLoading={false}
/>
<AlertDialog open={!!deleteCycleTarget} onOpenChange={(o) => { if (!o) setDeleteCycleTarget(null) }}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>确认删除周期</AlertDialogTitle>
      <AlertDialogDescription>确定删除此周期吗？仅无目标的周期可删，操作不可撤销。</AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>取消</AlertDialogCancel>
      <AlertDialogAction onClick={handleConfirmDeleteCycle}>确认删除</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

- [ ] **Step 7: 跑回归 + tsc**

`npx vitest run src/domains/okrs` → 零新增失败
`npx tsc --noEmit` → 零新增

- [ ] **Step 8: Commit**

```bash
git add frontend/src/domains/okrs/components/okr-workspace.tsx
git commit -m "feat(okrs): [024] G1 OKRWorkspace wiring — 抽屉/添加目标/删除周期/目标菜单

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Phase 5 — 回归与验证

### Task 14: 全量回归 + /browse E2E

**Files:** 无（验证 task）

- [ ] **Step 1: 全量测试 + tsc**

```bash
cd frontend
npx vitest run          # 全套
npx tsc --noEmit
```
Expected: okrs 21 + habits 基线零新增失败；tsc 零新增错误。

- [ ] **Step 2: /browse E2E（真实 PG）**

`/browse` 打开 `/okrs`，验证：
1. 左侧为周期-目标二级树，顶部 `+OKR周期`
2. 点 `+OKR周期` → 右侧抽屉新建周期 → 新周期出现在左侧
3. 周期 ⋯ → 添加目标 → 右侧表单无周期字段 → 保存目标挂到该周期
4. 周期 ⋯ → 删除周期（空周期可删、有目标禁用）
5. 目标 ⋯ → 按状态出菜单（active: 暂停/完成/废弃）
6. KR 信心显示 + inline 编辑生效
7. KR 卡片浅色边框；左侧独立滚动
8. `/habits` → 卡片单击进编辑、hover 变深、点打卡不进编辑

- [ ] **Step 3: 同步 manifest.md（项目根）**

若 `docs/` 或 `mydocs/` 下文档有变更，按 CLAUDE.md 要求同步 `manifest.md`。

- [ ] **Step 4: 最终 commit（如有遗留 docs 变更）**

```bash
git add -A
git commit -m "test(okrs): [024] 全量回归 + E2E 验证通过

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Self-Review 记录

- **Spec 覆盖**：G1（Task 9-13）、G2（Task 1-5）、G3（Task 6-7）、G4（Task 8）全覆盖；Tier2 文档同步在 Task 1/3；回归在 Task 14。
- **占位符**：Task 10 drawer 字段、Task 12 菜单均标注「沿用现有代码原样迁入」并给出源行号，非空泛 TBD。
- **类型一致性**：`confidence: number`（USOM/schema/mapper/UI 一致）；`deleteCycle(cycleId): Promise<boolean>`（hook）与 server action `OKRActionResult<void>` 对齐；`presetCycleId?: string` 跨 OKRForm/OKRPanel/OKRWorkspace 一致；`onConfidenceUpdate(krId, confidence)` 跨 KRProgress/OKRPanel 一致。
