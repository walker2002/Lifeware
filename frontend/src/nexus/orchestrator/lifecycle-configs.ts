// Lifecycle 配置 — 从各域 manifest 导入供 Orchestrator 使用
// Phase 7 过渡文件，后续将直接从 manifest 解析

import type { LifecycleDefinition, FieldMetadata } from '@/usom/types/domain-types'

export const timeboxLifecycle: LifecycleDefinition = {
  states: ['planned', 'running', 'overtime', 'ended', 'cancelled', 'logged'],
  initial_state: 'planned',
  transitions: [
    { from: null, to: 'planned', trigger: 'intent', action: 'create', event_type: 'TimeboxCreated' },
    { from: 'planned', to: 'running', trigger: 'intent', action: 'start', event_type: 'TimeboxStarted' },
    { from: 'running', to: 'ended', trigger: 'intent', action: 'end', event_type: 'TimeboxEnded' },
    { from: 'running', to: 'overtime', trigger: 'time', action: 'overtime', event_type: 'TimeboxOvertime' },
    { from: 'overtime', to: 'ended', trigger: 'intent', action: 'end', event_type: 'TimeboxEnded' },
    { from: 'planned', to: 'cancelled', trigger: 'intent', action: 'cancel', event_type: 'TimeboxCancelled' },
    { from: 'ended', to: 'logged', trigger: 'intent', action: 'log', event_type: 'TimeboxLogged' },
  ],
  terminal_states: ['cancelled', 'logged'],
}

export const timeboxFieldMeta: Record<string, FieldMetadata> = {
  startedAt: { type: 'lifecycle_timestamp', label: '开始时间', required: false },
  endedAt: { type: 'lifecycle_timestamp', label: '结束时间', required: false },
  overtimeAt: { type: 'lifecycle_timestamp', label: '超时时间', required: false },
}
