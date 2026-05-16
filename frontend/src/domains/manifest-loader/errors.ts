export interface ManifestLoadError {
  domainId: string
  filePath: string
  phase: 'syntax' | 'structure' | 'semantics'
  message: string
  line?: number
  column?: number
  fieldPath?: string[]
}

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
