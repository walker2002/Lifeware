/**
 * @file ThreadCreationCard
 * @brief 主线创建卡片 CNUI Surface
 *
 * CNUI 表面 — 用于对话内创建主线
 */

'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CnuiButton } from '@/components/cnui/components/Button'

/** 预设颜色列表 */
const PRESET_COLORS = ['#3498DB', '#2ECC71', '#E74C3C', '#F39C12', '#9B59B6', '#1ABC9C', '#E67E22', '#6366f1']

/**
 * ThreadCreationCard 组件属性
 */
interface ThreadCreationCardProps {
  surfaceType: string
  dataModel: Record<string, unknown>
  onDataChange: (data: Record<string, unknown>) => void
  onConfirm: (data: Record<string, unknown>) => void
  onCancel?: () => void
  isLoading?: boolean
  isDone?: boolean
}

/**
 * 主线创建卡片组件
 * @description AI 对话内展示的主线创建表单
 */
export function ThreadCreationCard({
  dataModel,
  onDataChange,
  onConfirm,
  onCancel,
  isLoading,
  isDone,
}: ThreadCreationCardProps) {
  const [name, setName] = useState((dataModel.name as string) ?? '')
  const [description, setDescription] = useState((dataModel.description as string) ?? '')
  const [color, setColor] = useState((dataModel.color as string) ?? '#3498DB')
  const [priority, setPriority] = useState((dataModel.priority as string) ?? '')

  function handleConfirm() {
    if (!name.trim()) return
    onConfirm({
      name: name.trim(),
      description: description || undefined,
      color,
      priority: priority || undefined,
    })
  }

  if (isDone) {
    return (
      <Card className="w-full max-w-md">
        <CardContent className="pt-4 text-center">
          <p className="text-sm text-ink">✅ 主线已创建</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>创建主线</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* 主线名称 */}
        <div>
          <label className="text-xs text-body mb-1 block">
            主线名称 <span className="text-error">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={e => {
              setName(e.target.value)
              onDataChange({ ...dataModel, name: e.target.value })
            }}
            placeholder="例如：事业进阶"
            maxLength={50}
            className="h-8 w-full rounded-md border border-hairline bg-canvas px-2 text-sm text-ink placeholder:text-body/70-soft focus:outline-none focus:ring-2 focus:ring-focus-ring"
          />
        </div>

        {/* 描述 */}
        <div>
          <label className="text-xs text-body mb-1 block">描述</label>
          <textarea
            value={description}
            onChange={e => {
              setDescription(e.target.value)
              onDataChange({ ...dataModel, description: e.target.value })
            }}
            placeholder="主线的描述说明…"
            maxLength={500}
            rows={3}
            className="w-full rounded-md border border-hairline bg-canvas px-2 py-1.5 text-sm text-ink placeholder:text-body/70-soft focus:outline-none focus:ring-2 focus:ring-focus-ring resize-none"
          />
        </div>

        {/* 颜色 */}
        <div>
          <label className="text-xs text-body mb-1 block">颜色标签</label>
          <div className="flex items-center gap-2 flex-wrap">
            {PRESET_COLORS.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  setColor(c)
                  onDataChange({ ...dataModel, color: c })
                }}
                className="size-7 rounded-md border-2 transition-colors hover:scale-110"
                style={{
                  backgroundColor: c,
                  borderColor: c === color ? 'var(--ink)' : 'transparent',
                }}
                aria-label={`颜色 ${c}`}
              />
            ))}
          </div>
        </div>

        {/* 优先级 */}
        <div>
          <label className="text-xs text-body mb-1 block">优先级</label>
          <select
            value={priority}
            onChange={e => {
              setPriority(e.target.value)
              onDataChange({ ...dataModel, priority: e.target.value })
            }}
            className="h-8 w-full rounded-md border border-hairline bg-canvas px-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-focus-ring"
          >
            <option value="">不设置</option>
            <option value="critical">紧急</option>
            <option value="high">高</option>
            <option value="medium">中</option>
            <option value="low">低</option>
          </select>
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center gap-2 pt-2">
          <CnuiButton
            label="创建主线"
            onClick={handleConfirm}
            disabled={!name.trim() || isLoading}
          />
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md px-3 py-1.5 text-xs text-body/60 hover:text-ink transition-colors"
            >
              取消
            </button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
