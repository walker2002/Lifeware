"use client";

import { useState, useCallback, useEffect } from "react";
import { AppProvider, useApp } from "@/contexts/app-context";
import { useTimebox } from "@/hooks/use-timebox";
import { useConversation } from "@/hooks/use-conversation";
import { AppShell } from "@/components/layout/app-shell";
import { TilesBanner } from "@/components/layout/tiles-banner";
import { SessionList } from "@/components/layout/session-list";
import { GrowthMenu } from "@/components/layout/growth-menu";
import { ConversationView } from "@/components/layout/conversation-view";
import { SplitView } from "@/components/layout/main-content";
import { HomeBanner } from "@/components/layout/home-banner";
import { IntentInput } from "@/components/intent-input";
import { IntentForm } from "@/components/intent-form";
import type { TemplateFormFields } from "@/components/intent-form";
import { SettingsPage } from "@/components/settings/settings-page";
import { DateNav } from "@/domains/timebox/components/date-nav";
import { HABIT_USER_FACING } from "@/lib/constants/habit-messages";
import { DayView } from "@/domains/timebox/components/day-view";
import { WeekView } from "@/domains/timebox/components/week-view";
import { MonthView } from "@/domains/timebox/components/month-view";
import { HabitListPage } from "@/domains/habits/pages/HabitListPage";
import { HabitTemplatePage } from "@/domains/habits/pages/HabitTemplatePage";
import { HabitStatisticsPage } from "@/domains/habits/pages/HabitStatisticsPage";
import { ProjectsView } from "@/domains/tasks/components/projects-view";
import "@/domains/habits/register-form";
import "@/domains/tasks/register-form";
import type { TraceSession } from "@/nexus/infrastructure/trace-logger/trace-types";

import { submitIntent, submitTemplateIntent, submitExecutionIntent, submitBatchIntent, resolveShortcut, fetchDomainActions, submitDynamicIntent, parseHabitIntentOnly, openCnuiSurface, submitCnuiSurface, isCnuiSurface, getActionResponse } from "./actions/intent"
import { fetchIntentTriggers } from "./actions/intent-triggers"
import { recordActivity } from "./actions/activity-recorder"
import { fetchFrequentIntents } from "./actions/activity"
import { checkLLMConfigured } from "./actions/llm-config"

import { ConfirmDeleteDialog } from '@/components/layout/confirm-delete-dialog'
import { getTraceConfig } from "@/lib/config/trace-config";
import type { IntentSubmissionResult, ExecutionIntentResult, BatchIntentResult } from "./actions/intent";
import { usePageView } from '@/hooks/use-page-view'
import { Button } from "@/components/ui/button";
import { ExecutionLogDialog } from "@/components/execution-log-dialog";
import { Banner } from "@/components/feedback/banner";
import type { ChatMessage } from "@/usom/types/objects";
import { resolveSlashCommand } from "@/lib/slash-command";
import type { MainViewState, PanelTab, SplitWith } from "@/components/layout/main-view-state";


// view_route 页面组件映射（domainId → action → Component）
// 在 AppShell 主内容区内渲染，保留左侧面板和顶部导航
const VIEW_PAGE_COMPONENTS: Record<string, Record<string, React.ComponentType<any>>> = {
  habits: {
    view_list: HabitListPage,
    view_templates: HabitTemplatePage,
    createHabit: HabitListPage,
    view_statistics: HabitStatisticsPage,
  },
  tasks: {
    view_list: ProjectsView,
    view_detail: ProjectsView,
    createProject: ProjectsView,
    createTask: ProjectsView,
  },
};

export default function Home() {
  return (
    <AppProvider>
      <HomeContent />
    </AppProvider>
  )
}

function HomeContent() {
  const { mainViewState, setMainViewState, isLoading, setIsLoading, error, setError } = useApp()
  const tb = useTimebox();

  const [panelTab, setPanelTab] = useState<PanelTab>("assistant");
  const [splitWith, setSplitWith] = useState<SplitWith | undefined>();
  const conv = useConversation();

  const [domainActions, setDomainActions] = useState<Array<{ domainId: string; domainName: string; actions: Array<{ action: string; shortcut?: string; description: string; response_type?: string }> }>>([]);
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
  // 加载 session 列表
  useEffect(() => { conv.loadSessions() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const [traceEnabled] = useState(() => getTraceConfig().enabled);
  const [traceSessions, setTraceSessions] = useState<TraceSession[]>([]);
  const [confirmation, setConfirmation] = useState<{
    message: string; rawInput?: string; formFields?: TemplateFormFields;
  } | null>(null);

  const [llmConfigured, setLlmConfigured] = useState(true)

  function handleResult(result: IntentSubmissionResult) {
    tb.setTimeboxes(result.timeboxes);
    tb.setActionSurface(result.actionSurface);
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
        tb.setTimeboxes(result.timeboxes);
        if (!result.success) setError(result.error ?? "执行失败");
        return;
      }
      if (isBatchIntent(rawInput)) {
        const batchResult = await submitBatchIntent(rawInput);
        await tb.loadTimeboxes();
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
  }, [traceEnabled, tb.loadTimeboxes]);

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

  const handleSettingsClick = useCallback(() => {
    conv.saveCurrentConversation();
    setMainViewState({ type: 'settings' });
  }, [conv.saveCurrentConversation]);

  const handleHomeClick = useCallback(() => {
    conv.saveCurrentConversation();
    setMainViewState({ type: 'schedule', date: new Date(), viewMode: tb.dateMode });
  }, [tb.dateMode, conv.saveCurrentConversation]);

  const handleGrowthAction = useCallback(async (domainId: string, action: string) => {
    conv.saveCurrentConversation();

    void recordActivity({
      activityType: 'menu_click',
      source: 'growth_menu',
      targetDomain: domainId,
      targetAction: action,
    })

    // response_type=cnui → 切换到对话视图并打开 CN-UI 表面
    if (await isCnuiSurface(domainId, action)) {
      conv.ensureConversationView()

      try {
        const result = await openCnuiSurface(domainId, action);
        const msg: ChatMessage = {
          role: 'assistant',
          content: result.content,
          timestamp: new Date().toISOString(),
          cnuiSurface: result.surface,
        };
        conv.addChatMessage(msg);
      } catch (e) {
        console.error('openCnuiSurface failed:', e);
        const errMsg: ChatMessage = { role: 'assistant', content: '打开操作面板失败，请重试', timestamp: new Date().toISOString() };
        conv.addChatMessage(errMsg);
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
      conv.ensureConversationView()
      const msg: ChatMessage = {
        role: 'assistant',
        content: `操作 ${action} 已记录，请在对话中继续`,
        timestamp: new Date().toISOString(),
      };
      conv.addChatMessage(msg);
      return;
    }

    // 未定义 response_type 或其他情况
    setMainViewState({ type: 'action', domainId, action });
  }, [conv.saveCurrentConversation, conv.ensureConversationView]);

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
          conv.addChatMessage(msg)
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
          conv.addChatMessage(msg)
        }
      } catch (e) {
        console.error('submitCnuiSurface failed:', e)
        const msg: ChatMessage = {
          role: 'system',
          content: '网络错误，请重试',
          timestamp: new Date().toISOString(),
        }
        conv.addChatMessage(msg)
      }
    },
    [],
  )

  // T031: conversation 消息发送 → 可能触发 splitWith
  const handleConversationSend = useCallback(async (content: string, attachments?: File[]) => {
    const userMsg: ChatMessage = {
      role: 'user',
      content: content || (attachments && attachments.length > 0 ? `上传了 ${attachments.length} 个文件` : ''),
      timestamp: new Date().toISOString(),
    }
    conv.addChatMessage(userMsg)

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
        conv.addChatMessage(navMsg)
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
            conv.addChatMessage(cnuiMsg)
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
          tb.setTimeboxes(result.timeboxes)

          const aiMsg: ChatMessage = {
            role: 'assistant',
            content: result.success ? '已处理你的请求。' : (result.error ?? '处理失败'),
            timestamp: new Date().toISOString(),
          }
          conv.addChatMessage(aiMsg)
        } catch {
          const errMsg: ChatMessage = { role: 'assistant', content: '网络错误，请重试', timestamp: new Date().toISOString() }
          conv.addChatMessage(errMsg)
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
            conv.addChatMessage(cnuiMsg)
          } catch {
            const errMsg: ChatMessage = { role: 'assistant', content: '打开表单失败，请重试', timestamp: new Date().toISOString() }
            conv.addChatMessage(errMsg)
          }
          return
        }

        // 无法解析 domain/action → 回退 submitIntent 通用管道
        setIsLoading(true)
        try {
          const result = await submitIntent(content, false, traceEnabled)
          tb.setTimeboxes(result.timeboxes)

          const aiMsg: ChatMessage = {
            role: 'assistant',
            content: result.success ? '已处理你的请求。' : (result.error ?? '处理失败'),
            timestamp: new Date().toISOString(),
          }
          conv.addChatMessage(aiMsg)
        } catch {
          const errMsg: ChatMessage = { role: 'assistant', content: '网络错误，请重试', timestamp: new Date().toISOString() }
          conv.addChatMessage(errMsg)
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
      conv.addChatMessage(navMsg)
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
          conv.addChatMessage(cnuiMsg)
        } catch (err) {
          console.error('[habitIntent] CNUI 打开失败:', err)
          const errMsg: ChatMessage = {
            role: 'assistant',
            content: HABIT_USER_FACING.INTENT_RECOGNIZED,
            timestamp: new Date().toISOString(),
          }
          conv.addChatMessage(errMsg)
        }
        setIsLoading(false)
        return
      }

      const result = await submitIntent(content, false, traceEnabled)
      tb.setTimeboxes(result.timeboxes)

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
        conv.addChatMessage(aiMsg)
        setIsLoading(false)
        return
      }

      const aiMsg: ChatMessage = {
        role: 'assistant',
        content: result.success ? '已处理你的请求。' : (result.error ?? '处理失败'),
        timestamp: new Date().toISOString(),
      }
      conv.addChatMessage(aiMsg)
    } catch {
      const errMsg: ChatMessage = { role: 'assistant', content: '网络错误，请重试', timestamp: new Date().toISOString() }
      conv.addChatMessage(errMsg)
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
          <Banner
            variant="warning"
            title="请先配置大语言模型"
            description="配置后即可使用 AI 助手功能"
            onClose={() => {}}
          />
        )}
        <SessionList
          sessions={conv.sessions}
          activeSessionId={conv.activeSessionId}
          onSelectSession={conv.handleSelectSession}
          onNewSession={conv.handleNewSession}
          onDeleteSession={conv.handleDeleteSession}
        />
      </>
    : <GrowthMenu domainActions={domainActions as any} onAction={handleGrowthAction} />;

  const renderMainContent = () => {
    if (mainViewState.type === 'schedule') {
      return (
        <div className="flex w-full flex-col gap-4">
          <HomeBanner
            onAction={handleGrowthAction}
          />
          <DateNav mode={tb.dateMode} currentDate={tb.currentDate} onModeChange={tb.handleDateModeChange} onNavigate={tb.handleNavigate} />
          {tb.dateMode === "day" && <DayView timeboxes={tb.timeboxes} currentDate={tb.currentDate} onDateSelect={tb.handleDateSelect} onAction={tb.handleTimeboxAction} />}
          {tb.dateMode === "week" && <WeekView timeboxes={tb.timeboxes} currentDate={tb.currentDate} />}
          {tb.dateMode === "month" && <MonthView timeboxes={tb.timeboxes} currentDate={tb.currentDate} />}
        </div>
      );
    }

    if (mainViewState.type === 'conversation') {
      const convView = (
        <ConversationView
          messages={conv.conversationMessages}
          onSendMessage={handleConversationSend}
          isLoading={isLoading}
          recentSessions={conv.sessions.slice(0, 3)}
          onSelectSession={conv.handleSelectSession}
          intentTriggers={intentTriggers}
          frequentIntents={frequentIntents}
          onCnuiConfirm={handleCnuiConfirm}
          onSurfaceStateChange={conv.handleSurfaceStateChange}
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
            <DateNav mode={tb.dateMode} currentDate={tb.currentDate} onModeChange={tb.handleDateModeChange} onNavigate={tb.handleNavigate} />
            {tb.dateMode === "day" && <DayView timeboxes={tb.timeboxes} currentDate={tb.currentDate} onDateSelect={tb.handleDateSelect} onAction={tb.handleTimeboxAction} />}
            {tb.dateMode === "week" && <WeekView timeboxes={tb.timeboxes} currentDate={tb.currentDate} />}
            {tb.dateMode === "month" && <MonthView timeboxes={tb.timeboxes} currentDate={tb.currentDate} />}
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

  const handleFocusIntentInput = useCallback(() => {
    if (mainViewState.type !== 'conversation') {
      // Switch to conversation view
      const activeSessionId = conv.sessions[0]?.id
      if (activeSessionId) {
        setMainViewState({ type: 'conversation', sessionId: activeSessionId })
      }
    }
    // Focus input after a short delay to allow view switch
    setTimeout(() => {
      document.querySelector<HTMLInputElement>('input[placeholder="输入消息..."]')?.focus()
    }, 100)
  }, [mainViewState.type, conv.sessions])

  return (
    <>
      <AppShell
        activeTab={panelTab}
        onTabChange={setPanelTab}
        onHomeClick={handleHomeClick}
        onSettingsClick={handleSettingsClick}
        tilesBanner={
          tb.actionSurface && tb.actionSurface.tiles.length > 0
            ? <TilesBanner candidates={tb.actionSurface.tiles} />
            : undefined
        }
        leftPanelContent={leftPanelContent}
        mainContent={renderMainContent()}
        viewKey={mainViewState.type}
        onFocusIntentInput={handleFocusIntentInput}
      />

      {tb.transitionConfirm && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-scrim">
          <div className="mx-4 max-w-sm rounded-lg bg-canvas p-6 shadow-lg">
            <p className="mb-4 text-sm font-medium text-ink">{tb.transitionConfirm.message}</p>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => tb.setTransitionConfirm(null)} disabled={isLoading}>取消</Button>
              <Button size="sm" onClick={tb.handleTransitionConfirm} disabled={isLoading}>{isLoading ? "处理中..." : "确认"}</Button>
            </div>
          </div>
        </div>
      )}

      {tb.logTargetTimebox && (
        <ExecutionLogDialog
          timebox={tb.logTargetTimebox}
          open={!!tb.logTarget}
          onClose={() => tb.setLogTarget(null)}
          onSubmit={tb.handleLogSubmit}
        />
      )}

      <ConfirmDeleteDialog
        open={conv.deleteTarget !== null}
        sessionTitle={conv.deleteTarget?.title ?? ''}
        onConfirm={conv.confirmDeleteSession}
        onCancel={() => conv.setDeleteTarget(null)}
      />
    </>
  );
}
