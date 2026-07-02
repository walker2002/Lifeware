/**
 * @file cycle-create-drawer
 * @brief 新建 OKR 周期右侧 Sheet 抽屉（[024] G1 从 okr-form.tsx 内联表单迁出）
 *
 * 提供周期类型 / 周期名称 / 起止日期字段，提交后调用 onCreateCycle 并自动关闭。
 * T11 将移除 okr-form.tsx 中对应内联区块。
 */

"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { Cycle } from "@/usom/types/objects"

/** [022.01] Phase 1：客户端只传业务字段，id/status/createdAt/updatedAt 由 server 构造 */
export type CreateCycleInput = {
  cycleType: string
  name: string
  periodStart: string
  periodEnd: string
}

interface CycleCreateDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreateCycle: (input: CreateCycleInput) => Promise<Cycle>
  isLoading?: boolean
}

export function CycleCreateDrawer({
  open,
  onOpenChange,
  onCreateCycle,
  isLoading,
}: CycleCreateDrawerProps) {
  const [cycleType, setCycleType] = useState<Cycle["cycleType"]>("quarterly")
  const [name, setName] = useState("")
  const [start, setStart] = useState("")
  const [end, setEnd] = useState("")
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    setError(null)
    const now = new Date()
    const s = start || now.toISOString().slice(0, 10)
    const e =
      end ||
      (() => {
        const d = new Date(now)
        d.setMonth(d.getMonth() + 3)
        return d.toISOString().slice(0, 10)
      })()
    try {
      // [022.01] Phase 1：客户端只传业务字段，id/status/timestamps 由 server 经 SM 构造
      await onCreateCycle({
        cycleType,
        name: name || `${s}~${e}`,
        periodStart: s,
        periodEnd: e,
      })
      setName("")
      setStart("")
      setEnd("")
      onOpenChange(false)
    } catch {
      setError("创建周期失败，请重试")
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[400px] sm:max-w-[400px]">
        <SheetHeader>
          <SheetTitle>新建 OKR 周期</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 p-4">
          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="space-y-2">
            <Label className="text-xs">周期类型</Label>
            <select
              value={cycleType}
              onChange={(e) => setCycleType(e.target.value as Cycle["cycleType"])}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
            >
              <option value="quarterly">季度</option>
              <option value="semi_annual">半年度</option>
              <option value="monthly">月度</option>
              <option value="annual">年度</option>
              <option value="custom">自定义</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">周期名称（可选）</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：2026 Q3"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs">开始日期</Label>
              <Input
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">结束日期</Label>
              <Input
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </div>
          </div>
        </div>
        <SheetFooter>
          <Button onClick={handleSubmit} disabled={isLoading}>
            {isLoading && <Loader2 className="size-4 animate-spin mr-1" />}
            创建周期
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
