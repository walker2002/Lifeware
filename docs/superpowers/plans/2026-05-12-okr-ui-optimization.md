# OKR 界面优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成当前开发内容中的 4 项界面改进：OKR 模板完善、时间轴 0:00 起始、KR 编号、OKR 目录树状视图

**Architecture:** 纯前端改动，不涉及数据库 schema 或 USOM 类型变更。KR 编号采用运行时计算（Objective 编号 + 序号），无需持久化。

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS, shadcn/ui

---

## File Structure

| File | Action | Task | Responsibility |
|------|--------|------|---------------|
| `frontend/src/components/okr/okr-directory.tsx` | Modify | 1, 4 | 更新模板内容 + 重构为树状视图 |
| `frontend/src/components/timebox/timebox-timeline.tsx` | Modify | 2 | 时间轴范围改为 0:00~24:00 |
| `frontend/src/components/okr/kr-progress.tsx` | Modify | 3 | 新增 krNumber prop，显示 KR 编号 |
| `frontend/src/components/okr/okr-detail.tsx` | Modify | 3 | 传递计算后的 KR 编号 |
| `frontend/src/components/okr/okr-panel.tsx` | Modify | 3 | 传递计算后的 KR 编号 |

---

### Task 1: OKR 模板完善

**Files:**
- Modify: `frontend/src/components/okr/okr-directory.tsx` (lines 51-77, `downloadTemplate` 函数内的模板字符串)

- [ ] **Step 1: 更新模板字符串**

将 `downloadTemplate` 函数中的模板字符串替换为符合设计规格的版本。新模板包含 HTML 注释（字段填写提示）和两个 Objective 示例。

找到 `okr-directory.tsx` 第 51 行开始的 `const template = \`...` 字符串，替换整个模板内容：

```typescript
    const template = `# OKR 导入模板

> **字段说明**
> - **类型**: \`承诺型\`（完成型目标）| \`愿景型\`（挑战型目标）
> - **优先级**: \`P0\`（必须完成）| \`P1\`（应该完成，默认）| \`P2\`（有余力则做）
> - **周期类型**: \`周\` | \`月\` | \`季\` | \`半年\` | \`年\`
> - **周期格式**: \`<type>标识\` 或 \`起始日期 ~ 结束日期\`
>   - 年: \`2026\` 或 \`2026-01-01 ~ 2026-12-31\`
>   - 半年: \`2026-H1\` 或 \`2026-H2\`
>   - 季: \`2026-Q1\` ~ \`2026-Q4\`
>   - 月: \`2026-M01\` ~ \`2026-M12\`
>   - 周: \`2026-W01\` ~ \`2026-W52\`

---

## Objective: 提升产品质量
<!-- 类型: 承诺型 | 愿景型 -->
<!-- 优先级: P0 | P1 | P2 -->
- **类型**: 承诺型
- **优先级**: P1
- **周期类型**: 季
- **周期**: 2026-Q2 (2026-04-01 ~ 2026-06-30)
- **描述**: 通过系统化质量管理提升产品整体质量

### KR 1: 代码覆盖率提升至 85%
- **目标值**: 85
- **单位**: %
- **截止日期**: 2026-06-30

### KR 2: 客户满意度评分达到 4.5
- **目标值**: 4.5
- **单位**: 分
- **截止日期**: 2026-06-30

---

## Objective: 建立用户增长体系
<!-- 类型: 承诺型 | 愿景型 -->
<!-- 优先级: P0 | P1 | P2 -->
- **类型**: 愿景型
- **优先级**: P2
- **周期类型**: 季
- **周期**: 2026-Q2 (2026-04-01 ~ 2026-06-30)
- **描述**: 探索并建立可持续的用户增长机制

### KR 1: 月活用户达到 10000
- **目标值**: 10000
- **单位**: 人
- **截止日期**: 2026-06-30

---
`
```

注意：模板字符串内的反引号已用 `\`` 转义，确保生成正确的 Markdown 内联代码格式。

- [ ] **Step 2: 验证模板下载功能**

Run: `cd frontend && npm run lint`
Expected: 无新增 lint 错误

手动验证：启动 dev server（`npm run dev`），进入 OKR 页面，点击"模板"按钮下载 `okr-import-template.md`，打开确认内容包含两个 Objective 和 HTML 注释。

- [ ] **Step 3: 提交**

```bash
git add frontend/src/components/okr/okr-directory.tsx
git commit -m "feat(okr): 完善导入模板，添加字段注释和双 Objective 示例"
```

---

### Task 2: 时间轴从 0:00 开始

**Files:**
- Modify: `frontend/src/components/timebox/timebox-timeline.tsx` (lines 12-13)

- [ ] **Step 1: 修改时间轴范围常量**

将 `TIMELINE_START` 从 6 改为 0，`TIMELINE_END` 从 23 改为 24：

```typescript
// 修改前
const TIMELINE_START = 6   // 06:00
const TIMELINE_END = 23    // 23:00

// 修改后
const TIMELINE_START = 0   // 00:00
const TIMELINE_END = 24    // 24:00
```

仅修改这两个常量值，其他代码不变。`HOURS` 自动变为 24，所有基于百分比的位置计算（时间刻度线、当前时间指示线、时间盒色块）均使用 `(value - TIMELINE_START) / HOURS` 公式，无需额外调整。

- [ ] **Step 2: 验证时间轴显示**

Run: `cd frontend && npm run lint`
Expected: 无新增 lint 错误

手动验证：启动 dev server，进入"时间安排"页面，确认时间轴从 00:00 开始到 24:00 结束，时间盒色块位置正确。

- [ ] **Step 3: 提交**

```bash
git add frontend/src/components/timebox/timebox-timeline.tsx
git commit -m "fix(timebox): 时间轴从 0:00 开始显示，修复凌晨时间盒溢出问题"
```

---

### Task 3: KR 编号显示

**Files:**
- Modify: `frontend/src/components/okr/kr-progress.tsx` (interface + render)
- Modify: `frontend/src/components/okr/okr-detail.tsx` (line 220)
- Modify: `frontend/src/components/okr/okr-panel.tsx` (line 219)

KR 编号规则：`[所属Objective编号]-[K1/K2...]`，如 `26Q2-O1-K1`。编号在渲染时从 Objective 编号和 KR 序号计算，不存储到数据库。

- [ ] **Step 1: 给 KRProgress 添加 krNumber prop**

修改 `frontend/src/components/okr/kr-progress.tsx`：

在 `KRProgressProps` 接口中添加 `krNumber` 可选属性：

```typescript
interface KRProgressProps {
  kr: KeyResult
  krNumber?: string
  editable?: boolean
  onProgressUpdate?: (id: string, currentValue: number) => Promise<KeyResult | null>
}
```

更新组件函数的解构参数：

```typescript
export function KRProgress({ kr, krNumber, editable, onProgressUpdate }: KRProgressProps) {
```

修改标题渲染，在 `{kr.title}` 前显示编号：

```typescript
// 修改前
<span className="text-sm font-medium">{kr.title}</span>

// 修改后
<span className="text-sm font-medium">
  {krNumber && <span className="font-mono text-xs text-muted-foreground mr-1">{krNumber}</span>}
  {kr.title}
</span>
```

- [ ] **Step 2: 从 okr-detail.tsx 传递 KR 编号**

修改 `frontend/src/components/okr/okr-detail.tsx`，在第 220 行的 KR 列表渲染中添加 `index` 参数和 `krNumber` prop：

```typescript
// 修改前
{krs.filter(kr => kr.status !== "discarded" && kr.status !== "archived").map(kr => (
  <Card key={kr.id}>
    <CardContent className="pt-4 space-y-2">
      <KRProgress kr={kr} editable={obj.status === "active"} onProgressUpdate={onUpdateKRProgress} />

// 修改后
{krs.filter(kr => kr.status !== "discarded" && kr.status !== "archived").map((kr, index) => (
  <Card key={kr.id}>
    <CardContent className="pt-4 space-y-2">
      <KRProgress kr={kr} krNumber={obj.objectiveNumber ? `${obj.objectiveNumber}-K${index + 1}` : undefined} editable={obj.status === "active"} onProgressUpdate={onUpdateKRProgress} />
```

变更点：
1. `map(kr =>` → `map((kr, index) =>`
2. `<KRProgress kr={kr}` → `<KRProgress kr={kr} krNumber={obj.objectiveNumber ? \`${obj.objectiveNumber}-K${index + 1}\` : undefined}`

- [ ] **Step 3: 从 okr-panel.tsx 传递 KR 编号**

修改 `frontend/src/components/okr/okr-panel.tsx`，在第 219 行的 KR 列表渲染中做同样修改：

```typescript
// 修改前
{krs.filter(kr => kr.status !== "discarded" && kr.status !== "archived").map(kr => (
  <Card key={kr.id}>
    <CardContent className="pt-4 space-y-2">
      <KRProgress kr={kr} editable={obj.status === "active"} onProgressUpdate={onUpdateKRProgress} />

// 修改后
{krs.filter(kr => kr.status !== "discarded" && kr.status !== "archived").map((kr, index) => (
  <Card key={kr.id}>
    <CardContent className="pt-4 space-y-2">
      <KRProgress kr={kr} krNumber={obj.objectiveNumber ? `${obj.objectiveNumber}-K${index + 1}` : undefined} editable={obj.status === "active"} onProgressUpdate={onUpdateKRProgress} />
```

- [ ] **Step 4: 验证 KR 编号显示**

Run: `cd frontend && npm run lint`
Expected: 无新增 lint 错误

手动验证：启动 dev server，进入 OKR 页面，点击一个有 KR 的 Objective，确认每个 KR 前显示如 `26Q2-O1-K1` 的编号。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/okr/kr-progress.tsx frontend/src/components/okr/okr-detail.tsx frontend/src/components/okr/okr-panel.tsx
git commit -m "feat(okr): 关键结果增加编号显示（格式: Objective编号-K序号）"
```

---

### Task 4: OKR 目录树状视图

**Files:**
- Modify: `frontend/src/components/okr/okr-directory.tsx` (重构渲染逻辑)

将左侧 OKR 卡片列表改为按具体周期分组的树状视图，每组仅显示编号和目标标题。

- [ ] **Step 1: 添加周期分组辅助函数，替换旧的分组常量**

修改 `frontend/src/components/okr/okr-directory.tsx`：

删除旧的 `PERIOD_ORDER` 和 `PERIOD_LABELS` 常量（第 29-35 行），替换为周期分组辅助函数：

```typescript
// 删除这些：
// const PERIOD_ORDER = ['annual', 'semi_annual', 'quarterly', 'monthly']
// const PERIOD_LABELS: Record<string, string> = { ... }

// 替换为：
function getPeriodGroupKey(period: { type: string; start: string }): string {
  const d = new Date(period.start)
  const y = d.getFullYear() % 100
  switch (period.type) {
    case 'annual': return `${y}Y`
    case 'semi_annual': return `${y}H${d.getMonth() < 6 ? 1 : 2}`
    case 'quarterly': return `${y}Q${Math.floor(d.getMonth() / 3) + 1}`
    case 'monthly': return `${y}M${String(d.getMonth() + 1).padStart(2, '0')}`
    default: return `${y}`
  }
}
```

- [ ] **Step 2: 替换分组逻辑和渲染**

将组件内的分组逻辑（第 42-48 行）替换为按具体周期分组：

```typescript
// 删除旧的分组逻辑：
// const grouped = PERIOD_ORDER
//   .map(pt => ({ ... }))
//   .filter(g => g.items.length > 0)

// 替换为：
const groupMap = new Map<string, Objective[]>()
for (const obj of objectives) {
  const key = getPeriodGroupKey(obj.period)
  if (!groupMap.has(key)) groupMap.set(key, [])
  groupMap.get(key)!.push(obj)
}
const groups = Array.from(groupMap.entries())
  .map(([key, items]) => ({ key, items }))
  .sort((a, b) => b.key.localeCompare(a.key))
```

将底部的渲染部分（第 122-135 行）从使用 `ObjectiveCard` 改为树状列表：

```typescript
// 删除旧渲染：
// {grouped.length === 0 && (...)}
// {grouped.map(group => (
//   <ObjectiveCard ... />
// ))}

// 替换为：
{groups.length === 0 && (
  <div className="text-center text-muted-foreground text-xs py-6">
    暂无 OKR，点击右上角创建
  </div>
)}

{groups.map(group => (
  <div key={group.key}>
    <div className="text-xs font-semibold text-muted-foreground py-1">{group.key}</div>
    <div className="space-y-0.5">
      {group.items.map(obj => (
        <button key={obj.id} type="button"
          onClick={() => onSelect(obj.id)}
          className={`w-full text-left px-2 py-1.5 rounded text-sm hover:bg-muted/80 transition-colors ${
            selectedId === obj.id ? 'bg-muted font-medium' : ''
          }`}>
          {obj.objectiveNumber && (
            <span className="font-mono text-xs text-muted-foreground mr-1.5">{obj.objectiveNumber}</span>
          )}
          <span className="truncate">{obj.title}</span>
        </button>
      ))}
    </div>
  </div>
))}
```

- [ ] **Step 3: 移除未使用的 ObjectiveCard 导入**

删除第 6 行的 ObjectiveCard 导入：

```typescript
// 删除：
import { ObjectiveCard } from "./objective-card"
```

注意：`objective-card.tsx` 文件保留不删除，仅移除本文件的导入引用。

- [ ] **Step 4: 验证树状视图**

Run: `cd frontend && npm run lint`
Expected: 无新增 lint 错误

手动验证：启动 dev server，进入 OKR 页面，确认左侧列表：
1. 按具体周期分组（如 26Q2、26H1），非按类型分组
2. 每个周期组下只显示编号和目标标题
3. 选中状态有高亮
4. 状态过滤标签仍正常工作
5. 空状态提示正常显示

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/okr/okr-directory.tsx
git commit -m "feat(okr): OKR 目录改为按周期分组的树状视图"
```

---

### 最终验证

- [ ] **全量构建检查**

```bash
cd frontend && npm run build
```

Expected: 构建成功，无 TypeScript 错误。

- [ ] **手动端到端验证**

启动 dev server，逐一验证：
1. OKR 页面"模板"按钮下载的模板包含双 Objective 和 HTML 注释
2. 时间安排页面时间轴从 00:00 开始
3. OKR 详情中 KR 显示编号（如 26Q2-O1-K1）
4. OKR 左侧目录为树状视图，按周期分组

---

## Self-Review

### 1. 规格覆盖

| 需求 | 覆盖任务 |
|------|---------|
| [001] 模板缺少注释 | Task 1 — 添加 `<!-- ... -->` 注释 |
| [001] 模板支持多 Objective | Task 1 — 添加第二个 Objective 示例 |
| [002] 卡片列表改树状 | Task 4 — 替换为树状列表渲染 |
| [002] 按周期分组 | Task 4 — `getPeriodGroupKey` 按 26Q1/26Q2 分组 |
| [002] 只显示编号和标题 | Task 4 — 移除 ObjectiveCard，用简单 button |
| [003] 时间轴从 0:00 开始 | Task 2 — 修改 TIMELINE_START/END |
| [004] KR 增加编号 | Task 3 — krNumber prop + 传递 |
| [004] 编号规则 Obj-K1 | Task 3 — `${obj.objectiveNumber}-K${index+1}` |

### 2. 占位符扫描

无 TBD、TODO、"implement later" 等占位符。所有步骤包含完整代码。

### 3. 类型一致性

- `KRProgressProps.krNumber` 类型为 `string | undefined`，三个调用点均传入 `string | undefined`（三元表达式）
- `getPeriodGroupKey` 返回 `string`，与 `groups[].key: string` 一致
- `onSelect(obj.id)` 中 `obj.id` 类型为 `USOM_ID`（string），与 props 接口匹配
