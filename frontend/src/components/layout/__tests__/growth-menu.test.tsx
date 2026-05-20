import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GrowthMenu } from '../growth-menu'

const mockDomainActions = [
  {
    domainId: 'habits',
    domainName: 'habits',
    actions: [
      { action: 'createHabit', shortcut: '/createHabit', description: '创建习惯' },
      { action: 'logHabit', shortcut: '/logHabit', description: '记录习惯' },
    ],
  },
  {
    domainId: 'timebox',
    domainName: 'timebox',
    actions: [
      { action: 'createTimebox', shortcut: '/createTimebox', description: '创建时间盒' },
    ],
  },
]

describe('GrowthMenu', () => {
  it('should render all domain groups', () => {
    render(<GrowthMenu domainActions={mockDomainActions} onAction={vi.fn()} />)
    expect(screen.getByText('habits')).toBeInTheDocument()
    expect(screen.getByText('timebox')).toBeInTheDocument()
  })

  it('should render all actions with shortcuts', () => {
    render(<GrowthMenu domainActions={mockDomainActions} onAction={vi.fn()} />)
    expect(screen.getByText('创建习惯')).toBeInTheDocument()
    expect(screen.getByText('记录习惯')).toBeInTheDocument()
    expect(screen.getByText('创建时间盒')).toBeInTheDocument()
    expect(screen.getByText('/createHabit')).toBeInTheDocument()
    expect(screen.getByText('/logHabit')).toBeInTheDocument()
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

    const habitsHeader = screen.getByText('habits')
    await user.click(habitsHeader)

    expect(screen.queryByText('创建习惯')).not.toBeInTheDocument()

    await user.click(habitsHeader)
    expect(screen.getByText('创建习惯')).toBeInTheDocument()
  })
})
