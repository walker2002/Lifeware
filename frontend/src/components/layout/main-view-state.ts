import type { DateViewMode } from "@/domains/timebox/components/types"

export type MainViewState =
  | { type: 'schedule'; date: Date; viewMode: DateViewMode }
  | { type: 'conversation'; sessionId: string }
  | { type: 'action'; domainId: string; action: string }
  | { type: 'settings'; section?: 'general' | 'llm' | 'timezone' | 'templates' }
  | { type: 'view'; domainId: string; action: string; initialFields?: Record<string, unknown> }

export type PanelTab = 'assistant' | 'growth'

export interface SplitWith {
  mode: 'form' | 'markdown'
  domainId: string
  action: string
  fields?: Record<string, unknown>
  content?: string
}
