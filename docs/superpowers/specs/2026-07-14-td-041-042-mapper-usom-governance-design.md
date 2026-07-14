# TD-041 + TD-042 治理设计：mapper ↔ USOM 字段对齐 AST 守护

- **日期**：2026-07-14
- **主题**：把 mapper ↔ USOM 字段对齐从「人肉 review」升级为「AST 静态守护 + 全 mapper 覆盖」，并清掉 Timebox 半完成 rename 的 4 TS errors + 1 silent 运行时 bug
- **范围**：
  - TD-041：`frontend/src/lib/db/repositories/mappers.ts` Timebox 段（type + 2 个 mapper 函数 + consumer audit）
  - TD-042：lint 脚本（**19 对 mapper 全覆盖**）+ pre-push / prebuild 集成 + 同类 drift 同步修
  - **不联动** TD-037 5 域 cross-domain OCC（独立债）
- **SSOT**（设计源头）：
  - [[TD-041-usom-timebox-rename-mapper-migration-debt]]
  - [[TD-042-mapper-usom-type-field-alignment-lint-missing]]
  - [[TD-003]] T6 AM6 文档（USOM TS 字段 rename 约定）
  - [[TD-003]] I-4 防御性 re-read（`state-machine/index.ts:316-321`）
  - [page-thin] 重构的 §6 守卫（pre-push hook 链 + validate:* 模式）

---

## 1. 背景与问题

### 1.1 现状

> **⚠️ 修正记录（2026-07-14 plan-eng-review cross-model tension）**：spec 初版 §1.1 基于错误假设（"DB 列 rename + USOM rename 半完成"），经 outside voice + 实读 `schema.ts`/`objects.ts` 证伪。真实根因 = mapper 残留 3 个 phantom 字段。修复 = 删 phantom，**非 rename，非 backfill**。下方为修正后版本。

USOM `Timebox` interface（`objects.ts:615-639`）实际字段：`id, status, title, startTime, endTime, taskIds, habitIds, isRecurring, recurrenceRule?, tags, activityArchetypeId?, occVersion, schemaVersion, createdAt, updatedAt, loggedAt?, executionRecord?, notes?`。**无** `startedAt/overtimeAt/endedAt`，也**无** `approvedAt/finishedAt`。（行 608-611 的 `@property` 是 stale JSDoc，实际 interface body 无此字段。`approvedAt/finishedAt` 是 **Cycle** interface `objects.ts:149-159` 的字段。）

DB `timeboxes` 表（`schema.ts:354`）实际时间列只有 `loggedAt` + `occVersion`。**无** `started_at/overtime_at/ended_at` 列。（`schema.ts:81-85` 的 `approvedAt/finishedAt/reviewedAt` 属于 **cycles 表** `schema.ts:70-91`，非 timeboxes。）

但 mapper `TimeboxRow` type（`mappers.ts:345-346`）声明了 3 个 **phantom 字段**（DB 无列 + USOM 无字段）：

```ts
type TimeboxRow = {
  ...
  startedAt: Date | null; overtimeAt: Date | null;   // ❌ phantom（DB timeboxes 表无此列，USOM Timebox 无此字段）
  endedAt: Date | null; loggedAt: Date | null;       // loggedAt ✅ 唯一真实字段
  ...
};
```

mapper 函数体读写这 3 个 phantom：

```ts
// mappers.ts:374-376 (timeboxRowToUSOM)
startedAt: toISO(row.startedAt),   // ❌ phantom：row.startedAt = undefined（DB 无此列）
overtimeAt: toISO(row.overtimeAt), // ❌ phantom
endedAt: toISO(row.endedAt),       // ❌ phantom
loggedAt: toISO(row.loggedAt),     // ✅ 唯一真实字段
```

**根因（phantom 残留，非 rename）**：
1. **TS 4 errors baseline**：`mappers.ts:374, 400-402` 报 TS2353/TS2339——mapper 试图把 `startedAt` 等写入 USOM `Timebox` 返回对象，但 interface 无此字段
2. **读路径运行时**：`row.startedAt = undefined`（DB 无此列）→ `toISO(undefined) = undefined` → mapper 返回对象含 `startedAt: undefined` 等 phantom key。USOM interface 本就无此字段，**无 silent data loss**（USOM 不会消费这些 key）
3. **写路径风险**：`timeboxUSOMToRow` 产 phantom key 传给 drizzle → drizzle typed query 拒绝/忽略（待 round-trip 测试验证，见 §3.3.4）
4. **无 rename 发生**：spec 初版误判为 "startedAt→approvedAt rename 半完成"，实际 USOM Timebox 一直只有 `loggedAt?`。修复 = 删 3 个 phantom，不涉及 USOM 契约变更、不需要 backfill（DB 无数据）。

**对比基线**（mappers.ts:896-926 `cycleRowToUSOM`）正确使用 Cycle 的 `approvedAt/finishedAt/reviewedAt`——Cycle 域干净，只有 Timebox mapper 残留 phantom。

### 1.2 根因

- **TD-003 I-4 防御半成品**：[TD-003] whole-branch review（commit `44cfde4`）加 `state-machine/index.ts:316-321` 防御性 re-read，**假设** mapper 携带 `occVersion` 字段，但 mapper 当时没声明 → 用户在 /timeboxes 一键打卡报错「Timebox 找不到」+ DB status 半成功变更，体验极差，3 天延迟发现
- **测试 mock 与 mapper 不同源**：测试用 `makeMockRepo` 手写 store 绕过 mapper，mock 不带 `occVersion` → re-read 拿 undefined → 抛错 → 测试 RED
- **无 lint 守护**：「state-machine 引用 USOM 字段 X ↔ mapper 携带字段 X ↔ DB schema 列 X」三方对齐靠人肉 review
- **pre-push hook 不捕此类错误**：`validate:manifest` / `validate:rules-registry` / `validate:structure` 都不验证 mapper↔USOM 字段对齐

### 1.3 同类 drift 预估

lint 脚本会扫描全 19 对 mapper（详见 §3.A），预期发现：
- Timebox（4 TS errors + 1 silent runtime，TD-041 主犯）
- Appointment 1-2 处（`domains/timebox/repository/mappers/appointment.ts`，依 [023.05-2] 拆出时可能漏改）
- Task / Habit / Objective / KeyResult 等可能的 1-3 处（待 lint 实际报）
- Cycle 已知正确（验证 lint 基线，不是 drift）

**用户决策**：本 PR 全修，不拆 follow-up（避免中间态 lint 误报 / 白名单膨胀）

---

## 2. 决策摘要

| # | 决策点 | 选择 | 理由 |
|---|---|---|---|
| D1 | 治理范围 | 出 spec+plan，独立 ship | 不联动 TD-037，TD-041 baseline TS 4 errors 不应再漂 |
| D2 | TD-041 修复 | **方案 A（修正）**：删 mapper 3 个 phantom 字段（startedAt/overtimeAt/endedAt） | 真实根因=phantom 残留非 rename；删 phantom 治 TS 4 errors + 写路径 phantom key；无 backfill（DB timeboxes 表无数据）；不涉及 USOM 契约变更 |
| D3 | TD-042 守护 | **方案 A**：AST lint 脚本 + pre-push hook | B（vitest round-trip）不报字段名；C（最小一次性）下次 drift 仍漏 |
| D4 | Lint 覆盖范围 | **全 19 对 mapper**（修正：原估 9 → 17 → 实 19） | TD-037 扩展时免费；用户接受本 PR 全修 |
| D5 | Hook 强制级别 | **本次转全错（exit 1 严格）** | 治本；初期警告会留中间态 |
| D6 | Lint 工具 | **ts-morph** | TS 团队维护，能解析类型声明；regex 太脆弱；compiler API 太冗长 |
| D7 | Hook 集成方式 | **混合 (c)**：prebuild 链追加 + 新装 husky pre-push | 双重守护；predev 不加（不阻 dev server 启动） |

---

## 3. 架构与设计

### 3.1 架构概览

```
   ┌─────────────────┐         ┌────────────────────┐         ┌─────────────────┐
   │  drizzle row    │ ──map──→│  mappers.ts        │ ──map──→│  USOM interface │
   │  (DB schema)    │         │  *RowToUSOM        │         │  (objects.ts)   │
   │  approved_at    │         │  USOMToRow         │         │  approvedAt     │
   │  finished_at    │         │                    │         │  finishedAt     │
   │  logged_at      │         │  (19 对 mapper)    │         │  loggedAt       │
   └─────────────────┘         └────────────────────┘         └─────────────────┘
                                          ↑
                                          │  pre-push hook 验证
                                          │
                                ┌──────────────────────────┐
                                │ scripts/lint/            │
                                │   mapper-usom-alignment  │
                                │   (ts-morph AST 解析)    │
                                │                          │
                                │ 输出 drift report        │
                                │ exit 1 = 阻 push         │
                                └──────────────────────────┘
                                          ↑
                                          │
                                ┌──────────────────────────┐
                                │ pre-push / prebuild      │
                                │ (与 validate:manifest    │
                                │  validate:structure      │
                                │  validate:rules-registry │
                                │  并列)                   │
                                └──────────────────────────┘
```

### 3.2 Mapper 覆盖清单（19 对 = 38 函数）

**中心 `frontend/src/lib/db/repositories/mappers.ts`（16 对）**：
1. user / userCalibration
2. task / taskExecutionLog
3. habit / habitLog
4. **timebox** ⭐（TD-041 主犯）
5. objective / keyResult
6. intention / structuredIntent
7. review
8. systemEvent
9. derivedSignals
10. thread
11. aiSession
12. cycle（已知正确，验证 lint 基线）
13. contribution

**域内 `frontend/src/domains/timebox/repository/mappers/appointment.ts`（1 对）**：
14. appointment

> Appointment 独立文件的根因：[023.05-2] 拆约定域时 mapper 跟着搬走，没回到中心 mappers.ts。

### 3.3 TD-041 修复细节（修正：删 phantom，非 rename）

#### 3.3.1 `TimeboxRow` type 删 phantom

```ts
// mappers.ts:337-352 之前（含 3 个 phantom）
type TimeboxRow = {
  id: string; userId: string; schemaVersion: number;
  status: string; title: string;
  startTime: Date; endTime: Date;
  isRecurring: boolean; recurrenceRule: unknown;
  tags: string[]; notes: string | null;
  executionRecord: Record<string, unknown> | null;
  createdAt: Date; updatedAt: Date;
  startedAt: Date | null;                  // ❌ phantom（DB timeboxes 表无 started_at 列）
  overtimeAt: Date | null;                 // ❌ phantom（DB 无 overtime_at 列）
  endedAt: Date | null;                    // ❌ phantom（DB 无 ended_at 列）
  loggedAt: Date | null;                   // ✅ 唯一真实时间列
  activityArchetypeId: string | null;
  taskIds: string[] | null;
  habitIds: string[] | null;
};

// mappers.ts:337-352 之后（删 3 phantom，不加 approvedAt/finishedAt——那些属 cycles 表）
type TimeboxRow = {
  id: string; userId: string; schemaVersion: number;
  status: string; title: string;
  startTime: Date; endTime: Date;
  isRecurring: boolean; recurrenceRule: unknown;
  tags: string[]; notes: string | null;
  executionRecord: Record<string, unknown> | null;
  createdAt: Date; updatedAt: Date;
  loggedAt: Date | null;                   // ✅ 仅保留真实列
  activityArchetypeId: string | null;
  taskIds: string[] | null;
  habitIds: string[] | null;
};
```

#### 3.3.2 Mapper 函数体删 phantom 映射

```ts
// timeboxRowToUSOM (mappers.ts:374-377) 之后——删 3 行 phantom，仅留 loggedAt
// [TD-041] 删 phantom startedAt/overtimeAt/endedAt（DB timeboxes 表无此列，USOM Timebox 无此字段）
loggedAt: toISO(row.loggedAt),

// timeboxUSOMToRow (mappers.ts:400-403) 之后——删 3 行 phantom
// [TD-041] 删 phantom startedAt/overtimeAt/endedAt
loggedAt: toDate(timebox.loggedAt),
```

#### 3.3.3 Consumer Audit

`grep -rn '\.startedAt\|\.endedAt\|\.overtimeAt' src/ --include='*.ts' --include='*.tsx'` 后过滤 `Timebox` 上下文，预期命中：
- 域内 consumption（`domains/timebox/` action / hook / UI）
- 1-2 个 test fixture
- `state-machine/index.ts:316-321`（I-4 re-read 不读这些字段，确认无引用）
- 编排层（`nexus/orchestrator/`、`nexus/domain-mutation-service/`）

**所有命中点删除 `timebox.startedAt/endedAt/overtimeAt` 引用**（这些字段本就 phantom undefined，删除引用不改变运行时行为）。**无 deprecation alias**（避免重复 TD-041）。

#### 3.3.4 验证策略

- 写 1 个**回归测试**证明修复前 mapper 返回对象含 phantom key（`startedAt: undefined`），修复后无此 key
- 改 mapper 后 → 对象仅含 USOM Timebox interface 声明的字段
- **新增写路径 round-trip 测试**（outside voice P1 #5）：验证 `timeboxUSOMToRow` 产出的对象不含 phantom key（drizzle typed query 不会因 phantom 列报错）——复用 `repositories/__tests__/mappers.test.ts` + 新增 `timebox-mapper-rename.test.ts`

### 3.4 TD-042 Lint 脚本设计

**文件**：`frontend/scripts/lint/mapper-usom-alignment.ts`

**技术栈**：ts-morph（项目 devDep 可加）

**输入 glob**：
- Mapper 文件：
  - `src/lib/db/repositories/mappers.ts`
  - `src/domains/timebox/repository/mappers/appointment.ts`
- USOM 类型：
  - `src/usom/types/objects.ts`（30 个总 interface，其中 19 个有 mapper）
  - `src/usom/types/primitives.ts`（如 `Timestamp` 别名解析需要）

**核心流程**：

```
1. ts-morph 加载项目（单例，避免重复 IO）
2. 遍历 mapper 文件，提取 *RowToUSOM 函数的：
   - 返回类型（USOM 名字符串，如 'Timebox'）
   - 参数 row 类型（XRow 名字）
3. 在 mapper 文件中找 XRow 类型定义，提取字段集
4. 在 usom/types/objects.ts 找 USOM interface，提取字段集
5. Diff（按字段名）：
   - 必报：row 有 X 但 USOM 缺
   - 必报：USOM 有 X 但 row 缺
   - 警告：X 类型不兼容（如 row 是 string，USOM 是 Date）
6. 输出表格（行号定位 + 字段名 + 类型 + 差集方向）
7. exit 1 阻 pre-push
```

**关键边界处理**：
- USOM optional `?` ↔ row `Date | null`：**对得上，不报**
- **Injected 字段（outside voice P0）**：如 `timeboxRowToUSOM` 第二参数 `taskIds/habitIds` 来自 junction query，**不在 row type 内**。lint **必须区分**：
  - row type 字段 ↔ USOM 字段：双向 diff，必报
  - USOM 字段中由第二参数 injected 的（如 taskIds/habitIds）：**不报**（通过函数签名第二参数识别，或 lint 配置 `INJECTED_FIELDS` 白名单）
  - 否则每次 mapper 用 junction query 都会 usom_extra FP，lint baseline 永远 0 不了
- 类型别名 `Timestamp` = `string`：解析时还原成 string 比对
- 处理泛型 / `Omit<...>`（如 `aiSessionUSOMToRow(session: Omit<AISession, ...>)`）
- **rowType 提取（outside voice P1 #2/#3，与 Issue 2 双重印证）**：用 ts-morph `parameter.getTypeNode()`（声明类型节点）取 row type 名，**不用** `getType().getText()`（解析后类型文本，无法恢复别名名）；row type 字段用 `TypeAliasDeclaration.getType().getProperties()` 或 `InterfaceDeclaration.getProperties()`，**不用 regex** 提取

**输出样例**（期望）：
```
❌ mappers.ts:374-376 — TimeboxRowToUSOM 字段缺失
  row 字段: approvedAt, finishedAt, loggedAt
  USOM 字段: approvedAt, finishedAt, loggedAt
  ✅ 对齐（修复后）

❌ appointment.ts:19 — AppointmentRowToUSOM 字段缺失
  row 字段: ...
  USOM 字段: ...
  缺失: ...
```

**白名单（首次 ship）**：**不设白名单**（用户已选严格模式 D5），lint 自身 meta-test 验证「输出 0 drift」才算 pass。

### 3.5 Hook 集成（混合策略 D7）

**现状**（`package.json` grep 验证）：
- `prepare: husky` 已声明但 `.husky/` 目录**不存在**
- 3 个 validate scripts：`validate:manifest` / `validate:rules-registry` / `validate:structure`
- 触发点：`predev` + `prebuild`（**无 pre-push**）

**集成**：

1. **Lint 脚本注册**（`package.json`）：
   ```json
   "validate:mapper-usom-alignment": "npx tsx scripts/lint/mapper-usom-alignment.ts"
   ```

2. **prebuild 链追加**（必走 CI）：
   ```json
   "prebuild": "npm run generate:routes && npm run validate:manifest && npm run validate:rules-registry && npm run validate:structure && npm run validate:mapper-usom-alignment"
   ```

3. **新装 husky + pre-push**（阻本地 push）：
   ```bash
   npm install --save-dev husky
   npx husky init   # 在 frontend/ 子目录（与 package.json 同级）
   ```
   `.husky/pre-push`（新文件，位于 `frontend/.husky/pre-push`）：
   ```bash
   #!/usr/bin/env sh
   . "$(dirname -- "$0")/_/husky.sh"

   # [TD-042] mapper↔USOM 字段对齐 lint（exit 1 = 阻 push）
   npm run validate:mapper-usom-alignment
   ```
   > **husky 路径决策（outside voice P2 #6）**：`.husky/` 放 `frontend/` 子目录（与 package.json + prepare 脚本同级）。hook 内 `npm run` 已在 frontend cwd（husky 从 hook 所在目录起）。**不**放 repo root——root 无 package.json，`npm run` 失败。新人 clone 后 `cd frontend && npm install`（`prepare: husky` 自动 init）。

4. **CI workflow（outside voice P2 #8，必加）**：pre-push hook 可被 `git push --no-verify` 绕过 + CI 不跑 husky。加 gitee CI workflow `.gitee/workflows/lint.yml`（或 GitHub Actions `.github/workflows/lint.yml`，按实际平台）跑 `cd frontend && npm run validate:mapper-usom-alignment`，PR 必过。**这是真正的"严格阻 merge"门槛**，pre-push 只是本地便利。

5. **README 同步**：dev onboarding 段加 husky 启用步骤（避免新人摩擦）

**为什么 predev 不加**：dev server 启动要快，不应被 mapper lint 阻。prebuild + pre-push + CI 三重守护已足够。

---

## 4. 实施步骤（概要，writing-plans 阶段细化）

1. **T1**：写 TD-041 回归测试 `timebox-mapper-rename.test.ts`（红：mock 旧名 row → `approvedAt: undefined`）
2. **T2**：改 `TimeboxRow` type + `timeboxRowToUSOM` + `timeboxUSOMToRow`（绿）
3. **T3**：consumer audit `grep` → 同步改 `timebox.startedAt/endedAt/overtimeAt` 命中点
4. **T4**：写 lint meta-test（红：故意构造 drift fixture → lint exit 1）
5. **T5**：装 `ts-morph` + 写 `scripts/lint/mapper-usom-alignment.ts`（绿：能抓 drift）
6. **T6**：全 19 对跑 lint → 抓所有 drift → 逐对修 → 0 drift
7. **T7**：装 husky + `.husky/pre-push` + `prebuild` 链追加
8. **T8**：TS 全项目 grep 验证 0 baseline errors
9. **T9**：vitest 跑全 0 净回归
10. **T10**：文档同步（5.D 清单）

---

## 5. 测试与文档

### 5.1 测试策略（5 层）

| 层 | 内容 | 文件 |
|---|---|---|
| 1. **TD-041 回归测试** | mock 旧名 row → 验证 mapper 返回 `approvedAt/finishedAt` 真值 | `repositories/__tests__/timebox-mapper-rename.test.ts` 新增 |
| 2. **Lint 自检（meta）** | 故意构造 drift fixture → 跑 lint → 验证 exit 1 + 报对字段 | `scripts/lint/__tests__/mapper-usom-alignment.test.ts` 新增 |
| 3. **Lint baseline** | 全 19 对 + 19 个对应 USOM interface 实跑 → 0 drift | 直接调 lint 脚本（无 .test.ts） |
| 4. **Consumer audit 回归** | `timebox.approvedAt/finishedAt` 在 action/UI 真实可读 | 复用 `timebox-card.test.tsx` / `timebox-timeline.test.tsx` |
| 5. **Hook 集成测试** | mock pre-push → 跑 lint → 模拟 drift → 验证 push 被阻 | shell 脚本（不入 vitest） |

**TDD 顺序**：
1. 先写 TD-041 回归测试（红）→ 改 mapper（绿）
2. 先写 lint 自检（红：构造 drift）→ 写 lint 脚本（绿：能抓 drift）
3. 全 19 对跑 lint → 抓所有 drift → 修 → 0 drift
4. Consumer audit grep → 同步改名 → 跑相关 test 验真
5. Husky pre-push 装上 → mock 验阻

### 5.2 文档同步清单

| 文档 | 同步内容 |
|---|---|
| `docs/tech-debt/TD-041-...md` | status: 登记 → ✅ 修复；附 commit hash |
| `docs/tech-debt/TD-042-...md` | status: 登记 → ✅ 修复；附 commit hash |
| `docs/tech-debt/README.md` | 索引移动：登记 → 已修复；状态数更新 |
| `CHANGELOG.md` | 新增 [TD-041+042] 段（跨域治理批次） |
| `docs/superpowers/specs/2026-07-14-td-041-042-mapper-usom-governance-design.md` | **本文档** |
| `docs/superpowers/plans/2026-07-14-td-041-042-mapper-usom-governance-plan.md` | writing-plans 产出 |
| `docs/usom-design.md` | §X mapper 契约章节加 lint 守护说明 |
| `docs/manifest-rules.md` 或 新 `docs/mapper-usom-alignment-rules.md` | Lint 规则文档（如何修、误报入口） |
| constitution.md | §XV 或新章节：mapper↔USOM lint 守护条款 |
| `frontend/README.md` | husky 启用步骤（dev onboarding） |

### 5.3 风险与缓解

| 风险 | 缓解 |
|---|---|
| ts-morph 装入项目变大（~5MB） | 仅 devDep，不入生产 bundle |
| Lint 误报（误把 1 个真 drift 当正常） | 初次 ship 全人工 review lint 输出 + 必要时小调整（不退 lint 严格性） |
| Consumer 删 phantom 引用漏掉运行时调用 | grep 5 路 + 在关键 action / hook / UI 加 1 防御 read 防御（不入生产） |
| Pre-push husky 启用后 dev 体验摩擦 | 文档说明 + lint 误报入口（不是直接 disable） |
| Lint 性能（19 对 mapper + 19 个对应 USOM interface 解析） | ts-morph 单例 + 缓存 + Task 5 微 benchmark 实测 |
| `appointmentRowToUSOM` lint 报大量 drift | 接受 D4 决策：全修，PR 略大 |
| **写路径 phantom key 传 drizzle**（outside voice P1 #5） | Task 2 加 round-trip 测试验证 `timeboxUSOMToRow` 产出对象不含 phantom key |
| **lint injected 字段 FP**（outside voice P0） | lint 区分 row type 字段 vs USOM injected 字段（第二参数 / 白名单） |
| **pre-push 被 --no-verify 绕过**（outside voice P2 #8） | 加 CI workflow 作真门槛，pre-push 仅本地便利 |

---

## 6. 验收标准（Change Delivery Gate）

- ✅ `cd frontend && npx tsc --noEmit | grep mappers.ts` → 0 hit
- ✅ `cd frontend && npx tsc --noEmit` 净错误数 ≤ 当前 baseline（不增）
- ✅ `cd frontend && npm run validate:mapper-usom-alignment` → exit 0
- ✅ `cd frontend && npx vitest run` 净回归数 ≤ 当前 baseline（不增）
- ✅ Pre-push hook 装上后，故意 drift → push 被阻（手动 mock 验）
- ✅ Prebuild 链追加后，`npm run build` 触发 lint 通过
- ✅ 19 对 mapper ↔ USOM 字段 0 drift（lint baseline 0）
- ✅ TD-041 + TD-042 关闭 + README + CHANGELOG 同步

---

## 7. 关联债与遗留

- **关联**（同批次登记）：
  - [TD-040] handlers-edit-appointment parse-timezones flake（与本 PR 独立，不在 scope）
  - [TD-037] 5 域 cross-domain OCC deferred（本 PR 治 mapper↔USOM 对齐，TD-037 治跨域写边界，独立）
- **遗留**（本 PR 不解决，留待未来）：
  - TS 模板 T1b 后续若有未迁移列（DB 列 rename 收尾）
  - consumer 端 `timebox.approvedAt/finishedAt` 类型契约若仍有不一致，迭代时修复
  - lint 脚本 v2 增强（type-mismatch 严格检查、injected 字段提示优化）

---

**最后更新**：2026-07-14 · 等待 Spec self-review + 用户复核 → 调用 writing-plans
