/**
 * @file create-itinerary.test.tsx
 * @brief [026] T17 P2 CNUI CreateItinerary surface 渲染测试
 *
 * 守护 3 个分支：
 * - drafts=0 → "未识别到行程" 空态
 * - drafts=2 → 翻页 UI（page indicator + 翻页按钮）
 * - view='list' → existing 列表渲染
 *
 * 不依赖 DB（纯 RTL 渲染 + onConfirm/onDataChange spy）。
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import { CreateItinerary } from '../CreateItinerary'
import type { ItineraryDraftFields } from '../ItineraryFormFields'

/** 构造 drafts（1 或 2 条） */
function makeDrafts(n: 1 | 2 = 1): ItineraryDraftFields[] {
  const base: ItineraryDraftFields[] = [
    { id: 'd1', title: '看牙医', startTime: '2026-07-10T09:00:00.000Z', durationMin: 30, detail: '', people: [] },
    { id: 'd2', title: '买菜', startTime: '2026-07-10T14:00:00.000Z', durationMin: 20, detail: '', people: [] },
  ]
  return base.slice(0, n)
}

/** 构造 existing 列表 */
function makeExisting() {
  return [
    { id: 'e1', title: '晨会', startTime: '2026-07-10T08:00:00.000Z', status: 'scheduled' },
    { id: 'e2', title: '送机', startTime: '2026-07-10T18:00:00.000Z', status: 'in_progress' },
  ]
}

describe('[026] T17 <CreateItinerary> 渲染稳定性', () => {
  it('drafts.length=0 渲染「未识别到行程」空态', () => {
    render(
      <CreateItinerary
        surfaceType="createItinerary"
        dataModel={{ items: [], existing: [] }}
        onDataChange={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )
    expect(screen.getByText('未识别到行程')).toBeInTheDocument()
  })

  it('drafts.length=2 渲染翻页 UI（1/2 indicator + 翻页按钮 + 标题"创建行程 (1/2)"）', () => {
    render(
      <CreateItinerary
        surfaceType="createItinerary"
        dataModel={{ items: makeDrafts(2), existing: [] }}
        onDataChange={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )
    expect(screen.getByText('创建行程 (1/2)')).toBeInTheDocument()
    // 1/2 indicator
    expect(screen.getByText('1/2')).toBeInTheDocument()
    // 翻页按钮：上一步禁用，下一步可点
    const prev = screen.getByText('‹').closest('button') as HTMLButtonElement
    const next = screen.getByText('›').closest('button') as HTMLButtonElement
    expect(prev.disabled).toBe(true)
    expect(next.disabled).toBe(false)
    // 默认显示 d1 的 title input
    expect((screen.getByLabelText('事件名称') as HTMLInputElement).value).toBe('看牙医')
  })

  it('drafts.length=2 点击翻页按钮 → 渲染第 2 条 draft', () => {
    render(
      <CreateItinerary
        surfaceType="createItinerary"
        dataModel={{ items: makeDrafts(2), existing: [] }}
        onDataChange={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByText('›').closest('button')!)
    expect(screen.getByText('创建行程 (2/2)')).toBeInTheDocument()
    expect((screen.getByLabelText('事件名称') as HTMLInputElement).value).toBe('买菜')
  })

  it('点击「看已有行程」切换到 list 视图，渲染 existing 列表', () => {
    render(
      <CreateItinerary
        surfaceType="createItinerary"
        dataModel={{ items: makeDrafts(1), existing: makeExisting() }}
        onDataChange={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByText('看已有行程（防重复）'))
    // list 视图渲染 existing 两条
    expect(screen.getByText('晨会')).toBeInTheDocument()
    expect(screen.getByText('送机')).toBeInTheDocument()
    // status 标签：计划 / 执行中
    expect(screen.getByText('计划')).toBeInTheDocument()
    expect(screen.getByText('执行中')).toBeInTheDocument()
  })

  it('existing.length=0 切到 list 视图渲染「暂无计划/执行中的行程」', () => {
    render(
      <CreateItinerary
        surfaceType="createItinerary"
        dataModel={{ items: makeDrafts(1), existing: [] }}
        onDataChange={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByText('看已有行程（防重复）'))
    expect(screen.getByText('暂无计划/执行中的行程')).toBeInTheDocument()
  })

  it('draft 存在但所有 title 空 → 提交按钮 disabled', () => {
    const emptyDrafts: ItineraryDraftFields[] = [
      { id: 'd1', title: '', startTime: '2026-07-10T09:00:00.000Z', durationMin: 30, detail: '', people: [] },
    ]
    render(
      <CreateItinerary
        surfaceType="createItinerary"
        dataModel={{ items: emptyDrafts, existing: [] }}
        onDataChange={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )
    const submit = screen.getByText('提交全部').closest('button') as HTMLButtonElement
    expect(submit.disabled).toBe(true)
  })

  it('isDone=true 渲染「✅ N 个行程已创建」', () => {
    render(
      <CreateItinerary
        surfaceType="createItinerary"
        dataModel={{ items: makeDrafts(2), existing: [] }}
        onDataChange={vi.fn()}
        onConfirm={vi.fn()}
        isDone
      />,
    )
    expect(screen.getByText('✅ 2 个行程已创建')).toBeInTheDocument()
  })
})
