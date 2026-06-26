/**
 * @file page
 * @brief OKR 工作台独立页面路由
 *
 * 手写 Next.js page route（不走 codegen）。OKRWorkspace 是已有组件，
 * 零 caller 状态，本页面作为其首次接线入口。
 */

import { OKRWorkspace } from "@/domains/okrs/components/okr-workspace"

interface PageProps {
  searchParams: Promise<{ detail?: string }>
}

export default async function OKRsPage({ searchParams }: PageProps) {
  const params = await searchParams
  return (
    <div className="h-full flex flex-col">
      <OKRWorkspace
        standalone
        initialDetailId={params.detail}
      />
    </div>
  )
}
