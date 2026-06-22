<!--
@file 019-ci-validator-design
@brief Lane C [019.ci-validator] 设计文档 — Domain 写入口治理 CI Validator
-->

# [019.ci-validator] Design — Domain 写入口治理 CI Validator

> **状态**：DRAFT（brainstorm 产出，待用户审）→ 审批后转 writing-plans 出 TDD 实施切片
> **分支**：`feat/019-ci-validator`（基于 `feat/019-domain-paradigm-spec@02a5803`）
> **来源**：[019] design doc（`/plan-eng-review` 2026-06-21 通过）+ `docs/domain-development-guide.md` §4-5（权威范式）
> **日期**：2026-06-22

---

## 1. 背景与目标

[019] Domain 范式锁定两条合法写入口（`executeIntent` ∪ `createDomainMutationService.{update,execute}`），但仓库**零远端 CI、零 husky、零 git hook**——`validate-manifest.ts`（纯 YAML 诊断）仅在本地 `predev`/`prebuild` 跑，写入口合规纯靠 honor-system。本 Lane 把范式约束落成 **CI validator（fitness function）**，让「绕过写入口」在 push 前被机器拦截，而非靠人工记忆。

**目标**：上线两个 MUST 门的强制 validator + husky pre-push 本地 gate。

**非目标**（留 TODO）：远端 CI(T-A)、CNUI 一致性 CI(T-B)、新域脚手架 validator(T-D)、CnuiFormAdapter 强制（待 §IX supersede 生效）、realtime rule 静态纯度精确判断。

---

## 2. Success Criteria（验收标准 · 可验证）

1. **合规不假阳**：validator 对真实 `src/app/actions/` 运行，tasks/habits 入口零 error（它们经 mutationService.execute）。
2. **绕过必被抓**：在豁免清单中临时移除 `okr.ts` → validator 报 `okr.ts` 的 updateObjective 式裸 repo 写 error；恢复豁免 → 零 error。
3. **rules-registry 门**：okrs/timebox 在豁免内不报；临时移除豁免 → 报「写域缺 rules-registry」error。
4. **husky gate**：`git push` 时 `.husky/pre-push` 跑 `validate:manifest && validate:structure`；注入违规 → push 被阻断（exit 1）。
5. **取代无回归**：删除 `habits/__tests__/write-entry-guard.test.ts` 后，其覆盖的绕过场景由 validator 接管（fixture 断言）。
6. **零新运行时依赖**：仅新增 `husky` devDep；validator 用已在的 `typescript ^5`。

---

## 3. 架构（A）

### 3.1 文件分工

| 文件 | 职责 | 改动 |
|---|---|---|
| `frontend/scripts/validate-manifest.ts` | 纯 YAML 诊断（含 G 区块 rules-id 完整性） | **不动** |
| `frontend/scripts/validate-domain-structure.ts` | TS 结构诊断（orchestrator-溯源 + rules-registry 存在性） | **新增** |

两文件共享 diagnostics 输出风格（`{level, rule, message}` + 彩色 + `process.exit(1) on error`），但各自独立脚本（validate-manifest 保持纯 YAML 不引入 TS 解析依赖）。

### 3.2 依赖

- `typescript ^5`（已在）— 原生 Compiler API（`ts.createSourceFile` + AST 遍历）
- `husky`（**新增 devDep**）— pre-push 钩子
- 零其他新增（不用 ts-morph / @typescript-eslint / lint-staged）

### 3.3 不用 ts-morph 的理由

spec 的「入口函数级（非跨过程）」检查用语法级 AST + 命名约定启发式即可达成（识别 `new XxxRepository()` / 类型注解 / mutationService 工厂调用）。ts-morph 的类型级优势（`getType()`）非必需，不值得换一个 devDep + 偏离现有零依赖脚本风格。

---

## 4. orchestrator-溯源 检查（B · #1 MUST 门 · error · 核心）

> spec `docs/domain-development-guide.md` §4（L114）：每个 `use server` 写入口函数持久化必须调 `executeIntent` 或 `mutationService.update/execute`；入口函数内直接 repo/db 写不经白名单 = 违宪。**入口函数级检查（非跨过程分析）**。

### 4.1 scope

`src/app/actions/**/*.ts` 递归（含 `tasks/`、`habits/` 子目录），**排除** `__tests__/`。

### 4.2 入口函数识别

actions 目录约定：`export async function` = server action = 写入口面。validator 扫每个文件的顶层 `export async function` 声明作为入口函数单元。

### 4.3 写方法集

```
WRITE_METHODS = { save, create, update, updateStatus, updateFields, delete }
```
（GenericRepo 写方法族，取自 `createTasksGenericRepo` 5 方法 + delete）

### 4.4 接收者溯源（纯语法启发式）

遍历入口函数体，建立**变量绑定表**，判定每个标识符的「类别」：

| 绑定形态 | 类别 |
|---|---|
| `const x = new XxxRepository(...)` / `const x = createXxxRepository(...)` | `repo` |
| 参数 `(x: XxxRepository)` / `const x: XxxRepository = ...`（类型名匹配 `/Repository$/`、`/Repo$/` 或含 `GenericRepo`） | `repo` |
| `const x = createXxxMutationService(...)` / `const x = await getXxxMutationService()` | `mutationService` |
| `getOrchestrator()` / import 的 `orchestrator` | `orchestrator` |

### 4.5 判定逻辑

对入口函数体内每个 `CallExpression` 形如 `recv.M()`：

- 若 `M ∈ WRITE_METHODS`：
  - `recv` 溯源为 **repo** → 标记「裸 repo 写」嫌疑
  - `recv` 溯源为 **mutationService** 且 `M ∈ {execute, update}` → 白名单委托（合规，跳过）
  - `recv` 溯源为 **orchestrator** 且 `M = executeIntent` → 白名单（合规，跳过）
  - `recv` 无法溯源 → warning（`unknown-receiver`，提示人工确认；非 error）

→ 入口函数含「裸 repo 写」且**不在豁免清单** = **error**（rule: `write-entry-bypass`）。

### 4.6 update 同名歧义的消解

`mutationService.update`（合规白名单）与 `repository.update`（违规写）同名 `update`。**纯正则无法区分**——这正是必须用 AST + 接收者溯源的根因。溯源把 `update` 的语义绑定到接收者类别上。

### 4.7 豁免清单（脚本内 TS 常量）

枚举式，每条带 sunset + reason，与 validator 同源同审（少一个外部文件）：

```ts
const WRITE_ENTRY_EXEMPTIONS = [
  {
    file: 'okr.ts',
    reason: 'updateObjective 绕过写入口（字段更新非状态转换，正确修复需 mutation-service=onboarding 一部分）',
    sunset: 'okrs 全量 onboarding（缠 [025] 跨域事务）',
  },
  // timebox 不在此门：startTimebox/endTimebox 走 executeIntent（合规）；它缺的是 L3 → 进 §5 门
] as const
```

> 豁免键 = 相对 `actions/` 的文件路径。匹配粒度=文件级（该文件所有入口函数豁免），首版足够（okr.ts 整文件是过渡态）。

### 4.8 nexus 内部 repo 写不被扫

`mutationService.execute` 最终在 `field-executor` / `SM` 内部调 repo 写——但这些在 `nexus/`，**不在 scope（`actions/`）**。scope 限定保证不假阳：只查写入口面，不查写入口内部。

### 4.9 业务事实 repo 判据（目录判据 · writing-plans 阶段细化）

> **细化背景**：writing-plans 阶段全域扫描发现，§4.1 scope「`actions/**` 全域 repo 写=违规」会误报系统记录写（`IntentionRepository`/`SystemEventRepository`/`AISessionRepository` 等基础设施 repo 的 save）。本节细化「哪些 repo 受写入口约束」。

宪法 §III Single-Writer 约束的是**业务事实**持久化（task/habit/okr 状态等有业务不变量的 Domain 对象）。Nexus 基础设施/配置记录（intention/event/session/template）无业务不变量需 `onValidate` 守，直接 repo 写不构成「绕过写入口」。

**判据（validator 实现，解析入口文件 import 路径）**：
- import 路径含 `domains/` → **业务事实 repo**（受查，裸写报 `write-entry-bypass`）
- import 路径含 `lib/db` → **系统记录 repo**（不查）
- **配置例外** `CONFIG_REPOSITORY_EXCEPTIONS`（`HabitTemplateRepository`：domain 下但语义=配置）→ 不查
- 无 import 信息（同文件定义）→ 保守视为业务事实（报 + 提示确认）

**全域实测影响**（`src/app/actions/` 扫描）：
- tasks/habits：写全经 `mutationService`（0 裸业务 repo 写，合规 ✓）
- okrs：`updateObjective` 裸 `ObjectiveRepository.save`（domains，违规 → §4.7 豁免）
- intent.ts：`intentionRepo.save` ×5（lib/db 系统记录，不报）+ `HabitTemplateRepository` 写 ×3（配置例外，不报）
- session.ts：`sessionRepo.create`（lib/db，不报）

> 净效果：目录判据把 9 处系统记录/配置写排除在违规外，SC-1（tasks/habits 零假阳）成立且全域零误报。

---

## 5. rules-registry 存在性检查（C · 写域 MUST · error · 带豁免）

> spec §4（L94/L114）：写域（有写路径）必有规则三层之 rules-registry。

### 5.1 检查逻辑

扫 `src/domains/*/`：每个有 `manifest.yaml` 的域须存在 `rules-registry.ts`。

### 5.2 豁免

```ts
const RULES_REGISTRY_EXEMPTIONS = [
  { domain: 'okrs',   reason: '无 rules-registry（前范式遗产）', sunset: 'okrs 全量 onboarding' },
  { domain: 'timebox', reason: '写域缺 L3 规则三层',            sunset: 'timebox L3 补齐' },
] as const
```

### 5.3 与 validate-manifest G 区块的关系（不重叠）

- validate-manifest **G 区块**：manifest 声明了 `rules:` → registry 导出一致性（rules-id 完整性）。
- 本检查：**写域 → registry 文件存在性**（更广，即使 manifest 没声明 rules）。

两者互补，不重复。

---

## 6. v1 范围与降级（已与用户确认）

spec §4（L114-116）列 4 项 `validate-domain-structure.ts` 检查。**v1 只强制 2 项 error 门**，另 2 项降级为 TODO：

| spec 检查项 | v1 处置 | 理由 |
|---|---|---|
| orchestrator-溯源（§4） | ✅ **error 门** | #1 MUST，全域零豁免 |
| rules-registry 存在性（§5） | ✅ **error 门** | 写域 MUST，带 okrs/timebox 豁免 |
| CnuiFormAdapter 残留 | ⏸️ **TODO/不查** | §IX supersede **未生效**（PROPOSED），强制会与现行 §CN-UI 第 4 条（仍 canonical）冲突；生效后启用 |
| realtime rule 单字段纯函数 | ⏸️ **TODO/不查** | 静态纯度判断不可靠（无法精确判定函数体是否访问 scope 外字段），spec 自身定位「辅助」非 MUST；硬上会假阳 |

**净效果**：v1 = 两个 MUST 门，治理强制力不打折，避开两个不可靠/未生效检查。降级项在 validator 源码留 `// TODO(§IX生效后)` / `// TODO(静态纯度)` 注释占位。

---

## 7. husky + scripts 接入（D）

### 7.1 package.json 改动（`frontend/package.json`）

```diff
  "scripts": {
+   "validate:structure": "tsx scripts/validate-domain-structure.ts",
+   "prepare": "husky",
-   "prebuild": "npm run generate:routes && npm run validate:manifest",
+   "prebuild": "npm run generate:routes && npm run validate:manifest && npm run validate:structure",
  },
  "devDependencies": {
+   "husky": "^9"
  }
```

### 7.2 `.husky/pre-push`

```sh
#!/usr/bin/env sh
cd frontend && npm run validate:manifest && npm run validate:structure
```

（husky v9 风格：`.husky/pre-push` 为纯脚本，无 `source husky.sh`。`prepare: husky` 在 `npm install` 时装钩子。）

### 7.3 触发点

- `predev` / `prebuild`：本地开发 + 构建前（含 validate:structure）
- `pre-push`：push 前（双 validator，违规阻断 push）

---

## 8. 测试策略（E · TDD）

### 8.1 单元测试（vitest，纯函数）

- 接收者溯源：给定绑定表 + CallExpression，判定 recv 类别
- 入口函数识别：从 source file 提取 `export async function` 列表
- 豁免命中：文件路径匹配豁免清单

### 8.2 fixture（结构化样本）

复用 `domains/_rulefixture` 机制，新建 `domains/_writeentryfixture/`：

- `bypass-server-action.ts`：含故意裸 repo 写的 use server 函数 → **必被抓**（rule `write-entry-bypass`）
- `compliant-via-mutation-service.ts`：经 `mutationService.execute` → **零报**
- `compliant-via-execute-intent.ts`：经 `orchestrator.executeIntent` → **零报**
- `ambiguous-update.ts`：`mutationService.update`（合规）vs `repo.update`（违规）同文件 → 仅报后者（验证歧义消解）

### 8.3 集成测试

跑 validator 对真实 `src/app/actions/`，断言：
- 默认（含豁免）：tasks/habits/okr/timebox 零 error
- 临时移除 `okr.ts` 豁免：`okr.ts` 报 write-entry-bypass
- 临时移除 okrs/timebox registry 豁免：报 rules-registry-missing

### 8.4 TDD 顺序

1. 写 `bypass-server-action.ts` fixture + 「必被抓」测试（红）
2. 实现 orchestrator-溯源（绿）
3. 写 compliant fixtures + 「不假阳」测试（绿）
4. rules-registry 门（红→绿）
5. husky 接入 + 集成测试

---

## 9. 取代与 YAGNI 边界（F）

### 9.1 取代

validator 上线后删除 `src/app/actions/habits/__tests__/write-entry-guard.test.ts`（spec L117）。其覆盖的 habits 局部写入口守卫由全域 validator 接管（fixture `bypass-server-action.ts` 断言同类绕过）。

### 9.2 不做（YAGNI，留 TODO）

- 远端 CI（T-A）：仓库零远端 CI，husky 补本地 gate；远端留 TODO
- CNUI 一致性 CI（T-B）
- 新域脚手架 validator（T-D）
- CnuiFormAdapter 强制（待 §IX 生效）
- realtime rule 静态纯度精确判断

---

## 10. 依赖与影响

### 10.1 影响域

| 域 | 影响 | 处置 |
|---|---|---|
| tasks | 合规（mutationService.execute） | 零 error |
| habits | 合规（mutationService.execute） | 零 error；删 write-entry-guard.test.ts |
| okrs | updateObjective 绕过 | §4.7 豁免 + §5.2 豁免 |
| timebox | 缺 L3 | §5.2 豁免（§4 门合规：走 executeIntent） |

### 10.2 工具链影响

- 新增 `husky` devDep
- `prebuild` 增 `validate:structure` 步（构建时间 +少量）
- `git push` 增 pre-push gate

---

## 11. 风险与对策

| 风险 | 对策 |
|---|---|
| 接收者溯源启发式漏判（新绑定形态） | `unknown-receiver` warning 兜底（非 error），提示人工；fixture 覆盖已知形态 |
| update 同名歧义 | AST 接收者溯源消解（§4.6），fixture `ambiguous-update.ts` 验证 |
| husky 钩子未装（`npm install` 前） | `prepare: husky` 自动装；CI/远端留 TODO（T-A） |
| 豁免清单漂移（债未还） | 每条带 sunset；定期审计（spec §4.1） |
| validator 假阳阻断开发 | 先在 fixture + 真实 actions/ 跑通零假阳（SC-1）再启用 pre-push |

---

## 12. 后续（不在本 Lane）

- **§IX 提案审批** → 解锁 CnuiFormAdapter 强制检查启用
- **[025] okrs 全量 onboarding** → 还 okrs/timebox 豁免债
- **T-A 远端 CI** → 把 validator 搬进远端（当前仅本地 husky）
