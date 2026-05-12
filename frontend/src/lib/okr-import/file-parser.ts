import * as XLSX from 'xlsx'
import mammoth from 'mammoth'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB

const SUPPORTED_EXTENSIONS = ['.md', '.txt', '.xlsx', '.docx']

/**
 * 校验文件：格式和大小
 * 返回错误信息，校验通过返回 null
 */
export function validateFile(file: File): string | null {
  const ext = getFileExtension(file.name)
  if (!SUPPORTED_EXTENSIONS.includes(ext)) {
    return `不支持的文件格式: ${ext}。支持: ${SUPPORTED_EXTENSIONS.join(', ')}`
  }
  if (file.size === 0) {
    return '文件为空，请选择有内容的文件'
  }
  if (file.size > MAX_FILE_SIZE) {
    return '文件过大，请选择 5MB 以内的文件'
  }
  return null
}

/**
 * 解析上传文件为纯文本
 */
export async function parseFileToText(file: File): Promise<string> {
  const ext = getFileExtension(file.name)

  switch (ext) {
    case '.md':
    case '.txt':
      return parseTextFile(file)
    case '.xlsx':
      return parseExcelFile(file)
    case '.docx':
      return parseWordFile(file)
    default:
      throw new Error(`不支持的文件格式: ${ext}`)
  }
}

function getFileExtension(filename: string): string {
  const idx = filename.lastIndexOf('.')
  return idx === -1 ? '' : filename.slice(idx).toLowerCase()
}

async function parseTextFile(file: File): Promise<string> {
  return file.text()
}

async function parseExcelFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })

  const parts: string[] = []
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    const data = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 })
    for (const row of data) {
      const line = row.filter(cell => cell != null && String(cell).trim()).join(' | ')
      if (line) parts.push(line)
    }
    parts.push('')
  }

  return parts.join('\n')
}

async function parseWordFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer: buffer })
  return result.value
}
