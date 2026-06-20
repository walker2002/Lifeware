/**
 * Domain 类型定义 — manifest.yaml 六区块对应的 TypeScript 类型
 * @see specs/006-domain-compliance-refactor/data-model.md
 */

// ─── 区块 A: intent_triggers ────────────────────────────────────
export interface IntentTrigger {
  action: string
  description: string
  examples: string[]
  keywords: string[]
  /** 可选：UI 路由，用于导航意图 */
  view_route?: string
}

// ─── 区块 B: lifecycle ──────────────────────────────────────────
export interface LifecycleTransition {
  from: string | string[] | null
  to: string
  trigger: 'intent' | 'time'
  action: string
  event_type: string
}

export interface LifecycleDefinition {
  states: string[]
  initial_state: string
  transitions: LifecycleTransition[]
  terminal_states: string[]
}

// ─── 区块 C: field_metadata ─────────────────────────────────────
export interface FieldMetadata {
  type: 'string' | 'number' | 'boolean' | 'date' | 'time' | 'enum' | 'json' | 'lifecycle_timestamp'
  label: string
  required: boolean
  options?: string[]
  default_value?: unknown
  description?: string
  /** 字段写入分类（[018] 业务事实写入口）：FactField 走写入口 / ContentField 直走 Repo / PresentationField 本地态 */
  mutation_mode?: 'FactField' | 'ContentField' | 'PresentationField'
}

// ─── 区块 D: list_actions ───────────────────────────────────────
export interface ListAction {
  action: string
  label: string
  confirm_required: boolean
}

// ─── 区块 E: required_fields + templates ─────────────────────────
export interface FieldPrompt {
  name: string
  label: string
  type: 'text' | 'textarea' | 'number' | 'date' | 'time' | 'select' | 'multiselect' | 'toggle'
  required: boolean
  options?: string[]
  default_value?: unknown
  placeholder?: string
}

export interface FormField extends FieldPrompt {}

// ─── 区块 G: rules（[018-G3] 规则三层架构） ──────────────────────
/**
 * 规则声明（manifest.yaml rules 区块；逻辑在 registry）
 * @see docs/superpowers/specs/2026-06-20-rules-three-tier-architecture-design.md §4
 */
export interface Rule {
  /** 规则 id，全域唯一，绑定 registry 检查函数 */
  id: string
  /** both=客户端 realtime 提示 + 服务端权威；submit=仅服务端权威 */
  phase: 'submit' | 'both'
  /** 该规则关注字段；both 必须单字段 */
  fields: string[]
  /** 面向用户的提示文案 */
  message: string
}

// ─── 完整 DomainManifest（六区块） ──────────────────────────────
export interface DomainManifest {
  id: string
  version: string
  name: string
  description: string

  /** 区块 A: 意图触发器（含 view_routes） */
  intent_triggers: IntentTrigger[]

  /** 区块 B: 生命周期定义，key 为对象类型 */
  lifecycle: Record<string, LifecycleDefinition>

  /** 区块 C: 字段元数据 */
  field_metadata: Record<string, FieldMetadata>

  /** 区块 D: 列表操作 */
  list_actions: ListAction[]

  /** 区块 E: 必填字段提示，key 为 action name */
  required_fields: Record<string, FieldPrompt[]>

  /** 区块 E (可选): 表单模板 */
  templates?: { form: Record<string, FormField[]> }

  /** 区块 F: 订阅事件 */
  subscribed_events: string[]

  /** 区块 G: 规则声明（[018-G3]，可选） */
  rules?: Rule[]
}
