# [023-02] 时间盒模板功能优化 — 设计文档

- **状态**：设计已批准（待 writing-plans）
- **日期**：2026-07-03
- **分支**：`feat/023-02-timebox-template`
- **来源需求**：`mydocs/dev/023.02-TimboxDomain优化.md`
- **前置**：[023] A2 时间盒模板已落地（`survivalSegments` + `subscribed_*` 模型）

---

## 0. 背景与关键判定

当前时间盒模板（`TimeboxTemplateEditor` + `timebox_templates` 表）采用**固定 7 键 `survival_segments`**（wake/morning/workAm/noon/workPm/evening/sleep）加**三个独立订阅数组**（`subscribed_habits/tasks/threads`）的模型，界面为固定宽度 `max-w-3xl` 列表 + `Dialog` 编辑模态。

**关键判定（探查结论）**：`survival_segments` 与 `subscribed_*` 字段**当前无任何下游消费者**——仅编辑器/actions/repo/schema/测试读写，排程 handler、providers 均不读取。模板目前是「写入即存」的纯配置，尚未接入时间盒生成。因此重构数据形状**不破坏任何排程逻辑**，可自由重塑。

本任务**不涉及**把模板接入排程生成（超范围，留待后续）。

---

## 1. 目标（对应需求四区块）

1. **界面总体**：主显示区宽度自适应（去掉固定 `max-w-3xl`）；模板编辑详情改为**右侧抽屉**（`Sheet`）而非 `Dialog`；严格遵循 `docs/UI-DESIGN-SPEC.md`。
2. **模板属性**：模板增加**应用范围（星期一~星期日，多选）**，可显示、可选定。
3. **模板列表**：以**卡片**显示（仿习惯管理 `HabitCard`，用色参照）；卡片显示安排详情 `起–止：活动名称` 逐行，超行截断 + `还有 N 条`，hover 显示完整活动列表。
4. **模板编辑详情**：7 段默认时间转为**完全可编辑的行列表**（增/删/改）；每行新增**来源**字段（习惯/任务/主线/自定义），已有 7 段均为「自定义」；来源=习惯时起止时间只读，自动从习惯记录获取。

---

## 2. 数据模型

### 2.1 USOM / Repository 形状

```ts
/** 模板行来源类型 */
type TemplateRowSource = 'habit' | 'task' | 'thread' | 'custom'

/** 模板中的一条时间安排行 */
interface TemplateRow {
  id: string            // 前端生成的稳定行 key（随 jsonb 持久化，供 React key 与编辑定位）
  activityName: string  // 活动名称（custom 手填；habit/task/thread 从来源对象 resolve）
  start: string         // HH:MM
  end: string           // HH:MM
  source: TemplateRowSource
  sourceId?: string     // habit/task/thread 的 USOM_ID；custom 时为空
}

interface TimeboxTemplate {
  id: USOM_ID
  userId: USOM_ID
  schemaVersion: number
  name: string
  daysOfWeek: number[]  // 0=Sun..6=Sat，语义对齐 habits.daysOfWeek；空数组=不限
  rows: TemplateRow[]   // 有序，按数组顺序即用户编辑顺序
  createdAt: string
  updatedAt: string
}

interface TimeboxTemplateInput {
  id?: string
  name: string
  daysOfWeek: number[]
  rows: TemplateRow[]
}
```

### 2.2 行为规则（需求 4）

| 来源 | 活动名称 | 起止时间 | sourceId |
|---|---|---|---|
| `habit` | 取习惯标题（只读，选具体习惯） | **只读锁定**：`start=习惯.defaultTime`，`end=defaultTime + defaultDuration` 推算 | 习惯 id |
| `task` | 取任务标题（只读，选具体任务） | **手动可编辑**（任务无固有时段） | 任务 id |
| `thread` | 取主线名称（只读，选具体主线） | **手动可编辑**（主线无固有时段） | 主线 id |
| `custom` | 自由文本手填 | 手动可编辑 | 空 |

- 行可任意增/删/改；可切换来源。
- 切换来源时：进入 `habit` → resolve 名称并锁定/回填时间；进入 `task/thread` → resolve 名称、解锁时间；进入 `custom` → 清空 sourceId、名称转为可编辑、解锁时间。
- `end` 由 `defaultTime + defaultDuration` 推算时跨午夜按 +24h 归一（HH:MM 字符串，取模 24h 显示）。

### 2.3 星期（需求 2）

- 模板级单一 `daysOfWeek: number[]`（非每行）。
- 默认新建模板 = `[0,1,2,3,4,5,6]`（全周）。
- 允许全不选（空数组），语义 = 不限。

---

## 3. DB 迁移（手写 SQL + psql + 登记 journal）

> 本仓迁移一律手写 SQL，`db:generate/migrate` 不可用；DB=`lifeware_dev@localhost:5432`，登记 `drizzle/meta/_journal.json`。

对 `timebox_templates`：

1. `ADD COLUMN rows jsonb NOT NULL DEFAULT '[]'::jsonb`
2. `ADD COLUMN days_of_week jsonb NOT NULL DEFAULT '[0,1,2,3,4,5,6]'::jsonb`
3. **回填** `survival_segments` → `rows`：把每段 `{start,end}` 转为一条 `custom` 行（`activityName` 用段中文名如「起床/晨间/…」，`id` 生成，`source='custom'`）。以 `UPDATE ... SET rows = (子查询 jsonb 聚合)` 实现。
4. `DROP COLUMN survival_segments`、`subscribed_habits`、`subscribed_tasks`、`subscribed_threads`。

**旧 `subscribed_*` 回填取舍（已确认）**：丢弃。它们从未接入下游且无时间信息，新模型的行要求起止时间，无法无损转换。用户如需可在新 UI 重新添加为对应来源行。

`schema.ts` 中 `timeboxTemplates` 定义同步：删除 4 个旧列，新增 `rows`（`$type<TemplateRow[]>`）、`daysOfWeek`（`$type<number[]>`）。

---

## 4. 后端改动

### 4.1 Repository（`timebox-template.ts`）

- `TimeboxTemplate` / `TimeboxTemplateInput` interface 改字段（见 §2.1），移除 `SurvivalSegment`、`survivalSegments`、`subscribed*`。
- `rowToTemplate`：映射 `rows` / `daysOfWeek`。
- `create` / `update`：写入 `rows` / `daysOfWeek`；`update` 的 `changedFields` 白名单更新为 `name` / `daysOfWeek` / `rows`。
- **A3 owner-check 改造**：`assertSubscriptionsOwned` 从「三数组」改为「遍历 `rows` 收集 `source∈{habit,task,thread}` 的 `sourceId`，按来源分组去重后校验归属」。复用现有 `_checkHabits/_checkTasks/_checkThreads`。
- audit log（`user_audit_log`）机制不变。

### 4.2 Server actions（`app/actions/timebox-templates.ts`）

- `saveTimeboxTemplate` 入参随 `TimeboxTemplateInput` 变化，逻辑不变。
- `fetchSubscriptionSources` 复用（编辑器行内来源下拉的数据源）。
- `fetchTimeboxTemplates` / `deleteTimeboxTemplate` 不变。

---

## 5. 前端改动

### 5.1 主页面（宽度自适应 + 页头）

- `timebox-template-editor.tsx` 去掉 `mx-auto max-w-3xl`，容器改 `w-full` + 页面内边距，跟随三栏主内容区宽度（需求 1）。
- 引入 `PageBanner`（对齐 habits/okrs 页范式）。

### 5.2 列表卡片（`TemplateCard`，新组件）

- 仿 `HabitCard`：`Card`/`CardContent`、`bg-canvas hover:bg-muted/50`、圆角 + `border-hairline`，用色参照习惯管理（需求 3）。
- 卡片内容：
  - 顶栏：模板名 + 应用范围星期 chips（如「一 二 三 四 五」；空数组显示「不限」）。
  - **安排详情**：`起–止：活动名称` 逐行渲染；超过 **4 行**截断，追加 `还有 N 条`；hover 弹出（`Popover` / `Tooltip`）完整行列表。行按 `start` 排序显示。
  - 操作：编辑（打开抽屉）、删除（复用 `AlertDialog` 二次确认）。
- 卡片按 `Card` 网格/纵向列表排布（响应式，随宽度自适应）。

### 5.3 编辑抽屉（`Sheet` 取代 `Dialog`）

- `Sheet` + `SheetContent side="right"`（仿 `habit-list.tsx` 抽屉），承载：
  1. **名称**输入。
  2. **星期多选**：7 个可点 chip（一~日），可全选/全不选。
  3. **行列表编辑器**（完全可编辑）：
     - 每行：`[来源下拉] [活动名称/来源选择器] [start] [—] [end] [删除按钮]`。
     - `source='custom'`：活动名称为自由文本框，start/end 可编辑。
     - `source∈{habit,task,thread}`：活动名称位置改为**来源对象下拉**（懒加载 `fetchSubscriptionSources`），选中后 resolve 名称。
     - `source='habit'`：start/end 只读，自动从习惯 `defaultTime`+`defaultDuration` 回填。
     - `source∈{task,thread}`：start/end 可编辑。
     - 底部「+ 新增一行」：默认 `custom`、`09:00–10:00`。
  4. 保存 / 取消（保存中 `Loader2`，沿用现范式）。
- 新建模板 seed：7 条 `custom` 行（对应旧 7 段中文名与默认时间），每条均可删/改。

### 5.4 客户端行为

- 保存后本地 `setTemplates` 乐观更新（沿用现有 upsert 逻辑）。
- 跨域刷新（若需要）沿用 `lifeware:data-changed` 事件范式；本任务模板为配置类，暂不广播。

---

## 6. UI-DESIGN-SPEC 合规

- 颜色一律 CSS 变量令牌（`bg-canvas`、`text-ink`、`border-hairline`、`bg-surface-card` 等），禁用 Tailwind 默认色（C-04）。
- `Sheet` 原语自带 focus-trap / Esc / aria-modal / scroll-lock（沿用 A2 /review I6 结论）。
- CNUI 无关（模板为页面级配置，不涉及 CNUI surface）。
- PR 须过 §14 C-01~C-07 检查清单；抽屉与卡片可见性以 /browse 视觉验证。

---

## 7. 测试

- `timebox-template.repository.test.ts`：改造夹具为 `rows` / `daysOfWeek`；新增/调整 owner-check 用例（rows 中 habit/task/thread 的 sourceId 跨用户 → 拒绝）。
- 组件层：`TemplateCard` 截断 + hover 完整列表渲染；抽屉行编辑器来源切换锁定/解锁时间的行为（可选 regression 测试）。
- 验收门禁：`tsc` base=head 零新增、`vitest` base=head 零新增、`validate:manifest` 0 错误、/browse 视觉验证宽度自适应 + 卡片 + 抽屉。

---

## 8. 文档同步（Tier 2 强制）

USOM/DB 变更**先改 `docs/` 再改代码**：

- `docs/usom-design.md §3.12`（TimeboxTemplate 形状：rows + daysOfWeek，移除 survivalSegments/subscribed*）。
- `docs/database-design.md §7.8`（timebox_templates 列变更 + 迁移说明）。
- `CHANGELOG.md`（记一条 [023-02]）。
- 迁移登记 `drizzle/meta/_journal.json`。

---

## 9. 影响面小结（blast radius）

| 文件 | 改动 |
|---|---|
| `lib/db/schema.ts` | timeboxTemplates 列替换 |
| `lib/db/repositories/timebox-template.ts` | interface + 映射 + owner-check |
| `app/actions/timebox-templates.ts` | 入参形状 |
| `domains/timebox/components/timebox-template-editor.tsx` | 宽度 + Sheet + 行编辑器 + 星期 |
| `domains/timebox/components/TemplateCard.tsx`（新） | 卡片 + 截断 hover |
| `domains/timebox/pages/TimeboxTemplatesPage.tsx` | 页头/容器（如需） |
| `app/timebox-templates/page.tsx` | 容器（如需） |
| `lib/db/repositories/__tests__/timebox-template.repository.test.ts` | 夹具改造 |
| `drizzle/` 手写迁移 + journal | 新迁移 |
| `docs/usom-design.md` / `docs/database-design.md` / `CHANGELOG.md` | 文档同步 |

无排程/providers/CNUI 消费者受影响（探查已确认）。

---

## 10. 待办 / 已决

- ✅ 来源=习惯/任务/主线 → 引用具体对象（名称 resolve；习惯锁时间、任务/主线手动）。
- ✅ schema 替换旧列；旧 7 段 → 7 custom 行回填；旧 subscribed_* 丢弃。
- ✅ 星期模板级、默认全周、允许全不选=不限。
- ✅ 卡片截断阈值 4 行 + hover 完整列表。
- ⬜ 迁移中 survival_segments→rows 的段中文名映射表（实现时与 editor 现 SEGMENTS 对齐）。
