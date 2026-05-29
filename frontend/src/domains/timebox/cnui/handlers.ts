import type { CnuiSurfaceHandler, CnuiSurfaceOpenResult, CnuiSurfaceSubmitResult } from '@/nexus/ai-runtime/cnui/types'

export const timeboxCnuiHandler: CnuiSurfaceHandler = {
  async open(_action): Promise<CnuiSurfaceOpenResult> {
    return { content: '智能编排方案', dataSnapshot: {} }
  },

  async submit(_action, _fields): Promise<CnuiSurfaceSubmitResult> {
    return { success: true }
  },
}
