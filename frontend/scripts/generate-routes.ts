#!/usr/bin/env tsx
/**
 * Domain 路由生成脚本
 *
 * 从所有 Domain 的 manifest.yaml 读取 view_routes 配置，
 * 自动生成 Next.js App Router 所需的路由文件到 app/ 目录。
 *
 * 用法：
 *   npm run generate:routes           # 生成所有路由
 *   npm run generate:routes --force   # 强制覆盖已存在文件
 *   npm run generate:routes --clean   # 清理孤立路由
 *   npm run generate:routes --watch   # 监听模式（未实现）
 */

import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import * as yaml from 'js-yaml'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ─── 类型定义 ────────────────────────────────────────────────────────

interface ViewRouteConfig {
  component: string
  url?: string
  params?: Record<string, unknown>
}

interface Manifest {
  domainId: string
  view_routes?: Record<string, ViewRouteConfig>
}

interface RouteEntry {
  domainId: string
  action: string
  component: string
  url: string
  params?: Record<string, unknown>
}

interface GenerateOptions {
  force?: boolean
  clean?: boolean
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

function parseArgs(args: string[]): string[] {
  return args
}

// ─── 收集路由配置 ───────────────────────────────────────────────────

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

async function validateRoutes(routes: RouteEntry[]): Promise<void> {
  const errors: string[] = []
  const warnings: string[] = []
  const urlMap = new Map<string, RouteEntry>()

  for (const route of routes) {
    // 验证 URL 格式
    if (!route.url.startsWith('/')) {
      errors.push(`${route.domainId}.${route.action}: url must start with '/'`)
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

    // 创建目录
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })

    // 写入文件
    fs.writeFileSync(outputPath, content, 'utf-8')
    console.log(`  ✓ ${route.url} → ${path.relative(APP_DIR, outputPath)}`)
  }
}

// ─── 生成单个路由文件内容 ───────────────────────────────────────────

function generateRouteFileContent(route: RouteEntry): string {
  const componentName = extractComponentName(route.component)
  const paramsProp = route.params ? JSON.stringify(route.params, null, 2) : '{}'

  const header = AUTO_GENERATED_HEADER
    .replace('{domain}', route.domainId)
    .replace('{timestamp}', new Date().toISOString())

  const imports = `import { ${componentName} } from "@/${route.component}"\n`

  const body = `export default function ${componentName}Page() {
  return <${componentName} ${Object.keys(route.params || {}).length > 0 ? `params={${paramsProp}}` : ''} />
}
`

  return header + imports + body
}

// ─── URL 转文件路径 ─────────────────────────────────────────────────

function urlToFilePath(url: string): string {
  // 去掉开头的 /，转换为文件路径
  const relativePath = url.slice(1)

  // 处理动态路由 [id] 等
  const filePath = relativePath.replace(/:([^/]+)/g, '[$1]')

  return path.join(APP_DIR, filePath, 'page.tsx')
}

// ─── 提取组件名 ─────────────────────────────────────────────────────

function extractComponentName(componentPath: string): string {
  const parts = componentPath.split('/')
  const fileName = parts[parts.length - 1]
  return fileName.replace(/\.tsx?$/, '')
}

// ─── 清理孤立路由 ───────────────────────────────────────────────────

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

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
