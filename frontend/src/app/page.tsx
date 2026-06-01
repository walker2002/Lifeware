"use client";

import { useState, useCallback, useEffect } from "react";
import { AppProvider, useApp } from "@/contexts/app-context";
import { useTimebox } from "@/hooks/use-timebox";
import { useConversation } from "@/hooks/use-conversation";
import { useIntentHandler } from "@/hooks/use-intent-handler";
import { AppShell } from "@/components/layout/app-shell";
import { TilesBanner } from "@/components/layout/tiles-banner";
import { SessionList } from "@/components/layout/session-list";
import { GrowthMenu } from "@/components/layout/growth-menu";
import { ConversationView } from "@/components/layout/conversation-view";
import { SplitView } from "@/components/layout/main-content";
import { HomeBanner } from "@/components/layout/home-banner";
import { IntentInput } from "@/components/intent-input";
import { IntentForm } from "@/components/intent-form";
import { SettingsPage } from "@/components/settings/settings-page";
import { DateNav } from "@/domains/timebox/components/date-nav";
import { DayView } from "@/domains/timebox/components/day-view";
import { WeekView } from "@/domains/timebox/components/week-view";
import { MonthView } from "@/domains/timebox/components/month-view";
import { HabitListPage } from "@/domains/habits/pages/HabitListPage";
import { HabitTemplatePage } from "@/domains/habits/pages/HabitTemplatePage";
import { HabitStatisticsPage } from "@/domains/habits/pages/HabitStatisticsPage";
import { ProjectsView } from "@/domains/tasks/components/projects-view";
import "@/domains/habits/register-form";
import "@/domains/tasks/register-form";

import { ConfirmDeleteDialog } from '@/components/layout/confirm-delete-dialog'
import { usePageView } from '@/hooks/use-page-view'
import { Button } from "@/components/ui/button";
import { ExecutionLogDialog } from "@/components/execution-log-dialog";
import { Banner } from "@/components/feedback/banner";
import type { MainViewState, PanelTab } from "@/components/layout/main-view-state";


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
  const conv = useConversation();

  const [panelTab, setPanelTab] = useState<PanelTab>("assistant");

  const intent = useIntentHandler({
    setTimeboxes: tb.setTimeboxes,
    setActionSurface: tb.setActionSurface,
    loadTimeboxes: tb.loadTimeboxes,
    addChatMessage: conv.addChatMessage,
    ensureConversationView: conv.ensureConversationView,
    saveCurrentConversation: conv.saveCurrentConversation,
  })

  usePageView(
    mainViewState.type === 'action' ? mainViewState.domainId : undefined,
    mainViewState.type === 'action' ? mainViewState.action : undefined,
  )

  // 加载 session 列表
  useEffect(() => { conv.loadSessions() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSettingsClick = useCallback(() => {
    conv.saveCurrentConversation();
    setMainViewState({ type: 'settings' });
  }, [conv.saveCurrentConversation]);

  const handleHomeClick = useCallback(() => {
    conv.saveCurrentConversation();
    setMainViewState({ type: 'schedule', date: new Date(), viewMode: tb.dateMode });
  }, [tb.dateMode, conv.saveCurrentConversation]);

  // R1: 左侧面板 assistant 标签仅包含会话列表 + LLM 配置引导
  const leftPanelContent = panelTab === 'assistant'
    ? <>
        {!intent.llmConfigured && (
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
    : <GrowthMenu domainActions={intent.domainActions as any} onAction={intent.handleGrowthAction} />;

  const renderMainContent = () => {
    if (mainViewState.type === 'schedule') {
      return (
        <div className="flex w-full flex-col gap-4">
          <HomeBanner
            onAction={intent.handleGrowthAction}
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
          onSendMessage={intent.handleConversationSend}
          isLoading={isLoading}
          recentSessions={conv.sessions.slice(0, 3)}
          onSelectSession={conv.handleSelectSession}
          intentTriggers={intent.intentTriggers}
          frequentIntents={intent.frequentIntents}
          onCnuiConfirm={intent.handleCnuiConfirm}
          onSurfaceStateChange={conv.handleSurfaceStateChange}
        />
      )
      if (intent.splitWith) {
        return (
          <SplitView
            left={convView}
            right={
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-ink">
                    {intent.splitWith.mode === 'form' ? '表单编辑' : 'Markdown 编辑'}
                  </h3>
                  <button type="button" onClick={intent.handleCloseSplit} className="text-xs text-body/50 hover:text-ink">
                    关闭
                  </button>
                </div>
                <p className="text-sm text-body">编辑区（{intent.splitWith.domainId}/{intent.splitWith.action}）</p>
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
