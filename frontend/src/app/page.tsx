/**
 * @file page
 * @brief 主页路由（[023.03] T4：硬切 redirect 到 /timeboxes）
 *
 * 原主页承载 HomeBanner 4 按钮 + ScheduleView + AI 助手 + 对话视图；
 * [023.03] T4 选择 A1 整页 redirect：
 * - 主页从此只承担"进入 /timeboxes"职责
 * - HomeBanner 4 按钮随 layout 删（QUICK_ACTIONS / ScheduleView 整体下线）
 * - AI 助手 / 对话能力留作后续阶段（在 /timeboxes 之外的入口单开）
 *
 * @see docs/superpowers/specs/2026-07-04-023.03-timebox-page-optimization-design.md §1
 */

import { redirect } from 'next/navigation'

export default function HomePage() {
  redirect('/timeboxes')
}