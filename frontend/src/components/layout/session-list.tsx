"use client"

import type { AISessionSummary } from "@/usom/types/objects"

interface SessionListProps {
  sessions: AISessionSummary[]
  activeSessionId?: string
  onSelectSession: (sessionId: string) => void
  onNewSession: () => void
  onArchiveSession?: (sessionId: string) => void
  onDeleteSession?: (sessionId: string) => void
}

function groupByDate(sessions: AISessionSummary[]): { label: string; sessions: AISessionSummary[] }[] {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)

  const groups: { label: string; sessions: AISessionSummary[] }[] = [
    { label: '今天', sessions: [] },
    { label: '昨天', sessions: [] },
    { label: '更早', sessions: [] },
  ]

  for (const session of sessions) {
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

  return groups.filter(g => g.sessions.length > 0)
}

export function SessionList({ sessions, activeSessionId, onSelectSession, onNewSession, onArchiveSession, onDeleteSession }: SessionListProps) {
  const groups = groupByDate(sessions)

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={onNewSession}
        className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-hairline px-3 py-2 text-sm text-body hover:bg-surface-soft hover:text-ink transition-colors"
      >
        + 新对话
      </button>

      {groups.map(group => (
        <div key={group.label}>
          <div className="px-1 py-1 text-xs font-medium text-body/60">{group.label}</div>
          {group.sessions.map(session => (
            <button
              key={session.id}
              type="button"
              onClick={() => onSelectSession(session.id)}
              onContextMenu={(e) => {
                e.preventDefault()
                if (session.status === 'active' && onArchiveSession) {
                  onArchiveSession(session.id)
                }
              }}
              className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-left transition-colors ${
                session.id === activeSessionId
                  ? "bg-surface-soft text-ink"
                  : "text-body hover:bg-surface-soft/50"
              }`}
            >
              <span className="truncate flex-1">{session.title}</span>
              {session.status === 'archived' && (
                <span className="text-xs text-body/40 shrink-0">已归档</span>
              )}
            </button>
          ))}
        </div>
      ))}

      {sessions.length === 0 && (
        <p className="py-4 text-center text-xs text-body/40">暂无对话</p>
      )}
    </div>
  )
}
