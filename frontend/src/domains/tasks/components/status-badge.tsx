/**
 * @file status-badge
 * @brief 状态徽章组件
 * 
 * 统一展示项目/任务状态的徽章组件
 */

import { Badge } from '@/components/ui/badge'

/** 项目状态类型 */
type ProjectStatus = 'planning' | 'active' | 'paused' | 'completed' | 'archived'
/** 任务状态类型 */
type TaskStatus = 'draft' | 'active' | 'in_progress' | 'on_hold' | 'completed' | 'archived'

/** 状态配置映射 */
const STATUS_CONFIG: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  planning:    { label: '规划中', variant: 'secondary' },
  active:      { label: '进行中', variant: 'default' },
  paused:      { label: '已暂停', variant: 'outline' },
  draft:       { label: '草稿',   variant: 'secondary' },
  in_progress: { label: '执行中', variant: 'default' },
  on_hold:     { label: '搁置',   variant: 'outline' },
  completed:   { label: '已完成', variant: 'default' },
  archived:    { label: '已归档', variant: 'secondary' },
}

export function StatusBadge({ status, size = 'md' }: { status: ProjectStatus | TaskStatus; size?: 'sm' | 'md' }) {
  const config = STATUS_CONFIG[status] ?? { label: status, variant: 'secondary' as const }
  return (
    <Badge variant={config.variant} className={size === 'sm' ? 'text-xs px-1.5' : ''}>
      {config.label}
    </Badge>
  )
}
