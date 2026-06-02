/**
 * @file encrypt
 * @brief 客户端加密工具
 * 
 * 使用设备指纹派生密钥进行 AES-GCM 加密
 */

/**
 * 获取设备指纹
 * @returns SHA-256 哈希值（十六进制字符串）
 */
async function getFingerprint(): Promise<string> {
  const components = [
    navigator.userAgent,
    String(screen.width),
    String(screen.height),
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  ]
  const raw = components.join('|')
  const encoder = new TextEncoder()
  const data = encoder.encode(raw)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * 从设备指纹派生加密密钥
 * @returns AES-GCM 密钥
 */
async function deriveKey(): Promise<CryptoKey> {
  const fingerprint = await getFingerprint()
  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(fingerprint),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: encoder.encode('lifeware-encryption-salt'), iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/**
 * 加密文本
 * @param plainText - 明文
 * @returns Base64 编码的密文（包含 IV）
 */
export async function encrypt(plainText: string): Promise<string> {
  const key = await deriveKey()
  const encoder = new TextEncoder()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cipherBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plainText),
  )
  const combined = new Uint8Array(iv.length + cipherBuffer.byteLength)
  combined.set(iv)
  combined.set(new Uint8Array(cipherBuffer), iv.length)
  return btoa(String.fromCharCode(...combined))
}

/**
 * 解密文本
 * @param cipherText - Base64 编码的密文（包含 IV）
 * @returns 明文
 */
export async function decrypt(cipherText: string): Promise<string> {
  const key = await deriveKey()
  const combined = Uint8Array.from(atob(cipherText), c => c.charCodeAt(0))
  const iv = combined.slice(0, 12)
  const data = combined.slice(12)
  const plainBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    data,
  )
  return new TextDecoder().decode(plainBuffer)
}
