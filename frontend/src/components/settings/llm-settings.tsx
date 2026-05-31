"use client"

import { useState, useEffect, useCallback } from "react"
import { getLLMSettings, saveLLMSettings } from "@/app/actions/llm-config"
import type { ProviderSummary, UserLLMPreferences, ProviderUserPrefs } from "@/lib/llm/config"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"

export function LLMSettings() {
  const [providers, setProviders] = useState<ProviderSummary[]>([])
  const [prefs, setPrefs] = useState<UserLLMPreferences>({ providers: {} })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    getLLMSettings().then(data => {
      setProviders(data.providers)
      setPrefs(data.prefs)
      setLoading(false)
    })
  }, [])

  const activeProvider = prefs.activeProvider || ""

  const setActiveProvider = useCallback((id: string) => {
    setPrefs(prev => ({ ...prev, activeProvider: id }))
  }, [])

  const updateProviderPref = useCallback((providerId: string, patch: Partial<ProviderUserPrefs>) => {
    setPrefs(prev => ({
      ...prev,
      providers: {
        ...prev.providers,
        [providerId]: {
          ...prev.providers[providerId],
          ...patch,
          models: {
            ...prev.providers[providerId]?.models,
            ...patch.models,
          },
        },
      },
    }))
  }, [])

  const handleSave = useCallback(async () => {
    setSaving(true)
    setMessage(null)
    try {
      await saveLLMSettings(prefs)
      setMessage("保存成功")
    } catch (e: unknown) {
      setMessage(`保存失败: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSaving(false)
    }
  }, [prefs])

  if (loading) {
    return <p className="text-sm text-body">加载中...</p>
  }

  if (providers.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        未检测到任何 LLM 提供商。请在 <code className="text-xs bg-muted px-1 rounded">.env.local</code> 中设置
        <code className="text-xs bg-muted px-1 rounded">LLM_PROVIDERS</code> 环境变量。
      </p>
    )
  }

  return (
    <div className="max-w-lg space-y-5">
      <div>
        <h3 className="text-sm font-medium text-ink">LLM 配置</h3>
        <p className="text-xs text-body mt-1">
          API Key 通过 <code className="text-xs bg-muted px-1 rounded">.env.local</code> 环境变量配置，
          其他设置可在此覆盖。
        </p>
      </div>

      {/* 活跃提供商选择 */}
      <div className="space-y-2">
        <Label className="text-xs text-body">活跃提供商</Label>
        <Select value={activeProvider} onValueChange={setActiveProvider}>
          <SelectTrigger className="w-full h-9">
            <SelectValue placeholder="选择 LLM 提供商" />
          </SelectTrigger>
          <SelectContent>
            {providers.map(p => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 每提供商卡片 */}
      <div className="space-y-3">
        {providers.map(p => {
          const pPrefs = prefs.providers[p.id] ?? {}
          return (
            <div key={p.id} className="rounded-md border border-hairline bg-background p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-ink">{p.name}</span>
                <Badge variant={p.configured ? "default" : "secondary"}>
                  {p.configured ? "API Key 已配置" : "API Key 未配置"}
                </Badge>
              </div>

              <div className="space-y-2">
                <div>
                  <Label className="text-xs text-body">BASE_URL</Label>
                  <Input
                    value={pPrefs.baseUrl ?? ""}
                    onChange={e => updateProviderPref(p.id, { baseUrl: e.target.value || undefined })}
                    placeholder={p.baseURL}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-xs text-body">默认模型</Label>
                    <Input
                      value={pPrefs.models?.default ?? ""}
                      onChange={e => updateProviderPref(p.id, { models: { ...pPrefs.models, default: e.target.value || undefined } })}
                      placeholder={p.models.default}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-body">思考模型</Label>
                    <Input
                      value={pPrefs.models?.thinking ?? ""}
                      onChange={e => updateProviderPref(p.id, { models: { ...pPrefs.models, thinking: e.target.value || undefined } })}
                      placeholder={p.models.thinking}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-body">快速模型</Label>
                    <Input
                      value={pPrefs.models?.quick ?? ""}
                      onChange={e => updateProviderPref(p.id, { models: { ...pPrefs.models, quick: e.target.value || undefined } })}
                      placeholder={p.models.quick}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
              </div>

              {!p.configured && (
                <p className="text-xs text-muted-foreground">
                  请在 <code className="text-xs bg-muted px-1 rounded">.env.local</code> 中设置对应的 API Key 环境变量。
                </p>
              )}
            </div>
          )
        })}
      </div>

      {/* 保存按钮 */}
      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving} size="sm">
          {saving ? "保存中..." : "保存"}
        </Button>
        {message && (
          <span className={`text-xs ${message.includes('失败') ? 'text-destructive' : 'text-success'}`}>
            {message}
          </span>
        )}
      </div>
    </div>
  )
}
