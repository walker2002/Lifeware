#!/usr/bin/env npx tsx
/**
 * @file adopt-gstack-design
 * @brief gstack→superpowers 衔接工具 — 把 /office-hours 最新 design doc 拷入 docs/superpowers/specs/
 *
 * @usage npx tsx scripts/adopt-gstack-design.ts <topic> [--force] [--dry-run] [--list]
 * @usage npm run adopt:design -- <topic> [--force] [--dry-run] [--list]
 * @example npm run adopt:design -- rules-three-tier
 *
 * 背景：
 *   gstack /office-hours 把 design doc 写到 ~/.gstack/projects/<slug>/（机器本地、git 之外）。
 *   superpowers /writing-plans 从 docs/superpowers/specs/ 读 design doc。
 *   两套工具产出物落点不同，本脚本做桥接：取最新 office-hours design doc
 *   → 按superpowers 命名规范改名 → 拷到 specs/，作为 git 跟踪的 single source of truth。
 *
 * 命名转换：
 *   源:   ~/.gstack/projects/<slug>/<user>-<branch>-design-<YYYYMMDD-HHMMSS>.md
 *   目标: docs/superpowers/specs/<YYYY-MM-DD>-<topic>-design.md
 *   topic 必须由调用者传入（office-hours 标题常为中文，无法自动 slugify）。
 *
 * 设计选择（cp 而非 patch gstack）：
 *   不修改 gstack 第三方 SKILL.md（auto-generated，升级即覆盖），改用本脚本手动触发。
 *   gstack 内部 /plan-eng-review、/autoplan 仍从 ~/.gstack/ 原路径发现 design doc，互不影响。
 */

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

// ─── 路径常量 ────────────────────────────────────────────────────

const FRONTEND_DIR = path.resolve(__dirname, '..')
const PROJECT_ROOT = path.resolve(FRONTEND_DIR, '..') // lifeware/
const SPECS_DIR = path.join(PROJECT_ROOT, 'docs', 'superpowers', 'specs')
const GSTACK_PROJECTS_DIR = path.join(os.homedir(), '.gstack', 'projects')

// office-hours design doc 文件名正则：<user>-<branch>-design-<YYYYMMDD>-<HHMMSS>.md
const DESIGN_FILE_RE = /-design-\d{8}-\d{6}\.md$/

// ─── 参数解析 ────────────────────────────────────────────────────

interface Args {
  topic: string | null
  force: boolean
  dryRun: boolean
  list: boolean
}

function parseArgs(argv: string[]): Args {
  const flags = new Set(argv.filter((a) => a.startsWith('--')))
  const positional = argv.filter((a) => !a.startsWith('--'))
  return {
    topic: positional[0] ?? null,
    force: flags.has('--force'),
    dryRun: flags.has('--dry-run'),
    list: flags.has('--list'),
  }
}

// ─── 扫描 office-hours design doc ────────────────────────────────

interface DesignDoc {
  file: string
  mtime: number
}

/**
 * 扫描 ~/.gstack/projects/<*>/ 下的 design doc，按修改时间降序返回。
 * 跨项目扫描 —— 取最新并打印源路径供调用者确认，避免误拷。
 */
function findDesignDocs(): DesignDoc[] {
  if (!fs.existsSync(GSTACK_PROJECTS_DIR)) return []
  const results: DesignDoc[] = []
  for (const proj of fs.readdirSync(GSTACK_PROJECTS_DIR)) {
    const projDir = path.join(GSTACK_PROJECTS_DIR, proj)
    if (!fs.statSync(projDir).isDirectory()) continue
    for (const f of fs.readdirSync(projDir)) {
      if (!DESIGN_FILE_RE.test(f)) continue
      const full = path.join(projDir, f)
      results.push({ file: full, mtime: fs.statSync(full).mtimeMs })
    }
  }
  return results.sort((a, b) => b.mtime - a.mtime)
}

/**
 * 从 office-hours 文件名提取日期：
 * walker-main-design-20260620-234549.md → 2026-06-20
 */
function extractDate(filename: string): string | null {
  const m = filename.match(/design-(\d{4})(\d{2})(\d{2})-\d{6}\.md$/)
  if (!m) return null
  return `${m[1]}-${m[2]}-${m[3]}`
}

// ─── 主流程 ──────────────────────────────────────────────────────

function printUsage(): void {
  console.error('用法: npm run adopt:design -- <topic> [--force] [--dry-run] [--list]')
  console.error('例:   npm run adopt:design -- rules-three-tier')
}

function main(): void {
  const args = parseArgs(process.argv.slice(2))
  const docs = findDesignDocs()

  if (args.list) {
    console.log('office-hours design docs（按修改时间降序）:')
    if (docs.length === 0) {
      console.log('  （无 — 先跑 /office-hours 产生 design doc）')
    }
    for (const d of docs) {
      const ts = new Date(d.mtime).toISOString().replace('T', ' ').slice(0, 19)
      console.log(`  ${ts}  ${d.file}`)
    }
    return
  }

  if (!args.topic) {
    console.error('错误: 缺少 <topic> 参数\n')
    printUsage()
    process.exit(1)
  }

  if (docs.length === 0) {
    console.error(`错误: 未找到 office-hours design doc（扫描了 ${GSTACK_PROJECTS_DIR}）`)
    console.error('先跑 /office-hours 产生 design doc。')
    process.exit(1)
  }

  const source = docs[0].file
  const sourceName = path.basename(source)
  const date = extractDate(sourceName) ?? new Date().toISOString().slice(0, 10)
  const target = path.join(SPECS_DIR, `${date}-${args.topic}-design.md`)

  console.log('源:  ', source)
  console.log('目标:', target)
  console.log(`  日期=${date}  topic=${args.topic}`)

  if (!args.force && docs.length > 1) {
    console.log(`\n注意: 找到 ${docs.length} 个 design doc，已取最新。若非所愿，用 --list 查看，或重新跑 /office-hours。`)
  }

  if (fs.existsSync(target) && !args.force) {
    console.error('\n错误: 目标已存在。加 --force 覆盖，或换一个 topic。')
    process.exit(1)
  }

  if (args.dryRun) {
    console.log('\n[--dry-run] 未实际拷贝。')
    return
  }

  fs.mkdirSync(SPECS_DIR, { recursive: true })
  fs.copyFileSync(source, target)
  console.log('\n✓ 已拷贝。接下来可用 /superpowers:writing-plans 读此 spec 继续计划。')
}

main()
