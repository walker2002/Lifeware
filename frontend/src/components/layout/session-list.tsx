'use client'

import { useState } from 'react'
import type { AISessionSummary } from '@/usom/types/objects'
import { Trash2, ChevronRight } from 'lucide-react'

interface SessionListProps {
  sessions: AISessionSummary[]
  activeSessionId?: string
  onSelectSession: (sessionId: string) => void
  onNewSession: () => void
  onDeleteSession?: (sessionId: string) => void
}

function formatTime(isoString: string): string {
  const d = new Date(isoString)
  const month = d.getMonth() + 1
  const day = d.getDate()
  const hour = d.getHours().toString().padStart(2, '0')
  const min = d.getMinutes().toString().padStart(2, '0')
  return `${month}月${day}日 ${hour}:${min}`
}

function splitSessions(sessions: AISessionSummary[]) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)

  const activeItems: AISessionSummary[] = []
  const archivedItems: AISessionSummary[] = []

  for (const s of sessions) {
    if (s.status === 'archived') {
      archivedItems.push(s)
    } else {
      activeItems.push(s)
    }
  }

  const groups: { label: string; sessions: AISessionSummary[] }[] = [
    { label: '今天', sessions: [] },
    { label: '昨天', sessions: [] },
    { label: '更早', sessions: [] },
  ]

  for (const session of activeItems) {
    const updated = new Date(session.updatedAt)
    const day = new Date(updated.getFullYear(), updated.getMonth(), updated.getDate())
    if (day.getTime() === today.getTime()) {
      groups[0].sessions.push(session)
    } else if (day.getTime() === yesterday.getTime()) {
      groups[1].sessions.push(session)
    } else {
      groups[2].sessions.push(session)
    }
  }

  return { activeGroups: groups.filter(g => g.sessions.length > 0), archivedItems }
}

export function SessionList({ sessions, activeSessionId, onSelectSession, onNewSession, onDeleteSession }: SessionListProps) {
  const [showArchived, setShowArchived] = useState(false)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const { activeGroups, archivedItems } = splitSessions(sessions)

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={onNewSession}
        className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-hairline px-3 py-2 text-sm text-body hover:bg-hover-overlay hover:text-ink transition-colors"
      >
        + 新对话
      </button>

      {activeGroups.map(group => (
        <div key={group.label}>
          <div className="px-1 py-1 text-xs font-medium text-body/60">{group.label}</div>
          {group.sessions.map(session => (
            <div
              key={session.id}
              className="relative group"
              onMouseEnter={() => setHoveredId(session.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <button
                type="button"
                onClick={() => onSelectSession(session.id)}
                className={`flex w-full flex-col items-start gap-0.5 rounded-md px-3 py-2 text-left transition-colors ${
                  session.id === activeSessionId
                    ? 'bg-surface-soft text-ink'
                    : 'text-body hover:bg-hover-overlay'
                }`}
              >
                <span className="truncate w-full text-sm">{session.title}</span>
                <span className="text-xs text-body/40">{formatTime(session.updatedAt)}</span>
              </button>
              {hoveredId === session.id && onDeleteSession && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onDeleteSession(session.id) }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-body/30 hover:text-error transition-colors"
                  title="删除对话"
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      ))}

      {archivedItems.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowArchived(!showArchived)}
            className="flex w-full items-center gap-1 px-1 py-1 text-xs font-medium text-body/40 hover:text-body/60 transition-colors"
          >
            <ChevronRight className={`size-2.5 transition-transform ${showArchived ? 'rotate-90' : ''}`} />
            已归档 ({archivedItems.length})
          </button>
          {showArchived && archivedItems.map(session => (
            <div key={session.id} className="relative group"
              onMouseEnter={() => setHoveredId(session.id)}
              onMouseLeave={() => setHoveredId(null)}>
              <button
                type="button"
                onClick={() => onSelectSession(session.id)}
                className="flex w-full flex-col items-start gap-0.5 rounded-md px-3 py-2 text-left text-body/50 hover:bg-hover-overlay transition-colors"
              >
                <span className="truncate w-full text-sm">{session.title}</span>
                <span className="text-xs text-body/30">{formatTime(session.updatedAt)}</span>
              </button>
            </div>
          ))}
        </div>
      )}

      {sessions.length === 0 && (
        <p className="py-4 text-center text-xs text-body/40">暂无对话</p>
      )}
    </div>
  )
}
