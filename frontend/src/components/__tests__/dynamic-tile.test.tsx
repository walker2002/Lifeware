// DynamicTile 组件测试

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DynamicTile } from '@/components/dynamic-tile'
import type { ActionCandidate } from '@/usom/types/process'
import type { USOM_ID } from '@/usom/types/primitives'

// ─── 测试数据工厂 ─────────────────────────────────────────────

function createMockCandidate(
  overrides?: Partial<ActionCandidate>,
): ActionCandidate {
  return {
    id: 'action-001' as USOM_ID,
    sourceObjectId: 'tb-001' as USOM_ID,
    sourceObjectType: 'timebox',
    label: '进行中: 专注工作',
    actionType: 'start_timebox',
    category: 'tile',
    weight: 90,
    ...overrides,
  }
}

// ─── 测试用例 ─────────────────────────────────────────────────

describe('DynamicTile', () => {
  it('渲染候选项的 label', () => {
    const candidates = [
      createMockCandidate({ id: 'a1' as USOM_ID, label: '进行中: 专注工作' }),
    ]

    render(<DynamicTile candidates={candidates} />)

    expect(screen.getByText('进行中: 专注工作')).toBeDefined()
  })

  it('渲染候选项的 subLabel（当存在时）', () => {
    const candidates = [
      createMockCandidate({
        id: 'a1' as USOM_ID,
        label: '即将开始: 午休',
        subLabel: '还剩 5 分钟',
      }),
    ]

    render(<DynamicTile candidates={candidates} />)

    expect(screen.getByText('即将开始: 午休')).toBeDefined()
    expect(screen.getByText('还剩 5 分钟')).toBeDefined()
  })

  it('不渲染 subLabel（当不存在时）', () => {
    const candidates = [
      createMockCandidate({
        id: 'a1' as USOM_ID,
        label: '进行中: 工作',
        subLabel: undefined,
      }),
    ]

    const { container } = render(<DynamicTile candidates={candidates} />)

    // 只有一个文本节点（label），没有 subLabel 的 text-xs 元素
    const subLabelElements = container.querySelectorAll('.text-xs')
    expect(subLabelElements).toHaveLength(0)
  })

  it('空数组时不渲染任何内容', () => {
    const { container } = render(<DynamicTile candidates={[]} />)

    expect(container.innerHTML).toBe('')
  })

  it('渲染多个候选项', () => {
    const candidates = [
      createMockCandidate({ id: 'a1' as USOM_ID, label: '进行中: 工作' }),
      createMockCandidate({ id: 'a2' as USOM_ID, label: '即将开始: 午休' }),
      createMockCandidate({ id: 'a3' as USOM_ID, label: '建议: 安排休息' }),
    ]

    render(<DynamicTile candidates={candidates} />)

    expect(screen.getByText('进行中: 工作')).toBeDefined()
    expect(screen.getByText('即将开始: 午休')).toBeDefined()
    expect(screen.getByText('建议: 安排休息')).toBeDefined()
  })

  it('每个候选项渲染为 button 元素', () => {
    const candidates = [
      createMockCandidate({ id: 'a1' as USOM_ID, label: '第一个' }),
      createMockCandidate({ id: 'a2' as USOM_ID, label: '第二个' }),
    ]

    render(<DynamicTile candidates={candidates} />)

    const buttons = screen.getAllByRole('listitem')
    expect(buttons).toHaveLength(2)
  })
})
