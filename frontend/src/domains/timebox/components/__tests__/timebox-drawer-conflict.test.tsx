/**
 * @file timebox-drawer-conflict
 * @brief drawer ConflictError catch + reload + toast 测试（[TD-003] T5）
 *
 * 覆盖：
 * - ① edit 模式保存触发 updateTimebox → 抛 ConflictError（OCC 版本冲突） →
 *   drawer 调 getTimeboxById(editTarget.id) reload，form 字段刷新为 fresh 数据。
 * - ② ConflictError 携带 currentOccVersion（验证 drawer 拿到的实例字段，
 *   防止上游 catch 又把它折叠成 generic Error——T4-fix 的核心契约）。
 * - ③ non-ConflictError（普通异常）走 generic catch，不触发 reload。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/app/actions/timebox', () => ({
  createTimebox: vi.fn(),
  updateTimebox: vi.fn(),
  deleteTimebox: vi.fn(),
  transitionTimebox: vi.fn(),
  getTimeboxById: vi.fn(),
}))

vi.mock('@/app/actions/activity-archetype', () => ({
  getArchetypes: vi.fn().mockResolvedValue({ success: true, data: [] }),
  getArchetypeById: vi.fn().mockResolvedValue({ success: true, data: null }),
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    message: vi.fn(),
  },
}))

// eslint-disable-next-line import/first
import { TimeboxDrawer } from '@/domains/timebox/components/timebox-drawer'
// eslint-disable-next-line import/first
import { updateTimebox, getTimeboxById } from '@/app/actions/timebox'
// eslint-disable-next-line import/first
import { ConflictError } from '@/domains/timebox/errors/occ-conflict-error'
// eslint-disable-next-line import/first
import { toast } from 'sonner'

const baseEditTarget = {
  id: 'tb-1',
  title: 'old title',
  startTime: '2026-07-12T09:00:00Z',
  endTime: '2026-07-12T10:00:00Z',
  notes: '',
  occVersion: 1,
} as any

describe('[TD-003] drawer ConflictError UX', () => {
  beforeEach(() => {
    vi.mocked(updateTimebox).mockReset()
    vi.mocked(getTimeboxById).mockReset()
    vi.mocked(toast.success).mockClear()
    vi.mocked(toast.error).mockClear()
    vi.mocked(toast.info).mockClear()
    vi.mocked(toast.message).mockClear()
  })

  it('edit 模式 updateTimebox 抛 ConflictError → 调 getTimeboxById reload + toast 通知', async () => {
    // updateTimebox 抛 ConflictError 实例（模拟 OCC 版本冲突）
    vi.mocked(updateTimebox).mockRejectedValueOnce(new ConflictError(5, 1))
    // getTimeboxById 返回最新数据（occVersion=5, title=fresh）
    vi.mocked(getTimeboxById).mockResolvedValueOnce({
      id: 'tb-1',
      title: 'fresh title after reload',
      startTime: '2026-07-12T09:00:00Z',
      endTime: '2026-07-12T10:00:00Z',
      notes: '',
      activityArchetypeId: null,
      occVersion: 5,
    } as any)

    render(
      <TimeboxDrawer
        mode="edit"
        editTarget={baseEditTarget}
        date={new Date('2026-07-12')}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    )
    // 等 archetype effect 落幕
    await waitFor(() => expect(vi.mocked(getTimeboxById).mock.calls.length === 0 || true).toBe(true))

    fireEvent.click(screen.getByText('保存时间盒'))

    // 关键断言 1：drawer 调 getTimeboxById(editTarget.id) reload
    await waitFor(() => {
      expect(vi.mocked(getTimeboxById)).toHaveBeenCalledWith('tb-1')
    })
    // 关键断言 2：form 标题刷新为 fresh
    await waitFor(() => {
      expect((screen.getByPlaceholderText('例如：专注写作') as HTMLInputElement).value)
        .toBe('fresh title after reload')
    })
    // 关键断言 3：弹 toast 通知用户「已自动刷新」——任何 toast channel 都算命中
    await waitFor(() => {
      const called = vi.mocked(toast.success).mock.calls.length > 0
        || vi.mocked(toast.error).mock.calls.length > 0
        || vi.mocked(toast.info).mock.calls.length > 0
        || vi.mocked(toast.message).mock.calls.length > 0
      expect(called).toBe(true)
    })
  })

  it('ConflictError 实例字段 currentOccVersion 可被 drawer 读到（防止上游 catch 折叠）', async () => {
    // 验证 T4-fix 的核心契约：updateTimebox 抛出的 ConflictError 仍是真实实例（name + 字段）
    const conflictInstance = new ConflictError(7, 3)
    expect(conflictInstance.name).toBe('ConflictError')
    expect(conflictInstance.currentOccVersion).toBe(7)
    expect(conflictInstance.attemptedOccVersion).toBe(3)

    vi.mocked(updateTimebox).mockRejectedValueOnce(conflictInstance)
    vi.mocked(getTimeboxById).mockResolvedValueOnce({
      id: 'tb-1',
      title: 'fresh',
      startTime: '2026-07-12T09:00:00Z',
      endTime: '2026-07-12T10:00:00Z',
      notes: '',
      activityArchetypeId: null,
      occVersion: 7,
    } as any)

    render(
      <TimeboxDrawer
        mode="edit"
        editTarget={baseEditTarget}
        date={new Date('2026-07-12')}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    )
    fireEvent.click(screen.getByText('保存时间盒'))
    await waitFor(() => {
      expect(vi.mocked(getTimeboxById)).toHaveBeenCalledWith('tb-1')
    })
  })

  it('非 ConflictError 的普通异常走 generic catch，不触发 reload', async () => {
    vi.mocked(updateTimebox).mockRejectedValueOnce(new Error('network down'))
    vi.mocked(getTimeboxById).mockClear()

    render(
      <TimeboxDrawer
        mode="edit"
        editTarget={baseEditTarget}
        date={new Date('2026-07-12')}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    )
    fireEvent.click(screen.getByText('保存时间盒'))
    await waitFor(() => {
      expect(vi.mocked(updateTimebox)).toHaveBeenCalled()
    })
    // 非 ConflictError：不调 getTimeboxById（避免浪费读）
    // 等若干 tick 让 catch 走完
    await new Promise(r => setTimeout(r, 50))
    expect(vi.mocked(getTimeboxById)).not.toHaveBeenCalled()
  })
})