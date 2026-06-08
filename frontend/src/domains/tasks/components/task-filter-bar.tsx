/**
 * @file task-filter-bar
 * @brief 任务树顶部筛选栏组件
 *
 * 包含搜索框、清晰度/状态文字按钮筛选、排序下拉。
 * 替代原 ThreadListPanel 底部复选框筛选区。
 *
 * 视觉风格参照 OKR 时段筛选栏设计：
 * - 选中态使用品牌暖色 bg-primary，未选中态白底+细边框
 * - 两行紧凑布局：搜索+排序 → 筛选标签组
 */

'use client'

import { Search, ArrowUpDown } from 'lucide-react'
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

/** 筛选标签 — 未选中样式（白底 + 浅边框 + 正文色文字） */
const TAG_UNSELECTED = cn(
  'bg-canvas text-body border border-hairline rounded-md',
  'px-2.5 py-1 text-xs cursor-pointer',
  'hover:bg-hover-overlay transition-colors duration-150',
)

/**
 * 筛选标签 — 选中样式
 * 使用 primary-active（#a9583e）而非 primary（#cc785c）以确保白字对比度 ≥ 4.5:1
 * @see UI-DESIGN-SPEC.md §1.1 注释：primary + on-primary 对比度 3.3:1，仅限大文本使用
 */
const TAG_SELECTED = cn(
  'bg-primary-active text-on-primary border border-primary-active rounded-md',
  'px-2.5 py-1 text-xs font-medium cursor-pointer',
  'transition-colors duration-150',
)

/** 分组标签文字样式 */
const GROUP_LABEL = 'text-xs text-body shrink-0 w-10'

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
    <div className="px-4 py-2.5 border-b border-hairline bg-canvas space-y-2">
      {/* 第一行：搜索框 + 排序 */}
      <div className="flex items-center gap-3">
        {/* 搜索框 */}
        <div className="flex-1 relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="搜索任务..."
            className="w-full h-8 pl-8 pr-3 rounded-md border border-hairline bg-canvas text-xs text-ink placeholder:text-muted-soft focus:outline-none focus:ring-2 focus:ring-focus-ring focus:border-primary"
          />
        </div>

        {/* 排序 */}
        <div className="flex items-center gap-1.5 shrink-0">
          <ArrowUpDown className="size-3 text-muted" />
          <select
            value={sortBy}
            onChange={e => onSortByChange(e.target.value as SortField)}
            className="h-8 rounded-md border border-hairline bg-canvas px-2 pr-6 text-xs text-ink appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-focus-ring hover:border-muted-soft transition-colors"
          >
            {SORT_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* 第二行：清晰度 + 状态筛选标签 */}
      <div className="flex items-center gap-6 flex-wrap">
        {/* 清晰度 */}
        <div className="flex items-center gap-1.5">
          <span className={GROUP_LABEL}>清晰度</span>
          {CLARITY_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onFilterChange('clarity', opt.value)}
              className={filterClarity.includes(opt.value) ? TAG_SELECTED : TAG_UNSELECTED}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* 状态 */}
        <div className="flex items-center gap-1.5">
          <span className={GROUP_LABEL}>状态</span>
          {STATUS_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onFilterChange('status', opt.value)}
              className={filterStatus.includes(opt.value) ? TAG_SELECTED : TAG_UNSELECTED}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
