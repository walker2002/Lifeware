/**
 * @file page-banner
 * @brief Domain Page 顶部 Banner 组件
 *
 * 根据 domainId 自动匹配 banner 图片，随机选择一张展示。
 * 宽度自适应，高度固定 80px。
 */

'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'

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
 * @param domainId - Domain 标识
 * @param title - 页面标题
 */
export function PageBanner({ domainId, title }: PageBannerProps) {
  const [bannerSrc, setBannerSrc] = useState<string | null>(null)

  useEffect(() => {
    const images = DOMAIN_BANNER_MAP[domainId]
    if (images?.length) {
      setBannerSrc(images[Math.floor(Math.random() * images.length)])
    }
  }, [domainId])

  return (
    <div className="w-full">
      {/* Banner 图片 */}
      <div className="relative h-[80px] w-full overflow-hidden">
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
      {/* 标题 */}
      <div className="px-4 py-3">
        <h1 className="text-lg font-semibold text-ink">{title}</h1>
      </div>
    </div>
  )
}
