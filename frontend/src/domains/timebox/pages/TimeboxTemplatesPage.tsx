/**
 * @file TimeboxTemplatesPage
 * @brief 时间盒模板管理页面（供 ActionView 内联渲染）
 *
 * 成长领域菜单「时间盒模板管理」点击 → handleGrowthAction →
 * setMainViewState({type:'action', action:'configTimeboxTemplates'}) →
 * ActionView → 本组件。
 *
 * 与 /app/timebox-templates/page.tsx（Next.js 页面路由）渲染同一 TimeboxTemplateEditor：
 * - 独立路由走 Next.js server component（首屏直出，含 PageBanner）
 * - 本组件走 client 懒加载 fetch（用于内嵌到主框架左/右栏）
 */

"use client"

import { useEffect, useState } from "react"
import { TimeboxTemplateEditor } from "@/domains/timebox/components/timebox-template-editor"
import { fetchTimeboxTemplates } from "@/app/actions/timebox-templates"
import type { TimeboxTemplate } from "@/lib/db/repositories/timebox-template"

export function TimeboxTemplatesPage() {
  const [templates, setTemplates] = useState<TimeboxTemplate[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchTimeboxTemplates().then((r) => {
      if (cancelled) return
      if (r.success && r.data) {
        setTemplates(r.data)
      } else {
        setError(r.error ?? "加载失败")
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <p className="text-sm text-body">{error}</p>
      </div>
    )
  }

  if (!templates) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <p className="text-sm text-body/60">加载中…</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <TimeboxTemplateEditor initialTemplates={templates} />
    </div>
  )
}
