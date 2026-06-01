"use client";

import Image from "next/image";
import Link from "next/link";
import { Bell, Menu, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/layout/theme-toggle";

interface TopNavProps {
  onMenuClick?: () => void;
  onSettingsClick?: () => void;
  isPanelOpen?: boolean;
}

export function TopNav({ onMenuClick, onSettingsClick, isPanelOpen }: TopNavProps) {
  return (
    <header
      className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-hairline bg-canvas px-4"
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
        <Image
          src="/Lifeware APP 图标.png"
          alt="Lifeware"
          width={28}
          height={28}
          className="rounded-lg"
          priority
        />
        <Link
          href="/"
          className="font-display text-xl font-medium text-ink hover:bg-hover-overlay transition-colors"
          aria-label="Lifeware 首页"
        >
          Lifeware
        </Link>
      </div>

      <nav className="flex items-center gap-1" aria-label="主导航">
        <Button variant="ghost" size="icon-sm" aria-label="通知">
          <Bell className="size-[18px] text-body" />
        </Button>
        <ThemeToggle />
        <Button variant="ghost" size="icon-sm" aria-label="设置" onClick={onSettingsClick}>
          <Settings className="size-[18px] text-body" />
        </Button>
      </nav>
    </header>
  );
}
