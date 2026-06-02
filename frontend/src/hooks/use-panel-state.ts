/**
 * @file use-panel-state
 * @brief 面板状态管理 Hook
 * 
 * 管理 AI 面板的展开/收起状态，支持 localStorage 持久化
 */

"use client";

import { useState, useCallback, useEffect } from "react";

const STORAGE_KEY = "lw-ai-panel-open";

/**
 * 面板状态管理 Hook
 */
export function usePanelState() {
  const [isOpen, setIsOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    // 默认展开：仅在显式存储为 "false" 时收起
    return localStorage.getItem(STORAGE_KEY) !== "false";
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(isOpen));
  }, [isOpen]);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);

  return { isOpen, open, close, toggle };
}
