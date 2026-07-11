/**
 * @file template-card.test
 * @brief TemplateCard 列表行徽章（[027-B]：原型标签 + 来源徽章）
 */
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { TemplateCard } from '../template-card'
import type { TimeboxTemplate } from '@/lib/db/repositories/timebox-template'

function makeTpl(rows: TimeboxTemplate['rows']): TimeboxTemplate {
  return { id: 't', userId: 'u', schemaVersion: 1, name: 'T', daysOfWeek: [], rows, createdAt: '', updatedAt: '' }
}

describe('TemplateCard — 行徽章', () => {
  it('custom 行显示原型标签（archetypeMap 命中）', () => {
    const tpl = makeTpl([{ id: 'r', activityName: '读书', defaultStart: '09:00', defaultDuration: 60, source: 'custom', activityArchetypeId: 'a-1' }])
    const { getAllByTestId } = render(<TemplateCard template={tpl} archetypeMap={new Map([['a-1', '阅读']])} onEdit={() => {}} onDelete={() => {}} />)
    expect(getAllByTestId('row-line')[0]?.textContent).toContain('阅读')
  })
  it('custom 行无原型不显示空徽章', () => {
    const tpl = makeTpl([{ id: 'r', activityName: '读书', defaultStart: '09:00', defaultDuration: 60, source: 'custom' }])
    const { getAllByTestId } = render(<TemplateCard template={tpl} archetypeMap={new Map()} onEdit={() => {}} onDelete={() => {}} />)
    expect(getAllByTestId('row-line')[0]?.textContent).toBe('09:00 · 60分钟 · 读书')
  })
  it('habit 行显示「习惯」来源徽章', () => {
    const tpl = makeTpl([{ id: 'r', activityName: '晨跑', defaultStart: '06:00', defaultDuration: 60, source: 'habit', sourceId: 'h1' }])
    const { getAllByTestId } = render(<TemplateCard template={tpl} archetypeMap={new Map()} onEdit={() => {}} onDelete={() => {}} />)
    expect(getAllByTestId('row-line')[0]?.textContent).toContain('习惯')
  })
  it('thread 行显示「主线」徽章', () => {
    const tpl = makeTpl([{ id: 'r', activityName: 'OKR', defaultStart: '09:00', defaultDuration: 60, source: 'thread', sourceId: 'th1' }])
    const { getAllByTestId } = render(<TemplateCard template={tpl} archetypeMap={new Map()} onEdit={() => {}} onDelete={() => {}} />)
    expect(getAllByTestId('row-line')[0]?.textContent).toContain('主线')
  })
})
