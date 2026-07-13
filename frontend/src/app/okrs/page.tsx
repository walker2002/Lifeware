// ---
// Auto-generated from domains/okrs/manifest.yaml
// DO NOT EDIT MANUALLY
// Generated at: 2026-07-13T12:01:56.122Z
// ---

import { OKRWorkspace } from "@/domains/okrs/components/okr-workspace"
export default async function OKRWorkspacePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  return (
    <OKRWorkspace
      standalone={true}
      initialDetailId={sp.detail}
    />
  )
}
