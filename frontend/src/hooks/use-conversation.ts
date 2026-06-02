/**
 * @file use-conversation
 * @brief 会话管理 Hook
 * 
 * 管理 AI 会话的生命周期，包括加载、保存、切换等操作
 */

"use client"

import { useState, useCallback, useRef } from "react"
import { useAppView } from "@/contexts/app-context"
import type { ChatMessage, AISessionSummary, SurfaceState } from "@/usom/types/objects"
import { fetchSessions, loadSessionMessages, createSession, saveMessage, deleteSession, tryGenerateTitle, saveSurfaceOutcome } from '@/app/actions/session'

/**
 * 会话管理 Hook
 */
export function useConversation() {
  const { mainViewState, setMainViewState } = useAppView()

  const [sessions, setSessions] = useState<AISessionSummary[]>([])
  const [conversationMessages, setConversationMessages] = useState<ChatMessage[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | undefined>()
  const activeSessionIdRef = useRef(activeSessionId)
  activeSessionIdRef.current = activeSessionId
  const [sessionsLoaded, setSessionsLoaded] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null)

  /** 加载 session 列表 + 自动恢复上次活跃对话（由调用方在 useEffect 中调用） */
  const loadSessions = useCallback(() => {
    fetchSessions()
      .then(data => {
        setSessions(data)
        const lastActive = data.find(s => s.status === 'active')
        if (lastActive) {
          setActiveSessionId(lastActive.id)
          setMainViewState({ type: 'conversation', sessionId: lastActive.id })
          return loadSessionMessages(lastActive.id)
        }
        return [] as ChatMessage[]
      })
      .then(msgs => {
        if (msgs.length > 0) setConversationMessages(msgs)
      })
      .catch(err => console.error('[fetchSessions] 加载失败:', err))
      .finally(() => setSessionsLoaded(true))
  }, [setMainViewState])

  /** 添加消息到对话列表并持久化到 L1 */
  const addChatMessage = useCallback((msg: ChatMessage) => {
    setConversationMessages(prev => [...prev, msg])
    const sid = activeSessionIdRef.current
    if (sid) {
      const saveP = saveMessage(sid, {
        role: msg.role,
        content: msg.content,
        cnuiSurface: msg.cnuiSurface,
        intentRef: msg.intentRef,
      })

      if (msg.role === 'assistant') {
        saveP.then(() => tryGenerateTitle(sid))
          .then(newTitle => {
            if (newTitle) {
              setSessions(prev => prev.map(s =>
                s.id === sid ? { ...s, title: newTitle } : s
              ))
            }
          })
          .catch(err => console.error('[addChatMessage] 保存或标题生成失败:', err))
      } else {
        saveP.catch(err => console.error('[saveMessage] 持久化失败:', err))
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps — activeSessionIdRef 通过 ref 读取无需列入 deps；setSessions/setConversationMessages 为 useState setter 稳定引用

  const saveCurrentConversation = useCallback(() => {
    // 持久化已由 saveMessage 在每个消息发送时处理
  }, [])

  const handleDeleteSession = useCallback((sessionId: string) => {
    const session = sessions.find(s => s.id === sessionId)
    setDeleteTarget({ id: sessionId, title: session?.title ?? '未命名对话' })
  }, [sessions])

  const confirmDeleteSession = useCallback(async () => {
    if (!deleteTarget) return
    try {
      await deleteSession(deleteTarget.id)
      setSessions(prev => prev.filter(s => s.id !== deleteTarget.id))
      if (activeSessionId === deleteTarget.id) {
        setActiveSessionId(undefined)
        setConversationMessages([])
        setMainViewState({ type: 'schedule', date: new Date(), viewMode: 'day' })
      }
    } catch (err) {
      console.error('[deleteSession] 删除失败:', err)
    } finally {
      setDeleteTarget(null)
    }
  }, [deleteTarget, activeSessionId, setMainViewState])

  const handleSelectSession = useCallback(async (sessionId: string) => {
    saveCurrentConversation()
    setMainViewState({ type: 'conversation', sessionId })
    setActiveSessionId(sessionId)
    try {
      const msgs = await loadSessionMessages(sessionId)
      setConversationMessages(msgs)
    } catch (err) {
      console.error('[loadSessionMessages] 加载失败:', err)
    }
  }, [saveCurrentConversation, setMainViewState])

  const handleNewSession = useCallback(async () => {
    const hasSubstantialMessages = conversationMessages.some(
      m => m.role === 'user' || (m.role === 'assistant' && m.content.trim().length > 0)
    )
    if (!hasSubstantialMessages && mainViewState.type === 'conversation') {
      setConversationMessages([])
      return
    }

    setConversationMessages([])

    try {
      const { id, title } = await createSession()
      setSessions(prev => [{
        id, title, status: 'active',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      }, ...prev])
      setActiveSessionId(id)
      setMainViewState({ type: 'conversation', sessionId: id })
    } catch (err) {
      console.error('[createSession] 创建失败:', err)
      const newId = crypto.randomUUID()
      setSessions(prev => [{
        id: newId, title: '新对话', status: 'active',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      }, ...prev])
      setActiveSessionId(newId)
      setMainViewState({ type: 'conversation', sessionId: newId })
    }
  }, [conversationMessages, mainViewState, setMainViewState])

  /** 确保当前处于对话视图（如不处于则创建/切换） */
  const ensureConversationView = useCallback(() => {
    if (mainViewState.type === 'conversation') return
    const sessionId = activeSessionId ?? crypto.randomUUID()
    if (!activeSessionId) {
      setSessions(prev => [{
        id: sessionId, title: '新对话', status: 'active',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      }, ...prev])
      setActiveSessionId(sessionId)
    }
    setMainViewState({ type: 'conversation', sessionId })
  }, [mainViewState, activeSessionId, setMainViewState])

  /** CNUI 表面状态变更 → 持久化到消息中 + 后端 session */
  const handleSurfaceStateChange = useCallback(async (surfaceId: string, state: SurfaceState) => {
    // 1. 更新本地 messages
    setConversationMessages(prev => prev.map(msg => {
      if (msg.cnuiSurface?.cnuiSurfaceId === surfaceId) {
        return { ...msg, cnuiSurface: { ...msg.cnuiSurface, state } }
      }
      return msg
    }))

    // 2. 持久化到后端 session stateSnapshot（仅终端状态）
    const sid = activeSessionIdRef.current
    if (sid && (state === 'saved' || state === 'cancelled')) {
      try {
        await saveSurfaceOutcome(sid, surfaceId, state)
      } catch (err) {
        console.error('[handleSurfaceStateChange] 持久化 surface 状态失败:', err)
      }
    }
  }, [])

  return {
    sessions, conversationMessages, activeSessionId, activeSessionIdRef,
    sessionsLoaded, deleteTarget, setDeleteTarget,
    loadSessions, addChatMessage, saveCurrentConversation,
    handleDeleteSession, confirmDeleteSession,
    handleSelectSession, handleNewSession,
    ensureConversationView, handleSurfaceStateChange,
  }
}
