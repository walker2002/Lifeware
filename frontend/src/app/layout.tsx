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
 * @param children - 子组件内容
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body
        className={`${displayFont.variable} ${bodyFont.variable} ${codeFont.variable} antialiased`}
      >
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
          <Toaster position="bottom-center" richColors />
        </ThemeProvider>
      </body>
    </html>
  );
}
