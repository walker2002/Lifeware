# Page Thin Wrapper 重构设计

- **日期**：2026-07-13
- **主题**：6 个手写 `app/<route>/page.tsx` 做薄，附加代码移到 domain 下，让 codegen 工具接管生成
- **范围**：6 个路由页 + 2 个 manifest 文件（okrs 1 处 + timebox 4 处 view_route）+ codegen 工具扩展
- **动机**：架构归位（page.tsx 仅做 URL 边界解包，domain 自包含 server data 与视觉布局）+ codegen 接管（消除 6 条 `not auto-generated` 警告，建立可复用模板）

---

## 1. 背景与问题

### 1.1 现状

`scripts/generate-routes.ts` 是从 `manifest.yaml` 的 `view_routes` 自动生成 `app/<route>/page.tsx` 的 codegen 工具。其模板产出 thin wrapper：

```tsx
import { ComponentName } from "@/..."
export default function ComponentNamePage() {
  return <ComponentName />
}
```

但当前 6 个路由的 page.tsx 是**先于 codegen 工具诞生的手写文件**，各自承载附加逻辑：

| 路由 | page.tsx 附加逻辑 | 行数 |
|---|---|---|
| `/okrs` | async + searchParams.detail + standalone prop + h-screen 容器 | 31 |
| `/tasks` | 简单 wrapper（近乎模板） | 10 |
| `/timeboxes` | async + h-screen 容器 | 17 |
| `/timebox-templates` | async + repo 预取 templates + min-h-full 容器 | 22 |
| `/config/activity-archetypes` | async + repo 预取 archetypes + space-y-4 容器 | 20 |
| `/appointments` | async + 90 天查询窗口 + repo 预取 + h-screen 容器 | 30 |

codegen 工具检测到这些文件缺少 `Auto-generated from domains/` 头标记，默认拒绝覆盖（`generate-routes.ts:260-265`），输出 6 条 `⚠️ Skipping ... not auto-generated` 警告。

### 1.2 根因

1. **历史包袱**：page.tsx 早于 codegen 工具，当时无「page 仅做 URL 解包、domain 自包含」共识。
2. **manifest.component 语义混用**：4 个 view_route 的 `component` 字段直接指向 `app/<route>/page` 文件（如 `app/timeboxes/page`），codegen 若按此生成会循环 import。

### 1.3 附加代码的可移动性

经调研，6 个 page.tsx 的附加逻辑**全部对应 domain 组件已存在的 props 契约**：

| page.tsx 逻辑 | domain 组件已有契约 |
|---|---|
| `OKRWorkspace({standalone, initialDetailId})` | ✅ 已支持 |
| `TimeboxTemplateEditor({initialTemplates})` | ✅ 已支持 |
| `ArchetypeTable({initialData})` | ✅ 已支持 |
| `AppointmentWorkspace({initialItems})` | ✅ 已支持 |

无技术约束阻止附加代码移入 domain。

---

## 2. 设计目标

1. **page.tsx 退化成 thin wrapper**（5-10 行，仅 URL 边界解包）
2. **manifest.view_routes.component 语义统一**指向 domain 组件（消除 `app/` 前缀）
3. **codegen 工具接管**这 6 个路由（消除 `not auto-generated` 警告）
4. **附加代码归位**：repo 预取 → server helper；业务纯函数 → lib；容器布局 → domain 组件
5. **任何中间提交保持可运行**（domain 先行 → manifest 校正 → codegen 扩展 → 最后接管）

---

## 3. 架构设计

### 3.1 重构后分层

```
manifest.yaml
  └─ view_routes.{action}.component ── 统一指向 domain 入口组件
                                       │
codegen 工具 ──读 manifest──> 生成 app/<route>/page.tsx（thin wrapper 5-10 行）
                                 │
                                 ▼
                          <DomainPage initialData={...} /> 或纯渲染

附加代码归属：
  - async + repo 预取      → domains/<d>/lib/server/loadXxx.ts（'server-only'）
  - 业务纯函数（90 天窗口） → domains/<d>/lib/appointment-window.ts
  - h-screen / min-h-full  → domain workspace 组件内部
  - searchParams 解析      → page.tsx（URL 边界属路由层职责）
```

### 3.2 manifest schema 扩展

新增**可选** `page_props` 字段，支持 page.tsx 透传非默认 props：

```yaml
okrs:
  component: domains/okrs/components/okr-workspace
  url: /okrs
  page_props:
    standalone: true                                  # 字面值
    initialDetailId: { from: searchParams, key: detail }  # URL 透传
```

**字段类型定义**：

```ts
type PagePropValue =
  | unknown                                        // 字面值（string/number/boolean）
  | { from: 'searchParams'; key: string }          // URL searchParams 透传

type PageProps = Record<string, PagePropValue>
```

codegen 看到 `page_props` 非空时生成 async server component 签名 + searchParams 解包：

```tsx
export default async function OKRsPage(
  { searchParams }: { searchParams: Promise<Record<string, string | undefined>> }
) {
  const sp = await searchParams
  return <OKRWorkspace standalone initialDetailId={sp.detail} />
}
```

无 `page_props` 时退回当前同步模板。

---

## 4. 各路由具体改造

### 4.1 manifest view_route 改造一览

| 域 | action | 当前 component | 重构后 component | manifest 改动 |
|---|---|---|---|---|
| habits | view_list | domains/habits/pages/HabitListPage | 不变 | 无 |
| habits | view_statistics | domains/habits/pages/HabitStatisticsPage | 不变 | 无 |
| okrs | okrs | domains/okrs/pages/OkrWorkspacePage | domains/okrs/components/okr-workspace | 改路径 + 加 page_props |
| tasks | tasks | domains/tasks/pages/TaskTreePage | 不变 | 无 |
| timebox | viewTimeboxes | app/timeboxes/page | domains/timebox/components/timeboxes-workspace | 改 |
| timebox | configTimeboxTemplates | domains/timebox/pages/TimeboxTemplatesPage | domains/timebox/components/timebox-templates-page | 改路径 |
| timebox | config_activity_archetypes | app/config/activity-archetypes/page | domains/timebox/config/activity-archetypes-page | 改 |
| timebox | viewAppointments | app/appointments/page | domains/timebox/components/appointment-page | 改 |

### 4.2 新增 domain 文件

#### Server helpers（`lib/server/`，`'server-only'` 标记）

| 文件 | 职责 |
|---|---|
| `domains/timebox/lib/server/load-templates.ts` | `findByUser(MVP_USER_ID)` 返回 templates |
| `domains/timebox/lib/server/load-activity-archetypes.ts` | `findByUser(MVP_USER_ID)` 返回 archetypes |
| `domains/timebox/lib/server/load-appointments.ts` | 调 `getAppointmentPageWindow()` + `getAppointmentsByRange()` |

#### 业务纯函数（`lib/`，非 server-only）

| 文件 | 职责 |
|---|---|
| `domains/timebox/lib/appointment-window.ts` | `getAppointmentPageWindow(now?)` 返回 `{start, end}` ISO string（±90 天） |

#### Domain 入口组件（async server component）

| 文件 | 职责 | 容器 |
|---|---|---|
| `domains/timebox/config/activity-archetypes-page.tsx` | 拉 archetypes → `<ArchetypeTable initialData />` | `<div className="space-y-4">` |
| `domains/timebox/components/timebox-templates-page.tsx` | 拉 templates → `<TimeboxTemplateEditor initialTemplates />` | `<div className="min-h-full flex flex-col">` |
| `domains/timebox/components/appointment-page.tsx` | 拉 appointments → `<AppointmentWorkspace initialItems />` | `<div className="h-screen flex flex-col">` |

### 4.3 现有 workspace 组件改动（仅加容器）

| 组件 | 改动 |
|---|---|
| `OKRWorkspace` | 外层包 `<div className="h-screen flex flex-col">`（从 app/okrs/page.tsx 搬入） |
| `TimeboxesWorkspace` | 外层包 `<div className="h-screen flex flex-col">`（从 app/timeboxes/page.tsx 搬入） |

**关键约束**：仅加外层容器 div，不触碰组件内部布局逻辑（[024.1] B5 修复的 flex 滚动链不可破）。

### 4.4 page.tsx 重构后形态

| 路由 | 重构后 page.tsx |
|---|---|
| `/tasks` | `<TaskTreePage />`（codegen 默认模板） |
| `/okrs` | async + searchParams → `<OKRWorkspace standalone initialDetailId={detail} />` |
| `/timeboxes` | `<TimeboxesWorkspace />`（容器已在组件内） |
| `/timebox-templates` | `<TimeboxTemplatesPage />`（domain 入口自拉数据） |
| `/config/activity-archetypes` | `<ActivityArchetypesPage />`（domain 入口自拉数据） |
| `/appointments` | `<AppointmentPage />`（domain 入口自拉数据） |

---

## 5. codegen 工具扩展

### 5.1 改动点

`scripts/generate-routes.ts`：

1. **类型扩展**：`RouteEntry` 加 `pageProps?: PageProps`；`RawManifest` 解析 `page_props` 字段。
2. **生成器扩展**：`generateRouteFileContent(route)` 检测 `pageProps`：
   - 非空 → 生成 async 签名 + searchParams 解包 + props 解析
   - 空 → 退回当前同步模板
3. **校验扩展**：`validateRoutes` 校验 `page_props.{from: searchParams}` 的 `key` 合法性。

### 5.2 风险评估

改动局限在 codegen 工具 + 6 个 page.tsx + 4 个新 domain 文件 + 2 个容器搬入。**不触碰** 4 个 workspace 组件内部业务逻辑。

---

## 6. 迁移顺序

```
阶段 1：domain 自包含化（不碰 app/page.tsx）
  ├─ 新建 lib/appointment-window.ts 纯函数 + 单测
  ├─ 新建 3 个 server helpers (lib/server/load-templates / load-activity-archetypes / load-appointments)
  ├─ 新建 3 个 domain 入口组件
  └─ 2 个 workspace 组件加容器包裹（OKRWorkspace / TimeboxesWorkspace）

阶段 2：manifest 校准
  └─ 4 个 view_route.component 改指向 domain（去 app/ 前缀）+ okrs 加 page_props

阶段 3：codegen 工具扩展
  ├─ generate-routes.ts 支持 page_props
  └─ 新增 codegen 单元测试

阶段 4：一次性接管 6 个 page.tsx
  ├─ npm run generate:routes --force（覆盖手写文件）
  ├─ 验证 6 个文件都带 auto-generated header
  └─ git diff 审查每个文件确实退化成 thin wrapper

阶段 5：验证全闸
  ├─ vitest（codegen 新单测 + 现有合规测试）
  ├─ tsc 0 新增
  ├─ dev server + curl 6 路由 → HTTP 200 + 0 RSC error
  └─ /browse 截图对比 3 个有 overflow 的页面（okrs / timeboxes / appointments）
```

**顺序依据**：阶段 1-2 让 domain 自包含 + manifest 正确，此时 page.tsx 还在手写态但指向已变的 domain（仍能跑）。阶段 4 才用 codegen 覆盖。任何中间提交保持可运行。

---

## 7. 验证策略

### 7.1 验证矩阵

| 维度 | 方法 | 关键风险 |
|---|---|---|
| codegen 单元测试 | vitest 测 `generateRouteFileContent(page_props)` 产出 | page_props 解析 + async 签名生成 |
| manifest 合规 | 现有 `okrs-compliance.test.ts` + 新增 view_route component 语义断言 | component 不再含 `app/` 前缀 |
| server-only 正确性 | dev server 编译（RSC boundary） | `'server-only'` 防 client 误引 |
| HTTP smoke | curl 6 个路由 → 200 + 0 RSC error | async server component 接线 |
| 视觉回归 | `/browse` 截图对比重构前后 | 容器搬进 workspace 后 flex 滚动链可能破 |

### 7.2 视觉回归是头号风险

容器 `h-screen flex flex-col` 从 page.tsx 搬进 workspace 组件，DOM 层级变化可能触发已知陷阱（Chromium stretch-flex percent-height bug）。**必须 `/browse` 真实截图验证**，不能只看 HTTP 200。

重点验证 3 个有内层 overflow 的页面：
- `/okrs`（左面板 overflow-y-auto，[024.1] B5 修复过）
- `/timeboxes`（同款 h-screen 锚定）
- `/appointments`（同款）

---

## 8. YAGNI 边界

本 PR **不做**：

- ❌ 不重构 workspace 组件**内部**布局逻辑（仅加外层容器 div）
- ❌ 不统一 view_route 命名风格（kebab vs snake 混用是历史债）
- ❌ 不大改 `manifest-loader` schema 结构（仅加 `page_props` 可选字段）
- ❌ 不处理 `_rulefixture` / `__tests__` / `manifest-loader` 孤儿目录（与本次无关）
- ❌ 不改 `required_fields`（与 view_route 是独立概念，见 [022.01] Phase 3 边界）

---

## 9. 待解决问题（OQ）

- **OQ-1**：`config/activity-archetypes` 路由归属 timebox 域是否合理？当前 archetype 已跨 habits/timebox 复用（[023] A3），未来可能独立成 `archetype` 域。本 PR 维持现状（仍归 timebox），独立成域是后续架构决策。
- **OQ-2**：`page_props` 的 `{ from: searchParams }` 是否需要支持类型标注（如 `detail` 是 `string | undefined`）？当前默认全 `string | undefined`，复杂类型（number/array）留待真实需求出现再扩展。
