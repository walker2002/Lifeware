"use client"

import { useState, useCallback, useEffect } from "react"
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
import { PageBanner } from "@/components/layout/page-banner"
import { HabitTemplateManager } from "../components/habit-template-manager"

type PageState = "idle" | "dirty" | "submitting"

export function HabitTemplatePage() {
  const [pageState, setPageState] = useState<PageState>("idle")
  const [dirtyLabel, setDirtyLabel] = useState("")
  const [showExitDialog, setShowExitDialog] = useState(false)
  const [cancelTrigger, setCancelTrigger] = useState(0)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const handleDirtyChange = useCallback((dirty: boolean) => {
    setPageState(dirty ? "dirty" : "idle")
    if (dirty) setDirtyLabel("模板编辑")
  }, [])

  const handleSubmitError = useCallback((error: { type: string; message: string }) => {
    setSubmitError(error.message)
  }, [])

  const handleSubmittingChange = useCallback((submitting: boolean) => {
    setPageState(submitting ? "submitting" : "idle")
  }, [])

  const handleCancelRequest = useCallback(() => {
    if (pageState === "dirty") {
      setShowExitDialog(true)
    } else {
      setCancelTrigger((n) => n + 1)
    }
  }, [pageState])

  const handleExitDiscard = useCallback(() => {
    setShowExitDialog(false)
    setPageState("idle")
    setCancelTrigger((n) => n + 1)
  }, [])

  const handleExitContinue = useCallback(() => {
    setShowExitDialog(false)
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
      <PageBanner domainId="habits" title="习惯模板配置" />

      {/* 脏状态指示器 */}
      {pageState !== "idle" && (
        <div
          className={`flex items-center justify-between rounded-lg border px-4 py-2 text-sm ${
            pageState === "dirty"
              ? "bg-warning-soft border-warning text-warning"
              : "bg-surface-soft border-primary text-primary"
          }`}
        >
          <span>
            {pageState === "dirty"
              ? `有未保存的修改 — ${dirtyLabel}`
              : "正在保存..."}
          </span>
        </div>
      )}

      {/* 提交错误 */}
      {submitError && (
        <div className="flex items-center justify-between rounded-lg border border-error bg-error-soft px-4 py-2 text-sm text-error">
          <span>{submitError}</span>
          <button
            type="button"
            onClick={() => setSubmitError(null)}
            className="rounded-md bg-error-soft px-3 py-1 text-xs font-medium hover:bg-error-soft/80 transition-colors"
          >
            关闭
          </button>
        </div>
      )}

      {/* 模板管理器 */}
      <HabitTemplateManager
        onDirtyChange={handleDirtyChange}
        onSubmitError={handleSubmitError}
        onCancelRequest={handleCancelRequest}
        cancelTrigger={cancelTrigger}
        onSubmittingChange={handleSubmittingChange}
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
            <AlertDialogAction onClick={handleExitContinue}>
              保存并退出
            </AlertDialogAction>
            <AlertDialogCancel onClick={handleExitDiscard}>
              放弃修改
            </AlertDialogCancel>
            <AlertDialogCancel onClick={handleExitContinue}>
              取消，继续编辑
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
