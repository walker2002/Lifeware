import { ITaskRepository } from '@/usom/interfaces/irepository';
import { Task, TaskStatus, Priority, StructuredIntent } from '@/usom/types/objects';

export class CreateTaskHandler {
  constructor(private taskRepo: ITaskRepository) {}

  async validate(intent: StructuredIntent, snapshot: any) {
    // Domain-specific validation logic
    const errors: string[] = [];

    // Check if title is provided
    if (!intent.data.title || intent.data.title.trim() === '') {
      errors.push('任务标题不能为空');
    }

    // Check for duplicate titles (if needed)
    if (intent.data.title) {
      const existingTasks = await this.taskRepo.findByStatus(TaskStatus.Active);
      const hasDuplicate = existingTasks.some(
        task => task.title.toLowerCase() === intent.data.title.toLowerCase()
      );
      if (hasDuplicate) {
        errors.push('已存在同名任务');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  async execute(intent: StructuredIntent) {
    const task: Task = {
      id: '', // Will be set by the repository
      title: intent.data.title,
      description: intent.data.description || '',
      status: TaskStatus.Draft,
      priority: intent.data.priority || Priority.Medium,
      estimatedTime: intent.data.estimatedTime,
      dueDate: intent.data.dueDate ? new Date(intent.data.dueDate) : undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
      context: intent.metadata?.context || {}
    };

    await this.taskRepo.save(task);
    return task;
  }
}