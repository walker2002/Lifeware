// 客户端 CNUI Surface 组件注册
// domains/*/index.ts 中的注册仅在服务端执行（被 registry.ts 触发），
// 客户端需要独立的注册路径，否则 CnuiRegistry.get() 返回 undefined。

import { cnuiRegistry } from './registry'

// Habits surfaces
import { HabitActionPanel } from '@/domains/habits/cnui/surfaces/HabitActionPanel'
import { HabitCheckinPanel } from '@/domains/habits/cnui/surfaces/HabitCheckinPanel'
import { HabitCreationCard } from '@/domains/habits/cnui/surfaces/HabitCreationCard'

// Timebox surfaces
import { TimeboxList } from '@/domains/timebox/cnui/surfaces/TimeboxList'
import { CreateTimebox } from '@/domains/timebox/cnui/surfaces/CreateTimebox'
import { LogTimebox } from '@/domains/timebox/cnui/surfaces/LogTimebox'
import { AdjustTimeboxes } from '@/domains/timebox/cnui/surfaces/AdjustTimeboxes'
// [023.04] T6 — editTimeboxes CNUI surface client 注册
import { EditTimeboxes } from '@/domains/timebox/cnui/surfaces/EditTimeboxes'
// [023.08] T5 — CreateSmartTimebox CNUI surface 客户端注册（[cnui-surface-dual-registration] memory: server + client 双注册）
import { CreateSmartTimebox } from '@/domains/timebox/cnui/surfaces/CreateSmartTimebox'
// [028] T9 — ScheduleProposal CNUI surface 客户端注册（schedule-proposal surface；最高频陷阱 — server + client 双注册必须闭合）
import { ScheduleProposal } from '@/domains/timebox/cnui/surfaces/ScheduleProposal'
// [028] I-2 polish: SCHEDULE_PROPOSAL_SURFACE 常量（防字符串漂移）
import { SCHEDULE_PROPOSAL_SURFACE } from '@/domains/timebox/constants'
// [026.02] T1 — 约定 3 surface（[026.01] 漏注册 client，触发 IRON RULE）
import { CreateAppointment } from '@/domains/timebox/cnui/surfaces/CreateAppointment'
import { EditAppointment } from '@/domains/timebox/cnui/surfaces/EditAppointment'
import { DeleteAppointment } from '@/domains/timebox/cnui/surfaces/DeleteAppointment'

cnuiRegistry.register('habits', 'habit-action-panel', { component: HabitActionPanel })
cnuiRegistry.register('habits', 'habit-checkin-panel', { component: HabitCheckinPanel })
cnuiRegistry.register('habits', 'habit-creation-card', { component: HabitCreationCard })
cnuiRegistry.register('timebox', 'timebox-list', { component: TimeboxList })
cnuiRegistry.register('timebox', 'create-timebox', { component: CreateTimebox })
cnuiRegistry.register('timebox', 'log-timebox', { component: LogTimebox })
cnuiRegistry.register('timebox', 'adjust-timeboxes', { component: AdjustTimeboxes })
// [023.04] T6 — editTimeboxes CNUI surface（client 双注册闭环，handler 已 server 注册）
cnuiRegistry.register('timebox', 'edit-timeboxes', { component: EditTimeboxes })
// [023.08] T5 — CreateSmartTimebox CNUI surface（client 双注册 + manifest K-block create-smart-timebox）
cnuiRegistry.register('timebox', 'create-smart-timebox', { component: CreateSmartTimebox })
// [028] T9 — ScheduleProposal CNUI surface（client 双注册 + manifest K-block schedule-proposal）
cnuiRegistry.register('timebox', SCHEDULE_PROPOSAL_SURFACE, { component: ScheduleProposal })
// [026.02] T1 — 修复 [026.01] 回归（server 已注册 surfaceHandlers，client 漏 3 个 surface）
//   per [[project-cnui-surface-dual-registration]]：server + client 双注册闭合。
cnuiRegistry.register('timebox', 'create-appointment', { component: CreateAppointment })
cnuiRegistry.register('timebox', 'edit-appointment',   { component: EditAppointment })
cnuiRegistry.register('timebox', 'delete-appointment', { component: DeleteAppointment })

// Tasks surfaces
import { TaskCreationCard } from '@/domains/tasks/cnui/surfaces/TaskCreationCard'
import { TaskEditCard } from '@/domains/tasks/cnui/surfaces/TaskEditCard'
import { TaskActionPanel } from '@/domains/tasks/cnui/surfaces/TaskActionPanel'
import { ThreadCreationCard } from '@/domains/tasks/cnui/surfaces/ThreadCreationCard'
import { ThreadActionPanel } from '@/domains/tasks/cnui/surfaces/ThreadActionPanel'
import { TaskTreeViewCard } from '@/domains/tasks/cnui/surfaces/TaskTreeView'

cnuiRegistry.register('tasks', 'task-creation-card', { component: TaskCreationCard })
cnuiRegistry.register('tasks', 'task-edit-card', { component: TaskEditCard })
cnuiRegistry.register('tasks', 'task-action-panel', { component: TaskActionPanel })
cnuiRegistry.register('tasks', 'thread-creation-card', { component: ThreadCreationCard })
cnuiRegistry.register('tasks', 'thread-action-panel', { component: ThreadActionPanel })
cnuiRegistry.register('tasks', 'task-tree-view', { component: TaskTreeViewCard })
