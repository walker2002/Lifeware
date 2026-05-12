"use client";

import { useState, type ReactNode } from "react";
import { TopNav } from "@/components/layout/top-nav";
import { AiPanel } from "@/components/layout/ai-panel";
import { MainContent } from "@/components/layout/main-content";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import { usePanelState } from "@/hooks/use-panel-state";

interface AppShellProps {
  /** AI 面板内容 */
  aiPanel: ReactNode;
  /** 主内容区 */
  mainContent: ReactNode;
  /** Tiles 横幅区域 */
  tilesBanner?: ReactNode;
  /** 追踪面板（底部可折叠） */
  tracePanel?: ReactNode;
  /** TopNav 设置按钮回调 */
  onSettingsClick?: () => void;
}

/**
 * AppShell — 全局布局壳
 *
 * 桌面端（>=768px）：Flexbox 可收起侧边栏。
 * - AI 面板展开时占据 320px，主内容区填充剩余宽度
 * - 收起时面板宽度过渡为 0，主内容区拉伸至全宽
 * - 状态持久化至 localStorage，默认展开
 *
 * 移动端（<768px）：Sheet 侧边抽屉（不变）
 */
export function AppShell({ aiPanel, mainContent, tilesBanner, tracePanel, onSettingsClick }: AppShellProps) {
  const { isOpen, toggle } = usePanelState();
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <div className="grid h-screen grid-rows-[64px_1fr] bg-canvas">
      {/* 顶栏 — 横跨全宽 */}
      <TopNav onMenuClick={toggle} onSettingsClick={onSettingsClick} isPanelOpen={isOpen} />

      {/* 内容区域：Tiles + 主内容区 + AI 面板 + 追踪面板 */}
      <div className="flex min-h-0 flex-col overflow-hidden">
        {/* TilesBanner — 全宽横幅 */}
        {tilesBanner}

        {/* 桌面端：Flexbox 可收起侧边栏 */}
        <div className="hidden min-h-0 flex-1 md:flex">
          {/* AI 面板 — 宽度过渡动画 */}
          <div
            className={`h-full overflow-hidden border-r border-hairline bg-canvas transition-all duration-300 ${
              isOpen ? "w-80" : "w-0 border-r-0"
            }`}
          >
            <div className="w-80 h-full">
              <AiPanel>{aiPanel}</AiPanel>
            </div>
          </div>

          {/* 主内容区 — flex-1 自动填充 */}
          <div className="min-h-0 flex-1 flex flex-col">
            <MainContent>{mainContent}</MainContent>
          </div>
        </div>

        {/* 移动端：单栏 + Sheet 抽屉 */}
        <div className="min-h-0 flex-1 flex flex-col md:hidden">
          <MainContent>{mainContent}</MainContent>
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetContent side="left" className="w-80 p-0">
              <VisuallyHidden.Root>
                <SheetTitle>AI 助手面板</SheetTitle>
              </VisuallyHidden.Root>
              <AiPanel>{aiPanel}</AiPanel>
            </SheetContent>
          </Sheet>
        </div>

        {/* TracePanel — 底部面板 */}
        {tracePanel}
      </div>
    </div>
  );
}
