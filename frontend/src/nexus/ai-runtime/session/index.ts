// AISessionManager — Session 生命周期状态机

type SessionStatus = 'created' | 'active' | 'completing' | 'archived' | 'closed'

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
  status: SessionStatus
  createdAt: string
  queryResults?: QueryResultEntry[]
}

interface CreateSessionParams {
  domainId: string
  action: string
  userId: string
}

// 合法状态转换表
const VALID_TRANSITIONS: Record<SessionStatus, SessionStatus[]> = {
  created: ['active', 'closed'],
  active: ['completing', 'closed'],
  completing: ['archived', 'closed'],
  archived: [],
  closed: [],
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

  function transition(sessionId: string, targetStatus: SessionStatus): AISession {
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
