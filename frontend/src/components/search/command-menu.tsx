/**
 * @file command-menu
 * @brief 命令菜单组件
 * 
 * 提供键盘快捷键唤起的命令搜索菜单
 */

"use client"

import { useEffect } from "react"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"

/**
 * 可搜索项
 */
interface SearchableItem {
  /** 唯一标识 */
  id: string
  /** 显示标签 */
  label: string
  /** 所属分组 */
  group: string
  /** 图标组件 */
  icon: React.ComponentType<{ className?: string }>
  /** 选中回调 */
  onSelect: () => void
}

/**
 * CommandMenu 组件属性
 */
interface CommandMenuProps {
  /** 是否打开 */
  open: boolean
  /** 打开状态变更回调 */
  onOpenChange: (open: boolean) => void
  /** 可搜索项列表 */
  items: SearchableItem[]
}

export function CommandMenu({ open, onOpenChange, items }: CommandMenuProps) {
  // Ctrl+K 唤起
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        onOpenChange(!open)
      }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [open, onOpenChange])

  // 按组分类
  const groups = items.reduce<Record<string, SearchableItem[]>>((acc, item) => {
    if (!acc[item.group]) acc[item.group] = []
    acc[item.group].push(item)
    return acc
  }, {})

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="搜索操作、习惯、任务、对话..." />
      <CommandList>
        <CommandEmpty>未找到匹配结果</CommandEmpty>
        {Object.entries(groups).map(([group, groupItems]) => (
          <CommandGroup key={group} heading={group}>
            {groupItems.map(item => (
              <CommandItem key={item.id} onSelect={item.onSelect}>
                <item.icon className="mr-2 size-4 shrink-0 text-muted-foreground" />
                <span>{item.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  )
}
