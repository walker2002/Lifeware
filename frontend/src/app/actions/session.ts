'use server'

import { AISessionRepository } from '@/lib/db/repositories/session.repository'
import { createMemoryFramework } from '@/nexus/ai-runtime/memory'
import { createAIRuntime } from '@/nexus/ai-runtime'
import type { AISessionSummary, ChatMessage, CnuiSurfaceRef } from '@/usom/types/objects'

const MVP_USER_ID = '00000000-0000-0000-0000-000000000001'
const sessionRepo = new AISessionRepository()
const RETENTION_DAYS = parseInt(process.env.MESSAGE_RETENTION_DAYS || '60', 10)

/** 加载用户所有 session 列表，同时惰性清理过期数据 */
export async function fetchSessions(): Promise<AISessionSummary[]> {
  try {
    const mf = createMemoryFramework()
    await mf.l1.hardDeleteExpired(RETENTION_DAYS)
    await sessionRepo.hardDeleteExpired(RETENTION_DAYS)
  } catch {
    // 清理失败不影响正常流程
  }

  return sessionRepo.findByUserId(MVP_USER_ID)
}

/** 加载某个 session 的全部消息 */
export async function loadSessionMessages(sessionId: string): Promise<ChatMessage[]> {
  const mf = createMemoryFramework()
  return mf.l1.getMessages(sessionId, MVP_USER_ID) as Promise<ChatMessage[]>
}

/** 创建新 session */
export async function createSession(title?: string): Promise<{ id: string; title: string }> {
  const now = new Date().toISOString()
  const defaultTitle = `${parseInt(now.slice(5, 7))}月${parseInt(now.slice(8, 10))}日对话`

  const session = await sessionRepo.create({
    userId: MVP_USER_ID,
    title: title || defaultTitle,
    status: 'active',
    messages: [],
    stateSnapshot: {},
    referencedObjectIds: [],
  }, MVP_USER_ID)

  return { id: session.id, title: session.title }
}

/** 持久化一条消息到 Memory Framework L1 */
export async function saveMessage(sessionId: string, message: {
  role: 'user' | 'assistant' | 'system'
  content: string
  intentRef?: string
  cnuiSurface?: Record<string, unknown> | CnuiSurfaceRef
}): Promise<void> {
  const mf = createMemoryFramework()
  await mf.l1.appendMessage(sessionId, MVP_USER_ID, message)
  await sessionRepo.updateTimestamp(sessionId, MVP_USER_ID)
}

/** 软删除 session */
export async function deleteSession(sessionId: string): Promise<void> {
  const mf = createMemoryFramework()
  await sessionRepo.softDelete(sessionId, MVP_USER_ID)
  await mf.l1.softDeleteMessages(sessionId, MVP_USER_ID)
}

/** 恢复已删除 session（60 天内） */
export async function restoreSession(sessionId: string): Promise<void> {
  const mf = createMemoryFramework()
  await sessionRepo.restore(sessionId, MVP_USER_ID)
  await mf.l1.restoreMessages(sessionId, MVP_USER_ID)
}

/** 获取 session 消息计数 */
export async function getMessageCount(sessionId: string): Promise<number> {
  const mf = createMemoryFramework()
  const messages = await mf.l1.getMessages(sessionId, MVP_USER_ID)
  return messages.length
}

/** 检查并生成标题（在消息数达到阈值时调用） */
export async function tryGenerateTitle(sessionId: string): Promise<string | null> {
  const mf = createMemoryFramework()
  const messages = await mf.l1.getMessages(sessionId, MVP_USER_ID)

  // 只在恰好 4 条消息时（2 轮对话）触发标题生成
  if (messages.length !== 4) return null

  const session = await sessionRepo.findById(sessionId, MVP_USER_ID)
  if (!session) return null

  try {
    const aiRuntime = createAIRuntime()
    const result = await mf.l2.generateSummary({
      userId: MVP_USER_ID,
      sessionId,
      domainId: 'system',
      action: 'generateTitle',
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      generateTitle: true,
    }, aiRuntime)

    if (result.suggestedTitle) {
      await sessionRepo.updateTitle(sessionId, result.suggestedTitle, MVP_USER_ID)
      return result.suggestedTitle
    }
  } catch (err) {
    console.error('[tryGenerateTitle] 标题生成失败:', err)
  }

  return null
}
