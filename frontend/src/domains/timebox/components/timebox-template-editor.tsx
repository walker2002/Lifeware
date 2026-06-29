/**
 * @file timebox-template-editor
 * @brief 时间盒模板编辑器（[023] A2，配置类，7 段生存时间 + pull 订阅）
 *
 * 列表 + 新建/编辑模态。CRUD 经 app/actions/timebox-templates（server action）。
 * 订阅源懒加载。配色用 CSS 变量令牌（§14 C-04）。
 *
 * 设计令牌约定（[024.1] Design Patch）：
 * - bg-surface-card 替代 bg-muted
 * - Loader2 替换「保存中…」文本（§6.7）
 * - 删除用 AlertDialog 二次确认
 */
'use client'

import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import { Plus, Trash2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  saveTimeboxTemplate,
  deleteTimeboxTemplate,
  fetchSubscriptionSources,
} from '@/app/actions/timebox-templates'
import type { TimeboxTemplate } from '@/lib/db/repositories/timebox-template'

/** 7 段生存时间（锁，参 design §2.1；新增/编辑按此顺序渲染） */
const SEGMENTS: { key: string; label: string }[] = [
  { key: 'wake', label: '起床' },
  { key: 'morning', label: '晨间' },
  { key: 'workAm', label: '上午上班' },
  { key: 'noon', label: '午间' },
  { key: 'workPm', label: '下午上班' },
  { key: 'evening', label: '晚间' },
  { key: 'sleep', label: '睡眠' },
]

/** 订阅源条目（habits/tasks/threads 共用） */
interface SourceItem {
  id: string
  title: string
}

interface SourcesState {
  habits: SourceItem[]
  tasks: SourceItem[]
  threads: SourceItem[]
}

interface EditorProps {
  initialTemplates: TimeboxTemplate[]
}

/** 默认空白模板 */
function blankTemplate(): TimeboxTemplate {
  const survivalSegments = Object.fromEntries(
    SEGMENTS.map((s) => [s.key, { start: '09:00', end: '10:00' }]),
  ) as Record<string, { start: string; end: string }>
  return {
    id: '' as TimeboxTemplate['id'],
    userId: '' as TimeboxTemplate['userId'],
    schemaVersion: 1,
    name: '',
    survivalSegments,
    subscribedHabits: [],
    subscribedTasks: [],
    subscribedThreads: [],
    createdAt: '',
    updatedAt: '',
  }
}

/** 切换某集合中 id 的订阅状态 */
function toggleId(list: string[] | undefined, id: string): string[] {
  const arr = list ?? []
  return arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]
}

export function TimeboxTemplateEditor({ initialTemplates }: EditorProps) {
  const [templates, setTemplates] = useState<TimeboxTemplate[]>(initialTemplates)
  const [editing, setEditing] = useState<TimeboxTemplate | null>(null)
  const [sources, setSources] = useState<SourcesState>({ habits: [], tasks: [], threads: [] })
  const [sourcesLoaded, setSourcesLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  /** 懒加载订阅源（仅首次打开编辑时拉取） */
  const ensureSources = useCallback(async () => {
    if (sourcesLoaded) return
    const r = await fetchSubscriptionSources()
    if (r.success && r.data) {
      setSources(r.data)
      setSourcesLoaded(true)
    } else {
      toast.error(r.error ?? '拉取订阅源失败')
    }
  }, [sourcesLoaded])

  // ─── 保存 ────────────────────────────────────────────────────
  async function handleSave() {
    if (!editing) return
    if (!editing.name.trim()) {
      toast.error('请输入模板名称')
      return
    }
    setSaving(true)
    try {
      const input = {
        name: editing.name.trim(),
        survivalSegments: editing.survivalSegments,
        subscribedHabits: editing.subscribedHabits,
        subscribedTasks: editing.subscribedTasks,
        subscribedThreads: editing.subscribedThreads,
      }
      const r = await saveTimeboxTemplate(
        editing.id ? { id: editing.id, ...input } : input,
      )
      if (!r.success) {
        toast.error(r.error ?? '保存失败')
        return
      }
      toast.success('模板已保存')
      if (r.data) {
        setTemplates((prev) => {
          const exists = prev.some((t) => t.id === r.data!.id)
          return exists ? prev.map((t) => (t.id === r.data!.id ? r.data! : t)) : [...prev, r.data!]
        })
      } else {
        // 退化路径：刷新本地列表兜底
        setTemplates((prev) => [...prev])
      }
      setEditing(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  // ─── 删除 ────────────────────────────────────────────────────
  async function handleConfirmDelete() {
    if (!pendingDeleteId) return
    const r = await deleteTimeboxTemplate(pendingDeleteId)
    if (r.success) {
      setTemplates((prev) => prev.filter((t) => t.id !== pendingDeleteId))
      toast.success('模板已删除')
    } else {
      toast.error(r.error ?? '删除失败')
    }
    setPendingDeleteId(null)
  }

  const pendingDeleteTemplate = pendingDeleteId
    ? templates.find((t) => t.id === pendingDeleteId)
    : null

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-base font-display text-ink">时间盒模板</h1>
          <Button
            size="sm"
            onClick={() => {
              void ensureSources()
              setEditing(blankTemplate())
            }}
          >
            <Plus className="size-4 mr-1" />
            新建模板
          </Button>
        </div>

        {/* 列表 */}
        {templates.length === 0 ? (
          <p className="text-sm text-body py-12 text-center">还没有模板</p>
        ) : (
          <div className="space-y-2">
            {templates.map((t) => (
              <div
                key={t.id}
                className="rounded-md border border-hairline bg-surface-card p-4"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-ink">
                    {t.name || '未命名'}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        void ensureSources()
                        setEditing({ ...t })
                      }}
                    >
                      编辑
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-error hover:text-error"
                      onClick={() => setPendingDeleteId(t.id)}
                    >
                      <Trash2 className="size-3 mr-1" />
                      删除
                    </Button>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {SEGMENTS.map((s) => {
                    const seg = (t.survivalSegments as Record<string, { start: string; end: string }>)[s.key]
                    return (
                      <span
                        key={s.key}
                        className="rounded bg-surface-card border border-hairline px-1.5 py-0.5 text-[10px] text-body"
                      >
                        {s.label} {seg?.start ?? '--:--'}–{seg?.end ?? '--:--'}
                      </span>
                    )
                  })}
                </div>
                {(t.subscribedHabits.length > 0 ||
                  t.subscribedTasks.length > 0 ||
                  t.subscribedThreads.length > 0) && (
                  <div className="mt-2 text-[10px] text-body">
                    订阅：{t.subscribedHabits.length} 习惯 ·{' '}
                    {t.subscribedTasks.length} 任务 · {t.subscribedThreads.length} 主线
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 编辑/新建 模态 */}
      {editing && (
        <div
          className="fixed inset-0 z-modal flex items-center justify-center bg-scrim"
          onClick={() => setEditing(null)}
        >
          <div
            className="mx-4 w-full max-w-lg rounded-lg bg-canvas p-6 shadow-lg max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-4 text-sm font-semibold text-ink">
              {editing.id ? '编辑模板' : '新建模板'}
            </h2>

            {/* 名称 */}
            <input
              value={editing.name}
              placeholder="模板名称"
              onChange={(e) =>
                setEditing({ ...editing, name: e.target.value })
              }
              className="mb-4 h-8 w-full rounded-md border border-hairline bg-canvas px-2 text-sm text-ink"
            />

            {/* 7 段起止 */}
            <div className="space-y-2 mb-4">
              <p className="text-xs text-body mb-1">7 段生存时间</p>
              {SEGMENTS.map((s) => {
                const seg = editing.survivalSegments[s.key] ?? {
                  start: '09:00',
                  end: '10:00',
                }
                return (
                  <div key={s.key} className="flex items-center gap-2">
                    <span className="w-20 text-xs text-body">{s.label}</span>
                    <input
                      type="time"
                      value={seg.start}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          survivalSegments: {
                            ...editing.survivalSegments,
                            [s.key]: { ...seg, start: e.target.value },
                          },
                        })
                      }
                      className="h-7 rounded border border-hairline bg-canvas px-1 text-xs text-ink"
                    />
                    <span className="text-xs text-body">—</span>
                    <input
                      type="time"
                      value={seg.end}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          survivalSegments: {
                            ...editing.survivalSegments,
                            [s.key]: { ...seg, end: e.target.value },
                          },
                        })
                      }
                      className="h-7 rounded border border-hairline bg-canvas px-1 text-xs text-ink"
                    />
                  </div>
                )
              })}
            </div>

            {/* 订阅源 chips */}
            <SubscriptionChips
              title="订阅习惯（多选）"
              items={sources.habits}
              selected={editing.subscribedHabits}
              onToggle={(id) =>
                setEditing({
                  ...editing,
                  subscribedHabits: toggleId(editing.subscribedHabits, id),
                })
              }
            />
            <SubscriptionChips
              title="订阅任务（多选）"
              items={sources.tasks}
              selected={editing.subscribedTasks}
              onToggle={(id) =>
                setEditing({
                  ...editing,
                  subscribedTasks: toggleId(editing.subscribedTasks, id),
                })
              }
            />
            <SubscriptionChips
              title="订阅主线（多选）"
              items={sources.threads}
              selected={editing.subscribedThreads}
              onToggle={(id) =>
                setEditing({
                  ...editing,
                  subscribedThreads: toggleId(editing.subscribedThreads, id),
                })
              }
            />

            <div className="mt-5 flex justify-end gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setEditing(null)}
              >
                取消
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={!editing.name.trim() || saving}
              >
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
        </div>
      )}

      {/* 删除确认 AlertDialog */}
      <AlertDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => !open && setPendingDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除时间盒模板？</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDeleteTemplate
                ? `即将删除 "${pendingDeleteTemplate.name || '未命名'}"。此操作不可撤销。`
                : '确认删除？'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ─── 订阅源 chips 子组件 ──────────────────────────────────────────
function SubscriptionChips({
  title,
  items,
  selected,
  onToggle,
}: {
  title: string
  items: SourceItem[]
  selected: string[]
  onToggle: (id: string) => void
}) {
  return (
    <div className="mt-3">
      <p className="mb-1 text-xs text-body">{title}</p>
      {items.length === 0 ? (
        <p className="text-[10px] text-body">暂无可订阅项</p>
      ) : (
        <div className="flex flex-wrap gap-1">
          {items.map((it) => {
            const isSelected = selected.includes(it.id)
            return (
              <button
                key={it.id}
                type="button"
                onClick={() => onToggle(it.id)}
                className={
                  isSelected
                    ? 'rounded px-2 py-0.5 text-xs bg-primary text-primary-foreground'
                    : 'rounded px-2 py-0.5 text-xs bg-surface-card text-body border border-hairline'
                }
              >
                {it.title}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}