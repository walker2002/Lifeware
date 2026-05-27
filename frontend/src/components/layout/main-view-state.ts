import type { DateViewMode } from "@/domains/timebox/components/types"
import type { HabitFormFields } from "@/domains/habits/components/habit-form"

export type MainViewState =
  | { type: 'schedule'; date: Date; viewMode: DateViewMode }
  | { type: 'conversation'; sessionId: string }
  | { type: 'action'; domainId: string; action: string }
  | { type: 'settings'; section?: 'general' | 'llm' | 'timezone' | 'templates' }
  | { type: 'view'; domainId: string; action: string; initialFields?: Partial<HabitFormFields> }

export type PanelTab = 'assistant' | 'growth'

export interface SplitWith {
  mode: 'form' | 'markdown'
  domainId: string
  action: string
  fields?: Record<string, unknown>
  content?: string
}
