import { ITaskRepository } from '@/usom/interfaces/irepository'
import type { Task, StructuredIntent } from '@/usom/types/objects'
import { TaskStatus, Priority, EnergyLevel } from '@/usom/types/primitives'
import type { USOM_ID } from '@/usom/types/primitives'

// NOTE: This handler uses the old pre-alignment interface and will be
// rewritten when Domain Plugin four-hook interfaces are finalized.
// It is updated here minimally to compile against the new USOM types.

export class CreateTaskHandler {
  constructor(private taskRepo: ITaskRepository) {}

  async validate(intent: StructuredIntent, _snapshot: unknown) {
    const errors: string[] = []

    const title = intent.fields['title'] as string | undefined
    if (!title || title.trim() === '') {
      errors.push('任务标题不能为空')
    }

    if (title) {
      // NOTE: findByStatus now requires userId — this will be fixed
      // when Domain Plugin interfaces are properly implemented.
      const userId = '' as USOM_ID
      const existingTasks = await this.taskRepo.findByStatus('active', userId)
      const hasDuplicate = existingTasks.some(
        task => task.title.toLowerCase() === title.toLowerCase()
      )
      if (hasDuplicate) {
        errors.push('已存在同名任务')
      }
    }

    return { valid: errors.length === 0, errors }
  }

  async execute(intent: StructuredIntent) {
    const task: Task = {
      id: '' as USOM_ID,
      title: intent.fields['title'] as string,
      description: (intent.fields['description'] as string) || undefined,
      status: 'draft',
      priority: (intent.fields['priority'] as Priority) || Priority.Medium,
      energyRequired: (intent.fields['energyRequired'] as EnergyLevel) || EnergyLevel.Medium,
      estimatedDuration: (intent.fields['estimatedDuration'] as number) || 30,
      tags: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    // NOTE: save now requires userId — this will be fixed
    // when Domain Plugin interfaces are properly implemented.
    const userId = '' as USOM_ID
    await this.taskRepo.save(task, userId)
    return task
  }
}
