/**
 * @file theme-toggle
 * @brief 主题切换组件
 * 
 * 提供浅色/深色/系统主题切换功能
 */

"use client"

import { Moon, Sun, Monitor } from "lucide-react"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  const cycleTheme = () => {
    if (theme === "light") setTheme("dark")
    else if (theme === "dark") setTheme("system")
    else setTheme("light")
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
