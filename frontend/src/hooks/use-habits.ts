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
  checkHabitReferences,
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
  checkReferences: (habitId: string) => Promise<import("@/usom/interfaces/irepository").HabitReferenceInfo | null>
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
    // 先检查外键引用
    const refs = await checkHabitReferences(habitId)
    if (refs?.success && refs.references?.hasReferences) {
      setError('该习惯存在关联数据（打卡记录或时间盒），无法删除')
      return false
    }
    // 无引用，执行删除
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

  const checkReferences_ = useCallback(async (habitId: string) => {
    const result = await checkHabitReferences(habitId)
    if (result.success && result.references) {
      return result.references
    }
    setError(result.error ?? "检查引用失败")
    return null
  }, [])

  return {
    habits,
    isLoading,
    error,
    refresh,
    createHabit,
    changeStatus,
    deleteHabit: deleteHabit_,
    updateHabit: updateHabit_,
    checkReferences: checkReferences_,
  }
}
