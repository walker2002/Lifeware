"use server"

import { HabitRepository } from "@/domains/habits/repository/habit"
import { HabitLogRepository } from "@/domains/habits/repository/habit-log"
import { calculateStreak, calculateCompletion7d } from "@/domains/habits/streak-calculator"
import { format, subDays, startOfWeek, endOfWeek, eachDayOfInterval } from "date-fns"
import type { HabitLog } from "@/usom/types/objects"
import type { DateOnly } from "@/usom/types/primitives"

const MVP_USER_ID = "00000000-0000-0000-0000-000000000001" as any

// ─── 日视图数据 ─────────────────────────────────────────────────

export interface HabitDayRow {
  habitId: string
  title: string
  streak: number
  completionRate7d: number
  recent5Days: Array<{ date: string; status: HabitLog['completionStatus'] | null }>
}

export async function getHabitStatsForDay(date: Date): Promise<HabitDayRow[]> {
  const habitRepo = new HabitRepository()
  const logRepo = new HabitLogRepository()

  const habits = await habitRepo.findActive(MVP_USER_ID)
  const recentStart = format(subDays(date, 4), 'yyyy-MM-dd') as DateOnly
  const endDate = format(date, 'yyyy-MM-dd') as DateOnly
  // 查询 30 天范围用于 streak/7d 计算，避免被 5 天窗口截断
  const streakStart = format(subDays(date, 29), 'yyyy-MM-dd') as DateOnly

  const [recentLogs, streakLogs] = await Promise.all([
    logRepo.findByDateRange(MVP_USER_ID, recentStart, endDate),
    logRepo.findByDateRange(MVP_USER_ID, streakStart, endDate),
  ])

  const today = format(date, 'yyyy-MM-dd')

  return habits.map(habit => {
    const logs = recentLogs.get(habit.id) ?? []
    const recent5 = eachDayOfInterval({ start: subDays(date, 4), end: date }).map(d => {
      const dateStr = format(d, 'yyyy-MM-dd')
      const log = logs.find(l => l.date === dateStr)
      return { date: dateStr, status: log?.completionStatus ?? null }
    })

    const completedDates = (streakLogs.get(habit.id) ?? [])
      .filter(l => l.completionStatus === 'completed')
      .map(l => l.date)

    return {
      habitId: habit.id,
      title: habit.title,
      streak: calculateStreak(completedDates, today),
      completionRate7d: calculateCompletion7d(completedDates, today) / 7,
      recent5Days: recent5,
    }
  })
}

// ─── 周视图数据 ─────────────────────────────────────────────────

export interface HabitWeekMatrix {
  habitId: string
  title: string
  weekDays: Array<{ date: string; dayLabel: string; status: HabitLog['completionStatus'] | 'future' | null }>
  completionRate: number
}

export async function getHabitStatsForWeek(weekStart: Date): Promise<HabitWeekMatrix[]> {
  const habitRepo = new HabitRepository()
  const logRepo = new HabitLogRepository()

  const habits = await habitRepo.findActive(MVP_USER_ID)
  const wStart = startOfWeek(weekStart, { weekStartsOn: 1 })
  const wEnd = endOfWeek(weekStart, { weekStartsOn: 1 })
  const startDate = format(wStart, 'yyyy-MM-dd') as DateOnly
  const endDate = format(wEnd, 'yyyy-MM-dd') as DateOnly

  const logsByHabit = await logRepo.findByDateRange(MVP_USER_ID, startDate, endDate)
  const dayLabels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
  const todayStr = format(new Date(), 'yyyy-MM-dd')

  return habits.map(habit => {
    const logs = logsByHabit.get(habit.id) ?? []
    const weekDays = eachDayOfInterval({ start: wStart, end: wEnd }).map((d, i) => {
      const dateStr = format(d, 'yyyy-MM-dd')
      if (dateStr > todayStr) return { date: dateStr, dayLabel: dayLabels[i], status: 'future' as const }
      const log = logs.find(l => l.date === dateStr)
      return { date: dateStr, dayLabel: dayLabels[i], status: log?.completionStatus ?? null }
    })

    const completed = weekDays.filter(d => d.status === 'completed').length
    const pastDays = weekDays.filter(d => d.status !== 'future' && d.status !== null).length
    const completionRate = pastDays > 0 ? Math.round((completed / pastDays) * 100) : 0

    return { habitId: habit.id, title: habit.title, weekDays, completionRate }
  })
}

// ─── 月视图数据 ─────────────────────────────────────────────────

export interface MonthDaySummary {
  date: string
  day: number
  completedCount: number
}

export async function getHabitStatsForMonth(year: number, month: number): Promise<MonthDaySummary[]> {
  const logRepo = new HabitLogRepository()

  const monthStr = `${year}-${String(month).padStart(2, '0')}`
  const startDate = `${monthStr}-01` as DateOnly
  const endDate = `${monthStr}-${new Date(year, month, 0).getDate()}` as DateOnly

  const logsByHabit = await logRepo.findByDateRange(MVP_USER_ID, startDate, endDate)

  const allLogs = Array.from(logsByHabit.values()).flat()
  const countByDate = new Map<string, number>()
  for (const log of allLogs) {
    if (log.completionStatus === 'completed') {
      countByDate.set(log.date, (countByDate.get(log.date) ?? 0) + 1)
    }
  }

  const daysInMonth = new Date(year, month, 0).getDate()
  return Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1
    const dateStr = `${monthStr}-${String(day).padStart(2, '0')}`
    return { date: dateStr, day, completedCount: countByDate.get(dateStr) ?? 0 }
  })
}
