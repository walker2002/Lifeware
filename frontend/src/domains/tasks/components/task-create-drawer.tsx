/**
 * @file task-create-drawer
 * @brief 新建任务抽屉 — 右侧滑入，支持预填（title/threadId/parentId）
 *
 * 02b/02c/03b 共用：从「在下方新建子任务」、快速添加「+」、子任务区「+」入口打开。
 * 字段集对齐 TaskCreationCard；提交走 createTask；外壳样式对齐 TaskDetailDrawer。
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import { createTask, getThreads } from '@/app/actions/tasks'
import { parseDurationToMinutes } from '@/lib/format-duration'
import { useManifestRules } from '@/nexus/rules/use-manifest-rules'
import { taskRuleRegistry } from '../rules-registry'
import type { Task, Thread } from '../../../usom/types/objects'
import type { USOM_ID } from '../../../usom/types/primitives'
import type { Priority } from '../../../usom/types/primitives'
import { Button } from '@/components/ui/button'
import { ArchetypePicker } from '@/components/archetype/archetype-picker'

/** 新建任务预填项 */
export interface TaskCreateDefaults {
  /** 预填标题（来自快速添加框已输入文本） */
  title?: string
  /** 预填主线归属 */
  threadId?: string
  /** 预填父任务（子任务入口） */
  parentId?: string
}

/** TaskCreateDrawer Props */
interface TaskCreateDrawerProps {
  defaults: TaskCreateDefaults
  userId: USOM_ID
  onClose: () => void
  onCreated: (task: Task) => void
}

/** 抽屉宽度约束（对齐 TaskDetailDrawer） */
const DEFAULT_WIDTH = 560

const PRIORITY_OPTIONS = [
  { value: '', label: '不设置' },
  { value: 'critical', label: '紧急' },
  { value: 'high', label: '高' },
  { value: 'medium', label: '中' },
  { value: 'low', label: '低' },
]

/**
 * 新建任务抽屉组件
 */
export function TaskCreateDrawer({ defaults, onClose, onCreated }: TaskCreateDrawerProps) {
  const [title, setTitle] = useState(defaults.title ?? '')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('')
  const [durHours, setDurHours] = useState('')
  const [durMinutes, setDurMinutes] = useState('')
  const [threadId, setThreadId] = useState<string>(defaults.threadId ?? '')
  const [threads, setThreads] = useState<Thread[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [activityArchetypeId, setActivityArchetypeId] = useState<string | undefined>(undefined)

  const { errors: fieldErrors, validateField } = useManifestRules(taskRuleRegistry)

  useEffect(() => {
    let cancelled = false
    getThreads().then(data => { if (!cancelled) setThreads(data.map(d => d.thread)) })
      .catch(() => { /* 静默：主线加载失败不阻塞创建 */ })
    return () => { cancelled = true }
  }, [])

  const handleSubmit = useCallback(async () => {
    const trimmed = title.trim()
    if (!trimmed || submitting) return
    const totalMinutes = parseDurationToMinutes(durHours, durMinutes)
    setSubmitting(true)
    try {
      const created = await createTask({
        title: trimmed,
        description: description || undefined,
        priority: (priority || undefined) as Priority | undefined,
        estimatedDuration: totalMinutes > 0 ? totalMinutes : undefined,
        threadId: threadId || undefined,
        parentId: defaults.parentId || undefined,
        activityArchetypeId: activityArchetypeId || undefined,
      })
      toast.success(defaults.parentId ? '子任务已创建' : '任务已创建')
      onCreated(created)
    } catch (e) {
      console.error('[TaskCreateDrawer] 创建失败:', e)
      toast.error('创建任务失败，请重试')
    } finally {
      setSubmitting(false)
    }
  }, [title, description, priority, durHours, durMinutes, threadId, defaults.parentId, submitting, onCreated])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <>
      <div
        className="fixed inset-0 md:left-[260px] z-30 bg-scrim animate-in fade-in duration-200"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="fixed top-0 right-0 z-40 h-full bg-canvas border-l border-hairline shadow-xl flex flex-col animate-in slide-in-from-right duration-300"
        style={{ width: DEFAULT_WIDTH }}
        role="dialog"
        aria-modal="true"
        aria-label="新建任务"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between shrink-0 px-5 py-3 border-b border-hairline-soft">
          <h2 className="text-sm font-semibold text-ink">
            {defaults.parentId ? '新建子任务' : '新建任务'}
          </h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-body/60 hover:text-ink hover:bg-hover-overlay transition-colors" aria-label="关闭">
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label className="text-xs text-body mb-1 block">标题 <span className="text-error">*</span></label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              onBlur={() => validateField('title', title.trim())}
              placeholder="例如：完成周报"
              maxLength={100}
              autoFocus
              className="h-8 w-full rounded-md border border-hairline bg-canvas px-2 text-sm text-ink placeholder:text-body/70-soft focus:outline-none focus:ring-2 focus:ring-focus-ring"
            />
            {fieldErrors.title && <p className="text-xs text-error mt-0.5">{fieldErrors.title}</p>}
          </div>

          <div>
            <label className="text-xs text-body mb-1 block">描述</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="任务描述…"
              maxLength={500}
              rows={2}
              className="w-full rounded-md border border-hairline bg-canvas px-2 py-1.5 text-sm text-ink placeholder:text-body/70-soft focus:outline-none focus:ring-2 focus:ring-focus-ring resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-body mb-1 block">优先级</label>
              <select
                value={priority}
                onChange={e => setPriority(e.target.value)}
                onBlur={() => validateField('priority', priority)}
                className="h-8 w-full rounded-md border border-hairline bg-canvas px-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-focus-ring"
              >
                {PRIORITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-body mb-1 block">预估时长</label>
              <div className="flex items-center gap-1">
                <input
                  type="number" min={0} value={durHours}
                  onChange={e => setDurHours(e.target.value)}
                  onBlur={() => validateField('estimatedDuration', parseDurationToMinutes(durHours, durMinutes) || undefined)}
                  placeholder="0"
                  className="h-8 w-full rounded-md border border-hairline bg-canvas px-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-focus-ring"
                />
                <span className="text-xs text-body shrink-0">时</span>
                <input
                  type="number" min={0} max={59} value={durMinutes}
                  onChange={e => setDurMinutes(e.target.value)}
                  placeholder="0"
                  className="h-8 w-full rounded-md border border-hairline bg-canvas px-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-focus-ring"
                />
                <span className="text-xs text-body shrink-0">分</span>
              </div>
              {fieldErrors.estimatedDuration && <p className="text-xs text-error mt-0.5">{fieldErrors.estimatedDuration}</p>}
            </div>
          </div>

          <div>
            <label className="text-xs text-body mb-1 block">主线</label>
            <select
              value={threadId}
              onChange={e => setThreadId(e.target.value)}
              disabled={!!defaults.parentId}
              className="h-8 w-full rounded-md border border-hairline bg-canvas px-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-focus-ring disabled:opacity-60"
            >
              <option value="">普通任务（无主线）</option>
              {threads.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            {defaults.parentId && (
              <p className="text-xs text-body/70 mt-0.5">子任务归属父任务所在主线</p>
            )}
          </div>

          <div>
            <label className="text-xs text-body mb-1 block">活动原型</label>
            <ArchetypePicker
              value={activityArchetypeId}
              onChange={id => setActivityArchetypeId(id)}
              enableAiMatch
              title={title}
            />
          </div>
        </div>

        <div className="shrink-0 border-t border-hairline px-5 py-3 flex items-center justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>取消</Button>
          <Button onClick={handleSubmit} disabled={!title.trim() || submitting}>
            创建任务
          </Button>
        </div>
      </div>
    </>
  )
}
