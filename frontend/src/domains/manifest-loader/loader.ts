import fs from 'node:fs'
import path from 'node:path'
import { parse as yamlParse } from 'yaml'
import { ManifestSchema, type DomainManifest } from './schema'
import { validateSemantics } from './validator'
import type { ManifestLoadError } from './errors'

export type ManifestLoadResult =
  | { success: true; manifest: DomainManifest }
  | { success: false; errors: ManifestLoadError[] }

const cache = new Map<string, ManifestLoadResult>()

/**
 * 加载域 manifest 文件。
 *
 * Next.js Turbopack 环境下 __dirname 不指向实际源码路径，
 * 因此改用 process.cwd() + src/domains/<domainId> 构建路径。
 * domainId 参数即目录名（如 "habits"、"timebox"）。
 */
export function loadDomainManifest(domainId: string): ManifestLoadResult {
  const cached = cache.get(domainId)
  if (cached) return cached

  // 支持绝对路径（测试用）或域名 ID（生产用）
  const domainDir = path.isAbsolute(domainId)
    ? domainId
    : path.join(process.cwd(), 'src/domains', domainId)
  const filePath = path.join(domainDir, 'manifest.yaml')

  // Phase 1: YAML 语法解析
  let raw: unknown
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    raw = yamlParse(content)
  } catch (e: unknown) {
    const err = e as { message?: string; pos?: number[]; linePos?: Array<{ line: number; col: number }> }
    const result: ManifestLoadResult = {
      success: false,
      errors: [{
        domainId,
        filePath,
        phase: 'syntax',
        message: err.message ?? 'YAML 语法错误',
        line: err.linePos?.[0]?.line,
        column: err.linePos?.[0]?.col,
      }],
    }
    cache.set(domainId, result)
    return result
  }

  // Phase 2: Zod 结构校验
  const parsed = ManifestSchema.safeParse(raw)
  if (!parsed.success) {
    const errors: ManifestLoadError[] = parsed.error.issues.map(issue => ({
      domainId,
      filePath,
      phase: 'structure' as const,
      message: issue.message,
      fieldPath: issue.path.map(String),
    }))
    const result: ManifestLoadResult = { success: false, errors }
    cache.set(domainId, result)
    return result
  }

  const manifest = parsed.data

  // Phase 3: 语义校验
  const semanticErrors = validateSemantics(manifest)
  if (semanticErrors.length > 0) {
    const errors: ManifestLoadError[] = semanticErrors.map(se => ({
      domainId,
      filePath,
      phase: 'semantics' as const,
      message: se.message,
      fieldPath: se.fieldPath,
    }))
    const result: ManifestLoadResult = { success: false, errors }
    cache.set(domainId, result)
    return result
  }

  const result: ManifestLoadResult = { success: true, manifest }
  cache.set(domainId, result)
  return result
}
