---
title: Manifest 编写指南（CNUI Surface, Intent Trigger, Generation/Query Action）
last_updated: 2026-07-12
audience: 新加入 Lifeware Domain 开发的工程师
pre-push-hook: validate:manifest（`frontend/scripts/validate-manifest.ts`）
---

# Manifest 编写指南

> 本指南沉淀 `frontend/scripts/validate-manifest.ts` 的全部约束（447 行），供新开发者一次过 hook。新增 / 修改 `frontend/src/domains/*/manifest.yaml` 前必读。

## 1. 文件位置 & 入口

每个 Domain 一个 `manifest.yaml`：

```
frontend/src/domains/<domain-id>/manifest.yaml
```

`<domain-id>` 是目录名（`timebox` / `tasks` / `habits` / `okrs` / `appointments` / ...）。

`manifest.id` 必须等于目录名（否则 `id-mismatch` warning）。

## 2. 必填字段

| 字段 | 必要性 | 说明 |
|---|---|---|
| `id` | 必填（error） | 与目录名一致；用户感知标识 |
| `name` | 建议填（warning） | 中文展示名（如「时间盒」「任务」「习惯」） |
| `version` | 建议填（warning） | 语义化版本号（`1.0.0` / `0.X.X` 等）|

`missing-id` 是 error 阻断；`missing-name` / `missing-version` 是 warning 不阻断。

## 3. 顶级区块 & 顺序约定

```yaml
id: <domain-id>
name: <中文明>
version: <semver>
field_metadata:           # C 块：per-objectType 嵌套（[026] T23）
  Task: { ... }           # 不允许顶层平铺！（C-flat-field-metadata error）
intent_triggers:          # A 块
  - action: ...
    response_type: page | cnui | text
    view_route: <route>
    cnui_surface: <surface-type>
cnui_surfaces:            # K 块（surfaceType: 配置）
  <surface-type>:
    handler: './cnui/handlers'             # 相对 domain 目录
    component: <symbol>                    # 表面组件 export 名（隐式由文件查）
    data_model: ...
generation_actions:        # G 块（action key: 配置）
  <action-key>:
    handler: ...
    cnui_surface_type: <surface-type>
query_actions:             # Q 块
  <action-key>:
    handler: ...
    cnui_surface: <surface-type>
lifecycle:                 # L 块
  statuses: [...]
  transitions: [...]
subscribed_events: [...]   # E 块
```

## 4. 命名约定

### 4.1 Surface Type 命名

`cnui_surfaces.<surface-type>` 用 **kebab-case**（manifest 内透传客户端注册）：

```yaml
cnui_surfaces:
  create-timebox:           # ✓ kebab-case
  edit-timeboxes:           # ✓
  CreateTimebox:            # ✗ 不要 PascalCase（客户端注册 kebab，kebab → Pascal 文件名约定）
```

### 4.2 表面组件文件命名（K-component 约束）

`cnui_surfaces.<surface-type>` 对应 **PascalCase.tsx** 组件文件。validator 把 `kebab-case` → `PascalCase` 自动转换，找对应文件：

| Surface Type | 寻找文件 |
|---|---|
| `create-timebox` | `cnui/surfaces/CreateTimebox.tsx` |
| `edit-timeboxes` | `cnui/surfaces/EditTimeboxes.tsx` |
| `schedule-proposal` | `cnui/surfaces/ScheduleProposal.tsx` |

**强约束（K-component-not-found error）**：文件必须存在。否则 pre-push hook 拦截。

```bash
# 防踩坑：新增 surface 后立即验证
npx tsx scripts/validate-manifest.ts
```

### 4.3 Handler 文件命名（K-handler-not-found error）

`cnui_surfaces.<surface-type>.handler` 是相对 domain 目录的 TS 文件路径（不含扩展名）：

```yaml
cnui_surfaces:
  create-timebox:
    handler: './cnui/handlers'    # → src/domains/timebox/cnui/handlers.ts
```

**强约束（error）**：handler 文件必须存在。

## 5. 区块 A: intent_triggers 规则

每条 trigger 必填：
- `action`（唯一字符串，不允许重复：`A-duplicate-action` error）
- `response_type`: `page` | `cnui` | `text`（`A-invalid-response-type` error）

按 response_type 配套字段：

| response_type | 必填字段 | 违规 |
|---|---|---|
| `page` | `view_route: <route>` | `A-missing-view-route` error |
| `cnui` | `cnui_surface: <surface-type>`（或 generation_actions 兜底） | `A-missing-cnui-surface` warning |
| `text` | 无 | — |

**特例**：
- `view_route` 存在 → `response_type` 必须 = `page`（`A-view-route-needs-page` error）
- 引用不存在 `cnui_surface` → `A-cnui-surface-not-found` error
- generation_actions 已声明 `cnui_surface_type` 时，intent_trigger 可省 cnui_surface：`A-redundant-cnui-surface` info

## 6. 区块 K: cnui_surfaces 规则

每个 surface 配置：
- `handler: '<rel-path>'`（推荐；缺则 `K-missing-handler` warning）
- 组件文件 PascalCase 命名（K-component-not-found error，见 §4.2）

被引用检查（`K-unreferenced-surface` warning）：
- 必须被以下任一处引用：
  - `intent_triggers[*].cnui_surface`
  - `generation_actions[*].cnui_surface_type`
  - `query_actions[*].cnui_surface`

不被引用 → 警告（保留 surface 但需确认是否 dead code）。

## 7. 区块 G/Q: generation_actions & query_actions

### 7.1 generation_actions

- `cnui_surface_type` 引用 → 必须在 cnui_surfaces 中存在（`GA-surface-not-found` error）
- 有 cnui surface 时，对应 `intent_triggers` 必须声明 `response_type: cnui`（`GA-missing-trigger-response-type` error）

### 7.2 query_actions

- `cnui_surface` 引用 → 必须在 cnui_surfaces 中存在（`QA-surface-not-found` error）

## 8. 跨域约束

**Cross-domain surface 唯一性**（`cross-domain-surface-duplicate` error）：
- `cnui_surfaces.<surface-type>` 不允许跨 domain 重复
- 一个 surface type 全局唯一 owner

这意味着新增 surface 前先 grep 确认无重复命名：

```bash
grep -rn "<your-surface-type>" frontend/src/domains/*/manifest.yaml
```

## 9. 区块 C: field_metadata 嵌套结构

```yaml
# ✓ 正确：[026] T23 per-objectType 嵌套
field_metadata:
  Task:
    priority: { type: enum, ... }
    dueDate: { type: timestamp, ... }
  Habit:
    streak: { type: integer, ... }

# ✗ 错误：顶层平铺（[026] T23 之前格式）
field_metadata:
  priority: { type: enum, ... }      # ← C-flat-field-metadata error
```

## 10. 区块 L: lifecycle

`lifecycle.statuses` / `lifecycle.transitions` 由 `validate-rules-registry` 独立校验（`frontend/scripts/validate-rules-registry.ts`），与 `STATUS_TRANSITION_ACTIONS` 同步：

```yaml
lifecycle:
  statuses: [draft, active, archived]    # 终态集合 + 非终态
  transitions:
    - { from: draft, to: active, action: activate }
    - { from: active, to: archived, action: archive }
```

`validate-rules-registry` 强制：
- objectType 用 PascalCase（timebox → Timebox，appointment → Appointment）
- `STATUS_TRANSITION_ACTIONS` 与 manifest.lifecycle 一致
- 排除 `create`（特殊注入不算 transition）

## 11. 执行命令

```bash
cd frontend && npx tsx scripts/validate-manifest.ts    # 单跑 manifest 校验
cd frontend && npm run validate:manifest               # 通过 npm script（pre-push hook 之一）
cd frontend && npm run validate:rules-registry         # 另跑 lifecycle 校验
```

Pre-push hook 链：
1. `validate:manifest` ← 本指南覆盖（K/A/C/G/Q 区块）
2. `validate:rules-registry` ← lifecycle 同步校验（[023.13] Critical Fix 引入）
3. `validate:domain-structure` ← Domain 横切结构校验

## 12. 常见错误速查

| 错误 | 修复 |
|---|---|
| `K-component-not-found` | 把 `cnui/surfaces/<X>.tsx` 文件名按 surfaceType 转 PascalCase（如 `create-timebox` → `CreateTimebox`）|
| `K-handler-not-found` | 检查 `handler` 相对路径是否正确（相对 domain 目录，无 `.ts` 后缀）|
| `A-cnui-surface-not-found` | 检查 `cnui_surface` 字段值是否拼写与 cnui_surfaces 块一致 |
| `A-missing-view-route` | response_type=page 时必须加 view_route |
| `A-view-route-needs-page` | view_route 与 response_type 不匹配；要么改 response_type=page，要么删 view_route |
| `A-missing-cnui-surface` | response_type=cnui 时加 cnui_surface，或在 generation_actions 加 cnui_surface_type |
| `GA-surface-not-found` | generation_actions[*].cnui_surface_type 在 cnui_surfaces 中不存在 |
| `QA-surface-not-found` | query_actions[*].cnui_surface 在 cnui_surfaces 中不存在 |
| `cross-domain-surface-duplicate` | 改 surfaceType 名（全局唯一）|
| `C-flat-field-metadata` | 重构为 per-objectType 嵌套（见 §9）|
| `missing-id` | 加 `id: <domain-id>`（与目录名一致）|

## 13. 实战示例

完整时间盒 manifest（参考 lifeware-timebox 实际 schema）：

```yaml
id: timebox
name: 时间盒
version: 1.0.0
field_metadata:
  Timebox:
    title: { type: text, mutation_mode: content }
    startTime: { type: timestamp, mutation_mode: content }
    endTime: { type: timestamp, mutation_mode: content }
    status: { type: enum, mutation_mode: fact }      # 走 SM
    activityArchetypeId: { type: fk, mutation_mode: fact }
intent_triggers:
  - action: createTimebox
    response_type: cnui
    cnui_surface: create-timebox
  - action: editTimeboxes
    response_type: cnui
    cnui_surface: edit-timeboxes
  - action: logTimebox
    response_type: cnui
    cnui_surface: log-timebox
  - action: scheduleProposal
    response_type: cnui
    cnui_surface: schedule-proposal
  - action: /smartTimeboxes
    response_type: cnui
    cnui_surface: schedule-proposal        # 重定向
    # 或独立 surface？看产品决策
cnui_surfaces:
  create-timebox:
    handler: './cnui/handlers'
    data_model:
      items: { type: array, items: { title, startTime, endTime } }
  edit-timeboxes:
    handler: './cnui/handlers'
  log-timebox:
    handler: './cnui/handlers'
  schedule-proposal:
    handler: './cnui/handlers'
generation_actions:
  createSmartTimeboxes:
    handler: './orchestration-handler'
  scheduleProposal:
    handler: './orchestration-handler'
    cnui_surface_type: schedule-proposal
lifecycle:
  statuses: [planned, logged, cancelled]
  transitions:
    - { from: planned, to: logged, action: logTimebox }
    - { from: planned, to: cancelled, action: cancelTimebox }
    - { from: logged, to: planned, action: revertTimebox }
    - { from: cancelled, to: planned, action: revertTimebox }
subscribed_events:
  - TaskCreated
  - HabitLogged
  - OKRUpdated
```

---

**最后更新**: 2026-07-12 · 与 `frontend/scripts/validate-manifest.ts` 同步 ·
关联: `docs/tech-debt/TD-013-manifest-validator-pascalcase-undocumented.md`（[TD-013] 关闭理由）
