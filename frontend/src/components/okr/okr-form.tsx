"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

export interface OKRFormFields {
  title: string
  description?: string
  okrType: "visionary" | "committed"
  priority: "P0" | "P1" | "P2"
  periodType: string
  periodStart: string
  periodEnd: string
  keyResults: { title: string; targetValue: number; unit: string }[]
}

interface OKRFormProps {
  initial?: Partial<OKRFormFields>
  onSubmit: (fields: OKRFormFields) => void
  onCancel?: () => void
  isLoading?: boolean
}

export function OKRForm({ initial, onSubmit, onCancel, isLoading }: OKRFormProps) {
  const [title, setTitle] = useState(initial?.title ?? "")
  const [description, setDescription] = useState(initial?.description ?? "")
  const [okrType, setOkrType] = useState<"visionary" | "committed">(initial?.okrType ?? "committed")
  const [priority, setPriority] = useState<"P0" | "P1" | "P2">(initial?.priority ?? "P1")
  const [periodType, setPeriodType] = useState(initial?.periodType ?? "quarterly")
  const [periodStart, setPeriodStart] = useState(initial?.periodStart ?? "")
  const [periodEnd, setPeriodEnd] = useState(initial?.periodEnd ?? "")
  const [keyResults, setKeyResults] = useState<{ title: string; targetValue: number; unit: string }[]>(
    initial?.keyResults ?? [{ title: "", targetValue: 100, unit: "%" }],
  )
  const [errors, setErrors] = useState<string[]>([])

  // 周期日期自动填充
  useEffect(() => {
    const now = new Date()
    const y = now.getFullYear()
    const m = now.getMonth() // 0-based
    const mm = String(m + 1).padStart(2, '0')
    const fmt = (d: Date) => d.toISOString().slice(0, 10)
    const lastDay = (year: number, month: number) => new Date(year, month + 1, 0).getDate()

    switch (periodType) {
      case 'annual':
        setPeriodStart(`${y}-01-01`)
        setPeriodEnd(`${y}-12-31`)
        break
      case 'semi_annual':
        if (m < 6) {
          setPeriodStart(`${y}-01-01`)
          setPeriodEnd(`${y}-06-30`)
        } else {
          setPeriodStart(`${y}-07-01`)
          setPeriodEnd(`${y}-12-31`)
        }
        break
      case 'quarterly': {
        const q = Math.floor(m / 3)
        const qStart = new Date(y, q * 3, 1)
        const qEnd = new Date(y, q * 3 + 3, 0)
        setPeriodStart(fmt(qStart))
        setPeriodEnd(fmt(qEnd))
        break
      }
      case 'monthly': {
        setPeriodStart(`${y}-${mm}-01`)
        setPeriodEnd(`${y}-${mm}-${lastDay(y, m)}`)
        break
      }
    }
  }, [periodType])

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
    if (!periodStart) errs.push("请设置周期开始日期")
    if (!periodEnd) errs.push("请设置周期结束日期")
    if (periodStart && periodEnd && periodStart >= periodEnd) errs.push("结束日期必须晚于开始日期")
    keyResults.forEach((kr, i) => {
      if (!kr.title.trim()) errs.push(`KR${i + 1}: 标题必填`)
      if (kr.targetValue <= 0) errs.push(`KR${i + 1}: 目标值必须大于 0`)
      if (!kr.unit.trim()) errs.push(`KR${i + 1}: 单位必填`)
    })
    return errs
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
      periodType,
      periodStart,
      periodEnd,
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
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${priority === "P0" ? "bg-red-600 text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
            P0 必须完成
          </button>
          <button type="button" onClick={() => setPriority("P1")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${priority === "P1" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
            P1 应该完成
          </button>
          <button type="button" onClick={() => setPriority("P2")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${priority === "P2" ? "bg-gray-500 text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
            P2 有余力则做
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <Label>周期类型</Label>
        <select value={periodType} onChange={e => setPeriodType(e.target.value)}
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm">
          <option value="quarterly">季度</option>
          <option value="semi_annual">半年度</option>
          <option value="monthly">月度</option>
          <option value="annual">年度</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="period-start">开始日期</Label>
          <Input id="period-start" type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="period-end">结束日期</Label>
          <Input id="period-end" type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} />
        </div>
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
        <Button type="submit" disabled={isLoading}>{isLoading ? "保存中..." : "保存"}</Button>
      </div>
    </form>
  )
}
