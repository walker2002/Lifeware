"use client"

import { createContext, useContext, useState, type Dispatch, type SetStateAction } from "react"
import type { MainViewState } from "@/components/layout/main-view-state"

interface AppContextValue {
  mainViewState: MainViewState
  setMainViewState: Dispatch<SetStateAction<MainViewState>>
  isLoading: boolean
  setIsLoading: Dispatch<SetStateAction<boolean>>
  error: string | undefined
  setError: Dispatch<SetStateAction<string | undefined>>
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [mainViewState, setMainViewState] = useState<MainViewState>({
    type: 'schedule',
    date: new Date(),
    viewMode: 'day',
  })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | undefined>()

  return (
    <AppContext.Provider value={{ mainViewState, setMainViewState, isLoading, setIsLoading, error, setError }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error("useApp must be used within AppProvider")
  return ctx
}
