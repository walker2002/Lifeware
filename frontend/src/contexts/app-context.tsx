/**
 * @file app-context
 * @brief 应用全局上下文 Provider
 * 
 * 提供导航状态（mainViewState）和加载状态（isLoading/error）的全局管理
 */

"use client"

import { createContext, useContext, useState, type Dispatch, type SetStateAction } from "react"
import type { MainViewState } from "@/components/layout/main-view-state"

// --- View Context: mainViewState（导航状态） ---

/**
 * 导航上下文值
 */
interface AppViewContextValue {
  /** 主视图状态 */
  mainViewState: MainViewState
  /** 主视图状态更新函数 */
  setMainViewState: Dispatch<SetStateAction<MainViewState>>
}

const AppViewContext = createContext<AppViewContextValue | null>(null)

// --- Loading Context: isLoading / error（全局加载状态） ---

/**
 * 加载上下文值
 */
interface AppLoadingContextValue {
  /** 是否正在加载 */
  isLoading: boolean
  /** 加载状态更新函数 */
  setIsLoading: Dispatch<SetStateAction<boolean>>
  /** 错误信息 */
  error: string | undefined
  /** 错误信息更新函数 */
  setError: Dispatch<SetStateAction<string | undefined>>
}

const AppLoadingContext = createContext<AppLoadingContextValue | null>(null)

// --- Provider ---

/**
 * 应用上下文 Provider
 * 
 * @param children - 子组件
 */
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
