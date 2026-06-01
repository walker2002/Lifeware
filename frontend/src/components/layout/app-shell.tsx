"use client";

import { type ReactNode, useEffect } from "react";
import { TopNav } from "@/components/layout/top-nav";
import { MainContent } from "@/components/layout/main-content";
import { LeftPanel } from "@/components/layout/left-panel";
import { ResizableSplitter } from "@/components/layout/resizable-splitter";
import { usePanelState } from "@/hooks/use-panel-state";
import { useResizablePanel } from "@/hooks/use-resizable-panel";
import type { PanelTab } from "./main-view-state";

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  )
}

interface AppShellProps {
  /** 左面板 Tab */
  activeTab: PanelTab
  onTabChange: (tab: PanelTab) => void
  onHomeClick: () => void
  /** 左面板内容（根据 activeTab 切换） */
  leftPanelContent: ReactNode;
  /** 主内容区 */
  mainContent: ReactNode;
  /** Tiles 横幅区域 */
  tilesBanner?: ReactNode;
  /** TopNav 设置按钮回调 */
  onSettingsClick?: () => void;
  /** 传入 view key 变化时触发过渡动画 */
  viewKey?: string;
  /** / 键聚焦意图输入框 */
  onFocusIntentInput?: () => void;
}

export function AppShell({
  activeTab, onTabChange, onHomeClick,
  leftPanelContent, mainContent, tilesBanner, onSettingsClick, viewKey, onFocusIntentInput,
}: AppShellProps) {
  const { isOpen, toggle } = usePanelState();
  const { leftWidth, handleMouseDown, containerRef } = useResizablePanel({
    storageKey: "lw-left-panel-width",
    minWidth: 300,
    defaultWidth: 320,
  });

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // `/` 键聚焦意图输入框（排除已在输入框中的情况）
      if (e.key === "/" && !isEditable(e.target)) {
        e.preventDefault()
        onFocusIntentInput?.()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onFocusIntentInput])

  return (
    <div className="grid h-screen grid-rows-[56px_1fr] bg-canvas">
      <TopNav onMenuClick={toggle} onSettingsClick={onSettingsClick} isPanelOpen={isOpen} />

      <div className="flex min-h-0 flex-col overflow-hidden">
        {tilesBanner}

        <div className="hidden min-h-0 flex-1 md:flex" ref={containerRef}>
          {isOpen && (
            <>
              <div style={{ width: leftWidth }} className="shrink-0 overflow-hidden">
                <LeftPanel
                  activeTab={activeTab}
                  onTabChange={onTabChange}
                  onHomeClick={onHomeClick}
                >
                  {leftPanelContent}
                </LeftPanel>
              </div>
              <ResizableSplitter onMouseDown={handleMouseDown} />
            </>
          )}

          <div className="min-h-0 flex-1 flex flex-col">
            <MainContent viewKey={viewKey}>{mainContent}</MainContent>
          </div>
        </div>

        <div className="min-h-0 flex-1 flex flex-col md:hidden">
          <MainContent viewKey={viewKey}>{mainContent}</MainContent>
        </div>
      </div>
    </div>
  );
}
