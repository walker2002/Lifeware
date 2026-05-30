'use client'

import { useEffect, useRef } from 'react'
import { recordActivity } from '@/app/actions/activity-recorder'

export function usePageView(domainId?: string, action?: string) {
  const lastKey = useRef<string>()
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
