/**
 * @file schema
 * @brief Domain Manifest 的 Zod 校验模式定义
 * 
 * 定义领域 manifest 的所有校验模式，包括：
 * - 意图触发器 (IntentTrigger)
 * - 生命周期状态机 (Lifecycle)
 * - 字段元数据 (FieldMetadata)
 * - 生成动作 (GenerationAction)
 * - 查询动作 (QueryAction)
 */

import { z } from 'zod'

/**
 * 意图触发器模式
 */
const IntentTriggerSchema = z.object({
  /** 动作名称 */
  action: z.string(),
  /** 快捷方式 */
  shortcut: z.string().optional(),
  /** 描述 */
  description: z.string(),
  /** 示例 */
  examples: z.array(z.string()).optional(),
  /** 关键词 */
  keywords: z.array(z.string()).optional(),
  /** 视图路由 */
  view_route: z.string().optional(),
  /** 响应类型 */
  response_type: z.enum(['page', 'cnui', 'text']).optional(),
  /** CNUI Surface 类型 */
  cnui_surface: z.string().optional(),
})

/**
 * 生命周期转换模式
 */
const LifecycleTransitionSchema = z.object({
  /** 源状态（可为空、单个或多个） */
  from: z.union([z.string(), z.array(z.string()), z.null()]),
  /** 目标状态 */
  to: z.string(),
  /** 触发方式 */
  trigger: z.enum(['intent', 'time']),
  /** 动作 */
  action: z.string(),
  /** 事件类型 */
  event_type: z.string(),
})

/**
 * 生命周期定义模式
 */
const LifecycleDefinitionSchema = z.object({
  /** 所有状态列表 */
  states: z.array(z.string()),
  /** 初始状态 */
  initial_state: z.string(),
  /** 转换列表 */
  transitions: z.array(LifecycleTransitionSchema),
  /** 终态列表 */
  terminal_states: z.array(z.string()),
})

/**
 * 字段元数据模式（[020] 仅保留运行时消费字段：type/options/mutation_mode。
 * label/required/default_value/description 已删——前端表单手写硬编码，零运行时消费。
 * ManifestSchema 非 strict，旧域（okrs/timebox）残留的 label/required 会被 strip 不报错。）
 */
const FieldMetadataSchema = z.object({
  /** 字段类型（field-executor 校验消费） */
  type: z.enum(['string', 'number', 'boolean', 'date', 'time', 'enum', 'json', 'lifecycle_timestamp']),
  /** 枚举选项（field-executor enum 校验消费） */
  options: z.array(z.string()).optional(),
  /** 字段写入分类（resolveMutationMode 消费）：FactField 走写入口 / ContentField 直走 Repo / PresentationField 本地态 */
  mutation_mode: z.enum(['FactField', 'ContentField', 'PresentationField']).optional(),
})

/**
 * 列表动作模式
 */
const ListActionSchema = z.object({
  /** 动作名称 */
  action: z.string(),
  /** 显示标签 */
  label: z.string(),
  /** 是否需要确认 */
  confirm_required: z.boolean(),
})

/**
 * 字段提示模式
 */
const FieldPromptSchema = z.object({
  /** 字段名 */
  name: z.string(),
  /** 显示标签 */
  label: z.string(),
  /** 输入类型 */
  type: z.enum(['text', 'textarea', 'number', 'date', 'time', 'select', 'multiselect', 'toggle']),
  /** 是否必填 */
  required: z.boolean(),
  /** 选项列表 */
  options: z.array(z.string()).optional(),
  /** 默认值 */
  default_value: z.unknown().optional(),
  /** 占位符文本 */
  placeholder: z.string().optional(),
})

/**
 * 视图路由模式
 */
const ViewRouteSchema = z.object({
  /** 组件路径 */
  component: z.string(),
  /** 路由参数 */
  params: z.record(z.string(), z.unknown()).optional(),
})

/**
 * Markdown 模板模式
 */
const MarkdownTemplateSchema = z.object({
  /** 模板文件路径 */
  template_file: z.string(),
  /** 描述 */
  description: z.string(),
  /** 输出动作 */
  output_action: z.string(),
  /** 最大对象数量 */
  max_objects: z.number().optional(),
})

/**
 * 上下文声明模式
 */
const ContextDeclarationSchema = z.object({
  /** 上下文 ID */
  id: z.string(),
  /** 查询语句 */
  query: z.string(),
  /** 参数列表 */
  params: z.array(z.string()).optional(),
})

/**
 * 生成动作模式
 */
const GenerationActionSchema = z.object({
  /** 描述 */
  description: z.string(),
  /** 需要的上下文 */
  contexts: z.array(ContextDeclarationSchema),
  /** 响应模式 */
  response_mode: z.enum(['text', 'cnui']).optional(),
  /** CNUI Surface 类型 */
  cnui_surface_type: z.string().optional(),
  /** 是否启用会话 */
  session_enabled: z.boolean().optional(),
  /** 缓存 TTL（分钟） */
  cache_ttl_minutes: z.number().optional(),
})

/**
 * 查询动作模式
 */
const QueryActionSchema = z.object({
  /** 描述 */
  description: z.string(),
  /** 响应模式 */
  response_mode: z.enum(['text', 'cnui']),
  /** CNUI Surface */
  cnui_surface: z.string().optional(),
  /** 上下文能力 */
  context_capabilities: z.array(ContextDeclarationSchema),
})

/**
 * 级联子规则模式 — 定义父动作到子对象状态变更的映射
 * @property parent_action - 父对象触发的动作
 * @property child_filter - 子对象过滤表达式（如 `status == 'draft'`）
 * @property child_to_status - 子对象目标状态
 * @property event_type - 触发的事件类型
 */
const CascadeChildRuleSchema = z.object({
  parent_action: z.string(),
  child_filter: z.string(),
  child_to_status: z.string(),
  event_type: z.string(),
})

/**
 * 级联规则模式
 *
 * 支持两种类型：
 * - parent_child_status: 父对象状态变更级联到子对象
 */
const CascadeRuleSchema = z.object({
  /** 规则类型（parent_child_status 等） */
  type: z.string().optional(),
  /** 父对象类型名 */
  parent_object: z.string().optional(),
  /** 子对象类型名 */
  child_object: z.string().optional(),
  /** GenericRepo 上的查询方法名 */
  child_query: z.string().optional(),
  /** 父 action → 子对象过滤 → 子目标状态的映射规则 */
  rules: z.array(CascadeChildRuleSchema).optional(),
  /** 事件名称（旧格式兼容） */
  on_event: z.string().optional(),
  /** 条件（旧格式兼容） */
  condition: z.string().optional(),
  /** 动作（旧格式兼容） */
  action: z.string().optional(),
  /** 是否自动执行（旧格式兼容） */
  auto_execute: z.boolean().default(false),
})

/**
 * CNUI Surface 模式
 */
const CnuiSurfaceSchema = z.object({
  /** 描述 */
  description: z.string().optional(),
  /** 处理器 */
  handler: z.string().optional(),
})

/**
 * 规则模式（[018-G3] 规则三层架构）
 *
 * §4.2 不变式（Zod 层强制）：
 * - phase ∈ {submit, both}（无 realtime-only——消灭「规则只存单层可被绕过」病灶）
 * - phase: both ⟹ 单字段（多字段规则只能 submit：blur 单字段时其余字段未必就绪）
 */
const RuleSchema = z.object({
  /** 规则 id，全域唯一，绑定 registry 检查函数 */
  id: z.string(),
  /** 触发时机：both=客户端 realtime 提示 + 服务端权威；submit=仅服务端权威（多字段/查库） */
  phase: z.enum(['submit', 'both']),
  /** 该规则关注字段；both 必须单字段 */
  fields: z.array(z.string()).min(1),
  /** 面向用户的提示文案（i18n 留口，以 id 为 key） */
  message: z.string(),
}).refine(
  (r) => !(r.phase === 'both' && r.fields.length > 1),
  { message: 'phase: both 规则必须单字段（§4.2 不变式：多字段规则只能 phase: submit）' },
)

/**
 * Manifest 主模式
 */
export const ManifestSchema = z.object({
  /** 领域 ID */
  id: z.string(),
  /** 版本号 */
  version: z.string(),
  /** 名称 */
  name: z.string(),
  /** 描述 */
  description: z.string(),
  /** 意图触发器列表 */
  intent_triggers: z.array(IntentTriggerSchema),
  /** 生命周期定义 */
  lifecycle: z.record(z.string(), LifecycleDefinitionSchema),
  /** 字段元数据 */
  field_metadata: z.record(z.string(), FieldMetadataSchema),
  /** 列表动作 */
  list_actions: z.array(ListActionSchema),
  /** 必填字段 */
  required_fields: z.record(z.string(), z.array(FieldPromptSchema)),
  /** 模板配置 */
  templates: z.object({
    /** 表单模板 */
    form: z.record(z.string(), z.array(FieldPromptSchema)).optional(),
    /** Markdown 模板 */
    markdown: z.record(z.string(), MarkdownTemplateSchema).optional(),
  }).optional(),
  /** 视图路由 */
  view_routes: z.record(z.string(), ViewRouteSchema).optional(),
  /** 订阅事件列表 */
  subscribed_events: z.array(z.string()),
  /** 生成动作 */
  generation_actions: z.record(z.string(), GenerationActionSchema).optional(),
  /** 查询动作 */
  query_actions: z.record(z.string(), QueryActionSchema).optional(),
  /** 级联规则 */
  cascade_rules: z.array(CascadeRuleSchema).optional(),
  /** CNUI Surfaces */
  cnui_surfaces: z.record(z.string(), CnuiSurfaceSchema).optional(),
  /** 规则区块（[018-G3] 规则三层架构；可选，向后兼容） */
  rules: z.array(RuleSchema).optional(),
})

/**
 * Domain Manifest 类型
 */
export type DomainManifest = z.infer<typeof ManifestSchema>
