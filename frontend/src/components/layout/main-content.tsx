/**
 * @file main-content
 * @brief 主内容区组件
 * 
 * 提供主内容区域布局和过渡动画
 */

"use client"

import { type ReactNode, useState, useEffect } from "react"

/**
 * MainContent 组件属性
 */
interface MainContentProps {
  /** 子内容 */
  children: ReactNode
  /** 视图 key 变化时触发过渡动画 */
  viewKey?: string
}

/**
 * SplitView 组件属性
 */
interface SplitViewProps {
  /** 左侧内容 */
  left: ReactNode
  /** 右侧内容 */
  right: ReactNode
}

export function MainContent({ children, viewKey }: MainContentProps) {
  const [animating, setAnimating] = useState(false)

  useEffect(() => {
    if (viewKey !== undefined) {
      setAnimating(true)
      const timer = setTimeout(() => setAnimating(false), 200)
      return () => clearTimeout(timer)
    }
  }, [viewKey])

  return (
    <main
      className={`min-w-0 min-h-0 flex-1 overflow-y-auto bg-canvas p-6 ${animating ? "animate-view-in" : ""}`}
      role="main"
    >
      <div className="w-full h-full">{children}</div>
    </main>
  )
}

interface SplitViewProps {
  left: ReactNode
  right: ReactNode
}

export function SplitView({ left, right }: SplitViewProps) {
  return (
    <div className="flex h-full gap-0">
      <div className="flex-1 min-w-[300px] overflow-y-auto">{left}</div>
      <div className="w-px bg-hairline shrink-0" />
      <div className="flex-1 min-w-[300px] overflow-y-auto">{right}</div>
    </div>
  )
}
