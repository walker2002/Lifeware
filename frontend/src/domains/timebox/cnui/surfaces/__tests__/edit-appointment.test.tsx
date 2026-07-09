/**
 * @file edit-appointment.test
 * @brief [026.01] 重写测试覆盖双视图 + 分页 + 删除集成 + archetype 透传
 */

import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EditAppointment } from '@/domains/timebox/cnui/surfaces/EditAppointment'
import type { AppointmentDraftFields } from '@/domains/timebox/cnui/surfaces/AppointmentFormFields'

const makeItem = (overrides: Partial<AppointmentDraftFields & { status: string }> = {}) => ({
  id: 'a-1',
  title: '看牙医',
  startTime: '2026-07-15T14:00:00Z',
  durationMin: 60,
  detail: null,
  people: [],
  status: 'scheduled',
  ...overrides,
})

describe('EditAppointment selecting mode', () => {
  it('renders list of items', () => {
    const items = [makeItem({ id: 'a-1' }), makeItem({ id: 'a-2', title: '约张三' })]
    render(<EditAppointment dataModel={{ items, mode: 'selecting' }} onDataChange={() => {}} onConfirm={() => {}} />)
    expect(screen.getByText('看牙医')).toBeInTheDocument()
    expect(screen.getByText('约张三')).toBeInTheDocument()
  })

  it('shows pagination when items > PAGE_SIZE', () => {
    const items = Array.from({ length: 12 }, (_, i) => makeItem({ id: `a-${i}`, title: `约定 ${i}` }))
    render(<EditAppointment dataModel={{ items, mode: 'selecting' }} onDataChange={() => {}} onConfirm={() => {}} />)
    expect(screen.getByText(/1\/3/)).toBeInTheDocument()
    expect(screen.getByText('下一页 ›')).toBeInTheDocument()
  })

  it('hides pagination when items <= PAGE_SIZE', () => {
    const items = Array.from({ length: 3 }, (_, i) => makeItem({ id: `a-${i}`, title: `约定 ${i}` }))
    render(<EditAppointment dataModel={{ items, mode: 'selecting' }} onDataChange={() => {}} onConfirm={() => {}} />)
    expect(screen.queryByText('下一页 ›')).toBeNull()
  })

  it('clicking 下一页 moves to next page', async () => {
    const items = Array.from({ length: 12 }, (_, i) => makeItem({ id: `a-${i}`, title: `约定 ${i}` }))
    render(<EditAppointment dataModel={{ items, mode: 'selecting' }} onDataChange={() => {}} onConfirm={() => {}} />)
    await userEvent.click(screen.getByText('下一页 ›'))
    expect(screen.getByText(/2\/3/)).toBeInTheDocument()
  })

  it('clicking item switches to editing mode', async () => {
    const onDataChange = vi.fn()
    const items = [makeItem({ id: 'a-1' })]
    render(<EditAppointment dataModel={{ items, mode: 'selecting' }} onDataChange={onDataChange} onConfirm={() => {}} />)
    await userEvent.click(screen.getByText('看牙医'))
    expect(screen.getByText(/编辑约定/)).toBeInTheDocument()
  })

  it('shows parseReason hint when provided', () => {
    const items = [makeItem({ id: 'a-1' })]
    render(<EditAppointment dataModel={{ items, mode: 'selecting', originalPrompt: '改成下午', parseReason: '未识别到具体时间' }} onDataChange={() => {}} onConfirm={() => {}} />)
    expect(screen.getByText(/未识别到具体时间/)).toBeInTheDocument()
  })

  it('hides originalPrompt banner in editing mode', () => {
    // [026.02.4] TD-022 #8: editing 视图不显示 originalPrompt banner（banner 只在 selecting 显示，用户首次进入时上下文）。
    // 修复：editing 视图已删除 banner block（line 84-88），现在用 status='scheduled' 合 AppointmentStatus 类型。
    const prefill = makeItem({ id: 'a-1', status: 'scheduled' })
    render(
      <EditAppointment
        surfaceType="editAppointment"
        dataModel={{
          items: [prefill],
          mode: 'editing',
          selectedId: 'a-1',
          prefill,
          originalPrompt: '把看牙医改到下午3点',
        }}
        onDataChange={() => {}}
        onConfirm={() => {}}
      />,
    )
    expect(screen.queryByText(/尝试匹配/)).not.toBeInTheDocument()
  })

  it('renders empty state when items is empty', () => {
    render(<EditAppointment dataModel={{ items: [], mode: 'selecting' }} onDataChange={() => {}} onConfirm={() => {}} />)
    expect(screen.getByText(/暂无计划/)).toBeInTheDocument()
  })
})

describe('EditAppointment editing mode', () => {
  it('renders AppointmentFormFields with prefill', () => {
    const prefill = { ...makeItem({ id: 'a-1' }), activityArchetypeId: 'arch-1' }
    render(<EditAppointment dataModel={{ items: [prefill], mode: 'editing', selectedId: 'a-1', prefill }} onDataChange={() => {}} onConfirm={() => {}} />)
    expect(screen.getByDisplayValue('看牙医')).toBeInTheDocument()
    expect(screen.getByText(/编辑约定/)).toBeInTheDocument()
  })

  it('shows 删除 button when status is scheduled', () => {
    const prefill = makeItem({ id: 'a-1', status: 'scheduled' })
    render(<EditAppointment dataModel={{ items: [prefill], mode: 'editing', selectedId: 'a-1', prefill }} onDataChange={() => {}} onConfirm={() => {}} />)
    expect(screen.getByRole('button', { name: '删除' })).toBeInTheDocument()
  })

  it('hides 删除 button when status is expired', () => {
    const prefill = makeItem({ id: 'a-1', status: 'expired' })
    render(<EditAppointment dataModel={{ items: [prefill], mode: 'editing', selectedId: 'a-1', prefill }} onDataChange={() => {}} onConfirm={() => {}} />)
    expect(screen.queryByRole('button', { name: '删除' })).toBeNull()
  })

  it('AlertDialog opens when 删除 clicked', async () => {
    const prefill = makeItem({ id: 'a-1', status: 'scheduled' })
    render(<EditAppointment dataModel={{ items: [prefill], mode: 'editing', selectedId: 'a-1', prefill }} onDataChange={() => {}} onConfirm={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: '删除' }))
    expect(screen.getByText(/确认删除约定/)).toBeInTheDocument()
  })

  it('confirming delete calls onConfirm with operation=delete', async () => {
    const onConfirm = vi.fn()
    const prefill = makeItem({ id: 'a-1', status: 'scheduled' })
    render(<EditAppointment dataModel={{ items: [prefill], mode: 'editing', selectedId: 'a-1', prefill }} onDataChange={() => {}} onConfirm={onConfirm} />)
    await userEvent.click(screen.getByRole('button', { name: '删除' }))
    await userEvent.click(screen.getByRole('button', { name: /确认/ }))
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ operation: 'delete' }))
  })

  it('点击 保存 calls onConfirm with operation=update', async () => {
    const onConfirm = vi.fn()
    const prefill = makeItem({ id: 'a-1', status: 'scheduled' })
    render(<EditAppointment dataModel={{ items: [prefill], mode: 'editing', selectedId: 'a-1', prefill }} onDataChange={() => {}} onConfirm={onConfirm} />)
    await userEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ operation: 'update' }))
  })

  it('点击 返回列表 switches back to selecting', async () => {
    const onDataChange = vi.fn()
    const prefill = makeItem({ id: 'a-1', status: 'scheduled' })
    const items = [makeItem({ id: 'a-1' }), makeItem({ id: 'a-2' })]
    render(<EditAppointment dataModel={{ items, mode: 'editing', selectedId: 'a-1', prefill }} onDataChange={onDataChange} onConfirm={() => {}} />)
    await userEvent.click(screen.getByText('返回列表'))
    expect(screen.getByText(/选择要修改的约定/)).toBeInTheDocument()
  })

  it('disables 保存 when title is empty', () => {
    const prefill = makeItem({ id: 'a-1', status: 'scheduled', title: '' })
    render(<EditAppointment dataModel={{ items: [prefill], mode: 'editing', selectedId: 'a-1', prefill }} onDataChange={() => {}} onConfirm={() => {}} />)
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled()
  })
})

describe('[026.02.3] handlers.ts todayAppointments shape integration', () => {
  // [026.02.3] 守卫：handlers.ts:268-274 todayAppointments mapper 必须包含 AppointmentDraftFields
  // 必填字段（people/detail/activityArchetypeId）。曾因只投射 5 字段导致 selecting → 编辑视图崩溃
  // (AppointmentFormFields.tsx:88 draft.people.join)。
  // 用真实 handler 投射形状构造 items 测试，确保数据契约不再漂移。
  it('selecting 模式点 item 进入 editing 时不抛错（people/detail/archetype 缺时不崩）', async () => {
    // 模拟 handlers.ts:268-274 todayAppointments — 故意只 5 字段（id/title/startTime/durationMin/status）
    // 模拟真实 bug：缺 people / detail / activityArchetypeId
    const realHandlerShape = {
      id: 'a-1',
      title: '看牙医',
      startTime: '2026-07-15T14:00:00Z',
      durationMin: 60,
      status: 'scheduled',
      // ⚠️ 缺 people / detail / activityArchetypeId — 与真实 handlers.ts 一致
    }
    render(<EditAppointment surfaceType="editAppointment" dataModel={{ items: [realHandlerShape], mode: 'selecting' }} onDataChange={() => {}} onConfirm={() => {}} />)
    // 不应抛错 — 进入 editing 视图，AppointmentFormFields.tsx:88 draft.people.join 安全
    await userEvent.click(screen.getByText('看牙医'))
    // 验证进入编辑视图 + people input 渲染（不再崩）
    expect(screen.getByText(/编辑约定/)).toBeInTheDocument()
    expect(screen.getByLabelText(/关系人/)).toBeInTheDocument()
  })
})

// [026.02.4] TD-022 #6 archetype clearing 3-state — surface type contract
// AppointmentDraftFields.activityArchetypeId: string | null | undefined
//   undefined = 不修改（picker 未触发）
//   null      = 显式清除（picker 清空语义 — appointment surface 把 undefined 转换为 null）
//   string    = 设置
describe('[026.02.4] TD-022 #6 archetype clearing 3-state type contract', () => {
  it('AppointmentDraftFields.activityArchetypeId accepts null (explicit clear)', () => {
    // 类型契约测试：null 是合法值
    const draft: AppointmentDraftFields = {
      id: 'a-1', title: 't', startTime: '2026-07-15T14:00:00Z', durationMin: 60, people: [],
      activityArchetypeId: null, // explicit clear
    }
    expect(draft.activityArchetypeId).toBeNull()
  })

  it('AppointmentDraftFields.activityArchetypeId accepts undefined (skip)', () => {
    const draft: AppointmentDraftFields = {
      id: 'a-1', title: 't', startTime: '2026-07-15T14:00:00Z', durationMin: 60, people: [],
      // 不设置字段 = undefined（skip）
    }
    expect(draft.activityArchetypeId).toBeUndefined()
  })

  it('AppointmentDraftFields.activityArchetypeId accepts string (set)', () => {
    const draft: AppointmentDraftFields = {
      id: 'a-1', title: 't', startTime: '2026-07-15T14:00:00Z', durationMin: 60, people: [],
      activityArchetypeId: 'arch-1',
    }
    expect(draft.activityArchetypeId).toBe('arch-1')
  })

  it('点击 保存 时 onConfirm 透传 selected.activityArchetypeId=null（显式清除语义）', async () => {
    // [026.02.4] TD-022 #6: 模拟 AppointmentFormFields picker 清除语义转换后
    // selected.activityArchetypeId === null 应原样透传到 onConfirm。
    const onConfirm = vi.fn()
    const prefill = { ...makeItem({ id: 'a-1', status: 'scheduled' }), activityArchetypeId: null as string | null }
    render(
      <EditAppointment
        surfaceType="editAppointment"
        dataModel={{ items: [prefill], mode: 'editing', selectedId: 'a-1', prefill }}
        onDataChange={() => {}}
        onConfirm={onConfirm}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        selected: expect.objectContaining({ activityArchetypeId: null }),
        operation: 'update',
      }),
    )
  })

  it('不修改 archetype 时 selected 透传 prefill 的活动原型值（undefined=skip）', async () => {
    // [026.02.4] TD-022 #6: picker 未触发时 selected.activityArchetypeId 保留原 prefill 值。
    // mapper 负责区分 null (clear) vs undefined (skip)。
    const onConfirm = vi.fn()
    const prefill = makeItem({ id: 'a-1', status: 'scheduled' })
    // prefill 默认 activityArchetypeId 未设置（undefined = skip）
    render(
      <EditAppointment
        surfaceType="editAppointment"
        dataModel={{ items: [prefill], mode: 'editing', selectedId: 'a-1', prefill }}
        onDataChange={() => {}}
        onConfirm={onConfirm}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: '保存' }))
    const callArg = onConfirm.mock.calls[0][0] as { selected: Record<string, unknown> }
    // 表面透传 prefill 原值——undefined 时键不在，mapper 跳过；若有值则原样透传
    expect(callArg.selected.activityArchetypeId).toBeUndefined()
  })

  it('保留 prefill 中已有的 archetypeId（picker 未触发时不变）', async () => {
    // [026.02.4] TD-022 #6: picker 未触发时 selected 保留原 prefill archetypeId
    const onConfirm = vi.fn()
    const prefill = { ...makeItem({ id: 'a-1', status: 'scheduled' }), activityArchetypeId: 'arch-1' as string | null }
    render(
      <EditAppointment
        surfaceType="editAppointment"
        dataModel={{ items: [prefill], mode: 'editing', selectedId: 'a-1', prefill }}
        onDataChange={() => {}}
        onConfirm={onConfirm}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: '保存' }))
    const callArg = onConfirm.mock.calls[0][0] as { selected: Record<string, unknown> }
    expect(callArg.selected.activityArchetypeId).toBe('arch-1')
  })
})