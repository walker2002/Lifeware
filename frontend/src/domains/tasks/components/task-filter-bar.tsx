/**
 * @file task-filter-bar
 * @brief 任务树顶部筛选栏组件
 *
 * 搜索框左侧增加任务/主线类型选择下拉，筛选区改为标签式下拉按钮（FilterDropdown），
 * 参照参考截图设计：圆角药丸形状 + 选中计数 + 清除功能。
 */

'use client'

import { useState, useRef, useEffect } from 'react'
import { Search, ArrowUpDown, ChevronDown, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── 类型定义 ──────────────────────────────────────────────────────────

/** 搜索类型 */
export type SearchType = 'task' | 'thread'

/** 排序字段类型 */
export type SortField = 'title' | 'startDate' | 'endDate'

/** TaskFilterBar 组件属性 */
interface TaskFilterBarProps {
  /** 搜索关键词 */
  searchQuery: string
  /** 搜索变更回调 */
  onSearchChange: (query: string) => void
  /** 搜索类型 */
  searchType: SearchType
  /** 搜索类型变更回调 */
  onSearchTypeChange: (type: SearchType) => void
  /** 当前清晰度筛选值 */
  filterClarity: string[]
  /** 当前状态筛选值 */
  filterStatus: string[]
  /** 筛选变更回调 */
  onFilterChange: (key: 'clarity' | 'status', value: string) => void
  /** 当前主线状态筛选值 */
  filterThreadStatus: string[]
  /** 主线状态筛选变更回调 */
  onThreadStatusChange: (value: string) => void
  /** 排序字段 */
  sortBy: SortField
  /** 排序字段变更回调 */
  onSortByChange: (sortBy: SortField) => void
  /** 排序方向 */
  sortOrder: 'asc' | 'desc'
  /** 排序方向变更回调 */
  onSortOrderChange: (order: 'asc' | 'desc') => void
}

// ─── 常量 ──────────────────────────────────────────────────────────

/** 主线状态选项 */
const THREAD_STATUS_OPTIONS = [
  { value: 'active', label: '活跃' },
  { value: 'paused', label: '已暂停' },
  { value: 'completed', label: '已完成' },
  { value: 'archived', label: '已归档' },
]

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

// ─── 内部组件：FilterDropdown ──────────────────────────────────────

/**
 * 标签式筛选下拉按钮
 * @description 圆角药丸形状，打开时显示复选框列表 + 清除按钮，点击外部自动关闭
 */
function FilterDropdown({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string
  options: Array<{ value: string; label: string }>
  selected: string[]
  onToggle: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const hasSelection = selected.length > 0 && selected.length < options.length

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={cn(
          'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
          hasSelection
            ? 'border-primary/40 bg-primary/10 text-primary-active'
            : 'border-hairline bg-canvas text-body hover:bg-hover-overlay',
        )}
      >
        <span>{label}</span>
        {hasSelection && (
          <span className="text-[10px] opacity-70">({selected.length})</span>
        )}
        <ChevronDown className={cn('size-3 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-20 min-w-[160px] rounded-md border border-hairline bg-canvas shadow-md py-1">
          {options.map(opt => {
            const isSelected = selected.includes(opt.value)
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onToggle(opt.value)}
                className={cn(
                  'flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-hover-overlay transition-colors text-left',
                  isSelected ? 'text-ink font-medium' : 'text-body',
                )}
              >
                <span className={cn(
                  'size-3.5 rounded border flex items-center justify-center shrink-0',
                  isSelected ? 'bg-primary border-primary' : 'border-hairline',
                )}>
                  {isSelected && <Check className="size-2.5 text-on-primary" />}
                </span>
                {opt.label}
              </button>
            )
          })}
          <div className="border-t border-hairline mt-1 pt-1">
            <button
              type="button"
              onClick={() => options.forEach(o => selected.includes(o.value) && onToggle(o.value))}
              className="w-full px-3 py-1 text-xs text-body/60 hover:text-ink transition-colors text-left"
            >
              清除
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── 主组件：TaskFilterBar ─────────────────────────────────────────

/**
 * 任务树顶部筛选栏组件
 * @param props - 组件属性
 */
export function TaskFilterBar({
  searchQuery,
  onSearchChange,
  searchType,
  onSearchTypeChange,
  filterClarity,
  filterStatus,
  onFilterChange,
  filterThreadStatus,
  onThreadStatusChange,
  sortBy,
  onSortByChange,
  sortOrder,
  onSortOrderChange,
}: TaskFilterBarProps) {
  return (
    <div className="px-4 py-2.5 border-b border-hairline bg-canvas space-y-2">
      {/* 第一行：搜索类型 + 搜索框 + 排序 */}
      <div className="flex items-center gap-2">
        {/* 搜索类型下拉 */}
        <select
          value={searchType}
          onChange={e => onSearchTypeChange(e.target.value as SearchType)}
          className="h-8 w-16 shrink-0 rounded-l-md border border-hairline bg-canvas px-1.5 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-focus-ring appearance-none cursor-pointer"
        >
          <option value="task">任务</option>
          <option value="thread">主线</option>
        </select>

        {/* 搜索框 */}
        <div className="flex-1 relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-body" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            placeholder={searchType === 'task' ? '搜索任务标题/ID...' : '搜索主线名称/ID...'}
            className="w-full h-8 pl-8 pr-3 rounded-r-md border border-hairline border-l-0 bg-canvas text-xs text-ink placeholder:text-body/70-soft focus:outline-none focus:ring-2 focus:ring-focus-ring"
          />
        </div>

        {/* 排序 */}
        <div className="flex items-center gap-1 shrink-0">
          <select
            value={sortBy}
            onChange={e => onSortByChange(e.target.value as SortField)}
            className="h-8 rounded-md border border-hairline bg-canvas px-2 text-xs text-ink cursor-pointer focus:outline-none focus:ring-2 focus:ring-focus-ring appearance-none"
          >
            {SORT_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => onSortOrderChange(sortOrder === 'asc' ? 'desc' : 'asc')}
            className="h-8 w-8 flex items-center justify-center rounded-md border border-hairline bg-canvas hover:bg-hover-overlay transition-colors"
            title={sortOrder === 'asc' ? '顺序' : '逆序'}
          >
            <ArrowUpDown className={cn('size-3 text-body transition-transform', sortOrder === 'desc' && 'rotate-180')} />
          </button>
        </div>
      </div>

      {/* 第二行：标签式筛选按钮 */}
      <div className="flex items-center gap-2 flex-wrap">
        <FilterDropdown
          label="主线状态"
          options={THREAD_STATUS_OPTIONS}
          selected={filterThreadStatus}
          onToggle={onThreadStatusChange}
        />
        <FilterDropdown
          label="任务状态"
          options={STATUS_OPTIONS}
          selected={filterStatus}
          onToggle={(v) => onFilterChange('status', v)}
        />
        <FilterDropdown
          label="清晰度"
          options={CLARITY_OPTIONS}
          selected={filterClarity}
          onToggle={(v) => onFilterChange('clarity', v)}
        />
      </div>
    </div>
  )
}
