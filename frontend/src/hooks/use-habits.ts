"use client"

import { useState, useEffect, useCallback } from "react"
import type { Habit } from "@/usom/types/objects"
import type { CreateHabitInput, UpdateHabitInput } from "@/usom/interfaces/irepository"
import {
  getHabits,
  submitHabitIntent,
  updateHabitStatus,
  deleteHabit as deleteHabitAction,
  updateHabit as updateHabitAction,
} from "@/app/actions/intent"

interface UseHabitsResult {
  habits: Habit[]
  isLoading: boolean
  error: string | null
  refresh: () => Promise<void>
  createHabit: (input: CreateHabitInput) => Promise<boolean>
  changeStatus: (habitId: string, action: "activate" | "suspend" | "reactivate" | "archive") => Promise<boolean>
  deleteHabit: (habitId: string) => Promise<boolean>
  updateHabit: (habitId: string, input: UpdateHabitInput) => Promise<boolean>
}

export function useHabits(): UseHabitsResult {
  const [habits, setHabits] = useState<Habit[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      const result = await getHabits()
      if (result.success && result.habits) {
        setHabits(result.habits)
      } else {
        setError(result.error ?? "加载失败")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const createHabit = useCallback(async (input: CreateHabitInput): Promise<boolean> => {
    const result = await submitHabitIntent(input)
    if (result.success) {
      await refresh()
      return true
    }
    setError(result.error ?? "创建失败")
    return false
  }, [refresh])

  const changeStatus = useCallback(async (
    habitId: string,
    action: "activate" | "suspend" | "reactivate" | "archive",
  ): Promise<boolean> => {
    const result = await updateHabitStatus(habitId, action)
    if (result.success) {
      await refresh()
      return true
    }
    setError(result.error ?? "状态更新失败")
    return false
  }, [refresh])

  const deleteHabit_ = useCallback(async (habitId: string): Promise<boolean> => {
    const result = await deleteHabitAction(habitId)
    if (result.success) {
      await refresh()
      return true
    }
    setError(result.error ?? "删除失败")
    return false
  }, [refresh])

  const updateHabit_ = useCallback(async (habitId: string, input: UpdateHabitInput): Promise<boolean> => {
    const result = await updateHabitAction(habitId, input)
    if (result.success) {
      await refresh()
      return true
    }
    setError(result.error ?? "更新失败")
    return false
  }, [refresh])

  return {
    habits,
    isLoading,
    error,
    refresh,
    createHabit,
    changeStatus,
    deleteHabit: deleteHabit_,
    updateHabit: updateHabit_,
  }
}
