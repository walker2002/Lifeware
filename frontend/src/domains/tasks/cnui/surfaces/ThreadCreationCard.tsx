/**
 * @file ThreadCreationCard
 * @brief 主线创建卡片 CNUI Surface
 *
 * CNUI 表面 — 用于对话内创建主线。
 * [018-G3] R3：集成 useManifestRules 客户端 realtime blur 校验 + 服务端错误回填。
 */

'use client'

import { useState, useEffect } from 'react'

// [018-G3] R3：client 组件不可从 barrel @/nexus/rules import
import { useManifestRules, useServerErrorBackfill } from '@/nexus/rules/use-manifest-rules'
import { taskRuleRegistry } from '../../rules-registry'

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
  /** [018-G3] R3：服务端 submit 失败返回的 errors（按字段标红，匹配不上走表单级） */
  serverErrors?: string[]
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
  serverErrors,
}: ThreadCreationCardProps) {
  const [name, setName] = useState((dataModel.name as string) ?? '')
  const [description, setDescription] = useState((dataModel.description as string) ?? '')
  const [color, setColor] = useState((dataModel.color as string) ?? '#3498DB')
  const [priority, setPriority] = useState((dataModel.priority as string) ?? '')

  // [020] registry 即 SSOT：realtime meta 从 registry 派生，直传 registry（删 getRealtimeRules 中转）
  const { errors: fieldErrors, validateField } = useManifestRules(taskRuleRegistry)

  // R3 回填：从 serverErrors + registry 派生字段/表单级错误（useServerErrorBackfill 共享 hook）
  const { serverFieldErrors, formErrors } = useServerErrorBackfill(serverErrors, taskRuleRegistry)

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
      <p className="text-sm text-ink text-center py-2">✅ 主线已创建</p>
    )
  }

  return (
    <>
      <div className="space-y-3">
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
          {/* 自定义颜色输入（R3：手动输入触发 realtime 校验） */}
          <div className="mt-1.5">
            <input
              type="text"
              value={color}
              onChange={e => {
                setColor(e.target.value)
                onDataChange({ ...dataModel, color: e.target.value })
              }}
              onBlur={() => validateField('color', color)}
              placeholder="#RRGGBB"
              maxLength={7}
              className="h-7 w-24 rounded-md border border-hairline bg-canvas px-2 text-xs text-ink placeholder:text-body/70-soft focus:outline-none focus:ring-2 focus:ring-focus-ring"
            />
          </div>
          {(fieldErrors.color || serverFieldErrors.color) && (
            <p className="text-xs text-error mt-0.5">{fieldErrors.color || serverFieldErrors.color}</p>
          )}
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
            onBlur={() => validateField('priority', priority)}
            className="h-8 w-full rounded-md border border-hairline bg-canvas px-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-focus-ring"
          >
            <option value="">不设置</option>
            <option value="critical">紧急</option>
            <option value="high">高</option>
            <option value="medium">中</option>
            <option value="low">低</option>
          </select>
          {(fieldErrors.priority || serverFieldErrors.priority) && (
            <p className="text-xs text-error mt-0.5">{fieldErrors.priority || serverFieldErrors.priority}</p>
          )}
        </div>

        {/* 表单级错误 */}
        {formErrors.length > 0 && (
          <div className="rounded-md border border-error bg-error-soft px-2.5 py-1.5 text-xs text-error">
            {formErrors.map((err, i) => <div key={i}>{err}</div>)}
          </div>
        )}

        {/* 操作按钮 */}
        <div className="flex items-center justify-end gap-2 pt-2">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md border border-hairline px-3 py-1.5 text-xs text-ink hover:bg-hover-overlay transition-colors"
            >
              取消
            </button>
          )}
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!name.trim() || isLoading}
            className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50 transition-colors"
          >
            创建主线
          </button>
        </div>
      </div>
    </>
  )
}
