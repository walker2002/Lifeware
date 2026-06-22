/**
 * @file CnuiSurfaceWrapper 全屏行为测试
 * @brief 验证全屏 surface 经 portal 渲染进主内容区（保留左侧 panel）
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { CnuiSurfaceWrapper } from '../CnuiSurfaceWrapper'
import type { CnuiLifecycleState, CnuiLifecycleActions } from '../use-cnui-lifecycle'

// 屏蔽重依赖子组件，聚焦 portal 定位行为
vi.mock('../CnuiRenderer', () => ({
  CnuiRenderer: () => <div data-testid="cnui-renderer" />,
}))
vi.mock('../cnui-confirm-dialog', () => ({
  CnuiConfirmDialog: () => null,
}))
vi.mock('../CnuiSurfaceDone', () => ({
  CnuiSurfaceDone: () => null,
}))

/** 构造最小可用的生命周期状态/动作 */
function makeLifecycle(): [CnuiLifecycleState, CnuiLifecycleActions] {
  const state: CnuiLifecycleState = {
    surfaceStates: {},
    surfaceData: {},
    submittingId: null,
    validationErrors: {},
    confirmDialog: { open: false, type: 'save', surfaceId: '', title: '', message: '' },
  }
  const actions: CnuiLifecycleActions = {
    requestSave: vi.fn(),
    requestCancel: vi.fn(),
    confirmDialogAction: vi.fn(),
    dismissDialog: vi.fn(),
    updateData: vi.fn(),
    clearValidationErrors: vi.fn(),
  }
  return [state, actions]
}

const baseProps = {
  surfaceId: 's1',
  domainId: 'habits',
  action: 'create',
  surfaceType: 'habitForm',
  dataSnapshot: {},
  header: '全屏标题',
}

describe('CnuiSurfaceWrapper 全屏定位', () => {
  afterEach(() => {
    cleanup()
    // 清理手动挂载的主内容区目标节点
    document.querySelectorAll('[data-lw-main-area]').forEach(el => el.remove())
  })

  it('全屏时把 surface 渲染进主内容区 [data-lw-main-area]，而非内联位置', () => {
    // 准备主内容区 portal 目标
    const mainArea = document.createElement('div')
    mainArea.setAttribute('data-lw-main-area', '')
    document.body.appendChild(mainArea)

    const [lifecycleState, lifecycleActions] = makeLifecycle()
    const { container } = render(
      <CnuiSurfaceWrapper
        {...baseProps}
        {...{ lifecycleState, lifecycleActions }}
        isFullscreen
        onFullscreenChange={() => {}}
      />,
    )

    const header = screen.getByText('全屏标题')
    // 关键断言：全屏 surface 应落在主内容区内
    expect(mainArea).toContainElement(header)
    // 且不应停留在对话流的内联位置
    expect(container).not.toContainElement(header)
  })

  it('非全屏时 surface 保持内联渲染（不进入主内容区）', () => {
    const mainArea = document.createElement('div')
    mainArea.setAttribute('data-lw-main-area', '')
    document.body.appendChild(mainArea)

    const [lifecycleState, lifecycleActions] = makeLifecycle()
    const { container } = render(
      <CnuiSurfaceWrapper
        {...baseProps}
        {...{ lifecycleState, lifecycleActions }}
        onFullscreenChange={() => {}}
      />,
    )

    const header = screen.getByText('全屏标题')
    // 内联模式：surface 在渲染容器里，不在主内容区
    expect(container).toContainElement(header)
    expect(mainArea).not.toContainElement(header)
  })
})
