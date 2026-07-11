/**
 * @file schedule-proposal
 * @brief [028] T1 manifest 占位 surface — validate:manifest 需 .tsx 文件存在；T9 替换为完整实现
 *
 * 占位策略：T9 改名/扩展自 CreateSmartTimebox.tsx 之前，T1 提供最小 surface 文件
 * 让 validate:manifest 的 K-component-not-found 检查通过。组件本身是空 stub，
 * 不会实际渲染（client-side register-client-surfaces.ts 在 T9 注册，本组件
 * 才进入 cnuiRegistry；T1 阶段未注册 = UI 永不调到此 stub）。
 */

'use client'

/** [028] T9 占位：T9 替换为完整 ScheduleProposal 实现（[023.08] CreateSmartTimebox 范式 + 四源提案 + needConfirm + batch undo） */
export function ScheduleProposal(): null {
  return null
}