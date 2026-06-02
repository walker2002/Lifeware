/**
 * @file trace-panel
 * @brief 追踪面板组件
 * 
 * 展示意图处理的追踪日志，用于调试和问题诊断
 */

"use client"

import { useState } from "react"
import type { TraceSession, TraceStep } from "@/nexus/infrastructure/trace-logger/trace-types"

/**
 * TracePanel 组件属性
 */
interface TracePanelProps {
  /** 追踪会话列表 */
  sessions: TraceSession[]
  /** 是否可见 */
  visible: boolean
  /** 切换可见性回调 */
  onToggle: () => void
}

/**
 * 格式化时间戳为 HH:MM:SS
 * 
 * @param ts - ISO 时间戳字符串
 * @returns 格式化后的时间字符串
 */
function formatTs(ts: string): string {
  return new Date(ts).toLocaleTimeString("zh-CN", { hour12: false })
}

/**
 * 步骤组件属性
 */
interface StepItemProps {
  /** 追踪步骤 */
  step: TraceStep
}

/**
 * 步骤组件
 */
function StepItem({ step }: StepItemProps) {
  const [expanded, setExpanded] = useState(false)
  const label = `${step.component}.${step.phase}`

  return (
    <div className="border-b border-surface-dark-elevated last:border-b-0">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-surface-dark-elevated"
      >
        <span className="text-on-dark-soft">{step.id}.</span>
        <span className={step.phase === "start" ? "text-accent-teal" : "text-accent-amber"}>
          {label}
        </span>
        <span className="ml-auto text-on-dark-soft">{formatTs(step.timestamp)}</span>
        {step.duration != null && (
          <span className="text-on-dark-soft">{step.duration}ms</span>
        )}
        {step.error && <span className="text-error">ERR</span>}
      </button>
      {expanded && (
        <div className="bg-surface-dark-soft px-3 pb-2 text-xs">
          {step.input && Object.keys(step.input).length > 0 && (
            <div>
              <span className="text-on-dark-soft">输入:</span>
              <pre className="mt-0.5 max-h-32 overflow-auto text-on-dark whitespace-pre-wrap">
                {JSON.stringify(step.input, null, 2)}
              </pre>
            </div>
          )}
          {step.output && Object.keys(step.output).length > 0 && (
            <div className="mt-1">
              <span className="text-on-dark-soft">输出:</span>
              <pre className="mt-0.5 max-h-32 overflow-auto text-on-dark whitespace-pre-wrap">
                {JSON.stringify(step.output, null, 2)}
              </pre>
            </div>
          )}
          {step.error && (
            <div className="mt-1 text-error">错误: {step.error}</div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * 会话组件属性
 */
interface SessionItemProps {
  /** 追踪会话 */
  session: TraceSession
}

/**
 * 会话组件
 */
function SessionItem({ session }: SessionItemProps) {
  const [expanded, setExpanded] = useState(false)
  const resultColor = session.result === "success" ? "text-success" : session.result === "error" ? "text-error" : "text-on-dark-soft"

  return (
    <div className="border-b border-surface-dark-elevated last:border-b-0">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-surface-dark-elevated"
      >
        <span className={resultColor}>
          {session.result === "success" ? "OK" : session.result === "error" ? "FAIL" : "..."}
        </span>
        <span className="truncate text-on-dark">{session.rawInput}</span>
        <span className="ml-auto text-on-dark-soft">
          {session.steps.length} 步
        </span>
        <span className="text-on-dark-soft">
          {formatTs(session.startedAt)}
        </span>
      </button>
      {expanded && (
        <div>
          {session.steps.map((step, i) => (
            <StepItem key={i} step={step} />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * TracePanel — 底部可折叠调试面板
 *
 * 显示 Nexus 管道追踪会话，每个会话可展开查看步骤调用链。
 */
export function TracePanel({ sessions, visible, onToggle }: TracePanelProps) {
  if (!visible) return null

  return (
    <div className="h-[300px] flex flex-col border-t border-hairline bg-surface-dark overflow-hidden">
      {/* 标题栏 */}
      <div className="flex items-center justify-between border-b border-surface-dark-elevated px-3 py-1.5">
        <span className="text-xs font-medium text-on-dark">
          追踪日志 ({sessions.length})
        </span>
        <button
          type="button"
          onClick={onToggle}
          className="text-xs text-on-dark-soft hover:text-on-dark"
        >
          关闭
        </button>
      </div>

      {/* 内容 */}
      <div className="flex-1 overflow-y-auto">
        {sessions.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-xs text-on-dark-soft">
            暂无追踪数据，提交意图后将自动记录
          </div>
        ) : (
          sessions.slice().reverse().map((session, i) => (
            <SessionItem key={session.id} session={session} />
          ))
        )}
      </div>
    </div>
  )
}
