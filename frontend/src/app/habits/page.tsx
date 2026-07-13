/**
 * @file app/habits/page
 * @brief 自动生成 thin wrapper — 由 scripts/generate-routes.ts 从 domains/habits/manifest.yaml 派生。
 *
 * 渲染 HabitListPage。勿手动编辑（修改会被下一次 `npm run generate:routes` 覆盖）。
 * 如需调整，编辑对应域的 manifest.yaml view_routes 或 domain 入口组件。
 */
// ---
// Auto-generated from domains/habits/manifest.yaml
// DO NOT EDIT MANUALLY
// Generated at: 2026-07-13T14:27:04.018Z
// ---

import { HabitListPage } from "@/domains/habits/pages/HabitListPage"
export default function HabitListPageDefault() {
  return <HabitListPage />
}
