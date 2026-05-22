import type { ContextProvider } from '@/usom/types/process'

export class EnergyProfileProvider implements ContextProvider {
  async provide(query: string, _params: Record<string, unknown>): Promise<unknown> {
    if (query !== 'energy_profile') return null

    return {
      peakHours: [9, 10, 11],
      lowHours: [14, 15, 16],
      source: 'system_default',
    }
  }
}
