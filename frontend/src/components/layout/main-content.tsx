import type { ReactNode } from "react";

interface MainContentProps {
  children: ReactNode;
}

/**
 * MainContent — 右侧主内容区域（flex-1）
 *
 * 最大宽度 960px 居中，用于展示时间盒列表等核心内容。
 * min-width: 0 防止 flex 子元素溢出。
 */
export function MainContent({ children }: MainContentProps) {
  return (
    <main
      className="min-w-0 flex-1 overflow-y-auto bg-canvas p-6"
      role="main"
    >
      <div className="mx-auto max-w-[960px]">{children}</div>
    </main>
  );
}
