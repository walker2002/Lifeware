/**
 * @file timebox-template-editor
 * @brief 时间盒模板编辑器（[023-02] 行列表 + 模板级星期 + Sheet 抽屉）
 *
 * 列表（TemplateCard 网格）+ Sheet 抽屉编辑。CRUD 经 app/actions/timebox-templates。
 * 订阅源懒加载（fire-and-forget + 1min cache 命中）；首次打开编辑时拉取。
 * 配色用 CSS 变量令牌（UI-DESIGN-SPEC §14 C-04）。
 *
 * 设计令牌约定（[024.1]）：
 * - bg-canvas / border-hairline（卡片）
 * - Loader2 替换「保存中…」（§6.7）
 * - AlertDialog 二次确认
 *
 * 数据流 ASCII（A.3）：
 *   PageBanner
 *     └─► TemplateCard 网格（width 自适应，1/2/3 列）
 *           └─► 点击「编辑」onEdit() 触发：
 *                 ├─► ensureSources() [fire-and-forget, 1 min cache]
 *                 │     └─► fetchSubscriptionSources (server action)
 *                 │           └─► setSources({habits, tasks, threads})
 *                 └─► setEditing(template) → Sheet.open = true
 *                       └─► TemplateEditForm (独立组件，见 ./template-edit-form)
 *                             ├─► onChange={(t) => setEditing(t)} → setState 全模板引用替换
 *                             ├─► 行内 onChange → updateRow(id, patch) → setState 新 rows 数组
 *                             ├─► 来源下拉 changeRowSource(id, source, sourceId?) → resolve from sources
 *                             └─► onSave → saveTimeboxTemplate → repo.create/update → 乐观 setTemplates → setEditing(null)
 *
 * KEEP IN SYNC：DEFAULT_SEGMENT_SEED（行 seed 7 段数据）见
 * lib/template-row-helpers.ts:DEFAULT_SEGMENT_SEED（B.3）。
 */
'use client'

import { useState, useCallback, useEffect } from 'react'
import { toast } from 'sonner'
import { Plus, LayoutTemplate, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/empty-state'
import { PageBanner } from '@/components/layout/page-banner'
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { TemplateCard } from '@/domains/timebox/components/template-card'
import { TemplateEditForm } from '@/domains/timebox/components/template-edit-form'
import {
  saveTimeboxTemplate,
  deleteTimeboxTemplate,
  fetchSubscriptionSources,
  type SubscriptionSources,
} from '@/app/actions/timebox-templates'
import { getArchetypes } from '@/app/actions/activity-archetype'
import type { TimeboxTemplate } from '@/lib/db/repositories/timebox-template'
import { seedTemplateRows, validateTemplateRow } from '@/domains/timebox/lib/template-row-helpers'

interface EditorProps {
  initialTemplates: TimeboxTemplate[]
}

/** 默认空白模板（编辑器新建入口用）：name='' + 全周 + 0 行；调用方负责补 seed rows */
function blankTemplate(): TimeboxTemplate {
  return {
    id: '' as TimeboxTemplate['id'],
    userId: '' as TimeboxTemplate['userId'],
    schemaVersion: 1,
    name: '',
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    rows: [],
    createdAt: '',
    updatedAt: '',
  }
}

export function TimeboxTemplateEditor({ initialTemplates }: EditorProps) {
  const [templates, setTemplates] = useState<TimeboxTemplate[]>(initialTemplates)
  const [editing, setEditing] = useState<TimeboxTemplate | null>(null)
  const [sources, setSources] = useState<SubscriptionSources | null>(null)
  const [sourcesLoaded, setSourcesLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  /** [027-B] archetype id → l2Name 映射（列表行徽章用）。挂载即拉取一次。 */
  const [archetypeMap, setArchetypeMap] = useState<Map<string, string>>(() => new Map())

  useEffect(() => {
    // 注：archetype 标签仅用于卡片显示兜底，非阻塞；与 ensureSources 不同——
    // sources 缺失会令抽屉不可用，故 toast；archetypes 缺失只是少个显示标签，
    // 静默降级（已有默认空 Map）。
    let cancelled = false
    void getArchetypes().then((r) => {
      if (cancelled) return
      if (r.success && r.data) setArchetypeMap(new Map(r.data.map((a) => [a.id, a.l2Name])))
    })
    return () => { cancelled = true }
  }, [])

  /** 懒加载订阅源（仅首次打开编辑时拉取；server action 端有 1min cache） */
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
  const handleSave = useCallback(async () => {
    if (!editing) return
    if (!editing.name.trim()) {
      toast.error('请输入模板名称')
      return
    }
    // [027-B] OV-B：保存前校验全部行（兜底「未 blur 直接点保存」路径）。
    // 行级 onBlur 通常先触发 RowEditor 提示（Task 5）；此 gate 与之呼应拦截。
    // [PLR] M5：收集每行错误 + 行 ID/标签 + 错误信息，弹首条 + 总数（让用户知道是哪行哪个字段出错）。
    const perRowErrors: Array<{ rowId: string; rowLabel: string; errors: string[] }> = []
    editing.rows.forEach((r) => {
      const errs = validateTemplateRow(r)
      if (errs.length > 0) {
        perRowErrors.push({
          rowId: r.id,
          rowLabel: r.activityName || '(未命名)',
          errors: errs,
        })
      }
    })
    if (perRowErrors.length > 0) {
      const first = perRowErrors[0]!
      toast.error(`${first.rowLabel}：${first.errors[0]}（共 ${perRowErrors.length} 行有问题）`)
      return
    }
    setSaving(true)
    try {
      const input = {
        name: editing.name.trim(),
        daysOfWeek: editing.daysOfWeek,
        rows: editing.rows,
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
        const saved = r.data
        setTemplates((prev) => {
          const exists = prev.some((t) => t.id === saved.id)
          return exists ? prev.map((t) => (t.id === saved.id ? saved : t)) : [...prev, saved]
        })
      }
      setEditing(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }, [editing])

  // ─── 删除 ────────────────────────────────────────────────────
  const handleConfirmDelete = useCallback(async () => {
    if (!pendingDeleteId) return
    const r = await deleteTimeboxTemplate(pendingDeleteId)
    if (r.success) {
      setTemplates((prev) => prev.filter((t) => t.id !== pendingDeleteId))
      toast.success('模板已删除')
    } else {
      toast.error(r.error ?? '删除失败')
    }
    setPendingDeleteId(null)
  }, [pendingDeleteId])

  const pendingDeleteTemplate = pendingDeleteId
    ? templates.find((t) => t.id === pendingDeleteId)
    : null

  const openCreate = useCallback(() => {
    void ensureSources()
    setEditing({ ...blankTemplate(), rows: seedTemplateRows() })
  }, [ensureSources])

  const openEdit = useCallback((t: TimeboxTemplate) => {
    void ensureSources()
    // 深拷贝 rows，避免编辑时直接修改父 setTemplates 引用
    setEditing({ ...t, rows: t.rows.map((r) => ({ ...r })) })
  }, [ensureSources])

  return (
    <div className="flex flex-col gap-4 w-full">
      <PageBanner domainId="timebox" title="时间盒模板" />

      {/* [023.03] UI 统一：去重标题。PageBanner 标题行已含"时间盒模板"，
          此处不再重复。新建按钮单独成行（无 h1 兄弟）。 */}
      <div className="flex items-center justify-end px-4">
        <Button size="sm" onClick={openCreate}>
          <Plus className="size-4 mr-1" />
          新建模板
        </Button>
      </div>

      {/* 列表：宽度自适应 1/2/3 列 */}
      <div className="px-4 pb-6">
        {templates.length === 0 ? (
          <EmptyState
            icon={LayoutTemplate}
            title="还没有模板"
            description="新建一个时间盒模板，定义应用范围与时间安排行"
            action={{
              label: '新建模板',
              onClick: openCreate,
            }}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {templates.map((t) => (
              <TemplateCard
                key={t.id}
                template={t}
                archetypeMap={archetypeMap}
                onEdit={() => openEdit(t)}
                onDelete={() => setPendingDeleteId(t.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* 编辑/新建 抽屉（Sheet → 右滑出） */}
      <Sheet open={editing !== null} onOpenChange={(open) => { if (!open) setEditing(null) }}>
        <SheetContent side="right" className="sm:max-w-[560px] px-6 py-6 flex flex-col">
          <SheetHeader>
            <SheetTitle>{editing?.id ? '编辑模板' : '新建模板'}</SheetTitle>
            <SheetDescription>设置时间安排行，每行可关联习惯/任务/主线/自定义活动，并指定原型与时间约束。</SheetDescription>
          </SheetHeader>
          {editing && (
            <TemplateEditForm
              key={editing.id || 'new'}
              template={editing}
              sources={sources}
              onChange={setEditing}
              onSave={() => { void handleSave() }}
              onCancel={() => setEditing(null)}
              saving={saving}
            />
          )}
        </SheetContent>
      </Sheet>

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
              onClick={() => { void handleConfirmDelete() }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              <Trash2 className="size-3 mr-1" />
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}