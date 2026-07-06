/**
 * @file archetype-picker 单测
 * @brief [023] A3.2 裸版/带盒版公共化：readOnly 行为 + Card 包裹 + M-1 fetch error UX
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ArchetypePicker } from '../archetype-picker'
import { ArchetypePickerCard } from '../archetype-picker-card'
import { getArchetypes, matchArchetypeForTitle } from '@/app/actions/activity-archetype'

vi.mock('@/app/actions/activity-archetype', () => ({
  getArchetypes: vi.fn(),
  matchArchetypeForTitle: vi.fn(),
}))

const mockGetArchetypes = vi.mocked(getArchetypes)
const mockMatchArchetype = vi.mocked(matchArchetypeForTitle)

const successData = [
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  { id: 'a1', l2Name: '深度专注', l1Category: '工作', isSystem: true, energyCost: { physical: 2, mental: 9, emotional: 3, creative: 4 } },
] as any

beforeEach(() => {
  mockGetArchetypes.mockReset()
  mockMatchArchetype.mockReset()
  mockGetArchetypes.mockResolvedValue({ success: true, data: successData })
})

describe('[023] A3.2 ArchetypePicker 裸版', () => {
  it('可写模式渲染「选择」按钮', async () => {
    render(<ArchetypePicker value={undefined} onChange={() => {}} />)
    // 等 getArchetypes effect 落幕
    expect(await screen.findByText('选择')).toBeInTheDocument()
  })

  it('readOnly 模式不渲染「选择/更换」按钮', async () => {
    render(<ArchetypePicker value="a1" readOnly onChange={() => {}} />)
    await screen.findByText('深度专注')
    expect(screen.queryByText('选择')).not.toBeInTheDocument()
    expect(screen.queryByText('更换')).not.toBeInTheDocument()
  })

  it('选中后展示 l2Name + l1Category', async () => {
    render(<ArchetypePicker value="a1" onChange={() => {}} />)
    expect(await screen.findByText('深度专注')).toBeInTheDocument()
    expect(screen.getByText(/工作/)).toBeInTheDocument()
  })

  it('点击下拉项触发 onChange(id, archetype)', async () => {
    const onChange = vi.fn()
    render(<ArchetypePicker value={undefined} onChange={onChange} />)
    fireEvent.click(await screen.findByText('选择'))
    fireEvent.click(await screen.findByText('深度专注'))
    expect(onChange).toHaveBeenCalledWith('a1', expect.objectContaining({ l2Name: '深度专注' }))
  })

  it('[023] I-2 a11y：选择按钮带 aria-haspopup + aria-expanded', async () => {
    render(<ArchetypePicker value={undefined} onChange={() => {}} />)
    const btn = await screen.findByLabelText('选择活动原型')
    expect(btn).toHaveAttribute('aria-haspopup', 'listbox')
    expect(btn).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(btn)
    expect(btn).toHaveAttribute('aria-expanded', 'true')
  })

  it('[023] I-2 a11y：下拉容器 role=listbox + 选项 role=option aria-selected', async () => {
    render(<ArchetypePicker value={undefined} onChange={() => {}} />)
    fireEvent.click(await screen.findByText('选择'))
    const listbox = await screen.findByRole('listbox', { name: '活动原型列表' })
    expect(listbox).toBeInTheDocument()
    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(1)
    expect(options[0]).toHaveAttribute('aria-selected', 'false')
  })
})

describe('[023] A3.2 ArchetypePicker M-1 fetch error UX', () => {
  it('getArchetypes reject 时下拉顶部显示「加载失败，点此重试」', async () => {
    mockGetArchetypes.mockRejectedValueOnce(new Error('network down'))
    render(<ArchetypePicker value={undefined} onChange={() => {}} />)
    fireEvent.click(await screen.findByText('选择'))
    expect(await screen.findByText('加载失败，点此重试')).toBeInTheDocument()
  })

  it('点击「加载失败，点此重试」会重新调用 getArchetypes，成功后选项出现', async () => {
    mockGetArchetypes
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({ success: true, data: successData })

    render(<ArchetypePicker value={undefined} onChange={() => {}} />)
    fireEvent.click(await screen.findByText('选择'))
    fireEvent.click(await screen.findByText('加载失败，点此重试'))

    // 重试后下拉再次渲染时能看到深度专注
    expect(await screen.findByText('深度专注')).toBeInTheDocument()
    expect(mockGetArchetypes).toHaveBeenCalledTimes(2)
  })

  it('readOnly 模式不渲染重试按钮（无下拉）', async () => {
    mockGetArchetypes.mockRejectedValue(new Error('network down'))
    render(<ArchetypePicker value={undefined} readOnly onChange={() => {}} />)
    // 等 effect 落幕
    await waitFor(() => expect(mockGetArchetypes).toHaveBeenCalled())
    expect(screen.queryByText('加载失败，点此重试')).not.toBeInTheDocument()
  })
})

describe('[023] A3.2 ArchetypePickerCard 带盒版', () => {
  it('渲染 h3 标题 + bg-surface-card 盒', async () => {
    const { container } = render(<ArchetypePickerCard value={undefined} onChange={() => {}} />)
    expect(screen.getByText('活动原型')).toBeInTheDocument()
    expect(container.querySelector('.bg-surface-card')).toBeInTheDocument()
  })
})

describe('[023.11] ArchetypePicker「AI 匹配」按钮', () => {
  it('enableAiMatch + title + 可写 → 渲染「AI 匹配」按钮', async () => {
    render(<ArchetypePicker value={undefined} onChange={() => {}} enableAiMatch title="写代码" />)
    expect(await screen.findByText('AI 匹配')).toBeInTheDocument()
  })
  it('无 title → 不渲染「AI 匹配」', async () => {
    render(<ArchetypePicker value={undefined} onChange={() => {}} enableAiMatch title="" />)
    await screen.findByText('选择')
    expect(screen.queryByText('AI 匹配')).not.toBeInTheDocument()
  })
  it('readOnly → 不渲染「AI 匹配」', async () => {
    render(<ArchetypePicker value="a1" readOnly onChange={() => {}} enableAiMatch title="写代码" />)
    await screen.findByText('深度专注')
    expect(screen.queryByText('AI 匹配')).not.toBeInTheDocument()
  })
  it('点击命中 → onChange(archetypeId)', async () => {
    mockMatchArchetype.mockResolvedValueOnce({ matched: true, archetypeId: 'a1' })
    const onChange = vi.fn()
    render(<ArchetypePicker value={undefined} onChange={onChange} enableAiMatch title="写代码" />)
    fireEvent.click(await screen.findByText('AI 匹配'))
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('a1'))
  })
  it('点击未命中 → 显示「未找匹配的活动原型」', async () => {
    mockMatchArchetype.mockResolvedValueOnce({ matched: false })
    render(<ArchetypePicker value={undefined} onChange={() => {}} enableAiMatch title="未知活动" />)
    fireEvent.click(await screen.findByText('AI 匹配'))
    expect(await screen.findByText('未找匹配的活动原型')).toBeInTheDocument()
  })
  it('[错误路径] action reject → 显示「未找匹配的活动原型」', async () => {
    mockMatchArchetype.mockRejectedValueOnce(new Error('net'))
    render(<ArchetypePicker value={undefined} onChange={() => {}} enableAiMatch title="写代码" />)
    fireEvent.click(await screen.findByText('AI 匹配'))
    expect(await screen.findByText('未找匹配的活动原型')).toBeInTheDocument()
  })
  it('[错误路径] loading 态显示「匹配中…」且按钮 disabled', async () => {
    mockMatchArchetype.mockReturnValueOnce(new Promise(() => {})) // 永挂
    render(<ArchetypePicker value={undefined} onChange={() => {}} enableAiMatch title="写代码" />)
    fireEvent.click(await screen.findByText('AI 匹配'))
    const btn = await screen.findByText('匹配中…')
    expect(btn).toBeInTheDocument()
    expect(btn.closest('button')).toBeDisabled()
  })
})
