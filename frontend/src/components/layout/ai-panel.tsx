import type { ReactNode } from "react";

interface AiPanelProps {
  children: ReactNode;
}

/**
 * AiPanel — 左侧 AI 交互面板（320px 固定宽度）
 *
 * 包含可滚动的内容区域，用于放置 AI 输入、表单和 Tiles。
 * 右侧带有 hairline 分割线。
 */
export function AiPanel({ children }: AiPanelProps) {
  return (
    <aside
      className="flex h-full w-80 flex-col overflow-y-auto border-r border-hairline bg-canvas p-4"
      role="complementary"
      aria-label="AI 助手面板"
    >
      {children}
    </aside>
  );
}
