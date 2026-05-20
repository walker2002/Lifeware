"use client"

import { useState, useCallback } from "react"

interface DomainAction {
  action: string
  shortcut?: string
  description: string
}

interface DomainActionGroup {
  domainId: string
  domainName: string
  actions: DomainAction[]
}

interface GrowthMenuProps {
  domainActions: DomainActionGroup[]
  onAction: (domainId: string, action: string) => void
}

export function GrowthMenu({ domainActions, onAction }: GrowthMenuProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const toggleGroup = useCallback((domainId: string) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(domainId)) next.delete(domainId)
      else next.add(domainId)
      return next
    })
  }, [])

  return (
    <div className="flex flex-col gap-2">
      {domainActions.length === 0 && (
        <p className="px-3 py-6 text-center text-sm text-body/40">加载中...</p>
      )}
      {domainActions.map(domain => (
        <div key={domain.domainId}>
          <button
            type="button"
            onClick={() => toggleGroup(domain.domainId)}
            className="flex w-full items-center justify-between px-2 py-1.5 text-xs font-medium text-body/60 hover:text-body transition-colors"
          >
            <span>{domain.domainId}</span>
            <span className="text-[10px]">{collapsed.has(domain.domainId) ? '▸' : '▾'}</span>
          </button>
          {!collapsed.has(domain.domainId) && domain.actions.map(act => (
            <button
              key={act.action}
              type="button"
              onClick={() => onAction(domain.domainId, act.action)}
              className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm text-body hover:bg-surface-soft hover:text-ink transition-colors"
            >
              <span>{act.description}</span>
              <span className="text-xs text-body/40">{act.shortcut}</span>
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}
