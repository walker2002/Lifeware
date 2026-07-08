/**
 * @file appointment-page-banner
 * @brief [026.02] T3 — /appointments 顶部 Banner
 *
 * 沿用 Timebox Domain 的 banner 图片集（per dev doc §2: "使用 Timebox Domain的"）。
 * PageBanner 内部按 domainId 随机选图 + 折叠态持久化（STORAGE_KEY_PREFIX）。
 * 标题字体规范由 PageBanner 统一处理（UI-DESIGN-SPEC §14 C-04）。
 */

import { PageBanner } from '@/components/layout/page-banner'

export function AppointmentPageBanner() {
  return <PageBanner domainId="timebox" title="约定管理" />
}