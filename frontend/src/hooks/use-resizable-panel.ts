"use client"

import { useState, useCallback, useEffect, useRef } from "react"

const DEFAULT_MIN_WIDTH = 200
const DEFAULT_MAX_WIDTH = 0.5
const DEFAULT_WIDTH = 400

interface UseResizablePanelOptions {
  storageKey: string
  minWidth?: number
  maxWidth?: number
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
    return stored ? Number(stored) : defaultWidth
  })

  const containerRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)

  useEffect(() => {
    localStorage.setItem(storageKey, String(leftWidth))
  }, [leftWidth, storageKey])

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
