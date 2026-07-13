# Lifeware Domain 开发权威指南（范式 + 注册 + 治理）

> **归属**：第二层（`docs/`，协同维护，Claude 保代码一致 / 用户定义意图）。本文件是 **Domain 开发的唯一权威文档**——整合原 `mydocs/core/LW_domain_注册指南`（机械注册步骤）与 [019] Domain 开发范式（范式模型 + 治理 + CI）。后续开发者/AI 只看本文件。
> **结构**：**Part I 范式与治理**（为什么 + 规则 + 强制）→ **Part II 注册步骤**（Step 1–13 机械指南）。`docs/route-generation-spec.md` 为**下级文件**（路由生成实现细节，本文件 Step 6 引用，内容不冲突）。
> **宪法关系**：Part I 是 constitution §III/VI/VIII + §CN-UI（第 4 条已 supersede）+ **§IX Domain Development Paradigm**（v2.0.0，2026-06-22 生效）的操作展开；§IX 修订记录见 `.specify/amendments/proposed-IX-domain-paradigm.md`（含对 §CN-UI 第 4 条的显式 supersede，✅ 已生效）。

**变更记录**：
- **2026_07_03（[026] T21）**：§4.1 Sunset 豁免清单移除 timebox 一行（[026] T6 已落地 timebox/rules-registry.ts 含 timeboxRuleRegistry + itineraryRuleRegistry，hooks.ts 调 evaluateDomainRules；validate:structure 仍 0 errors）。§7 四域现状对照表 timebox L3 状态从 ❌ → ✅ registry+evaluate。
- **2026_06_24（[020] registry 即 SSOT）**：规则三层范式收敛 —— manifest 不再声明 `rules:` 区块（删除 C 区 label/required + L 区 rules）；registry 即 SSOT（每条规则自带 `{check, fields, message}` meta）；evaluateDomainRules/useManifestRules/realtime 改读 registry 参数（删 get-realtime-rules 中转）；validator 删 integrity.ts + validate-manifest 区块 G + 补 L3-realtime-singlefield CI check；constitution v2.1.0 MINOR（§IX/§VIII/§III 修正）。Step 2 manifest 模板 区块 L 注释化。Part I 治理表 L3-2 更新。
- **2026_06_21（Part II 对齐）**：注册步骤全面对齐 tasks 参考实现——Step 2 manifest 模板补 `rules:` 区块 / `field_metadata.mutation_mode` / `cnui_surfaces` 改 map / 根字段 `domain_id`→`id`；Step 3 hooks 改工厂函数 + onValidate 委托 `evaluateDomainRules`；Step 4 schema 位置改 `src/lib/db/schema.ts` 集中；Step 5 repository 改目录；**新增 Step 5.5 组装 mutation-service**；Step 13 cnui 注册签名对齐 tasks；概念统一 `requires_full_validate`→`mutation_mode`（FactField/ContentField/PresentationField）；编号对齐总览（页面 Step 6 / 注册 Step 7 / Markdown Step 8）。
- **2026_06_21**：[019] 整合——原 `mydocs/core/LW_domain_注册指南` 移入 `docs/`（归属转第二层）并与 `docs/domain-paradigm.md` 合并为本权威文件；新增 **Part I 范式与治理**（写入口两合法路径适用场景/跨字段红线 `mutation_mode` 字段分类/治理 must-should+sunset 豁免/CI validator/C-DC 检查清单 [CI]/[HUMAN]/四域现状对照）；Part II Step 3/5.5/13 加 paradigm 对齐说明。经 /plan-eng-review 2026-06-21 通过。
- **2026_05_29**：新增 CNUI Domain Surface Ownership — intent_triggers 添加 `response_type` 字段；新增区块 K（cnui_surfaces）；新增 Step 13（CNUI Surface 实现）；目录结构添加 cnui/ 目录；检查清单和常见错误模式补充 CNUI 相关条目
- **2026_05_26**：新增构建时路由生成 — manifest.view_routes 新增 url 字段；通过 scripts/generate-routes.ts 自动生成 app/ 路由文件；package.json 集成 predev/prebuild hooks；实现 Domain 完全独立性
- **2026_05_25**：同步代码变更 — intent_triggers 添加 `shortcut` 字段，`view_route` 改为独立属性；lifecycle transitions 添加 `action`/`event_type`；独立 `view_routes` 区块（区块 G）；`generation_actions` 改为 `contexts` (id/query/params 数组)，`cnui_surface` → `cnui_surface_type`，`session_mode` → `session_enabled`；`query_actions` 改为 `context_capabilities` (id/query/params 数组)；`templates` 改为嵌套 `markdown` 子结构；区块编号更新为 A-J

关联文档：
- `.specify/memory/constitution.md`（架构治理 canonical — §III/VI/VIII/§CN-UI；§IX 修订提案 pending）
- `mydocs/core/LW_overall_总体设计.md`（架构约束）/ `docs/usom-design.md`（对象类型定义）
- `docs/route-generation-spec.md`（**下级**：路由生成实现，Step 6 引用）

---

# Part I — 范式与治理

## 1. 为什么有这套范式

四个 Domain（tasks/habits/okrs/timebox）曾各自为政：写路径、规则、CNUI 表单策略各搞各的，部分域绕过 Nexus。[018] 只修表层。本范式把 tasks 域（最完整）抽象成规范，配 CI 强制，防重蹈覆辙。

**三条 Domain 设计原则**（宪法 + 用户思考 `mydocs/dev/019`）：
1. **松耦合**：Domain 只预知 USOM，**不在代码里硬编码其他 Domain 名字/内容**（manifest.yaml 除外）。
2. **跨域数据经 Nexus/USOM**。
3. **规则一票否决**：Domain 对本域数据正确性全权负责；任何修改请求**必须经本域规则校验**，规则集中统一、可分多层，Domain 把关终判。

## 2. 核心模型：业务事实写入口（两条合法路径）

> 对应宪法 §III Single-Writer（1.11.0）。**所有业务事实持久化写入必须经写入口**。写入口有**两条并列合法路径**；二者之外的直接 repo/db 写 = **违宪**。

```
                       业务事实写入口
                            │
        ┌───────────────────┴───────────────────┐
   executeIntent                  createDomainMutationService
  (Intent→Rule→SM)                  .update / .execute
  生命周期状态转换/聚合写             字段写 / 多步聚合写(单事务)
```

**适用场景决策树**：
- 单字段 inline 编辑（blur 改一个 FactField）：无跨字段不变量 → `mutationService.update`；**有**跨字段不变量 → `executeIntent`（单字段 intent）。
- 生命周期状态转换（create/activate/pause/complete/archive/discard）→ `executeIntent`。
- 多步/跨对象/须原子（建主线+迁子任务+软删）→ `mutationService.execute`（自开 `db.transaction`）。

| 场景 | 入口 | 校验 | 事务 |
|---|---|---|---|
| 纯单字段 inline（无跨字段约束） | `mutationService.update` | 字段级 + ui realtime | 无 |
| 单字段（带跨字段不变量） | `executeIntent` | 全量 onValidate + Rule | 单步 |
| 生命周期状态转换 | `executeIntent` | 全量 onValidate + Rule + SM 守卫 | 单步 |
| 多步跨对象聚合 | `mutationService.execute` | 字段级(step) + SM 守卫 | 自开 tx 包多步 |

### 2.1 ⚠️ 跨字段红线（硬约束）+ `mutation_mode` 字段分类

每个字段在 manifest `field_metadata.<objectType>.<field>.mutation_mode` 声明其写入分类（[026] T23：field_metadata 已嵌套化；运行时已落地，见 `nexus/domain-mutation-service/index.ts` `update()` 路由 `resolveMutationMode`，读 `manifest.field_metadata[objectType]`）。`mutationService.update`/`execute` 的字段路径**都不走全量 onValidate**（[018] TENSION-4→4A）。

| `mutation_mode` | 写入路径（`mutationService.update`） | 校验 | 业务事件 |
|---|---|---|---|
| `FactField`（缺省） | 字段执行器 → `updateFields` | 字段级轻校验（realtime rule） | 发 `fieldUpdatedEventType` |
| `ContentField` | `Repository.updateFields` | 无 | 不发 |
| `PresentationField` | 本地态，不落库 | — | — |

> **跨字段红线（硬约束）**：FactField/ContentField 路径**均不经全量 onValidate**。故**带跨字段/跨对象业务不变量的字段，禁止标 `FactField` 或 `ContentField`、禁止经 `mutationService.update`，必须经 `executeIntent` 全量校验**（或显式 rule step）。否则 inline 编辑静默绕过业务规则。

**入 manifest 判定**：独立单字段（无跨字段约束）→ `FactField`；纯内容可直写（无约束）→ `ContentField`；仅展示 → `PresentationField`；**有跨字段约束 → 不走字段路径（不作为可 update 的 FactField/ContentField），其写入经 `executeIntent` 全量校验**。

**强制点**：
- `validate-manifest.ts`：`mutation_mode` 取值合法（`FactField`/`ContentField`/`PresentationField` 三选一或缺省）。
- 跨字段红线以 **HUMAN 判定**为主（「跨字段」语义无法静态断定）：C-DC 新增 `[HUMAN]`「FactField/ContentField 字段不得有跨字段约束依赖」；CI 辅助——`FactField` 字段的 realtime rule（`phase: both`）须为单字段纯函数（`fields: [单字段]`），多字段聚合规则不得挂在 FactField 字段上。

> 为什么两路径不合并：对应三种**本质不同的写语义**（生命周期/单字段/多步聚合），由事务边界、校验粒度、state-vs-field 并列三条承重理由分叉（见 `nexus/domain-mutation-service/index.ts` `execute()`/`update()` 注释、`nexus/field-executor/index.ts` @file 注释）。合并 = 重开 [018] 已决。

## 3. 七层范式 ↔ 注册步骤映射（去重，机械细节见 Part II Step N）

| 范式层 | 角色 | 对应 Part II Step | 关键接口 |
|---|---|---|---|
| L1 数据 | GenericRepo + tx 透传 | Step 4 (DB Schema) + Step 5 (Repository) | `IXxxRepository`，`tx: DbClient` |
| L2 写入口 | 公共工厂组装（仅 FactField 域） | Step 5.5 + 见 §2 | `createDomainMutationServiceFactory` |
| L3 规则三层 | registry 即 SSOT（自带 phase/fields/message meta）+ evaluate | Step 2 + Step 3 onValidate | `evaluateDomainRules` 委托 |
| L4 CNUI 表单 | 手写 surface + useManifestRules | Step 13 | `useManifestRules` + `useServerErrorBackfill` |
| L5 页面表单 | 页面只读，非写入口 | Step 6 | （见 §4 L5 约束） |
| L6 回填 | useServerErrorBackfill 接通 | Step 13 surface | `serverErrors` prop 透传 |
| L7 注册 | cnuiRegistry + 生命周期 | Step 7 + Step 13 | `cnuiRegistry.register` |

## 4. 治理约束（must / should + sunset 豁免）

| 规则 | 级别 | 适用 |
|---|---|---|
| **orchestrator-溯源**（所有持久化经写入口） | **MUST，全域，零新豁免**（legacy 经 §4.1 托管） | 所有域 |
| **rules-registry 存在**（写域必有规则三层） | **MUST，写域**（带 §4.1 豁免） | 有写路径的域 |
| **手写 surface + useManifestRules**（禁 CnuiFormAdapter） | MUST（**待 §CN-UI 第 4 条 supersede 生效**，见 Step 13） | 有 CNUI 的域 |
| mutation-service 存在 | **不设为门（N/A）** | 仅 FactField 域需要 |
| 页面表单非写入口 | MUST | 所有域 |

### 4.1 Sunset 豁免清单（legacy 债托管）

validator 保持 MUST 严格 + 枚举式豁免清单（每条带 sunset，定期审计）：

| 域 | 豁免规则 | sunset | 理由 |
|---|---|---|---|
| okrs | rules-registry 缺失 + updateObjective 绕过写入口 | okrs 全量 onboarding | 前范式遗产；正确修复需 mutation-service = onboarding 一部分（字段更新非状态转换）；缠 [025] 跨域事务 |

> timebox **不是**「无写路径 N/A」——它有 `startTimebox`/`endTimebox` 写动作（manifest 触发器 + `createTimeboxGenericRepo` + intent.ts executeIntent 路径）。**[026] T21**：timebox L3 已落地（`timebox/rules-registry.ts` 含 `timeboxRuleRegistry` + `itineraryRuleRegistry`，hooks.ts 调 `evaluateDomainRules`），从本豁免清单移除。

## 5. CI Validator 设计（真治理 = 强制）

接入点：扩展现有 `scripts/validate-manifest.ts`（纯 YAML 诊断，已在 prebuild）+ 新增 `scripts/validate-domain-structure.ts` + **husky pre-push 钩子**（仓库零远端 CI，husky 补本地 gate；远端 CI 见 §5.1 显式 defer）。

- **orchestrator-溯源（#1 MUST 门）**：每个 `use server` 写入口函数（scope = `src/app/actions/*`）持久化必须调 `executeIntent` 或 `mutationService.update/execute`；入口函数内直接 repo/db 持久化且不经白名单 = 违宪。scope rationale：actions/* = 写入口面；SM/GenericRepo 适配器/底层 repo = 写入口内部、豁免。入口函数级检查（非跨过程分析）。自测：植入 updateObjective 式绕过必被抓；tasks/habits 合规不报假阳性。
- **validate-domain-structure.ts**：禁 `CnuiFormAdapter`（§IX 已 supersede §CN-UI#4；[019.1] 已落地，规则 `cnui-form-adapter-forbidden`）/禁 `FormRegistry.register`+`register-form.ts` 残留（规则 `form-registry-residual`）/写域必有 `rules-registry`（带 §4.1 豁免）/FactField 字段的 realtime rule（`phase: both`）须单字段纯函数（跨字段红线 CI 辅助）。**不查** mutation-service。
- **validate-manifest.ts**：验证 manifest YAML 结构与 Zod Schema 一致 + 字段 mutation_mode 合法值（[020] 已删区块 G rules id 完整性 cross-check——manifest rules 已去除）。
- **取代**：`app/actions/habits/__tests__/write-entry-guard.test.ts`（habits 局部守卫）在 orchestrator-溯源 validator 上线后删。

### 5.1 远端 CI（T-A）— 显式 defer（2026-06-22 复审：保持 defer）

**决策**：远端 CI **暂不落地**（[019] D1 决策 + ci-validator design §9.2「不做/YAGNI」）。治理强制力当前由 **husky pre-push 本地 gate** 提供（push 前跑 `validate:manifest && validate:structure`，违规 exit 1 阻断 push），覆盖单人 / 主开发机场景。

**理由**：仓库零远端 CI（gitee，`.github/workflows` 空）；MVP 单人开发阶段，本地 gate 已足够；远端 CI 是「无 husky 环境」（他人 clone / CI 机器 / PR 流）的补强，非当下瓶颈。遵循 YAGNI。

**revisit 触发**（任一满足即考虑落地）：
- 转多人协作 / 外部贡献者 PR 流上线；
- 出现「本地 gate 被绕过 → 违规入库」实案；
- 仓库启用 GitHub mirror 或 gitee CI（Gitee Go）。

**落地时待定**：平台（gitee 原生 Gitee Go / GitHub Actions mirror / 两者）、触发时机（push / PR）、是否合并 `validate:manifest` + `validate:structure` + `npm run build` + `npm test`。

## 6. C-DC 检查清单（Domain Development Checklist，每项 [CI]/[HUMAN]）

| ID | 检查项 | 判定 |
|---|---|---|
| L1-1 | 仓储实现接口、单条 UPDATE 禁读后写（R-01） | HUMAN |
| L1-2 | 持久化方法透传 `tx: DbClient` | HUMAN |
| L2-1 | FactField 域有 mutation-service 且调公共工厂 | CI（仅 FactField 域） |
| L2-2 | FactField/ContentField 字段无跨字段约束依赖（跨字段红线） | HUMAN |
| L3-1 | 写域有 rules-registry | CI（MUST，带豁免） |
| L3-2 | registry 每条 realtime rule fields.length=1（L3-realtime-singlefield） | CI |
| L3-3 | onValidate 委托 evaluateDomainRules（禁 ad-hoc） | CI |
| L3-4 | realtime 单字段纯函数；多字段→submit | HUMAN |
| L4-1 | 禁 CnuiFormAdapter（§IX 已 supersede；[019.1] 已落地） | CI |
| L4-2 | 可编辑 surface 调 useManifestRules | CI |
| L4-3 | surface 遵 UI-DESIGN-SPEC + CUC-01~12 | HUMAN |
| L5-1 | 页面禁直接持久化（溯源扩到 pages） | CI |
| L5-2 | 页面表单校验复用 useManifestRules | HUMAN |
| L6-1 | 可编辑 surface 消费 serverErrors | CI |
| L6-2 | 提交失败字段标红/surface 可编辑 | HUMAN |
| L7-1 | manifest cnui_surfaces ↔ cnuiRegistry 注册 | CI |
| L7-2 | 禁 FormRegistry.register/register-form 残留（[019.1] 已落地） | CI |
| W-1 | 所有持久化经 executeIntent ∪ factory | CI（MUST，零新豁免） |

## 7. 四域现状对照

| 域 | L1 | L2 写入口 | L3 规则三层 | L4 CNUI | L5 页面 | L6 回填 | 处置 |
|---|---|---|---|---|---|---|---|
| **tasks** | ✅ | ✅ mutation-service | ✅ registry+evaluate | ✅ 手写 surface | ✅ 只读页 | 🟡 契约断 | 参考实现；L6 随 [019.0] 修 |
| **habits** | ✅ | ✅ | ✅ | ✅ 手写 | 🟡 HabitForm | ✅ | [019.1] adapter 已退役、回填已接 |
| **okrs** | ✅ | ❌（扁平 okr.ts） | ❌ ad-hoc | ❌ | ❌ | — | §4.1 豁免，全量 onboarding 缠 [025] |
| **timebox** | ✅ | ✅(走 executeIntent) | ✅ registry+evaluate（[026] T6 + T21 移除 §4.1 豁免） | 🟡 stub | ❌ | — | L3 已落地；itinerary 引入 rule registry 双 registry 分派 |

---

# Part II — 注册步骤（机械指南）

> 以下 Step 1–13 是新增 Domain 的机械操作流程。每步标注其对齐的范式层（Part I §3）。**范式约束（Part I §4）凌驾于机械步骤**——若某 Step 与范式冲突，以 Part I 为准（如 Step 6 编辑页是过渡形态，范式目标是页面只读）。

## 总览：注册一个 Domain 需要做哪几件事

```
Step 1    在 USOM 文档中声明新对象类型（若有）
Step 2    编写 manifest.yaml（Domain 的完整声明文件）
Step 3    实现四个钩子函数（Reactive Track）
Step 4    定义 Drizzle DB Schema
Step 5    实现 Repository 接口
Step 5.5  组装 mutation-service（仅 FactField 域，范式层 L2）
Step 6    实现 Domain 页面组件（view_routes 对应实现）
Step 7    向系统注册 Domain
Step 8    实现 Markdown 模板
Step 9    （若生成型）实现 Handler 类（Generative Track）
Step 10   （若生成型）实现 Context Provider 并注册到 Context Registry
Step 11   （若查询型）在 manifest 中声明 query_actions
Step 12   （若查询型，仅复杂分析型）实现 onQuery Handler 方法
Step 13   （若 CNUI 型）实现 CNUI Surface 组件、Handler，注册到 CnuiSurfaceRegistry
```

**注**：Step 9–10 仅在 Domain 需要生成型能力时执行。Step 11–12 仅在 Domain 需要查询型能力时执行。简单展示型查询（Shortcut Path）只需完成 Step 11 即可，不需要 Handler。Step 13 仅在 Domain 需要 CNUI surface 交互时执行。普通 Domain 只需完成 Step 1–8。

**Domain 文件目录结构（完整）**：

```
domains/
  {domain_id}/
    manifest.yaml          ← Step 2：Domain 完整声明
    hooks.ts               ← Step 3：钩子工厂 createXxxHooks（纯函数）
    rules-registry.ts      ← [018] R2：规则处理器（onValidate 委托 evaluateDomainRules）
    transitions.ts         ← lifecycle 转换查找表（可选，多状态机域）
    validation.ts          ← rules-registry 复用的字段校验纯函数（可选）
    repository/            ← Step 5：Repository（目录；index.ts + 各对象仓储 + generic-repo-adapter）
    pages/                 ← Step 6：页面组件
      {Domain}ListPage.tsx
      {Domain}DetailPage.tsx
      {Domain}EditPage.tsx
    cnui/                  ← Step 13（若 CNUI 型）：CNUI Surface 组件和 Handler
      surfaces/
        {Domain}Card.tsx
      handlers.ts
    markdown_templates/    ← Step 8（可选）：Markdown 协同编辑模板
      create_batch.md
    handlers/              ← Step 9（生成型）：Handler 类
      {action}-handler.ts
      index.ts
    providers/             ← Step 10（生成型）：Context Provider
      {capability}-provider.ts
      index.ts

src/lib/db/
  schema.ts                ← Step 4：Drizzle DB Schema（全域集中，各域表追加到此）

app/actions/
  {domain_id}/
    mutation-service.ts   ← Step 5.5：组装业务事实写入口（仅 FactField 域）

app/                       ← Next.js 路由（薄壳，仅做导入）
  {domain_route}/
    page.tsx               ← 导入 {Domain}ListPage
    [id]/
      page.tsx             ← 导入 {Domain}DetailPage
      edit/
        page.tsx           ← 导入 {Domain}EditPage

domains/
  registry.ts              ← Step 7：Domain 注册表

nexus/
  context-engine/
    registry.ts            ← Step 10：Context Capability 注册中心
```

原则：**Domain 开发者不需要修改 Nexus 任何组件**。如果发现必须修改 Nexus 才能完成注册，说明架构边界出现了问题，需要先讨论。

---

## Step 1：在 USOM 声明新对象类型（若有）

**判断标准**：如果 Domain 引入了当前 USOM 中不存在的业务对象，必须先在 `LW_USOM_详细设计.md` 中完成对象定义，再进行后续步骤。

**需要在 USOM 中定义的内容**：

```
□ 对象接口（TypeScript interface）
□ 对象的 Status 枚举
□ 对象的 Summary 子类型（用于 ContextSnapshot / USOMSnapshot）
□ 相关的 SystemEventType 枚举值（追加到现有枚举）
□ 相关的 ActionType 枚举值（追加到现有枚举，若有新操作）
```

**USOM 对象定义模板**：

```typescript
// 对象意图：一句话说明这个对象解决什么问题
// 生命周期：StatusA → StatusB → StatusC / StatusD

interface MyObject {
  id:          USOM_ID
  status:      MyObjectStatus
  title:       string
  // ... 业务字段
  createdAt:   Timestamp
  updatedAt:   Timestamp
  archivedAt?: Timestamp
  notes?:      Notes
}

type MyObjectStatus = 'draft' | 'active' | 'completed' | 'archived'

// Summary 子类型（只包含 Domain 决策所需最小字段）
interface MyObjectSummary {
  id:     USOM_ID
  title:  string
  status: MyObjectStatus
  // 不超过 5 个字段，否则说明 Summary 过重
}
```

**治理约束（G-06）**：新字段必须先在 USOM 文档中定义，再在代码中实现，文档永远先行。

---

## Step 2：编写 manifest.yaml

manifest.yaml 是 Domain 的完整声明文件，声明意图路由/生命周期/字段元数据/规则/CNUI 等区块，每个区块服务不同的消费方。

### 关键定位：运行时配置，不是开发时文档

> **manifest.yaml 的主体是运行时配置（Runtime Configuration），不是开发时文档。**

这意味着 manifest 中的所有声明值（action 名称、lifecycle 状态、field 列表等）**必须在运行时通过 Registry 加载和消费**，绝不可以在代码中硬编码为常量。

**错误做法（硬编码）**：
```typescript
// ❌ 违规：将 manifest 中的 action 名称硬编码为常量
const SUPPORTED_ACTIONS = ['create_task', 'edit_task', 'complete_task']

// ❌ 违规：将 lifecycle 状态硬编码为常量数组
const VALID_STATUSES = ['draft', 'active', 'completed', 'archived']

// ❌ 违规：将 required_fields 列表硬编码在验证逻辑中
const REQUIRED_FIELDS = ['title', 'startTime', 'duration']
```

**正确做法（运行时加载）**：
```typescript
// ✅ 从 Registry 获取当前 Domain 的 manifest 数据
const manifest = domainRegistry.getManifest('my_domain')
const actions = manifest.intent_triggers.map(t => t.action)
const states = manifest.lifecycle.my_object.states
const requiredFields = manifest.required_fields['create_xxx']
```

**为什么必须这样做**：

1. **manifest 是单一事实来源**：修改 manifest 应立即生效，无需同步修改代码
2. **保持 Nexus 通用性**：Nexus 组件通过 Registry 读取 manifest 数据，才能在不修改 Nexus 代码的情况下支持新 Domain
3. **AI 生成代码时尤其注意**：AI 在生成 Domain 脚手架代码时，必须生成「从 Registry 读取」的代码，不能将 manifest 值复制为 TypeScript 常量

**硬编码检测清单**（Code Review 时检查）：

```
□ 代码中是否存在与 manifest intent_triggers 对应的 action 名称常量数组？
□ 代码中是否存在与 manifest lifecycle 对应的状态转换映射？
□ 代码中是否存在与 manifest required_fields 对应的字段验证列表？
□ 代码中是否存在与 manifest 值匹配的内联字符串字面量，用于比较而非从加载的 manifest 读取？
```

如果以上任何一项为"是"，则需要重构为从 Registry 运行时加载。

**文件位置**：`domains/{domain_id}/manifest.yaml`

```yaml
# ============================================================
# Domain Manifest 模板
# 消费方：Intent Engine / State Machine / Rule Engine /
#         Action Surface Engine / Presentation Layer
# ============================================================

# ── 基础信息 ────────────────────────────────────────────────
id:       "my_domain"          # snake_case，全局唯一（根字段为 id，对齐 tasks 等现有域）
version:  "1.0.0"
name:       "领域中文名"
description: >
  一段人类可读的描述，说明这个 Domain 解决什么问题，
  以及它与其他 Domain 的边界。
  这段描述也会被 Intent Engine 用作路由上下文。


# ── 区块 A：意图路由触发（Intent Engine 读取）──────────────
# 告诉 Intent Engine：什么样的用户输入应该路由到本 Domain
intent_triggers:
  - action: create_xxx         # action 名称，与钩子中的 action 一致
    shortcut: /createXxx       # 可选：斜杠指令快捷方式
    description: "用户希望..."  # 一句话，供 AI 做语义分类
    response_type: cnui         # 响应类型：page（导航）、cnui（对话内 surface）、text（纯文本）
    examples:
      - "我想..."
      - "帮我创建..."
    keywords: ["关键词1", "关键词2"]

  # view_routes 在独立的区块 G 声明，此处不再嵌入


# ── 区块 B：生命周期声明（State Machine 读取）──────────────
# 告诉 State Machine：本 Domain 对象的合法状态和跃迁规则
# State Machine 只执行此处声明的跃迁，拒绝其他一切变更

lifecycle:
  my_object:                     # 对应 USOM 对象类型名
    states:
      - draft
      - active
      - completed
      - archived
    initial_state: draft
    transitions:
      - from: draft
        to:   active
        trigger: intent           # intent = 经过 Orchestrator 链路
        action: activate          # 对应 StructuredIntent.action 的值
        event_type: MyObjectActivated  # 对应 SystemEventType
      - from: active
        to:   completed
        trigger: intent
        action: complete
        event_type: MyObjectCompleted
      - from: [draft, active]     # 多个起始态
        to:   archived
        trigger: intent
        action: archive
        event_type: MyObjectArchived
      - from: active
        to:   active              # 字段更新（状态不变）
        trigger: intent
        action: update
        event_type: MyObjectUpdated
    terminal_states:
      - completed                 # 这些状态不可回退
      - archived


# ── 区块 C：字段元数据（Presentation Layer 读取）──────────
# 告诉前端：每个字段是否可编辑、输入类型、是否需要确认
# 注意：这里只声明业务语义，不声明视觉样式

# [026] T23: field_metadata 改为 per-objectType 嵌套结构，一级 key 为 objectType（如 task / habit），
# 二级 key 为字段名。多 objectType 域（如 timebox {timebox, itinerary} / okrs {objective, key_result}）
# 各自独立 namespace，消跨域字段名冲突（timebox itinerary 与其它域同名字段）。

field_metadata:
  task:  # objectType key（单域单 objectType 时与域 ID 同）
    # 每字段须声明 mutation_mode（见 Part I §2.1）：
    #   FactField（缺省）= 走字段执行器轻校验，可经 mutationService.update 原子写
    #   ContentField     = 直走 Repository.updateFields（无校验、无事件）
    #   PresentationField= 本地态，不落库
    # 带跨字段/跨对象约束的字段【不得】标 FactField/ContentField，其写入经 executeIntent。
    title:
      type: string                  # string / time / date / number / textarea /
                                    # select / boolean / json / enum / lifecycle_timestamp
      label: 标题
      required: true
      mutation_mode: ContentField
    priority:
      type: enum
      label: 优先级
      options: [critical, high, medium, low]
      mutation_mode: FactField      # 独立单字段、无跨字段约束 → 可 inline 原子写
    some_date_field:
    type: time
    label: 时间
    required: false
    mutation_mode: FactField
  some_json_field:
    type: json
    label: 元数据
    required: false
    mutation_mode: ContentField
  computed_timestamp:
    type: lifecycle_timestamp     # 系统自动更新的时间戳字段
    label: 实际开始时间
    required: false
    mutation_mode: PresentationField


# ── 区块 D：列表操作（Presentation Layer 读取）─────────────
# 告诉前端：列表行上有哪些可直接触发的操作按钮
# 这些操作由 Presentation 构造 PrebuiltIntent，
# 跳过 Intent Engine，直接进入 Rule Engine

list_actions:
  - action: complete_xxx
    label:  "完成"
    condition: "status == 'active'"        # 条件表达式，使用 USOM 字段
  - action: archive_xxx
    label:  "归档"
    condition: "status in ['active', 'completed']"
  - action: reactivate_xxx
    label:  "重新激活"
    condition: "status == 'completed'"


# ── 区块 F：事件订阅（Event Bus 读取）─────────────────────
# 声明本 Domain 的 onEvent 钩子关注哪些事件
# 未订阅的事件不会触发 onEvent 调用

subscribed_events:
  - TaskCompleted        # 示例：关注任务完成事件来更新关联 KR 进度
  - HabitLogged
  - TimeboxLogged
  # 只订阅本 Domain 真正需要响应的事件，不要订阅所有事件


# ── 区块 G：视图路由（Presentation Layer 读取）───────────────
# 声明本 Domain 的页面路由，与 intent_triggers 分离
# view_route 不参与意图路由，用于导航类意图
# url 字段用于构建时自动生成 Next.js App Router 文件

view_routes:
  createXxx:
    component: domains/{domain_id}/pages/XxxFormPage
    url: /my-domain/new              # 新增：声明路由路径
    params:
      mode: create
  editXxx:
    component: domains/{domain_id}/pages/XxxFormPage
    url: /my-domain/[id]/edit         # 支持动态路由
    params:
      mode: edit
  viewDetail:
    component: domains/{domain_id}/pages/XxxDetailPage
    url: /my-domain/[id]              # 动态路由
    params: {}


# ── 区块 H：表单模板（Intent Engine 字段补全阶段读取）──────
# 告诉 Intent Engine：创建/编辑时必须补全哪些字段
# required_fields 对应 StructuredIntent.fields 的 key

required_fields:
  create_xxx:
    - field: title
      label: 标题
      type: text
      required: true
      placeholder: 例如：...
    - field: scheduled_time
      label: 计划时间
      type: time
      required: true
    - field: some_field
      label: 某字段
      type: select
      required: false
      options: [option1, option2]
      default_value: option1

# Markdown 协同编辑模板（可选）
templates:
  markdown:
    create_batch:
      template_file: markdown_templates/create_batch.md
      description: 批量创建模板
      output_action: create_xxx
      max_objects: 10


# ── 区块 I：查询型操作（Query Path，可选）────────────────
# 声明本 Domain 支持的只读查询动作
# Query Path 不经过 Rule Engine 和 State Machine

query_actions:
  - action: list_active_items
    description: 在对话中查看活跃列表
    response_mode: cnui              # cnui = Shortcut Path（Orchestrator 直接组装只读 CN-UI）
    cnui_surface: item-list-card     # CN-UI Surface 类型（response_mode=cnui 时必填）
    context_capabilities:
      - id: activeItems             # 注意：使用 id 而非 capability
        query: active_for_user
        params: [userId]            # params 为数组
    examples:
      - "看看我的列表"
      - "有哪些项目"


# ── 区块 J：生成型操作（Generative Path，可选）──────────────
# 完整声明参见下文"Step 9：实现 Handler 类"


# ── 区块 K：CNUI Surface 声明（CnuiSurfaceRegistry 读取）─────
# 声明本 Domain 拥有的 CNUI surface 及其 handler（map 形态，对齐 tasks）
# 消费方：CnuiSurfaceRegistry + CnuiRenderer（公共层）
# 作用：公共层通过此声明动态发现 surface，无需硬编码 import
# 注：component 在域 index.ts 用 cnuiRegistry.register(domainId, surfaceType,
#     {component, handlerModulePath}) 注册（见 Step 13），manifest 只声明映射。

cnui_surfaces:
  xxx-creation-card:                    # key = surface_type（全局唯一）
    handler: ./cnui/handlers            # 同域 handler 模块（相对路径）

# ── 区块 L: rules（[020] registry 即 SSOT，manifest 不再声明）──
# 规则定义在 rules-registry.ts（自带 {check,fields,message} meta），
# 不在 manifest 声明。evaluateDomainRules 读 registry 参数，
# manifest 此区块保留仅为向后兼容（ManifestSchema rules: optional）。
# rules:
#   - id: my_action_fields_valid
#     ...
```

---

## Step 3：实现四个钩子函数（范式层 L2/L3）

> **paradigm 对齐（[020] registry 即 SSOT，tasks/habits 参考）**：`onValidate` 不再手写 ad-hoc 全分支校验——改为**薄壳委托** `evaluateDomainRules('<domain>', intent, serverCtx, <domain>RuleRegistry)`，返回 `ValidationResult`（非 `{valid, errors}`）。规则定义在 `rules-registry.ts`（registry 即 SSOT，每条规则自带 `{check, fields, message}` meta，manifest 不再声明 rules）。下方示例为旧 ad-hoc 形态（仅示意钩子签名），新域须走规则三层（见 Part I §4 L3-1/2/3，CI 强制）。

**文件位置**：`domains/{domain_id}/hooks.ts`

钩子以**工厂函数** `createXxxHooks(manifest)` 导出（对齐 tasks `createTasksHooks`），返回 `{ onValidate, onEvent, onActionSurfaceRequest }`（+ 可选 `onOutboundRequest`）；manifest 在闭包内复用（subscribed_events 过滤、lifecycle 转换表预建）。下方代码以独立函数示意各钩子签名，实际封装在工厂内。所有钩子均为**纯函数**：相同输入永远产生相同输出，无副作用，不访问数据库，不调用外部 API。

```typescript
import type {
  StructuredIntent, USOMSnapshot, DerivedSignals,
  SystemEvent, MetricUpdate, ActionSurfaceSuggestion,
  ActionCandidate, ActionCategory, ExternalPayload, ValidationResult
} from '@/usom/types/process'
import { evaluateDomainRules } from '@/nexus/rules'
import { myDomainRuleRegistry } from './rules-registry'

// ── 钩子 1：意图校验（[018] R2 规则三层：薄壳委托 evaluateDomainRules）──
// 调用时机：StructuredIntent 进入 State Machine 之前
// 职责：Domain 内部的结构性/业务约束校验
// 形态：不手写 ad-hoc 全分支——委托 evaluateDomainRules，返回 ValidationResult
//       （非 {valid, errors}）。规则定义在 rules-registry.ts（registry 即 SSOT，每条规则自带 {check, fields, message} meta；manifest 不再声明 rules）。
//       phase: both realtime），处理器在 rules-registry.ts。
// 不做：个性冲突检测（那是 Rule Engine + DerivedSignals 的工作）

export async function onValidate(
  intent:   StructuredIntent,
  snapshot: USOMSnapshot
): Promise<ValidationResult> {
  // 可选：字段预处理（如 normalizeFieldValues 把中文→枚举），见 tasks 参考
  return evaluateDomainRules('<domain_id>', intent, {
    repos: {},
    userId: snapshot.userId,
    now: snapshot.currentTime ? Date.parse(snapshot.currentTime) : 0,
  }, myDomainRuleRegistry)
}


// ── 钩子 2：事件响应 ─────────────────────────────────────────
// 调用时机：State Machine 发布事件后，由 Memory Framework 触发
// 职责：返回派生指标和行动建议，不触发任何状态变更

export function onEvent(
  event:    SystemEvent,
  snapshot: USOMSnapshot
): { metrics: MetricUpdate[]; suggestions: ActionSurfaceSuggestion[] } {

  const metrics:     MetricUpdate[]            = []
  const suggestions: ActionSurfaceSuggestion[] = []

  if (event.type === 'HabitLogged') {
    const payload = event.payload as { habitId: string; streak: number }
    metrics.push({
      metricKey: `habit_streak_${payload.habitId}`,
      value:     payload.streak,
      unit:      '天'
    })
  }

  // suggestions 是给 Action Surface Engine 的参考，不是命令
  // Action Surface Engine 自行决定是否采纳

  return { metrics, suggestions }
}


// ── 钩子 3：行动切面请求 ─────────────────────────────────────
// 调用时机：Action Surface Engine 刷新行动切面时
// 职责：返回候选行动，Action Surface Engine 统一排序
// 注意：signals 作为独立参数，不混入 snapshot
//
// 签名修正说明（规范原则）：
//   每个 ActionCandidate 自带 category（'guide' | 'tile' | 'cue'），
//   一个 Domain 可以同时返回不同类型的候选（如 OKRs Domain 同时产生
//   guide 和 tile），因此移除顶层的 category，由 ActionCandidate 各自声明。
//   weight 保留在顶层，作为本 Domain 所有候选的整体优先级系数，
//   Action Surface Engine 用它做跨 Domain 排序的权重基线。
//   ⚠️ tasks 参考实现当前仍保留顶层 category='cue'（过渡态，action surface 功能
//      尚未真正落地），待其正式落地时迁移到本规范形态——此处记录，不视为范式违例。

export function onActionSurfaceRequest(
  snapshot: USOMSnapshot,
  signals:  Readonly<DerivedSignals>
): { actions: ActionCandidate[]; weight: number } {   // ← 移除顶层 category

  const actions: ActionCandidate[] = []

  // guide 类型：高价值但非紧急，常驻 Action Guide 区域
  for (const obj of snapshot.activeObjectives) {
    actions.push({
      id:               crypto.randomUUID(),
      sourceObjectId:   obj.id,
      sourceObjectType: 'objective',
      label:            obj.title,
      subLabel:         `${Math.round(/* progressRate */ 0 * 100)}% 完成`,
      actionType:       'review_okr',
      category:         'guide',    // ← 每个候选自带 category
      weight:           90,
      expiresAt:        undefined
    })
  }

  // tile 类型：立即可执行，展示在 Dynamic Tile 区域
  for (const item of snapshot.activeTasks) {
    if (item.priority === 'critical') {
      actions.push({
        id:               crypto.randomUUID(),
        sourceObjectId:   item.id,
        sourceObjectType: 'task',
        label:            `完成：${item.title}`,
        subLabel:         item.dueDate ? `截止 ${item.dueDate}` : undefined,
        actionType:       'complete_task',
        category:         'tile',   // ← 每个候选自带 category
        weight:           80,
        expiresAt:        undefined
      })
    }
  }

  // 顶层 weight 是本 Domain 的整体优先级系数（0-100）
  // 过度承诺时压低权重，避免继续推送新行动
  return {
    actions,
    weight: signals.isOvercommitted ? 60 : 80
  }
}


// ── 钩子 4：出站推送声明（可选，MVP 不实现）─────────────────
// 调用时机：Event Bus 广播相关事件后，由 Connector Runner 触发
// 职责：声明推送意图，Connector Runner 执行实际 IO
// 返回 null 表示本次事件不需要推送

export function onOutboundRequest(
  trigger:  SystemEvent,
  snapshot: USOMSnapshot
): { connector: string; payload: ExternalPayload; condition?: string } | null {

  // MVP 阶段返回 null，不实现
  return null
}
```

**钩子实现检查清单**：

```
□ 所有钩子均为纯函数，无副作用
□ 没有数据库调用（import 中没有出现 db / drizzle / repository）
□ 没有 fetch / axios 等外部 IO 调用
□ 返回类型严格符合 USOM 定义的接口
□ onEvent 中没有触发状态变更的代码
□ onValidate 中的错误信息对用户可读，而非技术性描述
```

---

## Step 4：定义 Drizzle DB Schema

**文件位置**：`src/lib/db/schema.ts`（**全域集中单文件**，各 Domain 的表定义追加到此，不按域拆分文件；对齐 tasks/threads 表均在 `schema.ts`）。

```typescript
import { pgTable, text, integer, real, boolean,
         timestamp, date } from 'drizzle-orm/pg-core'

// ── 约束：Schema 字段命名使用 snake_case，与 USOM 对象字段保持语义一致
// ── 约束：id 统一使用 text 类型存储 UUID
// ── 约束：Timestamp 字段统一存储 UTC，展示层本地化

export const myObjects = pgTable('my_objects', {
  id:          text('id').primaryKey(),
  status:      text('status').notNull().default('draft'),
  title:       text('title').notNull(),
  userId:      text('user_id').notNull(),

  // 关联字段（存 ID，不做外键约束以支持 Local First 离线写入）
  keyResultId: text('key_result_id'),

  // 业务字段
  priority:       text('priority').notNull().default('medium'),
  estimatedMinutes: integer('estimated_minutes'),

  // 生命周期时间戳
  createdAt:   timestamp('created_at').notNull().defaultNow(),
  updatedAt:   timestamp('updated_at').notNull().defaultNow(),
  completedAt: timestamp('completed_at'),
  archivedAt:  timestamp('archived_at'),

  // 版本字段（用于 USOM 版本化机制）
  schemaVersion: integer('schema_version').notNull().default(1),
})

// 关联表（如有）
export const myObjectTags = pgTable('my_object_tags', {
  objectId: text('object_id').notNull(),
  tag:      text('tag').notNull(),
})
```

**Schema 约束**：

```
□ 不使用外键约束（支持离线写入后同步）
□ 不使用数据库级 enum，使用 text + 应用层校验
□ 所有 Timestamp 字段存储 UTC
□ 包含 schemaVersion 字段
□ 不包含业务计算字段（如 streak 应在应用层计算）
```

---

## Step 5：实现 Repository 接口

**文件位置**：`domains/{domain_id}/repository/`（**目录**；单对象域可单文件，多对象域如 tasks 用目录：`index.ts` 导出 + 各对象仓储 `*.ts` + `generic-repo-adapter.ts` 组装 State Machine 消费的 `GenericRepo`）。下方示例为单对象域示意。

Repository 是 USOM 对象与 DB 行对象之间的映射层，也是 Nexus 组件访问数据的唯一接口。

```typescript
import type { MyObject, MyObjectSummary, USOM_ID } from '@/types/usom'

// ── 接口定义（Nexus 组件依赖此接口，不依赖具体实现）──────────
export interface MyObjectRepository {
  findById(id: USOM_ID): Promise<MyObject | null>
  findByStatus(userId: string, status: MyObjectStatus[]): Promise<MyObject[]>
  findSummariesForSnapshot(userId: string): Promise<MyObjectSummary[]>
  save(object: MyObject): Promise<void>
  delete(id: USOM_ID): Promise<void>
}

// ── 阶段一实现（PostgreSQL via Drizzle）────────────────────────
export class DrizzleMyObjectRepository implements MyObjectRepository {

  async findById(id: USOM_ID): Promise<MyObject | null> {
    const row = await db.select()
      .from(myObjects)
      .where(eq(myObjects.id, id))
      .limit(1)

    return row[0] ? this.toUSOM(row[0]) : null
  }

  async findSummariesForSnapshot(userId: string): Promise<MyObjectSummary[]> {
    const rows = await db.select({
      id:     myObjects.id,
      title:  myObjects.title,
      status: myObjects.status,
      // 只选 Summary 需要的最小字段
    })
    .from(myObjects)
    .where(
      and(
        eq(myObjects.userId, userId),
        inArray(myObjects.status, ['active', 'draft'])
      )
    )

    return rows.map(this.toSummary)
  }

  // DB 行对象 → USOM 对象（映射层，Nexus 只见 USOM 对象）
  private toUSOM(row: typeof myObjects.$inferSelect): MyObject {
    return {
      id:          row.id,
      status:      row.status as MyObjectStatus,
      title:       row.title,
      createdAt:   row.createdAt.toISOString(),
      updatedAt:   row.updatedAt.toISOString(),
      completedAt: row.completedAt?.toISOString(),
      archivedAt:  row.archivedAt?.toISOString(),
      notes:       null,
    }
  }

  private toSummary(row: Pick<typeof myObjects.$inferSelect, 'id' | 'title' | 'status'>): MyObjectSummary {
    return {
      id:     row.id,
      title:  row.title,
      status: row.status as MyObjectStatus,
    }
  }
}
```

**Repository 约束**：

```
□ 接口方法签名不依赖 HTTP 上下文（无 request / response 参数）
□ 所有查询通过 Drizzle query builder，禁止 raw SQL
□ 映射方法（toUSOM / toSummary）是私有的，不暴露给外部
□ 接口定义与实现分离，阶段二换 SQLite adapter 时只换实现类
```

---

## Step 5.5：组装 mutation-service（范式层 L2，仅 FactField 域）

> **paradigm 对齐（Part I §2）**：这是第二条合法写入口（字段写/多步聚合写）的具体组装。
> **仅 FactField 域需要**——若本域所有写入都是生命周期状态转换（经 `executeIntent`），跳过本步。

**文件位置**：`app/actions/{domain_id}/mutation-service.ts`

调公共工厂 `createDomainMutationServiceFactory`，只保留本域差异（`domainId` / `repos` / `fieldUpdatedEventType` / `repoLabel`），六项组装（getRepository/getFieldMetadata/smExecute/eventBus/transaction/getExecutor）已下沉工厂（对齐 tasks `createTasksMutationService`）。

```typescript
import { createDomainMutationServiceFactory } from '@/nexus/domain-mutation-service/factory'
import { createMyDomainGenericRepo } from '@/domains/{domain_id}/repository/generic-repo-adapter'
import { MyObjectRepository } from '@/domains/{domain_id}/repository/my-object'
import type { DomainMutationService } from '@/nexus/domain-mutation-service'

/**
 * 组装本域业务事实写入口服务实例。
 * 每次调用产生独立实例（独立 eventRepo/eventBus），保证事务隔离与可测试性。
 */
export function createMyDomainMutationService(): DomainMutationService {
  const repos = createMyDomainGenericRepo({
    myObjectRepo: new MyObjectRepository() as any,
  })
  return createDomainMutationServiceFactory({
    domainId: 'my_domain',
    repos,
    fieldUpdatedEventType: 'MyObjectFieldUpdated',  // 本域 FactField 写发出的事件类型
    repoLabel: 'MyDomain',
  })
}
```

**`generic-repo-adapter.ts`**（Repository → State Machine 消费的 `GenericRepo` 映射，对齐 tasks `createTasksGenericRepo`——手写委托 `findById`/`save`/`create`/`updateStatus`/`updateFields` 五方法）：

```typescript
// domains/{domain_id}/repository/generic-repo-adapter.ts
import type { GenericRepo } from '@/nexus/core/state-machine'

export function createMyDomainGenericRepo(repos: {
  myObjectRepo: MyObjectRepository
}): Record<string, GenericRepo> {
  return {
    my_object: {
      async findById(id, userId, tx) { return repos.myObjectRepo.findById(id, userId, tx) },
      async save(obj, userId, tx) { await repos.myObjectRepo.save(obj, userId, tx) },
      async create(fields, userId, tx) { return repos.myObjectRepo.create(fields, userId, tx) },
      async updateStatus(id, toStatus, userId, tx) {
        return repos.myObjectRepo.updateStatus(id, toStatus, userId, tx)
      },
      async updateFields(id, fields, userId, tx) {
        return repos.myObjectRepo.updateFields(id, fields, userId, tx)
      },
    },
  }
}
```

**何时用 mutation-service（对应 Part I §2 决策树）**：
- 单字段 inline 编辑（blur 改一个 FactField，无跨字段约束）→ `mutationService.update(id, field, value, userId, domainId, objectType)`
- 多步/跨对象/须原子（建主线+迁子任务+软删）→ `mutationService.execute(intent, userId)`（自开 `db.transaction` 包多步）
- 生命周期状态转换 / 带跨字段约束的字段 → **不用** mutation-service，经 `executeIntent`

**Step 5.5 检查清单**：

```
□ FactField 域才有 mutation-service（ContentField-only / 纯生命周期域跳过）
□ 调 createDomainMutationServiceFactory，仅传域差异四参（domainId/repos/fieldUpdatedEventType/repoLabel）
□ generic-repo-adapter 把域 Repository 适配为 GenericRepo 映射（objectType → repo）
□ fieldUpdatedEventType 与 manifest subscribed_events / SystemEventType 一致
```

---

## Step 6：实现 Domain 页面组件（范式层 L5）

> **paradigm 对齐（Part I §4 L5）**：范式目标是**页面只读（列表/详情视图）**，所有写经 CNUI handler → 写入口（tasks 参考实现即此形态）。下方的「编辑页模板」是**过渡形态**——若保留，其提交**必须构造 Intent 经 Rule Engine/写入口（executeIntent 或 mutationService）**，**不得直接 repo 写**（CI `L5-1` 强制）。新域建议直接走 CNUI（Step 13）不做页面编辑表单。habits 的 CNUI 创建 surface 已手写化（[019.1] 退役 `CnuiFormAdapter`，`HabitCreationCard` 直引 `HabitForm`）；页面级 `HabitForm` 与 CNUI 的共享分叉另追踪。

**文件位置**：`domains/{domain_id}/pages/`

view_routes 在 manifest 中声明了路径，本步骤完成对应的实现。每个 `view_route` 必须有一个对应的页面组件。

### 数据获取规则（关键）

```
只读查询（列表页、详情页）
  → 直接调用 Repository，不走 Nexus 链路
  → 原因：只读操作没有状态变更，不需要 Rule Engine 介入

写操作（表单提交、按钮操作）
  → 构造 PrebuiltIntent，进入 Rule Engine 链路
  → 原因：所有状态变更必须经过完整链路保证一致性

禁止：
  → 页面组件不直接调用钩子函数（hooks.ts）
  → 页面组件不直接访问 Drizzle（db/schema/）
  → 所有数据访问通过 Repository 接口

**Server entry 数据预取（route entry 专属）**：
  → 独立 URL 路由（standalone=true 的 page_props 路由）的 server entry 在 `lib/server/load-*.ts` 预取数据
  → 预取逻辑调 Repository 或已存在的 server action（不绕过 R-01 仓储隔离）
  → entry 直接 await 调 helper，把结果作 prop 传给 workspace 组件（避免 client 二次拉取）
  → 例：见上节 "约定 3" 与 `domains/timebox/lib/server/load-appointments.ts`
```

### 列表页模板

```typescript
// domains/my_domain/pages/MyObjectListPage.tsx
'use client'

import { useEffect, useState } from 'react'
import type { MyObject } from '@/types/usom'
import type { MyObjectRepository } from '../repository'

interface Props {
  repository: MyObjectRepository  // 通过 DI 注入，不直接 import 实现类
  userId:     string
}

export function MyObjectListPage({ repository, userId }: Props) {
  const [items, setItems] = useState<MyObject[]>([])

  useEffect(() => {
    // 只读查询：直接调 Repository，不走 Nexus 链路
    repository.findByStatus(userId, ['active', 'draft'])
      .then(setItems)
  }, [userId])

  // list_actions 从 manifest 读取，动态渲染操作按钮
  // Presentation 层负责视觉样式，manifest 只声明操作语义
  const handleListAction = async (action: string, objectId: string) => {
    // 构造 PrebuiltIntent，进入 Rule Engine 链路（跳过 Intent Engine AI 解析）
    const intent: PrebuiltIntent = {
      id:           crypto.randomUUID(),
      intentionId:  crypto.randomUUID(),
      targetDomain: 'my_domain',
      action,
      fields:       { objectId },
      confidence:   1.0,
      resolvedBy:   'ui_direct',
      objectId,
      createdAt:    new Date().toISOString(),
    }
    await nexusClient.submitPrebuiltIntent(intent)
    // 刷新列表
    repository.findByStatus(userId, ['active', 'draft']).then(setItems)
  }

  return (
    <div>
      {items.map(item => (
        <div key={item.id}>
          <span>{item.title}</span>
          {/* list_actions 按 manifest.list_actions 的 condition 动态渲染 */}
          {item.status === 'active' && (
            <button onClick={() => handleListAction('complete_xxx', item.id)}>
              完成
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
```

### 编辑页模板

```typescript
// domains/my_domain/pages/MyObjectEditPage.tsx
'use client'

import { useEffect, useState } from 'react'
import type { MyObject } from '@/types/usom'

interface Props {
  repository: MyObjectRepository
  objectId:   string
  userId:     string
}

export function MyObjectEditPage({ repository, objectId, userId }: Props) {
  const [item, setItem]   = useState<MyObject | null>(null)
  const [title, setTitle] = useState('')

  useEffect(() => {
    // 只读查询：直接调 Repository
    repository.findById(objectId).then(obj => {
      setItem(obj)
      setTitle(obj?.title ?? '')
    })
  }, [objectId])

  const handleSubmit = async () => {
    // 表单提交：构造 PrebuiltIntent，进入 Rule Engine 链路
    const intent: PrebuiltIntent = {
      id:           crypto.randomUUID(),
      intentionId:  crypto.randomUUID(),
      targetDomain: 'my_domain',
      action:       'edit_xxx',
      fields:       { objectId, title },
      confidence:   1.0,
      resolvedBy:   'ui_direct',
      objectId,
      createdAt:    new Date().toISOString(),
    }
    await nexusClient.submitPrebuiltIntent(intent)
  }

  // field_metadata.title.editable = true → 渲染可编辑输入框
  // field_metadata.status.editable = false → 渲染只读展示
  return (
    <form onSubmit={e => { e.preventDefault(); handleSubmit() }}>
      <input value={title} onChange={e => setTitle(e.target.value)} />
      <button type="submit">保存</button>
    </form>
  )
}
```

### Next.js 路由注册（构建时自动生成）

**架构变更**：为保持 Domain 完全独立性，`app/` 目录下的路由文件现在由构建脚本自动生成。Domain 开发者只需在 manifest.yaml 中声明 `view_routes.url` 字段，运行 `npm run generate:routes` 即可自动生成路由文件。

#### manifest.yaml 声明（区块 G）

```yaml
# ── 区块 G：view_routes（视图路由）──────────────────────────────
view_routes:
  view_list:
    component: domains/my_domain/pages/MyObjectListPage
    url: /my-domain                    # 新增：声明 Next.js 路由路径
  view_detail:
    component: domains/my_domain/pages/MyObjectDetailPage
    url: /my-domain/[id]               # 支持动态路由
  view_edit:
    component: domains/my_domain/pages/MyObjectEditPage
    url: /my-domain/[id]/edit
    params:
      mode: edit
```

**url 字段规范**：
- 必填字段，格式为 Next.js App Router 路径
- 使用 kebab-case：`/my-domain` 而非 `/myDomain`
- 复数形式表示列表：`/my-domain`、`/projects`
- 单数形式表示详情：`/my-domain/[id]`、`/projects/[id]`
- 动态路由使用 `[id]` 语法（非 `:id`）

#### 构建时路由生成

**脚本位置**：`scripts/generate-routes.ts`

**工作流程**：
1. 扫描所有 Domain 的 `manifest.yaml` 文件
2. 读取 `view_routes` 区块的 `url`、`component`、`export_name` 与 `page_props` 声明
3. 验证组件文件和 `page_props` 结构
4. 读取组件文件以检测默认导出，并生成 `app/{url_path}/page.tsx` 薄 wrapper

**声明契约**：
- `component` 必须指向 `domains/` 路径，禁止指向 `app/`，避免生成页循环导入自身。
- 默认组件名按文件名 kebab-case → PascalCase 推断；缩写名称用 `export_name` 覆盖，例如 `OKRWorkspace`。
- `page_props` 可传 JSON 字面值，或 `{ from: 'searchParams', key: '<key>' }`；`key` 必须为非空字符串，未知 `from` 会使验证失败。
- 代码生成器读取组件文件检测 `export default`：命中时生成默认导入，否则生成命名导入。

**生成的路由文件格式**：

```tsx
// ---
// Auto-generated from domains/my_domain/manifest.yaml
// DO NOT EDIT MANUALLY
// Generated at: 2026-05-26T10:30:00Z
// ---

import { MyObjectListPage } from "@/domains/my_domain/pages/MyObjectListPage"

export default function MyObjectListPagePage() {
  return <MyObjectListPage />
}
```

**package.json 集成**：

```json
{
  "scripts": {
    "generate:routes": "npx tsx scripts/generate-routes.ts",
    "generate:routes:force": "npx tsx scripts/generate-routes.ts --force",
    "generate:routes:clean": "npx tsx scripts/generate-routes.ts --clean",
    "predev": "npm run generate:routes",
    "prebuild": "npm run generate:routes"
  }
}
```

**使用方式**：

```bash
# 开发时自动触发（predev hook）
npm run dev

# 生产构建前自动触发（prebuild hook）
npm run build

# 手动触发
npm run generate:routes

# 强制覆盖已存在文件
npm run generate:routes:force

# 清理孤立路由（删除 Domain 后清理 app/ 下的旧路由）
npm run generate:routes:clean
```

**注意事项**：

1. 只为已存在的组件生成路由（组件不存在时跳过并警告）
2. 默认不覆盖手动编辑的文件（除非使用 `--force`）
3. 特殊路由（如含服务器端数据逻辑的页面）需手动维护，不在 manifest 中声明 url
4. 生成的文件包含 "Auto-generated" 头部，手动编辑会在下次生成时被覆盖

#### Domain 路由入口与 Client 包装（[page-thin] 2026-07-13 约定）

> **背景**：[page-thin] 重构（26 commits，branch `refactor/page-thin-wrapper`，见 CHANGELOG `## [page-thin]`）确立了 server entry + client wrapper 双路径架构 + 容器归属原则。**所有新增 domain 路由必须遵循以下 5 条约定**，否则 codegen 会与既有 client wrapper 冲突或破坏 AppShell 嵌入布局（plan-eng-review 抓到的 P1 landmine）。

**双路径架构**：

```
/appointments（独立 URL 路由）
  → app/appointments/page.tsx（codegen 生成，thin wrapper）
  → components/appointment-route.tsx（server entry，async 预取 + h-screen 容器）
  → AppointmentWorkspace（client 组件）

ActionView 嵌入（生长领域菜单 → handleGrowthAction('timebox', 'viewAppointments')）
  → pages/AppointmentPage.tsx（client wrapper，useEffect 懒加载）
  → AppointmentWorkspace（client 组件）
```

两路**共享同一 workspace 组件**（业务逻辑/UI 唯一），仅数据预取策略不同。

**5 条不可违反的约定**：

1. **Server entry 命名**：当 domain 已存在 `pages/XxxPage.tsx`（ActionView 嵌入用，client wrapper），新增的 server 入口**必须**命名为 `components/xxx-route.tsx`（导出 `XxxRoute`），**禁止** `xxx-page.tsx` 或 `XxxPage` —— 否则 codegen 生成的 `import { XxxPage }` 与既有 client wrapper 同名冲突（TS2305 编译错）。
   - 范例：`timebox-templates-route.tsx`（导出 `TimeboxTemplatesRoute`）、`appointment-route.tsx`（导出 `AppointmentRoute`）
   - 反例：叫 `appointment-page.tsx` 会与 `pages/AppointmentPage.tsx` 撞名

2. **容器自包含**：每个 server entry 自己拥容器，**page.tsx 保持裸**（codegen 不注入任何 wrapper）。
   - 全屏页面（timebox / appointment / okrs）：`<div className="h-screen flex flex-col">`
   - 模板/编辑页（timebox-templates）：`<div className="min-h-full flex flex-col">`
   - 配置/表格页（activity-archetypes）：`<div className="space-y-4">`
   - 反例：在 `app/<route>/page.tsx` 写容器 → page.tsx 应是裸 wrapper

3. **server-only helper 路径**：`domains/{domain}/lib/server/load-*.ts`（用 `lib/server/` 目录约定信号 server-only）。**不引入** `'server-only'` 标记包（项目未安装，目录约定即文档化）。
   - MVP 阶段每个 helper 硬编码 `MVP_USER_ID`（多租户落地时统一收口，登记 TD-040）
   - 范例：`lib/server/load-appointments.ts` → 调用 `getAppointmentsByRange(start, end)`，start/end 来自 `getAppointmentPageWindow()` 纯函数（`lib/appointment-window.ts`）

4. **dual-use workspace 的 `standalone` prop**（P1 landmine 关键）：若你的 workspace 组件**同时**被独立 URL 路由**和** AppShell 嵌入路径使用（如 `TimeboxesWorkspace` 在 `app/page.tsx:103` `<TimeboxesWorkspace />` 无参嵌入），必须**加 `standalone` prop**（仿 OKRWorkspace 既有范式）：

   ```tsx
   interface TimeboxesWorkspaceProps { standalone?: boolean }
   export function TimeboxesWorkspace({ standalone = false }: TimeboxesWorkspaceProps = {}) {
     return <div className={`flex ${standalone ? "h-screen" : "h-full"}`}>...</div>
   }
   ```

   - AppShell 嵌入：`<TimeboxesWorkspace />`（默认 false → h-full，填 AppShell main 区域）
   - 独立路由：经 `manifest.view_routes.{action}.page_props.standalone: true` 由 codegen 生成 `<TimeboxesWorkspace standalone={true} />` → h-screen
   - **IRON RULE**：双向断言（`standalone=true` → h-screen 且 not h-full；`standalone=false`（默认）→ h-full 且 not h-screen）必须有单元测试，守护未来修改不破双用

   **历史 landmine**：[page-thin] 初版盲改 `<div className="flex h-full">` → `<div className="flex h-screen">`（无条件），导致 AppShell 主页 `app/page.tsx:103` 嵌入 `TimeboxesWorkspace` 时撑爆 100vh。**这是真实的 bug，不是理论**。

5. **manifest view_route 强约束**：`component` 字段必须指向 `domains/`，**禁止** `app/`（避免 codegen 循环 import）。D8 不变量测试 (`domains/__tests__/manifest-view-routes.test.ts`) 守护此约束，CI `validate:manifest` 0 errors。
   - 反例：`component: app/<route>/page` → `import { XxxPage } from "@/app/<route>/page"` → codegen 生成文件 import 自身
   - 修正：`component: domains/<domain>/<entry>` （或 `<domain>/components/<entry>` 视层级）

**新增 standalone 路由的工作流**：

```yaml
# manifest.yaml view_routes 区块
view_routes:
  my_route:
    component: domains/my_domain/components/my-route       # 约定 5
    export_name: MyRoute                                    # 可选（缩略名覆盖）
    url: /my-domain                                         # 必填
    page_props:                                             # 可选
      standalone: true                                      # 约定 4（若 workspace 需全屏）
```

```typescript
// domains/my_domain/components/my-route.tsx（server entry，约定 1）
import { loadMyData } from '@/domains/my_domain/lib/server/load-my-data'
import { MyWorkspace } from '@/domains/my_domain/components/my-workspace'

export async function MyRoute() {                           // 约定 1: -route 后缀
  const data = await loadMyData()                           // 约定 3: lib/server helper
  return (                                                  // 约定 2: 容器自包含
    <div className="h-screen flex flex-col">
      <MyWorkspace standalone initialData={data} />         // 约定 4: standalone 透传
    </div>
  )
}
```

#### 原有手动维护方式（已废弃）

以下方式不再推荐，建议迁移到构建时生成：

```typescript
// ❌ 旧方式：手动创建 app/my_domain/page.tsx
// 这种方式违反 Domain 独立性原则

// ✅ 新方式：在 manifest.yaml 中声明 view_routes.url
// 然后运行 npm run generate:routes
```

**Step 6 检查清单**：

```
□ 每个 view_route 在 manifest.yaml 中声明 url 字段
□ 每个 view_route 对应一个页面组件文件
□ 只读查询（列表、详情）直接调用 Repository，不经过 Nexus 链路
□ 写操作（表单提交、列表操作）构造 PrebuiltIntent 进入 Rule Engine
□ 页面组件没有直接 import hooks.ts 中的钩子函数
□ 页面组件没有直接 import db/schema/ 中的 Drizzle 定义
□ 运行 npm run generate:routes 生成 app/ 路由文件
□ 生成的路由文件包含 "Auto-generated" 头部注释
□ list_actions 的 condition 由页面组件读取 manifest 后动态判断渲染
```

---

## Step 7：向系统注册 Domain

**文件位置**：`domains/registry.ts`

```typescript
import { habitsDomain }   from './habits'
import { tasksDomain }    from './tasks'
import { myDomain }       from './my_domain'  // 新增

export const domainRegistry: DomainPlugin[] = [
  habitsDomain,
  tasksDomain,
  myDomain,   // 注册新 Domain
]

// Nexus 在启动时读取 registry，加载所有 manifest 和钩子
// 不需要修改任何 Nexus 组件
```

**同时需要更新的内容**：

```
□ ContextSnapshot 的 Summary 字段：
    如果新 Domain 引入了新对象，需要在 ContextSnapshot 中增加对应的 Summary 数组
    （修改 USOM 文档 + 代码 + State Machine 的快照刷新逻辑）
□ SystemEventType 枚举：
    追加本 Domain 产生的新事件类型
□ ActionType 枚举（如有新操作类型）：
    追加本 Domain 的新 ActionType
```

注意：**ContextSnapshot 的变更是本步骤中唯一需要修改 Nexus 相关代码的地方**。这是合理的，因为 ContextSnapshot 是全系统状态的聚合，新 Domain 的对象进入快照是架构层面的合法需求，不是耦合泄漏。

---

## Step 8：（可选）实现 Markdown 模板

适用于复杂创建场景（如一次性创建一组 OKR + 多个 KR），用户通过 AI 协同编辑 Markdown 完成录入。

**文件位置**：`domains/{domain_id}/markdown_templates/`

```markdown
<!-- domains/my_domain/markdown_templates/create_batch.md -->
<!-- 此模板由 Intent Engine 传给 AI，AI 据此生成初稿供用户编辑 -->

## [领域名称] 创建

**名称**：<!-- 填写 -->

**描述**：<!-- 填写 -->

**关联目标**：<!-- 可选，填写已有 Objective 的标题 -->

**计划时间**：<!-- 格式：HH:MM，如 09:00 -->

**开始日期**：<!-- 格式：YYYY-MM-DD -->

---

> 编辑完成后，点击「确认」提交
> AI 会帮你补全缺失字段，最终内容以此文档为准
```

manifest 中对应声明：

```yaml
markdown_templates:
  create_batch:
    description: "批量创建时使用的 Markdown 模板"
    template_file: "markdown_templates/create_batch.md"
    output_schema: "CreateMyObjectIntent"   # 对应 StructuredIntent.action
    max_objects: 1                          # MVP 阶段限制单对象，跨对象批处理留后续版本
```

---

## Step 9：（若生成型）实现 Handler 类

**判断标准**：如果 Domain 的 manifest 中包含 `generation_actions` 块，则需要实现对应的 Handler。Handler 是 Domain 的主动计算单元，负责生成型操作（如 AI 编排方案）。

**文件位置**：`domains/{domain_id}/handlers/`

### Handler 与 Hook 的区别

| 维度 | Hook（Reactive Track） | Handler（Generative Track） |
|---|---|---|
| 职责 | 约束校验、事件响应 | 生成方案、AI 编排 |
| AI 参与 | 禁止 | 允许（通过注入的 aiRuntime） |
| 数据来源 | USOMSnapshot + DerivedSignals | GenerationRequest（由 Context Engine 组装） |
| 输出 | 校验结果 / 指标 / 行动候选 | GenerationResult（方案 + 展示 + 警告）或 CN-UI Payload |
| 状态写入 | 禁止 | 禁止（输出经 Rule Engine 验证后由 State Machine 执行） |
| 入口签名 | 固定参数（intent, snapshot 等） | `onGenerate(request, aiRuntime)` — AI Runtime 依赖注入 |

### 接口定义

Handler 必须实现 `onGenerate` 方法，AI Runtime 通过参数注入：

```typescript
import type {
  GenerationRequest, GenerativeResult,
  GeneratedProposal, ProposalSet, PresentationPayload, Warning
} from '@/usom/types/process'
import type { AIRuntime } from '@/nexus/ai-runtime/types'
import { z } from 'zod'

// ── Prompt 和 Schema 内联在 Handler 文件中（MVP 阶段）──────────
const SYSTEM_PROMPT = `你是一个时间管理助手，根据用户的任务、习惯和能量状态生成合理的时间盒安排。`

const TimeboxPlanSchema = z.object({
  items: z.array(z.object({
    title:     z.string().describe('时间盒标题'),
    startTime: z.string().describe('开始时间 HH:MM'),
    endTime:   z.string().describe('结束时间 HH:MM'),
    energyLevel: z.enum(['high', 'medium', 'low']).optional(),
  }))
})

export class GenerateTimeboxHandler {

  async onGenerate(
    request: GenerationRequest,
    aiRuntime: AIRuntime              // ← 依赖注入，Handler 自主决定如何使用
  ): Promise<GenerativeResult> {
    const { date } = request.intent.fields
    const contexts = request.contexts

    try {
      // ── 纯文本输出示例（streaming）────────────────────────
      const result = await aiRuntime.generate({
        domainId:  'timebox',
        action:    'generate_daily_timeboxes',
        systemPrompt: SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: `请为 ${date} 生成时间盒计划。上下文：${JSON.stringify(contexts)}`
        }],
        taskType: 'content_generation',
        structuredOutput: TimeboxPlanSchema,  // 结构化输出
        stream: false,                        // CN-UI 场景必须 false
      })

      // 将 AI 结果转为 proposals
      const plan = result.content as z.infer<typeof TimeboxPlanSchema>

      return {
        proposalSet: {
          id: crypto.randomUUID(),
          label: `${date} 时间盒方案`,
          proposals: plan.items.map(item => ({
            /* GeneratedProposal */
          })),
        },
        presentation: {
          type: 'cnui',                       // CN-UI 输出（替代 markdown）
          cnuiPayload: buildCNUIPayload(plan),
        },
        warnings: [],
      }

    } catch (err) {
      // ── 降级：AI 失败时退化为规则编排 ──────────────────────
      if (err instanceof AIRuntimeError) {
        return ruleBasedFallback(request)
      }
      throw err
    }
  }
}
```

### AI Runtime 使用要点

**Handler 自主决定的一切**（AI Runtime 不干预）：
- 调用几次 AI（单步 / 多步 / 迭代）
- 用什么 systemPrompt 和 few-shot examples
- 是否使用 `structuredOutput`（Zod Schema）
- 使用 `generate()`（非流式）还是 `stream()`（流式）
- 输出 markdown 还是 CN-UI Payload
- 是否定义和使用 tools

**Streaming 策略**（必须遵守）：
- CN-UI 场景：`stream: false`，使用 `aiRuntime.generate()`。Payload 是完整 JSON，无法流式解析。前端用 loading 动画覆盖 2-5 秒等待
- 纯文本场景：`stream: true`，使用 `aiRuntime.stream()`。文本可逐步展示

**Prompt 管理**（MVP 阶段）：
- systemPrompt 和 Zod Schema 直接内联在 Handler .ts 文件中
- 不引入 PromptTemplate Registry（超过 5 个 Domain 用 AI 生成或需要在线热更新时再引入）

### Handler 注册

```typescript
// domains/{domain_id}/handlers/index.ts

export const myDomainHandlers: Record<string, { onGenerate: (req: any, ai: any) => Promise<any> }> = {
  generate_daily_timeboxes: new GenerateTimeboxHandler(),
  adjust_remaining:        new AdjustTimeboxHandler(),
}
```

在 `domains/registry.ts` 中注册：

```typescript
import { myDomainHandlers } from './my_domain/handlers'

export function findHandler(domainId: string, action: string) {
  const handlerMap: Record<string, Record<string, any>> = {
    my_domain: myDomainHandlers,
  }
  return handlerMap[domainId]?.[action]
}
```

### manifest generation_actions 完整声明

Handler 需要在 manifest 的 `generation_actions` 块中声明，结构如下：

```yaml
# ── 区块 J：生成型操作（Generative Path，可选）──────────────
generation_actions:
  - action: generate_daily_timeboxes
    description: "生成一天的时间盒安排"
    contexts:                           # 注意：使用 contexts 而非 context_capabilities
      - id: existingTimeboxes          # Context Capability 的 ID
        query: timeboxes_for_date
        params: [date, userId]        # params 为数组
      - id: activeTasks
        query: active_with_details
        params: [userId]
      - id: pendingHabits
        query: unlogged_for_date
        params: [date, userId]
    response_mode: cnui                # text | cnui
    cnui_surface_type: timebox-list   # CN-UI Surface 类型（response_mode=cnui 时必填）
    session_enabled: true              # 是否启用多轮对话（替代 session_mode）

  - action: create_habit
    description: "创建习惯"
    contexts:
      - id: existingHabits
        query: active_habits
        params: [userId]
    response_mode: cnui
    cnui_surface_type: habit-creation-card
    session_enabled: true
```

**字段说明**：

| 字段 | 必填 | 说明 |
|---|---|---|
| `action` | 是 | Handler 入口对应的 action 名称 |
| `description` | 是 | 人类可读描述 |
| `contexts` | 是 | Handler 需要的 Context Provider 依赖列表 |
| `contexts[].id` | 是 | Context Capability 的 ID（对应 Context Registry 注册时的 id） |
| `contexts[].query` | 是 | Provider 的查询方法名 |
| `contexts[].params` | 是 | 查询参数数组（字符串字面量或 ${intent.fields.xxx} 引用） |
| `response_mode` | 是 | `text`（纯文本/markdown）/ `cnui`（CN-UI Payload） |
| `cnui_surface_type` | response_mode=cnui 时必填 | Component Catalog 中的 Surface 类型 ID |
| `session_enabled` | 是 | 是否启用多轮对话（true/false，替代 session_mode） |

### Handler 约束

```
□ Handler 不直接访问 Repository — 所有数据通过 request.contexts 获取
□ Handler 不写入状态 — 输出为 GenerationResult，经 Rule Engine 验证后由 State Machine 执行
□ Handler 不直接触发事件
□ Handler 通过注入的 aiRuntime 参数调用 AI，不直接 import LLM SDK
□ Handler 必须包含降级路径（捕获 AIRuntimeError，退化为规则编排）
□ Handler 输出的 proposal 经用户确认后才进入 State Machine
□ CN-UI 场景必须 stream: false（JSON Payload 无法流式解析）
□ CN-UI Surface 类型必须在 Component Catalog 中已注册
□ Handler 的 Prompt 和 Zod Schema 内联在 .ts 文件中（MVP 阶段）
```

---

## Step 10：（若生成型）实现 Context Provider 并注册

**判断标准**：如果其他 Domain 的 Handler 需要读取本 Domain 的数据，则需要实现 Context Provider。Provider 是 Domain 的受控共享接口。

**文件位置**：`domains/{domain_id}/providers/`

### Provider 与 Repository 的区别

| 维度 | Repository | Context Provider |
|---|---|---|
| 职责 | Domain 内部 CRUD + 事务 | 向外部暴露只读投影 |
| 消费者 | Domain 内部 | 其他 Domain 的 Handler（通过 Context Engine） |
| 操作 | 读写 | 只读 |
| 输出 | USOM 对象 | 投影/聚合数据（Zod schema 校验） |

### 接口定义

Provider 必须实现 `ContextProvider` 接口：

```typescript
import type { ContextProvider, ContextCapability } from '@/usom/types/process'
import { z } from 'zod'

// 定义输出 schema
const MyDataSchema = z.object({
  items: z.array(z.object({
    id:    z.string(),
    title: z.string(),
    // ... 只包含消费方需要的最小字段
  })),
  total: z.number(),
})

type MyDataOutput = z.infer<typeof MyDataSchema>

export class MyDataDataProvider implements ContextProvider {
  constructor(private repo: MyObjectRepository) {}

  async provide(query: string, params: Record<string, unknown>): Promise<unknown> {
    const { userId, date } = params

    switch (query) {
      case 'active_for_date':
        return this.repo.findByDate(userId as string, date as string)
      case 'summary_stats':
        return this.repo.getSummaryStats(userId as string)
      default:
        throw new Error(`Unknown query: ${query}`)
    }
  }
}
```

### Provider 注册

```typescript
// domains/{domain_id}/providers/index.ts

import { registerContextCapability } from '@/nexus/context-engine/registry'

export function registerMyDomainProviders(repo: MyObjectRepository) {
  registerContextCapability({
    id:          'myDomainData',        // 全局唯一 capability id
    visibility:  'planning',            // MVP 阶段统一使用 planning
    schema:      MyDataSchema,          // Zod schema
    provider:    new MyDataDataProvider(repo),
    description: '本 Domain 的活跃数据，供编排使用',
  })
}
```

在 Domain 初始化时调用：

```typescript
// domains/{domain_id}/index.ts

import { registerMyDomainProviders } from './providers'

export function initMyDomain(repo: MyObjectRepository) {
  registerMyDomainProviders(repo)
}
```

### Provider 约束

```
□ Provider 仅允许读取、投影、轻量聚合（count / sum / avg）
□ Provider 禁止执行 planning、决策、复杂计算
□ Provider 禁止调用 AI
□ Provider 输出必须通过注册的 Zod schema 校验
□ Provider 只读取本 Domain 的 Repository，不跨域访问
□ 每个 Provider 注册时声明 visibility（MVP 统一使用 'planning'）
```

### Visibility 控制说明

| 级别 | 含义 | 消费者 |
|---|---|---|
| `private` | 仅 Domain 内部 | 无（预留） |
| `planning` | 规划类操作 | Handler（通过 Context Engine） |
| `system` | 系统全局 | 所有 Nexus 组件 |

MVP 阶段所有 Provider 使用 `planning` 级别。

---

## Step 11：（若查询型）在 manifest 中声明 query_actions

**判断标准**：如果 Domain 的数据需要在 AI 对话中被用户查询（如"看看我的习惯列表""今天有哪些任务"），则需要声明 `query_actions`。

### query_actions 与 view_route 的边界

| 维度 | `view_route`（已有） | `query_actions`（新增） |
|------|---------------------|------------------------|
| **用户意图** | "打开习惯管理页面" | "看看我的习惯" |
| **体验目标** | 进入完整功能页面 | 在对话中快速获取信息 |
| **交互模式** | 页面导航，离开 AI 对话 | 对话内输出（CN-UI 或文字） |
| **后续交互** | 用户在独立页面操作 | 用户继续在同一对话中交流 |

### 两条子路径

- **Shortcut Path**（`response_mode: cnui`）：简单展示型查询，Orchestrator 直接组装只读 CN-UI，**不需要 Handler**
- **Handler Path**（`response_mode: text`）：复杂分析型查询，需要 `Handler.onQuery()` 生成分析文字

### manifest 声明示例

```yaml
query_actions:
  # Shortcut Path 示例：简单列表展示
  - action: list_active_habits
    description: "在对话中查看习惯列表"
    response_mode: cnui
    cnui_surface: habit-list-card
    context_capabilities:
      - id: activeHabits             # 注意：使用 id 而非 capability
        query: active_habits
        params: [userId]
    examples:
      - "看看我的习惯"
      - "有哪些习惯"

  # Handler Path 示例：需要 LLM 分析
  - action: habit_statistics
    description: "查询习惯完成情况统计"
    response_mode: text
    context_capabilities:
      - id: habitLogs
        query: recent_habit_logs
        params: [userId]
      - id: habitStreaks
        query: habit_streaks
        params: [userId]
    examples:
      - "习惯统计"
      - "跑步坚持多久了"
```

**关键约束**：
- `query_actions` 不声明 `session_mode`，系统强制 `multi_turn`
- `response_mode` 只有 `text` 和 `cnui` 两种
- `context_capabilities` 使用 `id` 而非 `capability`
- `params` 为字符串数组，不是对象
- 所有查询均为只读，不修改任何系统状态

---

## Step 12：（若查询型，仅复杂分析型）实现 onQuery Handler 方法

**判断标准**：只有 `response_mode === 'text'` 的 query_actions（复杂分析型查询）才需要实现 `onQuery`。简单展示型查询（Shortcut Path）完全不需要 Handler。

**文件位置**：`domains/{domain_id}/handlers/`

### Handler 接口

```typescript
import type { QueryContext, QueryResult } from '@/types/handler'
import type { AIRuntime } from '@/nexus/ai-runtime/types'

export class HabitStatisticsHandler {

  async onQuery(
    context: QueryContext,
    aiRuntime?: AIRuntime            // Handler Path 时注入
  ): Promise<QueryResult> {
    const { contexts, sessionContext } = context

    // 1. 从 contexts 获取原始数据
    const logs = contexts.habit_logs
    const streaks = contexts.habit_streaks

    // 2. 调用 AI 生成分析文字
    const result = await aiRuntime!.generate({
      domainId: 'habits',
      action: 'habit_statistics',
      systemPrompt: '你是一个习惯养成分析助手...',
      messages: [{
        role: 'user',
        content: `请分析以下习惯数据：${JSON.stringify({ logs, streaks })}`
      }],
      taskType: 'content_generation',
      stream: false,
    })

    // 3. 返回文字回答
    return {
      type: 'text',
      content: result.content as string,
    }
  }
}
```

### onQuery 与 onGenerate 的区别

| 维度 | onGenerate | onQuery |
|------|-----------|---------|
| 路径 | Generative Path | Query Path |
| AI Runtime | 必须注入 | 可选（Shortcut Path 不需要） |
| 输入 | GenerationRequest | QueryContext |
| 输出 | GenerationResult（含 proposalSet） | QueryResult（text 或 cnui） |
| 经过 Rule Engine | 是 | **否** |
| 经过 State Machine | 是 | **否** |
| 用户确认 | 需要 | **不需要** |

### onQuery 约束

```
□ Handler.onQuery 不直接访问 Repository — 数据通过 QueryContext.contexts 获取
□ Handler.onQuery 不写入状态 — 输出为只读的 QueryResult
□ Handler.onQuery 不调用 memoryFramework.record() — 由 Orchestrator 统一记录
□ Handler.onQuery 不触发事件
□ Handler.onQuery 通过注入的 aiRuntime 调用 AI，不直接 import LLM SDK
□ Handler.onQuery 包含降级路径（AI 失败时返回基于规则的数据摘要）
```

---

## Step 13：（若 CNUI 型）实现 CNUI Surface 和 Handler（范式层 L4/L6/L7）

> **paradigm 对齐（Part I §2/§4 L4）**：CNUI surface 组件**手写**（本 Step 的 `cnui_surfaces` 区块 K + `cnuiRegistry.register` 即此模式，tasks 参考实现）。可编辑 surface 须接 `useManifestRules`（realtime blur 校验）+ `useServerErrorBackfill`（服务端错误回填，L6），并接收 `serverErrors` prop。**禁用 `CnuiFormAdapter`**（habits 死抽象）——此禁用**经 §IX（constitution v2.0.0，2026-06-22 生效）已 supersede** §CN-UI 第 4 条（修订记录见 `.specify/amendments/proposed-IX-domain-paradigm.md`，MAJOR，✅ 已生效）。`L4-1`/`L7-2` CI 检查已落地（[019.1]），对真实 src 零残留——作前向守卫防 re-introduction。

**判断标准**：如果 Domain 的 intent_triggers 中任何 action 的 `response_type` 为 `cnui`，或 manifest 中声明了 `cnui_surfaces` 区块，则需要实现 CNUI Surface 组件和 Handler。

CNUI Surface 是 Domain 拥有的对话内交互组件（不导航到独立页面，在 AI 对话流中完成交互）。公共层通过 `CnuiSurfaceRegistry` 动态发现和路由，不硬编码 Domain 特定的组件导入。

**文件位置**：`domains/{domain_id}/cnui/`

### Handler 接口

Handler 必须实现 `CnuiSurfaceHandler` 接口：

```typescript
// domains/{domain_id}/cnui/handlers.ts

import type { CnuiSurfaceHandler, CnuiOpenContext, CnuiSubmitContext } from '@/nexus/cnui/types'

export const myDomainCnuiHandlers: Record<string, CnuiSurfaceHandler> = {

  // ── 打开 surface 时的处理逻辑 ──────────────────────────────
  'my-domain-card': {
    async onOpen(context: CnuiOpenContext) {
      // context 包含 intent、user_id、snapshot 等上下文
      // 返回初始化 surface 所需的 props 数据
      return {
        initialData: {
          // 从 context 中提取初始化数据
        }
      }
    },

    // ── 提交 surface 时的处理逻辑 ─────────────────────────────
    async onSubmit(context: CnuiSubmitContext) {
      // context 包含 formData、intent、user_id 等
      // 返回 GenerationResult 或直接构造 StateProposal
      // 后续进入 Rule Engine 验证链
      return {
        success: true,
        result: {
          // 提交结果
        }
      }
    }
  }
}
```

### Surface 组件

Surface 组件是标准的 React 组件，接收 handler 返回的数据作为 props：

```typescript
// domains/{domain_id}/cnui/surfaces/MyDomainCard.tsx
'use client'

import type { CnuiSurfaceProps } from '@/nexus/cnui/types'

interface MyDomainCardProps extends CnuiSurfaceProps {
  // 从 handler.onOpen 返回的 initialData 类型
  initialData: {
    // 业务特定字段
  }
}

export function MyDomainCard({ initialData, onSubmit, onClose }: MyDomainCardProps) {
  // 渲染交互式表单/卡片
  // 用户确认时调用 onSubmit(formData)
  // 用户取消时调用 onClose()
  return (
    <div>
      {/* 组件内容 */}
    </div>
  )
}
```

### 注册到 CnuiSurfaceRegistry

在 Domain 初始化时注册所有 surface：

```typescript
// domains/{domain_id}/index.ts（对齐 tasks：模块顶层注册，handlerModulePath 指向 handlers 模块）

import { cnuiRegistry } from '@/nexus/ai-runtime/cnui/registry'
import { MyDomainCard } from './cnui/surfaces/MyDomainCard'

const handlerModulePath = './domains/{domain_id}/cnui/handlers'

// 注册 CNUI surface（签名：cnuiRegistry.register(domainId, surfaceType, {component, handlerModulePath})）
cnuiRegistry.register('my_domain', 'my-domain-card', {
  component: MyDomainCard,
  handlerModulePath,
})
```

### manifest 声明（区块 K）

在 `manifest.yaml` 中声明 `cnui_surfaces`：

```yaml
# ── 区块 K：CNUI Surface 声明（CnuiSurfaceRegistry 读取）─────
cnui_surfaces:
  - surface_type: my-domain-card
    component: domains/my_domain/cnui/surfaces/MyDomainCard.tsx
    handler: domains/my_domain/cnui/handlers.ts
    description: "创建/编辑的交互式 surface"
```

同时在 `intent_triggers` 中声明 `response_type`：

```yaml
intent_triggers:
  - action: create_xxx
    shortcut: /createXxx
    response_type: cnui                     # 使用 CNUI surface 响应
    description: "用户希望创建..."
    examples:
      - "我想..."
```

### Step 13 检查清单

```
□ manifest.yaml 中声明了 cnui_surfaces 区块（区块 K）
□ intent_triggers 中相应 action 声明了 response_type: cnui
□ Surface 组件实现为独立 React 组件，位于 cnui/surfaces/ 目录
□ Handler 实现 CnuiSurfaceHandler 接口（onOpen + onSubmit）
□ Handler 中 onOpen 返回初始化数据，onSubmit 返回结构化结果
□ 在 Domain 入口文件中调用 cnuiRegistry.register() 注册所有 surface
□ 公共层（CnuiRenderer、openCnuiSurface、submitCnuiSurface）无 Domain 特定硬编码
```

---

## 完成检查清单

```
USOM 层
  □ 新对象接口已在 USOM 文档定义
  □ Status 枚举已定义，语义与其他对象一致
  □ Summary 子类型字段不超过 5 个
  □ 新 SystemEventType 已追加到 USOM 枚举

manifest.yaml
  □ A：intent_triggers 覆盖所有可能的用户输入模式
  □ G：view_routes 覆盖所有查询/导航场景，每个 route 有对应页面组件
  □ B：lifecycle 声明了所有合法状态和跃迁
  □ B：terminal_states 已标记
  □ C：field_metadata 每字段标注 mutation_mode（FactField/ContentField/PresentationField）
  □ D：list_actions 覆盖了所有列表行操作
  □ H：required_fields 与 USOM 对象字段名一致
  □ F：subscribed_events 只订阅真正需要响应的事件
  □ L：rules-registry 已注册（registry 即 SSOT，每条规则自带 {check, fields, message} meta；manifest 不再声明 rules）
  □ manifest.yaml 定义的运行时配置（Runtime Configuration），不是开发时文档，代码中没有硬编码

钩子实现
  □ 所有钩子为纯函数，无数据库调用，无外部 IO
  □ onValidate 错误信息对用户可读
  □ onEvent 没有触发状态变更
  □ onActionSurfaceRequest 返回值无顶层 category，category 在每个 ActionCandidate 中声明
  □ onActionSurfaceRequest 权重计算参考了 DerivedSignals
  □ onOutboundRequest MVP 阶段返回 null

DB Schema
  □ 没有外键约束
  □ 没有数据库级 enum
  □ 包含 schemaVersion 字段

Repository
  □ 接口与实现分离
  □ 无 raw SQL
  □ 方法签名无 HTTP 上下文依赖
  □ toUSOM / toSummary 映射方法已实现

页面组件（Step 6）
  □ 每个 view_route 有对应页面组件
  □ 只读查询直接调用 Repository
  □ 写操作通过 PrebuiltIntent 进入 Rule Engine
  □ 页面组件未直接引用 hooks.ts 或 Drizzle Schema
  □ Next.js 路由文件仅做导入

注册
  □ 已加入 domainRegistry
  □ ContextSnapshot 已追加新对象的 Summary 字段
  □ USOM 文档已更新版本记录

Handler（Step 9，仅生成型 Domain）
  □ manifest.yaml 中已声明 generation_actions 块
  □ 每个 generation_action 有对应 Handler 类实现
  □ Handler 入口签名为 onGenerate(request, aiRuntime)（非 handle(request)）
  □ Handler 通过注入的 aiRuntime 调用 AI（不直接 import LLM SDK）
  □ Handler 不直接访问 Repository（数据通过 GenerationRequest.contexts 获取）
  □ Handler 不写入状态（输出 GenerationResult 或 CN-UI Payload）
  □ Handler 包含 AIRuntimeError 降级路径（AI 失败时退化为规则编排）
  □ CN-UI 场景使用 stream: false（非流式）
  □ CN-UI Surface 类型已在 Component Catalog 中注册
  □ Handler 的 Prompt 和 Zod Schema 内联在 .ts 文件中
  □ generation_actions 中使用 contexts（id/query/params 数组）而非 context_capabilities
  □ generation_actions 中使用 cnui_surface_type 而非 cnui_surface
  □ generation_actions 中使用 session_enabled 而非 session_mode
  □ Handler 已在 domains/registry.ts 中注册

Context Provider（Step 10，仅生成型 Domain 或被其他 Handler 消费时）
  □ 每个 ContextCapability 有唯一 id 和 Zod schema
  □ Provider 仅做读取/投影/轻量聚合，无复杂计算
  □ Provider 输出通过 Zod schema 校验
  □ Provider 注册时声明了 visibility（MVP 统一 'planning'）
  □ Provider 只读取本 Domain 的 Repository
  □ Provider 已在 Context Registry 中注册

Query Actions（Step 11，仅查询型 Domain）
  □ query_actions 中每个 action 声明了 response_mode（text 或 cnui）
  □ response_mode=cnui 的 action 声明了 cnui_surface（注意是 cnui_surface_type）
  □ context_capabilities 使用 id 而非 capability
  □ context_capabilities.params 为数组格式
  □ query_actions 未声明 session_mode 或 session_enabled（系统强制 multi_turn）
  □ view_route 和 query_actions 的边界已正确区分

onQuery Handler（Step 12，仅复杂分析型查询）
  □ manifest.yaml 中已声明 query_actions 且 response_mode=text 的 action 有对应 Handler
  □ Handler 入口签名为 onQuery(context, aiRuntime?)
  □ Handler 通过注入的 aiRuntime 调用 AI（不直接 import LLM SDK）
  □ Handler 不直接访问 Repository（数据通过 QueryContext.contexts 获取）
  □ Handler 不写入状态（输出 QueryResult）
  □ Handler 不调用 memoryFramework.record()（由 Orchestrator 统一记录）
  □ Handler 包含 AI 失败降级路径
  □ Handler 已在 handlers/index.ts 中注册

CNUI Surface（Step 13，仅 CNUI 型 Domain）
  □ manifest.yaml 中声明了 cnui_surfaces 区块（区块 K）
  □ intent_triggers 中相应 action 声明了 response_type: cnui
  □ Surface 组件位于 cnui/surfaces/ 目录，实现为标准 React 组件
  □ Handler 文件位于 cnui/handlers.ts，实现 CnuiSurfaceHandler 接口
  □ Handler.onOpen 返回初始化数据，Handler.onSubmit 返回结构化结果
  □ 在 Domain 入口文件中通过 cnuiRegistry.register() 注册所有 surface
  □ CnuiRenderer 不直接 import Domain 特定组件
  □ openCnuiSurface()/submitCnuiSurface() 不含 Domain 特定 if/else 分支
```

---

## 常见错误模式

| 错误 | 后果 | 正确做法 |
|---|---|---|
| 钩子中引入数据库调用 | Domain 破坏数据隔离，测试成本上升 | 所有数据通过 USOMSnapshot 和 DerivedSignals 获取 |
| manifest 中写条件分支逻辑 | manifest 变成程序，失去声明式特性 | 条件逻辑写在钩子函数里，manifest 只写数据 |
| **将 manifest 值硬编码为代码常量** | **修改 manifest 无效，必须同时改代码；Nexus 失去通用性** | **所有 manifest 数据通过 Registry 运行时加载** |
| onEvent 中触发状态变更 | 绕过 Rule Engine，破坏完整执行链 | onEvent 只返回 metrics 和 suggestions |
| onActionSurfaceRequest 返回顶层 category | 一个 Domain 无法同时产生多类行动切面 | category 在每个 ActionCandidate 中各自声明 |
| 页面组件直接调 Drizzle | 数据访问层泄漏到 UI 层，阶段二换 adapter 时 UI 也要改 | 页面组件只通过 Repository 接口访问数据 |
| 页面组件的只读查询走 Nexus 链路 | 无意义的性能损耗，Rule Engine 对只读操作没有价值 | 只读查询直接调 Repository |
| view_route 在 manifest 声明但无对应页面组件 | 意图路由成功但导航到空页面，用户体验断裂 | Step 6 和 Step 8 区块 G 同步完成 |
| intent_triggers 使用 `type: view_route` 而非 `view_route` 属性 | view_route 无法正确识别，导航失败 | 使用独立的 `view_route: /path` 属性 |
| intent_triggers 缺少 `shortcut` 字段 | 斜杠指令无法使用 | 添加 `shortcut: /actionName` |
| lifecycle transitions 缺少 `action`/`event_type` | State Machine 无法触发正确的事件 | 补充 `action` 和 `event_type` 字段 |
| generation_actions 使用 `context_capabilities` | Context Engine 无法组装上下文 | 使用 `contexts` + `id`/`query`/`params` |
| generation_actions 使用 `cnui_surface` | CN-UI 渲染失败 | 使用 `cnui_surface_type` |
| generation_actions 使用 `session_mode` | Orchestrator 无法识别会话模式 | 使用 `session_enabled: true/false` |
| query_actions 使用 `capability` | Context Engine 无法组装上下文 | 使用 `id` 代替 `capability` |
| ContextSnapshot 字段爆炸 | 快照体积膨胀，所有消费方性能下降 | Summary 子类型严格控制在 5 个字段以内 |
| 新 Domain 修改了 Nexus 组件 | 架构边界泄漏，维护成本倍增 | 停下来讨论，确认是 manifest 设计不足还是架构需要调整 |
| Handler 中直接访问 Repository | 绕过 Context Engine，破坏数据组装职责分离 | Handler 所有数据通过 GenerationRequest.contexts 获取 |
| Provider 中包含复杂计算或 AI 调用 | Provider 职责膨胀，本应由 Handler 承担 | 复杂逻辑移入 Handler，Provider 只做读取/投影/聚合 |
| Handler 直接写入状态 | 绕过 Rule Engine，破坏完整执行链 | Handler 输出 GenerationResult，经 Rule Engine 验证后由 State Machine 执行 |
| Handler 使用旧签名 handle(request) | Orchestrator 无法注入 AI Runtime，Handler 无法调用 AI | 使用新签名 onGenerate(request, aiRuntime) |
| Handler 直接 import LLM SDK | 绕过 AI Runtime 的统一路由/重试/降级 | 通过注入的 aiRuntime.generate() / aiRuntime.stream() 调用 |
| Handler CN-UI 场景使用 stream: true | JSON Payload 无法流式解析，渲染失败 | CN-UI 场景必须 stream: false |
| Handler 使用未注册的 CN-UI Surface 类型 | generateCNUIObject() Schema 校验失败 | 先在 Component Catalog 注册，再在 Handler 中使用 |
| Orchestrator 中调用 aiRuntime.generate() | 违反 Orchestrator Purity（纯调度，不碰 AI） | AI Runtime 只在 Handler 的 onGenerate / onQuery 内部使用 |
| onQuery Handler 直接调用 State Machine | Query Path 是只读路径，不允许状态变更 | onQuery 返回 QueryResult，不产生 StateProposal |
| onQuery Handler 调用 memoryFramework.record() | 违反 Memory Framework 单一写入口原则 | 查询摘要由 Orchestrator 统一记录 |
| 简单展示型查询实现 Handler | 不必要的复杂度，Shortcut Path 不需要 Handler | response_mode=cnui 且数据可直接展示时，Orchestrator 直接组装 CN-UI |
| query_actions 声明 session_mode | Query Path 强制 multi_turn，不允许自定义 | 不声明 session_mode，系统强制默认 |
| Shortcut Path CN-UI 包含可编辑组件 | 查询型 CN-UI 必须只读 | 只使用 text、badge 等只读组件，操作按钮只有可选的 dismiss |
| CnuiRenderer 直接 import Domain 特定组件 | 违反 Domain Surface Ownership 约束，新增 Domain 需改公共层 | 通过 CnuiSurfaceRegistry 动态发现和渲染 surface |
| openCnuiSurface() 包含 Domain 特定 if/else 分支 | 公共层与 Domain 耦合，破坏 Domain 独立性 | surface 类型与 handler 通过 manifest cnui_surfaces 声明，公共层只做查表路由 |
| CNUI surface 组件未在 cnuiRegistry 注册 | 公共层无法发现 surface，渲染失败 | 在 Domain 入口文件中调用 cnuiRegistry.register() |
| intent_triggers 缺少 response_type 字段 | Intent Engine 无法判断响应方式，可能错误导航或输出纯文本 | 为每个 action 声明 response_type（page/cnui/text） |
| manifest 缺少 cnui_surfaces 区块 | CnuiSurfaceRegistry 无法建立 surface 映射 | 在 manifest.yaml 中声明区块 K，注册所有 surface |

---

*文档版本：2026_06_21（Part II 对齐 tasks 参考实现）*
*本文档在总体设计完成后作为 Domain 开发的操作手册使用*
