import { z } from 'zod'

const IntentTriggerSchema = z.object({
  action: z.string(),
  shortcut: z.string().optional(),
  description: z.string(),
  examples: z.array(z.string()),
  keywords: z.array(z.string()),
  view_route: z.string().optional(),
})

const LifecycleTransitionSchema = z.object({
  from: z.union([z.string(), z.array(z.string()), z.null()]),
  to: z.string(),
  trigger: z.enum(['intent', 'time']),
  action: z.string(),
  event_type: z.string(),
})

const LifecycleDefinitionSchema = z.object({
  states: z.array(z.string()),
  initial_state: z.string(),
  transitions: z.array(LifecycleTransitionSchema),
  terminal_states: z.array(z.string()),
})

const FieldMetadataSchema = z.object({
  type: z.enum(['string', 'number', 'boolean', 'date', 'time', 'enum', 'json', 'lifecycle_timestamp']),
  label: z.string(),
  required: z.boolean(),
  options: z.array(z.string()).optional(),
  default_value: z.unknown().optional(),
  description: z.string().optional(),
})

const ListActionSchema = z.object({
  action: z.string(),
  label: z.string(),
  confirm_required: z.boolean(),
})

const FieldPromptSchema = z.object({
  name: z.string(),
  label: z.string(),
  type: z.enum(['text', 'textarea', 'number', 'date', 'time', 'select', 'multiselect', 'toggle']),
  required: z.boolean(),
  options: z.array(z.string()).optional(),
  default_value: z.unknown().optional(),
  placeholder: z.string().optional(),
})

const ViewRouteSchema = z.object({
  component: z.string(),
  params: z.record(z.string(), z.unknown()).optional(),
})

const MarkdownTemplateSchema = z.object({
  template_file: z.string(),
  description: z.string(),
  output_action: z.string(),
  max_objects: z.number().optional(),
})

const ContextDeclarationSchema = z.object({
  id: z.string(),
  query: z.string(),
  params: z.array(z.string()).optional(),
})

const GenerationActionSchema = z.object({
  description: z.string(),
  contexts: z.array(ContextDeclarationSchema),
  response_mode: z.enum(['text', 'cnui']).optional(),
  cnui_surface_type: z.string().optional(),
  session_enabled: z.boolean().optional(),
  cache_ttl_minutes: z.number().optional(),
})

const QueryActionSchema = z.object({
  description: z.string(),
  response_mode: z.enum(['text', 'cnui']),
  cnui_surface: z.string().optional(),
  context_capabilities: z.array(ContextDeclarationSchema),
})

export const ManifestSchema = z.object({
  id: z.string(),
  version: z.string(),
  name: z.string(),
  description: z.string(),

  intent_triggers: z.array(IntentTriggerSchema),

  lifecycle: z.record(z.string(), LifecycleDefinitionSchema),

  field_metadata: z.record(z.string(), FieldMetadataSchema),

  list_actions: z.array(ListActionSchema),

  required_fields: z.record(z.string(), z.array(FieldPromptSchema)),

  templates: z.object({
    form: z.record(z.string(), z.array(FieldPromptSchema)).optional(),
    markdown: z.record(z.string(), MarkdownTemplateSchema).optional(),
  }).optional(),

  view_routes: z.record(z.string(), ViewRouteSchema).optional(),

  subscribed_events: z.array(z.string()),

  generation_actions: z.record(z.string(), GenerationActionSchema).optional(),
  query_actions: z.record(z.string(), QueryActionSchema).optional(),
})

export type DomainManifest = z.infer<typeof ManifestSchema>
