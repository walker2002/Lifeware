/**
 * @file file-parser
 * @brief 任务导入文件解析器
 * 
 * 验证和解析上传的文件为文本
 */

/** 允许的文件扩展名 */
const ALLOWED_EXTENSIONS = ['.md', '.txt', '.docx', '.xlsx']
/** 最大文件大小（5MB） */
const MAX_FILE_SIZE = 5 * 1024 * 1024

/**
 * 文件验证结果
 */
export interface FileValidation {
  /** 是否有效 */
  valid: boolean
  /** 错误信息 */
  error?: string
}

/**
 * 验证文件格式和大小
 * @param file - 文件对象
 * @returns 验证结果
 */
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

/**
 * 解析文件为文本
 * @param file - 文件对象
 * @returns 文件文本内容
 */
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

/**
 * 判断文本是否为任务模板
 * @param text - 文本内容
 * @returns 是否为任务模板
 */
export function isTaskTemplate(text: string): boolean {
  return text.includes('## 项目:')
}
