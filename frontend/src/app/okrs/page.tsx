/**
 * @file page
 * @brief OKR 工作台独立页面路由
 *
 * 手写 Next.js page route（不走 codegen）。OKRWorkspace 是已有组件，
 * 零 caller 状态，本页面作为其首次接线入口。
 *
 * [024.1] 高度锚定：本路由为独立全屏页（直接挂在 body 下，未走 AppShell）。
 * body 无确定高度，故用 h-screen 锚定视口——否则内层 OKRWorkspace 的
 * 左面板 overflow-y-auto 因缺失高度天花板而失效，目录会撑高整页、窗口整体滚动。
 * 与 AppShell 根容器（h-screen）保持一致。
 */

import { OKRWorkspace } from "@/domains/okrs/components/okr-workspace"

interface PageProps {
  searchParams: Promise<{ detail?: string }>
}

export default async function OKRsPage({ searchParams }: PageProps) {
  const params = await searchParams
  return (
    <div className="h-screen flex flex-col">
      <OKRWorkspace
        standalone
        initialDetailId={params.detail}
      />
    </div>
  )
}
