/**
 * @file index
 * @brief TraceLogger — Nexus 管道追踪日志核心模块
 * 
 * 记录各组件的输入/输出，维护内存中的会话缓冲区
 */

import type { Timestamp } from '@/usom/types/primitives'
import type {
  TraceStep,
  TraceSession,
  TraceSessionResult,
  TraceComponent,
  TracePhase,
} from './trace-types'
import { getTraceConfig } from '@/lib/config/trace-config'

/** 追踪日志器接口 */
export interface TraceLogger {
  /** 开始新会话 */
  startSession(rawInput: string): void
  /** 结束当前会话 */
  endSession(result: TraceSessionResult): void
  /** 记录步骤 */
  traceStep(component: TraceComponent, phase: TracePhase, data: Record<string, unknown>): void
  /** 获取所有会话 */
  getSessions(): TraceSession[]
  /** 清空会话 */
  clearSessions(): void
  /** 获取 onTrace 回调（注入 Orchestrator） */
  onTrace: (step: TraceStep) => void
}

/** 步骤计数器 */
let stepCounter = 0

/**
 * 创建追踪日志器
 * @returns TraceLogger 实例
 */
export function createTraceLogger(): TraceLogger {
  const config = getTraceConfig()
  const sessions: TraceSession[] = []
  let currentSession: TraceSession | null = null

  function onTrace(step: TraceStep): void {
    if (!currentSession) return
    stepCounter++
    step.id = stepCounter
    currentSession.steps.push(step)

    if (config.logToConsole) {
      const label = `${step.component}.${step.phase}`
      if (step.phase === 'start') {
        console.group(label)
        console.log('input:', step.input)
      } else {
        console.log('output:', step.output ?? '(none)')
        if (step.duration) console.log(`duration: ${step.duration}ms`)
        if (step.error) console.error('error:', step.error)
        console.groupEnd()
      }
    }
  }

  return {
    startSession(rawInput: string) {
      stepCounter = 0
      currentSession = {
        id: crypto.randomUUID(),
        startedAt: new Date().toISOString() as Timestamp,
        rawInput,
        steps: [],
      }
    },

    endSession(result: TraceSessionResult) {
      if (!currentSession) return
      currentSession.completedAt = new Date().toISOString() as Timestamp
      currentSession.result = result
      sessions.push(currentSession)

      // FIFO 淘汰
      while (sessions.length > config.maxSessions) {
        sessions.shift()
      }

      currentSession = null
    },

    traceStep(component: TraceComponent, phase: TracePhase, data: Record<string, unknown>) {
      if (!currentSession) return
      stepCounter++
      const step: TraceStep = {
        id: stepCounter,
        component,
        phase,
        timestamp: new Date().toISOString() as Timestamp,
        input: data.input as Record<string, unknown> ?? {},
        output: data.output as Record<string, unknown> | undefined,
        duration: data.duration as number | undefined,
        error: data.error as string | undefined,
      }
      onTrace(step)
    },

    getSessions() {
      return [...sessions]
    },

    clearSessions() {
      sessions.length = 0
    },

    onTrace,
  }
}
