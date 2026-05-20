import type { AISession, ChatMessage } from '@/usom/types/objects'

type ObjectState = Record<string, unknown>

export interface MergeResult {
  systemMessages: ChatMessage[]
  updatedSnapshot: Record<string, ObjectState>
}

/**
 * 会话续接双层状态合并
 * 对比 state_snapshot 中记录的状态与实际当前状态，生成差异系统消息
 */
export async function mergeSessionState(
  session: AISession,
  fetchCurrentState: (ids: string[]) => Promise<Array<{ id: string; [key: string]: unknown }>>,
): Promise<MergeResult> {
  const snapshot = session.stateSnapshot as Record<string, ObjectState>
  const objectIds = session.referencedObjectIds

  if (objectIds.length === 0) {
    return { systemMessages: [], updatedSnapshot: { ...snapshot } }
  }

  const currentObjects = await fetchCurrentState(objectIds)
  const currentMap = new Map(currentObjects.map(o => [o.id, o]))

  const systemMessages: ChatMessage[] = []
  const updatedSnapshot: Record<string, ObjectState> = { ...snapshot }

  for (const id of objectIds) {
    const snapObj = snapshot[id]
    const curObj = currentMap.get(id)

    if (!curObj) {
      systemMessages.push({
        role: 'system',
        content: `会话中引用的对象 ${id} 已删除或无法访问`,
        timestamp: new Date().toISOString(),
      })
      delete updatedSnapshot[id]
      continue
    }

    const diffs = diffObject(id, snapObj, curObj)
    if (diffs.length > 0) {
      systemMessages.push({
        role: 'system',
        content: `对象 ${id} 状态变化：${diffs.join('；')}`,
        timestamp: new Date().toISOString(),
      })
    }

    updatedSnapshot[id] = curObj
  }

  return { systemMessages, updatedSnapshot }
}

function diffObject(id: string, snap: ObjectState | undefined, cur: ObjectState): string[] {
  if (!snap) return []
  const diffs: string[] = []
  for (const key of Object.keys(snap)) {
    const oldVal = snap[key]
    const newVal = cur[key]
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      diffs.push(`${key}: ${String(oldVal)} → ${String(newVal)}`)
    }
  }
  return diffs
}
