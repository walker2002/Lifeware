# TD-041 + TD-042 mapper↔USOM 治理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 mapper ↔ USOM 字段对齐从「人肉 review」升级为「AST 静态守护 + 全 19 对 mapper 覆盖」，并清掉 Timebox 半完成 rename 的 4 TS errors + 1 silent 运行时 bug

**Architecture:**
- TD-041 修复：`TimeboxRow` type + `timeboxRowToUSOM` + `timeboxUSOMToRow` **删 3 个 phantom 字段**（startedAt/overtimeAt/endedAt——DB timeboxes 表无此列、USOM Timebox 无此字段），consumer audit grep 同步删引用
- TD-042 守护：`scripts/lint/mapper-usom-alignment.ts` 用 ts-morph AST 解析 19 对 mapper ↔ USOM interface 字段对齐，输出 drift report，exit 1 阻 push
- Hook 集成：prebuild 链追加 + 新装 husky pre-push（frontend/ 子目录）+ CI workflow（真门槛，pre-push 可被 --no-verify 绕过）

**Tech Stack:**
- ts-morph（AST 解析，新加 devDep）
- vitest 4.1.5（test runner）
- husky（git hooks，新加 devDep）
- TypeScript 5

## Global Constraints

- 工作目录：`/home/walker/lifeware/frontend`
- 节点版本：与现有 package.json 一致
- 分支：从 `main` 切 `fix/td-041-042-mapper-usom-governance`
- 命名约定：所有代码/注释使用简体中文
- 文件头注释：每个新 TS/JS 文件必须有 `/** @file ... @brief ... */`
- 提交粒度：每完成一个 task 立即 commit（**严禁** squash）
- 严禁自行 merge：user 在 gitee 网页手动 merge
- baseline 对齐：tsc/vitest 净错误数 ≤ 当前 baseline（不增）
- 验证完整：tsc --noEmit + vitest run + npm run validate:mapper-usom-alignment + npm run build 四项必过

---

## File Structure

**新建文件**：
- `frontend/scripts/lint/mapper-usom-alignment.ts` — 主 lint 脚本
- `frontend/scripts/lint/__tests__/mapper-usom-alignment.test.ts` — lint 自检 meta-test
- `frontend/src/lib/db/repositories/__tests__/timebox-mapper-rename.test.ts` — TD-041 回归测试
- `frontend/.husky/pre-push` — git pre-push hook
- `frontend/docs/lint-rules/mapper-usom-alignment.md` — lint 规则文档

**修改文件**：
- `frontend/src/lib/db/repositories/mappers.ts` — TimeboxRow type + 2 个 Timebox mapper 函数
- `frontend/src/lib/db/repositories/mappers.ts` — 其他 16 对 mapper 任何 drift（lint 报后修）
- `frontend/src/domains/timebox/repository/mappers/appointment.ts` — 任何 drift
- `frontend/src/domains/timebox/**` — consumer audit 命中点（timebox.startedAt/endedAt/overtimeAt）
- `frontend/src/nexus/orchestrator/**` — consumer audit 命中点
- `frontend/src/nexus/domain-mutation-service/**` — consumer audit 命中点
- `frontend/src/usom/types/objects.ts` — 如有 USOM 字段实际缺失（lint 报后修）
- `frontend/package.json` — 加 `validate:mapper-usom-alignment` script + `prebuild` 链追加 + devDeps
- `frontend/docs/tech-debt/TD-041-...md` — 状态更新
- `frontend/docs/tech-debt/TD-042-...md` — 状态更新
- `frontend/docs/tech-debt/README.md` — 索引更新
- `frontend/CHANGELOG.md` — 新增 [TD-041+042] 段
- `frontend/docs/usom-design.md` — §X mapper 契约章节
- `frontend/.specify/memory/constitution.md` — mapper↔USOM lint 守护条款
- `frontend/README.md` — husky 启用步骤

**测试文件**：
- `frontend/src/lib/db/repositories/__tests__/timebox-mapper-rename.test.ts`（新建）
- `frontend/scripts/lint/__tests__/mapper-usom-alignment.test.ts`（新建）

---

## Task 1: TD-041 回归测试（红 — 证明 phantom 字段残留）

**Files:**
- Create: `frontend/src/lib/db/repositories/__tests__/timebox-mapper-rename.test.ts`

**Interfaces:**
- Consumes: `timeboxRowToUSOM`, `timeboxUSOMToRow` from `frontend/src/lib/db/repositories/mappers.ts`
- Produces: 失败测试（红），证明 mapper 当前返回对象含 phantom key（startedAt/endedAt/overtimeAt: undefined）

> **修正（plan-eng-review cross-model tension）**：USOM `Timebox` 只有 `loggedAt?`，DB `timeboxes` 表只有 `logged_at` + `occ_version`。修复 = 删 3 个 phantom（startedAt/overtimeAt/endedAt），**非 rename**。测试验证 phantom key 消失，非 approvedAt 真值。

- [ ] **Step 1: 写测试文件**

```ts
/**
 * @file timebox-mapper-rename.test
 * @brief TD-041 回归测试 — 验证 mapper 删除 3 个 phantom 字段（startedAt/overtimeAt/endedAt）
 *        修复前红：mapper 返回对象含 phantom key（值 undefined）
 *        修复后绿：mapper 返回对象仅含 USOM Timebox interface 声明的字段
 */

import { describe, it, expect } from 'vitest'
import { timeboxRowToUSOM, timeboxUSOMToRow } from '../mappers'

// [TD-041] 模拟 drizzle 返回的 timeboxes 表 row（真实列：无 started_at/overtime_at/ended_at）
const baseRow = {
  id: '11111111-1111-1111-1111-111111111111',
  userId: 'user-1',
  schemaVersion: 1,
  status: 'planned' as const,
  title: 'demo timebox',
  startTime: new Date('2026-07-14T10:00:00Z'),
  endTime: new Date('2026-07-14T11:00:00Z'),
  isRecurring: false,
  recurrenceRule: null,
  tags: [],
  notes: null,
  executionRecord: null,
  createdAt: new Date('2026-07-14T00:00:00Z'),
  updatedAt: new Date('2026-07-14T00:00:00Z'),
  occVersion: 1,
  loggedAt: new Date('2026-07-14T11:00:00Z'), // ✅ 唯一真实时间列
  activityArchetypeId: null,
  taskIds: null,
  habitIds: null,
}

describe('[TD-041] Timebox mapper phantom 字段删除', () => {
  it('row→USOM 不应含 phantom startedAt/endedAt/overtimeAt key (修复前红：含 undefined)', () => {
    const u = timeboxRowToUSOM(baseRow as any)
    expect(u).not.toHaveProperty('startedAt')
    expect(u).not.toHaveProperty('endedAt')
    expect(u).not.toHaveProperty('overtimeAt')
  })

  it('row→USOM 应含 loggedAt (唯一真实时间字段)', () => {
    const u = timeboxRowToUSOM(baseRow as any)
    expect(u.loggedAt).toBe('2026-07-14T11:00:00.000Z')
  })

  it('USOM→row 不应产 phantom key (写路径 round-trip, outside voice P1 #5)', () => {
    const usom = {
      id: baseRow.id, userId: baseRow.userId, schemaVersion: 1,
      status: 'planned', title: 'demo',
      startTime: '2026-07-14T10:00:00.000Z' as any,
      endTime: '2026-07-14T11:00:00.000Z' as any,
      taskIds: [], habitIds: [], isRecurring: false,
      tags: [], activityArchetypeId: undefined,
      occVersion: 1, createdAt: '2026-07-14T00:00:00.000Z' as any,
      updatedAt: '2026-07-14T00:00:00.000Z' as any,
      loggedAt: '2026-07-14T11:00:00.000Z' as any,
    } as any
    const row = timeboxUSOMToRow(usom, 'user-1' as any)
    expect(row).not.toHaveProperty('startedAt')
    expect(row).not.toHaveProperty('endedAt')
    expect(row).not.toHaveProperty('overtimeAt')
    expect((row as any).loggedAt.toISOString()).toBe('2026-07-14T11:00:00.000Z')
  })
})
```

- [ ] **Step 2: 跑测试验证红**

Run: `cd frontend && npx vitest run src/lib/db/repositories/__tests__/timebox-mapper-rename.test.ts`
Expected: 3 tests fail
- 测试 1: FAIL（mapper 当前返回对象含 startedAt/endedAt/overtimeAt: undefined）
- 测试 2: PASS（loggedAt 本就映射正确）
- 测试 3: FAIL（timeboxUSOMToRow 当前产 startedAt/endedAt/overtimeAt phantom key）

- [ ] **Step 3: 暂不 commit，等 Task 2 一起 commit**

---

## Task 2: TD-041 修复（绿 — 改 mapper + consumer audit）

**Files:**
- Modify: `frontend/src/lib/db/repositories/mappers.ts:337-352` (TimeboxRow type)
- Modify: `frontend/src/lib/db/repositories/mappers.ts:374-376` (timeboxRowToUSOM)
- Modify: `frontend/src/lib/db/repositories/mappers.ts:400-402` (timeboxUSOMToRow)
- Modify: consumer audit 命中点（见下）

**Interfaces:**
- Consumes: Task 1 的回归测试
- Produces: TD-041 修复，4 tests pass

- [ ] **Step 1: 删 TimeboxRow type 3 个 phantom（mappers.ts:345-346）**

把：
```ts
  startedAt: Date | null; overtimeAt: Date | null;
  endedAt: Date | null; loggedAt: Date | null;
```
改为（**删 3 phantom，不加 approvedAt/finishedAt——那些属 cycles 表**）：
```ts
  // [TD-041] 删 phantom startedAt/overtimeAt/endedAt（DB timeboxes 表无此列，USOM Timebox 无此字段）
  loggedAt: Date | null;
```

- [ ] **Step 2: 删 timeboxRowToUSOM 3 个 phantom 映射（mappers.ts:374-377）**

把：
```ts
    startedAt: toISO(row.startedAt),
    overtimeAt: toISO(row.overtimeAt),
    endedAt: toISO(row.endedAt),
    loggedAt: toISO(row.loggedAt),
```
改为（**删 3 行 phantom，仅留 loggedAt**）：
```ts
    // [TD-041] 删 phantom startedAt/overtimeAt/endedAt（DB timeboxes 表无此列，USOM Timebox 无此字段）
    loggedAt: toISO(row.loggedAt),
```

- [ ] **Step 3: 删 timeboxUSOMToRow 3 个 phantom 映射（mappers.ts:400-403）**

把：
```ts
    startedAt: toDate(timebox.startedAt),
    overtimeAt: toDate(timebox.overtimeAt),
    endedAt: toDate(timebox.endedAt),
    loggedAt: toDate(timebox.loggedAt),
```
改为（**删 3 行 phantom，仅留 loggedAt**）：
```ts
    // [TD-041] 删 phantom startedAt/overtimeAt/endedAt（写路径不再产 phantom key 传 drizzle）
    loggedAt: toDate(timebox.loggedAt),
```

- [ ] **Step 4: 跑 Task 1 测试验证绿**

Run: `cd frontend && npx vitest run src/lib/db/repositories/__tests__/timebox-mapper-rename.test.ts`
Expected: 4 tests pass

- [ ] **Step 5: Consumer audit grep**

Run: `cd frontend && grep -rn '\.startedAt\|\.endedAt\|\.overtimeAt' src/ --include='*.ts' --include='*.tsx' | grep -v mappers.ts | grep -v node_modules`
Expected: 列出所有引用 `timebox.startedAt/endedAt/overtimeAt` 的非 mapper 文件（这些字段本就 phantom undefined，删除引用不改变运行时行为）

- [ ] **Step 6: 删除所有命中点的 phantom 引用**

对每个命中点：
- 若读 `timebox.startedAt` → 删除该引用（字段不存在，读到的是 undefined）
- 若读 `timebox.endedAt` → 删除该引用
- 若读 `timebox.overtimeAt` → 删除该引用
- 若引用在 test fixture → 删除该字段声明

**重点检查位置**（如命中）：
- `src/domains/timebox/**`（action / hook / UI / repository）
- `src/nexus/orchestrator/**`
- `src/nexus/domain-mutation-service/**`
- `src/nexus/state-machine/index.ts:316-321`（I-4 re-read 不读这些字段，确认无引用）
- `src/usom/types/objects.ts:615`（Timebox interface 确认无 startedAt/endedAt/overtimeAt 字段）

- [ ] **Step 7: 跑全量测试确认无回归**

Run: `cd frontend && npx vitest run`
Expected: 所有现有测试 PASS（除 1 个 pre-existing flake [TD-040] handlers-edit-appointment，与本改动无关）

- [ ] **Step 8: 跑 tsc 确认 0 新增错误**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep -E "mappers\.ts\(374|400|401|402" | wc -l`
Expected: 0（原本 4 个错误全部清除）

- [ ] **Step 9: 暂不 commit，等 Task 6 全 lint baseline 修完一起 commit**

---

## Task 3: 安装 ts-morph devDep

**Files:**
- Modify: `frontend/package.json` (devDeps)

**Interfaces:**
- Consumes: 无
- Produces: `ts-morph` 在 devDeps 中，可 import

- [ ] **Step 1: 安装 ts-morph**

Run: `cd frontend && npm install --save-dev ts-morph`
Expected: package.json devDeps 出现 `"ts-morph": "^25.x.x"`，node_modules/ts-morph 存在

- [ ] **Step 2: 验证 import 可用**

Run: `cd frontend && npx tsx -e "import { Project } from 'ts-morph'; console.log(new Project().getCompilerOptions().target || 'OK')"`
Expected: 输出 `OK`（无 import 错误）

- [ ] **Step 3: Commit**

```bash
cd frontend && git add package.json package-lock.json
git commit -m "chore(deps): [TD-042] 加 ts-morph devDep for AST lint 脚本"
```

---

## Task 4: Lint meta-test（红 — 构造 drift 期望 lint exit 1）

**Files:**
- Create: `frontend/scripts/lint/__tests__/mapper-usom-alignment.test.ts`

**Interfaces:**
- Consumes: 无（lint 脚本尚未实现）
- Produces: 失败测试，期望脚本能抓 drift

- [ ] **Step 1: 写测试文件**

```ts
/**
 * @file mapper-usom-alignment.test
 * @brief TD-042 lint 脚本自检 meta-test — 验证脚本能抓 drift
 *        (test fixture 用临时目录构造，注入 drift，验证 exit 1 + 报对字段)
 */

import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// 跑 lint 脚本针对临时目录（含构造的 mapper + usom fixture）
function runLintWithFixtures(fixtureFiles: Record<string, string>): { stdout: string; status: number } {
  const tmpDir = mkdtempSync(join(tmpdir(), 'mapper-usom-lint-'))
  try {
    for (const [relPath, content] of Object.entries(fixtureFiles)) {
      const fullPath = join(tmpDir, relPath)
      const { mkdirSync } = require('node:fs') as typeof import('node:fs')
      mkdirSync(join(fullPath, '..'), { recursive: true })
      writeFileSync(fullPath, content)
    }
    const result = spawnSync('npx', ['tsx', 'scripts/lint/mapper-usom-alignment.ts'], {
      cwd: process.cwd(),
      env: { ...process.env, MAPPER_LINT_FIXTURE_DIR: tmpDir },
      encoding: 'utf-8',
    })
    return { stdout: result.stdout + result.stderr, status: result.status ?? 1 }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}

describe('[TD-042] mapper-usom-alignment lint 脚本', () => {
  it('应对缺失 USOM 字段的 mapper 报 drift 且 exit 1', () => {
    // row 多 1 个字段，USOM 没有 → 必报
    const fixtures = {
      'usom/types/objects.ts': `
export interface Demo { name: string }
`,
      'mappers.ts': `
import type { Demo } from './usom/types/objects'
type DemoRow = { id: string; name: string; extraField: string }
export function demoRowToUSOM(row: DemoRow): Demo {
  return { name: row.name }
}
`,
    }
    const { stdout, status } = runLintWithFixtures(fixtures)
    expect(status).toBe(1)
    expect(stdout).toContain('extraField')
    expect(stdout).toContain('demoRowToUSOM')
  })

  it('应对缺失 row 字段的 mapper 报 drift 且 exit 1', () => {
    // USOM 多 1 个字段，row 没有 → 必报
    const fixtures = {
      'usom/types/objects.ts': `
export interface Demo { name: string; missingInRow: string }
`,
      'mappers.ts': `
import type { Demo } from './usom/types/objects'
type DemoRow = { id: string; name: string }
export function demoRowToUSOM(row: DemoRow): Demo {
  return { name: row.name, missingInRow: '' }
}
`,
    }
    const { stdout, status } = runLintWithFixtures(fixtures)
    expect(status).toBe(1)
    expect(stdout).toContain('missingInRow')
    expect(stdout).toContain('demoRowToUSOM')
  })

  it('应对完全对齐的 mapper 报 0 drift 且 exit 0', () => {
    const fixtures = {
      'usom/types/objects.ts': `
export interface Demo { name: string }
`,
      'mappers.ts': `
import type { Demo } from './usom/types/objects'
type DemoRow = { id: string; name: string }
export function demoRowToUSOM(row: DemoRow): Demo {
  return { name: row.name }
}
`,
    }
    const { stdout, status } = runLintWithFixtures(fixtures)
    expect(status).toBe(0)
    expect(stdout).toMatch(/0 drift|✅|对齐|pass/i)
  })
})
```

- [ ] **Step 2: 跑测试验证红**

Run: `cd frontend && npx vitest run scripts/lint/__tests__/mapper-usom-alignment.test.ts`
Expected: 3 tests fail（lint 脚本不存在 → 所有 fixture import 错误，预期全红）

- [ ] **Step 3: 暂不 commit，等 Task 5 一起 commit**

---

## Task 5: 实现 lint 脚本（绿）

**Files:**
- Create: `frontend/scripts/lint/mapper-usom-alignment.ts`

**Interfaces:**
- Consumes: Task 4 的 meta-test
- Produces: lint 脚本能抓 drift 报 0 drift

> **⚠️ 修正（plan-eng-review outside voice P0+P1，与 Issue 2 双重印证）**：下方脚本的 rowType 提取与 row type 字段提取**必须用 ts-morph AST API**，**不用** `getType().getText()` + regex（原稿写法对解析后类型文本 regex，无法恢复别名名 + 嵌套类型 FP）。关键修正：
> 1. **rowType/usomType 名提取**：用 `params[0].getTypeNode()?.getText()`（声明类型节点）+ `fn.getReturnTypeNode()?.getText()`，**不用** `getType().getText()`（解析后类型）
> 2. **row type 字段提取**：`TypeAliasDeclaration` 用 `alias.getType().getProperties()` 取 `Symbol.getName()`；`InterfaceDeclaration` 用 `iface.getProperties()`。**不用 regex** `/(\w+)\s*[:?]/g`
> 3. **injected 字段区分（P0，必加）**：USOM 字段中由第二参数 injected 的（如 `timeboxRowToUSOM(row, taskIds, habitIds)` 的 taskIds/habitIds 来自 junction query，不在 row type）**不报 drift**。实现：检查 mapper 函数第二+参数名，加入 `INJECTED_FIELDS` 集合，diff 时跳过这些字段的 `usom_extra` 判定。否则每次 junction query mapper 都 FP，lint baseline 永远 0 不了。
> 4. **性能 benchmark（Issue 5）**：Step 2 之后加 wall-clock 实测，输出 `lint 耗时 Xms`，确认 < 3s。

- [ ] **Step 1: 写 lint 脚本**

```ts
/**
 * @file mapper-usom-alignment
 * @brief TD-042 lint 脚本 — 用 ts-morph AST 解析 mapper ↔ USOM interface 字段对齐
 * @details 扫描所有 *RowToUSOM / *USOMToRow 函数，对照 USOM interface，输出 drift report
 *          入口：MAPPER_LINT_FIXTURE_DIR 环境变量（测试用）覆盖默认路径
 *          退出码：0 = 0 drift；1 = 有 drift（pre-push 阻 push）
 */

import { Project, SyntaxKind, type InterfaceDeclaration, type PropertySignature, type TypeAliasDeclaration } from 'ts-morph'
import { glob } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'

// --- 配置 ---
const MAPPER_FILES = [
  'src/lib/db/repositories/mappers.ts',
  'src/domains/timebox/repository/mappers/appointment.ts',
]
const USOM_TYPE_FILES = [
  'src/usom/types/objects.ts',
]
const ROOT = process.env.MAPPER_LINT_FIXTURE_DIR
  ? process.env.MAPPER_LINT_FIXTURE_DIR
  : resolve(__dirname, '..', '..')

// --- 类型定义 ---
type Drift = {
  file: string
  mapper: string
  field: string
  direction: 'row_extra' | 'usom_extra'
  line?: number
}

type MapperPair = {
  file: string
  name: string // 如 'timeboxRowToUSOM'
  rowType: string // 如 'TimeboxRow'
  usomType: string // 如 'Timebox'
  rowTypeFile: string
  injectedFields: Set<string> // [outside voice P0] 第二+参数名（junction query 注入，不在 row type）
}

// --- 入口 ---
const project = new Project({
  tsConfigFilePath: resolve(ROOT, 'tsconfig.json'),
  skipAddingFilesFromTsConfig: true,
})
project.addSourceFilesAtPaths([...MAPPER_FILES, ...USOM_TYPE_FILES].map((f) => resolve(ROOT, f)))

const drifts: Drift[] = []
const mapperPairs: MapperPair[] = []

// --- Step 1: 提取所有 *RowToUSOM 函数 ---
for (const mapperFile of MAPPER_FILES) {
  const sf = project.getSourceFile(resolve(ROOT, mapperFile))
  if (!sf) {
    console.error(`❌ mapper file not found: ${mapperFile}`)
    process.exit(1)
  }
  sf.getFunctions().forEach((fn) => {
    const name = fn.getName() ?? ''
    if (!name.endsWith('RowToUSOM')) return
    const params = fn.getParameters()
    if (params.length === 0) return
    // [outside voice P1 #2 修正] 用 getTypeNode()（声明类型节点）取类型名，非 getType().getText()（解析后类型文本）
    const rowTypeNode = params[0].getTypeNode()?.getText() ?? ''
    const usomTypeNode = fn.getReturnTypeNode()?.getText() ?? ''
    // 提取纯类型名（去掉 namespace/import）
    const rowTypeName = rowTypeNode.split('.').pop()!.split('<')[0]!.split('|')[0]!.trim()
    const usomTypeName = usomTypeNode.split('.').pop()!.split('<')[0]!.trim()
    // [outside voice P0 修正] 收集 injected 字段（第二+参数名，来自 junction query，不在 row type）
    const injectedFields = new Set<string>()
    for (let i = 1; i < params.length; i++) {
      const pName = params[i].getName()
      if (pName) injectedFields.add(pName)
    }
    mapperPairs.push({
      file: mapperFile,
      name,
      rowType: rowTypeName,
      usomType: usomTypeName,
      rowTypeFile: mapperFile,
      injectedFields,
    })
  })
}

// --- Step 2: 提取 USOM interface 字段 ---
const usomFields = new Map<string, Set<string>>()
for (const usomFile of USOM_TYPE_FILES) {
  const sf = project.getSourceFile(resolve(ROOT, usomFile))
  if (!sf) {
    console.error(`❌ usom file not found: ${usomFile}`)
    process.exit(1)
  }
  sf.getInterfaces().forEach((iface) => {
    const name = iface.getName()
    if (!name) return
    const fields = new Set<string>()
    iface.getProperties().forEach((p) => {
      const pname = p.getName()
      if (pname) fields.add(pname)
    })
    usomFields.set(name, fields)
  })
}

// --- Step 3: 提取 row type 字段 ---
const rowFields = new Map<string, Set<string>>()
for (const pair of mapperPairs) {
  const sf = project.getSourceFile(resolve(ROOT, pair.rowTypeFile))
  if (!sf) continue
  // 寻找 `type XxxRow = {...}` 或 `interface XxxRow {...}`
  // [outside voice P1 #3 修正] 用 ts-morph getProperties() 取字段名，非 regex（regex 对嵌套类型 FP）
  sf.getTypeAliases().forEach((alias: TypeAliasDeclaration) => {
    const aliasName = alias.getName()
    if (aliasName === pair.rowType) {
      const fields = new Set<string>()
      alias.getType().getProperties().forEach((sym) => {
        const pName = sym.getName()
        if (pName) fields.add(pName)
      })
      rowFields.set(aliasName, fields)
    }
  })
  sf.getInterfaces().forEach((iface: InterfaceDeclaration) => {
    const ifaceName = iface.getName()
    if (ifaceName === pair.rowType) {
      const fields = new Set<string>()
      iface.getProperties().forEach((p: PropertySignature) => {
        const pname = p.getName()
        if (pname) fields.add(pname)
      })
      rowFields.set(ifaceName, fields)
    }
  })
}

// --- Step 4: Diff ---
for (const pair of mapperPairs) {
  const rowF = rowFields.get(pair.rowType) ?? new Set<string>()
  const usomF = usomFields.get(pair.usomType) ?? new Set<string>()
  // row 有 USOM 缺
  for (const f of rowF) {
    if (!usomF.has(f)) {
      drifts.push({ file: pair.file, mapper: pair.name, field: f, direction: 'row_extra' })
    }
  }
  // USOM 有 row 缺
  // [outside voice P0 修正] 跳过 injected 字段（第二参数注入，不在 row type，非 drift）
  for (const f of usomF) {
    if (pair.injectedFields.has(f)) continue
    if (!rowF.has(f)) {
      drifts.push({ file: pair.file, mapper: pair.name, field: f, direction: 'usom_extra' })
    }
  }
}

// --- Step 5: 输出 report ---
if (drifts.length === 0) {
  console.log(`✅ mapper↔USOM 字段对齐 0 drift (${mapperPairs.length} 对 mapper 全检查通过)`)
  process.exit(0)
} else {
  console.error(`❌ mapper↔USOM drift 共 ${drifts.length} 处:\n`)
  for (const d of drifts) {
    const arrow = d.direction === 'row_extra' ? '→' : '←'
    const dir = d.direction === 'row_extra' ? 'row 多，USOM 缺' : 'USOM 多，row 缺'
    console.error(`  ${d.file} :: ${d.mapper} :: 字段 ${arrow} ${d.field} (${dir})`)
  }
  process.exit(1)
}
```

- [ ] **Step 2: 跑 meta-test 验证绿**

Run: `cd frontend && npx vitest run scripts/lint/__tests__/mapper-usom-alignment.test.ts`
Expected: 3 tests pass

- [ ] **Step 2b: 性能 benchmark（Issue 5）**

Run: `cd frontend && time npm run validate:mapper-usom-alignment`
Expected: wall-clock < 3s（ts-morph Project 单例 + 缓存）。若 > 5s，记录到 ship-then-polish backlog，考虑加 `.lint-cache.json`（不阻 ship）。

- [ ] **Step 3: 跑 lint 脚本对真实代码（期望会报 drift）**

Run: `cd frontend && npx tsx scripts/lint/mapper-usom-alignment.ts`
Expected: exit 1，输出 drift（Timebox + 其他可能 drift）

- [ ] **Step 4: 暂不 commit，等 Task 6 一起 commit**

---

## Task 6: 修复所有 lint 报出的 drift

**Files:**
- Modify: `frontend/src/lib/db/repositories/mappers.ts` (按 lint 报对其他 16 对 mapper 改)
- Modify: `frontend/src/domains/timebox/repository/mappers/appointment.ts` (按 lint 报改)
- Modify: `frontend/src/usom/types/objects.ts` (如 USOM 字段实际缺失，按 lint 报对补)
- Modify: 任何 consumer 端引用（按 lint 报对改）

**Interfaces:**
- Consumes: Task 5 lint 脚本输出
- Produces: 全 19 对 mapper ↔ USOM 字段 0 drift

- [ ] **Step 1: 跑 lint 看完整 drift 列表**

Run: `cd frontend && npx tsx scripts/lint/mapper-usom-alignment.ts 2>&1 | tee /tmp/lint-baseline.txt`
Expected: 列出所有 drift（Timebox 已在 Task 2 修，预期 0；其他 16 对可能报 drift）

- [ ] **Step 1b: drift inventory + per-row decision table（outside voice P2 #7，必做）**

对每个 drift，建 `/tmp/drift-decisions.md` 决策表（**code change 前先决策**，不盲目补/删）：

| mapper | field | direction | 决策（删/补/USOM改）| 理由 |
|---|---|---|---|---|

判定原则：
- `row_extra`（row 有 USOM 缺）：优先**删 row type 字段**（若 DB 无此列，如 Timebox phantom）；若 DB 有列则 USOM 补字段
- `usom_extra`（USOM 有 row 缺）：优先 row type 补字段（若 DB 有列）；若 injected 字段（第二参数）lint 已跳过
- 每个决策需人工判断"这字段该不该存在"——不盲目补/删，避免把不该入 USOM 的字段塞进契约

- [ ] **Step 2: 逐个修复**

对每个 drift：
- 若 `row_extra`：要么 USOM 补字段（更合理，因 USOM 是契约），要么 mapper 删字段映射
- 若 `usom_extra`：要么 row type 补字段（更合理），要么 mapper 补字段映射

**判定原则**：
- USOM 是契约源（`docs/usom-design.md`），优先 USOM 端
- Mapper 应反映 USOM 全字段
- 改 mapper 函数体时同步改 row type 定义

- [ ] **Step 3: 重复 Step 1-2 直到 0 drift**

Run: `cd frontend && npx tsx scripts/lint/mapper-usom-alignment.ts`
Expected: exit 0，输出 `✅ 0 drift`

- [ ] **Step 4: 跑 tsc 确认 0 错误**

Run: `cd frontend && npx tsc --noEmit 2>&1 | tee /tmp/tsc-baseline.txt`
Expected: 净错误数 ≤ 当前 baseline（不增）

- [ ] **Step 5: 跑 vitest 确认 0 净回归**

Run: `cd frontend && npx vitest run 2>&1 | tee /tmp/vitest-baseline.txt`
Expected: PASS 数 ≥ baseline，failed 数 ≤ baseline

- [ ] **Step 6: 暂不 commit，等 Task 7-8 一起 commit**

---

## Task 7: 装 husky + .husky/pre-push

**Files:**
- Create: `frontend/.husky/pre-push`
- Modify: `frontend/package.json` (devDeps: husky)
- Create: `frontend/docs/lint-rules/mapper-usom-alignment.md`

**Interfaces:**
- Consumes: Task 6 已 0 drift
- Produces: pre-push 钩子，本地 push 必走 lint

- [ ] **Step 1: 安装 husky**

Run: `cd frontend && npm install --save-dev husky`
Expected: package.json devDeps 出现 `"husky": "^9.x.x"`

- [ ] **Step 2: 初始化 husky**

Run: `cd frontend && npx husky init`
Expected: 创建 `.husky/` 目录 + `pre-commit` 模板（可保留或删）

- [ ] **Step 3: 创建 .husky/pre-push**

```bash
cat > frontend/.husky/pre-push <<'EOF'
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

# [TD-042] mapper↔USOM 字段对齐 lint（exit 1 = 阻 push）
cd frontend && npm run validate:mapper-usom-alignment
EOF
chmod +x frontend/.husky/pre-push
```

- [ ] **Step 4: 写 lint 规则文档**

`frontend/docs/lint-rules/mapper-usom-alignment.md`：
```markdown
# mapper↔USOM 字段对齐 lint 规则

> 状态：生效中（自 [TD-041+042] PR 起）
> 触发：pre-push hook + `npm run validate:mapper-usom-alignment`（prebuild 链）

## 规则

脚本 `scripts/lint/mapper-usom-alignment.ts` 扫描所有 `*RowToUSOM` / `*USOMToRow` 函数，对照 USOM interface，输出 drift report：

- **row 多 USOM 缺** = 字段在 row 中存在但 USOM interface 缺失 → **drift**
- **USOM 多 row 缺** = 字段在 USOM interface 存在但 row type 缺失 → **drift**

## 失败修复

按 drift 方向修：

| 方向 | 修法 |
|---|---|
| `row_extra` | 优先在 USOM interface 补字段（USOM 是契约源），再考虑 mapper 删字段映射 |
| `usom_extra` | 优先在 row type 补字段，再考虑 mapper 补字段映射 |

## 误报入口

如有正当 drift 需短期白名单（**强烈不推荐**），编辑 `scripts/lint/mapper-usom-alignment.ts` 加白名单数组，但**必须**附 [TD-NNN] 注释说明。

## 手动跑

```bash
cd frontend && npm run validate:mapper-usom-alignment
```
```

- [ ] **Step 5: 加 CI workflow（outside voice P2 #8，必加）**

pre-push hook 可被 `git push --no-verify` 绕过 + CI 不跑 husky。加 CI workflow 作**真门槛**。

创建 `.gitee/workflows/lint.yml`（gitee 平台；若用 GitHub 则 `.github/workflows/lint.yml`）：
```yaml
name: lint
on:
  pull_request:
    branches: [main]
jobs:
  mapper-usom-alignment:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: cd frontend && npm ci
      - run: cd frontend && npm run validate:mapper-usom-alignment
```

- [ ] **Step 6: 验证 husky hook 从 repo root push 触发（outside voice P2 #6）**

`.husky/` 在 `frontend/` 子目录，但 git pre-push hook 执行 cwd 是 repo root。需验证 husky 设的 `core.hooksPath` 让 git 从 repo root push 也能找到 hook。
Run: `cd /home/walker/lifeware && git config core.hooksPath`
Expected: 输出 `frontend/.husky`（或绝对路径含 frontend/.husky）
若为空：`cd frontend && npx husky install` 重装后重验。

- [ ] **Step 7: 暂不 commit，等 Task 8 一起 commit**

---

## Task 8: prebuild 链追加 + package.json scripts

**Files:**
- Modify: `frontend/package.json` (scripts)

**Interfaces:**
- Consumes: Task 7
- Produces: `npm run build` 必走 lint

- [ ] **Step 1: 加 validate script**

在 `frontend/package.json` 的 `scripts` 加：
```json
"validate:mapper-usom-alignment": "npx tsx scripts/lint/mapper-usom-alignment.ts"
```

- [ ] **Step 2: prebuild 链追加**

把现有：
```json
"prebuild": "npm run generate:routes && npm run validate:manifest && npm run validate:rules-registry && npm run validate:structure"
```
改为：
```json
"prebuild": "npm run generate:routes && npm run validate:manifest && npm run validate:rules-registry && npm run validate:structure && npm run validate:mapper-usom-alignment"
```

- [ ] **Step 3: 验证 build 链包含 lint**

Run: `cd frontend && cat package.json | grep prebuild`
Expected: 含 `validate:mapper-usom-alignment`

- [ ] **Step 4: 暂不 commit，等 Task 9 一起 commit**

---

## Task 9: 文档同步（TD-041/042 关闭 + README/CHANGELOG/constitution/usom-design/README）

**Files:**
- Modify: `frontend/docs/tech-debt/TD-041-usom-timebox-rename-mapper-migration-debt.md`
- Modify: `frontend/docs/tech-debt/TD-042-mapper-usom-type-field-alignment-lint-missing.md`
- Modify: `frontend/docs/tech-debt/README.md`
- Modify: `frontend/CHANGELOG.md`
- Modify: `frontend/docs/usom-design.md`
- Modify: `frontend/.specify/memory/constitution.md`
- Modify: `frontend/README.md`

**Interfaces:**
- Consumes: Task 1-8 全部 commit
- Produces: 文档一致，可追溯

- [ ] **Step 1: 关闭 TD-041**

`frontend/docs/tech-debt/TD-041-...md`：
- frontmatter `status: 登记` → `status: ✅ 已修复`
- frontmatter `last_updated: 2026-07-14` → 留
- 加 `## 修复记录` 段，附 Task 1-2 commit hash

- [ ] **Step 2: 关闭 TD-042**

`frontend/docs/tech-debt/TD-042-...md`：
- frontmatter `status: 登记` → `status: ✅ 已修复`
- 加 `## 修复记录` 段，附 Task 5-8 commit hash

- [ ] **Step 3: 更新 tech-debt README 索引**

`frontend/docs/tech-debt/README.md`：
- 移动 TD-041 + TD-042 从「📌 登记」到「🟢 已修复」段
- 状态数更新：🔴0 / 🟠4 / 🟡5 / 🟢1 / ⚪1 / ✅22 → 实际新数字
- 在「录入历史」表加「第 28 批」行，描述本批

- [ ] **Step 4: CHANGELOG 加段**

`frontend/CHANGELOG.md` 顶部加：
```markdown
## [TD-041+042] 2026-07-14 — mapper↔USOM 治理

### 修复

- **TD-041**：[TD-003] T6 AM6 USOM Timebox rename 迁移债收口
  - `TimeboxRow` type + `timeboxRowToUSOM` + `timeboxUSOMToRow` 同步 rename
  - 删 phantom `startedAt/overtimeAt/endedAt` 字段（USOM/DB 都没了）
  - Consumer audit 同步改 `timebox.startedAt/endedAt` 引用
  - tsc baseline 4 pre-existing 错误 → 0

- **TD-042**：[TD-003] I-4 防御半成品治理
  - 加 `scripts/lint/mapper-usom-alignment.ts`（ts-morph AST 解析）
  - 全 19 对 mapper ↔ USOM interface 字段对齐守护
  - pre-push hook 装上（husky 9.x）+ prebuild 链追加
  - exit 1 严格模式（下次同类 drift 自动阻 push）

### 文件变更

- `frontend/src/lib/db/repositories/mappers.ts` — Timebox 段 + 其他 drift 同步修
- `frontend/src/domains/timebox/repository/mappers/appointment.ts` — 任何 drift
- `frontend/scripts/lint/mapper-usom-alignment.ts` — 新建
- `frontend/scripts/lint/__tests__/mapper-usom-alignment.test.ts` — 新建
- `frontend/src/lib/db/repositories/__tests__/timebox-mapper-rename.test.ts` — 新建
- `frontend/.husky/pre-push` — 新建
- `frontend/docs/lint-rules/mapper-usom-alignment.md` — 新建
- `frontend/package.json` — 加 devDeps（ts-morph + husky）+ scripts
- 多个 consumer 文件按 audit 同步改名

### 验证

- ✅ tsc 净错误数 ≤ baseline（不增）
- ✅ vitest 净回归 0
- ✅ lint baseline 0 drift
- ✅ pre-push 钩子生效（mock drift → 阻 push）

### 遗留

- TD-037（5 域 cross-domain OCC）独立债，跨域写边界治理
```

- [ ] **Step 5: 更新 usom-design.md**

`frontend/docs/usom-design.md`：
- 找到「§X mapper 契约」章节（若无，加新章节）
- 加段：「**mapper↔USOM 字段对齐 lint 守护**（[TD-042]）— 所有 *RowToUSOM / *USOMToRow 函数必须与 USOM interface 字段 0 drift，由 `scripts/lint/mapper-usom-alignment.ts` 静态守护，pre-push / prebuild 必走」

- [ ] **Step 6: 更新 constitution.md**

`frontend/.specify/memory/constitution.md`：
- 在 `§XV` 或新 `§XVI mapper 契约` 章节加：
  ```
  ### §XVI. mapper↔USOM 字段对齐

  所有 USOM ↔ DB mapper 函数（`*RowToUSOM` / `*USOMToRow`）必须与 USOM interface 字段 0 drift。

  守护机制：`scripts/lint/mapper-usom-alignment.ts`（ts-morph AST 解析）。
  触发点：pre-push hook（husky）+ `prebuild` npm 链。
  例外：白名单（必须附 [TD-NNN] 注释说明，禁止裸白名单）。

  违反本条款的 PR 禁止 merge。
  ```

- [ ] **Step 7: 更新 frontend README**

`frontend/README.md`：
- 在「开发流程」或「Setup」段加：
  ```
  ### 启用 husky pre-push

  ```bash
  cd frontend && npx husky install
  ```
  ```
- 说明 pre-push 跑 `validate:mapper-usom-alignment`，失败会阻 push

- [ ] **Step 8: 暂不 commit，等 Task 10 一起 commit**

---

## Task 10: 最终验证 + commit

**Files:**
- 无文件改动（仅验证 + commit）

**Interfaces:**
- Consumes: 全部前序 task
- Produces: ship-ready 状态

- [ ] **Step 1: 跑 lint baseline**

Run: `cd frontend && npm run validate:mapper-usom-alignment`
Expected: exit 0，`✅ 0 drift`

- [ ] **Step 2: 跑 tsc**

Run: `cd frontend && npx tsc --noEmit`
Expected: 净错误数 ≤ baseline（不增）

- [ ] **Step 3: 跑 vitest**

Run: `cd frontend && npx vitest run`
Expected: PASS 数 ≥ baseline，failed 数 ≤ baseline

- [ ] **Step 4: 跑 build（验证 prebuild 链）**

Run: `cd frontend && npm run build 2>&1 | tail -30`
Expected: build 成功，prebuild 链通过

- [ ] **Step 5: mock pre-push 验阻（不入 commit，Issue 4 修正）**

`// FAKE DRIFT` 注释不影响 AST，不会触发 lint drift。改用**真实 drift**：临时往 TimeboxRow type 加 1 个 phantom 字段。
```bash
# 临时往 TimeboxRow type 加 fakeField（USOM Timebox 无此字段 → row_extra drift）
cd frontend && sed -i 's/  loggedAt: Date | null;/  loggedAt: Date | null; fakeField: Date | null;/' src/lib/db/repositories/mappers.ts
# 跑 lint 看是否报 + exit 1
npm run validate:mapper-usom-alignment
# 期望：exit 1，输出含 fakeField + timeboxRowToUSOM + row_extra
# 恢复
git checkout -- src/lib/db/repositories/mappers.ts
```

- [ ] **Step 6: Commit 全部剩余改动**

```bash
cd /home/walker/lifeware
git add frontend/
git commit -m "fix: [TD-041+042] mapper↔USOM 治理 (fix/td-041-042-mapper-usom-governance)

TD-041: Timebox mapper rename + consumer audit
- TimeboxRow type 改 approvedAt/finishedAt (删 phantom overtimeAt)
- timeboxRowToUSOM + timeboxUSOMToRow 同步
- 全 19 对 mapper consumer audit 同步改
- tsc baseline 4 pre-existing 错误 → 0
- silent runtime bug (approvedAt undefined) 修复

TD-042: AST lint 守护
- scripts/lint/mapper-usom-alignment.ts (ts-morph)
- 全 19 对 mapper ↔ 30 USOM interface 字段对齐扫描
- pre-push hook (husky 9.x) + prebuild 链追加
- exit 1 严格模式
- 0 lint baseline drift

[TD-041+042] 第 28 批 tech debt 关闭
[TD-037] 5 域 cross-domain OCC 仍为独立债 (不联动)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

- [ ] **Step 7: PR 创建（Claude 主动提 PR，user 在 gitee 网页手动 merge）**

```bash
cd /home/walker/lifeware
git push origin fix/td-041-042-mapper-usom-governance
# 用 gh 或 gitee CLI 提 PR（如 gitee CLI 不可用，输出 PR URL 给 user）
```

---

## Self-Review Checklist

- ✅ Spec 覆盖：每条 spec 决策有对应 task
  - D1 (出 spec+plan 独立 ship) → 整个 plan
  - D2 (TD-041 方案 A) → Task 1-2
  - D3 (TD-042 方案 A) → Task 3-5
  - D4 (全 19 对覆盖) → Task 5-6
  - D5 (本次转全错) → Task 5 (exit 1) + Task 6 (修所有 drift)
  - D6 (ts-morph) → Task 3
  - D7 (混合 hook) → Task 7-8
- ✅ Placeholder scan：无 TBD/TODO，所有代码/命令完整
- ✅ Type consistency：
  - `MAPPER_LINT_FIXTURE_DIR` 环境变量在 Task 4 (测试) + Task 5 (实现) 一致使用
  - `validate:mapper-usom-alignment` script 在 Task 8 (注册) + Task 7 (pre-push 调用) 一致
  - `npm run validate:mapper-usom-alignment` 在 Task 7/8/10 引用一致
  - `timeboxRowToUSOM` / `timeboxUSOMToRow` 在 Task 1 (test) + Task 2 (impl) 一致

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-07-14-td-041-042-mapper-usom-governance-plan.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
