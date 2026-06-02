/**
 * @file session
 * @brief AI 会话管理 Server Action 模块
 * 
 * 提供会话的创建、加载、保存和删除等功能
 */

'use server'

import { AISessionRepository } from '@/lib/db/repositories/session.repository'
import { createMemoryFramework } from '@/nexus/ai-runtime/memory'
import { createAIRuntime } from '@/nexus/ai-runtime'
import type { AISessionSummary, ChatMessage, CnuiSurfaceRef } from '@/usom/types/objects'

/** MVP 用户 ID（临时使用） */
const MVP_USER_ID = '00000000-0000-0000-0000-000000000001'

/** 会话仓库实例 */
const sessionRepo = new AISessionRepository()

/** 消息保留天数（从环境变量读取，默认 60 天） */
const RETENTION_DAYS = parseInt(process.env.MESSAGE_RETENTION_DAYS || '60', 10)

/**
 * 加载用户所有 session 列表，同时惰性清理过期数据
 * 
 * @returns 会话摘要列表
 */
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

/**
 * 加载某个 session 的全部消息
 * 
 * @param sessionId - 会话 ID
 * @returns 消息列表
 */
export async function loadSessionMessages(sessionId: string): Promise<ChatMessage[]> {
  const mf = createMemoryFramework()
  return mf.l1.getMessages(sessionId, MVP_USER_ID) as Promise<ChatMessage[]>
}

/**
 * 创建新 session
 * 
 * @param title - 会话标题（可选）
 * @returns 新会话的 ID 和标题
 */
export async function createSession(title?: string): Promise<{ id: string; title: string }> {
  const session = await sessionRepo.create({
    userId: MVP_USER_ID,
    title: title || '新对话',
    status: 'active',
    messages: [],
    stateSnapshot: {},
    referencedObjectIds: [],
  }, MVP_USER_ID)

  return { id: session.id, title: session.title }
}

/**
 * 持久化一条消息到 Memory Framework L1
 * 
 * @param sessionId - 会话 ID
 * @param message - 消息内容
 */
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

/**
 * 软删除 session
 * 
 * @param sessionId - 会话 ID
 */
export async function deleteSession(sessionId: string): Promise<void> {
  const mf = createMemoryFramework()
  await sessionRepo.softDelete(sessionId, MVP_USER_ID)
  await mf.l1.softDeleteMessages(sessionId, MVP_USER_ID)
}

/**
 * 恢复已删除 session（60 天内）
 * 
 * @param sessionId - 会话 ID
 */
export async function restoreSession(sessionId: string): Promise<void> {
  const mf = createMemoryFramework()
  await sessionRepo.restore(sessionId, MVP_USER_ID)
  await mf.l1.restoreMessages(sessionId, MVP_USER_ID)
}

/**
 * 获取 session 消息计数
 * 
 * @param sessionId - 会话 ID
 * @returns 消息数量
 */
export async function getMessageCount(sessionId: string): Promise<number> {
  const mf = createMemoryFramework()
  const messages = await mf.l1.getMessages(sessionId, MVP_USER_ID)
  return messages.length
}

/**
 * 检查并生成标题（在消息数达到阈值时调用）
 * 
 * @param sessionId - 会话 ID
 * @returns 生成的标题，失败返回 null
 */
export async function tryGenerateTitle(sessionId: string): Promise<string | null> {
  const mf = createMemoryFramework()
  const messages = await mf.l1.getMessages(sessionId, MVP_USER_ID)

  // 至少 2 条消息时触发（1 轮对话即可）
  if (messages.length < 2) return null

  const session = await sessionRepo.findById(sessionId, MVP_USER_ID)
  if (!session) return null

  // 已有自定义标题则跳过
  if (session.title !== '新对话') return null

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
