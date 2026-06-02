/**
 * @file settings-page
 * @brief 设置页面组件
 * 
 * 提供通用、LLM、时区和习惯模板的设置功能
 */

"use client"

import { useState } from "react"
import { LLMSettings } from "./llm-settings"
import { TimezonePicker } from "./timezone-picker"
import { setTraceConfig, getTraceConfig } from "@/lib/config/trace-config"

/**
 * 设置分区类型
 */
type SettingsSection = 'general' | 'llm' | 'timezone' | 'templates'

/**
 * SettingsPage 组件属性
 */
interface SettingsPageProps {
  /** 模板管理回调 */
  onTemplateManage?: () => void
  /** 初始分区 */
  initialSection?: 'general' | 'llm' | 'timezone' | 'templates'
}

const NAV_ITEMS: { key: SettingsSection; label: string }[] = [
  { key: 'general', label: '通用' },
  { key: 'llm', label: 'LLM' },
  { key: 'timezone', label: '时区' },
  { key: 'templates', label: '习惯模板' },
]

export function SettingsPage({ onTemplateManage, initialSection }: SettingsPageProps) {
  const [section, setSection] = useState<SettingsSection>(initialSection ?? 'general')
  const [traceEnabled, setTraceEnabled] = useState(() => getTraceConfig().enabled)

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
        {section === 'templates' && (
          <div>
            <p className="mb-3 text-sm text-body">管理习惯模板</p>
            <button type="button" onClick={onTemplateManage} className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground">
              打开模板管理
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
