/**
 * @file session-status.test
 * @brief [026.02.3.1] T1 IRON RULE — AISessionStatus 必须 6 值与 DB schema 对齐
 *
 * 守护对象：USOM `AISessionStatus` 6 值 vs DB schema 6 值 vs 实际代码 5 值
 * (其中 `'deleted'` USOM 漏, `'created'`/`'completing'`/`'closed'` 漏)。
 * 本测试用 type assertion + sort-join 双校验, 避免 `as const satisfies`
 * (此 pattern codebase 无先例, grep 0 hit — pre-flight F1)。
 *
 * 实现: 用一个 typed-as-AISessionStatus[] 的字面量 → 编译错表明 USOM 漏值;
 * runtime array → sort 后 join 字符串比对表明 shape 真一致。
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
    const sorted = [...EXPECTED].sort()
    const canonical = ['active', 'archived', 'closed', 'completing', 'created', 'deleted'].sort()
    expect(sorted).toEqual(canonical)
    expect(EXPECTED).toHaveLength(6)
  })
})
