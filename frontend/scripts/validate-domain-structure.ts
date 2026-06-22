#!/usr/bin/env npx tsx
/**
 * @file validate-domain-structure
 * @brief Domain 结构诊断 — 写入口溯源（orchestrator-溯源）+ rules-registry 存在性
 *
 * @usage npx tsx scripts/validate-domain-structure.ts
 * @exitcode 0 = 全部通过, 1 = 有 error
 *
 * 校验策略（对应 docs/domain-development-guide.md §4）：
 *   - orchestrator-溯源：扫 src/app/actions/** 的 export async function 入口，
 *     识别「业务事实 repo」直接写（不经 executeIntent / mutationService.{update,execute}）= 违宪。
 *   - 业务事实 repo 判据（目录判据）：domains 目录下 repository 受查；lib/db/repositories 不查；
 *     HabitTemplateRepository（配置语义）例外。
 *   - rules-registry 存在性：有 manifest.yaml 的域须有 rules-registry.ts（带豁免）。
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as ts from 'typescript'

// ─── 类型 ────────────────────────────────────────────────────

/** 诊断信息 */
export interface Diagnostic {
  file: string
  level: 'error' | 'warning' | 'info'
  rule: string
  message: string
}

/** 接收者类别 */
export type ReceiverKind = 'repo' | 'mutationService' | 'orchestrator' | 'unknown'

/** 接收者绑定信息 */
export interface ReceiverInfo {
  kind: ReceiverKind
  /** repo 类名（如 TaskRepository），用于业务事实判据 */
  className?: string
}

/** 入口函数 */
export interface EntryFunction {
  name: string
  fn: ts.FunctionDeclaration
}

/** 裸 repo 写位置 */
export interface Bypass {
  fnName: string
  line: number
  code: string
}

// ─── 常量 ────────────────────────────────────────────────────

/** GenericRepo 写方法族 */
export const WRITE_METHODS = new Set([
  'save', 'create', 'update', 'updateStatus', 'updateFields', 'delete',
])

/** repo 类名命名约定 */
const REPO_TYPE_RE = /(Repository|Repo)$/

/** 配置语义的 domain repo 例外（domain 下但非业务事实） */
export const CONFIG_REPOSITORY_EXCEPTIONS = new Set([
  'HabitTemplateRepository',
])

// ─── 入口函数识别 ────────────────────────────────────────────

/** 判定函数声明是否为 export async（use server 入口） */
export function isExportAsyncFunction(fn: ts.FunctionDeclaration): boolean {
  const mods = fn.modifiers ?? []
  const hasExport = mods.some(m => m.kind === ts.SyntaxKind.ExportKeyword)
  const hasAsync = mods.some(m => m.kind === ts.SyntaxKind.AsyncKeyword)
  return hasExport && hasAsync
}

/** 提取 sourceFile 中所有 export async function 入口 */
export function extractEntryFunctions(sf: ts.SourceFile): EntryFunction[] {
  const out: EntryFunction[] = []
  for (const stmt of sf.statements) {
    if (ts.isFunctionDeclaration(stmt) && isExportAsyncFunction(stmt)) {
      out.push({ name: stmt.name?.text ?? '<anon>', fn: stmt })
    }
  }
  return out
}

// ─── import 解析（业务事实判据用）────────────────────────────

/** 建「标识符 → 模块路径」映射（从 import 语句） */
export function buildImportMap(sf: ts.SourceFile): Map<string, string> {
  const map = new Map<string, string>()
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt)) continue
    const spec = stmt.moduleSpecifier
    if (!ts.isStringLiteral(spec)) continue
    const modPath = spec.text
    const clause = stmt.importClause
    if (!clause) continue
    const named = clause.namedBindings
    if (named && ts.isNamedImports(named)) {
      for (const el of named.elements) map.set(el.name.text, modPath)
    }
    if (clause.name) map.set(clause.name.text, modPath)
  }
  return map
}

// ─── 接收者溯源 ──────────────────────────────────────────────

/** 按类型名判定类别（含 className 提取） */
export function classifyByTypeName(
  name: string,
): { kind: ReceiverKind; className?: string } | null {
  if (REPO_TYPE_RE.test(name) || name === 'GenericRepo') {
    return { kind: 'repo', className: name }
  }
  if (/MutationService$/.test(name) || name === 'DomainMutationService') {
    return { kind: 'mutationService', className: name }
  }
  if (/Orchestrator$/.test(name) || name === 'Orchestrator') {
    return { kind: 'orchestrator', className: name }
  }
  return null
}

/** 按 callee 名判定（工厂调用） */
export function classifyByCallee(
  callee: string,
): { kind: ReceiverKind; className?: string } | null {
  if (/create.*Repositor(y|ies)$/i.test(callee) || /create.*Repo$/i.test(callee)) {
    return { kind: 'repo', className: callee }
  }
  if (/(create|get).*MutationService$/i.test(callee)) {
    return { kind: 'mutationService', className: callee }
  }
  if (/getOrchestrator/i.test(callee)) {
    return { kind: 'orchestrator', className: callee }
  }
  return null
}

/** 判定变量声明的类别（类型注解 > initializer） */
export function classifyDeclaration(
  decl: ts.VariableDeclaration,
): { kind: ReceiverKind; className?: string } | null {
  // 1. 类型注解优先：const x: TaskRepository = ...
  if (decl.type && ts.isTypeReferenceNode(decl.type)) {
    return classifyByTypeName(decl.type.typeName.getText())
  }
  const init = decl.initializer
  if (!init) return null
  // 2. new XxxRepository()
  if (ts.isNewExpression(init) && init.expression) {
    return classifyByTypeName(init.expression.getText())
  }
  // 3. foo() / await foo()
  let call: ts.Expression = init
  if (ts.isAwaitExpression(init)) call = init.expression
  if (ts.isCallExpression(call) && ts.isIdentifier(call.expression)) {
    return classifyByCallee(call.expression.text)
  }
  return null
}

/** 建接收者绑定表（参数 + 函数体变量声明） */
export function buildReceiverMap(
  fn: ts.FunctionDeclaration,
): Map<string, ReceiverInfo> {
  const map = new Map<string, ReceiverInfo>()
  // 参数绑定
  for (const p of fn.parameters) {
    if (p.name && ts.isIdentifier(p.name) && p.type && ts.isTypeReferenceNode(p.type)) {
      const c = classifyByTypeName(p.type.typeName.getText())
      if (c) map.set(p.name.text, c)
    }
  }
  // 函数体变量绑定
  if (fn.body) {
    const visit = (node: ts.Node) => {
      if (ts.isVariableStatement(node)) {
        for (const d of node.declarationList.declarations) {
          const c = classifyDeclaration(d)
          if (c && d.name && ts.isIdentifier(d.name)) map.set(d.name.text, c)
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(fn.body)
  }
  return map
}

// ─── 业务事实 repo 判据（目录判据）────────────────────────────

/**
 * 判定 repo 类是否「业务事实 repo」（受写入口约束）。
 * 判据（目录判据）：
 *   - 配置例外（HabitTemplateRepository 等）→ 非业务
 *   - import 路径含 lib/db → 非业务（系统记录）
 *   - import 路径含 domains/ → 业务事实
 *   - 无 import 信息（同文件定义/未 import）→ 保守视为业务（报 + 提示确认）
 */
export function isBusinessFactRepo(
  className: string | undefined,
  importPath: string | undefined,
): boolean {
  if (className && CONFIG_REPOSITORY_EXCEPTIONS.has(className)) return false
  if (importPath && importPath.includes('lib/db')) return false
  if (importPath && importPath.includes('domains/')) return true
  return true // 无 import 信息：保守报
}

// ─── 裸 repo 写检测 ──────────────────────────────────────────

/**
 * 在入口函数体内找「业务事实 repo 的裸写」（不经 executeIntent / mutationService.{update,execute}）。
 * 白名单自然成立：mutationService.update/execute 的接收者类别=mutationService（非 repo），
 * orchestrator.executeIntent 的方法名 executeIntent 不在 WRITE_METHODS。
 */
export function findBypassedWrites(
  fn: ts.FunctionDeclaration,
  recvMap: Map<string, ReceiverInfo>,
  importMap: Map<string, string>,
  sf: ts.SourceFile,
): Bypass[] {
  const bypasses: Bypass[] = []
  if (!fn.body) return bypasses
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text
      const recv = node.expression.expression
      if (WRITE_METHODS.has(method) && ts.isIdentifier(recv)) {
        const info = recvMap.get(recv.text)
        if (info?.kind === 'repo') {
          const importPath = info.className ? importMap.get(info.className) : undefined
          if (isBusinessFactRepo(info.className, importPath)) {
            const { line } = sf.getLineAndCharacterOfPosition(node.getStart())
            bypasses.push({
              fnName: fn.name?.text ?? '<anon>',
              line: line + 1,
              code: node.expression.getText(),
            })
          }
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(fn.body)
  return bypasses
}

// ─── 单文件分析 ──────────────────────────────────────────────

/** 分析单个 source（filePath + content），返回诊断 */
export function analyzeSourceFile(
  filePath: string,
  content: string,
  exemptions: ReadonlySet<string>,
  actionsDir: string,
): Diagnostic[] {
  const sf = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true)
  const importMap = buildImportMap(sf)
  const relPath = path.relative(actionsDir, filePath)
  const isExempt = exemptions.has(relPath) || exemptions.has(path.basename(relPath))
  const diags: Diagnostic[] = []
  for (const entry of extractEntryFunctions(sf)) {
    const recvMap = buildReceiverMap(entry.fn)
    for (const b of findBypassedWrites(entry.fn, recvMap, importMap, sf)) {
      if (isExempt) continue
      diags.push({
        file: relPath,
        level: 'error',
        rule: 'write-entry-bypass',
        message: `入口函数 ${b.fnName}() 第 ${b.line} 行：业务事实 repo 直接写「${b.code}」绕过写入口 — 须经 executeIntent 或 mutationService.{update,execute}（豁免见 WRITE_ENTRY_EXEMPTIONS）`,
      })
    }
  }
  return diags
}

// ─── rules-registry 存在性 ───────────────────────────────────

/**
 * 检查每个有 manifest.yaml 的域是否有 rules-registry.ts（规则三层 L3）。
 * 跳过 _ / . 前缀目录（fixture）；豁免清单内的域不查。
 */
export function checkRulesRegistry(
  domainsDir: string,
  exemptions: ReadonlySet<string>,
): Diagnostic[] {
  const diags: Diagnostic[] = []
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(domainsDir, { withFileTypes: true })
  } catch {
    return diags // domains 目录不存在 → 静默（main 会处理）
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue
    if (e.name.startsWith('_') || e.name.startsWith('.')) continue
    if (!fs.existsSync(path.join(domainsDir, e.name, 'manifest.yaml'))) continue
    if (exemptions.has(e.name)) continue
    const registryPath = path.join(domainsDir, e.name, 'rules-registry.ts')
    if (!fs.existsSync(registryPath)) {
      diags.push({
        file: `${e.name}/rules-registry.ts`,
        level: 'error',
        rule: 'rules-registry-missing',
        message: `写域「${e.name}」缺 rules-registry.ts（规则三层 L3 缺失）— 须声明 rules + 注册处理器 + onValidate 委托 evaluateDomainRules（豁免见 RULES_REGISTRY_EXEMPTIONS）`,
      })
    }
  }
  return diags
}

// ─── [019.1] L4-1：禁 CnuiFormAdapter ──────────────────────────

/**
 * 收集 dir 下所有 .ts/.tsx 源文件（排除 __tests__、.test.*、node_modules、点前缀目录）。
 * 复用 collectActionFiles 的遍历风格，扩展到 .tsx 与全域 src。
 */
export function collectSourceFiles(dir: string): string[] {
  const out: string[] = []
  const walk = (d: string) => {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(d, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (e.name === '__tests__' || e.name === 'node_modules' || e.name.startsWith('.')) continue
      const p = path.join(d, e.name)
      if (e.isDirectory()) {
        walk(p)
      } else if (
        e.isFile() &&
        (e.name.endsWith('.ts') || e.name.endsWith('.tsx')) &&
        !e.name.endsWith('.test.ts') &&
        !e.name.endsWith('.test.tsx')
      ) {
        out.push(p)
      }
    }
  }
  walk(dir)
  return out
}

/**
 * 在单个 sourceFile 中检测 CnuiFormAdapter 残留（import 模块路径含 cnui-form-adapter，
 * 或标识符 CnuiFormAdapter）。返回首个命中位置，便于按文件报一条诊断。
 */
export function findCnuiFormAdapterUsage(sf: ts.SourceFile): { line: number } | null {
  let found: { line: number } | null = null
  const visit = (node: ts.Node) => {
    if (found) return
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      node.moduleSpecifier.text.includes('cnui-form-adapter')
    ) {
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart())
      found = { line: line + 1 }
      return
    }
    if (ts.isIdentifier(node) && node.text === 'CnuiFormAdapter') {
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart())
      found = { line: line + 1 }
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return found
}

/**
 * L4-1：扫 src/** 下 CnuiFormAdapter 残留（零豁免——退役后无债务人）。
 * @param srcDir - frontend/src 绝对路径
 */
export function checkCnuiFormAdapter(srcDir: string): Diagnostic[] {
  const diags: Diagnostic[] = []
  for (const f of collectSourceFiles(srcDir)) {
    const content = fs.readFileSync(f, 'utf-8')
    const sf = ts.createSourceFile(f, content, ts.ScriptTarget.Latest, true)
    const hit = findCnuiFormAdapterUsage(sf)
    if (hit) {
      diags.push({
        file: path.relative(srcDir, f),
        level: 'error',
        rule: 'cnui-form-adapter-forbidden',
        message: `第 ${hit.line} 行：禁止使用 CnuiFormAdapter（§IX 已 supersede §CN-UI#4；L4-1）— surface 须手写 + 直接接收 serverErrors（见 domain-development-guide Step 13）`,
      })
    }
  }
  return diags
}

// ─── [019.1] L7-2：禁 FormRegistry.register + register-form.ts 残留 ─────────

/** 在单个 sourceFile 中检测 FormRegistry.register( 调用，返回首个命中位置。 */
export function findFormRegistryRegisterCall(sf: ts.SourceFile): { line: number } | null {
  let found: { line: number } | null = null
  const visit = (node: ts.Node) => {
    if (found) return
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.expression.getText() === 'FormRegistry' &&
      node.expression.name.text === 'register'
    ) {
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart())
      found = { line: line + 1 }
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return found
}

/**
 * L7-2：扫 src/domains/** 下 FormRegistry.register 调用 + register-form.ts 文件残留（零豁免）。
 * @param srcDir - frontend/src 绝对路径（内部 join 'domains'）
 */
export function checkFormRegistryResidual(srcDir: string): Diagnostic[] {
  const diags: Diagnostic[] = []
  const domainsDir = path.join(srcDir, 'domains')
  for (const f of collectSourceFiles(domainsDir)) {
    if (path.basename(f) === 'register-form.ts') {
      diags.push({
        file: path.relative(srcDir, f),
        level: 'error',
        rule: 'form-registry-residual',
        message: `禁止存在 register-form.ts（§IX 已 supersede；L7-2）— 表单注册中心已退役，surface 须手写`,
      })
      continue
    }
    const content = fs.readFileSync(f, 'utf-8')
    const sf = ts.createSourceFile(f, content, ts.ScriptTarget.Latest, true)
    const hit = findFormRegistryRegisterCall(sf)
    if (hit) {
      diags.push({
        file: path.relative(srcDir, f),
        level: 'error',
        rule: 'form-registry-residual',
        message: `第 ${hit.line} 行：禁止 FormRegistry.register（§IX 已 supersede；L7-2）— 表单注册中心已退役`,
      })
    }
  }
  return diags
}

// ─── 常量实例 + CLI ──────────────────────────────────────────

const ROOT_DIR = path.resolve(__dirname, '..')
const ACTIONS_DIR = path.join(ROOT_DIR, 'src', 'app', 'actions')
const DOMAINS_DIR = path.join(ROOT_DIR, 'src', 'domains')
const SRC_DIR = path.join(ROOT_DIR, 'src')

/** orchestrator-溯源 豁免（写入口绕过，带 sunset） */
export const WRITE_ENTRY_EXEMPTIONS = [
  {
    file: 'okr.ts',
    reason: 'updateObjective 绕过写入口（字段更新非状态转换，正确修复需 mutation-service=onboarding 一部分）',
    sunset: 'okrs 全量 onboarding（缠 [025] 跨域事务）',
  },
] as const

/** rules-registry 豁免（缺 L3，带 sunset） */
export const RULES_REGISTRY_EXEMPTIONS = [
  { domain: 'okrs', reason: '无 rules-registry（前范式遗产）', sunset: 'okrs 全量 onboarding' },
  { domain: 'timebox', reason: '写域缺 L3 规则三层', sunset: 'timebox L3 补齐' },
] as const

const WRITE_ENTRY_EXEMPTION_SET = new Set(WRITE_ENTRY_EXEMPTIONS.map(e => e.file))
const RULES_REGISTRY_EXEMPTION_SET = new Set(RULES_REGISTRY_EXEMPTIONS.map(e => e.domain))

/** 收集 actions/** 下所有 .ts（排除 __tests__、.test.ts） */
export function collectActionFiles(dir: string): string[] {
  const out: string[] = []
  const walk = (d: string) => {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(d, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (e.name === '__tests__') continue
      const p = path.join(d, e.name)
      if (e.isDirectory()) {
        walk(p)
      } else if (e.isFile() && e.name.endsWith('.ts') && !e.name.endsWith('.test.ts')) {
        out.push(p)
      }
    }
  }
  walk(dir)
  return out
}

/** 彩色输出诊断（风格对齐 validate-manifest.ts） */
export function printDiagnostics(diagnostics: Diagnostic[]): void {
  const colors: Record<string, string> = {
    error: '\x1b[31m', warning: '\x1b[33m', info: '\x1b[36m',
    reset: '\x1b[0m', bold: '\x1b[1m', green: '\x1b[32m',
  }
  if (diagnostics.length === 0) {
    console.log(`${colors.green}✓${colors.reset} validate-domain-structure — 全部通过`)
    return
  }
  for (const d of diagnostics) {
    const lvl = d.level === 'error' ? 'ERROR' : d.level === 'warning' ? 'WARN' : 'INFO'
    const c = colors[d.level] ?? ''
    console.log(`${c}${lvl}${colors.reset}  ${d.file}  ${d.rule}: ${d.message}`)
  }
  const errors = diagnostics.filter(d => d.level === 'error').length
  const warnings = diagnostics.filter(d => d.level === 'warning').length
  console.log(`\n${colors.bold}Summary:${colors.reset} ${errors} 错误, ${warnings} 警告`)
}

function main(): void {
  const diagnostics: Diagnostic[] = []
  for (const f of collectActionFiles(ACTIONS_DIR)) {
    const content = fs.readFileSync(f, 'utf-8')
    diagnostics.push(...analyzeSourceFile(f, content, WRITE_ENTRY_EXEMPTION_SET, ACTIONS_DIR))
  }
  diagnostics.push(...checkRulesRegistry(DOMAINS_DIR, RULES_REGISTRY_EXEMPTION_SET))
  // [019.1] L4-1/L7-2：禁 CnuiFormAdapter + FormRegistry 残留（§IX supersede §CN-UI#4）
  diagnostics.push(...checkCnuiFormAdapter(SRC_DIR))
  diagnostics.push(...checkFormRegistryResidual(SRC_DIR))
  printDiagnostics(diagnostics)
  process.exit(diagnostics.some(d => d.level === 'error') ? 1 : 0)
}

// 仅在直接运行时执行（import 时不执行）
if (require.main === module) {
  main()
}
