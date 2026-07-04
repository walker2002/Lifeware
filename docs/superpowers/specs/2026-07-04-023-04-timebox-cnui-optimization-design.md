# [023.04] 时间盒 CNUI 对话优化设计

**日期**: 2026-07-04
**状态**: 待审核
**需求来源**: `mydocs/dev/023.04-TimboxDomain优化.md`
**前置**: [023] A2（Timebox 域重写，已 ff-merge main）、[023] A3.x（archetype 集成 + habitsTemplates 已退役）、[023.03]（page 优化与 `/schedule`→`/timeboxes` 改名）

## 概述

把 `/createTimebox` CNUI 补齐与 `/timeboxes` 编辑详情对等的字段（**activityArchetype**、**重提交时的时间重叠校验**），并把 **修改 / 取消 / 删除** 三类意图统一收敛到单一 shortcut `/editTimeboxes`，告别"快捷键散落"。

**用户决策摘要**（已确认）：

| # | 决策 | 选择 |
|---|---|---|
| 1 | 取消/删除入口 | 全部归入 `/editTimeboxes`，删除现 `/cancelTimebox` shortcut |
| 2 | 默认行为 | **解析优先** —— AI 解析成功 → 直接进编辑表单（字段预填）；失败 → 列表选择 |
| 3 | 重叠判断 | **客户端预检 + 修 Rule 双保险**（修 `timebox-overlap.ts` 让规则实际生效作为服务端兜底） |
| 4 | 编辑字段 | **全字段**：`title / startTime / endTime / activityArchetypeId / taskIds / habitIds / notes / tags / recurrence` |

## 现状诊断

| # | 现况 | 影响 |
|---|---|---|
| (1) CreateTimebox 缺 archetype UI | `cnui/surfaces/CreateTimebox.tsx:14-20` 已声明 `activityArchetypeId?: string`，但 line 62-78 输入控件无对应 picker | 用户在 `/createTimebox` 流程里完全无法设置 archetype，与 `/timeboxes` Drawer 能力不对齐 |
| (2) 时间重叠无任何校验 | line 85 提交按钮 disabled 条件仅 `!allTitlesFilled`；`app/actions/timebox.ts:45-52` 的 `assertEndTimeValid` 仅校验 endTime>startTime | 用户可在同日排多条完全重叠的时间盒，必须显式判断 |
| (3) Rule 引擎的 `timebox-overlap.ts` 已失效 | `rule-engine/rules/timebox-overlap.ts:76` 读 `duration`，但 schema 已撤 `duration`（A2 OV#P1-#1），现统一由 client 把 duration 折成 `endTime` | 现有 rule 静默 pass —— 一切"通过"假象 |
| (4) `/editTimeboxes` 完全未注册 | `manifest.yaml` intent_triggers 区无该项 | 用户无法用 AI 助手完成"把早上的会议改到 14:00"的意图 |
| (5) `/cancelTimebox` 已存在 shortcut 但无 surface 化 | manifest `cancelTimebox`（line 37-42）无 response_type/cnui_surface；handler 无对应分支 | shortcut 存在但走不通，**双入口混乱**（已有 shortcut + AI 自然语言意图） |
| (6) `EditItinerary.tsx` 已示范"列表 ↔ 表单"范式 | `cnui/surfaces/EditItinerary.tsx:26-87` | **[023.04] 直接复用范式** 节省设计成本 |
| (7) OV#8 状态守卫 | `app/actions/timebox.ts:223` `deleteTimebox` 仅允许 `planned` 状态删除 | 取消按钮必须按状态启用/禁用 |

## 方案对比

### 取消入口策略

| 方案 | 入口 | 优 | 劣 |
|---|---|---|---|
| **A1 嵌入 `/editTimeboxes`** | `/editTimeboxes` 同时承担 edit + delete；`/cancelTimebox` shortcut 删 | 单一入口；与 Drawer 一致；ArchetypePicker / 表单状态共享 | "删除"语义混入编辑流程，需底部「删除」按钮明示 |
| A2 独立 `/cancelTimeboxes` shortcut + 独立 surface | 3 个 surface（edit / cancel / create） | 语义最清晰 | CNUI surface 数翻倍，跨域调用重复 |
| A3 走 `/cancelTimebox` 直执行 | handler.submit 接 `deleteTimebox`，无 surface | 最轻 | 无可视化确认，违反 [023] 已落地的 CNUI-first 原则 |

**选 A1**：与现有产品决策（Drawer 顶部编辑/底部删除）一致；归档 `/cancelTimebox` shortcut。

### 编辑器默认模式

| 方案 | 行为 | 优 | 劣 |
|---|---|---|---|
| **B1 解析优先** | AI 解析成功 → 表单预填；失败 → 列表；用户可手动切列表 | 与 EditItinerary 单向（列表→表单）相比更**有 AI 意图感知**；切换按钮贯通 | 状态机复杂两态 |
| B2 列表优先 | 永远先列表，AI 解析只填默认选中项 | 简单 | 解析后用户也得点一次 |
| B3 表单优先 | 默认空表单，列表为侧边切换 | 最简 | AI 价值感弱 |

**选 B1**：用户决定明确要"提取信息后 → CNUI 显示确认"。

### 重叠判断层

| 方案 | 客户端 | 服务端 | 优 | 劣 |
|---|---|---|---|---|
| **C1 双保险** | 实时禁用 + needs_confirm | 修 `timebox-overlap.ts` 改读 `endTime` 让 rule 真生效 | 反馈快 + 服务端兜底 | 改动面 |
| C2 仅客户端 | 实时禁用 + needs_confirm | 不动 | 改动小 | API 直调可绕过 |
| C3 仅服务端 | 不动 | 修 rule，让 needs_confirm 自然流转 | 真实物理唯一 | 客户端反馈弱 |

**选 C1**：同时修了 [023.04] 任务 1 的"J-rule 静默失效"债。

## 架构

```
[AI 助手 ⤴ /createTimebox / /editTimeboxes]
              │                │
              ▼                ▼
       CreateTimebox     parseTimeboxesIntent
              │                │
              │                ▼
              │      ┌──────────────────────┐
              │      │ resolver 成功   resolver 失败  │
              │      ▼                ▼
              │   [EditTimeboxesForm]  [TimeboxList]
              │   (顶部 "切换列表")  选中 → 编辑表单
              │                │
              ▼                ▼
       onValidate (重叠预检 + 字段必填)
                │
                ▼
   submitCnuiSurface → cnui/handlers.editTimeboxes.submit
                │
                ▼
   1) service-side 重叠检测 (timebox-overlap rule, 修后启效)
   2) overlap → return {needs_confirm} → AlertDialog
   3) no overlap → 直调 updateTimebox(id, fields)
                       │
                       ▼
                 OV#M 字段白名单 → 已加字段已含 notes/tags/recurrence
                       │
                       ▼
       表单底部「删除」按钮 (仅 planned 状态)
                │
                ▼
           deleteTimebox(id) 走 OV#8
```

### 关键决策卡片

- **Open 模式解析**：handler.open 调 `parseTimeboxesIntent(userPrompt, today, todayTimeboxes)`；若返回 `resolverResult.kind='selecting'` 即填 `selectedId` 字段写空表单（解析失败态），否则填入 form defaults
- **保留「切换列表」按钮**：EditItinerary 范式反向，提供"从表单退到列表"按钮
- **删除按钮 gate**：从抽屉 / 表单看 `status`，仅 planned 显示
- **范围口径**："当日"=本地时区当日 00:00 至次日 00:00（与 `/timeboxes` 日历同源），不跨日

## 变更范围

### 新建

| 文件 | 用途 |
|---|---|
| `frontend/src/domains/timebox/cnui/surfaces/EditTimeboxes.tsx` | 编辑 surface（合并修改 + 删除，解析优先模式） |
| `frontend/src/domains/timebox/cnui/surfaces/__tests__/edit-timeboxes.test.tsx` | 组件渲染 / onValidate / onConfirm 单测 |
| `frontend/src/domains/timebox/cnui/__tests__/parse-timeboxes.test.ts` | parseTimeboxesIntent 单测 |
| `frontend/src/domains/timebox/lib/overlap.ts` | `assertNoInternalOverlap(items, dayStart, dayEnd)` 纯函数（同日多 batch 内重叠） |

### 修改

| 文件 | 改动 |
|---|---|
| `frontend/src/domains/timebox/cnui/surfaces/CreateTimebox.tsx` | 加 `<ArchetypePicker>`（裸版）；提交按钮 disabled 算内部重叠 + 端点有效性；onConfirm 加 `activityArchetypeId` |
| `frontend/src/domains/timebox/cnui/handlers.ts` | 新增 `editTimeboxes` action 分支（open + submit）；open 调 `parseTimeboxesIntent`；submit 直调 `updateTimebox` / `deleteTimebox`；submit 内做服务端重叠二次检测 |
| `frontend/src/domains/timebox/manifest.yaml` | A 区删 `cancelTimebox`，新增 `editTimeboxes`（含 shortcut + response_type + cnui_surface + examples + keywords）；K 区加 `edit-timeboxes` 条目 |
| `frontend/src/domains/timebox/registry/intent.ts` | register intent examples 同步 |
| `frontend/src/nexus/core/rule-engine/rules/timebox-overlap.ts` | line 76 改读 `endTime` 而非 `duration`；注释更新为 "由 client 折算 endTime" |
| `frontend/src/domains/timebox/cnui/__tests__/handlers.test.ts` | 补 editTimeboxes 分支用例（解析成功/失败/update/delete/OV#8/重叠/异常） |
| `frontend/src/nexus/core/rule-engine/__tests__/timebox-overlap.test.ts` | 现有如有 → 改 `endTime` 输入；否则新增 |
| `frontend/src/usom/objects/timebox.ts` | USOM 主类型校验 `endTime > startTime` 的 schema 注解（**已通过 DB CHECK 落地**，仅注释补强） |

### 文档同步

| 文件 | 改动 |
|---|---|
| `docs/database-design.md` | timebox 章节加「CNUI 时间重叠规则」声明 |
| `docs/usom-design.md` | 同上 |
| `docs/superpowers/specs/2026-07-01-023-01-timebox-domain-optimization-design.md` | IN-2「时间重叠」结清指针指向 023.04 |
| `CHANGELOG.md` | 新增 [023.04] 版本条目 |

## 设计详情

### §1 CreateTimebox 补 ArchetypePicker

`cnui/surfaces/CreateTimebox.tsx` 第 62-78 行现有：

```tsx
<div className="space-y-3">
  <Field label="标题">…</Field>
  <Field label="开始">…</Field>
  <Field label="结束">…</Field>
</div>
```

插入 archetype（裸版，无 h3 label；与 [023] A3.1 紧凑场景一致）：

```tsx
<div className="space-y-3">
  <Field label="标题">…</Field>
  <Field label="开始">…</Field>
  <Field label="结束">…</Field>
  <Field label="活动原型">
    <ArchetypePicker
      value={cur.activityArchetypeId}
      onChange={(id) => update({ activityArchetypeId: id })}
    />
  </Field>
</div>
```

`onValidate` 加重叠：

```tsx
const overlap = useMemo(
  () => assertNoInternalOverlap(items, dayStart, dayEnd),
  [items]
)
const canSubmit = !isLoading && allTitlesFilled && !overlap.hasOverlap
```

`onConfirm` 透传：

```tsx
onConfirm({ items: items.map(it => ({ ...it, activityArchetypeId: it.activityArchetypeId })) })
```

### §2 提交时服务端重叠校验（修 rule）

`rule-engine/rules/timebox-overlap.ts:73-81`：

```ts
// 改前
const startMs = new Date(input.payload.startTime).getTime()
const durationMs = (input.payload.duration ?? 0) * 60_000
const endMs = startMs + durationMs

// 改后
const startMs = new Date(input.payload.startTime).getTime()
const endRaw = input.payload.endTime
if (!endRaw) {
  // 无 endTime 无法判重叠（保留兼容）
  return { severity: 'pass', message: '' }
}
const endMs = new Date(endRaw).getTime()
```

同时调整 severity 分级：**新建与现有 planned/running 重叠 → `confirm`**；与 `ended/cancelled/logged` 重叠 → `pass`（已不活跃，不阻断）。

### §3 解析优先模式的 surface 设计

`cnui/surfaces/EditTimeboxes.tsx`：

```tsx
'use client'

interface EditTimeboxesProps {
  dataModel: {
    mode: 'selecting' | 'editing'   // 由 handler.open 写入
    selectedId?: string
    prefill?: Partial<TimeboxDraft>   // AI 解析结果
    items?: TimeboxSummary[]          // 今日列表（selecting 模式显）
    readOnly?: boolean
  }
  onChange: (next: EditTimeboxesProps['dataModel']) => void
  onConfirm: (payload: ...) => void
  onCancel: () => void
}

export function EditTimeboxes({ dataModel, onChange, onConfirm, onCancel }: ...) {
  const [view, setView] = useState<'list' | 'form'>(
    dataModel.mode === 'selecting' ? 'list' : 'form'
  )
  // view==='list' → 渲染 items.map(...) 按钮 + 「选择修改」标题
  // view==='form' → 渲染 TimeboxFormFields + 顶部「返回列表」按钮 + 底部「删除」按钮
  //   重叠：useMemo 内 assertNoInternalOverlap + 与已有 timebox 重叠（handler.open 已 detect）
  //   onConfirm payload 形如：
  //     - 修改: onConfirm({ operation: 'update', selectedId, fields: {...} })
  //     - 删除: onConfirm({ operation: 'delete', selectedId })
}
```

### §4 handler.open 流程

```ts
// cnui/handlers.ts: 'editTimeboxes' open 分支
const r: CnuiSurfaceResponse = {
  surfaceType: 'edit-timeboxes',
  dataModel: {
    mode: 'selecting',
    items: await listTodayPlanned(userId),
    readOnly: false,
  },
}

// 解析用户 prompt
const parsed = await parseTimeboxesIntent(prompt, todaySummary)
if (parsed.kind === 'edit-target' && parsed.timeboxId) {
  const tb = await getTimeboxById(parsed.timeboxId)
  if (tb) {
    r.dataModel = {
      mode: 'editing',
      selectedId: tb.id,
      prefill: extractFields(tb),
      readOnly: false,
    }
  }
}
return r
```

### §5 handler.submit 流程

```ts
// cnui/handlers.ts: 'editTimeboxes' submit 分支
if (action === 'editTimeboxes') {
  const fields = dataModel as {
    operation: 'update' | 'delete'
    selectedId: string
    fields?: Partial<TimeboxDraft>
    confirmed?: boolean
  }
  if (fields.operation === 'delete') {
    // OV#8 守卫由 service deleteTimebox 层强制，throw 透传为 surface error
    try {
      const r = await deleteTimebox(fields.selectedId)
      return { status: 'ok', result: r }
    } catch (e) {
      return { status: 'error', message: e instanceof Error ? e.message : String(e) }
    }
  }
  // update 路径
  const r = await updateTimebox(fields.selectedId, fields.fields ?? {}, fields.confirmed)
  if (r.status === 'needs_confirm') return { status: 'needs_confirm', message: r.message }
  return { status: 'ok', result: r }
}
```

OV#8 实现在 `deleteTimebox`（`app/actions/timebox.ts:219-226`）；service 层拒绝时 throw `该时间盒已记录/已结束，不可删除`，handler.submit 必须 try/catch 透传为 surface error message，绝不让 reject 静默吞掉。

### §6 manifest 改造

`manifest.yaml` 区 A 删 `cancelTimebox`，新增 `editTimeboxes`：

```yaml
- action: editTimeboxes
  shortcut: /editTimeboxes
  description: 修改 / 取消 / 删除当日时间盒（CNUI 三合一）
  response_type: cnui
  cnui_surface: edit-timeboxes
  examples:
    - 把早上的会议改到下午 14:00
    - 把 10 点的会议取消
    - 删除下午的会议
    - 帮我看一下今天的时间盒
  keywords: [修改时间盒, 改时间盒, 改时间, 取消时间盒, 删除时间盒, 调整时间盒]
```

K 区加：

```yaml
cnui_surfaces:
  - id: edit-timeboxes
    handler_module: ./cnui/handlers
    client_component: ./cnui/surfaces/EditTimeboxes.tsx
```

### §7 /createTimebox 流程的 onValidate 重叠

CreateTimebox 与 EditTimeboxes 共享 `assertNoInternalOverlap`：

```ts
// lib/overlap.ts
export interface OverlapResult {
  hasOverlap: boolean
  conflictTitles: string[]
}

export function assertNoInternalOverlap(
  items: Array<{ title: string; startTime: string; endTime: string }>,
  dayStart: string,
  dayEnd: string
): OverlapResult {
  // 同日多条重叠判断：
  // 1) 半开区间 s1 < e2 && s2 < e1
  // 2) 与 items 同表单内互判，输出冲突对任一方 title
  // 3) 与已有 todayTimebox 的判放在服务端 rule（更权威）
}
```

## 测试计划

### 单元测试

| 文件 | 覆盖 |
|---|---|
| `cnui/__tests__/handlers.test.ts` | editTimeboxes 分支：open 解析成功 / 失败 / 解析异常；submit update 单条 / 批量 / 字段白名单；submit delete planned / 状态守卫 throw；needs_confirm 二次确认；surface error 透传 |
| `cnui/__tests__/parse-timeboxes.test.ts` | parseTimeboxesIntent：纯文本"改 14:00" / "取消早会" / 多意图 / 中文时间表达 / 时间不合法降级 |
| `cnui/surfaces/__tests__/edit-timeboxes.test.tsx` | surface 渲染：mode='selecting' 显列表；mode='editing' 显表单；顶部「返回列表」/底部「删除」按钮存在性、planned status 时删除可见、ended 时不可见 |
| `lib/__tests__/overlap.test.ts` | assertNoInternalOverlap：空数组 / 单条 / 多条两两不重叠 / 两条完全重叠 / 边界相切（end == start） / 跨日不重叠 / 与 todayTimebox 互判（如有外部注入） |
| `nexus/core/rule-engine/__tests__/timebox-overlap.test.ts` | 修 duration→endTime：endTime 缺失 → pass；与 planned 重叠 → confirm；与 ended/cancelled 重叠 → pass |

### 集成 / E2E

| 场景 | 期望 |
|---|---|
| `/createTimebox` → 提交 batch 含 2 条同日重叠 | 第一条 OK；第二条提交弹 needs_confirm AlertDialog |
| `/editTimeboxes` 「把上午会议改到 14:00」 | surface 直接进编辑表单（预填新时间）；确认后 updateTimebox OK；getTimeboxById 回读新值 |
| `/editTimeboxes` 「取消早会」未具名 | surface 列今日列表；选中早会后底部「删除」可见；确认后 status=cancelled |
| OV#8 状态守卫 | 当日非 planned 状态时间盒：删除按钮不渲染；API 直调 throw 应在 surface error 显示 |
| 重叠 rule | service-side `timebox-overlap` 修后实际生效（不靠 client 校验的 E2E） |

### 回归守护

- [023.03] 已 ship 的时间盒 page 优化（`/timeboxes`）回归
- [023] A2 已 ship 的 archetype 全集成回归
- CreateTimebox 已有用例不破

## 风险与陷阱

| # | 风险 | 缓解 |
|---|---|---|
| 1 | OV#8 throw 仍可能被 submit 吞 | handler.submit 显式 try/catch + surface error.message 传 UI |
| 2 | Rule 引擎读 `endTime`，但部分历史 intent payload 仅有 `startTime` | `endTime` 缺失 → severity=pass（兼容，不阻断） |
| 3 | parseTimeboxesIntent 对"14:00"中文时间表达歧义 | 单元测试覆盖「上午/下午/14:00/两点」等典型；不合法 → fallback selecting 模式 |
| 4 | 删除 `/cancelTimebox` shortcut 破坏历史 AI session | 接受（[023.04] 是 clean-up 任务）；文档中记录"old shortcut 已迁" |
| 5 | EditTimeboxes 表单字段过多（含 tags/notes/recurrence/tasks/habits），CNUI 紧凑场景体验拥挤 | 子组件 `TimeboxFormFields` 分块折叠（标题/时间/原型/关联/备注/周期） |
| 6 | `timebox-overlap.ts` 已部署的 fake-pass 状态被外部测试依赖 | 修后必须 tsc/vitest + 单独 e2e 才 ship；先在 PR 摘录"修后具备 needs_confirm 触发能力" |

## Out-of-scope（明确不做）

- ❌ 跨日时间盒编辑（spec 明确"当日有效"）
- ❌ 批量多 timebox 一键删除（保留单条）
- ❌ `EditItinerary.tsx` / `CreateItinerary.tsx` 同期改造（它们有 lifecycle `locked` 语义，本任务不动）
- ❌ Drawer 改造（`timebox-drawer.tsx` 内部已完整，不在 023.04 scope）
- ❌ AI parser 模型升级（仅消费现有 `ai-parser`）
- ❌ `/schedule` 改名（[023.03] 已做）

## 验收口径

- [ ] `/createTimebox` 可选 archetype；多条重叠提交有 needs_confirm 弹窗
- [ ] `/editTimeboxes` 支持 4 类中文意图（修改 / 取消 / 删除 / 查看）
- [ ] parser 失败降级到列表模式
- [ ] OV#8 守卫对非 planned 状态时间盒显式禁用删除按钮
- [ ] service-side `timebox-overlap` rule 真生效（测试可证）
- [ ] 服务端三件套守护：tsc 0 错 / vitest 基线不增回归 / validate:manifest 0 error
- [ ] `/browse` 走通 4 个核心 E2E 场景
