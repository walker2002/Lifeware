const ALLOWED_EXTENSIONS = ['.md', '.txt', '.docx', '.xlsx']
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB

export interface FileValidation {
  valid: boolean
  error?: string
}

export function validateFile(file: File): FileValidation {
  const ext = '.' + file.name.split('.').pop()?.toLowerCase()
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return { valid: false, error: `不支持的文件格式: ${ext}。支持: ${ALLOWED_EXTENSIONS.join(', ')}` }
  }
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: `文件过大 (${(file.size / 1024 / 1024).toFixed(1)}MB)，上限 5MB` }
  }
  return { valid: true }
}

export async function parseFileToText(file: File): Promise<string> {
  const ext = '.' + file.name.split('.').pop()?.toLowerCase()

  switch (ext) {
    case '.md':
    case '.txt':
      return await file.text()

    case '.docx':
      // docx 解析需安装 mammoth 包，MVP 阶段回退到纯文本
      return await file.text()

    case '.xlsx':
      // xlsx 解析需安装 xlsx 包，MVP 阶段回退到 CSV-like 格式
      return await file.text()

    default:
      throw new Error(`不支持的文件格式: ${ext}`)
  }
}

export function isTaskTemplate(text: string): boolean {
  return text.includes('## 项目:')
}
