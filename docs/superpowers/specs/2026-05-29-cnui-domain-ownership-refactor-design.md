# CNUI Domain Ownership 重构设计

**日期**: 2026-05-29
**状态**: 待实施

## 问题

当前 CNUI surface 的组件、类型、渲染和路由逻辑散布在公共层，形成了对具体 domain 的反向依赖：

| 耦合点 | 文件 | 问题 |
|---|---|---|
| 类型定义 | `cnui/types.ts` | `CnuiDomainComponentType` 硬编码 8 个 domain 字符串 |
| 组件目录 | `cnui/catalog.ts` | `DOMAIN_COMPONENTS` 数组硬编码 |
| 渲染器 | `CnuiRenderer.tsx` | 直接 import 4 个 domain surface 组件 |
| 逻辑路由 | `intent.ts` open/submit | 大段 if/else 按 domain+action 分支处理 |

每新增一个 domain 的 CNUI surface，至少要改 4-5 个公共文件，Domain Plugin 实际上不"插拔"。

## 目标

将 CNUI surface 的**组件、数据和提交逻辑**所有权彻底下沉到 domain，公共层只提供注册机制和通用渲染框架。新 domain 添加 surface 时公共层零改动。

## 方案

Manifest 声明 + Handler 约定文件：manifest.yaml 扩展 surface 元数据，逻辑放在 domain 内的 handler 文件中。

## 目录结构

**Domain 侧（以 habits 为例）：**

```
domains/habits/
  manifest.yaml                  # 新增 cnui_surfaces 块
  cnui/
    surfaces/
      HabitActionPanel.tsx       # 从 components/cnui/surfaces/ 迁入
      HabitCheckinPanel.tsx
      HabitCreationCard.tsx
    handlers.ts                  # 导出 open() 和 submit()
```

**公共层（变更后）：**

```
nexus/ai-runtime/cnui/
  types.ts                       # CnuiDomainComponentType 改为 string
  catalog.ts                     # 从 registry 自动收集，删除硬编码数组
  registry.ts                    # 新增：统一收集所有 domain 的 surface 注册

components/cnui/
  CnuiRenderer.tsx               # 改为从 registry 动态查找组件
  CnuiSurfaceWrapper.tsx         # 不变
  cnui-confirm-dialog.tsx        # 不变
  use-cnui-lifecycle.ts          # 不变
  surfaces/                      # 清空
```

## Manifest Schema 扩展

### 1. `intent_triggers` 新增 `response_type` 字段（区块 A）

统一声明 action 的响应方式，互斥且明确：

```yaml
intent_triggers:
  - action: activateHabit
    shortcut: /activateHabit
    description: 激活草稿状态的习惯
    response_type: cnui                # 新增
    cnui_surface: habit-action-panel   # response_type=cnui 时的配套字段

  - action: logHabit
    shortcut: /logHabit
    description: 记录习惯打卡
    response_type: cnui
    cnui_surface: habit-checkin-panel

  - action: view_list
    shortcut: /habits
    description: 习惯管理
    response_type: page                # 页面导航
    view_route: /habits

  - action: list_active_habits
    shortcut: /myHabits
    description: 在对话中查看习惯列表
    response_type: cnui
    cnui_surface: habit-list-card
```

**`response_type` 合法值**：

| 值 | 含义 | 配套字段 |
|---|---|---|
| `page` | 页面导航 | `view_route` |
| `cnui` | 对话内 CNUI surface | `cnui_surface` |
| `text` | 纯文本回复（无交互） | 无 |

**启动时校验规则**：
- `response_type` 与配套字段必须一致（如 `response_type: cnui` 必须有 `cnui_surface`）
- 如果 action 同时出现在 `generation_actions` 中且声明了 `cnui_surface_type`，则 `intent_triggers` 中不需要重复声明 `cnui_surface`（优先取 `generation_actions` 的）
- `response_type` 是互斥的，一个 action 只能有一种响应方式

**与 `generation_actions` / `query_actions` 的关系**：正交设计——
- `generation_actions` / `query_actions` 声明**执行路径元数据**（contexts、session、handler）
- `response_type` 声明**用户看到的交互形式**
- 两者独立，同一 action 可以同时有 `generation_actions` 元数据和 `response_type: cnui`

### 2. 新增 `cnui_surfaces` 块（区块 K）

与 `generation_actions` 平级，声明 surface 的组件和逻辑归属：

```yaml
cnui_surfaces:
  habit-action-panel:
    description: 习惯生命周期操作面板（激活/暂停/归档/重新激活）
    handler: ./cnui/handlers

  habit-checkin-panel:
    description: 习惯打卡面板（批量/逐条/详情）
    handler: ./cnui/handlers

  habit-creation-card:
    description: 习惯创建表单卡片
    handler: ./cnui/handlers
```

- key 即 surface type，与 `intent_triggers[].cnui_surface` 或 `generation_actions.*.cnui_surface_type` 对应
- `handler` 指向 open/submit 处理文件，同一 handler 可服务多个 surface
- 组件路径按约定自动发现：`{domain_dir}/cnui/surfaces/{PascalCase(surfaceType)}.tsx`
- 不需要在 manifest 中声明组件路径，减少冗余

## Handler 接口

公共层定义接口：

```typescript
// nexus/ai-runtime/cnui/types.ts 新增

export interface CnuiSurfaceHandler {
  open: (action: string) => Promise<CnuiSurfaceOpenResult>
  submit: (action: string, fields: Record<string, unknown>) => Promise<CnuiSurfaceSubmitResult>
}

export interface CnuiSurfaceOpenResult {
  content: string
  dataSnapshot: Record<string, unknown>
}

export interface CnuiSurfaceSubmitResult {
  success: boolean
  error?: string
  data?: Record<string, unknown>
}
```

Domain 实现示例（habits）：

```typescript
// domains/habits/cnui/handlers.ts

const LIFECYCLE_STATUS_MAP: Record<string, string> = {
  activateHabit: 'draft',
  suspendHabit: 'active',
  archiveHabit: 'suspended',
  reactivateHabit: 'suspended',
}

const LIFECYCLE_SM_ACTION: Record<string, string> = {
  activateHabit: 'activate',
  suspendHabit: 'suspend',
  archiveHabit: 'archive',
  reactivateHabit: 'reactivate',
}

export const habitCnuiHandler: CnuiSurfaceHandler = {
  async open(action) {
    if (action === 'logHabit') {
      const allHabits = await getHabitsByStatus('active')
      const pending = allHabits.filter(h => h.trackable)
      return { content: '请选择要打卡的习惯', dataSnapshot: { items: pending } }
    }

    if (action in LIFECYCLE_STATUS_MAP) {
      const status = LIFECYCLE_STATUS_MAP[action]
      const items = await getHabitsByStatus(status)
      return {
        content: `请选择要${getLabel(action)}的习惯`,
        dataSnapshot: { action: LIFECYCLE_SM_ACTION[action], items },
      }
    }

    return { content: '请填写信息', dataSnapshot: {} }
  },

  async submit(action, fields) {
    if (action === 'createHabit') {
      const result = validateHabitFields(fields, 'createHabit')
      if (!result.valid) return { success: false, error: result.errors.join('；') }
      return submitHabitIntent(fields as CreateHabitInput)
    }

    if (action in LIFECYCLE_SM_ACTION) {
      const selectedIds = fields.selectedIds as string[]
      for (const id of selectedIds) {
        await updateHabitStatus(id, LIFECYCLE_SM_ACTION[action])
      }
      return { success: true }
    }

    if (action === 'logHabit') {
      const selectedIds = fields.selectedIds as string[]
      const detailFields = (fields.detailFields ?? {}) as Record<string, unknown>
      return batchLogHabits(selectedIds.map(id => ({ habitId: id, fields: detailFields[id] })))
    }

    return { success: false, error: `Unknown action: ${action}` }
  },
}
```

Handler 内部可包含 if/else，但属于 domain 内部逻辑，不污染公共层。

## 公共层 Registry

```typescript
// nexus/ai-runtime/cnui/registry.ts

interface SurfaceRegistration {
  domainId: string
  surfaceType: string
  component: React.LazyExoticComponent<any>
  handler: CnuiSurfaceHandler
}

class CnuiSurfaceRegistry {
  private map = new Map<string, SurfaceRegistration>()

  register(domainId: string, surfaceType: string, reg: Omit<SurfaceRegistration, 'domainId' | 'surfaceType'>) {
    this.map.set(surfaceType, { domainId, surfaceType, ...reg })
  }

  get(surfaceType: string) {
    return this.map.get(surfaceType)
  }

  getByDomain(domainId: string) {
    return [...this.map.values()].filter(r => r.domainId === domainId)
  }

  allTypes() {
    return [...this.map.keys()]
  }
}

export const cnuiRegistry = new CnuiSurfaceRegistry()
```

Domain 入口自注册：

```typescript
// domains/habits/index.ts
import { cnuiRegistry } from '@/nexus/ai-runtime/cnui/registry'
import { habitCnuiHandler } from './cnui/handlers'

cnuiRegistry.register('habits', 'habit-action-panel', {
  component: React.lazy(() => import('./cnui/surfaces/HabitActionPanel')),
  handler: habitCnuiHandler,
})
cnuiRegistry.register('habits', 'habit-checkin-panel', {
  component: React.lazy(() => import('./cnui/surfaces/HabitCheckinPanel')),
  handler: habitCnuiHandler,
})
cnuiRegistry.register('habits', 'habit-creation-card', {
  component: React.lazy(() => import('./cnui/surfaces/HabitCreationCard')),
  handler: habitCnuiHandler,
})
```

## 公共层改造

### CnuiRenderer

删除所有 domain 组件 import，改为从 registry 查找：

```typescript
import { cnuiRegistry } from '@/nexus/ai-runtime/cnui/registry'

export function CnuiRenderer({ surfaceType, ...props }: CnuiRendererProps) {
  const reg = cnuiRegistry.get(surfaceType)
  if (!reg) return <div>未知的卡片类型: {surfaceType}</div>

  const Component = reg.component
  return <Component surfaceType={surfaceType} {...props} />
}
```

### intent.ts

`openCnuiSurface` 和 `submitCnuiSurface` 简化为调用 handler：

```typescript
// openCnuiSurface
const reg = cnuiRegistry.get(surfaceType)
if (!reg) return { success: false, error: `未注册的 surface: ${surfaceType}` }
const result = await reg.handler.open(action)
return {
  content: result.content,
  surface: {
    cnuiSurfaceId: crypto.randomUUID(),
    cnuiSurfaceType: surfaceType,
    domainId,
    action,
    dataSnapshot: result.dataSnapshot,
  },
}

// submitCnuiSurface
const reg = cnuiRegistry.getByDomain(domainId).find(...)
return reg.handler.submit(action, fields)
```

## Manifest 诊断工具（`scripts/validate-manifest.ts`）

新增 CLI 诊断程序，校验所有 domain 的 `manifest.yaml` 是否符合规范，防止无效定义进入运行时。

### 运行方式

```bash
# 手动运行
npx tsx scripts/validate-manifest.ts

# 集成到 dev/build 流程（package.json）
npm run validate:manifest
```

建议在 `predev` / `prebuild` 中与 `generate:routes` 一起调用：

```json
{
  "scripts": {
    "validate:manifest": "npx tsx scripts/validate-manifest.ts",
    "predev": "npm run generate:routes && npm run validate:manifest",
    "prebuild": "npm run generate:routes && npm run validate:manifest"
  }
}
```

### 校验规则

诊断程序扫描 `domains/*/manifest.yaml`，逐条检查以下规则：

**区块 A（intent_triggers）校验：**

| 规则 | 级别 | 说明 |
|---|---|---|
| `response_type` 合法性 | error | 必须是 `page` / `cnui` / `text` 之一或省略 |
| `response_type` 与配套字段一致 | error | `page` 必须有 `view_route`；`cnui` 必须有 `cnui_surface`；`text` 不得有配套字段 |
| `cnui_surface` 引用存在 | error | 必须在 `cnui_surfaces` 块中有对应条目 |
| `view_route` 引用存在 | warning | 对应的页面组件文件应存在 |
| `generation_actions` 中已声明 `cnui_surface_type` 的 action 不需要重复声明 `cnui_surface` | info | 避免冗余定义 |

**区块 K（cnui_surfaces）校验：**

| 规则 | 级别 | 说明 |
|---|---|---|
| `handler` 文件存在 | error | 指向的 `.ts` 文件必须存在 |
| surface 组件文件存在 | error | 按约定 `cnui/surfaces/{PascalCase(key)}.tsx` 必须存在 |
| surface type 不跨 domain 重复 | error | 全局唯一，不可两个 domain 注册同一 surface type |
| 被至少一个 intent_trigger 或 generation_action 引用 | warning | 未被引用的 surface 可能是死代码 |

**跨区块一致性校验：**

| 规则 | 级别 | 说明 |
|---|---|---|
| `generation_actions.*.cnui_surface_type` 必须在 `cnui_surfaces` 中有对应条目 | error | 引用完整性 |
| `query_actions.*.cnui_surface` 必须在 `cnui_surfaces` 中有对应条目 | error | 引用完整性 |
| 所有 `intent_triggers` 中的 action 名不重复 | error | 同一 domain 内 action 唯一 |

### 输出格式

```
✓ habits/manifest.yaml — 5 checks passed
✗ timebox/manifest.yaml — 2 errors, 1 warning

  ERROR  timebox/manifest.yaml:12
         intent_trigger "adjustSchedule" has response_type: cnui but no cnui_surface field

  ERROR  timebox/manifest.yaml:45
         cnui_surfaces "timebox-list" references handler "./cnui/handlers" but file does not exist:
         domains/timebox/cnui/handlers.ts

  WARN   timebox/manifest.yaml:50
         cnui_surfaces "timebox-status-card" is not referenced by any intent_trigger or generation_action

Summary: 2 domains checked, 2 errors, 1 warning
```

退出码：0 = 全部通过，1 = 有 error 级别问题。

### 实现要求

- 使用 `yaml` 库解析 manifest（项目中已有依赖）
- 纯 Node.js 脚本，无外部服务依赖
- 校验逻辑可被单元测试覆盖
- 放在 `scripts/` 目录下，与 `generate-routes.ts` 同级

## 迁移步骤

分 5 步，每步可独立验证，每步一个 git commit：

### Step 1：基础设施搭建（增量，不改现有行为）

- 新增 `nexus/ai-runtime/cnui/registry.ts`
- `types.ts` 新增 `CnuiSurfaceHandler`、`CnuiSurfaceOpenResult`、`CnuiSurfaceSubmitResult`
- `CnuiDomainComponentType` 改为 `string`
- 验证：现有功能不受影响

### Step 2：Domain 侧文件迁移

- 创建 `domains/habits/cnui/surfaces/`，迁入 3 个 habits 组件
- 创建 `domains/habits/cnui/handlers.ts`，从 `intent.ts` 提取 habits 逻辑
- `domains/habits/index.ts` 添加注册调用
- `manifest.yaml` 新增 `cnui_surfaces` 块，`intent_triggers` 新增 `response_type` 字段
- 验证：habits surface 功能不变

### Step 3：公共层改造

- `CnuiRenderer.tsx` 改为从 registry 查找
- `intent.ts` open/submit 改为调用 handler
- `catalog.ts` 删除硬编码 `DOMAIN_COMPONENTS`
- 清空 `components/cnui/surfaces/`
- 验证：所有 habits surface 功能不变

### Step 4：TimeboxList 迁移

- 将 `TimeboxList` 迁入 `domains/timebox/cnui/surfaces/`
- 创建 timebox handler
- timebox domain 入口注册
- timebox `manifest.yaml` 新增 `cnui_surfaces` 块和 `response_type` 字段
- 验证：timebox surface 功能不变

### Step 5：诊断工具

- 创建 `scripts/validate-manifest.ts`
- 集成到 `package.json` 的 `predev` / `prebuild`
- 编写校验规则单元测试
- 运行诊断确认所有 domain manifest 合规
- 验证：故意制造一个无效定义，诊断工具能捕获

**回退策略**：每步独立 git commit，Step 2 和 Step 3 可在同一 PR 中确保原子性。

## 治理文档更新

重构完成后，需同步更新以下文档（按优先级排序）：

### Constitution（P0）

1. CN-UI Protocol Constraints 新增第 5 条约束（Domain Surface Ownership）
2. Domain Registration Process 新增 Step 15（CNUI surface 注册）
3. Nexus Inviolability 补充 CNUI 相关说明
4. Manifest Self-Description 补充 `response_type` 和 `cnui_surfaces` 字段说明

### Domain Registration Guide（P0）

1. 总览 Step 列表新增 Step 13（CNUI Surface 实现）
2. 目录结构新增 `cnui/` 目录
3. Manifest 模板新增区块 K（cnui_surfaces）
4. 新增 Step 13 完整内容和检查清单
5. 完成检查清单新增 CNUI 相关项
6. 常见错误模式新增 CNUI 相关条目
7. 区块 A 模板的 `intent_triggers` 示例包含 `response_type` 字段

### Overall Design（P1）

1. Domain Plugin 双轨模型补充 CNUI 职责说明
2. 完整依赖图补充 CNUI 注册关系

## 影响范围

- **新增文件**：`registry.ts`、`domains/habits/cnui/handlers.ts`、`domains/timebox/cnui/handlers.ts`、`scripts/validate-manifest.ts`
- **迁移文件**：4 个 surface 组件从 `components/cnui/surfaces/` 迁入各 domain
- **修改文件**：`CnuiRenderer.tsx`、`intent.ts`、`catalog.ts`、`types.ts`、`manifest.yaml`（habits + timebox）、`package.json`
- **删除**：`components/cnui/surfaces/` 目录清空
- **不涉及**：`CnuiSurfaceWrapper`、`use-cnui-lifecycle`、`cnui-form-adapter`、页面路由
- **文档更新**：Constitution、Domain Registration Guide、Overall Design
