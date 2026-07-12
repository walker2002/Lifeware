/**
 * @file schedule-proposal.test
 * @brief [028.2] T1 — ScheduleProposal surface 5 维评分渲染 + needConfirm + revertableBatches 透传
 *
 * 验证：
 * - dataModel.score 有值 → AIOrchestratePanel 顶部 score-badge 渲染
 * - dataModel.score 缺失 → 不渲染 score-badge
 * - dataModel.dimensions 透传 5 维细目 grid
 * - needConfirm=true → 显示 need-confirm-card + 候选列表
 * - revertableBatches 透传 — 显示「撤销刚才创建的 N 个时间盒」按钮
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

import { ScheduleProposal } from '../ScheduleProposal'

describe('[028.2] <ScheduleProposal> score 徽章渲染', () => {
  it('dataModel.score 有值 → AIOrchestratePanel data-testid="score-badge" 存在 + 综合分渲染', () => {
    render(
      <ScheduleProposal
        surfaceType="schedule-proposal"
        dataModel={{
          proposals: [
            { id: 'p1', title: '上午写作', startTime: '09:00', endTime: '11:00' },
          ],
          score: 8.5,
          dimensions: { energy: 9.0, conflict: 8.0, balance: 8.5, priority: 9.0, buffer: 8.0 },
        }}
        onDataChange={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )
    // score-badge 渲染
    expect(screen.getByTestId('score-badge')).toBeInTheDocument()
    // 综合分显示「8.5 / 10」
    expect(screen.getByTestId('score-value')).toHaveTextContent('8.5 / 10')
    // 维度细目 grid 显示 5 维标签（中文）
    expect(screen.getByText('能量匹配')).toBeInTheDocument()
    expect(screen.getByText('冲突检测')).toBeInTheDocument()
    expect(screen.getByText('时段平衡')).toBeInTheDocument()
    expect(screen.getByText('优先级')).toBeInTheDocument()
    expect(screen.getByText('缓冲合理')).toBeInTheDocument()
  })

  it('dataModel.score 缺失 → 不渲染 score-badge', () => {
    render(
      <ScheduleProposal
        surfaceType="schedule-proposal"
        dataModel={{
          proposals: [
            { id: 'p1', title: '上午写作', startTime: '09:00', endTime: '11:00' },
          ],
          // score/dimensions 故意省略（onGenerate 不返时场景）
        }}
        onDataChange={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )
    expect(screen.queryByTestId('score-badge')).not.toBeInTheDocument()
    // proposals 仍渲染
    expect(screen.getByText(/上午写作/)).toBeInTheDocument()
  })

  it('dataModel.dimensions 为空对象 → score-badge 仍渲染但细目 grid 不显示', () => {
    render(
      <ScheduleProposal
        surfaceType="schedule-proposal"
        dataModel={{
          proposals: [
            { id: 'p1', title: '上午写作', startTime: '09:00', endTime: '11:00' },
          ],
          score: 7.5,
          dimensions: {},
        }}
        onDataChange={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )
    expect(screen.getByTestId('score-badge')).toBeInTheDocument()
    expect(screen.getByTestId('score-value')).toHaveTextContent('7.5 / 10')
    // 空 dimensions → 细目 grid 不渲染（无 key 渲染）
    expect(screen.queryByText('能量匹配')).not.toBeInTheDocument()
  })

  it('needConfirm=true → 显示 need-confirm-card + 候选标题', () => {
    render(
      <ScheduleProposal
        surfaceType="schedule-proposal"
        dataModel={{
          proposals: [],  // needConfirm 路径下 proposals 必空
          needConfirm: true,
          archetypeCandidates: [
            { id: '__manual_appointment__', title: '手动改约定', source: 'fallback', reason: 'NL 涉及 Tier0 改时' },
          ],
          confirmReason: 'NL 置信度低（0.30 < 0.6）',
        }}
        onDataChange={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )
    expect(screen.getByTestId('need-confirm-card')).toBeInTheDocument()
    expect(screen.getByText('手动改约定')).toBeInTheDocument()
    // score-badge 不渲染（needConfirm 路径无 score）
    expect(screen.queryByTestId('score-badge')).not.toBeInTheDocument()
  })

  it('revertableBatches 非空 → 显示「撤销刚才创建的 N 个时间盒」按钮', () => {
    render(
      <ScheduleProposal
        surfaceType="schedule-proposal"
        dataModel={{
          proposals: [],
          revertableBatches: [{ batchId: 'batch-test', acceptedAt: Date.now(), count: 3 }],
        }}
        onDataChange={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )
    expect(screen.getByTestId('revert-batch-btn')).toBeInTheDocument()
    expect(screen.getByText(/撤销刚刚创建的 3 个时间盒/)).toBeInTheDocument()
  })
})