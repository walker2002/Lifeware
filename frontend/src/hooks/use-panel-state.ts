"use client";

import { useState, useCallback, useEffect } from "react";

const STORAGE_KEY = "lw-ai-panel-open";

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
