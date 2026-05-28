"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { validateHabitFields } from '../validation'

export interface HabitFormFields {
  title: string
  description?: string
  defaultTime: string
  earliestTime: string
  latestStartTime: string
  defaultDuration: number
  minDuration: number
  trackable: boolean
  frequencyType: "daily" | "weekly" | "custom"
  daysOfWeek?: number[]
  startDate: string
  endDate?: string
}

interface HabitFormProps {
  /** 初始值（编辑模式） */
  initial?: Partial<HabitFormFields>
  /** 提交回调 */
  onSubmit: (fields: HabitFormFields) => void
  /** 取消回调 */
  onCancel: () => void
  /** 是否提交中 */
  isLoading?: boolean
  /** 通知父组件表单已修改（用于页面级脏状态追踪） */
  onDirtyChange?: (isDirty: boolean) => void
  /** 外部触发的提交计数（用于退出保存场景），每次递增触发一次 requestSubmit */
  submitTrigger?: number
  /** CN-UI 场景下禁用回车触发表单提交 */
  disableEnterSubmit?: boolean
}

const DAYS = ["日", "一", "二", "三", "四", "五", "六"]

/** 根据默认时间和时长自动补全时间窗口 */
function autoComplete(
  defaultTime: string,
  defaultDuration: number,
): { earliestTime: string; latestStartTime: string; minDuration: number } {
  const [h, m] = defaultTime.split(":").map(Number)
  const defaultMin = h * 60 + m

  // earliestTime = defaultTime - 30min
  const earlyMin = Math.max(0, defaultMin - 30)
  const earlyH = Math.floor(earlyMin / 60)
  const earlyM = earlyMin % 60

  // latestStartTime = defaultTime + 30min
  const lateMin = defaultMin + 30
  const lateH = Math.floor(lateMin / 60) % 24
  const lateM = lateMin % 60

  const minDur = defaultDuration

  return {
    earliestTime: `${String(earlyH).padStart(2, "0")}:${String(earlyM).padStart(2, "0")}`,
    latestStartTime: `${String(lateH).padStart(2, "0")}:${String(lateM).padStart(2, "0")}`,
    minDuration: minDur,
  }
}

export function HabitForm({ initial, onSubmit, onCancel, isLoading, onDirtyChange, submitTrigger, disableEnterSubmit }: HabitFormProps) {
  const [title, setTitle] = useState(initial?.title ?? "")
  const [description, setDescription] = useState(initial?.description ?? "")
  const [defaultTime, setDefaultTime] = useState(initial?.defaultTime ?? "07:00")
  const [earliestTime, setEarliestTime] = useState(initial?.earliestTime ?? "06:30")
  const [latestStartTime, setLatestEndTime] = useState(initial?.latestStartTime ?? "08:00")
  const [defaultDuration, setDefaultDuration] = useState(initial?.defaultDuration ?? 30)
  const [minDuration, setMinDuration] = useState(initial?.minDuration ?? 15)
  const [trackable, setTrackable] = useState(initial?.trackable ?? true)
  const [frequencyType, setFrequencyType] = useState<"daily" | "weekly" | "custom">(
    initial?.frequencyType ?? "daily",
  )
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(initial?.daysOfWeek ?? [1, 2, 3, 4, 5])
  const [startDate, setStartDate] = useState(initial?.startDate ?? new Date().toISOString().slice(0, 10))
  const [endDate, setEndDate] = useState(initial?.endDate ?? "")
  const [autoFilled, setAutoFilled] = useState(false)
  const [clientErrors, setClientErrors] = useState<string[]>([])
  const formRef = useRef<HTMLFormElement>(null)

  // 监听外部提交触发
  useEffect(() => {
    if (submitTrigger && submitTrigger > 0 && formRef.current) {
      formRef.current.requestSubmit()
    }
  }, [submitTrigger])

  const handleDefaultTimeBlur = useCallback(() => {
    if (/^\d{2}:\d{2}$/.test(defaultTime)) {
      const auto = autoComplete(defaultTime, defaultDuration)
      setEarliestTime(auto.earliestTime)
      setLatestEndTime(auto.latestStartTime)
      setMinDuration(auto.minDuration)
      setAutoFilled(true)
    }
  }, [defaultTime, defaultDuration])

  const handleDurationBlur = useCallback(() => {
    if (/^\d{2}:\d{2}$/.test(defaultTime) && defaultDuration > 0) {
      const auto = autoComplete(defaultTime, defaultDuration)
      setMinDuration(auto.minDuration)
      if (!autoFilled) {
        setEarliestTime(auto.earliestTime)
        setLatestEndTime(auto.latestStartTime)
      }
    }
  }, [defaultTime, defaultDuration, autoFilled])

  const toggleDay = (day: number) => {
    setDaysOfWeek((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort(),
    )
    onDirtyChange?.(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    // 客户端预检（纯函数，与 onValidate 复用同一逻辑）
    const auto = autoComplete(defaultTime, defaultDuration)
    const fields: HabitFormFields = {
      title,
      description: description || undefined,
      defaultTime,
      earliestTime: earliestTime || auto.earliestTime,
      latestStartTime: latestStartTime || auto.latestStartTime,
      defaultDuration,
      minDuration: minDuration || auto.minDuration,
      trackable,
      frequencyType,
      daysOfWeek: frequencyType !== "daily" ? daysOfWeek : undefined,
      startDate,
      endDate: endDate || undefined,
    }

    const validation = validateHabitFields(fields, 'createHabit')
    if (!validation.valid) {
      setClientErrors(validation.errors)
      return
    }
    setClientErrors([])

    onSubmit(fields)
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      onKeyDown={(e) => {
        if (disableEnterSubmit && e.key === 'Enter' && e.target instanceof HTMLInputElement) {
          e.preventDefault()
          const form = formRef.current
          if (!form) return
          const focusable = Array.from(
            form.querySelectorAll('input:not([type="hidden"]):not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled)')
          )
          const idx = focusable.indexOf(e.target)
          const next = focusable[idx + 1]
          if (next instanceof HTMLElement) {
            next.focus()
          }
        }
      }}
      className="flex flex-col gap-4"
    >
      {/* 标题 */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="habit-title">标题 *</Label>
        <Input
          id="habit-title"
          value={title}
          onChange={(e) => { setTitle(e.target.value); onDirtyChange?.(true) }}
          placeholder="例如：晨跑、午休冥想"
        />
      </div>

      {/* 描述 */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="habit-desc">描述</Label>
        <Textarea
          id="habit-desc"
          value={description}
          onChange={(e) => { setDescription(e.target.value); onDirtyChange?.(true) }}
          placeholder="可选"
          rows={2}
        />
      </div>

      {/* 可追踪开关 */}
      <div className="flex items-center gap-2">
        <input
          id="habit-trackable"
          type="checkbox"
          checked={trackable}
          onChange={(e) => { setTrackable(e.target.checked); onDirtyChange?.(true) }}
          className="size-4 rounded border-input"
        />
        <Label htmlFor="habit-trackable">可追踪（打卡记录完成情况）</Label>
      </div>

      {/* 时间设置 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="habit-default-time">默认时间</Label>
          <Input
            id="habit-default-time"
            type="time"
            value={defaultTime}
            onChange={(e) => { setDefaultTime(e.target.value); onDirtyChange?.(true) }}
            onBlur={handleDefaultTimeBlur}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="habit-earliest">最早开始</Label>
          <Input
            id="habit-earliest"
            type="time"
            value={earliestTime}
            onChange={(e) => { setEarliestTime(e.target.value); onDirtyChange?.(true) }}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="habit-latest">最迟开始</Label>
          <Input
            id="habit-latest"
            type="time"
            value={latestStartTime}
            onChange={(e) => { setLatestEndTime(e.target.value); onDirtyChange?.(true) }}
          />
        </div>
      </div>

      {/* 时长设置 */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="habit-duration">默认时长（分钟）</Label>
          <Input
            id="habit-duration"
            type="number"
            min={5}
            max={480}
            value={defaultDuration}
            onChange={(e) => { setDefaultDuration(Number(e.target.value)); onDirtyChange?.(true) }}
            onBlur={handleDurationBlur}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="habit-min-duration">最短时长（分钟）</Label>
          <Input
            id="habit-min-duration"
            type="number"
            min={5}
            max={defaultDuration}
            value={minDuration}
            onChange={(e) => { setMinDuration(Number(e.target.value)); onDirtyChange?.(true) }}
          />
        </div>
      </div>

      {/* 频率 */}
      <div className="flex flex-col gap-1.5">
        <Label>频率</Label>
        <div className="flex gap-2">
          {(["daily", "weekly", "custom"] as const).map((ft) => (
            <button
              key={ft}
              type="button"
              onClick={() => { setFrequencyType(ft); onDirtyChange?.(true) }}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                frequencyType === ft
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {ft === "daily" ? "每天" : ft === "weekly" ? "每周" : "自定义"}
            </button>
          ))}
        </div>
      </div>

      {/* 星期选择（非每天时显示） */}
      {frequencyType !== "daily" && (
        <div className="flex flex-col gap-1.5">
          <Label>适用日期</Label>
          <div className="flex gap-1">
            {DAYS.map((label, i) => (
              <button
                key={i}
                type="button"
                onClick={() => toggleDay(i)}
                className={`flex size-8 items-center justify-center rounded-full text-xs transition-colors ${
                  daysOfWeek.includes(i)
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 日期范围 */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="habit-start">开始日期</Label>
          <Input
            id="habit-start"
            type="date"
            value={startDate}
            onChange={(e) => { setStartDate(e.target.value); onDirtyChange?.(true) }}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="habit-end">结束日期</Label>
          <Input
            id="habit-end"
            type="date"
            value={endDate}
            onChange={(e) => { setEndDate(e.target.value); onDirtyChange?.(true) }}
          />
        </div>
      </div>

      {/* 校验错误 */}
      {clientErrors.length > 0 && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800">
          {clientErrors.map((err, i) => (
            <div key={i}>{err}</div>
          ))}
        </div>
      )}

      {/* 操作按钮 */}
      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          取消
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? "提交中..." : initial ? "保存" : "创建"}
        </Button>
      </div>
    </form>
  )
}
