# [023.11] Timebox Action 优化设计

> **状态**：APPROVED（2026-07-06 brainstorm）
> **范围**：editTimeboxes CNUI 三处 UX 修复 + AI 助手 createTimebox/editTimeboxes 的活动原型（archetype）智能匹配
> **需求来源**：`mydocs/dev/023.11-TimboxDomain相关功能优化.md`
> **下游**：本 spec → `/superpowers:writing-plans` → SDD + TDD 实现

---

## 0. 背景与现状（探索结论）

| 议题 | 现状（文件:行） |
|---|---|
| editTimeboxes manifest description | `domains/timebox/manifest.yaml:30` 当前值 `修改/取消/删除当日时间盒（CNUI 三合一入口）`，需改 `修改/删除时间盒` |
| 双重标题 | 外层 header = `cnui/handlers.ts:329` 的 `content:'请选择要操作的时间盒'`；组件内 `surfaces/EditTimeboxes.tsx:125` 又硬编码同一句 → 显示两次 |
| 编辑页空白 | `EditTimeboxes.tsx:80-89` 的 `draft` useState 仅初始化读一次 `prefill`；点选记录走 `onDataChange` 更新 `dataModel.prefill`，但**无 useEffect 把 prefill 同步回 draft** → 选后表单仍空 |
| createTimebox AI 解析 | 共享层 `nexus/core/intent-engine/ai-parser.ts` 的 `parseMultiTask`（generic，**不应塞 archetype 概念**）；timebox 域单一收口在 `app/actions/intent.ts:1224 parseTimeboxBatchIntentOnly` |
| editTimeboxes 解析 | `domains/timebox/cnui/parse-timeboxes.ts` 纯规则（无 LLM），标题来自既有记录不"提取" |
| archetype 数据模型 | `activity_archetypes` 表无 keywords 字段，仅 `l1Category` / `l2Name` / `environment[]` / `location[]` / `energyCost`(4维) / `activityLabel`(6维)；timebox 以 FK `activity_archetype_id` 引用 |
| 现有 archetype↔AI 交集 | **无**。所有 archetype 全靠 `ArchetypePicker` 手选 |
| 置信度机制 | 项目惯例门槛 `0.5`（`ai-parser.ts:294,437`）；timebox 域 edit 路径 `parse-timeboxes.ts:156` 也用 0.4/0.85 |
| aiRuntime 获取 | `createAIRuntime()` 工厂，server action 内可直接构造（`intent.ts:1227` 已用） |

**关键架构决策（已与用户确认）**：

1. **匹配机制 = 规则优先 + LLM 兜底**：先按标题子串/双向包含命中 archetype 的 `l2Name`（命中即高置信接受），未命中再调 LLM 注入目录匹配。
2. **LLM 接受门槛 = 0.7**（高于项目默认 0.5，因为 archetype 误匹配会静默打错能量/标签数据，代价 > 留空）。规则命中（l2Name 子串）默认 0.9 直接接受，不走该门槛。
3. **被动推断范围 = 仅 createTimebox**（"提取标题"只发生在 createTimebox 的 LLM 解析路径；editTimeboxes 标题为既有记录不"提取"，其 archetype 补全交给主动按钮 2.2）。

---

## 1. 目标 / 成功标准

**功能验收**：

- **F1**（manifest 改名）：`manifest.yaml` 中 editTimeboxes 的 description = `修改/删除时间盒`；`keywords` 保留 cancel 相关词，cancel 能力不退化。
- **F2**（去重）：`/editTimeboxes` 进入 selecting 模式时，"请选择要操作的时间盒"标题**只出现一次**。
- **F3**（编辑页回填）：selecting 模式点选任一记录 → 进入 editing 模式 → 表单各字段（title/startTime/endTime/archetype/notes/taskIds/habitIds）**立即带入该记录原值**，不再空白；重新返回列表选另一条 → 字段刷新为新选中记录。
- **F4**（被动推断）：`/createTimebox 下午写代码 14:00-16:00` → drafts 里命中规则或 LLM≥0.7 时自动带 `activityArchetypeId`，未命中/置信度不足则字段为空（undefined），用户可手选或用主动按钮。
- **F5**（主动按钮）：CreateTimebox 与 EditTimeboxes 的 archetype 字段在 `ArchetypePicker` 内出现「AI 匹配」按钮；点击命中则回填 archetype，未命中（含规则+LLM 均不足）显示「未找匹配的活动原型」。

**质量验收**：

- 新增单测全绿；`vitest` base/head 失败集合零新增（聚焦被改文件）；`tsc --noEmit` 零新增错误；`validate:manifest` 0 errors。
- **无 DB 迁移**、**无新 CNUI surface**（不触发 manifest surface 双注册 / C-1 四联审计）、**无 USOM schema 变更**。

---

## 2. Part 1 — editTimeboxes UX 修复

### 2.1 manifest description 改名

- **文件**：`frontend/src/domains/timebox/manifest.yaml`
- **改动**：`editTimeboxes` action 的 `description` 字段 → `修改/删除时间盒`
- **不变**：`shortcut`、`cnui_surface`、`examples`、`keywords`（仍含「取消时间盒/删除时间盒/改时间盒」等，cancel/解析能力完全不变）。
- **注意**：description 改名**不触发 C-1 四联审计**——action 名 `editTimeboxes` 未变，仅描述文本调整；但 implementer 须确认 manifest validator 无文案长度/字符约束（pre-check）。

### 2.2 双重标题去重

- **文件**：`frontend/src/domains/timebox/cnui/surfaces/EditTimeboxes.tsx:125`
- **改动**：删除该行硬编码 `<div className="mb-2"><span ...>请选择要操作的时间盒</span></div>`。
- **保留**：
  - 外层 header（来自 `handlers.ts:329` 的 `content`，经 `CnuiSurfaceWrapper` 标题行渲染）——继续作为 selecting 模式的标题。
  - `originalPrompt` echo 块（`EditTimeboxes.tsx:102-123`）——继续提供"您刚才说…/解析失败原因"上下文。
- **结果**：selecting 模式从「header + echo + 重复标题 + 列表」变为「header + echo + 列表」。

### 2.3 编辑页空白修复

- **文件**：`frontend/src/domains/timebox/cnui/surfaces/EditTimeboxes.tsx`
- **根因复述**：`draft` useState（80-89）只在首次挂载读 `prefill`；`prefill`（73 行 `(dataModel.prefill as Partial<TimeboxDraft>) ?? {}`）虽随 `dataModel` 更新，但 useState 初值不会重读。点选记录（131-148 `onClick`）走 `onDataChange(nextDataModel)` 更新了 `dataModel.prefill`，draft 不同步。
- **修法**：新增 useEffect，依赖 `dataModel.selectedId`（**不是 prefill 对象引用**——避免用户输入时 draft 被重置打断），selectedId 变化时按当前 prefill 重置 draft：

```tsx
// [023.11] 修复：选中记录切换时把 prefill 同步进 draft（原仅 useState 初值读取 → 选后空白）
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
}, [dataModel.selectedId]) // 仅在切换选中记录时重置；用户编辑 draft 期间 selectedId 不变，不会被覆盖
```

- **覆盖情形**：selecting→editing 点选（selectedId 从 undefined→id）；返回列表再选另一条（id→id'）；handler.open 高置信直接进 editing（selectedId 初值即存在，useEffect 在挂载后跑一次同步——与 useState 初值行为一致，无回归）。
- **不动**：`createTimebox` 走 items 数组模式，不受此 bug，不修改。

---

## 3. Part 2 — AI 活动原型匹配

### 3.0 共享原语：`archetype-matcher`

- **新文件**：`frontend/src/domains/timebox/lib/archetype-matcher.ts`
- **形态**：纯函数（DB 查询与 aiRuntime 由调用方注入，守 R-01 Repository 边界，便于单测 mock）。
- **职责**：给定一批标题 + 用户 archetype 列表 + aiRuntime，逐条返回匹配结果（或 null）。

**签名**：

```ts
import type { AIRuntime } from '@/nexus/ai-runtime'
import type { ActivityArchetype } from '@/usom/activity-archetype/types'

export interface ArchetypeMatch {
  archetypeId: string
  confidence: number          // rule ≈ 0.9 / llm 0.7~1.0
  source: 'rule' | 'llm'
}

/** 门槛常量（集中管理，单测可断言） */
export const RULE_CONFIDENCE = 0.9
export const LLM_THRESHOLD = 0.7

/**
 * 批量匹配：titles[i] → ArchetypeMatch | null（与 titles 同长、同序）
 *
 * 规则轮（本地、零成本）：
 *   - 归一化标题（trim + lowercase + 剥时间词 HH:MM / 点 / 时段词「上午/下午/晚上/早上/凌晨」）
 *   - 对每个 archetype 判 双向子串包含：
 *       title.includes(l2Name)  或  (title.length >= 2 && l2Name.includes(title))
 *   - 命中取最长 l2Name（最具体）→ { confidence: RULE_CONFIDENCE, source: 'rule' }
 *
 * LLM 兜底轮（仅对规则未命中的标题，批量一次 LLM 调用）：
 *   - prompt 注入用户 archetype 目录（id / l2Name / l1Category / environment / location）
 *     + 待匹配标题列表，要求逐条返回 { archetypeId, confidence } 或 null
 *   - confidence >= LLM_THRESHOLD 接受，否则 null
 *
 * 边界：
 *   - 空标题 / 空 archetypes → 直接 null（不发 LLM）
 *   - LLM 返回的 archetypeId 必须在目录内（防幻觉），否则 null
 */
export async function matchArchetypesForTitles(
  titles: string[],
  archetypes: ActivityArchetype[],
  aiRuntime: AIRuntime,
): Promise<(ArchetypeMatch | null)[]>
```

**LLM prompt 设计要点**（在 matcher 内部组装）：
- system：你是活动原型分类器；依据标题语义从用户已有原型中选最匹配项；不确定或无合适项必须返回 null，禁止编造 id。
- user：JSON `{ archetypes: [{id,l2Name,l1Category,environment,location}], titles: [...] }`
- 要求输出：`{ results: [{ title, archetypeId, confidence }] | null }`
- 复用 `aiRuntime.generate({ taskType: 'classification', temperature: 0 })`；解析 JSON + 校验 archetypeId ∈ 目录 + confidence 数值。

### 3.1 被动推断（createTimebox）

- **挂点**：`frontend/src/app/actions/intent.ts` 的 `parseTimeboxBatchIntentOnly`（line 1234-1242 drafts map 之后）
- **改动**：
  1. `TimeboxBatchParseResult.drafts` 元素增可选字段 `activityArchetypeId?: string`。
  2. 在 drafts 构造完成后，加载 archetypes（`new ActivityArchetypeRepository().findByUser(MVP_USER_ID)`）+ 复用上方已 `createAIRuntime()` 的 `aiRuntime`，调 `matchArchetypesForTitles(drafts.map(d => d.title), archetypes, aiRuntime)`。
  3. 逐条：`matches[i]` 非空 → `drafts[i].activityArchetypeId = matches[i]!.archetypeId`；空标题/未命中 → undefined（字段缺省）。
- **「字段为空」guard（需求 2.1 前提）**：当前 `parseMultiTask` 不产出 archetype 字段，drafts 进入时该字段恒空，上述填入天然满足"字段为空才推断"。仍加防御性判断：`if (!drafts[i].activityArchetypeId && matches[i])` 才填，避免未来 parseMultiTask 产出该字段时被覆盖。
- **治理**：不改共享层 `parseMultiTask`（保持 generic 纯净）；createTimebox handler.open（`handlers.ts:83-107`）原样透传 drafts（drafts 已带 archetypeId，surface 直接读 `cur.activityArchetypeId`）。
- **性能**：chat 路径新增 1 次 repo 查询（archetype 列表，量级小）+ 至多 1 次 LLM 调用（规则全命中则零 LLM）。可接受。

### 3.2 主动按钮「AI 匹配」

#### 3.2.1 server action

- **文件**：`frontend/src/app/actions/activity-archetype.ts`
- **新增**：

```ts
export interface ArchetypeMatchResult {
  matched: boolean
  archetypeId?: string
}

/** [023.11] 单标题 AI 匹配（规则优先 + LLM 兜底），供 CNUI 表单「AI 匹配」按钮调用 */
export async function matchArchetypeForTitle(title: string): Promise<ArchetypeMatchResult> {
  // 空 title / 无 archetypes → matched:false（matcher 内部短路）
  // 命中（规则 0.9 或 LLM≥0.7）→ matched:true + archetypeId
}
```

- **内部**：`new ActivityArchetypeRepository().findByUser(MVP_USER_ID)` + `createAIRuntime()` + `matchArchetypesForTitles([title], archetypes, aiRuntime)` → 取 `[0]`。

#### 3.2.2 ArchetypePicker 共享组件改造

- **文件**：`frontend/src/components/archetype/archetype-picker.tsx`
- **新增 props**（opt-in，默认行为不变，详情页等只读消费方零影响）：

```ts
interface ArchetypePickerProps {
  value?: string
  onChange?: (archetypeId: string | undefined, archetype?: ActivityArchetype) => void
  readOnly?: boolean
  /** [023.11] 启用「AI 匹配」按钮（CNUI 表单传 true，详情只读页不传） */
  enableAiMatch?: boolean
  /** [023.11] 当前标题（用于 AI 匹配；enableAiMatch=true 时必传） */
  title?: string
}
```

- **UI 行为**：
  - `enableAiMatch && title?.trim() && !readOnly` 时，在「选择/更换」按钮旁渲染「AI 匹配」按钮（`text-xs text-primary`）。
  - 点击 → set loading → 调 `matchArchetypeForTitle(title)`：
    - `matched:true` → `onChange(archetypeId)` 回填（与手选一致）；picker 关闭下拉。
    - `matched:false` → 在 picker 下方显示 `text-error`「未找匹配的活动原型」；下次交互（onChange / 关闭 picker / title 变化）清除。
  - archetype 已选时也可点（显式 re-match，覆盖当前值）。
  - loading 期间禁用按钮，显示「匹配中…」。
- **不动**：readOnly 模式、M-1 失败重试、H4 挂载拉取一次 archetypes 等既有逻辑。

#### 3.2.3 两个 CNUI surface 接线

- **CreateTimebox.tsx**（line 110-114）：`<ArchetypePicker value={cur.activityArchetypeId} onChange={(id)=>update({activityArchetypeId:id})} enableAiMatch title={cur.title} />`
- **EditTimeboxes.tsx**（line 244-245）：`<ArchetypePicker value={draft.activityArchetypeId} onChange={id=>update({activityArchetypeId:id})} enableAiMatch title={draft.title} />`

---

## 4. 数据流总览（实现后）

### 4.1 createTimebox 被动推断链路

```
用户 "/createTimebox 下午写代码 14:00-16:00"
  → use-intent-handler → parseTimeboxBatchIntentOnly(intent.ts)
      → parseMultiTask(共享层, 不动) → drafts[{title,startTime,endTime}]
      → [023.11 新增] matchArchetypesForTitles(draft 标题, archetypes, aiRuntime)
           → 规则轮：l2Name 子串命中? 是→0.9 / 否→LLM 兜底≥0.7
      → drafts[i].activityArchetypeId 填入（未命中 undefined）
  → openCnuiSurface → handler.open(透传) → CreateTimebox surface 读 cur.activityArchetypeId
```

### 4.2 主动按钮链路（两个 surface 同构）

```
用户在 ArchetypePicker 点「AI 匹配」
  → matchArchetypeForTitle(title)  [server action]
      → repo.findByUser + createAIRuntime + matchArchetypesForTitles([title])
  → matched:true  → onChange(id) 回填
  → matched:false → inline「未找匹配的活动原型」
```

### 4.3 editTimeboxes 编辑回填链路（修复后）

```
selecting 模式点选记录
  → onClick: onDataChange({...dataModel, mode:'editing', selectedId:it.id, prefill:{...原值}})
  → EditTimeboxes rerender（dataModel.selectedId 变）
  → [023.11 新增] useEffect[selectedId] → setDraft(prefill)  ← 此前断点
  → 表单字段显示原值
```

---

## 5. 测试策略（TDD 强约束）

| 文件 | 用例 |
|---|---|
| **新建** `domains/timebox/lib/__tests__/archetype-matcher.test.ts` | 规则精确命中（title===l2Name）/ 规则子串命中（title includes l2Name）/ 反向包含（l2Name includes title, len≥2）/ 多 archetype 命中取最长 l2Name / 规则未命中→LLM 命中（mock aiRuntime）/ LLM confidence<0.7→null / LLM 返不存在 id→null（防幻觉）/ 空标题→null / 空 archetypes→null 且**断言 aiRuntime.generate 未被调用** / batch 混合（部分规则部分 LLM）单次 LLM 调用 / 时间词被剥（"下午14:00 写代码" 不误判） |
| **修改** `app/actions/intent.ts` parseTimeboxBatchIntentOnly（或在对应 __tests__） | drafts 命中带 archetypeId / 未命中 undefined / 空 draft（title=''）不带（mock matcher） |
| **修改** `app/actions/__tests__/activity-archetype.test.ts`（或新建） | matchArchetypeForTitle 命中返 `{matched:true,archetypeId}` / 未命中返 `{matched:false}` |
| **修改** EditTimeboxes 相关测试 | 选中记录后 draft 同步（回归空白页 bug，断言 title/startTime 等非空）/ selecting 模式不再出现重复标题文案 |
| **修改** archetype-picker 组件测试（若无则新建） | enableAiMatch+title 渲染按钮 / readOnly 不渲染 / 命中 onChange 回填 / 未命中显「未找匹配的活动原型」/ loading 态 |

**测试纪律**（参 [[feedback_vitest-pitfalls]] / [[feedback_change-gate-baseline]]）：
- vitest 必须在 `frontend/` cwd 跑（`@/` 映射）。
- 用 base/head 失败集合对比，不许新增无关失败；已知 [025] PG 集成 flake 视为 pre-existing。
- tsc `npx tsc --noEmit` 零新增错误（vitest 不做类型检查，须 tsc 双验）。

---

## 6. 文件结构总览

| 类型 | 路径 | 改动 |
|---|---|---|
| 修改 | `frontend/src/domains/timebox/manifest.yaml` | 2.1 description 改名 |
| 修改 | `frontend/src/domains/timebox/cnui/surfaces/EditTimeboxes.tsx` | 2.2 删 125 行重复标题；2.3 补 useEffect；3.2.3 ArchetypePicker 传 enableAiMatch/title |
| 修改 | `frontend/src/domains/timebox/cnui/surfaces/CreateTimebox.tsx` | 3.2.3 ArchetypePicker 传 enableAiMatch/title |
| 修改 | `frontend/src/components/archetype/archetype-picker.tsx` | 3.2.2 新增 enableAiMatch/title props + 按钮 + 未匹配提示 |
| 修改 | `frontend/src/app/actions/intent.ts` | 3.1 parseTimeboxBatchIntentOnly 调 matcher 填 archetypeId；drafts 类型加可选字段 |
| 修改 | `frontend/src/app/actions/activity-archetype.ts` | 3.2.1 新增 matchArchetypeForTitle server action |
| **新建** | `frontend/src/domains/timebox/lib/archetype-matcher.ts` | 3.0 共享匹配原语 |
| **新建** | `frontend/src/domains/timebox/lib/__tests__/archetype-matcher.test.ts` | matcher 单测 |
| 修改 | 对应 `__tests__/` | 见 §5 |

---

## 7. 影响面 / 治理合规

- **Repository Pattern（R-01~04）**：matcher 纯函数接收 archetypes（调用方经 Repository 加载），不直连 DB。✓
- **AI/Rule 边界**：matcher 是 domain logic，aiRuntime 由调用方注入；被动推断在 server action、主动按钮在 server action，均不越界。✓
- **Multi-Tenancy（T-01~04）**：所有 repo 调用透传 `MVP_USER_ID`，与既有 action 一致。✓
- **USOM / DB**：无 schema 变更、无迁移、无新表/列。archetype FK 既有。✓
- **CNUI 注册**：无新 surface（EditTimeboxes/CreateTimebox 早已注册）；manifest 仅改 description 文本，action 名不变 → **不触发 C-1 四联审计**（仍须 pre-check manifest validator 对 description 无文案约束）。✓
- **文档同步**：本任务 runtime-only + UI 微调，按宪章 v2.1.1 不强制 CHANGELOG 条目（与 [023.06]/[023.07] 同模式）；若 team 惯例 [023.x] 系列留痕则补一条 `[023.11]`（plan 阶段决定）。`docs/` 下 design/DB/USOM 文档无受影响内容。

---

## 8. 风险与边界

- **R1（规则召回有限）**："写代码"→"深度专注"这类纯语义映射规则轮抓不到，依赖 LLM 兜底；若 LLM 也<0.7 则留空（用户手选/主动按钮）。可接受，符合"置信度不足保持空白"需求。
- **R2（性能）**：被动推断给 chat 路径加 1 次 repo 查询 + 至多 1 次 LLM；规则命中率高时 LLM 调用为 0。如未来延迟敏感可缓存 archetype 列表（defer）。
- **R3（LLM 幻觉 id）**：matcher 强校验 archetypeId ∈ 目录，幻觉 id → null。
- **R4（不在范围 / defer）**：
  - editTimeboxes 被动推断（打开编辑表单时自动补 archetype）——明确不做，交给主动按钮。
  - archetype 表加 keywords 字段以提升规则召回 ——defer（需 DB 迁移 + UI 配置，独立议题）。
  - editTimeboxes 的 TOCTOU / batch failure UI / MVP_USER_ID 硬码 ——pre-existing 债，不在本 PR。

---

## 9. 未决问题（OQ）

- **OQ-1**：manifest validator 对 description 是否有长度/字符约束？→ implementer pre-check（`npm run validate:manifest` 跑通即放行）。
- **OQ-2**：LLM 匹配 prompt 的 system 文案与 few-shot 示例具体措辞 ——writing-plans / 实现阶段细化（不影响架构）。
- **OQ-3**：[023.11] 是否在 CHANGELOG 留条目 ——plan 阶段决定（默认不留，参 [023.06]/[023.07] 同模式）。
