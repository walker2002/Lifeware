"use client";

import type { ReactNode } from "react";
import { TopNav } from "@/components/layout/top-nav";
import { AiPanel } from "@/components/layout/ai-panel";
import { MainContent } from "@/components/layout/main-content";

interface AppShellProps {
  /** AI 面板内容 */
  aiPanel: ReactNode;
  /** 主内容区 */
  mainContent: ReactNode;
}

/**
 * AppShell — 全局布局壳
 *
 * 使用 CSS Grid 实现 Notion 风格两栏布局：
 * - 顶栏 TopNav（64px）
 * - 左栏 AiPanel（320px）| 右栏 MainContent（flex-1）
 */
export function AppShell({ aiPanel, mainContent }: AppShellProps) {
  return (
    <div
      className="grid h-screen bg-canvas"
      style={{
        gridTemplateRows: "64px 1fr",
        gridTemplateColumns: "320px 1fr",
      }}
    >
      {/* 顶栏横跨两列 */}
      <div className="col-span-2">
        <TopNav />
      </div>

      {/* 左栏：AI 面板 */}
      <AiPanel>{aiPanel}</AiPanel>

      {/* 右栏：主内容 */}
      <MainContent>{mainContent}</MainContent>
    </div>
  );
}
