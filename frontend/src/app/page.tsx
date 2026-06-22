/**
 * @file page
 * @brief 应用主页组件
 * 
 * 应用的主入口页面，包含完整的应用布局和核心交互逻辑
 */

"use client"

import { useState, useCallback, useEffect, useMemo } from "react"
import { AppProvider, useApp } from "@/contexts/app-context"
import { useTimebox } from "@/hooks/use-timebox"
import { useConversation } from "@/hooks/use-conversation"
import { useIntentHandler } from "@/hooks/use-intent-handler"
import { AppShell } from "@/components/layout/app-shell"
import { TilesBanner } from "@/components/layout/tiles-banner"
import { SessionList } from "@/components/layout/session-list"
import { GrowthMenu } from "@/components/layout/growth-menu"
import { ConversationView } from "@/components/layout/conversation-view"
import { SplitView } from "@/components/layout/main-content"
import { ScheduleView } from "@/components/views/schedule-view"
import { ActionView } from "@/components/views/action-view"
import { SettingsPage } from "@/components/settings/settings-page"
import { ConfirmDeleteDialog } from "@/components/layout/confirm-delete-dialog"
import { PageBanner } from "@/components/layout/page-banner"
import { ExecutionLogDialog } from "@/components/execution-log-dialog"
import { Banner } from "@/components/feedback/banner"
import { Button } from "@/components/ui/button"
import { CommandMenu } from "@/components/search/command-menu"
import { CheckSquare, Clock, MessageSquare, Repeat, Target } from "lucide-react"
import { usePageView } from "@/hooks/use-page-view"
import type { PanelTab } from "@/components/layout/main-view-state"

/**
 * 应用主页组件入口
 * @returns 应用主页
 */
export default function Home() {
  return <AppProvider><HomeContent /></AppProvider>
}

/**
 * 主页内容组件
 */
function HomeContent() {
  const { mainViewState, setMainViewState, isLoading } = useApp()
  const tb = useTimebox()
  const conv = useConversation()
  const intent = useIntentHandler({
    setTimeboxes: tb.setTimeboxes, setActionSurface: tb.setActionSurface, loadTimeboxes: tb.loadTimeboxes,
    addChatMessage: conv.addChatMessage, ensureConversationView: conv.ensureConversationView, saveCurrentConversation: conv.saveCurrentConversation,
  })
  const [panelTab, setPanelTab] = useState<PanelTab>("assistant")
  const [searchOpen, setSearchOpen] = useState(false)
  usePageView(mainViewState.type === 'action' ? mainViewState.domainId : undefined, mainViewState.type === 'action' ? mainViewState.action : undefined)
  useEffect(() => { conv.loadSessions() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const DOMAIN_ICONS: Record<string, React.ComponentType<{ className?: string }>> = { tasks: CheckSquare, timebox: Clock, habits: Repeat, okrs: Target }
  const searchableItems = useMemo(() => [
    ...intent.domainActions.flatMap(d =>
      d.actions.map(a => ({
        id: `${d.domainId}:${a.action}`, label: a.description, group: d.domainName,
        icon: DOMAIN_ICONS[d.domainId] ?? CheckSquare,
        onSelect: () => { intent.handleGrowthAction(d.domainId, a.action); setSearchOpen(false) },
      }))
    ),
    ...conv.sessions.slice(0, 5).map(s => ({
      id: `session:${s.id}`, label: s.title, group: '最近对话', icon: MessageSquare,
      onSelect: () => { conv.handleSelectSession(s.id); setSearchOpen(false) },
    })),
  ], [intent.domainActions, conv.sessions])

  const handleHomeClick = useCallback(() => {
    conv.saveCurrentConversation(); setMainViewState({ type: 'schedule', date: new Date(), viewMode: tb.dateMode })
  }, [tb.dateMode, conv.saveCurrentConversation, setMainViewState])

  const handleSettingsClick = useCallback(() => {
    conv.saveCurrentConversation(); setMainViewState({ type: 'settings' })
  }, [conv.saveCurrentConversation, setMainViewState])

  const handleFocusIntentInput = useCallback(() => {
    if (mainViewState.type !== 'conversation') { const sid = conv.sessions[0]?.id; if (sid) setMainViewState({ type: 'conversation', sessionId: sid }) }
    setTimeout(() => document.querySelector<HTMLInputElement>('input[placeholder="输入消息..."]')?.focus(), 100)
  }, [mainViewState.type, conv.sessions, setMainViewState])

  const leftPanelContent = panelTab === 'assistant'
    ? <>{!intent.llmConfigured && <Banner variant="warning" title="请先配置大语言模型" description="配置后即可使用 AI 助手功能" onClose={() => {}} />}
        <SessionList sessions={conv.sessions} activeSessionId={conv.activeSessionId} onSelectSession={conv.handleSelectSession} onNewSession={conv.handleNewSession} onDeleteSession={conv.handleDeleteSession} /></>
    : <GrowthMenu domainActions={intent.domainActions as any} onAction={intent.handleGrowthAction} />

  const scheduleProps = { timeboxes: tb.timeboxes, dateMode: tb.dateMode, currentDate: tb.currentDate, onAction: intent.handleGrowthAction, onDateModeChange: tb.handleDateModeChange, onNavigate: tb.handleNavigate, onDateSelect: tb.handleDateSelect, onTimeboxAction: tb.handleTimeboxAction }

  const mainContent = mainViewState.type === 'schedule' ? <ScheduleView {...scheduleProps} />
    : mainViewState.type === 'conversation' ? (intent.splitWith
      ? <SplitView left={<ConversationView messages={conv.conversationMessages} sessionId={conv.activeSessionId} onSendMessage={intent.handleConversationSend} isLoading={isLoading} recentSessions={conv.sessions.slice(0, 3)} onSelectSession={conv.handleSelectSession} intentTriggers={intent.intentTriggers} frequentIntents={intent.frequentIntents} onCnuiConfirm={intent.handleCnuiConfirm} onSurfaceStateChange={conv.handleSurfaceStateChange} />} right={<div className="p-4"><div className="flex items-center justify-between mb-3"><h3 className="text-sm font-medium text-ink">{intent.splitWith.mode === 'form' ? '表单编辑' : 'Markdown 编辑'}</h3><button type="button" onClick={intent.handleCloseSplit} className="text-xs text-body/50 hover:text-ink">关闭</button></div><p className="text-sm text-body">编辑区（{intent.splitWith.domainId}/{intent.splitWith.action}）</p></div>} />
      : <ConversationView messages={conv.conversationMessages} sessionId={conv.activeSessionId} onSendMessage={intent.handleConversationSend} isLoading={isLoading} recentSessions={conv.sessions.slice(0, 3)} onSelectSession={conv.handleSelectSession} intentTriggers={intent.intentTriggers} frequentIntents={intent.frequentIntents} onCnuiConfirm={intent.handleCnuiConfirm} onSurfaceStateChange={conv.handleSurfaceStateChange} />)
    : mainViewState.type === 'action' ? <ActionView domainId={mainViewState.domainId} action={mainViewState.action} initialFields={mainViewState.initialFields} scheduleProps={scheduleProps} />
    : mainViewState.type === 'settings' ? <SettingsPage initialSection={mainViewState.section} />
    : null

  const mainContentWithBanner = mainViewState.type === 'schedule'
    ? (
      <>
        <PageBanner domainId="home" title="我的时间盒" />
        {mainContent}
      </>
    )
    : mainContent

  return (
    <>
      <AppShell activeTab={panelTab} onTabChange={setPanelTab} onHomeClick={handleHomeClick} onSettingsClick={handleSettingsClick}
        tilesBanner={tb.actionSurface && tb.actionSurface.tiles.length > 0 ? <TilesBanner candidates={tb.actionSurface.tiles} /> : undefined}
        leftPanelContent={leftPanelContent} mainContent={mainContentWithBanner} viewKey={mainViewState.type} onFocusIntentInput={handleFocusIntentInput}
        currentViewType={mainViewState.type}
        onBottomNavNavigate={(view) => {
          // BottomNav conversation tab 需要有效的 sessionId
          if (view.type === 'conversation') {
            const sid = conv.activeSessionId ?? conv.sessions[0]?.id ?? ''
            setMainViewState(sid ? { ...view, sessionId: sid } : { type: 'schedule', date: new Date(), viewMode: 'day' })
          } else {
            setMainViewState(view)
          }
        }}
        onFabAction={intent.handleGrowthAction}
        growthContent={<GrowthMenu domainActions={intent.domainActions as any} onAction={intent.handleGrowthAction} />}
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
      {tb.logTargetTimebox && <ExecutionLogDialog timebox={tb.logTargetTimebox} open={!!tb.logTarget} onClose={() => tb.setLogTarget(null)} onSubmit={tb.handleLogSubmit} />}
      {intent.confirmation && (
        <div className="fixed inset-0 z-modal flex items-center justify-center bg-scrim">
          <div className="mx-4 max-w-sm rounded-lg bg-canvas p-6 shadow-lg">
            <p className="mb-4 text-sm font-medium text-ink">{intent.confirmation.message}</p>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={intent.handleCancelConfirmation} disabled={isLoading}>取消</Button>
              <Button size="sm" onClick={intent.handleConfirm} disabled={isLoading}>{isLoading ? "处理中..." : "确认"}</Button>
            </div>
          </div>
        </div>
      )}
      <ConfirmDeleteDialog open={conv.deleteTarget !== null} sessionTitle={conv.deleteTarget?.title ?? ''} onConfirm={conv.confirmDeleteSession} onCancel={() => conv.setDeleteTarget(null)} />
      <CommandMenu open={searchOpen} onOpenChange={setSearchOpen} items={searchableItems} />
    </>
  )
}
