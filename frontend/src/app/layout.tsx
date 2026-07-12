/**
 * @file layout
 * @brief 应用根布局组件
 * 
 * 定义应用的全局布局结构，包括字体配置、主题提供者、工具提示和通知组件
 */

import type { Metadata } from "next";
import { Cormorant_Garamond, Inter, JetBrains_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { UserTimezoneProvider } from "@/contexts/user-timezone-context";
import { getEffectiveTimezone } from "@/lib/timezone-config";
import type { USOM_ID } from "@/usom/types/primitives";
import "./globals.css";

// ─── 字体配置 ───────────────────────────────────────────────────

/**
 * DESIGN.md 字体栈：
 * - Cormorant Garamond（标题字体）
 * - Inter（正文字体）
 * - JetBrains Mono（代码字体）
 */
const displayFont = Cormorant_Garamond({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const bodyFont = Inter({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const codeFont = JetBrains_Mono({
  variable: "--font-code",
  subsets: ["latin"],
  weight: ["400"],
});

// ─── 元数据配置 ───────────────────────────────────────────────────

/**
 * 应用元数据
 */
export const metadata: Metadata = {
  title: "Lifeware",
  description: "意图驱动的个人成长系统",
};

/**
 * 根布局组件
 *
 * [TZ-2] server component 入口：调 `getEffectiveTimezone(MVP_USER_ID)` 拿 user_tz
 *   （DB → 系统时区 → 'Asia/Shanghai' 三级 fallback），把结果注入
 *   `<UserTimezoneProvider>`，client 子树通过 `useUserTz()` 读取。
 *
 * @param children - 子组件内容
 */
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // [TZ-2] MVP 单用户：硬编码 MVP_USER_ID（同 cnui/handlers 等 server action 一致）。
  //   未来多用户认证模块落地后，从 session 取 userId。
  const MVP_USER_ID = '00000000-0000-0000-0000-000000000001' as USOM_ID
  const userTz = await getEffectiveTimezone(MVP_USER_ID)
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body
        className={`${displayFont.variable} ${bodyFont.variable} ${codeFont.variable} antialiased`}
      >
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <UserTimezoneProvider initialTz={userTz}>
            <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
            <Toaster position="bottom-center" richColors />
          </UserTimezoneProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
