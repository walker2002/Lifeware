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

interface AppShellProps {
  /** AI 面板内容 */
  aiPanel: ReactNode;
  /** 主内容区 */
  mainContent: ReactNode;
}

/**
 * AppShell — 全局布局壳
 *
 * 响应式布局：
 * - 桌面端（>=768px）：CSS Grid 两栏（AiPanel 320px + MainContent flex-1）
 * - 移动端（<768px）：单栏，AiPanel 折叠为 Sheet 侧边抽屉
 */
export function AppShell({ aiPanel, mainContent }: AppShellProps) {
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <div className="grid h-screen grid-rows-[64px_1fr] bg-canvas">
      {/* 顶栏 — 横跨全宽 */}
      <TopNav onMenuClick={() => setSheetOpen(true)} />

      {/* 桌面端：两栏布局 */}
      <div className="hidden md:grid md:grid-cols-[320px_1fr]">
        <AiPanel>{aiPanel}</AiPanel>
        <MainContent>{mainContent}</MainContent>
      </div>

      {/* 移动端：单栏 + Sheet 抽屉 */}
      <div className="md:hidden">
        <MainContent>{mainContent}</MainContent>
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent side="left" className="w-80 p-0">
            {/* Sheet 需要标题以满足无障碍要求 */}
            <VisuallyHidden.Root>
              <SheetTitle>AI 助手面板</SheetTitle>
            </VisuallyHidden.Root>
            <AiPanel>{aiPanel}</AiPanel>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}
