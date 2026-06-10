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

cnuiRegistry.register('habits', 'habit-action-panel', { component: HabitActionPanel })
cnuiRegistry.register('habits', 'habit-checkin-panel', { component: HabitCheckinPanel })
cnuiRegistry.register('habits', 'habit-creation-card', { component: HabitCreationCard })
cnuiRegistry.register('timebox', 'timebox-list', { component: TimeboxList })

// Tasks surfaces
import { TaskCreationCard } from '@/domains/tasks/cnui/surfaces/TaskCreationCard'
import { TaskEditCard } from '@/domains/tasks/cnui/surfaces/TaskEditCard'
import { TaskActionPanel } from '@/domains/tasks/cnui/surfaces/TaskActionPanel'
import { TaskSplitCard } from '@/domains/tasks/cnui/surfaces/TaskSplitCard'
import { ThreadCreationCard } from '@/domains/tasks/cnui/surfaces/ThreadCreationCard'
import { ThreadPromoteCard } from '@/domains/tasks/cnui/surfaces/ThreadPromoteCard'
import { ThreadActionPanel } from '@/domains/tasks/cnui/surfaces/ThreadActionPanel'
import { TaskTreeViewCard } from '@/domains/tasks/cnui/surfaces/TaskTreeView'

cnuiRegistry.register('tasks', 'task-creation-card', { component: TaskCreationCard })
cnuiRegistry.register('tasks', 'task-edit-card', { component: TaskEditCard })
cnuiRegistry.register('tasks', 'task-action-panel', { component: TaskActionPanel })
cnuiRegistry.register('tasks', 'task-split-card', { component: TaskSplitCard })
cnuiRegistry.register('tasks', 'thread-creation-card', { component: ThreadCreationCard })
cnuiRegistry.register('tasks', 'thread-promote-card', { component: ThreadPromoteCard })
cnuiRegistry.register('tasks', 'thread-action-panel', { component: ThreadActionPanel })
cnuiRegistry.register('tasks', 'task-tree-view', { component: TaskTreeViewCard })
