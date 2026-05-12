# UI Component Contracts: 任务管理系统

## ProjectDirectory

项目目录页的顶层组件，包含项目列表、筛选栏、独立任务区。

```typescript
interface ProjectDirectoryProps {
  // 无外部 props — 从 Repository 自行加载数据
}

// 内部状态
interface ProjectDirectoryState {
  projects: Project[]
  independentTasks: Task[]
  statusFilter: 'all' | 'active' | 'completed' | 'archived'
}
```

## ProjectDetail

项目详情页，展示任务层级结构。

```typescript
interface ProjectDetailProps {
  projectId: string  // 路由参数
}

// 回调
interface ProjectDetailCallbacks {
  onAddTask: (parentId?: string) => void
  onEditTask: (taskId: string) => void
  onStatusChange: (taskId: string, newStatus: TaskStatus) => void
}
```

## TaskList

可折叠任务列表（含子任务缩进展示）。

```typescript
interface TaskListProps {
  tasks: TaskWithChildren[]
  project?: Project
  onTaskClick: (taskId: string) => void
  onAddSubTask: (parentId: string) => void
}

interface TaskWithChildren extends Task {
  children: Task[]          // 子任务列表
  resolvedTime: ResolvedTime // 继承链解析后的时间参数
}
```

## TaskForm / ProjectForm

创建/编辑表单。

```typescript
interface TaskFormProps {
  projectId?: string       // 归属项目（null=独立任务）
  parentId?: string        // 父任务（null=顶级任务）
  task?: Task              // 编辑模式：已有任务数据
  project?: Project        // 用于时间继承的默认值
  onSave: (data: TaskFormData) => Promise<void>
  onCancel: () => void
}

interface TaskFormData {
  title: string
  description?: string
  priority: Priority
  energyRequired: EnergyLevel
  estimatedDuration: number
  earliestTime?: string
  latestStartTime?: string
  defaultTime?: string
  defaultDuration?: number
  frequencyType: 'once' | 'daily' | 'weekly' | 'custom'
  daysOfWeek?: number[]
  startDate?: DateOnly
  endDate?: DateOnly
}

interface ProjectFormProps {
  project?: Project        // 编辑模式
  onSave: (data: ProjectFormData) => Promise<void>
  onCancel: () => void
}

interface ProjectFormData {
  name: string
  description?: string
  startDate?: DateOnly
  endDate?: DateOnly
  defaultEarliestTime?: string
  defaultLatestStartTime?: string
  defaultDuration?: number
  priority?: Priority
  color?: string
  tags?: string[]
}
```

## TaskImportDialog / TaskImportPanel

AI 导入对话框和预览面板（复用 OKR 导入模式）。

```typescript
interface TaskImportDialogProps {
  open: boolean
  onClose: () => void
}

interface TaskImportPanelProps {
  extractedData: ImportPreview
  onSave: (data: ImportPreview) => Promise<void>
  onCancel: () => void
}

interface ImportPreview {
  project: Omit<ProjectFormData, 'status'>
  tasks: ImportPreviewTask[]
}

interface ImportPreviewTask {
  tempId: string
  title: string
  depth: number            // 0=顶级, 1=子任务
  estimatedDuration?: number
  priority?: Priority
  energyRequired?: EnergyLevel
  frequencyType?: string
}
```

## TemplateDialog

保存/管理模板对话框。

```typescript
interface TemplateDialogProps {
  open: boolean
  projectId?: string       // 从哪个项目保存模板
  onSave: (name: string) => Promise<void>
  onLoad: (templateId: string) => Promise<void>
  onClose: () => void
}
```

## StatusBadge

状态徽标（从 OKR 模块复用）。

```typescript
interface StatusBadgeProps {
  status: ProjectStatus | TaskStatus
  size?: 'sm' | 'md'
}
```

## SplitWarning

12 小时拆分提示（纯展示组件）。

```typescript
interface SplitWarningProps {
  estimatedDuration: number  // 分钟
}

// 渲染逻辑: estimatedDuration > 720 ? 显示黄色提示 : null
```
