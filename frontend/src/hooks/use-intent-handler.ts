"use client"

import { useState, useCallback, useEffect } from "react"
import { useApp } from "@/contexts/app-context"
import type { TimeboxSummary } from "@/usom/types/summaries"
import type { ActionSurface } from "@/usom/types/process"
import type { ChatMessage } from "@/usom/types/objects"
import type { TemplateFormFields } from "@/components/intent-form"
import type { TraceSession } from "@/nexus/infrastructure/trace-logger/trace-types"
import type { SplitWith } from "@/components/layout/main-view-state"
import {
  submitIntent,
  submitTemplateIntent,
  submitExecutionIntent,
  submitBatchIntent,
  resolveShortcut,
  fetchDomainActions,
  parseHabitIntentOnly,
  openCnuiSurface,
  submitCnuiSurface,
  isCnuiSurface,
  getActionResponse,
} from "@/app/actions/intent"
import { fetchIntentTriggers } from "@/app/actions/intent-triggers"
import { recordActivity } from "@/app/actions/activity-recorder"
import { fetchFrequentIntents } from "@/app/actions/activity"
import { checkLLMConfigured } from "@/app/actions/llm-config"
import { getTraceConfig } from "@/lib/config/trace-config"
import { resolveSlashCommand } from "@/lib/slash-command"
import { HABIT_USER_FACING } from "@/lib/constants/habit-messages"
import type { IntentSubmissionResult } from "@/app/actions/intent"

interface IntentHandlerDeps {
  setTimeboxes: React.Dispatch<React.SetStateAction<TimeboxSummary[]>>
  setActionSurface: React.Dispatch<React.SetStateAction<ActionSurface | undefined>>
  loadTimeboxes: () => Promise<void>
  addChatMessage: (msg: ChatMessage) => void
  ensureConversationView: () => void
  saveCurrentConversation: () => void
}

export function useIntentHandler(deps: IntentHandlerDeps) {
  const { setMainViewState, setIsLoading, setError } = useApp()

  const [splitWith, setSplitWith] = useState<SplitWith | undefined>()
  const [domainActions, setDomainActions] = useState<
    Array<{
      domainId: string
      domainName: string
      actions: Array<{
        action: string
        shortcut?: string
        description: string
        response_type?: string
      }>
    }>
  >([])
  const [intentTriggers, setIntentTriggers] = useState<
    Awaited<ReturnType<typeof fetchIntentTriggers>>
  >([])
  const [frequentIntents, setFrequentIntents] = useState<
    Awaited<ReturnType<typeof fetchFrequentIntents>>
  >([])

  const [traceEnabled] = useState(() => getTraceConfig().enabled)
  const [traceSessions, setTraceSessions] = useState<TraceSession[]>([])
  const [confirmation, setConfirmation] = useState<{
    message: string
    rawInput?: string
    formFields?: TemplateFormFields
  } | null>(null)
  const [llmConfigured, setLlmConfigured] = useState(true)

  // Effects
  useEffect(() => {
    fetchDomainActions()
      .then(setDomainActions)
      .catch((err) => console.error("[fetchDomainActions] 加载失败:", err))
  }, [])

  useEffect(() => {
    checkLLMConfigured().then(setLlmConfigured)
  }, [])

  useEffect(() => {
    fetchIntentTriggers()
      .then(setIntentTriggers)
      .catch((err) => console.error("[fetchIntentTriggers] 加载失败:", err))
  }, [])

  useEffect(() => {
    fetchFrequentIntents(20)
      .then(setFrequentIntents)
      .catch((err) => console.error("[fetchFrequentIntents] 加载失败:", err))
  }, [])

  // Internal helpers
  const handleResult = useCallback((result: IntentSubmissionResult) => {
    deps.setTimeboxes(result.timeboxes)
    deps.setActionSurface(result.actionSurface)
    if (result.traceSession) {
      setTraceSessions((prev) => [...prev, result.traceSession!])
    }
    if (result.needsConfirmation && result.confirmationMessage) {
      setConfirmation({ message: result.confirmationMessage })
      return
    }
    setConfirmation(null)
    if (!result.success) {
      setError(result.error ?? "提交失败，请重试")
    } else {
      setError(undefined)
    }
  }, [deps.setTimeboxes, deps.setActionSurface, setError])

  const isExecutionIntent = (input: string): boolean =>
    /^(开始|结束|取消|记录|复盘|启动|完成|停止)/.test(input.trim())

  const isBatchIntent = (input: string): boolean => {
    const timePattern = /\d{1,2}[:：]\d{2}/g
    const timeMatches = input.match(timePattern)
    if (timeMatches && timeMatches.length >= 2) return true
    if (/[;；\n]/.test(input) && input.length > 20) return true
    return false
  }

  // Callbacks
  const handleSubmit = useCallback(
    async (rawInput: string, confirmed?: boolean) => {
      setError(undefined)

      // T048: 快捷方式 → 直接切换 action 视图（server action，避免 node:fs 进入客户端 bundle）
      const shortcut = await resolveShortcut(rawInput)
      if (shortcut) {
        setMainViewState({
          type: "action",
          domainId: shortcut.domainId,
          action: shortcut.action,
        })
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      try {
        if (isExecutionIntent(rawInput)) {
          const result = await submitExecutionIntent(rawInput)
          deps.setTimeboxes(result.timeboxes)
          if (!result.success) setError(result.error ?? "执行失败")
          return
        }
        if (isBatchIntent(rawInput)) {
          const batchResult = await submitBatchIntent(rawInput)
          await deps.loadTimeboxes()
          const batchErrors = batchResult.results
            .filter((r) => r.error)
            .map((r) => `第${r.index + 1}个任务"${r.title}"：${r.error}`)
          setError(
            batchErrors.length > 0 ? batchErrors.join("；") : undefined
          )
          return
        }
        const result = await submitIntent(rawInput, confirmed, traceEnabled)
        if (result.needsConfirmation)
          setConfirmation({
            message: result.confirmationMessage ?? "",
            rawInput,
          })
        handleResult(result)
      } catch (err) {
        setError(err instanceof Error ? err.message : "网络错误，请重试")
      } finally {
        setIsLoading(false)
      }
    },
    [traceEnabled, deps.loadTimeboxes]
  )

  const handleFormSubmit = useCallback(
    async (fields: TemplateFormFields, confirmed?: boolean) => {
      setError(undefined)
      setIsLoading(true)
      try {
        const result = await submitTemplateIntent(
          fields,
          confirmed,
          traceEnabled
        )
        if (result.needsConfirmation)
          setConfirmation({
            message: result.confirmationMessage ?? "",
            formFields: fields,
          })
        handleResult(result)
      } catch (err) {
        setError(err instanceof Error ? err.message : "网络错误，请重试")
      } finally {
        setIsLoading(false)
      }
    },
    []
  )

  const handleConfirm = useCallback(async () => {
    if (!confirmation) return
    setError(undefined)
    setIsLoading(true)
    try {
      if (confirmation.rawInput) {
        handleResult(
          await submitIntent(confirmation.rawInput, true, traceEnabled)
        )
      } else if (confirmation.formFields) {
        handleResult(
          await submitTemplateIntent(confirmation.formFields, true, traceEnabled)
        )
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "网络错误，请重试")
    } finally {
      setIsLoading(false)
    }
  }, [confirmation, traceEnabled])

  const handleCancelConfirmation = useCallback(() => {
    setConfirmation(null)
    setError(undefined)
  }, [])

  const handleGrowthAction = useCallback(
    async (domainId: string, action: string) => {
      deps.saveCurrentConversation()

      void recordActivity({
        activityType: "menu_click",
        source: "growth_menu",
        targetDomain: domainId,
        targetAction: action,
      })

      // response_type=cnui → 切换到对话视图并打开 CN-UI 表面
      if (await isCnuiSurface(domainId, action)) {
        deps.ensureConversationView()

        try {
          const result = await openCnuiSurface(domainId, action)
          const msg: ChatMessage = {
            role: "assistant",
            content: result.content,
            timestamp: new Date().toISOString(),
            cnuiSurface: result.surface,
          }
          deps.addChatMessage(msg)
        } catch (e) {
          console.error("openCnuiSurface failed:", e)
          const errMsg: ChatMessage = {
            role: "assistant",
            content: "打开操作面板失败，请重试",
            timestamp: new Date().toISOString(),
          }
          deps.addChatMessage(errMsg)
        }
        return
      }

      // 非 CNUI action：通过 Server Action 检查响应类型
      const { responseType } = await getActionResponse(domainId, action)

      if (responseType === "page") {
        setMainViewState({ type: "action", domainId, action })
        return
      }

      if (responseType === "text") {
        deps.ensureConversationView()
        const msg: ChatMessage = {
          role: "assistant",
          content: `操作 ${action} 已记录，请在对话中继续`,
          timestamp: new Date().toISOString(),
        }
        deps.addChatMessage(msg)
        return
      }

      // 未定义 response_type 或其他情况
      setMainViewState({ type: "action", domainId, action })
    },
    [deps.saveCurrentConversation, deps.ensureConversationView]
  )

  /** 处理 CN-UI 表面提交 */
  const handleCnuiConfirm = useCallback(
    async (
      cnuiSurfaceId: string,
      domainId: string,
      action: string,
      data: Record<string, unknown>
    ) => {
      try {
        const result = await submitCnuiSurface(
          cnuiSurfaceId,
          domainId,
          action,
          data
        )
        if (result.success) {
          const content =
            action === "createHabit" && result.habit?.title
              ? `习惯"${result.habit.title}"创建成功！`
              : "操作成功！"
          const msg: ChatMessage = {
            role: "assistant",
            content,
            timestamp: new Date().toISOString(),
          }
          deps.addChatMessage(msg)
          void recordActivity({
            activityType: "cnui_action",
            source: "cnui_surface",
            targetDomain: domainId,
            targetAction: action,
          })
        } else {
          const msg: ChatMessage = {
            role: "system",
            content: `操作失败: ${result.error}`,
            timestamp: new Date().toISOString(),
          }
          deps.addChatMessage(msg)
        }
      } catch (e) {
        console.error("submitCnuiSurface failed:", e)
        const msg: ChatMessage = {
          role: "system",
          content: "网络错误，请重试",
          timestamp: new Date().toISOString(),
        }
        deps.addChatMessage(msg)
      }
    },
    []
  )

  // T031: conversation 消息发送 → 可能触发 splitWith
  const handleConversationSend = useCallback(
    async (content: string, attachments?: File[]) => {
      const userMsg: ChatMessage = {
        role: "user",
        content:
          content ||
          (attachments && attachments.length > 0
            ? `上传了 ${attachments.length} 个文件`
            : ""),
        timestamp: new Date().toISOString(),
      }
      deps.addChatMessage(userMsg)

      // slash 命令处理 — 必须在 resolveShortcut 之前，否则 /createHabit 无 payload 会被错误路由
      const slashResult = resolveSlashCommand(content)
      if (slashResult.isSlashCommand) {
        const {
          hasPayload,
          payload,
          domainId: explicitDomainId,
        } = slashResult

        // domainId 解析 + view_route 导航检查共用一次 resolveShortcut
        let resolvedDomainId = explicitDomainId
        const shortcut = await resolveShortcut(content)

        if (!resolvedDomainId && shortcut) {
          resolvedDomainId = shortcut.domainId
        }

        // 如果是 view_route 导航类快捷方式（如 /habits），直接导航到页面
        if (shortcut?.view_route) {
          setMainViewState({
            type: "action",
            domainId: shortcut.domainId,
            action: shortcut.action,
          })
          const navMsg: ChatMessage = {
            role: "assistant",
            content: `已导航到 ${shortcut.domainId}/${shortcut.action}`,
            timestamp: new Date().toISOString(),
          }
          deps.addChatMessage(navMsg)
          return
        }

        if (hasPayload && payload) {
          // 有附加内容 → AI 解析字段 → 在对话流内打开 CN-UI 表面
          setIsLoading(true)
          try {
            const habitParse = await parseHabitIntentOnly(content)
            if (
              habitParse.success &&
              habitParse.action === "createHabit" &&
              habitParse.fields
            ) {
              const cnuiResult = await openCnuiSurface(
                "habits",
                "createHabit"
              )
              // 将 AI 解析的字段合并到 surface 的 dataSnapshot
              const mergedSnapshot = {
                ...cnuiResult.surface.dataSnapshot,
                ...habitParse.fields,
              }
              const cnuiMsg: ChatMessage = {
                role: "assistant",
                content: `已识别习惯信息，请确认：`,
                timestamp: new Date().toISOString(),
                cnuiSurface: {
                  ...cnuiResult.surface,
                  dataSnapshot: mergedSnapshot,
                },
              }
              deps.addChatMessage(cnuiMsg)
              setIsLoading(false)
              return
            }
          } catch (err) {
            console.error("[slashCommand] AI 解析失败:", err)
          }
          // AI 解析失败 → 直接走 submitIntent 通用管道，不 fallthrough 到非 slash 路径
          setIsLoading(true)
          try {
            const result = await submitIntent(content, false, traceEnabled)
            deps.setTimeboxes(result.timeboxes)

            const aiMsg: ChatMessage = {
              role: "assistant",
              content: result.success
                ? "已处理你的请求。"
                : result.error ?? "处理失败",
              timestamp: new Date().toISOString(),
            }
            deps.addChatMessage(aiMsg)
          } catch {
            const errMsg: ChatMessage = {
              role: "assistant",
              content: "网络错误，请重试",
              timestamp: new Date().toISOString(),
            }
            deps.addChatMessage(errMsg)
          } finally {
            setIsLoading(false)
          }
          return
        } else {
          // 无附加内容 → 在对话流内打开 CN-UI 表面
          const targetDomain =
            resolvedDomainId ||
            shortcut?.domainId ||
            slashResult.domainId
          const targetAction = slashResult.action

          if (targetDomain && targetAction) {
            try {
              const result = await openCnuiSurface(targetDomain, targetAction)
              const cnuiMsg: ChatMessage = {
                role: "assistant",
                content: result.content,
                timestamp: new Date().toISOString(),
                cnuiSurface: result.surface,
              }
              deps.addChatMessage(cnuiMsg)
            } catch {
              const errMsg: ChatMessage = {
                role: "assistant",
                content: "打开表单失败，请重试",
                timestamp: new Date().toISOString(),
              }
              deps.addChatMessage(errMsg)
            }
            return
          }

          // 无法解析 domain/action → 回退 submitIntent 通用管道
          setIsLoading(true)
          try {
            const result = await submitIntent(content, false, traceEnabled)
            deps.setTimeboxes(result.timeboxes)

            const aiMsg: ChatMessage = {
              role: "assistant",
              content: result.success
                ? "已处理你的请求。"
                : result.error ?? "处理失败",
              timestamp: new Date().toISOString(),
            }
            deps.addChatMessage(aiMsg)
          } catch {
            const errMsg: ChatMessage = {
              role: "assistant",
              content: "网络错误，请重试",
              timestamp: new Date().toISOString(),
            }
            deps.addChatMessage(errMsg)
          } finally {
            setIsLoading(false)
          }
          return
        }
      }

      // 非 slash 命令 → 快捷命令拦截（view_route 动作不走 AI 管道）
      const shortcut = await resolveShortcut(content)
      if (shortcut) {
        setMainViewState({
          type: "action",
          domainId: shortcut.domainId,
          action: shortcut.action,
        })
        const navMsg: ChatMessage = {
          role: "assistant",
          content: `已导航到 ${shortcut.domainId}/${shortcut.action}`,
          timestamp: new Date().toISOString(),
        }
        deps.addChatMessage(navMsg)
        return
      }

      setIsLoading(true)
      try {
        // 习惯创建意图（自然语言，非 slash 命令）→ AI 解析 → CNUI 对话模式
        const habitParse = await parseHabitIntentOnly(content)
        if (
          habitParse.success &&
          habitParse.action === "createHabit" &&
          habitParse.fields
        ) {
          try {
            const cnuiResult = await openCnuiSurface("habits", "createHabit")
            const mergedSnapshot = {
              ...cnuiResult.surface.dataSnapshot,
              ...habitParse.fields,
            }
            const cnuiMsg: ChatMessage = {
              role: "assistant",
              content: "已识别习惯信息，请确认：",
              timestamp: new Date().toISOString(),
              cnuiSurface: {
                ...cnuiResult.surface,
                dataSnapshot: mergedSnapshot,
              },
            }
            deps.addChatMessage(cnuiMsg)
          } catch (err) {
            console.error("[habitIntent] CNUI 打开失败:", err)
            const errMsg: ChatMessage = {
              role: "assistant",
              content: HABIT_USER_FACING.INTENT_RECOGNIZED,
              timestamp: new Date().toISOString(),
            }
            deps.addChatMessage(errMsg)
          }
          setIsLoading(false)
          return
        }

        const result = await submitIntent(content, false, traceEnabled)
        deps.setTimeboxes(result.timeboxes)

        // 如果 AI 解析出 StructuredIntent，触发分裂视图
        if (result.success && result.actionSurface) {
          const intent = result.actionSurface
          // MVP: 简单判断是否为创建意图 → 触发表单分裂
          if (content.includes("创建") || content.includes("新建")) {
            setSplitWith({
              mode: "form",
              domainId: "timebox",
              action: "create_timebox",
              fields: {},
            })
          }
        }

        // 习惯解析失败但可能是习惯相关 → 提示用户
        if (
          !habitParse.success &&
          (content.includes("习惯") || content.includes("habit"))
        ) {
          const aiMsg: ChatMessage = {
            role: "assistant",
            content: HABIT_USER_FACING.INTENT_UNRECOGNIZED(habitParse.error),
            timestamp: new Date().toISOString(),
          }
          deps.addChatMessage(aiMsg)
          setIsLoading(false)
          return
        }

        const aiMsg: ChatMessage = {
          role: "assistant",
          content: result.success
            ? "已处理你的请求。"
            : result.error ?? "处理失败",
          timestamp: new Date().toISOString(),
        }
        deps.addChatMessage(aiMsg)
      } catch {
        const errMsg: ChatMessage = {
          role: "assistant",
          content: "网络错误，请重试",
          timestamp: new Date().toISOString(),
        }
        deps.addChatMessage(errMsg)
      } finally {
        setIsLoading(false)
      }
    },
    [traceEnabled]
  )

  const handleCloseSplit = useCallback(() => {
    setSplitWith(undefined)
  }, [])

  return {
    confirmation,
    traceSessions,
    llmConfigured,
    intentTriggers,
    frequentIntents,
    domainActions,
    splitWith,
    handleSubmit,
    handleFormSubmit,
    handleConfirm,
    handleCancelConfirmation,
    handleGrowthAction,
    handleCnuiConfirm,
    handleConversationSend,
    handleCloseSplit,
  }
}
