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

describe('[022] OKR 写入口守卫（action 层无 repo 直写）', () => {
  for (const f of FILES) {
    it(`app/actions/${f} 无 .save/.updateProgress/.updateFields 直写`, () => {
      const src = readFileSync(resolve(__dirname, '../../../app/actions', f), 'utf8')

      // 剔除注释行（避免注释里的示例被误判）
      const code = src
        .split('\n')
        .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
        .join('\n')

      expect(code).not.toMatch(/\.(save|updateProgress|updateFields)\s*\(/)
    })
  }
})
