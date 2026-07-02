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
 * 例外白名单：空。[022.01] Phase 1 退役 createCycle 旧例外——
 * createCycle 已改走 executeIntent，不再需要直写豁免。
 */
const ALLOWED_DIRECT_WRITES: Array<{ file: string; method: string; reason: string }> = []

/**
 * 剥离块注释 + 行注释，避免 JSDoc 示例方法名（如「ContentField → repo.updateFields」）
 * 中的示例误判为真实调用。顺序很重要：先剥块注释，再剥行注释。
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n')
}

describe('[022] OKR 写入口守卫（action 层无 repo 直写）', () => {
  for (const f of FILES) {
    it(`app/actions/${f} 无 .save/.updateProgress/.updateFields 直写`, () => {
      const src = readFileSync(resolve(__dirname, '../../../app/actions', f), 'utf8')
      const code = stripComments(src)

      // allow-list 为空，无需剥离
      expect(code).not.toMatch(/\.(save|updateProgress|updateFields)\s*\(/)
    })

    // [022.01] 新增：.insert(s.cycles) 拦截（精准拦截 findOrCreateCycle 类直写）
    it(`app/actions/${f} 无 .insert(s.cycles) 直写`, () => {
      const src = readFileSync(resolve(__dirname, '../../../app/actions', f), 'utf8')
      const code = stripComments(src)
      expect(code).not.toMatch(/\.insert\(\s*s\.cycles\s*\)/)
    })
  }
})
