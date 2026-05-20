export interface MarkdownParseResult {
  status: 'success' | 'partial' | 'failed'
  fields: Record<string, unknown>[]
  errors: string[]
}

function parseValue(val: string): unknown {
  if (val === 'true') return true
  if (val === 'false') return false
  if (/^-?\d+$/.test(val)) return parseInt(val, 10)
  if (/^-?\d+\.\d+$/.test(val)) return parseFloat(val)
  return val
}

function parseSection(lines: string[]): Record<string, unknown> | null {
  const fields: Record<string, unknown> = {}
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const colonIdx = trimmed.indexOf(':')
    if (colonIdx === -1) continue
    const key = trimmed.slice(0, colonIdx).trim()
    const val = trimmed.slice(colonIdx + 1).trim()
    if (!key || !val) continue
    fields[key] = parseValue(val)
  }
  return Object.keys(fields).length > 0 ? fields : null
}

export function parseMarkdownToIntent(
  content: string,
  _domainId: string,
  _action: string,
): MarkdownParseResult {
  if (!content.trim()) {
    return { status: 'failed', fields: [], errors: ['内容为空'] }
  }

  const sections = content.split(/^---$/m)
  const fields: Record<string, unknown>[] = []
  const errors: string[] = []

  for (let i = 0; i < sections.length; i++) {
    const lines = sections[i].split('\n')
    const hasInvalidLine = lines.some(l => {
      const t = l.trim()
      return t && !t.startsWith('#') && !t.includes(':') && t !== '---'
    })

    const parsed = parseSection(lines)
    if (parsed) {
      fields.push(parsed)
    } else if (hasInvalidLine) {
      errors.push(`第 ${i + 1} 段包含无法解析的行`)
    }
  }

  if (fields.length === 0) {
    return { status: 'failed', fields: [], errors: errors.length > 0 ? errors : ['未找到有效数据'] }
  }

  if (errors.length > 0) {
    return { status: 'partial', fields, errors }
  }

  return { status: 'success', fields, errors: [] }
}
