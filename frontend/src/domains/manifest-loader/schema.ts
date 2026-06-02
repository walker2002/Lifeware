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
 * 字段元数据模式
 */
const FieldMetadataSchema = z.object({
  /** 字段类型 */
  type: z.enum(['string', 'number', 'boolean', 'date', 'time', 'enum', 'json', 'lifecycle_timestamp']),
  /** 显示标签 */
  label: z.string(),
  /** 是否必填 */
  required: z.boolean(),
  /** 枚举选项 */
  options: z.array(z.string()).optional(),
  /** 默认值 */
  default_value: z.unknown().optional(),
  /** 描述 */
  description: z.string().optional(),
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
 * 级联规则模式
 */
const CascadeRuleSchema = z.object({
  /** 事件名称 */
  on_event: z.string(),
  /** 条件 */
  condition: z.string().optional(),
  /** 动作 */
  action: z.string(),
  /** 是否自动执行 */
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
})

/**
 * Domain Manifest 类型
 */
export type DomainManifest = z.infer<typeof ManifestSchema>
