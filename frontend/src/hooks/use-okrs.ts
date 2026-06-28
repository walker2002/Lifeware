/**
 * @file use-okrs
 * @brief OKR 管理 Hook
 * 
 * 提供 OKR 的增删改查等操作
 */

"use client"

import { useState, useEffect, useCallback } from "react"
import type { Objective, KeyResult, Cycle } from "@/usom/types/objects"
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
  getActiveCycles,
  createCycle as createCycleAction,
  deleteCycle as deleteCycleAction,
} from "@/app/actions/okr"

/** MVP 阶段固定用户 ID */
const MVP_USER_ID = '00000000-0000-0000-0000-000000000001' as const

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
  create: (input: { cycleId: string; title: string; description?: string; okrType?: "visionary" | "committed"; priority?: "P0" | "P1" | "P2" }) => Promise<Objective | null>
  update: (id: string, fields: Record<string, unknown>) => Promise<Objective | null>
  activate: (id: string) => Promise<boolean>
  changeStatus: (id: string, action: "pause" | "resume" | "complete" | "discard" | "archive") => Promise<boolean>
  addKR: (objectiveId: string, input: { title: string; description?: string; targetValue: number; unit: string }) => Promise<KeyResult | null>
  updateKR: (id: string, fields: Record<string, unknown>) => Promise<KeyResult | null>
  updateKRProgress: (id: string, currentValue: number) => Promise<KeyResult | null>
  deleteKR: (id: string) => Promise<boolean>
  /** [022] 可选周期列表（用于 cycle picker） */
  cycles: Cycle[]
  /** 周期列表加载中 */
  isLoadingCycles: boolean
  /**
   * 新建周期（客户端直接调 CycleRepository.save）。
   * [022] MVP 取舍：创建 cycle 与创建 objective 为两步 server action，
   * objective 失败不会回滚已创建的 cycle（下次可直接选）。
   */
  createCycle: (cycle: Cycle) => Promise<Cycle>
  /**
   * [024] G1：删除周期。返回 true=已删，false=拒绝/失败（error 已写入 error 状态）。
   */
  deleteCycle: (cycleId: string) => Promise<boolean>
}

export function useOKRs(): UseOKRsResult {
  const [objectives, setObjectives] = useState<Objective[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // [022] Cycle 数据：独立于 objectives 的加载状态
  const [cycles, setCycles] = useState<Cycle[]>([])
  const [isLoadingCycles, setIsLoadingCycles] = useState(true)

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

  // [022] 加载 Cycle 列表（用于 cycle picker 下拉）
  useEffect(() => {
    getActiveCycles()
      .then(result => { if (result.success && result.data) setCycles(result.data) })
      .finally(() => setIsLoadingCycles(false))
  }, [])

  const updateLocal = useCallback((id: string, updated: Objective) => {
    setObjectives(prev => prev.map(o => o.id === id ? updated : o))
  }, [])

  const loadDetail = useCallback(async (id: string): Promise<ObjectiveWithKR | null> => {
    const result = await getObjectiveById(id)
    return result.success ? result.data ?? null : null
  }, [])

  const create = useCallback(async (input: { cycleId: string; title: string; description?: string; okrType?: "visionary" | "committed"; priority?: "P0" | "P1" | "P2" }): Promise<Objective | null> => {
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

  /**
   * [022] 新建周期（[022] QA fix：改为 server action）。
   *
   * MVP 取舍：创建 cycle 与创建 objective 是两步 server action，
   * objective 失败不会回滚已创建的 cycle（下次可直接选），
   * 但表单保留已填内容 + errors 区提示「周期已创建，请重试保存目标」。
   */
  const createCycle = useCallback(async (cycle: Cycle): Promise<Cycle> => {
    const result = await createCycleAction(cycle)
    if (!result.success || !result.data) throw new Error(result.error ?? "创建周期失败")
    const saved = result.data
    setCycles(prev => [...prev, saved])
    return saved
  }, [])

  /**
   * [024] G1：删除周期。本地 state 立即同步移除（不论远端成功与否），
   * error 写回 error 状态供 UI 提示。
   */
  const deleteCycle_ = useCallback(async (cycleId: string): Promise<boolean> => {
    const result = await deleteCycleAction(cycleId)
    if (result.success) {
      setCycles(prev => prev.filter(c => c.id !== cycleId))
      return true
    }
    setError(result.error ?? "删除失败")
    return false
  }, [])

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
    cycles,
    isLoadingCycles,
    createCycle: createCycle as any,
    deleteCycle: deleteCycle_,
  }
}
