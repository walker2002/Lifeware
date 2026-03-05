// Repository Interface Pattern
// All Nexus components depend on these interfaces, not concrete implementations

export interface ITaskRepository {
  findById(id: string): Promise<Task>;
  findByStatus(status: TaskStatus): Promise<Task[]>;
  findByPriority(priority: Priority): Promise<Task[]>;
  findByDueDateRange(startDate: Date, endDate: Date): Promise<Task[]>;
  save(task: Task): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface IHabitRepository {
  findById(id: string): Promise<Habit>;
  findActive(): Promise<Habit[]>;
  findByFrequency(frequency: Frequency): Promise<Habit[]>;
  save(habit: Habit): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface ITimeBoxRepository {
  findById(id: string): Promise<TimeBox>;
  findRunning(): Promise<TimeBox[]>;
  findToday(): Promise<TimeBox[]>;
  findByTaskId(taskId: string): Promise<TimeBox[]>;
  save(timebox: TimeBox): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface IOKRRepository {
  findById(id: string): Promise<OKR>;
  findActive(): Promise<OKR[]>;
  save(okr: OKR): Promise<void>;
  delete(id: string): Promise<void>;
}

// USOM Snapshot Interface
export interface IUSOMSnapshot {
  tasks: Task[];
  habits: Habit[];
  timeboxes: TimeBox[];
  okrs: OKR[];
  context: ContextSnapshot;
}

export interface IUSOMSnapshotRepository {
  build(userId?: string): Promise<IUSOMSnapshot>;
  refresh(): Promise<void>;
}

// Memory Framework Interfaces
export interface IMemoryRepository {
  addMemory(memory: Omit<MemoryItem, 'id' | 'timestamp'>): Promise<void>;
  getMemoriesByLayer(layer: string, limit?: number): Promise<MemoryItem[]>;
  getMemoriesByTags(tags: string[], limit?: number): Promise<MemoryItem[]>;
}

export interface IDerivedSignalRepository {
  addSignal(signal: Omit<DerivedSignal, 'id' | 'timestamp'>): Promise<void>;
  getSignalsByType(type: string, limit?: number): Promise<DerivedSignal[]>;
  getLatestSignal(type: string): Promise<DerivedSignal | null>;
}