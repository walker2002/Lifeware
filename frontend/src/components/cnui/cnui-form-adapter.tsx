/**
 * @file cnui-form-adapter
 * @brief CN-UI 表单适配器组件
 * 
 * 将 CN-UI dataModel 与 FormRegistry 中的表单组件进行适配和映射
 */

'use client'

import { FormRegistry } from '@/lib/form-registry'

/**
 * CnuiFormAdapter 组件属性
 */
interface CnuiFormAdapterProps {
  /** 域 ID */
  domainId: string
  /** 动作名称 */
  action: string
  /** CN-UI 数据模型 */
  dataModel: Record<string, unknown>
  /** 数据变更回调 */
  onDataChange: (data: Record<string, unknown>) => void
  /** 确认回调 */
  onConfirm: (data: Record<string, unknown>) => void
  /** 取消回调 */
  onCancel: () => void
  /** 是否正在加载 */
  isLoading?: boolean
  /** 是否已完成 */
  isDone?: boolean
  /** 服务端错误信息 */
  serverErrors?: string[]
}

/**
 * 将 CN-UI dataModel 映射为 Form 的 initial props
 * 
 * @param dataModel - CN-UI 数据模型
 * @param mapping - 字段映射配置
 * @param defaults - 默认值
 * @returns 表单初始 props
 */
function mapDataToForm(
  dataModel: Record<string, unknown>,
  mapping: Record<string, string>,
  defaults: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...defaults }
  for (const [cnuiKey, formKey] of Object.entries(mapping)) {
    if (cnuiKey in dataModel) {
      result[formKey] = dataModel[cnuiKey]
    }
  }
  return result
}

/** 将 Form 提交的 fields 映射回 CN-UI dataModel */
function mapFormToData(
  formFields: Record<string, unknown>,
  mapping: Record<string, string>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [cnuiKey, formKey] of Object.entries(mapping)) {
    if (formKey in formFields) {
      result[cnuiKey] = formFields[formKey]
    }
  }
  return result
}

export function CnuiFormAdapter({ domainId, action, dataModel, onDataChange, onConfirm, onCancel, isLoading, isDone, serverErrors }: CnuiFormAdapterProps) {
  const config = FormRegistry.get(domainId, action)

  if (!config) {
    return (
      <div className="rounded border border-dashed border-error p-4 text-sm text-error">
        表单未注册: {domainId}/{action}
      </div>
    )
  }

  const mappedData = mapDataToForm(dataModel, config.fieldMapping, config.defaults)
  const FormComponent = config.component

  return (
    <>
      <FormComponent
        initial={mappedData}
        onSubmit={(fields: Record<string, unknown>) => {
          onConfirm(mapFormToData(fields, config.fieldMapping))
        }}
        onCancel={onCancel}
        isLoading={isLoading}
      />
      {serverErrors && serverErrors.length > 0 && (
        <div className="mt-3 rounded-lg border border-error bg-error-soft px-3 py-2 text-xs text-error">
          {serverErrors.map((err, i) => (
            <div key={i}>{err}</div>
          ))}
        </div>
      )}
    </>
  )
}
