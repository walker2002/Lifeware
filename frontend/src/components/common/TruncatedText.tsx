/**
 * @file TruncatedText
 * @brief 通用截断文本组件
 *
 * 当文本因 CSS overflow 被截断时，鼠标悬停自动显示完整内容的 Tooltip。
 */

'use client'

import { useRef, useState, useEffect, useCallback } from 'react'

/**
 * TruncatedText 组件属性
 */
interface TruncatedTextProps {
  /** 显示的文本 */
  text: string
  /** 额外的 CSS 类名 */
  className?: string
  /** HTML 标签类型 */
  as?: 'span' | 'div' | 'p' | 'h1' | 'h2' | 'h3'
}

export function TruncatedText({ text, className = '', as: Tag = 'span' }: TruncatedTextProps) {
  const ref = useRef<HTMLElement>(null)
  const [isOverflowing, setIsOverflowing] = useState(false)
  const [showTooltip, setShowTooltip] = useState(false)

  const checkOverflow = useCallback(() => {
    const el = ref.current
    if (el) setIsOverflowing(el.scrollWidth > el.clientWidth)
  }, [])

  useEffect(() => {
    checkOverflow()
    window.addEventListener('resize', checkOverflow)
    return () => window.removeEventListener('resize', checkOverflow)
  }, [checkOverflow, text])

  return (
    <div className="relative inline-block max-w-full">
      <Tag
        ref={ref as any}
        className={className}
        onMouseEnter={() => isOverflowing && setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        {text}
      </Tag>
      {isOverflowing && showTooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 z-50 rounded bg-ink px-2 py-1 text-xs text-canvas whitespace-nowrap pointer-events-none">
          {text}
        </div>
      )}
    </div>
  )
}
