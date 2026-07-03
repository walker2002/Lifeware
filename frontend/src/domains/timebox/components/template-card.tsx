/**
 * @file template-card
 * @brief 时间盒模板卡片（[023-02]，仿 HabitCard 风格）
 *
 * 顶栏：模板名 + 星期 chips
 * 主体：起–止：活动名称 逐行（按 start 升序）
 * 截断：> 4 行时显示前 4 行 + "还有 N 条"；hover 弹 Popover 完整列表
 * 操作：编辑 / 删除
 */

'use client'

import { useMemo, useState } from 'react'
import { Trash2, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { TimeboxTemplate } from '@/lib/db/repositories/timebox-template'
import { sortRowsByStart, WEEKDAY_LABELS } from '@/domains/timebox/lib/template-row-helpers'

interface TemplateCardProps {
  template: TimeboxTemplate
  onEdit: () => void
  onDelete: () => void
}

const MAX_VISIBLE_ROWS = 4

export function TemplateCard({ template, onEdit, onDelete }: TemplateCardProps) {
  const sorted = useMemo(() => sortRowsByStart(template.rows), [template.rows])
  const visible = sorted.slice(0, MAX_VISIBLE_ROWS)
  const hidden = sorted.slice(MAX_VISIBLE_ROWS)
  const hiddenCount = hidden.length
  const [popoverOpen, setPopoverOpen] = useState(false)

  const weekdayChips = useMemo(() => {
    if (template.daysOfWeek.length === 0) return ['不限']
    const set = new Set(template.daysOfWeek)
    return WEEKDAY_LABELS.filter((w) => set.has(w.value)).map((w) => w.short)
  }, [template.daysOfWeek])

  return (
    <Card className="border-hairline bg-canvas hover:bg-muted/50 transition-colors">
      <CardContent className="flex flex-col gap-3">
        {/* 顶栏：模板名 + 星期 chips */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-ink">{template.name || '未命名'}</span>
            {weekdayChips.map((c) => (
              <Badge key={c} variant="outline" className="text-[10px]">
                {c}
              </Badge>
            ))}
          </div>
        </div>

        {/* 安排详情 */}
        {sorted.length === 0 ? (
          <p className="text-xs text-muted-foreground">暂无安排</p>
        ) : (
          <div className="flex flex-col gap-1">
            {visible.map((r) => (
              <div
                key={r.id}
                data-testid="row-line"
                className="text-xs text-muted-foreground tabular-nums"
              >
                {r.start}–{r.end}：{r.activityName || '(未命名)'}
              </div>
            ))}
            {hiddenCount > 0 && (
              <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label={`还有 ${hiddenCount} 条`}
                    className="self-start inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    还有 {hiddenCount} 条
                    <ChevronDown className="size-3" />
                  </button>
                </PopoverTrigger>
                <PopoverContent side="bottom" align="start" className="w-64 p-2">
                  <div className="flex flex-col gap-1">
                    {sorted.map((r) => (
                      <div key={r.id} className="text-xs text-ink tabular-nums">
                        {r.start}–{r.end}：{r.activityName || '(未命名)'}
                      </div>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            )}
          </div>
        )}

        {/* 操作 */}
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={onEdit}>
            编辑
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="size-3 mr-1" />
            删除
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
