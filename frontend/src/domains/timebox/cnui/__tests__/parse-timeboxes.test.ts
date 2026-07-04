/**
 * @file parse-timeboxes.test
 * @brief [023.04] T3 parseTimeboxesIntent 纯规则解析单测
 *
 * MVP 实现：纯规则解析（中文时间词 + 序号）+ 标题匹配 todayTimeboxes。
 * 解析失败 → kind:'unsure'（handler.open 降级到 selecting）。
 */

import { describe, it, expect } from 'vitest'
import { parseTimeboxesIntent } from '../parse-timeboxes'
import type { TimeboxSummary } from '@/usom/types/summaries'

const today = [
  {
    id: 'tb1', title: '晨会', status: 'planned',
    startTime: '2026-07-04T09:00:00.000Z', endTime: '2026-07-04T10:00:00.000Z',
    taskIds: [], habitIds: [],
  },
  {
    id: 'tb2', title: '代码审查', status: 'planned',
    startTime: '2026-07-04T14:00:00.000Z', endTime: '2026-07-04T15:00:00.000Z',
    taskIds: [], habitIds: [],
  },
  {
    id: 'tb3', title: '下午客户拜访', status: 'planned',
    startTime: '2026-07-04T16:00:00.000Z', endTime: '2026-07-04T17:30:00.000Z',
    taskIds: [], habitIds: [],
  },
] as unknown as TimeboxSummary[]

const NOW = new Date('2026-07-04T08:00:00+08:00')

describe('[023.04] parseTimeboxesIntent — 纯规则', () => {
  it('解析「把早上的会议改到下午 14:00」 → kind=edit + timeboxId=tb1', async () => {
    const r = await parseTimeboxesIntent('把早上的会议改到下午 14:00', today, undefined, NOW)
    expect(r.kind).toBe('edit')
    if (r.kind === 'edit') {
      expect(r.timeboxId).toBe('tb1')
    }
  })

  it('解析「把代码审查改到 15:30」 → kind=edit + timeboxId=tb2', async () => {
    const r = await parseTimeboxesIntent('把代码审查改到 15:30', today, undefined, NOW)
    expect(r.kind).toBe('edit')
    if (r.kind === 'edit') {
      expect(r.timeboxId).toBe('tb2')
    }
  })

  it('解析「把早上的会议取消」 → kind=cancel + timeboxId=tb1', async () => {
    const r = await parseTimeboxesIntent('把早上的会议取消', today, undefined, NOW)
    expect(r.kind).toBe('cancel')
    if (r.kind === 'cancel') {
      expect(r.timeboxId).toBe('tb1')
    }
  })

  it('解析「删除下午客户拜访」 → kind=cancel + timeboxId=tb3', async () => {
    const r = await parseTimeboxesIntent('删除下午客户拜访', today, undefined, NOW)
    expect(r.kind).toBe('cancel')
    if (r.kind === 'cancel') {
      expect(r.timeboxId).toBe('tb3')
    }
  })

  it('解析「调整代码审查到 16:00」 → kind=edit', async () => {
    const r = await parseTimeboxesIntent('调整代码审查到 16:00', today, undefined, NOW)
    expect(r.kind).toBe('edit')
  })

  it('解析「帮我看一下今天的时间盒」 → kind=noop（走列表）', async () => {
    const r = await parseTimeboxesIntent('帮我看一下今天的时间盒', today, undefined, NOW)
    expect(r.kind).toBe('noop')
  })

  it('解析「不知道什么会议」 → kind=unsure（handler.open 降级到列表）', async () => {
    const r = await parseTimeboxesIntent('不知道什么会议改改', today, undefined, NOW)
    expect(r.kind).toBe('unsure')
  })

  // [023.04] C3 fold-in (user decision matrix): +2 case 让无目标小时降级为 unsure
  it('解析「14:00」纯数字 → kind=unsure（无目标 + 触发 confidence<0.5）', async () => {
    const r = await parseTimeboxesIntent('14:00', today, undefined, NOW)
    expect(r.kind).toBe('unsure')
  })

  it('解析「上午」仅时段词 → kind=unsure（无具体小时触发 confidence=0.4<0.5 门槛）', async () => {
    const r = await parseTimeboxesIntent('上午', today, undefined, NOW)
    expect(r.kind).toBe('unsure')
  })
})
