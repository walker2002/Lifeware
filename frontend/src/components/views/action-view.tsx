"use client"

import { HabitListPage } from "@/domains/habits/pages/HabitListPage"
import { HabitTemplatePage } from "@/domains/habits/pages/HabitTemplatePage"
import { HabitStatisticsPage } from "@/domains/habits/pages/HabitStatisticsPage"
import TaskTreePage from "@/domains/tasks/pages/TaskTreePage"
import { ScheduleView } from "@/components/views/schedule-view"

const VIEW_PAGE_COMPONENTS: Record<string, Record<string, React.ComponentType<any>>> = {
  habits: {
    view_list: HabitListPage,
    view_templates: HabitTemplatePage,
    createHabit: HabitListPage,
    view_statistics: HabitStatisticsPage,
  },
  tasks: {
    tasks: TaskTreePage,
    taskTree: TaskTreePage,
    taskDetail: TaskTreePage,
    threadDetail: TaskTreePage,
    taskList: TaskTreePage,
    taskDetailPage: TaskTreePage,
    createThread: TaskTreePage,
    createTask: TaskTreePage,
  },
}

interface ActionViewProps {
  domainId: string
  action: string
  initialFields?: Record<string, unknown>
  scheduleProps?: React.ComponentProps<typeof ScheduleView>
}

export function ActionView({ domainId, action, initialFields, scheduleProps }: ActionViewProps) {
  if (domainId === 'timebox' && (action === 'viewSchedule' || action === 'view_schedule')) {
    if (!scheduleProps) return null
    return <ScheduleView {...scheduleProps} />
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
