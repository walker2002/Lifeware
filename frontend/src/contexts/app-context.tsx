"use client"

import { createContext, useContext, useState, type Dispatch, type SetStateAction } from "react"
import type { MainViewState } from "@/components/layout/main-view-state"

// --- View Context: mainViewState（导航状态） ---

interface AppViewContextValue {
  mainViewState: MainViewState
  setMainViewState: Dispatch<SetStateAction<MainViewState>>
}

const AppViewContext = createContext<AppViewContextValue | null>(null)

// --- Loading Context: isLoading / error（全局加载状态） ---

interface AppLoadingContextValue {
  isLoading: boolean
  setIsLoading: Dispatch<SetStateAction<boolean>>
  error: string | undefined
  setError: Dispatch<SetStateAction<string | undefined>>
}

const AppLoadingContext = createContext<AppLoadingContextValue | null>(null)

// --- Provider ---

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [mainViewState, setMainViewState] = useState<MainViewState>({
    type: 'schedule',
    date: new Date(),
    viewMode: 'day',
  })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | undefined>()

  return (
    <AppViewContext.Provider value={{ mainViewState, setMainViewState }}>
      <AppLoadingContext.Provider value={{ isLoading, setIsLoading, error, setError }}>
        {children}
      </AppLoadingContext.Provider>
    </AppViewContext.Provider>
  )
}

// --- Hooks ---

/** 读取导航状态（mainViewState / setMainViewState） */
export function useAppView() {
  const ctx = useContext(AppViewContext)
  if (!ctx) throw new Error("useAppView must be used within AppProvider")
  return ctx
}

/** 读取/写入加载状态（isLoading / error 及其 setters） */
export function useAppLoading() {
  const ctx = useContext(AppLoadingContext)
  if (!ctx) throw new Error("useAppLoading must be used within AppProvider")
  return ctx
}

/** 同时读取两个 context（仅在 page.tsx 组装层使用） */
export function useApp() {
  return { ...useAppView(), ...useAppLoading() }
}
