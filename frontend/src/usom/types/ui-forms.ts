export interface ProjectFormData {
  name: string
  description?: string
  startDate?: string
  endDate?: string
  priority?: string
  color?: string
  tags?: string[]
}

export interface TaskFormData {
  title: string
  description?: string
  priority: string
  energyRequired: string
  estimatedDuration: number
  frequencyType?: string
  daysOfWeek?: number[]
  startDate?: string
  endDate?: string
}
