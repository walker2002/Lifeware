/**
 * @file theme-toggle
 * @brief 主题切换组件
 * 
 * 提供浅色/深色/系统主题切换功能
 */

"use client"

import { Moon, Sun, Monitor } from "lucide-react"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // 等待客户端挂载后再渲染主题相关内容，避免 SSR hydration 不匹配
  useEffect(() => setMounted(true), [])

  const cycleTheme = () => {
    if (theme === "light") setTheme("dark")
    else if (theme === "dark") setTheme("system")
    else setTheme("light")
  }

  // SSR 阶段渲染占位，避免 theme=undefined 导致 hydration 不匹配
  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="切换主题"
      >
        <Monitor className="size-[18px]" />
      </Button>
    )
  }

  const icon = theme === "dark" ? <Moon className="size-[18px]" />
    : theme === "light" ? <Sun className="size-[18px]" />
    : <Monitor className="size-[18px]" />

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={cycleTheme}
      aria-label={`当前主题：${theme}，点击切换`}
    >
      {icon}
    </Button>
  )
}
