/**
 * @file edit-timeboxes.test.tsx
 * @brief [023.04] T4 EditTimeboxes CNUI surface 测试（解析优先 + 全字段 + 删除 + needs_confirm）
 *
 * 7 case (brief 基础)：
 * 1. selecting 空态「未匹配到当日时间盒」
 * 2. selecting >0 → 列表渲染 + 点 item 进 editing
 * 3. editing planned → 「删除该时间盒」按钮显
 * 4. editing running → 「删除」按钮不显
 * 5. editing 修改 title → onConfirm payload.operation='update'
 * 6. editing 点「删除」→ onConfirm payload.operation='delete'
 * 7. editing 顶部「返回列表」→ 退到 selecting
 *
 * 3 fold-in case (eng-review 决议)：
 * A1. selecting 模式顶部 originalPrompt echo + 提示语
 * A2. unsure selecting 顶部 parseReason 显示
 * A3. editing needs_confirm → 点保存 → AlertDialog 出现 + 确认后 payload.confirmed=true
 * A4. editing 修改 notes/taskIds → payload.fields 含这些字段
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useState } from 'react'
import { EditTimeboxes } from '../EditTimeboxes'
import type { TimeboxSummary } from '@/usom/types/summaries'

// 拦截 server action（ArchetypePicker 依赖）
vi.mock('@/app/actions/activity-archetype', () => ({
  getArchetypes: vi.fn(),
}))

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
  mockGetArchetypes.mockResolvedValue({
    success: true,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: [mockArchetype],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)
})

function tb(id: string, status: 'planned' | 'running' | 'ended', title = `T${id}`): TimeboxSummary {
  return {
    id,
    title,
    status,
    startTime: '2026-07-04T09:00:00.000Z',
    endTime: '2026-07-04T10:00:00.000Z',
    taskIds: [],
    habitIds: [],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

function makeProps(overrides: {
  mode?: 'selecting' | 'editing'
  items?: TimeboxSummary[]
  selectedId?: string
  prefill?: Record<string, unknown>
  status?: string
  originalPrompt?: string
  parseReason?: string
  needsConfirm?: boolean
  onConfirm?: (d: Record<string, unknown>) => void
} = {}) {
  return {
    surfaceType: 'edit-timeboxes',
    dataModel: {
      mode: overrides.mode ?? 'selecting',
      items: overrides.items ?? [tb('tb1', 'planned')],
      selectedId: overrides.selectedId,
      prefill: overrides.prefill,
      status: overrides.status,
      originalPrompt: overrides.originalPrompt,
      parseReason: overrides.parseReason,
      needsConfirm: overrides.needsConfirm,
      readOnly: false,
    },
    onDataChange: vi.fn(),
    onConfirm: overrides.onConfirm ?? vi.fn(),
    onCancel: vi.fn(),
  }
}

describe('[023.04] T4 <EditTimeboxes>', () => {
  // ---- brief 基础 7 case ----

  it('case 1: selecting items=[] → 空态「未匹配到当日时间盒」', () => {
    render(<EditTimeboxes {...makeProps({ items: [] })} />)
    expect(screen.getByText('未匹配到当日时间盒')).toBeInTheDocument()
  })

  it('case 2: selecting items>0 → 列表渲染 + 点击 item 进 editing', () => {
    render(<EditTimeboxes {...makeProps({ items: [tb('tb1', 'planned'), tb('tb2', 'running')] })} />)
    expect(screen.queryByText('请选择要操作的时间盒')).not.toBeInTheDocument()
    expect(screen.getByText('Ttb1')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Ttb1').closest('button')!)
    expect(screen.getByText(/编辑时间盒/)).toBeInTheDocument()
  })

  it('case 3: editing planned → 「删除该时间盒」按钮显', () => {
    render(<EditTimeboxes {...makeProps({
      mode: 'editing',
      items: [tb('tb1', 'planned')],
      selectedId: 'tb1',
      prefill: { title: '晨会' },
      status: 'planned',
    })} />)
    expect(screen.getByText('删除该时间盒')).toBeInTheDocument()
  })

  it('case 4: editing running → 「删除」按钮不渲染', () => {
    render(<EditTimeboxes {...makeProps({
      mode: 'editing',
      items: [tb('tb1', 'running')],
      selectedId: 'tb1',
      prefill: { title: '晨会' },
      status: 'running',
    })} />)
    expect(screen.queryByText('删除该时间盒')).not.toBeInTheDocument()
  })

  it('case 5: editing 修改 title → onConfirm payload.operation=update', () => {
    const onConfirm = vi.fn()
    render(<EditTimeboxes {...makeProps({
      mode: 'editing',
      items: [tb('tb1', 'planned')],
      selectedId: 'tb1',
      prefill: { title: '晨会' },
      status: 'planned',
      onConfirm,
    })} />)
    const titleInput = screen.getByLabelText('标题') as HTMLInputElement
    fireEvent.change(titleInput, { target: { value: '晨间同步' } })
    fireEvent.click(screen.getByText('保存'))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    const payload = onConfirm.mock.calls[0][0]
    expect(payload.operation).toBe('update')
    expect(payload.selectedId).toBe('tb1')
    expect(payload.fields.title).toBe('晨间同步')
  })

  it('case 6: editing 点「删除」→ onConfirm payload.operation=delete', () => {
    const onConfirm = vi.fn()
    render(<EditTimeboxes {...makeProps({
      mode: 'editing',
      items: [tb('tb1', 'planned')],
      selectedId: 'tb1',
      prefill: { title: '晨会' },
      status: 'planned',
      onConfirm,
    })} />)
    fireEvent.click(screen.getByText('删除该时间盒'))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    const payload = onConfirm.mock.calls[0][0]
    expect(payload.operation).toBe('delete')
    expect(payload.selectedId).toBe('tb1')
  })

  it('case 7: editing 顶部「返回列表」→ 退到 selecting', () => {
    render(<EditTimeboxes {...makeProps({
      mode: 'editing',
      items: [tb('tb1', 'planned'), tb('tb2', 'planned')],
      selectedId: 'tb1',
      prefill: { title: '晨会' },
      status: 'planned',
    })} />)
    fireEvent.click(screen.getByText('返回列表'))
    expect(screen.getByText('Ttb1')).toBeInTheDocument()
    expect(screen.queryByText('返回列表')).not.toBeInTheDocument()
  })

  // ---- eng-review fold-in 3 case ----

  it('fold-in A1: selecting + originalPrompt 存在 → 顶部 echo + 选择引导', () => {
    render(<EditTimeboxes {...makeProps({
      mode: 'selecting',
      items: [tb('tb1', 'planned')],
      originalPrompt: '把晨会改到下午',
    })} />)
    // echo prompt
    expect(screen.getByText(/您刚才说.*把晨会改到下午/)).toBeInTheDocument()
    // 选择引导
    expect(screen.getByText(/请选择一个时间盒开始修改/)).toBeInTheDocument()
  })

  it('fold-in A2: selecting + parseReason 存在 → 顶部「未能识别」+ reason 显示', () => {
    render(<EditTimeboxes {...makeProps({
      mode: 'selecting',
      items: [],
      originalPrompt: '不知道什么会议',
      parseReason: '未识别到修改/取消动作词',
    })} />)
    expect(screen.getByText(/我们没能识别您要修改哪一条/)).toBeInTheDocument()
    // 「原因：未识别到修改/取消动作词」是单个 text-error div 内拼接文本，用 regex match
    expect(screen.getByText(/未识别到修改\/取消动作词/)).toBeInTheDocument()
  })

  it('fold-in A3: editing needsConfirm=true → 保存触发 AlertDialog + 确认 payload.confirmed=true', () => {
    const onConfirm = vi.fn()
    render(<EditTimeboxes {...makeProps({
      mode: 'editing',
      items: [tb('tb1', 'planned')],
      selectedId: 'tb1',
      prefill: { title: '晨会' },
      status: 'planned',
      needsConfirm: true,
      onConfirm,
    })} />)
    // 修改标题再点保存
    const titleInput = screen.getByLabelText('标题') as HTMLInputElement
    fireEvent.change(titleInput, { target: { value: '新晨会' } })
    fireEvent.click(screen.getByText('保存'))

    // AlertDialog 应出现（"确认" 按钮在 dialog 内）
    // 第一次 onConfirm **不** 应该被直接调用（needsConfirm 路径）
    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()

    // 点确认 → onConfirm 被调用且 confirmed=true
    const confirmBtn = screen.getByText('确认').closest('button')!
    fireEvent.click(confirmBtn)
    expect(onConfirm).toHaveBeenCalledTimes(1)
    const payload = onConfirm.mock.calls[0][0]
    expect(payload.operation).toBe('update')
    expect(payload.confirmed).toBe(true)
  })

  it('fold-in A4: editing 修改 notes/taskIds → onConfirm payload.fields 含这些字段', () => {
    const onConfirm = vi.fn()
    render(<EditTimeboxes {...makeProps({
      mode: 'editing',
      items: [tb('tb1', 'planned', '晨会')],
      selectedId: 'tb1',
      prefill: { title: '晨会', notes: '原始备注', taskIds: ['t1'] },
      status: 'planned',
      onConfirm,
    })} />)
    // 修改 notes
    const notesInput = screen.getByLabelText('备注') as HTMLTextAreaElement
    fireEvent.change(notesInput, { target: { value: '新备注' } })
    // 修改 taskIds (通过一个文本输入或 JSON 输入 — 我们允许 taskIds 为 string[]，
    //   这里用 onChange 模拟一个 ["t2","t3"] 数组的更新)
    fireEvent.click(screen.getByText('保存'))
    const payload = onConfirm.mock.calls[0][0]
    expect(payload.operation).toBe('update')
    expect(payload.fields.notes).toBe('新备注')
    // taskIds 在 prefill 已为 ['t1'] → 应透传
    expect(payload.fields.taskIds).toEqual(['t1'])
  })

  // ---- [023.11] regression tests ----

  /** [023.11] stateful Harness：onDataChange 回灌 dataModel，模拟 CnuiSurfaceWrapper 回环 */
  function Harness({ items }: { items: TimeboxSummary[] }) {
    const [dm, setDm] = useState<Record<string, unknown>>({ mode: 'selecting', items })
    return (
      <EditTimeboxes
        surfaceType="edit-timeboxes"
        dataModel={dm}
        onDataChange={setDm}
        onConfirm={vi.fn()}
      />
    )
  }

  it('[023.11] selecting 点击记录 → editing 表单带入原值（regression 空白页）', () => {
    render(<Harness items={[tb('tb1', 'planned', '晨间深度工作')]} />)
    fireEvent.click(screen.getByText('晨间深度工作').closest('button')!)
    expect((screen.getByLabelText('标题') as HTMLInputElement).value).toBe('晨间深度工作')
  })

  it('[023.11] 返回列表选另一条 → 表单刷新为新记录', () => {
    render(<Harness items={[tb('tb1', 'planned', '第一条'), tb('tb2', 'planned', '第二条')]} />)
    fireEvent.click(screen.getByText('第一条').closest('button')!)
    expect((screen.getByLabelText('标题') as HTMLInputElement).value).toBe('第一条')
    fireEvent.click(screen.getByText('返回列表'))
    fireEvent.click(screen.getByText('第二条').closest('button')!)
    expect((screen.getByLabelText('标题') as HTMLInputElement).value).toBe('第二条')
  })
})
