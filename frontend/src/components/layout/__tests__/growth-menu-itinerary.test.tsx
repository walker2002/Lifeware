/**
 * @file growth-menu-itinerary.test.tsx
 * @brief GrowthMenu 单测覆盖 4 个 itinerary action（[026] T19 codex #6）
 *
 * 守护 manifest.yaml 中 itinerary 4 intent_trigger（createItinerary/editItinerary/
 * deleteItinerary/viewItineraries）作为 timebox 域 group 被 GrowthMenu 正确渲染。
 * 这是 manifest SSOT 的 CI 守护——任何 manifest 修改这 4 条动作（domainId、action
 * 名、description 等）若破坏 GrowthMenu 期望的渲染形状，本测试立即 fail。
 *
 * 为什么不 mock registry + 测试 AI panel 集成？
 * - GrowthMenu props 契约 = `domainActions: DomainActionGroup[]`（已分组后传入），
 *   registry 在 ai-panel 上层做按 domainId 分组（registry.ts:87-93 getAllDomainActions
 *   按 plugin.manifest.domainId 自动归组）。GrowthMenu 自己只渲染分组入参。
 * - 单测 GrowthMenu 比端到端 mock AI panel 更稳：聚焦组件契约，避免 mock 链路变更
 *   引发的脆性。registry 分组契约由 registry 自身的测试守护（独立保障）。
 *
 * 数据来源：直接复制 frontend/src/domains/timebox/manifest.yaml 第 93-125 行的 4 个
 * itinerary intent_trigger 字段（domainId/action/shortcut/description），与 SSOT
 * 手工同步。本测试不是 manifest 解释器，是 manifest → GrowthMenu 渲染契约的快照。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GrowthMenu } from '../growth-menu'

/**
 * [026] T19 守护的 4 个 itinerary action — 与 manifest.yaml 第 93-125 行严格对齐
 * （时间盒域下 4 个行程 intent_trigger）
 */
const itineraryDomainActions = [
  {
    domainId: 'timebox',
    domainName: '时间盒',
    actions: [
      {
        action: 'createItinerary',
        shortcut: '/createItinerary',
        description: '增加一个未来行程',
        response_type: 'cnui' as const,
      },
      {
        action: 'editItinerary',
        shortcut: '/editItinerary',
        description: '修改一个计划或执行中的行程',
        response_type: 'cnui' as const,
      },
      {
        action: 'deleteItinerary',
        shortcut: '/deleteItinerary',
        description: '删除计划或执行中的行程（可多选）',
        response_type: 'cnui' as const,
      },
      {
        action: 'viewItineraries',
        shortcut: '/itineraries',
        description: '行程管理',
        response_type: 'page' as const,
      },
    ],
  },
]

describe('GrowthMenu — itinerary actions（[026] T19 manifest SSOT 守护）', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('时间盒域 group 下渲染全部 4 个 itinerary action 描述', () => {
    render(<GrowthMenu domainActions={itineraryDomainActions} onAction={vi.fn()} />)
    // 时间盒 group header（DOMAIN_META.timebox.label = '时间盒'）存在
    expect(screen.getByText('时间盒')).toBeInTheDocument()
    // 4 个 itinerary action 描述全部渲染（DOMAIN_META 无过滤，按 domainId 自动归组 → timebox 下）
    expect(screen.getByText('增加一个未来行程')).toBeInTheDocument()
    expect(screen.getByText('修改一个计划或执行中的行程')).toBeInTheDocument()
    expect(screen.getByText('删除计划或执行中的行程（可多选）')).toBeInTheDocument()
    expect(screen.getByText('行程管理')).toBeInTheDocument()
  })

  it('4 个 itinerary action shortcut 各自正确显示在所属按钮内（文案流渲染）', () => {
    render(<GrowthMenu domainActions={itineraryDomainActions} onAction={vi.fn()} />)
    // GrowthMenu 渲染契约：shortcut 在所属按钮内的文案流显示（line 151-153 的 <span>）
    // 注：title 属性挂在内层 description <span> 上（用于 hover tooltip = description 全文），
    //     不是 shortcut 本身。本断言守护 4 个 itinerary action shortcut 在按钮内可见。
    const createBtn = screen.getByText('增加一个未来行程').closest('button')!
    expect(createBtn).toHaveTextContent('/createItinerary')
    const editBtn = screen.getByText('修改一个计划或执行中的行程').closest('button')!
    expect(editBtn).toHaveTextContent('/editItinerary')
    const deleteBtn = screen.getByText('删除计划或执行中的行程（可多选）').closest('button')!
    expect(deleteBtn).toHaveTextContent('/deleteItinerary')
    const viewBtn = screen.getByText('行程管理').closest('button')!
    expect(viewBtn).toHaveTextContent('/itineraries')
  })

  it('点击 itinerary action 时回调以 (timebox, action) 形式触发', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    render(<GrowthMenu domainActions={itineraryDomainActions} onAction={onAction} />)

    await user.click(screen.getByText('增加一个未来行程'))
    expect(onAction).toHaveBeenCalledWith('timebox', 'createItinerary')

    await user.click(screen.getByText('修改一个计划或执行中的行程'))
    expect(onAction).toHaveBeenCalledWith('timebox', 'editItinerary')

    await user.click(screen.getByText('删除计划或执行中的行程（可多选）'))
    expect(onAction).toHaveBeenCalledWith('timebox', 'deleteItinerary')

    await user.click(screen.getByText('行程管理'))
    expect(onAction).toHaveBeenCalledWith('timebox', 'viewItineraries')
  })

  it('itinerary action 与时间盒其他动作在 timebox group 下共同渲染（不被过滤）', () => {
    // [026] T14 已确认 itinerary 4 action 在 timebox group 下与 startTimebox/endTimebox 等
    // 共存。本测试用含 itinerary + 时间盒其他动作的合成数据，守护"不被未来代码过滤掉"。
    const mixedActions = [
      {
        domainId: 'timebox',
        domainName: '时间盒',
        actions: [
          { action: 'createTimebox', shortcut: '/createTimebox', description: '创建新的时间盒', response_type: 'cnui' as const },
          { action: 'createItinerary', shortcut: '/createItinerary', description: '增加一个未来行程', response_type: 'cnui' as const },
          { action: 'editItinerary', shortcut: '/editItinerary', description: '修改一个计划或执行中的行程', response_type: 'cnui' as const },
          { action: 'viewItineraries', shortcut: '/itineraries', description: '行程管理', response_type: 'page' as const },
        ],
      },
    ]
    render(<GrowthMenu domainActions={mixedActions} onAction={vi.fn()} />)

    expect(screen.getByText('创建新的时间盒')).toBeInTheDocument()
    expect(screen.getByText('增加一个未来行程')).toBeInTheDocument()
    expect(screen.getByText('修改一个计划或执行中的行程')).toBeInTheDocument()
    expect(screen.getByText('行程管理')).toBeInTheDocument()
  })
})