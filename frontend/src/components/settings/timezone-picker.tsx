/**
 * @file timezone-picker
 * @brief 时区选择组件 — [TZ-1] Step 1 接 DB 持久化（之前只写 localStorage）
 *
 * 流程：
 *   1) mount 时调 server action `getUserTimezone()` 拿 DB 配置（fallback: `Intl.DateTimeFormat` 系统时区）
 *   2) 用户改 select / 输入自定义
 *   3) 点保存 → 调 server action `saveUserTimezone(tz)` 落库
 *
 * 历史：
 *   - 旧实现只写 `localStorage['lw-timezone']`，DB `user_settings.timezone` 不更新；
 *     服务端 `getEffectiveTimezone(userId)` 永远拿不到用户选择。
 *   - [TZ-1] 治本：所有变更经 server action 走 DB（与 schema `user_settings` 列同步），
 *     localStorage 兜底保留作 cache（mount 时优先读，server unreachable 时用）。
 */

"use client"

import { useState, useCallback, useEffect } from "react"
import { saveUserTimezone, getUserTimezone } from "@/app/actions/user-settings"

/**
 * 常用时区列表
 */
const COMMON_TIMEZONES = [
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Singapore',
  'America/New_York',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Berlin',
  'UTC',
]

export function TimezonePicker() {
  const detected = Intl.DateTimeFormat().resolvedOptions().timeZone
  const [timezone, setTimezone] = useState(detected)
  const [customInput, setCustomInput] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // [TZ-1] mount 时拉 DB 配置覆盖 detected（DB 优先）
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const dbTz = await getUserTimezone()
        if (!cancelled && dbTz) {
          setTimezone(dbTz)
        }
      } catch {
        // server unreachable → 用 detected 兜底
      }
    })()
    return () => { cancelled = true }
  }, [])

  const handleSave = useCallback(async () => {
    const tz = customInput.trim() || timezone
    setSaving(true)
    setMessage(null)
    try {
      // [TZ-1] 接 DB 持久化（之前只写 localStorage）
      const result = await saveUserTimezone(tz)
      if (result.success) {
        setMessage(`时区已保存为 ${tz}`)
        // localStorage 兜底保留（mount 时 server unreachable 用）
        try { localStorage.setItem('lw-timezone', tz) } catch {}
      } else {
        setMessage(`保存失败：${result.error ?? '未知错误'}`)
      }
    } catch (e) {
      setMessage(`保存失败：${e instanceof Error ? e.message : '网络错误'}`)
    } finally {
      setSaving(false)
    }
  }, [timezone, customInput])

  return (
    <div className="max-w-md space-y-4">
      <h3 className="text-sm font-medium text-ink">时区设置</h3>
      <p className="text-xs text-body">检测到浏览器时区: {detected}</p>

      <div>
        <label className="block text-xs text-body mb-1">选择时区</label>
        <select
          value={timezone}
          onChange={e => { setTimezone(e.target.value); setCustomInput('') }}
          className="w-full rounded-md border border-hairline bg-background px-3 py-2 text-sm text-ink"
        >
          {COMMON_TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
        </select>
      </div>

      <div>
        <label className="block text-xs text-body mb-1">或手动输入</label>
        <input
          type="text"
          value={customInput}
          onChange={e => setCustomInput(e.target.value)}
          placeholder="Asia/Shanghai"
          className="w-full rounded-md border border-hairline bg-background px-3 py-2 text-sm text-ink"
        />
      </div>

      {message && <p className="text-sm text-success">{message}</p>}

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
      >
        {saving ? '保存中...' : '保存'}
      </button>
    </div>
  )
}