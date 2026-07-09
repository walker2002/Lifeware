// AISessionManager — Session 生命周期状态机

import type { AISessionStatus } from '@/usom/types/primitives'

/** 查询结果摘要条目 */
export interface QueryResultEntry {
  action: string
  domain: string
  resultSummary: {
    count: number
    objectIds: string[]
    keyMetrics: Record<string, unknown>
  }
  answerText?: string
  cnuiSurfaceType?: string
  timestamp: string
}

export interface AISession {
  id: string
  domainId: string
  action: string
  userId: string
  status: AISessionStatus
  createdAt: string
  queryResults?: QueryResultEntry[]
}

interface CreateSessionParams {
  domainId: string
  action: string
  userId: string
}

// 合法状态转换表
/**
 * [026.02.3.1] T1 改造: 删局部 `SessionStatus = 'created' | 'active' | 'completing' | 'archived' | 'closed'`
 * 别名,改用 USOM `AISessionStatus`(6 值含 'deleted'); transition 表对应扩展。
 */
const VALID_TRANSITIONS: Record<AISessionStatus, AISessionStatus[]> = {
  // [023.08] 引入 / [026.02.3.1] 扩 'deleted' 终态: 'closed' 是用户主动结束, 'deleted' 留字段兼容未来 server action
  created: ['active', 'closed'],
  active: ['completing', 'closed'],
  completing: ['archived', 'closed'],
  archived: [],        // 终态
  closed: [],          // 终态 — 用户主动结束
  deleted: [],         // 终态 — 软删字段（当前无 server action 触发）
}

export interface AISessionManager {
  create(params: CreateSessionParams): Promise<AISession>
  activate(sessionId: string): Promise<AISession>
  startCompleting(sessionId: string): Promise<AISession>
  archive(sessionId: string): Promise<AISession>
  close(sessionId: string): Promise<AISession>
  get(sessionId: string): AISession | undefined

  // Query Path 方法
  recordQueryResult(sessionId: string, result: QueryResultEntry): void
  getQueryResults(sessionId: string): QueryResultEntry[]
  findActiveSessionByDomain(userId: string, domainId: string): AISession | undefined
}

export function createAISessionManager(): AISessionManager {
  const sessions = new Map<string, AISession>()

  function transition(sessionId: string, targetStatus: AISessionStatus): AISession {
    const session = sessions.get(sessionId)
    if (!session) throw new Error(`Session ${sessionId} not found`)

    const allowed = VALID_TRANSITIONS[session.status]
    if (!allowed.includes(targetStatus)) {
      throw new Error(`Invalid transition: ${session.status} → ${targetStatus}`)
    }

    session.status = targetStatus
    return { ...session }
  }

  return {
    async create(params) {
      const session: AISession = {
        id: crypto.randomUUID(),
        domainId: params.domainId,
        action: params.action,
        userId: params.userId,
        status: 'created',
        createdAt: new Date().toISOString(),
      }
      sessions.set(session.id, session)
      return { ...session }
    },

    async activate(sessionId) {
      return transition(sessionId, 'active')
    },

    async startCompleting(sessionId) {
      return transition(sessionId, 'completing')
    },

    async archive(sessionId) {
      return transition(sessionId, 'archived')
    },

    async close(sessionId) {
      return transition(sessionId, 'closed')
    },

    get(sessionId) {
      return sessions.get(sessionId)
    },

    recordQueryResult(sessionId: string, result: QueryResultEntry) {
      const session = sessions.get(sessionId)
      if (!session) return
      if (!session.queryResults) session.queryResults = []

      const idx = session.queryResults.findIndex(r => r.action === result.action)
      if (idx >= 0) {
        session.queryResults[idx] = result
      } else {
        session.queryResults.push(result)
      }
    },

    getQueryResults(sessionId: string): QueryResultEntry[] {
      return sessions.get(sessionId)?.queryResults ?? []
    },

    findActiveSessionByDomain(userId: string, domainId: string): AISession | undefined {
      for (const session of sessions.values()) {
        if (session.userId === userId
          && session.domainId === domainId
          && session.status === 'active') {
          return session
        }
      }
      return undefined
    },
  }
}
