"use client";

import { type ReactNode } from "react";
import { TopNav } from "@/components/layout/top-nav";
import { MainContent } from "@/components/layout/main-content";
import { LeftPanel } from "@/components/layout/left-panel";
import { ResizableSplitter } from "@/components/layout/resizable-splitter";
import { usePanelState } from "@/hooks/use-panel-state";
import { useResizablePanel } from "@/hooks/use-resizable-panel";
import type { PanelTab } from "./main-view-state";

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
}

export function AppShell({
  activeTab, onTabChange, onHomeClick,
  leftPanelContent, mainContent, tilesBanner, onSettingsClick,
}: AppShellProps) {
  const { isOpen, toggle } = usePanelState();
  const { leftWidth, handleMouseDown, containerRef } = useResizablePanel({
    storageKey: "lw-left-panel-width",
    minWidth: 300,
    defaultWidth: 320,
  });

  return (
    <div className="grid h-screen grid-rows-[64px_1fr] bg-canvas">
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
            <MainContent>{mainContent}</MainContent>
          </div>
        </div>

        <div className="min-h-0 flex-1 flex flex-col md:hidden">
          <MainContent>{mainContent}</MainContent>
        </div>
      </div>
    </div>
  );
}
