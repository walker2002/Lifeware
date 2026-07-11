/**
 * @file template-edit-form.test
 * @brief TemplateEditForm 组件测试（[023-02] 决议 C.3）
 *
 * 覆盖：
 * - 渲染：name 框 + 7 weekday chips + 行列表 + 新增一行按钮
 * - 来源 <select> 在 sources === null 时 disabled（B.1）
 * - 切换来源：mock sources → changeRowSource('habit', 'h-1') 后
 *   activityName 变 habit.title，start/end 变 habit.start/h.end，time 输入 disabled
 * - 删行：点 trash icon → 行数 -1
 * - 新增行：点 + → 行数 +1，source='custom' 09:00–10:00
 */
import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TemplateEditForm } from '../template-edit-form'
import type { TimeboxTemplate } from '@/lib/db/repositories/timebox-template'
import type { SubscriptionSources } from '@/app/actions/timebox-templates'

// [027-B] RowEditor 嵌入 ArchetypePicker → mock getArchetypes / matchArchetypeForTitle
// 让 picker 能找到 a-1 / a-run / a-write 来显示「更换/未选择」
vi.mock('@/app/actions/activity-archetype', () => ({
  getArchetypes: vi.fn(() => Promise.resolve({
    success: true,
    data: [
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { id: 'a-1', l2Name: '阅读', l1Category: '学习', isSystem: true, energyCost: { physical: 1, mental: 7, emotional: 2, creative: 3 } },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { id: 'a-run', l2Name: '跑步', l1Category: '健康', isSystem: true, energyCost: { physical: 9, mental: 2, emotional: 1, creative: 0 } },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { id: 'a-write', l2Name: '写作', l1Category: '工作', isSystem: true, energyCost: { physical: 0, mental: 8, emotional: 2, creative: 7 } },
    ],
  })),
  matchArchetypeForTitle: vi.fn(() => Promise.resolve({ matched: false })),
}))

// ─── 测试 fixtures ───────────────────────────────────────────────

function makeTemplate(overrides: Partial<TimeboxTemplate> = {}): TimeboxTemplate {
  return {
    id: 't-1',
    userId: 'u-1',
    schemaVersion: 1,
    name: '测试模板',
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    rows: [
      { id: 'r1', activityName: '起床', defaultStart: '07:00', defaultDuration: 30, source: 'custom' },
      { id: 'r2', activityName: '晨间', defaultStart: '07:30', defaultDuration: 90, source: 'custom' },
    ],
    createdAt: '',
    updatedAt: '',
    ...overrides,
  }
}

const mockSources: SubscriptionSources = {
  habits: [
    { id: 'h-1', title: '晨跑', start: '06:00', end: '07:00', activityArchetypeId: 'a-run' },
    { id: 'h-2', title: '冥想', start: '21:00', end: '21:30' },
  ],
  tasks: [
    { id: 'tk-1', title: '写周报', activityArchetypeId: 'a-write' },
  ],
  threads: [
    { id: 'th-1', title: '季度 OKR' },
  ],
}

// ─── 测试 harness：捕获 onChange + 提供稳定 props ────────────────

interface HarnessProps {
  initialTemplate?: TimeboxTemplate
  initialSources?: SubscriptionSources | null
  onSave?: () => void
  onCancel?: () => void
}

function Harness({
  initialTemplate,
  initialSources = null,
  onSave,
  onCancel,
}: HarnessProps) {
  const [template, setTemplate] = useState<TimeboxTemplate>(
    initialTemplate ?? makeTemplate(),
  )
  return (
    <TemplateEditForm
      template={template}
      sources={initialSources}
      onChange={setTemplate}
      onSave={onSave ?? vi.fn()}
      onCancel={onCancel ?? vi.fn()}
      saving={false}
    />
  )
}

// ─── 渲染用例 ──────────────────────────────────────────────────

describe('TemplateEditForm — 渲染', () => {
  it('应渲染名称输入框、7 个星期 chip 和「新增一行」按钮', () => {
    render(<Harness />)
    // 名称输入
    expect(screen.getByLabelText('模板名称')).toBeInTheDocument()
    expect(screen.getByDisplayValue('测试模板')).toBeInTheDocument()
    // 7 个星期 chip（按长名查）
    for (const longName of ['周日', '周一', '周二', '周三', '周四', '周五', '周六']) {
      expect(screen.getByRole('button', { name: longName })).toBeInTheDocument()
    }
    // 新增一行按钮
    expect(screen.getByRole('button', { name: /新增一行/ })).toBeInTheDocument()
  })

  it('应按 template.rows 数量渲染行（不调 sortRowsByStart）', () => {
    render(<Harness />)
    // 行数 = 2（每行包含「删除行」按钮）
    const deleteBtns = screen.getAllByRole('button', { name: '删除行' })
    expect(deleteBtns).toHaveLength(2)
    // 显示「时间安排行（2）」
    expect(screen.getByText(/时间安排行（2）/)).toBeInTheDocument()
  })

  it('空 rows 应显示「暂无行」提示', () => {
    render(<Harness initialTemplate={makeTemplate({ rows: [] })} />)
    expect(screen.getByText(/暂无行/)).toBeInTheDocument()
    expect(screen.getByText(/时间安排行（0）/)).toBeInTheDocument()
  })

  it('sources=null 时来源 select 应 disabled 并显示「加载订阅源…」', () => {
    render(<Harness initialSources={null} />)
    const sourceSelects = screen.getAllByLabelText('行来源')
    expect(sourceSelects.length).toBeGreaterThan(0)
    for (const sel of sourceSelects) {
      expect(sel).toBeDisabled()
    }
    // 加载提示
    expect(screen.getAllByText(/加载订阅源…/).length).toBeGreaterThan(0)
  })

  it('sources 已加载时来源 select 应 enabled 不再显示加载提示', () => {
    render(<Harness initialSources={mockSources} />)
    const sourceSelects = screen.getAllByLabelText('行来源')
    for (const sel of sourceSelects) {
      expect(sel).not.toBeDisabled()
    }
    expect(screen.queryByText(/加载订阅源…/)).not.toBeInTheDocument()
  })
})

// ─── 来源切换用例 ──────────────────────────────────────────────

describe('TemplateEditForm — 来源切换', () => {
  it('切到 habit 并选具体 habit 时：activityName/start/end 应自动填且 time 输入 disabled', async () => {
    const user = userEvent.setup()
    render(<Harness initialSources={mockSources} />)

    // 拿第一行的来源 select → 改成 'habit'
    const firstRowSourceSelect = screen.getAllByLabelText('行来源')[0]!
    await user.selectOptions(firstRowSourceSelect, 'habit')

    // 来源对象 select 出现（select 标签为「来源对象」），选 h-1
    const habitSelect = screen.getAllByLabelText('来源对象')[0]!
    await user.selectOptions(habitSelect, 'h-1')

    // activityName 应为 '晨跑'（习惯标题）；defaultStart='06:00'；defaultDuration=60（06:00→07:00）
    expect(screen.getByDisplayValue('晨跑')).toBeInTheDocument()
    expect(screen.getByDisplayValue('06:00')).toBeInTheDocument()
    expect(screen.getByDisplayValue(60)).toBeInTheDocument()

    // 第 1 行（已切到 habit）的起止时间输入 disabled
    // 行模板只有 2 行；用 getAllByLabelText 取所有，取第一个即可
    const startInputs = screen.getAllByLabelText('默认开始时间')
    const durationInputs = screen.getAllByLabelText('默认时长（分钟）')
    expect(startInputs[0]).toBeDisabled()
    expect(durationInputs[0]).toBeDisabled()
  })

  it('切到 task 并选具体 task 时：activityName 填 task.title，但时间可编辑', async () => {
    const user = userEvent.setup()
    render(<Harness initialSources={mockSources} />)

    const firstRowSourceSelect = screen.getAllByLabelText('行来源')[0]!
    await user.selectOptions(firstRowSourceSelect, 'task')

    const taskSelect = screen.getAllByLabelText('来源对象')[0]!
    await user.selectOptions(taskSelect, 'tk-1')

    expect(screen.getByDisplayValue('写周报')).toBeInTheDocument()
    // 时间输入不应被 disabled
    const startInputs = screen.getAllByLabelText('默认开始时间')
    for (const i of startInputs) {
      expect(i).not.toBeDisabled()
    }
  })

  it('source=object 但未选 sourceId 时应显示「请选择来源对象」', async () => {
    const user = userEvent.setup()
    render(<Harness initialSources={mockSources} />)

    const firstRowSourceSelect = screen.getAllByLabelText('行来源')[0]!
    await user.selectOptions(firstRowSourceSelect, 'habit')
    // 不选具体 habit
    expect(screen.getAllByText(/请选择来源对象/).length).toBeGreaterThan(0)
  })
})

// ─── 行增删 ────────────────────────────────────────────────────

describe('TemplateEditForm — 行增删', () => {
  it('点删除行 trash 按钮 → 行数 -1', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const before = screen.getAllByRole('button', { name: '删除行' })
    expect(before).toHaveLength(2)

    await user.click(before[0]!)
    expect(screen.getAllByRole('button', { name: '删除行' })).toHaveLength(1)
    expect(screen.getByText(/时间安排行（1）/)).toBeInTheDocument()
  })

  it('点「新增一行」→ 行数 +1，新行 source=custom + 09:00–10:00', async () => {
    const user = userEvent.setup()
    render(<Harness initialSources={mockSources} />)

    expect(screen.getByText(/时间安排行（2）/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /新增一行/ }))

    expect(screen.getByText(/时间安排行（3）/)).toBeInTheDocument()
    // 第 3 行是新增：自定义行无「来源对象」select，只有「行来源」select
    const sourceSelects = screen.getAllByLabelText('行来源')
    expect(sourceSelects).toHaveLength(3)
    // 新行的 source 应该是 'custom'（默认值）
    expect((sourceSelects[2] as HTMLSelectElement).value).toBe('custom')
    // 时间默认值 09:00 / 60 分钟应出现
    expect(screen.getAllByDisplayValue('09:00').length).toBeGreaterThan(0)
    expect(screen.getAllByDisplayValue(60).length).toBeGreaterThan(0)
  })
})

// ─── 星期切换 ─────────────────────────────────────────────────

describe('TemplateEditForm — 星期切换', () => {
  it('点星期 chip 应切换选中态（aria-pressed 翻转）', async () => {
    const user = userEvent.setup()
    render(<Harness initialTemplate={makeTemplate({ daysOfWeek: [1, 2, 3, 4, 5] })} />)
    const sunday = screen.getByRole('button', { name: '周日' })
    // 初始：未选
    expect(sunday).toHaveAttribute('aria-pressed', 'false')
    await user.click(sunday)
    expect(sunday).toHaveAttribute('aria-pressed', 'true')
  })
})

// ─── 名称输入 ──────────────────────────────────────────────────

describe('TemplateEditForm — 名称输入', () => {
  it('在名称输入框输入应反映到 value', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const input = screen.getByLabelText('模板名称')
    await user.clear(input)
    await user.type(input, '新名称')
    expect(screen.getByDisplayValue('新名称')).toBeInTheDocument()
  })
})

// ─── 时间输入（custom 行）─────────────────────────────────────

describe('TemplateEditForm — 时间输入（custom 行）', () => {
  it('非 habit 行的起止时间可编辑（changeRowSource 不锁时）', () => {
    render(<Harness initialSources={mockSources} />)
    const startInputs = screen.getAllByLabelText('默认开始时间')
    for (const i of startInputs) {
      expect(i).not.toBeDisabled()
    }
    const durationInputs = screen.getAllByLabelText('默认时长（分钟）')
    for (const i of durationInputs) {
      expect(i).not.toBeDisabled()
    }
  })

  it('输入新开始时间应出现在 input value 中', async () => {
    const user = userEvent.setup()
    render(<Harness initialSources={mockSources} />)
    const startInput = screen.getAllByLabelText('默认开始时间')[0]!
    await user.clear(startInput)
    await user.type(startInput, '08:15')
    expect(startInput).toHaveValue('08:15')
  })
})

// ─── 行内 activityName 自由编辑 ────────────────────────────────

describe('TemplateEditForm — custom 行名称编辑', () => {
  it('custom 行有独立 input；输入新值应生效', async () => {
    const user = userEvent.setup()
    render(<Harness initialSources={mockSources} />)
    // sources 已就绪但当前行 source=custom → 仍显示「活动名称」input
    const activityInput = screen.getByDisplayValue('起床')
    await user.clear(activityInput)
    await user.type(activityInput, '起床·改')
    expect(screen.getByDisplayValue('起床·改')).toBeInTheDocument()
  })
})

// ─── save / cancel 回调 ───────────────────────────────────────

describe('TemplateEditForm — save / cancel 回调', () => {
  it('点保存应触发 onSave', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(<Harness onSave={onSave} />)
    // 「保存」按钮在表单底部
    const buttons = screen.getAllByRole('button', { name: '保存' })
    await user.click(buttons[0]!)
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('点取消应触发 onCancel', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    render(<Harness onCancel={onCancel} />)
    await user.click(screen.getByRole('button', { name: '取消' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('名称为空时保存按钮应 disabled', () => {
    render(<Harness initialTemplate={makeTemplate({ name: '' })} />)
    const buttons = screen.getAllByRole('button', { name: '保存' })
    for (const b of buttons) {
      expect(b).toBeDisabled()
    }
  })
})

// ─── 行按 defaultStart 时间排序展示（[027-B] 形状重构）────────────────

describe('TemplateEditForm — 行按 defaultStart 排序展示', () => {
  it('按 defaultStart 升序展示，与 template.rows 输入顺序无关', () => {
    const tpl = makeTemplate({
      rows: [
        { id: 'late',  activityName: '晚间', defaultStart: '21:00', defaultDuration: 60, source: 'custom' },
        { id: 'noon',  activityName: '午间', defaultStart: '12:00', defaultDuration: 60, source: 'custom' },
        { id: 'morn',  activityName: '晨间', defaultStart: '07:30', defaultDuration: 90, source: 'custom' },
      ],
    })
    const { container } = render(<Harness initialTemplate={tpl} />)
    // 每个行容器有「默认开始时间」+「默认时长（分钟）」两个 input；按 row 顺序取每行第一个时间输入（start）
    const rowContainers = Array.from(
      container.querySelectorAll('div.flex.flex-col.gap-2.rounded.border'),
    )
    expect(rowContainers).toHaveLength(3)
    // 验证每行的 activityName 按 defaultStart 升序：晨间 07:30 → 午间 12:00 → 晚间 21:00
    expect(
      (rowContainers[0]!.querySelector('input[aria-label="活动名称"]') as HTMLInputElement)?.value,
    ).toBe('晨间')
    expect(
      (rowContainers[1]!.querySelector('input[aria-label="活动名称"]') as HTMLInputElement)?.value,
    ).toBe('午间')
    expect(
      (rowContainers[2]!.querySelector('input[aria-label="活动名称"]') as HTMLInputElement)?.value,
    ).toBe('晚间')
    // defaultStart time 也按升序
    expect(
      (rowContainers[0]!.querySelector('input[aria-label="默认开始时间"]') as HTMLInputElement)?.value,
    ).toBe('07:30')
    expect(
      (rowContainers[1]!.querySelector('input[aria-label="默认开始时间"]') as HTMLInputElement)?.value,
    ).toBe('12:00')
    expect(
      (rowContainers[2]!.querySelector('input[aria-label="默认开始时间"]') as HTMLInputElement)?.value,
    ).toBe('21:00')
  })
})

// ─── RowEditor 行为分叉（[027-B] Task 5）──────────────────────────

describe('TemplateEditForm — RowEditor 行为分叉 [027-B]', () => {
  it('custom 行渲原型选择器（可编辑）+ 5 个时间字段可编辑', async () => {
    const tpl = makeTemplate({
      rows: [{ id: 'rc', activityName: '读书', defaultStart: '09:00', defaultDuration: 60, source: 'custom', activityArchetypeId: 'a-1' }],
    })
    render(<Harness initialTemplate={tpl} initialSources={mockSources} />)
    // 原型选择器出现「更换/清除」（非只读）—— picker 异步加载 archetypes，等落幕
    expect(await screen.findByRole('button', { name: '更换活动原型' })).toBeInTheDocument()
    // 约束字段可编辑
    expect(screen.getByLabelText('最早开始时间')).not.toBeDisabled()
    expect(screen.getByLabelText('最短时长（分钟）')).not.toBeDisabled()
  })

  it('habit 行原型只读 + 时间只读', async () => {
    const user = userEvent.setup()
    render(<Harness initialSources={mockSources} />)
    await user.selectOptions(screen.getAllByLabelText('行来源')[0]!, 'habit')
    await user.selectOptions(screen.getAllByLabelText('来源对象')[0]!, 'h-1')
    // 习惯行不渲「更换活动原型」按钮（只读 picker）
    expect(screen.queryByRole('button', { name: '更换活动原型' })).not.toBeInTheDocument()
    // 时间字段只读
    expect(screen.getAllByLabelText('默认开始时间')[0]).toBeDisabled()
    expect(screen.getAllByLabelText('默认时长（分钟）')[0]).toBeDisabled()
    // 约束字段只读
    expect(screen.getAllByLabelText('最早开始时间')[0]).toBeDisabled()
  })

  it('task 行原型只读 + 时间/约束可编辑', async () => {
    const user = userEvent.setup()
    render(<Harness initialSources={mockSources} />)
    await user.selectOptions(screen.getAllByLabelText('行来源')[0]!, 'task')
    await user.selectOptions(screen.getAllByLabelText('来源对象')[0]!, 'tk-1')
    expect(screen.queryByRole('button', { name: '更换活动原型' })).not.toBeInTheDocument()
    expect(screen.getAllByLabelText('默认开始时间')[0]).not.toBeDisabled()
    expect(screen.getAllByLabelText('最早开始时间')[0]).not.toBeDisabled()
  })

  it('thread 行原型只读（空）+ 时间/约束可编辑（对称 task，thread 无原型来源）', async () => {
    const user = userEvent.setup()
    render(<Harness initialSources={mockSources} />)
    await user.selectOptions(screen.getAllByLabelText('行来源')[0]!, 'thread')
    await user.selectOptions(screen.getAllByLabelText('来源对象')[0]!, 'th-1')
    expect(screen.queryByRole('button', { name: '更换活动原型' })).not.toBeInTheDocument()
    expect(screen.getAllByLabelText('默认开始时间')[0]).not.toBeDisabled()
    expect(screen.getAllByLabelText('最早开始时间')[0]).not.toBeDisabled()
  })

  it('默认时长 <= 0 时 onBlur 显示错误', async () => {
    const user = userEvent.setup()
    render(<Harness initialSources={mockSources} />)
    const dur = screen.getAllByLabelText('默认时长（分钟）')[0]!
    await user.clear(dur)
    await user.type(dur, '0')
    dur.blur()
    expect(await screen.findByText(/默认时长须大于 0/)).toBeInTheDocument()
  })
})

// ─── within 用法验证（仅 sanity check）─────────────────────────

describe('TemplateEditForm — 容器可被 within() 查询', () => {
  it('form 内部所有按钮可被 within() 找到', () => {
    const { container } = render(<Harness />)
    // 顶层 div 包含所有行编辑器和底部按钮
    const main = container.firstChild as HTMLElement
    expect(within(main).getByRole('button', { name: /新增一行/ })).toBeInTheDocument()
  })
})