/**
 * @file register-form
 * @brief HabitForm CN-UI 注册
 * 
 * 由 habits/index.ts（服务端）和 page.tsx（客户端）导入
 */

import { HabitForm } from './components/habit-form'
import { FormRegistry } from '@/lib/form-registry'

FormRegistry.register('habits', 'createHabit', {
  // SAFETY: HabitFormFields 是 Record<string, unknown> 的子类型，
  // 但 TypeScript 函数参数逆变导致类型不兼容。运行时安全。
  component: HabitForm as any,
  fieldMapping: {
    title: 'title',
    description: 'description',
    defaultTime: 'defaultTime',
    earliestTime: 'earliestTime',
    latestStartTime: 'latestStartTime',
    defaultDuration: 'defaultDuration',
    minDuration: 'minDuration',
    trackable: 'trackable',
    frequencyType: 'frequencyType',
    daysOfWeek: 'daysOfWeek',
    startDate: 'startDate',
    endDate: 'endDate',
  },
  defaults: {
    defaultTime: '07:00',
    earliestTime: '06:30',
    latestStartTime: '08:00',
    defaultDuration: 30,
    minDuration: 15,
    trackable: true,
    frequencyType: 'daily',
    daysOfWeek: [1, 2, 3, 4, 5],
  },
})
