// AISessionManager — Session 生命周期状态机

type SessionStatus = 'created' | 'active' | 'completing' | 'archived' | 'closed'

interface AISession {
  id: string
  domainId: string
  action: string
  userId: string
  status: SessionStatus
  createdAt: string
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
  }
}
