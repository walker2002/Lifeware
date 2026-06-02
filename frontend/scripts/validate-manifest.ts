#!/usr/bin/env npx tsx
/**
 * @file validate-manifest
 * @brief Manifest 诊断工具 — 校验所有 domain manifest.yaml 是否符合规范
 * 
 * @usage npx tsx scripts/validate-manifest.ts
 * @exitcode 0 = 全部通过, 1 = 有 error 级别问题
 * 
 * 校验策略：
 *   - 直接解析 YAML 获取完整字段（避免 Zod schema 剥离未知字段）
 *   - 同时调用 loadDomainManifest 检测结构/语义错误
 */

import * as fs from 'node:fs'
import * as path from 'node:path'

const ROOT_DIR = path.resolve(__dirname, '..')
const DOMAINS_DIR = path.join(ROOT_DIR, 'src', 'domains')

// ─── 类型定义 ────────────────────────────────────────────────────

/**
 * 诊断信息接口
 */
interface Diagnostic {
  /** 域 ID */
  domainId: string
  /** 严重级别 */
  level: 'error' | 'warning' | 'info'
  /** 规则标识 */
  rule: string
  /** 诊断消息 */
  message: string
}

/**
 * 原始 Manifest 结构（直接从 YAML 解析）
 */
interface RawManifest {
  /** 域 ID */
  id?: string
  /** 域名称 */
  name?: string
  /** 版本号 */
  version?: string
  /** 意图触发器配置 */
  intent_triggers?: Array<Record<string, unknown>>
  /** CNUI 表面配置 */
  cnui_surfaces?: Record<string, Record<string, unknown>>
  /** 生成动作配置 */
  generation_actions?: Record<string, Record<string, unknown>>
  /** 查询动作配置 */
  query_actions?: Record<string, Record<string, unknown>>
  /** 生命周期配置 */
  lifecycle?: Record<string, unknown>
  /** 订阅事件列表 */
  subscribed_events?: string[]
  [key: string]: unknown
}

// ─── 全局诊断列表 ───────────────────────────────────────────────

const diagnostics: Diagnostic[] = []

/**
 * 添加错误级别诊断
 * @param domainId - 域 ID
 * @param rule - 规则标识
 * @param message - 诊断消息
 */
function addError(domainId: string, rule: string, message: string) {
  diagnostics.push({ domainId, level: 'error', rule, message })
}

/**
 * 添加警告级别诊断
 * @param domainId - 域 ID
 * @param rule - 规则标识
 * @param message - 诊断消息
 */
function addWarning(domainId: string, rule: string, message: string) {
  diagnostics.push({ domainId, level: 'warning', rule, message })
}

/**
 * 添加信息级别诊断
 * @param domainId - 域 ID
 * @param rule - 规则标识
 * @param message - 诊断消息
 */
function addInfo(domainId: string, rule: string, message: string) {
  diagnostics.push({ domainId, level: 'info', rule, message })
}

// ─── 工具函数 ───────────────────────────────────────────────────

/**
 * 将 kebab-case 转换为 PascalCase
 * @param kebab - kebab-case 字符串
 * @returns PascalCase 字符串
 */
function pascalCase(kebab: string): string {
  return kebab
    .split('-')
    .map(w => w[0].toUpperCase() + w.slice(1))
    .join('')
}

/**
 * 获取所有合法的域 ID 列表
 * @returns 域 ID 列表
 */
function getDomainIds(): string[] {
  const entries = fs.readdirSync(DOMAINS_DIR, { withFileTypes: true })
  return entries
    .filter(e => {
      if (!e.isDirectory()) return false
      if (e.name.startsWith('_') || e.name.startsWith('.')) return false
      // 必须有 manifest.yaml 才算合法 domain
      if (!fs.existsSync(path.join(DOMAINS_DIR, e.name, 'manifest.yaml'))) return false
      return true
    })
    .map(e => e.name)
}

// ─── YAML 直接解析（绕过 Zod schema 以保留所有字段）────────────

/**
 * 直接解析 YAML 文件（不经过 Zod schema，保留所有字段）
 * @param domainId - 域 ID
 * @returns 解析结果
 */
function parseManifestYaml(domainId: string): { success: boolean; manifest?: RawManifest; error?: string } {
  const manifestPath = path.join(DOMAINS_DIR, domainId, 'manifest.yaml')
  if (!fs.existsSync(manifestPath)) {
    return { success: false, error: `manifest.yaml 文件不存在: ${manifestPath}` }
  }
  try {
    // 使用 require 延迟加载以兼容各种运行环境
    const yaml = require('yaml')
    const content = fs.readFileSync(manifestPath, 'utf-8')
    const manifest = yaml.parse(content) as RawManifest
    return { success: true, manifest }
  } catch (e: unknown) {
    const err = e as { message?: string }
    return { success: false, error: `YAML 解析失败: ${err.message ?? String(e)}` }
  }
}

/**
 * 通过 manifest-loader 进行结构化/语义校验，收集其输出的错误。
 * loader 可能因为 Zod schema 剥离 unknown 字段而 pass，
 * 但此处仅用于收集 schema 级别的错误信息。
 * @param domainId - 域 ID
 */
function collectLoaderErrors(domainId: string): void {
  try {
    // 使用 process.cwd() 兼容 loadDomainManifest 的路径解析
    const originalCwd = process.cwd()
    if (path.resolve(originalCwd) !== path.resolve(ROOT_DIR)) {
      process.chdir(ROOT_DIR)
    }
    try {
      const { loadDomainManifest } = require(path.join(ROOT_DIR, 'src', 'domains', 'manifest-loader'))
      const result = loadDomainManifest(domainId)
      if (!result.success) {
        for (const err of result.errors) {
          addError(domainId, `schema-${err.phase}`, `${err.fieldPath?.join('.') ?? ''}: ${err.message}`)
        }
      }
    } finally {
      if (path.resolve(originalCwd) !== path.resolve(ROOT_DIR)) {
        process.chdir(originalCwd)
      }
    }
  } catch (e: unknown) {
    // loader 不可用时静默跳过
    addInfo(domainId, 'loader-unavailable', 'manifest-loader 不可用，跳过结构/语义校验')
  }
}

// ─── 单 domain 校验 ─────────────────────────────────────────────

/**
 * 校验单个域的 manifest
 * @param domainId - 域 ID
 */
function validateDomain(domainId: string): void {
  // 先尝试 YAML 解析
  const parseResult = parseManifestYaml(domainId)
  if (!parseResult.success) {
    addError(domainId, 'yaml-parse', parseResult.error!)
    return
  }

  const manifest = parseResult.manifest!
  const domainDir = path.join(DOMAINS_DIR, domainId)

  // 通过 loader 收集结构/语义错误
  collectLoaderErrors(domainId)

  // 基本字段检查
  if (!manifest.id) {
    addError(domainId, 'missing-id', 'manifest 缺少 id 字段')
  }
  if (!manifest.name) {
    addWarning(domainId, 'missing-name', 'manifest 缺少 name 字段')
  }
  if (!manifest.version) {
    addWarning(domainId, 'missing-version', 'manifest 缺少 version 字段')
  }

  // id 与目录名一致性
  if (manifest.id && manifest.id !== domainId) {
    addWarning(domainId, 'id-mismatch', `manifest.id "${manifest.id}" 与目录名 "${domainId}" 不一致`)
  }

  const intentTriggers = (manifest.intent_triggers ?? []) as Array<Record<string, unknown>>
  const cnuiSurfaces = (manifest.cnui_surfaces ?? {}) as Record<string, Record<string, unknown>>
  const generationActions = (manifest.generation_actions ?? {}) as Record<string, Record<string, unknown>>
  const queryActions = (manifest.query_actions ?? {}) as Record<string, Record<string, unknown>>

  // ── 区块 A: intent_triggers 校验 ─────────────────────────────

  const actionNames = new Set<string>()
  for (const trigger of intentTriggers) {
    const action = trigger.action as string | undefined
    if (!action) {
      addError(domainId, 'A-missing-action', 'intent_trigger 缺少 action 字段')
      continue
    }

    // action 名不重复
    if (actionNames.has(action)) {
      addError(domainId, 'A-duplicate-action', `intent_trigger "${action}" 重复定义`)
    }
    actionNames.add(action)

    // response_type 合法性
    const responseType = trigger.response_type as string | undefined
    if (responseType && !['page', 'cnui', 'text'].includes(responseType)) {
      addError(domainId, 'A-invalid-response-type',
        `intent_trigger "${action}" 的 response_type "${responseType}" 无效，合法值: page, cnui, text`)
    }

    // response_type 与配套字段一致性
    if (responseType === 'page' && !trigger.view_route) {
      addError(domainId, 'A-missing-view-route',
        `intent_trigger "${action}" response_type=page 但缺少 view_route`)
    }
    if (responseType === 'cnui' && !trigger.cnui_surface) {
      // 检查是否在 generation_actions 中声明了 cnui_surface_type
      const genAction = generationActions[action]
      if (!genAction?.cnui_surface_type) {
        addWarning(domainId, 'A-missing-cnui-surface',
          `intent_trigger "${action}" response_type=cnui 但缺少 cnui_surface，且 generation_actions 中也未声明 cnui_surface_type`)
      }
    }

    // cnui_surface 引用存在性
    if (trigger.cnui_surface && !cnuiSurfaces[trigger.cnui_surface as string]) {
      addError(domainId, 'A-cnui-surface-not-found',
        `intent_trigger "${action}" 引用的 cnui_surface "${trigger.cnui_surface}" 在 cnui_surfaces 块中不存在`)
    }

    // generation_actions 中已声明的 action 不需要重复声明 cnui_surface
    if (responseType === 'cnui' && trigger.cnui_surface && generationActions[action]?.cnui_surface_type) {
      addInfo(domainId, 'A-redundant-cnui-surface',
        `intent_trigger "${action}" 在 generation_actions 中已有 cnui_surface_type，此处 cnui_surface 可不重复声明`)
    }
  }

  // ── 区块 K: cnui_surfaces 校验 ───────────────────────────────

  for (const [surfaceType, surface] of Object.entries(cnuiSurfaces)) {
    const s = surface as Record<string, unknown>

    // handler 文件存在性
    if (s.handler) {
      const handlerRelPath = s.handler as string
      // handler 可能是 './cnui/handlers' 这样的相对路径
      const handlerPath = path.resolve(domainDir, handlerRelPath + '.ts')
      if (!fs.existsSync(handlerPath)) {
        addError(domainId, 'K-handler-not-found',
          `cnui_surface "${surfaceType}" 的 handler "${handlerRelPath}" 文件不存在: ${handlerPath}`)
      }
    } else {
      addWarning(domainId, 'K-missing-handler',
        `cnui_surface "${surfaceType}" 缺少 handler 字段`)
    }

    // surface 组件文件存在性（按约定：kebab-case → PascalCase）
    const componentName = pascalCase(surfaceType)
    const componentPath = path.join(domainDir, 'cnui', 'surfaces', componentName + '.tsx')
    if (!fs.existsSync(componentPath)) {
      addError(domainId, 'K-component-not-found',
        `cnui_surface "${surfaceType}" 的组件文件不存在（按约定查找）: ${componentPath}`)
    }

    // 被引用检查
    let referenced = false
    for (const trigger of intentTriggers) {
      if (trigger.cnui_surface === surfaceType) { referenced = true; break }
    }
    if (!referenced) {
      for (const ga of Object.values(generationActions)) {
        if (ga.cnui_surface_type === surfaceType) { referenced = true; break }
      }
    }
    if (!referenced) {
      for (const qa of Object.values(queryActions)) {
        if (qa.cnui_surface === surfaceType) { referenced = true; break }
      }
    }
    if (!referenced) {
      addWarning(domainId, 'K-unreferenced-surface',
        `cnui_surface "${surfaceType}" 未被任何 intent_trigger、generation_action 或 query_action 引用`)
    }
  }

  // ── generation_actions 中的 cnui_surface_type 引用检查 ──────

  for (const [actionKey, ga] of Object.entries(generationActions)) {
    if (ga.cnui_surface_type && !cnuiSurfaces[ga.cnui_surface_type as string]) {
      addError(domainId, 'GA-surface-not-found',
        `generation_actions["${actionKey}"] 的 cnui_surface_type "${ga.cnui_surface_type}" 在 cnui_surfaces 中不存在`)
    }

    // generation_action 有 cnui surface 时，对应的 intent_trigger 必须声明 response_type
    if (ga.cnui_surface_type || ga.response_mode === 'cnui') {
      const trigger = intentTriggers.find(t => t.action === actionKey)
      if (trigger && !trigger.response_type) {
        addError(domainId, 'GA-missing-trigger-response-type',
          `generation_actions["${actionKey}"] 有 cnui surface，但 intent_trigger 缺少 response_type: cnui`)
      }
    }
  }

  // ── query_actions 中的 cnui_surface 引用检查 ─────────────────

  for (const [actionKey, qa] of Object.entries(queryActions)) {
    if (qa.cnui_surface && !cnuiSurfaces[qa.cnui_surface as string]) {
      addError(domainId, 'QA-surface-not-found',
        `query_actions["${actionKey}"] 的 cnui_surface "${qa.cnui_surface}" 在 cnui_surfaces 中不存在`)
    }
  }
}

// ─── 跨 domain 校验：surface type 不跨 domain 重复 ─────────────

function validateCrossDomain(): void {
  const surfaceOwners = new Map<string, string>()

  for (const domainId of getDomainIds()) {
    const parseResult = parseManifestYaml(domainId)
    if (!parseResult.success) continue

    const cnuiSurfaces = ((parseResult.manifest as RawManifest).cnui_surfaces ?? {}) as Record<string, unknown>
    for (const surfaceType of Object.keys(cnuiSurfaces)) {
      const existing = surfaceOwners.get(surfaceType)
      if (existing) {
        addError(domainId, 'cross-domain-surface-duplicate',
          `cnui_surface "${surfaceType}" 已被 domain "${existing}" 注册，不可在 "${domainId}" 中重复定义`)
      } else {
        surfaceOwners.set(surfaceType, domainId)
      }
    }
  }
}

// ─── 执行 ───────────────────────────────────────────────────────

const domainIds = getDomainIds()

if (domainIds.length === 0) {
  console.log('未找到任何 Domain 目录。')
  process.exit(0)
}

for (const domainId of domainIds) {
  validateDomain(domainId)
}

validateCrossDomain()

// ─── 输出 ───────────────────────────────────────────────────────

const colors: Record<string, string> = {
  error: '\x1b[31m',
  warning: '\x1b[33m',
  info: '\x1b[36m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
}

// 按 domain 分组输出
for (const domainId of domainIds) {
  const domainDiags = diagnostics.filter(d => d.domainId === domainId)
  if (domainDiags.length === 0) {
    console.log(`${colors.green}✓${colors.reset} ${domainId}/manifest.yaml — 全部通过`)
    continue
  }
  const hasError = domainDiags.some(d => d.level === 'error')
  const prefix = hasError ? '✗' : '⚠'
  const color = hasError ? colors.error : colors.warning
  console.log(`${color}${prefix}${colors.reset} ${domainId}/manifest.yaml — ${domainDiags.length} 个问题`)
  for (const d of domainDiags) {
    const levelPrefix = d.level === 'error' ? 'ERROR' : d.level === 'warning' ? 'WARN' : 'INFO'
    const levelColor = colors[d.level] ?? ''
    console.log(`  ${levelColor}${levelPrefix}${colors.reset}  ${d.rule}: ${d.message}`)
  }
}

const errorCount = diagnostics.filter(d => d.level === 'error').length
const warningCount = diagnostics.filter(d => d.level === 'warning').length
const infoCount = diagnostics.filter(d => d.level === 'info').length

console.log(`\n${colors.bold}Summary:${colors.reset} ${domainIds.length} 个 domain, ${errorCount} 个错误, ${warningCount} 个警告, ${infoCount} 个提示`)

if (errorCount > 0) {
  process.exit(1)
}
