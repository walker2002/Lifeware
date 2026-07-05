/**
 * @file action-view
 * @brief ActionView — response_type=page 意图的渲染分发
 *
 * 职责：把 setMainViewState({type:'action', domainId, action}) 的视图态分发到对应
 * React 组件。VIEW_PAGE_COMPONENTS 是「domainId → action → Component」的二级
 * 路由表，SSOT 来自 manifest.yaml 的 intent_triggers[].view_route（respnse_type=page）。
 *
 * 任何在 manifest.yaml 中声明 response_type=page + view_route 的 action 都必须
 * 在本表里注册对应 Component；否则 GrowthMenu / slash 命令 / 快捷键点击会落到
 * 「页面未找到」占位文本（[026] T14 后 review 暴露 viewItineraries 缺失映射）。
 *
 * 命名约定：Component key 与 intent_trigger.action 一致（camelCase），保持
 * 单一来源以避免 manifest 与路由表双向漂移。
 *
 * 例外：timebox.viewTimeboxes 不走本表 —— 它在 use-intent-handler.handleGrowthAction
 *   里被前置特判：setMainViewState({type:'schedule', date, viewMode})，让主页主显示
 *   区复用 TimeboxesWorkspace（保留三栏 AppShell + 左 AI 面板）。manifest view_route
 *   /timeboxes 仅用于浏览器直接 URL 访问，不作为菜单入口跳转目标。
 *
 * [023.03] T4：删 ScheduleView 导入 + viewSchedule/view_schedule 特殊分支 +
 * scheduleProps 字段。route /schedule → /timeboxes 后，主页 mainViewState='schedule'
 * 分支直接渲染 TimeboxesWorkspace；本表不再需要 viewSchedule 入口。
 */

"use client"

import { HabitListPage } from "@/domains/habits/pages/HabitListPage"
import { HabitStatisticsPage } from "@/domains/habits/pages/HabitStatisticsPage"
import TaskTreePage from "@/domains/tasks/pages/TaskTreePage"
import { OkrWorkspacePage } from "@/domains/okrs/pages/OkrWorkspacePage"
import { TimeboxTemplatesPage } from "@/domains/timebox/pages/TimeboxTemplatesPage"
import { AppointmentPage } from "@/domains/timebox/pages/AppointmentPage"

const VIEW_PAGE_COMPONENTS: Record<string, Record<string, React.ComponentType<any>>> = {
  habits: {
    view_list: HabitListPage,
    createHabit: HabitListPage,
    view_statistics: HabitStatisticsPage,
  },
  tasks: {
    tasks: TaskTreePage,
    taskDetail: TaskTreePage,
    threadDetail: TaskTreePage,
    list: TaskTreePage,
    detail: TaskTreePage,
    createThread: TaskTreePage,
    createTask: TaskTreePage,
  },
  okrs: {
    okrs: OkrWorkspacePage,
  },
  timebox: {
    viewAppointments: AppointmentPage, // [026] 约定管理页（manifest view_routes.viewAppointments；[023.05] viewItineraries → viewAppointments）
    configTimeboxTemplates: TimeboxTemplatesPage,

  },
}

interface ActionViewProps {
  domainId: string
  action: string
  initialFields?: Record<string, unknown>
  // [023.03] T4：删 scheduleProps（主页 redirect 后无来源）
}

export function ActionView({ domainId, action, initialFields }: ActionViewProps) {
  // [023.03] T4：删 viewSchedule/view_schedule 特殊分支（viewSchedule 已在 use-intent-handler
  // handleGrowthAction 前置特判切到 mainViewState='schedule'，不会进 ActionView）
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