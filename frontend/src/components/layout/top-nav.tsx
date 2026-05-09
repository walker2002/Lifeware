"use client";

import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";

interface TopNavProps {
  onMenuClick?: () => void;
  onSettingsClick?: () => void;
  isPanelOpen?: boolean;
}

/**
 * TopNav — 顶部导航栏（64px 固定高度）
 *
 * 显示 Lifeware 品牌标识和右侧图标导航按钮。
 */
export function TopNav({ onMenuClick, onSettingsClick, isPanelOpen }: TopNavProps) {
  return (
    <header
      className="flex h-16 items-center justify-between border-b border-hairline bg-canvas px-4"
      role="banner"
    >
      <div className="flex items-center gap-2">
        {onMenuClick && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onMenuClick}
            aria-label={isPanelOpen ? "收起 AI 面板" : "展开 AI 面板"}
          >
            <Menu className="size-5 text-body" />
          </Button>
        )}
        <span
          className="font-display text-xl font-medium text-ink"
          aria-label="Lifeware"
        >
          Lifeware
        </span>
      </div>

      <nav className="flex items-center gap-1" aria-label="主导航">
        <Button variant="ghost" size="icon-sm" aria-label="通知">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-body">
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          </svg>
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="设置" onClick={onSettingsClick}>
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-body">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </Button>
      </nav>
    </header>
  );
}
