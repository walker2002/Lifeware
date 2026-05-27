'use client'

import { FormRegistry } from '@/lib/form-registry'

interface CnuiFormAdapterProps {
  domainId: string
  action: string
  dataModel: Record<string, unknown>
  onDataChange: (data: Record<string, unknown>) => void
  onConfirm: (data: Record<string, unknown>) => void
}

/** 将 CN-UI dataModel 映射为 Form 的 initial props */
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

export function CnuiFormAdapter({ domainId, action, dataModel, onDataChange, onConfirm }: CnuiFormAdapterProps) {
  const config = FormRegistry.get(domainId, action)

  if (!config) {
    return (
      <div className="rounded border border-dashed border-red-300 p-4 text-sm text-red-500">
        表单未注册: {domainId}/{action}
      </div>
    )
  }

  const mappedData = mapDataToForm(dataModel, config.fieldMapping, config.defaults)
  const FormComponent = config.component

  return (
    <FormComponent
      initial={mappedData}
      onSubmit={(fields: Record<string, unknown>) => {
        onConfirm(mapFormToData(fields, config.fieldMapping))
      }}
      onCancel={() => onDataChange(dataModel)}
    />
  )
}
