"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { TilesBanner } from "@/components/layout/tiles-banner";
import { SessionList } from "@/components/layout/session-list";
import { GrowthMenu } from "@/components/layout/growth-menu";
import { ConversationView } from "@/components/layout/conversation-view";
import { SplitView } from "@/components/layout/main-content";
import { IntentInput } from "@/components/intent-input";
import { IntentForm } from "@/components/intent-form";
import type { TemplateFormFields } from "@/components/intent-form";
import { SettingsPage } from "@/components/settings/settings-page";
import { DateNav } from "@/domains/timebox/components/date-nav";
import type { DateViewMode } from "@/domains/timebox/components/types";
import { HABIT_USER_FACING } from "@/lib/constants/habit-messages";
import { DayView } from "@/domains/timebox/components/day-view";
import { WeekView } from "@/domains/timebox/components/week-view";
import { MonthView } from "@/domains/timebox/components/month-view";
import { HabitListPage } from "@/domains/habits/pages/HabitListPage";
import { HabitTemplatePage } from "@/domains/habits/pages/HabitTemplatePage";
import "@/domains/habits/register-form";
import type { TimeboxSummary } from "@/usom/types/summaries";
import type { ActionSurface } from "@/usom/types/process";
import type { TraceSession } from "@/nexus/infrastructure/trace-logger/trace-types";
import type { AISessionSummary } from "@/usom/types/objects";
import { submitIntent, submitTemplateIntent, getTimeboxesByRange, transitionTimebox, submitExecutionIntent, submitBatchIntent, resolveShortcut, fetchDomainActions, submitDynamicIntent, parseHabitIntentOnly, openCnuiSurface, submitCnuiSurface, isCnuiSurface, getActionResponse } from "./actions/intent"
import { fetchIntentTriggers } from "./actions/intent-triggers"
import { recordActivity } from "./actions/activity-recorder"
import { fetchFrequentIntents } from "./actions/activity"
import { checkLLMConfigured } from "./actions/llm-config"
import { fetchSessions, loadSessionMessages, createSession, saveMessage, deleteSession, tryGenerateTitle } from './actions/session'
import { ConfirmDeleteDialog } from '@/components/layout/confirm-delete-dialog'
import { getTraceConfig } from "@/lib/config/trace-config";
import type { IntentSubmissionResult, ExecutionIntentResult, BatchIntentResult } from "./actions/intent";
import { usePageView } from '@/hooks/use-page-view'
import { Button } from "@/components/ui/button";
import { ExecutionLogDialog } from "@/components/execution-log-dialog";
import type { ExecutionRecord, ChatMessage } from "@/usom/types/objects";
import { useAutoTrigger } from "@/hooks/use-auto-trigger";
import {
  startOfDay, endOfDay,
  startOfWeek, endOfWeek,
  startOfMonth, endOfMonth,
  addDays, addWeeks, addMonths,
} from "date-fns";
import { resolveSlashCommand } from "@/lib/slash-command";
import type { MainViewState, PanelTab, SplitWith } from "@/components/layout/main-view-state";
import type { SurfaceState } from "@/usom/types/objects";

// view_route 页面组件映射（domainId → action → Component）
// 在 AppShell 主内容区内渲染，保留左侧面板和顶部导航
const VIEW_PAGE_COMPONENTS: Record<string, Record<string, React.ComponentType<any>>> = {
  habits: {
    view_list: HabitListPage,
    view_templates: HabitTemplatePage,
    createHabit: HabitListPage,
  },
};

const INITIAL_TIMEBOXES: TimeboxSummary[] = [];

function getDateRange(mode: DateViewMode, date: Date): { start: Date; end: Date } {
  switch (mode) {
    case 'day':
      return { start: startOfDay(date), end: endOfDay(date) };
    case 'week':
      return { start: startOfWeek(date, { weekStartsOn: 1 }), end: endOfWeek(date, { weekStartsOn: 1 }) };
    case 'month':
      return { start: startOfMonth(date), end: endOfMonth(date) };
  }
}

function navigateDate(mode: DateViewMode, date: Date, direction: 'prev' | 'next'): Date {
  const delta = direction === 'next' ? 1 : -1;
  switch (mode) {
    case 'day': return addDays(date, delta);
    case 'week': return addWeeks(date, delta);
    case 'month': return addMonths(date, delta);
  }
}

export default function Home() {
  const [timeboxes, setTimeboxes] = useState<TimeboxSummary[]>(INITIAL_TIMEBOXES);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [actionSurface, setActionSurface] = useState<ActionSurface | undefined>();
  const [dateMode, setDateMode] = useState<DateViewMode>("day");
  const [currentDate, setCurrentDate] = useState<Date>(new Date());

  const [mainViewState, setMainViewState] = useState<MainViewState>({
    type: 'schedule',
    date: new Date(),
    viewMode: 'day',
  });
  const [panelTab, setPanelTab] = useState<PanelTab>("assistant");
  const [splitWith, setSplitWith] = useState<SplitWith | undefined>();

  const [sessions, setSessions] = useState<AISessionSummary[]>([]);
  const [conversationMessages, setConversationMessages] = useState<ChatMessage[]>([]);
  const [domainActions, setDomainActions] = useState<Array<{ domainId: string; domainName: string; actions: Array<{ action: string; shortcut?: string; description: string }> }>>([]);
  const [intentTriggers, setIntentTriggers] = useState<Awaited<ReturnType<typeof fetchIntentTriggers>>>([])
  const [frequentIntents, setFrequentIntents] = useState<Awaited<ReturnType<typeof fetchFrequentIntents>>>([])

  usePageView(
    mainViewState.type === 'action' ? mainViewState.domainId : undefined,
    mainViewState.type === 'action' ? mainViewState.action : undefined,
  )

  useEffect(() => {
    fetchDomainActions()
      .then(setDomainActions)
      .catch(err => console.error('[fetchDomainActions] 加载失败:', err))
  }, []);

  useEffect(() => {
    checkLLMConfigured().then(setLlmConfigured)
  }, []);
  useEffect(() => {
    fetchIntentTriggers()
      .then(setIntentTriggers)
      .catch(err => console.error('[fetchIntentTriggers] 加载失败:', err))
  }, []);
  useEffect(() => {
    fetchFrequentIntents(20)
      .then(setFrequentIntents)
      .catch(err => console.error('[fetchFrequentIntents] 加载失败:', err))
  }, []);
  const [activeSessionId, setActiveSessionId] = useState<string | undefined>();
  const activeSessionIdRef = useRef(activeSessionId)
  activeSessionIdRef.current = activeSessionId
  const [sessionsLoaded, setSessionsLoaded] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null)

  // 页面加载：拉取 session 列表 + 自动恢复上次活跃对话
  useEffect(() => {
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
  }, [])

  const [traceEnabled] = useState(() => getTraceConfig().enabled);
  const [traceSessions, setTraceSessions] = useState<TraceSession[]>([]);
  const [logTarget, setLogTarget] = useState<string | null>(null);
  const [transitionConfirm, setTransitionConfirm] = useState<{
    timeboxId: string; action: string; message: string;
  } | null>(null);
  const [confirmation, setConfirmation] = useState<{
    message: string; rawInput?: string; formFields?: TemplateFormFields;
  } | null>(null);

  const [llmConfigured, setLlmConfigured] = useState(true)

  const loadTimeboxes = useCallback(async (modeParam?: DateViewMode, dateParam?: Date) => {
    const m = modeParam ?? dateMode;
    const d = dateParam ?? currentDate;
    const { start, end } = getDateRange(m, d);
    try {
      const data = await getTimeboxesByRange(start, end);
      setTimeboxes(data);
    } catch {}
  }, [dateMode, currentDate]);

  useEffect(() => { loadTimeboxes(); }, [dateMode, currentDate]); // eslint-disable-line react-hooks/exhaustive-deps

  useAutoTrigger({
    timeboxes,
    onTransition: async (id, action) => {
      const result = await transitionTimebox(id, action as any);
      if (result.success) await loadTimeboxes();
    },
  });

  function handleResult(result: IntentSubmissionResult) {
    setTimeboxes(result.timeboxes);
    setActionSurface(result.actionSurface);
    if (result.traceSession) {
      setTraceSessions((prev) => [...prev, result.traceSession!]);
    }
    if (result.needsConfirmation && result.confirmationMessage) {
      setConfirmation({ message: result.confirmationMessage });
      return;
    }
    setConfirmation(null);
    if (!result.success) {
      setError(result.error ?? "提交失败，请重试");
    } else {
      setError(undefined);
    }
  }

  const isExecutionIntent = (input: string): boolean => /^(开始|结束|取消|记录|复盘|启动|完成|停止)/.test(input.trim());
  const isBatchIntent = (input: string): boolean => {
    const timePattern = /\d{1,2}[:：]\d{2}/g;
    const timeMatches = input.match(timePattern);
    if (timeMatches && timeMatches.length >= 2) return true;
    if (/[;；\n]/.test(input) && input.length > 20) return true;
    return false;
  };

  const handleSubmit = useCallback(async (rawInput: string, confirmed?: boolean) => {
    setError(undefined);

    // T048: 快捷方式 → 直接切换 action 视图（server action，避免 node:fs 进入客户端 bundle）
    const shortcut = await resolveShortcut(rawInput)
    if (shortcut) {
      setMainViewState({ type: 'action', domainId: shortcut.domainId, action: shortcut.action })
      setIsLoading(false)
      return
    }

    setIsLoading(true);
    try {
      if (isExecutionIntent(rawInput)) {
        const result = await submitExecutionIntent(rawInput);
        setTimeboxes(result.timeboxes);
        if (!result.success) setError(result.error ?? "执行失败");
        return;
      }
      if (isBatchIntent(rawInput)) {
        const batchResult = await submitBatchIntent(rawInput);
        await loadTimeboxes();
        const batchErrors = batchResult.results.filter(r => r.error).map(r => `第${r.index + 1}个任务"${r.title}"：${r.error}`);
        setError(batchErrors.length > 0 ? batchErrors.join("；") : undefined);
        return;
      }
      const result = await submitIntent(rawInput, confirmed, traceEnabled);
      if (result.needsConfirmation) setConfirmation({ message: result.confirmationMessage ?? "", rawInput });
      handleResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "网络错误，请重试");
    } finally {
      setIsLoading(false);
    }
  }, [traceEnabled, loadTimeboxes]);

  const handleFormSubmit = useCallback(async (fields: TemplateFormFields, confirmed?: boolean) => {
    setError(undefined);
    setIsLoading(true);
    try {
      const result = await submitTemplateIntent(fields, confirmed, traceEnabled);
      if (result.needsConfirmation) setConfirmation({ message: result.confirmationMessage ?? "", formFields: fields });
      handleResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "网络错误，请重试");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!confirmation) return;
    setError(undefined);
    setIsLoading(true);
    try {
      if (confirmation.rawInput) {
        handleResult(await submitIntent(confirmation.rawInput, true, traceEnabled));
      } else if (confirmation.formFields) {
        handleResult(await submitTemplateIntent(confirmation.formFields, true, traceEnabled));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "网络错误，请重试");
    } finally {
      setIsLoading(false);
    }
  }, [confirmation, traceEnabled]);

  const handleCancelConfirmation = useCallback(() => {
    setConfirmation(null);
    setError(undefined);
  }, []);

  const saveCurrentConversation = useCallback(() => {
    // 持久化已由 saveMessage 在每个消息发送时处理
  }, []);

  const handleSettingsClick = useCallback(() => {
    saveCurrentConversation();
    setMainViewState({ type: 'settings' });
  }, [saveCurrentConversation]);

  const handleHomeClick = useCallback(() => {
    saveCurrentConversation();
    setMainViewState({ type: 'schedule', date: new Date(), viewMode: dateMode });
  }, [dateMode, saveCurrentConversation]);

  const handleDateModeChange = useCallback((newMode: DateViewMode) => { setDateMode(newMode); }, []);
  const handleNavigate = useCallback((direction: 'prev' | 'next') => {
    setCurrentDate((prev) => navigateDate(dateMode, prev, direction));
  }, [dateMode]);

  const handleTimeboxAction = useCallback(async (timeboxId: string, action: string) => {
    if (action === "log" || action === "viewLog") { setLogTarget(timeboxId); return; }
    if (action === "cancel") { setTransitionConfirm({ timeboxId, action, message: "确认取消这个时间盒？" }); return; }
    setIsLoading(true);
    try {
      const result = await transitionTimebox(timeboxId, action as any);
      if (result.success) await loadTimeboxes();
      else if (result.needsConfirmation) setTransitionConfirm({ timeboxId, action, message: result.confirmationMessage ?? "确认继续？" });
      else setError(result.error ?? "操作失败");
    } catch (err) { setError(err instanceof Error ? err.message : "操作失败"); }
    finally { setIsLoading(false); }
  }, [loadTimeboxes]);

  const handleTransitionConfirm = useCallback(async () => {
    if (!transitionConfirm) return;
    setIsLoading(true);
    try {
      const result = await transitionTimebox(transitionConfirm.timeboxId, transitionConfirm.action as any);
      if (result.success) await loadTimeboxes();
      else setError(result.error ?? "操作失败");
    } catch (err) { setError(err instanceof Error ? err.message : "操作失败"); }
    finally { setIsLoading(false); setTransitionConfirm(null); }
  }, [transitionConfirm, loadTimeboxes]);

  const handleLogSubmit = useCallback(async (timeboxId: string, executionRecord: ExecutionRecord) => {
    setIsLoading(true);
    try {
      const result = await transitionTimebox(timeboxId, 'log', executionRecord);
      if (result.success) await loadTimeboxes();
      else setError(result.error ?? "记录失败");
    } catch (err) { setError(err instanceof Error ? err.message : "记录失败"); }
    finally { setIsLoading(false); setLogTarget(null); }
  }, [loadTimeboxes]);

  const logTargetTimebox = logTarget ? timeboxes.find(t => t.id === logTarget) : null;
  const handleDateSelect = useCallback((date: Date) => { setCurrentDate(date); setDateMode('day'); }, []);

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
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
        setMainViewState({ type: 'schedule', date: new Date(), viewMode: dateMode })
      }
    } catch (err) {
      console.error('[deleteSession] 删除失败:', err)
    } finally {
      setDeleteTarget(null)
    }
  }, [deleteTarget, activeSessionId, dateMode])

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
  }, [saveCurrentConversation])

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
  }, [conversationMessages, mainViewState])

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
  }, [mainViewState, activeSessionId])

  const handleGrowthAction = useCallback(async (domainId: string, action: string) => {
    saveCurrentConversation();

    void recordActivity({
      activityType: 'menu_click',
      source: 'growth_menu',
      targetDomain: domainId,
      targetAction: action,
    })

    // response_type=cnui → 切换到对话视图并打开 CN-UI 表面
    if (await isCnuiSurface(domainId, action)) {
      ensureConversationView()

      try {
        const result = await openCnuiSurface(domainId, action);
        const msg: ChatMessage = {
          role: 'assistant',
          content: result.content,
          timestamp: new Date().toISOString(),
          cnuiSurface: result.surface,
        };
        addChatMessage(msg);
      } catch (e) {
        console.error('openCnuiSurface failed:', e);
        const errMsg: ChatMessage = { role: 'assistant', content: '打开操作面板失败，请重试', timestamp: new Date().toISOString() };
        addChatMessage(errMsg);
      }
      return;
    }

    // 非 CNUI action：通过 Server Action 检查响应类型
    const { responseType } = await getActionResponse(domainId, action);

    if (responseType === 'page') {
      setMainViewState({ type: 'action', domainId, action });
      return;
    }

    if (responseType === 'text') {
      ensureConversationView()
      const msg: ChatMessage = {
        role: 'assistant',
        content: `操作 ${action} 已记录，请在对话中继续`,
        timestamp: new Date().toISOString(),
      };
      addChatMessage(msg);
      return;
    }

    // 未定义 response_type 或其他情况
    setMainViewState({ type: 'action', domainId, action });
  }, [saveCurrentConversation, ensureConversationView]);

  /** 处理 CN-UI 表面提交 */
  const handleCnuiConfirm = useCallback(
    async (cnuiSurfaceId: string, domainId: string, action: string, data: Record<string, unknown>) => {
      try {
        const result = await submitCnuiSurface(cnuiSurfaceId, domainId, action, data)
        if (result.success) {
          const content = action === 'createHabit' && result.habit?.title
            ? `习惯"${result.habit.title}"创建成功！`
            : '操作成功！'
          const msg: ChatMessage = {
            role: 'assistant',
            content,
            timestamp: new Date().toISOString(),
          }
          addChatMessage(msg)
          void recordActivity({
            activityType: 'cnui_action',
            source: 'cnui_surface',
            targetDomain: domainId,
            targetAction: action,
          })
        } else {
          const msg: ChatMessage = {
            role: 'system',
            content: `操作失败: ${result.error}`,
            timestamp: new Date().toISOString(),
          }
          addChatMessage(msg)
        }
      } catch (e) {
        console.error('submitCnuiSurface failed:', e)
        const msg: ChatMessage = {
          role: 'system',
          content: '网络错误，请重试',
          timestamp: new Date().toISOString(),
        }
        addChatMessage(msg)
      }
    },
    [],
  )

  /** CNUI 表面状态变更 → 持久化到消息中 */
  const handleSurfaceStateChange = useCallback((surfaceId: string, state: SurfaceState) => {
    setConversationMessages(prev => prev.map(msg => {
      if (msg.cnuiSurface?.cnuiSurfaceId === surfaceId) {
        return { ...msg, cnuiSurface: { ...msg.cnuiSurface, state } }
      }
      return msg
    }))
  }, [])

  // T031: conversation 消息发送 → 可能触发 splitWith
  const handleConversationSend = useCallback(async (content: string, attachments?: File[]) => {
    const userMsg: ChatMessage = {
      role: 'user',
      content: content || (attachments && attachments.length > 0 ? `上传了 ${attachments.length} 个文件` : ''),
      timestamp: new Date().toISOString(),
    }
    addChatMessage(userMsg)

    // slash 命令处理 — 必须在 resolveShortcut 之前，否则 /createHabit 无 payload 会被错误路由
    const slashResult = resolveSlashCommand(content)
    if (slashResult.isSlashCommand) {
      const { hasPayload, payload, domainId: explicitDomainId } = slashResult

      // domainId 解析 + view_route 导航检查共用一次 resolveShortcut
      let resolvedDomainId = explicitDomainId
      const shortcut = await resolveShortcut(content)

      if (!resolvedDomainId && shortcut) {
        resolvedDomainId = shortcut.domainId
      }

      // 如果是 view_route 导航类快捷方式（如 /habits），直接导航到页面
      if (shortcut?.view_route) {
        setMainViewState({ type: 'action', domainId: shortcut.domainId, action: shortcut.action })
        const navMsg: ChatMessage = {
          role: 'assistant',
          content: `已导航到 ${shortcut.domainId}/${shortcut.action}`,
          timestamp: new Date().toISOString(),
        }
        addChatMessage(navMsg)
        return
      }

      if (hasPayload && payload) {
        // 有附加内容 → AI 解析字段 → 在对话流内打开 CN-UI 表面
        setIsLoading(true)
        try {
          const habitParse = await parseHabitIntentOnly(content)
          if (habitParse.success && habitParse.action === 'createHabit' && habitParse.fields) {
            const cnuiResult = await openCnuiSurface('habits', 'createHabit')
            // 将 AI 解析的字段合并到 surface 的 dataSnapshot
            const mergedSnapshot = { ...cnuiResult.surface.dataSnapshot, ...habitParse.fields }
            const cnuiMsg: ChatMessage = {
              role: 'assistant',
              content: `已识别习惯信息，请确认：`,
              timestamp: new Date().toISOString(),
              cnuiSurface: { ...cnuiResult.surface, dataSnapshot: mergedSnapshot },
            }
            addChatMessage(cnuiMsg)
            setIsLoading(false)
            return
          }
        } catch (err) {
          console.error('[slashCommand] AI 解析失败:', err)
        }
        // AI 解析失败 → 直接走 submitIntent 通用管道，不 fallthrough 到非 slash 路径
        setIsLoading(true)
        try {
          const result = await submitIntent(content, false, traceEnabled)
          setTimeboxes(result.timeboxes)

          const aiMsg: ChatMessage = {
            role: 'assistant',
            content: result.success ? '已处理你的请求。' : (result.error ?? '处理失败'),
            timestamp: new Date().toISOString(),
          }
          addChatMessage(aiMsg)
        } catch {
          const errMsg: ChatMessage = { role: 'assistant', content: '网络错误，请重试', timestamp: new Date().toISOString() }
          addChatMessage(errMsg)
        } finally {
          setIsLoading(false)
        }
        return
      } else {
        // 无附加内容 → 在对话流内打开 CN-UI 表面
        const targetDomain = resolvedDomainId || shortcut?.domainId || slashResult.domainId
        const targetAction = slashResult.action

        if (targetDomain && targetAction) {
          try {
            const result = await openCnuiSurface(targetDomain, targetAction)
            const cnuiMsg: ChatMessage = {
              role: 'assistant',
              content: result.content,
              timestamp: new Date().toISOString(),
              cnuiSurface: result.surface,
            }
            addChatMessage(cnuiMsg)
          } catch {
            const errMsg: ChatMessage = { role: 'assistant', content: '打开表单失败，请重试', timestamp: new Date().toISOString() }
            addChatMessage(errMsg)
          }
          return
        }

        // 无法解析 domain/action → 回退 submitIntent 通用管道
        setIsLoading(true)
        try {
          const result = await submitIntent(content, false, traceEnabled)
          setTimeboxes(result.timeboxes)

          const aiMsg: ChatMessage = {
            role: 'assistant',
            content: result.success ? '已处理你的请求。' : (result.error ?? '处理失败'),
            timestamp: new Date().toISOString(),
          }
          addChatMessage(aiMsg)
        } catch {
          const errMsg: ChatMessage = { role: 'assistant', content: '网络错误，请重试', timestamp: new Date().toISOString() }
          addChatMessage(errMsg)
        } finally {
          setIsLoading(false)
        }
        return
      }
    }

    // 非 slash 命令 → 快捷命令拦截（view_route 动作不走 AI 管道）
    const shortcut = await resolveShortcut(content)
    if (shortcut) {
      setMainViewState({ type: 'action', domainId: shortcut.domainId, action: shortcut.action })
      const navMsg: ChatMessage = {
        role: 'assistant',
        content: `已导航到 ${shortcut.domainId}/${shortcut.action}`,
        timestamp: new Date().toISOString(),
      }
      addChatMessage(navMsg)
      return
    }

    setIsLoading(true)
    try {
      // 习惯创建意图（自然语言，非 slash 命令）→ AI 解析 → CNUI 对话模式
      const habitParse = await parseHabitIntentOnly(content)
      if (habitParse.success && habitParse.action === 'createHabit' && habitParse.fields) {
        try {
          const cnuiResult = await openCnuiSurface('habits', 'createHabit')
          const mergedSnapshot = { ...cnuiResult.surface.dataSnapshot, ...habitParse.fields }
          const cnuiMsg: ChatMessage = {
            role: 'assistant',
            content: '已识别习惯信息，请确认：',
            timestamp: new Date().toISOString(),
            cnuiSurface: { ...cnuiResult.surface, dataSnapshot: mergedSnapshot },
          }
          addChatMessage(cnuiMsg)
        } catch (err) {
          console.error('[habitIntent] CNUI 打开失败:', err)
          const errMsg: ChatMessage = {
            role: 'assistant',
            content: HABIT_USER_FACING.INTENT_RECOGNIZED,
            timestamp: new Date().toISOString(),
          }
          addChatMessage(errMsg)
        }
        setIsLoading(false)
        return
      }

      const result = await submitIntent(content, false, traceEnabled)
      setTimeboxes(result.timeboxes)

      // 如果 AI 解析出 StructuredIntent，触发分裂视图
      if (result.success && result.actionSurface) {
        const intent = result.actionSurface
        // MVP: 简单判断是否为创建意图 → 触发表单分裂
        if (content.includes('创建') || content.includes('新建')) {
          setSplitWith({
            mode: 'form',
            domainId: 'timebox',
            action: 'create_timebox',
            fields: {},
          })
        }
      }

      // 习惯解析失败但可能是习惯相关 → 提示用户
      if (!habitParse.success && (content.includes('习惯') || content.includes('habit'))) {
        const aiMsg: ChatMessage = {
          role: 'assistant',
          content: HABIT_USER_FACING.INTENT_UNRECOGNIZED(habitParse.error),
          timestamp: new Date().toISOString(),
        }
        addChatMessage(aiMsg)
        setIsLoading(false)
        return
      }

      const aiMsg: ChatMessage = {
        role: 'assistant',
        content: result.success ? '已处理你的请求。' : (result.error ?? '处理失败'),
        timestamp: new Date().toISOString(),
      }
      addChatMessage(aiMsg)
    } catch {
      const errMsg: ChatMessage = { role: 'assistant', content: '网络错误，请重试', timestamp: new Date().toISOString() }
      addChatMessage(errMsg)
    } finally {
      setIsLoading(false)
    }
  }, [traceEnabled])

  const handleCloseSplit = useCallback(() => {
    setSplitWith(undefined)
  }, [])

  // R1: 左侧面板 assistant 标签仅包含会话列表 + LLM 配置引导
  const leftPanelContent = panelTab === 'assistant'
    ? <>
        {!llmConfigured && (
          <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm text-amber-800">请先配置大语言模型</p>
            <button type="button" onClick={() => setMainViewState({ type: 'settings', section: 'llm' })}
              className="mt-2 rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground">
              前往设置
            </button>
          </div>
        )}
        <SessionList
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelectSession={handleSelectSession}
          onNewSession={handleNewSession}
          onDeleteSession={handleDeleteSession}
        />
      </>
    : <GrowthMenu domainActions={domainActions} onAction={handleGrowthAction} />;

  const renderMainContent = () => {
    if (mainViewState.type === 'schedule') {
      return (
        <div className="flex w-full flex-col gap-4">
          <DateNav mode={dateMode} currentDate={currentDate} onModeChange={handleDateModeChange} onNavigate={handleNavigate} />
          {dateMode === "day" && <DayView timeboxes={timeboxes} currentDate={currentDate} onDateSelect={handleDateSelect} onAction={handleTimeboxAction} />}
          {dateMode === "week" && <WeekView timeboxes={timeboxes} currentDate={currentDate} />}
          {dateMode === "month" && <MonthView timeboxes={timeboxes} currentDate={currentDate} />}
        </div>
      );
    }

    if (mainViewState.type === 'conversation') {
      const convView = (
        <ConversationView
          messages={conversationMessages}
          onSendMessage={handleConversationSend}
          isLoading={isLoading}
          recentSessions={sessions.slice(0, 3)}
          onSelectSession={handleSelectSession}
          intentTriggers={intentTriggers}
          frequentIntents={frequentIntents}
          onCnuiConfirm={handleCnuiConfirm}
          onSurfaceStateChange={handleSurfaceStateChange}
        />
      )
      if (splitWith) {
        return (
          <SplitView
            left={convView}
            right={
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-ink">
                    {splitWith.mode === 'form' ? '表单编辑' : 'Markdown 编辑'}
                  </h3>
                  <button type="button" onClick={handleCloseSplit} className="text-xs text-body/50 hover:text-ink">
                    关闭
                  </button>
                </div>
                <p className="text-sm text-body">编辑区（{splitWith.domainId}/{splitWith.action}）</p>
              </div>
            }
          />
        );
      }
      return convView;
    }

    if (mainViewState.type === 'action') {
      const { domainId, action, initialFields } = mainViewState
      // 时间盒日程直接用 schedule 视图
      if (domainId === 'timebox' && (action === 'viewSchedule' || action === 'view_schedule')) {
        return (
          <div className="flex w-full flex-col gap-4">
            <DateNav mode={dateMode} currentDate={currentDate} onModeChange={handleDateModeChange} onNavigate={handleNavigate} />
            {dateMode === "day" && <DayView timeboxes={timeboxes} currentDate={currentDate} onDateSelect={handleDateSelect} onAction={handleTimeboxAction} />}
            {dateMode === "week" && <WeekView timeboxes={timeboxes} currentDate={currentDate} />}
            {dateMode === "month" && <MonthView timeboxes={timeboxes} currentDate={currentDate} />}
          </div>
        )
      }
      const ViewComponent = VIEW_PAGE_COMPONENTS[domainId]?.[action]
      if (ViewComponent) {
        const props = action === 'createHabit'
          ? { autoOpenCreate: true, initialFields }
          : {}
        return (
          <div className="flex-1 overflow-y-auto">
            <ViewComponent {...props} />
          </div>
        )
      }
      return <div className="p-4"><p className="text-sm text-body">页面未找到: {domainId}/{action}</p></div>
    }

    if (mainViewState.type === 'settings') {
      return <SettingsPage initialSection={mainViewState.section} />;
    }

    return null;
  };

  return (
    <>
      <AppShell
        activeTab={panelTab}
        onTabChange={setPanelTab}
        onHomeClick={handleHomeClick}
        onSettingsClick={handleSettingsClick}
        tilesBanner={
          actionSurface && actionSurface.tiles.length > 0
            ? <TilesBanner candidates={actionSurface.tiles} />
            : undefined
        }
        leftPanelContent={leftPanelContent}
        mainContent={renderMainContent()}
      />

      {transitionConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 max-w-sm rounded-lg bg-white p-6 shadow-lg">
            <p className="mb-4 text-sm font-medium text-ink">{transitionConfirm.message}</p>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setTransitionConfirm(null)} disabled={isLoading}>取消</Button>
              <Button size="sm" onClick={handleTransitionConfirm} disabled={isLoading}>{isLoading ? "处理中..." : "确认"}</Button>
            </div>
          </div>
        </div>
      )}

      {logTargetTimebox && (
        <ExecutionLogDialog
          timebox={logTargetTimebox}
          open={!!logTarget}
          onClose={() => setLogTarget(null)}
          onSubmit={handleLogSubmit}
        />
      )}

      <ConfirmDeleteDialog
        open={deleteTarget !== null}
        sessionTitle={deleteTarget?.title ?? ''}
        onConfirm={confirmDeleteSession}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}
