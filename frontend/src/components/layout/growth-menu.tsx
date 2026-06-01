"use client"

import { useState, useCallback } from "react"
import { CheckSquare, Clock, Repeat, Target, Pin, PinOff, ChevronDown, MessageSquare, LayoutGrid, FileText } from "lucide-react"

interface DomainAction {
  action: string
  shortcut?: string
  description: string
  response_type?: 'cnui' | 'page' | 'text'
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

const DOMAIN_META: Record<string, { icon: React.ComponentType<{ className?: string }>; label: string }> = {
  tasks: { icon: CheckSquare, label: '任务' },
  timebox: { icon: Clock, label: '时间盒' },
  habits: { icon: Repeat, label: '习惯' },
  okrs: { icon: Target, label: 'OKR' },
}

const RESPONSE_TYPE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  cnui: MessageSquare,
  page: LayoutGrid,
  text: FileText,
}

const UNPINNED_STORAGE_KEY = 'lw-unpinned-actions'

export function GrowthMenu({ domainActions, onAction }: GrowthMenuProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [unpinned, setUnpinned] = useState<Record<string, string[]>>(() => {
    try {
      const raw = localStorage.getItem(UNPINNED_STORAGE_KEY)
      return raw ? JSON.parse(raw) : {}
    } catch {
      return {}
    }
  })
  const [expandedUnpinned, setExpandedUnpinned] = useState<Set<string>>(new Set())

  const toggleGroup = useCallback((domainId: string) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(domainId)) next.delete(domainId)
      else next.add(domainId)
      return next
    })
  }, [])

  const togglePin = useCallback((domainId: string, action: string) => {
    setUnpinned(prev => {
      const current = prev[domainId] ?? []
      const next = current.includes(action)
        ? current.filter(a => a !== action)
        : [...current, action]
      const newState = { ...prev, [domainId]: next }
      try {
        localStorage.setItem(UNPINNED_STORAGE_KEY, JSON.stringify(newState))
      } catch {}
      return newState
    })
  }, [])

  const toggleUnpinned = useCallback((domainId: string) => {
    setExpandedUnpinned(prev => {
      const next = new Set(prev)
      if (next.has(domainId)) next.delete(domainId)
      else next.add(domainId)
      return next
    })
  }, [])

  return (
    <div className="flex flex-col gap-2">
      {domainActions.length === 0 && (
        <div className="px-3 py-6 space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-8 rounded bg-hairline animate-pulse" />
          ))}
        </div>
      )}
      {domainActions.map(domain => {
        const meta = DOMAIN_META[domain.domainId]
        const Icon = meta?.icon
        const unpinnedList = unpinned[domain.domainId] ?? []
        const pinnedActions = domain.actions.filter(a => !unpinnedList.includes(a.action))
        const unpinnedActions = domain.actions.filter(a => unpinnedList.includes(a.action))

        return (
          <div key={domain.domainId}>
            <button
              type="button"
              onClick={() => toggleGroup(domain.domainId)}
              className="flex w-full items-center gap-1.5 px-2 py-1.5 text-xs font-medium text-body/60 hover:text-body transition-colors"
            >
              {Icon && <Icon className="size-3.5" />}
              <span>{meta?.label ?? domain.domainId}</span>
              <span className="ml-auto text-[10px]">{collapsed.has(domain.domainId) ? '▸' : '▾'}</span>
            </button>

            {!collapsed.has(domain.domainId) && (
              <>
                {pinnedActions.map(act => (
                  <button
                    key={act.action}
                    type="button"
                    onClick={() => onAction(domain.domainId, act.action)}
                    className="group flex w-full items-center gap-1.5 rounded-md px-3 py-2 text-sm text-body hover:bg-hover-overlay hover:text-ink transition-colors"
                  >
                    {(() => {
                      const RespIcon = RESPONSE_TYPE_ICON[act.response_type ?? '']
                      return RespIcon ? <RespIcon className="size-3.5 shrink-0 text-body/40" /> : null
                    })()}
                    <span className="truncate">{act.description}</span>
                    {act.shortcut && (
                      <span className="ml-auto shrink-0 rounded-md bg-surface-soft px-2 py-0.5 text-xs text-muted-foreground">
                        {act.shortcut}
                      </span>
                    )}
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={e => { e.stopPropagation(); togglePin(domain.domainId, act.action) }}
                      className={act.shortcut ? "shrink-0 p-0.5 opacity-0 group-hover:opacity-100 text-body/30 hover:text-primary transition-opacity" : "ml-auto shrink-0 p-0.5 opacity-0 group-hover:opacity-100 text-body/30 hover:text-primary transition-opacity"}
                    >
                      <Pin className="size-3" />
                    </span>
                  </button>
                ))}

                {unpinnedActions.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => toggleUnpinned(domain.domainId)}
                      className="flex w-full items-center gap-1 px-3 py-1 text-xs text-body/40 hover:text-body transition-colors"
                    >
                      <ChevronDown className={`size-3 transition-transform ${expandedUnpinned.has(domain.domainId) ? 'rotate-180' : ''}`} />
                      更多行动
                    </button>
                    {expandedUnpinned.has(domain.domainId) && unpinnedActions.map(act => (
                      <button
                        key={act.action}
                        type="button"
                        onClick={() => onAction(domain.domainId, act.action)}
                        className="group flex w-full items-center gap-1.5 rounded-md px-3 py-2 text-sm text-body hover:bg-hover-overlay hover:text-ink transition-colors"
                      >
                        {(() => {
                          const RespIcon = RESPONSE_TYPE_ICON[act.response_type ?? '']
                          return RespIcon ? <RespIcon className="size-3.5 shrink-0 text-body/40" /> : null
                        })()}
                        <span className="truncate">{act.description}</span>
                        {act.shortcut && (
                          <span className="ml-auto shrink-0 rounded-md bg-surface-soft px-2 py-0.5 text-xs text-muted-foreground">
                            {act.shortcut}
                          </span>
                        )}
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={e => { e.stopPropagation(); togglePin(domain.domainId, act.action) }}
                          className={act.shortcut ? "shrink-0 p-0.5 opacity-0 group-hover:opacity-100 text-body/30 hover:text-primary transition-opacity" : "ml-auto shrink-0 p-0.5 opacity-0 group-hover:opacity-100 text-body/30 hover:text-primary transition-opacity"}
                        >
                          <PinOff className="size-3" />
                        </span>
                      </button>
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
