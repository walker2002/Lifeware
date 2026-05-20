"use client"

import { useState, useCallback } from "react"

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

  const handleSave = useCallback(() => {
    const tz = customInput.trim() || timezone
    localStorage.setItem('lw-timezone', tz)
    setMessage(`时区已设置为 ${tz}`)
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
        className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
      >
        保存
      </button>
    </div>
  )
}
