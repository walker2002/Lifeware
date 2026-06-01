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

interface SearchableItem {
  id: string
  label: string
  group: string
  icon: React.ComponentType<{ className?: string }>
  onSelect: () => void
}

interface CommandMenuProps {
  open: boolean
  onOpenChange: (open: boolean) => void
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
