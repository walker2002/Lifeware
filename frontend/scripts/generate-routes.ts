#!/usr/bin/env tsx
/**
 * @file generate-routes
 * @brief Domain 路由生成脚本
 * 
 * 从所有 Domain 的 manifest.yaml 读取 view_routes 配置，
 * 自动生成 Next.js App Router 所需的路由文件到 app/ 目录。
 * 
 * @usage
 *   npm run generate:routes           # 生成所有路由
 *   npm run generate:routes --force   # 强制覆盖已存在文件
 *   npm run generate:routes --clean   # 清理孤立路由
 *   npm run generate:routes --watch   # 监听模式（未实现）
 */

import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'node:url'
import * as yaml from 'js-yaml'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ─── 类型定义 ────────────────────────────────────────────────────────

/**
 * 视图路由配置
 */
interface ViewRouteConfig {
  /** 组件路径 */
  component: string
  /** URL 路径 */
  url?: string
  /** 额外参数 */
  params?: Record<string, unknown>
  /** 导出名覆盖（kebab→PascalCase 与实际导出不符时，如 OKRWorkspace） */
  export_name?: string
  /** page.tsx 透传 props（字面值或 { from: searchParams, key }） */
  page_props?: Record<string, unknown>
}

/**
 * Manifest 结构
 */
interface Manifest {
  /** 域 ID */
  domainId: string
  /** 视图路由配置 */
  view_routes?: Record<string, ViewRouteConfig>
}

/**
 * 路由条目
 */
export interface RouteEntry {
  /** 域 ID */
  domainId: string
  /** 动作名称 */
  action: string
  /** 组件路径 */
  component: string
  /** URL 路径 */
  url: string
  /** 额外参数 */
  params?: Record<string, unknown>
  /** 导出名覆盖 */
  exportName?: string
  /** page.tsx 透传 props */
  pageProps?: Record<string, unknown>
}

/**
 * 生成选项
 */
interface GenerateOptions {
  /** 是否强制覆盖已存在文件 */
  force?: boolean
  /** 是否清理孤立路由 */
  clean?: boolean
  /** 指定域列表 */
  domains?: string[]
}

// ─── 路径配置 ────────────────────────────────────────────────────────

const PROJECT_ROOT = path.resolve(__dirname, '..')
const DOMAINS_DIR = path.join(PROJECT_ROOT, 'src', 'domains')
const APP_DIR = path.join(PROJECT_ROOT, 'src', 'app')
const AUTO_GENERATED_HEADER = `// ---
// Auto-generated from domains/{domain}/manifest.yaml
// DO NOT EDIT MANUALLY
// Generated at: {timestamp}
// ---

`

// ─── 主函数 ───────────────────────────────────────────────────────────

/**
 * 主函数：执行路由生成流程
 */
async function main() {
  const args = parseArgs(process.argv.slice(2))
  const options: GenerateOptions = {
    force: args.includes('--force'),
    clean: args.includes('--clean'),
    domains: args.filter(a => !a.startsWith('--')).length > 0
      ? args.filter(a => !a.startsWith('--'))
      : undefined,
  }

  console.log('🔧 Domain Route Generator')
  console.log('Options:', options)
  console.log()

  if (options.clean) {
    await cleanOrphanedRoutes()
  }

  const routes = await collectRoutes(options.domains)
  await validateRoutes(routes)
  await generateRoutes(routes, options.force ?? false)

  console.log()
  console.log(`✅ Generated ${routes.length} route(s)`)
}

// ─── 参数解析 ────────────────────────────────────────────────────────

/**
 * 解析命令行参数
 * @param args - 参数数组
 * @returns 解析后的参数
 */
function parseArgs(args: string[]): string[] {
  return args
}

// ─── 收集路由配置 ───────────────────────────────────────────────────

/**
 * 从所有域的 manifest.yaml 收集路由配置
 * @param domainFilter - 域过滤列表（可选）
 * @returns 路由条目列表
 */
async function collectRoutes(domainFilter?: string[]): Promise<RouteEntry[]> {
  const routes: RouteEntry[] = []

  if (!fs.existsSync(DOMAINS_DIR)) {
    throw new Error(`Domains directory not found: ${DOMAINS_DIR}`)
  }

  const domains = fs.readdirSync(DOMAINS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && !domainFilter || domainFilter?.includes(d.name))

  for (const domain of domains) {
    const manifestPath = path.join(DOMAINS_DIR, domain.name, 'manifest.yaml')

    if (!fs.existsSync(manifestPath)) {
      console.warn(`⚠️  Skipping ${domain.name}: no manifest.yaml found`)
      continue
    }

    try {
      const manifest = yaml.load(fs.readFileSync(manifestPath, 'utf-8')) as Manifest

      if (!manifest.view_routes) {
        console.log(`ℹ️  ${domain.name}: no view_routes defined`)
        continue
      }

      for (const [action, route] of Object.entries(manifest.view_routes)) {
        if (!route.url) {
          console.warn(`⚠️  Skipping ${domain.name}.${action}: missing 'url' field in view_routes`)
          continue
        }

        // 检查组件文件是否存在
        const componentPath = path.join(PROJECT_ROOT, 'src', route.component + '.tsx')
        if (!fs.existsSync(componentPath)) {
          console.warn(`⚠️  Skipping ${domain.name}.${action}: component file not found: ${route.component}`)
          continue
        }

        routes.push({
          domainId: domain.name,
          action,
          component: route.component,
          url: route.url,
          params: route.params,
          exportName: route.export_name,
          pageProps: route.page_props,
        })
      }

      const routeCount = Object.values(manifest.view_routes).filter(r => r.url).length
      console.log(`✓ ${domain.name}: ${routes.filter(r => r.domainId === domain.name).length}/${routeCount} view route(s) (component exists)`)
    } catch (err) {
      console.error(`❌ ${domain.name}: failed to parse manifest.yaml - ${err}`)
    }
  }

  return routes
}

// ─── 验证路由配置 ───────────────────────────────────────────────────

/**
 * 验证路由配置的有效性
 * @param routes - 路由条目列表
 * @throws {Error} 验证失败时抛出错误
 */
export async function validateRoutes(routes: RouteEntry[]): Promise<void> {
  const errors: string[] = []
  const warnings: string[] = []
  const urlMap = new Map<string, RouteEntry>()

  for (const route of routes) {
    // 验证 URL 格式
    if (!route.url.startsWith('/')) {
      errors.push(`${route.domainId}.${route.action}: url must start with '/'`)
    }

    // page_props 仅允许字面值，或结构完整的 searchParams 映射。
    for (const [propName, value] of Object.entries(route.pageProps ?? {})) {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) continue

      const mapping = value as { from?: unknown; key?: unknown }
      if (mapping.from === undefined) continue
      if (mapping.from !== 'searchParams') {
        errors.push(
          `${route.domainId}.${route.action}: page_props.${propName}.from must be 'searchParams'`,
        )
        continue
      }
      if (typeof mapping.key !== 'string' || mapping.key.trim() === '') {
        errors.push(
          `${route.domainId}.${route.action}: page_props.${propName}.key must be a non-empty string`,
        )
      }
    }

    // 检测 URL 冲突
    const existing = urlMap.get(route.url)
    if (existing) {
      errors.push(
        `${route.domainId}.${route.action}: url '${route.url}' conflicts with ` +
        `${existing.domainId}.${existing.action}`
      )
    }
    urlMap.set(route.url, route)

    // 验证组件文件存在（警告而非错误）
    const componentPath = path.join(PROJECT_ROOT, 'src', route.component + '.tsx')
    if (!fs.existsSync(componentPath)) {
      warnings.push(`${route.domainId}.${route.action}: component file not found: ${route.component}`)
    }
  }

  if (warnings.length > 0) {
    console.warn()
    console.warn('⚠️  Warnings (component files not found, routes will be generated anyway):')
    warnings.forEach(w => console.warn(`   - ${w}`))
  }

  if (errors.length > 0) {
    console.error()
    console.error('❌ Validation failed:')
    errors.forEach(e => console.error(`   - ${e}`))
    throw new Error('Route validation failed')
  }
}

// ─── 生成路由文件 ───────────────────────────────────────────────────

/**
 * 生成路由文件到 app 目录
 * @param routes - 路由条目列表
 * @param force - 是否强制覆盖已存在文件
 */
async function generateRoutes(routes: RouteEntry[], force: boolean): Promise<void> {
  for (const route of routes) {
    const outputPath = urlToFilePath(route.url)
    const existingContent = fs.existsSync(outputPath)
      ? fs.readFileSync(outputPath, 'utf-8')
      : null

    // 检查是否为自动生成的文件
    if (existingContent && !force) {
      if (!existingContent.includes('Auto-generated from domains/')) {
        console.warn(`⚠️  Skipping ${route.url}: file exists and is not auto-generated (use --force to override)`)
        continue
      }
    }

    // 生成文件内容
    const content = generateRouteFileContent(route)

    // 幂等检查：剥离时间戳行后比对，业务字段未变则跳过重写。
    // 否则每次 `npm run dev/build` 都会让 git diff 出现「莫名其妙的修改」，
    // 即使 component/url/params 都没动过。
    if (existingContent && !force) {
      const existingNormalized = stripTimestampLine(existingContent)
      const newNormalized = stripTimestampLine(content)
      if (existingNormalized === newNormalized) {
        console.log(`  ⏭  ${route.url} → ${path.relative(APP_DIR, outputPath)} (unchanged, skipped)`)
        continue
      }
    }

    // 创建目录
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })

    // 写入文件
    fs.writeFileSync(outputPath, content, 'utf-8')
    console.log(`  ✓ ${route.url} → ${path.relative(APP_DIR, outputPath)}`)
  }
}

/**
 * 剥离时间戳行（幂等比对用）。
 * `Generated at: <ISO timestamp>` 是每次运行时动态注入的，
 * 与业务字段（component / url / params）无关；比对时移除以避免误判为「内容变更」。
 */
const TIMESTAMP_LINE_RE = /^\/\/ Generated at: .*$/m
function stripTimestampLine(content: string): string {
  return content.replace(TIMESTAMP_LINE_RE, '')
}

// ─── 生成单个路由文件内容 ───────────────────────────────────────────

/**
 * 检测组件文件是否使用 `export default` 形式导出。
 * 若文件不存在或读取失败，按命名导出回退（与历史行为一致）。
 */
function detectDefaultExport(componentPath: string): boolean {
  const fullPath = path.join(PROJECT_ROOT, 'src', componentPath + '.tsx')
  if (!fs.existsSync(fullPath)) return false
  const source = fs.readFileSync(fullPath, 'utf-8')
  return /\bexport\s+default\s+/.test(source)
}

/**
 * 生成单个路由文件的内容。
 * - 无 page_props → 同步模板
 * - page_props 仅字面值 → 同步模板 + 字面 props
 * - page_props 含 { from: searchParams } → async server component + searchParams 解包
 *
 * [page-thin] T7-fix：根据组件文件是否使用 `export default` 选择 import 形式：
 * - 默认导出 → `import Foo from "..."`（无花括号）
 * - 命名导出 → `import { Foo } from "..."`
 * 文件缺失/读取失败时按命名导出回退（与历史行为一致；此时 collectRoutes 已 warn）。
 */
export function generateRouteFileContent(route: RouteEntry): string {
  const componentName = route.exportName ?? extractComponentName(route.component)
  const header = AUTO_GENERATED_HEADER.replace('{domain}', route.domainId).replace(
    '{timestamp}',
    new Date().toISOString(),
  )
  const usesDefaultExport = detectDefaultExport(route.component)
  const imports = usesDefaultExport
    ? `import ${componentName} from "@/${route.component}"\n`
    : `import { ${componentName} } from "@/${route.component}"\n`

  const pageProps = route.pageProps
  const hasPageProps = pageProps && Object.keys(pageProps).length > 0

  // page_props 分支
  if (hasPageProps) {
    const entries = Object.entries(pageProps)
    const needsSearchParams = entries.some(
      ([, value]) =>
        typeof value === 'object' &&
        value !== null &&
        (value as { from?: string }).from === 'searchParams',
    )

    const propsBlock = entries
      .map(([key, value]) => {
        if (
          typeof value === 'object' &&
          value !== null &&
          (value as { from?: string }).from === 'searchParams'
        ) {
          return `      ${key}={sp.${(value as { key: string }).key}}`
        }
        return `      ${key}={${JSON.stringify(value)}}`
      })
      .join('\n')

    if (needsSearchParams) {
      const body = `export default async function ${componentName}Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  return (
    <${componentName}
${propsBlock}
    />
  )
}
`
      return header + imports + body
    }

    const body = `export default function ${componentName}Page() {
  return (
    <${componentName}
${propsBlock}
    />
  )
}
`
    return header + imports + body
  }

  // 默认同步模板（保留原 params 逻辑）
  const paramsProp = route.params ? JSON.stringify(route.params, null, 2) : '{}'
  const body = route.params
    ? `export default function ${componentName}Page() {
  return <${componentName} params={${paramsProp}} />
}
`
    : `export default function ${componentName}Page() {
  return <${componentName} />
}
`
  return header + imports + body
}

// ─── URL 转文件路径 ─────────────────────────────────────────────────

/**
 * 将 URL 路径转换为文件路径
 * @param url - URL 路径
 * @returns 文件路径
 */
function urlToFilePath(url: string): string {
  // 去掉开头的 /，转换为文件路径
  const relativePath = url.slice(1)

  // 处理动态路由 [id] 等
  const filePath = relativePath.replace(/:([^/]+)/g, '[$1]')

  return path.join(APP_DIR, filePath, 'page.tsx')
}

// ─── 提取组件名 ─────────────────────────────────────────────────────

/**
 * 从组件路径中提取组件名称（kebab-case → PascalCase）。
 * timebox 域用 kebab 文件名 + PascalCase 导出；已 PascalCase 的名字（无 '-'）不受影响。
 * 缩写（如 OKRWorkspace）需 manifest 显式声明 export_name 覆盖。
 */
export function extractComponentName(componentPath: string): string {
  const parts = componentPath.split('/')
  const fileName = parts[parts.length - 1].replace(/\.tsx?$/, '')
  return fileName
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('')
}

// ─── 清理孤立路由 ───────────────────────────────────────────────────

/**
 * 清理孤立的自动生成路由文件
 */
async function cleanOrphanedRoutes(): Promise<void> {
  console.log('🧹 Cleaning orphaned routes...')

  const cleaned: string[] = []
  const appFiles = getAllRouteFiles(APP_DIR)

  for (const file of appFiles) {
    const content = fs.readFileSync(file, 'utf-8')

    if (content.includes('Auto-generated from domains/')) {
      const domainMatch = content.match(/Auto-generated from domains\/([^/]+)/)
      if (domainMatch) {
        const domain = domainMatch[1]
        const domainPath = path.join(DOMAINS_DIR, domain)

        if (!fs.existsSync(domainPath)) {
          fs.unlinkSync(file)
          cleaned.push(path.relative(APP_DIR, file))
          console.log(`  ✓ Removed: ${path.relative(APP_DIR, file)}`)
        }
      }
    }
  }

  if (cleaned.length === 0) {
    console.log('  ℹ️  No orphaned routes found')
  }
}

// ─── 获取所有路由文件 ───────────────────────────────────────────────

function getAllRouteFiles(dir: string, files: string[] = []): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      getAllRouteFiles(fullPath, files)
    } else if (entry.name === 'page.tsx') {
      files.push(fullPath)
    }
  }

  return files
}

// ─── 运行 ─────────────────────────────────────────────────────────────

// 仅直接运行时执行（测试 import 时不触发 main）
const invokedAsScript = process.argv[1]
  ? fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
  : false
if (invokedAsScript) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
