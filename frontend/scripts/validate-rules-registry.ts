#!/usr/bin/env npx tsx
/**
 * @file validate-rules-registry
 * @brief TD-019 A2 — 校验 rules-registry.ts 与 manifest.lifecycle 一致（drift 阻断）
 *
 * @usage npx tsx scripts/validate-rules-registry.ts
 * @exitcode 0 = 一致, 1 = drift（STATUS_TRANSITION_ACTIONS 缺失/多余或退化为手工 Set）, 2 = 脚本错误
 *
 * 校验策略（AM5：双侧直读 + 纯函数 import）：
 *   - 读 `manifest.yaml` 文本 → deriveExpected（与 buildStatusTransitionActions 同逻辑，
 *     但**不**走 loadDomainManifest，直接 YAML parse）
 *   - 形态合法时:把同一份 yaml 喂给 `deriveStatusTransitionActions` 纯函数 → actual 集合
 *     与 expected 集合对比;若缺失/多余 → drift(missing/extra 报告)
 *   - 读 `rules-registry.ts` 文本 → 静态扫描 STATUS_TRANSITION_ACTIONS 的 RHS
 *     - 包含 `buildStatusTransitionActions()` / `getTransitionsFromManifest(...)` /
 *       `deriveStatusTransitionActions(...)` 等派生调用 → 视为合法形态
 *     - 包含 `new Set([` + 字符串字面量成员 → 手工 Set drift
 *     - 其他形态 → 未识别形态 drift
 *
 * AM5 关键约束 + [023.13] Critical Fix #1：
 *   - validator `import` 的是 `deriveStatusTransitionActions` **纯函数**(无副作用,不会
 *     触发 loadDomainManifest 或其他 @/ alias 解析)。feed 纯函数的是 validator 手动
 *     parse 出来的 yaml 对象——不读 manifest-loader cache,不踩 ESM 副作用链。
 *   - 形态合法时必须做 actual vs expected 集合比对:若 `deriveStatusTransitionActions`
 *     函数体本身退化(toPascalCase 漏 charAt、忘了过滤 create),expected(validator 同源)
 *     与 actual(纯函数)会出现 missing/extra,validator 必须 exit 1+drift 报告。
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as yaml from 'js-yaml'
// [023.13] Critical Fix #1: import 纯函数（无副作用、不触发 manifest-loader）
import { deriveStatusTransitionActions } from '../src/domains/timebox/lib/build-status-transition-actions'

const ROOT_DIR = path.resolve(__dirname, '..')
const MANIFEST_PATH = path.join(ROOT_DIR, 'src', 'domains', 'timebox', 'manifest.yaml')
const RULES_REGISTRY_PATH = path.join(ROOT_DIR, 'src', 'domains', 'timebox', 'rules-registry.ts')

interface LifecycleDef {
  transitions?: Array<{ action?: string }>
}

interface RawManifest {
  lifecycle?: Record<string, LifecycleDef>
}

// ─── 工具函数 ────────────────────────────────────────────────────

/**
 * snake_case_objectType → PascalCaseObjectType（timebox→Timebox, appointment→Appointment）
 * 与 build-status-transition-actions.ts:toPascalCase 同源手工（[023.13] Critical Fix #1：
 * validator 内部独立派生,不直接复用被测代码的 toPascalCase,以便在 derive 函内漏写时
 * 仍能产出 missing/extra 差异）。
 */
function toPascalCase(snake: string): string {
  return snake.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')
}

// ─── 期望集派生（与 deriveStatusTransitionActions 逻辑同源手工）──────────

/**
 * 读 manifest.yaml,返回 raw manifest 对象 + validator 自己派生的 expected Set。
 * expected 走 validator 本地 toPascalCase + 排除 create,作为「独立 oracle」。
 *
 * [023.13] Critical Fix #1:返回 raw manifest,让 main() 把它喂给纯函数 deriveStatusTransitionActions
 * 算出 actual;两边同源输入不同派生路径——若 derive 函内 toPascalCase 退化为 slice(1)、
 * 漏过滤 create 等,expected 与 actual 即出现 missing/extra。
 */
function loadManifestAndDeriveExpected(): { rawManifest: RawManifest; expected: Set<string> } {
  const rawText = fs.readFileSync(MANIFEST_PATH, 'utf8')
  const rawManifest = yaml.load(rawText) as RawManifest
  const result = new Set<string>()
  const lifecycle = rawManifest.lifecycle ?? {}
  for (const [objectType, def] of Object.entries(lifecycle)) {
    const pascal = toPascalCase(objectType)
    for (const t of def.transitions ?? []) {
      const action = t.action
      if (!action) continue
      if (action === 'create') continue
      result.add(`${action}${pascal}`)
    }
  }
  return { rawManifest, expected: result }
}

// ─── 实际形态检测（读 rules-registry.ts 源码扫描 RHS）────────────

/** 检测结果 */
interface ActualShape {
  /** 是否走派生函数（buildStatusTransitionActions / getTransitionsFromManifest 等） */
  usesDerivation: boolean
  /** 是否检测到手工 Set 字面量（`new Set([...]` 在 STATUS_TRANSITION_ACTIONS RHS） */
  hasHandwrittenSet: boolean
  /** 检测到的 RHS 第一行（用于诊断输出） */
  rhsHead: string
  /** 检测到的 STATUS_TRANSITION_ACTIONS 行号（1-based） */
  lineNumber: number
}

/**
 * 扫描 rules-registry.ts 源码，识别 STATUS_TRANSITION_ACTIONS 的赋值形态。
 *
 * 合法形态（RHS 含派生函数调用）：
 *   - `export const STATUS_TRANSITION_ACTIONS: Set<string> = buildStatusTransitionActions()`
 *   - `export const STATUS_TRANSITION_ACTIONS = getTransitionsFromManifest(...)`
 *
 * 非法形态：
 *   - RHS 含 `new Set([` + 字符串字面量（如 `'logTimebox'`, `'cancelTimebox'`）→ 手工 Set drift
 *   - 其他形态 → 未识别
 */
function inspectRulesRegistryShape(): ActualShape {
  const source = fs.readFileSync(RULES_REGISTRY_PATH, 'utf8')
  const lines = source.split('\n')

  // 定位 STATUS_TRANSITION_ACTIONS 赋值行
  let lineNumber = -1
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    // 匹配 `STATUS_TRANSITION_ACTIONS = ...`（允许 : Set<string> 类型注解）
    if (/STATUS_TRANSITION_ACTIONS\s*(?::\s*Set<string>)?\s*=/.test(line)) {
      lineNumber = i + 1
      break
    }
  }

  if (lineNumber === -1) {
    throw new Error(
      `STATUS_TRANSITION_ACTIONS 赋值在 ${RULES_REGISTRY_PATH} 中未找到`,
    )
  }

  // 提取 RHS（从 `=` 后到行尾，可能跨多行）
  // 简单策略：取从该行起，遇到第一个 `;` 或下一个 `export` / `const` / 空白行（聚合）结束
  // 这里只关心形态判定，取前 ~10 行拼接即可
  const rhsLines: string[] = []
  for (let i = lineNumber - 1; i < Math.min(lines.length, lineNumber + 10); i++) {
    const ln = lines[i] ?? ''
    // 简化的 RHS 边界：遇到独立成行的 `}` (Set 闭合)、`export`、`const`、`//` 注释起新条目
    if (i > lineNumber - 1) {
      if (/^\s*export\s/.test(ln)) break
      if (/^\s*const\s/.test(ln)) break
    }
    rhsLines.push(ln)
  }
  const rhsText = rhsLines.join('\n')
  const rhsHead = (lines[lineNumber - 1] ?? '').trim()

  // 判定 1：是否走派生函数
  // [023.13] Critical Fix #1:加入 deriveStatusTransitionActions 关键词（[023.13] 抽纯函数后,
  // rules-registry.ts 可能直接调纯函数而非 wrapper;两者都视为合法形态）
  const usesDerivation = /\b(buildStatusTransitionActions|getTransitionsFromManifest|deriveStatusTransitionActions)\s*\(/.test(rhsText)

  // 判定 2：是否手工 Set 字面量
  // 启发式：RHS 含 `new Set(` （允许 `new Set<string>([` 这种泛型形式），
  // 且其后跟着方括号 `[` 包裹的字符串字面量成员（至少 1 个引号包裹的成员）
  let hasHandwrittenSet = false
  // 匹配 `new Set` + 可选泛型 + 可选空白 + `(`
  const setCtorMatch = /\bnew\s+Set(?:\s*<[^>]+>)?\s*\(/.exec(rhsText)
  if (setCtorMatch) {
    // 从 `(` 之后扫，找 `[` 起始的成员列表
    const openParenIdx = setCtorMatch.index + setCtorMatch[0].length
    const afterParen = rhsText.slice(openParenIdx)
    // 跳过空白/换行
    const bracketStart = afterParen.indexOf('[')
    if (bracketStart !== -1) {
      const afterBracket = afterParen.slice(bracketStart + 1)
      const closeIdx = afterBracket.indexOf(']')
      const setBody = closeIdx === -1 ? afterBracket : afterBracket.slice(0, closeIdx)
      // 至少 1 个引号包裹的字符串成员
      if (/['"][a-zA-Z_][a-zA-Z0-9_]*['"]/.test(setBody)) {
        hasHandwrittenSet = true
      }
    }
  }

  return { usesDerivation, hasHandwrittenSet, rhsHead, lineNumber }
}

// ─── 主流程 ───────────────────────────────────────────────────────

interface DriftReport {
  /** STATUS_TRANSITION_ACTIONS 形态异常（不依赖成员比较，直接报） */
  shapeProblem?: string
  /** manifest 有但实际没有（仅当形态合法时计算） */
  missing?: string[]
  /** 实际有但 manifest 没有（仅当形态合法时计算） */
  extra?: string[]
}

function checkDrift(
  expected: Set<string>,
  actual: Set<string>,
  shape: ActualShape,
): DriftReport {
  const report: DriftReport = {}

  if (!shape.usesDerivation) {
    if (shape.hasHandwrittenSet) {
      report.shapeProblem =
        `STATUS_TRANSITION_ACTIONS 退化为手工 Set（${shape.rhsHead}）。` +
        `请恢复为派生调用 buildStatusTransitionActions()，确保 manifest.lifecycle 单一源。`
    } else {
      report.shapeProblem =
        `STATUS_TRANSITION_ACTIONS 形态未识别（${shape.rhsHead}）。` +
        `RHS 必须调用 buildStatusTransitionActions() / deriveStatusTransitionActions(...) / ` +
        `getTransitionsFromManifest(...) 等派生函数。`
    }
    return report
  }

  // [023.13] Critical Fix #1:形态合法 ≠ 派生正确。必须比对 actual(纯函数算的)与
  // expected(validator 内部同源手工);若 deriveStatusTransitionActions 函数体退化
  // (toPascalCase 漏 charAt、忘了过滤 create),actual 与 expected 出现 missing/extra。
  const missing = [...expected].filter((x) => !actual.has(x)).sort()
  const extra = [...actual].filter((x) => !expected.has(x)).sort()
  if (missing.length > 0) report.missing = missing
  if (extra.length > 0) report.extra = extra
  return report
}

function main(): number {
  let loadResult: { rawManifest: RawManifest; expected: Set<string> }
  try {
    loadResult = loadManifestAndDeriveExpected()
  } catch (e) {
    console.error('validate:rules-registry — manifest 解析失败:', (e as Error).message)
    return 2
  }

  let shape: ActualShape
  try {
    shape = inspectRulesRegistryShape()
  } catch (e) {
    console.error('validate:rules-registry — rules-registry.ts 扫描失败:', (e as Error).message)
    return 2
  }

  // [023.13] Critical Fix #1:形态合法时调纯函数算 actual,validator 喂入自己 parse 的 yaml
  // —— 不走 manifest-loader cache、不踩 @/ alias 副作用链。
  const actual = shape.usesDerivation
    ? deriveStatusTransitionActions(loadResult.rawManifest)
    : new Set<string>()

  const report = checkDrift(loadResult.expected, actual, shape)

  if (report.shapeProblem) {
    console.error('✗ validate:rules-registry drift:')
    console.error(`  ${report.shapeProblem}`)
    console.error(`  修复：在 src/domains/timebox/rules-registry.ts:${shape.lineNumber} 恢复派生调用`)
    return 1
  }

  if (report.missing && report.missing.length > 0) {
    console.error('✗ validate:rules-registry drift:')
    console.error(
      `  expected 有但 actual（deriveStatusTransitionActions）缺 ${report.missing.length} 项:`,
    )
    for (const m of report.missing) console.error(`    - ${m}`)
    console.error(
      `  修复:检查 src/domains/timebox/lib/build-status-transition-actions.ts 内 ` +
        `deriveStatusTransitionActions 函数(toPascalCase / create 过滤 是否仍正确)`,
    )
    return 1
  }

  if (report.extra && report.extra.length > 0) {
    console.error('✗ validate:rules-registry drift:')
    console.error(
      `  actual（deriveStatusTransitionActions）有但 expected 缺 ${report.extra.length} 项:`,
    )
    for (const e of report.extra) console.error(`    - ${e}`)
    console.error(
      `  修复:deriveStatusTransitionActions 多算了——多半忘了过滤 create 或 lifecycle ` +
        `解析读错了键`,
    )
    return 1
  }

  // 形态合法 + 集合一致:报告派生集合的成员（仅诊断用,不阻断）
  const sorted = [...loadResult.expected].sort()
  console.log(
    `✓ validate:rules-registry — STATUS_TRANSITION_ACTIONS 与 manifest.lifecycle 一致（${sorted.length} 项: ${sorted.join(', ')}）`,
  )
  return 0
}

const code = main()
process.exit(code)
