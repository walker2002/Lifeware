# TD-041 + TD-042 治理设计：mapper ↔ USOM 字段对齐 AST 守护

- **日期**：2026-07-14
- **主题**：把 mapper ↔ USOM 字段对齐从「人肉 review」升级为「AST 静态守护 + 全 mapper 覆盖」，并清掉 Timebox 半完成 rename 的 4 TS errors + 1 silent 运行时 bug
- **范围**：
  - TD-041：`frontend/src/lib/db/repositories/mappers.ts` Timebox 段（type + 2 个 mapper 函数 + consumer audit）
  - TD-042：lint 脚本（17 对 mapper 全覆盖）+ pre-push / prebuild 集成 + 同类 drift 同步修
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

[TD-003] T6 AM6 约定：USOM `Timebox` interface 字段 rename（`startedAt` → `approvedAt` / `endedAt` → `finishedAt`），DB 列 rename 推迟到 T1b 实施。

T1b（migration 0034）**已 ship**：DB 列名 `approved_at` / `finished_at` 已落地（`schema.ts:82-84` 注释佐证）。

但 **mapper 函数体未同步迁移**：

```ts
// mappers.ts:374-376 (timeboxRowToUSOM 现状)
startedAt: toISO(row.startedAt),   // ❌ row.startedAt 实际是 undefined（DB 列已 rename 为 approved_at）
overtimeAt: toISO(row.overtimeAt), // ❌ phantom 字段（USOM/DB 都没了）
endedAt: toISO(row.endedAt),       // ❌ row.endedAt 实际是 undefined
loggedAt: toISO(row.loggedAt),
```

且 `TimeboxRow` type 定义（`mappers.ts:345-346`）声明的是 phantom 字段：

```ts
type TimeboxRow = {
  ...
  startedAt: Date | null; overtimeAt: Date | null;   // ❌ phantom
  endedAt: Date | null; loggedAt: Date | null;
  ...
};
```

**两层 bug 叠加**：
1. **TS 4 errors baseline**：`mappers.ts:374, 400-402` 报 TS2353 / TS2339，长期被忽略
2. **Silent runtime bug**：drizzle 返回的 row 用 `approvedAt` / `finishedAt`（按列名 camelCase），但 mapper 读 `row.startedAt` 拿到 `undefined`，`toISO(undefined)` 安全返回 `undefined`，结果 USOM `Timebox.approvedAt` / `Timebox.finishedAt` 静默丢失
3. **`overtimeAt` phantom**：USOM `Timebox` 已无 `overtimeAt`，DB 也无 `overtime_at` 列（语义迁到 `ExecutionRecord.deviationMinutes`），mapper 仍读写 phantom 字段

**对比基线**（mappers.ts:896-926 `cycleRowToUSOM`）已正确使用 `approvedAt` / `finishedAt` / `reviewedAt` —— 只有 Timebox 掉队。

### 1.2 根因

- **TD-003 I-4 防御半成品**：[TD-003] whole-branch review（commit `44cfde4`）加 `state-machine/index.ts:316-321` 防御性 re-read，**假设** mapper 携带 `occVersion` 字段，但 mapper 当时没声明 → 用户在 /timeboxes 一键打卡报错「Timebox 找不到」+ DB status 半成功变更，体验极差，3 天延迟发现
- **测试 mock 与 mapper 不同源**：测试用 `makeMockRepo` 手写 store 绕过 mapper，mock 不带 `occVersion` → re-read 拿 undefined → 抛错 → 测试 RED
- **无 lint 守护**：「state-machine 引用 USOM 字段 X ↔ mapper 携带字段 X ↔ DB schema 列 X」三方对齐靠人肉 review
- **pre-push hook 不捕此类错误**：`validate:manifest` / `validate:rules-registry` / `validate:structure` 都不验证 mapper↔USOM 字段对齐

### 1.3 同类 drift 预估

lint 脚本会扫描全 17 对 mapper（详见 §3.A），预期发现：
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
| D2 | TD-041 修复 | **方案 A**：mapper 同步 USOM rename | 治本；B（USOM 加回旧名）留 2 套名字污点；C（仅 runtime 改）不解决 tsc baseline |
| D3 | TD-042 守护 | **方案 A**：AST lint 脚本 + pre-push hook | B（vitest round-trip）不报字段名；C（最小一次性）下次 drift 仍漏 |
| D4 | Lint 覆盖范围 | **全 17 对 mapper**（修正：原估 9，实 17） | TD-037 扩展时免费；用户接受本 PR 全修 |
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
   │  logged_at      │         │  (17 对 mapper)    │         │  loggedAt       │
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

### 3.2 Mapper 覆盖清单（17 对 = 34 函数）

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

### 3.3 TD-041 修复细节

#### 3.3.1 `TimeboxRow` type 修正

```ts
// mappers.ts:337-352 之前
type TimeboxRow = {
  id: string; userId: string; schemaVersion: number;
  status: string; title: string;
  startTime: Date; endTime: Date;          // ← 保留（DB 列 start_time/end_time 未改）
  isRecurring: boolean; recurrenceRule: unknown;
  tags: string[]; notes: string | null;
  executionRecord: Record<string, unknown> | null;
  createdAt: Date; updatedAt: Date;
  startedAt: Date | null;                  // ❌ phantom
  overtimeAt: Date | null;                 // ❌ phantom
  endedAt: Date | null;                    // ❌ phantom
  loggedAt: Date | null;
  activityArchetypeId: string | null;
  taskIds: string[] | null;
  habitIds: string[] | null;
};

// mappers.ts:337-352 之后
type TimeboxRow = {
  id: string; userId: string; schemaVersion: number;
  status: string; title: string;
  startTime: Date; endTime: Date;
  isRecurring: boolean; recurrenceRule: unknown;
  tags: string[]; notes: string | null;
  executionRecord: Record<string, unknown> | null;
  createdAt: Date; updatedAt: Date;
  approvedAt: Date | null;                 // ✅ T1b 列名
  finishedAt: Date | null;                 // ✅ T1b 列名
  loggedAt: Date | null;
  activityArchetypeId: string | null;
  taskIds: string[] | null;
  habitIds: string[] | null;
};
```

#### 3.3.2 Mapper 函数体 rename

```ts
// timeboxRowToUSOM (mappers.ts:374-377) 之后
approvedAt: toISO(row.approvedAt),
finishedAt: toISO(row.finishedAt),
loggedAt: toISO(row.loggedAt),

// timeboxUSOMToRow (mappers.ts:400-403) 之后
approvedAt: toDate(timebox.approvedAt),
finishedAt: toDate(timebox.finishedAt),
loggedAt: toDate(timebox.loggedAt),
```

#### 3.3.3 Consumer Audit

`grep -rn '\.startedAt\|\.endedAt\|\.overtimeAt' src/ --include='*.ts' --include='*.tsx'` 后过滤 `Timebox` 上下文，预期命中：
- 域内 consumption（`domains/timebox/` action / hook / UI）
- 1-2 个 test fixture
- `state-machine/index.ts:316-321`（I-4 re-read 需确认不读这些字段）
- 编排层（`nexus/orchestrator/`、`nexus/domain-mutation-service/`）

**所有命中点同步改名为 `approvedAt/finishedAt`**，**无 deprecation alias**（避免重复 TD-041）。

#### 3.3.4 验证策略

- 写 1 个**回归测试**证明修复前确实 silent lost：mock 旧名 row → mapper 返回 `approvedAt: undefined`（红）
- 改 mapper 后 → `approvedAt` 真值（绿）
- 复用 `repositories/__tests__/mappers.test.ts` + 新增 `timebox-mapper-rename.test.ts`

### 3.4 TD-042 Lint 脚本设计

**文件**：`frontend/scripts/lint/mapper-usom-alignment.ts`

**技术栈**：ts-morph（项目 devDep 可加）

**输入 glob**：
- Mapper 文件：
  - `src/lib/db/repositories/mappers.ts`
  - `src/domains/timebox/repository/mappers/appointment.ts`
- USOM 类型：
  - `src/usom/types/objects.ts`（26 个 interface）
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
- Injected 字段（如 `timeboxRowToUSOM` 第二参数 `taskIds/habitIds` 来自 junction query）：**lint 不报**，但输出「injected 字段」提示
- 类型别名 `Timestamp` = `string`：解析时还原成 string 比对
- 处理泛型 / `Omit<...>`（如 `aiSessionUSOMToRow(session: Omit<AISession, ...>)`）
- Mapper 函数签名差异（部分带 userId 第二参数）：regex 提取 USOM 名字位置在第一参数

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
   npx husky install
   ```
   `.husky/pre-push`（新文件）：
   ```bash
   #!/usr/bin/env sh
   . "$(dirname -- "$0")/_/husky.sh"

   cd frontend && npm run validate:mapper-usom-alignment
   ```

4. **README 同步**：dev onboarding 段加 husky 启用步骤（避免新人摩擦）

**为什么 predev 不加**：dev server 启动要快，不应被 mapper lint 阻（虽然 lint 应 < 5s，但 dev 启动 < 1s 期望 vs < 5s 是 5x 摩擦）。prebuild + pre-push 双重已足够。

---

## 4. 实施步骤（概要，writing-plans 阶段细化）

1. **T1**：写 TD-041 回归测试 `timebox-mapper-rename.test.ts`（红：mock 旧名 row → `approvedAt: undefined`）
2. **T2**：改 `TimeboxRow` type + `timeboxRowToUSOM` + `timeboxUSOMToRow`（绿）
3. **T3**：consumer audit `grep` → 同步改 `timebox.startedAt/endedAt/overtimeAt` 命中点
4. **T4**：写 lint meta-test（红：故意构造 drift fixture → lint exit 1）
5. **T5**：装 `ts-morph` + 写 `scripts/lint/mapper-usom-alignment.ts`（绿：能抓 drift）
6. **T6**：全 17 对跑 lint → 抓所有 drift → 逐对修 → 0 drift
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
| 3. **Lint baseline** | 全 17 对 + 26 USOM interface 实跑 → 0 drift | 直接调 lint 脚本（无 .test.ts） |
| 4. **Consumer audit 回归** | `timebox.approvedAt/finishedAt` 在 action/UI 真实可读 | 复用 `timebox-card.test.tsx` / `timebox-timeline.test.tsx` |
| 5. **Hook 集成测试** | mock pre-push → 跑 lint → 模拟 drift → 验证 push 被阻 | shell 脚本（不入 vitest） |

**TDD 顺序**：
1. 先写 TD-041 回归测试（红）→ 改 mapper（绿）
2. 先写 lint 自检（红：构造 drift）→ 写 lint 脚本（绿：能抓 drift）
3. 全 17 对跑 lint → 抓所有 drift → 修 → 0 drift
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
| Consumer 改名漏掉运行时调用 | grep 5 路 + 在关键 action / hook / UI 加 1 防御 read 防御（不入生产） |
| Pre-push husky 启用后 dev 体验摩擦 | 文档说明 + lint 误报入口（不是直接 disable） |
| Lint 性能（17 对 mapper + 26 interface 解析） | ts-morph 单例 + 缓存，预期 < 3s |
| `appointmentRowToUSOM` lint 报大量 drift | 接受 D4 决策：全修，PR 略大 |

---

## 6. 验收标准（Change Delivery Gate）

- ✅ `cd frontend && npx tsc --noEmit | grep mappers.ts` → 0 hit
- ✅ `cd frontend && npx tsc --noEmit` 净错误数 ≤ 当前 baseline（不增）
- ✅ `cd frontend && npm run validate:mapper-usom-alignment` → exit 0
- ✅ `cd frontend && npx vitest run` 净回归数 ≤ 当前 baseline（不增）
- ✅ Pre-push hook 装上后，故意 drift → push 被阻（手动 mock 验）
- ✅ Prebuild 链追加后，`npm run build` 触发 lint 通过
- ✅ 17 对 mapper ↔ USOM 字段 0 drift（lint baseline 0）
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
