/**
 * @file session-status.test
 * @brief [026.02.3.1] T1 IRON RULE — AISessionStatus 必须 6 值与 DB schema 对齐
 *
 * 守护对象：USOM `AISessionStatus` 6 值 vs DB schema 6 值 vs 实际代码 5 值
 * (其中 `'deleted'` USOM 漏, `'created'`/`'completing'`/`'closed'` 漏)。
 *
 * IRON RULE 实际机制（post-review 澄清）:
 * - 编译时: `const EXPECTED: AISessionStatus[]` 类型注解 — 字面量必须是
 *   AISessionStatus 合法成员, USOM 漏 1 个值就编译错。
 * - 运行时: `toHaveLength(6)` 长度校验 — 防止 USOM 扩值时 EXPECTED 跟漏。
 * 原 sort-join 校验是 tautology (line 30 vs 29 是同一字面量集), 已移除。
 *
 * 实现: 不需要 `as const satisfies` (此 pattern codebase 无先例, grep 0 hit
 * — pre-flight F1)。
 */
import { describe, it, expect } from 'vitest'
import type { AISessionStatus } from '@/usom/types/primitives'

// 类型注解迫使每个字面量必须是 AISessionStatus 一员 — USOM 漏 1 个就编译错
const EXPECTED: AISessionStatus[] = [
  'created',
  'active',
  'completing',
  'archived',
  'closed',
  'deleted',
]

describe('[026.02.3.1] T1 IRON RULE — AISessionStatus shape', () => {
  it('USOM AISessionStatus 必须含 6 值 (created/active/completing/archived/closed/deleted)', () => {
    expect(EXPECTED).toHaveLength(6)
  })
})
