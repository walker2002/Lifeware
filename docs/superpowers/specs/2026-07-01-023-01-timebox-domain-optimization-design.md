# [023-01] Timebox 域优化设计

- **日期**：2026-07-01
- **来源需求**：`mydocs/dev/023.01-TimboxDomain优化.md`
- **前置**：[023] A3 全阶段已 ship（main ad81c34），本文档处理 A3 后遗留的四类问题
- **方案**：方案 B（修复 + 守门员，命中文档全部需求并收口同类问题）

---

## 1. 背景与目标

[023] A3 完成后，Timebox 域在「成长领域」导航与 `/createTimebox` 流程上仍存在四类缺陷，影响基本可用性。本设计在不改动 Nexus 架构与状态机的前提下，做最小而精确的修复，并引入「守门员」防御，使同类问题未来自动收口。

### 不做什么（YAGNI）

- 不改「成长领域」Tab label（保留 `left-panel.tsx:32` 硬编码，用户已确认只改 manifest 的 action 文案）
- 不引入 `manifest.ui.tab_label` 这类新 schema 字段（方案 C，超出文档范围）
- 不重构 CNUI surface 翻页范式（已有 [019.1] 手写范式，沿用）

---

## 2. 需求清单（来自 mydocs）

| # | 需求 | 归类 |
|---|------|------|
| 1.1 | `/schedule`（viewSchedule）点击报"操作已记录，请在对话中继续"——manifest 未定义 `response_type: page` | manifest |
| 1.2 | `/createTimebox` 等 CNUI action 在 AI 助手无输入时应直接进入空白 CNUI（参考任务管理），而非提示"任务必填" | 路由 |
| 1.3 | 盘点成长领域菜单中无执行代码的 action，提示"待开发" | 守门员 |
| 1.4 | `/schedule` 导航标题改为「时间盒管理」（manifest） | manifest |
| 2.1 | `/createTimebox` 导航标题改为「创建新的时间盒」（manifest） | manifest |
| 2.2 | `/createTime` 支持标题含空格（如「OKR 季度计划」），当前提示"任务标题必填" | AI parser |
| 2.3 | `/createTime` 支持一次输入多条记录（如分号分隔两条） | AI parser |
| 2.4 | 多条记录 CNUI 可左右翻页编辑 | CNUI（已具备，验证） |
| 2.5 | 新增 timebox 点保存失败：`操作失败: 生成型路径执行失败: Context capability not found: "activeHabits"` | bug 修复 |

---

## 3. 现状分析（关键代码定位）

### 3.1 manifest.yaml（timebox）

- `viewSchedule`（line 51-58）：有 `view_route: /schedule`，但**无 `response_type`** → 落入 `getActionResponse` 的 fallback（`responseType === 'text'`），触发"已记录，请在对话中继续"（`use-intent-handler.ts:286-294`）
- `createTimebox`（line 11-20）：`response_type: cnui` ✓；description = "创建一个新的时间盒"
- `generation_actions`（line 244-277）：仅 `createSmartSchedule` / `adjustRemainingSchedule`，**不含 createTimebox**

### 3.2 成长领域菜单文案来源

- 单个 action 菜单项的文案 = `intent_triggers[].description`（`growth-menu.tsx:149` 渲染 `act.description`）
- 「成长领域」Tab label（`left-panel.tsx:32`）、FAB「成长领域」入口（`fab.tsx:76,81`）、`DOMAIN_META.timebox.label='时间盒'`（`growth-menu.tsx:49-54`）均为**硬编码**
- `fab.tsx:40-44` 的 `DEFAULT_ACTIONS[0].label='创建时间盒'` 也是硬编码，**未联动 manifest**

### 3.3 路径路由判定（关键，与 2.5 bug 相关）

- `parseDynamicForm`（`template-parser.ts:81-97`）构造 intent 时**不设 `pathType`**
- orchestrator（`index.ts:761`）：`pathType = intent.pathType ?? resolvePathType(intent.action, manifest)`
- `resolvePathType`（`path-router.ts:20-29`）：`query_actions > generation_actions > 默认 contract`
- 因此 `createTimebox` 静态上必走 **contract path**，不进 `executeGenerativePath`
- `executeGenerativePath`（`index.ts:1050-1144`）内 `assembleContext` → 读 `manifest.generation_actions[action].contexts` → 逐项 `resolveContext`

### 3.4 activeHabits capability 的归属

- 注册点：`register-providers.ts:103-112`（仅当 `habitRepo` 注入时）
- 请求点：**仅 habits 域** `manifest.yaml:247` 的 generation/query action + `okrs/contributions.ts:100`
- **timebox 域的 generation_actions.contexts 全程不含 activeHabits**

### 3.5 已具备能力（2.4 验证项）

- `CreateTimebox.tsx`（[023] A2，[019.1] 手写范式）已实现多条 `items` 左右翻页 + 「提交全部」逐条提交
- handler.submit 的 createTimebox 分支（`handlers.ts:187-208`）逐条 `submitDynamicIntent`，失败收集为 `succeeded/failed`

---

## 4. 设计

### Section 1 — manifest.yaml 修复

**文件**：`frontend/src/domains/timebox/manifest.yaml`

1. `viewSchedule`（line 51-58）补 `response_type: page`
2. `viewSchedule.description`（line 53）：`查看今日时间盒日程` → `时间盒管理`
3. `createTimebox.description`（line 13）：`创建一个新的时间盒` → `创建新的时间盒`（"的"去掉，更简短；保留语义关键词）
4. `createTimebox.examples`（line 16-19）新增多记录 + 含空格标题示例：
   ```yaml
   - 上午10:30-12:30 OKR 季度计划
   - 上午10:30-12:30 OKR 季度计划；下午16:00-18:00 带孩子出去玩
   ```
5. **守门员规则**（validate-manifest）：`view_routes` 内每个 action 的 intent_trigger 必须声明 `response_type: page`（防同类"已记录"再现）

**验收**：
- `/schedule` 点击从右侧导航/成长领域菜单进入，正确切换到 schedule 页面（不再弹"已记录"）
- 成长领域菜单 timebox 分组下 `viewSchedule` 显示「时间盒管理」、`createTimebox` 显示「创建新的时间盒」
- `validate:manifest` 对缺 `response_type` 的 view_route action 报错

### Section 2 — activeHabits bug（根因已锁定 + Task 0 修复验证）

#### 现象（历史）
用户 `/createTimebox` 点保存 → `操作失败: 生成型路径执行失败: Context capability not found: "activeHabits"`。

三层错误拼接溯源：
- `操作失败:` ← `use-intent-handler.ts:403`（handleCnuiConfirm 失败 system 消息）
- `生成型路径执行失败:` ← `orchestrator/index.ts:1141`（executeGenerativePath catch）
- `Context capability not found: "activeHabits"` ← `registry.ts:36`（resolveContext）

#### 真实根因（autoplan dual-voice 三重验证 / Task 4 端到端验证已锁定）

**根因 = `registerAllProviders` 死代码**。

`nexus/context-engine/register-providers.ts` 末尾定义了 `registerAllProviders()`，
其内部从 repositories 注入 capability providers 并写入全局注册表。
**但该函数从未被任何调用方触发**——`assembleContext` 通过 `resolveContext` 查注册表时永远空表，
任何 generative action 首次引用 capability 都会触发 `Context capability not found`。

为什么 createTimebox 也会触发？同一会话（session）内的相邻请求的副作用被归到当前请求：
- 触发链：用户先在 AI 助手点 `/createTimebox`，但 surface CNUI 弹出后需要填表，
  系统在前序若干次 dispatch 中可能已尝试过 generative action（如隐式 LLM 推断或
  习惯/任务域的复合 dispatch）并失败，那次失败挂在 session 级错误状态中；
  当用户最终「保存」createTimebox 时，session 内的旧错误被回放——典型 R2 归因偏差
  + R1 capability 表始终空（双重叠加）。

更精确地说：**bug 的本质是 R2（相邻请求错误归因）+ 底层 R1（capability 表永远空）**，
R3 (pathType 注入) 在本仓库代码静态检查不成立——orchestrator 走 `resolvePathType`
而非直接信任 intent.pathType。

#### 修复（Task 0：commit `89221c7`）

**文件**：
- `frontend/src/nexus/context-engine/register-providers.ts` — 新增 `ensureProvidersRegistered()` 幂等函数 + 3 个 repository imports
- `frontend/src/nexus/orchestrator/index.ts` — `executeGenerativePath` 入口（try 块首行，`assembleContext` 之前）调用 `ensureProvidersRegistered()`

`ensureProvidersRegistered` 实现：
- 模块级 `let registered = false` 标志位
- 首次调用注入所有 capability providers（existingTimeboxes / activeTasks / completedTasks / pendingHabits / activeHabits / energyCurve，共 6 个）
- 后续调用 no-op（幂等）

#### 验证（Task 4 端到端 /browse 实测，commit `a1fc220` 起含全部 [023-01] 修复）

| 验证项 | 命令 | 结果 |
|--------|------|------|
| capability 全部注册 | `vitest src/nexus/context-engine/__tests__/register-providers.test.ts` | **2/2 PASS** — 6 个 capability 全部就位 + 二次调用幂等 |
| tsc 零回归 | `npx tsc --noEmit` | **60 errors = 60 errors**（base/head 一致，零新增） |
| vitest 零回归 | `npx vitest run src/nexus/orchestrator/__tests__/` | **8 files / 86 tests PASSED**（Task 3 守护） |
| 端到端 generative action | `/browse` 点击「AI 智能编排日程 /smartSchedule」 | **CNUI 表单正常渲染**：「智能编排方案 (0 项)」+ 取消按钮；`assembleContext` 调用 6 个 capability 全部成功（含 `activeHabits`） |
| 历史错误回放 | `/browse` AI 面板历史中 `Context capability not found: "activeHabits"` | **0 条新错误**，旧错误均来自 Task 0 修复前的历史会话（2026-07-01T00:56/01:31 等时间戳） |

#### 端到端 verify 范围声明

- `/browse` 实测确认 Task 0 根因修复**有效**：所有 generative action（含 `/smartSchedule`）的 `assembleContext` 不再报 `activeHabits not found`。
- `/createTimebox` 的 CNUI 表单**未能在主面板视觉渲染**——这是一个独立的 UI/render 通道问题（与 Task 0 无关）；
  brief 1.2 需求（CNUI 直接弹出空白表）将在 Task 7（handleGrowthAction 待开发分支 + smoke test 阶段）或独立 CNUI surface review 中闭环。
- `/createTimebox 上午10:30-12:30 测试任务` 实测得到「任务标题必填」——这是 AI parser 把 `/createTimebox` 误判为 `createTask`（tasks 域）的 **AI parser 域识别 bug**，
  属 **Task 5 范围**（`MULTI_TASK_PROMPT` few-shot：含空格标题 + 全角分号），与 Task 0 无关。

#### 验收（与原 spec 对齐）

- [x] T0 复现后，精确根因已锁定（`registerAllProviders` 死代码，autoplan dual-voice 三重验证）
- [x] capability 全部注册（unit test 2/2 PASS）
- [x] 所有 generative action 不再报 `activeHabits not found`（/smartSchedule /browse 实测通过）
- [x] 守门员单测：构造 `pathType='generative'` 但 action 不在 generation_actions 的 intent，断言回落 contract path（Task 3 提交 `a1fc220`）
- [x] resolveContext 错误单测：未注册 capability 时错误消息含已注册列表（Task 2 提交 `4640b80`）
- [ ] `/createTimebox` 主面板 CNUI 视觉渲染：defer 至 Task 7 / 独立 CNUI review
- [ ] `/createTimebox 上午10:30-12:30 测试任务` 端到端落库：defer 至 Task 5（AI parser 域识别 bug 修复后）

### Section 3 — AI parser prompt 增强（2.2 / 2.3）

**文件**：`frontend/src/nexus/core/intent-engine/ai-parser.ts`，`MULTI_TASK_PROMPT`（line 104-136）

在「识别规则」段追加 few-shot 示例与强化条款：
```
示例：
用户输入："上午10:30-12:30 OKR 季度计划"
解析：[{ title: "OKR 季度计划", startTime: "今日 10:30", duration: 120, confidence: 0.92 }]
说明：标题"OKR 季度计划"含空格，是单个任务的标题，不要按空格拆分。

用户输入："上午10:30-12:30 OKR 季度计划；下午16:00-18:00 带孩子出去玩"
解析：[
  { title: "OKR 季度计划", startTime: "今日 10:30", duration: 120, confidence: 0.92 },
  { title: "带孩子出去玩", startTime: "今日 16:00", duration: 120, confidence: 0.9 }
]
说明：全角分号"；"分隔两条任务。

强化规则：
- 标题可包含空格（如"OKR 季度计划"），仅以「时间关键词 / 分隔符」断句，不要按空格切分标题
- 分隔符优先级：全角分号"；" > 半角分号";" > 换行 > 半角逗号","
- 多个独立时间段 = 多条；同一时间段内的文本整体作为一个标题
```

**不改**：regex fallback 路径、`parseWithAI` 主流程、其他 prompt 模板。

**验收**：
- LLM 解析（dev server 真实调用）`上午10:30-12:30 OKR 季度计划` 得到单条 title="OKR 季度计划"
- 解析 `上午10:30-12:30 OKR 季度计划；下午16:00-18:00 带孩子出去玩` 得到 2 条
- `/browse` 验证 CNUI 翻页显示 2 条草稿（2.4 已具备能力，端到端确认）

### Section 4 — manifest-utils 抽离 + FAB 联动（1.4 / 2.1 / 1.3）

#### 新增 `frontend/src/usom/manifest-utils.ts`（server action module）

集中 manifest 读取，消除前端散落的硬编码与 fallback 分叉：

```ts
/** 显式声明优先，否则按 manifest 结构推断 */
export function getResponseType(domainId: string, action: string): 'cnui' | 'page' | 'text' {
  // 1. intent_trigger.response_type（显式，胜出）
  // 2. view_routes[action] 存在          → 'page'
  // 3. intent_trigger.cnui_surface 存在  → 'cnui'
  // 4. 否则                                → 'text'
}

export function getActionDescription(domainId: string, action: string): string {
  // 读 intent_triggers[action].description
}
```

#### 联动改造

- `app/actions/intent.ts:1095` `fetchActionData` 的 description 改用 `getActionDescription`（消除分支）
- `app/actions/intent.ts` `getActionResponse` 改用 `getResponseType`（消除分支）
- `components/layout/fab.tsx:40-44` `DEFAULT_ACTIONS[0].label` 改为异步取 `getActionDescription('timebox','createTimebox')`：FAB 在 mount 时（`useEffect`）拉取 manifest description，loading 态显示 shortcut 文案，避免硬编码与 manifest 失同步
- `growth-menu.tsx:49-54` `DOMAIN_META.label` **不改**（domain 分组名"时间盒"是域级别展示，与 action description 不同维度；保留硬编码）

#### 需求 1.3（无执行代码的 action 提示"待开发"）

- `getActionResponse` 在 action 既不在 view_routes、又无 cnui_surface、又无 intent_trigger 对应实现时，返回新类型 `'unimplemented'`
- `use-intent-handler.ts:278-298` `handleGrowthAction` 增加 `responseType === 'unimplemented'` 分支：弹「该功能待开发」system 消息，不切换视图
- 盘点（T0 复现阶段顺带）：列出 timebox 域所有 intent_trigger，逐一标注有无实现，把无实现的写进本节附录

**验收**：
- manifest 改 description 后，FAB「创建时间盒」按钮文案自动跟随（不需改 fab.tsx）
- `getResponseType('timebox','viewSchedule') === 'page'`（守门员对齐 Section 1）
- 成长领域菜单点击无实现的 action，弹「该功能待开发」而非"已记录"或空白

---

## 5. 验收标准（端到端）

| 场景 | 预期 | 验证 |
|------|------|------|
| `/schedule` 点击 | 进入 schedule 页面 | `/browse` |
| 成长领域 menu「时间盒管理」 | 文案正确 + 可点进 schedule | `/browse` |
| 成长领域 menu「创建新的时间盒」 | 文案正确 | `/browse` |
| FAB「创建时间盒」文案 | 随 manifest description 变 | 改 manifest 后 FAB 跟随 |
| `/createTime 上午10:30-12:30 OKR 季度计划` | 单条草稿，title 含空格 | `/browse` |
| `/createTime ...；下午16:00-18:00 带孩子出去玩` | 2 条草稿，翻页 | `/browse` |
| `/createTimebox` 保存 | 成功落库 | `/browse` 真实 PG |
| 无实现 action 点击 | 弹「待开发」 | `/browse` |
| `validate:manifest` | view_route 缺 response_type 报错 | npm script |
| tsc / vitest | base=head 零新增 | 双验证 |

---

## 6. 风险与边界

- **Section 2 根因未静态锁定**：T0 复现是硬前提；若复现后根因与守门员防御不在同一处，需据实追加精确修复（已在 plan 预留 task 位）
- **FAB 异步取文案**：mount 到 manifest 返回之间有短暂 loading，显示 shortcut 兜底（不阻塞交互）
- **prompt 增强依赖 LLM 遵守**：few-shot 不保证 100%，若 `/browse` 验证仍失败，plan 中追加 regex fallback（本设计未含，YAGNI 先不做）
- **CNUI 多条翻页（2.4）已具备**：只做端到端验证，不改 `CreateTimebox.tsx`

---

## 7. 文档同步

本设计落地时同步更新 `CHANGELOG.md`（constitution v2.1.1 PATCH 规则：docs/ 变更写 CHANGELOG）。manifest.yaml 属 `docs/` 协同层之外的域配置，但 `validate-manifest` 规则变更若涉及 constitution，需同步 constitution。

---

## 8. 后续（plan 输入）

按 Section 1 → T0(复现) → Section 2 → Section 3 → Section 4 顺序，每段独立可验证。Section 2 的精确修复在 T0 后填充。
