/**
 * @file okr-form
 * @brief OKR 表单组件
 *
 * 提供 OKR 创建和编辑的表单界面。
 * [022] 1C-T15：period 三字段 → cycleId 选择器（四态：空/必填/两步写/loading）。
 * [022] 3A-T2：ModeSwitcher（手动 | AI 导入）+ TemplateSelector（3 个硬编码模板）。
 */

"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { Cycle } from "@/usom/types/objects"
import type { USOM_ID } from "@/usom/types/primitives"

/**
 * OKR 表单字段
 */
export interface OKRFormFields {
  title: string
  description?: string
  okrType: "visionary" | "committed"
  priority: "P0" | "P1" | "P2"
  /** [022] 权威周期归属，替代原 periodType/periodStart/periodEnd */
  cycleId: string
  keyResults: { title: string; targetValue: number; unit: string }[]
}

/**
 * [022] 3A-T2：OKR 模板定义
 * 硬编码于组件内——MVP 不做模板存储，仅作为快速开始的引导。
 */
export interface OKRTemplate {
  id: string
  name: string
  objectiveDefaults: { okrType: "visionary" | "committed"; priority: "P0" | "P1" | "P2" }
  keyResults: Array<{ title: string; targetValue: number; unit: string }>
}

/** [022] 3A-T2：三个内置模板（季度/月度/个人成长） */
const TEMPLATES: OKRTemplate[] = [
  {
    id: "quarterly", name: "季度 OKR",
    objectiveDefaults: { okrType: "committed", priority: "P0" },
    keyResults: [
      { title: "", targetValue: 100, unit: "%" },
      { title: "", targetValue: 100, unit: "%" },
      { title: "", targetValue: 100, unit: "%" },
    ],
  },
  {
    id: "monthly", name: "月度 OKR",
    objectiveDefaults: { okrType: "committed", priority: "P1" },
    keyResults: [
      { title: "", targetValue: 100, unit: "%" },
      { title: "", targetValue: 100, unit: "%" },
    ],
  },
  {
    id: "growth", name: "个人成长 OKR",
    objectiveDefaults: { okrType: "visionary", priority: "P1" },
    keyResults: [
      { title: "", targetValue: 10, unit: "次" },
    ],
  },
]

interface OKRFormProps {
  initial?: Partial<OKRFormFields>
  /** [022] 表单从外部获取周期列表（由 useOKRs / 调用方传入） */
  cycles: Cycle[]
  /** 周期列表加载中 */
  isLoadingCycles: boolean
  /**
   * 新建周期回调。
   * [022] MVP 取舍：创建 cycle 与创建 objective 是两步 server action，
   * objective 失败不会回滚已创建的 cycle（下次可直接选），
   * 但表单保留已填内容 + errors 区提示「周期已创建，请重试保存目标」。
   */
  onCreateCycle: (cycle: Cycle) => Promise<Cycle>
  onSubmit: (fields: OKRFormFields) => void
  onCancel?: () => void
  isLoading?: boolean
  /**
   * [022] 3A-T2 review-fix：触发外部 OKRImportDialog。
   * 由 OKRWorkspace 注入（`setImportOpen(true)`）。
   * OKRForm 的 ai-import mode 仅作入口引导，实际导入流程在 OKRImportDialog 中完成。
   */
  onImportTrigger?: () => void
}

export function OKRForm({
  initial, onSubmit, onCancel, isLoading, cycles, isLoadingCycles, onCreateCycle, onImportTrigger,
}: OKRFormProps) {
  const [title, setTitle] = useState(initial?.title ?? "")
  const [description, setDescription] = useState(initial?.description ?? "")
  const [okrType, setOkrType] = useState<"visionary" | "committed">(initial?.okrType ?? "committed")
  const [priority, setPriority] = useState<"P0" | "P1" | "P2">(initial?.priority ?? "P1")
  const [cycleId, setCycleId] = useState(initial?.cycleId ?? "")
  const [showNewCycleForm, setShowNewCycleForm] = useState(false)
  // 新建周期字段
  const [newCycleType, setNewCycleType] = useState<Cycle['cycleType']>("quarterly")
  const [newCycleName, setNewCycleName] = useState("")
  const [newCycleStart, setNewCycleStart] = useState("")
  const [newCycleEnd, setNewCycleEnd] = useState("")
  const [keyResults, setKeyResults] = useState<{ title: string; targetValue: number; unit: string }[]>(
    initial?.keyResults ?? [{ title: "", targetValue: 100, unit: "%" }],
  )
  const [errors, setErrors] = useState<string[]>([])
  /** [022] 是否为内联新建 cycle 提交中（独立于外部 isLoading） */
  const [isCreatingCycle, setIsCreatingCycle] = useState(false)
  /** [022] 3A-T2：表单模式——手动输入 | AI 导入 */
  const [formMode, setFormMode] = useState<"manual" | "ai-import">("manual")
  /** [022] 3A-T2：当前选中的模板 ID（用于 TemplateSelector 受控展示） */
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("")

  // 四态-1：空状态——cycles 为空时自动展开新建表单
  const cyclesEmpty = !isLoadingCycles && cycles.length === 0 && !showNewCycleForm

  /**
   * [022] 3A-T2：应用模板到表单。
   * - 始终覆盖 okrType / priority（模板默认值）
   * - 仅在 KR 全为空时替换 KR 列表，避免覆盖用户已填内容
   */
  const applyTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId)
    const tmpl = TEMPLATES.find(t => t.id === templateId)
    if (!tmpl) return
    setOkrType(tmpl.objectiveDefaults.okrType)
    setPriority(tmpl.objectiveDefaults.priority)
    if (keyResults.every(kr => !kr.title.trim())) {
      // 只在 KR 全为空时替换（避免覆盖已填内容）
      setKeyResults(tmpl.keyResults.map(kr => ({ ...kr })))
    }
  }

  const addKR = () => {
    setKeyResults([...keyResults, { title: "", targetValue: 100, unit: "%" }])
  }

  const removeKR = (index: number) => {
    if (keyResults.length <= 1) return
    setKeyResults(keyResults.filter((_, i) => i !== index))
  }

  const updateKR = (index: number, field: string, value: string | number) => {
    const updated = [...keyResults]
    updated[index] = { ...updated[index], [field]: value }
    setKeyResults(updated)
  }

  const validate = (): string[] => {
    const errs: string[] = []
    if (!title.trim()) errs.push("目标标题必填")
    if (title.length > 200) errs.push("标题不能超过 200 字符")
    // 四态-2：cycleId 必填校验
    if (!cycleId) errs.push("请选择或创建周期")
    keyResults.forEach((kr, i) => {
      if (!kr.title.trim()) errs.push(`KR${i + 1}: 标题必填`)
      if (kr.targetValue <= 0) errs.push(`KR${i + 1}: 目标值必须大于 0`)
      if (!kr.unit.trim()) errs.push(`KR${i + 1}: 单位必填`)
    })
    return errs
  }

  /**
   * [022] 处理内联新建 Cycle 提交。
   * 两步写：建 cycle 是第一步，建 objective 是第二步。
   * cycle 成功但 objective 失败时，cycle 已持久化，下次可直接选。
   */
  const handleCreateCycle = async () => {
    const now = new Date()
    const start = newCycleStart || now.toISOString().slice(0, 10)
    const end = newCycleEnd || (() => {
      const d = new Date(now)
      d.setMonth(d.getMonth() + 3)
      return d.toISOString().slice(0, 10)
    })()

    setIsCreatingCycle(true)
    try {
      const cycle: Cycle = {
        id: crypto.randomUUID() as USOM_ID,
        cycleType: newCycleType,
        name: newCycleName || `${start}~${end}`,
        period: { start: start as any, end: end as any },
        status: 'in_progress',
        createdAt: now.toISOString() as any,
        updatedAt: now.toISOString() as any,
      }
      const saved = await onCreateCycle(cycle)
      setCycleId(saved.id)
      setShowNewCycleForm(false)
      setErrors([])
    } catch {
      setErrors(["创建周期失败，请重试"])
    } finally {
      setIsCreatingCycle(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const validationErrors = validate()
    if (validationErrors.length > 0) {
      setErrors(validationErrors)
      return
    }
    setErrors([])
    onSubmit({
      title: title.trim(),
      description: description.trim() || undefined,
      okrType,
      priority,
      cycleId,
      keyResults: keyResults.filter(kr => kr.title.trim()),
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {errors.length > 0 && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          <ul className="list-disc pl-4">
            {errors.map((err, i) => <li key={i}>{err}</li>)}
          </ul>
        </div>
      )}

      {/* [022] 3A-T2 Mode Switcher: 手动输入 | AI 导入 */}
      <div className="flex items-center gap-1 border-b border-hairline pb-3">
        <button type="button" onClick={() => setFormMode("manual")}
          className={`px-4 py-1.5 rounded-t-md text-sm font-medium transition-colors ${
            formMode === "manual"
              ? "bg-background text-ink border-b-2 border-primary"
              : "text-muted-foreground hover:text-body"
          }`}>
          手动输入
        </button>
        <button type="button" onClick={() => setFormMode("ai-import")}
          className={`px-4 py-1.5 rounded-t-md text-sm font-medium transition-colors ${
            formMode === "ai-import"
              ? "bg-background text-ink border-b-2 border-primary"
              : "text-muted-foreground hover:text-body"
          }`}>
          AI 导入
        </button>
      </div>

      {formMode === "manual" ? (
        <>
          {/* [022] 3A-T2 Template Selector：3 个硬编码模板快速开始 */}
          <div className="space-y-2">
            <Label>快速模板（可选）</Label>
            <Select value={selectedTemplateId} onValueChange={applyTemplate}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="选择模板快速开始..." />
              </SelectTrigger>
              <SelectContent>
                {TEMPLATES.map(t => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}（{t.objectiveDefaults.okrType === "committed" ? "承诺型" : "愿景型"} · {t.keyResults.length} KR）
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="okr-title">目标标题</Label>
            <Input id="okr-title" value={title} onChange={e => setTitle(e.target.value)} placeholder="例如：提升产品体验" maxLength={200} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="okr-desc">描述（可选）</Label>
            <Textarea id="okr-desc" value={description} onChange={e => setDescription(e.target.value)} placeholder="目标的详细说明..." rows={2} />
          </div>

          <div className="space-y-2">
            <Label>OKR 类型</Label>
            <div className="flex gap-3">
              <button type="button" onClick={() => setOkrType("committed")}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${okrType === "committed" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
                承诺型
              </button>
              <button type="button" onClick={() => setOkrType("visionary")}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${okrType === "visionary" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
                愿景型
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>重要程度</Label>
            <div className="flex gap-3">
              <button type="button" onClick={() => setPriority("P0")}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${priority === "P0" ? "bg-error text-on-primary" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
                P0 必须完成
              </button>
              <button type="button" onClick={() => setPriority("P1")}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${priority === "P1" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
                P1 应该完成
              </button>
              <button type="button" onClick={() => setPriority("P2")}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${priority === "P2" ? "bg-muted text-on-primary" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
                P2 有余力则做
              </button>
            </div>
          </div>

          {/* [022] Cycle 选择器 —— 替换原 periodType/periodStart/periodEnd 三字段 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>周期</Label>
              {!cyclesEmpty && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowNewCycleForm(!showNewCycleForm)}>
                  {showNewCycleForm ? "取消新建" : "+ 新建周期"}
                </Button>
              )}
            </div>

            {/* 四态-4 loading：cycles 列表 fetching 时下拉 disabled + Spinner */}
            {isLoadingCycles ? (
              <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-input bg-muted/30 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                加载周期列表...
              </div>
            ) : cyclesEmpty ? (
              /* 四态-1 空状态：下拉禁用 + placeholder「尚无周期，请先新建」+ 默认展开内联新建 */
              <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-input bg-muted/20 text-sm text-muted-foreground">
                尚无周期，请先新建
              </div>
            ) : (
              <Select value={cycleId} onValueChange={v => setCycleId(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="选择周期..." />
                </SelectTrigger>
                <SelectContent>
                  {cycles.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} ({c.period.start} ~ {c.period.end})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* 内联新建 Cycle 表单 */}
            {(showNewCycleForm || cyclesEmpty) && (
              <div className="rounded-md border border-border p-3 space-y-3 bg-muted/20">
                <div className="space-y-2">
                  <Label className="text-xs">周期类型</Label>
                  <select value={newCycleType} onChange={e => setNewCycleType(e.target.value as Cycle['cycleType'])}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm">
                    <option value="quarterly">季度</option>
                    <option value="semi_annual">半年度</option>
                    <option value="monthly">月度</option>
                    <option value="annual">年度</option>
                    <option value="custom">自定义</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">周期名称（可选）</Label>
                  <Input value={newCycleName} onChange={e => setNewCycleName(e.target.value)} placeholder="例如：2026 Q3" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs">开始日期</Label>
                    <Input type="date" value={newCycleStart} onChange={e => setNewCycleStart(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">结束日期</Label>
                    <Input type="date" value={newCycleEnd} onChange={e => setNewCycleEnd(e.target.value)} />
                  </div>
                </div>
                <Button type="button" variant="default" size="sm" onClick={handleCreateCycle} disabled={isCreatingCycle}>
                  {isCreatingCycle && <Loader2 className="size-4 animate-spin mr-1" />}
                  创建周期
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>关键结果 (KR)</Label>
              <Button type="button" variant="outline" size="sm" onClick={addKR}>+ 添加 KR</Button>
            </div>
            {keyResults.map((kr, i) => (
              <div key={i} className="flex gap-2 items-start p-3 rounded-md bg-muted/50">
                <span className="text-xs text-muted-foreground mt-2 w-6 shrink-0">KR{i + 1}</span>
                <div className="flex-1 space-y-2">
                  <Input value={kr.title} onChange={e => updateKR(i, "title", e.target.value)} placeholder="关键结果标题" />
                  <div className="flex gap-2">
                    <Input type="number" value={kr.targetValue} onChange={e => updateKR(i, "targetValue", Number(e.target.value))} placeholder="目标值" className="w-24" min={0} />
                    <Input value={kr.unit} onChange={e => updateKR(i, "unit", e.target.value)} placeholder="单位" className="w-20" maxLength={20} />
                  </div>
                </div>
                {keyResults.length > 1 && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeKR(i)} className="text-destructive shrink-0">×</Button>
                )}
              </div>
            ))}
          </div>

          <div className="flex gap-3 justify-end">
            {onCancel && <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>取消</Button>}
            <Button type="submit" disabled={isLoading}>
              {isLoading ? <><Loader2 className="size-4 animate-spin mr-1" />保存中...</> : "保存"}
            </Button>
          </div>
        </>
      ) : (
        /* [022] 3A-T2 AI-import mode 骨架：
           入口引导，实际导入由 workspace 的 OKRImportDialog 完成。 */
        <div className="space-y-4 py-4">
          <div className="rounded-md border border-dashed border-hairline p-8 text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              上传 Markdown 文件，AI 将自动识别 OKR 目标与关键结果
            </p>
            <p className="text-xs text-muted-foreground">
              支持格式: .md, .txt（大小限制 5MB）
            </p>
            <Button type="button" variant="outline" size="sm"
              onClick={() => onImportTrigger?.()}>
              选择文件
            </Button>
          </div>
        </div>
      )}
    </form>
  )
}
