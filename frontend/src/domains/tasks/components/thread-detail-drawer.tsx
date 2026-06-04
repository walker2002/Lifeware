/**
 * @file thread-detail-drawer
 * @brief 主线创建/详情 Drawer 组件
 */

'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ThreadRepository } from '../repository/thread'

const PRESET_COLORS = ['#E74C3C', '#E67E22', '#F1C40F', '#2ECC71', '#1ABC9C', '#3498DB', '#9B59B6', '#95A5A6']

interface ThreadDetailDrawerProps {
  threadId: string
  onClose: () => void
}

export function ThreadDetailDrawer({ threadId, onClose }: ThreadDetailDrawerProps) {
  const isCreate = threadId === '__new__'
  const [name, setName] = useState('')
  const [color, setColor] = useState('#3498DB')
  const [priority, setPriority] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)
    const repo = new ThreadRepository()
    const userId = 'placeholder' as any
    try {
      await repo.create({
        name: name.trim(),
        color,
        priority: priority as any || undefined,
        startDate: startDate as any || undefined,
        endDate: endDate as any || undefined,
        description: description || undefined,
      }, userId)
      onClose()
    } catch (e) {
      setSaving(false)
    }
  }

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 z-30 bg-[rgba(20,20,19,0.3)]" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed right-0 top-0 z-40 h-full w-[480px] bg-canvas shadow-lg border-l border-hairline flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-hairline shrink-0">
          <h2 className="text-base font-semibold text-ink">
            {isCreate ? '创建主线' : '编辑主线'}
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="关闭">
            <X className="size-4" />
          </Button>
        </div>

        {/* Form body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Name */}
          <div>
            <label htmlFor="thread-name" className="block text-sm font-medium text-ink mb-1.5">主线名称 *</label>
            <input
              id="thread-name"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={50}
              placeholder="例如：事业进阶"
              className="w-full h-9 rounded-md border border-hairline bg-canvas px-3 text-sm text-ink placeholder:text-muted-soft focus:outline-none focus:ring-2 focus:ring-[rgba(204,120,92,0.3)]"
            />
          </div>

          {/* Color picker */}
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">颜色</label>
            <div className="flex gap-2 flex-wrap">
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className="size-8 rounded-md border-2 transition-colors hover:scale-110"
                  style={{
                    backgroundColor: c,
                    borderColor: c === color ? '#141413' : 'transparent',
                  }}
                  aria-label={`颜色 ${c}`}
                />
              ))}
            </div>
          </div>

          {/* Priority */}
          <div>
            <label htmlFor="thread-priority" className="block text-sm font-medium text-ink mb-1.5">优先级</label>
            <select
              id="thread-priority"
              value={priority}
              onChange={e => setPriority(e.target.value)}
              className="w-full h-9 rounded-md border border-hairline bg-canvas px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-[rgba(204,120,92,0.3)]"
            >
              <option value="">不设置</option>
              <option value="critical">紧急</option>
              <option value="high">高</option>
              <option value="medium">中</option>
              <option value="low">低</option>
            </select>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="thread-start" className="block text-sm font-medium text-ink mb-1.5">开始日期</label>
              <input id="thread-start" type="date" value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full h-9 rounded-md border border-hairline bg-canvas px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-[rgba(204,120,92,0.3)]" />
            </div>
            <div>
              <label htmlFor="thread-end" className="block text-sm font-medium text-ink mb-1.5">结束日期</label>
              <input id="thread-end" type="date" value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-full h-9 rounded-md border border-hairline bg-canvas px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-[rgba(204,120,92,0.3)]" />
            </div>
          </div>

          {/* Description */}
          <div>
            <label htmlFor="thread-desc" className="block text-sm font-medium text-ink mb-1.5">描述</label>
            <textarea
              id="thread-desc"
              value={description}
              onChange={e => setDescription(e.target.value)}
              maxLength={500}
              rows={4}
              placeholder="主线的描述说明…"
              className="w-full rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-ink placeholder:text-muted-soft focus:outline-none focus:ring-2 focus:ring-[rgba(204,120,92,0.3)] resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-hairline shrink-0">
          <Button variant="secondary" onClick={onClose}>取消</Button>
          <Button onClick={handleSave} disabled={!name.trim() || saving}>
            {saving ? (
              <><div className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent mr-2" />保存中…</>
            ) : '创建主线'}
          </Button>
        </div>
      </div>
    </>
  )
}
