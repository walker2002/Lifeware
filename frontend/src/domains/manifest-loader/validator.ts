import type { DomainManifest } from './schema'

interface SemanticError {
  fieldPath: string[]
  message: string
}

export function validateSemantics(manifest: DomainManifest): SemanticError[] {
  const errors: SemanticError[] = []

  for (const [objectType, lifecycle] of Object.entries(manifest.lifecycle)) {
    const stateSet = new Set(lifecycle.states)

    // initial_state 必须在 states 中
    if (!stateSet.has(lifecycle.initial_state)) {
      errors.push({
        fieldPath: ['lifecycle', objectType, 'initial_state'],
        message: `initial_state "${lifecycle.initial_state}" 不在 states 列表中`,
      })
    }

    // terminal_states 必须是 states 的子集
    for (const ts of lifecycle.terminal_states) {
      if (!stateSet.has(ts)) {
        errors.push({
          fieldPath: ['lifecycle', objectType, 'terminal_states'],
          message: `terminal_states 包含 "${ts}"，但该状态不在 states 列表中`,
        })
      }
    }

    // transitions 中的 from/to 必须在 states 中（from 为 null 或 string[] 也需检查）
    lifecycle.transitions.forEach((transition, idx) => {
      if (transition.from !== null) {
        const fromStates = Array.isArray(transition.from) ? transition.from : [transition.from]
        for (const s of fromStates) {
          if (!stateSet.has(s)) {
            errors.push({
              fieldPath: ['lifecycle', objectType, 'transitions', String(idx), 'from'],
              message: `状态 "${s}" 不在 states 列表中`,
            })
          }
        }
      }

      if (!stateSet.has(transition.to)) {
        errors.push({
          fieldPath: ['lifecycle', objectType, 'transitions', String(idx), 'to'],
          message: `状态 "${transition.to}" 不在 states 列表中`,
        })
      }
    })
  }

  return errors
}
