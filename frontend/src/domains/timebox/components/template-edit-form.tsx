/**
 * @file template-edit-form
 * @brief 时间盒模板 Sheet 抽屉内的行编辑器（[023-02]）
 *
 * 从 timebox-template-editor.tsx 抽出（决议 C.3），便于独立单测 + 关注点分离。
 * 父组件 TimeboxTemplateEditor 通过 props 传入 template / sources / 回调；
 * 本组件本身不持有持久状态，所有变更通过 onChange(template) 冒泡给父。
 *
 * 设计要点（[023-02] 决议 B.1 / B.2 / B.3 / D.1）：
 * - B.1：所有「来源」<select> 在 sources === null 时禁用，避免 fire-and-forget
 *   竞态导致用户切到 habit 看到空下拉。
 * - B.2：行按用户编辑顺序展示（template.rows 直接渲染），不调 sortRowsByStart；
 *   TemplateCard 仍排序用于展示。
 * - B.3：DEFAULT_SEGMENT_SEED 单点维护见 lib/template-row-helpers.ts:DEFAULT_SEGMENT_SEED。
 * - D.1：行编辑器抽为 RowEditor 子组件，React.memo 包裹；name 输入变化时不会
 *   触发单行 re-render。
 *
 * 数据流 ASCII（A.3）：
 *   PageBanner
 *     └─► TemplateCard 网格（width 自适应，1/2/3 列）
 *           └─► 点击「编辑」onEdit() 触发：
 *                 ├─► ensureSources() [fire-and-forget, 1 min cache]
 *                 │     └─► fetchSubscriptionSources (server action)
 *                 │           └─► setSources({habits, tasks, threads})
 *                 └─► setEditing(template) → Sheet.open = true
 *                       └─► TemplateEditForm (本组件)
 *                             ├─► onChange={(t) => setEditing(t)} → setState 全模板引用替换
 *                             ├─► 行内 onChange → updateRow(id, patch) → setState 新 rows 数组
 *                             ├─► 来源下拉 changeRowSource(id, source, sourceId?) → resolve from sources
 *                             └─► onSave → saveTimeboxTemplate → repo.create/update → 乐观 setTemplates → setEditing(null)
 */
'use client'

import React, { useCallback } from 'react'
import { Plus, Loader2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { TimeboxTemplate } from '@/lib/db/repositories/timebox-template'
import type { TemplateRow, TemplateRowSource } from '@/lib/db/schema'
import {
  WEEKDAY_LABELS,
  newEmptyRow,
} from '@/domains/timebox/lib/template-row-helpers'
import type { SubscriptionSources } from '@/app/actions/timebox-templates'

/** 视图层 SourceItem 类型（habits 含 start/end；tasks/threads 仅 id+title） */
interface SourceHabit { id: string; title: string; start: string; end: string }
interface SourceItem { id: string; title: string }

export interface TemplateEditFormProps {
  template: TimeboxTemplate
  sources: SubscriptionSources | null
  onChange: (t: TimeboxTemplate) => void
  onSave: () => void
  onCancel: () => void
  saving: boolean
}

// ─── 行编辑器（React.memo，D.1）─────────────────────────────────

interface RowEditorProps {
  row: TemplateRow
  sources: SubscriptionSources | null
  onUpdate: (id: string, patch: Partial<TemplateRow>) => void
  onDelete: (id: string) => void
  onSourceChange: (id: string, newSource: TemplateRowSource, newSourceId?: string) => void
}

/**
 * 单行编辑器：来源下拉 + 名称/对象选择 + 起止时间 + 删除。
 * 用 React.memo 避免父组件 name 字段输入时整张表单 re-render 风暴。
 */
const RowEditor = React.memo(function RowEditor({
  row,
  sources,
  onUpdate,
  onDelete,
  onSourceChange,
}: RowEditorProps) {
  const isHabit = row.source === 'habit'
  const isObjectSource = row.source === 'habit' || row.source === 'task' || row.source === 'thread'
  const sourcesReady = sources !== null

  const sourceList: Array<{ id: string; title: string }> | null =
    !sources ? null :
    row.source === 'habit' ? sources.habits :
    row.source === 'task' ? sources.tasks :
    row.source === 'thread' ? sources.threads : []

  return (
    <div className="flex flex-col gap-1 rounded border border-hairline bg-surface-card p-2">
      <div className="flex items-center gap-1 flex-wrap">
        {/* 来源下拉（B.1：sources 未就绪时禁用 + 显示加载态） */}
        <select
          aria-label="行来源"
          value={row.source}
          disabled={!sourcesReady}
          onChange={(e) => {
            const v = e.target.value
            if (v === 'habit' || v === 'task' || v === 'thread' || v === 'custom') {
              onSourceChange(row.id, v)
            }
          }}
          className="h-7 rounded border border-hairline bg-canvas px-1 text-xs text-ink disabled:opacity-60"
        >
          <option value="custom">自定义</option>
          <option value="habit">习惯</option>
          <option value="task">任务</option>
          <option value="thread">主线</option>
        </select>

        {/* 活动名称 / 来源对象选择 */}
        {isObjectSource && sourceList ? (
          <select
            aria-label="来源对象"
            value={row.sourceId ?? ''}
            onChange={(e) => onSourceChange(row.id, row.source, e.target.value || undefined)}
            className="h-7 flex-1 min-w-0 rounded border border-hairline bg-canvas px-1 text-xs text-ink"
          >
            <option value="">— 选择{row.source === 'habit' ? '习惯' : row.source === 'task' ? '任务' : '主线'} —</option>
            {sourceList.map((it) => (
              <option key={it.id} value={it.id}>{it.title}</option>
            ))}
          </select>
        ) : (
          <input
            aria-label="活动名称"
            value={row.activityName}
            placeholder="活动名称"
            onChange={(e) => onUpdate(row.id, { activityName: e.target.value })}
            className="h-7 flex-1 min-w-0 rounded border border-hairline bg-canvas px-1 text-xs text-ink"
          />
        )}

        {/* 起止时间（habit 时禁用：起止由习惯 defaultTime/duration 锁定） */}
        <input
          aria-label="开始时间"
          type="time"
          value={row.start}
          disabled={isHabit}
          onChange={(e) => onUpdate(row.id, { start: e.target.value })}
          className="h-7 rounded border border-hairline bg-canvas px-1 text-xs text-ink disabled:opacity-60"
        />
        <span className="text-xs text-muted-foreground">—</span>
        <input
          aria-label="结束时间"
          type="time"
          value={row.end}
          disabled={isHabit}
          onChange={(e) => onUpdate(row.id, { end: e.target.value })}
          className="h-7 rounded border border-hairline bg-canvas px-1 text-xs text-ink disabled:opacity-60"
        />

        <Button
          size="sm"
          variant="ghost"
          className="text-destructive hover:text-destructive h-7 px-2"
          onClick={() => onDelete(row.id)}
          aria-label="删除行"
        >
          <Trash2 className="size-3" />
        </Button>
      </div>

      {/* sources 加载态指示（B.1） */}
      {!sourcesReady && (
        <p className="text-[10px] text-muted-foreground">加载订阅源…</p>
      )}

      {/* 提示用户需选择具体来源对象 */}
      {row.source !== 'custom' && !row.sourceId && sourcesReady && (
        <p className="text-[10px] text-muted-foreground">请选择来源对象</p>
      )}
    </div>
  )
})

// ─── 主组件 ─────────────────────────────────────────────────────

/**
 * 时间盒模板 Sheet 抽屉内容区。
 * - 名称输入
 * - 星期多选 chips（全不选=不限）
 * - 行列表编辑器（B.2：按编辑顺序展示，不排序）
 * - 保存 / 取消按钮（带 saving 态 Loader2）
 */
export function TemplateEditForm({
  template,
  sources,
  onChange,
  onSave,
  onCancel,
  saving,
}: TemplateEditFormProps) {
  const toggleWeekday = useCallback((value: number) => {
    const set = new Set(template.daysOfWeek)
    if (set.has(value)) set.delete(value)
    else set.add(value)
    const arr = [...set].sort((a, b) => a - b)
    onChange({ ...template, daysOfWeek: arr })
  }, [template, onChange])

  const updateRow = useCallback((id: string, patch: Partial<TemplateRow>) => {
    onChange({
      ...template,
      rows: template.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    })
  }, [template, onChange])

  const deleteRow = useCallback((id: string) => {
    onChange({ ...template, rows: template.rows.filter((r) => r.id !== id) })
  }, [template, onChange])

  const addRow = useCallback(() => {
    onChange({ ...template, rows: [...template.rows, newEmptyRow()] })
  }, [template, onChange])

  const changeRowSource = useCallback((
    id: string,
    newSource: TemplateRowSource,
    newSourceId?: string,
  ) => {
    const row = template.rows.find((r) => r.id === id)
    if (!row) return

    if (newSource === 'habit' && newSourceId && sources) {
      const h: SourceHabit | undefined = sources.habits.find((x) => x.id === newSourceId)
      if (h) {
        onChange({
          ...template,
          rows: template.rows.map((r) =>
            r.id === id
              ? { ...r, source: 'habit', sourceId: newSourceId, activityName: h.title, start: h.start, end: h.end }
              : r,
          ),
        })
        return
      }
    }
    if ((newSource === 'task' || newSource === 'thread') && newSourceId && sources) {
      const list: SourceItem[] = newSource === 'task' ? sources.tasks : sources.threads
      const item = list.find((x) => x.id === newSourceId)
      if (item) {
        onChange({
          ...template,
          rows: template.rows.map((r) =>
            r.id === id ? { ...r, source: newSource, sourceId: newSourceId, activityName: item.title } : r,
          ),
        })
        return
      }
    }
    // custom 或 sources 未就绪：仅切来源，sourceId 清空，名称保留
    onChange({
      ...template,
      rows: template.rows.map((r) =>
        r.id === id ? { ...r, source: newSource, sourceId: undefined, activityName: r.activityName } : r,
      ),
    })
  }, [template, sources, onChange])

  return (
    <div className="flex flex-col gap-4 mt-4 flex-1 overflow-y-auto">
      {/* 名称 */}
      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">模板名称</span>
        <input
          aria-label="模板名称"
          value={template.name}
          placeholder="如：工作日模板"
          onChange={(e) => onChange({ ...template, name: e.target.value })}
          className="h-8 rounded-md border border-hairline bg-canvas px-2 text-sm text-ink"
        />
      </label>

      {/* 星期 chips */}
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">应用范围（可多选；全不选=不限）</span>
        <div className="flex flex-wrap gap-1">
          {WEEKDAY_LABELS.map((w) => {
            const on = template.daysOfWeek.includes(w.value)
            return (
              <button
                key={w.value}
                type="button"
                onClick={() => toggleWeekday(w.value)}
                aria-pressed={on}
                className={
                  on
                    ? 'rounded px-2 py-0.5 text-xs bg-primary text-primary-foreground'
                    : 'rounded px-2 py-0.5 text-xs bg-surface-card text-body border border-hairline'
                }
              >
                {w.long}
              </button>
            )
          })}
        </div>
      </div>

      {/* 行列表（B.2：按编辑顺序展示，不排序） */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">时间安排行（{template.rows.length}）</span>
          <Button size="sm" variant="outline" onClick={addRow}>
            <Plus className="size-3 mr-1" />
            新增一行
          </Button>
        </div>

        {template.rows.length === 0 && (
          <p className="text-xs text-muted-foreground">暂无行，点击「新增一行」开始添加</p>
        )}

        {template.rows.map((r) => (
          <RowEditor
            key={r.id}
            row={r}
            sources={sources}
            onUpdate={updateRow}
            onDelete={deleteRow}
            onSourceChange={changeRowSource}
          />
        ))}
      </div>

      {/* 操作 */}
      <div className="flex justify-end gap-2 pt-2 border-t border-hairline">
        <Button size="sm" variant="secondary" onClick={onCancel}>
          取消
        </Button>
        <Button size="sm" onClick={onSave} disabled={!template.name.trim() || saving}>
          {saving ? (
            <>
              <Loader2 className="mr-1 size-3 animate-spin" />
              保存中
            </>
          ) : (
            '保存'
          )}
        </Button>
      </div>
    </div>
  )
}