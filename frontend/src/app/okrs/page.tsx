/**
 * @file app/okrs/page
 * @brief 自动生成 thin wrapper — 由 scripts/generate-routes.ts 从 domains/okrs/manifest.yaml 派生。
 *
 * 渲染 OKRWorkspace。勿手动编辑（修改会被下一次 `npm run generate:routes` 覆盖）。
 * 如需调整，编辑对应域的 manifest.yaml view_routes 或 domain 入口组件。
 */
// ---
// Auto-generated from domains/okrs/manifest.yaml
// DO NOT EDIT MANUALLY
// Generated at: 2026-07-13T14:27:04.019Z
// ---

import { OKRWorkspace } from "@/domains/okrs/components/okr-workspace"
export default async function OKRWorkspaceDefault({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  return (
    <OKRWorkspace
      standalone={true}
      initialDetailId={sp.detail}
    />
  )
}
