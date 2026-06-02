/**
 * @file use-templates
 * @brief 习惯模板管理 Hook
 * 
 * 提供习惯模板的增删改查和应用等功能
 */

"use client"

import { useState, useEffect, useCallback } from "react"
import type { HabitTemplate } from "@/usom/types/objects"
import type { CreateTemplateInput, TemplateHabitOverrides } from "@/usom/interfaces/irepository"
import {
  getTemplates,
  createTemplate as createTemplateAction,
  updateTemplate as updateTemplateAction,
  deleteTemplate as deleteTemplateAction,
  addHabitToTemplate as addHabitToTemplateAction,
  removeHabitFromTemplate as removeHabitFromTemplateAction,
  applyTemplate as applyTemplateAction,
} from "@/app/actions/intent"

/**
 * 模板 Hook 返回结果
 */
interface UseTemplatesResult {
  templates: HabitTemplate[]
  isLoading: boolean
  error: string | null
  refresh: () => Promise<void>
  createTemplate: (input: CreateTemplateInput) => Promise<HabitTemplate | null>
  updateTemplate: (id: string, data: { name?: string; description?: string; icon?: string; applicableDays?: number[] }) => Promise<HabitTemplate | null>
  deleteTemplate: (id: string) => Promise<boolean>
  addHabitToTemplate: (templateId: string, habitId: string, overrides?: TemplateHabitOverrides) => Promise<boolean>
  removeHabitFromTemplate: (templateId: string, habitId: string) => Promise<boolean>
  applyTemplate: (templateId: string, date: string) => Promise<boolean>
}

export function useTemplates(): UseTemplatesResult {
  const [templates, setTemplates] = useState<HabitTemplate[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      const result = await getTemplates()
      if (result.success && result.templates) {
        setTemplates(result.templates)
      } else {
        setError(result.error ?? "加载模板失败")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载模板失败")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const createTemplate = useCallback(async (input: CreateTemplateInput): Promise<HabitTemplate | null> => {
    const result = await createTemplateAction(input)
    if (result.success && result.template) {
      await refresh()
      return result.template
    }
    setError(result.error ?? "创建模板失败")
    return null
  }, [refresh])

  const updateTemplate = useCallback(async (
    id: string,
    data: { name?: string; description?: string; icon?: string; applicableDays?: number[] },
  ): Promise<HabitTemplate | null> => {
    const result = await updateTemplateAction(id, data)
    if (result.success && result.template) {
      await refresh()
      return result.template
    }
    setError(result.error ?? "更新模板失败")
    return null
  }, [refresh])

  const deleteTemplate_ = useCallback(async (id: string): Promise<boolean> => {
    const result = await deleteTemplateAction(id)
    if (result.success) {
      await refresh()
      return true
    }
    setError(result.error ?? "删除模板失败")
    return false
  }, [refresh])

  const addHabitToTemplate = useCallback(async (
    templateId: string,
    habitId: string,
    overrides?: TemplateHabitOverrides,
  ): Promise<boolean> => {
    const result = await addHabitToTemplateAction(templateId, habitId, overrides)
    if (result.success) {
      await refresh()
      return true
    }
    setError(result.error ?? "添加习惯到模板失败")
    return false
  }, [refresh])

  const removeHabitFromTemplate = useCallback(async (
    templateId: string,
    habitId: string,
  ): Promise<boolean> => {
    const result = await removeHabitFromTemplateAction(templateId, habitId)
    if (result.success) {
      await refresh()
      return true
    }
    setError(result.error ?? "从模板移除习惯失败")
    return false
  }, [refresh])

  const applyTemplate_ = useCallback(async (
    templateId: string,
    date: string,
  ): Promise<boolean> => {
    const result = await applyTemplateAction(templateId, date)
    if (result.success) {
      return true
    }
    setError(result.error ?? "应用模板失败")
    return false
  }, [])

  return {
    templates,
    isLoading,
    error,
    refresh,
    createTemplate,
    updateTemplate,
    deleteTemplate: deleteTemplate_,
    addHabitToTemplate,
    removeHabitFromTemplate,
    applyTemplate: applyTemplate_,
  }
}
