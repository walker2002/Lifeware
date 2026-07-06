/**
 * @file okr-form
 * @brief OKR 表单组件
 *
 * 提供 OKR 创建和编辑的表单界面。
 * [022] 1C-T15：period 三字段 → cycleId 选择器（四态：空/必填/两步写/loading）。
 * [022] 3A-T2：ModeSwitcher（手动 | AI 导入）+ TemplateSelector（3 个硬编码模板）。
 * [024] G1：周期选择器 + 内联新建表单迁出至 CycleCreateDrawer/T13 工作台 wiring；
 *       OKRForm 仅保留 presetCycleId 透传 + KR 信心度输入。
 * [023.12] T9：cycleStatus === 'reviewed' 时整表只读 + banner 提示，
 *   与 guard.ts ALLOWED['reviewed'] = {} 对齐（UI 层乐观锁，server 写路径兜底）。
 */

"use client"

import { useState } from "react"
import { Loader2, Lock } from "lucide-react"
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
  keyResults: { title: string; targetValue: number; unit: string; /** [024] G2 信心度（0-100），留空时提交时默认 50 */ confidence?: number }[]
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

/**
 * [024.1] T3：导出 OKR 模板到 Markdown 字符串，供下载用。
 *
 * 格式与 okr-import 的解析器约定保持一致：
 *   - ## Objective: <模板名> (type: <okrType>, priority: <priority>)
 *   - ### KR <n>: <模板 KR title 或序号>
 *     - 目标值: <targetValue><unit>
 *
 * 模板中 KR.title 为空时填「KR <n>」占位,保证解析后 KR 数与 keyResults.length 一致。
 */
export function okrExportTemplatesToMarkdown(): string {
  const lines: string[] = ["# OKR 填写模板", ""]
  lines.push("复制下面的 Objective/KR 段,填写后通过「导入 OKR」上传即可。")
  lines.push("")
  for (const tpl of TEMPLATES) {
    lines.push(`## Objective: ${tpl.name} (type: ${tpl.objectiveDefaults.okrType}, priority: ${tpl.objectiveDefaults.priority})`)
    tpl.keyResults.forEach((kr, i) => {
      const krTitle = kr.title.trim() || `KR ${i + 1}`
      lines.push(`### KR ${i + 1}: ${krTitle}`)
      lines.push(`- 目标值: ${kr.targetValue}${kr.unit}`)
    })
    lines.push("")
  }
  return lines.join("\n")
}

interface OKRFormProps {
  initial?: Partial<OKRFormFields>
  /**
   * [024] G1：预设周期 ID。
   * 来自工作台 CycleCreateDrawer 旁的「为该周期创建 OKR」入口，
   * 透传至表单以确保提交时 cycleId 必有值。
   * edit 模式下不传（保留原 cycleId）。
   */
  presetCycleId?: string
  onSubmit: (fields: OKRFormFields) => void
  onCancel?: () => void
  isLoading?: boolean
  /**
   * [022] 3A-T2 review-fix：触发外部 OKRImportDialog。
   * 由 OKRWorkspace 注入（`setImportOpen(true)`）。
   * OKRForm 的 ai-import mode 仅作入口引导，实际导入流程在 OKRImportDialog 中完成。
   */
  onImportTrigger?: () => void
  /**
   * [023.12] T9：父周期状态；reviewed 时整表只读 + banner 提示
   * （与 guard.ts ALLOWED['reviewed'] = {} 对齐）。未传时不禁用。
   */
  cycleStatus?: Cycle["status"]
}

export function OKRForm({
  initial, presetCycleId, onSubmit, onCancel, isLoading, onImportTrigger,
  cycleStatus,
}: OKRFormProps) {
  // [023.12] T9：reviewed 状态整表锁定
  const isLocked = cycleStatus === "reviewed"
  const [title, setTitle] = useState(initial?.title ?? "")
  const [description, setDescription] = useState(initial?.description ?? "")
  const [okrType, setOkrType] = useState<"visionary" | "committed">(initial?.okrType ?? "committed")
  const [priority, setPriority] = useState<"P0" | "P1" | "P2">(initial?.priority ?? "P1")
  // [024] G1：周期由 presetCycleId 透传 + initial.cycleId（edit 模式）联合提供，
  // 不再渲染周期选择器 UI。
  const [cycleId] = useState(initial?.cycleId ?? presetCycleId ?? "")
  const [keyResults, setKeyResults] = useState<{ title: string; targetValue: number; unit: string; confidence?: number }[]>(
    initial?.keyResults ?? [{ title: "", targetValue: 100, unit: "%" }],
  )
  const [errors, setErrors] = useState<string[]>([])
  /** [022] 3A-T2：表单模式——手动输入 | AI 导入 */
  const [formMode, setFormMode] = useState<"manual" | "ai-import">("manual")
  /** [022] 3A-T2：当前选中的模板 ID（用于 TemplateSelector 受控展示） */
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("")

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

  const updateKR = (index: number, field: string, value: string | number | undefined) => {
    const updated = [...keyResults]
    updated[index] = { ...updated[index], [field]: value }
    setKeyResults(updated)
  }

  const validate = (): string[] => {
    const errs: string[] = []
    if (!title.trim()) errs.push("目标标题必填")
    if (title.length > 200) errs.push("标题不能超过 200 字符")
    // [024] G1：cycleId 校验保留——presetCycleId 模式下必有值，
    // edit 模式沿用 initial.cycleId，无 presetCycleId 的创建入口（T13 透传）
    // 不应出现在生产路径。
    if (!cycleId) errs.push("请选择或创建周期")
    keyResults.forEach((kr, i) => {
      if (!kr.title.trim()) errs.push(`KR${i + 1}: 标题必填`)
      if (kr.targetValue <= 0) errs.push(`KR${i + 1}: 目标值必须大于 0`)
      if (!kr.unit.trim()) errs.push(`KR${i + 1}: 单位必填`)
    })
    return errs
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // [023.12] T9：reviewed 状态直接拒绝提交（UI 乐观锁；server 写路径由 assertEditable 兜底）
    if (isLocked) {
      setErrors(["该周期已复盘，目标已锁定，无法保存"])
      return
    }
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
      keyResults: keyResults.filter(kr => kr.title.trim()).map(kr => ({ ...kr, confidence: kr.confidence ?? 50 })),
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

      {/* [023.12] T9：reviewed 状态 banner（与 guard.ts ALLOWED[reviewed] = {} 对齐） */}
      {isLocked && (
        <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground flex items-center gap-2" role="status">
          <Lock className="size-4 shrink-0" />
          <span>该周期已复盘，目标/KR 已锁定，无法编辑。</span>
        </div>
      )}

      {/* [022] 3A-T2 Mode Switcher: 手动输入 | AI 导入 */}
      <div className="flex items-center gap-1 border-b border-hairline pb-3">
        <button type="button" onClick={() => setFormMode("manual")} disabled={isLocked}
          className={`px-4 py-1.5 rounded-t-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            formMode === "manual"
              ? "bg-background text-ink border-b-2 border-primary"
              : "text-muted-foreground hover:text-body"
          }`}>
          手动输入
        </button>
        <button type="button" onClick={() => setFormMode("ai-import")} disabled={isLocked}
          className={`px-4 py-1.5 rounded-t-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
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
            <Select value={selectedTemplateId} onValueChange={applyTemplate} disabled={isLocked}>
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
            <Input id="okr-title" value={title} onChange={e => setTitle(e.target.value)} placeholder="例如：提升产品体验" maxLength={200} disabled={isLocked} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="okr-desc">描述（可选）</Label>
            <Textarea id="okr-desc" value={description} onChange={e => setDescription(e.target.value)} placeholder="目标的详细说明..." rows={2} disabled={isLocked} />
          </div>

          <div className="space-y-2">
            <Label>OKR 类型</Label>
            <div className="flex gap-3">
              <button type="button" onClick={() => setOkrType("committed")} disabled={isLocked}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${okrType === "committed" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
                承诺型
              </button>
              <button type="button" onClick={() => setOkrType("visionary")} disabled={isLocked}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${okrType === "visionary" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
                愿景型
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>重要程度</Label>
            <div className="flex gap-3">
              <button type="button" onClick={() => setPriority("P0")} disabled={isLocked}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${priority === "P0" ? "bg-error text-on-primary" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
                P0 必须完成
              </button>
              <button type="button" onClick={() => setPriority("P1")} disabled={isLocked}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${priority === "P1" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
                P1 应该完成
              </button>
              <button type="button" onClick={() => setPriority("P2")} disabled={isLocked}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${priority === "P2" ? "bg-muted text-on-primary" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
                P2 有余力则做
              </button>
            </div>
          </div>

          {/* [024] G1：周期字段已迁出至 CycleCreateDrawer / T13 工作台 wiring，
              cycleId 由 presetCycleId 或 initial.cycleId 透传，不再渲染 UI。 */}

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>关键结果 (KR)</Label>
              <Button type="button" variant="outline" size="sm" onClick={addKR} disabled={isLocked}>+ 添加 KR</Button>
            </div>
            {keyResults.map((kr, i) => (
              <div key={i} className="flex gap-2 items-start p-3 rounded-md bg-muted/50">
                <span className="text-xs text-muted-foreground mt-2 w-6 shrink-0">KR{i + 1}</span>
                <div className="flex-1 space-y-2">
                  <Input value={kr.title} onChange={e => updateKR(i, "title", e.target.value)} placeholder="关键结果标题" disabled={isLocked} />
                  <div className="flex gap-2">
                    <Input type="number" value={kr.targetValue} onChange={e => updateKR(i, "targetValue", Number(e.target.value))} placeholder="目标值" className="w-24" min={0} disabled={isLocked} />
                    <Input value={kr.unit} onChange={e => updateKR(i, "unit", e.target.value)} placeholder="单位" className="w-20" maxLength={20} disabled={isLocked} />
                  </div>
                  {/* [024] G2 信心度输入：留空时提交时默认 50 */}
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground shrink-0">信心</Label>
                    <Input type="number" min={0} max={100}
                      value={kr.confidence ?? ''}
                      onChange={e => updateKR(i, "confidence", e.target.value === '' ? undefined as any : Number(e.target.value))}
                      placeholder="50" className="w-16 h-7 text-xs" disabled={isLocked} />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                </div>
                {keyResults.length > 1 && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeKR(i)} className="text-destructive shrink-0" disabled={isLocked}>×</Button>
                )}
              </div>
            ))}
          </div>

          <div className="flex gap-3 justify-end">
            {onCancel && <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading || isLocked}>取消</Button>}
            <Button type="submit" disabled={isLoading || isLocked}>
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
              onClick={() => onImportTrigger?.()} disabled={isLocked}>
              选择文件
            </Button>
          </div>
        </div>
      )}
    </form>
  )
}
