/**
 * @file use-page-view
 * @brief 页面访问记录 Hook
 * 
 * 记录用户页面访问行为，用于活跃度统计
 */

'use client'

import { useEffect, useRef } from 'react'
import { recordActivity } from '@/app/actions/activity-recorder'

/**
 * 页面访问记录 Hook
 * 
 * @param domainId - 领域 ID
 * @param action - 页面动作
 */
export function usePageView(domainId?: string, action?: string) {
  const lastKey = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (!domainId || !action) return
    const key = `${domainId}:${action}`
    if (lastKey.current === key) return
    lastKey.current = key
    void recordActivity({
      activityType: 'page_navigate',
      source: 'page_route',
      targetDomain: domainId,
      targetAction: action,
    })
  }, [domainId, action])
}
