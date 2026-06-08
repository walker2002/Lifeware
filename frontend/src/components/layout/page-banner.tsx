/**
 * @file page-banner
 * @brief Domain Page 顶部 Banner 组件
 *
 * 根据 domainId 自动匹配 banner 图片，随机选择一张展示。
 * 支持一键收起/展开图片区域，扩大主显示区可视空间。
 * 默认展开，收起状态持久化到 localStorage。
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { ChevronUp, ChevronDown } from 'lucide-react'

/** localStorage key 前缀 */
const STORAGE_KEY_PREFIX = 'lw-banner-collapsed-'

/**
 * Domain 与 Banner 图片的映射表
 * 新 Domain 只需在此注册图片路径即可自动支持 Banner
 */
const DOMAIN_BANNER_MAP: Record<string, string[]> = {
  home: ['/banner-lifeware1.png', '/banner-lifeware2.png'],
  habits: ['/banner-habits1.png', '/banner-habits2.png', '/banner-habits3.png'],
  tasks: ['/banner-tasks1.png', '/banner-tasks2.png', '/banner-tasks3.png'],
  timebox: ['/banner-timebox1.png', '/banner-timebox2.png'],
  okrs: ['/banner-OKRs1.png', '/banner-OKRs2.png'],
}

/**
 * PageBanner 组件属性
 */
export interface PageBannerProps {
  /** Domain 标识，用于匹配 banner 图片前缀 */
  domainId: string
  /** 页面标题 */
  title: string
}

/**
 * PageBanner — Domain Page 顶部 Banner
 *
 * 默认展开图片区域，点击按钮可收起至仅显示标题行。
 * 收起状态按 domain 持久化到 localStorage。
 *
 * @param domainId - Domain 标识
 * @param title - 页面标题
 */
export function PageBanner({ domainId, title }: PageBannerProps) {
  const [bannerSrc, setBannerSrc] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(false)

  // ─── 初始化：读取持久化状态 + 随机选择图片 ────────────────────

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY_PREFIX + domainId)
    if (stored === 'true') setCollapsed(true)

    const images = DOMAIN_BANNER_MAP[domainId]
    if (images?.length) {
      setBannerSrc(images[Math.floor(Math.random() * images.length)])
    }
  }, [domainId])

  // ─── 折叠/展开切换 ──────────────────────────────────────────

  const handleToggle = useCallback(() => {
    setCollapsed(prev => {
      const next = !prev
      localStorage.setItem(STORAGE_KEY_PREFIX + domainId, String(next))
      return next
    })
  }, [domainId])

  return (
    <div className="w-full">
      {/* ── 标题行（始终可见） ──────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2.5">
        <h1 className="text-lg font-semibold text-ink">{title}</h1>
        <button
          type="button"
          onClick={handleToggle}
          className="p-1.5 rounded-md text-body hover:text-ink hover:bg-hover-overlay transition-colors duration-150"
          aria-label={collapsed ? '展开横幅' : '收起横幅'}
          title={collapsed ? '展开横幅图片' : '收起横幅图片'}
        >
          {collapsed ? (
            <ChevronDown className="size-4" />
          ) : (
            <ChevronUp className="size-4" />
          )}
        </button>
      </div>

      {/* ── Banner 图片区域（可折叠） ──────────────────────── */}
      {!collapsed && (
        <div className="relative h-[160px] w-full overflow-hidden">
          {bannerSrc ? (
            <Image
              src={bannerSrc}
              alt={`${title} banner`}
              fill
              className="object-cover"
              priority
            />
          ) : (
            <div className="h-full w-full bg-surface-soft" />
          )}
        </div>
      )}
    </div>
  )
}
