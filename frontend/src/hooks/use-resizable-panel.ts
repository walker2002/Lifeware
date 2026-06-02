/**
 * @file use-resizable-panel
 * @brief 可调整大小的面板 Hook
 * 
 * 提供可拖拽调整大小的面板功能，支持 localStorage 持久化宽度
 */

"use client"

import { useState, useCallback, useEffect, useRef } from "react"

/** 默认最小宽度 */
const DEFAULT_MIN_WIDTH = 200
/** 默认最大宽度（屏幕比例） */
const DEFAULT_MAX_WIDTH = 0.5
/** 默认宽度 */
const DEFAULT_WIDTH = 400

/**
 * 可调整大小面板选项
 */
interface UseResizablePanelOptions {
  /** localStorage 存储键 */
  storageKey: string
  /** 最小宽度 */
  minWidth?: number
  /** 最大宽度（像素或屏幕比例） */
  maxWidth?: number
  /** 默认宽度 */
  defaultWidth?: number
}

export function useResizablePanel(options: UseResizablePanelOptions) {
  const {
    storageKey,
    minWidth = DEFAULT_MIN_WIDTH,
    maxWidth = DEFAULT_MAX_WIDTH,
    defaultWidth = DEFAULT_WIDTH,
  } = options

  const [leftWidth, setLeftWidth] = useState(() => {
    if (typeof window === "undefined") return defaultWidth
    const stored = localStorage.getItem(storageKey)
    if (stored) {
      const num = Number(stored)
      if (!Number.isNaN(num) && num > 0) return num
    }
    return defaultWidth
  })

  const containerRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)

  useEffect(() => {
    localStorage.setItem(storageKey, String(leftWidth))
  }, [leftWidth, storageKey])

  useEffect(() => {
    return () => {
      if (draggingRef.current) {
        draggingRef.current = false
        document.body.style.cursor = ""
        document.body.style.userSelect = ""
      }
    }
  }, [])

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      draggingRef.current = true
      document.body.style.cursor = "col-resize"
      document.body.style.userSelect = "none"

      const handleMouseMove = (e: MouseEvent) => {
        if (!draggingRef.current || !containerRef.current) return
        const rect = containerRef.current.getBoundingClientRect()
        let newWidth = e.clientX - rect.left

        const maxPx =
          maxWidth < 1 ? rect.width * maxWidth : maxWidth

        newWidth = Math.max(minWidth, Math.min(newWidth, maxPx))
        setLeftWidth(Math.round(newWidth))
      }

      const handleMouseUp = () => {
        draggingRef.current = false
        document.body.style.cursor = ""
        document.body.style.userSelect = ""
        document.removeEventListener("mousemove", handleMouseMove)
        document.removeEventListener("mouseup", handleMouseUp)
      }

      document.addEventListener("mousemove", handleMouseMove)
      document.addEventListener("mouseup", handleMouseUp)
    },
    [minWidth, maxWidth]
  )

  return { leftWidth, handleMouseDown, containerRef }
}
