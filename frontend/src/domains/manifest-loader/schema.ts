import { z } from 'zod'

const IntentTriggerSchema = z.object({
  action: z.string(),
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
    form: z.record(z.string(), z.array(FieldPromptSchema)),
  }).optional(),

  subscribed_events: z.array(z.string()),
})

export type DomainManifest = z.infer<typeof ManifestSchema>
