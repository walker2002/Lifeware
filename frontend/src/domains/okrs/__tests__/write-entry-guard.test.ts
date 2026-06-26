/** @file write-entry-guard.test.ts
 * @brief [022] 1B-T14: OKR 写入口 grep 守卫测试 —— action 层无 repo 直写
 *
 * 验证 okr.ts / okr-import.ts 不直接调用 GenericRepo 的
 * .save / .updateProgress / .updateFields 方法，
 * 确保所有写路径都通过 mutation-service。
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const FILES = ['okr.ts', 'okr-import.ts']

/**
 * 例外白名单：仅限单行 upsert 且无跨表副作用的写操作
 * - createCycle: Cycle 自然键 upsert（userId+periodStart+periodEnd），
 *   无 KR recompute、无 event fan-out
 */
const ALLOWED_DIRECT_WRITES: Array<{ file: string; method: string; reason: string }> = [
  { file: 'okr.ts', method: 'createCycle', reason: 'Cycle 单行 upsert，无跨表副作用' },
]

describe('[022] OKR 写入口守卫（action 层无 repo 直写）', () => {
  for (const f of FILES) {
    it(`app/actions/${f} 无 .save/.updateProgress/.updateFields 直写`, () => {
      const src = readFileSync(resolve(__dirname, '../../../app/actions', f), 'utf8')

      // [Review fix 2026-06-26] 先剥离 /* ... */ 块注释，再过滤 // 行注释，
      // 避免 JSDoc 多行块注释（如「ContentField → repo.updateFields」示例）
      // 中的示例方法名误判为真实调用。顺序很重要：先剥块注释，再剥行注释。
      const code = src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .filter((l) => !l.trim().startsWith('//'))
        .join('\n')

      // 识别 allow-list 中的函数体内的 .save 调用（其他写路径仍必须走 mutation-service）
      const allowsForFile = ALLOWED_DIRECT_WRITES.filter((a) => a.file === f)
      const codeWithoutAllows = allowsForFile.reduce((acc, allow) => {
        // 粗略地从对应函数体内删除 .save 调用（基于函数签名识别）
        const re = new RegExp(
          `(export\\s+async\\s+function\\s+${allow.method}[\\s\\S]*?)(\\.(save|updateProgress|updateFields)\\s*\\()`,
          'g',
        )
        return acc.replace(re, '$1/* allow-listed: ' + allow.reason + ' */(')
      }, code)

      expect(codeWithoutAllows).not.toMatch(/\.(save|updateProgress|updateFields)\s*\(/)
    })
  }
})
