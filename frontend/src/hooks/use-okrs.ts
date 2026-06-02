/**
 * @file use-okrs
 * @brief OKR 管理 Hook
 * 
 * 提供 OKR 的增删改查等操作
 */

"use client"

import { useState, useEffect, useCallback } from "react"
import type { Objective, KeyResult } from "@/usom/types/objects"
import type { ObjectiveStatus } from "@/usom/types/primitives"
import type { ObjectiveWithKR } from "@/usom/interfaces/irepository"
import {
  getObjectives,
  getObjectiveById,
  createObjective,
  updateObjective,
  activateObjective,
  changeObjectiveStatus,
  createKeyResult,
  updateKeyResult,
  updateKeyResultProgress,
  deleteDraftKeyResult,
} from "@/app/actions/okr"

/**
 * OKR Hook 返回结果
 */
interface UseOKRsResult {
  objectives: Objective[]
  isLoading: boolean
  error: string | null
  refresh: (status?: ObjectiveStatus) => Promise<void>
  updateLocal: (id: string, updated: Objective) => void
  loadDetail: (id: string) => Promise<ObjectiveWithKR | null>
  create: (input: { title: string; description?: string; okrType?: "visionary" | "committed"; priority?: "P0" | "P1" | "P2"; periodType?: string; periodStart?: string; periodEnd?: string }) => Promise<Objective | null>
  update: (id: string, fields: Record<string, unknown>) => Promise<Objective | null>
  activate: (id: string) => Promise<boolean>
  changeStatus: (id: string, action: "pause" | "resume" | "complete" | "discard" | "archive") => Promise<boolean>
  addKR: (objectiveId: string, input: { title: string; description?: string; targetValue: number; unit: string }) => Promise<KeyResult | null>
  updateKR: (id: string, fields: Record<string, unknown>) => Promise<KeyResult | null>
  updateKRProgress: (id: string, currentValue: number) => Promise<KeyResult | null>
  deleteKR: (id: string) => Promise<boolean>
}

export function useOKRs(): UseOKRsResult {
  const [objectives, setObjectives] = useState<Objective[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async (status?: ObjectiveStatus) => {
    try {
      setIsLoading(true)
      setError(null)
      const result = await getObjectives(status)
      if (result.success && result.data) {
        setObjectives(result.data)
      } else {
        setError(result.error ?? "加载失败")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const updateLocal = useCallback((id: string, updated: Objective) => {
    setObjectives(prev => prev.map(o => o.id === id ? updated : o))
  }, [])

  const loadDetail = useCallback(async (id: string): Promise<ObjectiveWithKR | null> => {
    const result = await getObjectiveById(id)
    return result.success ? result.data ?? null : null
  }, [])

  const create = useCallback(async (input: { title: string; description?: string; okrType?: "visionary" | "committed"; priority?: "P0" | "P1" | "P2"; periodType?: string; periodStart?: string; periodEnd?: string }): Promise<Objective | null> => {
    const result = await createObjective(input)
    if (result.success) {
      await refresh()
      return result.data ?? null
    }
    setError(result.error ?? "创建失败")
    return null
  }, [refresh])

  const update = useCallback(async (id: string, fields: Record<string, unknown>): Promise<Objective | null> => {
    const result = await updateObjective(id, fields)
    if (result.success) {
      if (result.data) updateLocal(id, result.data)
      return result.data ?? null
    }
    setError(result.error ?? "更新失败")
    return null
  }, [updateLocal])

  const activate_ = useCallback(async (id: string): Promise<boolean> => {
    const result = await activateObjective(id)
    if (result.success) {
      await refresh()
      return true
    }
    setError(result.error ?? "激活失败")
    return false
  }, [refresh])

  const changeStatus_ = useCallback(async (id: string, action: "pause" | "resume" | "complete" | "discard" | "archive"): Promise<boolean> => {
    const result = await changeObjectiveStatus(id, action)
    if (result.success) {
      await refresh()
      return true
    }
    setError(result.error ?? "状态更新失败")
    return false
  }, [refresh])

  const addKR = useCallback(async (objectiveId: string, input: { title: string; description?: string; targetValue: number; unit: string }): Promise<KeyResult | null> => {
    const result = await createKeyResult(objectiveId, input)
    if (result.success) {
      await refresh()
      return result.data ?? null
    }
    setError(result.error ?? "创建关键结果失败")
    return null
  }, [refresh])

  const updateKR_ = useCallback(async (id: string, fields: Record<string, unknown>): Promise<KeyResult | null> => {
    const result = await updateKeyResult(id, fields)
    if (result.success) return result.data ?? null
    setError(result.error ?? "更新关键结果失败")
    return null
  }, [])

  const updateKRProgress_ = useCallback(async (id: string, currentValue: number): Promise<KeyResult | null> => {
    const result = await updateKeyResultProgress(id, currentValue)
    if (result.success) return result.data ?? null
    setError(result.error ?? "更新进度失败")
    return null
  }, [])

  const deleteKR_ = useCallback(async (id: string): Promise<boolean> => {
    const result = await deleteDraftKeyResult(id)
    if (result.success) {
      await refresh()
      return true
    }
    setError(result.error ?? "删除失败")
    return false
  }, [refresh])

  return {
    objectives,
    isLoading,
    error,
    refresh,
    updateLocal,
    loadDetail,
    create: create as any,
    update,
    activate: activate_,
    changeStatus: changeStatus_,
    addKR,
    updateKR: updateKR_,
    updateKRProgress: updateKRProgress_,
    deleteKR: deleteKR_,
  }
}
