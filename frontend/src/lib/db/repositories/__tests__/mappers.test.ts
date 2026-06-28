/**
 * @file mappers.test
 * @brief USOM ↔ DB mapper 双向映射单元测试
 * @details [024] G2 KeyResult.confidence 字段双向映射
 */

import { describe, it, expect } from 'vitest'
import { keyResultRowToUSOM, keyResultUSOMToRow } from '../mappers'

// ── 极简 row fixture：仅覆盖 mapper 关心的字段，其它用 any 兜底 ─────────
const baseRow = {
  id: '11111111-1111-1111-1111-111111111111',
  userId: 'user-1',
  schemaVersion: 1,
  status: 'active',
  objectiveId: '22222222-2222-2222-2222-222222222222',
  title: 'demo KR',
  description: null,
  targetValue: '100',
  currentValue: '0',
  unit: '%',
  progressRate: '0',
  dueDate: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  discardedAt: null,
  completedAt: null,
  archivedAt: null,
}

describe('[024] KeyResult mapper confidence', () => {
  it('row→USOM 应映射 confidence', () => {
    const row = { ...baseRow, confidence: 80 }
    const u = keyResultRowToUSOM(row as any)
    expect(u.confidence).toBe(80)
  })

  it('USOM→row 应写入 confidence', () => {
    const u = {
      ...baseRow,
      confidence: 30,
    } as any
    const r = keyResultUSOMToRow(u, 'user-1')
    expect(r.confidence).toBe(30)
  })

  it('confidence 缺省时默认 50', () => {
    // 不含 confidence 字段 → 走 fallback 分支
    const row = { ...baseRow } as any
    delete row.confidence
    expect(keyResultRowToUSOM(row).confidence).toBe(50)
  })
})