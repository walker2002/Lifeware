/**
 * @file task-filter-bar
 * @brief 任务树顶部筛选栏组件
 *
 * 包含搜索框、清晰度/状态文字按钮筛选、排序下拉。
 * 替代原 ThreadListPanel 底部复选框筛选区。
 */

'use client'

import { Search } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── 类型定义 ──────────────────────────────────────────────────────────

/** 排序字段类型 */
export type SortField = 'title' | 'startDate' | 'endDate'

/** TaskFilterBar 组件属性 */
interface TaskFilterBarProps {
  /** 搜索关键词 */
  searchQuery: string
  /** 搜索变更回调 */
  onSearchChange: (query: string) => void
  /** 当前清晰度筛选值 */
  filterClarity: string[]
  /** 当前状态筛选值 */
  filterStatus: string[]
  /** 筛选变更回调 */
  onFilterChange: (key: 'clarity' | 'status', value: string) => void
  /** 排序字段 */
  sortBy: SortField
  /** 排序字段变更回调 */
  onSortByChange: (sortBy: SortField) => void
}

// ─── 常量 ──────────────────────────────────────────────────────────

/** 清晰度选项 */
const CLARITY_OPTIONS = [
  { value: 'fuzzy', label: '模糊' },
  { value: 'scoped', label: '有范围' },
  { value: 'actionable', label: '可执行' },
]

/** 状态选项 */
const STATUS_OPTIONS = [
  { value: 'todo', label: '待办' },
  { value: 'planned', label: '计划中' },
  { value: 'in_progress', label: '进行中' },
  { value: 'completed', label: '已完成' },
  { value: 'archived', label: '已归档' },
]

/** 排序选项 */
const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'title', label: '名称' },
  { value: 'startDate', label: '开始时间' },
  { value: 'endDate', label: '结束时间' },
]

/** 文字按钮 — 未选中样式 */
const TAG_UNSELECTED = 'bg-canvas text-body border border-hairline rounded px-2.5 py-1 text-xs cursor-pointer hover:bg-hover-overlay transition-colors'

/** 文字按钮 — 选中样式 */
const TAG_SELECTED = 'bg-ink text-on-primary rounded px-2.5 py-1 text-xs cursor-pointer transition-colors'

// ─── 组件 ──────────────────────────────────────────────────────────

/**
 * 任务树顶部筛选栏组件
 * @param props - 组件属性
 */
export function TaskFilterBar({
  searchQuery,
  onSearchChange,
  filterClarity,
  filterStatus,
  onFilterChange,
  sortBy,
  onSortByChange,
}: TaskFilterBarProps) {
  return (
    <div className="px-4 py-3 border-b border-hairline bg-surface-soft space-y-2">
      {/* 第一行：搜索框 + 排序 */}
      <div className="flex items-center gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-body" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="搜索任务..."
            className="w-full h-8 pl-8 pr-3 rounded-md border border-hairline bg-canvas text-xs text-ink placeholder:text-muted-soft focus:outline-none focus:ring-2 focus:ring-focus-ring"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-body">排序</span>
          <select
            value={sortBy}
            onChange={e => onSortByChange(e.target.value as SortField)}
            className="h-8 rounded-md border border-hairline bg-canvas px-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-focus-ring"
          >
            {SORT_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* 第二行：清晰度标签 */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-body shrink-0">清晰度</span>
        <div className="flex flex-wrap gap-1.5">
          {CLARITY_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onFilterChange('clarity', opt.value)}
              className={cn(filterClarity.includes(opt.value) ? TAG_SELECTED : TAG_UNSELECTED)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* 第三行：状态标签 */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-body shrink-0">状态</span>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onFilterChange('status', opt.value)}
              className={cn(filterStatus.includes(opt.value) ? TAG_SELECTED : TAG_UNSELECTED)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
