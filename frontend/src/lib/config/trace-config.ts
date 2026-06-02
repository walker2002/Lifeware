/**
 * @file trace-config
 * @brief 追踪日志配置模块
 * 
 * 控制追踪日志的开关和行为
 */

/**
 * 追踪配置接口
 */
export interface TraceConfig {
  /** 是否启用追踪日志 */
  enabled: boolean
  /** 最大保留会话数 */
  maxSessions: number
  /** 是否同时输出到浏览器 console */
  logToConsole: boolean
}

/** 默认追踪配置 */
const DEFAULT_CONFIG: TraceConfig = {
  enabled: false,
  maxSessions: 50,
  logToConsole: true,
}

/** 当前追踪配置 */
let currentConfig: TraceConfig = { ...DEFAULT_CONFIG }

/**
 * 获取当前追踪配置
 * @returns 当前配置副本
 */
export function getTraceConfig(): TraceConfig {
  return { ...currentConfig }
}

/**
 * 更新追踪配置
 * @param updates - 配置更新项
 */
export function setTraceConfig(updates: Partial<TraceConfig>): void {
  currentConfig = { ...currentConfig, ...updates }
}
