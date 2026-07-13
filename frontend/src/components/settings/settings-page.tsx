/**
 * @file settings-page
 * @brief 设置页面组件
 *
 * 提供通用、LLM、时区和活动原型的设置功能。
 * 习惯模板分区已废弃（[023] A3.3 硬删 habit_templates 表），由活动原型配置取代。
 *
 * 「活动原型」分区：客户端按需拉取 + 内联 ArchetypeTable，
 * 不再跳转 /config/activity-archetypes 全屏页。左右栏布局保持，
 * 列表受右栏 `flex-1 overflow-y-auto` 约束，不覆盖整个屏幕。
 */

"use client"

import { useEffect, useState } from "react"
import { LLMSettings } from "./llm-settings"
import { TimezonePicker } from "./timezone-picker"
import { ArchetypeTable } from '@/domains/timebox/config/archetype-table'
import { getArchetypes } from "@/app/actions/activity-archetype"
import { setTraceConfig, getTraceConfig } from "@/lib/config/trace-config"
import type { ActivityArchetype } from "@/usom/activity-archetype/types"

/**
 * 设置分区类型
 */
type SettingsSection = 'general' | 'llm' | 'timezone' | 'archetypes'

/**
 * SettingsPage 组件属性
 */
interface SettingsPageProps {
  /** 初始分区 */
  initialSection?: 'general' | 'llm' | 'timezone' | 'archetypes'
}

const NAV_ITEMS: { key: SettingsSection; label: string }[] = [
  { key: 'general', label: '通用' },
  { key: 'llm', label: 'LLM' },
  { key: 'timezone', label: '时区' },
  { key: 'archetypes', label: '活动原型' },
]

export function SettingsPage({ initialSection }: SettingsPageProps) {
  const [section, setSection] = useState<SettingsSection>(initialSection ?? 'general')
  const [traceEnabled, setTraceEnabled] = useState(() => getTraceConfig().enabled)

  // ─── 活动原型：mount 时一次预拉（loading 初值=true，避免 effect 内同步 setState） ─
  const [archetypes, setArchetypes] = useState<ActivityArchetype[]>([])
  const [archetypesLoading, setArchetypesLoading] = useState(true)
  const [archetypesError, setArchetypesError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getArchetypes()
      .then((r) => {
        if (cancelled) return
        if (r.success && r.data) {
          setArchetypes(r.data)
        } else {
          setArchetypesError(r.error ?? '加载活动原型失败')
        }
      })
      .catch((err) => {
        if (cancelled) return
        setArchetypesError(err instanceof Error ? err.message : '加载活动原型失败')
      })
      .finally(() => {
        if (cancelled) return
        setArchetypesLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const handleTraceToggle = () => {
    const next = !traceEnabled
    setTraceEnabled(next)
    setTraceConfig({ enabled: next })
  }

  return (
    <div className="flex h-full">
      <nav className="w-48 shrink-0 border-r border-hairline p-4">
        <h2 className="mb-4 text-lg font-medium text-ink">设置</h2>
        {NAV_ITEMS.map(item => (
          <button
            key={item.key}
            type="button"
            onClick={() => setSection(item.key)}
            className={`block w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
              section === item.key ? 'bg-surface-soft text-ink' : 'text-body hover:bg-hover-overlay'
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <div className="flex-1 overflow-y-auto p-6">
        {section === 'general' && (
          <div>
            <p className="mb-4 text-sm text-body">通用设置</p>
            <div className="flex items-center justify-between rounded-md border border-hairline px-4 py-3">
              <div>
                <p className="text-sm font-medium text-ink">追踪日志</p>
                <p className="text-xs text-body/60">记录意图执行的详细追踪信息</p>
              </div>
              <button
                type="button"
                onClick={handleTraceToggle}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                  traceEnabled ? 'bg-primary' : 'bg-muted'
                }`}
              >
                <span className={`pointer-events-none inline-block size-5 rounded-full bg-white shadow-sm ring-0 transition-transform ${
                  traceEnabled ? 'translate-x-5' : 'translate-x-0'
                }`} />
              </button>
            </div>
          </div>
        )}
        {section === 'llm' && <LLMSettings />}
        {section === 'timezone' && <TimezonePicker />}
        {section === 'archetypes' && (
          <div className="space-y-3">
            <p className="text-sm text-body">
              管理跨域共享的活动原型词典（4 维能量消耗 + 6 维执行特征）。
            </p>
            {archetypesLoading && (
              <p className="text-sm text-body/60">加载中…</p>
            )}
            {archetypesError && (
              <p className="text-sm text-error">{archetypesError}</p>
            )}
            {!archetypesLoading && !archetypesError && (
              <ArchetypeTable initialData={archetypes} />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
