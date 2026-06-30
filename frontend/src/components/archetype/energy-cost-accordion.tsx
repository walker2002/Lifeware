/**
 * @file energy-cost-accordion
 * @brief 4 维 EnergyCost 展示/校准（跨域共享，[023] A3.2 从 timebox 公共化）
 *
 * C.R2 默认收起：header 显示当前 4 维值「8 / 2 / 3 / 5」，点 header 展开。
 * C.R1 数字可输入 + 进度条仅可视化：每行 name | track(width=val*10%) | number input。
 * 只读模式（archetype 预览 / 详情）不显示 input，仅展示当前值（D6 + 校准分离原则）。
 *
 * 设计补丁：track 用 bg-surface-card（而非 bg-muted，确保跨主题一致），
 * fill 用 bg-accent-teal（design 令牌）提升能耗进度条识别度。
 */

'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { EnergyCost } from '@/usom/activity-archetype/types'

interface EnergyCostAccordionProps {
  /** 4 维能量消耗 */
  value: EnergyCost
  /** 只读（不显示 input，仅展示） */
  readOnly?: boolean
  /** 值变更（校准模式） */
  onChange?: (v: EnergyCost) => void
}

const DIM_LABELS: { key: keyof EnergyCost; label: string }[] = [
  { key: 'physical', label: '体力' },
  { key: 'mental', label: '脑力' },
  { key: 'emotional', label: '情绪' },
  { key: 'creative', label: '创意' },
]

export function EnergyCostAccordion({ value, readOnly, onChange }: EnergyCostAccordionProps) {
  const [open, setOpen] = useState(false)
  const dims = DIM_LABELS.map(d => value[d.key] ?? 0)

  return (
    <div className="energy-accordion">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between py-1.5 text-xs text-body"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <span>能量消耗（4 维）</span>
          <span className="font-mono text-muted">{dims.join(' / ')}</span>
        </span>
        <ChevronDown className={`size-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="flex flex-col gap-1.5 pt-1">
          {DIM_LABELS.map(({ key, label }) => {
            const val = value[key] ?? 0
            return (
              <div key={key} className="grid grid-cols-[48px_1fr_56px] items-center gap-2">
                <span className="text-xs text-body">{label}</span>
                <div className="h-1.5 rounded-full bg-surface-card overflow-hidden">
                  <div
                    className="h-full rounded-full bg-accent-teal"
                    style={{ width: `${val * 10}%` }}
                  />
                </div>
                <div className="flex items-center justify-end gap-0.5">
                  {readOnly ? (
                    <span className="text-xs font-mono text-ink">{val}</span>
                  ) : (
                    <>
                      <input
                        type="number"
                        min={0}
                        max={10}
                        value={val}
                        onChange={e => onChange?.({ ...value, [key]: Number(e.target.value) })}
                        className="h-6 w-10 rounded border border-hairline bg-canvas px-1 text-xs text-ink text-center"
                        aria-label={`${label} 分`}
                      />
                      <span className="text-[10px] text-muted">/10</span>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
