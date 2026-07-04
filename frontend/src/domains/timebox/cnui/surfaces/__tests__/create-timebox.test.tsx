/**
 * @file create-timebox.test.tsx
 * @brief [023.04] T2 + T-eng-10 CreateTimebox CNUI surface 渲染测试
 *
 * 守护 4 个行为分支：
 * 1. ArchetypePicker 出现在「活动原型」label 之下
 * 2. 两条 draft 时间互不重叠 → 提交按钮 enabled
 * 3. 两条 draft 时间重叠 → 提交按钮 disabled + 红字冲突提示出现
 * 4. [T-eng-3] page-aware conflict：冲突来自另一页 → 红字提示含「第 N 页」
 *
 * ArchetypePicker 通过 vi.mock 拦截 getArchetypes server action（避免依赖 DB）。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

import { CreateTimebox } from '../CreateTimebox'

// [023.04] 拦截 server action（与 ArchetypePicker 自测保持一致）
vi.mock('@/app/actions/activity-archetype', () => ({
  getArchetypes: vi.fn(),
}))

import { getArchetypes } from '@/app/actions/activity-archetype'

const mockGetArchetypes = vi.mocked(getArchetypes)

const mockArchetype = {
  id: 'a1',
  l2Name: '深度专注',
  l1Category: '工作',
  isSystem: true,
  energyCost: { physical: 2, mental: 9, emotional: 3, creative: 4 },
}

beforeEach(() => {
  mockGetArchetypes.mockReset()
  // 默认返回 1 条 archetype，下拉打开后可见
  mockGetArchetypes.mockResolvedValue({
    success: true,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: [mockArchetype],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)
})

/** 构造一条 draft（同日，时间不重叠） */
function makeDraft(overrides: Partial<{
  id: string
  title: string
  startTime: string
  endTime: string
}> = {}) {
  return {
    id: 'd1',
    title: '早会',
    startTime: '2026-07-10T09:00:00+08:00',
    endTime: '2026-07-10T10:00:00+08:00',
    ...overrides,
  }
}

describe('[023.04] T2 <CreateTimebox> 渲染稳定性', () => {
  it('case 1：ArchetypePicker 出现在「活动原型」label 之下（未选态 → 「选择」按钮）', async () => {
    render(
      <CreateTimebox
        surfaceType="createTimebox"
        dataModel={{ items: [makeDraft()] }}
        onDataChange={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )
    // label 出现
    expect(screen.getByText('活动原型')).toBeInTheDocument()
    // ArchetypePicker「选择」按钮在「未选择」态出现（getArchetypes effect 落幕后）
    const chooseBtn = await screen.findByLabelText('选择活动原型')
    expect(chooseBtn).toBeInTheDocument()
  })

  it('case 2：两条 draft 时间不重叠 → 提交按钮 enabled', () => {
    render(
      <CreateTimebox
        surfaceType="createTimebox"
        dataModel={{
          items: [
            makeDraft({ id: 'd1', title: '早会', startTime: '2026-07-10T09:00:00+08:00', endTime: '2026-07-10T10:00:00+08:00' }),
            makeDraft({ id: 'd2', title: '下午会', startTime: '2026-07-10T14:00:00+08:00', endTime: '2026-07-10T15:00:00+08:00' }),
          ],
        }}
        onDataChange={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )
    const submit = screen.getByText('提交全部').closest('button') as HTMLButtonElement
    expect(submit.disabled).toBe(false)
    // 红字冲突提示不应出现
    expect(screen.queryByText(/同日时间盒冲突/)).not.toBeInTheDocument()
  })

  it('case 3：两条 draft 时间重叠 → 提交按钮 disabled + 红字冲突提示', () => {
    render(
      <CreateTimebox
        surfaceType="createTimebox"
        dataModel={{
          items: [
            makeDraft({ id: 'd1', title: '早会', startTime: '2026-07-10T09:00:00+08:00', endTime: '2026-07-10T10:30:00+08:00' }),
            makeDraft({ id: 'd2', title: '晨会', startTime: '2026-07-10T10:00:00+08:00', endTime: '2026-07-10T11:00:00+08:00' }),
          ],
        }}
        onDataChange={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )
    const submit = screen.getByText('提交全部').closest('button') as HTMLButtonElement
    expect(submit.disabled).toBe(true)
    // 红字冲突提示（text-error class）
    const warn = screen.getByText(/同日时间盒冲突/)
    expect(warn).toBeInTheDocument()
    expect(warn.className).toMatch(/text-error/)
    expect(warn.textContent).toMatch(/早会/)
    expect(warn.textContent).toMatch(/晨会/)
  })

  it('case 4 [T-eng-3]：冲突来自另一页 → 红字提示含「第 N 页」反向指 page 索引', () => {
    // 当前 page=0（"早会"），冲突的另一页 page=2（"晚自习"）。
    // 期望红字：「同日时间盒冲突：晚自习(第 3 页)」
    render(
      <CreateTimebox
        surfaceType="createTimebox"
        dataModel={{
          items: [
            // page 0 — 当前
            makeDraft({ id: 'd1', title: '早会', startTime: '2026-07-10T09:00:00+08:00', endTime: '2026-07-10T10:30:00+08:00' }),
            // page 1 — 不冲突
            makeDraft({ id: 'd2', title: '午餐', startTime: '2026-07-10T12:00:00+08:00', endTime: '2026-07-10T13:00:00+08:00' }),
            // page 2 — 跟 page 0 时间重叠
            makeDraft({ id: 'd3', title: '晚自习', startTime: '2026-07-10T10:00:00+08:00', endTime: '2026-07-10T11:00:00+08:00' }),
          ],
        }}
        onDataChange={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )
    const submit = screen.getByText('提交全部').closest('button') as HTMLButtonElement
    expect(submit.disabled).toBe(true)
    const warn = screen.getByText(/同日时间盒冲突/)
    expect(warn).toBeInTheDocument()
    // 当前页 title（"早会"）不附加页码 — 它就是用户当前看的页
    // 另一页 title（"晚自习"）必须显示「第 3 页」
    expect(warn.textContent).toMatch(/晚自习\(第 3 页\)/)
    // 当前页不应带页码（避免冗余）
    expect(warn.textContent).not.toMatch(/早会\(第 1 页\)/)
  })
})
