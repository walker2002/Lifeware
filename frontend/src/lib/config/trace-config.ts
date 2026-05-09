// 追踪日志配置模块
// 控制追踪日志的开关和行为

export interface TraceConfig {
  /** 是否启用追踪日志 */
  enabled: boolean
  /** 最大保留会话数 */
  maxSessions: number
  /** 是否同时输出到浏览器 console */
  logToConsole: boolean
}

const DEFAULT_CONFIG: TraceConfig = {
  enabled: false,
  maxSessions: 50,
  logToConsole: true,
}

let currentConfig: TraceConfig = { ...DEFAULT_CONFIG }

export function getTraceConfig(): TraceConfig {
  return { ...currentConfig }
}

export function setTraceConfig(updates: Partial<TraceConfig>): void {
  currentConfig = { ...currentConfig, ...updates }
}
