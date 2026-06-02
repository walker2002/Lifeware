/**
 * @file errors
 * @brief Manifest 加载错误类型定义
 * 
 * 提供 manifest 加载错误的类型定义和格式化函数
 */

/**
 * Manifest 加载错误
 */
export interface ManifestLoadError {
  /** 领域 ID */
  domainId: string
  /** 文件路径 */
  filePath: string
  /** 错误阶段 */
  phase: 'syntax' | 'structure' | 'semantics'
  /** 错误消息 */
  message: string
  /** 行号 */
  line?: number
  /** 列号 */
  column?: number
  /** 字段路径 */
  fieldPath?: string[]
}

/**
 * 格式化 manifest 错误为可读字符串
 * 
 * @param error - Manifest 加载错误
 * @returns 格式化的错误字符串
 */
export function formatManifestError(error: ManifestLoadError): string {
  const location = error.line
    ? `line ${error.line}${error.column ? `:${error.column}` : ''}`
    : ''
  const field = error.fieldPath?.length
    ? ` at ${error.fieldPath.join('.')}`
    : ''
  const file = error.filePath.split('/').pop() ?? error.filePath

  return `[${error.phase}] ${error.domainId} (${file}${location ? ` ${location}` : ''})${field}: ${error.message}`
}
