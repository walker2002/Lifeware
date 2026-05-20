"use client"

import { useState, useCallback, useEffect, useRef } from "react"

interface OfflineQueueOptions {
  onSend: (message: string) => Promise<void>
}

export function useOfflineQueue({ onSend }: OfflineQueueOptions) {
  const [isOnline, setIsOnline] = useState(true)
  const [isSending, setIsSending] = useState(false)
  const queueRef = useRef<string[]>([])

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true)
      flushQueue()
    }
    const handleOffline = () => setIsOnline(false)

    if (typeof window !== 'undefined') {
      setIsOnline(navigator.onLine)
      window.addEventListener('online', handleOnline)
      window.addEventListener('offline', handleOffline)
    }

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const flushQueue = useCallback(async () => {
    if (queueRef.current.length === 0) return
    setIsSending(true)
    const pending = [...queueRef.current]
    queueRef.current = []
    for (const msg of pending) {
      try {
        await onSend(msg)
      } catch {
        queueRef.current.unshift(msg)
        break
      }
    }
    setIsSending(false)
  }, [onSend])

  const sendOrEnqueue = useCallback(async (message: string) => {
    if (!isOnline) {
      queueRef.current.push(message)
      return
    }
    await onSend(message)
  }, [isOnline, onSend])

  return { isOnline, isSending, sendOrEnqueue, queueLength: queueRef.current.length }
}
