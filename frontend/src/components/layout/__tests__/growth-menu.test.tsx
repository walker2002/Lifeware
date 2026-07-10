import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GrowthMenu } from '../growth-menu'

const mockDomainActions = [
  {
    domainId: 'habits',
    domainName: 'Habits',
    actions: [
      { action: 'createHabit', shortcut: '/createHabit', description: '创建习惯' },
      { action: 'logHabitLog', shortcut: '/logHabit', description: '记录习惯' },
    ],
  },
  {
    domainId: 'timebox',
    domainName: 'Timebox',
    actions: [
      { action: 'createTimebox', shortcut: '/createTimebox', description: '创建时间盒' },
    ],
  },
]

describe('GrowthMenu', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('should render domain groups with Chinese labels', () => {
    render(<GrowthMenu domainActions={mockDomainActions} onAction={vi.fn()} />)
    expect(screen.getByText('习惯')).toBeInTheDocument()
    expect(screen.getByText('时间盒')).toBeInTheDocument()
  })

  it('should render pinned action descriptions', () => {
    render(<GrowthMenu domainActions={mockDomainActions} onAction={vi.fn()} />)
    expect(screen.getByText('创建习惯')).toBeInTheDocument()
    expect(screen.getByText('记录习惯')).toBeInTheDocument()
    expect(screen.getByText('创建时间盒')).toBeInTheDocument()
  })

  it('should not display shortcuts inline', () => {
    render(<GrowthMenu domainActions={mockDomainActions} onAction={vi.fn()} />)
    expect(screen.queryByText('/createHabit')).not.toBeInTheDocument()
    expect(screen.queryByText('/logHabit')).not.toBeInTheDocument()
  })

  it('should set shortcut as title attribute for tooltip', () => {
    render(<GrowthMenu domainActions={mockDomainActions} onAction={vi.fn()} />)
    const btn = screen.getByText('创建习惯').closest('button')!
    expect(btn.title).toBe('/createHabit')
  })

  it('should call onAction when action clicked', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    render(<GrowthMenu domainActions={mockDomainActions} onAction={onAction} />)

    await user.click(screen.getByText('创建习惯'))
    expect(onAction).toHaveBeenCalledWith('habits', 'createHabit')
  })

  it('should collapse and expand domain groups', async () => {
    const user = userEvent.setup()
    render(<GrowthMenu domainActions={mockDomainActions} onAction={vi.fn()} />)

    const habitsHeader = screen.getByText('习惯')
    await user.click(habitsHeader)
    expect(screen.queryByText('创建习惯')).not.toBeInTheDocument()

    await user.click(habitsHeader)
    expect(screen.getByText('创建习惯')).toBeInTheDocument()
  })

  it('should move unpinned action to "更多行动" section', async () => {
    const user = userEvent.setup()
    render(<GrowthMenu domainActions={mockDomainActions} onAction={vi.fn()} />)

    // Click the pin toggle on "创建习惯" to unpin it
    const createActionBtn = screen.getByText('创建习惯').closest('button')!
    const pinToggle = createActionBtn.querySelector('[role="button"]') as HTMLElement
    await user.click(pinToggle)

    // Action should disappear from main list
    expect(screen.queryByText('创建习惯')).not.toBeInTheDocument()
    // "更多行动" button should appear
    expect(screen.getByText('更多行动')).toBeInTheDocument()
  })

  it('should show loading state when no domains', () => {
    render(<GrowthMenu domainActions={[]} onAction={vi.fn()} />)
    expect(screen.getByText('加载中...')).toBeInTheDocument()
  })
})
