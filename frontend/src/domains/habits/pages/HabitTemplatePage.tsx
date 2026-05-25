"use client"

import { useState, useEffect, useCallback } from "react"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog"
import { HabitTemplateManager } from "../components/habit-template-manager"

type PageState = "idle" | "dirty" | "submitting"

export function HabitTemplatePage() {
  const [pageState, setPageState] = useState<PageState>("idle")
  const [dirtyLabel, setDirtyLabel] = useState("")
  const [showExitDialog, setShowExitDialog] = useState(false)
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const handleDirtyChange = useCallback((dirty: boolean) => {
    setPageState(dirty ? "dirty" : "idle")
    if (dirty) setDirtyLabel("模板编辑")
  }, [])

  const handleSubmitError = useCallback((error: { type: string; message: string }) => {
    setSubmitError(error.message)
  }, [])

  // 浏览器离开拦截
  useEffect(() => {
    if (pageState !== "dirty") return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [pageState])

  return (
    <div className="flex flex-col gap-4">
      {/* 脏状态指示器 */}
      {pageState !== "idle" && (
        <div className={`flex items-center justify-between rounded-md px-4 py-2 text-sm ${
          pageState === "dirty"
            ? "bg-yellow-50 text-yellow-800 border border-yellow-200"
            : "bg-blue-50 text-blue-800 border border-blue-200"
        }`}>
          <span>
            {pageState === "dirty"
              ? `有未保存的修改 — ${dirtyLabel}`
              : "正在保存..."}
          </span>
        </div>
      )}

      {/* 提交错误 */}
      {submitError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          {submitError}
          <button
            type="button"
            onClick={() => setSubmitError(null)}
            className="ml-2 text-xs underline hover:no-underline"
          >
            关闭
          </button>
        </div>
      )}

      {/* 模板管理器（已有组件，Task 4 已添加 onDirtyChange/onSubmitError props） */}
      <HabitTemplateManager
        onDirtyChange={handleDirtyChange}
        onSubmitError={handleSubmitError}
      />

      {/* 退出确认弹窗 */}
      <AlertDialog open={showExitDialog} onOpenChange={setShowExitDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>有未保存的修改</AlertDialogTitle>
            <AlertDialogDescription>
              {dirtyLabel} 有未提交的修改。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => {
              setShowExitDialog(false)
              pendingAction?.()
            }}>
              保存并退出
            </AlertDialogAction>
            <AlertDialogCancel onClick={() => {
              setShowExitDialog(false)
              setPageState("idle")
              pendingAction?.()
            }}>
              放弃修改
            </AlertDialogCancel>
            <AlertDialogCancel onClick={() => {
              setShowExitDialog(false)
              setPendingAction(null)
            }}>
              取消，继续编辑
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
