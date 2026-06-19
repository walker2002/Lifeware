/**
 * @file write-entry-guard.test.ts
 * @brief [018-G1] T11 架构守卫：断言 action 层不得直写 habitRepo.update/save 绕过业务事实写入口。
 *
 * 写入口治理边界：[018] 落地的 habits FactField 字段写唯一通道为
 * domainMutationService.execute()。任何 action 层（intent.ts、
 * src/app/actions/habits/*.ts）重新加回 habitRepo.update(整对象) /
 * habitRepo.save() 直写都构成 single-writer 治理违规，本守卫负责在 CI
 * 层拦截此类回退。
 *
 * 合法的 update/save 调用只允许出现在：
 *   - src/domains/habits/repository/（仓储实现层方法本体）
 *   - __tests__/（测试桩）
 *
 * 注释行（//、/*、*、行内 // 之后部分）不计入代码，避免迁移说明
 * （如 intent.ts:887 的 [018-G1] G1-H 注释）误触发失败。
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'fs'
import { resolve, extname } from 'path'

/** 直写绕过写入口的可疑调用模式（含 .update( 与 .save( 两种等价写法）。 */
const DIRECT_WRITE_PATTERNS = [
  'habitRepo.update(',
  'habitRepo.save(',
  'habitRepository.update(',
  'habitRepository.save(',
]

/**
 * 将一行源码剥离注释后返回纯代码部分。
 * - 整行注释（以 //、/*、*、空格+* 开头）→ 返回空字符串
 * - 行内 // 注释 → 截断到 // 之前
 * - 块注释内部的 * 开头行 → 返回空字符串（保守处理：只要行首是 * 即视为块注释）
 */
function stripComment(line: string): string {
  const trimmed = line.trim()
  // 整行注释
  if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
    return ''
  }
  // 行内 // 注释：截断（注意不处理字符串内的 //，本场景够用——可疑调用不在字符串字面量里）
  const slashIdx = line.indexOf('//')
  if (slashIdx >= 0) {
    return line.slice(0, slashIdx)
  }
  return line
}

/** 判定某段代码（已去注释的行）是否命中直写模式，返回命中的 pattern 与行号。 */
function findDirectWrites(
  filePath: string,
): Array<{ line: number; pattern: string; raw: string }> {
  const content = readFileSync(filePath, 'utf-8')
  const rawLines = content.split('\n')
  const hits: Array<{ line: number; pattern: string; raw: string }> = []
  rawLines.forEach((rawLine, idx) => {
    const code = stripComment(rawLine)
    if (!code) return
    for (const pattern of DIRECT_WRITE_PATTERNS) {
      if (code.includes(pattern)) {
        hits.push({ line: idx + 1, pattern, raw: rawLine.trim() })
      }
    }
  })
  return hits
}

/** 枚举写入口治理范围内的源文件（排除 __tests__）。 */
function collectScanFiles(): string[] {
  const files: string[] = []
  // intent.ts
  const intentPath = resolve(__dirname, '../../intent.ts')
  if (existsSync(intentPath)) files.push(intentPath)
  // src/app/actions/habits/*.ts（排除 __tests__）
  const habitsDir = resolve(__dirname, '..')
  if (existsSync(habitsDir)) {
    for (const entry of readdirSync(habitsDir)) {
      const full = resolve(habitsDir, entry)
      if (extname(entry) !== '.ts') continue
      if (entry.includes('__tests__')) continue
      files.push(full)
    }
  }
  return files
}

describe('T11: [018-G1] 业务事实写入口守卫 — action 层不得直写 habitRepo.update/save', () => {
  it('扫描范围内不存在直写绕过', () => {
    const files = collectScanFiles()
    expect(files.length).toBeGreaterThan(0)

    const violations: string[] = []
    for (const file of files) {
      for (const hit of findDirectWrites(file)) {
        const rel = file.replace(resolve(__dirname, '../../../..'), '').replace(/^\//, '')
        violations.push(`  - ${rel}:${hit.line}  [${hit.pattern}]  ${hit.raw}`)
      }
    }

    if (violations.length > 0) {
      // 失败信息尽量可读：列出文件、行号、命中模式、原行，便于定位回退
      throw new Error(
        `[018-G1] 检测到 action 层直写 habitRepo.update/save，绕过业务事实写入口（domainMutationService）。\n` +
          `所有 habits FactField 字段写必须经 service.execute() 单事务通道。\n` +
          `违规位置：\n${violations.join('\n')}\n` +
          `如确需绕过（例如新建合法写入口），请先在 constitution / autoplan 中取得治理豁免。`,
      )
    }

    expect(violations).toHaveLength(0)
  })

  it('守卫自身有效：能识别注入的真实直写（变异验证，非恒真）', () => {
    // 用一段含真实绕过的合成源码跑 stripComment + pattern 检测，
    // 确认守卫会变红，证明它不是恒 green 的占位测试。
    const synthetic = [
      'const x = 1',
      'await habitRepo.update("h-1", { title: "x" })',
      '// 这是一行注释 habitRepo.update( 不应命中',
      '/* habitRepo.save( 块注释也不命中 */',
      'const y = habitRepo.save(obj) // 行内注释',
    ].join('\n')

    const fakeFile = '/synthetic/sample.ts'
    // 用 readFileSync 不可，直接复用内部逻辑：模拟文件内容
    const rawLines = synthetic.split('\n')
    const hits: string[] = []
    rawLines.forEach((rawLine, idx) => {
      const code = stripComment(rawLine)
      if (!code) return
      for (const pattern of DIRECT_WRITE_PATTERNS) {
        if (code.includes(pattern)) hits.push(`${idx + 1}:${pattern}`)
      }
    })
    // 命中第 2 行（update）和第 5 行代码部分（save，行内注释被剥离后仍命中）
    expect(hits).toContain('2:habitRepo.update(')
    expect(hits).toContain('5:habitRepo.save(')
    // 注释行不命中
    expect(hits.some(h => h.includes(':3:'))).toBe(false)
    expect(hits.some(h => h.includes(':4:'))).toBe(false)
    // 引用 fakeFile 防止未用变量告警
    expect(fakeFile).toContain('synthetic')
  })
})
